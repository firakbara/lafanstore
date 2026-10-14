import { products, voucherRedemptions, vouchers, type DbOrTx } from '@tokobun/db';
import { and, count, eq } from 'drizzle-orm';
import type { DiscountTier, Quote } from '../contracts';
import { CoreError } from '../contracts';
import { getDiscounts } from './catalog';
import { bp, db } from './util';

export const MAX_QUANTITY = 9999;

export type ProductRow = typeof products.$inferSelect;
export type VoucherRow = typeof vouchers.$inferSelect;

export interface QuoteInput {
  storeId: number;
  userId: number;
  productId: number;
  quantity: number;
  voucherCode?: string | null;
}

export interface InternalQuote {
  quote: Quote;
  product: ProductRow;
  voucher: VoucherRow | null;
}

/** Shared pricing logic. With `lockVoucher`, the voucher row is locked FOR UPDATE (inside a tx). */
export async function computeQuote(input: QuoteInput, tx?: DbOrTx, lockVoucher = false): Promise<InternalQuote> {
  const d = db(tx);
  const qty = input.quantity;
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QUANTITY) throw new CoreError('INVALID_QUANTITY', 'invalid quantity');
  const [product] = await d.select().from(products).where(and(eq(products.id, input.productId), eq(products.storeId, input.storeId))).limit(1);
  if (!product) throw new CoreError('NOT_FOUND', 'product not found');
  if (!product.isActive) throw new CoreError('PRODUCT_INACTIVE', 'product is inactive');
  if (product.isCollection) throw new CoreError('INVALID_STATE', 'collections cannot be purchased directly; pick a variant');
  const [parentRows, tiers] = await Promise.all([
    product.parentId !== null
      ? d.select({ isActive: products.isActive }).from(products).where(eq(products.id, product.parentId))
      : Promise.resolve([]),
    getDiscounts(product.id, tx),
  ]);
  if (parentRows[0] && !parentRows[0].isActive) throw new CoreError('PRODUCT_INACTIVE', 'product is inactive');
  let tier: DiscountTier | null = null;
  for (const t of tiers) if (t.minQty <= qty && (!tier || t.percentBp >= tier.percentBp)) tier = t;
  const discountBp = tier?.percentBp ?? 0;
  const nextTier = tiers.find((t) => t.minQty > qty && t.percentBp > discountBp) ?? null;

  const unitPrice = product.price;
  const subtotal = unitPrice * qty;
  const discountAmount = Math.min(subtotal, bp(subtotal, discountBp));
  const afterTier = subtotal - discountAmount;

  let voucher: VoucherRow | null = null;
  let voucherDiscount = 0;
  const code = input.voucherCode?.trim().toUpperCase();
  if (code) {
    const q = d.select().from(vouchers).where(and(eq(vouchers.code, code), eq(vouchers.storeId, input.storeId))).limit(1);
    const [v] = lockVoucher ? await q.for('update') : await q;
    if (!v || !v.isActive) throw new CoreError('VOUCHER_INVALID', 'voucher not found');
    if (v.productId !== null && v.productId !== product.id && v.productId !== product.parentId) {
      throw new CoreError('VOUCHER_INVALID', 'voucher not valid for this product');
    }
    if (v.expiresAt && v.expiresAt.getTime() <= Date.now()) throw new CoreError('VOUCHER_EXPIRED', 'voucher expired');
    if (v.maxUses !== null && v.usedCount >= v.maxUses) throw new CoreError('VOUCHER_LIMIT_REACHED', 'voucher fully used');
    const [{ n } = { n: 0 }] = await d
      .select({ n: count() })
      .from(voucherRedemptions)
      .where(and(eq(voucherRedemptions.voucherId, v.id), eq(voucherRedemptions.userId, input.userId)));
    if (v.perUserLimit > 0 && Number(n) >= v.perUserLimit) {
      throw new CoreError('VOUCHER_LIMIT_REACHED', 'voucher per-user limit reached');
    }
    if (afterTier < v.minTotal) throw new CoreError('VOUCHER_MIN_TOTAL', 'order total below voucher minimum', { minTotal: v.minTotal });
    voucherDiscount = v.kind === 'percent' ? bp(afterTier, v.value) : v.value;
    voucherDiscount = Math.max(0, Math.min(afterTier, voucherDiscount));
    voucher = v;
  }

  return {
    product,
    voucher,
    quote: {
      productId: product.id,
      quantity: qty,
      unitPrice,
      subtotal,
      discountBp,
      discountAmount,
      voucherCode: voucher?.code ?? null,
      voucherDiscount,
      total: afterTier - voucherDiscount,
      nextTier,
    },
  };
}

export async function quote(input: QuoteInput): Promise<Quote> {
  return (await computeQuote(input)).quote;
}
