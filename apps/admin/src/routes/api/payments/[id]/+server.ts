import { assertPaymentInStore, endpoint, idParam, jsonError } from '#lib/server/http.ts';
import { moneyFormatter } from '#lib/server/money.ts';
import { getPaymentAdmin } from '#lib/server/repo/payments.ts';

export const GET = endpoint(async ({ params, locals }) => {
	const id = idParam(params.id);
	const [, fmt] = await Promise.all([assertPaymentInStore(id, locals.storeId), moneyFormatter(locals.storeId, locals.currency)]);
	const p = await getPaymentAdmin(id, locals.storeId, fmt);
	return p ?? jsonError(404, 'Payment not found');
});
