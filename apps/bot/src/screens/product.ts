import type { Cents, ProductDetail, Quote } from '@tokobun/core';
import { formatPercent } from '@tokobun/i18n';
import { cb } from '../callback';
import { btn, copyBtn, noopBtn, type Button, type Keyboard } from '../keyboards';
import { maxQtyFor, pressKey, type KeypadKey } from '../util/quantity';
import type { View } from '../util/view';
import type { Screen } from './types';

export interface ProductScreenData {
  product: ProductDetail;
  qty: number;
  typing: boolean;
  /** Null when the product is sold out (no quote possible). */
  quote: Quote | null;
  balance: Cents;
  shareLink: string;
  /** Whether "Bayar langsung" methods exist. */
  directPay: boolean;
}

export function productScreen(v: View, d: ProductScreenData): Screen {
  const p = d.product;
  const soldOut = p.stock !== null && p.stock <= 0;
  const lines = [
    v.t('product.name', { name: p.name }),
    v.t('product.basePrice', { price: v.money(p.price) }),
    v.t('product.stock', { stock: p.stock === null ? v.tp('common.unlimited') : p.stock }),
    v.t('product.collection', { collection: p.parentName ?? v.tp('common.none') }),
    v.t('product.warranty', { warranty: p.warranty ?? v.tp('product.warrantyNone') }),
    ...p.discounts.map((tier) => v.t('product.promo', { minQty: tier.minQty, percent: formatPercent(tier.percentBp) })),
    '',
    v.t('product.quantity', { qty: d.qty }),
  ];
  const q = d.quote;
  if (q && q.discountAmount > 0) {
    lines.push(v.t('product.discount', { amount: v.money(q.discountAmount), percent: formatPercent(q.discountBp) }));
  }
  if (q?.voucherCode) lines.push(v.t('product.voucher', { code: q.voucherCode, amount: v.money(q.voucherDiscount) }));
  const total = q?.total ?? p.price * d.qty;
  lines.push(v.t('product.total', { total: v.money(total) }), v.t('product.balance', { balance: v.money(d.balance) }));
  if (soldOut) lines.push('', v.t('product.soldOut'));
  else if (d.balance < total) lines.push('', v.t('product.balanceShort', { amount: v.money(total - d.balance) }));

  const max = maxQtyFor(p.stock);
  const key = (k: KeypadKey): string => {
    const s = pressKey({ qty: d.qty, typing: d.typing }, k, max);
    return cb.product(p.id, s.qty, s.typing);
  };
  const digit = (n: number): Button => btn(String(n), key(n));

  const keyboard: Keyboard = [
    [noopBtn(v.tp('product.qty', { qty: d.qty }), { style: 'primary' }), btn(v.tp('product.del'), key('del'), { style: 'danger' })],
    [1, 2, 3].map(digit),
    [4, 5, 6].map(digit),
    [7, 8, 9].map(digit),
    [digit(0)],
  ];
  if (soldOut) {
    keyboard.push([noopBtn(v.tp('product.soldOut'), { style: 'danger' })]);
  } else {
    keyboard.push([
      d.balance >= total
        ? btn(v.tp('product.buyBalance'), cb.buyConfirm(p.id, d.qty), { style: 'success' })
        : btn(v.tp('product.topup'), cb.topup(), { style: 'primary' }),
    ]);
    const second: Button[] = [];
    if (d.directPay) second.push(btn(v.tp('product.payDirect'), cb.payMethods(p.id, d.qty)));
    second.push(
      q?.voucherCode
        ? btn(v.tp('product.removeVoucher'), cb.voucherDel(p.id, d.qty))
        : btn(v.tp('product.useVoucher'), cb.voucher(p.id, d.qty)),
    );
    keyboard.push(second);
  }
  keyboard.push([copyBtn(v.tp('product.share'), d.shareLink), btn(v.tp('product.viewNote'), cb.note(p.id, d.qty))]);
  keyboard.push([btn(v.tp('common.back'), cb.shop(1, 'all', p.parentId))]);
  return { text: lines.join('\n'), keyboard };
}

/** "Lihat Catatan": admin note (trusted HTML: b,i,a,code) replaces the text. */
export function productNoteScreen(v: View, d: { product: ProductDetail; qty: number }): Screen {
  const note = d.product.note?.trim() ? d.product.note : v.t('product.noNote');
  return {
    text: `${v.t('product.noteTitle')}\n\n${note}`,
    keyboard: [[btn(v.tp('common.back'), cb.product(d.product.id, d.qty))]],
  };
}

export function voucherPromptScreen(v: View, d: { product: ProductDetail; qty: number }): Screen {
  return {
    text: v.t('product.voucherPrompt', { name: d.product.name }),
    keyboard: [[btn(v.tp('common.cancel'), cb.cancelInput(cb.product(d.product.id, d.qty)))]],
  };
}

export function purchaseConfirmScreen(
  v: View,
  d: { product: ProductDetail; quote: Quote; balance: Cents },
): Screen {
  return {
    text: v.t('purchase.confirm', {
      name: d.product.name,
      qty: d.quote.quantity,
      total: v.money(d.quote.total),
      after: v.money(d.balance - d.quote.total),
    }),
    keyboard: [
      [btn(v.tp('purchase.confirmYes'), cb.buy(d.product.id, d.quote.quantity), { style: 'success' })],
      [btn(v.tp('common.back'), cb.product(d.product.id, d.quote.quantity))],
    ],
  };
}

export function purchaseDoneScreen(v: View, d: { orderCode: string; balance: Cents }): Screen {
  return {
    text: v.t('purchase.done', { code: d.orderCode, balance: v.money(d.balance) }),
    keyboard: [
      [btn(v.tp('purchase.myOrders'), cb.orders()), btn(v.tp('purchase.again'), cb.shop(1, 'all'))],
      [btn(v.tp('common.mainMenu'), cb.main())],
    ],
  };
}
