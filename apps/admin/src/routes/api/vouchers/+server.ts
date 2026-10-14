import { endpoint, readJson } from '#lib/server/http.ts';
import { moneyFormatter } from '#lib/server/money.ts';
import { createVoucher, listVouchers, parseVoucherInput } from '#lib/server/repo/vouchers.ts';

export const GET = endpoint(async ({ url, locals }) => listVouchers(locals.storeId, url.searchParams, await moneyFormatter(locals.storeId, locals.currency)));
export const POST = endpoint(async ({ request, locals }) => createVoucher(locals.storeId, parseVoucherInput(await readJson(request))));
