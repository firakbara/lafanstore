import { ledgerEntries, orders, payments, products, referralEarnings, stockItems, users, type Tx } from '@tokobun/db';
import { and, asc, eq, inArray, lt, sql } from 'drizzle-orm';
import type { Cents, OrderDetail, SettleResult } from '../contracts';
import { CoreError } from '../contracts';
import { buildOrderDetail, cancelOrderTx, ensureVoucherRedeemed, takeAvailableStock, type OrderRow } from './orders';
import { getSettings } from './settings';
import { applyLedger } from './wallet';
import { inTx } from './util';

type PaymentRow = typeof payments.$inferSelect;

async function findOrderForPayment(t: Tx, p: PaymentRow, lock: boolean): Promise<OrderRow | null> {
  const cond = p.orderId !== null ? eq(orders.id, p.orderId) : eq(orders.paymentId, p.id);
  const q = t.select().from(orders).where(cond).limit(1);
  const [o] = lock ? await q.for('update') : await q;
  return o ?? null;
}

/** Rebuild the result of a previous settlement (idempotent second call). */
async function previousResult(t: Tx, p: PaymentRow): Promise<SettleResult> {
  let credited: Cents = 0;
  let order: OrderDetail | null = null;
  if (p.purpose === 'topup') {
    const [r] = await t
      .select({ s: sql<string>`coalesce(sum(${ledgerEntries.amount}), 0)` })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.refType, 'payment'), eq(ledgerEntries.refId, String(p.id))));
    credited = Number(r?.s ?? 0);
  } else {
    const o = await findOrderForPayment(t, p, false);
    order = o ? await buildOrderDetail(o, t) : null;
  }
  const [ref] = await t.select().from(referralEarnings).where(eq(referralEarnings.paymentId, p.id));
  return {
    paymentId: p.id,
    storeId: p.storeId,
    alreadySettled: true,
    purpose: p.purpose,
    userId: p.userId,
    credited,
    order,
    referral: ref ? { referrerId: ref.referrerId, amount: ref.amount } : null,
  };
}

export async function settlePayment(paymentId: number): Promise<SettleResult> {
  return inTx(undefined, async (t) => {
    const [p] = await t.select().from(payments).where(eq(payments.id, paymentId)).for('update');
    if (!p) throw new CoreError('NOT_FOUND', 'payment not found');
    if (p.status === 'paid') return previousResult(t, p);
    // pending, or a late payment for an expired/cancelled/failed invoice: money arrived, so settle it.
    await t.update(payments).set({ status: 'paid', paidAt: new Date() }).where(eq(payments.id, p.id));

    const result: SettleResult = {
      paymentId: p.id,
      storeId: p.storeId,
      alreadySettled: false,
      purpose: p.purpose,
      userId: p.userId,
      credited: 0,
      order: null,
      referral: null,
    };
    const s = await getSettings(p.storeId, t);
    const ref = { refType: 'payment', refId: String(p.id) };

    if (p.purpose === 'topup') {
      if (p.amount > 0) {
        await applyLedger({ userId: p.userId, amount: p.amount, type: 'topup', ...ref, note: p.code }, t);
        result.credited += p.amount;
        let tierBp = 0;
        for (const tier of s.topupBonusTiers) if (p.amount >= tier.minAmount && tier.percentBp > tierBp) tierBp = tier.percentBp;
        const bonus = Math.floor((p.amount * tierBp) / 10000);
        if (bonus > 0) {
          await applyLedger({ userId: p.userId, amount: bonus, type: 'topup_bonus', ...ref, note: p.code }, t);
          result.credited += bonus;
        }
        // referral commission
        const [u] = await t.select({ referredBy: users.referredBy }).from(users).where(eq(users.id, p.userId));
        if (u?.referredBy) {
          const commission = Math.min(Math.floor((p.amount * s.referralPercentBp) / 10000), s.referralMaxPerTopup);
          if (commission > 0) {
            const ins = await t
              .insert(referralEarnings)
              .values({ referrerId: u.referredBy, refereeId: p.userId, paymentId: p.id, amount: commission })
              .onConflictDoNothing({ target: referralEarnings.paymentId })
              .returning();
            if (ins.length) result.referral = { referrerId: u.referredBy, amount: commission };
          }
        }
      }
      return result;
    }

    // purpose = order
    const o = await findOrderForPayment(t, p, true);
    if (!o) throw new CoreError('NOT_FOUND', 'order for payment not found');
    if (o.status === 'completed' || o.status === 'refunded') {
      result.order = await buildOrderDetail(o, t);
      return result;
    }
    const now = new Date();
    const [product] = await t.select().from(products).where(eq(products.id, o.productId));
    let ok = true;
    if (product && !product.unlimited) {
      const reserved = await t
        .select({ id: stockItems.id })
        .from(stockItems)
        .where(and(eq(stockItems.orderId, o.id), eq(stockItems.status, 'reserved')))
        .orderBy(asc(stockItems.id))
        .for('update');
      let ids = reserved.map((r) => r.id).slice(0, o.quantity);
      if (ids.length < o.quantity) ids = ids.concat(await takeAvailableStock(t, o.productId, o.quantity - ids.length));
      if (ids.length < o.quantity) {
        ok = false;
      } else {
        await t
          .update(stockItems)
          .set({ status: 'sold', orderId: o.id, soldAt: now, reservedUntil: null })
          .where(inArray(stockItems.id, ids));
      }
    } else if (!product) {
      ok = false;
    }

    if (ok) {
      await ensureVoucherRedeemed(t, o);
      const [done] = await t
        .update(orders)
        .set({ status: 'completed', completedAt: now, paymentId: p.id })
        .where(eq(orders.id, o.id))
        .returning();
      result.order = await buildOrderDetail(done!, t);
    } else {
      // not deliverable: release whatever is reserved, refund the order total to the wallet
      await cancelOrderTx(t, o.id);
      if (o.total > 0) {
        await applyLedger(
          { userId: o.userId, amount: o.total, type: 'refund', refType: 'order', refId: String(o.id), note: `${o.code} out of stock` },
          t,
        );
        result.credited = o.total;
      }
      const [ref2] = await t.update(orders).set({ status: 'refunded', paymentId: p.id }).where(eq(orders.id, o.id)).returning();
      result.order = await buildOrderDetail(ref2!, t);
    }
    return result;
  });
}

export async function expireStalePayments(now: Date = new Date()): Promise<number> {
  return inTx(undefined, async (t) => {
    const stale = await t
      .select({ id: payments.id, orderId: payments.orderId })
      .from(payments)
      .where(and(eq(payments.status, 'pending'), lt(payments.expiresAt, now)))
      .limit(200)
      .for('update', { skipLocked: true });
    if (!stale.length) return 0;
    await t
      .update(payments)
      .set({ status: 'expired' })
      .where(inArray(payments.id, stale.map((s) => s.id)));
    for (const s of stale) {
      const cond = s.orderId !== null ? eq(orders.id, s.orderId) : eq(orders.paymentId, s.id);
      const [o] = await t.select().from(orders).where(cond).for('update');
      if (o && o.status === 'pending_payment') await cancelOrderTx(t, o.id);
    }
    return stale.length;
  });
}
