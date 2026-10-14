import { broadcasts, getDb, orders, payments, products, referralPayouts, supportSessions, users } from '@tokobun/db';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { MoneyFmt } from '../money';
import { availableCount } from './products';

const LOW_STOCK_THRESHOLD = 5;

export async function dashboard(storeId: number, fmt: MoneyFmt) {
	const db = getDb();
	const windows = { today: sql`date_trunc('day', now())`, d7: sql`now() - interval '7 days'`, d30: sql`now() - interval '30 days'` };

	const [
		[orderStats], [topupStats], [userStats], lowStock, series,
		[pendingWithdraws], [openSupport], [activeBroadcasts], [pendingPayments],
	] = await Promise.all([
		db.select({
			revToday: sql<string>`coalesce(sum(${orders.total}) filter (where ${orders.completedAt} >= ${windows.today}), 0)`,
			rev7: sql<string>`coalesce(sum(${orders.total}) filter (where ${orders.completedAt} >= ${windows.d7}), 0)`,
			rev30: sql<string>`coalesce(sum(${orders.total}) filter (where ${orders.completedAt} >= ${windows.d30}), 0)`,
			ordToday: sql<number>`(count(*) filter (where ${orders.completedAt} >= ${windows.today}))::int`,
			ord7: sql<number>`(count(*) filter (where ${orders.completedAt} >= ${windows.d7}))::int`,
			ord30: sql<number>`(count(*) filter (where ${orders.completedAt} >= ${windows.d30}))::int`
		}).from(orders).where(and(eq(orders.storeId, storeId), eq(orders.status, 'completed'), sql`${orders.completedAt} >= ${windows.d30}`)),

		db.select({
			today: sql<string>`coalesce(sum(${payments.amount}) filter (where ${payments.paidAt} >= ${windows.today}), 0)`,
			d7: sql<string>`coalesce(sum(${payments.amount}) filter (where ${payments.paidAt} >= ${windows.d7}), 0)`,
			d30: sql<string>`coalesce(sum(${payments.amount}) filter (where ${payments.paidAt} >= ${windows.d30}), 0)`,
			cToday: sql<number>`(count(*) filter (where ${payments.paidAt} >= ${windows.today}))::int`,
			c7: sql<number>`(count(*) filter (where ${payments.paidAt} >= ${windows.d7}))::int`,
			c30: sql<number>`(count(*) filter (where ${payments.paidAt} >= ${windows.d30}))::int`
		}).from(payments).where(and(eq(payments.storeId, storeId), eq(payments.purpose, 'topup'), eq(payments.status, 'paid'), sql`${payments.paidAt} >= ${windows.d30}`)),

		db.execute<{
			total: number; today: number; d7: number; d30: number; walletTotal: string;
		}>(sql`
			select count(distinct u.id)::int as "total",
			       (count(distinct u.id) filter (where u.created_at >= ${windows.today}))::int as "today",
			       (count(distinct u.id) filter (where u.created_at >= ${windows.d7}))::int as "d7",
			       (count(distinct u.id) filter (where u.created_at >= ${windows.d30}))::int as "d30",
			       coalesce(sum(u.balance), 0)::bigint as "walletTotal"
			from users u
			where exists (select 1 from orders o where o.user_id = u.id and o.store_id = ${storeId})
			   or exists (select 1 from payments p where p.user_id = u.id and p.store_id = ${storeId})
		`).then(rows => [Array.from(rows as Iterable<any>)[0]]),

		db.select({ id: products.id, name: products.name, code: products.code, stock: availableCount })
			.from(products)
			.where(and(eq(products.storeId, storeId), eq(products.isActive, true), eq(products.isCollection, false), eq(products.unlimited, false), sql`${availableCount} <= ${LOW_STOCK_THRESHOLD}`))
			.orderBy(asc(availableCount), asc(products.name))
			.limit(15),

		db.execute<{ day: string; revenue: string; orders: number }>(sql`
			select to_char(d.day, 'YYYY-MM-DD') as day,
			       coalesce(sum(o.total), 0)::bigint as revenue,
			       count(o.id)::int as orders
			from generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') as d(day)
			left join orders o on o.store_id = ${storeId} and o.status = 'completed' and o.completed_at >= d.day and o.completed_at < d.day + interval '1 day'
			group by d.day order by d.day`),

		db.select({ n: sql<number>`count(*)::int` }).from(referralPayouts).where(and(
			eq(referralPayouts.kind, 'withdraw'),
			eq(referralPayouts.status, 'pending'),
			sql`exists (select 1 from orders o where o.user_id = ${referralPayouts.userId} and o.store_id = ${storeId})`,
		)),
		db.select({ n: sql<number>`count(*)::int` }).from(supportSessions).where(and(eq(supportSessions.storeId, storeId), eq(supportSessions.status, 'open'))),
		db.select({ n: sql<number>`count(*)::int` }).from(broadcasts).where(and(eq(broadcasts.storeId, storeId), sql`${broadcasts.status} in ('queued','sending')`)),
		db.select({ n: sql<number>`count(*)::int` }).from(payments).where(and(eq(payments.storeId, storeId), eq(payments.status, 'pending'))),
	]);

	const n = (v: string | number | undefined) => Number(v ?? 0);
	const money = (v: string | number | undefined) => ({ cents: n(v), fmt: fmt(n(v)) });
	const seriesRows = Array.from(series as Iterable<{ day: string; revenue: string; orders: number }>);
	return {
		revenue: { today: money(orderStats?.revToday), d7: money(orderStats?.rev7), d30: money(orderStats?.rev30) },
		orders: { today: orderStats?.ordToday ?? 0, d7: orderStats?.ord7 ?? 0, d30: orderStats?.ord30 ?? 0 },
		topups: {
			today: money(topupStats?.today),
			d7: money(topupStats?.d7),
			d30: money(topupStats?.d30),
			count: { today: topupStats?.cToday ?? 0, d7: topupStats?.c7 ?? 0, d30: topupStats?.c30 ?? 0 }
		},
		users: { total: userStats?.total ?? 0, today: userStats?.today ?? 0, d7: userStats?.d7 ?? 0, d30: userStats?.d30 ?? 0, wallet: money(userStats?.walletTotal) },
		lowStock,
		lowStockThreshold: LOW_STOCK_THRESHOLD,
		series: seriesRows.map((r) => ({ day: r.day, revenue: n(r.revenue), revenueFmt: fmt(n(r.revenue)), orders: Number(r.orders) })),
		attention: {
			pendingWithdraws: pendingWithdraws?.n ?? 0,
			openSupport: openSupport?.n ?? 0,
			activeBroadcasts: activeBroadcasts?.n ?? 0,
			pendingPayments: pendingPayments?.n ?? 0
		}
	};
}
