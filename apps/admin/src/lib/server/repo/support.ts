import { getDb, stores, supportSessions, users } from '@tokobun/db';
import { and, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { parseListParams, toPage } from '#lib/paging.ts';
import { enumParam, escapeLike } from '../http';

export async function listSupport(storeId: number, sp: URLSearchParams) {
	const p = parseListParams(sp, { sortable: ['createdAt'] as const, defaultSort: 'createdAt' });
	const where: SQL[] = [eq(supportSessions.storeId, storeId)];
	const status = sp.get('status') === 'all' ? null : (enumParam(sp, 'status', ['open', 'closed'] as const) ?? 'open');
	if (status) where.push(eq(supportSessions.status, status));
	if (p.q) {
		const q = escapeLike(p.q.replace(/^@/, ''));
		const conds: SQL[] = [ilike(users.username, `%${q}%`)];
		if (/^\d+$/.test(q)) conds.push(eq(supportSessions.userId, Number(q)));
		where.push(or(...conds)!);
	}
	const cond = where.length ? and(...where) : undefined;
	const db = getDb();
	const [rows, [{ n } = { n: 0 }], counts, [store]] = await Promise.all([
		db
			.select({
				id: supportSessions.id,
				userId: supportSessions.userId,
				username: users.username,
				firstName: users.firstName,
				userThreadId: supportSessions.userThreadId,
				adminThreadId: supportSessions.adminThreadId,
				status: supportSessions.status,
				createdAt: supportSessions.createdAt,
				closedAt: supportSessions.closedAt
			})
			.from(supportSessions)
			.leftJoin(users, eq(users.id, supportSessions.userId))
			.where(cond)
			.orderBy(desc(supportSessions.createdAt))
			.limit(p.pageSize)
			.offset(p.offset),
		db.select({ n: sql<number>`count(*)::int` }).from(supportSessions).leftJoin(users, eq(users.id, supportSessions.userId)).where(cond),
		db.select({ status: supportSessions.status, n: sql<number>`count(*)::int` }).from(supportSessions).where(eq(supportSessions.storeId, storeId)).groupBy(supportSessions.status),
		db.select({ adminChatId: stores.adminChatId }).from(stores).where(eq(stores.id, storeId)).limit(1),
	]);
	return {
		...toPage(rows, n, p),
		counts: { open: counts.find((c) => c.status === 'open')?.n ?? 0, closed: counts.find((c) => c.status === 'closed')?.n ?? 0 },
		adminChatId: store?.adminChatId ?? null
	};
}
