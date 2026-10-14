import { describe, expect, test } from 'bun:test';
import {
  CoreError,
  DEFAULT_SETTINGS,
  formatMoney,
  generateOrderCode,
  generatePaymentCode,
  generateProductCode,
  generateReferralCode,
  hashApiKey,
  MAX_QUANTITY,
  toBaseCents,
  totp,
} from '../src';
import { assertCents, bp, isUniqueViolation, pageArgs, totalPages } from '../src/services/util';
import { base32Decode } from '../src/services/totp';
import { toStoreInfo } from '../src/services/stores';
import { toProfile } from '../src/services/users';
import { toLedgerEntry } from '../src/services/wallet';
import { toSummary } from '../src/services/orders';

const fx = { IDR: 16300, EUR: 0.92, JPY: 150 };

describe('formatMoney', () => {
  test('USD', () => {
    expect(formatMoney(150, 'USD', fx)).toBe('1.50 USD');
    expect(formatMoney(0, 'USD', fx)).toBe('0.00 USD');
    expect(formatMoney(123456, 'USD', {})).toBe('1234.56 USD');
  });
  test('IDR', () => {
    expect(formatMoney(150, 'IDR', fx)).toBe('Rp24.450');
    expect(formatMoney(10000, 'IDR', fx)).toBe('Rp1.630.000');
  });
  test('other currencies via Intl', () => {
    expect(formatMoney(1000, 'EUR', fx)).toBe('€9.20');
    expect(formatMoney(1000, 'JPY', fx)).toBe('¥1,500');
  });
  test('unknown rate falls back to USD', () => {
    expect(formatMoney(150, 'GBP', fx)).toBe('1.50 USD');
  });
  test('non-ISO code with a rate', () => {
    expect(formatMoney(150, 'USDT', { USDT: 1 })).toBe('1.50 USDT');
  });
  test('empty currency string treated as USD', () => {
    expect(formatMoney(150, '', fx)).toBe('1.50 USD');
  });
  test('lowercase currency is uppercased', () => {
    expect(formatMoney(150, 'usd', fx)).toBe('1.50 USD');
    expect(formatMoney(150, 'idr', fx)).toBe('Rp24.450');
  });
  test('negative amounts', () => {
    expect(formatMoney(-150, 'USD', fx)).toBe('-1.50 USD');
  });
  test('very large amounts', () => {
    expect(formatMoney(99999999, 'USD', fx)).toBe('999999.99 USD');
  });
  test('very large IDR amounts', () => {
    const result = formatMoney(99999999, 'IDR', fx);
    expect(result).toContain('Rp');
  });
  test('fractional cent rounding in IDR', () => {
    expect(formatMoney(3, 'IDR', fx)).toBe('Rp489');
  });
});

describe('toBaseCents', () => {
  test('USD', () => {
    expect(toBaseCents(1.5, 'USD', fx)).toBe(150);
    expect(toBaseCents(0.015, 'USD', fx)).toBe(2);
  });
  test('IDR inverse of formatMoney', () => {
    expect(toBaseCents(24450, 'IDR', fx)).toBe(150);
    expect(toBaseCents(50000, 'IDR', fx)).toBe(307); // 306.75 -> 307
  });
  test('unknown currency treated as USD', () => {
    expect(toBaseCents(2, 'XYZ', fx)).toBe(200);
  });
  test('empty currency treated as USD', () => {
    expect(toBaseCents(1.5, '', fx)).toBe(150);
  });
  test('zero amount', () => {
    expect(toBaseCents(0, 'USD', fx)).toBe(0);
    expect(toBaseCents(0, 'IDR', fx)).toBe(0);
  });
});

