import { endpoint } from '#lib/server/http.ts';
import { moneyFormatter } from '#lib/server/money.ts';
import { dashboard } from '#lib/server/repo/dashboard.ts';

export const GET = endpoint(async ({ locals }) => dashboard(locals.storeId, await moneyFormatter(locals.storeId, locals.currency)));
