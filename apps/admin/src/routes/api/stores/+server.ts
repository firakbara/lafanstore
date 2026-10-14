import { addStoreMember, createStore, updateStore } from '@tokobun/core';
import { getDb, orders, products } from '@tokobun/db';
import { eq, inArray, sql } from 'drizzle-orm';
import { BadRequest, endpoint, int, readJson, str } from '#lib/server/http.ts';

export const GET = endpoint(async ({ locals }) => {
	const stores = locals.adminStores;
	if (!stores.length) return { items: [] };
	const db = getDb();
	const ids = stores.map((s) => s.id);
	const [prodStats, orderStats] = await Promise.all([
		db.select({
			storeId: products.storeId,
			productCount: sql<number>`(count(*) filter (where ${products.isActive}))::int`,
			totalProducts: sql<number>`count(*)::int`,
		}).from(products).where(inArray(products.storeId, ids)).groupBy(products.storeId),
		db.select({
			storeId: orders.storeId,
			totalOrders: sql<number>`count(*)::int`,
			revenue: sql<string>`coalesce(sum(${orders.total}) filter (where ${orders.status} = 'completed'), 0)`,
		}).from(orders).where(inArray(orders.storeId, ids)).groupBy(orders.storeId),
	]);
	const prodMap = new Map(prodStats.map((r) => [r.storeId, r]));
	const orderMap = new Map(orderStats.map((r) => [r.storeId, r]));
	const items = stores.map((s) => {
		const p = prodMap.get(s.id);
		const o = orderMap.get(s.id);
		return {
			id: s.id, slug: s.slug, name: s.name, botUsername: s.botUsername, adminChatId: s.adminChatId, channelUrl: s.channelUrl, isActive: s.isActive,
			productCount: p?.productCount ?? 0,
			totalProducts: p?.totalProducts ?? 0,
			totalOrders: o?.totalOrders ?? 0,
			revenue: Number(o?.revenue ?? 0),
		};
	});
	return { items };
});

export const POST = endpoint(async ({ request, locals }) => {
	const body = await readJson(request);
	const slug = str(body, 'slug', { max: 64 }).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
	if (!/[a-z0-9]/.test(slug)) throw new BadRequest('Slug must contain at least one letter or digit', 'slug');
	const name = str(body, 'name', { max: 128 });
	const botToken = str(body, 'botToken', { max: 256 });
	const rawBotUser = typeof body.botUsername === 'string' ? body.botUsername.trim().replace(/^@/, '') : '';
	if (rawBotUser.length > 64) throw new BadRequest('botUsername is too long (max 64)');
	const botUsername = rawBotUser || null;
	const adminIds = Array.isArray(body.adminIds) ? body.adminIds.filter((n: unknown) => typeof n === 'number' && Number.isSafeInteger(n)).slice(0, 100) : [];
	const adminChatId = typeof body.adminChatId === 'number' && Number.isSafeInteger(body.adminChatId) ? body.adminChatId : null;
	const rawChannel = typeof body.channelUrl === 'string' ? body.channelUrl.trim() : '';
	if (rawChannel.length > 256) throw new BadRequest('channelUrl is too long (max 256)');
	if (rawChannel && !/^https?:\/\//i.test(rawChannel)) throw new BadRequest('channelUrl must be a valid URL starting with http(s)://');
	const channelUrl = rawChannel || null;
	const store = await createStore({ slug, name, botToken, botUsername, adminIds, adminChatId, channelUrl });
	if (locals.admin) await addStoreMember(store.id, locals.admin.id, 'owner');
	return store;
});

export const PATCH = endpoint(async ({ request, locals }) => {
	const body = await readJson(request);
	const id = int(body, 'id', { min: 1 });
	if (!locals.adminStores.some((s) => s.id === id)) throw new BadRequest('Store not found or no access');
	const patch: Record<string, unknown> = {};
	if (typeof body.name === 'string') patch.name = str(body, 'name', { max: 128 });
	if (typeof body.botToken === 'string') patch.botToken = str(body, 'botToken', { max: 256 });
	if (typeof body.botUsername === 'string') {
		const bu = body.botUsername.trim().replace(/^@/, '');
		if (bu.length > 64) throw new BadRequest('botUsername is too long (max 64)');
		patch.botUsername = bu || null;
	}
	if (typeof body.channelUrl === 'string') {
		const cu = body.channelUrl.trim();
		if (cu.length > 256) throw new BadRequest('channelUrl is too long (max 256)');
		if (cu && !/^https?:\/\//i.test(cu)) throw new BadRequest('channelUrl must be a valid URL starting with http(s)://');
		patch.channelUrl = cu || null;
	}
	if (Array.isArray(body.adminIds)) patch.adminIds = body.adminIds.filter((n: unknown) => typeof n === 'number' && Number.isSafeInteger(n)).slice(0, 100);
	if (body.adminChatId === null) patch.adminChatId = null;
	else if (typeof body.adminChatId === 'number' && Number.isSafeInteger(body.adminChatId)) patch.adminChatId = body.adminChatId;
	if (typeof body.isActive === 'boolean') patch.isActive = body.isActive;
	const store = await updateStore(id, patch);
	return store;
});
