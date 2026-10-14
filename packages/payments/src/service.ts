// Payment lifecycle. Pure orchestration over: a PaymentStore (DB), the provider adapters and a few core
// functions — all injected, so the logic is unit-testable without Postgres or network.
import { CoreError, type Cents, type OrderDetail, type PaymentStatus, type SettleResult, type StoreSettings } from '@tokobun/core';
import type { PaymentMethodInfo, PaymentView } from './index';
import { centsToPay, payToCents } from './money';
import type { PaymentProvider, ProviderMethod } from './providers/types';
import { newPaymentCode } from './signature';
import type { PaymentRow, PaymentStore } from './store';

/** Top-up invoice lifetime (spec). Providers may clamp to their own minimum (e.g. some VAs need 60 min). */
export const TOPUP_TTL_MINUTES = 15;

export interface PaymentsCore {
  getSettings(storeId: number): Promise<StoreSettings>;
  createPendingOrder(input: { storeId: number; userId: number; productId: number; quantity: number; voucherCode?: string | null }): Promise<OrderDetail>;
  cancelPendingOrder(orderId: number): Promise<boolean>;
  settlePayment(paymentId: number): Promise<SettleResult>;
}

export interface PaymentsDeps {
  store: PaymentStore;
  providers: PaymentProvider[] | (() => PaymentProvider[]);
  core: PaymentsCore;
  /** Our public webhook URL for a provider (sent as callback_url where supported), or null. */
  webhookUrl?: (provider: string) => string | null;
  now?: () => Date;
  log?: Pick<Console, 'warn' | 'error'>;
}

/** Thrown by handleWebhook. `status` is the HTTP status the API should answer with. */
export class WebhookError extends Error {
  constructor(
    readonly status: 400 | 401 | 404,
    message: string,
  ) {
    super(message);
    this.name = 'WebhookError';
  }
}

export function toView(r: PaymentRow): PaymentView {
  return {
    id: r.id,
    code: r.code,
    status: r.status,
    purpose: r.purpose,
    provider: r.provider,
    method: r.method,
    amount: r.amount,
    fee: r.fee,
    payCurrency: r.payCurrency,
    payAmount: r.payAmount,
    checkoutUrl: r.checkoutUrl,
    qrString: r.qrString,
    expiresAt: r.expiresAt,
    orderId: r.orderId,
  };
}

