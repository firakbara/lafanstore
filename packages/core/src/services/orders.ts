import { orders, products, stockItems, users, voucherRedemptions, vouchers, type DbOrTx, type Tx } from '@tokobun/db';
import { and, asc, count, desc, eq, exists, inArray, lte, or, sql } from 'drizzle-orm';
import type { OrderDetail, OrderSummary, Paged, PurchaseResult } from '../contracts';
import { CoreError } from '../contracts';
import { computeQuote, type QuoteInput, type VoucherRow } from './pricing';
import { getSettings } from './settings';
import { applyLedger } from './wallet';
import { db, generateOrderCode, inTx, isUniqueViolation, pageArgs, totalPages } from './util';

export type OrderRow = typeof orders.$inferSelect;

export function toSummary(o: OrderRow): OrderSummary {
  return {
    id: o.id,
    storeId: o.storeId,
    code: o.code,
    productId: o.productId,
    productName: o.productName,
    quantity: o.quantity,
    total: o.total,
    status: o.status,
    createdAt: o.createdAt,
  };
}

export async function buildOrderDetail(o: OrderRow, tx?: DbOrTx): Promise<OrderDetail> {
  const d = db(tx);
  const needItems = o.status === 'completed' || o.status === 'refunded';
  const [productRows, stockRows] = await Promise.all([
    d.select({ warranty: products.warranty, unlimited: products.unlimited, unlimitedContent: products.unlimitedContent })
      .from(products)
      .where(eq(products.id, o.productId)),
    needItems
      ? d.select({ content: stockItems.content })
          .from(stockItems)
          .where(and(eq(stockItems.orderId, o.id), eq(stockItems.status, 'sold')))
          .orderBy(asc(stockItems.id))
      : Promise.resolve([]),
  ]);
  const p = productRows[0];
  let items = stockRows.map((r) => r.content);
  if (needItems && !items.length && p?.unlimited && o.completedAt) {
    items = Array<string>(o.quantity).fill(p.unlimitedContent ?? '');
  }
  return {
    ...toSummary(o),
    unitPrice: o.unitPrice,
    subtotal: o.subtotal,
    discountAmount: o.discountAmount,
    voucherDiscount: o.voucherDiscount,
    paidWith: o.paidWith === 'payment' ? 'payment' : 'balance',
    items,
    warranty: p?.warranty ?? null,
    completedAt: o.completedAt,
  };
}

async function lockActiveUser(t: Tx, userId: number) {
  const [u] = await t.select().from(users).where(eq(users.id, userId)).for('update');
  if (!u) throw new CoreError('NOT_FOUND', 'user not found');
  if (u.isBanned) throw new CoreError('USER_BANNED', 'user is banned');
  return u;
}

/** Lock up to `n` available stock rows of a product (FOR UPDATE SKIP LOCKED). */
export async function takeAvailableStock(t: Tx, productId: number, n: number): Promise<number[]> {
  if (n <= 0) return [];
  const rows = await t
    .select({ id: stockItems.id })
    .from(stockItems)
    .where(and(eq(stockItems.productId, productId), eq(stockItems.status, 'available')))
    .orderBy(asc(stockItems.id))
    .limit(n)
    .for('update', { skipLocked: true });
  return rows.map((r) => r.id);
}

async function redeemVoucher(t: Tx, voucher: VoucherRow, userId: number, orderId: number) {
  await t.insert(voucherRedemptions).values({ voucherId: voucher.id, userId, orderId });
  await t.update(vouchers).set({ usedCount: sql`${vouchers.usedCount} + 1` }).where(eq(vouchers.id, voucher.id));
}

export async function releaseVoucher(t: Tx, orderId: number) {
  const removed = await t.delete(voucherRedemptions).where(eq(voucherRedemptions.orderId, orderId)).returning();
  for (const r of removed) {
    await t
      .update(vouchers)
      .set({ usedCount: sql`greatest(${vouchers.usedCount} - 1, 0)` })
      .where(eq(vouchers.id, r.voucherId));
  }
}

/** Re-apply a voucher redemption for an order if missing (used when a cancelled order gets paid late). */
export async function ensureVoucherRedeemed(t: Tx, o: OrderRow) {
  if (!o.voucherId) return;
  const [r] = await t.select({ id: voucherRedemptions.id }).from(voucherRedemptions).where(eq(voucherRedemptions.orderId, o.id));
  if (r) return;
  await t.insert(voucherRedemptions).values({ voucherId: o.voucherId, userId: o.userId, orderId: o.id });
  await t.update(vouchers).set({ usedCount: sql`${vouchers.usedCount} + 1` }).where(eq(vouchers.id, o.voucherId));
}

async function insertOrder(t: Tx, values: Omit<typeof orders.$inferInsert, 'code'>): Promise<OrderRow> {
  for (let i = 0; i < 6; i++) {
    const code = generateOrderCode();
    // savepoint, so a code collision does not abort the outer transaction
    try {
      return await t.transaction(async (s) => {
        const [o] = await s
          .insert(orders)
          .values({ ...values, code })
          .returning();
        return o!;
      });
    } catch (e) {
      if (isUniqueViolation(e, 'code')) continue;
      throw e;
    }
  }
  throw new CoreError('INVALID_STATE', 'could not allocate order code');
}

