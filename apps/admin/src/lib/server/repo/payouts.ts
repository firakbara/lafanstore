// Referral cash-withdraw requests. These rows are referral bookkeeping, not wallet money:
// available = earned - transferred - withdrawn(pending|done). Approving marks the request 'done' (admin paid
// out-of-band); rejecting marks it 'rejected', which stops counting it against `available`, so the user keeps it.
import { resolveReferralPayout } from '@tokobun/core';
import { getDb, orders, referralPayouts, users } from '@tokobun/db';
import { and, asc, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { parseListParams, toPage } from '#lib/paging.ts';
import { BadRequest, enumParam, escapeLike } from '../http';
import { withFmt, type MoneyFmt } from '../money';
import { referralSummary } from './users';

export async function listPayouts(sp: URLSearchParams, storeId: number, fmt: MoneyFmt) {
	const p = parseListParams(sp, { sortable: ['createdAt', 'amount'] as const, defaultSort: 'createdAt', defaultDir: 'asc' });
	const storeFilter = sql`exists (select 1 from orders o2 where o2.user_id = ${referralPayouts.userId} and o2.store_id = ${storeId})`;
	const where: SQL[] = [eq(referralPayouts.kind, enumParam(sp, 'kind', ['withdraw', 'transfer'] as const) ?? 'withdraw'), storeFilter];
	const status = sp.get('status') === 'all' ? null : (enumParam(sp, 'status', ['pending', 'done', 'rejected'] as const) ?? 'pending');
	if (status) where.push(eq(referralPayouts.status, status));
	if (p.q) {
		const q = escapeLike(p.q.replace(/^@/, ''));
		const conds: SQL[] = [ilike(users.username, `%${q}%`)];
		if (/^\d+$/.test(q)) conds.push(eq(referralPayouts.userId, Number(q)));
		where.push(or(...conds)!);
	}
	const cond = and(...where);
	const sortCol = p.sort === 'amount' ? referralPayouts.amount : referralPayouts.createdAt;
	const db = getDb();
	const [rows, [{ n } = { n: 0 }], [pending]] = await Promise.all([
		db
			.select({
				id: referralPayouts.id,
				userId: referralPayouts.userId,
				username: users.username,
				amount: referralPayouts.amount,
				kind: referralPayouts.kind,
				status: referralPayouts.status,
				note: referralPayouts.note,
				createdAt: referralPayouts.createdAt
			})
			.from(referralPayouts)
			.leftJoin(users, eq(users.id, referralPayouts.userId))
			.where(cond)
			.orderBy(p.dir === 'asc' ? asc(sortCol) : desc(sortCol), asc(referralPayouts.id))
			.limit(p.pageSize)
			.offset(p.offset),
		db.select({ n: sql<number>`count(*)::int` }).from(referralPayouts).leftJoin(users, eq(users.id, referralPayouts.userId)).where(cond),
		db
			.select({ n: sql<number>`count(*)::int`, sum: sql<number>`coalesce(sum(${referralPayouts.amount}),0)::bigint` })
			.from(referralPayouts)
			.where(and(eq(referralPayouts.kind, 'withdraw'), eq(referralPayouts.status, 'pending'), sql`exists (select 1 from orders o3 where o3.user_id = ${referralPayouts.userId} and o3.store_id = ${storeId})`))
	]);
	return {
		...toPage(
			rows.map((r) => withFmt(fmt, r, ['amount'])),
			n,
			p
		),
		pending: { count: pending?.n ?? 0, sum: Number(pending?.sum ?? 0), sumFmt: fmt(Number(pending?.sum ?? 0)) }
	};
}

export async function decidePayout(id: number, storeId: number, decision: 'approve' | 'reject', reason: string | null, admin: string, fmt: MoneyFmt) {
	const db = getDb();
	const [row] = await db
		.select({ userId: referralPayouts.userId, kind: referralPayouts.kind, note: referralPayouts.note })
		.from(referralPayouts)
		.where(eq(referralPayouts.id, id));
	if (!row || row.kind !== 'withdraw') throw new BadRequest('Withdraw request not found');
	const [inStore] = await db.select({ n: sql<number>`1` }).from(orders)
		.where(and(eq(orders.userId, row.userId), eq(orders.storeId, storeId))).limit(1);
	if (!inStore) throw new BadRequest('Withdraw request not found');
	const when = new Date().toISOString().slice(0, 16).replace('T', ' ');
	const stamp = `[${decision === 'approve' ? 'approved' : 'rejected'} by ${admin} ${when}]`;
	const note = [row.note, stamp, reason].filter(Boolean).join(' ');
	// Core locks the row and only resolves pending requests (prevents double handling).
	await resolveReferralPayout(id, decision === 'approve' ? 'done' : 'rejected', note);
	const summary = await referralSummary(row.userId);
	return { id, userId: row.userId, status: decision === 'approve' ? 'done' : 'rejected', availableAfter: summary.available, availableAfterFmt: fmt(summary.available) };
}
