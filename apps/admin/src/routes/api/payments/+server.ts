import { endpoint } from '#lib/server/http.ts';
import { moneyFormatter } from '#lib/server/money.ts';
import { listPayments } from '#lib/server/repo/payments.ts';

export const GET = endpoint(async ({ url, locals }) => listPayments(locals.storeId, url.searchParams, await moneyFormatter(locals.storeId, locals.currency)));
