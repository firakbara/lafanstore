import { describe, expect, test } from 'bun:test';
import { formatTz, formatDateTime, formatDate, minutesLeft, TZ_OFFSETS, signed, displayName } from '../src/util/format';
import { parseAmount, isZeroDecimal, exampleAmount } from '../src/util/amount';
import { clampQty, pressKey, maxQtyFor, MAX_QTY } from '../src/util/quantity';
import { errorText, isCoreError, isNotModified, isMessageGone, isBlocked, retryAfter } from '../src/util/errors';
import { ttlCache, countryOf } from '../src/util/cache';
import { CoreError } from '@tokobun/core';

describe('formatTz', () => {
  test('positive offset', () => expect(formatTz(420)).toBe('UTC+7'));
  test('negative offset', () => expect(formatTz(-300)).toBe('UTC-5'));
  test('zero', () => expect(formatTz(0)).toBe('UTC+0'));
  test('half-hour offset', () => expect(formatTz(330)).toBe('UTC+5:30'));
  test('negative half-hour', () => expect(formatTz(-210)).toBe('UTC-3:30'));
  test('45-min offset', () => expect(formatTz(345)).toBe('UTC+5:45'));
});

describe('formatDateTime / formatDate', () => {
  const d = new Date('2026-10-03T14:05:30Z');
  test('UTC+0', () => expect(formatDateTime(d, 0)).toBe('2026-10-03 14:05'));
  test('UTC+7', () => expect(formatDateTime(d, 420)).toBe('2026-10-03 21:05'));
  test('UTC-5', () => expect(formatDateTime(d, -300)).toBe('2026-10-03 09:05'));
  test('formatDate returns date only', () => expect(formatDate(d, 0)).toBe('2026-10-03'));
  test('day boundary crossing', () => expect(formatDate(d, 720)).toBe('2026-10-04'));
});

describe('minutesLeft', () => {
  test('positive remaining', () => {
    const until = new Date('2026-10-03T01:15:00Z');
    const now = new Date('2026-10-03T01:00:00Z');
    expect(minutesLeft(until, now)).toBe(15);
  });
  test('rounds up partial minutes', () => {
    const until = new Date('2026-10-03T01:01:01Z');
    const now = new Date('2026-10-03T01:00:00Z');
    expect(minutesLeft(until, now)).toBe(2);
  });
  test('never negative', () => {
    const until = new Date('2026-10-03T00:00:00Z');
    const now = new Date('2026-10-03T01:00:00Z');
    expect(minutesLeft(until, now)).toBe(0);
  });
});

describe('TZ_OFFSETS', () => {
  test('covers UTC-12 to UTC+14', () => {
    expect(TZ_OFFSETS[0]).toBe(-720);
    expect(TZ_OFFSETS.at(-1)).toBe(840);
    expect(TZ_OFFSETS).toHaveLength(27);
  });
});

describe('signed', () => {
  const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
  test('positive', () => expect(signed(500, fmt)).toBe('+$5.00'));
  test('negative', () => expect(signed(-250, fmt)).toBe('-$2.50'));
  test('zero is positive', () => expect(signed(0, fmt)).toBe('+$0.00'));
});

describe('displayName', () => {
  test('firstName takes priority', () => expect(displayName({ firstName: 'Alice', username: 'alice', id: 1 })).toBe('Alice'));
  test('username fallback', () => expect(displayName({ firstName: null, username: 'bob', id: 2 })).toBe('@bob'));
  test('id fallback', () => expect(displayName({ firstName: null, username: null, id: 3 })).toBe('3'));
  test('empty firstName uses username', () => expect(displayName({ firstName: '', username: 'x', id: 4 })).toBe('@x'));
});

