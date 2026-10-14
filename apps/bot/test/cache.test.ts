import { describe, expect, test } from 'bun:test';
import { ttlCache, countryOf } from '../src/util/cache';

describe('ttlCache', () => {
  test('loads value on first get', async () => {
    let calls = 0;
    const cache = ttlCache<string, number>(1000, async (k) => {
      calls++;
      return k.length;
    });
    const v = await cache.get('hello');
    expect(v).toBe(5);
    expect(calls).toBe(1);
  });

  test('returns cached value within TTL', async () => {
    let calls = 0;
    const cache = ttlCache<string, number>(1000, async () => {
      calls++;
      return 42;
    });
    await cache.get('a');
    await cache.get('a');
    await cache.get('a');
    expect(calls).toBe(1);
  });

  test('re-fetches after TTL expires', async () => {
    let calls = 0;
    const cache = ttlCache<string, number>(50, async () => {
      calls++;
      return calls;
    });
    const v1 = await cache.get('x');
    expect(v1).toBe(1);
    await Bun.sleep(80);
    const v2 = await cache.get('x');
    expect(v2).toBe(2);
    expect(calls).toBe(2);
  });

  test('concurrent gets share one inflight promise', async () => {
    let calls = 0;
    const cache = ttlCache<string, number>(1000, async (k) => {
      calls++;
      await Bun.sleep(30);
      return k.length;
    });
    const [a, b, c] = await Promise.all([cache.get('hi'), cache.get('hi'), cache.get('hi')]);
    expect(a).toBe(2);
    expect(b).toBe(2);
    expect(c).toBe(2);
    expect(calls).toBe(1);
  });

  test('different keys load independently', async () => {
    let calls = 0;
    const cache = ttlCache<string, string>(1000, async (k) => {
      calls++;
      return k.toUpperCase();
    });
    const [a, b] = await Promise.all([cache.get('foo'), cache.get('bar')]);
    expect(a).toBe('FOO');
    expect(b).toBe('BAR');
    expect(calls).toBe(2);
  });

  test('error propagates and cleans up inflight', async () => {
    let calls = 0;
    const cache = ttlCache<string, number>(1000, async () => {
      calls++;
      throw new Error('boom');
    });
    await expect(cache.get('x')).rejects.toThrow('boom');
    // After failure, next call retries
    await expect(cache.get('x')).rejects.toThrow('boom');
    expect(calls).toBe(2);
  });

  test('clear() empties the cache', async () => {
    let calls = 0;
    const cache = ttlCache<string, number>(10_000, async () => {
      calls++;
      return calls;
    });
    await cache.get('a');
    expect(calls).toBe(1);
    cache.clear();
    const v = await cache.get('a');
    expect(v).toBe(2);
    expect(calls).toBe(2);
  });

  test('evicts when exceeding maxSize', async () => {
    let calls = 0;
    const cache = ttlCache<number, number>(10_000, async (k) => {
      calls++;
      return k * 10;
    }, 3);
    // Fill to maxSize
    await cache.get(1);
    await cache.get(2);
    await cache.get(3);
    expect(calls).toBe(3);
    // Adding a 4th triggers eviction
    await cache.get(4);
    expect(calls).toBe(4);
    // Oldest (key 1) should have been evicted — re-fetches
    const v = await cache.get(1);
    expect(v).toBe(10);
    expect(calls).toBe(5);
  });

  test('evicts expired entries first before oldest', async () => {
    let calls = 0;
    const cache = ttlCache<string, number>(50, async () => {
      calls++;
      return calls;
    }, 2);
    await cache.get('a');
    await cache.get('b');
    expect(calls).toBe(2);
    // Wait for TTL to expire
    await Bun.sleep(80);
    // Now add a new key — expired entries get pruned first
    await cache.get('c');
    expect(calls).toBe(3);
    // 'a' and 'b' are expired and pruned, so they re-fetch
    await cache.get('a');
    expect(calls).toBe(4);
  });
});

describe('countryOf', () => {
  test('returns ID for IDR currency', () => {
    expect(countryOf({ language: 'en', currency: 'IDR' })).toBe('ID');
  });

  test('returns ID for id language', () => {
    expect(countryOf({ language: 'id', currency: 'USD' })).toBe('ID');
  });

  test('returns ID when both IDR and id', () => {
    expect(countryOf({ language: 'id', currency: 'IDR' })).toBe('ID');
  });

  test('returns null for USD + en', () => {
    expect(countryOf({ language: 'en', currency: 'USD' })).toBeNull();
  });

  test('returns null for MYR + ms', () => {
    expect(countryOf({ language: 'ms', currency: 'MYR' })).toBeNull();
  });

  test('returns null for EUR + de', () => {
    expect(countryOf({ language: 'de', currency: 'EUR' })).toBeNull();
  });
});