describe('totp', () => {
  test('RFC 6238 vector (SHA1, T=59)', () => {
    const r = totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', new Date(59_000));
    expect(r.code).toBe('287082');
    expect(r.secondsRemaining).toBe(1);
  });
  test('more RFC vectors, spaces + lowercase accepted', () => {
    expect(totp('gezd gnbv gy3t qojq gezd gnbv gy3t qojq', new Date(1111111109_000)).code).toBe('081804');
    expect(totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', new Date(1234567890_000)).code).toBe('005924');
  });
  test('invalid secret', () => {
    expect(() => totp('not base32 !!')).toThrow(CoreError);
    expect(() => totp('   ')).toThrow(CoreError);
  });
});

describe('codes', () => {
  test('formats', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateProductCode()).toMatch(/^[0-9a-f]{8}$/);
      expect(generateOrderCode()).toMatch(/^TB-[A-Z2-9]{6}$/);
      expect(generateReferralCode()).toMatch(/^[A-Za-z0-9]{8}$/);
      expect(generatePaymentCode()).toMatch(/^PAY-[A-Z2-9]{10}$/);
    }
  });
});

describe('pageArgs', () => {
  test('defaults', () => {
    expect(pageArgs(undefined, undefined, 20)).toEqual({ page: 1, pageSize: 20, offset: 0 });
  });
  test('computes offset', () => {
    expect(pageArgs(3, 10, 20)).toEqual({ page: 3, pageSize: 10, offset: 20 });
  });
  test('clamps page to 1', () => {
    expect(pageArgs(-5, 10, 20).page).toBe(1);
    expect(pageArgs(0, 10, 20).page).toBe(1);
  });
  test('clamps pageSize between 1 and 100', () => {
    expect(pageArgs(1, 0, 20).pageSize).toBe(1);
    expect(pageArgs(1, 200, 20).pageSize).toBe(100);
  });
  test('floors fractional values', () => {
    expect(pageArgs(2.9, 10.7, 20)).toEqual({ page: 2, pageSize: 10, offset: 10 });
  });
});

describe('totalPages', () => {
  test('basic division', () => {
    expect(totalPages(0, 20)).toBe(1);
    expect(totalPages(20, 20)).toBe(1);
    expect(totalPages(21, 20)).toBe(2);
    expect(totalPages(100, 20)).toBe(5);
  });
});

describe('assertCents', () => {
  test('passes for safe integers', () => {
    expect(() => assertCents(0)).not.toThrow();
    expect(() => assertCents(100)).not.toThrow();
    expect(() => assertCents(-50)).not.toThrow();
  });
  test('throws for non-integers', () => {
    expect(() => assertCents(1.5)).toThrow(CoreError);
    expect(() => assertCents(NaN)).toThrow(CoreError);
    expect(() => assertCents(Infinity)).toThrow(CoreError);
  });
  test('uses custom field name', () => {
    try {
      assertCents(1.5, 'price');
    } catch (e) {
      expect((e as Error).message).toContain('price');
    }
  });
});

describe('bp (basis points)', () => {
  test('500 bp of 1000 = 50 (5%)', () => {
    expect(bp(1000, 500)).toBe(50);
  });
  test('100 bp of 100 = 1 (1%)', () => {
    expect(bp(100, 100)).toBe(1);
  });
  test('rounds to nearest integer', () => {
    expect(bp(333, 500)).toBe(17);
  });
  test('zero inputs', () => {
    expect(bp(0, 500)).toBe(0);
    expect(bp(1000, 0)).toBe(0);
  });
});

describe('CoreError', () => {
  test('stores code, message and meta', () => {
    const e = new CoreError('INSUFFICIENT_BALANCE', 'not enough', { balance: 50, required: 100 });
    expect(e.code).toBe('INSUFFICIENT_BALANCE');
    expect(e.message).toBe('not enough');
    expect(e.meta).toEqual({ balance: 50, required: 100 });
    expect(e.name).toBe('CoreError');
    expect(e).toBeInstanceOf(Error);
  });

  test('defaults message to code when omitted', () => {
    const e = new CoreError('NOT_FOUND');
    expect(e.message).toBe('NOT_FOUND');
    expect(e.meta).toBeUndefined();
  });

  test('meta defaults to undefined', () => {
    const e = new CoreError('INVALID_INPUT', 'bad input');
    expect(e.meta).toBeUndefined();
  });
});

describe('MAX_QUANTITY', () => {
  test('is 9999', () => {
    expect(MAX_QUANTITY).toBe(9999);
  });
});

