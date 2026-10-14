import { assertProductInStore, bool, endpoint, idParam, readJson, str } from '#lib/server/http.ts';
import { deleteStock, importStock, listStock } from '#lib/server/repo/stock.ts';

export const GET = endpoint(async ({ params, url, locals }) => {
	const id = idParam(params.id);
	await assertProductInStore(id, locals.storeId);
	return listStock(id, url.searchParams);
});

export const POST = endpoint(async ({ params, request, locals }) => {
	const id = idParam(params.id);
	await assertProductInStore(id, locals.storeId);
	const body = await readJson(request, 6_000_000);
	return importStock(id, {
		text: str(body, 'text', { max: 5_000_000 }),
		separator: typeof body.separator === 'string' && body.separator !== '' ? body.separator : null,
		dedupe: bool(body, 'dedupe', true)
	});
});

export const DELETE = endpoint(async ({ params, request, locals }) => {
	const id = idParam(params.id);
	await assertProductInStore(id, locals.storeId);
	const body = await readJson(request);
	const ids = Array.isArray(body.ids) ? body.ids.map(Number) : [];
	return deleteStock(id, { ids, all: body.all === true });
});
