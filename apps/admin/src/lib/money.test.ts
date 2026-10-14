import { describe, expect, test } from 'bun:test';
import { bpToPercent, centsToUsdInput, parseUsdToCents, percentToBp, usd } from './money';
import { withFmt, type MoneyFmt } from './server/money';

describe('parseUsdToCents', () => {
	test('whole and fractional dollars', () => {
		expect(parseUsdToCents('12')).toBe(1200);
		expect(parseUsdToCents('12.5')).toBe(1250);
		expect(parseUsdToCents('12.50')).toBe(1250);
		expect(parseUsdToCents('0.01')).toBe(1);
		expect(parseUsdToCents('0')).toBe(0);
		expect(parseUsdToCents(3)).toBe(300);
	});
	test('no float rounding errors', () => {
		expect(parseUsdToCents('0.29')).toBe(29);
		expect(parseUsdToCents('1.15')).toBe(115);
		expect(parseUsdToCents('4.35')).toBe(435);
		expect(parseUsdToCents('1234567.89')).toBe(123456789);
	});
	test('tolerates $ prefix, spaces and thousands separators', () => {
		expect(parseUsdToCents(' $1,234.56 ')).toBe(123456);
		expect(parseUsdToCents('12.')).toBe(1200);
	});
	test('rejects invalid input', () => {
		for (const bad of ['', 'abc', '1.234', '1.2.3', '-', '.5', '1e3', 'NaN']) expect(parseUsdToCents(bad)).toBeNull();
	});
	test('negative only when allowed', () => {
		expect(parseUsdToCents('-5')).toBeNull();
		expect(parseUsdToCents('-5.25', { allowNegative: true })).toBe(-525);
	});
});

describe('centsToUsdInput', () => {
	test('formats with 2 decimals', () => {
		expect(centsToUsdInput(0)).toBe('0.00');
		expect(centsToUsdInput(5)).toBe('0.05');
		expect(centsToUsdInput(1250)).toBe('12.50');
		expect(centsToUsdInput(-525)).toBe('-5.25');
		expect(centsToUsdInput(null)).toBe('');
	});
	test('round-trips with parseUsdToCents', () => {
		for (const c of [0, 1, 99, 100, 101, 123456789]) expect(parseUsdToCents(centsToUsdInput(c))).toBe(c);
	});
});

describe('percent <-> basis points', () => {
	test('converts', () => {
		expect(percentToBp('6')).toBe(600);
		expect(percentToBp('6.25')).toBe(625);
		expect(percentToBp('100')).toBe(10000);
		expect(bpToPercent(600)).toBe('6');
		expect(bpToPercent(625)).toBe('6.25');
	});
	test('rejects invalid', () => {
		expect(percentToBp('101')).toBeNull();
		expect(percentToBp('-1')).toBeNull();
		expect(percentToBp('1.234')).toBeNull();
		expect(percentToBp('x')).toBeNull();
	});
});

describe('usd', () => {
	test('formats cents as USD string', () => {
		expect(usd(1250)).toBe('12.50 USD');
		expect(usd(0)).toBe('0.00 USD');
		expect(usd(5)).toBe('0.05 USD');
	});
	test('returns dash for null/undefined', () => {
		expect(usd(null)).toBe('—');
		expect(usd(undefined)).toBe('—');
	});
	test('handles negative amounts', () => {
		expect(usd(-525)).toBe('-5.25 USD');
	});
});

describe('withFmt', () => {
	const fmt: MoneyFmt = (c) => (c == null ? '—' : `$${(c / 100).toFixed(2)}`);

	test('adds fmt object with formatted values for specified keys', () => {
		const row = { id: 1, total: 1250, fee: 50, name: 'test' };
		const result = withFmt(fmt, row, ['total', 'fee']);
		expect(result.fmt.total).toBe('$12.50');
		expect(result.fmt.fee).toBe('$0.50');
		expect(result.id).toBe(1);
		expect(result.name).toBe('test');
	});

	test('handles null values', () => {
		const row = { amount: null as number | null };
		const result = withFmt(fmt, row, ['amount']);
		expect(result.fmt.amount).toBe('—');
	});

	test('preserves original row fields', () => {
		const row = { a: 100, b: 'keep' };
		const result = withFmt(fmt, row, ['a']);
		expect(result.a).toBe(100);
		expect(result.b).toBe('keep');
		expect(result.fmt.a).toBe('$1.00');
	});

	test('empty keys array produces empty fmt object', () => {
		const row = { a: 100 };
		const result = withFmt(fmt, row, []);
		expect(result.fmt).toEqual({});
		expect(result.a).toBe(100);
	});
});

