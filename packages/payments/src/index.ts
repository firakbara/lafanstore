// @tokobun/payments — payment gateway adapters + payment lifecycle.
// SIGNATURES ARE FROZEN: bot and api depend on them. Implementations may add exports.
import type { Cents, PaymentStatus, SettleResult } from '@tokobun/core';
import * as core from '@tokobun/core';
import { providersFromEnv, webhookUrl as envWebhookUrl } from './registry';
import { createPayments, type Payments, type PaymentsDeps } from './service';
import { createDbStore } from './store';

export type PaymentKind = 'qris' | 'va' | 'ewallet' | 'retail' | 'crypto';

export interface PaymentMethodInfo {
  provider: string; // 'tripay' | 'cryptobot' | ...
  method: string; // provider method code, e.g. 'QRIS', 'BRIVA', 'USDT'
  label: string; // human label, e.g. 'QRIS', 'BRI Virtual Account', 'CryptoBot (USDT/TON/BTC)'
  kind: PaymentKind;
  payCurrency: string; // currency the customer pays in, e.g. 'IDR', 'USD'
  minAmount: Cents; // in base cents
  maxAmount: Cents | null;
}

export interface PaymentView {
  id: number;
  code: string;
  status: PaymentStatus;
  purpose: 'topup' | 'order';
  provider: string;
  method: string;
  amount: Cents; // base cents credited/charged
  fee: Cents;
  payCurrency: string;
  payAmount: string; // decimal string in payCurrency
  checkoutUrl: string | null; // open-in-browser / in-app pay link
  qrString: string | null; // raw QRIS payload if provider returns it (bot renders it as an image)
  expiresAt: Date | null;
  orderId: number | null;
}

// ----- additional exports -----
export { createPayments, toView, WebhookError, TOPUP_TTL_MINUTES } from './service';
export type { Payments, PaymentsCore, PaymentsDeps } from './service';
export { createDbStore, createMemoryStore } from './store';
export type { PaymentRow, PaymentStore, NewPaymentRow } from './store';
export { providersFromEnv, webhookUrl } from './registry';
export { centsToPay, payToCents, formatPayAmount, fxRate } from './money';
export type * from './providers/types';
export { createTripayProvider, tripayCallbackSignature, tripayTransactionSignature } from './providers/tripay';
export { createCryptoBotProvider, cryptobotWebhookSignature, CRYPTOBOT_METHOD } from './providers/cryptobot';
export { createManualProvider } from './providers/manual';

/** Only send Tripay a callback_url when it is publicly reachable over HTTPS; otherwise the
 *  merchant-panel default callback URL is used. */
function defaultWebhookUrl(provider: string): string | null {
  const u = envWebhookUrl(provider);
  return u && u.startsWith('https://') ? u : null;
}

let instance: Payments | null = null;
let overrides: Partial<PaymentsDeps> = {};

function svc(): Payments {
  instance ??= createPayments({
    store: overrides.store ?? createDbStore(),
    providers: overrides.providers ?? (() => cachedProviders()),
    core: overrides.core ?? {
      getSettings: core.getSettings,
      createPendingOrder: core.createPendingOrder,
      cancelPendingOrder: core.cancelPendingOrder,
      settlePayment: core.settlePayment,
    },
    webhookUrl: overrides.webhookUrl ?? defaultWebhookUrl,
    now: overrides.now,
    log: overrides.log,
  });
  return instance;
}

let providerCache: ReturnType<typeof providersFromEnv> | null = null;
function cachedProviders() {
  providerCache ??= providersFromEnv(process.env);
  return providerCache;
}

/** Replace parts of the default wiring (tests, or custom providers). Resets the default instance. */
export function configurePayments(deps: Partial<PaymentsDeps>): void {
  overrides = { ...deps };
  instance = null;
  providerCache = null;
}

/** HTTP response the provider expects after a successful webhook (Tripay: {"success":true}, CryptoBot: "OK"). */
export function webhookAck(provider: string): { status: number; body: unknown; contentType: 'json' | 'text' } {
  return svc().webhookAck(provider);
}

/** Methods from providers that are configured via env. `country` (ISO-2, from user language/settings)
 *  filters region-specific methods (e.g. Tripay only for 'ID'); crypto is always offered. */
export async function listPaymentMethods(opts: { storeId: number; purpose: 'topup' | 'order'; country?: string | null }): Promise<PaymentMethodInfo[]> {
  return svc().listPaymentMethods(opts);
}

/** Create a wallet top-up invoice for `amount` base cents. Throws CoreError AMOUNT_TOO_SMALL. */
export async function createTopupPayment(input: { storeId: number; userId: number; amount: Cents; provider: string; method: string }): Promise<PaymentView> {
  return svc().createTopupPayment(input);
}

/** Direct pay: core.createPendingOrder (reserves stock) + invoice for order.total, linked both ways. */
export async function createOrderPayment(input: {
  storeId: number;
  userId: number;
  productId: number;
  quantity: number;
  voucherCode?: string | null;
  provider: string;
  method: string;
}): Promise<PaymentView> {
  return svc().createOrderPayment(input);
}

/** Ask the provider for the current status (used by the bot's "Cek Status" button). If it is paid,
 *  settles it (idempotent) and returns the SettleResult. Only the owner can check. */
export async function refreshPaymentStatus(paymentId: number, userId: number): Promise<{ payment: PaymentView; settled: SettleResult | null }> {
  return svc().refreshPaymentStatus(paymentId, userId);
}

/** Cancel a pending payment owned by the user (and its pending order). */
export async function cancelPayment(paymentId: number, userId: number): Promise<void> {
  return svc().cancelPayment(paymentId, userId);
}

export async function getPayment(paymentId: number, userId: number | null): Promise<PaymentView | null> {
  return svc().getPayment(paymentId, userId);
}

/** Verify + parse a provider webhook. Returns the settle result when the payment became paid,
 *  null for ignored/non-final events. Throws on bad signature. */
export async function handleWebhook(provider: string, req: { headers: Headers; rawBody: string }): Promise<SettleResult | null> {
  return svc().handleWebhook(provider, req);
}
