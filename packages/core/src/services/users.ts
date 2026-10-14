import { orders, payments, ratings, users, type DbOrTx } from '@tokobun/db';
import { and, eq, sql } from 'drizzle-orm';
import type { NotifyFlag, TelegramUserInput, UserProfile } from '../contracts';
import { CoreError } from '../contracts';
import { getSettings } from './settings';
import { db, generateReferralCode, isUniqueViolation } from './util';

type UserRow = typeof users.$inferSelect;

export function toProfile(u: UserRow): UserProfile {
  return {
    id: u.id,
    username: u.username,
    firstName: u.firstName,
    language: u.language,
    currency: u.currency,
    tzOffsetMinutes: u.tzOffsetMinutes,
    balance: u.balance,
    referralCode: u.referralCode,
    notifyStock: u.notifyStock,
    notifyInfo: u.notifyInfo,
    notifyReferral: u.notifyReferral,
    isBanned: u.isBanned,
    createdAt: u.createdAt,
  };
}

export async function upsertTelegramUser(storeId: number, input: TelegramUserInput): Promise<{ user: UserProfile; isNew: boolean }> {
  if (!Number.isSafeInteger(input.id) || input.id <= 0) throw new CoreError('INVALID_INPUT', 'invalid telegram id');
  const d = db();
  const existing = await getUserRow(input.id);
  if (existing) {
    const [u] = await d
      .update(users)
      .set({ username: input.username ?? null, firstName: input.firstName ?? null, lastSeenAt: new Date(), blockedBot: false })
      .where(eq(users.id, input.id))
      .returning();
    return { user: toProfile(u!), isNew: false };
  }

  const s = await getSettings(storeId);
  const lang = (input.languageCode ?? '').toLowerCase().split(/[-_]/)[0] ?? '';
  const language = lang && s.supportedLanguages.includes(lang) ? lang : 'en';
  const currency = language === 'id' ? 'IDR' : 'USD';

  let referredBy: number | null = null;
  const m = /^ref_([A-Za-z0-9]+)$/.exec(input.startPayload ?? '');
  if (m) {
    const [ref] = await d.select({ id: users.id }).from(users).where(eq(users.referralCode, m[1]!)).limit(1);
    if (ref && ref.id !== input.id) referredBy = ref.id;
  }

  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const rows = await d
        .insert(users)
        .values({
          id: input.id,
          username: input.username ?? null,
          firstName: input.firstName ?? null,
          language,
          currency,
          referralCode: generateReferralCode(),
          referredBy,
        })
        .onConflictDoUpdate({
          target: users.id,
          set: { username: input.username ?? null, firstName: input.firstName ?? null, lastSeenAt: new Date(), blockedBot: false },
        })
        .returning({ id: users.id, inserted: sql<boolean>`(xmax = 0)` });
      const u = await getUserRow(input.id);
      return { user: toProfile(u!), isNew: Boolean(rows[0]?.inserted) };
    } catch (e) {
      if (isUniqueViolation(e, 'referral_code')) continue;
      throw e;
    }
  }
  throw new CoreError('INVALID_STATE', 'could not allocate referral code');
}

export async function getUserRow(userId: number, tx?: DbOrTx): Promise<UserRow | null> {
  const [u] = await db(tx).select().from(users).where(eq(users.id, userId)).limit(1);
  return u ?? null;
}

export async function getUser(userId: number): Promise<UserProfile | null> {
  const u = await getUserRow(userId);
  return u ? toProfile(u) : null;
}

async function updateUser(userId: number, set: Partial<typeof users.$inferInsert>) {
  const r = await db().update(users).set(set).where(eq(users.id, userId)).returning({ id: users.id });
  if (!r.length) throw new CoreError('NOT_FOUND', 'user not found');
}

export async function setLanguage(storeId: number, userId: number, language: string): Promise<void> {
  const s = await getSettings(storeId);
  if (!s.supportedLanguages.includes(language)) throw new CoreError('INVALID_INPUT', 'unsupported language');
  await updateUser(userId, { language });
}

export async function setCurrency(userId: number, currency: string): Promise<void> {
  const cur = currency.toUpperCase();
  if (!/^[A-Z]{3,5}$/.test(cur)) throw new CoreError('INVALID_INPUT', 'invalid currency');
  await updateUser(userId, { currency: cur });
}

export async function setTimezone(userId: number, offsetMinutes: number): Promise<void> {
  if (!Number.isInteger(offsetMinutes) || offsetMinutes < -12 * 60 || offsetMinutes > 14 * 60) {
    throw new CoreError('INVALID_INPUT', 'invalid timezone offset');
  }
  await updateUser(userId, { tzOffsetMinutes: offsetMinutes });
}

const FLAG_COL = { stock: 'notify_stock', info: 'notify_info', referral: 'notify_referral' } as const;

export async function toggleNotify(userId: number, flag: NotifyFlag): Promise<boolean> {
  const col = FLAG_COL[flag];
  if (!col) throw new CoreError('INVALID_INPUT', 'invalid flag');
  const rows = await db().execute<{ v: boolean }>(
    sql`update users set ${sql.identifier(col)} = not ${sql.identifier(col)} where id = ${userId} returning ${sql.identifier(col)} as v`,
  );
  const r = (rows as unknown as { v: boolean }[])[0];
  if (!r) throw new CoreError('NOT_FOUND', 'user not found');
  return r.v;
}

export async function setBanned(userId: number, banned: boolean): Promise<void> {
  await updateUser(userId, { isBanned: banned });
}

export async function markBlockedBot(userId: number, blocked: boolean): Promise<void> {
  await updateUser(userId, { blockedBot: blocked });
}

export async function isUserInStore(userId: number, storeId: number): Promise<boolean> {
  const d = db();
  const [[o], [p]] = await Promise.all([
    d.select({ n: sql<number>`1` }).from(orders).where(and(eq(orders.userId, userId), eq(orders.storeId, storeId))).limit(1),
    d.select({ n: sql<number>`1` }).from(payments).where(and(eq(payments.userId, userId), eq(payments.storeId, storeId))).limit(1),
  ]);
  return !!(o || p);
}

export async function rate(userId: number, value: 1 | -1): Promise<void> {
  if (value !== 1 && value !== -1) throw new CoreError('INVALID_INPUT', 'rating must be 1 or -1');
  await db()
    .insert(ratings)
    .values({ userId, value })
    .onConflictDoUpdate({ target: ratings.userId, set: { value, updatedAt: new Date() } });
}
