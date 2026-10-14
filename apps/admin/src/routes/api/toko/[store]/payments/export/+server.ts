import { getDb, payments, users } from '@tokobun/db';
import { and, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { endpoint, enumParam, escapeCsv, escapeLike } from '#lib/server/http.ts';
import { moneyFormatter } from '#lib/server/money.ts';
import { PAYMENT_STATUSES } from '#lib/server/repo/payments.ts';
import { dateRange } from '#lib/server/repo/orders.ts';

export const GET = endpoint(async ({ url, locals }) => {
	const sp = url.searchParams;
	const fmt = await moneyFormatter(locals.storeId, locals.currency);
	const where: SQL[] = [eq(payments.storeId, locals.storeId)];
	const q = sp.get('q')?.trim();
	if (q) {
		const s = escapeLike(q.replace(/^@/, ''));
		const conds: SQL[] = [ilike(payments.code, `%${s}%`), ilike(payments.providerRef, `%${s}%`), ilike(users.username, `%${s}%`)];
		if (/^\d+$/.test(s)) conds.push(eq(payments.userId, Number(s)));
		where.push(or(...conds)!);
	}
	const status = enumParam(sp, 'status', PAYMENT_STATUSES);
	if (status) where.push(eq(payments.status, status));
	const purpose = sp.get('purpose');
	if (purpose === 'topup' || purpose === 'order') where.push(eq(payments.purpose, purpose));
	const provider = sp.get('provider');
	if (provider) where.push(eq(payments.provider, provider));
	const userId = sp.get('userId');
	if (userId && /^\d+$/.test(userId)) where.push(eq(payments.userId, Number(userId)));
	where.push(...dateRange(sp, payments.createdAt));
	const cond = and(...where);

	const rows = await getDb()
		.select({
			code: payments.code,
			userId: payments.userId,
			username: users.username,
			purpose: payments.purpose,
			provider: payments.provider,
			method: payments.method,
			amount: payments.amount,
			fee: payments.fee,
			payCurrency: payments.payCurrency,
			payAmount: payments.payAmount,
			status: payments.status,
			providerRef: payments.providerRef,
			createdAt: payments.createdAt,
			paidAt: payments.paidAt,
		})
		.from(payments)
		.leftJoin(users, eq(users.id, payments.userId))
		.where(cond)
		.orderBy(desc(payments.createdAt))
		.limit(10_000);

	const header = 'Code,User ID,Username,Purpose,Provider,Method,Amount,Fee,Pay Currency,Pay Amount,Status,Provider Ref,Created At,Paid At';
	const lines = rows.map((r) =>
		[
			r.code,
			r.userId,
			escapeCsv(r.username ?? ''),
			r.purpose,
			r.provider,
			escapeCsv(r.method),
			escapeCsv(fmt(r.amount)),
			escapeCsv(fmt(r.fee)),
			r.payCurrency,
			escapeCsv(r.payAmount),
			r.status,
			escapeCsv(r.providerRef ?? ''),
			r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
			r.paidAt instanceof Date ? r.paidAt.toISOString() : (r.paidAt ?? ''),
		].join(','),
	);

	const csv = '﻿' + [header, ...lines].join('\n');
	const date = new Date().toISOString().slice(0, 10);
	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="payments-${locals.store!.slug}-${date}.csv"`,
			'Cache-Control': 'no-store',
		},
	});
});
