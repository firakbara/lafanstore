// CryptoBot — Crypto Pay API (USDT/TON/BTC/... invoices priced in USD fiat).
// Docs (verified 2026-10-03): https://help.send.tg/en/articles/10279948-crypto-pay-api
//  - Hosts: mainnet https://pay.crypt.bot/api/<method> , testnet https://testnet-pay.crypt.bot/api/<method>
//  - Auth header: `Crypto-Pay-API-Token: <token>`; params via query string or JSON body.
//  - Responses: { ok: true, result } or { ok: false, error }
//  - createInvoice: currency_type 'fiat' + fiat 'USD' + amount "125.50" + accepted_assets "USDT,TON,BTC"
//      + description (<=1024) + payload (<=4kb) + expires_in (1..2678400 s) + allow_comments/allow_anonymous
//      -> Invoice { invoice_id, status: active|paid|expired, bot_invoice_url, mini_app_invoice_url,
//                   web_app_invoice_url, expiration_date, payload, paid_asset, paid_amount, ... }
//  - getInvoices: invoice_ids "1,2" -> invoices (the API returns { items: Invoice[] }; plain arrays also accepted)
//  - deleteInvoice: invoice_id
//  - Webhooks (enabled per app in @CryptoBot -> Crypto Pay -> My Apps -> Webhooks): POST JSON
//      { update_id, update_type: 'invoice_paid', request_date, payload: Invoice }
//      header `crypto-pay-api-signature` = hex HMAC-SHA-256(raw body, key = SHA256(app token) as raw bytes).
//      Any 200 response acknowledges the update.
import type { PaymentStatus } from '@tokobun/core';
import { hmacSha256Hex, safeEqualHex, sha256 } from '../signature';
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

export interface CryptoBotConfig {
  token: string;
  testnet: boolean;
  /** Comma-separated accepted assets, e.g. "USDT,TON,BTC". Empty = all assets. */
  assets?: string;
  /** Extra fee added to what the customer pays, in basis points (Crypto Pay charges the merchant). Default 0. */
  feeBp?: number;
  /** Shown as the "Open Bot" button after payment, e.g. https://t.me/<bot>. */
  returnUrl?: string | null;
  fetch?: FetchLike;
  now?: () => Date;
}

export const CRYPTOBOT_METHOD = 'CRYPTO';

export function cryptobotStatus(s: unknown): PaymentStatus {
  switch (String(s ?? '').toLowerCase()) {
    case 'paid':
      return 'paid';
    case 'expired':
      return 'expired';
    default:
      return 'pending'; // active
  }
}

/** Expected `crypto-pay-api-signature` for a raw webhook body. */
export function cryptobotWebhookSignature(rawBody: string, token: string): string {
  return hmacSha256Hex(sha256(token), rawBody);
}

export class CryptoBotError extends Error {
  constructor(message: string, readonly body?: unknown) {
    super(message);
    this.name = 'CryptoBotError';
  }
}

interface CryptoBotInvoice {
  invoice_id: number;
  status: string;
  bot_invoice_url?: string;
  mini_app_invoice_url?: string;
  web_app_invoice_url?: string;
  pay_url?: string; // deprecated alias
  expiration_date?: string;
  payload?: string;
  amount?: string;
}

