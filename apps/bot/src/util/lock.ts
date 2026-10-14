// Per-user in-flight lock for money-moving actions (double taps on "Beli", invoice creation).
const busy = new Set<number>();

/** Runs `fn` unless the user already has a locked action running; returns false when skipped. */
export async function withUserLock(userId: number, fn: () => Promise<void>): Promise<boolean> {
  if (busy.has(userId)) return false;
  busy.add(userId);
  try {
    await fn();
    return true;
  } finally {
    busy.delete(userId);
  }
}
