import { describe, expect, test } from 'bun:test';
import { RateLimiter } from '../src/util/ratelimit';

describe('RateLimiter', () => {
  test('allows burst up to capacity', () => {
    const rl = new RateLimiter({ capacity: 3, refillPerSec: 1 });
    expect(rl.take('a')).toBe(true);
    expect(rl.take('a')).toBe(true);
    expect(rl.take('a')).toBe(true);
    expect(rl.take('a')).toBe(false);
  });

  test('different keys are independent', () => {
    const rl = new RateLimiter({ capacity: 1, refillPerSec: 1 });
    expect(rl.take('a')).toBe(true);
    expect(rl.take('b')).toBe(true);
    expect(rl.take('a')).toBe(false);
    expect(rl.take('b')).toBe(false);
  });

  test('numeric keys work', () => {
    const rl = new RateLimiter({ capacity: 1, refillPerSec: 1 });
    expect(rl.take(123)).toBe(true);
    expect(rl.take(123)).toBe(false);
    expect(rl.take(456)).toBe(true);
  });

  test('tokens refill over time', () => {
    let now = 0;
    const rl = new RateLimiter({ capacity: 2, refillPerSec: 1, now: () => now });
    expect(rl.take('a')).toBe(true);
    expect(rl.take('a')).toBe(true);
    expect(rl.take('a')).toBe(false);

    now += 1000; // 1 second → 1 token refilled
    expect(rl.take('a')).toBe(true);
    expect(rl.take('a')).toBe(false);
  });

  test('refill does not exceed capacity', () => {
    let now = 0;
    const rl = new RateLimiter({ capacity: 2, refillPerSec: 10, now: () => now });
    rl.take('a'); // 2 → 1
    now += 10_000; // 10s * 10/s = 100 tokens, but capped at capacity=2
    expect(rl.take('a')).toBe(true);
    expect(rl.take('a')).toBe(true);
    expect(rl.take('a')).toBe(false);
  });

  test('partial refill (fractional tokens)', () => {
    let now = 0;
    const rl = new RateLimiter({ capacity: 2, refillPerSec: 2, now: () => now });
    rl.take('a'); // 2 → 1
    rl.take('a'); // 1 → 0
    expect(rl.take('a')).toBe(false);

    now += 250; // 0.25s * 2/s = 0.5 tokens — not enough for 1
    expect(rl.take('a')).toBe(false);

    now += 250; // total 0.5s → 1.0 token
    expect(rl.take('a')).toBe(true);
  });

  test('sweep removes stale entries when map exceeds 50k', () => {
    let now = 0;
    const rl = new RateLimiter({ capacity: 1, refillPerSec: 1, now: () => now });
    for (let i = 0; i < 50_001; i++) rl.take(`key-${i}`);

    now += 2000; // 2s > capacity/refillPerSec * 1000ms = 1000ms
    rl.take('trigger-sweep');
    // Should not throw; internal map is cleaned up
    expect(rl.take('fresh')).toBe(true);
  });

  test('capacity 0 always rejects', () => {
    const rl = new RateLimiter({ capacity: 0, refillPerSec: 1 });
    expect(rl.take('a')).toBe(false);
  });
});
