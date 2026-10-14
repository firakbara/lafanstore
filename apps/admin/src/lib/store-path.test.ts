import { describe, expect, test } from 'bun:test';
import { legacyRedirect, storeApi, storeHref, switchTarget } from './store-path';

describe('storeHref / storeApi', () => {
	test('builds store page paths', () => {
		expect(storeHref('patungin')).toBe('/toko/patungin');
		expect(storeHref('patungin', '/')).toBe('/toko/patungin');
		expect(storeHref('patungin', '/orders')).toBe('/toko/patungin/orders');
		expect(storeHref('patungin', 'orders/5?x=1')).toBe('/toko/patungin/orders/5?x=1');
	});
	test('builds store API paths', () => {
		expect(storeApi('patungin', '/orders')).toBe('/api/toko/patungin/orders');
		expect(storeApi('patungin', 'products/options?kind=sellable')).toBe('/api/toko/patungin/products/options?kind=sellable');
	});
});

describe('switchTarget', () => {
	test('keeps the section and drops detail ids', () => {
		expect(switchTarget('/toko/a/orders/15', 'b')).toBe('/toko/b/orders');
		expect(switchTarget('/toko/a/products/new', 'b')).toBe('/toko/b/products');
		expect(switchTarget('/toko/a/settings', 'b')).toBe('/toko/b/settings');
	});
	test('falls back to the dashboard', () => {
		expect(switchTarget('/toko/a', 'b')).toBe('/toko/b');
		expect(switchTarget('/toko/a/unknown', 'b')).toBe('/toko/b');
		expect(switchTarget('/akun', 'b')).toBe('/toko/b');
	});
});

describe('legacyRedirect', () => {
	test('maps old section URLs into the store, keeping the query', () => {
		expect(legacyRedirect('/orders', '?status=paid', 'patungin')).toBe('/toko/patungin/orders?status=paid');
		expect(legacyRedirect('/users/42', '', 'patungin')).toBe('/toko/patungin/users/42');
		expect(legacyRedirect('/settings', '', 'x')).toBe('/toko/x/settings');
	});
	test('goes to the picker when there is no store', () => {
		expect(legacyRedirect('/orders', '', null)).toBe('/');
	});
	test('ignores non-legacy paths', () => {
		for (const p of ['/', '/akun', '/login', '/toko/a/orders', '/api/orders', '/ordersx']) expect(legacyRedirect(p, '', 'a')).toBeNull();
	});
});
