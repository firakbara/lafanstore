import { describe, expect, test } from 'bun:test';
import { BadRequest } from '../http';
import { parseProductInput } from './products';
import { parseVoucherInput } from './vouchers';

describe('parseProductInput', () => {
	test('minimal valid product', () => {
		const input = parseProductInput({ name: 'Netflix', price: 250 });
		expect(input.name).toBe('Netflix');
		expect(input.price).toBe(250);
		expect(input.isCollection).toBe(false);
		expect(input.isActive).toBe(true);
		expect(input.code).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(input.discounts).toEqual([]);
	});

	test('collection sets price to 0 and clears discounts', () => {
		const input = parseProductInput({ name: 'Bundle', isCollection: true, price: 999, discounts: [{ minQty: 2, percentBp: 100 }] });
		expect(input.isCollection).toBe(true);
		expect(input.price).toBe(0);
		expect(input.discounts).toEqual([]);
	});

	test('custom code validated', () => {
		expect(parseProductInput({ name: 'A', price: 1, code: 'NFX-1' }).code).toBe('NFX-1');
		expect(() => parseProductInput({ name: 'A', price: 1, code: 'has space' })).toThrow(BadRequest);
		expect(() => parseProductInput({ name: 'A', price: 1, code: 'a:b' })).toThrow(BadRequest);
	});

	test('customEmojiId must be numeric', () => {
		expect(parseProductInput({ name: 'A', price: 1, customEmojiId: '12345' }).customEmojiId).toBe('12345');
		expect(() => parseProductInput({ name: 'A', price: 1, customEmojiId: 'abc' })).toThrow(BadRequest);
	});

	test('unlimited product requires unlimitedContent', () => {
		expect(() => parseProductInput({ name: 'A', price: 1, unlimited: true })).toThrow(BadRequest);
		const input = parseProductInput({ name: 'A', price: 1, unlimited: true, unlimitedContent: 'token:abc' });
		expect(input.unlimited).toBe(true);
		expect(input.unlimitedContent).toBe('token:abc');
	});

	test('non-unlimited clears unlimitedContent', () => {
		const input = parseProductInput({ name: 'A', price: 1, unlimited: false, unlimitedContent: 'should be cleared' });
		expect(input.unlimitedContent).toBeNull();
	});

	test('discounts with valid tiers', () => {
		const input = parseProductInput({ name: 'A', price: 1, discounts: [{ minQty: 5, percentBp: 500 }, { minQty: 10, percentBp: 1000 }] });
		expect(input.discounts).toEqual([{ minQty: 5, percentBp: 500 }, { minQty: 10, percentBp: 1000 }]);
	});

	test('duplicate discount tiers rejected', () => {
		expect(() => parseProductInput({
			name: 'A', price: 1,
			discounts: [{ minQty: 5, percentBp: 500 }, { minQty: 5, percentBp: 800 }]
		})).toThrow(BadRequest);
	});

	test('too many discount tiers rejected', () => {
		const tiers = Array.from({ length: 21 }, (_, i) => ({ minQty: i + 2, percentBp: 100 }));
		expect(() => parseProductInput({ name: 'A', price: 1, discounts: tiers })).toThrow(BadRequest);
	});

	test('sortOrder defaults to 0', () => {
		expect(parseProductInput({ name: 'A', price: 1 }).sortOrder).toBe(0);
		expect(parseProductInput({ name: 'A', price: 1, sortOrder: -5 }).sortOrder).toBe(-5);
	});
});

