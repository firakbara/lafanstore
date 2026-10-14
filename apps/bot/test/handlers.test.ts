import { describe, expect, test } from 'bun:test';
import { parseStartPayload } from '../src/handlers/commands';
import { parseAddSaldo } from '../src/handlers/admin';
import { A } from '../src/callback';
import { callbacks } from '../src/handlers/router';
import { needsUser } from '../src/middleware/user';
import { initialSession } from '../src/util/session';

describe('parseStartPayload', () => {
	test('product deep link', () => {
		expect(parseStartPayload('product_netflix-3m')).toEqual({ productCode: 'netflix-3m' });
		expect(parseStartPayload('product_AB_1')).toEqual({ productCode: 'AB_1' });
	});

	test('trims whitespace', () => {
		expect(parseStartPayload('  product_abc  ')).toEqual({ productCode: 'abc' });
	});

	test('returns null for referral payload', () => {
		expect(parseStartPayload('ref_ABC123')).toBeNull();
	});

	test('returns null for empty payload', () => {
		expect(parseStartPayload('')).toBeNull();
	});

	test('returns null for random text', () => {
		expect(parseStartPayload('hello')).toBeNull();
		expect(parseStartPayload('product')).toBeNull();
		expect(parseStartPayload('product_')).toBeNull();
	});

	test('rejects codes longer than 64 chars', () => {
		expect(parseStartPayload(`product_${'a'.repeat(65)}`)).toBeNull();
	});

	test('code must be alphanumeric/dash/underscore', () => {
		expect(parseStartPayload('product_has space')).toBeNull();
		expect(parseStartPayload('product_a:b')).toBeNull();
	});
});

describe('parseAddSaldo', () => {
	test('valid positive amount', () => {
		expect(parseAddSaldo('123 5.00')).toEqual({ userId: 123, cents: 500 });
	});

	test('valid negative amount', () => {
		expect(parseAddSaldo('123 -3.50')).toEqual({ userId: 123, cents: -350 });
	});

	test('comma as decimal separator', () => {
		expect(parseAddSaldo('123 2,50')).toEqual({ userId: 123, cents: 250 });
	});

	test('rounds to nearest cent', () => {
		expect(parseAddSaldo('123 1.999')).toEqual({ userId: 123, cents: 200 });
	});

	test('rejects zero amount', () => {
		expect(parseAddSaldo('123 0')).toBeNull();
	});

	test('rejects amount over $100,000', () => {
		expect(parseAddSaldo('123 100001')).toBeNull();
	});

	test('rejects negative amount over $100,000', () => {
		expect(parseAddSaldo('123 -100001')).toBeNull();
	});

	test('rejects non-numeric user ID', () => {
		expect(parseAddSaldo('abc 5')).toBeNull();
	});

	test('rejects non-positive user ID', () => {
		expect(parseAddSaldo('0 5')).toBeNull();
		expect(parseAddSaldo('-1 5')).toBeNull();
	});

	test('rejects non-numeric amount', () => {
		expect(parseAddSaldo('123 abc')).toBeNull();
	});

	test('rejects missing amount', () => {
		expect(parseAddSaldo('123')).toBeNull();
	});

	test('rejects empty string', () => {
		expect(parseAddSaldo('')).toBeNull();
	});

	test('rejects float user ID', () => {
		expect(parseAddSaldo('3.14 5')).toBeNull();
	});

	test('handles exact $100,000 boundary', () => {
		expect(parseAddSaldo('123 100000')).toEqual({ userId: 123, cents: 10_000_000 });
		expect(parseAddSaldo('123 -100000')).toEqual({ userId: 123, cents: -10_000_000 });
	});

	test('handles small fractional amounts', () => {
		expect(parseAddSaldo('123 0.01')).toEqual({ userId: 123, cents: 1 });
		expect(parseAddSaldo('123 -0.01')).toEqual({ userId: 123, cents: -1 });
	});

	test('extra whitespace between args is accepted', () => {
		expect(parseAddSaldo('  123   5  ')).toEqual({ userId: 123, cents: 500 });
	});
});

describe('callbacks registry', () => {
	test('every action constant in A has a handler in callbacks', () => {
		// These are the action codes defined in A that should have callbacks registered
		const expectedActions = Object.values(A);
		for (const action of expectedActions) {
			expect(callbacks[action]).toBeDefined();
		}
	});

	test('action names in A are unique', () => {
		const values = Object.values(A);
		expect(new Set(values).size).toBe(values.length);
	});

	test('all callback handlers are functions', () => {
		for (const [action, handler] of Object.entries(callbacks)) {
			expect(typeof handler).toBe('function');
		}
	});
});

describe('needsUser', () => {
	// Minimal mock objects to satisfy BotContext shape for needsUser
	const makeCtx = (overrides: {
		from?: { id: number; is_bot: boolean } | null;
		chat?: { type: string } | null;
		callbackQuery?: object | null;
	} = {}) => ({
		from: overrides.from ?? null,
		chat: overrides.chat ?? null,
		callbackQuery: overrides.callbackQuery ?? undefined,
	}) as any;

	test('true for human user in private chat', () => {
		expect(needsUser(makeCtx({
			from: { id: 1, is_bot: false },
			chat: { type: 'private' },
		}))).toBe(true);
	});

	test('true for human user with callback query (any chat type)', () => {
		expect(needsUser(makeCtx({
			from: { id: 1, is_bot: false },
			chat: { type: 'group' },
			callbackQuery: { id: '1', data: 'x' },
		}))).toBe(true);
	});

	test('false for bot user', () => {
		expect(needsUser(makeCtx({
			from: { id: 1, is_bot: true },
			chat: { type: 'private' },
		}))).toBe(false);
	});

	test('false when no from (channel post, etc.)', () => {
		expect(needsUser(makeCtx({
			from: null,
			chat: { type: 'private' },
		}))).toBe(false);
	});

	test('false for human in group chat without callback query', () => {
		expect(needsUser(makeCtx({
			from: { id: 1, is_bot: false },
			chat: { type: 'group' },
		}))).toBe(false);
	});

	test('false for human in supergroup without callback query', () => {
		expect(needsUser(makeCtx({
			from: { id: 1, is_bot: false },
			chat: { type: 'supergroup' },
		}))).toBe(false);
	});

	test('true for human in supergroup with callback query', () => {
		expect(needsUser(makeCtx({
			from: { id: 1, is_bot: false },
			chat: { type: 'supergroup' },
			callbackQuery: { id: '2', data: 'y' },
		}))).toBe(true);
	});

	test('false when from is undefined', () => {
		expect(needsUser(makeCtx({}))).toBe(false);
	});

	test('false for bot user even in private chat with callback query', () => {
		expect(needsUser(makeCtx({
			from: { id: 1, is_bot: true },
			chat: { type: 'private' },
			callbackQuery: { id: '3', data: 'z' },
		}))).toBe(false);
	});
});

describe('initialSession', () => {
	test('returns an empty object', () => {
		const session = initialSession();
		expect(session).toEqual({});
	});

	test('each call returns a new reference', () => {
		const a = initialSession();
		const b = initialSession();
		expect(a).not.toBe(b);
	});

	test('returned session has no input, menuMsgId, voucher, or twofaSecret', () => {
		const session = initialSession();
		expect(session.input).toBeUndefined();
		expect(session.menuMsgId).toBeUndefined();
		expect(session.voucher).toBeUndefined();
		expect(session.twofaSecret).toBeUndefined();
	});
});
