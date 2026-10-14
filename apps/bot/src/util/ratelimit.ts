// Per-key token bucket (in memory). Pure apart from the injected clock.
export interface RateLimiterOpts {
  /** Max burst size. */
  capacity: number;
  /** Tokens added per second. */
  refillPerSec: number;
  now?: () => number;
}

export class RateLimiter {
  private buckets = new Map<string | number, { tokens: number; at: number }>();
  private readonly now: () => number;

  constructor(private readonly opts: RateLimiterOpts) {
    this.now = opts.now ?? Date.now;
  }

  /** Consume one token; false when the key is over its limit. */
  take(key: string | number): boolean {
    const now = this.now();
    const b = this.buckets.get(key) ?? { tokens: this.opts.capacity, at: now };
    b.tokens = Math.min(this.opts.capacity, b.tokens + ((now - b.at) / 1000) * this.opts.refillPerSec);
    b.at = now;
    const ok = b.tokens >= 1;
    if (ok) b.tokens -= 1;
    this.buckets.set(key, b);
    if (this.buckets.size > 50_000) this.sweep(now);
    return ok;
  }

  private sweep(now: number) {
    const full = this.opts.refillPerSec > 0 ? (this.opts.capacity / this.opts.refillPerSec) * 1000 : 60_000;
    for (const [k, b] of this.buckets) if (now - b.at > full) this.buckets.delete(k);
  }
}
