import { getDb, products, voucherRedemptions, vouchers } from '@tokobun/db';
import { and, asc, desc, eq, ilike, sql, type SQL } from 'drizzle-orm';
import { parseListParams, toPage } from '#lib/paging.ts';
import { BadRequest, bool, escapeLike, int, oneOf, optDate, optInt, str } from '../http';
import { withFmt, type MoneyFmt } from '../money';

const SORTABLE = ['createdAt', 'code', 'usedCount', 'expiresAt'] as const;

export async function listVouchers(storeId: number, sp: URLSearchParams, fmt: MoneyFmt) {
	const p = parseListParams(sp, { sortable: SORTABLE, defaultSort: 'createdAt' });
	const where: SQL[] = [eq(vouchers.storeId, storeId)];
	if (p.q) where.push(ilike(vouchers.code, `%${escapeLike(p.q)}%`));
	const active = sp.get('active');
	if (active === 'true' || active === 'false') where.push(eq(vouchers.isActive, active === 'true'));
	const cond = and(...where);
	const sortCol = { createdAt: vouchers.createdAt, code: vouchers.code, usedCount: vouchers.usedCount, expiresAt: vouchers.expiresAt }[p.sort];
	const db = getDb();
	const [rows, [{ n } = { n: 0 }]] = await Promise.all([
		db
			.select({ v: vouchers, productName: products.name })
			.from(vouchers)
			.leftJoin(products, eq(products.id, vouchers.productId))
			.where(cond)
			.orderBy(p.dir === 'asc' ? asc(sortCol) : desc(sortCol), desc(vouchers.id))
			.limit(p.pageSize)
			.offset(p.offset),
		db.select({ n: sql<number>`count(*)::int` }).from(vouchers).where(cond)
	]);
	return toPage(
		rows.map((r) => ({
			...withFmt(fmt, r.v, ['minTotal']),
			productName: r.productName,
			valueFmt: r.v.kind === 'percent' ? `${r.v.value / 100}%` : fmt(r.v.value)
		})),
		n,
		p
	);
}

export function parseVoucherInput(body: Record<string, unknown>) {
	const code = str(body, 'code', { max: 32 }).toUpperCase();
	if (!/^[A-Z0-9_-]+$/.test(code)) throw new BadRequest('Code may only contain letters, digits, _ and -', 'code');
	const kind = oneOf(body, 'kind', ['percent', 'fixed'] as const);
	const value = int(body, 'value', { min: 1, max: kind === 'percent' ? 10000 : 100_000_000 });
	return {
		code,
		kind,
		value,
		minTotal: optInt(body, 'minTotal', { min: 0 }) ?? 0,
		maxUses: optInt(body, 'maxUses', { min: 1 }),
		perUserLimit: optInt(body, 'perUserLimit', { min: 1, max: 1000 }) ?? 1,
		productId: optInt(body, 'productId', { min: 1 }),
		expiresAt: optDate(body, 'expiresAt'),
		isActive: bool(body, 'isActive', true)
	};
}

export async function createVoucher(storeId: number, input: ReturnType<typeof parseVoucherInput>) {
	const [row] = await getDb().insert(vouchers).values({ ...input, storeId }).returning({ id: vouchers.id });
	return row;
}

export async function updateVoucher(id: number, storeId: number, input: ReturnType<typeof parseVoucherInput>) {
	const [row] = await getDb().update(vouchers).set(input).where(and(eq(vouchers.id, id), eq(vouchers.storeId, storeId))).returning({ id: vouchers.id });
	if (!row) throw new BadRequest('Voucher not found');
	return row;
}

export async function setVoucherActive(id: number, storeId: number, isActive: boolean) {
	const [row] = await getDb().update(vouchers).set({ isActive }).where(and(eq(vouchers.id, id), eq(vouchers.storeId, storeId))).returning({ id: vouchers.id });
	if (!row) throw new BadRequest('Voucher not found');
	return row;
}

export async function deleteVoucher(id: number, storeId: number) {
	const db = getDb();
	const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(voucherRedemptions).where(eq(voucherRedemptions.voucherId, id));
	if (n > 0) throw new BadRequest('This voucher has been redeemed — deactivate it instead of deleting');
	await db.delete(vouchers).where(and(eq(vouchers.id, id), eq(vouchers.storeId, storeId)));
	return { ok: true };
}
