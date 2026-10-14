import { describe, expect, test } from 'bun:test';
import type { View } from '../src/util/view';
import {
  topupMethodsScreen,
  topupAmountScreen,
  orderMethodsScreen,
  invoiceScreen,
  invoiceClosedScreen,
  topupDoneScreen,
} from '../src/screens/payment';

function mockView(): View {
  return {
    lang: 'en',
    currency: 'USD',
    tzOffset: 0,
    t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
    tp: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
    money: (amount) => `$${amount}`,
    date: (d) => d.toISOString(),
  };
}

describe('topupMethodsScreen', () => {
  test('no methods shows empty message', () => {
    const v = mockView();
    const s = topupMethodsScreen(v, { methods: [], balance: 1000, min: 100 });
    expect(s.text).toBe('topup.noMethods');
    expect(s.keyboard).toHaveLength(1);
  });

  test('with methods shows method buttons + back', () => {
    const v = mockView();
    const methods = [
      { provider: 'tripay', method: 'QRIS', label: 'QRIS', kind: 'qris' as const, payCurrency: 'IDR', minAmount: 0, maxAmount: null },
      { provider: 'tripay', method: 'BRIVA', label: 'BRI VA', kind: 'va' as const, payCurrency: 'IDR', minAmount: 0, maxAmount: null },
    ];
    const s = topupMethodsScreen(v, { methods, balance: 5000, min: 1000 });
    expect(s.text).toContain('topup.methods');
    expect(s.keyboard.length).toBeGreaterThanOrEqual(2);
    const flat = s.keyboard.flat();
    expect(flat.some((b) => b.text.includes('QRIS'))).toBe(true);
  });
});

describe('topupAmountScreen', () => {
  test('shows ask amount text with cancel button', () => {
    const v = mockView();
    const method = { provider: 'tripay', method: 'QRIS', label: 'QRIS', kind: 'qris' as const, payCurrency: 'IDR', minAmount: 0, maxAmount: null };
    const s = topupAmountScreen(v, { method, currency: 'IDR', example: '50000', min: 10000 });
    expect(s.text).toContain('topup.askAmount');
    expect(s.keyboard.flat().some((b) => b.text.includes('cancel') || b.text.includes('common.cancel'))).toBe(true);
  });
});

describe('orderMethodsScreen', () => {
  test('no methods shows empty message', () => {
    const v = mockView();
    const product = { id: 1, name: 'Test', price: 100, stock: 10 } as any;
    const s = orderMethodsScreen(v, { product, qty: 2, total: 200, methods: [] });
    expect(s.text).toBe('pay.noMethods');
  });

  test('with methods shows method buttons', () => {
    const v = mockView();
    const product = { id: 1, name: 'Test', price: 100, stock: 10 } as any;
    const methods = [
      { provider: 'tripay', method: 'QRIS', label: 'QRIS', kind: 'qris' as const, payCurrency: 'IDR', minAmount: 0, maxAmount: null },
    ];
    const s = orderMethodsScreen(v, { product, qty: 1, total: 100, methods });
    expect(s.text).toContain('pay.methods');
    const flat = s.keyboard.flat();
    expect(flat.some((b) => b.text === 'QRIS')).toBe(true);
  });
});

describe('invoiceScreen', () => {
  const pendingPayment = {
    id: 1,
    code: 'PAY-ABC',
    status: 'pending' as const,
    purpose: 'topup' as const,
    provider: 'tripay',
    method: 'QRIS',
    amount: 5000,
    fee: 100,
    payCurrency: 'IDR',
    payAmount: '81500',
    checkoutUrl: 'https://pay.example.com',
    qrString: '0002...',
    expiresAt: new Date('2026-10-15T00:15:00Z'),
    orderId: null,
  };

  test('pending payment shows invoice with check+cancel buttons', () => {
    const v = mockView();
    const s = invoiceScreen(v, { payment: pendingPayment });
    expect(s.text).toContain('invoice.title');
    expect(s.text).toContain('invoice.amount');
    expect(s.text).toContain('invoice.fee');
    const flat = s.keyboard.flat();
    expect(flat.some((b) => b.text.includes('invoice.check'))).toBe(true);
    expect(flat.some((b) => b.text.includes('invoice.cancel'))).toBe(true);
  });

  test('pending payment with checkoutUrl shows URL button', () => {
    const v = mockView();
    const s = invoiceScreen(v, { payment: pendingPayment });
    const flat = s.keyboard.flat();
    expect(flat.some((b) => 'url' in b && b.url === 'https://pay.example.com')).toBe(true);
  });

  test('pending payment without fee omits fee line', () => {
    const v = mockView();
    const noFee = { ...pendingPayment, fee: 0 };
    const s = invoiceScreen(v, { payment: noFee });
    expect(s.text).not.toContain('invoice.fee');
  });

  test('pending payment with qrPng sets photo', () => {
    const v = mockView();
    const qrPng = new Uint8Array([1, 2, 3]);
    const s = invoiceScreen(v, { payment: pendingPayment, qrPng });
    expect(s.photo).toBe(qrPng);
    expect(s.text).toContain('invoice.scanQr');
  });

  test('non-pending payment shows closed screen', () => {
    const v = mockView();
    const paid = { ...pendingPayment, status: 'paid' as const };
    const s = invoiceScreen(v, { payment: paid });
    expect(s.text).toContain('invoice.closed');
  });

  test('payment without expiresAt omits expires line', () => {
    const v = mockView();
    const noExpiry = { ...pendingPayment, expiresAt: null };
    const s = invoiceScreen(v, { payment: noExpiry });
    expect(s.text).not.toContain('invoice.expires');
  });

  test('payment without checkoutUrl omits URL button', () => {
    const v = mockView();
    const noUrl = { ...pendingPayment, checkoutUrl: null };
    const s = invoiceScreen(v, { payment: noUrl });
    const flat = s.keyboard.flat();
    expect(flat.every((b) => !('url' in b))).toBe(true);
  });
});

describe('invoiceClosedScreen', () => {
  test('shows closed text with main menu button', () => {
    const v = mockView();
    const payment = {
      id: 1, code: 'PAY-XYZ', status: 'paid' as const, purpose: 'topup' as const,
      provider: 'tripay', method: 'QRIS', amount: 1000, fee: 0,
      payCurrency: 'IDR', payAmount: '16300', checkoutUrl: null,
      qrString: null, expiresAt: null, orderId: null,
    };
    const s = invoiceClosedScreen(v, payment);
    expect(s.text).toContain('invoice.closed');
    expect(s.text).toContain('PAY-XYZ');
    const flat = s.keyboard.flat();
    expect(flat.some((b) => b.text.includes('common.mainMenu'))).toBe(true);
  });
});

describe('topupDoneScreen', () => {
  test('shows text with shop + main menu buttons', () => {
    const v = mockView();
    const s = topupDoneScreen(v, 'Top up of $50 credited!');
    expect(s.text).toBe('Top up of $50 credited!');
    const flat = s.keyboard.flat();
    expect(flat.some((b) => b.text.includes('menu.shop'))).toBe(true);
    expect(flat.some((b) => b.text.includes('common.mainMenu'))).toBe(true);
  });
});
