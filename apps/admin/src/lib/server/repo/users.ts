import { applyLedger, listLedger, setBanned } from '@tokobun/core';
import { getDb, ledgerEntries, orders, payments, referralEarnings, referralPayouts, users } from '@tokobun/db';
import { and, asc, desc, eq, ilike, ne, or, sql, type SQL } from 'drizzle-orm';
import { parseListParams, toPage } from '#lib/paging.ts';
import { BadRequest, escapeLike } from '../http';
import { withFmt, type MoneyFmt } from '../money';

const SORTABLE = ['createdAt', 'balance', 'lastSeenAt', 'id'] as const;

export async function listUsers(sp: URLSearchParams, storeId: number, fmt: MoneyFmt) {
	const p = parseListParams(sp, { sortable: SORTABLE, defaultSort: 'createdAt' });
	const storeFilter = sql`exists (
		select 1 from orders o2 where o2.user_id = "users"."id" and o2.store_id = ${storeId}
		union all
		select 1 from payments p2 where p2.user_id = "users"."id" and p2.store_id = ${storeId}
	)`;
	const where: SQL[] = [storeFilter];
	if (p.q) {
		const q = escapeLike(p.q.replace(/^@/, ''));
		const conds: SQL[] = [ilike(users.username, `%${q}%`), ilike(users.firstName, `%${q}%`), ilike(users.referralCode, q)];
		if (/^\d+$/.test(q)) conds.push(eq(users.id, Number(q)));
		where.push(or(...conds)!);
	}
	const banned = sp.get('banned');
	if (banned === 'true' || banned === 'false') where.push(eq(users.isBanned, banned === 'true'));
	if (sp.get('hasBalance') === 'true') where.push(sql`${users.balance} > 0`);
	const cond = and(...where);
	const sortCol = { createdAt: users.createdAt, balance: users.balance, lastSeenAt: users.lastSeenAt, id: users.id }[p.sort];
	const db = getDb();
	const orderCount = sql<number>`(select count(*)::int from orders o where o.user_id = "users"."id" and o.store_id = ${storeId} and o.status = 'completed')`;
	const [rows, [{ n } = { n: 0 }]] = await Promise.all([
		db
			.select({
				id: users.id,
				username: users.username,
				firstName: users.firstName,
				language: users.language,
				currency: users.currency,
				balance: users.balance,
				isBanned: users.isBanned,
				blockedBot: users.blockedBot,
				orderCount,
				createdAt: users.createdAt,
				lastSeenAt: users.lastSeenAt
			})
			.from(users)
			.where(cond)
			.orderBy(p.dir === 'asc' ? asc(sortCol) : desc(sortCol), desc(users.id))
			.limit(p.pageSize)
			.offset(p.offset),
		db.select({ n: sql<number>`count(*)::int` }).from(users).where(cond)
	]);
	return toPage(
		rows.map((r) => withFmt(fmt, r, ['balance'])),
		n,
		p
	);
}

export async function referralSummary(userId: number) {
	const db = getDb();
	const [[earned], payouts, [{ n: referred } = { n: 0 }]] = await Promise.all([
		db.select({ v: sql<number>`coalesce(sum(${referralEarnings.amount}), 0)::bigint` })
			.from(referralEarnings).where(eq(referralEarnings.referrerId, userId)),
		db.select({ kind: referralPayouts.kind, v: sql<number>`coalesce(sum(${referralPayouts.amount}), 0)::bigint` })
			.from(referralPayouts).where(and(eq(referralPayouts.userId, userId), ne(referralPayouts.status, 'rejected'))).groupBy(referralPayouts.kind),
		db.select({ n: sql<number>`count(*)::int` }).from(users).where(eq(users.referredBy, userId)),
	]);
	const e = Number(earned?.v ?? 0);
	const transferred = Number(payouts.find((x) => x.kind === 'transfer')?.v ?? 0);
	const withdrawn = Number(payouts.find((x) => x.kind === 'withdraw')?.v ?? 0);
	return { earned: e, transferred, withdrawn, available: e - transferred - withdrawn, referred };
}

