import { assertProductInStore, endpoint, idParam, optStr, readJson } from '#lib/server/http.ts';
import { notifyRestock } from '#lib/server/repo/stock.ts';

export const POST = endpoint(async ({ params, request, locals }) => {
	const id = idParam(params.id);
	await assertProductInStore(id, locals.storeId);
	const body = await readJson(request);
	return notifyRestock(locals.storeId, id, {
		title: optStr(body, 'title', { max: 200 }),
		body: optStr(body, 'body', { max: 4000 })
	});
});
