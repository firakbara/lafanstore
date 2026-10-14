// Isi Saldo + invoice lifecycle (Cek Status / Batalkan). Also used by direct pay (shop.ts).
import { CoreError, formatMoney, getBalance, toBaseCents } from '@tokobun/core';
import { renderTopupSuccess } from '@tokobun/i18n';
import {
  cancelPayment,
  createTopupPayment,
  getPayment,
  refreshPaymentStatus,
  type PaymentMethodInfo,
  type PaymentView,
} from '@tokobun/payments';
import { A, cb, intArg } from '../callback';
import type { BotContext } from '../context';
import { invoiceClosedScreen, invoiceScreen, topupAmountScreen, topupDoneScreen, topupMethodsScreen } from '../screens/payment';
import { withNotice } from '../screens/types';
import { btn } from '../keyboards';
import { exampleAmount, parseAmount } from '../util/amount';
import { cachedMethods, countryOf } from '../util/cache';
import { deliverOrder, notifyAdminSale } from '../util/delivery';
import { withUserLock } from '../util/lock';
import { qrPng } from '../util/qr';
import { deleteInput, show, toast } from '../util/render';
import type { InputState } from '../util/session';
import { showMain } from './menu';
import type { CallbackMap } from './types';

export async function showTopup(ctx: BotContext): Promise<void> {
  delete ctx.session.input;
  const methods = await cachedMethods(ctx.storeId, 'topup', countryOf(ctx.user));
  await show(ctx, topupMethodsScreen(ctx.v, { methods, balance: ctx.user.balance, min: ctx.settings.topupMin }));
}

async function findMethod(ctx: BotContext, purpose: 'topup' | 'order', provider: string, method: string): Promise<PaymentMethodInfo | null> {
  const methods = await cachedMethods(ctx.storeId, purpose, countryOf(ctx.user)).catch(() => []);
  return methods.find((m) => m.provider === provider && m.method === method) ?? null;
}

function topupMin(ctx: BotContext, m: PaymentMethodInfo): number {
  return Math.max(ctx.settings.topupMin, m.minAmount);
}

function exampleFor(ctx: BotContext, m: PaymentMethodInfo): string {
  const currency = ctx.user.currency;
  const rate = currency === 'USD' ? 1 : (ctx.settings.fxRates[currency] ?? 1);
  return exampleAmount((topupMin(ctx, m) / 100) * rate, currency);
}

function amountPrompt(ctx: BotContext, m: PaymentMethodInfo) {
  return topupAmountScreen(ctx.v, { method: m, currency: ctx.user.currency, example: exampleFor(ctx, m), min: topupMin(ctx, m) });
}

export async function showInvoice(ctx: BotContext, payment: PaymentView, notice?: string): Promise<void> {
  const method = await findMethod(ctx, payment.purpose, payment.provider, payment.method);
  const qr = payment.status === 'pending' && payment.qrString ? await qrPng(payment.qrString) : null;
  let screen = invoiceScreen(ctx.v, { payment, methodLabel: method?.label, qrPng: qr });
  if (notice) screen = withNotice(screen, notice);
  await show(ctx, screen);
}

/** Text input: top-up amount in the user's display currency. */
export async function onTopupAmount(ctx: BotContext, state: Extract<InputState, { kind: 'topup' }>, text: string): Promise<void> {
  await deleteInput(ctx);
  const m = await findMethod(ctx, 'topup', state.provider, state.method);
  if (!m) {
    delete ctx.session.input;
    return showTopup(ctx);
  }
  const prompt = amountPrompt(ctx, m);
  const major = parseAmount(text, ctx.user.currency);
  if (major === null) {
    return show(ctx, withNotice(prompt, ctx.v.t('topup.invalidAmount', { example: exampleFor(ctx, m) })));
  }
  const cents = toBaseCents(major, ctx.user.currency, ctx.settings.fxRates);
  const min = topupMin(ctx, m);
  if (cents < min) return show(ctx, withNotice(prompt, ctx.v.t('topup.tooSmall', { min: ctx.v.money(min) })));
  if (m.maxAmount !== null && cents > m.maxAmount) {
    return show(ctx, withNotice(prompt, ctx.v.t('topup.tooLarge', { max: ctx.v.money(m.maxAmount) })));
  }
  const ran = await withUserLock(ctx.user.id, async () => {
    const payment = await createTopupPayment({ storeId: ctx.storeId, userId: ctx.user.id, amount: cents, provider: m.provider, method: m.method });
    delete ctx.session.input;
    await showInvoice(ctx, payment);
  });
  if (!ran) await toast(ctx, ctx.v.tp('errors.RATE_LIMITED'));
}

