import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
	SESSION_RENEW_BELOW_MS,
	SESSION_TTL_MS,
	generateSessionToken,
	hashSessionToken,
	isPlausibleToken,
	sessionExpiry,
	shouldRenew,
	validatePassword,
	validateUsername
} from './session';

describe('session tokens', () => {
	test('tokens are 32 random bytes in base64url and unique', () => {
		const a = generateSessionToken();
		const b = generateSessionToken();
		expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(a).not.toBe(b);
		expect(isPlausibleToken(a)).toBe(true);
	});

	test('stored id is sha256 hex of the token, never the token itself', () => {
		const t = generateSessionToken();
		const h = hashSessionToken(t);
		expect(h).toMatch(/^[0-9a-f]{64}$/);
		expect(h).toBe(createHash('sha256').update(t).digest('hex'));
		expect(h).not.toContain(t);
		expect(hashSessionToken(t)).toBe(h); // deterministic
	});

	test('rejects implausible cookie values before touching the DB', () => {
		for (const bad of [undefined, null, '', 'short', 'x'.repeat(43) + '!', 'a'.repeat(44)]) expect(isPlausibleToken(bad)).toBe(false);
	});

	test('expiry is 7 days and renews in the second half of the lifetime', () => {
		const now = 1_700_000_000_000;
		expect(sessionExpiry(now).getTime() - now).toBe(7 * 24 * 3600 * 1000);
		expect(shouldRenew(new Date(now + SESSION_TTL_MS), now)).toBe(false);
		expect(shouldRenew(new Date(now + SESSION_TTL_MS / 2 - 1), now)).toBe(true);
	});
});

describe('sessionCookieOptions', () => {
	test('returns secure, httpOnly, lax cookie config', async () => {
		const { sessionCookieOptions } = await import('./session');
		const expires = new Date('2026-11-01T00:00:00Z');
		const opts = sessionCookieOptions(expires);
		expect(opts).toEqual({ path: '/', httpOnly: true, secure: true, sameSite: 'lax', expires });
	});
});

describe('credential rules', () => {
	test('username', () => {
		expect(validateUsername('admin')).toBeNull();
		expect(validateUsername('a.b-c_1')).toBeNull();
		expect(validateUsername('ab')).not.toBeNull();
		expect(validateUsername('has space')).not.toBeNull();
	});
	test('password', () => {
		expect(validatePassword('12345678')).toBeNull();
		expect(validatePassword('short')).not.toBeNull();
		expect(validatePassword('x'.repeat(201))).not.toBeNull();
	});
	test('Bun.password hash/verify round trip', async () => {
		const hash = await Bun.password.hash('correct horse');
		expect(await Bun.password.verify('correct horse', hash)).toBe(true);
		expect(await Bun.password.verify('wrong', hash)).toBe(false);
	});
});

describe('validateUsername boundaries', () => {
	test('exactly 3 chars (minimum) is valid', () => {
		expect(validateUsername('abc')).toBeNull();
	});
	test('exactly 32 chars (maximum) is valid', () => {
		expect(validateUsername('a'.repeat(32))).toBeNull();
	});
	test('2 chars is too short', () => {
		expect(validateUsername('ab')).not.toBeNull();
	});
	test('33 chars is too long', () => {
		expect(validateUsername('a'.repeat(33))).not.toBeNull();
	});
	test('all allowed special chars: dot, hyphen, underscore', () => {
		expect(validateUsername('a.b')).toBeNull();
		expect(validateUsername('a-b')).toBeNull();
		expect(validateUsername('a_b')).toBeNull();
		expect(validateUsername('a.b-c_d')).toBeNull();
	});
	test('spaces rejected', () => {
		expect(validateUsername('a b c')).not.toBeNull();
		expect(validateUsername(' abc')).not.toBeNull();
		expect(validateUsername('abc ')).not.toBeNull();
	});
	test('unicode rejected', () => {
		expect(validateUsername('café')).not.toBeNull();
		expect(validateUsername('用户名abcd')).not.toBeNull();
	});
	test('empty string rejected', () => {
		expect(validateUsername('')).not.toBeNull();
	});
	test('special characters rejected', () => {
		expect(validateUsername('a@b')).not.toBeNull();
		expect(validateUsername('a!b')).not.toBeNull();
		expect(validateUsername('a/b')).not.toBeNull();
	});
});