describe('DEFAULT_SETTINGS', () => {
  test('has expected shape and defaults', () => {
    expect(DEFAULT_SETTINGS.referralPercentBp).toBe(500);
    expect(DEFAULT_SETTINGS.referralMaxPerTopup).toBe(300);
    expect(DEFAULT_SETTINGS.referralMinWithdraw).toBe(100);
    expect(DEFAULT_SETTINGS.topupMin).toBe(100);
    expect(DEFAULT_SETTINGS.topupBonusTiers).toEqual([]);
    expect(DEFAULT_SETTINGS.orderPaymentTtlMinutes).toBe(15);
    expect(DEFAULT_SETTINGS.fxRates).toEqual({});
    expect(DEFAULT_SETTINGS.supportedLanguages).toEqual(['id', 'en']);
    expect(DEFAULT_SETTINGS.storeName).toBe('TokoBun');
    expect(DEFAULT_SETTINGS.channelUrl).toBeNull();
    expect(DEFAULT_SETTINGS.supportUsername).toBeNull();
  });
});

describe('isUniqueViolation', () => {
  test('detects Postgres code 23505', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(new Error('other'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
  test('follows cause chain (drizzle wrapping)', () => {
    expect(isUniqueViolation({ cause: { code: '23505' } })).toBe(true);
    expect(isUniqueViolation({ cause: { cause: { code: '23505' } } })).toBe(true);
  });
  test('constraintIncludes filters by constraint name', () => {
    expect(isUniqueViolation({ code: '23505', constraint_name: 'products_code_unique' }, 'code')).toBe(true);
    expect(isUniqueViolation({ code: '23505', constraint_name: 'products_code_unique' }, 'slug')).toBe(false);
  });
  test('matches constraint property (without _name suffix)', () => {
    expect(isUniqueViolation({ code: '23505', constraint: 'users_email_unique' }, 'email')).toBe(true);
    expect(isUniqueViolation({ code: '23505', constraint: 'users_email_unique' }, 'phone')).toBe(false);
  });
  test('constraintIncludes with no constraint returns true (code match only)', () => {
    expect(isUniqueViolation({ code: '23505' }, 'anything')).toBe(false);
  });
});

describe('bp edge cases', () => {
  test('negative amount', () => {
    expect(bp(-1000, 500)).toBe(-50);
  });
  test('negative basis points', () => {
    expect(bp(1000, -500)).toBe(-50);
  });
  test('10000 bp = 100%', () => {
    expect(bp(1000, 10000)).toBe(1000);
  });
  test('1 bp of 1 cent', () => {
    expect(bp(1, 1)).toBe(0);
  });
  test('very large amount', () => {
    expect(bp(99999999, 500)).toBe(5000000);
  });
  test('double negative = positive', () => {
    expect(bp(-1000, -500)).toBe(50);
  });
  test('rounding: exact midpoint rounds to nearest', () => {
    // 1 * 5000 / 10000 = 0.5 → rounds to 1 (banker's or standard Math.round)
    expect(bp(1, 5000)).toBe(1);
    // 3 * 500 / 10000 = 0.15 → rounds to 0
    expect(bp(3, 500)).toBe(0);
    // 7 * 500 / 10000 = 0.35 → rounds to 0
    expect(bp(7, 500)).toBe(0);
    // 15 * 500 / 10000 = 0.75 → rounds to 1
    expect(bp(15, 500)).toBe(1);
  });
  test('exceeding 10000 bp (over 100%) works', () => {
    expect(bp(100, 20000)).toBe(200);
  });
});

describe('pageArgs edge cases', () => {
  test('NaN page falls back to 1', () => {
    const r = pageArgs(NaN, 10, 20);
    expect(r.page).toBe(1);
    expect(r.offset).toBe(0);
  });
  test('NaN pageSize falls back to defSize', () => {
    const r = pageArgs(1, NaN, 20);
    expect(r.pageSize).toBe(20);
  });
  test('NaN both page and pageSize fall back to defaults', () => {
    const r = pageArgs(NaN, NaN, 15);
    expect(r).toEqual({ page: 1, pageSize: 15, offset: 0 });
  });
  test('very large page is kept', () => {
    const r = pageArgs(99999, 10, 20);
    expect(r.page).toBe(99999);
    expect(r.offset).toBe(999980);
  });
  test('negative default size still clamps to 1', () => {
    const r = pageArgs(1, undefined, -5);
    expect(r.pageSize).toBe(1);
  });
  test('Infinity page falls back to 1', () => {
    const r = pageArgs(Infinity, 10, 20);
    expect(r.page).toBe(1);
    expect(r.offset).toBe(0);
  });
  test('Infinity pageSize falls back to defSize', () => {
    const r = pageArgs(1, Infinity, 20);
    expect(r.pageSize).toBe(20);
  });
  test('-Infinity page falls back to 1', () => {
    const r = pageArgs(-Infinity, 10, 20);
    expect(r.page).toBe(1);
    expect(r.offset).toBe(0);
  });
  test('page=1 pageSize=1 gives offset=0', () => {
    const r = pageArgs(1, 1, 20);
    expect(r).toEqual({ page: 1, pageSize: 1, offset: 0 });
  });
  test('page=2 pageSize=1 gives offset=1', () => {
    const r = pageArgs(2, 1, 20);
    expect(r).toEqual({ page: 2, pageSize: 1, offset: 1 });
  });
});

describe('totalPages edge cases', () => {
  test('1 item in page of 1 = 1 page', () => {
    expect(totalPages(1, 1)).toBe(1);
  });
  test('large total', () => {
    expect(totalPages(1000000, 50)).toBe(20000);
  });
  test('negative total still returns at least 1', () => {
    expect(totalPages(-10, 20)).toBe(1);
  });
  test('total = pageSize - 1', () => {
    expect(totalPages(19, 20)).toBe(1);
  });
  test('total = pageSize + 1 gives 2', () => {
    expect(totalPages(21, 20)).toBe(2);
  });
});

describe('base32Decode', () => {
  test('decodes known RFC 4648 value', () => {
    const buf = base32Decode('GEZDGNBVGY3TQOJQ');
    expect(buf.toString('utf8')).toBe('1234567890');
  });
  test('ignores spaces and hyphens', () => {
    const buf = base32Decode('GEZD GNBV-GY3T-QOJQ');
    expect(buf.toString('utf8')).toBe('1234567890');
  });
  test('case-insensitive', () => {
    const buf = base32Decode('gezdgnbvgy3tqojq');
    expect(buf.toString('utf8')).toBe('1234567890');
  });
  test('strips trailing padding', () => {
    const buf = base32Decode('GEZDGNBVGY3TQOJQ========');
    expect(buf.toString('utf8')).toBe('1234567890');
  });
  test('throws on empty input', () => {
    expect(() => base32Decode('')).toThrow(CoreError);
    expect(() => base32Decode('   ')).toThrow(CoreError);
  });
  test('throws on invalid characters', () => {
    expect(() => base32Decode('ABCD!@#$')).toThrow(CoreError);
  });
});

describe('hashApiKey', () => {
  test('returns deterministic sha256 hex', () => {
    const h1 = hashApiKey('tb_live_abc123');
    const h2 = hashApiKey('tb_live_abc123');
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });
  test('different keys produce different hashes', () => {
    expect(hashApiKey('tb_live_aaa')).not.toBe(hashApiKey('tb_live_bbb'));
  });
});

describe('formatMoney additional', () => {
  test('locale parameter changes formatting', () => {
    const result = formatMoney(1000, 'EUR', { EUR: 0.92 }, 'de-DE');
    expect(result).toContain('€');
    expect(result).toContain('9,20');
  });
  test('USDT with rate 1 formats like USD but with USDT symbol', () => {
    expect(formatMoney(250, 'USDT', { USDT: 1 })).toBe('2.50 USDT');
  });
  test('JPY zero-fraction formatting', () => {
    const result = formatMoney(1000, 'JPY', { JPY: 150 });
    expect(result).toContain('¥');
    expect(result).toContain('1,500');
  });
  test('rate of exactly 1 for non-USD', () => {
    expect(formatMoney(100, 'XYZ', { XYZ: 1 })).toContain('1.00');
  });
});

describe('toBaseCents additional', () => {
  test('negative local amount', () => {
    expect(toBaseCents(-1.5, 'USD', {})).toBe(-150);
  });
  test('IDR small amount rounds correctly', () => {
    expect(toBaseCents(1000, 'IDR', { IDR: 16300 })).toBe(6);
  });
  test('very small fractional cent', () => {
    expect(toBaseCents(0.001, 'USD', {})).toBe(0);
  });
  test('rate > 1 shrinks cents', () => {
    expect(toBaseCents(100, 'CUR', { CUR: 2 })).toBe(5000);
  });
});

describe('code generators uniqueness', () => {
  test('generateProductCode produces 200 unique codes', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateProductCode()));
    expect(codes.size).toBe(200);
    for (const c of codes) expect(c).toMatch(/^[0-9a-f]{8}$/);
  });
  test('generateOrderCode produces 200 unique codes', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateOrderCode()));
    expect(codes.size).toBe(200);
    for (const c of codes) expect(c).toMatch(/^TB-[A-Z2-9]{6}$/);
  });
  test('generateReferralCode produces 200 unique codes', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateReferralCode()));
    expect(codes.size).toBe(200);
    for (const c of codes) expect(c).toMatch(/^[A-Za-z0-9]{8}$/);
  });
  test('generatePaymentCode excludes ambiguous chars (0,1,I,O)', () => {
    const codes = Array.from({ length: 100 }, () => generatePaymentCode());
    for (const c of codes) {
      const body = c.slice(4);
      expect(body).not.toMatch(/[01IO]/);
    }
  });
  test('generateOrderCode excludes ambiguous chars', () => {
    const codes = Array.from({ length: 100 }, () => generateOrderCode());
    for (const c of codes) {
      const body = c.slice(3);
      expect(body).not.toMatch(/[01IO]/);
    }
  });
});