export function createPayments(deps: PaymentsDeps) {
  const log = deps.log ?? console;
  const now = deps.now ?? (() => new Date());
  const allProviders = () => (typeof deps.providers === 'function' ? deps.providers() : deps.providers);
  const configured = () => allProviders().filter((p) => p.isConfigured());

  function requireProvider(name: string): PaymentProvider {
    const p = configured().find((x) => x.name === name);
    if (!p) throw new CoreError('INVALID_INPUT', `payment provider "${name}" is not available`, { provider: name });
    return p;
  }

  async function requireMethod(p: PaymentProvider, method: string): Promise<ProviderMethod> {
    const m = (await p.methods(null)).find((x) => x.method === method);
    if (!m) throw new CoreError('INVALID_INPUT', `payment method "${method}" is not available`, { provider: p.name, method });
    return m;
  }

  /** Min/max of a method in base cents (null when the fx rate for its currency is missing). */
  function limitsInCents(m: ProviderMethod, fx: Record<string, number>): { min: Cents; max: Cents | null } | null {
    try {
      return {
        min: m.minPay != null ? payToCents(m.minPay, m.payCurrency, fx, 'up') : 1,
        max: m.maxPay != null ? payToCents(m.maxPay, m.payCurrency, fx, 'down') : null,
      };
    } catch {
      return null;
    }
  }

  async function ownedRow(paymentId: number, userId: number): Promise<PaymentRow> {
    const r = await deps.store.getById(paymentId);
    if (!r || r.userId !== userId) throw new CoreError('NOT_FOUND', 'payment not found');
    return r;
  }

  async function closeAsFailed(r: PaymentRow, status: Exclude<PaymentStatus, 'pending' | 'paid'>): Promise<PaymentRow | null> {
    const updated = await deps.store.transitionFromPending(r.id, status);
    if (updated && updated.orderId !== null) {
      try {
        await deps.core.cancelPendingOrder(updated.orderId);
      } catch (err) {
        log.warn(`[payments] could not cancel order ${updated.orderId} of ${r.code}:`, (err as Error).message);
      }
    }
    return updated;
  }

  async function createInvoiceRow(input: {
    storeId: number;
    userId: number;
    purpose: 'topup' | 'order';
    amount: Cents;
    provider: PaymentProvider;
    method: ProviderMethod;
    orderId: number | null;
    ttlMinutes: number;
    description: string;
    settings: StoreSettings;
  }): Promise<PaymentView> {
    const { settings, method: m, provider: p } = input;
    const fx = settings.fxRates;
    if (!Number.isInteger(input.amount) || input.amount <= 0) throw new CoreError('INVALID_INPUT', 'amount must be a positive integer');
    const limits = limitsInCents(m, fx);
    if (!limits) throw new CoreError('INVALID_STATE', `fx rate for ${m.payCurrency} is not configured`, { currency: m.payCurrency });
    const min = input.purpose === 'topup' ? Math.max(limits.min, settings.topupMin) : limits.min;
    if (input.amount < min) throw new CoreError('AMOUNT_TOO_SMALL', 'amount below the minimum for this method', { min });
    if (limits.max !== null && input.amount > limits.max) {
      throw new CoreError('INVALID_INPUT', 'amount above the maximum for this method', { max: limits.max });
    }

    const payAmount = centsToPay(input.amount, m.payCurrency, fx);
    const code = newPaymentCode();
    const requestedExpiry = new Date(now().getTime() + input.ttlMinutes * 60_000);
    const inv = await p.createInvoice({
      code,
      method: m.method,
      purpose: input.purpose,
      amount: input.amount,
      payAmount,
      payCurrency: m.payCurrency,
      expiresAt: requestedExpiry,
      description: input.description,
      customer: { userId: input.userId },
      callbackUrl: deps.webhookUrl?.(p.name) ?? null,
    });
    const fee = inv.feePay > 0 ? payToCents(inv.feePay, m.payCurrency, fx, 'up') : 0;
    const row = await deps.store.insert({
      storeId: input.storeId,
      code,
      userId: input.userId,
      purpose: input.purpose,
      orderId: input.orderId,
      provider: p.name,
      method: m.method,
      amount: input.amount,
      fee,
      payCurrency: m.payCurrency,
      payAmount: inv.payAmount,
      providerRef: inv.providerRef,
      checkoutUrl: inv.checkoutUrl,
      qrString: inv.qrString,
      expiresAt: inv.expiresAt ?? requestedExpiry,
      raw: { invoice: inv.raw },
    });
    return toView(row);
  }

  return {
    async listPaymentMethods(opts: { storeId: number; purpose: 'topup' | 'order'; country?: string | null }): Promise<PaymentMethodInfo[]> {
      const settings = await deps.core.getSettings(opts.storeId);
      const country = opts.country ? opts.country.toUpperCase() : null;
      const providers = configured();
      const providerMethods = await Promise.all(
        providers.map((p) =>
          p.methods(country).then(
            (methods) => ({ p, methods }),
            (err) => { log.warn(`[payments] ${p.name}.methods failed:`, (err as Error).message); return null; },
          ),
        ),
      );
      const out: PaymentMethodInfo[] = [];
      for (const result of providerMethods) {
        if (!result) continue;
        const { p, methods } = result;
        for (const m of methods) {
          if (opts.purpose === 'order' && m.minExpiryMinutes && m.minExpiryMinutes > settings.orderPaymentTtlMinutes) continue;
          const limits = limitsInCents(m, settings.fxRates);
          if (!limits) continue;
          const minAmount = opts.purpose === 'topup' ? Math.max(limits.min, settings.topupMin) : limits.min;
          if (limits.max !== null && limits.max < minAmount) continue;
          out.push({
            provider: p.name,
            method: m.method,
            label: m.label,
            kind: m.kind,
            payCurrency: m.payCurrency,
            minAmount,
            maxAmount: limits.max,
          });
        }
      }
      return out;
    },

    async createTopupPayment(input: { storeId: number; userId: number; amount: Cents; provider: string; method: string }): Promise<PaymentView> {
      const p = requireProvider(input.provider);
      const [settings, m] = await Promise.all([deps.core.getSettings(input.storeId), requireMethod(p, input.method)]);
      if (input.amount < settings.topupMin) {
        throw new CoreError('AMOUNT_TOO_SMALL', 'top-up amount below minimum', { min: settings.topupMin });
      }
      return createInvoiceRow({
        storeId: input.storeId,
        userId: input.userId,
        purpose: 'topup',
        amount: input.amount,
        provider: p,
        method: m,
        orderId: null,
        ttlMinutes: TOPUP_TTL_MINUTES,
        description: `${settings.storeName} top-up`,
        settings,
      });
    },

    async createOrderPayment(input: {
      storeId: number;
      userId: number;
      productId: number;
      quantity: number;
      voucherCode?: string | null;
      provider: string;
      method: string;
    }): Promise<PaymentView> {
      const p = requireProvider(input.provider);
      const [settings, m] = await Promise.all([deps.core.getSettings(input.storeId), requireMethod(p, input.method)]);
      const order = await deps.core.createPendingOrder({
        storeId: input.storeId,
        userId: input.userId,
        productId: input.productId,
        quantity: input.quantity,
        voucherCode: input.voucherCode ?? null,
      });
      try {
        return await createInvoiceRow({
          storeId: input.storeId,
          userId: input.userId,
          purpose: 'order',
          amount: order.total,
          provider: p,
          method: m,
          orderId: order.id,
          ttlMinutes: settings.orderPaymentTtlMinutes,
          description: `${settings.storeName} ${order.code}: ${order.productName} x${order.quantity}`,
          settings,
        });
      } catch (err) {
        // release the reservation right away instead of waiting for the expiry job
        await deps.core.cancelPendingOrder(order.id).catch((e: unknown) => log.warn('[payments] cancel order after failed invoice:', (e as Error).message));
        throw err;
      }
    },

    async refreshPaymentStatus(paymentId: number, userId: number): Promise<{ payment: PaymentView; settled: SettleResult | null }> {
      let r = await ownedRow(paymentId, userId);
      if (r.status === 'paid') {
        const settled = await deps.core.settlePayment(r.id);
        return { payment: toView(r), settled };
      }
      if (r.status !== 'pending') return { payment: toView(r), settled: null };

      const p = configured().find((x) => x.name === r.provider);
      if (!p) return { payment: toView(r), settled: null };
      let status: PaymentStatus;
      try {
        status = (await p.getStatus({ code: r.code, providerRef: r.providerRef, method: r.method })).status;
      } catch (err) {
        log.warn(`[payments] ${p.name}.getStatus(${r.code}) failed:`, (err as Error).message);
        return { payment: toView(r), settled: null };
      }
      if (status === 'paid') {
        const settled = await deps.core.settlePayment(r.id);
        r = (await deps.store.getById(r.id)) ?? r;
        return { payment: toView(r), settled };
      }
      if (status === 'expired' || status === 'failed' || status === 'cancelled') {
        r = (await closeAsFailed(r, status)) ?? (await deps.store.getById(r.id)) ?? r;
      }
      return { payment: toView(r), settled: null };
    },

    async cancelPayment(paymentId: number, userId: number): Promise<void> {
      const r = await ownedRow(paymentId, userId);
      if (r.status !== 'pending') throw new CoreError('INVALID_STATE', `payment is ${r.status}`);
      const updated = await closeAsFailed(r, 'cancelled');
      if (!updated) throw new CoreError('INVALID_STATE', 'payment is no longer pending');
      const p = configured().find((x) => x.name === r.provider);
      if (p?.cancelInvoice) {
        await p
          .cancelInvoice({ code: r.code, providerRef: r.providerRef, method: r.method })
          .catch((err: unknown) => log.warn(`[payments] ${p.name}.cancelInvoice(${r.code}) failed:`, (err as Error).message));
      }
    },

    async getPayment(paymentId: number, userId: number | null): Promise<PaymentView | null> {
      const r = await deps.store.getById(paymentId);
      if (!r || (userId !== null && r.userId !== userId)) return null;
      return toView(r);
    },

    async handleWebhook(providerName: string, req: { headers: Headers; rawBody: string }): Promise<SettleResult | null> {
      const p = configured().find((x) => x.name === providerName);
      if (!p) throw new WebhookError(404, `unknown or unconfigured provider "${providerName}"`);
      if (!p.verifyWebhook(req.headers, req.rawBody)) throw new WebhookError(401, 'invalid webhook signature');
      let ev;
      try {
        ev = p.parseWebhook(req.headers, req.rawBody);
      } catch {
        throw new WebhookError(400, 'malformed webhook payload');
      }
      if (!ev) return null;

      let r: PaymentRow | null = null;
      if (ev.providerRef) r = await deps.store.findByProviderRef(p.name, ev.providerRef);
      if (!r && ev.code) {
        const byCode = await deps.store.findByCode(ev.code);
        if (byCode && byCode.provider === p.name) r = byCode;
      }
      if (!r) {
        log.warn(`[payments] ${p.name} webhook for unknown payment ref=${ev.providerRef} code=${ev.code}`);
        return null;
      }
      await deps.store
        .mergeRaw(r.id, { lastWebhook: ev.raw as Record<string, unknown>, lastWebhookAt: now().toISOString() })
        .catch((err: unknown) => log.warn('[payments] mergeRaw failed:', (err as Error).message));

      if (ev.status === 'paid') {
        if (ev.paidAmount != null && ev.paidAmount + 1e-9 < Number(r.payAmount)) {
          // closed-payment amounts are fixed by the provider; log loudly but still settle (money arrived)
          log.warn(`[payments] ${r.code}: provider reports paid ${ev.paidAmount} < expected ${r.payAmount} ${r.payCurrency}`);
        }
        return deps.core.settlePayment(r.id);
      }
      if (ev.status === 'expired' || ev.status === 'failed' || ev.status === 'cancelled') await closeAsFailed(r, ev.status);
      return null;
    },

    /** HTTP response a provider expects after a webhook was processed. */
    webhookAck(providerName: string): { status: number; body: unknown; contentType: 'json' | 'text' } {
      const p = allProviders().find((x) => x.name === providerName);
      return p ? p.webhookAck() : { status: 200, body: { ok: true }, contentType: 'json' };
    },
  };
}

export type Payments = ReturnType<typeof createPayments>;
