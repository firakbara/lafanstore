// Integration: real Postgres test DB (TEST_DATABASE_URL) + real core + manual provider.
// Skipped (with a reason) when the test DB is unreachable or core functions are not implemented yet.
import { afterAll, describe, expect, test } from 'bun:test';
import { join } from 'node:path';

// --- env: load ../../.env ourselves and point DATABASE_URL at the test DB before importing @tokobun/db ---
const envText = await Bun.file(join(import.meta.dir, '../../../.env'))
  .text()
  .catch(() => '');
for (const line of envText.split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^['"]|['"]$/g, '');
}
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const core = await import('@tokobun/core');
const dbMod = await import('@tokobun/db');
const pay = await import('../src/index');
const { eq, inArray } = await import('drizzle-orm');

// unique ids so parallel suites sharing tokobun_test do not collide
const UID = 9_100_000_000 + Math.floor(Math.random() * 1_000_000);
const OTHER = UID + 1;

let skipReason: string | null = null;
if (!process.env.TEST_DATABASE_URL) skipReason = 'TEST_DATABASE_URL not set';
else {
  try {
    await core.getSettings(1);
    await core.upsertTelegramUser(1, { id: UID, firstName: 'Pay Test', languageCode: 'en' });
    await core.upsertTelegramUser(1, { id: OTHER, firstName: 'Other', languageCode: 'en' });
  } catch (err) {
    const msg = (err as Error).message;
    skipReason = /not implemented/.test(msg) ? `core not implemented yet (${msg})` : `test DB unavailable (${msg})`;
  }
}
if (skipReason) console.warn(`[payments] skipping DB integration tests: ${skipReason}`);

async function cleanup() {
  const db = dbMod.getDb();
  const ids = [UID, OTHER];
  await db.delete(dbMod.referralEarnings).where(inArray(dbMod.referralEarnings.refereeId, ids));
  await db.delete(dbMod.ledgerEntries).where(inArray(dbMod.ledgerEntries.userId, ids));
  await db.update(dbMod.orders).set({ paymentId: null }).where(inArray(dbMod.orders.userId, ids));
  await db.delete(dbMod.payments).where(inArray(dbMod.payments.userId, ids));
  await db.delete(dbMod.users).where(inArray(dbMod.users.id, ids));
}

afterAll(async () => {
  if (!skipReason) await cleanup().catch((e) => console.warn('cleanup failed', e));
});

describe.skipIf(skipReason !== null)('payments x core x postgres (manual provider)', () => {
  const SECRET = 'test-secret';
  pay.configurePayments({ providers: [pay.createManualProvider({ enabled: true, secret: SECRET })] });
  const hook = (body: unknown, secret = SECRET) => ({
    headers: new Headers({ 'x-manual-secret': secret, 'content-type': 'application/json' }),
    rawBody: JSON.stringify(body),
  });

  test('top-up: invoice row -> webhook -> wallet credited, idempotent', async () => {
    const methods = await pay.listPaymentMethods({ storeId: 1, purpose: 'topup', country: 'US' });
    expect(methods.some((m) => m.provider === 'manual')).toBe(true);

    const before = await core.getBalance(UID);
    const v = await pay.createTopupPayment({ storeId: 1, userId: UID, amount: 500, provider: 'manual', method: 'MANUAL' });
    expect(v).toMatchObject({ status: 'pending', amount: 500, payCurrency: 'USD', payAmount: '5.00' });
    expect(await pay.getPayment(v.id, OTHER)).toBeNull();

    await expect(pay.handleWebhook('manual', hook({ code: v.code, status: 'paid' }, 'wrong'))).rejects.toMatchObject({ status: 401 });

    const r = await pay.handleWebhook('manual', hook({ code: v.code, status: 'paid' }));
    expect(r).toMatchObject({ paymentId: v.id, alreadySettled: false, purpose: 'topup', userId: UID });
    expect(r!.credited).toBeGreaterThanOrEqual(500);
    expect(await core.getBalance(UID)).toBe(before + r!.credited);

    const again = await pay.handleWebhook('manual', hook({ code: v.code, status: 'paid' }));
    expect(again?.alreadySettled).toBe(true);
    expect(await core.getBalance(UID)).toBe(before + r!.credited);
    expect((await pay.getPayment(v.id, UID))?.status).toBe('paid');

    const [row] = await dbMod.getDb().select().from(dbMod.payments).where(eq(dbMod.payments.id, v.id));
    expect((row!.raw as Record<string, unknown>).lastWebhook).toEqual({ code: v.code, status: 'paid' });
  });

  test('cancel: owner only, then INVALID_STATE', async () => {
    const v = await pay.createTopupPayment({ storeId: 1, userId: UID, amount: 300, provider: 'manual', method: 'MANUAL' });
    await expect(pay.cancelPayment(v.id, OTHER)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await pay.cancelPayment(v.id, UID);
    expect((await pay.getPayment(v.id, UID))?.status).toBe('cancelled');
    await expect(pay.cancelPayment(v.id, UID)).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  test('AMOUNT_TOO_SMALL below settings.topupMin', async () => {
    const s = await core.getSettings(1);
    await expect(pay.createTopupPayment({ storeId: 1, userId: UID, amount: s.topupMin - 1, provider: 'manual', method: 'MANUAL' })).rejects.toMatchObject({
      code: 'AMOUNT_TOO_SMALL',
    });
  });
});
