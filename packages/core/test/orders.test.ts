import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { getDb, orders, products, stockItems, stores, vouchers } from '@tokobun/db';
import { eq } from 'drizzle-orm';
import {
  availableStock,
  cancelExpiredOrders,
  createPendingOrder,
  getBalance,
  getOrder,
  getProduct,
  isUserInStore,
  listLedger,
  listProducts,
  listUserOrders,
  purchaseWithBalance,
  quote,
  refundOrder,
  setBanned,
  updateSettings,
} from '../src';
import { expectCode, ledgerMismatches, makeProduct, makeUser, makeVoucher, resetDb, stockStatusCounts } from './helpers';

beforeEach(resetDb);
afterAll(resetDb);

describe('purchaseWithBalance', () => {
  test('happy path delivers items, debits wallet, writes ledger', async () => {
    const u = await makeUser({ balance: 1000 });
    const p = await makeProduct({ price: 150, stock: 5 });
    const { order } = await purchaseWithBalance({ storeId: 1, userId: u, productId: p, quantity: 2 });
    expect(order.status).toBe('completed');
    expect(order.code).toMatch(/^TB-[A-Z2-9]{6}$/);
    expect(order.total).toBe(300);
    expect(order.items).toHaveLength(2);
    expect(order.paidWith).toBe('balance');
    expect(await getBalance(u)).toBe(700);
    expect(await availableStock(p)).toBe(3);
    expect(await stockStatusCounts(p)).toEqual({ available: 3, reserved: 0, sold: 2 });
    const ledger = await listLedger(u);
    expect(ledger.items[0]).toMatchObject({ amount: -300, type: 'purchase', balanceAfter: 700, refType: 'order' });
    expect(await ledgerMismatches()).toEqual([]);
    const again = await getOrder(order.id, u);
    expect(again?.items).toEqual(order.items);
    expect(await getOrder(order.id, u + 1)).toBeNull();
    expect((await listUserOrders(u)).total).toBe(1);
  });

  test('OUT_OF_STOCK leaves everything untouched', async () => {
    const u = await makeUser({ balance: 10_000 });
    const p = await makeProduct({ price: 100, stock: 2 });
    await expectCode(purchaseWithBalance({ storeId: 1, userId: u, productId: p, quantity: 3 }), 'OUT_OF_STOCK');
    expect(await getBalance(u)).toBe(10_000);
    expect(await availableStock(p)).toBe(2);
  });

  test('INSUFFICIENT_BALANCE', async () => {
    const u = await makeUser({ balance: 99 });
    const p = await makeProduct({ price: 100, stock: 2 });
    await expectCode(purchaseWithBalance({ storeId: 1, userId: u, productId: p, quantity: 1 }), 'INSUFFICIENT_BALANCE');
    expect(await getBalance(u)).toBe(99);
    expect(await availableStock(p)).toBe(2);
    expect(await ledgerMismatches()).toEqual([]);
  });

  test('INVALID_QUANTITY, USER_BANNED, PRODUCT_INACTIVE, collections', async () => {
    const u = await makeUser({ balance: 1000 });
    const p = await makeProduct({ price: 100, stock: 2 });
    await expectCode(purchaseWithBalance({ storeId: 1, userId: u, productId: p, quantity: 0 }), 'INVALID_QUANTITY');
    await expectCode(purchaseWithBalance({ storeId: 1, userId: u, productId: p, quantity: 1.5 }), 'INVALID_QUANTITY');
    const inactive = await makeProduct({ price: 100, stock: 2, isActive: false });
    await expectCode(purchaseWithBalance({ storeId: 1, userId: u, productId: inactive, quantity: 1 }), 'PRODUCT_INACTIVE');
    const coll = await makeProduct({ isCollection: true, price: 0 });
    await expectCode(purchaseWithBalance({ storeId: 1, userId: u, productId: coll, quantity: 1 }), 'INVALID_STATE');
    await setBanned(u, true);
    await expectCode(purchaseWithBalance({ storeId: 1, userId: u, productId: p, quantity: 1 }), 'USER_BANNED');
  });

  test('concurrent purchases never oversell (20 buyers, 5 stock)', async () => {
    const p = await makeProduct({ price: 100, stock: 5 });
    const buyers = await Promise.all(Array.from({ length: 20 }, () => makeUser({ balance: 1000 })));
    const results = await Promise.allSettled(buyers.map((u) => purchaseWithBalance({ storeId: 1, userId: u, productId: p, quantity: 1 })));
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(ok).toHaveLength(5);
    expect(failed.every((f) => f.reason?.code === 'OUT_OF_STOCK')).toBe(true);
    expect(await stockStatusCounts(p)).toEqual({ available: 0, reserved: 0, sold: 5 });
    const delivered = ok.flatMap((r) => (r as PromiseFulfilledResult<any>).value.order.items);
    expect(new Set(delivered).size).toBe(5);
    expect(await ledgerMismatches()).toEqual([]);
  });

  test('same user, parallel buys cannot overdraw', async () => {
    const u = await makeUser({ balance: 300 });
    const p = await makeProduct({ price: 100, stock: 10 });
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => purchaseWithBalance({ storeId: 1, userId: u, productId: p, quantity: 1 })));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect(await getBalance(u)).toBe(0);
    expect(await ledgerMismatches()).toEqual([]);
  });

  test('unlimited product repeats content and never runs out', async () => {
    const u = await makeUser({ balance: 10_000 });
    const p = await makeProduct({ price: 50, unlimited: true });
    expect(await availableStock(p)).toBeNull();
    const { order } = await purchaseWithBalance({ storeId: 1, userId: u, productId: p, quantity: 3 });
    expect(order.items).toEqual(Array(3).fill('https://example.com/unlimited'));
    expect((await getOrder(order.id, null))?.items).toHaveLength(3);
    expect(await getBalance(u)).toBe(10_000 - 150);
  });
});

