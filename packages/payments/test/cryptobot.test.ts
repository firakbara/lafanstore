import { describe, expect, test } from 'bun:test';
import { createHash, createHmac } from 'node:crypto';
import { createCryptoBotProvider, cryptobotStatus, cryptobotWebhookSignature } from '../src/providers/cryptobot';
import { fakeFetch } from './helpers';

const TOKEN = '123456789:AAzQcZWQqQAbsfgPnOLr4FHC8Doa4L7KryC'; // token format from the docs' example

/** The documented check (https://help.send.tg/en/articles/10279948-crypto-pay-api, "Verifying webhook updates"). */
function docSignature(token: string, body: string) {
  const secret = createHash('sha256').update(token).digest();
  return createHmac('sha256', secret).update(body).digest('hex');
}

const UPDATE = JSON.stringify({
  update_id: 1,
  update_type: 'invoice_paid',
  request_date: '2026-10-03T00:00:00.000Z',
  payload: { invoice_id: 528890, status: 'paid', amount: '1.50', fiat: 'USD', currency_type: 'fiat', payload: 'PAY-ABC' },
});

function provider(fetchFn?: ReturnType<typeof fakeFetch>['fetch'], testnet = true, feeBp = 0) {
  return createCryptoBotProvider({ token: TOKEN, testnet, fetch: fetchFn, feeBp, now: () => new Date('2026-10-03T00:00:00Z') });
}

describe('cryptobotStatus', () => {
  test('maps paid → paid', () => expect(cryptobotStatus('paid')).toBe('paid'));
  test('maps expired → expired', () => expect(cryptobotStatus('expired')).toBe('expired'));
  test('maps active → pending', () => expect(cryptobotStatus('active')).toBe('pending'));
  test('maps null/undefined → pending', () => {
    expect(cryptobotStatus(null)).toBe('pending');
    expect(cryptobotStatus(undefined)).toBe('pending');
  });
  test('case insensitive', () => expect(cryptobotStatus('PAID')).toBe('paid'));
});

describe('cryptobot webhook signature', () => {
  test('matches the documented algorithm HMAC-SHA256(body, SHA256(token))', () => {
    expect(cryptobotWebhookSignature(UPDATE, TOKEN)).toBe(docSignature(TOKEN, UPDATE));
  });

  test('valid signature accepted', () => {
    const h = new Headers({ 'crypto-pay-api-signature': docSignature(TOKEN, UPDATE) });
    expect(provider().verifyWebhook(h, UPDATE)).toBe(true);
  });

  test('invalid / missing / other-token / tampered signatures rejected', () => {
    const p = provider();
    expect(p.verifyWebhook(new Headers({ 'crypto-pay-api-signature': 'abc' }), UPDATE)).toBe(false);
    expect(p.verifyWebhook(new Headers(), UPDATE)).toBe(false);
    expect(p.verifyWebhook(new Headers({ 'crypto-pay-api-signature': docSignature('1:other', UPDATE) }), UPDATE)).toBe(false);
    const sig = docSignature(TOKEN, UPDATE);
    expect(p.verifyWebhook(new Headers({ 'crypto-pay-api-signature': sig }), UPDATE.replace('1.50', '0.01'))).toBe(false);
    // the raw-key HMAC (without hashing the token) must not validate
    const raw = createHmac('sha256', TOKEN).update(UPDATE).digest('hex');
    expect(p.verifyWebhook(new Headers({ 'crypto-pay-api-signature': raw }), UPDATE)).toBe(false);
  });

  test('parseWebhook', () => {
    expect(provider().parseWebhook(new Headers(), UPDATE)).toMatchObject({ providerRef: '528890', code: 'PAY-ABC', status: 'paid' });
    expect(provider().parseWebhook(new Headers(), JSON.stringify({ update_type: 'something_else' }))).toBeNull();
  });

  test('parseWebhook with missing payload returns null', () => {
    expect(provider().parseWebhook(new Headers(), JSON.stringify({ update_type: 'invoice_paid' }))).toBeNull();
  });

  test('parseWebhook with expired status', () => {
    const body = JSON.stringify({
      update_id: 2,
      update_type: 'invoice_paid',
      request_date: '2026-10-03T00:00:00.000Z',
      payload: { invoice_id: 999, status: 'expired', amount: '5.00', fiat: 'USD', currency_type: 'fiat', payload: 'PAY-XYZ' },
    });
    const ev = provider().parseWebhook(new Headers(), body);
    expect(ev).toMatchObject({ providerRef: '999', code: 'PAY-XYZ', status: 'expired' });
  });
});