async function checkInvoice(ctx: BotContext, paymentId: number): Promise<void> {
  const { payment, settled } = await refreshPaymentStatus(paymentId, ctx.user.id);
  if (settled && !settled.alreadySettled) {
    const money = { currency: ctx.user.currency, fxRates: ctx.settings.fxRates };
    if (settled.purpose === 'topup') {
      const balance = await getBalance(ctx.user.id);
      ctx.user = { ...ctx.user, balance };
      await show(ctx, topupDoneScreen(ctx.v, renderTopupSuccess({ credited: settled.credited, balance }, ctx.v.lang, money)));
      return;
    }
    if (settled.order) {
      const order = settled.order;
      const refunded = order.status === 'refunded';
      await show(ctx, {
        text: refunded
          ? ctx.v.t('payment.orderRefunded', { code: order.code, amount: ctx.v.money(order.total) })
          : ctx.v.t('invoice.paidOrder', { code: order.code }),
        keyboard: [
          [btn(ctx.v.tp('purchase.myOrders'), cb.order(order.id)), btn(ctx.v.tp('purchase.again'), cb.shop(1, 'all'))],
          [btn(ctx.v.tp('common.mainMenu'), cb.main())],
        ],
      });
      if (refunded) return;
      await deliverOrder(ctx.api, ctx.chat!.id, order, ctx.user, ctx.settings);
      await notifyAdminSale(ctx.api, ctx.cfg, ctx.user, order, (c) => formatMoney(c, 'USD', ctx.settings.fxRates));
      return;
    }
  }
  if (payment.status === 'pending') {
    await toast(ctx, ctx.v.tp('invoice.stillPending'));
    await showInvoice(ctx, payment); // refreshes the countdown
    return;
  }
  if (payment.status === 'paid') await toast(ctx, ctx.v.tp('invoice.alreadyPaid'));
  await show(ctx, invoiceClosedScreen(ctx.v, payment));
}

export const topupCallbacks: CallbackMap = {
  [A.topup]: async (ctx) => showTopup(ctx),
  [A.topupMethod]: async (ctx, args) => {
    const [provider = '', method = ''] = args;
    const m = await findMethod(ctx, 'topup', provider, method);
    if (!m) throw new CoreError('NOT_FOUND');
    ctx.session.input = { kind: 'topup', provider, method };
    await show(ctx, amountPrompt(ctx, m));
  },
  [A.invoice]: async (ctx, args) => {
    const payment = await getPayment(intArg(args, 0, 0), ctx.user.id);
    if (!payment) throw new CoreError('NOT_FOUND');
    await showInvoice(ctx, payment);
  },
  [A.invoiceCheck]: async (ctx, args) => {
    const ran = await withUserLock(ctx.user.id, () => checkInvoice(ctx, intArg(args, 0, 0)));
    if (!ran) await toast(ctx, ctx.v.tp('errors.RATE_LIMITED'));
  },
  [A.invoiceCancel]: async (ctx, args) => {
    const ran = await withUserLock(ctx.user.id, async () => {
      await cancelPayment(intArg(args, 0, 0), ctx.user.id);
      await toast(ctx, ctx.v.tp('invoice.cancelledToast'));
      await showMain(ctx);
    });
    if (!ran) await toast(ctx, ctx.v.tp('errors.RATE_LIMITED'));
  },
};
