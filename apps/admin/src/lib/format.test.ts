import { describe, expect, test } from 'bun:test';
import { fmtDate, fmtRelative, fmtInt, userLabel } from './format';

describe('fmtDate', () => {
	test('formats date with time', () => {
		expect(fmtDate(new Date('2026-03-15T14:05:30Z'))).toMatch(/2026-03-15/);
	});
	test('formats date without time', () => {
		expect(fmtDate('2026-03-15T14:05:30Z', false)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
	test('returns dash for null/undefined', () => {
		expect(fmtDate(null)).toBe('—');
		expect(fmtDate(undefined)).toBe('—');
	});
	test('returns dash for invalid date', () => {
		expect(fmtDate('not-a-date')).toBe('—');
	});
});

describe('fmtRelative', () => {
	test('returns dash for null', () => {
		expect(fmtRelative(null)).toBe('—');
	});
	test('just now for very recent', () => {
		const now = new Date();
		expect(fmtRelative(now)).toBe('just now');
	});
	test('minutes ago', () => {
		const d = new Date(Date.now() - 5 * 60 * 1000);
		expect(fmtRelative(d)).toBe('5m ago');
	});
	test('hours ago', () => {
		const d = new Date(Date.now() - 3 * 3600 * 1000);
		expect(fmtRelative(d)).toBe('3h ago');
	});
	test('days ago', () => {
		const d = new Date(Date.now() - 7 * 86400 * 1000);
		expect(fmtRelative(d)).toBe('7d ago');
	});
	test('falls back to date for old dates', () => {
		const d = new Date(Date.now() - 60 * 86400 * 1000);
		expect(fmtRelative(d)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
	test('future: in a moment', () => {
		const d = new Date(Date.now() + 30 * 1000);
		expect(fmtRelative(d)).toBe('in a moment');
	});
	test('future: minutes from now', () => {
		const d = new Date(Date.now() + 10 * 60 * 1000);
		expect(fmtRelative(d)).toBe('10m from now');
	});
	test('future: hours from now', () => {
		const d = new Date(Date.now() + 5 * 3600 * 1000);
		expect(fmtRelative(d)).toBe('5h from now');
	});
	test('future: days from now', () => {
		const d = new Date(Date.now() + 3 * 86400 * 1000);
		expect(fmtRelative(d)).toBe('3d from now');
	});
});

describe('fmtInt', () => {
	test('formats numbers with locale', () => {
		expect(fmtInt(1000)).toBe('1,000');
		expect(fmtInt(0)).toBe('0');
	});
	test('returns infinity for null/undefined', () => {
		expect(fmtInt(null)).toBe('∞');
		expect(fmtInt(undefined)).toBe('∞');
	});
});

describe('userLabel', () => {
	test('prefers username', () => {
		expect(userLabel({ username: 'joe', firstName: 'Joe', userId: 1 })).toBe('@joe');
	});
	test('falls back to firstName', () => {
		expect(userLabel({ username: null, firstName: 'Joe', userId: 1 })).toBe('Joe');
	});
	test('falls back to userId', () => {
		expect(userLabel({ username: null, firstName: null, userId: 42 })).toBe('42');
	});
	test('uses id when userId is missing', () => {
		expect(userLabel({ id: 99 })).toBe('99');
	});
	test('empty string username falls back to firstName', () => {
		expect(userLabel({ username: '', firstName: 'Jo', userId: 1 })).toBe('Jo');
	});
	test('empty both username and firstName falls back to userId', () => {
		expect(userLabel({ username: '', firstName: '', userId: 5 })).toBe('5');
	});
	test('prefers userId over id when both exist', () => {
		expect(userLabel({ userId: 10, id: 20, username: null, firstName: null })).toBe('10');
	});
});

describe('fmtDate edge cases', () => {
	test('accepts string input', () => {
		expect(fmtDate('2026-01-01T00:00:00Z')).toMatch(/^2026-01-01/);
	});
	test('accepts Date input', () => {
		expect(fmtDate(new Date('2026-06-15T08:30:00Z'))).toMatch(/2026-06-15/);
	});
	test('date with time includes hours and minutes', () => {
		const r = fmtDate(new Date('2026-03-15T14:05:30Z'));
		expect(r).toMatch(/\d{2}:\d{2}$/);
	});
});

describe('fmtInt edge cases', () => {
	test('large numbers', () => {
		expect(fmtInt(1_000_000)).toBe('1,000,000');
	});
	test('negative numbers', () => {
		expect(fmtInt(-500)).toBe('-500');
	});
});

describe('fmtDate additional edge cases', () => {
	test('empty string returns dash (falsy)', () => {
		expect(fmtDate('')).toBe('—');
	});
	test('epoch date formats correctly', () => {
		expect(fmtDate(new Date('1970-01-01T00:00:00Z'))).toMatch(/1970-01-01/);
	});
	test('far-future date formats correctly', () => {
		expect(fmtDate(new Date('2999-12-31T23:59:59Z'))).toMatch(/2999-12-31/);
	});
	test('midnight edge: 00:00 is displayed', () => {
		const r = fmtDate(new Date('2026-06-01T00:00:00Z'));
		expect(r).toMatch(/00:00/);
	});
	test('single-digit months and days are zero-padded', () => {
		const r = fmtDate(new Date('2026-01-05T03:07:00Z'), false);
		expect(r).toBe('2026-01-05');
	});
	test('ISO string with timezone offset is accepted', () => {
		expect(fmtDate('2026-06-15T12:00:00+05:30')).toMatch(/2026/);
	});
});

describe('fmtRelative additional edge cases', () => {
	test('undefined returns dash', () => {
		expect(fmtRelative(undefined)).toBe('—');
	});
	test('invalid date string returns dash for fmtDate fallback (>30d)', () => {
		// fmtRelative passes to fmtDate for old dates, but NaN date
		// gets Math.round((Date.now() - NaN) / 1000) = NaN, abs(NaN) < 60 is false...
		// Actually NaN comparisons all return false, so it falls through to fmtDate
		const r = fmtRelative('not-a-date');
		// NaN arithmetic: s=NaN, abs=NaN, all comparisons false, falls to fmtDate which returns '—'
		expect(r).toBe('—');
	});
	test('exactly 60 seconds ago shows minutes', () => {
		const d = new Date(Date.now() - 60 * 1000);
		expect(fmtRelative(d)).toBe('1m ago');
	});
	test('exactly 3600 seconds ago shows hours', () => {
		const d = new Date(Date.now() - 3600 * 1000);
		expect(fmtRelative(d)).toBe('1h ago');
	});
	test('exactly 86400 seconds ago shows days', () => {
		const d = new Date(Date.now() - 86400 * 1000);
		expect(fmtRelative(d)).toBe('1d ago');
	});
	test('29 days ago shows days', () => {
		const d = new Date(Date.now() - 29 * 86400 * 1000);
		expect(fmtRelative(d)).toBe('29d ago');
	});
	test('30 days ago falls back to date format', () => {
		const d = new Date(Date.now() - 30 * 86400 * 1000);
		expect(fmtRelative(d)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
	test('future 30+ days falls back to date format', () => {
		const d = new Date(Date.now() + 31 * 86400 * 1000);
		expect(fmtRelative(d)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});

describe('fmtInt additional edge cases', () => {
	test('zero is formatted as "0"', () => {
		expect(fmtInt(0)).toBe('0');
	});
	test('very large number', () => {
		expect(fmtInt(999_999_999)).toBe('999,999,999');
	});
	test('negative large number', () => {
		expect(fmtInt(-1_234_567)).toBe('-1,234,567');
	});
});

describe('userLabel additional edge cases', () => {
	test('all fields missing/empty returns empty string', () => {
		expect(userLabel({})).toBe('');
	});
	test('userId=0 is falsy but still returned as string', () => {
		// String(0) = "0", and 0 ?? undefined uses 0 since ?? only checks null/undefined
		expect(userLabel({ userId: 0 })).toBe('0');
	});
	test('id=0 is returned when userId is undefined', () => {
		expect(userLabel({ id: 0 })).toBe('0');
	});
	test('username with spaces is used as-is', () => {
		expect(userLabel({ username: 'user name' })).toBe('@user name');
	});
	test('firstName with only whitespace is still truthy', () => {
		expect(userLabel({ firstName: '  ', userId: 5 })).toBe('  ');
	});
});
