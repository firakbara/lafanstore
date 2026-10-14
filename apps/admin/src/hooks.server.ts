import type { Handle } from '@sveltejs/kit/hooks';
import { getStoreBySlug, listStores } from '@tokobun/core';
import { validateSession } from '#lib/server/auth.ts';
import { isCrossSiteApiWrite } from '#lib/server/csrf.ts';
import { CURRENCY_COOKIE } from '#lib/server/money.ts';
import { LAST_STORE_COOKIE, SESSION_COOKIE, sessionCookieOptions as cookieOptions } from '#lib/server/session.ts';
import { toPublicStore } from '#lib/server/stores.ts';
import { legacyRedirect } from '#lib/store-path.ts';

const PUBLIC_PATHS = new Set(['/login', '/favicon.svg', '/robots.txt', '/api/health']);
const SLUG_RE = /^[a-z0-9-]{1,64}$/;

/** Store for legacy redirects: the last-store cookie when it still names a store, else the first store. */
async function fallbackSlug(lastSlug: string | null): Promise<string | null> {
	const last = lastSlug ? await getStoreBySlug(lastSlug) : null;
	if (last) return last.slug;
	const all = await listStores();
	return all[0]?.slug ?? null;
}

export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	// Before any session work: JSON writes must come from our own pages (see csrf.ts).
	if (isCrossSiteApiWrite(event.request.method, path, event.request.headers.get('origin'), event.url.origin)) {
		return Response.json({ error: 'Cross-site request blocked' }, { status: 403 });
	}

	const token = event.cookies.get(SESSION_COOKIE) ?? null;
	event.locals.admin = null;
	event.locals.sessionToken = null;
	event.locals.store = null;
	event.locals.storeId = 0;
	const ccy = event.cookies.get(CURRENCY_COOKIE);
	event.locals.currency = ccy && /^[A-Z]{3,5}$/.test(ccy) ? ccy : null;

	if (token) {
		const session = await validateSession(token).catch((err) => {
			console.error('[admin] session validation failed', err);
			return null;
		});
		if (session) {
			event.locals.admin = session.admin;
			event.locals.sessionToken = token;
			if (session.renewedUntil) {
				event.cookies.set(SESSION_COOKIE, token, cookieOptions(session.renewedUntil));
			}
		} else {
			event.cookies.delete(SESSION_COOKIE, { path: '/' });
		}
	}

	const isApi = path.startsWith('/api/');
	const isPublic = PUBLIC_PATHS.has(path) || path.startsWith('/_app/');
	if (!event.locals.admin && !isPublic) {
		if (isApi) return Response.json({ error: 'Unauthorized' }, { status: 401 });
		const next = encodeURIComponent(path + event.url.search);
		return new Response(null, { status: 303, headers: { location: `/login?next=${next}` } });
	}

	if (event.locals.admin) {
		// Format-checked only; the store lookup happens lazily, just for legacy redirects.
		const lastRaw = event.cookies.get(LAST_STORE_COOKIE);
		const lastSlug = lastRaw && SLUG_RE.test(lastRaw) ? lastRaw : null;

		// Old bookmarks (/orders, /products/5, …) land in the last-used store.
		if (event.request.method === 'GET' && !isApi && legacyRedirect(path, '', 'x')) {
			const target = legacyRedirect(path, event.url.search, await fallbackSlug(lastSlug));
			if (target) return new Response(null, { status: 303, headers: { location: target } });
		}

		// Typed loosely: `store` only exists in the generated route params once routes/…/toko/[store] exists.
		const slug = (event.params as Record<string, string | undefined>).store;
		if (slug) {
			const store = SLUG_RE.test(slug) ? await getStoreBySlug(slug) : null;
			if (store) {
				event.locals.store = toPublicStore(store);
				event.locals.storeId = store.id;
				if (!isApi && event.request.method === 'GET' && lastSlug !== store.slug) {
					event.cookies.set(LAST_STORE_COOKIE, store.slug, { path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 });
				}
			} else if (isApi) {
				return Response.json({ error: 'Store not found' }, { status: 404 });
			}
			// Unknown slug on a page: the store layout's load throws a 404 (Task 5).
		}
	}

	const response = await resolve(event);
	const rid = crypto.randomUUID().slice(0, 8);
	response.headers.set('x-request-id', rid);
	if (path.startsWith('/api/')) response.headers.set('cache-control', 'no-store');
	response.headers.set('strict-transport-security', 'max-age=63072000; includeSubDomains');
	response.headers.set('x-frame-options', 'DENY');
	response.headers.set('referrer-policy', 'same-origin');
	response.headers.set('x-robots-tag', 'noindex, nofollow');
	response.headers.set('x-content-type-options', 'nosniff');
	response.headers.set('cross-origin-opener-policy', 'same-origin');
	response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
	response.headers.set('x-permitted-cross-domain-policies', 'none');
	response.headers.append('vary', 'Cookie');
	response.headers.set(
		'content-security-policy',
		"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'"
	);
	return response;
};

