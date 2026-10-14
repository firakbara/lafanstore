import { describe, expect, test } from 'bun:test';
import {
  formatTz,
  formatDateTime,
  formatDate,
  minutesLeft,
  TZ_OFFSETS,
  signed,
  displayName,
} from '../src/util/format';

describe('formatTz', () => {
  test('positive whole-hour offset', () => {
    expect(formatTz(420)).toBe('UTC+7');
  });

  test('negative whole-hour offset', () => {
    expect(formatTz(-300)).toBe('UTC-5');
  });

  test('zero offset', () => {
    expect(formatTz(0)).toBe('UTC+0');
  });

  test('half-hour offset (India +5:30)', () => {
    expect(formatTz(330)).toBe('UTC+5:30');
  });

  test('quarter-hour offset (Nepal +5:45)', () => {
    expect(formatTz(345)).toBe('UTC+5:45');
  });

  test('negative half-hour offset (-3:30)', () => {
    expect(formatTz(-210)).toBe('UTC-3:30');
  });

  test('large positive offset (+14)', () => {
    expect(formatTz(840)).toBe('UTC+14');
  });

  test('large negative offset (-12)', () => {
    expect(formatTz(-720)).toBe('UTC-12');
  });
});

describe('formatDateTime', () => {
  // Fixed reference: 2026-10-03T07:05:00Z
  const ref = new Date('2026-10-03T07:05:00Z');

  test('UTC+0 keeps the same time', () => {
    expect(formatDateTime(ref, 0)).toBe('2026-10-03 07:05');
  });

  test('UTC+7 adds 7 hours', () => {
    expect(formatDateTime(ref, 420)).toBe('2026-10-03 14:05');
  });

  test('UTC-5 subtracts 5 hours', () => {
    expect(formatDateTime(ref, -300)).toBe('2026-10-03 02:05');
  });

  test('offset that crosses midnight forward', () => {
    // 2026-10-03T23:00:00Z + 2h = 2026-10-04 01:00
    const late = new Date('2026-10-03T23:00:00Z');
    expect(formatDateTime(late, 120)).toBe('2026-10-04 01:00');
  });

  test('offset that crosses midnight backward', () => {
    // 2026-10-03T01:00:00Z - 3h = 2026-10-02 22:00
    const early = new Date('2026-10-03T01:00:00Z');
    expect(formatDateTime(early, -180)).toBe('2026-10-02 22:00');
  });

  test('half-hour offset (India +5:30)', () => {
    expect(formatDateTime(ref, 330)).toBe('2026-10-03 12:35');
  });

  test('pads single-digit month, day, hour, minute', () => {
    // 2026-01-02T03:04:00Z with offset 0
    const d = new Date('2026-01-02T03:04:00Z');
    expect(formatDateTime(d, 0)).toBe('2026-01-02 03:04');
  });
});

describe('formatDate', () => {
  const ref = new Date('2026-10-03T07:05:00Z');

  test('returns date portion only', () => {
    expect(formatDate(ref, 0)).toBe('2026-10-03');
  });

  test('respects offset for date boundary', () => {
    const late = new Date('2026-10-03T23:00:00Z');
    expect(formatDate(late, 120)).toBe('2026-10-04');
  });

  test('negative offset pushing date back', () => {
    const early = new Date('2026-10-03T01:00:00Z');
    expect(formatDate(early, -180)).toBe('2026-10-02');
  });
});

describe('minutesLeft', () => {
  test('future date returns positive minutes', () => {
    const now = new Date('2026-10-03T10:00:00Z');
    const until = new Date('2026-10-03T10:30:00Z');
    expect(minutesLeft(until, now)).toBe(30);
  });

  test('past date returns 0 (never negative)', () => {
    const now = new Date('2026-10-03T10:30:00Z');
    const until = new Date('2026-10-03T10:00:00Z');
    expect(minutesLeft(until, now)).toBe(0);
  });

  test('exact match returns 0', () => {
    const now = new Date('2026-10-03T10:00:00Z');
    expect(minutesLeft(now, now)).toBe(0);
  });

  test('fractional seconds round up', () => {
    const now = new Date('2026-10-03T10:00:00Z');
    // 5 minutes and 1 second ahead => ceil(5.0167) = 6
    const until = new Date('2026-10-03T10:05:01Z');
    expect(minutesLeft(until, now)).toBe(6);
  });

  test('exactly 1 second ahead rounds up to 1 minute', () => {
    const now = new Date('2026-10-03T10:00:00Z');
    const until = new Date('2026-10-03T10:00:01Z');
    expect(minutesLeft(until, now)).toBe(1);
  });

  test('exactly 1 minute ahead returns 1', () => {
    const now = new Date('2026-10-03T10:00:00Z');
    const until = new Date('2026-10-03T10:01:00Z');
    expect(minutesLeft(until, now)).toBe(1);
  });
});