describe('parseVoucherInput', () => {
	test('minimal valid voucher', () => {
		const input = parseVoucherInput({ code: 'HEMAT10', kind: 'percent', value: 1000 });
		expect(input.code).toBe('HEMAT10');
		expect(input.kind).toBe('percent');
		expect(input.value).toBe(1000);
		expect(input.perUserLimit).toBe(1);
		expect(input.minTotal).toBe(0);
		expect(input.isActive).toBe(true);
	});

	test('code uppercased and validated', () => {
		expect(parseVoucherInput({ code: 'hemat', kind: 'fixed', value: 100 }).code).toBe('HEMAT');
		expect(() => parseVoucherInput({ code: 'has space', kind: 'fixed', value: 100 })).toThrow(BadRequest);
		expect(() => parseVoucherInput({ code: 'a:b', kind: 'fixed', value: 100 })).toThrow(BadRequest);
	});

	test('percent value capped at 10000 (100%)', () => {
		expect(parseVoucherInput({ code: 'MAX', kind: 'percent', value: 10000 }).value).toBe(10000);
		expect(() => parseVoucherInput({ code: 'OVER', kind: 'percent', value: 10001 })).toThrow(BadRequest);
	});

	test('fixed value allows up to 100M', () => {
		expect(parseVoucherInput({ code: 'BIG', kind: 'fixed', value: 100_000_000 }).value).toBe(100_000_000);
		expect(() => parseVoucherInput({ code: 'HUGE', kind: 'fixed', value: 100_000_001 })).toThrow(BadRequest);
	});

	test('optional fields', () => {
		const input = parseVoucherInput({
			code: 'V', kind: 'fixed', value: 100,
			minTotal: 500, maxUses: 10, perUserLimit: 3, productId: 42,
			expiresAt: '2026-12-31', isActive: false
		});
		expect(input.minTotal).toBe(500);
		expect(input.maxUses).toBe(10);
		expect(input.perUserLimit).toBe(3);
		expect(input.productId).toBe(42);
		expect(input.expiresAt).toBeInstanceOf(Date);
		expect(input.isActive).toBe(false);
	});

	test('invalid kind rejected', () => {
		expect(() => parseVoucherInput({ code: 'X', kind: 'other', value: 100 })).toThrow(BadRequest);
	});
});

describe('parseProductInput edge cases', () => {
	test('missing name throws', () => {
		expect(() => parseProductInput({ price: 100 })).toThrow(BadRequest);
	});

	test('empty name throws', () => {
		expect(() => parseProductInput({ name: '', price: 100 })).toThrow(BadRequest);
	});

	test('name exceeding 120 chars throws', () => {
		expect(() => parseProductInput({ name: 'x'.repeat(121), price: 100 })).toThrow(BadRequest);
	});

	test('name at 120 chars accepted', () => {
		expect(parseProductInput({ name: 'x'.repeat(120), price: 100 }).name).toBe('x'.repeat(120));
	});

	test('missing price throws for non-collection', () => {
		expect(() => parseProductInput({ name: 'A' })).toThrow(BadRequest);
	});

	test('price at 0 is valid', () => {
		expect(parseProductInput({ name: 'A', price: 0 }).price).toBe(0);
	});

	test('price at max (100M) is valid', () => {
		expect(parseProductInput({ name: 'A', price: 100_000_000 }).price).toBe(100_000_000);
	});

	test('price over max throws', () => {
		expect(() => parseProductInput({ name: 'A', price: 100_000_001 })).toThrow(BadRequest);
	});

	test('negative price throws', () => {
		expect(() => parseProductInput({ name: 'A', price: -1 })).toThrow(BadRequest);
	});

	test('icon string accepted', () => {
		expect(parseProductInput({ name: 'A', price: 1, icon: '🎮' }).icon).toBe('🎮');
	});

	test('icon null when not provided', () => {
		expect(parseProductInput({ name: 'A', price: 1 }).icon).toBeNull();
	});

	test('note at max 3500 chars accepted', () => {
		expect(parseProductInput({ name: 'A', price: 1, note: 'n'.repeat(3500) }).note).toBe('n'.repeat(3500));
	});

	test('warranty at max 32 chars accepted', () => {
		expect(parseProductInput({ name: 'A', price: 1, warranty: 'w'.repeat(32) }).warranty).toBe('w'.repeat(32));
	});

	test('discount percentBp at 9900 max accepted', () => {
		const input = parseProductInput({ name: 'A', price: 1, discounts: [{ minQty: 2, percentBp: 9900 }] });
		expect(input.discounts[0]!.percentBp).toBe(9900);
	});

	test('discount percentBp over 9900 throws', () => {
		expect(() => parseProductInput({ name: 'A', price: 1, discounts: [{ minQty: 2, percentBp: 9901 }] })).toThrow(BadRequest);
	});

	test('discount minQty below 2 throws', () => {
		expect(() => parseProductInput({ name: 'A', price: 1, discounts: [{ minQty: 1, percentBp: 100 }] })).toThrow(BadRequest);
	});

	test('code at max 32 chars accepted', () => {
		expect(parseProductInput({ name: 'A', price: 1, code: 'a'.repeat(32) }).code).toBe('a'.repeat(32));
	});

	test('auto-generates code when not provided', () => {
		const a = parseProductInput({ name: 'A', price: 1 });
		const b = parseProductInput({ name: 'B', price: 1 });
		expect(a.code).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(b.code).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(a.code).not.toBe(b.code);
	});

	test('non-array discounts treated as empty', () => {
		const input = parseProductInput({ name: 'A', price: 1, discounts: 'not-array' });
		expect(input.discounts).toEqual([]);
	});

	test('parentId accepted when positive', () => {
		expect(parseProductInput({ name: 'A', price: 1, parentId: 42 }).parentId).toBe(42);
	});

	test('parentId null when not provided', () => {
		expect(parseProductInput({ name: 'A', price: 1 }).parentId).toBeNull();
	});
});

