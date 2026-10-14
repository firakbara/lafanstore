import { fail, redirect } from '@sveltejs/kit';
import { createSession, ensureBootstrapAdmin, verifyCredentials } from '#lib/server/auth.ts';
import { safeNext } from '#lib/server/next.ts';
import { SESSION_COOKIE, sessionCookieOptions } from '#lib/server/session.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.admin) redirect(303, safeNext(url.searchParams.get('next')));
	await ensureBootstrapAdmin().catch((err) => console.error('[admin] bootstrap failed', err));
	return {};
};

// Very small in-memory throttle per username+IP to slow down password guessing.
const attempts = new Map<string, { n: number; until: number }>();
function sweepAttempts() {
	if (attempts.size < 500) return;
	const now = Date.now();
	for (const [k, v] of attempts) if (v.until <= now) attempts.delete(k);
}

export const actions: Actions = {
	default: async ({ request, cookies, url, getClientAddress }) => {
		const form = await request.formData();
		const username = String(form.get('username') ?? '').trim().slice(0, 64);
		const password = String(form.get('password') ?? '').slice(0, 1000);
		if (!username || !password) return fail(400, { username, error: 'Enter username and password' });

		let ip = 'unknown';
		try {
			ip = getClientAddress();
		} catch {
			/* not available in some environments */
		}
		const key = `${username.toLowerCase()}|${ip}`;
		sweepAttempts();
		const a = attempts.get(key);
		if (a && a.n >= 5 && a.until > Date.now()) {
			return fail(429, { username, error: 'Too many attempts. Try again in a minute.' });
		}

		const admin = await verifyCredentials(username, password);
		if (!admin) {
			const n = (a && a.until > Date.now() ? a.n : 0) + 1;
			attempts.set(key, { n, until: Date.now() + 60_000 });
			return fail(400, { username, error: 'Invalid username or password' });
		}
		attempts.delete(key);
		const { token, expiresAt } = await createSession(admin.id);
		cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
		redirect(303, safeNext(url.searchParams.get('next')));
	}
};