describe('TZ_OFFSETS', () => {
  test('has 27 entries (UTC-12 through UTC+14)', () => {
    expect(TZ_OFFSETS.length).toBe(27);
  });

  test('first element is -720 (UTC-12)', () => {
    expect(TZ_OFFSETS[0]).toBe(-720);
  });

  test('last element is 840 (UTC+14)', () => {
    expect(TZ_OFFSETS[26]).toBe(840);
  });

  test('UTC+0 is at index 12', () => {
    expect(TZ_OFFSETS[12]).toBe(0);
  });

  test('each step is 60 minutes apart', () => {
    for (let i = 1; i < TZ_OFFSETS.length; i++) {
      expect(TZ_OFFSETS[i]! - TZ_OFFSETS[i - 1]!).toBe(60);
    }
  });
});

describe('signed', () => {
  const fmtUsd = (c: number) => `${(c / 100).toFixed(2)} USD`;

  test('positive amount gets + prefix', () => {
    expect(signed(150, fmtUsd)).toBe('+1.50 USD');
  });

  test('negative amount gets - prefix', () => {
    expect(signed(-150, fmtUsd)).toBe('-1.50 USD');
  });

  test('zero amount gets + prefix', () => {
    expect(signed(0, fmtUsd)).toBe('+0.00 USD');
  });

  test('large amount formats correctly', () => {
    expect(signed(1000000, fmtUsd)).toBe('+10000.00 USD');
  });

  test('negative with large amount', () => {
    expect(signed(-999, fmtUsd)).toBe('-9.99 USD');
  });
});

describe('displayName', () => {
  test('returns firstName when present', () => {
    expect(displayName({ firstName: 'Alice', username: 'alice', id: 1 })).toBe('Alice');
  });

  test('falls back to @username when no firstName', () => {
    expect(displayName({ firstName: null, username: 'bob', id: 2 })).toBe('@bob');
  });

  test('falls back to id when no firstName and no username', () => {
    expect(displayName({ firstName: null, username: null, id: 3 })).toBe('3');
  });

  test('empty string firstName falls through to username', () => {
    expect(displayName({ firstName: '', username: 'charlie', id: 4 })).toBe('@charlie');
  });

  test('undefined firstName falls through to username', () => {
    expect(displayName({ username: 'dave', id: 5 })).toBe('@dave');
  });

  test('no firstName, no username falls to id', () => {
    expect(displayName({ id: 999 })).toBe('999');
  });

  test('empty firstName and no username falls to id', () => {
    expect(displayName({ firstName: '', username: null, id: 42 })).toBe('42');
  });

  test('whitespace-only firstName is truthy, returned as-is', () => {
    expect(displayName({ firstName: '  ', username: 'x', id: 1 })).toBe('  ');
  });

  test('empty username with undefined firstName falls to id', () => {
    expect(displayName({ firstName: undefined, username: '', id: 77 })).toBe('77');
  });
});

describe('formatTz edge cases', () => {
  test('sub-hour offset under 60 shows 0 hours with minutes', () => {
    expect(formatTz(45)).toBe('UTC+0:45');
  });

  test('negative sub-hour offset', () => {
    expect(formatTz(-30)).toBe('UTC-0:30');
  });
});

describe('formatDateTime edge cases', () => {
  test('year boundary: Dec 31 + offset crosses to Jan 1', () => {
    const dec31 = new Date('2026-12-31T23:00:00Z');
    expect(formatDateTime(dec31, 120)).toBe('2027-01-01 01:00');
  });

  test('year boundary backward: Jan 1 - offset to Dec 31', () => {
    const jan1 = new Date('2027-01-01T01:00:00Z');
    expect(formatDateTime(jan1, -180)).toBe('2026-12-31 22:00');
  });

  test('leap day', () => {
    const leap = new Date('2028-02-29T12:00:00Z');
    expect(formatDateTime(leap, 0)).toBe('2028-02-29 12:00');
  });
});

describe('minutesLeft edge cases', () => {
  test('multi-day gap', () => {
    const now = new Date('2026-10-01T00:00:00Z');
    const until = new Date('2026-10-04T00:00:00Z');
    expect(minutesLeft(until, now)).toBe(3 * 24 * 60);
  });

  test('just under 1 second past returns 0', () => {
    const now = new Date('2026-10-03T10:00:01Z');
    const until = new Date('2026-10-03T10:00:00Z');
    expect(minutesLeft(until, now)).toBe(0);
  });
});

describe('signed edge cases', () => {
  test('amount of 1 cent', () => {
    const fmt = (c: number) => `${(c / 100).toFixed(2)} USD`;
    expect(signed(1, fmt)).toBe('+0.01 USD');
    expect(signed(-1, fmt)).toBe('-0.01 USD');
  });
});
