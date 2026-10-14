import { productDiscounts, products, stockItems, type DbOrTx } from '@tokobun/db';
import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm';
import type { CatalogSort, DiscountTier, ProductDetail, ProductListItem, ProductPage } from '../contracts';
import { db, pageArgs, totalPages } from './util';

type ProductRow = typeof products.$inferSelect;

async function stockCounts(ids: number[], tx?: DbOrTx): Promise<Map<number, number>> {
  const m = new Map<number, number>();
  if (!ids.length) return m;
  const rows = await db(tx)
    .select({ productId: stockItems.productId, n: count() })
    .from(stockItems)
    .where(and(inArray(stockItems.productId, ids), eq(stockItems.status, 'available')))
    .groupBy(stockItems.productId);
  for (const r of rows) m.set(r.productId, Number(r.n));
  return m;
}

async function promoSet(ids: number[], tx?: DbOrTx): Promise<Set<number>> {
  if (!ids.length) return new Set();
  const rows = await db(tx)
    .selectDistinct({ productId: productDiscounts.productId })
    .from(productDiscounts)
    .where(inArray(productDiscounts.productId, ids));
  return new Set(rows.map((r) => r.productId));
}

/** Build list items for the given rows (resolving collection variants: stock sum, min price, promo). */
async function buildItems(rows: ProductRow[], tx?: DbOrTx): Promise<ProductListItem[]> {
  const collectionIds = rows.filter((r) => r.isCollection).map((r) => r.id);
  const variants = collectionIds.length
    ? await db(tx)
        .select()
        .from(products)
        .where(and(inArray(products.parentId, collectionIds), eq(products.isActive, true)))
    : [];
  const allIds = [...rows.map((r) => r.id), ...variants.map((v) => v.id)];
  const [stock, promo] = await Promise.all([stockCounts(allIds, tx), promoSet(allIds, tx)]);
  const own = (p: ProductRow): number | null => (p.unlimited ? null : (stock.get(p.id) ?? 0));

  return rows.map((p) => {
    let s = own(p);
    let price = p.price;
    let hasPromo = promo.has(p.id);
    let variantCount = 0;
    if (p.isCollection) {
      const vs = variants.filter((v) => v.parentId === p.id);
      variantCount = vs.length;
      s = vs.some((v) => v.unlimited) ? null : vs.reduce((a, v) => a + (own(v) ?? 0), 0);
      if (vs.length && price === 0) price = Math.min(...vs.map((v) => v.price));
      hasPromo = hasPromo || vs.some((v) => promo.has(v.id));
    }
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      icon: p.icon,
      customEmojiId: p.customEmojiId,
      price,
      isCollection: p.isCollection,
      variantCount,
      stock: s,
      hasPromo,
    };
  });
}

const inStock = (i: ProductListItem) => i.stock === null || i.stock > 0;

export async function listProducts(opts: {
  storeId: number;
  page?: number;
  pageSize?: number;
  sort?: CatalogSort;
  parentId?: number | null;
}): Promise<ProductPage> {
  const p = pageArgs(opts.page, opts.pageSize, 15);
  const parentId = opts.parentId ?? null;
  const rows = await db()
    .select()
    .from(products)
    .where(and(eq(products.storeId, opts.storeId), eq(products.isActive, true), parentId === null ? isNull(products.parentId) : eq(products.parentId, parentId)))
    .orderBy(asc(products.sortOrder), asc(products.name), asc(products.id));
  let items = await buildItems(rows);
  const sort = opts.sort ?? 'all';
  if (sort === 'all') items = [...items.filter(inStock), ...items.filter((i) => !inStock(i))];
  else if (sort === 'available') items = items.filter(inStock);
  else if (sort === 'soldout') items = items.filter((i) => !inStock(i));
  else if (sort === 'promo') items = items.filter((i) => i.hasPromo);
  const total = items.length;
  const tp = totalPages(total, p.pageSize);
  const page = Math.min(p.page, tp);
  return { items: items.slice((page - 1) * p.pageSize, page * p.pageSize), page, totalPages: tp, total };
}

export async function getDiscounts(productId: number, tx?: DbOrTx): Promise<DiscountTier[]> {
  const rows = await db(tx)
    .select({ minQty: productDiscounts.minQty, percentBp: productDiscounts.percentBp })
    .from(productDiscounts)
    .where(eq(productDiscounts.productId, productId))
    .orderBy(asc(productDiscounts.minQty));
  return rows;
}

async function detail(row: ProductRow | undefined): Promise<ProductDetail | null> {
  if (!row) return null;
  const [[item], discounts, parentName] = await Promise.all([
    buildItems([row]),
    getDiscounts(row.id),
    row.parentId !== null
      ? db().select({ name: products.name }).from(products).where(eq(products.id, row.parentId)).then(([p]) => p?.name ?? null)
      : Promise.resolve(null),
  ]);
  return {
    ...item!,
    storeId: row.storeId,
    parentId: row.parentId,
    parentName,
    warranty: row.warranty,
    note: row.note,
    discounts,
    isActive: row.isActive,
  };
}

export async function getProduct(productId: number): Promise<ProductDetail | null> {
  const [row] = await db().select().from(products).where(eq(products.id, productId)).limit(1);
  return detail(row);
}

export async function getProductByCode(code: string): Promise<ProductDetail | null> {
  const [row] = await db().select().from(products).where(eq(products.code, code)).limit(1);
  return detail(row);
}

export async function availableStock(productId: number): Promise<number | null> {
  const [row] = await db().select().from(products).where(eq(products.id, productId)).limit(1);
  if (!row) return 0;
  const [item] = await buildItems([row]);
  return item!.stock;
}
