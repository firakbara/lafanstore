import type { LedgerEntry, OrderDetail, OrderSummary, Paged } from '@tokobun/core';
import { cb } from '../callback';
import { btn, pager, type Keyboard } from '../keyboards';
import { signed } from '../util/format';
import type { View } from '../util/view';
import type { Screen } from './types';

const statusIcon: Record<OrderSummary['status'], string> = {
  pending_payment: '⏳',
  completed: '✅',
  cancelled: '🚫',
  refunded: '↩️',
};

const pageLabels = (v: View, page: number, total: number) => ({
  prev: v.tp('common.prev'),
  next: v.tp('common.next'),
  page: v.tp('common.page', { page, total }),
});

export function ordersScreen(v: View, d: { orders: Paged<OrderSummary> }): Screen {
  const o = d.orders;
  const back = [btn(v.tp('common.back'), cb.profile())];
  if (o.items.length === 0) return { text: v.t('orders.empty'), keyboard: [back] };
  const keyboard: Keyboard = o.items.map((it) => [
    btn(
      v.tp('orders.item', { status: statusIcon[it.status], code: it.code, product: it.productName, qty: it.quantity }),
      cb.order(it.id, o.page),
    ),
  ]);
  const nav = pager(o.page, o.totalPages, (p) => cb.orders(p), pageLabels(v, o.page, o.totalPages));
  if (nav.length) keyboard.push(nav);
  keyboard.push(back);
  return { text: v.t('orders.title', { total: o.total }), keyboard };
}

export function orderDetailScreen(v: View, d: { order: OrderDetail; fromPage: number }): Screen {
  const o = d.order;
  const keyboard: Keyboard = [];
  if (o.status === 'completed' && o.items.length) keyboard.push([btn(v.tp('orders.resend'), cb.orderResend(o.id), { style: 'primary' })]);
  keyboard.push([btn(v.tp('common.back'), cb.orders(d.fromPage))]);
  return {
    text: v.t('orders.detail', {
      code: o.code,
      product: o.productName,
      qty: o.quantity,
      unit: v.money(o.unitPrice),
      discount: o.discountAmount ? `-${v.money(o.discountAmount)}` : v.tp('common.none'),
      voucher: o.voucherDiscount ? `-${v.money(o.voucherDiscount)}` : v.tp('common.none'),
      total: v.money(o.total),
      paidWith: v.tp(`orders.paidWith.${o.paidWith}`),
      status: v.tp(`orderStatus.${o.status}`),
      date: v.date(o.completedAt ?? o.createdAt),
    }),
    keyboard,
  };
}

export function ledgerScreen(v: View, d: { ledger: Paged<LedgerEntry> }): Screen {
  const l = d.ledger;
  const back = [btn(v.tp('common.back'), cb.profile())];
  if (l.items.length === 0) return { text: v.t('ledger.empty'), keyboard: [back] };
  const lines = l.items.map((e) =>
    v.t('ledger.line', {
      date: v.date(e.createdAt),
      type: v.tp(`ledgerType.${e.type}`),
      amount: signed(e.amount, v.money),
      after: v.money(e.balanceAfter),
    }),
  );
  const keyboard: Keyboard = [];
  const nav = pager(l.page, l.totalPages, (p) => cb.ledger(p), pageLabels(v, l.page, l.totalPages));
  if (nav.length) keyboard.push(nav);
  keyboard.push(back);
  return { text: [v.t('ledger.title'), '', lines.join('\n\n')].join('\n'), keyboard };
}