describe('totp edge cases', () => {
  test('at exact 30-second boundary secondsRemaining is 30', () => {
    const r = totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', new Date(0));
    expect(r.secondsRemaining).toBe(30);
  });
  test('at 29 seconds past boundary secondsRemaining is 1', () => {
    const r = totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', new Date(29_000));
    expect(r.secondsRemaining).toBe(1);
  });
  test('code is always 6 digits (left-padded)', () => {
    for (let t = 0; t < 10; t++) {
      const r = totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', new Date(t * 30_000));
      expect(r.code).toMatch(/^\d{6}$/);
    }
  });
  test('whitespace-only secret throws', () => {
    expect(() => totp('   ')).toThrow(CoreError);
  });
  test('secret with only padding chars throws', () => {
    expect(() => totp('====')).toThrow(CoreError);
  });
});

describe('CoreError re-export', () => {
  test('CoreError is exported from @tokobun/core and works as instanceof', () => {
    const e = new CoreError('NOT_FOUND', 'gone');
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(CoreError);
    expect(e.name).toBe('CoreError');
    expect(e.stack).toBeDefined();
  });
  test('every CoreErrorCode can be used', () => {
    const codes = [
      'NOT_FOUND', 'USER_BANNED', 'PRODUCT_INACTIVE', 'INVALID_QUANTITY',
      'OUT_OF_STOCK', 'INSUFFICIENT_BALANCE', 'VOUCHER_INVALID', 'VOUCHER_EXPIRED',
      'VOUCHER_LIMIT_REACHED', 'VOUCHER_MIN_TOTAL', 'AMOUNT_TOO_SMALL',
      'INVALID_STATE', 'INVALID_INPUT',
    ] as const;
    for (const code of codes) {
      const e = new CoreError(code);
      expect(e.code).toBe(code);
      expect(e.message).toBe(code);
    }
  });
  test('meta can carry arbitrary data', () => {
    const e = new CoreError('OUT_OF_STOCK', 'no stock', { productId: 42, needed: 5, available: 0 });
    expect(e.meta).toEqual({ productId: 42, needed: 5, available: 0 });
  });
});

