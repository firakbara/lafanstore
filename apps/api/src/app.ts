// Hono app: health, payment webhooks, reseller API (/v1). All external functions come in through
// `deps`, so tests can build the app without a database.
import type {
  CatalogSort,
  OrderDetail,
  OrderSummary,
  Paged,
  ProductDetail,
  ProductPage,
  PurchaseResult,
  SettleResult,
  UserProfile,
} from '@tokobun/core';
import { Hono, type Context } from 'hono';
import { asCoreError, asWebhookError, CORE_ERROR_STATUS, errorBody } from './errors';
import { createRateLimiter } from './ratelimit';

export interface ApiDeps {
  // payments
  handleWebhook(provider: string, req: { headers: Headers; rawBody: string }): Promise<SettleResult | null>;
  webhookAck(provider: string): { status: number; body: unknown; contentType: 'json' | 'text' };
  // core
  verifyApiKey(key: string): Promise<{ user: UserProfile; storeId: number } | null>;
  listProducts(opts: { storeId: number; page?: number; pageSize?: number; sort?: CatalogSort; parentId?: number | null }): Promise<ProductPage>;
  getProductByCode(code: string): Promise<ProductDetail | null>;
  purchaseWithBalance(input: { storeId: number; userId: number; productId: number; quantity: number; voucherCode?: string | null }): Promise<PurchaseResult>;
  listUserOrders(userId: number, page?: number, pageSize?: number, storeId?: number): Promise<Paged<OrderSummary>>;
  getOrderByCode(code: string, userId: number | null): Promise<OrderDetail | null>;
  // side effects (optional)
  onSettled?(result: SettleResult): Promise<void>;
  onApiPurchase?(order: OrderDetail, user: UserProfile): Promise<void>;
  healthCheck?(): Promise<void>;
  rateLimit?: { limit: number; windowMs: number };
  log?: Pick<Console, 'warn' | 'error' | 'info'>;
}

type Env = { Variables: { user: UserProfile; storeId: number } };

const SORTS: CatalogSort[] = ['all', 'available', 'soldout', 'promo'];