describe('validatePassword boundaries', () => {
	test('exactly 8 chars (minimum) is valid', () => {
		expect(validatePassword('12345678')).toBeNull();
	});
	test('exactly 200 chars (maximum) is valid', () => {
		expect(validatePassword('p'.repeat(200))).toBeNull();
	});
	test('7 chars is too short', () => {
		expect(validatePassword('1234567')).not.toBeNull();
	});
	test('201 chars is too long', () => {
		expect(validatePassword('p'.repeat(201))).not.toBeNull();
	});
	test('empty string rejected', () => {
		expect(validatePassword('')).not.toBeNull();
	});
	test('unicode chars count by length', () => {
		expect(validatePassword('🔐🔐🔐🔐🔐🔐🔐🔐')).toBeNull();
	});
});

describe('isPlausibleToken boundaries', () => {
	test('42 chars rejected (too short)', () => {
		expect(isPlausibleToken('A'.repeat(42))).toBe(false);
	});
	test('43 chars of valid base64url accepted', () => {
		expect(isPlausibleToken('A'.repeat(43))).toBe(true);
		expect(isPlausibleToken('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef01234_-abcd')).toBe(true);
	});
	test('44 chars rejected (too long)', () => {
		expect(isPlausibleToken('A'.repeat(44))).toBe(false);
	});
	test('43 chars with invalid characters rejected', () => {
		expect(isPlausibleToken('A'.repeat(42) + '!')).toBe(false);
		expect(isPlausibleToken('A'.repeat(42) + '=')).toBe(false);
		expect(isPlausibleToken('A'.repeat(42) + '+')).toBe(false);
		expect(isPlausibleToken('A'.repeat(42) + '/')).toBe(false);
	});
	test('43 chars with space rejected', () => {
		expect(isPlausibleToken('A'.repeat(42) + ' ')).toBe(false);
	});
});

describe('shouldRenew boundary', () => {
	test('exactly at renewal boundary returns false', () => {
		const now = 1_700_000_000_000;
		const atBoundary = new Date(now + SESSION_RENEW_BELOW_MS);
		expect(shouldRenew(atBoundary, now)).toBe(false);
	});
	test('one ms before renewal boundary returns true', () => {
		const now = 1_700_000_000_000;
		const justBefore = new Date(now + SESSION_RENEW_BELOW_MS - 1);
		expect(shouldRenew(justBefore, now)).toBe(true);
	});
	test('one ms after renewal boundary returns false', () => {
		const now = 1_700_000_000_000;
		const justAfter = new Date(now + SESSION_RENEW_BELOW_MS + 1);
		expect(shouldRenew(justAfter, now)).toBe(false);
	});
});

describe('sessionExpiry default', () => {
	test('uses Date.now() when no argument given', () => {
		const before = Date.now();
		const expiry = sessionExpiry();
		const after = Date.now();
		expect(expiry.getTime()).toBeGreaterThanOrEqual(before + SESSION_TTL_MS);
		expect(expiry.getTime()).toBeLessThanOrEqual(after + SESSION_TTL_MS);
	});
});

describe('hashSessionToken determinism and isolation', () => {
	test('different tokens produce different hashes', () => {
		const a = generateSessionToken();
		const b = generateSessionToken();
		expect(hashSessionToken(a)).not.toBe(hashSessionToken(b));
	});
	test('empty string input still produces a 64-char hex hash', () => {
		const h = hashSessionToken('');
		expect(h).toMatch(/^[0-9a-f]{64}$/);
	});
	test('unicode input is hashed without error', () => {
		const h = hashSessionToken('日本語テスト🔐');
		expect(h).toMatch(/^[0-9a-f]{64}$/);
	});
});

describe('shouldRenew with expired session', () => {
	test('already-expired session returns true (needs renewal)', () => {
		const now = 1_700_000_000_000;
		const expired = new Date(now - 1000);
		expect(shouldRenew(expired, now)).toBe(true);
	});
	test('session expiring right now returns true', () => {
		const now = 1_700_000_000_000;
		expect(shouldRenew(new Date(now), now)).toBe(true);
	});
});

describe('validateUsername special patterns', () => {
	test('all dots is valid', () => {
		expect(validateUsername('...')).toBeNull();
	});
	test('all hyphens is valid', () => {
		expect(validateUsername('---')).toBeNull();
	});
	test('all underscores is valid', () => {
		expect(validateUsername('___')).toBeNull();
	});
	test('tab character rejected', () => {
		expect(validateUsername('abc\tdef')).not.toBeNull();
	});
	test('newline rejected', () => {
		expect(validateUsername('abc\ndef')).not.toBeNull();
	});
});
