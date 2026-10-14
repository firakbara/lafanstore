import { invalidateSession } from '#lib/server/auth.ts';
import { SESSION_COOKIE } from '#lib/server/session.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies, locals }) => {
	await invalidateSession(locals.sessionToken ?? undefined);
	cookies.delete(SESSION_COOKIE, { path: '/' });
	return new Response(null, { status: 303, headers: { location: '/login' } });
};