async function createOrder(input: QuoteInput, mode: 'balance' | 'payment'): Promise<OrderDetail> {
  return inTx(undefined, async (t) => {
    await lockActiveUser(t, input.userId);
    const { quote: q, product, voucher } = await computeQuote(input, t, true);

    let stockIds: number[] = [];
    if (!product.unlimited) {
      stockIds = await takeAvailableStock(t, product.id, q.quantity);
      if (stockIds.length < q.quantity) {
        throw new CoreError('OUT_OF_STOCK', 'not enough stock', { requested: q.quantity, available: stockIds.length });
      }
    }

    const now = new Date();
    const o = await insertOrder(t, {
      storeId: input.storeId,
      userId: input.userId,
      productId: product.id,
      productName: product.name,
      quantity: q.quantity,
      unitPrice: q.unitPrice,
      subtotal: q.subtotal,
      discountBp: q.discountBp,
      discountAmount: q.discountAmount,
      voucherId: voucher?.id ?? null,
      voucherDiscount: q.voucherDiscount,
      total: q.total,
      status: mode === 'balance' ? 'completed' : 'pending_payment',
      paidWith: mode,
      completedAt: mode === 'balance' ? now : null,
    });

    if (stockIds.length) {
      if (mode === 'balance') {
        await t
          .update(stockItems)
          .set({ status: 'sold', orderId: o.id, soldAt: now, reservedUntil: null })
          .where(inArray(stockItems.id, stockIds));
      } else {
        const ttl = (await getSettings(input.storeId, t)).orderPaymentTtlMinutes;
        await t
          .update(stockItems)
          .set({ status: 'reserved', orderId: o.id, reservedUntil: new Date(now.getTime() + ttl * 60_000) })
          .where(inArray(stockItems.id, stockIds));
      }
    }

    if (mode === 'balance' && q.total > 0) {
      await applyLedger(
        { userId: input.userId, amount: -q.total, type: 'purchase', refType: 'order', refId: String(o.id), note: o.code },
        t,
      );
    }
    if (voucher) await redeemVoucher(t, voucher, input.userId, o.id);

    return buildOrderDetail(o, t);
  });
}

export async function purchaseWithBalance(input: QuoteInput): Promise<PurchaseResult> {
  return { order: await createOrder(input, 'balance') };
}

export async function createPendingOrder(input: QuoteInput): Promise<OrderDetail> {
  return createOrder(input, 'payment');
}

/** Cancel a pending order inside a tx: release reserved stock + voucher. Caller must hold the order lock. */
export async function cancelOrderTx(t: Tx, orderId: number) {
  await t
    .update(stockItems)
    .set({ status: 'available', orderId: null, reservedUntil: null })
    .where(and(eq(stockItems.orderId, orderId), eq(stockItems.status, 'reserved')));
  await releaseVoucher(t, orderId);
  await t.update(orders).set({ status: 'cancelled' }).where(eq(orders.id, orderId));
}

export async function cancelExpiredOrders(now: Date = new Date()): Promise<number> {
  return inTx(undefined, async (t) => {
    const expired = await t
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.status, 'pending_payment'),
          or(
            exists(
              t
                .select({ one: sql`1` })
                .from(stockItems)
                .where(
                  and(eq(stockItems.orderId, orders.id), eq(stockItems.status, 'reserved'), lte(stockItems.reservedUntil, now)),
                ),
            ),
            lte(orders.createdAt, new Date(now.getTime() - 60 * 60_000)),
          ),
        ),
      )
      .limit(200)
      .for('update', { skipLocked: true });
    for (const o of expired) await cancelOrderTx(t, o.id);
    return expired.length;
  });
}

/** Cancel one pending_payment order now (releases stock + voucher). Returns false if it was not pending. */
export async function cancelPendingOrder(orderId: number): Promise<boolean> {
  return inTx(undefined, async (t) => {
    const [o] = await t.select().from(orders).where(eq(orders.id, orderId)).for('update');
    if (!o) throw new CoreError('NOT_FOUND', 'order not found');
    if (o.status !== 'pending_payment') return false;
    await cancelOrderTx(t, o.id);
    return true;
  });
}

export async function listUserOrders(userId: number, page?: number, pageSize?: number, storeId?: number): Promise<Paged<OrderSummary>> {
  const p = pageArgs(page, pageSize, 10);
  const d = db();
  const where = storeId ? and(eq(orders.userId, userId), eq(orders.storeId, storeId)) : eq(orders.userId, userId);
  const [[{ total } = { total: 0 }], rows] = await Promise.all([
    d.select({ total: count() }).from(orders).where(where),
    d.select().from(orders).where(where).orderBy(desc(orders.id)).limit(p.pageSize).offset(p.offset),
  ]);
  return { items: rows.map(toSummary), page: p.page, totalPages: totalPages(total, p.pageSize), total };
}

export async function getOrder(orderId: number, userId: number | null): Promise<OrderDetail | null> {
  const [o] = await db().select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!o || (userId !== null && o.userId !== userId)) return null;
  return buildOrderDetail(o);
}

/** Lookup by public code (e.g. "TB-7K3Q9X"); same ownership rule as getOrder. */
export async function getOrderByCode(code: string, userId: number | null): Promise<OrderDetail | null> {
  const [o] = await db().select().from(orders).where(eq(orders.code, code.trim().toUpperCase())).limit(1);
  if (!o || (userId !== null && o.userId !== userId)) return null;
  return buildOrderDetail(o);
}

export async function refundOrder(orderId: number, note?: string): Promise<OrderDetail> {
  return inTx(undefined, async (t) => {
    const [o] = await t.select().from(orders).where(eq(orders.id, orderId)).for('update');
    if (!o) throw new CoreError('NOT_FOUND', 'order not found');
    if (o.status !== 'completed') throw new CoreError('INVALID_STATE', `cannot refund an order with status ${o.status}`);
    if (o.total > 0) {
      await applyLedger(
        { userId: o.userId, amount: o.total, type: 'refund', refType: 'order', refId: String(o.id), note: note ?? o.code },
        t,
      );
    }
    const [u] = await t.update(orders).set({ status: 'refunded' }).where(eq(orders.id, o.id)).returning();
    return buildOrderDetail(u!, t);
  });
}
