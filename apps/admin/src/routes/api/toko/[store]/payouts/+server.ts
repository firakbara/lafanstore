import { endpoint } from '#lib/server/http.ts';
import { moneyFormatter } from '#lib/server/money.ts';
import { listPayouts } from '#lib/server/repo/payouts.ts';

export const GET = endpoint(async ({ url, locals }) => listPayouts(url.searchParams, locals.storeId, await moneyFormatter(locals.storeId, locals.currency)));
