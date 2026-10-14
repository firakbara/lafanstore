// Toko: product list, product detail (keypad, voucher, note), buy with balance, direct pay.
import {
  CoreError,
  formatMoney,
  getProduct,
  getUser,
  listProducts,
  purchaseWithBalance,
  quote,
  type CatalogSort,
  type ProductDetail,
  type Quote,
} from '@tokobun/core';
import { escapeHtml } from '@tokobun/i18n';
import { createOrderPayment } from '@tokobun/payments';
import { A, intArg, sortFromCode } from '../callback';
import type { BotContext } from '../context';
import { orderMethodsScreen } from '../screens/payment';
import {
  productNoteScreen,
  productScreen,
  purchaseConfirmScreen,
  purchaseDoneScreen,
  voucherPromptScreen,
} from '../screens/product';
import { shopScreen } from '../screens/shop';
import { withNotice } from '../screens/types';
import { cachedMethods, countryOf } from '../util/cache';
import { deliverOrder, notifyAdminSale } from '../util/delivery';
import { errorText, isCoreError } from '../util/errors';
import { withUserLock } from '../util/lock';
import { clampQty, maxQtyFor } from '../util/quantity';
import { deleteInput, show, toast } from '../util/render';
import type { InputState } from '../util/session';
import { showInvoice } from './topup';
import type { CallbackMap } from './types';

export function botUsername(ctx: BotContext): string {
  return ctx.cfg.botUsername ?? ctx.me.username;
}

export async function showShop(ctx: BotContext, page: number, sort: CatalogSort, parentId: number | null): Promise<void> {
  let parent: { id: number; name: string } | null = null;
  if (parentId) {
    const p = await getProduct(parentId);
    if (!p || !p.isActive) throw new CoreError('NOT_FOUND');
    parent = { id: p.id, name: p.name };
  }
  const result = await listProducts({ storeId: ctx.storeId, page: Math.max(1, page), sort, parentId });
  await show(ctx, shopScreen(ctx.v, { page: result, sort, parent }));
}

async function loadProduct(productId: number, storeId?: number): Promise<ProductDetail> {
  const product = await getProduct(productId);
  if (!product) throw new CoreError('NOT_FOUND');
  if (!product.isActive) throw new CoreError('PRODUCT_INACTIVE');
  if (storeId != null && product.storeId !== storeId) throw new CoreError('NOT_FOUND');
  return product;
}

function sessionVoucher(ctx: BotContext, productId: number): string | null {
  const v = ctx.session.voucher;
  return v && v.productId === productId ? v.code : null;
}

/** Quote with the session voucher; an unusable voucher is dropped (and reported) instead of failing. */
async function quoteFor(ctx: BotContext, product: ProductDetail, qty: number): Promise<{ q: Quote; notice: string | null }> {
  const voucherCode = sessionVoucher(ctx, product.id);
  try {
    return { q: await quote({ storeId: ctx.storeId, userId: ctx.user.id, productId: product.id, quantity: qty, voucherCode }), notice: null };
  } catch (err) {
    if (!voucherCode || !isCoreError(err)) throw err;
    delete ctx.session.voucher;
    const q = await quote({ storeId: ctx.storeId, userId: ctx.user.id, productId: product.id, quantity: qty });
    return { q, notice: errorText(err, ctx.v.lang) };
  }
}

export async function showProduct(ctx: BotContext, productId: number, qty: number, typing = false, notice?: string): Promise<void> {
  const product = await loadProduct(productId, ctx.storeId);
  if (product.isCollection) return showShop(ctx, 1, 'all', product.id);
  const quantity = clampQty(qty, maxQtyFor(product.stock));
  const soldOut = product.stock !== null && product.stock <= 0;
  const methodsP = cachedMethods(ctx.storeId, 'order', countryOf(ctx.user)).catch(() => []);
  let q: Quote | null = null;
  let voucherNotice: string | null = null;
  if (!soldOut) ({ q, notice: voucherNotice } = await quoteFor(ctx, product, quantity));
  const methods = await methodsP;
  let screen = productScreen(ctx.v, {
    product,
    qty: quantity,
    typing: typing && quantity === qty,
    quote: q,
    balance: ctx.user.balance,
    shareLink: `https://t.me/${botUsername(ctx)}?start=product_${product.code}`,
    directPay: methods.length > 0,
  });
  const n = notice ?? voucherNotice;
  if (n) {
    if (ctx.callbackQuery && !notice) await toast(ctx, n, true);
    else screen = withNotice(screen, n);
  }
  await show(ctx, screen);
}

