import { broadcasts, orders, payments, users } from '@tokobun/db';
import { and, asc, count, eq, gt, inArray, sql, type SQL } from 'drizzle-orm';
import type { BroadcastAudience, BroadcastJob } from '../contracts';
import { CoreError } from '../contracts';
import { db, inTx } from './util';

const AUDIENCES: BroadcastAudience[] = ['all', 'stock', 'info', 'referral'];

function audienceFilter(audience: BroadcastAudience, storeId: number): SQL {
  const base = and(
    eq(users.isBanned, false),
    eq(users.blockedBot, false),
    sql`(EXISTS (SELECT 1 FROM ${orders} WHERE ${orders.userId} = ${users.id} AND ${orders.storeId} = ${storeId}) OR EXISTS (SELECT 1 FROM ${payments} WHERE ${payments.userId} = ${users.id} AND ${payments.storeId} = ${storeId}))`,
  )!;
  switch (audience) {
    case 'stock':
      return and(base, eq(users.notifyStock, true))!;
    case 'info':
      return and(base, eq(users.notifyInfo, true))!;
    case 'referral':
      return and(base, eq(users.notifyReferral, true))!;
    default:
      return base;
  }
}

/** Number of users a broadcast with this audience would currently reach in a specific store. */
export async function countBroadcastAudience(audience: BroadcastAudience, storeId: number): Promise<number> {
  const [r] = await db().select({ n: count() }).from(users).where(audienceFilter(audience, storeId));
  return Number(r?.n ?? 0);
}

export async function createBroadcast(input: {
  storeId: number;
  audience: BroadcastAudience;
  title?: string | null;
  body: string;
  queue?: boolean;
}): Promise<number> {
  if (!AUDIENCES.includes(input.audience)) throw new CoreError('INVALID_INPUT', 'invalid audience');
  if (!input.body?.trim()) throw new CoreError('INVALID_INPUT', 'body is required');
  const totalCount = input.queue ? await countBroadcastAudience(input.audience, input.storeId) : 0;
  const [b] = await db()
    .insert(broadcasts)
    .values({
      storeId: input.storeId,
      audience: input.audience,
      title: input.title ?? null,
      body: input.body,
      status: input.queue ? 'queued' : 'draft',
      totalCount,
    })
    .returning({ id: broadcasts.id });
  return b!.id;
}

/** Move a draft to the queue (admin "send" button). */
export async function queueBroadcast(broadcastId: number): Promise<void> {
  const [b] = await db().select().from(broadcasts).where(eq(broadcasts.id, broadcastId));
  if (!b) throw new CoreError('NOT_FOUND', 'broadcast not found');
  if (b.status !== 'draft') throw new CoreError('INVALID_STATE', 'broadcast is not a draft');
  const totalCount = await countBroadcastAudience(b.audience, b.storeId);
  await db().update(broadcasts).set({ status: 'queued', totalCount }).where(eq(broadcasts.id, broadcastId));
}

export async function claimBroadcast(storeId?: number): Promise<BroadcastJob | null> {
  return inTx(undefined, async (t) => {
    const storeFilter = storeId != null ? and(inArray(broadcasts.status, ['sending', 'queued']), eq(broadcasts.storeId, storeId)) : inArray(broadcasts.status, ['sending', 'queued']);
    const [b] = await t
      .select()
      .from(broadcasts)
      .where(storeFilter)
      .orderBy(sql`case when ${broadcasts.status} = 'sending' then 0 else 1 end`, asc(broadcasts.id))
      .limit(1)
      .for('update', { skipLocked: true });
    if (!b) return null;
    if (b.status === 'queued') {
      const [r] = await t.select({ n: count() }).from(users).where(audienceFilter(b.audience, b.storeId));
      await t
        .update(broadcasts)
        .set({ status: 'sending', startedAt: new Date(), totalCount: Number(r?.n ?? 0) })
        .where(eq(broadcasts.id, b.id));
    }
    return { id: b.id, audience: b.audience, title: b.title, body: b.body };
  });
}

export async function nextBroadcastRecipients(broadcastId: number, limit: number): Promise<number[]> {
  const [b] = await db().select().from(broadcasts).where(eq(broadcasts.id, broadcastId));
  if (!b) throw new CoreError('NOT_FOUND', 'broadcast not found');
  const filter = audienceFilter(b.audience, b.storeId);
  const rows = await db()
    .select({ id: users.id })
    .from(users)
    .where(b.lastUserId !== null ? and(filter, gt(users.id, b.lastUserId)) : filter)
    .orderBy(asc(users.id))
    .limit(Math.max(1, Math.floor(limit)));
  return rows.map((r) => r.id);
}

export async function recordBroadcastProgress(broadcastId: number, sent: number, failed: number, lastUserId: number): Promise<void> {
  await db()
    .update(broadcasts)
    .set({
      sentCount: sql`${broadcasts.sentCount} + ${sent}`,
      failedCount: sql`${broadcasts.failedCount} + ${failed}`,
      lastUserId,
    })
    .where(eq(broadcasts.id, broadcastId));
}

export async function finishBroadcast(broadcastId: number, status: 'done' | 'failed'): Promise<void> {
  await db().update(broadcasts).set({ status, finishedAt: new Date() }).where(eq(broadcasts.id, broadcastId));
}
