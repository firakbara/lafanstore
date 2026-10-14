import { assertUserInStore, bool, endpoint, idParam, readJson } from '#lib/server/http.ts';
import { ban } from '#lib/server/repo/users.ts';

export const POST = endpoint(async ({ params, request, locals }) => {
	const id = idParam(params.id);
	await assertUserInStore(id, locals.storeId);
	return ban(id, bool(await readJson(request), 'banned'));
});
