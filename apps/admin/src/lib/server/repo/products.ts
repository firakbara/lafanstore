import { getDb, orders, productDiscounts, products } from '@tokobun/db';
import { and, asc, desc, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm';
import { parseListParams, toPage } from '#lib/paging.ts';
import { BadRequest, bool, escapeLike, int, optInt, optStr, str } from '../http';
import type { MoneyFmt } from '../money';
import { withFmt } from '../money';

const SORTABLE = ['sortOrder', 'name', 'price', 'createdAt', 'stock'] as const;

const P_ID = sql.raw('"products"."id"');
const P_PARENT = sql.raw('"products"."parent_id"');
// Correlated subqueries reference the outer row explicitly: drizzle renders single-table columns unqualified.
export const availableCount = sql<number>`(select count(*)::int from stock_items si where si.product_id = ${P_ID} and si.status = 'available')`;
const variantCount = sql<number>`(select count(*)::int from products v where v.parent_id = ${P_ID})`;
const variantStock = sql<number | null>`(
  select case when bool_or(v.unlimited) then null else count(s.id)::int end
  from products v left join stock_items s on s.product_id = v.id and s.status = 'available'
  where v.parent_id = ${P_ID})`;
const tierCount = sql<number>`(select count(*)::int from product_discounts pd where pd.product_id = ${P_ID})`;
const parentName = sql<string | null>`(select p2.name from products p2 where p2.id = ${P_PARENT})`;

export async function listProducts(storeId: number, sp: URLSearchParams, fmt: MoneyFmt) {
	const p = parseListParams(sp, { sortable: SORTABLE, defaultSort: 'sortOrder', defaultDir: 'asc' });
	const where: SQL[] = [eq(products.storeId, storeId)];
	if (p.q) { const q = escapeLike(p.q); where.push(or(ilike(products.name, `%${q}%`), ilike(products.code, `%${q}%`))!); }
	const parent = sp.get('parent');
	if (parent === 'top') where.push(isNull(products.parentId));
	else if (parent && /^\d+$/.test(parent)) where.push(eq(products.parentId, Number(parent)));
	const active = sp.get('active');
	if (active === 'true' || active === 'false') where.push(eq(products.isActive, active === 'true'));
	if (sp.get('kind') === 'collection') where.push(eq(products.isCollection, true));
	if (sp.get('kind') === 'sellable') where.push(eq(products.isCollection, false));
	const cond = and(...where);

	const sortCol = {
		sortOrder: products.sortOrder,
		name: products.name,
		price: products.price,
		createdAt: products.createdAt,
		stock: availableCount
	}[p.sort];
	const dirFn = p.dir === 'asc' ? asc : desc;
	const db = getDb();
	const [rows, [{ n } = { n: 0 }]] = await Promise.all([
		db
			.select({
				id: products.id,
				code: products.code,
				name: products.name,
				icon: products.icon,
				customEmojiId: products.customEmojiId,
				price: products.price,
				parentId: products.parentId,
				parentName,
				isCollection: products.isCollection,
				unlimited: products.unlimited,
				isActive: products.isActive,
				sortOrder: products.sortOrder,
				stock: availableCount,
				variantCount,
				variantStock,
				tierCount,
				createdAt: products.createdAt
			})
			.from(products)
			.where(cond)
			.orderBy(dirFn(sortCol), asc(products.id))
			.limit(p.pageSize)
			.offset(p.offset),
		db.select({ n: sql<number>`count(*)::int` }).from(products).where(cond)
	]);
	return toPage(
		rows.map((r) => withFmt(fmt, r, ['price'])),
		n,
		p
	);
}

/** Small list for selects (parent picker, voucher product, stock product picker). */
export async function productOptions(storeId: number, opts: { collectionsOnly?: boolean; sellableOnly?: boolean } = {}) {
	const where: SQL[] = [eq(products.storeId, storeId)];
	if (opts.collectionsOnly) where.push(eq(products.isCollection, true));
	if (opts.sellableOnly) where.push(eq(products.isCollection, false));
	return getDb()
		.select({
			id: products.id,
			code: products.code,
			name: products.name,
			parentName,
			isCollection: products.isCollection,
			unlimited: products.unlimited,
			stock: availableCount
		})
		.from(products)
		.where(and(...where))
		.orderBy(asc(products.sortOrder), asc(products.name))
		.limit(1000);
}

export async function getProductAdmin(id: number, storeId: number, fmt: MoneyFmt) {
	const db = getDb();
	const [row] = await db
		.select({ p: products, stock: availableCount, parentName })
		.from(products)
		.where(and(eq(products.id, id), eq(products.storeId, storeId)))
		.limit(1);
	if (!row) return null;
	const [discounts, variants, [{ n: orderCount } = { n: 0 }]] = await Promise.all([
		db
			.select({ minQty: productDiscounts.minQty, percentBp: productDiscounts.percentBp })
			.from(productDiscounts)
			.where(eq(productDiscounts.productId, id))
			.orderBy(asc(productDiscounts.minQty)),
		db
			.select({ id: products.id, code: products.code, name: products.name, price: products.price, isActive: products.isActive, unlimited: products.unlimited, stock: availableCount, sortOrder: products.sortOrder })
			.from(products)
			.where(eq(products.parentId, id))
			.orderBy(asc(products.sortOrder), asc(products.name)),
		db.select({ n: sql<number>`count(*)::int` }).from(orders).where(eq(orders.productId, id))
	]);
	return {
		...withFmt(fmt, row.p, ['price']),
		stock: row.stock,
		parentName: row.parentName,
		discounts,
		variants: variants.map((v) => withFmt(fmt, v, ['price'])),
		orderCount
	};
}

export interface ProductInput {
	code: string;
	parentId: number | null;
	isCollection: boolean;
	name: string;
	icon: string | null;
	customEmojiId: string | null;
	price: number;
	warranty: string | null;
	note: string | null;
	unlimited: boolean;
	unlimitedContent: string | null;
	isActive: boolean;
	sortOrder: number;
	discounts: { minQty: number; percentBp: number }[];
}

function randomCode(): string {
	const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	const bytes = crypto.getRandomValues(new Uint8Array(6));
	return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export function parseProductInput(body: Record<string, unknown>): ProductInput {
	const isCollection = bool(body, 'isCollection', false);
	const unlimited = !isCollection && bool(body, 'unlimited', false);
	const code = optStr(body, 'code', { max: 32 }) ?? randomCode();
	if (!/^[A-Za-z0-9_-]+$/.test(code)) throw new BadRequest('Code may only contain letters, digits, _ and -', 'code');
	const customEmojiId = optStr(body, 'customEmojiId', { max: 32 });
	if (customEmojiId && !/^\d+$/.test(customEmojiId)) throw new BadRequest('Custom emoji id must be numeric', 'customEmojiId');
	const unlimitedContent = optStr(body, 'unlimitedContent', { max: 4000 });
	if (unlimited && !unlimitedContent) throw new BadRequest('Unlimited products need the content to deliver', 'unlimitedContent');
	const rawTiers = Array.isArray(body.discounts) ? (body.discounts as Record<string, unknown>[]) : [];
	if (rawTiers.length > 20) throw new BadRequest('Too many discount tiers (max 20)', 'discounts');
	const discounts = rawTiers.map((t, i) => ({
		minQty: int(t, 'minQty', { min: 2, max: 1_000_000 }),
		percentBp: int(t, 'percentBp', { min: 1, max: 9_900 }),
		i
	}));
	const seen = new Set<number>();
	for (const d of discounts) {
		if (seen.has(d.minQty)) throw new BadRequest(`Duplicate discount tier for min qty ${d.minQty}`, 'discounts');
		seen.add(d.minQty);
	}
	return {
		code,
		parentId: optInt(body, 'parentId', { min: 1 }),
		isCollection,
		name: str(body, 'name', { max: 120 }),
		icon: optStr(body, 'icon', { max: 16 }),
		customEmojiId,
		price: isCollection ? 0 : int(body, 'price', { min: 0, max: 100_000_000 }),
		warranty: optStr(body, 'warranty', { max: 32 }),
		note: optStr(body, 'note', { max: 3500 }),
		unlimited,
		unlimitedContent: unlimited ? unlimitedContent : null,
		isActive: bool(body, 'isActive', true),
		sortOrder: optInt(body, 'sortOrder', { min: -100000, max: 100000 }) ?? 0,
		discounts: isCollection ? [] : discounts.map(({ minQty, percentBp }) => ({ minQty, percentBp }))
	};
}

async function assertParent(parentId: number | null, selfId?: number) {
	if (parentId == null) return;
	if (parentId === selfId) throw new BadRequest('A product cannot be its own parent', 'parentId');
	const [parent] = await getDb().select({ isCollection: products.isCollection, parentId: products.parentId }).from(products).where(eq(products.id, parentId));
	if (!parent) throw new BadRequest('Parent collection not found', 'parentId');
	if (!parent.isCollection) throw new BadRequest('Parent must be a collection', 'parentId');
}

export async function createProduct(storeId: number, input: ProductInput) {
	await assertParent(input.parentId);
	if (input.isCollection && input.parentId) throw new BadRequest('Collections cannot be nested', 'parentId');
	return getDb().transaction(async (tx) => {
		const { discounts, ...values } = input;
		const [row] = await tx.insert(products).values({ ...values, storeId }).returning({ id: products.id });
		if (discounts.length) await tx.insert(productDiscounts).values(discounts.map((d) => ({ ...d, productId: row!.id })));
		return { id: row!.id };
	});
}

export async function updateProduct(id: number, storeId: number, input: ProductInput) {
	await assertParent(input.parentId, id);
	if (input.isCollection && input.parentId) throw new BadRequest('Collections cannot be nested', 'parentId');
	return getDb().transaction(async (tx) => {
		const { discounts, ...values } = input;
		const [row] = await tx
			.update(products)
			.set({ ...values, updatedAt: new Date() })
			.where(and(eq(products.id, id), eq(products.storeId, storeId)))
			.returning({ id: products.id });
		if (!row) throw new BadRequest('Product not found');
		await tx.delete(productDiscounts).where(eq(productDiscounts.productId, id));
		if (discounts.length) await tx.insert(productDiscounts).values(discounts.map((d) => ({ ...d, productId: id })));
		return { id };
	});
}

/** Quick inline edits from the table: active toggle and sort order. */
export async function patchProduct(id: number, storeId: number, body: Record<string, unknown>) {
	const set: Partial<typeof products.$inferInsert> = { updatedAt: new Date() };
	if ('isActive' in body) set.isActive = bool(body, 'isActive');
	if ('sortOrder' in body) set.sortOrder = int(body, 'sortOrder', { min: -100000, max: 100000 });
	const [row] = await getDb().update(products).set(set).where(and(eq(products.id, id), eq(products.storeId, storeId))).returning({ id: products.id });
	if (!row) throw new BadRequest('Product not found');
	return row;
}

export async function deleteProduct(id: number, storeId: number) {
	const db = getDb();
	const [{ n } = { n: 0 }] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(orders)
		.where(or(eq(orders.productId, id), sql`${orders.productId} in (select id from products where parent_id = ${id})`));
	if (n > 0) throw new BadRequest('This product (or one of its variants) has orders — deactivate it instead of deleting');
	await db.delete(products).where(and(eq(products.id, id), eq(products.storeId, storeId)));
	return { ok: true };
}