describe('pricing', () => {
  test('discount tiers pick the best applicable tier + next tier hint', async () => {
    const u = await makeUser();
    const p = await makeProduct({
      price: 1000,
      discounts: [
        { minQty: 10, percentBp: 300 },
        { minQty: 150, percentBp: 600 },
      ],
    });
    let q = await quote({ storeId: 1, userId: u, productId: p, quantity: 5 });
    expect(q).toMatchObject({ subtotal: 5000, discountBp: 0, total: 5000, nextTier: { minQty: 10, percentBp: 300 } });
    q = await quote({ storeId: 1, userId: u, productId: p, quantity: 10 });
    expect(q).toMatchObject({ discountBp: 300, discountAmount: 300, total: 9700, nextTier: { minQty: 150, percentBp: 600 } });
    q = await quote({ storeId: 1, userId: u, productId: p, quantity: 150 });
    expect(q).toMatchObject({ discountBp: 600, discountAmount: 9000, total: 141000, nextTier: null });
  });

  test('vouchers: percent, fixed, min total, expiry, inactive, product scope', async () => {
    const u = await makeUser();
    const p = await makeProduct({ price: 1000, discounts: [{ minQty: 2, percentBp: 1000 }] });
    const other = await makeProduct({ price: 1000 });
    await makeVoucher({ code: 'TEN', kind: 'percent', value: 1000 });
    await makeVoucher({ code: 'FIVE', kind: 'fixed', value: 500, minTotal: 1500 });
    await makeVoucher({ code: 'OLD', kind: 'fixed', value: 100, expiresAt: new Date(Date.now() - 1000) });
    await makeVoucher({ code: 'OFF', kind: 'fixed', value: 100, isActive: false });
    await makeVoucher({ code: 'ONLYOTHER', kind: 'fixed', value: 100, productId: other });
    await makeVoucher({ code: 'BIG', kind: 'fixed', value: 99999 });

    // tier first (2 x 1000 - 10% = 1800), then voucher 10% of 1800 = 180
    let q = await quote({ storeId: 1, userId: u, productId: p, quantity: 2, voucherCode: 'ten' });
    expect(q).toMatchObject({ subtotal: 2000, discountAmount: 200, voucherCode: 'TEN', voucherDiscount: 180, total: 1620 });
    q = await quote({ storeId: 1, userId: u, productId: p, quantity: 2, voucherCode: 'FIVE' });
    expect(q).toMatchObject({ voucherDiscount: 500, total: 1300 });
    await expectCode(quote({ storeId: 1, userId: u, productId: p, quantity: 1, voucherCode: 'FIVE' }), 'VOUCHER_MIN_TOTAL');
    await expectCode(quote({ storeId: 1, userId: u, productId: p, quantity: 1, voucherCode: 'OLD' }), 'VOUCHER_EXPIRED');
    await expectCode(quote({ storeId: 1, userId: u, productId: p, quantity: 1, voucherCode: 'OFF' }), 'VOUCHER_INVALID');
    await expectCode(quote({ storeId: 1, userId: u, productId: p, quantity: 1, voucherCode: 'NOPE' }), 'VOUCHER_INVALID');
    await expectCode(quote({ storeId: 1, userId: u, productId: p, quantity: 1, voucherCode: 'ONLYOTHER' }), 'VOUCHER_INVALID');
    q = await quote({ storeId: 1, userId: u, productId: p, quantity: 1, voucherCode: 'BIG' });
    expect(q.total).toBe(0);
  });

  test('voucher per-user limit and max uses are enforced on purchase', async () => {
    const a = await makeUser({ balance: 10_000 });
    const b = await makeUser({ balance: 10_000 });
    const c = await makeUser({ balance: 10_000 });
    const p = await makeProduct({ price: 1000, stock: 10 });
    const vid = await makeVoucher({ code: 'ONCE', kind: 'percent', value: 5000, perUserLimit: 1, maxUses: 2 });
    const { order } = await purchaseWithBalance({ storeId: 1, userId: a, productId: p, quantity: 1, voucherCode: 'ONCE' });
    expect(order.total).toBe(500);
    expect(order.voucherDiscount).toBe(500);
    await expectCode(purchaseWithBalance({ storeId: 1, userId: a, productId: p, quantity: 1, voucherCode: 'ONCE' }), 'VOUCHER_LIMIT_REACHED');
    await purchaseWithBalance({ storeId: 1, userId: b, productId: p, quantity: 1, voucherCode: 'ONCE' });
    await expectCode(purchaseWithBalance({ storeId: 1, userId: c, productId: p, quantity: 1, voucherCode: 'ONCE' }), 'VOUCHER_LIMIT_REACHED');
    const [v] = await getDb().select().from(vouchers).where(eq(vouchers.id, vid));
    expect(v!.usedCount).toBe(2);
    expect(await getBalance(a)).toBe(9500);
  });
});

