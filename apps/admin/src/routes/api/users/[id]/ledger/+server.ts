import { assertUserInStore, endpoint, idParam } from '#lib/server/http.ts';
import { moneyFormatter } from '#lib/server/money.ts';
import { userLedger } from '#lib/server/repo/users.ts';

export const GET = endpoint(async ({ params, url, locals }) => {
	const id = idParam(params.id);
	await assertUserInStore(id, locals.storeId);
	return userLedger(id, url.searchParams, await moneyFormatter(locals.storeId, locals.currency));
});
