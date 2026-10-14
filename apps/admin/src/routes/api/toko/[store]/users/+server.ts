import { endpoint } from '#lib/server/http.ts';
import { moneyFormatter } from '#lib/server/money.ts';
import { listUsers } from '#lib/server/repo/users.ts';

export const GET = endpoint(async ({ url, locals }) => listUsers(url.searchParams, locals.storeId, await moneyFormatter(locals.storeId, locals.currency)));