describe('pending orders', () => {
  test('createPendingOrder reserves; cancelExpiredOrders releases stock and voucher', async () => {
    await updateSettings(1, { orderPaymentTtlMinutes: 15 });
    const u = await makeUser();
    const p = await makeProduct({ price: 200, stock: 3 });
    const vid = await makeVoucher({ code: 'HALF', kind: 'percent', value: 5000 });
    const o = await createPendingOrder({ storeId: 1, userId: u, productId: p, quantity: 2, voucherCode: 'HALF' });
    expect(o.status).toBe('pending_payment');
    expect(o.paidWith).toBe('payment');
    expect(o.total).toBe(200);
    expect(o.items).toEqual([]);
    expect(await stockStatusCounts(p)).toEqual({ available: 1, reserved: 2, sold: 0 });
    expect(await availableStock(p)).toBe(1);
    await expectCode(createPendingOrder({ storeId: 1, userId: u, productId: p, quantity: 2 }), 'OUT_OF_STOCK');

    expect(await cancelExpiredOrders(new Date())).toBe(0);
    expect(await cancelExpiredOrders(new Date(Date.now() + 16 * 60_000))).toBe(1);
    expect(await stockStatusCounts(p)).toEqual({ available: 3, reserved: 0, sold: 0 });
    expect((await getOrder(o.id, u))?.status).toBe('cancelled');
    const [v] = await getDb().select().from(vouchers).where(eq(vouchers.id, vid));
    expect(v!.usedCount).toBe(0);
    const reserved = await getDb().select().from(stockItems).where(eq(stockItems.orderId, o.id));
    expect(reserved).toHaveLength(0);
  });
});

describe('refundOrder', () => {
  test('refunds completed order to wallet once', async () => {
    const u = await makeUser({ balance: 500 });
    const p = await makeProduct({ price: 200, stock: 3 });
    const { order } = await purchaseWithBalance({ storeId: 1, userId: u, productId: p, quantity: 1 });
    const r = await refundOrder(order.id, 'broken');
    expect(r.status).toBe('refunded');
    expect(await getBalance(u)).toBe(500);
    await expectCode(refundOrder(order.id), 'INVALID_STATE');
    expect(await stockStatusCounts(p)).toEqual({ available: 2, reserved: 0, sold: 1 });
    expect(await ledgerMismatches()).toEqual([]);
  });
});

describe('catalog', () => {
  test('listProducts sorting, collections, pagination', async () => {
    const a = await makeProduct({ name: 'A in stock', stock: 2 });
    const b = await makeProduct({ name: 'B sold out', stock: 0 });
    const c = await makeProduct({ name: 'C unlimited', unlimited: true, discounts: [{ minQty: 5, percentBp: 500 }] });
    const coll = await makeProduct({ name: 'D collection', isCollection: true, price: 0 });
    await makeProduct({ name: 'D1', parentId: coll, price: 300, stock: 4 });
    await makeProduct({ name: 'D2', parentId: coll, price: 200, stock: 1 });
    await makeProduct({ name: 'hidden', isActive: false, stock: 5 });

    const all = await listProducts({ storeId: 1 });
    expect(all.items.map((i) => i.name)).toEqual(['A in stock', 'C unlimited', 'D collection', 'B sold out']);
    const d = all.items.find((i) => i.id === coll)!;
    expect(d).toMatchObject({ isCollection: true, variantCount: 2, stock: 5, price: 200 });
    expect((await listProducts({ storeId: 1, sort: 'available' })).total).toBe(3);
    expect((await listProducts({ storeId: 1, sort: 'soldout' })).items.map((i) => i.id)).toEqual([b]);
    expect((await listProducts({ storeId: 1, sort: 'promo' })).items.map((i) => i.id)).toEqual([c]);
    const variants = await listProducts({ storeId: 1, parentId: coll });
    expect(variants.items.map((i) => i.name)).toEqual(['D1', 'D2']);
    const paged = await listProducts({ storeId: 1, pageSize: 2, page: 2 });
    expect(paged).toMatchObject({ page: 2, totalPages: 2, total: 4 });
    expect(paged.items).toHaveLength(2);

    const detail = await getProduct(c);
    expect(detail).toMatchObject({ stock: null, hasPromo: true, discounts: [{ minQty: 5, percentBp: 500 }] });
    const v = (await listProducts({ storeId: 1, parentId: coll })).items[0]!;
    expect((await getProduct(v.id))?.parentName).toBe('D collection');
    expect(await availableStock(coll)).toBe(5);
    expect(a).toBeGreaterThan(0);
  });
});

