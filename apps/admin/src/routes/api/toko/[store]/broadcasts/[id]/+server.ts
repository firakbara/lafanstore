import { assertBroadcastInStore, endpoint, idParam, oneOf, readJson } from '#lib/server/http.ts';
import { cancelQueued, deleteDraft, queueDraft } from '#lib/server/repo/broadcasts.ts';

export const POST = endpoint(async ({ params, request, locals }) => {
	const action = oneOf(await readJson(request), 'action', ['queue', 'cancel'] as const);
	const id = idParam(params.id);
	await assertBroadcastInStore(id, locals.storeId);
	return action === 'queue' ? queueDraft(id, locals.storeId) : cancelQueued(id, locals.storeId);
});
export const DELETE = endpoint(async ({ params, locals }) => {
	const id = idParam(params.id);
	await assertBroadcastInStore(id, locals.storeId);
	return deleteDraft(id, locals.storeId);
});
