/** Fixed-window in-memory rate limiter keyed by an arbitrary string (the API key). */
export function createRateLimiter(opts: { limit: number; windowMs: number; now?: () => number }) {
  const now = opts.now ?? Date.now;
  const buckets = new Map<string, { count: number; resetAt: number }>();

  function sweep(t: number) {
    if (buckets.size < 10_000) return;
    for (const [k, b] of buckets) if (b.resetAt <= t) buckets.delete(k);
  }

  return {
    limit: opts.limit,
    /** Count a hit. Returns whether it is allowed plus header info. */
    hit(key: string): { allowed: boolean; remaining: number; resetAt: number; retryAfterSec: number } {
      const t = now();
      sweep(t);
      let b = buckets.get(key);
      if (!b || b.resetAt <= t) {
        b = { count: 0, resetAt: t + opts.windowMs };
        buckets.set(key, b);
      }
      b.count++;
      const allowed = b.count <= opts.limit;
      return {
        allowed,
        remaining: Math.max(0, opts.limit - b.count),
        resetAt: b.resetAt,
        retryAfterSec: Math.max(1, Math.ceil((b.resetAt - t) / 1000)),
      };
    },
  };
}
