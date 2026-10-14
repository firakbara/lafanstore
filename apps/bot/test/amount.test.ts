import { describe, expect, test } from 'bun:test';
import { exampleAmount, isZeroDecimal, parseAmount } from '../src/util/amount';

describe('isZeroDecimal', () => {
  test('IDR, JPY, KRW, VND are zero-decimal', () => {
    for (const c of ['IDR', 'JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX', 'PYG']) {
      expect(isZeroDecimal(c)).toBe(true);
    }
  });

  test('USD, EUR, GBP are not zero-decimal', () => {
    for (const c of ['USD', 'EUR', 'GBP', 'AUD', 'SGD']) {
      expect(isZeroDecimal(c)).toBe(false);
    }
  });

  test('case-insensitive', () => {
    expect(isZeroDecimal('idr')).toBe(true);
    expect(isZeroDecimal('usd')).toBe(false);
  });
});

describe('parseAmount', () => {
  describe('zero-decimal currencies (IDR)', () => {
    test('plain integer', () => {
      expect(parseAmount('50000', 'IDR')).toBe(50000);
    });

    test('dot thousands separator', () => {
      expect(parseAmount('50.000', 'IDR')).toBe(50000);
    });

    test('comma thousands separator', () => {
      expect(parseAmount('50,000', 'IDR')).toBe(50000);
    });

    test('Rp prefix stripped', () => {
      expect(parseAmount('Rp 50.000', 'IDR')).toBe(50000);
    });

    test('trailing .00 dropped', () => {
      expect(parseAmount('50.000,00', 'IDR')).toBe(50000);
    });

    test('trailing ,00 dropped', () => {
      expect(parseAmount('50000.00', 'IDR')).toBe(50000);
    });

    test('single digit trailing dropped', () => {
      expect(parseAmount('50000,0', 'IDR')).toBe(50000);
    });
  });

  describe('decimal currencies (USD)', () => {
    test('plain integer', () => {
      expect(parseAmount('5', 'USD')).toBe(5);
    });

    test('dot decimal', () => {
      expect(parseAmount('5.50', 'USD')).toBe(5.5);
    });

    test('comma decimal (European style)', () => {
      expect(parseAmount('5,50', 'USD')).toBe(5.5);
    });

    test('$ prefix stripped', () => {
      expect(parseAmount('$5.50', 'USD')).toBe(5.5);
    });

    test('thousands + decimal with dot last', () => {
      expect(parseAmount('1,000.50', 'USD')).toBe(1000.5);
    });

    test('thousands + decimal with comma last (European)', () => {
      expect(parseAmount('1.000,50', 'USD')).toBe(1000.5);
    });

    test('single decimal digit after comma = decimal', () => {
      expect(parseAmount('1,5', 'USD')).toBe(1.5);
    });

    test('3+ digits after separator = thousands grouping', () => {
      expect(parseAmount('1,500', 'USD')).toBe(1500);
    });

    test('multiple thousands groups no decimal', () => {
      expect(parseAmount('1.000.000', 'USD')).toBe(1000000);
    });
  });

  describe('edge cases', () => {
    test('empty string returns null', () => {
      expect(parseAmount('', 'USD')).toBeNull();
    });

    test('no digits returns null', () => {
      expect(parseAmount('abc', 'USD')).toBeNull();
    });

    test('zero returns null (not positive)', () => {
      expect(parseAmount('0', 'USD')).toBeNull();
    });

    test('negative sign stripped — parses as positive', () => {
      expect(parseAmount('-5', 'USD')).toBe(5);
    });

    test('whitespace-only returns null', () => {
      expect(parseAmount('   ', 'USD')).toBeNull();
    });

    test('leading/trailing whitespace trimmed', () => {
      expect(parseAmount('  50  ', 'USD')).toBe(50);
    });

    test('only separator returns null (no real digits)', () => {
      expect(parseAmount('.', 'USD')).toBeNull();
      expect(parseAmount(',', 'USD')).toBeNull();
    });

    test('currency symbols are stripped', () => {
      expect(parseAmount('€10.50', 'EUR')).toBe(10.5);
      expect(parseAmount('¥1500', 'JPY')).toBe(1500);
    });

    test('spaces between digits are stripped', () => {
      expect(parseAmount('50 000', 'IDR')).toBe(50000);
    });

    test('IDR trailing ,5 (single digit) is dropped', () => {
      expect(parseAmount('10000,5', 'IDR')).toBe(10000);
    });

    test('multiple separators in decimal currency = thousands', () => {
      expect(parseAmount('1,000,000', 'USD')).toBe(1000000);
    });

    test('decimal currency: comma with exactly 2 trailing digits = decimal', () => {
      expect(parseAmount('3,99', 'USD')).toBe(3.99);
    });

    test('Infinity / NaN text returns null', () => {
      expect(parseAmount('Infinity', 'USD')).toBeNull();
      expect(parseAmount('NaN', 'USD')).toBeNull();
    });
  });
});

describe('exampleAmount', () => {
  test('zero-decimal: rounds to integer', () => {
    const r = exampleAmount(10000, 'IDR');
    expect(Number(r)).toBe(50000);
    expect(r).not.toContain('.');
  });

  test('decimal: gives nice number', () => {
    const r = exampleAmount(1, 'USD');
    expect(Number(r)).toBeGreaterThanOrEqual(1);
    expect(Number(r)).toBe(5);
  });

  test('very small min still gives positive result', () => {
    const r = exampleAmount(0.001, 'USD');
    expect(Number(r)).toBeGreaterThan(0);
  });

  test('zero min gives at least the floor for the currency', () => {
    expect(Number(exampleAmount(0, 'IDR'))).toBeGreaterThanOrEqual(1);
    expect(Number(exampleAmount(0, 'USD'))).toBeGreaterThanOrEqual(0.01);
  });
});