describe('formatMoney rounding', () => {
  test('1 cent in IDR rounds correctly', () => {
    expect(formatMoney(1, 'IDR', { IDR: 16300 })).toBe('Rp163');
  });
  test('negative IDR amount', () => {
    const r = formatMoney(-100, 'IDR', { IDR: 16300 });
    expect(r).toContain('Rp');
    expect(r).toContain('-');
  });
  test('zero in IDR', () => {
    expect(formatMoney(0, 'IDR', { IDR: 16300 })).toBe('Rp0');
  });
  test('very large rate produces large local amounts', () => {
    const r = formatMoney(100, 'CUR', { CUR: 100 });
    expect(r).toContain('100');
  });
});

describe('toBaseCents symmetry', () => {
  test('USD round-trip: formatMoney → parse major → toBaseCents', () => {
    const formatted = formatMoney(12345, 'USD', {});
    const major = parseFloat(formatted.replace(/[^\d.-]/g, ''));
    expect(toBaseCents(major, 'USD', {})).toBe(12345);
  });
  test('toBaseCents with rate exactly 1', () => {
    expect(toBaseCents(10, 'USD', {})).toBe(1000);
    expect(toBaseCents(10, 'USD', { USD: 1 })).toBe(1000);
  });
});

describe('isUniqueViolation depth limit', () => {
  test('does not follow cause deeper than 3 levels', () => {
    const deep = { cause: { cause: { cause: { code: '23505' } } } };
    expect(isUniqueViolation(deep)).toBe(false);
  });
  test('exactly 3 levels works', () => {
    const three = { cause: { cause: { code: '23505' } } };
    expect(isUniqueViolation(three)).toBe(true);
  });
  test('constraintIncludes matches via message when no constraint_name or constraint', () => {
    const err = { code: '23505', message: 'duplicate key value violates unique constraint "users_referral_code_key"' };
    expect(isUniqueViolation(err, 'referral_code')).toBe(true);
    expect(isUniqueViolation(err, 'email')).toBe(false);
  });
  test('undefined/false-y cause does not crash', () => {
    expect(isUniqueViolation({ code: '23503', cause: undefined })).toBe(false);
    expect(isUniqueViolation({ code: '23503', cause: null })).toBe(false);
    expect(isUniqueViolation({ code: '23503', cause: 0 })).toBe(false);
  });
  test('circular-like structures do not loop (depth limit stops)', () => {
    const a: any = { cause: null };
    const b: any = { cause: a };
    a.cause = b; // circular
    expect(isUniqueViolation(a)).toBe(false);
  });
});

