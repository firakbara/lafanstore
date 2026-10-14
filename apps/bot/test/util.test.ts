import { describe, expect, test } from 'bun:test';
import { CoreError } from '@tokobun/core';
import { ttlCache, countryOf } from '../src/util/cache';
import { encode, decode, intArg, sortCode, sortFromCode, nextSort, notifyFromCode, MAX_CALLBACK_BYTES, cb } from '../src/callback';
import { parseConfig } from '../src/config';
import { parseAddSaldo } from '../src/handlers/admin';
import { parseStartPayload } from '../src/handlers/commands';
import { exampleAmount, isZeroDecimal, parseAmount } from '../src/util/amount';
import { errorText, isBlocked, isCoreError, isMessageGone, isNotModified, retryAfter } from '../src/util/errors';
import { displayName, formatDate, formatDateTime, formatTz, minutesLeft, signed, TZ_OFFSETS } from '../src/util/format';
import { withUserLock } from '../src/util/lock';
import { clampQty, maxQtyFor, pressKey } from '../src/util/quantity';
import { RateLimiter } from '../src/util/ratelimit';
import { qrPng } from '../src/util/qr';
import { broadcastText } from '../src/workers/broadcast';

describe('quantity keypad', () => {
  test('first digit replaces, next digits append', () => {
    let s = { qty: 1, typing: false };
    s = pressKey(s, 1, null);
    expect(s).toEqual({ qty: 1, typing: true });
    s = pressKey(s, 5, null);
    s = pressKey(s, 0, null);
    expect(s).toEqual({ qty: 150, typing: true });
  });
  test('leading zero ignored, max 4 digits', () => {
    expect(pressKey({ qty: 1, typing: false }, 0, null)).toEqual({ qty: 1, typing: false });
    expect(pressKey({ qty: 9999, typing: true }, 9, null).qty).toBe(9999);
  });
  test('capped at stock', () => {
    expect(pressKey({ qty: 4, typing: true }, 5, 20)).toEqual({ qty: 20, typing: true });
    expect(clampQty(0, 5)).toBe(1);
    expect(clampQty(50, 0)).toBe(1);
  });
  test('Del removes the last digit, back to 1 when empty', () => {
    expect(pressKey({ qty: 150, typing: true }, 'del', null)).toEqual({ qty: 15, typing: true });
    expect(pressKey({ qty: 7, typing: true }, 'del', null)).toEqual({ qty: 1, typing: false });
    expect(pressKey({ qty: 3, typing: false }, 'del', null)).toEqual({ qty: 1, typing: false });
  });
  test('clampQty edge cases', () => {
    expect(clampQty(5, null)).toBe(5);
    expect(clampQty(NaN, null)).toBe(1);
    expect(clampQty(-5, null)).toBe(1);
    expect(clampQty(100, 50)).toBe(50);
  });
});

