// Tripay — closed payment API (QRIS / Virtual Account / e-wallet / retail), IDR only.
// Docs (verified 2026-10-03): https://tripay.co.id/developer?tab=transaction-create
//  - Base URL: sandbox https://tripay.co.id/api-sandbox , production https://tripay.co.id/api
//  - Auth header: `Authorization: Bearer {api_key}`
//  - GET  /merchant/payment-channel                -> data[]: code,name,group,type,minimum_amount,maximum_amount,active
//  - GET  /merchant/fee-calculator?code=&amount=   -> data[]: code,fee{flat,percent,min,max},total_fee{merchant,customer}
//  - POST /transaction/create  (method, merchant_ref, amount, customer_name, customer_email, order_items[],
//         callback_url, return_url, expired_time (unix seconds), signature)
//         signature = HMAC-SHA256(merchant_code + merchant_ref + amount, private_key) hex
//         -> data: reference, amount, fee_merchant, fee_customer, checkout_url, pay_url, pay_code, qr_string,
//            qr_url, status ('UNPAID'), expired_time
//  - GET  /transaction/detail?reference=           -> data.status: UNPAID | PAID | EXPIRED | FAILED | REFUND
//  - Callback (POST JSON): headers X-Callback-Signature = HMAC-SHA256(raw JSON body, private_key) hex,
//         X-Callback-Event = 'payment_status'. Body: reference, merchant_ref, payment_method_code, total_amount,
//         fee_merchant, fee_customer, total_fee, amount_received, is_closed_payment, status, paid_at, note.
//         Expected response: JSON {"success": true} (otherwise retried every 2 min, max 3 times).
import type { PaymentStatus } from '@tokobun/core';
import type { PaymentKind } from '../index';
import { hmacSha256Hex, safeEqualHex } from '../signature';
import type {
  CreateInvoiceInput,
  FetchLike,
  InvoiceResult,
  PaymentProvider,
  ProviderMethod,
  ProviderPaymentRef,
  ProviderStatus,
  WebhookEvent,
} from './types';

export interface TripayConfig {
  apiKey: string;
  privateKey: string;
  merchantCode: string;
  sandbox: boolean;
  /** Email sent as customer_email (required by Tripay). `{userId}` is replaced. */
  customerEmail?: string;
  /** URL Tripay sends the customer back to after paying (e.g. https://t.me/<bot>). */
  returnUrl?: string | null;
  fetch?: FetchLike;
  now?: () => Date;
}

/** Channel list + limits from the docs ("Daftar Channel & Biaya"), used when the channel API is unreachable
 *  and to know each channel's min/max expiry (not returned by the channel API). */
export const TRIPAY_CHANNELS: Record<string, { label: string; min: number; max: number; minExp: number; maxExp: number }> = {
  QRIS: { label: 'QRIS', min: 1_000, max: 5_000_000, minExp: 10, maxExp: 60 },
  QRISC: { label: 'QRIS (Customizable)', min: 1_000, max: 5_000_000, minExp: 10, maxExp: 1440 },
  QRIS2: { label: 'QRIS', min: 1_000, max: 5_000_000, minExp: 10, maxExp: 1440 },
  QRIS_SHOPEEPAY: { label: 'QRIS Custom by ShopeePay', min: 1_000, max: 5_000_000, minExp: 10, maxExp: 60 },
  BCAVA: { label: 'BCA Virtual Account', min: 10_000, max: 10_000_000, minExp: 15, maxExp: 4320 },
  BNIVA: { label: 'BNI Virtual Account', min: 10_000, max: 10_000_000, minExp: 15, maxExp: 1440 },
  BRIVA: { label: 'BRI Virtual Account', min: 10_000, max: 10_000_000, minExp: 60, maxExp: 4320 },
  MANDIRIVA: { label: 'Mandiri Virtual Account', min: 10_000, max: 10_000_000, minExp: 60, maxExp: 4320 },
  PERMATAVA: { label: 'Permata Virtual Account', min: 10_000, max: 10_000_000, minExp: 60, maxExp: 4320 },
  CIMBVA: { label: 'CIMB Niaga Virtual Account', min: 10_000, max: 10_000_000, minExp: 15, maxExp: 4320 },
  BSIVA: { label: 'BSI Virtual Account', min: 10_000, max: 10_000_000, minExp: 60, maxExp: 180 },
  MUAMALATVA: { label: 'Muamalat Virtual Account', min: 10_000, max: 10_000_000, minExp: 60, maxExp: 180 },
  OCBCVA: { label: 'OCBC NISP Virtual Account', min: 10_000, max: 10_000_000, minExp: 15, maxExp: 4320 },
  DANAMONVA: { label: 'Danamon Virtual Account', min: 10_000, max: 10_000_000, minExp: 15, maxExp: 4320 },
  OTHERBANKVA: { label: 'Other Bank Virtual Account', min: 10_000, max: 10_000_000, minExp: 15, maxExp: 1440 },
  OVO: { label: 'OVO', min: 1_000, max: 10_000_000, minExp: 15, maxExp: 4320 },
  DANA: { label: 'DANA', min: 1_000, max: 10_000_000, minExp: 15, maxExp: 60 },
  SHOPEEPAY: { label: 'ShopeePay', min: 1_000, max: 10_000_000, minExp: 15, maxExp: 60 },
  ALFAMART: { label: 'Alfamart', min: 10_000, max: 2_500_000, minExp: 60, maxExp: 1440 },
  INDOMARET: { label: 'Indomaret', min: 10_000, max: 2_500_000, minExp: 15, maxExp: 4320 },
  ALFAMIDI: { label: 'Alfamidi', min: 5_000, max: 2_500_000, minExp: 60, maxExp: 1440 },
};

