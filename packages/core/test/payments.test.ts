import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { getDb, payments, referralEarnings } from '@tokobun/db';
import { eq } from 'drizzle-orm';
import {
  createPendingOrder,
  expireStalePayments,
  getBalance,
  getOrder,
  getReferralStats,
  requestReferralWithdraw,
  settlePayment,
  transferReferralToWallet,
  updateSettings,
} from '../src';
import { expectCode, ledgerMismatches, makePayment, makeProduct, makeUser, resetDb, stockStatusCounts } from './helpers';

beforeEach(resetDb);
afterAll(resetDb);

describe('settlePayment topup', () => {
  test('credits amount + bonus tier, idempotent on second call', async () => {
    await updateSettings(1, { topupBonusTiers: [{ minAmount: 1000, percentBp: 500 }, { minAmount: 5000, percentBp: 1000 }] });
    const u = await makeUser();
    const pay = await makePayment({ userId: u, purpose: 'topup', amount: 2000 });
    const r1 = await settlePayment(pay);
    expect(r1).toMatchObject({ alreadySettled: false, purpose: 'topup', userId: u, credited: 2100, order: null, referral: null });
    const r2 = await settlePayment(pay);
    expect(r2).toMatchObject({ alreadySettled: true, credited: 2100 });
    expect(await getBalance(u)).toBe(2100);
    const [p] = await getDb().select().from(payments).where(eq(payments.id, pay));
    expect(p!.status).toBe('paid');
    expect(p!.paidAt).not.toBeNull();
    expect(await ledgerMismatches()).toEqual([]);
  });

  test('concurrent double settle credits once', async () => {
    const u = await makeUser();
    const pay = await makePayment({ userId: u, purpose: 'topup', amount: 1000 });
    const rs = await Promise.all(Array.from({ length: 6 }, () => settlePayment(pay)));
    expect(rs.filter((r) => !r.alreadySettled)).toHaveLength(1);
    expect(await getBalance(u)).toBe(1000);
    expect(await ledgerMismatches()).toEqual([]);
  });

  test('referral commission is percent of topup capped at referralMaxPerTopup', async () => {
    await updateSettings(1, { referralPercentBp: 500, referralMaxPerTopup: 300 });
    const referrer = await makeUser();
    const referee = await makeUser({ referredBy: referrer });
    const small = await makePayment({ userId: referee, purpose: 'topup', amount: 2000 });
    const big = await makePayment({ userId: referee, purpose: 'topup', amount: 100_000 });
    expect((await settlePayment(small)).referral).toEqual({ referrerId: referrer, amount: 100 });
    expect((await settlePayment(big)).referral).toEqual({ referrerId: referrer, amount: 300 });
    expect((await settlePayment(big)).referral).toEqual({ referrerId: referrer, amount: 300 }); // replay
    const rows = await getDb().select().from(referralEarnings);
    expect(rows).toHaveLength(2);
    // referral earnings do not touch the referrer wallet until transferred
    expect(await getBalance(referrer)).toBe(0);
    const stats = await getReferralStats(1, referrer);
    expect(stats).toMatchObject({ earned: 400, available: 400, referredTotal: 1, referred24h: 1 });

    await updateSettings(1, { referralMinWithdraw: 100 });
    await expectCode(requestReferralWithdraw(1, referrer, 50), 'AMOUNT_TOO_SMALL');
    await expectCode(requestReferralWithdraw(1, referrer, 500), 'INSUFFICIENT_BALANCE');
    await requestReferralWithdraw(1, referrer, 150);
    expect(await transferReferralToWallet(referrer)).toBe(250);
    expect(await getBalance(referrer)).toBe(250);
    await expectCode(transferReferralToWallet(referrer), 'AMOUNT_TOO_SMALL');
    expect(await getReferralStats(1, referrer)).toMatchObject({ available: 0, transferred: 250, withdrawn: 150 });
    expect(await ledgerMismatches()).toEqual([]);
  });
});

describe('settlePayment order', () => {
  test('delivers reserved stock, does not credit wallet, idempotent', async () => {
    const u = await makeUser();
    const p = await makeProduct({ price: 300, stock: 3 });
    const o = await createPendingOrder({ storeId: 1, userId: u, productId: p, quantity: 2 });
    const pay = await makePayment({ userId: u, purpose: 'order', amount: o.total, orderId: o.id });
    const [r1, r2] = await Promise.all([settlePayment(pay), settlePayment(pay)]);
    const first = r1.alreadySettled ? r2 : r1;
    const second = r1.alreadySettled ? r1 : r2;
    expect(first.alreadySettled).toBe(false);
    expect(second.alreadySettled).toBe(true);
    expect(first.credited).toBe(0);
    expect(first.order?.status).toBe('completed');
    expect(first.order?.items).toHaveLength(2);
    expect(second.order?.items).toEqual(first.order!.items);
    expect(await getBalance(u)).toBe(0);
    expect(await stockStatusCounts(p)).toEqual({ available: 1, reserved: 0, sold: 2 });
    const third = await settlePayment(pay);
    expect(third.alreadySettled).toBe(true);
  });

  test('reservation lost -> takes fresh stock', async () => {
    const u = await makeUser();
    const p = await makeProduct({ price: 300, stock: 3 });
    const o = await createPendingOrder({ storeId: 1, userId: u, productId: p, quantity: 2 });
    const pay = await makePayment({ userId: u, purpose: 'order', amount: o.total, orderId: o.id });
    await expireStalePayments(new Date(Date.now() + 60 * 60_000)); // cancels the order, releases stock
    expect((await getOrder(o.id, null))?.status).toBe('cancelled');
    const r = await settlePayment(pay); // late payment
    expect(r.order?.status).toBe('completed');
    expect(r.order?.items).toHaveLength(2);
    expect(await stockStatusCounts(p)).toEqual({ available: 1, reserved: 0, sold: 2 });
  });

  test('no stock left -> refunded to wallet', async () => {
    const u = await makeUser();
    const buyer = await makeUser({ balance: 10_000 });
    const p = await makeProduct({ price: 300, stock: 2 });
    const o = await createPendingOrder({ storeId: 1, userId: u, productId: p, quantity: 2 });
    const pay = await makePayment({ userId: u, purpose: 'order', amount: o.total, orderId: o.id });
    await expireStalePayments(new Date(Date.now() + 60 * 60_000));
    const { purchaseWithBalance } = await import('../src');
    await purchaseWithBalance({ storeId: 1, userId: buyer, productId: p, quantity: 2 });
    const r = await settlePayment(pay);
    expect(r.order?.status).toBe('refunded');
    expect(r.order?.items).toEqual([]);
    expect(r.credited).toBe(600);
    expect(await getBalance(u)).toBe(600);
    expect((await settlePayment(pay)).alreadySettled).toBe(true);
    expect(await getBalance(u)).toBe(600);
    expect(await ledgerMismatches()).toEqual([]);
  });

  test('expireStalePayments only touches expired pending payments', async () => {
    const u = await makeUser();
    const live = await makePayment({ userId: u, purpose: 'topup', amount: 100 });
    const stale = await makePayment({ userId: u, purpose: 'topup', amount: 100, expiresAt: new Date(Date.now() - 1000) });
    expect(await expireStalePayments()).toBe(1);
    const rows = await getDb().select().from(payments);
    expect(rows.find((r) => r.id === stale)!.status).toBe('expired');
    expect(rows.find((r) => r.id === live)!.status).toBe('pending');
  });
});
