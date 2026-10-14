import { endpoint, readJson } from '#lib/server/http.ts';
import { CURRENCY_COOKIE } from '#lib/server/money.ts';

export const POST = endpoint(async ({ request, cookies }) => {
	const body = await readJson(request);
	const raw = typeof body.currency === 'string' ? body.currency : '';
	const ccy = /^[A-Z]{3,5}$/.test(raw) && raw !== 'USD' ? raw : null;
	if (ccy) cookies.set(CURRENCY_COOKIE, ccy, { path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 });
	else cookies.delete(CURRENCY_COOKIE, { path: '/' });
	return { currency: ccy };
});
