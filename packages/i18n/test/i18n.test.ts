import { describe, expect, mock, test } from 'bun:test';
import type { OrderDetail } from '@tokobun/core';

// Deterministic money formatting so these tests don't depend on core's implementation progress.
const realCore = await import('@tokobun/core');
mock.module('@tokobun/core', () => ({
  ...realCore,
  formatMoney: (amount: number, currency: string) => `${(amount / 100).toFixed(2)} ${currency}`,
}));

const i18n = await import('../src/index');
const { id } = await import('../src/locales/id');
const { en } = await import('../src/locales/en');

const money = { currency: 'USD', fxRates: {} };

function order(items: string[], over: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 1,
    storeId: 1,
    code: 'TB-ABC123',
    productId: 7,
    productName: 'Netflix <Premium>',
    quantity: items.length,
    total: 1500,
    status: 'completed',
    createdAt: new Date('2026-10-03T00:00:00Z'),
    unitPrice: 1500,
    subtotal: 1500,
    discountAmount: 0,
    voucherDiscount: 0,
    paidWith: 'balance',
    items,
    warranty: '10d',
    completedAt: new Date('2026-10-03T00:00:00Z'),
    ...over,
  };
}

describe('locales', () => {
  test('every key exists in both locales with a non-empty value', () => {
    const idKeys = Object.keys(id).sort();
    const enKeys = Object.keys(en).sort();
    expect(enKeys).toEqual(idKeys);
    for (const lang of i18n.SUPPORTED_LANGUAGES) {
      for (const key of idKeys) {
        expect(i18n.hasKey(lang, key)).toBe(true);
        expect(i18n.LOCALES[lang]![key]!.length).toBeGreaterThan(0);
      }
    }
  });

  test('placeholders match across locales', () => {
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(id) as (keyof typeof id)[]) {
      expect({ key, ph: ph(en[key]) }).toEqual({ key, ph: ph(id[key]) });
    }
  });

  test('every CoreErrorCode has an errors.* key', () => {
    const codes = [
      'NOT_FOUND', 'USER_BANNED', 'PRODUCT_INACTIVE', 'INVALID_QUANTITY', 'OUT_OF_STOCK', 'INSUFFICIENT_BALANCE',
      'VOUCHER_INVALID', 'VOUCHER_EXPIRED', 'VOUCHER_LIMIT_REACHED', 'VOUCHER_MIN_TOTAL', 'AMOUNT_TOO_SMALL',
      'INVALID_STATE', 'INVALID_INPUT',
    ];
    for (const c of codes) for (const lang of ['id', 'en']) expect(i18n.hasKey(lang, `errors.${c}`)).toBe(true);
  });

  test('HTML tags in templates are balanced', () => {
    for (const table of [id, en] as Record<string, string>[]) {
      for (const [key, value] of Object.entries(table)) {
        for (const tag of ['b', 'i', 'code']) {
          const open = value.split(`<${tag}>`).length - 1;
          const close = value.split(`</${tag}>`).length - 1;
          expect({ key, tag, open }).toEqual({ key, tag, open: close });
        }
      }
    }
  });
});