describe('parseAmount', () => {
  test('plain number (USD)', () => expect(parseAmount('5', 'USD')).toBe(5));
  test('decimal number', () => expect(parseAmount('1.50', 'USD')).toBe(1.5));
  test('comma as decimal separator', () => expect(parseAmount('1,50', 'USD')).toBe(1.5));
  test('IDR: drops thousands separator', () => expect(parseAmount('50.000', 'IDR')).toBe(50000));
  test('IDR: strips currency prefix', () => expect(parseAmount('Rp 50.000', 'IDR')).toBe(50000));
  test('USD: strips currency prefix', () => expect(parseAmount('$5', 'USD')).toBe(5));
  test('mixed dot and comma (1.500,50)', () => expect(parseAmount('1.500,50', 'USD')).toBe(1500.5));
  test('mixed comma and dot (1,500.50)', () => expect(parseAmount('1,500.50', 'USD')).toBe(1500.5));
  test('IDR: trailing decimal stripped', () => expect(parseAmount('50.000,00', 'IDR')).toBe(50000));
  test('rejects non-numeric', () => expect(parseAmount('abc', 'USD')).toBeNull());
  test('rejects empty string', () => expect(parseAmount('', 'USD')).toBeNull());
  test('rejects zero', () => expect(parseAmount('0', 'USD')).toBeNull());
  test('strips minus sign (user intent: positive amount)', () => expect(parseAmount('-5', 'USD')).toBe(5));
  test('thousands grouping in USD (1,000)', () => expect(parseAmount('1,000', 'USD')).toBe(1000));
});

describe('isZeroDecimal', () => {
  test('IDR is zero decimal', () => expect(isZeroDecimal('IDR')).toBe(true));
  test('JPY is zero decimal', () => expect(isZeroDecimal('JPY')).toBe(true));
  test('USD is not', () => expect(isZeroDecimal('USD')).toBe(false));
  test('case-insensitive', () => expect(isZeroDecimal('idr')).toBe(true));
});

describe('exampleAmount', () => {
  test('IDR: rounds to integer', () => {
    const result = exampleAmount(10000, 'IDR');
    expect(Number(result)).toBeGreaterThanOrEqual(10000);
    expect(result).not.toContain('.');
  });
  test('USD: includes decimals', () => {
    const result = exampleAmount(1, 'USD');
    expect(Number(result)).toBeGreaterThan(0);
  });
  test('minimum floor for zero-decimal', () => {
    expect(Number(exampleAmount(0, 'IDR'))).toBeGreaterThanOrEqual(1);
  });
});

describe('clampQty', () => {
  test('clamps to 1 minimum', () => expect(clampQty(0, 10)).toBe(1));
  test('clamps to max', () => expect(clampQty(15, 10)).toBe(10));
  test('null max uses MAX_QTY', () => expect(clampQty(99999, null)).toBe(MAX_QTY));
  test('truncates float', () => expect(clampQty(3.9, 10)).toBe(3));
  test('NaN becomes 1', () => expect(clampQty(NaN, 10)).toBe(1));
});

describe('pressKey', () => {
  test('digit appends when typing', () => {
    expect(pressKey({ qty: 1, typing: true }, 2, 100)).toEqual({ qty: 12, typing: true });
  });
  test('digit replaces when not typing', () => {
    expect(pressKey({ qty: 5, typing: false }, 3, 100)).toEqual({ qty: 3, typing: true });
  });
  test('del resets when not typing', () => {
    expect(pressKey({ qty: 5, typing: false }, 'del', 100)).toEqual({ qty: 1, typing: false });
  });
  test('del removes last digit', () => {
    expect(pressKey({ qty: 12, typing: true }, 'del', 100)).toEqual({ qty: 1, typing: true });
  });
  test('del from single digit resets', () => {
    expect(pressKey({ qty: 3, typing: true }, 'del', 100)).toEqual({ qty: 1, typing: false });
  });
  test('caps at max', () => {
    expect(pressKey({ qty: 5, typing: true }, 9, 12).qty).toBe(12);
  });
  test('rejects 5th digit', () => {
    expect(pressKey({ qty: 9999, typing: true }, 1, null).qty).toBe(MAX_QTY);
  });
  test('leading zero ignored', () => {
    expect(pressKey({ qty: 1, typing: false }, 0, 10)).toEqual({ qty: 1, typing: false });
  });
});