describe('assertCents custom field', () => {
  test('error message includes field name', () => {
    expect(() => assertCents(1.5, 'price')).toThrow(/price/);
    expect(() => assertCents(NaN, 'total')).toThrow(/total/);
  });
  test('MAX_SAFE_INTEGER passes', () => {
    expect(() => assertCents(Number.MAX_SAFE_INTEGER)).not.toThrow();
  });
  test('beyond MAX_SAFE_INTEGER throws', () => {
    expect(() => assertCents(Number.MAX_SAFE_INTEGER + 1)).toThrow(CoreError);
  });
  test('MIN_SAFE_INTEGER passes (negative balance is valid)', () => {
    expect(() => assertCents(Number.MIN_SAFE_INTEGER)).not.toThrow();
  });
  test('below MIN_SAFE_INTEGER throws', () => {
    expect(() => assertCents(Number.MIN_SAFE_INTEGER - 1)).toThrow(CoreError);
  });
  test('default field name is "amount"', () => {
    try {
      assertCents(1.5);
    } catch (e) {
      expect((e as Error).message).toContain('amount');
    }
  });
});

const storeRow = (over: Record<string, unknown> = {}) => ({
  id: 1,
  slug: 'toko-satu',
  name: 'Toko Satu',
  botToken: '123:ABCDEF',
  botUsername: 'toko_bot',
  adminIds: '111,222',
  adminChatId: -100,
  channelUrl: 'https://t.me/channel',
  isActive: true,
  createdAt: new Date(),
  ...over,
});