describe('cryptobot API calls', () => {
  test('createInvoice: USD fiat invoice with accepted assets on testnet', async () => {
    const ff = fakeFetch({
      '/createInvoice': {
        ok: true,
        result: { invoice_id: 77, status: 'active', bot_invoice_url: 'https://t.me/CryptoTestnetBot?start=IVabc', expiration_date: '2026-10-03T00:15:00Z' },
      },
    });
    const inv = await provider(ff.fetch).createInvoice({
      code: 'PAY-ABC',
      method: 'CRYPTO',
      purpose: 'topup',
      amount: 150,
      payAmount: 1.5,
      payCurrency: 'USD',
      expiresAt: new Date('2026-10-03T00:15:00Z'),
      description: 'TokoBun top-up',
      customer: { userId: 1 },
      callbackUrl: null,
    });
    const c = ff.calls[0]!;
    expect(c.url).toBe('https://testnet-pay.crypt.bot/api/createInvoice');
    expect(c.headers['crypto-pay-api-token']).toBe(TOKEN);
    expect(c.body).toMatchObject({
      currency_type: 'fiat',
      fiat: 'USD',
      amount: '1.50',
      accepted_assets: 'USDT,TON,BTC',
      payload: 'PAY-ABC',
      expires_in: 900,
    });
    expect(inv).toMatchObject({ providerRef: '77', payAmount: '1.50', feePay: 0, checkoutUrl: 'https://t.me/CryptoTestnetBot?start=IVabc' });
  });

  test('createInvoice adds the configured fee (bp) and uses mainnet host', async () => {
    const ff = fakeFetch({ '/createInvoice': { ok: true, result: { invoice_id: 1, status: 'active', bot_invoice_url: 'u' } } });
    const inv = await provider(ff.fetch, false, 300).createInvoice({
      code: 'PAY-1',
      method: 'CRYPTO',
      purpose: 'order',
      amount: 1000,
      payAmount: 10,
      payCurrency: 'USD',
      expiresAt: new Date('2026-10-03T00:15:00Z'),
      description: 'x',
      customer: { userId: 1 },
      callbackUrl: null,
    });
    expect(ff.calls[0]!.url).toBe('https://pay.crypt.bot/api/createInvoice');
    expect((ff.calls[0]!.body as { amount: string }).amount).toBe('10.30');
    expect(inv.feePay).toBe(0.3);
  });

  test('getStatus reads getInvoices items', async () => {
    const ff = fakeFetch({ '/getInvoices': { ok: true, result: { items: [{ invoice_id: 77, status: 'paid' }] } } });
    expect((await provider(ff.fetch).getStatus({ code: 'P', providerRef: '77', method: 'CRYPTO' })).status).toBe('paid');
    expect(ff.calls[0]!.body).toEqual({ invoice_ids: '77' });
  });

  test('API errors are thrown', async () => {
    const ff = fakeFetch({ '/getInvoices': { ok: false, error: { code: 401, name: 'UNAUTHORIZED' } } });
    await expect(provider(ff.fetch).getStatus({ code: 'P', providerRef: '1', method: 'CRYPTO' })).rejects.toThrow('UNAUTHORIZED');
  });

  test('methods returns a single CRYPTO USD method', async () => {
    const ms = await provider().methods(null);
    expect(ms).toHaveLength(1);
    expect(ms[0]).toMatchObject({ method: 'CRYPTO', kind: 'crypto', payCurrency: 'USD', minPay: 0.1, maxPay: null });
  });

  test('methods label reflects configured assets', async () => {
    const p = createCryptoBotProvider({ token: TOKEN, testnet: true, assets: 'USDT,BTC' });
    const ms = await p.methods(null);
    expect(ms[0]!.label).toContain('USDT/BTC');
  });
});

describe('CRYPTOBOT_METHOD constant', () => {
  test('equals "CRYPTO"', async () => {
    const { CRYPTOBOT_METHOD } = await import('../src/providers/cryptobot');
    expect(CRYPTOBOT_METHOD).toBe('CRYPTO');
  });
});

describe('cryptobotStatus edge cases', () => {
  test('empty string → pending', () => expect(cryptobotStatus('')).toBe('pending'));
  test('unknown string → pending', () => expect(cryptobotStatus('refunded')).toBe('pending'));
  test('number → pending', () => expect(cryptobotStatus(42)).toBe('pending'));
  test('boolean → pending', () => expect(cryptobotStatus(false)).toBe('pending'));
  test('object → pending', () => expect(cryptobotStatus({})).toBe('pending'));
  test('EXPIRED uppercase → expired', () => expect(cryptobotStatus('EXPIRED')).toBe('expired'));
  test('Expired mixed case → expired', () => expect(cryptobotStatus('Expired')).toBe('expired'));
  test('Paid mixed case → paid', () => expect(cryptobotStatus('Paid')).toBe('paid'));
  test('Active mixed case → pending', () => expect(cryptobotStatus('Active')).toBe('pending'));
  test('whitespace-padded "paid" → pending (not trimmed)', () => expect(cryptobotStatus(' paid ')).toBe('pending'));
});

