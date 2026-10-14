import { describe, expect, test } from 'bun:test';
import { createHmac } from 'node:crypto';
import { createTripayProvider, TRIPAY_CHANNELS, tripayCallbackSignature, tripayKind, tripayStatus, tripayTransactionSignature } from '../src/providers/tripay';
import { hmacSha256Hex } from '../src/signature';
import { fakeFetch, type RecordedCall } from './helpers';

const PRIVATE_KEY = 'private_key_anda';

// Callback body exactly as documented at https://tripay.co.id/developer?tab=transaction-create#callback
const DOC_CALLBACK = JSON.stringify({
  reference: 'T0001000023000XXXXX',
  merchant_ref: 'INV123456',
  payment_method: 'BCA Virtual Account',
  payment_method_code: 'BCAVA',
  total_amount: 200000,
  fee_merchant: 2000,
  fee_customer: 0,
  total_fee: 2000,
  amount_received: 198000,
  is_closed_payment: 1,
  status: 'PAID',
  paid_at: 1608133017,
  note: null,
});

function provider(fetchFn?: ReturnType<typeof fakeFetch>['fetch'], sandbox = true) {
  return createTripayProvider({
    apiKey: 'api_key_anda',
    privateKey: PRIVATE_KEY,
    merchantCode: 'T0001',
    sandbox,
    fetch: fetchFn,
    now: () => new Date('2026-10-03T00:00:00Z'),
  });
}

describe('HMAC primitive', () => {
  test('RFC 4231 test case 2', () => {
    expect(hmacSha256Hex('Jefe', 'what do ya want for nothing?')).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    );
  });
});

describe('tripayKind', () => {
  test('QRIS variants → qris', () => {
    expect(tripayKind('QRIS')).toBe('qris');
    expect(tripayKind('QRISC')).toBe('qris');
    expect(tripayKind('QRIS2')).toBe('qris');
    expect(tripayKind('QRIS_SHOPEEPAY')).toBe('qris');
  });

  test('VA channels → va', () => {
    expect(tripayKind('BCAVA')).toBe('va');
    expect(tripayKind('BRIVA')).toBe('va');
    expect(tripayKind('MANDIRIVA')).toBe('va');
  });

  test('retail channels → retail', () => {
    expect(tripayKind('ALFAMART')).toBe('retail');
    expect(tripayKind('INDOMARET')).toBe('retail');
    expect(tripayKind('ALFAMIDI')).toBe('retail');
  });

  test('e-wallets → ewallet', () => {
    expect(tripayKind('OVO')).toBe('ewallet');
    expect(tripayKind('DANA')).toBe('ewallet');
    expect(tripayKind('SHOPEEPAY')).toBe('ewallet');
  });

  test('case insensitive', () => {
    expect(tripayKind('qris')).toBe('qris');
    expect(tripayKind('briva')).toBe('va');
  });

  test('unknown channel code falls back to ewallet', () => {
    expect(tripayKind('NEWMETHOD')).toBe('ewallet');
    expect(tripayKind('')).toBe('ewallet');
  });
});

describe('tripayStatus', () => {
  test('maps PAID → paid', () => expect(tripayStatus('PAID')).toBe('paid'));
  test('maps EXPIRED → expired', () => expect(tripayStatus('EXPIRED')).toBe('expired'));
  test('maps FAILED → failed', () => expect(tripayStatus('FAILED')).toBe('failed'));
  test('maps REFUND → failed', () => expect(tripayStatus('REFUND')).toBe('failed'));
  test('maps UNPAID → pending', () => expect(tripayStatus('UNPAID')).toBe('pending'));
  test('maps null/undefined → pending', () => {
    expect(tripayStatus(null)).toBe('pending');
    expect(tripayStatus(undefined)).toBe('pending');
  });
  test('case insensitive', () => expect(tripayStatus('paid')).toBe('paid'));
});

