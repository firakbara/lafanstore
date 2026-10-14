// Keeps one running bot per active store in sync with the database.
import type { StoreInfo } from '@tokobun/core';
import { planReconcile, RETRY_FAILED_MS, storeFingerprint, type FailedStart } from './reconcile';

export interface BotHandle {
  storeId: number;
  slug: string;
  /** Stops the bot and its workers; resolves once they have actually stopped. */
  stop(): Promise<void>;
  /**
   * Settles with the cause when the bot dies on its own (e.g. long polling rejected with 401/409).
   * Never settles for a bot stopped through stop(). The supervisor then cleans the bot up and
   * retries it like a failed start.
   */
  dead?: Promise<Error>;
  /** Webhook mode only: path served by the webhook server and its handler. */
  webhookPath?: string;
  handler?: (req: Request) => Response | Promise<Response>;
}

export interface SupervisorDeps {
  loadStores(): Promise<StoreInfo[]>;
  /** Starts the bot for a store; throws when it cannot (bad token, Telegram down). */
  startStore(store: StoreInfo): Promise<BotHandle>;
  log: { info(...a: unknown[]): void; warn(...a: unknown[]): void; error(...a: unknown[]): void };
  now(): number;
}

export function createSupervisor(deps: SupervisorDeps) {
  const handles = new Map<number, BotHandle>();
  const fingerprints = new Map<number, string>();
  const failed = new Map<number, FailedStart>();
  /** Cleanups of bots that died on their own and are still stopping. */
  const cleanups = new Set<Promise<void>>();
  let busy: Promise<void> | null = null;
  let warnedEmpty = false;

  async function stopHandle(id: number, h: BotHandle): Promise<void> {
    try {
      await h.stop();
    } catch (err) {
      deps.log.error(`[bot] store id=${id} stop failed:`, (err as Error).message);
    }
  }

  async function stopOne(id: number): Promise<void> {
    const h = handles.get(id);
    handles.delete(id);
    fingerprints.delete(id);
    if (h) await stopHandle(id, h);
  }

  /** A running bot died: forget it, clean it up and let the failed-start backoff retry it. */
  function onDead(s: StoreInfo, h: BotHandle, fp: string, err: unknown): void {
    if (handles.get(s.id) !== h) return; // already stopped or replaced by the supervisor
    handles.delete(s.id);
    fingerprints.delete(s.id);
    failed.set(s.id, { fingerprint: fp, failedAt: deps.now() });
    deps.log.error(
      `[bot] ✗ store "${s.name}" (id=${s.id}) stopped unexpectedly, retrying in ${RETRY_FAILED_MS / 60_000} min or on config change:`,
      err instanceof Error ? err.message : String(err),
    );
    const cleanup: Promise<void> = stopHandle(s.id, h).finally(() => cleanups.delete(cleanup));
    cleanups.add(cleanup);
  }

  async function startOne(s: StoreInfo): Promise<void> {
    const fp = storeFingerprint(s);
    try {
      const h = await deps.startStore(s);
      handles.set(s.id, h);
      fingerprints.set(s.id, fp);
      failed.delete(s.id);
      deps.log.info(`[bot] store "${s.name}" (${s.slug}) running`);
      const died = (err: unknown) => onDead(s, h, fp, err);
      void h.dead?.then(died, died);
    } catch (err) {
      failed.set(s.id, { fingerprint: fp, failedAt: deps.now() });
      deps.log.error(`[bot] ✗ store "${s.name}" (id=${s.id}) failed to start:`, (err as Error).message);
    }
  }

  async function run(): Promise<void> {
    let stores: StoreInfo[];
    try {
      stores = await deps.loadStores();
    } catch (err) {
      deps.log.error('[bot] loading stores failed:', (err as Error).message);
      return;
    }
    const plan = planReconcile(fingerprints, failed, stores, deps.now());
    for (const id of plan.forget) failed.delete(id);
    // Every stop finishes before any start: a bot token that moved to another store is released
    // first, and a restarted store's old workers have exited before the new ones begin.
    for (const id of plan.stop) await stopOne(id);
    for (const s of plan.restart) await stopOne(s.id);
    await Promise.all(cleanups);
    for (const s of plan.restart) await startOne(s);
    for (const s of plan.start) await startOne(s);
    if (!stores.some((s) => s.isActive)) {
      if (!warnedEmpty) deps.log.warn('[bot] no active stores yet — waiting for one to be added in the admin panel');
      warnedEmpty = true;
    } else {
      warnedEmpty = false;
    }
  }

  return {
    /** One reconcile pass. Concurrent calls share the pass already in flight. */
    tick(): Promise<void> {
      busy ??= run().finally(() => {
        busy = null;
      });
      return busy;
    },
    async stopAll(): Promise<void> {
      if (busy) await busy;
      await Promise.all([...handles.keys()].map((id) => stopOne(id)));
      await Promise.all(cleanups);
    },
    running(): ReadonlyMap<number, BotHandle> {
      return handles;
    },
    handlerFor(path: string): ((req: Request) => Response | Promise<Response>) | undefined {
      for (const h of handles.values()) if (h.webhookPath === path) return h.handler;
      return undefined;
    },
  };
}