describe('cryptobotWebhookSignature known vector', () => {
  test('produces deterministic hex for fixed token and body', () => {
    const body = '{"test":true}';
    const sig = cryptobotWebhookSignature(body, TOKEN);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(sig).toBe(docSignature(TOKEN, body));
  });

  test('different body produces different signature', () => {
    const s1 = cryptobotWebhookSignature('{"a":1}', TOKEN);
    const s2 = cryptobotWebhookSignature('{"a":2}', TOKEN);
    expect(s1).not.toBe(s2);
  });

  test('different token produces different signature', () => {
    const s1 = cryptobotWebhookSignature(UPDATE, TOKEN);
    const s2 = cryptobotWebhookSignature(UPDATE, 'other-token');
    expect(s1).not.toBe(s2);
  });

  test('empty body still produces valid hex', () => {
    const sig = cryptobotWebhookSignature('', TOKEN);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('cryptobot provider config edge cases', () => {
  test('isConfigured returns false when token is empty', () => {
    const p = createCryptoBotProvider({ token: '', testnet: true });
    expect(p.isConfigured()).toBe(false);
  });

  test('isConfigured returns true when token is set', () => {
    expect(provider().isConfigured()).toBe(true);
  });

  test('verifyWebhook returns false when token is empty', () => {
    const p = createCryptoBotProvider({ token: '', testnet: true });
    const h = new Headers({ 'crypto-pay-api-signature': 'anything' });
    expect(p.verifyWebhook(h, UPDATE)).toBe(false);
  });

  test('webhookAck returns 200 text OK', () => {
    const ack = provider().webhookAck();
    expect(ack).toEqual({ status: 200, body: 'OK', contentType: 'text' });
  });

  test('name is cryptobot', () => {
    expect(provider().name).toBe('cryptobot');
  });

  test('empty assets config falls back to USDT/TON/BTC', async () => {
    const p = createCryptoBotProvider({ token: TOKEN, testnet: true, assets: '' });
    const ms = await p.methods(null);
    expect(ms[0]!.label).toContain('USDT/TON/BTC');
  });

  test('assets with whitespace are trimmed and uppercased', async () => {
    const p = createCryptoBotProvider({ token: TOKEN, testnet: true, assets: ' usdt , ton ' });
    const ms = await p.methods(null);
    expect(ms[0]!.label).toContain('USDT/TON');
  });
});

describe('cryptobot getStatus edge cases', () => {
  test('null providerRef returns pending without API call', async () => {
    const ff = fakeFetch({});
    const result = await provider(ff.fetch).getStatus({ code: 'P', providerRef: null, method: 'CRYPTO' });
    expect(result.status).toBe('pending');
    expect(ff.calls).toHaveLength(0);
  });

  test('invoice not found in response returns pending', async () => {
    const ff = fakeFetch({ '/getInvoices': { ok: true, result: { items: [{ invoice_id: 999, status: 'paid' }] } } });
    const result = await provider(ff.fetch).getStatus({ code: 'P', providerRef: '77', method: 'CRYPTO' });
    expect(result.status).toBe('pending');
  });

  test('getInvoices returns plain array (not items wrapper)', async () => {
    const ff = fakeFetch({ '/getInvoices': { ok: true, result: [{ invoice_id: 77, status: 'expired' }] } });
    const result = await provider(ff.fetch).getStatus({ code: 'P', providerRef: '77', method: 'CRYPTO' });
    expect(result.status).toBe('expired');
  });
});

describe('cryptobot cancelInvoice', () => {
  test('calls deleteInvoice with numeric invoice_id', async () => {
    const ff = fakeFetch({ '/deleteInvoice': { ok: true, result: true } });
    await provider(ff.fetch).cancelInvoice!({ code: 'P', providerRef: '42', method: 'CRYPTO' });
    expect(ff.calls[0]!.body).toEqual({ invoice_id: 42 });
  });

  test('skips call when providerRef is null', async () => {
    const ff = fakeFetch({});
    await provider(ff.fetch).cancelInvoice!({ code: 'P', providerRef: null, method: 'CRYPTO' });
    expect(ff.calls).toHaveLength(0);
  });
});
