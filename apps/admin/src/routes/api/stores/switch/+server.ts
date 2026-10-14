import { BadRequest, endpoint, int, readJson } from '#lib/server/http.ts';
import { STORE_COOKIE } from '#lib/server/session.ts';

export const POST = endpoint(async ({ request, cookies, locals }) => {
	const body = await readJson(request);
	const id = int(body, 'storeId', { min: 1 });
	if (!locals.adminStores.some((s) => s.id === id)) throw new BadRequest('Store not found or no access');
	cookies.set(STORE_COOKIE, String(id), { path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 });
	return { ok: true, storeId: id };
});
