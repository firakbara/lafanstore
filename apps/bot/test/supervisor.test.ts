import { describe, expect, test } from 'bun:test';
import type { StoreInfo } from '@tokobun/core';
import { RETRY_FAILED_MS } from '../src/reconcile';
import { createSupervisor, type BotHandle } from '../src/supervisor';

const store = (id: number, over: Partial<StoreInfo> = {}): StoreInfo => ({
  id, slug: `s${id}`, name: `S${id}`, botToken: `${id}000:T${id}`, botUsername: null,
  adminIds: [], adminChatId: null, channelUrl: null, isActive: true, ...over,
});

/** Lets pending promise callbacks (death notifications, cleanups) run. */
const flush = () => new Promise((r) => setTimeout(r, 0));

function harness(initial: StoreInfo[], failIds: number[] = []) {
  let stores = initial;
  const events: string[] = [];
  const failing = new Set(failIds);
  /** Per store, one "kill" function per handle started, oldest first. */
  const killers = new Map<number, ((err: Error) => void)[]>();
  let now = 0;
  const sup = createSupervisor({
    loadStores: async () => stores,
    startStore: async (s): Promise<BotHandle> => {
      if (failing.has(s.id)) throw new Error(`bad token ${s.id}`);
      events.push(`start:${s.id}`);
      const dead = new Promise<Error>((resolve) => killers.set(s.id, [...(killers.get(s.id) ?? []), resolve]));
      return { storeId: s.id, slug: s.slug, dead, stop: async () => void events.push(`stop:${s.id}`) };
    },
    log: { info: () => {}, warn: () => {}, error: () => {} },
    now: () => now,
  });
  return {
    sup,
    events,
    setStores: (s: StoreInfo[]) => (stores = s),
    setFailing: (id: number, fail: boolean) => (fail ? failing.add(id) : failing.delete(id)),
    advance: (ms: number) => (now += ms),
    /** Reports the death of a store's handle: the latest one by default, or the nth started. */
    kill: (id: number, nth?: number) => {
      const list = killers.get(id)!;
      list[nth ?? list.length - 1]!(new Error('409: Conflict'));
    },
  };
}

describe('supervisor', () => {
  test('starts, restarts and stops bots across ticks', async () => {
    const h = harness([store(1), store(2)]);
    await h.sup.tick();
    expect(h.events).toEqual(['start:1', 'start:2']);
    h.setStores([store(1), store(2, { botToken: '2000:NEW' }), store(3)]);
    await h.sup.tick();
    expect(h.events.slice(2)).toEqual(['stop:2', 'start:2', 'start:3']);
    h.setStores([store(1, { isActive: false }), store(2, { botToken: '2000:NEW' }), store(3)]);
    await h.sup.tick();
    expect(h.events.slice(5)).toEqual(['stop:1']);
    expect([...h.sup.running().keys()].sort()).toEqual([2, 3]);
  });

  test('runs every stop before any start, so a token moved between stores is released first', async () => {
    // Store 2 holds token A; store 1 takes it over while store 2 gets a new one.
    const h = harness([store(1, { botToken: 'B' }), store(2, { botToken: 'A' }), store(4)]);
    await h.sup.tick();
    h.setStores([store(1, { botToken: 'A' }), store(2, { botToken: 'C' }), store(3)]);
    await h.sup.tick();
    expect(h.events.slice(3)).toEqual(['stop:4', 'stop:1', 'stop:2', 'start:1', 'start:2', 'start:3']);
  });

  test('a failing store does not block others and is retried only after backoff', async () => {
    const h = harness([store(1), store(2)], [1]);
    await h.sup.tick();
    expect(h.events).toEqual(['start:2']);
    await h.sup.tick();
    expect(h.events).toEqual(['start:2']);
  });

  test('a failed store that is deactivated and re-activated starts on the next tick', async () => {
    const h = harness([store(1)], [1]);
    await h.sup.tick();
    expect(h.events).toEqual([]);
    h.setFailing(1, false);
    h.setStores([store(1, { isActive: false })]);
    await h.sup.tick();
    h.setStores([store(1)]);
    await h.sup.tick();
    expect(h.events).toEqual(['start:1']);
  });

  test('a failed store that is deleted and re-added starts on the next tick', async () => {
    const h = harness([store(1)], [1]);
    await h.sup.tick();
    h.setFailing(1, false);
    h.setStores([]);
    await h.sup.tick();
    h.setStores([store(1)]);
    await h.sup.tick();
    expect(h.events).toEqual(['start:1']);
  });

  test('a bot that dies is cleaned up and retried after the backoff', async () => {
    const h = harness([store(1), store(2)]);
    await h.sup.tick();
    h.kill(1);
    await flush();
    expect(h.events.slice(2)).toEqual(['stop:1']);
    expect([...h.sup.running().keys()]).toEqual([2]);
    await h.sup.tick();
    h.advance(RETRY_FAILED_MS - 1);
    await h.sup.tick();
    expect(h.events.slice(3)).toEqual([]);
    h.advance(1);
    await h.sup.tick();
    expect(h.events.slice(3)).toEqual(['start:1']);
    expect([...h.sup.running().keys()].sort()).toEqual([1, 2]);
  });

  test('a bot that dies is restarted right away when its config changes', async () => {
    const h = harness([store(1)]);
    await h.sup.tick();
    h.kill(1);
    await flush();
    h.setStores([store(1, { botToken: '1000:FIXED' })]);
    await h.sup.tick();
    expect(h.events).toEqual(['start:1', 'stop:1', 'start:1']);
  });

  test('a death reported by a handle that was already replaced or stopped is ignored', async () => {
    const h = harness([store(1), store(2)]);
    await h.sup.tick();
    h.setStores([store(1, { botToken: '1000:NEW' }), store(2)]);
    await h.sup.tick();
    expect(h.events).toEqual(['start:1', 'start:2', 'stop:1', 'start:1']);
    h.kill(1, 0); // the replaced handle
    await flush();
    expect(h.events).toHaveLength(4);
    expect([...h.sup.running().keys()].sort()).toEqual([1, 2]);
    await h.sup.stopAll();
    h.kill(2); // already stopped: must not be recorded as a failure
    await flush();
    await h.sup.tick();
    expect(h.events.slice(4).sort()).toEqual(['start:1', 'start:2', 'stop:1', 'stop:2']);
  });

  test('overlapping ticks do not double-start', async () => {
    const h = harness([store(1)]);
    await Promise.all([h.sup.tick(), h.sup.tick()]);
    expect(h.events).toEqual(['start:1']);
  });

  test('stopAll stops every running bot', async () => {
    const h = harness([store(1), store(2)]);
    await h.sup.tick();
    await h.sup.stopAll();
    expect(h.events.filter((e) => e.startsWith('stop')).sort()).toEqual(['stop:1', 'stop:2']);
    expect(h.sup.running().size).toBe(0);
  });

  test('handlerFor returns the webhook handler of a running bot', async () => {
    const sup = createSupervisor({
      loadStores: async () => [store(7)],
      startStore: async (s) => ({ storeId: s.id, slug: s.slug, stop: async () => {}, webhookPath: '/telegram/s7', handler: () => new Response('ok') }),
      log: { info: () => {}, warn: () => {}, error: () => {} },
      now: () => 0,
    });
    await sup.tick();
    expect(sup.handlerFor('/telegram/s7')).toBeDefined();
    expect(sup.handlerFor('/telegram/other')).toBeUndefined();
  });
});