describe('parseUsdToCents edge cases', () => {
	test('single digit cents', () => {
		expect(parseUsdToCents('0.1')).toBe(10);
	});
	test('trailing dot with no decimals', () => {
		expect(parseUsdToCents('5.')).toBe(500);
	});
	test('negative with allowNegative round-trips', () => {
		expect(parseUsdToCents(centsToUsdInput(-1), { allowNegative: true })).toBe(-1);
		expect(parseUsdToCents(centsToUsdInput(-9999), { allowNegative: true })).toBe(-9999);
	});
	test('rejects three decimal digits', () => {
		expect(parseUsdToCents('1.234')).toBeNull();
	});
	test('rejects leading dot', () => {
		expect(parseUsdToCents('.5')).toBeNull();
	});
	test('whitespace-only input', () => {
		expect(parseUsdToCents('  ')).toBeNull();
	});
});

describe('percentToBp edge cases', () => {
	test('0 percent is valid', () => {
		expect(percentToBp('0')).toBe(0);
	});
	test('100 percent is exactly 10000 bp', () => {
		expect(percentToBp('100')).toBe(10000);
	});
	test('three decimal places rejected', () => {
		expect(percentToBp('1.234')).toBeNull();
	});
	test('negative percent rejected', () => {
		expect(percentToBp('-5')).toBeNull();
	});
	test('numeric input works', () => {
		expect(percentToBp(10)).toBe(1000);
	});
});

describe('bpToPercent edge cases', () => {
	test('0 bp = "0"', () => {
		expect(bpToPercent(0)).toBe('0');
	});
	test('10000 bp = "100"', () => {
		expect(bpToPercent(10000)).toBe('100');
	});
	test('1 bp = "0.01"', () => {
		expect(bpToPercent(1)).toBe('0.01');
	});
	test('round-trip: bpToPercent → percentToBp', () => {
		for (const bp of [0, 1, 100, 625, 10000]) {
			expect(percentToBp(bpToPercent(bp))).toBe(bp);
		}
	});
});

describe('centsToUsdInput additional edge cases', () => {
	test('undefined returns empty string (same as null)', () => {
		expect(centsToUsdInput(undefined)).toBe('');
	});
	test('very large cents value formats correctly', () => {
		expect(centsToUsdInput(99999999999)).toBe('999999999.99');
	});
	test('single negative cent', () => {
		expect(centsToUsdInput(-1)).toBe('-0.01');
	});
	test('exactly 99 cents', () => {
		expect(centsToUsdInput(99)).toBe('0.99');
	});
	test('exactly 100 cents (one dollar)', () => {
		expect(centsToUsdInput(100)).toBe('1.00');
	});
});

describe('parseUsdToCents dollar sign and numeric edge cases', () => {
	test('dollar sign only returns null', () => {
		expect(parseUsdToCents('$')).toBeNull();
	});
	test('dollar sign with spaces only returns null', () => {
		expect(parseUsdToCents('$   ')).toBeNull();
	});
	test('dollar prefix with negative and allowNegative', () => {
		expect(parseUsdToCents('$-5.25', { allowNegative: true })).toBe(-525);
	});
	test('numeric negative without allowNegative returns null', () => {
		expect(parseUsdToCents(-5)).toBeNull();
	});
	test('numeric float input treated as dollar amount', () => {
		expect(parseUsdToCents(0.5)).toBe(50);
		expect(parseUsdToCents(1.99)).toBe(199);
	});
	test('only commas/spaces strip to empty and return null', () => {
		expect(parseUsdToCents(',,,,')).toBeNull();
		expect(parseUsdToCents('   ,  , ')).toBeNull();
	});
	test('multiple dollar signs: only leading $ stripped', () => {
		expect(parseUsdToCents('$$5')).toBeNull();
	});
	test('dollar prefix with zero', () => {
		expect(parseUsdToCents('$0')).toBe(0);
		expect(parseUsdToCents('$0.00')).toBe(0);
	});
});

describe('percentToBp additional edge cases', () => {
	test('empty string returns null', () => {
		expect(percentToBp('')).toBeNull();
	});
	test('whitespace-only returns null', () => {
		expect(percentToBp('   ')).toBeNull();
	});
	test('four-digit number rejected (regex allows 1-3 digits)', () => {
		expect(percentToBp('1000')).toBeNull();
	});
	test('99.99% is valid (9999 bp)', () => {
		expect(percentToBp('99.99')).toBe(9999);
	});
	test('0.01% is valid (1 bp)', () => {
		expect(percentToBp('0.01')).toBe(1);
	});
	test('100.01% exceeds 10000 bp limit', () => {
		expect(percentToBp('100.01')).toBeNull();
	});
	test('leading zeros in whole part accepted by regex', () => {
		expect(percentToBp('006')).toBe(600);
	});
});
