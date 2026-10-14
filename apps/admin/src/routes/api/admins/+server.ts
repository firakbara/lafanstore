import { addStoreMember } from '@tokobun/core';
import { createAdmin, listAdmins } from '#lib/server/auth.ts';
import { endpoint, readJson, str } from '#lib/server/http.ts';

export const GET = endpoint(async ({ locals }) => ({ items: await listAdmins(locals.storeId), me: locals.admin }));
export const POST = endpoint(async ({ request, locals }) => {
	const body = await readJson(request);
	const password = typeof body.password === 'string' ? body.password.slice(0, 1000) : '';
	const admin = await createAdmin(str(body, 'username', { max: 32 }), password);
	await addStoreMember(locals.storeId, admin.id, 'manager');
	return admin;
});
