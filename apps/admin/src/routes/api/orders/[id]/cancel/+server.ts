import { assertOrderInStore, endpoint, idParam } from '#lib/server/http.ts';
import { cancelPending } from '#lib/server/repo/orders.ts';

export const POST = endpoint(async ({ params, locals }) => {
	const id = idParam(params.id);
	await assertOrderInStore(id, locals.storeId);
	return cancelPending(id, locals.storeId);
});