describe('tripay signatures', () => {
  test('transaction signature = HMAC-SHA256(merchantCode+merchantRef+amount, privateKey)', () => {
    // same computation as the documented NodeJS example
    const expected = createHmac('sha256', PRIVATE_KEY).update('T0001' + 'INV345675' + 1000000).digest('hex');
    expect(tripayTransactionSignature('T0001', 'INV345675', 1000000, PRIVATE_KEY)).toBe(expected);
  });

  test('valid X-Callback-Signature is accepted', () => {
    const sig = createHmac('sha256', PRIVATE_KEY).update(DOC_CALLBACK).digest('hex');
    expect(tripayCallbackSignature(DOC_CALLBACK, PRIVATE_KEY)).toBe(sig);
    const headers = new Headers({ 'X-Callback-Signature': sig, 'X-Callback-Event': 'payment_status' });
    expect(provider().verifyWebhook(headers, DOC_CALLBACK)).toBe(true);
  });

  test('invalid / missing / tampered signatures are rejected', () => {
    const sig = tripayCallbackSignature(DOC_CALLBACK, PRIVATE_KEY);
    const p = provider();
    expect(p.verifyWebhook(new Headers({ 'X-Callback-Signature': 'deadbeef' }), DOC_CALLBACK)).toBe(false);
    expect(p.verifyWebhook(new Headers(), DOC_CALLBACK)).toBe(false);
    expect(p.verifyWebhook(new Headers({ 'X-Callback-Signature': sig }), DOC_CALLBACK.replace('200000', '900000'))).toBe(false);
    const wrongKey = tripayCallbackSignature(DOC_CALLBACK, 'other');
    expect(p.verifyWebhook(new Headers({ 'X-Callback-Signature': wrongKey }), DOC_CALLBACK)).toBe(false);
  });

  test('parseWebhook maps the documented payload', () => {
    const ev = provider().parseWebhook(new Headers({ 'X-Callback-Event': 'payment_status' }), DOC_CALLBACK);
    expect(ev).toMatchObject({ providerRef: 'T0001000023000XXXXX', code: 'INV123456', status: 'paid', paidAmount: 200000 });
    const expired = provider().parseWebhook(new Headers(), DOC_CALLBACK.replace('"PAID"', '"EXPIRED"'));
    expect(expired?.status).toBe('expired');
    expect(provider().parseWebhook(new Headers({ 'X-Callback-Event': 'other' }), DOC_CALLBACK)).toBeNull();
  });
});

