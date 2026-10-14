import { assertProductInStore, endpoint, idParam, jsonError, readJson } from '#lib/server/http.ts';
import { moneyFormatter } from '#lib/server/money.ts';
import { deleteProduct, getProductAdmin, parseProductInput, patchProduct, updateProduct } from '#lib/server/repo/products.ts';

export const GET = endpoint(async ({ params, locals }) => {
	const id = idParam(params.id);
	const [, fmt] = await Promise.all([assertProductInStore(id, locals.storeId), moneyFormatter(locals.storeId, locals.currency)]);
	const p = await getProductAdmin(id, locals.storeId, fmt);
	return p ?? jsonError(404, 'Product not found');
});
export const PUT = endpoint(async ({ params, request, locals }) => {
	const id = idParam(params.id);
	await assertProductInStore(id, locals.storeId);
	return updateProduct(id, locals.storeId, parseProductInput(await readJson(request)));
});
export const PATCH = endpoint(async ({ params, request, locals }) => {
	const id = idParam(params.id);
	await assertProductInStore(id, locals.storeId);
	return patchProduct(id, locals.storeId, await readJson(request));
});
export const DELETE = endpoint(async ({ params, locals }) => {
	const id = idParam(params.id);
	await assertProductInStore(id, locals.storeId);
	return deleteProduct(id, locals.storeId);
});