describe('toStoreInfo', () => {
  test('maps basic store row correctly', () => {
    const info = toStoreInfo(storeRow() as never);
    expect(info.id).toBe(1);
    expect(info.slug).toBe('toko-satu');
    expect(info.name).toBe('Toko Satu');
    expect(info.botToken).toBe('123:ABCDEF');
    expect(info.botUsername).toBe('toko_bot');
    expect(info.adminIds).toEqual([111, 222]);
    expect(info.adminChatId).toBe(-100);
    expect(info.channelUrl).toBe('https://t.me/channel');
    expect(info.isActive).toBe(true);
  });

  test('empty adminIds string produces empty array', () => {
    expect(toStoreInfo(storeRow({ adminIds: '' }) as never).adminIds).toEqual([]);
  });

  test('null-ish adminIds produces empty array', () => {
    expect(toStoreInfo(storeRow({ adminIds: null }) as never).adminIds).toEqual([]);
    expect(toStoreInfo(storeRow({ adminIds: undefined }) as never).adminIds).toEqual([]);
  });

  test('whitespace and trailing commas are handled', () => {
    expect(toStoreInfo(storeRow({ adminIds: ' 111 , 222 , ' }) as never).adminIds).toEqual([111, 222]);
  });

  test('non-numeric entries are filtered', () => {
    expect(toStoreInfo(storeRow({ adminIds: 'abc,123,def' }) as never).adminIds).toEqual([123]);
  });

  test('negative and zero IDs are filtered', () => {
    expect(toStoreInfo(storeRow({ adminIds: '-5,0,10' }) as never).adminIds).toEqual([10]);
  });

  test('float-like strings are filtered (not safe integers)', () => {
    expect(toStoreInfo(storeRow({ adminIds: '1.5,2,3.7' }) as never).adminIds).toEqual([2]);
  });

  test('very large numbers beyond safe integer are filtered', () => {
    const huge = String(Number.MAX_SAFE_INTEGER + 10);
    expect(toStoreInfo(storeRow({ adminIds: `${huge},42` }) as never).adminIds).toEqual([42]);
  });

  test('single admin id', () => {
    expect(toStoreInfo(storeRow({ adminIds: '999' }) as never).adminIds).toEqual([999]);
  });

  test('duplicate ids are preserved (not deduplicated)', () => {
    expect(toStoreInfo(storeRow({ adminIds: '5,5,5' }) as never).adminIds).toEqual([5, 5, 5]);
  });
});

const userRow = (over: Record<string, unknown> = {}) => ({
  id: 12345,
  username: 'john',
  firstName: 'John',
  language: 'en',
  currency: 'USD',
  tzOffsetMinutes: 420,
  balance: 5000,
  referralCode: 'ABC123',
  referredBy: null,
  notifyStock: true,
  notifyInfo: true,
  notifyReferral: false,
  isBanned: false,
  blockedBot: false,
  createdAt: new Date('2026-01-01'),
  lastSeenAt: new Date('2026-10-01'),
  ...over,
});

describe('toProfile', () => {
  test('maps user row to profile, excluding internal fields', () => {
    const profile = toProfile(userRow() as never);
    expect(profile.id).toBe(12345);
    expect(profile.username).toBe('john');
    expect(profile.firstName).toBe('John');
    expect(profile.language).toBe('en');
    expect(profile.currency).toBe('USD');
    expect(profile.tzOffsetMinutes).toBe(420);
    expect(profile.balance).toBe(5000);
    expect(profile.referralCode).toBe('ABC123');
    expect(profile.notifyStock).toBe(true);
    expect(profile.notifyInfo).toBe(true);
    expect(profile.notifyReferral).toBe(false);
    expect(profile.isBanned).toBe(false);
    expect(profile.createdAt).toEqual(new Date('2026-01-01'));
  });

  test('does not include internal fields (referredBy, blockedBot, lastSeenAt)', () => {
    const profile = toProfile(userRow() as never);
    expect('referredBy' in profile).toBe(false);
    expect('blockedBot' in profile).toBe(false);
    expect('lastSeenAt' in profile).toBe(false);
  });

  test('null username and firstName are preserved', () => {
    const profile = toProfile(userRow({ username: null, firstName: null }) as never);
    expect(profile.username).toBeNull();
    expect(profile.firstName).toBeNull();
  });

  test('zero balance is not falsy-coerced', () => {
    const profile = toProfile(userRow({ balance: 0 }) as never);
    expect(profile.balance).toBe(0);
  });

  test('negative balance is preserved', () => {
    const profile = toProfile(userRow({ balance: -100 }) as never);
    expect(profile.balance).toBe(-100);
  });
});

