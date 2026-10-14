import { settlePayment } from '@tokobun/core';
import { getDb, orders, payments, users } from '@tokobun/db';
import { and, asc, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { parseListParams, toPage } from '#lib/paging.ts';
import { BadRequest, enumParam, escapeLike } from '../http';
import { withFmt, type MoneyFmt } from '../money';
import { dateRange } from './orders';

export const PAYMENT_STATUSES = ['pending', 'paid', 'expired', 'failed', 'cancelled'] as const;
const SORTABLE = ['createdAt', 'amount', 'paidAt'] as const;

export async function listPayments(storeId: number, sp: URLSearchParams, fmt: MoneyFmt) {
	const p = parseListParams(sp, { sortable: SORTABLE, defaultSort: 'createdAt' });
	const where: SQL[] = [eq(payments.storeId, storeId)];
	if (p.q) {
		const q = escapeLike(p.q.replace(/^@/, ''));
		const conds: SQL[] = [ilike(payments.code, `%${q}%`), ilike(payments.providerRef, `%${q}%`), ilike(users.username, `%${q}%`)];
		if (/^\d+$/.test(q)) conds.push(eq(payments.userId, Number(q)));
		where.push(or(...conds)!);
	}
	const status = enumParam(sp, 'status', PAYMENT_STATUSES);
	if (status) where.push(eq(payments.status, status));
	const purpose = enumParam(sp, 'purpose', ['topup', 'order'] as const);
	if (purpose) where.push(eq(payments.purpose, purpose));
	const provider = sp.get('provider')?.slice(0, 32);
	if (provider) where.push(eq(payments.provider, provider));
	const userId = sp.get('userId');
	if (userId && /^\d+$/.test(userId)) where.push(eq(payments.userId, Number(userId)));
	where.push(...dateRange(sp, payments.createdAt));
	const cond = where.length ? and(...where) : undefined;
	const sortCol = { createdAt: payments.createdAt, amount: payments.amount, paidAt: payments.paidAt }[p.sort];
	const db = getDb();
	const [rows, [{ n } = { n: 0 }], providers] = await Promise.all([
		db
			.select({
				id: payments.id,
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
				createdAt: payments.createdAt,
				paidAt: payments.paidAt
			})
			.from(payments)
			.leftJoin(users, eq(users.id, payments.userId))
			.where(cond)
			.orderBy(p.dir === 'asc' ? asc(sortCol) : sql`${sortCol} desc nulls last`, desc(payments.id))
			.limit(p.pageSize)
			.offset(p.offset),
		db.select({ n: sql<number>`count(*)::int` }).from(payments).leftJoin(users, eq(users.id, payments.userId)).where(cond),
		db.selectDistinct({ provider: payments.provider }).from(payments)
	]);
	return {
		...toPage(
			rows.map((r) => withFmt(fmt, r, ['amount', 'fee'])),
			n,
			p
		),
		providers: providers.map((r) => r.provider)
	};
}

export async function getPaymentAdmin(id: number, storeId: number, fmt: MoneyFmt) {
	const [row] = await getDb()
		.select({ p: payments, username: users.username, orderCode: orders.code, orderStatus: orders.status })
		.from(payments)
		.leftJoin(users, eq(users.id, payments.userId))
		.leftJoin(orders, eq(orders.id, payments.orderId))
		.where(and(eq(payments.id, id), eq(payments.storeId, storeId)))
		.limit(1);
	if (!row) return null;
	return { ...withFmt(fmt, row.p, ['amount', 'fee']), username: row.username, orderCode: row.orderCode, orderStatus: row.orderStatus };
}

/** Manual "mark paid": goes through core settlePayment (idempotent, credits wallet / delivers order). */
export async function markPaid(id: number, storeId: number, fmt: MoneyFmt) {
	const [p] = await getDb().select({ status: payments.status }).from(payments).where(and(eq(payments.id, id), eq(payments.storeId, storeId)));
	if (!p) throw new BadRequest('Payment not found');
	const res = await settlePayment(id);
	return {
		alreadySettled: res.alreadySettled,
		purpose: res.purpose,
		credited: res.credited,
		creditedFmt: fmt(res.credited),
		orderCode: res.order?.code ?? null,
		orderStatus: res.order?.status ?? null,
		referral: res.referral
	};
}
