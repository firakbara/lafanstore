import type { Cents, ProductDetail } from '@tokobun/core';
import type { PaymentMethodInfo, PaymentView } from '@tokobun/payments';
import { cb } from '../callback';
import { btn, rows, urlBtn, type Keyboard } from '../keyboards';
import { minutesLeft } from '../util/format';
import type { View } from '../util/view';
import type { Screen } from './types';

export function topupMethodsScreen(v: View, d: { methods: PaymentMethodInfo[]; balance: Cents; min: Cents }): Screen {
  const back = [btn(v.tp('common.back'), cb.main())];
  if (d.methods.length === 0) return { text: v.t('topup.noMethods'), keyboard: [back] };
  const keyboard: Keyboard = rows(
    d.methods.map((m) => btn(m.label, cb.topupMethod(m.provider, m.method))),
    2,
  );
  keyboard.push(back);
  return { text: v.t('topup.methods', { balance: v.money(d.balance), min: v.money(d.min) }), keyboard };
}

export function topupAmountScreen(
  v: View,
  d: { method: PaymentMethodInfo; currency: string; example: string; min: Cents },
): Screen {
  return {
    text: v.t('topup.askAmount', { method: d.method.label, currency: d.currency, example: d.example, min: v.money(d.min) }),
    keyboard: [[btn(v.tp('common.cancel'), cb.cancelInput(cb.topup()))]],
  };
}

export function orderMethodsScreen(
  v: View,
  d: { product: ProductDetail; qty: number; total: Cents; methods: PaymentMethodInfo[] },
): Screen {
  const back = [btn(v.tp('common.back'), cb.product(d.product.id, d.qty))];
  if (d.methods.length === 0) return { text: v.t('pay.noMethods'), keyboard: [back] };
  const keyboard = rows(
    d.methods.map((m) => btn(m.label, cb.payWith(d.product.id, d.qty, m.provider, m.method))),
    2,
  );
  keyboard.push(back);
  return { text: v.t('pay.methods', { name: d.product.name, qty: d.qty, total: v.money(d.total) }), keyboard };
}

/** Invoice for a pending payment. `qrPng` (if given) is shown as the photo. */
export function invoiceScreen(
  v: View,
  d: { payment: PaymentView; methodLabel?: string | null; qrPng?: Uint8Array | null; now?: Date },
): Screen {
  const p = d.payment;
  if (p.status !== 'pending') return invoiceClosedScreen(v, p);
  const lines = [
    v.t('invoice.title', { code: p.code }),
    '',
    v.t('invoice.purpose', { purpose: v.tp(`invoice.purpose.${p.purpose}`) }),
    v.t('invoice.method', { method: d.methodLabel ?? p.method }),
    v.t('invoice.amount', { amount: v.money(p.amount) }),
  ];
  if (p.fee > 0) lines.push(v.t('invoice.fee', { fee: v.money(p.fee) }));
  lines.push(v.t('invoice.payAmount', { payAmount: p.payAmount, payCurrency: p.payCurrency }));
  if (p.expiresAt) {
    lines.push(v.t('invoice.expires', { time: v.date(p.expiresAt), minutes: minutesLeft(p.expiresAt, d.now) }));
  }
  lines.push(v.t('invoice.status', { status: v.tp(`paymentStatus.${p.status}`) }));
  if (d.qrPng) lines.push('', v.t('invoice.scanQr'));

  const keyboard: Keyboard = [];
  if (p.checkoutUrl) keyboard.push([urlBtn(v.tp('invoice.openLink'), p.checkoutUrl, { style: 'success' })]);
  keyboard.push([
    btn(v.tp('invoice.check'), cb.invoiceCheck(p.id), { style: 'primary' }),
    btn(v.tp('invoice.cancel'), cb.invoiceCancel(p.id), { style: 'danger' }),
  ]);
  keyboard.push([btn(v.tp('common.mainMenu'), cb.main())]);
  const screen: Screen = { text: lines.join('\n'), keyboard };
  if (d.qrPng) screen.photo = d.qrPng;
  return screen;
}

export function invoiceClosedScreen(v: View, p: PaymentView): Screen {
  return {
    text: v.t('invoice.closed', { code: p.code, status: v.tp(`paymentStatus.${p.status}`) }),
    keyboard: [[btn(v.tp('common.mainMenu'), cb.main())]],
  };
}

/** Shown in the menu message after a top-up was credited (text from renderTopupSuccess). */
export function topupDoneScreen(v: View, text: string): Screen {
  return {
    text,
    keyboard: [[btn(v.tp('menu.shop'), cb.shop(1, 'all'), { style: 'primary' }), btn(v.tp('common.mainMenu'), cb.main())]],
  };
}
