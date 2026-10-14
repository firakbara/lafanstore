import { createHash, randomBytes } from 'node:crypto';
import { apiKeys, users } from '@tokobun/db';
import { and, desc, eq } from 'drizzle-orm';
import type { ApiKeyInfo, UserProfile } from '../contracts';
import { CoreError } from '../contracts';
import { toProfile } from './users';
import { db, inTx } from './util';

type Row = typeof apiKeys.$inferSelect;
const toInfo = (r: Row): ApiKeyInfo => ({
  id: r.id,
  prefix: r.prefix,
  isActive: r.isActive,
  createdAt: r.createdAt,
  lastUsedAt: r.lastUsedAt,
});

const KEY_RE = /^tb_live_[0-9a-f]{32}$/;
export const hashApiKey = (key: string) => createHash('sha256').update(key).digest('hex');

export async function createApiKey(storeId: number, userId: number): Promise<{ key: string; info: ApiKeyInfo }> {
  return inTx(undefined, async (t) => {
    const [u] = await t.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
    if (!u) throw new CoreError('NOT_FOUND', 'user not found');
    await t.update(apiKeys).set({ isActive: false }).where(and(eq(apiKeys.userId, userId), eq(apiKeys.isActive, true)));
    const key = `tb_live_${randomBytes(16).toString('hex')}`;
    const [r] = await t
      .insert(apiKeys)
      .values({ storeId, userId, prefix: key.slice(0, 16), keyHash: hashApiKey(key) })
      .returning();
    return { key, info: toInfo(r!) };
  });
}

export async function getActiveApiKey(userId: number): Promise<ApiKeyInfo | null> {
  const [r] = await db()
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), eq(apiKeys.isActive, true)))
    .orderBy(desc(apiKeys.id))
    .limit(1);
  return r ? toInfo(r) : null;
}

export async function revokeApiKeys(userId: number): Promise<void> {
  await db().update(apiKeys).set({ isActive: false }).where(eq(apiKeys.userId, userId));
}

const lastUsedUpdated = new Map<number, number>();
const LAST_USED_INTERVAL_MS = 5 * 60_000;
const MAX_LAST_USED_ENTRIES = 10_000;

export async function verifyApiKey(key: string): Promise<{ user: UserProfile; storeId: number } | null> {
  const k = key.trim();
  if (!KEY_RE.test(k)) return null;
  const [r] = await db()
    .select({ keyId: apiKeys.id, storeId: apiKeys.storeId, user: users })
    .from(apiKeys)
    .innerJoin(users, eq(users.id, apiKeys.userId))
    .where(and(eq(apiKeys.keyHash, hashApiKey(k)), eq(apiKeys.isActive, true)))
    .limit(1);
  if (!r) return null;
  const now = Date.now();
  if (now - (lastUsedUpdated.get(r.keyId) ?? 0) > LAST_USED_INTERVAL_MS) {
    if (lastUsedUpdated.size >= MAX_LAST_USED_ENTRIES) {
      const oldest = lastUsedUpdated.keys().next().value!;
      lastUsedUpdated.delete(oldest);
    }
    lastUsedUpdated.set(r.keyId, now);
    db().update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, r.keyId)).then(() => {}, () => {});
  }
  return { user: toProfile(r.user), storeId: r.storeId };
}
