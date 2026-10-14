import { endpoint, enumParam } from '#lib/server/http.ts';
import { AUDIENCES, audienceSize } from '#lib/server/repo/broadcasts.ts';

export const GET = endpoint(async ({ url, locals }) => {
	const audience = enumParam(url.searchParams, 'audience', AUDIENCES) ?? 'all';
	return { audience, count: await audienceSize(audience, locals.storeId) };
});
