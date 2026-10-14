// Pure session-token helpers (no DB) — unit tested.
import { createHash, randomBytes } from 'node:crypto';

export const SESSION_COOKIE = 'tb_admin_session';
/** Slug of the store opened last; only used to pick where legacy URLs redirect, never to scope data. */
export const LAST_STORE_COOKIE = 'tb_last_store';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Renew the expiry when less than this much lifetime remains (sliding sessions). */
export const SESSION_RENEW_BELOW_MS = SESSION_TTL_MS / 2;

/** 32 random bytes, base64url — this is what lives in the cookie. */
export function generateSessionToken(): string {
	return randomBytes(32).toString('base64url');
}

/** The DB only stores sha256(token) so a leaked table cannot be replayed as cookies. */
export function hashSessionToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export function isPlausibleToken(token: string | undefined | null): token is string {
	return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function sessionExpiry(now = Date.now()): Date {
	return new Date(now + SESSION_TTL_MS);
}

export function shouldRenew(expiresAt: Date, now = Date.now()): boolean {
	return expiresAt.getTime() - now < SESSION_RENEW_BELOW_MS;
}

export function validateUsername(u: string): string | null {
	if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(u)) return 'Username must be 3–32 chars: letters, digits, _ . -';
	return null;
}

export function validatePassword(p: string): string | null {
	if (p.length < 8) return 'Password must be at least 8 characters';
	if (p.length > 200) return 'Password is too long';
	return null;
}

export function sessionCookieOptions(expires: Date) {
	return { path: '/', httpOnly: true, secure: true, sameSite: 'lax' as const, expires };
}
