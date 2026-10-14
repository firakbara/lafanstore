import { describe, expect, test } from 'bun:test';
import { withUserLock } from '../src/util/lock';

describe('withUserLock', () => {
  test('returns true when fn completes successfully', async () => {
    const uid = 900_001;
    const result = await withUserLock(uid, async () => {});
    expect(result).toBe(true);
  });

  test('returns false when user already has a lock', async () => {
    const uid = 900_002;
    let release!: () => void;
    const held = withUserLock(uid, () => new Promise<void>((r) => (release = r)));
    const second = await withUserLock(uid, async () => {});
    expect(second).toBe(false);
    release();
    expect(await held).toBe(true);
  });

  test('lock is released after fn completes — can lock again', async () => {
    const uid = 900_003;
    await withUserLock(uid, async () => {});
    const again = await withUserLock(uid, async () => {});
    expect(again).toBe(true);
  });

  test('lock is released even when fn throws', async () => {
    const uid = 900_004;
    await withUserLock(uid, async () => {
      throw new Error('boom');
    }).catch(() => {});
    const again = await withUserLock(uid, async () => {});
    expect(again).toBe(true);
  });

  test('different userIds can run concurrently', async () => {
    const uidA = 900_005;
    const uidB = 900_006;
    let releaseA!: () => void;
    let releaseB!: () => void;
    const a = withUserLock(uidA, () => new Promise<void>((r) => (releaseA = r)));
    const b = withUserLock(uidB, () => new Promise<void>((r) => (releaseB = r)));
    // Both should be running (not blocked)
    const secondA = await withUserLock(uidA, async () => {});
    expect(secondA).toBe(false);
    const secondB = await withUserLock(uidB, async () => {});
    expect(secondB).toBe(false);
    releaseA();
    releaseB();
    expect(await a).toBe(true);
    expect(await b).toBe(true);
  });
});
