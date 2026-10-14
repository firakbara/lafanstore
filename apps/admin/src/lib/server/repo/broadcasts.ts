import { countBroadcastAudience, createBroadcast, queueBroadcast } from '@tokobun/core';
import { broadcasts, getDb } from '@tokobun/db';
import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { parseListParams, toPage } from '#lib/paging.ts';
import { validateTelegramHtml } from '#lib/telegram-html.ts';
import { BadRequest, enumParam } from '../http';

export const AUDIENCES = ['all', 'stock', 'info', 'referral'] as const;
export type Audience = (typeof AUDIENCES)[number];

export async function listBroadcasts(storeId: number, sp: URLSearchParams) {
	const p = parseListParams(sp, { sortable: ['createdAt'] as const, defaultSort: 'createdAt', defaultPageSize: 20 });
	const where: SQL[] = [eq(broadcasts.storeId, storeId)];
	const status = enumParam(sp, 'status', ['draft', 'queued', 'sending', 'done', 'failed'] as const);
	if (status) where.push(eq(broadcasts.status, status));
	const cond = and(...where);
	const db = getDb();
	const [rows, [{ n } = { n: 0 }]] = await Promise.all([
		db.select().from(broadcasts).where(cond).orderBy(desc(broadcasts.id)).limit(p.pageSize).offset(p.offset),
		db.select({ n: sql<number>`count(*)::int` }).from(broadcasts).where(cond)
	]);
	return toPage(rows, n, p);
}

/** How many users an audience would currently reach in this store. */
export async function audienceSize(audience: Audience, storeId: number): Promise<number> {
	return countBroadcastAudience(audience, storeId);
}


export async function composeBroadcast(storeId: number, input: { audience: Audience; title: string | null; body: string; queue: boolean }) {
	const err = validateTelegramHtml(input.body) ?? (input.title ? validateTelegramHtml(input.title) : null);
	if (err) throw new BadRequest(err, 'body');
	if (input.title && input.title.length > 200) throw new BadRequest('Title is too long (max 200 chars)', 'title');
	if (input.body.length > 3800) throw new BadRequest('Body is too long (max 3800 chars)', 'body');
	const id = await createBroadcast({ storeId, ...input });
	return { id };
}

/** Draft → queued. Status-only transition on a draft (no money involved). */
export async function queueDraft(id: number, storeId: number) {
	const [row] = await getDb()
		.select({ id: broadcasts.id })
		.from(broadcasts)
		.where(and(eq(broadcasts.id, id), eq(broadcasts.storeId, storeId), eq(broadcasts.status, 'draft')));
	if (!row) throw new BadRequest('Broadcast not found or is not a draft');
	await queueBroadcast(id);
	return { id };
}

export async function deleteDraft(id: number, storeId: number) {
	const [row] = await getDb()
		.delete(broadcasts)
		.where(and(eq(broadcasts.id, id), eq(broadcasts.storeId, storeId), eq(broadcasts.status, 'draft')))
		.returning({ id: broadcasts.id });
	if (!row) throw new BadRequest('Only drafts can be deleted');
	return row;
}

/** Stop a queued broadcast before the sender picks it up. */
export async function cancelQueued(id: number, storeId: number) {
	const [row] = await getDb()
		.update(broadcasts)
		.set({ status: 'failed', finishedAt: new Date() })
		.where(and(eq(broadcasts.id, id), eq(broadcasts.storeId, storeId), eq(broadcasts.status, 'queued')))
		.returning({ id: broadcasts.id });
	if (!row) throw new BadRequest('Only queued broadcasts can be cancelled');
	return row;
}