describe('t', () => {
  test('interpolates and escapes params', () => {
    expect(i18n.t('en', 'product.name', { name: '<b>x</b> & "y"' })).toBe('📦 Product: <b>&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;</b>');
  });
  test('falls back to en, then to the key', () => {
    expect(i18n.t('fr', 'menu.shop')).toBe(en['menu.shop']);
    expect(i18n.t('id', 'no.such.key')).toBe('no.such.key');
  });
  test('leaves unknown placeholders intact', () => {
    expect(i18n.t('id', 'common.page', { page: 1 })).toBe('1/{total}');
  });
  test('tp does not escape (button labels)', () => {
    expect(i18n.tp('en', 'product.qty', { qty: '<5>' })).toBe('Qty: <5>');
  });
  test('resolveLanguage', () => {
    expect(i18n.resolveLanguage('id-ID')).toBe('id');
    expect(i18n.resolveLanguage('EN')).toBe('en');
    expect(i18n.resolveLanguage('de')).toBe('en');
    expect(i18n.resolveLanguage(null)).toBe('en');
    expect(i18n.resolveLanguage(undefined)).toBe('en');
    expect(i18n.resolveLanguage('')).toBe('en');
    expect(i18n.resolveLanguage('id_ID')).toBe('id');
    expect(i18n.resolveLanguage('en-US')).toBe('en');
  });
  test('formatPercent', () => {
    expect(i18n.formatPercent(600)).toBe('6.0');
    expect(i18n.formatPercent(1250)).toBe('12.5');
  });
  test('formatPercent boundary values', () => {
    expect(i18n.formatPercent(0)).toBe('0.0');
    expect(i18n.formatPercent(10000)).toBe('100.0');
  });
  test('escapeHtml handles all special chars', () => {
    expect(i18n.escapeHtml('<b>"x" & \'y\'</b>')).toBe('&lt;b&gt;&quot;x&quot; &amp; \'y\'&lt;/b&gt;');
  });
  test('resolveLanguage with uppercase code', () => {
    expect(i18n.resolveLanguage('ID')).toBe('id');
    expect(i18n.resolveLanguage('EN')).toBe('en');
  });
  test('SUPPORTED_LANGUAGES includes id and en', () => {
    expect(i18n.SUPPORTED_LANGUAGES).toContain('id');
    expect(i18n.SUPPORTED_LANGUAGES).toContain('en');
  });
  test('hasKey returns true for existing key and false for missing', () => {
    expect(i18n.hasKey('en', 'menu.shop')).toBe(true);
    expect(i18n.hasKey('en', 'nonexistent.key')).toBe(false);
    expect(i18n.hasKey('id', 'menu.shop')).toBe(true);
  });
});

describe('renderers', () => {
  test('renderOrderDelivery inline: escaped items, warranty, no file', () => {
    const r = i18n.renderOrderDelivery(order(['user@x.com:pa<ss>']), 'en', money);
    expect(r.file).toBeNull();
    expect(r.text).toContain('Order TB-ABC123');
    expect(r.text).toContain('Netflix &lt;Premium&gt;');
    expect(r.text).toContain('<code>user@x.com:pa&lt;ss&gt;</code>');
    expect(r.text).toContain('15.00 USD');
    expect(r.text).toContain('Warranty');
    expect(r.text).toContain('━━━━'); // separator
  });

  test('renderOrderDelivery numbers multiple items', () => {
    const r = i18n.renderOrderDelivery(order(['code-a', 'code-b'], { quantity: 2 }), 'en', money);
    expect(r.file).toBeNull();
    expect(r.text).toContain('1. <code>code-a</code>');
    expect(r.text).toContain('2. <code>code-b</code>');
  });

  test('renderOrderDelivery uses a file for > 10 items', () => {
    const items = Array.from({ length: 11 }, (_, i) => `code-${i}`);
    const r = i18n.renderOrderDelivery(order(items), 'id', money);
    expect(r.file).not.toBeNull();
    expect(r.file!.filename).toBe('TB-ABC123.txt');
    expect(r.file!.content).toContain('1. code-0\n2. code-1');
    expect(r.file!.content).toContain('Netflix <Premium>'); // raw text in the file
    expect(r.file!.content).toContain('──────'); // separator in file
    expect(r.text).toContain('11 item');
    expect(r.text).not.toContain('code-0');
  });

  test('renderOrderDelivery uses a file for > 3500 chars', () => {
    const r = i18n.renderOrderDelivery(order(['x'.repeat(3600)]), 'en', money);
    expect(r.file).not.toBeNull();
  });

  test('renderOrderDelivery omits warranty when null', () => {
    const r = i18n.renderOrderDelivery(order(['a'], { warranty: null }), 'en', money);
    expect(r.text).not.toContain('Warranty');
  });

  test('renderOrderDelivery with empty items', () => {
    const r = i18n.renderOrderDelivery(order([]), 'en', money);
    expect(r.file).toBeNull();
    expect(r.text).toContain('TB-ABC123');
  });

  test('renderOrderDelivery with refunded order does not crash', () => {
    const r = i18n.renderOrderDelivery(order(['code-a'], { status: 'refunded' }), 'en', money);
    expect(r.text).toContain('TB-ABC123');
    expect(r.file).toBeNull();
  });

  test('renderTopupSuccess / renderReferralEarned', () => {
    expect(i18n.renderTopupSuccess({ credited: 500, balance: 1200 }, 'en', money)).toContain('<b>5.00 USD</b>');
    expect(i18n.renderTopupSuccess({ credited: 500, balance: 1200 }, 'id', money)).toContain('12.00 USD');
    expect(i18n.renderReferralEarned({ amount: 25 }, 'id', money)).toContain('0.25 USD');
  });
});

