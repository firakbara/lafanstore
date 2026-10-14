import { describe, expect, test } from 'bun:test';
import { isCrossSiteApiWrite } from './csrf';

const ORIGIN = 'https://ai.firmanakbar.com';
const PATH = '/api/toko/main/payments/7/mark-paid';

describe('isCrossSiteApiWrite', () => {
	test('allows same-origin writes', () => {
		for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
			expect(isCrossSiteApiWrite(method, PATH, ORIGIN, ORIGIN)).toBe(false);
		}
	});
	test('blocks writes without an Origin header', () => {
		expect(isCrossSiteApiWrite('POST', PATH, null, ORIGIN)).toBe(true);
		expect(isCrossSiteApiWrite('DELETE', '/api/admins/2', null, ORIGIN)).toBe(true);
	});
	test('blocks writes from another origin, including sibling subdomains and opaque origins', () => {
		expect(isCrossSiteApiWrite('POST', PATH, 'https://evil.firmanakbar.com', ORIGIN)).toBe(true);
		expect(isCrossSiteApiWrite('POST', PATH, 'http://ai.firmanakbar.com', ORIGIN)).toBe(true);
		expect(isCrossSiteApiWrite('PATCH', PATH, 'https://evil.com', ORIGIN)).toBe(true);
		expect(isCrossSiteApiWrite('POST', PATH, 'null', ORIGIN)).toBe(true);
	});
	test('method matching is case-insensitive', () => {
		expect(isCrossSiteApiWrite('post', PATH, 'https://evil.com', ORIGIN)).toBe(true);
		expect(isCrossSiteApiWrite('get', PATH, 'https://evil.com', ORIGIN)).toBe(false);
	});
	test('allows safe methods regardless of Origin', () => {
		for (const method of ['GET', 'HEAD', 'OPTIONS']) {
			expect(isCrossSiteApiWrite(method, PATH, null, ORIGIN)).toBe(false);
			expect(isCrossSiteApiWrite(method, PATH, 'https://evil.com', ORIGIN)).toBe(false);
		}
	});
	test('leaves non-/api paths to SvelteKit (form actions keep its own check)', () => {
		expect(isCrossSiteApiWrite('POST', '/login', null, ORIGIN)).toBe(false);
		expect(isCrossSiteApiWrite('POST', '/toko/main/settings', 'https://evil.com', ORIGIN)).toBe(false);
		expect(isCrossSiteApiWrite('POST', '/api', 'https://evil.com', ORIGIN)).toBe(false);
	});
});
