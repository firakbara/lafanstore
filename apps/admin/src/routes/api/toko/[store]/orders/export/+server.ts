import { getDb, orders, users } from '@tokobun/db';
import { and, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import { endpoint, enumParam, escapeCsv, escapeLike } from '#lib/server/http.ts';
import { moneyFormatter } from '#lib/server/money.ts';
import { ORDER_STATUSES, dateRange } from '#lib/server/repo/orders.ts';

export const GET = endpoint(async ({ url, locals }) => {
	const sp = url.searchParams;
	const fmt = await moneyFormatter(locals.storeId, locals.currency);
	const where: SQL[] = [eq(orders.storeId, locals.storeId)];
	const q = sp.get('q')?.trim();
	if (q) {
		const s = escapeLike(q.replace(/^@/, ''));
		const conds: SQL[] = [ilike(orders.code, `%${s}%`), ilike(users.username, `%${s}%`), ilike(orders.productName, `%${s}%`)];
		if (/^\d+$/.test(s)) conds.push(eq(orders.userId, Number(s)));
		where.push(or(...conds)!);
	}
	const status = enumParam(sp, 'status', ORDER_STATUSES);
	if (status) where.push(eq(orders.status, status));
	const userId = sp.get('userId');
	if (userId && /^\d+$/.test(userId)) where.push(eq(orders.userId, Number(userId)));
	const productId = sp.get('productId');
	if (productId && /^\d+$/.test(productId)) where.push(eq(orders.productId, Number(productId)));
	const paidWith = sp.get('paidWith');
	if (paidWith === 'balance' || paidWith === 'payment') where.push(eq(orders.paidWith, paidWith));
	where.push(...dateRange(sp, orders.createdAt));
	const cond = and(...where);

	const rows = await getDb()
		.select({
			code: orders.code,
			userId: orders.userId,
			username: users.username,
			productName: orders.productName,
			quantity: orders.quantity,
			unitPrice: orders.unitPrice,
			subtotal: orders.subtotal,
			discountAmount: orders.discountAmount,
			voucherDiscount: orders.voucherDiscount,
			total: orders.total,
			status: orders.status,
			paidWith: orders.paidWith,
			createdAt: orders.createdAt,
		})
		.from(orders)
		.leftJoin(users, eq(users.id, orders.userId))
		.where(cond)
		.orderBy(desc(orders.createdAt))
		.limit(10_000);

	const header = 'Code,User ID,Username,Product,Qty,Unit Price,Subtotal,Discount,Voucher Discount,Total,Status,Paid With,Created At';
	const lines = rows.map((r) =>
		[
			r.code,
			r.userId,
			escapeCsv(r.username ?? ''),
			escapeCsv(r.productName),
			r.quantity,
			escapeCsv(fmt(r.unitPrice)),
			escapeCsv(fmt(r.subtotal)),
			escapeCsv(fmt(r.discountAmount)),
			escapeCsv(fmt(r.voucherDiscount)),
			escapeCsv(fmt(r.total)),
			r.status,
			r.paidWith,
			r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
		].join(','),
	);

	const csv = '﻿' + [header, ...lines].join('\n');
	const date = new Date().toISOString().slice(0, 10);
	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="orders-${date}.csv"`,
			'Cache-Control': 'no-store',
		},
	});
});
