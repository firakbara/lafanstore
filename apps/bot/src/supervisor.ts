// Keeps one running bot per active store in sync with the database.
import type { StoreInfo } from '@tokobun/core';
import { planReconcile, storeFingerprint, type FailedStart } from './reconcile';

export interface BotHandle {
  storeId: number;
  slug: string;
  stop(): Promise<void>;
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
  let busy: Promise<void> | null = null;
  let warnedEmpty = false;

  async function stopOne(id: number): Promise<void> {
    const h = handles.get(id);
    handles.delete(id);
    fingerprints.delete(id);
    if (!h) return;
    try {
      await h.stop();
    } catch (err) {
      deps.log.error(`[bot] store id=${id} stop failed:`, (err as Error).message);
    }
  }

  async function startOne(s: StoreInfo): Promise<void> {
    const fp = storeFingerprint(s);
    try {
      const h = await deps.startStore(s);
      handles.set(s.id, h);
      fingerprints.set(s.id, fp);
      failed.delete(s.id);
      deps.log.info(`[bot] store "${s.name}" (${s.slug}) running`);
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
    for (const id of plan.stop) await stopOne(id);
    for (const s of plan.restart) {
      await stopOne(s.id);
      await startOne(s);
    }
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