describe('maxQtyFor', () => {
  test('null returns null', () => expect(maxQtyFor(null)).toBeNull());
  test('positive stock', () => expect(maxQtyFor(5)).toBe(5));
  test('zero stock still returns 1', () => expect(maxQtyFor(0)).toBe(1));
});

describe('error utilities', () => {
  test('errorText with CoreError', () => {
    const err = new CoreError('OUT_OF_STOCK');
    const text = errorText(err, 'en');
    expect(text).toBeTruthy();
    expect(typeof text).toBe('string');
  });

  test('errorText with duck-typed CoreError', () => {
    const err = { name: 'CoreError', code: 'OUT_OF_STOCK' };
    const text = errorText(err, 'en');
    expect(text).toBeTruthy();
  });

  test('errorText with generic error', () => {
    const text = errorText(new Error('random'), 'en');
    expect(text).toBeTruthy();
  });

  test('isCoreError', () => {
    expect(isCoreError(new CoreError('OUT_OF_STOCK'))).toBe(true);
    expect(isCoreError({ name: 'CoreError', code: 'X' })).toBe(true);
    expect(isCoreError(new Error('x'))).toBe(false);
    expect(isCoreError(null)).toBe(false);
  });

  test('isNotModified', () => {
    expect(isNotModified({ description: 'Bad Request: message is not modified' })).toBe(true);
    expect(isNotModified(new Error('other'))).toBe(false);
  });

  test('isMessageGone', () => {
    expect(isMessageGone({ description: 'message to edit not found' })).toBe(true);
    expect(isMessageGone({ description: "message can't be edited" })).toBe(true);
    expect(isMessageGone({ description: 'MESSAGE_ID_INVALID' })).toBe(true);
    expect(isMessageGone(new Error('other'))).toBe(false);
  });

  test('isBlocked', () => {
    expect(isBlocked({ error_code: 403 })).toBe(true);
    expect(isBlocked({ description: 'bot was blocked by the user' })).toBe(true);
    expect(isBlocked({ description: 'user is deactivated' })).toBe(true);
    expect(isBlocked(new Error('other'))).toBe(false);
  });

  test('retryAfter', () => {
    expect(retryAfter({ parameters: { retry_after: 30 } })).toBe(30);
    expect(retryAfter(new Error('other'))).toBeNull();
    expect(retryAfter(null)).toBeNull();
  });
});

describe('ttlCache', () => {
  test('caches value within TTL', async () => {
    let calls = 0;
    const cache = ttlCache<string, number>(10_000, async (k) => { calls++; return k.length; });
    const v1 = await cache.get('hello');
    const v2 = await cache.get('hello');
    expect(v1).toBe(5);
    expect(v2).toBe(5);
    expect(calls).toBe(1);
  });

  test('deduplicates concurrent loads', async () => {
    let calls = 0;
    const cache = ttlCache<string, number>(10_000, async (k) => { calls++; return k.length; });
    const [a, b] = await Promise.all([cache.get('test'), cache.get('test')]);
    expect(a).toBe(4);
    expect(b).toBe(4);
    expect(calls).toBe(1);
  });

  test('clear empties cache', async () => {
    let calls = 0;
    const cache = ttlCache<string, number>(10_000, async () => { calls++; return 42; });
    await cache.get('a');
    cache.clear();
    await cache.get('a');
    expect(calls).toBe(2);
  });

  test('evicts when maxSize exceeded', async () => {
    const cache = ttlCache<number, number>(10_000, async (k) => k, 2);
    await cache.get(1);
    await cache.get(2);
    await cache.get(3);
    expect(await cache.get(3)).toBe(3);
  });
});

describe('countryOf', () => {
  test('IDR currency returns ID', () => expect(countryOf({ language: 'en', currency: 'IDR' })).toBe('ID'));
  test('id language returns ID', () => expect(countryOf({ language: 'id', currency: 'USD' })).toBe('ID'));
  test('other returns null', () => expect(countryOf({ language: 'en', currency: 'USD' })).toBeNull());
});
