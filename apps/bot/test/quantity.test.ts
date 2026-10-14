import { describe, expect, test } from 'bun:test';
import { clampQty, maxQtyFor, MAX_QTY, pressKey } from '../src/util/quantity';

describe('clampQty', () => {
  test('basic clamp within range', () => {
    expect(clampQty(5, 10)).toBe(5);
  });

  test('max=null means unlimited (up to MAX_QTY)', () => {
    expect(clampQty(9999, null)).toBe(9999);
    expect(clampQty(99999, null)).toBe(MAX_QTY);
  });

  test('max=0 floors to 1', () => {
    expect(clampQty(1, 0)).toBe(1);
    expect(clampQty(5, 0)).toBe(1);
  });

  test('max=3 caps at 3', () => {
    expect(clampQty(5, 3)).toBe(3);
    expect(clampQty(3, 3)).toBe(3);
    expect(clampQty(1, 3)).toBe(1);
  });

  test('negative qty clamps to 1', () => {
    expect(clampQty(-5, null)).toBe(1);
    expect(clampQty(-1, 10)).toBe(1);
  });

  test('NaN qty clamps to 1', () => {
    expect(clampQty(NaN, null)).toBe(1);
    expect(clampQty(NaN, 10)).toBe(1);
  });

  test('float qty is truncated', () => {
    expect(clampQty(3.7, null)).toBe(3);
    expect(clampQty(2.9, 5)).toBe(2);
  });

  test('zero qty clamps to 1', () => {
    expect(clampQty(0, null)).toBe(1);
  });
});

describe('pressKey', () => {
  test('digit appends when typing', () => {
    const s = pressKey({ qty: 1, typing: true }, 2, null);
    expect(s).toEqual({ qty: 12, typing: true });
  });

  test('first digit replaces qty when not typing', () => {
    const s = pressKey({ qty: 5, typing: false }, 3, null);
    expect(s).toEqual({ qty: 3, typing: true });
  });

  test('pressing 0 when not typing resets to qty 1', () => {
    const s = pressKey({ qty: 5, typing: false }, 0, null);
    expect(s).toEqual({ qty: 1, typing: false });
  });

  test('del removes last digit when typing', () => {
    const s = pressKey({ qty: 123, typing: true }, 'del', null);
    expect(s).toEqual({ qty: 12, typing: true });
  });

  test('del on single digit resets to 1, not typing', () => {
    const s = pressKey({ qty: 5, typing: true }, 'del', null);
    expect(s).toEqual({ qty: 1, typing: false });
  });

  test('del resets when not typing', () => {
    const s = pressKey({ qty: 42, typing: false }, 'del', null);
    expect(s).toEqual({ qty: 1, typing: false });
  });

  test('max digits (4) prevents further appending', () => {
    const s = pressKey({ qty: 9999, typing: true }, 1, null);
    expect(s).toEqual({ qty: 9999, typing: true });
  });

  test('clamped to stock max', () => {
    const s = pressKey({ qty: 1, typing: true }, 5, 10);
    expect(s).toEqual({ qty: 10, typing: true });
  });

  test('building multi-digit number', () => {
    let s = pressKey({ qty: 1, typing: false }, 2, null);
    expect(s).toEqual({ qty: 2, typing: true });
    s = pressKey(s, 5, null);
    expect(s).toEqual({ qty: 25, typing: true });
    s = pressKey(s, 0, null);
    expect(s).toEqual({ qty: 250, typing: true });
  });
});

describe('maxQtyFor', () => {
  test('null stock returns null', () => {
    expect(maxQtyFor(null)).toBeNull();
  });

  test('0 stock returns 1', () => {
    expect(maxQtyFor(0)).toBe(1);
  });

  test('positive stock returns stock', () => {
    expect(maxQtyFor(5)).toBe(5);
  });

  test('negative stock returns 1', () => {
    expect(maxQtyFor(-3)).toBe(1);
  });
});
