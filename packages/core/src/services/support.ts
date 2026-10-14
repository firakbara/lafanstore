import { supportSessions } from '@tokobun/db';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { SupportSession } from '../contracts';
import { CoreError } from '../contracts';
import { db, inTx } from './util';

type Row = typeof supportSessions.$inferSelect;
const toSession = (r: Row): SupportSession => ({
  id: r.id,
  userId: r.userId,
  userThreadId: r.userThreadId,
  adminThreadId: r.adminThreadId,
  status: r.status,
  createdAt: r.createdAt,
});

export async function getOpenSupportSession(storeId: number, userId: number): Promise<SupportSession | null> {
  const [r] = await db()
    .select()
    .from(supportSessions)
    .where(and(eq(supportSessions.storeId, storeId), eq(supportSessions.userId, userId), eq(supportSessions.status, 'open')))
    .orderBy(desc(supportSessions.id))
    .limit(1);
  return r ? toSession(r) : null;
}

/** Returns the user's open session for a store, creating one if none exists. */
export async function openSupportSession(storeId: number, userId: number): Promise<SupportSession> {
  return inTx(undefined, async (t) => {
    await t.execute(sql`select pg_advisory_xact_lock(7311, ${Math.trunc(userId) % 2147483647}::int)`);
    const [r] = await t
      .select()
      .from(supportSessions)
      .where(and(eq(supportSessions.storeId, storeId), eq(supportSessions.userId, userId), eq(supportSessions.status, 'open')))
      .limit(1);
    if (r) return toSession(r);
    const [n] = await t.insert(supportSessions).values({ storeId, userId }).returning();
    return toSession(n!);
  });
}

export async function setSupportThreads(
  sessionId: number,
  threads: { userThreadId?: number | null; adminThreadId?: number | null },
): Promise<void> {
  const set: Partial<Row> = {};
  if (threads.userThreadId !== undefined) set.userThreadId = threads.userThreadId;
  if (threads.adminThreadId !== undefined) set.adminThreadId = threads.adminThreadId;
  if (!Object.keys(set).length) return;
  const r = await db().update(supportSessions).set(set).where(eq(supportSessions.id, sessionId)).returning({ id: supportSessions.id });
  if (!r.length) throw new CoreError('NOT_FOUND', 'support session not found');
}

export async function findSupportSessionByAdminThread(adminThreadId: number): Promise<SupportSession | null> {
  const [r] = await db()
    .select()
    .from(supportSessions)
    .where(and(eq(supportSessions.adminThreadId, adminThreadId), eq(supportSessions.status, 'open')))
    .orderBy(desc(supportSessions.id))
    .limit(1);
  return r ? toSession(r) : null;
}

export async function closeSupportSession(sessionId: number): Promise<void> {
  await db().update(supportSessions).set({ status: 'closed', closedAt: new Date() }).where(eq(supportSessions.id, sessionId));
}

/** Admin: list open sessions, newest first. */
export async function listOpenSupportSessions(storeId: number): Promise<SupportSession[]> {
  const rows = await db().select().from(supportSessions).where(and(eq(supportSessions.storeId, storeId), eq(supportSessions.status, 'open'))).orderBy(desc(supportSessions.id));
  return rows.map(toSession);
}
