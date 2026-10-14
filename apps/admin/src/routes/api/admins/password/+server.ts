import { changePassword } from '#lib/server/auth.ts';
import { endpoint, readJson } from '#lib/server/http.ts';

const attempts = new Map<number, { n: number; until: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;

export const POST = endpoint(async ({ request, locals }) => {
	const adminId = locals.admin!.id;
	const now = Date.now();
	const a = attempts.get(adminId);
	if (a && a.n >= MAX_ATTEMPTS && a.until > now) {
		const retryAfter = Math.ceil((a.until - now) / 1000);
		return new Response(JSON.stringify({ error: 'Too many attempts. Try again in a minute.' }), {
			status: 429,
			headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
		});
	}
	const body = await readJson(request);
	const current = typeof body.current === 'string' ? body.current.slice(0, 1000) : '';
	const next = typeof body.next === 'string' ? body.next : '';
	try {
		await changePassword(locals.admin!.id, current, next, locals.sessionToken ?? undefined);
	} catch (err) {
		if (err instanceof Error && err.message === 'Current password is incorrect') {
			const n = (a && a.until > Date.now() ? a.n : 0) + 1;
			attempts.set(adminId, { n, until: Date.now() + WINDOW_MS });
			if (attempts.size > 500) {
				const now = Date.now();
				for (const [k, v] of attempts) if (v.until <= now) attempts.delete(k);
			}
		}
		throw err;
	}
	attempts.delete(adminId);
	return { ok: true };
});
