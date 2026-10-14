import { cancelPendingOrder, getOrder, refundOrder } from '@tokobun/core';
import { getDb, orders, payments, products, stockItems, users, vouchers } from '@tokobun/db';
import { and, asc, desc, eq, gte, ilike, lt, or, sql, type SQL } from 'drizzle-orm';
import { parseListParams, toPage } from '#lib/paging.ts';
import { BadRequest, enumParam, escapeLike } from '../http';
import { withFmt, type MoneyFmt } from '../money';

export const ORDER_STATUSES = ['pending_payment', 'completed', 'cancelled', 'refunded'] as const;
const SORTABLE = ['createdAt', 'total', 'quantity'] as const;

export function dateRange(sp: URLSearchParams, col: Parameters<typeof gte>[0]): SQL[] {
	const out: SQL[] = [];
	const from = sp.get('from');
	const to = sp.get('to');
	if (from && !Number.isNaN(Date.parse(from))) out.push(gte(col, new Date(from)));
	if (to && !Number.isNaN(Date.parse(to))) {
		const end = new Date(to);
		if (/^\d{4}-\d{2}-\d{2}$/.test(to)) end.setUTCDate(end.getUTCDate() + 1); // inclusive day
		out.push(lt(col, end));
	}
	return out;
}

export async function listOrders(storeId: number, sp: URLSearchParams, fmt: MoneyFmt) {
	const p = parseListParams(sp, { sortable: SORTABLE, defaultSort: 'createdAt' });
	const where: SQL[] = [eq(orders.storeId, storeId)];
	if (p.q) {
		const q = escapeLike(p.q.replace(/^@/, ''));
		const conds: SQL[] = [ilike(orders.code, `%${q}%`), ilike(users.username, `%${q}%`), ilike(orders.productName, `%${q}%`)];
		if (/^\d+$/.test(q)) conds.push(eq(orders.userId, Number(q)));
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
	const cond = where.length ? and(...where) : undefined;
	const sortCol = { createdAt: orders.createdAt, total: orders.total, quantity: orders.quantity }[p.sort];
	const db = getDb();
	const [rows, [{ n } = { n: 0 }]] = await Promise.all([
		db
			.select({
				id: orders.id,
				code: orders.code,
				userId: orders.userId,
				username: users.username,
				productId: orders.productId,
				productName: orders.productName,
				quantity: orders.quantity,
				total: orders.total,
				status: orders.status,
				paidWith: orders.paidWith,
				createdAt: orders.createdAt
			})
			.from(orders)
			.leftJoin(users, eq(users.id, orders.userId))
			.where(cond)
			.orderBy(p.dir === 'asc' ? asc(sortCol) : desc(sortCol), desc(orders.id))
			.limit(p.pageSize)
			.offset(p.offset),
		db.select({ n: sql<number>`count(*)::int` }).from(orders).leftJoin(users, eq(users.id, orders.userId)).where(cond)
	]);
	return toPage(
		rows.map((r) => withFmt(fmt, r, ['total'])),
		n,
		p
	);
}

export async function getOrderAdmin(id: number, storeId: number, fmt: MoneyFmt) {
	const db = getDb();
	const [row] = await db
		.select({
			o: orders,
			username: users.username,
			firstName: users.firstName,
			voucherCode: vouchers.code,
			paymentCode: payments.code,
			paymentStatus: payments.status,
			productUnlimited: products.unlimited,
			productUnlimitedContent: products.unlimitedContent,
			warranty: products.warranty
		})
		.from(orders)
		.leftJoin(users, eq(users.id, orders.userId))
		.leftJoin(vouchers, eq(vouchers.id, orders.voucherId))
		.leftJoin(payments, eq(payments.id, orders.paymentId))
		.leftJoin(products, eq(products.id, orders.productId))
		.where(and(eq(orders.id, id), eq(orders.storeId, storeId)))
		.limit(1);
	if (!row) return null;

	const itemsP = getOrder(id, null).then(
		(o) => ({ items: o?.items ?? [], source: 'core' as const }),
		async () => {
			const rows = await db
				.select({ content: stockItems.content })
				.from(stockItems)
				.where(and(eq(stockItems.orderId, id), eq(stockItems.status, 'sold')))
				.orderBy(asc(stockItems.id));
			let items = rows.map((r) => r.content);
			if (!items.length && row.o.status === 'completed' && row.productUnlimited && row.productUnlimitedContent) {
				items = Array.from({ length: row.o.quantity }, () => row.productUnlimitedContent!);
			}
			return { items, source: 'stock' as const };
		},
	);
	const reservedP = db
		.select({ n: sql<number>`count(*)::int` })
		.from(stockItems)
		.where(and(eq(stockItems.orderId, id), eq(stockItems.status, 'reserved')));
	const [{ items, source: itemsSource }, reserved] = await Promise.all([itemsP, reservedP]);
	return {
		...withFmt(fmt, row.o, ['unitPrice', 'subtotal', 'discountAmount', 'voucherDiscount', 'total']),
		username: row.username,
		firstName: row.firstName,
		voucherCode: row.voucherCode,
		paymentCode: row.paymentCode,
		paymentStatus: row.paymentStatus,
		warranty: row.warranty,
		items,
		itemsSource,
		reservedCount: reserved[0]?.n ?? 0
	};
}

export async function refund(id: number, storeId: number, note: string | null) {
	const [o] = await getDb().select({ status: orders.status }).from(orders).where(and(eq(orders.id, id), eq(orders.storeId, storeId)));
	if (!o) throw new BadRequest('Order not found');
	if (o.status !== 'completed') throw new BadRequest(`Only completed orders can be refunded (this one is ${o.status})`);
	const res = await refundOrder(id, note ?? undefined);
	return { ok: true, status: res.status };
}

/** Cancel a pending direct-pay order (releases reserved stock) via core. */
export async function cancelPending(id: number, storeId: number) {
	const [o] = await getDb().select({ id: orders.id }).from(orders).where(and(eq(orders.id, id), eq(orders.storeId, storeId)));
	if (!o) throw new BadRequest('Order not found');
	const cancelled = await cancelPendingOrder(id);
	if (!cancelled) throw new BadRequest('Only orders waiting for payment can be cancelled');
	return { ok: true };
}
