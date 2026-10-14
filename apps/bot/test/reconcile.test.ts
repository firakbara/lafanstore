import { describe, expect, test } from 'bun:test';
import type { StoreInfo } from '@tokobun/core';
import { planReconcile, RETRY_FAILED_MS, storeFingerprint } from '../src/reconcile';

const store = (id: number, over: Partial<StoreInfo> = {}): StoreInfo => ({
  id,
  slug: `s${id}`,
  name: `Store ${id}`,
  botToken: `${id}000:TOKEN${id}`,
  botUsername: `bot${id}`,
  adminIds: [],
  adminChatId: null,
  channelUrl: null,
  isActive: true,
  ...over,
});

describe('planReconcile', () => {
  test('starts new active stores', () => {
    const p = planReconcile(new Map(), new Map(), [store(1), store(2)], 0);
    expect(p.start.map((s) => s.id)).toEqual([1, 2]);
    expect(p.restart).toEqual([]);
    expect(p.stop).toEqual([]);
    expect(p.forget).toEqual([]);
  });

  test('ignores inactive stores and stops running ones that became inactive', () => {
    const s1 = store(1);
    const p = planReconcile(new Map([[1, storeFingerprint(s1)]]), new Map(), [store(1, { isActive: false }), store(2, { isActive: false })], 0);
    expect(p.start).toEqual([]);
    expect(p.stop).toEqual([1]);
  });

  test('stops running stores that disappeared', () => {
    const p = planReconcile(new Map([[9, 'x']]), new Map(), [], 0);
    expect(p.stop).toEqual([9]);
  });

  test('keeps unchanged stores and restarts changed ones', () => {
    const s1 = store(1);
    const s2 = store(2);
    const running = new Map([
      [1, storeFingerprint(s1)],
      [2, storeFingerprint(s2)],
    ]);
    const p = planReconcile(running, new Map(), [s1, store(2, { botToken: '2000:NEW' })], 0);
    expect(p.start).toEqual([]);
    expect(p.restart.map((s) => s.id)).toEqual([2]);
    expect(p.stop).toEqual([]);
  });

  test('restarts when admin ids, admin chat or channel change', () => {
    const s1 = store(1);
    const running = new Map([[1, storeFingerprint(s1)]]);
    expect(planReconcile(running, new Map(), [store(1, { adminIds: [5] })], 0).restart).toHaveLength(1);
    expect(planReconcile(running, new Map(), [store(1, { adminChatId: -100 })], 0).restart).toHaveLength(1);
    expect(planReconcile(running, new Map(), [store(1, { channelUrl: 'https://t.me/x' })], 0).restart).toHaveLength(1);
    expect(planReconcile(running, new Map(), [store(1, { name: 'Renamed' })], 0).restart).toHaveLength(0);
  });

  test('backs off a failed store until its config changes or the retry window passes', () => {
    const s1 = store(1);
    const failed = new Map([[1, { fingerprint: storeFingerprint(s1), failedAt: 1_000 }]]);
    expect(planReconcile(new Map(), failed, [s1], 1_000 + RETRY_FAILED_MS - 1).start).toEqual([]);
    expect(planReconcile(new Map(), failed, [s1], 1_000 + RETRY_FAILED_MS).start.map((s) => s.id)).toEqual([1]);
    expect(planReconcile(new Map(), failed, [store(1, { botToken: '1000:FIXED' })], 1_001).start.map((s) => s.id)).toEqual([1]);
  });

  test('forgets failed starts of stores that are inactive or gone', () => {
    const failed = new Map([1, 2, 3].map((id) => [id, { fingerprint: storeFingerprint(store(id)), failedAt: 0 }] as const));
    const p = planReconcile(new Map(), failed, [store(1), store(2, { isActive: false })], 1);
    expect(p.forget).toEqual([2, 3]);
    expect(p.start).toEqual([]);
  });
});
