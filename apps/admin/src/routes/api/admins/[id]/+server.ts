import { deleteAdmin } from '#lib/server/auth.ts';
import { endpoint, idParam } from '#lib/server/http.ts';

export const DELETE = endpoint(async ({ params, locals }) => {
	await deleteAdmin(locals.admin!.id, idParam(params.id));
	return { ok: true };
});