describe('parseVoucherInput edge cases', () => {
	test('lowercase code uppercased with special chars', () => {
		expect(parseVoucherInput({ code: 'sale-10_off', kind: 'fixed', value: 100 }).code).toBe('SALE-10_OFF');
	});

	test('empty code throws', () => {
		expect(() => parseVoucherInput({ code: '', kind: 'fixed', value: 100 })).toThrow(BadRequest);
	});

	test('value at minimum (1) is valid', () => {
		expect(parseVoucherInput({ code: 'V', kind: 'fixed', value: 1 }).value).toBe(1);
	});

	test('value at 0 throws', () => {
		expect(() => parseVoucherInput({ code: 'V', kind: 'fixed', value: 0 })).toThrow(BadRequest);
	});

	test('perUserLimit defaults to 1', () => {
		expect(parseVoucherInput({ code: 'V', kind: 'fixed', value: 100 }).perUserLimit).toBe(1);
	});

	test('perUserLimit capped at 1000', () => {
		expect(parseVoucherInput({ code: 'V', kind: 'fixed', value: 100, perUserLimit: 1000 }).perUserLimit).toBe(1000);
		expect(() => parseVoucherInput({ code: 'V', kind: 'fixed', value: 100, perUserLimit: 1001 })).toThrow(BadRequest);
	});

	test('maxUses null when not provided', () => {
		expect(parseVoucherInput({ code: 'V', kind: 'fixed', value: 100 }).maxUses).toBeNull();
	});

	test('productId null when not provided', () => {
		expect(parseVoucherInput({ code: 'V', kind: 'fixed', value: 100 }).productId).toBeNull();
	});

	test('expiresAt null when not provided', () => {
		expect(parseVoucherInput({ code: 'V', kind: 'fixed', value: 100 }).expiresAt).toBeNull();
	});

	test('invalid expiresAt throws', () => {
		expect(() => parseVoucherInput({ code: 'V', kind: 'fixed', value: 100, expiresAt: 'not-a-date' })).toThrow(BadRequest);
	});

	test('percent value at exactly 10000 valid', () => {
		expect(parseVoucherInput({ code: 'V', kind: 'percent', value: 10000 }).value).toBe(10000);
	});

	test('negative value throws', () => {
		expect(() => parseVoucherInput({ code: 'V', kind: 'fixed', value: -1 })).toThrow(BadRequest);
	});

	test('minTotal defaults to 0', () => {
		expect(parseVoucherInput({ code: 'V', kind: 'fixed', value: 100 }).minTotal).toBe(0);
	});
});
