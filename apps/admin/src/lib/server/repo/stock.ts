import { createBroadcast } from '@tokobun/core';
import { getDb, products, stockItems } from '@tokobun/db';
import { and, asc, desc, eq, ilike, inArray, sql, type SQL } from 'drizzle-orm';
import { parseListParams, toPage } from '#lib/paging.ts';
import { parseStockImport } from '#lib/stock-import.ts';
import { BadRequest, escapeHtml, escapeLike } from '../http';
import { availableCount } from './products';

const STATUSES = ['available', 'reserved', 'sold'] as const;

export async function listStock(productId: number, sp: URLSearchParams) {
	const p = parseListParams(sp, { sortable: ['createdAt', 'id'] as const, defaultSort: 'id', defaultDir: 'desc', defaultPageSize: 50, maxPageSize: 500 });
	const status = STATUSES.find((s) => s === sp.get('status')) ?? 'available';
	const where: SQL[] = [eq(stockItems.productId, productId), eq(stockItems.status, status)];
	if (p.q) where.push(ilike(stockItems.content, `%${escapeLike(p.q)}%`));
	const cond = and(...where);
	const db = getDb();
	const [rows, [{ n } = { n: 0 }], counts] = await Promise.all([
		db
			.select({ id: stockItems.id, content: stockItems.content, status: stockItems.status, orderId: stockItems.orderId, createdAt: stockItems.createdAt, soldAt: stockItems.soldAt, reservedUntil: stockItems.reservedUntil })
			.from(stockItems)
			.where(cond)
			.orderBy(p.dir === 'asc' ? asc(stockItems.id) : desc(stockItems.id))
			.limit(p.pageSize)
			.offset(p.offset),
		db.select({ n: sql<number>`count(*)::int` }).from(stockItems).where(cond),
		db
			.select({ status: stockItems.status, n: sql<number>`count(*)::int` })
			.from(stockItems)
			.where(eq(stockItems.productId, productId))
			.groupBy(stockItems.status)
	]);
	const byStatus = { available: 0, reserved: 0, sold: 0 } as Record<(typeof STATUSES)[number], number>;
	for (const c of counts) byStatus[c.status] = c.n;
	return { ...toPage(rows, n, p), status, counts: byStatus };
}

async function sellableProduct(productId: number) {
	const [prod] = await getDb()
		.select({ id: products.id, name: products.name, isCollection: products.isCollection, unlimited: products.unlimited, stock: availableCount })
		.from(products)
		.where(eq(products.id, productId));
	if (!prod) throw new BadRequest('Product not found');
	if (prod.isCollection) throw new BadRequest('Collections hold variants — import stock into a variant instead');
	return prod;
}

export async function importStock(productId: number, input: { text: string; separator?: string | null; dedupe: boolean }) {
	const prod = await sellableProduct(productId);
	const db = getDb();
	let existing: string[] = [];
	if (input.dedupe) {
		const rows = await db
			.select({ content: stockItems.content })
			.from(stockItems)
			.where(and(eq(stockItems.productId, productId), inArray(stockItems.status, ['available', 'reserved'])));
		existing = rows.map((r) => r.content);
	}
	const parsed = parseStockImport(input.text, { separator: input.separator, dedupe: input.dedupe, existing });
	if (parsed.items.length === 0) throw new BadRequest('Nothing to import (all items empty or duplicates)');
	if (parsed.items.length > 50_000) throw new BadRequest('Import at most 50,000 items at a time');
	const tooLong = parsed.items.findIndex((s) => s.length > 4000);
	if (tooLong !== -1) throw new BadRequest(`Item #${tooLong + 1} exceeds 4000 characters`);
	await db.transaction(async (tx) => {
		for (let i = 0; i < parsed.items.length; i += 1000) {
			await tx.insert(stockItems).values(parsed.items.slice(i, i + 1000).map((content) => ({ productId, content })));
		}
	});
	return {
		imported: parsed.items.length,
		duplicatesInInput: parsed.duplicatesInInput,
		duplicatesExisting: parsed.duplicatesExisting,
		emptySkipped: parsed.emptySkipped,
		product: prod.name,
		unlimitedWarning: prod.unlimited
	};
}

/** Delete only items that are still available (never reserved/sold ones). */
export async function deleteStock(productId: number, input: { ids?: number[]; all?: boolean }) {
	const db = getDb();
	const base = and(eq(stockItems.productId, productId), eq(stockItems.status, 'available'));
	let cond = base;
	if (!input.all) {
		const ids = (input.ids ?? []).filter((n) => Number.isSafeInteger(n)).slice(0, 10_000);
		if (!ids.length) throw new BadRequest('No items selected');
		cond = and(base, inArray(stockItems.id, ids));
	}
	const deleted = await db.delete(stockItems).where(cond).returning({ id: stockItems.id });
	return { deleted: deleted.length };
}

/** Queue a 'stock' audience broadcast announcing the restock. */
export async function notifyRestock(storeId: number, productId: number, input: { title?: string | null; body?: string | null }) {
	const prod = await getDb()
		.select({ name: products.name, code: products.code, unlimited: products.unlimited, stock: availableCount })
		.from(products)
		.where(and(eq(products.id, productId), eq(products.storeId, storeId)))
		.then((r) => r[0]);
	if (!prod) throw new BadRequest('Product not found');
	const stockText = prod.unlimited ? '∞' : String(prod.stock);
	const title = input.title?.trim() || '📦 Restock';
	if (title.length > 200) throw new BadRequest('Title is too long (max 200 chars)');
	const body = input.body?.trim() || `<b>${escapeHtml(prod.name)}</b> is back in stock! Available: <b>${stockText}</b>`;
	if (body.length > 3800) throw new BadRequest('Body is too long (max 3800 chars)');
	const id = await createBroadcast({ storeId, audience: 'stock', title, body, queue: true });
	return { broadcastId: id };
}
