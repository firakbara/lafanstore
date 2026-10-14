import { endpoint, readJson } from '#lib/server/http.ts';
import { moneyFormatter } from '#lib/server/money.ts';
import { createProduct, listProducts, parseProductInput } from '#lib/server/repo/products.ts';

export const GET = endpoint(async ({ url, locals }) => listProducts(locals.storeId, url.searchParams, await moneyFormatter(locals.storeId, locals.currency)));
export const POST = endpoint(async ({ request, locals }) => createProduct(locals.storeId, parseProductInput(await readJson(request))));
