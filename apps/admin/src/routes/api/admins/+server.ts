import { createAdmin, listAllAdmins } from '#lib/server/auth.ts';
import { endpoint, readJson, str } from '#lib/server/http.ts';

export const GET = endpoint(async ({ locals }) => ({ items: await listAllAdmins(), me: locals.admin }));

export const POST = endpoint(async ({ request }) => {
	const body = await readJson(request);
	const password = typeof body.password === 'string' ? body.password.slice(0, 1000) : '';
	return createAdmin(str(body, 'username', { max: 32 }), password);
});
