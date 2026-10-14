// Pure diff between the bots that are running and the stores in the database.
import type { StoreInfo } from '@tokobun/core';

/** A failed store is retried after this long even when its config did not change. */
export const RETRY_FAILED_MS = 5 * 60_000;

export interface FailedStart {
  fingerprint: string;
  failedAt: number;
}

export interface ReconcilePlan {
  start: StoreInfo[];
  restart: StoreInfo[];
  stop: number[];
  /** Failed starts of stores that are now inactive or gone: re-activating one retries it at once. */
  forget: number[];
}

/** Fields that the running bot depends on; any change means the bot must be restarted. */
export function storeFingerprint(s: StoreInfo): string {
  return JSON.stringify([s.botToken, s.botUsername, s.adminIds, s.adminChatId, s.channelUrl]);
}

export function planReconcile(
  running: ReadonlyMap<number, string>,
  failed: ReadonlyMap<number, FailedStart>,
  stores: StoreInfo[],
  now: number,
): ReconcilePlan {
  const plan: ReconcilePlan = { start: [], restart: [], stop: [], forget: [] };
  const active = stores.filter((s) => s.isActive);
  const activeIds = new Set(active.map((s) => s.id));
  for (const s of active) {
    const fp = storeFingerprint(s);
    const current = running.get(s.id);
    if (current !== undefined) {
      if (current !== fp) plan.restart.push(s);
      continue;
    }
    const f = failed.get(s.id);
    if (f && f.fingerprint === fp && now - f.failedAt < RETRY_FAILED_MS) continue;
    plan.start.push(s);
  }
  for (const id of running.keys()) if (!activeIds.has(id)) plan.stop.push(id);
  for (const id of failed.keys()) if (!activeIds.has(id)) plan.forget.push(id);
  return plan;
}