export async function getUserAdmin(id: number, storeId: number, fmt: MoneyFmt) {
	const db = getDb();
	const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
	if (!u) return null;
	const [[stats], [topups], [ledgerSum], referrer, ref] = await Promise.all([
		db.select({
			orders: sql<number>`count(*) filter (where ${orders.status} = 'completed')::int`,
			spent: sql<number>`coalesce(sum(${orders.total}) filter (where ${orders.status} = 'completed'), 0)::bigint`,
			refunded: sql<number>`count(*) filter (where ${orders.status} = 'refunded')::int`
		}).from(orders).where(and(eq(orders.userId, id), eq(orders.storeId, storeId))),
		db.select({
			count: sql<number>`count(*)::int`,
			sum: sql<number>`coalesce(sum(${payments.amount}), 0)::bigint`
		}).from(payments).where(and(eq(payments.userId, id), eq(payments.purpose, 'topup'), eq(payments.status, 'paid'), eq(payments.storeId, storeId))),
		db.select({ v: sql<number>`coalesce(sum(${ledgerEntries.amount}), 0)::bigint` })
			.from(ledgerEntries).where(eq(ledgerEntries.userId, id)),
		u.referredBy
			? db.select({ id: users.id, username: users.username }).from(users).where(eq(users.id, u.referredBy)).then(([r]) => r ?? null)
			: Promise.resolve(null),
		referralSummary(id),
	]);
	const spent = Number(stats?.spent ?? 0);
	const topupSum = Number(topups?.sum ?? 0);
	const ledgerTotal = Number(ledgerSum?.v ?? 0);
	return {
		...withFmt(fmt, u, ['balance']),
		referrer,
		stats: {
			orders: stats?.orders ?? 0,
			refunded: stats?.refunded ?? 0,
			spent,
			topups: topups?.count ?? 0,
			topupSum,
			ledgerTotal,
			ledgerConsistent: ledgerTotal === u.balance
		},
		referral: ref,
		fmtStats: {
			spent: fmt(spent),
			topupSum: fmt(topupSum),
			earned: fmt(ref.earned),
			available: fmt(ref.available),
			withdrawn: fmt(ref.withdrawn),
			transferred: fmt(ref.transferred)
		}
	};
}

export async function userLedger(id: number, sp: URLSearchParams, fmt: MoneyFmt) {
	const p = parseListParams(sp, { sortable: ['createdAt'] as const, defaultSort: 'createdAt', defaultPageSize: 20 });
	try {
		const res = await listLedger(id, p.page, p.pageSize);
		return {
			items: res.items.map((e) => withFmt(fmt, e, ['amount', 'balanceAfter'])),
			total: res.total,
			page: res.page,
			pageSize: p.pageSize,
			totalPages: res.totalPages
		};
	} catch {
		// core not ready: read-only local query
		const db = getDb();
		const [rows, [{ n } = { n: 0 }]] = await Promise.all([
			db.select().from(ledgerEntries).where(eq(ledgerEntries.userId, id)).orderBy(desc(ledgerEntries.createdAt), desc(ledgerEntries.id)).limit(p.pageSize).offset(p.offset),
			db.select({ n: sql<number>`count(*)::int` }).from(ledgerEntries).where(eq(ledgerEntries.userId, id))
		]);
		return toPage(
			rows.map((e) => withFmt(fmt, e, ['amount', 'balanceAfter'])),
			n,
			p
		);
	}
}

/** Manual balance adjustment — always through core applyLedger (type 'adjustment'). */
export async function adjustBalance(userId: number, amount: number, note: string, adminUsername: string, fmt: MoneyFmt) {
	if (amount === 0) throw new BadRequest('Amount must not be zero', 'amount');
	const entry = await applyLedger({ userId, amount, type: 'adjustment', refType: 'admin', refId: adminUsername, note });
	return { entryId: entry.id, balanceAfter: entry.balanceAfter, balanceAfterFmt: fmt(entry.balanceAfter) };
}

export async function ban(userId: number, banned: boolean) {
	await setBanned(userId, banned);
	return { ok: true, isBanned: banned };
}
