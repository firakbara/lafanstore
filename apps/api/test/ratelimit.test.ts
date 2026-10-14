import { describe, expect, test } from 'bun:test';
import { createRateLimiter } from '../src/ratelimit';

describe('createRateLimiter', () => {
  test('allows requests within the limit', () => {
    const rl = createRateLimiter({ limit: 3, windowMs: 60_000 });
    expect(rl.hit('a').allowed).toBe(true);
    expect(rl.hit('a').allowed).toBe(true);
    expect(rl.hit('a').allowed).toBe(true);
    expect(rl.hit('a').allowed).toBe(false);
  });

  test('remaining decreases with each hit', () => {
    const rl = createRateLimiter({ limit: 3, windowMs: 60_000 });
    expect(rl.hit('a').remaining).toBe(2);
    expect(rl.hit('a').remaining).toBe(1);
    expect(rl.hit('a').remaining).toBe(0);
    expect(rl.hit('a').remaining).toBe(0);
  });

  test('separate keys have separate buckets', () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(rl.hit('a').allowed).toBe(true);
    expect(rl.hit('a').allowed).toBe(false);
    expect(rl.hit('b').allowed).toBe(true);
  });

  test('window resets after windowMs', () => {
    let t = 0;
    const rl = createRateLimiter({ limit: 1, windowMs: 1000, now: () => t });
    expect(rl.hit('a').allowed).toBe(true);
    expect(rl.hit('a').allowed).toBe(false);
    t = 1000;
    expect(rl.hit('a').allowed).toBe(true);
  });

  test('retryAfterSec is at least 1', () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 500 });
    rl.hit('a');
    const r = rl.hit('a');
    expect(r.retryAfterSec).toBeGreaterThanOrEqual(1);
  });

  test('resetAt is set correctly', () => {
    let t = 5000;
    const rl = createRateLimiter({ limit: 2, windowMs: 10_000, now: () => t });
    const r = rl.hit('a');
    expect(r.resetAt).toBe(15_000);
  });

  test('exposes configured limit', () => {
    const rl = createRateLimiter({ limit: 42, windowMs: 1000 });
    expect(rl.limit).toBe(42);
  });

  test('sweep cleans expired buckets when size exceeds 10k', () => {
    let t = 0;
    const rl = createRateLimiter({ limit: 1, windowMs: 100, now: () => t });
    for (let i = 0; i < 10_001; i++) {
      rl.hit(`key-${i}`);
    }
    t = 200; // all previous windows expired
    const r = rl.hit('fresh');
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(0);
  });

  test('remaining never goes negative', () => {
    const rl = createRateLimiter({ limit: 2, windowMs: 60_000 });
    for (let i = 0; i < 5; i++) {
      expect(rl.hit('a').remaining).toBeGreaterThanOrEqual(0);
    }
  });

  test('first hit sets resetAt to now + windowMs', () => {
    let t = 5000;
    const rl = createRateLimiter({ limit: 10, windowMs: 3000, now: () => t });
    const r = rl.hit('a');
    expect(r.resetAt).toBe(8000);
  });

  test('resetAt stays the same within a window', () => {
    let t = 1000;
    const rl = createRateLimiter({ limit: 10, windowMs: 5000, now: () => t });
    const r1 = rl.hit('a');
    t = 2000;
    const r2 = rl.hit('a');
    expect(r1.resetAt).toBe(r2.resetAt);
    expect(r1.resetAt).toBe(6000);
  });
});
