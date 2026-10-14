import { storeMembers, stores } from '@tokobun/db';
import { and, asc, eq } from 'drizzle-orm';
import type { StoreInfo } from '../contracts';
import { CoreError } from '../contracts';
import { db } from './util';

type StoreRow = typeof stores.$inferSelect;

export function toStoreInfo(r: StoreRow): StoreInfo {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    botToken: r.botToken,
    botUsername: r.botUsername,
    adminIds: r.adminIds ? r.adminIds.split(',').map((s) => Number(s.trim())).filter((n) => Number.isSafeInteger(n) && n > 0) : [],
    adminChatId: r.adminChatId,
    channelUrl: r.channelUrl,
    isActive: r.isActive,
  };
}

export async function listActiveStores(): Promise<StoreInfo[]> {
  const rows = await db().select().from(stores).where(eq(stores.isActive, true));
  return rows.map(toStoreInfo);
}

/** All stores, active and inactive, oldest first. */
export async function listStores(): Promise<StoreInfo[]> {
  const rows = await db().select().from(stores).orderBy(asc(stores.id));
  return rows.map(toStoreInfo);
}

export async function getStore(storeId: number): Promise<StoreInfo | null> {
  const [r] = await db().select().from(stores).where(eq(stores.id, storeId)).limit(1);
  return r ? toStoreInfo(r) : null;
}

export async function getStoreBySlug(slug: string): Promise<StoreInfo | null> {
  const [r] = await db().select().from(stores).where(eq(stores.slug, slug)).limit(1);
  return r ? toStoreInfo(r) : null;
}

export async function getStoreByBotToken(botToken: string): Promise<StoreInfo | null> {
  const [r] = await db().select().from(stores).where(eq(stores.botToken, botToken)).limit(1);
  return r ? toStoreInfo(r) : null;
}

export async function createStore(input: {
  slug: string;
  name: string;
  botToken: string;
  botUsername?: string | null;
  adminIds?: number[];
  adminChatId?: number | null;
  channelUrl?: string | null;
}): Promise<StoreInfo> {
  if (!input.slug || !/^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/.test(input.slug)) {
    throw new CoreError('INVALID_INPUT', 'slug must be 2-64 lowercase alphanumeric characters or hyphens');
  }
  if (!input.name?.trim()) throw new CoreError('INVALID_INPUT', 'name is required');
  if (!input.botToken?.trim()) throw new CoreError('INVALID_INPUT', 'botToken is required');
  if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(input.botToken.trim())) {
    throw new CoreError('INVALID_INPUT', 'botToken format is invalid (expected 123456:ABC...)');
  }
  const [existing, tokenClash] = await Promise.all([getStoreBySlug(input.slug), getStoreByBotToken(input.botToken.trim())]);
  if (existing) throw new CoreError('INVALID_INPUT', 'a store with this slug already exists');
  if (tokenClash) throw new CoreError('INVALID_INPUT', 'this bot token is already used by another store');
  const [r] = await db()
    .insert(stores)
    .values({
      slug: input.slug,
      name: input.name,
      botToken: input.botToken,
      botUsername: input.botUsername ?? null,
      adminIds: (input.adminIds ?? []).join(','),
      adminChatId: input.adminChatId ?? null,
      channelUrl: input.channelUrl ?? null,
    })
    .returning();
  return toStoreInfo(r!);
}

export async function updateStore(
  storeId: number,
  patch: Partial<Pick<StoreInfo, 'name' | 'botToken' | 'botUsername' | 'adminIds' | 'adminChatId' | 'channelUrl' | 'isActive'>>,
): Promise<StoreInfo> {
  if (patch.name !== undefined && !patch.name?.trim()) throw new CoreError('INVALID_INPUT', 'name cannot be empty');
  if (patch.botToken !== undefined && !patch.botToken?.trim()) throw new CoreError('INVALID_INPUT', 'botToken cannot be empty');
  if (patch.botToken?.trim() && !/^\d+:[A-Za-z0-9_-]{30,}$/.test(patch.botToken.trim())) {
    throw new CoreError('INVALID_INPUT', 'botToken format is invalid');
  }
  if (patch.botToken?.trim()) {
    const existing = await getStoreByBotToken(patch.botToken.trim());
    if (existing && existing.id !== storeId) throw new CoreError('INVALID_INPUT', 'this bot token is already used by another store');
  }
  const set: Partial<typeof stores.$inferInsert> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.botToken !== undefined) set.botToken = patch.botToken;
  if (patch.botUsername !== undefined) set.botUsername = patch.botUsername;
  if (patch.adminIds !== undefined) set.adminIds = patch.adminIds.join(',');
  if (patch.adminChatId !== undefined) set.adminChatId = patch.adminChatId;
  if (patch.channelUrl !== undefined) set.channelUrl = patch.channelUrl;
  if (patch.isActive !== undefined) set.isActive = patch.isActive;
  const [r] = await db().update(stores).set(set).where(eq(stores.id, storeId)).returning();
  if (!r) throw new CoreError('NOT_FOUND', 'store not found');
  return toStoreInfo(r);
}

export async function getStoresForAdmin(adminUserId: number): Promise<StoreInfo[]> {
  const rows = await db()
    .select({ store: stores })
    .from(storeMembers)
    .innerJoin(stores, eq(stores.id, storeMembers.storeId))
    .where(eq(storeMembers.adminUserId, adminUserId));
  return rows.map((r) => toStoreInfo(r.store));
}

export async function addStoreMember(storeId: number, adminUserId: number, role: 'owner' | 'manager'): Promise<void> {
  await db()
    .insert(storeMembers)
    .values({ storeId, adminUserId, role })
    .onConflictDoUpdate({ target: [storeMembers.storeId, storeMembers.adminUserId], set: { role } });
}

export async function removeStoreMember(storeId: number, adminUserId: number): Promise<void> {
  await db()
    .delete(storeMembers)
    .where(and(eq(storeMembers.storeId, storeId), eq(storeMembers.adminUserId, adminUserId)));
}
