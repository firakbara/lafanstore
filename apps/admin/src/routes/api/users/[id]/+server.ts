import { assertUserInStore, endpoint, idParam, jsonError } from '#lib/server/http.ts';
import { moneyFormatter } from '#lib/server/money.ts';
import { getUserAdmin } from '#lib/server/repo/users.ts';

export const GET = endpoint(async ({ params, locals }) => {
	const id = idParam(params.id);
	const [, fmt] = await Promise.all([assertUserInStore(id, locals.storeId), moneyFormatter(locals.storeId, locals.currency)]);
	const u = await getUserAdmin(id, locals.storeId, fmt);
	return u ?? jsonError(404, 'User not found');
});
