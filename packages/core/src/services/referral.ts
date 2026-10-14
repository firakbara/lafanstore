import { referralEarnings, referralPayouts, users, type DbOrTx } from '@tokobun/db';
import { and, count, eq, gte, inArray, sql, type AnyColumn } from 'drizzle-orm';
import type { Cents, ReferralStats } from '../contracts';
import { CoreError } from '../contracts';
import { getSettings } from './settings';
import { applyLedger } from './wallet';
import { db, inTx } from './util';

const sumCents = (col: AnyColumn) => sql<string>`coalesce(sum(${col}), 0)`;

async function balances(userId: number, tx?: DbOrTx) {
  const d = db(tx);
  const [[e], [tr], [wd]] = await Promise.all([
    d.select({ s: sumCents(referralEarnings.amount) })
      .from(referralEarnings)
      .where(eq(referralEarnings.referrerId, userId)),
    d.select({ s: sumCents(referralPayouts.amount) })
      .from(referralPayouts)
      .where(and(eq(referralPayouts.userId, userId), eq(referralPayouts.kind, 'transfer'), eq(referralPayouts.status, 'done'))),
    d.select({ s: sumCents(referralPayouts.amount) })
      .from(referralPayouts)
      .where(
        and(eq(referralPayouts.userId, userId), eq(referralPayouts.kind, 'withdraw'), inArray(referralPayouts.status, ['pending', 'done'])),
      ),
  ]);
  const earned = Number(e?.s ?? 0);
  const transferred = Number(tr?.s ?? 0);
  const withdrawn = Number(wd?.s ?? 0);
  return { earned, transferred, withdrawn, available: earned - transferred - withdrawn };
}

export async function getReferralStats(storeId: number, userId: number): Promise<ReferralStats> {
  const d = db();
  const [u] = await d.select({ code: users.referralCode }).from(users).where(eq(users.id, userId));
  if (!u) throw new CoreError('NOT_FOUND', 'user not found');
  const now = Date.now();
  const countSince = async (since: Date | null) => {
    const [r] = await d
      .select({ n: count() })
      .from(users)
      .where(since ? and(eq(users.referredBy, userId), gte(users.createdAt, since)) : eq(users.referredBy, userId));
    return Number(r?.n ?? 0);
  };
  const [r24, r7, rAll, b, s] = await Promise.all([
    countSince(new Date(now - 86_400_000)),
    countSince(new Date(now - 7 * 86_400_000)),
    countSince(null),
    balances(userId),
    getSettings(storeId),
  ]);
  return {
    referralCode: u.code,
    referred24h: r24,
    referred7d: r7,
    referredTotal: rAll,
    ...b,
    percentBp: s.referralPercentBp,
    maxPerTopup: s.referralMaxPerTopup,
    minWithdraw: s.referralMinWithdraw,
  };
}

async function lockUser(t: DbOrTx, userId: number) {
  const [u] = await t.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
  if (!u) throw new CoreError('NOT_FOUND', 'user not found');
}

export async function transferReferralToWallet(userId: number, amount?: Cents): Promise<Cents> {
  return inTx(undefined, async (t) => {
    await lockUser(t, userId); // serializes payouts per user
    const { available } = await balances(userId, t);
    const amt = amount ?? available;
    if (!Number.isSafeInteger(amt) || amt <= 0) throw new CoreError('AMOUNT_TOO_SMALL', 'nothing to transfer');
    if (amt > available) throw new CoreError('INSUFFICIENT_BALANCE', 'not enough referral earnings', { available });
    const [p] = await t.insert(referralPayouts).values({ userId, amount: amt, kind: 'transfer', status: 'done' }).returning();
    await applyLedger({ userId, amount: amt, type: 'referral_transfer', refType: 'referral_payout', refId: String(p!.id) }, t);
    return amt;
  });
}

export async function requestReferralWithdraw(storeId: number, userId: number, amount: Cents, note?: string): Promise<number> {
  const s = await getSettings(storeId);
  return inTx(undefined, async (t) => {
    await lockUser(t, userId);
    if (!Number.isSafeInteger(amount) || amount < s.referralMinWithdraw || amount <= 0) {
      throw new CoreError('AMOUNT_TOO_SMALL', 'amount below minimum withdraw', { minWithdraw: s.referralMinWithdraw });
    }
    const { available } = await balances(userId, t);
    if (amount > available) throw new CoreError('INSUFFICIENT_BALANCE', 'not enough referral earnings', { available });
    const [p] = await t
      .insert(referralPayouts)
      .values({ userId, amount, kind: 'withdraw', status: 'pending', note: note ?? null })
      .returning({ id: referralPayouts.id });
    return p!.id;
  });
}

/** Admin: resolve a pending withdraw request. 'rejected' returns the amount to the available referral balance. */
export async function resolveReferralPayout(payoutId: number, status: 'done' | 'rejected', note?: string): Promise<void> {
  await inTx(undefined, async (t) => {
    const [p] = await t.select().from(referralPayouts).where(eq(referralPayouts.id, payoutId)).for('update');
    if (!p) throw new CoreError('NOT_FOUND', 'payout not found');
    if (p.status !== 'pending') throw new CoreError('INVALID_STATE', 'payout already resolved');
    await t
      .update(referralPayouts)
      .set({ status, note: note ?? p.note })
      .where(eq(referralPayouts.id, payoutId));
  });
}