describe('tripay API calls', () => {
  test('createInvoice: fee gross-up, signature, sandbox URL, QR string', async () => {
    const ff = fakeFetch({
      '/merchant/fee-calculator': {
        success: true,
        data: [{ code: 'QRIS', fee: { flat: 750, percent: '0.70' }, total_fee: { merchant: 864, customer: 0 } }],
      },
      '/transaction/create': (c: RecordedCall) => ({
        success: true,
        data: {
          reference: 'T123',
          amount: (c.body as { amount: number }).amount,
          fee_customer: 0,
          checkout_url: 'https://tripay.co.id/checkout/T123',
          qr_string: '00020101021226...',
          expired_time: 1791000000,
        },
      }),
    });
    const inv = await provider(ff.fetch).createInvoice({
      code: 'PAY-ABC',
      method: 'QRIS',
      purpose: 'topup',
      amount: 100,
      payAmount: 16300,
      payCurrency: 'IDR',
      expiresAt: new Date('2026-10-03T00:15:00Z'),
      description: 'TokoBun top-up',
      customer: { userId: 42 },
      callbackUrl: 'https://api.example.com/webhooks/tripay',
    });
    expect(ff.calls[0]!.url).toBe('https://tripay.co.id/api-sandbox/merchant/fee-calculator?code=QRIS&amount=16300');
    expect(ff.calls[0]!.headers.authorization).toBe('Bearer api_key_anda');
    const create = ff.calls[1]!;
    expect(create.url).toBe('https://tripay.co.id/api-sandbox/transaction/create');
    expect(create.method).toBe('POST');
    const body = create.body as Record<string, unknown>;
    // 864 merchant fee + 0.7% of it (7) is added on top of the base amount
    expect(body.amount).toBe(16300 + 871);
    expect(body.merchant_ref).toBe('PAY-ABC');
    expect(body.signature).toBe(tripayTransactionSignature('T0001', 'PAY-ABC', 17171, PRIVATE_KEY));
    expect(body.expired_time).toBe(Math.ceil(new Date('2026-10-03T00:15:00Z').getTime() / 1000));
    expect(body.callback_url).toBe('https://api.example.com/webhooks/tripay');
    expect(body.order_items).toEqual([{ sku: 'TOPUP', name: 'TokoBun top-up', price: 17171, quantity: 1 }]);
    expect(inv).toMatchObject({
      providerRef: 'T123',
      payAmount: '17171',
      feePay: 871,
      qrString: '00020101021226...',
      checkoutUrl: 'https://tripay.co.id/checkout/T123',
    });
    expect(inv.expiresAt?.getTime()).toBe(1791000000 * 1000);
  });

  test('createInvoice clamps expiry to the channel minimum (BRIVA = 60 min)', async () => {
    const ff = fakeFetch({
      '/merchant/fee-calculator': { success: true, data: [{ code: 'BRIVA', total_fee: { merchant: 0, customer: 4250 } }] },
      '/transaction/create': (c: RecordedCall) => ({
        success: true,
        data: { reference: 'T9', amount: (c.body as { amount: number }).amount + 4250, fee_customer: 4250 },
      }),
    });
    const inv = await provider(ff.fetch, false).createInvoice({
      code: 'PAY-X',
      method: 'BRIVA',
      purpose: 'topup',
      amount: 100,
      payAmount: 16300,
      payCurrency: 'IDR',
      expiresAt: new Date('2026-10-03T00:15:00Z'),
      description: 'x',
      customer: { userId: 1 },
      callbackUrl: null,
    });
    expect(ff.calls[1]!.url).toBe('https://tripay.co.id/api/transaction/create');
    const body = ff.calls[1]!.body as Record<string, unknown>;
    expect(body.expired_time).toBe(Math.ceil(new Date('2026-10-03T01:00:00Z').getTime() / 1000));
    expect(body.amount).toBe(16300); // customer fee is added by Tripay, not by us
    expect(inv.payAmount).toBe('20550');
    expect(inv.feePay).toBe(4250);
  });

  test('getStatus maps transaction detail statuses', async () => {
    const ff = fakeFetch({ '/transaction/detail': { success: true, data: { status: 'PAID' } } });
    const s = await provider(ff.fetch).getStatus({ code: 'PAY-1', providerRef: 'T1', method: 'QRIS' });
    expect(s.status).toBe('paid');
    expect(ff.calls[0]!.url).toContain('/transaction/detail?reference=T1');
  });

  test('API error surfaces the Tripay message', async () => {
    const ff = fakeFetch({ '/transaction/detail': { success: false, message: 'Invalid API Key' } });
    await expect(provider(ff.fetch).getStatus({ code: 'P', providerRef: 'T1', method: 'QRIS' })).rejects.toThrow('Invalid API Key');
  });

  test('methods: only for Indonesia; static fallback when channel API fails', async () => {
    const ff = fakeFetch({});
    const p = provider(ff.fetch);
    expect(await p.methods('US')).toEqual([]);
    const ms = await p.methods('ID');
    expect(ms.find((m) => m.method === 'QRIS')).toMatchObject({ kind: 'qris', payCurrency: 'IDR', minPay: 1000 });
    expect(ms.find((m) => m.method === 'BRIVA')?.kind).toBe('va');
    expect(ms.find((m) => m.method === 'ALFAMART')?.kind).toBe('retail');
    expect(ms.find((m) => m.method === 'DANA')?.kind).toBe('ewallet');
  });

  test('methods: uses active channels from the API', async () => {
    const ff = fakeFetch({
      '/merchant/payment-channel': {
        success: true,
        data: [
          { code: 'QRIS', name: 'QRIS by ShopeePay', active: true, minimum_amount: 1000, maximum_amount: 5000000 },
          { code: 'BRIVA', name: 'BRI Virtual Account', active: false },
        ],
      },
    });
    const ms = await provider(ff.fetch).methods(null);
    expect(ms.map((m) => m.method)).toEqual(['QRIS']);
    expect(ms[0]!.minExpiryMinutes).toBe(10);
  });
});

