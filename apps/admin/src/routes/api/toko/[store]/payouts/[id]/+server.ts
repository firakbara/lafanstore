import { endpoint, idParam, oneOf, optStr, readJson } from '#lib/server/http.ts';
import { moneyFormatter } from '#lib/server/money.ts';
import { decidePayout } from '#lib/server/repo/payouts.ts';

export const POST = endpoint(async ({ params, request, locals }) => {
	const body = await readJson(request);
	const decision = oneOf(body, 'decision', ['approve', 'reject'] as const);
	return decidePayout(
		idParam(params.id),
		locals.storeId,
		decision,
		optStr(body, 'reason', { max: 300 }),
		locals.admin!.username,
		await moneyFormatter(locals.storeId, locals.currency)
	);
});
