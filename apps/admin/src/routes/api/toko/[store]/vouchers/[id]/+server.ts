import { assertVoucherInStore, bool, endpoint, idParam, readJson } from '#lib/server/http.ts';
import { deleteVoucher, parseVoucherInput, setVoucherActive, updateVoucher } from '#lib/server/repo/vouchers.ts';

export const PUT = endpoint(async ({ params, request, locals }) => {
	const id = idParam(params.id);
	await assertVoucherInStore(id, locals.storeId);
	return updateVoucher(id, locals.storeId, parseVoucherInput(await readJson(request)));
});
export const PATCH = endpoint(async ({ params, request, locals }) => {
	const id = idParam(params.id);
	await assertVoucherInStore(id, locals.storeId);
	return setVoucherActive(id, locals.storeId, bool(await readJson(request), 'isActive'));
});
export const DELETE = endpoint(async ({ params, locals }) => {
	const id = idParam(params.id);
	await assertVoucherInStore(id, locals.storeId);
	return deleteVoucher(id, locals.storeId);
});
