import { describe, expect, test } from 'bun:test';
import { safeNext } from './next';

describe('safeNext', () => {
	test('keeps same-origin paths', () => {
		expect(safeNext('/')).toBe('/');
		expect(safeNext('/orders')).toBe('/orders');
		expect(safeNext('/toko/a/orders?x=1')).toBe('/toko/a/orders?x=1');
		expect(safeNext('/toko/a/products/5?q=a%2Fb#top')).toBe('/toko/a/products/5?q=a%2Fb#top');
	});
	test('falls back to / when missing or empty', () => {
		expect(safeNext(null)).toBe('/');
		expect(safeNext('')).toBe('/');
	});
	test('refuses scheme-relative and absolute URLs', () => {
		expect(safeNext('//evil.com')).toBe('/');
		expect(safeNext('///evil.com')).toBe('/');
		expect(safeNext('https://evil.com')).toBe('/');
		expect(safeNext('javascript:alert(1)')).toBe('/');
		expect(safeNext('evil.com')).toBe('/');
	});
	test('refuses backslash tricks that browsers read as //', () => {
		expect(safeNext('/\\evil.com')).toBe('/');
		expect(safeNext('/\\\\evil.com')).toBe('/');
		expect(safeNext('\\/evil.com')).toBe('/');
		expect(safeNext('/orders\\..\\x')).toBe('/');
	});
	test('refuses control characters (browsers strip tab/CR/LF, turning /\\t/x into //x)', () => {
		expect(safeNext('/\t/evil.com')).toBe('/');
		expect(safeNext('/\n/evil.com')).toBe('/');
		expect(safeNext('/\r/evil.com')).toBe('/');
		expect(safeNext('/orders\u0000')).toBe('/');
		expect(safeNext('/orders\u007f')).toBe('/');
	});
	test('never redirects back to /login', () => {
		expect(safeNext('/login')).toBe('/');
		expect(safeNext('/login?next=/orders')).toBe('/');
	});
});
