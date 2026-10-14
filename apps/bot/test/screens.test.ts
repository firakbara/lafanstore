import { describe, expect, test } from 'bun:test';
import type { ProductDetail, ProductListItem, ReferralStats, UserProfile } from '@tokobun/core';
import type { PaymentView } from '@tokobun/payments';
import { cb, decode } from '../src/callback';
import { callbacks } from '../src/handlers/router';
import type { Button, Keyboard } from '../src/keyboards';
import { apiRevokeConfirmScreen, apiScreen } from '../src/screens/api';
import { helpScreen, supportOpenedScreen } from '../src/screens/help';
import { mainMenuScreen } from '../src/screens/main';
import { moreScreen, ratingScreen, twofaPromptScreen, twofaResultScreen } from '../src/screens/more';
import { ledgerScreen, orderDetailScreen, ordersScreen } from '../src/screens/orders';
import { invoiceClosedScreen, invoiceScreen, orderMethodsScreen, topupAmountScreen, topupDoneScreen, topupMethodsScreen } from '../src/screens/payment';
import { productNoteScreen, productScreen, purchaseConfirmScreen, purchaseDoneScreen, voucherPromptScreen } from '../src/screens/product';
import { currencyScreen, languageScreen, notifyScreen, profileScreen, timezoneScreen } from '../src/screens/profile';
import { referralScreen, withdrawPromptScreen } from '../src/screens/referral';
import { shopScreen } from '../src/screens/shop';
import { withNotice, type Screen } from '../src/screens/types';
import { createView } from '../src/util/view';
import { copyBtn, pager, rows } from '../src/keyboards';

const v = createView({ lang: 'id', currency: 'USD', tzOffset: 420, money: (c) => `$${(c / 100).toFixed(2)}` });
const ve = createView({ lang: 'en', currency: 'USD', tzOffset: 0, money: (c) => `$${(c / 100).toFixed(2)}` });

const labels = (kb: Keyboard) => kb.map((row) => row.map((b) => b.text));
const flat = (kb: Keyboard) => kb.flat();
const data = (b: Button) => ('callback_data' in b ? b.callback_data : undefined);

/** Every callback button must decode to a registered action and fit in 64 bytes. */
function assertRoutable(screen: Screen) {
  for (const b of flat(screen.keyboard)) {
    const d = data(b);
    if (d === undefined) continue;
    expect(new TextEncoder().encode(d).length).toBeLessThanOrEqual(64);
    expect(callbacks[decode(d).action]).toBeDefined();
  }
}

const item = (over: Partial<ProductListItem> = {}): ProductListItem => ({
  id: 1,
  code: 'NFX',
  name: 'Netflix',
  icon: '🎬',
  customEmojiId: null,
  price: 250,
  isCollection: false,
  variantCount: 0,
  stock: 12,
  hasPromo: false,
  ...over,
});

const product = (over: Partial<ProductDetail> = {}): ProductDetail => ({
  ...item(),
  storeId: 1,
  parentId: null,
  parentName: null,
  warranty: '10d',
  note: '<b>Login</b> via email',
  discounts: [{ minQty: 150, percentBp: 600 }],
  isActive: true,
  ...over,
});

