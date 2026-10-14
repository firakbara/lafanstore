// Manual provider — DEV/TESTING ONLY. Enabled only when PAYMENTS_DEV_MANUAL=true.
// Creates a pending USD payment with no external invoice; an admin marks it paid (admin panel ->
// core.settlePayment), or a test can POST /webhooks/manual with header `x-manual-secret` equal to
// PAYMENTS_DEV_MANUAL_SECRET and body {"code":"PAY-...","status":"paid"}.
import type { PaymentStatus } from '@tokobun/core';
import { safeEqualHex } from '../signature';
import type { PaymentProvider, ProviderMethod, WebhookEvent } from './types';

export interface ManualConfig {
  enabled: boolean;
  secret?: string;
}

export function createManualProvider(cfg: ManualConfig): PaymentProvider {
  return {
    name: 'manual',
    isConfigured: () => cfg.enabled,
    async methods(): Promise<ProviderMethod[]> {
      return [{ method: 'MANUAL', label: 'Manual (dev)', kind: 'ewallet', payCurrency: 'USD', minPay: null, maxPay: null }];
    },
    async createInvoice(input) {
      return {
        providerRef: input.code,
        payAmount: input.payAmount.toFixed(2),
        feePay: 0,
        checkoutUrl: null,
        qrString: null,
        expiresAt: input.expiresAt,
        raw: { manual: true },
      };
    },
    async getStatus() {
      // Nothing to ask: the DB row is the source of truth (admin settles it directly).
      return { status: 'pending', raw: null };
    },
    verifyWebhook(headers) {
      if (!cfg.enabled || !cfg.secret) return false;
      // compare as hex of the utf8 bytes so the comparison is constant-time
      const got = Buffer.from(headers.get('x-manual-secret') ?? '', 'utf8').toString('hex');
      return safeEqualHex(got, Buffer.from(cfg.secret, 'utf8').toString('hex'));
    },
    parseWebhook(_headers, rawBody): WebhookEvent | null {
      const b = JSON.parse(rawBody) as { code?: string; status?: string };
      const allowed: PaymentStatus[] = ['paid', 'expired', 'failed'];
      const status = allowed.find((s) => s === b.status);
      if (!b.code || !status) return null;
      return { providerRef: b.code, code: b.code, status, raw: b };
    },
    webhookAck: () => ({ status: 200, body: { ok: true }, contentType: 'json' }),
  };
}