export function createCryptoBotProvider(cfg: CryptoBotConfig): PaymentProvider {
  const base = cfg.testnet ? 'https://testnet-pay.crypt.bot/api' : 'https://pay.crypt.bot/api';
  const doFetch: FetchLike = cfg.fetch ?? ((i, init) => fetch(i, init));
  const now = cfg.now ?? (() => new Date());
  const assets = (cfg.assets ?? 'USDT,TON,BTC')
    .split(',')
    .map((a) => a.trim().toUpperCase())
    .filter(Boolean);
  const feeBp = Math.max(0, Math.floor(cfg.feeBp ?? 0));

  async function call<T>(method: string, body: Record<string, unknown>): Promise<T> {
    const res = await doFetch(`${base}/${method}`, {
      method: 'POST',
      headers: { 'Crypto-Pay-API-Token': cfg.token, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    let json: { ok: boolean; result?: T; error?: unknown };
    try {
      json = (await res.json()) as typeof json;
    } catch {
      throw new CryptoBotError(`CryptoBot ${method}: HTTP ${res.status} (non-JSON response)`);
    }
    if (!json.ok || json.result === undefined) {
      const e = json.error as { name?: string; code?: number } | string | undefined;
      const msg = typeof e === 'string' ? e : (e?.name ?? `HTTP ${res.status}`);
      throw new CryptoBotError(`CryptoBot ${method}: ${msg}`, json);
    }
    return json.result;
  }

  return {
    name: 'cryptobot',
    isConfigured: () => Boolean(cfg.token),

    async methods(): Promise<ProviderMethod[]> {
      return [
        {
          method: CRYPTOBOT_METHOD,
          label: `CryptoBot (${(assets.length ? assets : ['USDT', 'TON', 'BTC']).join('/')})`,
          kind: 'crypto',
          payCurrency: 'USD',
          minPay: 0.1,
          maxPay: null,
        },
      ];
    },

    async createInvoice(input: CreateInvoiceInput): Promise<InvoiceResult> {
      const baseUsd = input.payAmount; // already rounded up to cents
      const feeUsd = feeBp > 0 ? Math.ceil((Math.round(baseUsd * 100) * feeBp) / 10000 - 1e-9) / 100 : 0;
      const total = Math.round((baseUsd + feeUsd) * 100) / 100;
      const expiresIn = Math.min(2678400, Math.max(60, Math.round((input.expiresAt.getTime() - now().getTime()) / 1000)));
      const body: Record<string, unknown> = {
        currency_type: 'fiat',
        fiat: 'USD',
        amount: total.toFixed(2),
        description: input.description.slice(0, 1024),
        payload: input.code,
        expires_in: expiresIn,
        allow_comments: false,
      };
      if (assets.length) body.accepted_assets = assets.join(',');
      if (cfg.returnUrl) {
        body.paid_btn_name = 'openBot';
        body.paid_btn_url = cfg.returnUrl;
      }
      const inv = await call<CryptoBotInvoice>('createInvoice', body);
      return {
        providerRef: String(inv.invoice_id),
        payAmount: total.toFixed(2),
        feePay: feeUsd,
        checkoutUrl: inv.bot_invoice_url ?? inv.mini_app_invoice_url ?? inv.pay_url ?? null,
        qrString: null,
        expiresAt: inv.expiration_date ? new Date(inv.expiration_date) : new Date(now().getTime() + expiresIn * 1000),
        raw: inv,
      };
    },

    async getStatus(p: ProviderPaymentRef): Promise<ProviderStatus> {
      if (!p.providerRef) return { status: 'pending', raw: null };
      const result = await call<{ items?: CryptoBotInvoice[] } | CryptoBotInvoice[]>('getInvoices', { invoice_ids: p.providerRef });
      const items = Array.isArray(result) ? result : (result.items ?? []);
      const inv = items.find((i) => String(i.invoice_id) === p.providerRef);
      if (!inv) return { status: 'pending', raw: result };
      return { status: cryptobotStatus(inv.status), raw: inv };
    },

    async cancelInvoice(p: ProviderPaymentRef) {
      if (!p.providerRef) return;
      await call<boolean>('deleteInvoice', { invoice_id: Number(p.providerRef) });
    },

    verifyWebhook(headers, rawBody) {
      if (!cfg.token) return false;
      return safeEqualHex(headers.get('crypto-pay-api-signature'), cryptobotWebhookSignature(rawBody, cfg.token));
    },

    parseWebhook(_headers, rawBody): WebhookEvent | null {
      const u = JSON.parse(rawBody) as { update_type?: string; payload?: CryptoBotInvoice };
      if (u.update_type !== 'invoice_paid' || !u.payload) return null;
      return {
        providerRef: u.payload.invoice_id != null ? String(u.payload.invoice_id) : null,
        code: u.payload.payload ?? null,
        status: cryptobotStatus(u.payload.status ?? 'paid'),
        paidAmount: null, // paid in crypto; the invoice amount itself is fixed in USD
        raw: u,
      };
    },

    webhookAck: () => ({ status: 200, body: 'OK', contentType: 'text' }),
  };
}