/** Channels offered when the channel API cannot be reached. */
const FALLBACK_CODES = ['QRIS', 'BRIVA', 'BNIVA', 'MANDIRIVA', 'BCAVA', 'PERMATAVA', 'OVO', 'DANA', 'SHOPEEPAY', 'ALFAMART', 'INDOMARET'];

export function tripayKind(code: string): PaymentKind {
  const c = code.toUpperCase();
  if (c.startsWith('QRIS')) return 'qris';
  if (c.endsWith('VA')) return 'va';
  if (['ALFAMART', 'INDOMARET', 'ALFAMIDI'].includes(c)) return 'retail';
  return 'ewallet';
}

export function tripayStatus(s: unknown): PaymentStatus {
  switch (String(s ?? '').toUpperCase()) {
    case 'PAID':
      return 'paid';
    case 'EXPIRED':
      return 'expired';
    case 'FAILED':
    case 'REFUND':
      return 'failed';
    default:
      return 'pending'; // UNPAID
  }
}

/** Signature for POST /transaction/create. */
export function tripayTransactionSignature(merchantCode: string, merchantRef: string, amount: number, privateKey: string): string {
  return hmacSha256Hex(privateKey, `${merchantCode}${merchantRef}${amount}`);
}

/** Expected X-Callback-Signature for a raw callback body. */
export function tripayCallbackSignature(rawBody: string, privateKey: string): string {
  return hmacSha256Hex(privateKey, rawBody);
}

interface TripayEnvelope<T> {
  success: boolean;
  message?: string;
  data?: T;
}

export class TripayError extends Error {
  constructor(message: string, readonly body?: unknown) {
    super(message);
    this.name = 'TripayError';
  }
}