describe('amount parsing', () => {
  test('IDR (zero-decimal)', () => {
    expect(parseAmount('50000', 'IDR')).toBe(50000);
    expect(parseAmount('50.000', 'IDR')).toBe(50000);
    expect(parseAmount('Rp 1.250.000', 'IDR')).toBe(1250000);
    expect(parseAmount('50,000', 'IDR')).toBe(50000);
  });
  test('USD', () => {
    expect(parseAmount('5', 'USD')).toBe(5);
    expect(parseAmount('$2.50', 'USD')).toBe(2.5);
    expect(parseAmount('2,5', 'USD')).toBe(2.5);
    expect(parseAmount('1,000', 'USD')).toBe(1000);
    expect(parseAmount('1,000.75', 'USD')).toBe(1000.75);
    expect(parseAmount('1.000,75', 'EUR')).toBe(1000.75);
  });
  test('IDR strips trailing decimal cents', () => {
    expect(parseAmount('50.000,00', 'IDR')).toBe(50000);
    expect(parseAmount('50000.00', 'IDR')).toBe(50000);
  });
  test('zero is rejected, minus is stripped (user input)', () => {
    expect(parseAmount('-5', 'USD')).toBe(5);
    expect(parseAmount('0', 'USD')).toBeNull();
    expect(parseAmount('0.00', 'USD')).toBeNull();
    expect(parseAmount('-100', 'IDR')).toBe(100);
  });
  test('whitespace-only and symbols-only are rejected', () => {
    expect(parseAmount('   ', 'USD')).toBeNull();
    expect(parseAmount('$', 'USD')).toBeNull();
    expect(parseAmount('Rp', 'IDR')).toBeNull();
  });
  test('other zero-decimal currencies', () => {
    expect(parseAmount('1000', 'JPY')).toBe(1000);
    expect(parseAmount('1,000', 'KRW')).toBe(1000);
    expect(parseAmount('50.000', 'VND')).toBe(50000);
  });
  test('three-digit tail in decimal currency is thousands grouping', () => {
    expect(parseAmount('1,500', 'USD')).toBe(1500);
    expect(parseAmount('1.500', 'EUR')).toBe(1500);
  });
  test('mixed separators with European style', () => {
    expect(parseAmount('10.000,5', 'EUR')).toBe(10000.5);
  });
  test('example amount', () => {
    expect(exampleAmount(16300, 'IDR')).toBe('82000');
    expect(exampleAmount(1, 'USD')).toBe('5');
  });
  test('example amount with zero minMajor', () => {
    expect(Number(exampleAmount(0, 'USD'))).toBeGreaterThan(0);
    expect(Number(exampleAmount(0, 'IDR'))).toBeGreaterThanOrEqual(1);
  });
});

describe('format', () => {
  test('formatTz', () => {
    expect(formatTz(420)).toBe('UTC+7');
    expect(formatTz(-210)).toBe('UTC-3:30');
    expect(formatTz(0)).toBe('UTC+0');
    expect(TZ_OFFSETS[0]).toBe(-720);
    expect(TZ_OFFSETS.at(-1)).toBe(840);
    expect(TZ_OFFSETS.length).toBe(27);
  });
  test('formatDateTime applies the offset', () => {
    expect(formatDateTime(new Date('2026-10-03T20:30:00Z'), 420)).toBe('2026-10-04 03:30');
  });
  test('minutesLeft / signed', () => {
    const now = new Date('2026-10-03T00:00:00Z');
    expect(minutesLeft(new Date('2026-10-03T00:14:01Z'), now)).toBe(15);
    expect(minutesLeft(new Date('2026-10-02T00:00:00Z'), now)).toBe(0);
    expect(signed(-150, (c) => `$${c / 100}`)).toBe('-$1.5');
    expect(signed(150, (c) => `$${c / 100}`)).toBe('+$1.5');
  });
});

describe('rate limiter', () => {
  test('burst then refill', () => {
    let now = 0;
    const rl = new RateLimiter({ capacity: 2, refillPerSec: 1, now: () => now });
    expect(rl.take(1)).toBe(true);
    expect(rl.take(1)).toBe(true);
    expect(rl.take(1)).toBe(false);
    expect(rl.take(2)).toBe(true); // other users unaffected
    now = 1000;
    expect(rl.take(1)).toBe(true);
    expect(rl.take(1)).toBe(false);
  });
  test('sweep removes stale entries after size threshold', () => {
    let now = 0;
    const rl = new RateLimiter({ capacity: 1, refillPerSec: 1, now: () => now });
    for (let i = 0; i < 50_002; i++) {
      rl.take(i);
    }
    now = 2000;
    rl.take('new-key');
    expect(rl.take('new-key')).toBe(false);
  });
});