describe('escapeHtml edge cases', () => {
  test('numeric input converts to string', () => {
    expect(i18n.escapeHtml(42)).toBe('42');
    expect(i18n.escapeHtml(0)).toBe('0');
  });
  test('empty string returns empty string', () => {
    expect(i18n.escapeHtml('')).toBe('');
  });
  test('no special chars passes through', () => {
    expect(i18n.escapeHtml('hello world 123')).toBe('hello world 123');
  });
  test('multiple & in a row', () => {
    expect(i18n.escapeHtml('a&&b&c')).toBe('a&amp;&amp;b&amp;c');
  });
});

describe('ALL_KEYS', () => {
  test('ALL_KEYS matches id locale keys', () => {
    expect([...i18n.ALL_KEYS].sort()).toEqual(Object.keys(id).sort());
  });
  test('ALL_KEYS is frozen (readonly)', () => {
    expect(i18n.ALL_KEYS.length).toBeGreaterThan(200);
  });
});

describe('money helper', () => {
  test('formats amount using context currency', () => {
    const result = i18n.money(1500, { currency: 'USD', fxRates: {} });
    expect(result).toBe('15.00 USD');
  });
  test('zero cents', () => {
    expect(i18n.money(0, { currency: 'USD', fxRates: {} })).toBe('0.00 USD');
  });
});

describe('t edge cases', () => {
  test('numeric param is escaped correctly', () => {
    const result = i18n.t('en', 'common.page', { page: 1, total: 5 });
    expect(result).toBe('1/5');
  });
  test('t with empty params object is same as no params', () => {
    const a = i18n.t('en', 'menu.shop');
    const b = i18n.t('en', 'menu.shop', {});
    expect(a).toBe(b);
  });
});

describe('DELIVERY constants', () => {
  test('DELIVERY_MAX_INLINE_ITEMS is 10', () => {
    expect(i18n.DELIVERY_MAX_INLINE_ITEMS).toBe(10);
  });
  test('DELIVERY_MAX_INLINE_CHARS is 3500', () => {
    expect(i18n.DELIVERY_MAX_INLINE_CHARS).toBe(3500);
  });
});

describe('resolveLanguage edge cases', () => {
  test('mixed-case region codes', () => {
    expect(i18n.resolveLanguage('Id-id')).toBe('id');
    expect(i18n.resolveLanguage('EN-gb')).toBe('en');
    expect(i18n.resolveLanguage('iD')).toBe('id');
  });
  test('underscore separator (Java/Android style)', () => {
    expect(i18n.resolveLanguage('en_GB')).toBe('en');
    expect(i18n.resolveLanguage('id_ID')).toBe('id');
  });
  test('unsupported languages fall back to en', () => {
    for (const lang of ['fr', 'de', 'ja', 'zh', 'ar', 'pt-BR', 'ru_RU', 'ko-KR']) {
      expect(i18n.resolveLanguage(lang)).toBe('en');
    }
  });
  test('whitespace-only falls back to en', () => {
    expect(i18n.resolveLanguage('  ')).toBe('en');
  });
  test('hyphen-only returns en (split produces empty first segment)', () => {
    expect(i18n.resolveLanguage('-')).toBe('en');
    expect(i18n.resolveLanguage('_')).toBe('en');
  });
});

describe('hasKey edge cases', () => {
  test('returns false for unsupported language', () => {
    expect(i18n.hasKey('fr', 'menu.shop')).toBe(false);
    expect(i18n.hasKey('de', 'common.back')).toBe(false);
  });
  test('returns false for empty key', () => {
    expect(i18n.hasKey('en', '')).toBe(false);
    expect(i18n.hasKey('id', '')).toBe(false);
  });
  test('returns true for every ALL_KEYS entry in both locales', () => {
    for (const key of i18n.ALL_KEYS) {
      expect(i18n.hasKey('en', key)).toBe(true);
      expect(i18n.hasKey('id', key)).toBe(true);
    }
  });
});

