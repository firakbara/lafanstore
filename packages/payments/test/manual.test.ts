import { describe, expect, test } from 'bun:test';
import { createManualProvider } from '../src/providers/manual';

describe('manual provider', () => {
  test('isConfigured reflects enabled flag', () => {
    expect(createManualProvider({ enabled: false }).isConfigured()).toBe(false);
    expect(createManualProvider({ enabled: true }).isConfigured()).toBe(true);
  });

  test('methods returns a single MANUAL USD method', async () => {
    const ms = await createManualProvider({ enabled: true }).methods(null);
    expect(ms).toHaveLength(1);
    expect(ms[0]).toMatchObject({ method: 'MANUAL', payCurrency: 'USD', kind: 'ewallet' });
  });

  test('createInvoice returns the code as providerRef with zero fee', async () => {
    const p = createManualProvider({ enabled: true });
    const inv = await p.createInvoice({
      code: 'PAY-TEST',
      method: 'MANUAL',
      purpose: 'topup',
      amount: 500,
      payAmount: 5,
      payCurrency: 'USD',
      expiresAt: new Date('2026-12-01'),
      description: 'test',
      customer: { userId: 1 },
      callbackUrl: null,
    });
    expect(inv).toMatchObject({
      providerRef: 'PAY-TEST',
      payAmount: '5.00',
      feePay: 0,
      checkoutUrl: null,
      qrString: null,
    });
  });

  test('getStatus always returns pending', async () => {
    const s = await createManualProvider({ enabled: true }).getStatus({ code: 'X', providerRef: 'X', method: 'MANUAL' });
    expect(s.status).toBe('pending');
  });

  test('verifyWebhook: valid secret accepted', () => {
    const p = createManualProvider({ enabled: true, secret: 'my-secret' });
    expect(p.verifyWebhook(new Headers({ 'x-manual-secret': 'my-secret' }), '{}')).toBe(true);
  });

  test('verifyWebhook: wrong secret rejected', () => {
    const p = createManualProvider({ enabled: true, secret: 'my-secret' });
    expect(p.verifyWebhook(new Headers({ 'x-manual-secret': 'wrong' }), '{}')).toBe(false);
  });

  test('verifyWebhook: missing secret header rejected', () => {
    const p = createManualProvider({ enabled: true, secret: 'my-secret' });
    expect(p.verifyWebhook(new Headers(), '{}')).toBe(false);
  });

  test('verifyWebhook: disabled provider always rejects', () => {
    const p = createManualProvider({ enabled: false, secret: 'my-secret' });
    expect(p.verifyWebhook(new Headers({ 'x-manual-secret': 'my-secret' }), '{}')).toBe(false);
  });

  test('verifyWebhook: no secret configured always rejects', () => {
    const p = createManualProvider({ enabled: true });
    expect(p.verifyWebhook(new Headers({ 'x-manual-secret': '' }), '{}')).toBe(false);
  });

  test('parseWebhook: valid paid event', () => {
    const p = createManualProvider({ enabled: true });
    const ev = p.parseWebhook(new Headers(), JSON.stringify({ code: 'PAY-ABC', status: 'paid' }));
    expect(ev).toMatchObject({ providerRef: 'PAY-ABC', code: 'PAY-ABC', status: 'paid' });
  });

  test('parseWebhook: expired and failed statuses', () => {
    const p = createManualProvider({ enabled: true });
    expect(p.parseWebhook(new Headers(), JSON.stringify({ code: 'X', status: 'expired' }))?.status).toBe('expired');
    expect(p.parseWebhook(new Headers(), JSON.stringify({ code: 'X', status: 'failed' }))?.status).toBe('failed');
  });

  test('parseWebhook: unknown status returns null', () => {
    const p = createManualProvider({ enabled: true });
    expect(p.parseWebhook(new Headers(), JSON.stringify({ code: 'X', status: 'pending' }))).toBeNull();
    expect(p.parseWebhook(new Headers(), JSON.stringify({ code: 'X', status: 'cancelled' }))).toBeNull();
  });

  test('parseWebhook: missing code returns null', () => {
    const p = createManualProvider({ enabled: true });
    expect(p.parseWebhook(new Headers(), JSON.stringify({ status: 'paid' }))).toBeNull();
  });

  test('webhookAck returns JSON ok', () => {
    const ack = createManualProvider({ enabled: true }).webhookAck();
    expect(ack).toEqual({ status: 200, body: { ok: true }, contentType: 'json' });
  });
});
