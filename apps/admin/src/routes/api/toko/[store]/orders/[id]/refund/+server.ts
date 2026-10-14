import { assertOrderInStore, endpoint, idParam, optStr, readJson } from '#lib/server/http.ts';
import { refund } from '#lib/server/repo/orders.ts';

export const POST = endpoint(async ({ params, request, locals }) => {
	const id = idParam(params.id);
	await assertOrderInStore(id, locals.storeId);
	const body = await readJson(request);
	const note = optStr(body, 'note', { max: 500 }) ?? 'Refund';
	return refund(id, locals.storeId, `${note} (by ${locals.admin!.username})`);
});