test('order rows reference correct snapshot', async () => {
  const u = await makeUser({ balance: 1000 });
  const p = await makeProduct({ price: 100, stock: 1, name: 'Snap' });
  const { order } = await purchaseWithBalance({ storeId: 1, userId: u, productId: p, quantity: 1 });
  const [row] = await getDb().select().from(orders).where(eq(orders.id, order.id));
  expect(row!.productName).toBe('Snap');
});

test('OrderSummary and OrderDetail include storeId', async () => {
  const u = await makeUser({ balance: 500 });
  const p = await makeProduct({ price: 100, stock: 3 });
  const { order } = await purchaseWithBalance({ storeId: 1, userId: u, productId: p, quantity: 1 });
  expect(order.storeId).toBe(1);
  const list = await listUserOrders(u);
  expect(list.items[0]!.storeId).toBe(1);
});

test('listUserOrders with storeId filters to that store only', async () => {
  const u = await makeUser({ balance: 5000 });
  const p1 = await makeProduct({ price: 100, stock: 5 });
  await purchaseWithBalance({ storeId: 1, userId: u, productId: p1, quantity: 1 });
  await purchaseWithBalance({ storeId: 1, userId: u, productId: p1, quantity: 1 });
  const all = await listUserOrders(u);
  expect(all.total).toBe(2);
  const store1 = await listUserOrders(u, 1, 10, 1);
  expect(store1.total).toBe(2);
  const store999 = await listUserOrders(u, 1, 10, 999);
  expect(store999.total).toBe(0);
  expect(store999.items).toHaveLength(0);
});

test('quoting a product from another store returns NOT_FOUND', async () => {
  const u = await makeUser();
  const p = await makeProduct({ price: 100, stock: 3 });
  const q = await quote({ storeId: 1, userId: u, productId: p, quantity: 1 });
  expect(q.total).toBe(100);
  await expectCode(quote({ storeId: 999, userId: u, productId: p, quantity: 1 }), 'NOT_FOUND');
});

test('voucher from another store is rejected', async () => {
  await getDb().insert(stores).values({ id: 2, slug: 'other-store', name: 'Other', botToken: 'tok-other' }).onConflictDoNothing();
  const u = await makeUser({ balance: 5000 });
  const p1 = await makeProduct({ price: 1000, stock: 5 });
  const [p2row] = await getDb()
    .insert(products)
    .values({ storeId: 2, code: 'S2-PROD', name: 'Store2 product', price: 1000, unlimited: false, isCollection: false, isActive: true })
    .returning();
  const s2Items = Array.from({ length: 5 }, (_, i) => ({ productId: p2row!.id, content: `s2-item-${i}` }));
  await getDb().insert(stockItems).values(s2Items);
  await makeVoucher({ code: 'STORE1ONLY', kind: 'percent', value: 5000 });
  const q = await quote({ storeId: 1, userId: u, productId: p1, quantity: 1, voucherCode: 'STORE1ONLY' });
  expect(q.voucherDiscount).toBe(500);
  await expectCode(quote({ storeId: 2, userId: u, productId: p2row!.id, quantity: 1, voucherCode: 'STORE1ONLY' }), 'VOUCHER_INVALID');
});

test('isUserInStore returns true after purchase, false for unknown store', async () => {
  const u = await makeUser({ balance: 500 });
  const p = await makeProduct({ price: 100, stock: 1 });
  expect(await isUserInStore(u, 1)).toBe(false);
  await purchaseWithBalance({ storeId: 1, userId: u, productId: p, quantity: 1 });
  expect(await isUserInStore(u, 1)).toBe(true);
  expect(await isUserInStore(u, 999)).toBe(false);
});
