import { describe, expect, test } from 'bun:test';
import { parseAddSaldo } from '../src/handlers/admin';

describe('parseAddSaldo', () => {
	test('basic positive amount', () => {
		expect(parseAddSaldo('123 5')).toEqual({ userId: 123, cents: 500 });
		expect(parseAddSaldo('1 0.01')).toEqual({ userId: 1, cents: 1 });
	});

	test('negative amount (deduct)', () => {
		expect(parseAddSaldo('123 -5.25')).toEqual({ userId: 123, cents: -525 });
	});

	test('comma as decimal separator', () => {
		expect(parseAddSaldo('42 3,50')).toEqual({ userId: 42, cents: 350 });
	});

	test('extra whitespace is tolerated', () => {
		expect(parseAddSaldo('  100   10  ')).toEqual({ userId: 100, cents: 1000 });
	});

	test('rejects zero amount', () => {
		expect(parseAddSaldo('123 0')).toBeNull();
	});

	test('rejects non-numeric userId', () => {
		expect(parseAddSaldo('abc 5')).toBeNull();
	});

	test('rejects zero userId', () => {
		expect(parseAddSaldo('0 5')).toBeNull();
	});

	test('rejects negative userId', () => {
		expect(parseAddSaldo('-1 5')).toBeNull();
	});

	test('rejects float userId', () => {
		expect(parseAddSaldo('1.5 5')).toBeNull();
	});

	test('rejects missing amount', () => {
		expect(parseAddSaldo('123')).toBeNull();
	});

	test('rejects non-numeric amount', () => {
		expect(parseAddSaldo('123 abc')).toBeNull();
	});

	test('rejects amount exceeding cap ($100,000)', () => {
		expect(parseAddSaldo('1 100001')).toBeNull();
		expect(parseAddSaldo('1 -100001')).toBeNull();
	});

	test('accepts amount at exact cap', () => {
		expect(parseAddSaldo('1 100000')).toEqual({ userId: 1, cents: 10_000_000 });
		expect(parseAddSaldo('1 -100000')).toEqual({ userId: 1, cents: -10_000_000 });
	});

	test('empty string', () => {
		expect(parseAddSaldo('')).toBeNull();
	});

	test('fractional cents follow Math.round', () => {
		expect(parseAddSaldo('1 1.006')).toEqual({ userId: 1, cents: 101 });
		expect(parseAddSaldo('1 1.004')).toEqual({ userId: 1, cents: 100 });
	});
});