describe('tripayKind exhaustive channel coverage', () => {
  test('all TRIPAY_CHANNELS codes map to the right kind', () => {
    for (const code of Object.keys(TRIPAY_CHANNELS)) {
      const kind = tripayKind(code);
      if (code.startsWith('QRIS')) expect(kind).toBe('qris');
      else if (code.endsWith('VA')) expect(kind).toBe('va');
      else if (['ALFAMART', 'INDOMARET', 'ALFAMIDI'].includes(code)) expect(kind).toBe('retail');
      else expect(kind).toBe('ewallet');
    }
  });

  test('all VA channels in TRIPAY_CHANNELS end with VA', () => {
    const vaCodes = Object.keys(TRIPAY_CHANNELS).filter((c) => c.endsWith('VA'));
    expect(vaCodes.length).toBeGreaterThanOrEqual(10);
    for (const code of vaCodes) expect(tripayKind(code)).toBe('va');
  });

  test('OTHERBANKVA → va', () => expect(tripayKind('OTHERBANKVA')).toBe('va'));
  test('DANAMONVA → va', () => expect(tripayKind('DANAMONVA')).toBe('va'));
  test('OCBCVA → va', () => expect(tripayKind('OCBCVA')).toBe('va'));
  test('CIMBVA → va', () => expect(tripayKind('CIMBVA')).toBe('va'));
  test('BSIVA → va', () => expect(tripayKind('BSIVA')).toBe('va'));
  test('MUAMALATVA → va', () => expect(tripayKind('MUAMALATVA')).toBe('va'));
  test('PERMATAVA → va', () => expect(tripayKind('PERMATAVA')).toBe('va'));
  test('BNIVA → va', () => expect(tripayKind('BNIVA')).toBe('va'));
});

describe('tripayStatus edge cases', () => {
  test('empty string → pending', () => expect(tripayStatus('')).toBe('pending'));
  test('number 0 → pending', () => expect(tripayStatus(0)).toBe('pending'));
  test('random string → pending', () => expect(tripayStatus('PROCESSING')).toBe('pending'));
  test('lowercase refund → failed', () => expect(tripayStatus('refund')).toBe('failed'));
  test('mixed case Expired → expired', () => expect(tripayStatus('Expired')).toBe('expired'));
  test('boolean false → pending', () => expect(tripayStatus(false)).toBe('pending'));
});

describe('TRIPAY_CHANNELS integrity', () => {
  test('every channel has positive min < max', () => {
    for (const [code, ch] of Object.entries(TRIPAY_CHANNELS)) {
      expect(ch.min).toBeGreaterThan(0);
      expect(ch.max).toBeGreaterThan(ch.min);
    }
  });

  test('every channel has valid expiry: minExp > 0, maxExp >= minExp', () => {
    for (const [code, ch] of Object.entries(TRIPAY_CHANNELS)) {
      expect(ch.minExp).toBeGreaterThan(0);
      expect(ch.maxExp).toBeGreaterThanOrEqual(ch.minExp);
    }
  });

  test('every channel has a non-empty label', () => {
    for (const ch of Object.values(TRIPAY_CHANNELS)) {
      expect(ch.label.length).toBeGreaterThan(0);
    }
  });

  test('channel count matches expected (21 channels)', () => {
    expect(Object.keys(TRIPAY_CHANNELS).length).toBe(21);
  });
});

