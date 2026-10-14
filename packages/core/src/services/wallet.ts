import { ledgerEntries, users, type DbOrTx } from '@tokobun/db';
import { count, desc, eq } from 'drizzle-orm';
import type { Cents, LedgerEntry, LedgerType, Paged } from '../contracts';
import { CoreError } from '../contracts';
import { assertCents, db, inTx, pageArgs, totalPages } from './util';

type LedgerRow = typeof ledgerEntries.$inferSelect;

export function toLedgerEntry(r: LedgerRow): LedgerEntry {
  return {
    id: r.id,
    amount: r.amount,
    type: r.type,
    refType: r.refType,
    refId: r.refId,
    balanceAfter: r.balanceAfter,
    note: r.note,
    createdAt: r.createdAt,
  };
}

export async function getBalance(userId: number): Promise<Cents> {
  const [u] = await db().select({ balance: users.balance }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u) throw new CoreError('NOT_FOUND', 'user not found');
  return u.balance;
}

export async function applyLedger(
  input: { userId: number; amount: Cents; type: LedgerType; refType?: string; refId?: string; note?: string },
  tx?: DbOrTx,
): Promise<LedgerEntry> {
  assertCents(input.amount);
  return inTx(tx, async (t) => {
    const [u] = await t
      .select({ balance: users.balance })
      .from(users)
      .where(eq(users.id, input.userId))
      .for('update');
    if (!u) throw new CoreError('NOT_FOUND', 'user not found');
    const balanceAfter = u.balance + input.amount;
    if (balanceAfter < 0) {
      throw new CoreError('INSUFFICIENT_BALANCE', 'insufficient balance', { balance: u.balance, required: -input.amount });
    }
    const [row] = await t
      .insert(ledgerEntries)
      .values({
        userId: input.userId,
        amount: input.amount,
        type: input.type,
        refType: input.refType ?? null,
        refId: input.refId ?? null,
        balanceAfter,
        note: input.note ?? null,
      })
      .returning();
    await t.update(users).set({ balance: balanceAfter }).where(eq(users.id, input.userId));
    return toLedgerEntry(row!);
  });
}

export async function listLedger(userId: number, page?: number, pageSize?: number): Promise<Paged<LedgerEntry>> {
  const p = pageArgs(page, pageSize, 10);
  const d = db();
  const where = eq(ledgerEntries.userId, userId);
  const [[{ total } = { total: 0 }], rows] = await Promise.all([
    d.select({ total: count() }).from(ledgerEntries).where(where),
    d.select().from(ledgerEntries).where(where).orderBy(desc(ledgerEntries.id)).limit(p.pageSize).offset(p.offset),
  ]);
  return { items: rows.map(toLedgerEntry), page: p.page, totalPages: totalPages(total, p.pageSize), total };
}