/** Text input: voucher code for the product screen. */
export async function onVoucherInput(ctx: BotContext, state: Extract<InputState, { kind: 'voucher' }>, text: string): Promise<void> {
  await deleteInput(ctx);
  const code = text.trim().toUpperCase().slice(0, 64);
  const product = await loadProduct(state.productId, ctx.storeId);
  try {
    await quote({ storeId: ctx.storeId, userId: ctx.user.id, productId: product.id, quantity: state.qty, voucherCode: code });
  } catch (err) {
    if (!isCoreError(err)) throw err;
    // Keep waiting for another code.
    await show(ctx, withNotice(voucherPromptScreen(ctx.v, { product, qty: state.qty }), escapeHtml(errorText(err, ctx.v.lang))));
    return;
  }
  delete ctx.session.input;
  ctx.session.voucher = { productId: product.id, code };
  await showProduct(ctx, product.id, state.qty, false, ctx.v.t('product.voucherApplied'));
}

async function refreshUser(ctx: BotContext): Promise<void> {
  const u = await getUser(ctx.user.id);
  if (u) ctx.user = u;
}

export const shopCallbacks: CallbackMap = {
  [A.shop]: async (ctx, args) => {
    const parentId = intArg(args, 2, 0) || null;
    if (args[3] === 'r') await toast(ctx, ctx.v.tp('shop.refreshed'));
    await showShop(ctx, intArg(args, 0, 1), sortFromCode(args[1]), parentId);
  },
  [A.product]: async (ctx, args) => {
    await showProduct(ctx, intArg(args, 0, 0), intArg(args, 1, 1), args[2] === '1');
  },
  [A.note]: async (ctx, args) => {
    const product = await loadProduct(intArg(args, 0, 0), ctx.storeId);
    await show(ctx, productNoteScreen(ctx.v, { product, qty: intArg(args, 1, 1) }));
  },
  [A.voucher]: async (ctx, args) => {
    const product = await loadProduct(intArg(args, 0, 0), ctx.storeId);
    const qty = intArg(args, 1, 1);
    ctx.session.input = { kind: 'voucher', productId: product.id, qty };
    await show(ctx, voucherPromptScreen(ctx.v, { product, qty }));
  },
  [A.voucherDel]: async (ctx, args) => {
    delete ctx.session.voucher;
    await toast(ctx, ctx.v.tp('product.voucherRemoved'));
    await showProduct(ctx, intArg(args, 0, 0), intArg(args, 1, 1));
  },
  [A.buyConfirm]: async (ctx, args) => {
    const product = await loadProduct(intArg(args, 0, 0), ctx.storeId);
    const { q } = await quoteFor(ctx, product, intArg(args, 1, 1));
    if (ctx.user.balance < q.total) throw new CoreError('INSUFFICIENT_BALANCE');
    await show(ctx, purchaseConfirmScreen(ctx.v, { product, quote: q, balance: ctx.user.balance }));
  },
  [A.buy]: async (ctx, args) => {
    const productId = intArg(args, 0, 0);
    const quantity = intArg(args, 1, 1);
    const ran = await withUserLock(ctx.user.id, async () => {
      const { order } = await purchaseWithBalance({
        storeId: ctx.storeId,
        userId: ctx.user.id,
        productId,
        quantity,
        voucherCode: sessionVoucher(ctx, productId),
      });
      delete ctx.session.voucher;
      await refreshUser(ctx);
      await show(ctx, purchaseDoneScreen(ctx.v, { orderCode: order.code, balance: ctx.user.balance }));
      await deliverOrder(ctx.api, ctx.chat!.id, order, ctx.user, ctx.settings);
      await notifyAdminSale(ctx.api, ctx.cfg, ctx.user, order, (c) => formatMoney(c, 'USD', ctx.settings.fxRates));
    });
    if (!ran) await toast(ctx, ctx.v.tp('errors.RATE_LIMITED'));
  },
  [A.payMethods]: async (ctx, args) => {
    const product = await loadProduct(intArg(args, 0, 0), ctx.storeId);
    const qty = intArg(args, 1, 1);
    const { q } = await quoteFor(ctx, product, qty);
    const methods = await cachedMethods(ctx.storeId, 'order', countryOf(ctx.user));
    await show(ctx, orderMethodsScreen(ctx.v, { product, qty, total: q.total, methods }));
  },
  [A.payWith]: async (ctx, args) => {
    const productId = intArg(args, 0, 0);
    const quantity = intArg(args, 1, 1);
    const [provider = '', method = ''] = args.slice(2);
    const ran = await withUserLock(ctx.user.id, async () => {
      const payment = await createOrderPayment({
        storeId: ctx.storeId,
        userId: ctx.user.id,
        productId,
        quantity,
        voucherCode: sessionVoucher(ctx, productId),
        provider,
        method,
      });
      delete ctx.session.voucher;
      await showInvoice(ctx, payment);
    });
    if (!ran) await toast(ctx, ctx.v.tp('errors.RATE_LIMITED'));
  },
};