describe('error classification', () => {
  test('isNotModified detects "message is not modified"', () => {
    expect(isNotModified({ description: 'Bad Request: message is not modified' })).toBe(true);
    expect(isNotModified(new Error('unrelated'))).toBe(false);
  });

  test('isMessageGone detects stale messages', () => {
    expect(isMessageGone({ description: 'Bad Request: message to edit not found' })).toBe(true);
    expect(isMessageGone({ description: "Bad Request: message can't be edited" })).toBe(true);
    expect(isMessageGone({ description: 'Bad Request: message to delete not found' })).toBe(true);
    expect(isMessageGone({ description: 'Bad Request: there is no text in the message' })).toBe(true);
    expect(isMessageGone({ description: 'MESSAGE_ID_INVALID' })).toBe(true);
    expect(isMessageGone(new Error('something else'))).toBe(false);
  });

  test('isBlocked detects blocked/deactivated users', () => {
    expect(isBlocked({ error_code: 403 })).toBe(true);
    expect(isBlocked({ description: 'Forbidden: bot was blocked by the user' })).toBe(true);
    expect(isBlocked({ description: 'Forbidden: user is deactivated' })).toBe(true);
    expect(isBlocked({ description: 'Bad Request: chat not found' })).toBe(true);
    expect(isBlocked(new Error('timeout'))).toBe(false);
  });

  test('retryAfter extracts the retry_after parameter', () => {
    expect(retryAfter({ parameters: { retry_after: 30 } })).toBe(30);
    expect(retryAfter(new Error('no params'))).toBeNull();
    expect(retryAfter(null)).toBeNull();
  });

  test('isCoreError detects CoreError instances', () => {
    expect(isCoreError(new CoreError('NOT_FOUND'))).toBe(true);
    expect(isCoreError({ name: 'CoreError', code: 'NOT_FOUND' })).toBe(true);
    expect(isCoreError(new Error('generic'))).toBe(false);
    expect(isCoreError(null)).toBe(false);
  });

  test('errorText returns translated code for CoreError', () => {
    const text = errorText(new CoreError('NOT_FOUND'), 'en');
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toContain('NOT_FOUND');
  });

  test('errorText returns generic for unknown errors', () => {
    const text = errorText(new Error('boom'), 'en');
    expect(text.length).toBeGreaterThan(0);
  });

  test('errorText handles duck-typed CoreError', () => {
    const duck = { name: 'CoreError', code: 'OUT_OF_STOCK', message: 'out' };
    const text = errorText(duck, 'en');
    expect(text.length).toBeGreaterThan(0);
  });
});

describe('withUserLock', () => {
  test('runs the function and returns true', async () => {
    let called = false;
    const result = await withUserLock(999, async () => { called = true; });
    expect(result).toBe(true);
    expect(called).toBe(true);
  });

  test('rejects concurrent calls for the same user', async () => {
    let resolve!: () => void;
    const blocker = new Promise<void>((r) => { resolve = r; });
    const first = withUserLock(1, () => blocker);
    const second = await withUserLock(1, async () => {});
    expect(second).toBe(false);
    resolve();
    expect(await first).toBe(true);
  });

  test('allows concurrent calls for different users', async () => {
    let resolve!: () => void;
    const blocker = new Promise<void>((r) => { resolve = r; });
    const first = withUserLock(1, () => blocker);
    const second = await withUserLock(2, async () => {});
    expect(second).toBe(true);
    resolve();
    expect(await first).toBe(true);
  });

  test('releases lock even if fn throws', async () => {
    await withUserLock(3, async () => { throw new Error('fail'); }).catch(() => {});
    const ok = await withUserLock(3, async () => {});
    expect(ok).toBe(true);
  });
});

