// Gateway adapter interface. Adding a gateway = adding one file implementing PaymentProvider
// and registering it in ../registry.ts.
import type { Cents, PaymentStatus } from '@tokobun/core';
import type { PaymentKind } from '../index';

/** A payment method as the provider describes it, in the provider's pay currency (major units). */
export interface ProviderMethod {
  method: string; // provider method code, e.g. 'QRIS', 'BRIVA', 'CRYPTO'
  label: string;
  kind: PaymentKind;
  payCurrency: string; // 'IDR' | 'USD' ...
  minPay: number | null; // major units of payCurrency (e.g. 10000 IDR); null = no provider minimum
  maxPay: number | null;
  /** Shortest invoice lifetime the provider accepts for this method (minutes). */
  minExpiryMinutes?: number;
  /** Longest invoice lifetime the provider accepts for this method (minutes). */
  maxExpiryMinutes?: number;
}

export interface CreateInvoiceInput {
  code: string; // our merchant reference "PAY-..."
  method: string;
  purpose: 'topup' | 'order';
  amount: Cents; // base cents that will be credited/charged
  payAmount: number; // `amount` converted to the method's pay currency (major units, before provider fee)
  payCurrency: string;
  expiresAt: Date; // requested expiry (provider may clamp to its own min/max)
  description: string;
  customer: { userId: number; name?: string | null };
  callbackUrl: string | null; // our webhook URL for this provider, when known
}

export interface InvoiceResult {
  providerRef: string; // provider's id for the invoice (unique per provider)
  payAmount: string; // decimal string the customer actually pays (incl. provider fee), in payCurrency
  feePay: number; // provider fee added to the customer's total, major units of payCurrency
  checkoutUrl: string | null;
  qrString: string | null;
  expiresAt: Date | null;
  raw: unknown;
}

export interface ProviderStatus {
  status: PaymentStatus; // pending | paid | expired | failed | cancelled
  raw: unknown;
}

/** Normalised webhook event. `providerRef` and/or `code` identify our payment row. */
export interface WebhookEvent {
  providerRef: string | null;
  code: string | null;
  status: PaymentStatus;
  /** Amount the provider says was paid, in payCurrency major units (used for sanity checks). */
  paidAmount?: number | null;
  raw: unknown;
}

/** Minimal view of a stored payment that adapters may need (status checks, cancellation). */
export interface ProviderPaymentRef {
  code: string;
  providerRef: string | null;
  method: string;
}

export interface PaymentProvider {
  readonly name: string; // 'tripay' | 'cryptobot' | 'manual'
  isConfigured(): boolean;
  /** Methods offered for a country (ISO-2, upper-case) — null/undefined = no region filter. */
  methods(country?: string | null): Promise<ProviderMethod[]>;
  createInvoice(input: CreateInvoiceInput): Promise<InvoiceResult>;
  getStatus(payment: ProviderPaymentRef): Promise<ProviderStatus>;
  /** Best-effort: invalidate the invoice at the provider (not all providers support it). */
  cancelInvoice?(payment: ProviderPaymentRef): Promise<void>;
  /** True when the webhook's signature is valid for the exact raw body. */
  verifyWebhook(headers: Headers, rawBody: string): boolean;
  /** Parse a (verified) webhook. Returns null for events we ignore. */
  parseWebhook(headers: Headers, rawBody: string): WebhookEvent | null;
  /** HTTP response the provider expects on successful receipt. */
  webhookAck(): { status: number; body: unknown; contentType: 'json' | 'text' };
}

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
