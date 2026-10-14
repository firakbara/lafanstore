import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { broadcasts, getDb, stores } from '@tokobun/db';
import { eq } from 'drizzle-orm';
import {
  addStoreMember,
  claimBroadcast,
  closeSupportSession,
  countBroadcastAudience,
  createApiKey,
  createBroadcast,
  createStore,
  finishBroadcast,
  findSupportSessionByAdminThread,
  getActiveApiKey,
  getOpenSupportSession,
  getSettings,
  getStore,
  getStoreBySlug,
  getStoresForAdmin,
  getUser,
  markBlockedBot,
  nextBroadcastRecipients,
  openSupportSession,
  rate,
  recordBroadcastProgress,
  removeStoreMember,
  revokeApiKeys,
  setBanned,
  setCurrency,
  setLanguage,
  setSupportThreads,
  setTimezone,
  toggleNotify,
  updateSettings,
  updateStore,
  upsertTelegramUser,
  verifyApiKey,
} from '../src';
import { expectCode, makeAdmin, makePayment, makeUser, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(resetDb);

describe('users', () => {
  test('upsert creates once, attaches referral only on creation', async () => {
    const a = await upsertTelegramUser(1, { id: 1, username: 'alice', languageCode: 'id' });
    expect(a.isNew).toBe(true);
    expect(a.user).toMatchObject({ language: 'id', currency: 'IDR', balance: 0 });
    expect(a.user.referralCode).toMatch(/^[A-Za-z0-9]{8}$/);
    const b = await upsertTelegramUser(1, { id: 2, languageCode: 'fr-FR', startPayload: `ref_${a.user.referralCode}` });
    expect(b.isNew).toBe(true);
    expect(b.user.language).toBe('en');
    const b2 = await upsertTelegramUser(1, { id: 2, username: 'bob', startPayload: 'ref_nothing' });
    expect(b2.isNew).toBe(false);
    expect(b2.user.username).toBe('bob');
    const { getDb: g } = await import('@tokobun/db');
    const { users } = await import('@tokobun/db');
    const [row] = await g().select().from(users).where(eq(users.id, 2));
    expect(row!.referredBy).toBe(1);
    // self-referral ignored
    const c = await upsertTelegramUser(1, { id: 3, startPayload: 'ref_zzzzzzzz' });
    expect(c.isNew).toBe(true);
  });

  test('upsert clears blockedBot when user returns', async () => {
    await upsertTelegramUser(1, { id: 50, username: 'blocker' });
    await markBlockedBot(50, true);
    const { users } = await import('@tokobun/db');
    const db = getDb();
    const [blocked] = await db.select({ blockedBot: users.blockedBot }).from(users).where(eq(users.id, 50));
    expect(blocked!.blockedBot).toBe(true);
    await upsertTelegramUser(1, { id: 50, username: 'blocker' });
    const [cleared] = await db.select({ blockedBot: users.blockedBot }).from(users).where(eq(users.id, 50));
    expect(cleared!.blockedBot).toBe(false);
  });

  test('profile setters and toggles', async () => {
    const u = await makeUser();
    await setLanguage(1, u, 'id');
    await expectCode(setLanguage(1, u, 'xx'), 'INVALID_INPUT');
    await setCurrency(u, 'eur');
    await setTimezone(u, 420);
    await expectCode(setTimezone(u, 99999), 'INVALID_INPUT');
    expect(await toggleNotify(u, 'stock')).toBe(false);
    expect(await toggleNotify(u, 'stock')).toBe(true);
    expect(await toggleNotify(u, 'info')).toBe(false);
    await setBanned(u, true);
    await rate(u, 1);
    await rate(u, -1);
    const p = await getUser(u);
    expect(p).toMatchObject({ language: 'id', currency: 'EUR', tzOffsetMinutes: 420, notifyStock: true, notifyInfo: false, isBanned: true });
    await expectCode(setLanguage(1, 999999, 'en'), 'NOT_FOUND');
  });
});

describe('settings', () => {
  test('defaults merged with stored values', async () => {
    const s = await getSettings(1);
    expect(s).toMatchObject({ referralPercentBp: 500, referralMaxPerTopup: 300, topupMin: 100, orderPaymentTtlMinutes: 15, storeName: 'TokoBun' });
    const s2 = await updateSettings(1, { fxRates: { IDR: 16300 }, storeName: 'Shop' });
    expect(s2.fxRates).toEqual({ IDR: 16300 });
    expect(s2.storeName).toBe('Shop');
    expect((await updateSettings(1, { storeName: 'Shop2' })).fxRates).toEqual({ IDR: 16300 });
    await expectCode(updateSettings(1, { topupMin: -1 }), 'INVALID_INPUT');
    expect((await updateSettings(1, { channelUrl: 'https://t.me/x' })).channelUrl).toBe('https://t.me/x');
    expect((await updateSettings(1, { channelUrl: null })).channelUrl).toBeNull();
  });

  test('orderPaymentTtlMinutes must be at least 1', async () => {
    await expectCode(updateSettings(1, { orderPaymentTtlMinutes: 0 }), 'INVALID_INPUT');
    const s = await updateSettings(1, { orderPaymentTtlMinutes: 1 });
    expect(s.orderPaymentTtlMinutes).toBe(1);
  });

  test('storeName rejects empty and overly long values', async () => {
    await expectCode(updateSettings(1, { storeName: '' }), 'INVALID_INPUT');
    await expectCode(updateSettings(1, { storeName: '   ' }), 'INVALID_INPUT');
    await expectCode(updateSettings(1, { storeName: 'X'.repeat(129) }), 'INVALID_INPUT');
  });

  test('topupBonusTiers validates minAmount and percentBp ranges', async () => {
    await expectCode(updateSettings(1, { topupBonusTiers: [{ minAmount: 0, percentBp: 100 }] }), 'INVALID_INPUT');
    await expectCode(updateSettings(1, { topupBonusTiers: [{ minAmount: 100, percentBp: 0 }] }), 'INVALID_INPUT');
    await expectCode(updateSettings(1, { topupBonusTiers: [{ minAmount: 100, percentBp: 10001 }] }), 'INVALID_INPUT');
    const s = await updateSettings(1, { topupBonusTiers: [{ minAmount: 500, percentBp: 200 }] });
    expect(s.topupBonusTiers).toEqual([{ minAmount: 500, percentBp: 200 }]);
  });

  test('channelUrl and supportUsername reject overly long values', async () => {
    await expectCode(updateSettings(1, { channelUrl: 'x'.repeat(257) }), 'INVALID_INPUT');
    await expectCode(updateSettings(1, { supportUsername: 'u'.repeat(65) }), 'INVALID_INPUT');
    const s = await updateSettings(1, { channelUrl: 'https://t.me/test', supportUsername: 'admin' });
    expect(s.channelUrl).toBe('https://t.me/test');
    expect(s.supportUsername).toBe('admin');
  });
});

describe('broadcasts', () => {
  test('recipients honour flags, bans, blocked and cursor', async () => {
    const ids: number[] = [];
    for (let i = 0; i < 6; i++) ids.push(await makeUser({ id: 100 + i }));
    for (const id of ids) await makePayment({ userId: id, purpose: 'topup', amount: 100 });
    await setBanned(101, true);
    await markBlockedBot(102, true);
    await toggleNotify(103, 'stock'); // stock off

    const all = await createBroadcast({ storeId: 1, audience: 'all', body: '<b>hi</b>', queue: true });
    const stock = await createBroadcast({ storeId: 1, audience: 'stock', body: 'restock', queue: true });
    const draft = await createBroadcast({ storeId: 1, audience: 'info', body: 'draft' });

    const job = await claimBroadcast();
    expect(job).toMatchObject({ id: all, audience: 'all' });
    expect(await nextBroadcastRecipients(all, 2)).toEqual([100, 103]);
    await recordBroadcastProgress(all, 2, 0, 103);
    expect(await nextBroadcastRecipients(all, 10)).toEqual([104, 105]);
    await recordBroadcastProgress(all, 1, 1, 105);
    expect(await nextBroadcastRecipients(all, 10)).toEqual([]);
    // resume: claim returns the same 'sending' broadcast first
    expect((await claimBroadcast())?.id).toBe(all);
    await finishBroadcast(all, 'done');
    const [row] = await getDb().select().from(broadcasts).where(eq(broadcasts.id, all));
    expect(row).toMatchObject({ status: 'done', sentCount: 3, failedCount: 1, totalCount: 4 });

    expect((await claimBroadcast())?.id).toBe(stock);
    expect(await nextBroadcastRecipients(stock, 10)).toEqual([100, 104, 105]);
    await finishBroadcast(stock, 'done');
    expect(await claimBroadcast()).toBeNull(); // draft is never claimed
    expect(draft).toBeGreaterThan(0);
  });

  test('claimBroadcast(storeId) only claims matching store', async () => {
    await makeUser({ id: 200 });
    await getDb().insert(stores).values({ id: 2, slug: 'test-store-2', name: 'Store 2', botToken: 'tok2' }).onConflictDoNothing();
    await makePayment({ userId: 200, purpose: 'topup', amount: 100 });
    const { payments } = await import('@tokobun/db');
    const { generatePaymentCode } = await import('../src');
    await getDb().insert(payments).values({ storeId: 2, code: generatePaymentCode(), userId: 200, purpose: 'topup', provider: 'manual', method: 'TEST', amount: 100, payCurrency: 'USD', payAmount: '1.00', expiresAt: new Date(Date.now() + 15 * 60_000) });
    const s1 = await createBroadcast({ storeId: 1, audience: 'all', body: 'store1 msg', queue: true });
    const s2 = await createBroadcast({ storeId: 2, audience: 'all', body: 'store2 msg', queue: true });

    const job2 = await claimBroadcast(2);
    expect(job2).toMatchObject({ id: s2, body: 'store2 msg' });
    await finishBroadcast(s2, 'done');

    expect(await claimBroadcast(2)).toBeNull();

    const job1 = await claimBroadcast(1);
    expect(job1).toMatchObject({ id: s1, body: 'store1 msg' });
    await finishBroadcast(s1, 'done');

    expect(await claimBroadcast()).toBeNull();
  });

  test('broadcast recipients are scoped to store users', async () => {
    await getDb().insert(stores).values({ id: 3, slug: 'test-store-3', name: 'Store 3', botToken: 'tok3' }).onConflictDoNothing();
    const u1 = await makeUser({ id: 300 });
    const u2 = await makeUser({ id: 301 });
    const u3 = await makeUser({ id: 302 });
    await makePayment({ userId: u1, purpose: 'topup', amount: 100 });
    await makePayment({ userId: u2, purpose: 'topup', amount: 100 });
    const { payments } = await import('@tokobun/db');
    const { generatePaymentCode } = await import('../src');
    await getDb().insert(payments).values({ storeId: 3, code: generatePaymentCode(), userId: u3, purpose: 'topup', provider: 'manual', method: 'TEST', amount: 100, payCurrency: 'USD', payAmount: '1.00', expiresAt: new Date(Date.now() + 15 * 60_000) });
    expect(await countBroadcastAudience('all', 1)).toBe(2);
    expect(await countBroadcastAudience('all', 3)).toBe(1);
    const bc = await createBroadcast({ storeId: 3, audience: 'all', body: 'store3 only', queue: true });
    await claimBroadcast(3);
    expect(await nextBroadcastRecipients(bc, 10)).toEqual([u3]);
    await finishBroadcast(bc, 'done');
  });
});

describe('api keys', () => {
  test('create, verify, rotate, revoke', async () => {
    const u = await makeUser();
    const { key, info } = await createApiKey(1, u);
    expect(key).toMatch(/^tb_live_[0-9a-f]{32}$/);
    expect(info.prefix).toBe(key.slice(0, 16));
    expect((await verifyApiKey(key))?.user.id).toBe(u);
    expect((await getActiveApiKey(u))?.lastUsedAt).not.toBeNull();
    expect(await verifyApiKey('tb_live_' + '0'.repeat(32))).toBeNull();
    expect(await verifyApiKey('garbage')).toBeNull();
    const second = await createApiKey(1, u);
    expect(await verifyApiKey(key)).toBeNull();
    expect((await verifyApiKey(second.key))?.user.id).toBe(u);
    await revokeApiKeys(u);
    expect(await verifyApiKey(second.key)).toBeNull();
    expect(await getActiveApiKey(u)).toBeNull();
  });
});

describe('support', () => {
  test('open/find/close', async () => {
    const u = await makeUser();
    const [s1, s2] = await Promise.all([openSupportSession(1, u), openSupportSession(1, u)]);
    expect(s1.id).toBe(s2.id);
    await setSupportThreads(s1.id, { adminThreadId: 77, userThreadId: 5 });
    expect((await findSupportSessionByAdminThread(77))?.userThreadId).toBe(5);
    expect((await getOpenSupportSession(1, u))?.id).toBe(s1.id);
    await closeSupportSession(s1.id);
    expect(await getOpenSupportSession(1, u)).toBeNull();
    expect(await findSupportSessionByAdminThread(77)).toBeNull();
  });
});

describe('stores', () => {
  test('create validates slug, name, token', async () => {
    await expectCode(createStore({ slug: '', name: 'Test', botToken: '123:abc' }), 'INVALID_INPUT');
    await expectCode(createStore({ slug: 'A', name: 'Test', botToken: '123:abc' }), 'INVALID_INPUT');
    await expectCode(createStore({ slug: 'good-slug', name: '', botToken: '123:abc' }), 'INVALID_INPUT');
    await expectCode(createStore({ slug: 'good-slug', name: 'Test', botToken: 'bad' }), 'INVALID_INPUT');
  });

  test('create, get, update, slug uniqueness', async () => {
    const s = await createStore({ slug: 'my-shop', name: 'My Shop', botToken: '111111:ABCdefGHIjklMNOpqrSTUvwxyz123456' });
    expect(s.slug).toBe('my-shop');
    expect(s.name).toBe('My Shop');
    expect(s.isActive).toBe(true);

    const byId = await getStore(s.id);
    expect(byId?.name).toBe('My Shop');
    const bySlug = await getStoreBySlug('my-shop');
    expect(bySlug?.id).toBe(s.id);

    const updated = await updateStore(s.id, { name: 'Renamed' });
    expect(updated.name).toBe('Renamed');

    await expectCode(createStore({ slug: 'my-shop', name: 'Dup', botToken: '222222:ABCdefGHIjklMNOpqrSTUvwxyz654321' }), 'INVALID_INPUT');
  });

  test('bot token uniqueness enforced', async () => {
    const tok = '333333:ABCdefGHIjklMNOpqrSTUvwxyz000001';
    await createStore({ slug: 'tok-a', name: 'A', botToken: tok });
    await expectCode(createStore({ slug: 'tok-b', name: 'B', botToken: tok }), 'INVALID_INPUT');
  });

  test('update validates empty name and bad token', async () => {
    const s = await createStore({ slug: 'val-store', name: 'Val', botToken: '444444:ABCdefGHIjklMNOpqrSTUvwxyz000002' });
    await expectCode(updateStore(s.id, { name: '' }), 'INVALID_INPUT');
    await expectCode(updateStore(s.id, { botToken: '' }), 'INVALID_INPUT');
    await expectCode(updateStore(s.id, { botToken: 'nope' }), 'INVALID_INPUT');
  });

  test('store members: add, list, remove', async () => {
    const s = await createStore({ slug: 'member-test', name: 'M', botToken: '555555:ABCdefGHIjklMNOpqrSTUvwxyz000003' });
    const adminId = await makeAdmin();
    await addStoreMember(s.id, adminId, 'owner');
    const adminStores = await getStoresForAdmin(adminId);
    expect(adminStores).toHaveLength(1);
    expect(adminStores[0]!.id).toBe(s.id);

    await removeStoreMember(s.id, adminId);
    expect(await getStoresForAdmin(adminId)).toHaveLength(0);
  });
});
