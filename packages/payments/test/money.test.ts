import { describe, expect, test } from 'bun:test';
import { centsToPay, currencyDecimals, formatPayAmount, fxRate, payToCents } from '../src/money';

const fx = { IDR: 16300, EUR: 0.92 };

describe('money conversions', () => {
  test('base cents -> IDR rounds up to whole rupiah', () => {
    expect(centsToPay(100, 'IDR', fx)).toBe(16300); // $1.00
    expect(centsToPay(150, 'IDR', fx)).toBe(24450); // $1.50
    expect(centsToPay(1, 'IDR', fx)).toBe(163);
    expect(centsToPay(1, 'IDR', { IDR: 16312.5 })).toBe(164); // 163.125 -> 164
  });

  test('base cents -> USD is exact', () => {
    expect(centsToPay(1234, 'USD', fx)).toBe(12.34);
    expect(formatPayAmount(centsToPay(150, 'USD', fx), 'USD')).toBe('1.50');
  });

  test('base cents -> 2-decimal currency rounds up to the cent', () => {
    expect(centsToPay(101, 'EUR', fx)).toBe(0.93); // 0.9292 -> 0.93
  });

  test('pay currency -> base cents', () => {
    expect(payToCents(10000, 'IDR', fx, 'up')).toBe(62); // 61.35 -> 62
    expect(payToCents(10000, 'IDR', fx, 'down')).toBe(61);
    expect(payToCents(16300, 'IDR', fx)).toBe(100);
    expect(payToCents(1.5, 'USD', fx)).toBe(150);
  });

  test('missing fx rate throws INVALID_STATE', () => {
    expect(() => centsToPay(100, 'THB', fx)).toThrow(/fx rate/);
  });

  test('formatPayAmount', () => {
    expect(formatPayAmount(16300, 'IDR')).toBe('16300');
    expect(formatPayAmount(0.1, 'USD')).toBe('0.10');
  });

  test('currencyDecimals: zero-decimal currencies', () => {
    for (const c of ['IDR', 'JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX', 'PYG']) {
      expect(currencyDecimals(c)).toBe(0);
    }
  });

  test('centsToPay: zero-decimal CLP rounds to whole units', () => {
    const rates = { CLP: 950 };
    expect(centsToPay(100, 'CLP', rates)).toBe(950);
    expect(centsToPay(1, 'CLP', rates)).toBe(10);
    expect(formatPayAmount(950, 'CLP')).toBe('950');
  });

  test('currencyDecimals: 2-decimal currencies', () => {
    expect(currencyDecimals('USD')).toBe(2);
    expect(currencyDecimals('EUR')).toBe(2);
    expect(currencyDecimals('GBP')).toBe(2);
  });

  test('currencyDecimals: case insensitive', () => {
    expect(currencyDecimals('idr')).toBe(0);
    expect(currencyDecimals('usd')).toBe(2);
  });

  test('fxRate: USD is always 1', () => {
    expect(fxRate('USD', {})).toBe(1);
    expect(fxRate('usd', {})).toBe(1);
  });

  test('fxRate: returns configured rate', () => {
    expect(fxRate('IDR', { IDR: 16300 })).toBe(16300);
  });

  test('fxRate: throws on zero, negative, or Infinity', () => {
    expect(() => fxRate('IDR', { IDR: 0 })).toThrow(/fx rate/);
    expect(() => fxRate('IDR', { IDR: -1 })).toThrow(/fx rate/);
    expect(() => fxRate('IDR', { IDR: Infinity })).toThrow(/fx rate/);
  });

  test('payToCents rounding modes: nearest', () => {
    expect(payToCents(10000, 'IDR', fx, 'nearest')).toBe(61);
  });
});

describe('currencyDecimals edge cases', () => {
  test('lowercase zero-decimal currencies resolve correctly', () => {
    expect(currencyDecimals('idr')).toBe(0);
    expect(currencyDecimals('jpy')).toBe(0);
    expect(currencyDecimals('krw')).toBe(0);
    expect(currencyDecimals('vnd')).toBe(0);
  });

  test('mixed case works', () => {
    expect(currencyDecimals('Idr')).toBe(0);
    expect(currencyDecimals('Jpy')).toBe(0);
  });

  test('unknown currencies default to 2 decimals', () => {
    expect(currencyDecimals('XYZ')).toBe(2);
    expect(currencyDecimals('ABC')).toBe(2);
  });
});

