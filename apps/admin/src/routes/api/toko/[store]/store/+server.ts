import { getStore, updateStore, type StoreInfo } from '@tokobun/core';
import { BadRequest, endpoint, jsonError, readJson } from '#lib/server/http.ts';
import { toPublicStore } from '#lib/server/stores.ts';
import { verifyBotToken } from '#lib/server/telegram.ts';

export const GET = endpoint(async ({ locals }) => locals.store);

/** Bot token (empty = keep), admin Telegram ids, admin chat id, active flag. Name/channel are saved via /settings. */
export const PATCH = endpoint(async ({ request, locals }) => {
	const body = await readJson(request);
	const patch: Parameters<typeof updateStore>[1] = {};

	const rawToken = typeof body.botToken === 'string' ? body.botToken.trim() : '';
	if (rawToken) {
		if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(rawToken) || rawToken.length > 256) throw new BadRequest('Bot token format looks wrong (expected 123456:ABC…)', 'botToken');
		const current = (await getStore(locals.storeId)) as StoreInfo;
		if (rawToken !== current.botToken) {
			const v = await verifyBotToken(rawToken);
			if (!v.ok) {
				if (v.reason === 'invalid') throw new BadRequest(v.message, 'botToken');
				return jsonError(502, v.message);
			}
			patch.botToken = rawToken;
			patch.botUsername = v.username;
		}
	}
	if (Array.isArray(body.adminIds)) {
		patch.adminIds = body.adminIds.filter((n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n > 0).slice(0, 100);
	}
	if (body.adminChatId === null) patch.adminChatId = null;
	else if (typeof body.adminChatId === 'number' && Number.isSafeInteger(body.adminChatId)) patch.adminChatId = body.adminChatId;
	else if (body.adminChatId !== undefined) throw new BadRequest('Admin chat id must be a whole number', 'adminChatId');
	if (typeof body.isActive === 'boolean') patch.isActive = body.isActive;

	let updated;
	try {
		updated = await updateStore(locals.storeId, patch);
	} catch (err) {
		if (/bot token is already used/.test((err as Error).message)) throw new BadRequest('This bot is already used by another store', 'botToken');
		throw err;
	}
	return toPublicStore(updated);
});
