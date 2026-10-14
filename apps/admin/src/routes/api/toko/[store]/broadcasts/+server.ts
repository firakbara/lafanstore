import { bool, endpoint, oneOf, optStr, readJson, str } from '#lib/server/http.ts';
import { AUDIENCES, composeBroadcast, listBroadcasts } from '#lib/server/repo/broadcasts.ts';

export const GET = endpoint(async ({ url, locals }) => listBroadcasts(locals.storeId, url.searchParams));
export const POST = endpoint(async ({ request, locals }) => {
	const body = await readJson(request);
	return composeBroadcast(locals.storeId, {
		audience: oneOf(body, 'audience', AUDIENCES),
		title: optStr(body, 'title', { max: 200 }),
		body: str(body, 'body', { max: 3800 }),
		queue: bool(body, 'queue', true)
	});
});