function intParam(v: string | undefined, dflt: number, min: number, max: number): number {
  if (v === undefined || v === '') return dflt;
  const n = Number(v);
  if (!Number.isInteger(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

function publicUser(u: UserProfile) {
  return {
    id: u.id,
    username: u.username,
    firstName: u.firstName,
    balance: u.balance,
    currency: 'USD',
    displayCurrency: u.currency,
    language: u.language,
    createdAt: u.createdAt,
  };
}

export function createApp(deps: ApiDeps) {
  const log = deps.log ?? console;
  const limiter = createRateLimiter(deps.rateLimit ?? { limit: 60, windowMs: 60_000 });
  const app = new Hono<Env>();

  app.onError((err, c) => {
    const ce = asCoreError(err);
    if (ce) return c.json(errorBody(ce.code, ce.message, ce.meta), CORE_ERROR_STATUS[ce.code]);
    log.error('[api] unhandled error:', err);
    return c.json(errorBody('INTERNAL', 'internal server error'), 500);
  });
  app.notFound((c) => c.json(errorBody('NOT_FOUND', 'route not found'), 404));

  app.get('/health', async (c) => {
    try {
      await deps.healthCheck?.();
      return c.json({ ok: true, time: new Date().toISOString() });
    } catch {
      return c.json({ ok: false, time: new Date().toISOString() }, 503);
    }
  });

  // ---------- payment webhooks ----------
  const MAX_WEBHOOK_BYTES = 1_000_000;
  app.post('/webhooks/:provider', async (c) => {
    const cl = c.req.header('content-length');
    if (cl && Number(cl) > MAX_WEBHOOK_BYTES) return c.json(errorBody('BAD_REQUEST', 'payload too large'), 413);
    const provider = c.req.param('provider');
    const rawBody = await c.req.text();
    let result: SettleResult | null;
    try {
      result = await deps.handleWebhook(provider, { headers: c.req.raw.headers, rawBody });
    } catch (err) {
      const we = asWebhookError(err);
      if (we) {
        log.warn(`[webhook:${provider}] rejected (${we.status}): ${we.message}`);
        return c.json({ success: false, ...errorBody(we.status === 401 ? 'INVALID_SIGNATURE' : we.status === 404 ? 'NOT_FOUND' : 'BAD_REQUEST', we.message) }, we.status);
      }
      log.error(`[webhook:${provider}] processing failed:`, err);
      return c.json({ success: false, ...errorBody('INTERNAL', 'processing failed') }, 500); // provider retries
    }
    if (result && !result.alreadySettled && deps.onSettled) {
      // respond to the gateway right away; Telegram notifications happen in the background
      const r = result;
      queueMicrotask(() => void deps.onSettled!(r).catch((e: unknown) => log.error('[webhook] notify failed:', e)));
    }
    const ack = deps.webhookAck(provider);
    return ack.contentType === 'json'
      ? c.json(ack.body as object, ack.status as 200)
      : c.text(String(ack.body), ack.status as 200);
  });

  // ---------- reseller API ----------
  const v1 = new Hono<Env>();

  v1.options('*', (c) => {
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    c.header('Access-Control-Max-Age', '86400');
    return c.body(null, 204);
  });

  v1.use('*', async (c, next) => {
    const auth = c.req.header('authorization') ?? '';
    const m = /^Bearer\s+(\S+)$/i.exec(auth);
    if (!m) return c.json(errorBody('UNAUTHORIZED', 'missing Authorization: Bearer <api key>'), 401);
    const key = m[1]!;
    const rl = limiter.hit(key);
    c.header('X-RateLimit-Limit', String(limiter.limit));
    c.header('X-RateLimit-Remaining', String(rl.remaining));
    c.header('X-RateLimit-Reset', String(Math.ceil(rl.resetAt / 1000)));
    if (!rl.allowed) {
      c.header('Retry-After', String(rl.retryAfterSec));
      return c.json(errorBody('RATE_LIMITED', 'too many requests'), 429);
    }
    const result = await deps.verifyApiKey(key);
    if (!result) return c.json(errorBody('UNAUTHORIZED', 'invalid or revoked API key'), 401);
    if (result.user.isBanned) return c.json(errorBody('USER_BANNED', 'account is banned'), 403);
    c.set('user', result.user);
    c.set('storeId', result.storeId);
    await next();
    c.header('Cache-Control', 'no-store');
    c.header('Vary', 'Authorization');
    c.header('Access-Control-Allow-Origin', '*');
  });

  v1.get('/me', (c) => c.json({ user: publicUser(c.get('user')) }));

  v1.get('/products', async (c) => {
    const page = intParam(c.req.query('page'), 1, 1, 100_000);
    const pageSize = intParam(c.req.query('pageSize'), 50, 1, 100);
    const sortQ = c.req.query('sort') as CatalogSort | undefined;
    if (sortQ && !SORTS.includes(sortQ)) return c.json(errorBody('INVALID_INPUT', `sort must be one of ${SORTS.join(', ')}`), 400);
    let parentId: number | null = null;
    const parent = c.req.query('collection');
    if (parent && parent.length > 64) return c.json(errorBody('NOT_FOUND', 'collection not found'), 404);
    if (parent) {
      const col = await deps.getProductByCode(parent);
      if (!col || !col.isCollection || !col.isActive || col.storeId !== c.get('storeId')) return c.json(errorBody('NOT_FOUND', 'collection not found'), 404);
      parentId = col.id;
    }
    const result = await deps.listProducts({ storeId: c.get('storeId'), page, pageSize, sort: sortQ ?? 'all', parentId });
    return c.json({ currency: 'USD', ...result });
  });

  v1.get('/products/:code', async (c) => {
    const code = c.req.param('code');
    if (code.length > 64) return c.json(errorBody('NOT_FOUND', 'product not found'), 404);
    const p = await deps.getProductByCode(code);
    if (!p || !p.isActive || p.storeId !== c.get('storeId')) return c.json(errorBody('NOT_FOUND', 'product not found'), 404);
    let variants: ProductPage['items'] | undefined;
    if (p.isCollection) variants = (await deps.listProducts({ storeId: c.get('storeId'), parentId: p.id, pageSize: 100, sort: 'all' })).items;
    return c.json({ currency: 'USD', product: p, ...(variants ? { variants } : {}) });
  });

  v1.post('/orders', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(errorBody('INVALID_INPUT', 'body must be JSON'), 400);
    }
    const b = (body ?? {}) as { productCode?: unknown; quantity?: unknown; voucherCode?: unknown };
    if (typeof b.productCode !== 'string' || !b.productCode.trim()) return c.json(errorBody('INVALID_INPUT', 'productCode is required'), 400);
    if (b.productCode.length > 64) return c.json(errorBody('INVALID_INPUT', 'productCode too long'), 400);
    if (typeof b.quantity !== 'number' || !Number.isInteger(b.quantity) || b.quantity < 1 || b.quantity > 9999) {
      return c.json(errorBody('INVALID_QUANTITY', 'quantity must be an integer between 1 and 9999'), 422);
    }
    if (b.voucherCode != null && typeof b.voucherCode !== 'string') return c.json(errorBody('INVALID_INPUT', 'voucherCode must be a string'), 400);
    if (typeof b.voucherCode === 'string' && b.voucherCode.length > 64) return c.json(errorBody('INVALID_INPUT', 'voucherCode too long'), 400);
    const user = c.get('user');
    const product = await deps.getProductByCode(b.productCode.trim());
    if (!product || product.storeId !== c.get('storeId')) return c.json(errorBody('NOT_FOUND', 'product not found'), 404);
    if (product.isCollection) return c.json(errorBody('INVALID_INPUT', 'this is a collection; order one of its variants'), 400);
    const { order } = await deps.purchaseWithBalance({
      storeId: c.get('storeId'),
      userId: user.id,
      productId: product.id,
      quantity: b.quantity,
      voucherCode: (b.voucherCode as string | undefined)?.trim() || null,
    });
    if (deps.onApiPurchase) {
      queueMicrotask(() => void deps.onApiPurchase!(order, user).catch((e: unknown) => log.error('[api] sale notify failed:', e)));
    }
    return c.json({ order }, 201);
  });

  v1.get('/orders', async (c) => {
    const page = intParam(c.req.query('page'), 1, 1, 100_000);
    const pageSize = intParam(c.req.query('pageSize'), 20, 1, 100);
    const result = await deps.listUserOrders(c.get('user').id, page, pageSize, c.get('storeId'));
    return c.json(result);
  });

  v1.get('/orders/:code', async (c) => {
    const code = c.req.param('code');
    if (code.length > 64) return c.json(errorBody('NOT_FOUND', 'order not found'), 404);
    const order = await deps.getOrderByCode(code, c.get('user').id);
    if (!order || order.storeId !== c.get('storeId')) return c.json(errorBody('NOT_FOUND', 'order not found'), 404);
    return c.json({ order });
  });

  app.route('/v1', v1);
  return app;
}

export type App = ReturnType<typeof createApp>;
export type { Context };
