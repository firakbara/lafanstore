import { createStore, listStores, updateSettings } from '@tokobun/core';
import { getDb, orders } from '@tokobun/db';
import { and, gt, inArray, sql } from 'drizzle-orm';
import { BadRequest, endpoint, jsonError, readJson, str } from '#lib/server/http.ts';
import { verifyBotToken } from '#lib/server/telegram.ts';

/** Every store for the picker, with a 24 h order count. */
export const GET = endpoint(async () => {
	const stores = await listStores();
	if (!stores.length) return { items: [] };
	const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
	const counts = await getDb()
		.select({ storeId: orders.storeId, n: sql<number>`count(*)::int` })
		.from(orders)
		.where(and(inArray(orders.storeId, stores.map((s) => s.id)), gt(orders.createdAt, since)))
		.groupBy(orders.storeId);
	const byStore = new Map(counts.map((c) => [c.storeId, c.n]));
	return {
		items: stores.map((s) => ({
			id: s.id,
			slug: s.slug,
			name: s.name,
			botUsername: s.botUsername,
			isActive: s.isActive,
			orders24h: byStore.get(s.id) ?? 0
		}))
	};
});

export const POST = endpoint(async ({ request }) => {
	const body = await readJson(request);
	const slug = str(body, 'slug', { max: 64 }).toLowerCase().trim();
	if (!/^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/.test(slug)) throw new BadRequest('2–64 characters: a-z, 0-9 and -, not starting or ending with -', 'slug');
	const name = str(body, 'name', { max: 128 }).trim();
	if (!name) throw new BadRequest('Required', 'name');
	const botToken = str(body, 'botToken', { max: 256 }).trim();
	if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(botToken)) throw new BadRequest('Bot token format looks wrong (expected 123456:ABC…)', 'botToken');
	const adminIds = Array.isArray(body.adminIds) ? body.adminIds.filter((n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n > 0).slice(0, 100) : [];
	const adminChatId = typeof body.adminChatId === 'number' && Number.isSafeInteger(body.adminChatId) ? body.adminChatId : null;
	const rawChannel = typeof body.channelUrl === 'string' ? body.channelUrl.trim() : '';
	if (rawChannel && (rawChannel.length > 256 || !/^https?:\/\/\S+$/i.test(rawChannel))) throw new BadRequest('Must be a URL starting with https://', 'channelUrl');
	const channelUrl = rawChannel || null;

	const v = await verifyBotToken(botToken);
	if (!v.ok) {
		if (v.reason === 'invalid') throw new BadRequest(v.message, 'botToken');
		return jsonError(502, v.message);
	}
	let store;
	try {
		store = await createStore({ slug, name, botToken, botUsername: v.username, adminIds, adminChatId, channelUrl });
	} catch (err) {
		const msg = (err as Error).message;
		if (/slug/.test(msg)) throw new BadRequest('A store with this slug already exists', 'slug');
		if (/bot token/.test(msg)) throw new BadRequest('This bot is already used by another store', 'botToken');
		throw err;
	}
	await updateSettings(store.id, { storeName: name, channelUrl });
	return { id: store.id, slug: store.slug };
});
