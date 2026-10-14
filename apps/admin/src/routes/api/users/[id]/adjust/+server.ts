import { assertUserInStore, endpoint, idParam, int, readJson, str } from '#lib/server/http.ts';
import { moneyFormatter } from '#lib/server/money.ts';
import { adjustBalance } from '#lib/server/repo/users.ts';

export const POST = endpoint(async ({ params, request, locals }) => {
	const id = idParam(params.id);
	await assertUserInStore(id, locals.storeId);
	const body = await readJson(request);
	const amount = int(body, 'amount', { min: -100_000_000, max: 100_000_000 });
	const note = str(body, 'note', { min: 3, max: 300 });
	return adjustBalance(id, amount, note, locals.admin!.username, await moneyFormatter(locals.storeId, locals.currency));
});
