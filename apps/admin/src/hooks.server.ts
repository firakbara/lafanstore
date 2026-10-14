import type { Handle } from '@sveltejs/kit/hooks';
import { getStoresForAdmin } from '@tokobun/core';
import { validateSession } from '#lib/server/auth.ts';
import { CURRENCY_COOKIE } from '#lib/server/money.ts';
import { SESSION_COOKIE, STORE_COOKIE, sessionCookieOptions as cookieOptions } from '#lib/server/session.ts';

const PUBLIC_PATHS = new Set(['/login', '/favicon.svg', '/robots.txt', '/api/health']);

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE) ?? null;
	event.locals.admin = null;
	event.locals.sessionToken = null;
	event.locals.adminStores = [];
	const ccy = event.cookies.get(CURRENCY_COOKIE);
	event.locals.currency = ccy && /^[A-Z]{3,5}$/.test(ccy) ? ccy : null;
	const storeRaw = event.cookies.get(STORE_COOKIE);
	const requestedStoreId = storeRaw && /^\d+$/.test(storeRaw) ? Number(storeRaw) : 0;
	event.locals.storeId = 1;

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
			const adminStores = await getStoresForAdmin(session.admin.id).catch(() => []);
			event.locals.adminStores = adminStores.map((s) => ({ id: s.id, slug: s.slug, name: s.name, botUsername: s.botUsername, adminChatId: s.adminChatId, channelUrl: s.channelUrl, isActive: s.isActive }));
			if (requestedStoreId && adminStores.some((s) => s.id === requestedStoreId)) {
				event.locals.storeId = requestedStoreId;
			} else if (adminStores.length > 0) {
				event.locals.storeId = adminStores[0]!.id;
				if (requestedStoreId && requestedStoreId !== event.locals.storeId) {
					event.cookies.set(STORE_COOKIE, String(event.locals.storeId), { path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 });
				}
			}
		} else {
			event.cookies.delete(SESSION_COOKIE, { path: '/' });
		}
	}

	const path = event.url.pathname;
	const isPublic = PUBLIC_PATHS.has(path) || path.startsWith('/_app/');
	if (!event.locals.admin && !isPublic) {
		if (path.startsWith('/api/')) return Response.json({ error: 'Unauthorized' }, { status: 401 });
		const next = encodeURIComponent(path + event.url.search);
		return new Response(null, { status: 303, headers: { location: `/login?next=${next}` } });
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