describe('fxRate edge cases', () => {
  test('lowercase usd returns 1', () => {
    expect(fxRate('usd', {})).toBe(1);
    expect(fxRate('Usd', { USD: 999 })).toBe(1);
  });

  test('NaN rate throws INVALID_STATE', () => {
    expect(() => fxRate('IDR', { IDR: NaN })).toThrow(/fx rate/);
  });

  test('missing currency (not in map) throws', () => {
    expect(() => fxRate('THB', {})).toThrow(/fx rate/);
    expect(() => fxRate('THB', { IDR: 16300 })).toThrow(/fx rate/);
  });

  test('thrown error includes currency code', () => {
    try {
      fxRate('MYR', {});
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.code).toBe('INVALID_STATE');
      expect(err.meta?.currency).toBe('MYR');
    }
  });
});

describe('centsToPay EPS edge cases', () => {
  test('100 cents in USD at rate 1 is exactly 1.00', () => {
    expect(centsToPay(100, 'USD', { USD: 1 })).toBe(1.00);
  });

  test('1 cent in IDR at rate 16300 rounds up to 163', () => {
    expect(centsToPay(1, 'IDR', { IDR: 16300 })).toBe(163);
  });

  test('rounding always goes up (store never receives less)', () => {
    const rates = { IDR: 16300 };
    for (const cents of [1, 3, 7, 13, 99, 101, 999]) {
      const pay = centsToPay(cents, 'IDR', rates);
      const backCents = payToCents(pay, 'IDR', rates, 'down');
      expect(backCents).toBeGreaterThanOrEqual(cents);
    }
  });

  test('exact conversion with no rounding needed', () => {
    expect(centsToPay(100, 'IDR', { IDR: 16300 })).toBe(16300);
    expect(centsToPay(200, 'IDR', { IDR: 16300 })).toBe(32600);
  });

  test('very small fractional cent in 2-decimal currency rounds up', () => {
    const rates = { EUR: 0.92 };
    const pay = centsToPay(1, 'EUR', rates);
    expect(pay).toBe(0.01);
  });
});

describe('payToCents rounding modes edge cases', () => {
  test('up vs down differ for non-exact conversions', () => {
    const rates = { IDR: 16300 };
    const up = payToCents(10000, 'IDR', rates, 'up');
    const down = payToCents(10000, 'IDR', rates, 'down');
    expect(up).toBeGreaterThanOrEqual(down);
    expect(up).toBe(62);
    expect(down).toBe(61);
  });

  test('default rounding is up', () => {
    const rates = { IDR: 16300 };
    expect(payToCents(10000, 'IDR', rates)).toBe(payToCents(10000, 'IDR', rates, 'up'));
  });

  test('exact conversion gives same result for all modes', () => {
    const rates = { IDR: 16300 };
    const val = 16300;
    expect(payToCents(val, 'IDR', rates, 'up')).toBe(100);
    expect(payToCents(val, 'IDR', rates, 'down')).toBe(100);
    expect(payToCents(val, 'IDR', rates, 'nearest')).toBe(100);
  });

  test('USD payToCents is exact', () => {
    expect(payToCents(1.50, 'USD', {}, 'up')).toBe(150);
    expect(payToCents(1.50, 'USD', {}, 'down')).toBe(150);
    expect(payToCents(1.50, 'USD', {}, 'nearest')).toBe(150);
  });
});

describe('formatPayAmount edge cases', () => {
  test('IDR: zero decimal places', () => {
    expect(formatPayAmount(16300, 'IDR')).toBe('16300');
    expect(formatPayAmount(0, 'IDR')).toBe('0');
    expect(formatPayAmount(1, 'IDR')).toBe('1');
  });

  test('JPY: zero decimal places', () => {
    expect(formatPayAmount(1500, 'JPY')).toBe('1500');
    expect(formatPayAmount(0, 'JPY')).toBe('0');
  });

  test('USD: two decimal places', () => {
    expect(formatPayAmount(1.5, 'USD')).toBe('1.50');
    expect(formatPayAmount(0, 'USD')).toBe('0.00');
    expect(formatPayAmount(99.99, 'USD')).toBe('99.99');
  });

  test('EUR: two decimal places', () => {
    expect(formatPayAmount(10.1, 'EUR')).toBe('10.10');
    expect(formatPayAmount(0.01, 'EUR')).toBe('0.01');
  });

  test('GBP: two decimal places', () => {
    expect(formatPayAmount(5, 'GBP')).toBe('5.00');
  });
});