export function createTripayProvider(cfg: TripayConfig): PaymentProvider {
  const base = cfg.sandbox ? 'https://tripay.co.id/api-sandbox' : 'https://tripay.co.id/api';
  const doFetch: FetchLike = cfg.fetch ?? ((i, init) => fetch(i, init));
  const now = cfg.now ?? (() => new Date());
  let channelCache: { at: number; list: ProviderMethod[] } | null = null;

  async function call<T>(path: string, init?: { method?: 'GET' | 'POST'; query?: Record<string, string | number>; body?: unknown }): Promise<T> {
    const url = new URL(base + path);
    for (const [k, v] of Object.entries(init?.query ?? {})) url.searchParams.set(k, String(v));
    const res = await doFetch(url.toString(), {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });
    let json: TripayEnvelope<T>;
    try {
      json = (await res.json()) as TripayEnvelope<T>;
    } catch {
      throw new TripayError(`Tripay ${path}: HTTP ${res.status} (non-JSON response)`);
    }
    if (!res.ok || !json.success || json.data === undefined) {
      throw new TripayError(`Tripay ${path}: ${json.message || `HTTP ${res.status}`}`, json);
    }
    return json.data;
  }

  function staticMethod(code: string): ProviderMethod | null {
    const ch = TRIPAY_CHANNELS[code];
    if (!ch) return null;
    return {
      method: code,
      label: ch.label,
      kind: tripayKind(code),
      payCurrency: 'IDR',
      minPay: ch.min,
      maxPay: ch.max,
      minExpiryMinutes: ch.minExp,
      maxExpiryMinutes: ch.maxExp,
    };
  }

  async function channels(): Promise<ProviderMethod[]> {
    const t = Date.now();
    if (channelCache && t - channelCache.at < 10 * 60_000) return channelCache.list;
    try {
      const data = await call<
        { code: string; name: string; active: boolean; minimum_amount?: number | null; maximum_amount?: number | null }[]
      >('/merchant/payment-channel');
      const list = data
        .filter((c) => c.active)
        .map((c): ProviderMethod => {
          const known = TRIPAY_CHANNELS[c.code];
          return {
            method: c.code,
            label: c.name,
            kind: tripayKind(c.code),
            payCurrency: 'IDR',
            minPay: c.minimum_amount ?? known?.min ?? null,
            maxPay: c.maximum_amount ?? known?.max ?? null,
            minExpiryMinutes: known?.minExp,
            maxExpiryMinutes: known?.maxExp,
          };
        });
      channelCache = { at: t, list };
      return list;
    } catch (err) {
      console.warn('[payments/tripay] channel list unavailable, using static list:', (err as Error).message);
      return FALLBACK_CODES.map(staticMethod).filter((m): m is ProviderMethod => m !== null);
    }
  }

  return {
    name: 'tripay',
    isConfigured: () => Boolean(cfg.apiKey && cfg.privateKey && cfg.merchantCode),

    async methods(country) {
      if (country && country.toUpperCase() !== 'ID') return [];
      return channels();
    },

    async createInvoice(input: CreateInvoiceInput): Promise<InvoiceResult> {
      const baseIdr = Math.ceil(input.payAmount);
      // Fee: whatever part the merchant would bear is grossed up onto the customer's amount, so the store
      // nets ~baseIdr and the customer pays the fee (spec: "provider fee is added to what the customer pays").
      // A fee configured as "customer fee" at Tripay is added by Tripay itself (fee_customer).
      let merchantFee = 0;
      try {
        const fees = await call<{ code: string; fee?: { percent?: string | number | null }; total_fee?: { merchant?: number; customer?: number } }[]>(
          '/merchant/fee-calculator',
          { query: { code: input.method, amount: baseIdr } },
        );
        const f = fees.find((x) => x.code === input.method) ?? fees[0];
        const m = Number(f?.total_fee?.merchant ?? 0);
        const pct = Number(f?.fee?.percent ?? 0);
        // the percentage part grows with the grossed-up amount; add it once more (rounded up)
        merchantFee = m > 0 ? m + Math.ceil((m * pct) / 100) : 0;
      } catch (err) {
        console.warn('[payments/tripay] fee calculator failed, charging without merchant fee gross-up:', (err as Error).message);
      }
      const amount = baseIdr + merchantFee;

      const ch = TRIPAY_CHANNELS[input.method];
      const nowMs = now().getTime();
      let expMs = input.expiresAt.getTime();
      if (ch) {
        expMs = Math.max(expMs, nowMs + ch.minExp * 60_000);
        expMs = Math.min(expMs, nowMs + ch.maxExp * 60_000);
      }
      const expiredTime = Math.ceil(expMs / 1000);
      const email = (cfg.customerEmail || 'tg{userId}@example.com').replace('{userId}', String(input.customer.userId));

      const body = {
        method: input.method,
        merchant_ref: input.code,
        amount,
        customer_name: input.customer.name?.trim() || `Telegram ${input.customer.userId}`,
        customer_email: email,
        order_items: [{ sku: input.purpose.toUpperCase(), name: input.description.slice(0, 100), price: amount, quantity: 1 }],
        ...(input.callbackUrl ? { callback_url: input.callbackUrl } : {}),
        ...(cfg.returnUrl ? { return_url: cfg.returnUrl } : {}),
        expired_time: expiredTime,
        signature: tripayTransactionSignature(cfg.merchantCode, input.code, amount, cfg.privateKey),
      };
      const data = await call<{
        reference: string;
        amount: number;
        fee_customer?: number | null;
        checkout_url?: string | null;
        pay_url?: string | null;
        qr_string?: string | null;
        expired_time?: number | null;
      }>('/transaction/create', { method: 'POST', body });

      const feeCustomer = Number(data.fee_customer ?? 0);
      // Customer pays data.amount; if Tripay did not fold fee_customer into it, add it ourselves.
      const customerPays = Math.max(Number(data.amount), amount + feeCustomer);
      return {
        providerRef: data.reference,
        payAmount: String(customerPays),
        feePay: customerPays - baseIdr,
        checkoutUrl: data.checkout_url ?? data.pay_url ?? null,
        qrString: data.qr_string ?? null,
        expiresAt: data.expired_time ? new Date(Number(data.expired_time) * 1000) : new Date(expMs),
        raw: data,
      };
    },

    async getStatus(p: ProviderPaymentRef): Promise<ProviderStatus> {
      if (!p.providerRef) return { status: 'pending', raw: null };
      const data = await call<{ status: string }>('/transaction/detail', { query: { reference: p.providerRef } });
      return { status: tripayStatus(data.status), raw: data };
    },

    verifyWebhook(headers, rawBody) {
      if (!cfg.privateKey) return false;
      return safeEqualHex(headers.get('x-callback-signature'), tripayCallbackSignature(rawBody, cfg.privateKey));
    },

    parseWebhook(headers, rawBody): WebhookEvent | null {
      const event = headers.get('x-callback-event');
      if (event && event !== 'payment_status') return null;
      const b = JSON.parse(rawBody) as {
        reference?: string;
        merchant_ref?: string | null;
        status?: string;
        total_amount?: number;
        is_closed_payment?: number;
      };
      if (b.is_closed_payment === 0) return null; // open payments are not used
      return {
        providerRef: b.reference ?? null,
        code: b.merchant_ref ?? null,
        status: tripayStatus(b.status),
        paidAmount: b.total_amount != null ? Number(b.total_amount) : null,
        raw: b,
      };
    },

    webhookAck: () => ({ status: 200, body: { success: true }, contentType: 'json' }),
  };
}
