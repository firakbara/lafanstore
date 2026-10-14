import { assertOrderInStore, endpoint, idParam, jsonError } from '#lib/server/http.ts';
import { moneyFormatter } from '#lib/server/money.ts';
import { getOrderAdmin } from '#lib/server/repo/orders.ts';

export const GET = endpoint(async ({ params, locals }) => {
	const id = idParam(params.id);
	const [, fmt] = await Promise.all([assertOrderInStore(id, locals.storeId), moneyFormatter(locals.storeId, locals.currency)]);
	const o = await getOrderAdmin(id, locals.storeId, fmt);
	return o ?? jsonError(404, 'Order not found');
});