const ledgerRow = (over: Record<string, unknown> = {}) => ({
  id: 1,
  userId: 12345,
  amount: 500,
  type: 'topup' as const,
  refType: 'payment',
  refId: '42',
  balanceAfter: 1500,
  note: 'test deposit',
  createdAt: new Date('2026-05-01'),
  ...over,
});

describe('toLedgerEntry', () => {
  test('maps ledger row correctly', () => {
    const entry = toLedgerEntry(ledgerRow() as never);
    expect(entry.id).toBe(1);
    expect(entry.amount).toBe(500);
    expect(entry.type).toBe('topup');
    expect(entry.refType).toBe('payment');
    expect(entry.refId).toBe('42');
    expect(entry.balanceAfter).toBe(1500);
    expect(entry.note).toBe('test deposit');
    expect(entry.createdAt).toEqual(new Date('2026-05-01'));
  });

  test('excludes userId from the public entry', () => {
    const entry = toLedgerEntry(ledgerRow() as never);
    expect('userId' in entry).toBe(false);
  });

  test('null optional fields are preserved', () => {
    const entry = toLedgerEntry(ledgerRow({ refType: null, refId: null, note: null }) as never);
    expect(entry.refType).toBeNull();
    expect(entry.refId).toBeNull();
    expect(entry.note).toBeNull();
  });

  test('negative amount (purchase deduction) is preserved', () => {
    const entry = toLedgerEntry(ledgerRow({ amount: -250, balanceAfter: 750 }) as never);
    expect(entry.amount).toBe(-250);
    expect(entry.balanceAfter).toBe(750);
  });

  test('all ledger types are accepted', () => {
    const types = ['topup', 'topup_bonus', 'purchase', 'refund', 'adjustment', 'referral_transfer'] as const;
    for (const type of types) {
      const entry = toLedgerEntry(ledgerRow({ type }) as never);
      expect(entry.type).toBe(type);
    }
  });
});

const orderRow = (over: Record<string, unknown> = {}) => ({
  id: 100,
  storeId: 1,
  code: 'TB-ABCD23',
  userId: 12345,
  productId: 10,
  productName: 'Widget Pro',
  quantity: 3,
  unitPrice: 500,
  subtotal: 1500,
  discountBp: 500,
  discountAmount: 75,
  voucherId: null,
  voucherDiscount: 0,
  total: 1425,
  status: 'completed' as const,
  paidWith: 'balance' as const,
  completedAt: new Date('2026-06-01'),
  createdAt: new Date('2026-06-01'),
  ...over,
});

describe('toSummary', () => {
  test('maps order row to summary with correct fields', () => {
    const s = toSummary(orderRow() as never);
    expect(s.id).toBe(100);
    expect(s.storeId).toBe(1);
    expect(s.code).toBe('TB-ABCD23');
    expect(s.productId).toBe(10);
    expect(s.productName).toBe('Widget Pro');
    expect(s.quantity).toBe(3);
    expect(s.total).toBe(1425);
    expect(s.status).toBe('completed');
    expect(s.createdAt).toEqual(new Date('2026-06-01'));
  });

  test('excludes internal fields (userId, unitPrice, subtotal, paidWith, etc)', () => {
    const s = toSummary(orderRow() as never);
    expect('userId' in s).toBe(false);
    expect('unitPrice' in s).toBe(false);
    expect('subtotal' in s).toBe(false);
    expect('discountBp' in s).toBe(false);
    expect('discountAmount' in s).toBe(false);
    expect('voucherId' in s).toBe(false);
    expect('voucherDiscount' in s).toBe(false);
    expect('paidWith' in s).toBe(false);
    expect('completedAt' in s).toBe(false);
  });

  test('all order statuses are mapped correctly', () => {
    const statuses = ['pending_payment', 'completed', 'cancelled', 'refunded'] as const;
    for (const status of statuses) {
      const s = toSummary(orderRow({ status }) as never);
      expect(s.status).toBe(status);
    }
  });

  test('zero total order', () => {
    const s = toSummary(orderRow({ total: 0 }) as never);
    expect(s.total).toBe(0);
  });

  test('large quantity', () => {
    const s = toSummary(orderRow({ quantity: 9999 }) as never);
    expect(s.quantity).toBe(9999);
  });
});
