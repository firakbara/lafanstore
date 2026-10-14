import { endpoint } from '#lib/server/http.ts';
import { moneyFormatter } from '#lib/server/money.ts';
import { listOrders } from '#lib/server/repo/orders.ts';

export const GET = endpoint(async ({ url, locals }) => listOrders(locals.storeId, url.searchParams, await moneyFormatter(locals.storeId, locals.currency)));
