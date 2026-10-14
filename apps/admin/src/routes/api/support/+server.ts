import { endpoint } from '#lib/server/http.ts';
import { listSupport } from '#lib/server/repo/support.ts';

export const GET = endpoint(async ({ url, locals }) => listSupport(locals.storeId, url.searchParams));