describe('config & parsing', () => {
  test('parseConfig', () => {
    const cfg = parseConfig({ BOT_TOKEN: 'x', ADMIN_IDS: '1, 2,bad', ADMIN_CHAT_ID: '-100123', BOT_USERNAME: '@shop_bot', WEBHOOK_URL: 'https://a.b/' });
    expect(cfg.adminIds).toEqual([1, 2]);
    expect(cfg.adminChatId).toBe(-100123);
    expect(cfg.botUsername).toBe('shop_bot');
    expect(cfg.webhookUrl).toBe('https://a.b');
    expect(parseConfig({ BOT_TOKEN: 'x', ADMIN_CHAT_ID: '' }).adminChatId).toBeNull();
    expect(() => parseConfig({})).toThrow();
  });
  test('broadcastWorker defaults to true, opt-out with "false"', () => {
    expect(parseConfig({ BOT_TOKEN: 'x' }).broadcastWorker).toBe(true);
    expect(parseConfig({ BOT_TOKEN: 'x', BROADCAST_WORKER: 'false' }).broadcastWorker).toBe(false);
    expect(parseConfig({ BOT_TOKEN: 'x', BROADCAST_WORKER: '0' }).broadcastWorker).toBe(true);
  });
  test('parseAddSaldo', () => {
    expect(parseAddSaldo('123 5')).toEqual({ userId: 123, cents: 500 });
    expect(parseAddSaldo('123 -2,5')).toEqual({ userId: 123, cents: -250 });
    expect(parseAddSaldo('abc 5')).toBeNull();
    expect(parseAddSaldo('123')).toBeNull();
    expect(parseAddSaldo('123 0')).toBeNull();
    expect(parseAddSaldo('123 999999')).toBeNull();
    expect(parseAddSaldo('123 -999999')).toBeNull();
    expect(parseAddSaldo('123 1000')).toEqual({ userId: 123, cents: 100_000 });
  });
  test('parseStartPayload', () => {
    expect(parseStartPayload('product_NETFLIX1')).toEqual({ productCode: 'NETFLIX1' });
    expect(parseStartPayload('ref_ABCD')).toBeNull();
    expect(parseStartPayload('')).toBeNull();
    expect(parseStartPayload('product_a-b-c')).toEqual({ productCode: 'a-b-c' });
    expect(parseStartPayload('product_a_b')).toEqual({ productCode: 'a_b' });
    expect(parseStartPayload('  product_X  ')).toEqual({ productCode: 'X' });
    expect(parseStartPayload('product_' + 'a'.repeat(64))).toEqual({ productCode: 'a'.repeat(64) });
    expect(parseStartPayload('product_' + 'a'.repeat(65))).toBeNull();
    expect(parseStartPayload('product_')).toBeNull();
    expect(parseStartPayload('product_foo bar')).toBeNull();
  });
});

