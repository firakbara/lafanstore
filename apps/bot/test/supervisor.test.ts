import { describe, expect, test } from 'bun:test';
import type { StoreInfo } from '@tokobun/core';
import { createSupervisor, type BotHandle } from '../src/supervisor';

const store = (id: number, over: Partial<StoreInfo> = {}): StoreInfo => ({
  id, slug: `s${id}`, name: `S${id}`, botToken: `${id}000:T${id}`, botUsername: null,
  adminIds: [], adminChatId: null, channelUrl: null, isActive: true, ...over,
});

function harness(initial: StoreInfo[], failIds: number[] = []) {
  let stores = initial;
  const events: string[] = [];
  let now = 0;
  const sup = createSupervisor({
    loadStores: async () => stores,
    startStore: async (s): Promise<BotHandle> => {
      if (failIds.includes(s.id)) throw new Error(`bad token ${s.id}`);
      events.push(`start:${s.id}`);
      return { storeId: s.id, slug: s.slug, stop: async () => void events.push(`stop:${s.id}`) };
    },
    log: { info: () => {}, warn: () => {}, error: () => {} },
    now: () => now,
  });
  return {
    sup,
    events,
    setStores: (s: StoreInfo[]) => (stores = s),
    advance: (ms: number) => (now += ms),
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

  test('a failing store does not block others and is retried only after backoff', async () => {
    const h = harness([store(1), store(2)], [1]);
    await h.sup.tick();
    expect(h.events).toEqual(['start:2']);
    await h.sup.tick();
    expect(h.events).toEqual(['start:2']);
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
    const h = harness([]);
    const sup = createSupervisor({
      loadStores: async () => [store(7)],
      startStore: async (s) => ({ storeId: s.id, slug: s.slug, stop: async () => {}, webhookPath: '/telegram/s7', handler: () => new Response('ok') }),
      log: { info: () => {}, warn: () => {}, error: () => {} },
      now: () => 0,
    });
    await sup.tick();
    expect(sup.handlerFor('/telegram/s7')).toBeDefined();
    expect(sup.handlerFor('/telegram/other')).toBeUndefined();
    void h;
  });
});
