import { describe, expect, mock, test } from 'bun:test';
import { CoreError, type OrderDetail, type OrderSummary, type ProductDetail, type SettleResult, type UserProfile } from '@tokobun/core';
import { WebhookError } from '@tokobun/payments';
import { createApp, type ApiDeps } from '../src/app';

const user: UserProfile = {
  id: 7,
  username: 'reseller',
  firstName: 'Res',
  language: 'en',
  currency: 'USD',
  tzOffsetMinutes: 0,
  balance: 1000,
  referralCode: 'R1',
  notifyStock: true,
  notifyInfo: true,
  notifyReferral: true,
  isBanned: false,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

const product: ProductDetail = {
  id: 3,
  storeId: 1,
  code: 'NFX',
  name: 'Netflix',
  icon: null,
  customEmojiId: null,
  price: 250,
  isCollection: false,
  variantCount: 0,
  stock: 5,
  hasPromo: false,
  parentId: null,
  parentName: null,
  warranty: null,
  note: null,
  discounts: [],
  isActive: true,
};

const order: OrderDetail = {
  id: 1,
  storeId: 1,
  code: 'TB-AAA',
  productId: 3,
  productName: 'Netflix',
  quantity: 2,
  total: 500,
  status: 'completed',
  createdAt: new Date(),
  unitPrice: 250,
  subtotal: 500,
  discountAmount: 0,
  voucherDiscount: 0,
  paidWith: 'balance',
  items: ['a', 'b'],
  warranty: null,
  completedAt: new Date(),
};

const silent = { warn: () => {}, error: () => {}, info: () => {} };

function makeDeps(over: Partial<ApiDeps> = {}): ApiDeps {
  return {
    handleWebhook: async () => null,
    webhookAck: (p) => (p === 'tripay' ? { status: 200, body: { success: true }, contentType: 'json' } : { status: 200, body: 'OK', contentType: 'text' }),
    verifyApiKey: async (k) => (k === 'tb_live_good' ? { user, storeId: 1 } : k === 'tb_live_banned' ? { user: { ...user, isBanned: true }, storeId: 1 } : null),
    listProducts: async () => ({ items: [product], page: 1, totalPages: 1, total: 1 }),
    getProductByCode: async (c) => (c === 'NFX' ? product : null),
    purchaseWithBalance: async () => ({ order }),
    listUserOrders: async () => ({ items: [order], page: 1, totalPages: 1, total: 1 }),
    getOrderByCode: async (c, uid) => (c === 'TB-AAA' && uid === 7 ? order : null),
    log: silent,
    ...over,
  };
}

const auth = (k = 'tb_live_good') => ({ Authorization: `Bearer ${k}` });

describe('health', () => {
  test('GET /health returns ok when no healthCheck', async () => {
    const res = await createApp(makeDeps()).request('/health');
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  test('GET /health returns 503 when healthCheck fails', async () => {
    const res = await createApp(makeDeps({ healthCheck: async () => { throw new Error('db down'); } })).request('/health');
    expect(res.status).toBe(503);
    expect((await res.json()).ok).toBe(false);
  });

  test('GET /health returns ok when healthCheck passes', async () => {
    const res = await createApp(makeDeps({ healthCheck: async () => {} })).request('/health');
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  test('unknown route -> JSON 404', async () => {
    const res = await createApp(makeDeps()).request('/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'route not found' } });
  });
});

describe('reseller auth', () => {
  test('missing / invalid / banned keys', async () => {
    const app = createApp(makeDeps());
    let res = await app.request('/v1/me');
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('UNAUTHORIZED');
    res = await app.request('/v1/me', { headers: auth('tb_live_bad') });
    expect(res.status).toBe(401);
    res = await app.request('/v1/me', { headers: auth('tb_live_banned') });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('USER_BANNED');
  });

  test('GET /v1/me', async () => {
    const res = await createApp(makeDeps()).request('/v1/me', { headers: auth() });
    expect(res.status).toBe(200);
    expect((await res.json()).user).toMatchObject({ id: 7, balance: 1000, currency: 'USD' });
    expect(res.headers.get('x-ratelimit-limit')).toBe('60');
  });

  test('v1 responses include Cache-Control, Vary and CORS headers', async () => {
    const res = await createApp(makeDeps()).request('/v1/me', { headers: auth() });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('vary')).toBe('Authorization');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  test('v1 OPTIONS preflight returns 204 with CORS headers', async () => {
    const res = await createApp(makeDeps()).request('/v1/me', { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toContain('GET');
    expect(res.headers.get('access-control-allow-headers')).toContain('Authorization');
  });

  test('CORS headers absent on non-v1 routes', async () => {
    const res = await createApp(makeDeps()).request('/health');
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  test('rate limit per key -> 429 with Retry-After', async () => {
    const app = createApp(makeDeps({ rateLimit: { limit: 2, windowMs: 60_000 } }));
    expect((await app.request('/v1/me', { headers: auth() })).status).toBe(200);
    expect((await app.request('/v1/me', { headers: auth() })).status).toBe(200);
    const res = await app.request('/v1/me', { headers: auth() });
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBeTruthy();
    expect((await res.json()).error.code).toBe('RATE_LIMITED');
    // another key has its own bucket
    expect((await app.request('/v1/me', { headers: auth('tb_live_bad') })).status).toBe(401);
  });
});

describe('reseller endpoints', () => {
  test('products list + detail', async () => {
    const app = createApp(makeDeps());
    const list = await app.request('/v1/products?page=1&sort=available', { headers: auth() });
    expect(list.status).toBe(200);
    const listBody = await list.json();
    expect(listBody.items[0].code).toBe('NFX');
    expect(listBody.currency).toBe('USD');
    expect((await app.request('/v1/products?sort=weird', { headers: auth() })).status).toBe(400);
    const one = await app.request('/v1/products/NFX', { headers: auth() });
    expect((await one.json()).product.id).toBe(3);
    expect((await app.request('/v1/products/NOPE', { headers: auth() })).status).toBe(404);
  });

  test('products list passes clamped page/pageSize to listProducts', async () => {
    const listProducts = mock(async (opts: { storeId: number; page?: number; pageSize?: number; sort?: string; parentId?: number | null }) => ({
      items: [product], page: opts.page ?? 1, totalPages: 1, total: 1,
    }));
    const app = createApp(makeDeps({ listProducts }));

    await app.request('/v1/products?page=0&pageSize=200', { headers: auth() });
    expect(listProducts).toHaveBeenCalledWith({ storeId: 1, page: 1, pageSize: 100, sort: 'all', parentId: null });

    listProducts.mockClear();
    await app.request('/v1/products?page=abc&pageSize=abc', { headers: auth() });
    expect(listProducts).toHaveBeenCalledWith({ storeId: 1, page: 1, pageSize: 50, sort: 'all', parentId: null });

    listProducts.mockClear();
    await app.request('/v1/products?page=3&pageSize=10', { headers: auth() });
    expect(listProducts).toHaveBeenCalledWith({ storeId: 1, page: 3, pageSize: 10, sort: 'all', parentId: null });
  });

  test('products list with collection filter: inactive/non-collection/oversized', async () => {
    const inactiveCol: ProductDetail = { ...product, code: 'COL', isCollection: true, isActive: false };
    const nonCol: ProductDetail = { ...product, code: 'ITEM', isCollection: false };
    const app = createApp(makeDeps({
      getProductByCode: async (c) => c === 'COL' ? inactiveCol : c === 'ITEM' ? nonCol : null,
    }));
    expect((await app.request('/v1/products?collection=COL', { headers: auth() })).status).toBe(404);
    expect((await app.request('/v1/products?collection=ITEM', { headers: auth() })).status).toBe(404);
    expect((await app.request('/v1/products?collection=NOPE', { headers: auth() })).status).toBe(404);
    const longCol = 'A'.repeat(65);
    expect((await app.request(`/v1/products?collection=${longCol}`, { headers: auth() })).status).toBe(404);
  });

  test('product detail for a collection includes variants', async () => {
    const col: ProductDetail = { ...product, code: 'COL', isCollection: true, variantCount: 2 };
    const variant1 = { ...product, id: 10, code: 'V1', parentId: col.id };
    const variant2 = { ...product, id: 11, code: 'V2', parentId: col.id };
    const listProducts = mock(async () => ({ items: [variant1, variant2], page: 1, totalPages: 1, total: 2 }));
    const app = createApp(makeDeps({
      getProductByCode: async (c) => c === 'COL' ? col : null,
      listProducts,
    }));
    const res = await app.request('/v1/products/COL', { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.product.code).toBe('COL');
    expect(body.variants).toHaveLength(2);
    expect(body.currency).toBe('USD');
    expect(listProducts).toHaveBeenCalledWith({ storeId: 1, parentId: col.id, pageSize: 100, sort: 'all' });
  });

  test('product detail for inactive product returns 404', async () => {
    const inactive: ProductDetail = { ...product, isActive: false };
    const app = createApp(makeDeps({ getProductByCode: async () => inactive }));
    const res = await app.request('/v1/products/NFX', { headers: auth() });
    expect(res.status).toBe(404);
  });

  test('product detail for non-collection omits variants key', async () => {
    const app = createApp(makeDeps());
    const res = await app.request('/v1/products/NFX', { headers: auth() });
    const body = await res.json();
    expect(body.variants).toBeUndefined();
  });

  test('POST /v1/orders buys with balance', async () => {
    const purchase = mock(async () => ({ order }));
    const onApiPurchase = mock(async () => {});
    const app = createApp(makeDeps({ purchaseWithBalance: purchase, onApiPurchase }));
    const res = await app.request('/v1/orders', {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ productCode: 'NFX', quantity: 2, voucherCode: ' HEMAT ' }),
    });
    expect(res.status).toBe(201);
    expect((await res.json()).order.items).toEqual(['a', 'b']);
    expect(purchase).toHaveBeenCalledWith({ storeId: 1, userId: 7, productId: 3, quantity: 2, voucherCode: 'HEMAT' });
    await Bun.sleep(0);
    expect(onApiPurchase).toHaveBeenCalledTimes(1);
  });

  test('POST /v1/orders validation', async () => {
    const app = createApp(makeDeps());
    const post = (body: string) => app.request('/v1/orders', { method: 'POST', headers: { ...auth(), 'content-type': 'application/json' }, body });
    expect((await post('nope')).status).toBe(400);
    expect((await post(JSON.stringify({ quantity: 1 }))).status).toBe(400);
    expect((await post(JSON.stringify({ productCode: 'NFX', quantity: 0 }))).status).toBe(422);
    expect((await post(JSON.stringify({ productCode: 'NFX', quantity: 10000 }))).status).toBe(422);
    expect((await post(JSON.stringify({ productCode: 'NOPE', quantity: 1 }))).status).toBe(404);
  });

  test('POST /v1/orders rejects whitespace-only productCode', async () => {
    const app = createApp(makeDeps());
    const post = (body: object) => app.request('/v1/orders', { method: 'POST', headers: { ...auth(), 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const res = await post({ productCode: '   ', quantity: 1 });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_INPUT');
  });

  test('POST /v1/orders rejects non-string voucherCode', async () => {
    const app = createApp(makeDeps());
    const post = (body: object) => app.request('/v1/orders', { method: 'POST', headers: { ...auth(), 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const res = await post({ productCode: 'NFX', quantity: 1, voucherCode: 123 });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_INPUT');
  });

  test('POST /v1/orders rejects non-integer quantity', async () => {
    const app = createApp(makeDeps());
    const post = (body: object) => app.request('/v1/orders', { method: 'POST', headers: { ...auth(), 'content-type': 'application/json' }, body: JSON.stringify(body) });
    expect((await post({ productCode: 'NFX', quantity: 2.5 })).status).toBe(422);
    expect((await post({ productCode: 'NFX', quantity: 'abc' })).status).toBe(422);
    expect((await post({ productCode: 'NFX', quantity: null })).status).toBe(422);
  });

  test('POST /v1/orders rejects collection product', async () => {
    const col: ProductDetail = { ...product, isCollection: true };
    const app = createApp(makeDeps({ getProductByCode: async () => col }));
    const res = await app.request('/v1/orders', {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ productCode: 'NFX', quantity: 1 }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain('collection');
  });

  test('POST /v1/orders with null voucherCode sends null to purchaseWithBalance', async () => {
    const purchase = mock(async () => ({ order }));
    const app = createApp(makeDeps({ purchaseWithBalance: purchase }));
    await app.request('/v1/orders', {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ productCode: 'NFX', quantity: 1 }),
    });
    expect((purchase.mock.calls[0] as unknown as [{ voucherCode: string | null }])[0].voucherCode).toBeNull();
  });

  test('POST /v1/orders without onApiPurchase does not crash', async () => {
    const app = createApp(makeDeps({ onApiPurchase: undefined }));
    const res = await app.request('/v1/orders', {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ productCode: 'NFX', quantity: 1 }),
    });
    expect(res.status).toBe(201);
  });

  test('CoreError codes map to HTTP statuses', async () => {
    const cases: [CoreError['code'], number][] = [
      ['INSUFFICIENT_BALANCE', 402],
      ['OUT_OF_STOCK', 409],
      ['VOUCHER_EXPIRED', 422],
      ['USER_BANNED', 403],
      ['NOT_FOUND', 404],
      ['INVALID_INPUT', 400],
    ];
    for (const [code, status] of cases) {
      const app = createApp(
        makeDeps({
          purchaseWithBalance: async () => {
            throw new CoreError(code, `boom ${code}`, { x: 1 });
          },
        }),
      );
      const res = await app.request('/v1/orders', {
        method: 'POST',
        headers: { ...auth(), 'content-type': 'application/json' },
        body: JSON.stringify({ productCode: 'NFX', quantity: 1 }),
      });
      expect(res.status).toBe(status);
      expect(await res.json()).toEqual({ error: { code, message: `boom ${code}`, meta: { x: 1 } } });
    }
  });

  test('unexpected errors -> 500 INTERNAL without leaking details', async () => {
    const app = createApp(makeDeps({ listUserOrders: async () => Promise.reject(new Error('db password wrong')) }));
    const res = await app.request('/v1/orders', { headers: auth() });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: 'INTERNAL', message: 'internal server error' } });
  });

  test('orders list + by code (owner only)', async () => {
    const app = createApp(makeDeps());
    expect((await (await app.request('/v1/orders', { headers: auth() })).json()).total).toBe(1);
    expect((await app.request('/v1/orders/TB-AAA', { headers: auth() })).status).toBe(200);
    expect((await app.request('/v1/orders/TB-ZZZ', { headers: auth() })).status).toBe(404);
  });

  test('cross-store product lookup returns 404', async () => {
    const otherStoreProduct: ProductDetail = { ...product, storeId: 99 };
    const app = createApp(makeDeps({ getProductByCode: async (c) => (c === 'NFX' ? otherStoreProduct : null) }));
    const res = await app.request('/v1/products/NFX', { headers: auth() });
    expect(res.status).toBe(404);
  });

  test('cross-store order detail returns 404', async () => {
    const otherStoreOrder: OrderDetail = { ...order, storeId: 99 };
    const app = createApp(makeDeps({ getOrderByCode: async (c, uid) => (c === 'TB-AAA' && uid === 7 ? otherStoreOrder : null) }));
    const res = await app.request('/v1/orders/TB-AAA', { headers: auth() });
    expect(res.status).toBe(404);
  });

  test('order listing passes storeId for server-side filtering', async () => {
    const listUserOrders = mock(async (_uid: number, _page?: number, _pageSize?: number, _storeId?: number) => ({
      items: [{ id: 1, storeId: 1, code: 'TB-AAA', productId: 3, productName: 'A', quantity: 1, total: 100, status: 'completed' as const, createdAt: new Date() }],
      page: 1,
      totalPages: 1,
      total: 1,
    }));
    const app = createApp(makeDeps({ listUserOrders }));
    const res = await app.request('/v1/orders', { headers: auth() });
    expect(res.status).toBe(200);
    expect(listUserOrders).toHaveBeenCalledWith(7, 1, 20, 1);
  });

  test('cross-store collection lookup returns 404', async () => {
    const otherStoreCol: ProductDetail = { ...product, storeId: 99, isCollection: true };
    const app = createApp(makeDeps({ getProductByCode: async (c) => (c === 'COL' ? otherStoreCol : null) }));
    const res = await app.request('/v1/products?collection=COL', { headers: auth() });
    expect(res.status).toBe(404);
  });

  test('cross-store product purchase returns 404', async () => {
    const otherStoreProduct: ProductDetail = { ...product, storeId: 99 };
    const app = createApp(makeDeps({ getProductByCode: async (c) => (c === 'NFX' ? otherStoreProduct : null) }));
    const res = await app.request('/v1/orders', {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ productCode: 'NFX', quantity: 1 }),
    });
    expect(res.status).toBe(404);
  });

  test('rejects oversized productCode, voucherCode, and route params', async () => {
    const app = createApp(makeDeps());
    const long = 'A'.repeat(65);
    const post = (body: object) => app.request('/v1/orders', { method: 'POST', headers: { ...auth(), 'content-type': 'application/json' }, body: JSON.stringify(body) });
    expect((await post({ productCode: long, quantity: 1 })).status).toBe(400);
    expect((await post({ productCode: 'NFX', quantity: 1, voucherCode: long })).status).toBe(400);
    expect((await app.request(`/v1/products/${long}`, { headers: auth() })).status).toBe(404);
    expect((await app.request(`/v1/orders/${long}`, { headers: auth() })).status).toBe(404);
  });
});

describe('webhooks', () => {
  const settled: SettleResult = { storeId: 1, paymentId: 5, alreadySettled: false, purpose: 'topup', userId: 7, credited: 500, order: null, referral: null };

  test('passes the raw body + headers through and acks per provider; notifies once', async () => {
    let seen: { provider: string; rawBody: string; sig: string | null } | null = null;
    const onSettled = mock(async () => {});
    const app = createApp(
      makeDeps({
        handleWebhook: async (provider, req) => {
          seen = { provider, rawBody: req.rawBody, sig: req.headers.get('x-callback-signature') };
          return settled;
        },
        onSettled,
      }),
    );
    const raw = '{"reference":"T1",  "status":"PAID"}';
    const res = await app.request('/webhooks/tripay', { method: 'POST', body: raw, headers: { 'X-Callback-Signature': 'abc' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(seen!).toEqual({ provider: 'tripay', rawBody: raw, sig: 'abc' });
    await Bun.sleep(0);
    expect(onSettled).toHaveBeenCalledTimes(1);

    const res2 = await app.request('/webhooks/cryptobot', { method: 'POST', body: '{}' });
    expect(await res2.text()).toBe('OK');
  });

  test('alreadySettled results are not re-notified', async () => {
    const onSettled = mock(async () => {});
    const app = createApp(makeDeps({ handleWebhook: async () => ({ ...settled, alreadySettled: true }), onSettled }));
    await app.request('/webhooks/tripay', { method: 'POST', body: '{}' });
    await Bun.sleep(0);
    expect(onSettled).toHaveBeenCalledTimes(0);
  });

  test('rejects oversized webhook body', async () => {
    const app = createApp(makeDeps());
    const res = await app.request('/webhooks/tripay', {
      method: 'POST',
      body: '{}',
      headers: { 'Content-Length': '2000000' },
    });
    expect(res.status).toBe(413);
  });

  test('bad signature -> 401, unknown provider -> 404, failures -> 500', async () => {
    const app = createApp(
      makeDeps({
        handleWebhook: async (p) => {
          if (p === 'tripay') throw new WebhookError(401, 'invalid webhook signature');
          if (p === 'nope') throw new WebhookError(404, 'unknown provider');
          throw new Error('db down');
        },
      }),
    );
    const r1 = await app.request('/webhooks/tripay', { method: 'POST', body: '{}' });
    expect(r1.status).toBe(401);
    expect((await r1.json()).error.code).toBe('INVALID_SIGNATURE');
    expect((await app.request('/webhooks/nope', { method: 'POST', body: '{}' })).status).toBe(404);
    expect((await app.request('/webhooks/cryptobot', { method: 'POST', body: '{}' })).status).toBe(500);
  });

  test('WebhookError with status 400 maps to BAD_REQUEST code', async () => {
    const app = createApp(makeDeps({
      handleWebhook: async () => { throw new WebhookError(400, 'malformed payload'); },
    }));
    const res = await app.request('/webhooks/tripay', { method: 'POST', body: '{}' });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('BAD_REQUEST');
  });

  test('null webhook result still acks provider', async () => {
    const onSettled = mock(async () => {});
    const app = createApp(makeDeps({ handleWebhook: async () => null, onSettled }));
    const res = await app.request('/webhooks/tripay', { method: 'POST', body: '{}' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    await Bun.sleep(0);
    expect(onSettled).not.toHaveBeenCalled();
  });

  test('onSettled error does not affect the response', async () => {
    const settled: SettleResult = { storeId: 1, paymentId: 5, alreadySettled: false, purpose: 'topup', userId: 7, credited: 500, order: null, referral: null };
    const app = createApp(makeDeps({
      handleWebhook: async () => settled,
      onSettled: async () => { throw new Error('notify crash'); },
    }));
    const res = await app.request('/webhooks/tripay', { method: 'POST', body: '{}' });
    expect(res.status).toBe(200);
  });

  test('webhook without content-length header processes normally', async () => {
    const app = createApp(makeDeps());
    const res = await app.request('/webhooks/tripay', { method: 'POST', body: '{"status":"PAID"}' });
    expect(res.status).toBe(200);
  });
});

describe('auth edge cases', () => {
  test('Bearer is case-insensitive', async () => {
    const app = createApp(makeDeps());
    const res = await app.request('/v1/me', { headers: { Authorization: 'bearer tb_live_good' } });
    expect(res.status).toBe(200);
  });

  test('non-Bearer auth scheme is rejected', async () => {
    const app = createApp(makeDeps());
    const res = await app.request('/v1/me', { headers: { Authorization: 'Basic dXNlcjpwYXNz' } });
    expect(res.status).toBe(401);
  });

  test('publicUser returns displayCurrency from user profile', async () => {
    const idrUser: UserProfile = { ...user, currency: 'IDR' };
    const app = createApp(makeDeps({ verifyApiKey: async (k) => k === 'tb_live_good' ? { user: idrUser, storeId: 1 } : null }));
    const res = await app.request('/v1/me', { headers: auth() });
    const body = await res.json();
    expect(body.user.currency).toBe('USD');
    expect(body.user.displayCurrency).toBe('IDR');
    expect(body.user.language).toBe('en');
  });

  test('publicUser does not leak sensitive fields', async () => {
    const app = createApp(makeDeps());
    const res = await app.request('/v1/me', { headers: auth() });
    const body = await res.json();
    expect(body.user.referralCode).toBeUndefined();
    expect(body.user.isBanned).toBeUndefined();
    expect(body.user.notifyStock).toBeUndefined();
    expect(body.user.tzOffsetMinutes).toBeUndefined();
  });
});

describe('webhook edge cases', () => {
  test('non-numeric content-length is not rejected', async () => {
    const app = createApp(makeDeps());
    const res = await app.request('/webhooks/tripay', {
      method: 'POST',
      body: '{}',
      headers: { 'Content-Length': 'abc' },
    });
    expect(res.status).toBe(200);
  });

  test('content-length exactly at limit is accepted', async () => {
    const app = createApp(makeDeps());
    const res = await app.request('/webhooks/tripay', {
      method: 'POST',
      body: '{}',
      headers: { 'Content-Length': '1000000' },
    });
    expect(res.status).toBe(200);
  });

  test('content-length just over limit is rejected', async () => {
    const app = createApp(makeDeps());
    const res = await app.request('/webhooks/tripay', {
      method: 'POST',
      body: '{}',
      headers: { 'Content-Length': '1000001' },
    });
    expect(res.status).toBe(413);
  });

  test('webhook without onSettled defined still processes', async () => {
    const settled: SettleResult = { storeId: 1, paymentId: 5, alreadySettled: false, purpose: 'topup', userId: 7, credited: 500, order: null, referral: null };
    const app = createApp(makeDeps({ handleWebhook: async () => settled, onSettled: undefined }));
    const res = await app.request('/webhooks/tripay', { method: 'POST', body: '{}' });
    expect(res.status).toBe(200);
  });
});

describe('product code edge cases', () => {
  test('product code exactly 64 chars is accepted', async () => {
    const longCode = 'A'.repeat(64);
    const app = createApp(makeDeps({ getProductByCode: async (c) => c === longCode ? product : null }));
    const res = await app.request(`/v1/products/${longCode}`, { headers: auth() });
    expect(res.status).toBe(200);
  });

  test('order code exactly 64 chars is accepted', async () => {
    const longCode = 'A'.repeat(64);
    const app = createApp(makeDeps({ getOrderByCode: async (c, uid) => c === longCode && uid === 7 ? order : null }));
    const res = await app.request(`/v1/orders/${longCode}`, { headers: auth() });
    expect(res.status).toBe(200);
  });
});

describe('orders pagination', () => {
  test('orders list clamps page and pageSize', async () => {
    const listUserOrders = mock(async (_uid: number, _page?: number, _pageSize?: number, _storeId?: number) => ({
      items: [] as OrderSummary[], page: 1, totalPages: 0, total: 0,
    }));
    const app = createApp(makeDeps({ listUserOrders }));

    await app.request('/v1/orders?page=0&pageSize=0', { headers: auth() });
    expect(listUserOrders).toHaveBeenCalledWith(7, 1, 1, 1);

    listUserOrders.mockClear();
    await app.request('/v1/orders?page=999&pageSize=200', { headers: auth() });
    expect(listUserOrders).toHaveBeenCalledWith(7, 999, 100, 1);

    listUserOrders.mockClear();
    await app.request('/v1/orders?page=abc&pageSize=xyz', { headers: auth() });
    expect(listUserOrders).toHaveBeenCalledWith(7, 1, 20, 1);
  });
});
