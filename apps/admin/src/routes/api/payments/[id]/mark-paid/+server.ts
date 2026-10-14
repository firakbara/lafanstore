import { assertPaymentInStore, endpoint, idParam } from '#lib/server/http.ts';
import { moneyFormatter } from '#lib/server/money.ts';
import { markPaid } from '#lib/server/repo/payments.ts';

export const POST = endpoint(async ({ params, locals }) => {
	const id = idParam(params.id);
	const [, fmt] = await Promise.all([assertPaymentInStore(id, locals.storeId), moneyFormatter(locals.storeId, locals.currency)]);
	const res = await markPaid(id, locals.storeId, fmt);
	console.info(`[admin] ${locals.admin!.username} marked payment ${params.id} paid`, res);
	return res;
});