describe('tripay signatures edge cases', () => {
  test('transaction signature with zero amount', () => {
    const sig = tripayTransactionSignature('MC', 'REF', 0, 'key');
    const expected = createHmac('sha256', 'key').update('MCREF0').digest('hex');
    expect(sig).toBe(expected);
  });

  test('transaction signature with large amount', () => {
    const sig = tripayTransactionSignature('MC', 'REF', 99999999, 'key');
    const expected = createHmac('sha256', 'key').update('MCREF99999999').digest('hex');
    expect(sig).toBe(expected);
  });

  test('callback signature with empty body', () => {
    const sig = tripayCallbackSignature('', 'key');
    const expected = createHmac('sha256', 'key').update('').digest('hex');
    expect(sig).toBe(expected);
  });

  test('different private keys produce different signatures', () => {
    const s1 = tripayTransactionSignature('MC', 'REF', 1000, 'key1');
    const s2 = tripayTransactionSignature('MC', 'REF', 1000, 'key2');
    expect(s1).not.toBe(s2);
  });
});

describe('parseWebhook edge cases', () => {
  test('open payment (is_closed_payment=0) returns null', () => {
    const body = JSON.stringify({ reference: 'T1', merchant_ref: 'INV1', status: 'PAID', total_amount: 100000, is_closed_payment: 0 });
    expect(provider().parseWebhook(new Headers(), body)).toBeNull();
  });

  test('missing reference and merchant_ref returns nulls in event', () => {
    const body = JSON.stringify({ status: 'PAID', total_amount: 50000, is_closed_payment: 1 });
    const ev = provider().parseWebhook(new Headers(), body);
    expect(ev).toMatchObject({ providerRef: null, code: null, status: 'paid', paidAmount: 50000 });
  });

  test('missing total_amount returns null paidAmount', () => {
    const body = JSON.stringify({ reference: 'T1', merchant_ref: 'INV1', status: 'EXPIRED', is_closed_payment: 1 });
    const ev = provider().parseWebhook(new Headers(), body);
    expect(ev).toMatchObject({ providerRef: 'T1', code: 'INV1', status: 'expired', paidAmount: null });
  });

  test('no x-callback-event header still parses (event is optional)', () => {
    const body = JSON.stringify({ reference: 'T1', merchant_ref: 'INV1', status: 'PAID', total_amount: 100, is_closed_payment: 1 });
    const ev = provider().parseWebhook(new Headers(), body);
    expect(ev?.status).toBe('paid');
  });

  test('non-payment_status event returns null', () => {
    const body = JSON.stringify({ reference: 'T1', merchant_ref: 'INV1', status: 'PAID', is_closed_payment: 1 });
    expect(provider().parseWebhook(new Headers({ 'X-Callback-Event': 'refund' }), body)).toBeNull();
  });

  test('webhookAck returns Tripay-expected format', () => {
    const ack = provider().webhookAck();
    expect(ack).toEqual({ status: 200, body: { success: true }, contentType: 'json' });
  });
});

describe('getStatus edge cases', () => {
  test('null providerRef returns pending without API call', async () => {
    const ff = fakeFetch({});
    const s = await provider(ff.fetch).getStatus({ code: 'PAY-1', providerRef: null, method: 'QRIS' });
    expect(s.status).toBe('pending');
    expect(ff.calls.length).toBe(0);
  });
});

describe('isConfigured', () => {
  test('true when all keys set', () => {
    expect(provider().isConfigured()).toBe(true);
  });

  test('false when apiKey is empty', () => {
    const p = createTripayProvider({ apiKey: '', privateKey: 'k', merchantCode: 'M', sandbox: true });
    expect(p.isConfigured()).toBe(false);
  });

  test('false when privateKey is empty', () => {
    const p = createTripayProvider({ apiKey: 'k', privateKey: '', merchantCode: 'M', sandbox: true });
    expect(p.isConfigured()).toBe(false);
  });

  test('false when merchantCode is empty', () => {
    const p = createTripayProvider({ apiKey: 'k', privateKey: 'k', merchantCode: '', sandbox: true });
    expect(p.isConfigured()).toBe(false);
  });
});

describe('verifyWebhook edge cases', () => {
  test('empty privateKey rejects', () => {
    const p = createTripayProvider({ apiKey: 'k', privateKey: '', merchantCode: 'M', sandbox: true });
    const sig = tripayCallbackSignature('{}', 'key');
    expect(p.verifyWebhook(new Headers({ 'X-Callback-Signature': sig }), '{}')).toBe(false);
  });
});