describe('escapeHtml comprehensive', () => {
  test('all four special chars combined', () => {
    expect(i18n.escapeHtml('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });
  test('negative number', () => {
    expect(i18n.escapeHtml(-99)).toBe('-99');
  });
  test('string with only special chars', () => {
    expect(i18n.escapeHtml('<>&"')).toBe('&lt;&gt;&amp;&quot;');
  });
  test('unicode passes through unescaped', () => {
    expect(i18n.escapeHtml('🎉 héllo')).toBe('🎉 héllo');
  });
  test('single quotes are NOT escaped (Telegram HTML does not require it)', () => {
    expect(i18n.escapeHtml("it's")).toBe("it's");
  });
});

describe('formatPercent edge cases', () => {
  test('fractional basis points', () => {
    expect(i18n.formatPercent(1)).toBe('0.0');
    expect(i18n.formatPercent(50)).toBe('0.5');
    expect(i18n.formatPercent(99)).toBe('1.0');
    expect(i18n.formatPercent(125)).toBe('1.3');
    expect(i18n.formatPercent(1050)).toBe('10.5');
  });
  test('negative basis points', () => {
    expect(i18n.formatPercent(-500)).toBe('-5.0');
  });
  test('very large basis points', () => {
    expect(i18n.formatPercent(50000)).toBe('500.0');
  });
});

describe('interpolation edge cases', () => {
  test('t with no matching placeholders in template', () => {
    const key = 'common.yes';
    const withParams = i18n.t('en', key, { unused: 'ignored' });
    const without = i18n.t('en', key);
    expect(withParams).toBe(without);
  });
  test('tp with HTML chars in param: NOT escaped', () => {
    const result = i18n.tp('en', 'common.page', { page: '<1>', total: '<2>' });
    expect(result).toBe('<1>/<2>');
  });
  test('t with HTML chars in param: escaped', () => {
    const result = i18n.t('en', 'common.page', { page: '<1>', total: '<2>' });
    expect(result).toBe('&lt;1&gt;/&lt;2&gt;');
  });
  test('brace-like text that is not a placeholder', () => {
    const result = i18n.t('en', 'nonexistent', { x: 1 });
    expect(result).toBe('nonexistent');
  });
  test('param value of 0 is substituted (not treated as falsy)', () => {
    const result = i18n.t('en', 'common.page', { page: 0, total: 0 });
    expect(result).toBe('0/0');
  });
});

describe('renderOrderDelivery edge cases', () => {
  test('exactly 10 items stays inline', () => {
    const items = Array.from({ length: 10 }, (_, i) => `code-${i}`);
    const r = i18n.renderOrderDelivery(order(items, { quantity: 10 }), 'en', money);
    expect(r.file).toBeNull();
    expect(r.text).toContain('10. <code>code-9</code>');
  });

  test('single item is NOT numbered', () => {
    const r = i18n.renderOrderDelivery(order(['single-item']), 'en', money);
    expect(r.text).toContain('<code>single-item</code>');
    expect(r.text).not.toContain('1. ');
  });

  test('file content uses raw text (no HTML escaping)', () => {
    const items = Array.from({ length: 11 }, (_, i) => `<item-${i}>`);
    const r = i18n.renderOrderDelivery(order(items, { quantity: 11 }), 'en', money);
    expect(r.file).not.toBeNull();
    expect(r.file!.content).toContain('<item-0>');
    expect(r.file!.content).not.toContain('&lt;');
  });

  test('file summary text does NOT include individual items', () => {
    const items = Array.from({ length: 15 }, (_, i) => `secret-${i}`);
    const r = i18n.renderOrderDelivery(order(items, { quantity: 15 }), 'en', money);
    expect(r.text).not.toContain('secret-0');
    expect(r.text).toContain('15');
  });

  test('Indonesian locale renders delivery correctly', () => {
    const r = i18n.renderOrderDelivery(order(['kode-1', 'kode-2'], { quantity: 2 }), 'id', money);
    expect(r.file).toBeNull();
    expect(r.text).toContain('TB-ABC123');
    expect(r.text).toContain('1. <code>kode-1</code>');
    expect(r.text).toContain('2. <code>kode-2</code>');
  });
});

describe('money helper edge cases', () => {
  test('negative amount', () => {
    expect(i18n.money(-250, { currency: 'USD', fxRates: {} })).toBe('-2.50 USD');
  });
  test('large amount', () => {
    expect(i18n.money(9999999, { currency: 'USD', fxRates: {} })).toBe('99999.99 USD');
  });
  test('1 cent', () => {
    expect(i18n.money(1, { currency: 'USD', fxRates: {} })).toBe('0.01 USD');
  });
});

describe('renderTopupSuccess edge cases', () => {
  test('zero credited', () => {
    const r = i18n.renderTopupSuccess({ credited: 0, balance: 500 }, 'en', money);
    expect(r).toContain('0.00 USD');
    expect(r).toContain('5.00 USD');
  });
  test('Indonesian locale', () => {
    const r = i18n.renderTopupSuccess({ credited: 1000, balance: 2000 }, 'id', money);
    expect(r).toContain('10.00 USD');
    expect(r).toContain('20.00 USD');
  });
});

describe('renderReferralEarned edge cases', () => {
  test('small amount', () => {
    const r = i18n.renderReferralEarned({ amount: 1 }, 'en', money);
    expect(r).toContain('0.01 USD');
  });
  test('Indonesian locale', () => {
    const r = i18n.renderReferralEarned({ amount: 500 }, 'id', money);
    expect(r).toContain('5.00 USD');
  });
});

describe('lookup fallback chain', () => {
  test('known lang + known key → locale string', () => {
    expect(i18n.t('id', 'menu.shop')).toBe(id['menu.shop']);
  });
  test('unknown lang falls back to en', () => {
    expect(i18n.t('xx', 'menu.shop')).toBe(en['menu.shop']);
  });
  test('unknown key in both locales returns the key itself', () => {
    expect(i18n.t('en', 'totally.fake.key')).toBe('totally.fake.key');
    expect(i18n.t('id', 'totally.fake.key')).toBe('totally.fake.key');
  });
});

describe('formatPercent rounding', () => {
  test('rounds down at midpoint-below', () => {
    expect(i18n.formatPercent(333)).toBe('3.3');
  });
  test('rounds correctly at 5050 bp', () => {
    expect(i18n.formatPercent(5050)).toBe('50.5');
  });
  test('NaN input', () => {
    expect(i18n.formatPercent(NaN)).toBe('NaN');
  });
  test('Infinity input', () => {
    expect(i18n.formatPercent(Infinity)).toBe('Infinity');
  });
});

describe('renderOrderDelivery boundary', () => {
  test('exactly at DELIVERY_MAX_INLINE_CHARS stays inline', () => {
    const padLen = i18n.DELIVERY_MAX_INLINE_CHARS - 200;
    const item = 'x'.repeat(Math.min(padLen, 2000));
    const r = i18n.renderOrderDelivery(order([item]), 'en', money);
    if (r.file === null) {
      expect(r.text.length).toBeLessThanOrEqual(i18n.DELIVERY_MAX_INLINE_CHARS + 500);
    }
  });

  test('items with HTML special chars are escaped inline', () => {
    const r = i18n.renderOrderDelivery(order(['<script>alert("xss")</script>']), 'en', money);
    expect(r.file).toBeNull();
    expect(r.text).toContain('&lt;script&gt;');
    expect(r.text).not.toContain('<script>');
  });

  test('file items are NOT html-escaped', () => {
    const items = Array.from({ length: 12 }, () => '<b>bold</b>');
    const r = i18n.renderOrderDelivery(order(items, { quantity: 12 }), 'en', money);
    expect(r.file).not.toBeNull();
    expect(r.file!.content).toContain('<b>bold</b>');
  });
});

describe('interpolation stress', () => {
  test('consecutive placeholders', () => {
    const result = i18n.t('en', 'common.page', { page: 1, total: 2 });
    expect(result).toBe('1/2');
  });

  test('param containing brace-like text', () => {
    const result = i18n.t('en', 'product.name', { name: '{other}' });
    expect(result).toContain('{other}');
  });

  test('param value is empty string', () => {
    const result = i18n.t('en', 'product.name', { name: '' });
    expect(result).toBeDefined();
  });
});