const user: UserProfile = {
  id: 42,
  username: 'buyer',
  firstName: 'Budi <script>',
  language: 'id',
  currency: 'USD',
  tzOffsetMinutes: 420,
  balance: 1000,
  referralCode: 'ABCD1234',
  notifyStock: true,
  notifyInfo: false,
  notifyReferral: true,
  isBanned: false,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

describe('main menu', () => {
  test('text and layout', () => {
    const s = mainMenuScreen(v, { balance: 1234, channelUrl: 'https://t.me/c' });
    expect(s.text).toBe('👋 Selamat datang di toko kami!\n\n💰 Saldo Anda: <b>$12.34</b>');
    expect(labels(s.keyboard)).toEqual([
      ['🛍 Toko'],
      ['💳 Isi Saldo', '👤 Profil Saya'],
      ['❓ Bantuan', '➕ Lainnya'],
      ['🎁 Dapatkan', '📢 Channel'],
    ]);
    expect(s.keyboard[3]![1]).toMatchObject({ url: 'https://t.me/c' });
    assertRoutable(s);
  });
  test('no channel button without url', () => {
    expect(mainMenuScreen(v, { balance: 0, channelUrl: null }).keyboard[3]!.length).toBe(1);
  });
});

describe('shop list', () => {
  const page = {
    items: [item(), item({ id: 2, name: 'Spotify', stock: 0 }), item({ id: 3, name: 'Canva', stock: null }), item({ id: 4, name: 'Claude', isCollection: true, variantCount: 2, customEmojiId: '555' })],
    page: 1,
    totalPages: 5,
    total: 70,
  };
  const s = shopScreen(v, { page, sort: 'all', parent: null });

  test('labels and colors', () => {
    const [a, b, c, d] = s.keyboard.map((r) => r[0]!);
    expect(a!.text).toBe('🎬 Netflix - $2.50 (Stok: 12)');
    expect(a!.style).toBe('success');
    expect(b!.style).toBe('danger');
    expect(c!.text).toContain('(Stok: ∞)');
    expect(d!.text).toBe('Claude (Paket: 2)'); // custom emoji replaces the plain icon
    expect(d!.icon_custom_emoji_id).toBe('555');
    expect(data(d!)).toBe(cb.shop(1, 'all', 4));
    expect(data(a!)).toBe(cb.product(1, 1));
  });

  test('controls rows', () => {
    const rows = labels(s.keyboard).slice(-3);
    expect(rows).toEqual([['🔄 Segarkan', 'Urutkan: Semua'], ['‹ Sebelumnya', '1/5', 'Berikutnya ›'], ['⬅️ Kembali']]);
    const ctrl = s.keyboard.at(-3)!;
    expect(data(ctrl[1]!)).toBe(cb.shop(1, 'available'));
    expect(data(ctrl[0]!)).toBe(cb.shopRefresh(1, 'all'));
    const nav = s.keyboard.at(-2)!;
    expect(data(nav[0]!)).toBe(cb.shop(5, 'all')); // wraps around
    expect(data(nav[2]!)).toBe(cb.shop(2, 'all'));
    expect(data(s.keyboard.at(-1)![0]!)).toBe(cb.main());
    assertRoutable(s);
  });

  test('variant list goes back to the shop and has no pager when single page', () => {
    const vs = shopScreen(v, { page: { ...page, totalPages: 1 }, sort: 'promo', parent: { id: 4, name: 'Claude' } });
    expect(vs.text).toContain('Claude');
    expect(data(vs.keyboard.at(-1)![0]!)).toBe(cb.shop(1, 'all'));
    expect(labels(vs.keyboard).at(-2)).toEqual(['🔄 Segarkan', 'Urutkan: Promo']);
  });

  test('empty list', () => {
    expect(shopScreen(v, { page: { items: [], page: 1, totalPages: 1, total: 0 }, sort: 'soldout', parent: null }).text).toContain('Belum ada produk');
  });
});

describe('product detail', () => {
  const base = {
    product: product(),
    qty: 3,
    typing: true,
    quote: {
      productId: 1, quantity: 3, unitPrice: 250, subtotal: 750, discountBp: 0, discountAmount: 0,
      voucherCode: null, voucherDiscount: 0, total: 750, nextTier: { minQty: 150, percentBp: 600 },
    },
    balance: 1000,
    shareLink: 'https://t.me/shop_bot?start=product_NFX',
    directPay: true,
  };

  test('text labels', () => {
    const s = productScreen(v, base);
    expect(s.text).toBe(
      [
        '📦 Produk: <b>Netflix</b>',
        '🏷 Harga Dasar: $2.50',
        '📊 Stok Tersedia: 12',
        '🗂 Koleksi: -',
        '🛡 Garansi: 10d',
        '🎁 Promo: Beli 150+ → -6.0% Diskon',
        '',
        '🧮 Kuantitas: 3',
        '💵 Total Harga: <b>$7.50</b>',
        '💰 Saldo: $10.00',
      ].join('\n'),
    );
  });

  test('keyboard layout, styles, keypad callbacks, copy_text', () => {
    const s = productScreen(v, base);
    expect(labels(s.keyboard)).toEqual([
      ['Jml: 3', 'Del'],
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
      ['0'],
      ['🛒 Beli dengan saldo'],
      ['⚡ Bayar langsung', '🎟 Pakai voucher'],
      ['🔗 Bagikan Tautan', '📝 Lihat Catatan'],
      ['⬅️ Kembali'],
    ]);
    expect(s.keyboard[0]![0]!.style).toBe('primary');
    expect(s.keyboard[0]![1]!.style).toBe('danger');
    expect(data(s.keyboard[0]![1]!)).toBe(cb.product(1, 1, false)); // 3 → del → empty → 1
    expect(data(s.keyboard[1]![0]!)).toBe(cb.product(1, 12, true)); // 3,1 → 31 capped at stock 12
    expect(data(s.keyboard[4]![0]!)).toBe(cb.product(1, 12, true)); // 3,0 → 30 capped at stock 12
    expect(s.keyboard[5]![0]!.style).toBe('success');
    expect(s.keyboard[7]![0]).toMatchObject({ copy_text: { text: base.shareLink } });
    assertRoutable(s);
  });

  test('balance short → Isi Saldo, discount + voucher lines', () => {
    const s = productScreen(v, {
      ...base,
      balance: 100,
      quote: { ...base.quote, discountBp: 600, discountAmount: 45, voucherCode: 'HEMAT1', voucherDiscount: 100, total: 605 },
    });
    expect(s.text).toContain('🔻 Diskon: -$0.45 (6.0%)');
    expect(s.text).toContain('🎟 Voucher <code>HEMAT1</code>: -$1.00');
    expect(s.text).toContain('⚠️ Saldo kurang $5.05');
    expect(labels(s.keyboard)[5]).toEqual(['💳 Isi Saldo']);
    expect(labels(s.keyboard)[6]).toEqual(['⚡ Bayar langsung', '🎟 Hapus voucher']);
  });

  test('sold out shows danger notice, no buy buttons; variant back goes to collection', () => {
    const s = productScreen(v, { ...base, product: product({ stock: 0, parentId: 4, parentName: 'Claude' }), quote: null, directPay: false });
    expect(s.text).toContain('❌ Stok habis');
    expect(s.text).toContain('🗂 Koleksi: Claude');
    expect(labels(s.keyboard)[5]).toEqual(['❌ Stok habis']);
    expect(data(s.keyboard.at(-1)![0]!)).toBe(cb.shop(1, 'all', 4));
  });

  test('escapes product names', () => {
    expect(productScreen(v, { ...base, product: product({ name: 'A<b>' }) }).text).toContain('A&lt;b&gt;');
  });

  test('note screen', () => {
    const s = productNoteScreen(v, { product: product(), qty: 3 });
    expect(s.text).toBe('📝 Catatan dari admin:\n\n<b>Login</b> via email');
    expect(labels(s.keyboard)).toEqual([['⬅️ Kembali']]);
    expect(data(s.keyboard[0]![0]!)).toBe(cb.product(1, 3));
  });
});

describe('payments', () => {
  const pay: PaymentView = {
    id: 9, code: 'PAY-1', status: 'pending', purpose: 'topup', provider: 'tripay', method: 'QRIS',
    amount: 500, fee: 10, payCurrency: 'IDR', payAmount: '83130', checkoutUrl: 'https://pay.example/x',
    qrString: '000201...', expiresAt: new Date('2026-10-03T00:15:00Z'), orderId: null,
  };

  test('invoice with QR photo', () => {
    const s = invoiceScreen(ve, { payment: pay, methodLabel: 'QRIS', qrPng: new Uint8Array([1]), now: new Date('2026-10-03T00:00:00Z') });
    expect(s.photo).toBeDefined();
    expect(s.text).toContain('💰 To pay: <b>83130 IDR</b>');
    expect(s.text).toContain('➕ Fee: $0.10');
    expect(s.text).toContain('(15 min left)');
    expect(s.text).toContain('Scan the QR');
    expect(labels(s.keyboard)).toEqual([['🔗 Pay now'], ['🔄 Check Status', '❌ Cancel'], ['🏠 Main Menu']]);
    expect(s.text.length).toBeLessThan(1024);
    assertRoutable(s);
  });

  test('invoice without QR, closed invoice', () => {
    const s = invoiceScreen(ve, { payment: { ...pay, qrString: null, fee: 0 } });
    expect(s.photo).toBeUndefined();
    expect(s.text).not.toContain('Fee');
    const closed = invoiceScreen(ve, { payment: { ...pay, status: 'expired' } });
    expect(closed.text).toContain('Expired');
    expect(labels(closed.keyboard)).toEqual([['🏠 Main Menu']]);
  });

  test('top-up methods', () => {
    const s = topupMethodsScreen(v, {
      methods: [
        { provider: 'tripay', method: 'QRIS', label: 'QRIS', kind: 'qris', payCurrency: 'IDR', minAmount: 100, maxAmount: null },
        { provider: 'cryptobot', method: 'CRYPTO', label: 'CryptoBot', kind: 'crypto', payCurrency: 'USD', minAmount: 100, maxAmount: null },
      ],
      balance: 0,
      min: 100,
    });
    expect(labels(s.keyboard)).toEqual([['QRIS', 'CryptoBot'], ['⬅️ Kembali']]);
    assertRoutable(s);
    expect(topupMethodsScreen(v, { methods: [], balance: 0, min: 100 }).text).toContain('Belum ada metode');
  });
});

describe('profile & settings', () => {
  test('profile escapes name and shows tz', () => {
    const s = profileScreen(v, { user });
    expect(s.text).toContain('Budi &lt;script&gt;');
    expect(s.text).toContain('UTC+7');
    expect(s.text).toContain('<code>42</code>');
    assertRoutable(s);
  });
  test('notification toggles', () => {
    const s = notifyScreen(v, { user });
    expect(labels(s.keyboard).slice(0, 3)).toEqual([['Pembaruan Stok: NYALA'], ['Info & Promo: MATI'], ['Referral: NYALA']]);
    expect(s.keyboard[1]![0]!.style).toBe('danger');
    assertRoutable(s);
  });
  test('timezone grid marks current', () => {
    const s = timezoneScreen(v, { current: 420 });
    expect(flat(s.keyboard).filter((b) => b.text.startsWith('✅'))).toHaveLength(1);
    expect(flat(s.keyboard)).toHaveLength(28);
    assertRoutable(s);
  });
  test('api screen shows new key once with copy button', () => {
    const s = apiScreen(v, { key: null, baseUrl: 'https://api.x/v1', newKey: 'tb_live_abc' });
    expect(s.text).toContain('<code>tb_live_abc</code>');
    expect(s.keyboard[0]![0]).toMatchObject({ copy_text: { text: 'tb_live_abc' } });
    assertRoutable(s);
  });
});

describe('orders & ledger', () => {
  test('ordersScreen: empty list', () => {
    const s = ordersScreen(ve, { orders: { items: [], page: 1, totalPages: 1, total: 0 } });
    expect(s.text).toContain('no orders');
    assertRoutable(s);
  });

  test('ordersScreen: list with pager', () => {
    const items = [
      { id: 1, storeId: 1, code: 'TB-ABC', productId: 3, productName: 'Netflix', quantity: 1, total: 250, status: 'completed' as const, createdAt: new Date() },
      { id: 2, storeId: 1, code: 'TB-DEF', productId: 4, productName: 'Spotify', quantity: 2, total: 500, status: 'pending_payment' as const, createdAt: new Date() },
    ];
    const s = ordersScreen(ve, { orders: { items, page: 2, totalPages: 3, total: 25 } });
    expect(s.text).toContain('25');
    expect(s.keyboard[0]![0]!.text).toContain('TB-ABC');
    expect(s.keyboard[0]![0]!.text).toContain('Netflix');
    expect(data(s.keyboard[0]![0]!)).toBe(cb.order(1, 2));
    const nav = s.keyboard.at(-2)!;
    expect(nav).toHaveLength(3);
    expect(data(nav[0]!)).toBe(cb.orders(1));
    expect(data(nav[2]!)).toBe(cb.orders(3));
    expect(data(s.keyboard.at(-1)![0]!)).toBe(cb.profile());
    assertRoutable(s);
  });

  test('orderDetailScreen: completed order with items has resend button', () => {
    const order = {
      id: 1, storeId: 1, code: 'TB-ABC', productId: 3, productName: 'Netflix', quantity: 2,
      unitPrice: 250, subtotal: 500, discountAmount: 0, voucherDiscount: 0, total: 500,
      status: 'completed' as const, paidWith: 'balance' as const, items: ['acc1', 'acc2'],
      warranty: '10d', completedAt: new Date('2026-10-03T12:00:00Z'), createdAt: new Date('2026-10-03T11:00:00Z'),
    };
    const s = orderDetailScreen(ve, { order, fromPage: 2 });
    expect(s.text).toContain('TB-ABC');
    expect(s.text).toContain('Netflix');
    expect(labels(s.keyboard)[0]).toEqual([ve.tp('orders.resend')]);
    expect(data(s.keyboard[0]![0]!)).toBe(cb.orderResend(1));
    expect(data(s.keyboard[1]![0]!)).toBe(cb.orders(2));
    assertRoutable(s);
  });

  test('orderDetailScreen: pending order has no resend button', () => {
    const order = {
      id: 2, storeId: 1, code: 'TB-DEF', productId: 3, productName: 'Spotify', quantity: 1,
      unitPrice: 100, subtotal: 100, discountAmount: 0, voucherDiscount: 0, total: 100,
      status: 'pending_payment' as const, paidWith: 'payment' as const, items: [],
      warranty: null, completedAt: null, createdAt: new Date('2026-10-03T11:00:00Z'),
    };
    const s = orderDetailScreen(ve, { order, fromPage: 1 });
    expect(labels(s.keyboard)).toEqual([[ve.tp('common.back')]]);
    assertRoutable(s);
  });

  test('ledgerScreen: empty', () => {
    const s = ledgerScreen(ve, { ledger: { items: [], page: 1, totalPages: 1, total: 0 } });
    expect(s.text).toContain('No transactions');
    assertRoutable(s);
  });

  test('ledgerScreen: entries with pager', () => {
    const items = [
      { id: 1, amount: 500, type: 'topup' as const, refType: null, refId: null, balanceAfter: 500, note: null, createdAt: new Date('2026-10-03T00:00:00Z') },
      { id: 2, amount: -250, type: 'purchase' as const, refType: null, refId: null, balanceAfter: 250, note: null, createdAt: new Date('2026-10-03T01:00:00Z') },
    ];
    const s = ledgerScreen(ve, { ledger: { items, page: 1, totalPages: 2, total: 10 } });
    expect(s.text).toContain('+$5.00');
    expect(s.text).toContain('-$2.50');
    const nav = s.keyboard[0]!;
    expect(nav).toHaveLength(3);
    expect(data(nav[2]!)).toBe(cb.ledger(2));
    expect(data(s.keyboard.at(-1)![0]!)).toBe(cb.profile());
    assertRoutable(s);
  });
});

describe('misc screens', () => {
  test('referral', () => {
    const stats: ReferralStats = {
      referralCode: 'ABCD', referred24h: 1, referred7d: 2, referredTotal: 3, earned: 500, available: 300,
      transferred: 200, withdrawn: 0, percentBp: 500, maxPerTopup: 300, minWithdraw: 100,
    };
    const s = referralScreen(v, { stats, link: 'https://t.me/b?start=ref_ABCD' });
    expect(s.text).toContain('<b>5.0%</b>');
    expect(s.keyboard[0]![0]).toMatchObject({ text: '📋 Salin Link Referral', copy_text: { text: 'https://t.me/b?start=ref_ABCD' } });
    expect(labels(s.keyboard)[1]).toEqual(['🔁 Transfer ke saldo', '🏧 Tarik tunai']);
    const none = referralScreen(v, { stats: { ...stats, available: 0 }, link: 'l' });
    expect(labels(none.keyboard)).toEqual([['📋 Salin Link Referral'], ['⬅️ Kembali']]);
    assertRoutable(s);
  });
  test('help: live support only when admin chat configured', () => {
    expect(labels(helpScreen(v, { supportUsername: null, supportOpen: false, liveSupport: false }).keyboard)).toEqual([['⬅️ Kembali']]);
    const open = helpScreen(v, { supportUsername: 'adm', supportOpen: true, liveSupport: true });
    expect(labels(open.keyboard)[0]).toEqual(['❌ Batalkan Dukungan']);
    expect(open.keyboard[1]![0]).toMatchObject({ url: 'https://t.me/adm' });
  });
  test('2FA result', () => {
    const s = twofaResultScreen(v, { code: '123456', secondsRemaining: 17 });
    expect(s.text).toContain('<code>123456</code>');
    expect(s.text).toContain('17 detik');
    assertRoutable(s);
  });
});

describe('withNotice', () => {
  test('prepends notice text separated by blank line', () => {
    const base: Screen = { text: 'body', keyboard: [] };
    const s = withNotice(base, '⚠️ Warning');
    expect(s.text).toBe('⚠️ Warning\n\nbody');
    expect(s.keyboard).toEqual([]);
  });
});

describe('keyboard utilities', () => {
  test('copyBtn truncates text exceeding 256 chars', () => {
    const long = 'x'.repeat(300);
    const b = copyBtn('Copy', long);
    expect((b as any).copy_text.text).toHaveLength(256);
  });

  test('pager returns empty for single page', () => {
    expect(pager(1, 1, () => 'x', { prev: '<', next: '>', page: '1/1' })).toEqual([]);
  });

  test('pager wraps at edges', () => {
    const p = pager(1, 3, (n) => `p:${n}`, { prev: '<', next: '>', page: '1/3' });
    expect(data(p[0]!)).toBe('p:3');
    expect(data(p[2]!)).toBe('p:2');
    const last = pager(3, 3, (n) => `p:${n}`, { prev: '<', next: '>', page: '3/3' });
    expect(data(last[0]!)).toBe('p:2');
    expect(data(last[2]!)).toBe('p:1');
  });

  test('rows chunks buttons by size', () => {
    const btns = [1, 2, 3, 4, 5].map((n) => ({ text: String(n), callback_data: String(n) }));
    const r = rows(btns, 2);
    expect(r).toHaveLength(3);
    expect(r[0]).toHaveLength(2);
    expect(r[2]).toHaveLength(1);
  });
});

describe('more & 2FA screens', () => {
  test('moreScreen has 2FA and rating buttons', () => {
    const s = moreScreen(v);
    expect(labels(s.keyboard)).toEqual([
      [v.tp('more.twofa'), v.tp('more.rating')],
      [v.tp('common.back')],
    ]);
    assertRoutable(s);
  });

  test('twofaPromptScreen has cancel button', () => {
    const s = twofaPromptScreen(v);
    expect(s.text).toBeTruthy();
    expect(labels(s.keyboard)).toEqual([[v.tp('common.cancel')]]);
    assertRoutable(s);
  });

  test('ratingScreen has up/down styled buttons', () => {
    const s = ratingScreen(v);
    expect(s.keyboard[0]![0]!.style).toBe('success');
    expect(s.keyboard[0]![1]!.style).toBe('danger');
    expect(labels(s.keyboard)).toEqual([
      [v.tp('rating.up'), v.tp('rating.down')],
      [v.tp('common.back')],
    ]);
    assertRoutable(s);
  });
});

describe('api revoke confirm', () => {
  test('apiRevokeConfirmScreen has yes/no', () => {
    const s = apiRevokeConfirmScreen(v);
    expect(s.keyboard[0]![0]!.style).toBe('danger');
    expect(labels(s.keyboard)).toEqual([[v.tp('common.yes'), v.tp('common.no')]]);
    assertRoutable(s);
  });
});

describe('language & currency screens', () => {
  test('languageScreen marks current language', () => {
    const s = languageScreen(v, { current: 'id', languages: ['en', 'id'] });
    const btns = flat(s.keyboard);
    const checked = btns.find((b) => b.text.startsWith('✅'));
    expect(checked!.text).toContain(v.tp('language.name.id'));
    expect(btns.find((b) => !b.text.startsWith('✅') && b !== s.keyboard.at(-1)![0])!.text).toContain(v.tp('language.name.en'));
    assertRoutable(s);
  });

  test('currencyScreen marks current and uses 3-column rows', () => {
    const s = currencyScreen(v, { current: 'USD', currencies: ['USD', 'IDR', 'EUR', 'JPY'] });
    expect(flat(s.keyboard).filter((b) => b.text.startsWith('✅'))).toHaveLength(1);
    expect(s.keyboard[0]).toHaveLength(3);
    assertRoutable(s);
  });
});

describe('support opened screen', () => {
  test('with topic name', () => {
    const s = supportOpenedScreen(v, { topicName: 'Help #42' });
    expect(s.text).toContain('Help #42');
    assertRoutable(s);
  });
  test('without topic name', () => {
    const s = supportOpenedScreen(v, { topicName: null });
    expect(s.text).toBeTruthy();
    assertRoutable(s);
  });
});

describe('payment flow screens', () => {
  test('topupAmountScreen shows method and cancel', () => {
    const method = { provider: 'tripay' as const, method: 'QRIS', label: 'QRIS', kind: 'qris' as const, payCurrency: 'IDR', minAmount: 100, maxAmount: null };
    const s = topupAmountScreen(v, { method, currency: 'IDR', example: '50000', min: 100 });
    expect(s.text).toContain('QRIS');
    expect(labels(s.keyboard)).toEqual([[v.tp('common.cancel')]]);
    assertRoutable(s);
  });

  test('orderMethodsScreen lists methods, empty falls back', () => {
    const p = product();
    const methods = [
      { provider: 'tripay' as const, method: 'QRIS', label: 'QRIS', kind: 'qris' as const, payCurrency: 'IDR', minAmount: 100, maxAmount: null },
    ];
    const s = orderMethodsScreen(v, { product: p, qty: 1, total: 250, methods });
    expect(labels(s.keyboard)[0]).toEqual(['QRIS']);
    assertRoutable(s);
    const empty = orderMethodsScreen(v, { product: p, qty: 1, total: 250, methods: [] });
    expect(empty.text).toContain(v.t('pay.noMethods'));
  });

  test('topupDoneScreen passes text through and shows shop+menu', () => {
    const s = topupDoneScreen(v, 'Berhasil top-up $5.00');
    expect(s.text).toBe('Berhasil top-up $5.00');
    expect(s.keyboard[0]).toHaveLength(2);
    assertRoutable(s);
  });
});

describe('product flow screens', () => {
  test('voucherPromptScreen shows product name and cancel', () => {
    const s = voucherPromptScreen(v, { product: product(), qty: 2 });
    expect(s.text).toContain('Netflix');
    expect(labels(s.keyboard)).toEqual([[v.tp('common.cancel')]]);
    assertRoutable(s);
  });

  test('purchaseConfirmScreen shows total and remaining balance', () => {
    const q = { productId: 1, quantity: 2, unitPrice: 250, subtotal: 500, discountBp: 0, discountAmount: 0, voucherCode: null, voucherDiscount: 0, total: 500, nextTier: null };
    const s = purchaseConfirmScreen(v, { product: product(), quote: q, balance: 1000 });
    expect(s.text).toContain('$5.00');
    expect(s.text).toContain('Netflix');
    expect(s.keyboard[0]![0]!.style).toBe('success');
    assertRoutable(s);
  });

  test('purchaseDoneScreen shows order code and navigation', () => {
    const s = purchaseDoneScreen(v, { orderCode: 'TB-ABCDEF', balance: 500 });
    expect(s.text).toContain('TB-ABCDEF');
    expect(s.text).toContain('$5.00');
    expect(labels(s.keyboard)).toEqual([
      [v.tp('purchase.myOrders'), v.tp('purchase.again')],
      [v.tp('common.mainMenu')],
    ]);
    assertRoutable(s);
  });
});

describe('withdraw prompt screen', () => {
  test('shows amount and min with cancel', () => {
    const s = withdrawPromptScreen(v, { amount: 500, min: 100 });
    expect(s.text).toContain('$5.00');
    expect(s.text).toContain('$1.00');
    expect(labels(s.keyboard)).toEqual([[v.tp('common.cancel')]]);
    assertRoutable(s);
  });
});

describe('invoiceClosedScreen', () => {
  test('expired payment shows status and main menu only', () => {
    const p: PaymentView = {
      id: 10, code: 'PAY-EXP', status: 'expired', purpose: 'topup', provider: 'tripay', method: 'QRIS',
      amount: 500, fee: 10, payCurrency: 'IDR', payAmount: '83130', checkoutUrl: null,
      qrString: null, expiresAt: new Date('2026-10-03T00:15:00Z'), orderId: null,
    };
    const s = invoiceClosedScreen(ve, p);
    expect(s.text).toContain('PAY-EXP');
    expect(s.text).toContain('Expired');
    expect(labels(s.keyboard)).toEqual([[ve.tp('common.mainMenu')]]);
    assertRoutable(s);
  });

  test('cancelled payment shows cancelled status', () => {
    const p: PaymentView = {
      id: 11, code: 'PAY-CAN', status: 'cancelled', purpose: 'topup', provider: 'tripay', method: 'QRIS',
      amount: 300, fee: 0, payCurrency: 'IDR', payAmount: '48900', checkoutUrl: null,
      qrString: null, expiresAt: null, orderId: null,
    };
    const s = invoiceClosedScreen(ve, p);
    expect(s.text).toContain('PAY-CAN');
    assertRoutable(s);
  });

  test('paid payment shows paid status', () => {
    const p: PaymentView = {
      id: 12, code: 'PAY-PAID', status: 'paid', purpose: 'order', provider: 'cryptobot', method: 'CRYPTO',
      amount: 1000, fee: 50, payCurrency: 'USD', payAmount: '10.50', checkoutUrl: null,
      qrString: null, expiresAt: null, orderId: 5,
    };
    const s = invoiceClosedScreen(ve, p);
    expect(s.text).toContain('PAY-PAID');
    assertRoutable(s);
  });
});

describe('invoiceScreen edge cases', () => {
  test('order payment invoice shows purpose', () => {
    const p: PaymentView = {
      id: 13, code: 'PAY-ORD', status: 'pending', purpose: 'order', provider: 'tripay', method: 'BRIVA',
      amount: 800, fee: 25, payCurrency: 'IDR', payAmount: '134475', checkoutUrl: 'https://pay.example/briva',
      qrString: null, expiresAt: new Date('2026-10-03T00:30:00Z'), orderId: 7,
    };
    const s = invoiceScreen(ve, { payment: p, methodLabel: 'BRI VA', now: new Date('2026-10-03T00:00:00Z') });
    expect(s.text).toContain('PAY-ORD');
    expect(s.text).toContain('BRI VA');
    expect(s.text).toContain('$0.25');
    expect(s.text).toContain('(30 min left)');
    expect(s.photo).toBeUndefined();
    assertRoutable(s);
  });

  test('invoice without expiresAt omits expiry line', () => {
    const p: PaymentView = {
      id: 14, code: 'PAY-NOEXP', status: 'pending', purpose: 'topup', provider: 'cryptobot', method: 'CRYPTO',
      amount: 500, fee: 0, payCurrency: 'USD', payAmount: '5.00', checkoutUrl: null,
      qrString: null, expiresAt: null, orderId: null,
    };
    const s = invoiceScreen(ve, { payment: p });
    expect(s.text).toContain('PAY-NOEXP');
    expect(s.text).not.toContain('min left');
    assertRoutable(s);
  });

  test('non-pending payment delegates to invoiceClosedScreen', () => {
    const p: PaymentView = {
      id: 15, code: 'PAY-FAIL', status: 'failed', purpose: 'topup', provider: 'tripay', method: 'QRIS',
      amount: 200, fee: 0, payCurrency: 'IDR', payAmount: '32600', checkoutUrl: null,
      qrString: null, expiresAt: null, orderId: null,
    };
    const s = invoiceScreen(ve, { payment: p });
    expect(labels(s.keyboard)).toEqual([[ve.tp('common.mainMenu')]]);
    assertRoutable(s);
  });
});