describe('ttlCache', () => {
  test('returns cached value within TTL', async () => {
    let calls = 0;
    const cache = ttlCache<string, number>(10_000, async () => ++calls);
    expect(await cache.get('a')).toBe(1);
    expect(await cache.get('a')).toBe(1);
    expect(calls).toBe(1);
  });

  test('separates values by key', async () => {
    const cache = ttlCache<string, string>(10_000, async (k) => k.toUpperCase());
    expect(await cache.get('foo')).toBe('FOO');
    expect(await cache.get('bar')).toBe('BAR');
  });

  test('clear invalidates all entries', async () => {
    let calls = 0;
    const cache = ttlCache<string, number>(10_000, async () => ++calls);
    await cache.get('a');
    cache.clear();
    expect(await cache.get('a')).toBe(2);
  });

  test('coalesces concurrent loads for the same key', async () => {
    let calls = 0;
    const cache = ttlCache<string, number>(10_000, async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return calls;
    });
    const [a, b, c] = await Promise.all([cache.get('x'), cache.get('x'), cache.get('x')]);
    expect(calls).toBe(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  test('failed load does not poison the cache', async () => {
    let calls = 0;
    const cache = ttlCache<string, number>(10_000, async () => {
      calls++;
      if (calls === 1) throw new Error('boom');
      return calls;
    });
    await expect(cache.get('x')).rejects.toThrow('boom');
    expect(await cache.get('x')).toBe(2);
  });

  test('evicts oldest entry when maxSize exceeded', async () => {
    let calls = 0;
    const cache = ttlCache<string, number>(10_000, async () => ++calls, 3);
    await cache.get('a');
    await cache.get('b');
    await cache.get('c');
    expect(calls).toBe(3);
    await cache.get('d');
    expect(calls).toBe(4);
    // 'a' was evicted — fetching it triggers a fresh load
    await cache.get('a');
    expect(calls).toBe(5);
    // 'b' or 'c' may still be cached depending on eviction order; 'd' should be cached
    await cache.get('d');
    expect(calls).toBe(5);
  });

  test('expires entries after TTL', async () => {
    let counter = 0;
    const cache = ttlCache<string, number>(1, async () => ++counter);
    const v1 = await cache.get('x');
    await new Promise(r => setTimeout(r, 10));
    const v2 = await cache.get('x');
    expect(v2).toBeGreaterThan(v1);
  });
});

describe('displayName', () => {
  test('prefers firstName', () => {
    expect(displayName({ firstName: 'Alice', username: 'alice42', id: 1 })).toBe('Alice');
  });

  test('falls back to @username when no firstName', () => {
    expect(displayName({ firstName: null, username: 'bob', id: 2 })).toBe('@bob');
    expect(displayName({ username: 'bob', id: 2 })).toBe('@bob');
  });

  test('falls back to id when neither name nor username', () => {
    expect(displayName({ firstName: null, username: null, id: 42 })).toBe('42');
    expect(displayName({ id: 99 })).toBe('99');
  });

  test('treats empty firstName as falsy', () => {
    expect(displayName({ firstName: '', username: 'x', id: 1 })).toBe('@x');
  });
});

describe('formatDate', () => {
  test('returns date portion only', () => {
    expect(formatDate(new Date('2026-10-03T20:30:00Z'), 420)).toBe('2026-10-04');
  });

  test('works at UTC+0', () => {
    expect(formatDate(new Date('2026-06-15T12:00:00Z'), 0)).toBe('2026-06-15');
  });

  test('handles negative offset', () => {
    expect(formatDate(new Date('2026-01-01T02:00:00Z'), -300)).toBe('2025-12-31');
  });
});

describe('countryOf', () => {
  test('returns ID for IDR currency', () => {
    expect(countryOf({ language: 'en', currency: 'IDR' })).toBe('ID');
  });

  test('returns ID for id language', () => {
    expect(countryOf({ language: 'id', currency: 'USD' })).toBe('ID');
  });

  test('returns null for non-Indonesian users', () => {
    expect(countryOf({ language: 'en', currency: 'USD' })).toBeNull();
  });
});

describe('broadcastText', () => {
  test('wraps title in bold when present', () => {
    expect(broadcastText({ id: 1, audience: 'all', title: 'Sale!', body: 'Buy now' }))
      .toBe('<b>Sale!</b>\n\nBuy now');
  });

  test('returns body only when no title', () => {
    expect(broadcastText({ id: 1, audience: 'stock', title: null, body: '<b>Restock</b>' }))
      .toBe('<b>Restock</b>');
  });

  test('escapes HTML in title', () => {
    expect(broadcastText({ id: 1, audience: 'all', title: 'A<b>C', body: 'ok' }))
      .toBe('<b>A&lt;b&gt;C</b>\n\nok');
  });

  test('truncates text exceeding Telegram 4096-char limit', () => {
    const longBody = 'x'.repeat(5000);
    const result = broadcastText({ id: 1, audience: 'all', title: null, body: longBody });
    expect(result.length).toBe(4096);
    expect(result.endsWith('…')).toBe(true);
  });

  test('does not truncate text at exactly 4096 chars', () => {
    const body = 'a'.repeat(4096);
    const result = broadcastText({ id: 1, audience: 'all', title: null, body });
    expect(result).toBe(body);
  });

  test('does not split surrogate pairs when truncating', () => {
    const emoji = '🎬'; // U+1F3AC — surrogate pair in UTF-16
    const padding = 'x'.repeat(4094);
    const body = padding + emoji; // 4094 + 2 code units = 4096, but with title it exceeds
    const result = broadcastText({ id: 1, audience: 'all', title: 'T', body });
    expect(result).not.toContain('\uD83C'); // no lone high surrogate
    expect(result.endsWith('…')).toBe(true);
    for (let i = 0; i < result.length; i++) {
      const c = result.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff) {
        expect(result.charCodeAt(i + 1)).toBeGreaterThanOrEqual(0xdc00);
        expect(result.charCodeAt(i + 1)).toBeLessThanOrEqual(0xdfff);
      }
    }
  });
});

describe('isZeroDecimal', () => {
  test('IDR, JPY are zero-decimal', () => {
    expect(isZeroDecimal('IDR')).toBe(true);
    expect(isZeroDecimal('JPY')).toBe(true);
  });

  test('USD, EUR are not zero-decimal', () => {
    expect(isZeroDecimal('USD')).toBe(false);
    expect(isZeroDecimal('EUR')).toBe(false);
  });

  test('case insensitive', () => {
    expect(isZeroDecimal('idr')).toBe(true);
  });
  test('other zero-decimal currencies', () => {
    for (const c of ['CLP', 'ISK', 'UGX', 'PYG']) expect(isZeroDecimal(c)).toBe(true);
  });
});

describe('maxQtyFor', () => {
  test('null stock → null (unlimited)', () => {
    expect(maxQtyFor(null)).toBeNull();
  });

  test('positive stock → same value', () => {
    expect(maxQtyFor(10)).toBe(10);
  });

  test('zero stock → 1 (floor)', () => {
    expect(maxQtyFor(0)).toBe(1);
  });
});

describe('callback codec', () => {
  test('encode + decode round-trip', () => {
    const data = encode('p', 42, 3, 1);
    expect(data).toBe('p:42:3:1');
    const { action, args } = decode(data);
    expect(action).toBe('p');
    expect(args).toEqual(['42', '3', '1']);
  });

  test('encode rejects colons in args', () => {
    expect(() => encode('a', 'b:c')).toThrow(/must not contain/);
  });

  test('encode rejects data exceeding 64 bytes', () => {
    expect(() => encode('x', 'a'.repeat(64))).toThrow(/too long/);
  });

  test('decode handles empty string', () => {
    const { action, args } = decode('');
    expect(action).toBe('');
    expect(args).toEqual([]);
  });

  test('intArg returns fallback for missing/invalid args', () => {
    expect(intArg(['10', ''], 0, 0)).toBe(10);
    expect(intArg([], 0, 5)).toBe(5);
    expect(intArg(['abc'], 0, 1)).toBe(1);
    expect(intArg(['3.5'], 0, 1)).toBe(1);
    expect(intArg(['', '7'], 0, 99)).toBe(99);
    expect(intArg(['', '7'], 1, 99)).toBe(7);
  });

  test('sort codec round-trips', () => {
    for (const s of ['all', 'available', 'soldout', 'promo'] as const) {
      expect(sortFromCode(sortCode(s))).toBe(s);
    }
    expect(sortFromCode(undefined)).toBe('all');
    expect(sortFromCode('z')).toBe('all');
  });

  test('nextSort cycles', () => {
    expect(nextSort('all')).toBe('available');
    expect(nextSort('promo')).toBe('all');
  });

  test('notifyFromCode', () => {
    expect(notifyFromCode('s')).toBe('stock');
    expect(notifyFromCode('i')).toBe('info');
    expect(notifyFromCode('r')).toBe('referral');
    expect(notifyFromCode(undefined)).toBeNull();
    expect(notifyFromCode('z')).toBeNull();
  });

  test('cb builders produce valid data', () => {
    expect(decode(cb.main()).action).toBe('m');
    expect(decode(cb.product(5, 2, true)).args).toEqual(['5', '2', '1']);
    expect(decode(cb.shop(1, 'available')).args[1]).toBe('v');
    const cancel = cb.cancelInput(cb.main());
    const { action, args } = decode(cancel);
    expect(action).toBe('ci');
    expect(args.join(':')).toBe('m');
  });

  test('MAX_CALLBACK_BYTES is 64', () => {
    expect(MAX_CALLBACK_BYTES).toBe(64);
  });
});

describe('qrPng', () => {
  test('generates PNG bytes for valid payload', async () => {
    const buf = await qrPng('https://example.com');
    expect(buf).toBeInstanceOf(Uint8Array);
    expect(buf.length).toBeGreaterThan(0);
    expect(buf[0]).toBe(0x89); // PNG magic byte
  });

  test('rejects payload exceeding 4096 chars', async () => {
    await expect(qrPng('x'.repeat(4097))).rejects.toThrow(/too large/);
  });

  test('accepts a 2000-char payload within limit', async () => {
    const buf = await qrPng('https://example.com/' + 'a'.repeat(1980));
    expect(buf).toBeInstanceOf(Uint8Array);
  });
});
