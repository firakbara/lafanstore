// Profil Saya: notifications, orders, ledger, developer API, language, currency, time zone.
import {
  CoreError,
  createApiKey,
  getActiveApiKey,
  getOrder,
  getUser,
  listLedger,
  listUserOrders,
  revokeApiKeys,
  setCurrency,
  setLanguage,
  setTimezone,
  toggleNotify,
} from '@tokobun/core';
import { SUPPORTED_LANGUAGES } from '@tokobun/i18n';
import { A, intArg, notifyFromCode } from '../callback';
import type { BotContext } from '../context';
import { apiRevokeConfirmScreen, apiScreen } from '../screens/api';
import { ledgerScreen, orderDetailScreen, ordersScreen } from '../screens/orders';
import { currencyScreen, languageScreen, notifyScreen, profileScreen, timezoneScreen } from '../screens/profile';
import { deliverOrder } from '../util/delivery';
import { TZ_OFFSETS } from '../util/format';
import { show, toast } from '../util/render';
import { viewFor } from '../util/view';
import type { CallbackMap } from './types';

const ORDERS_PAGE_SIZE = 8;
const LEDGER_PAGE_SIZE = 10;

async function reloadUser(ctx: BotContext): Promise<void> {
  const u = await getUser(ctx.user.id);
  if (!u) throw new CoreError('NOT_FOUND');
  ctx.user = u;
  ctx.v = viewFor(u, ctx.settings);
}

export async function showProfile(ctx: BotContext) {
  await show(ctx, profileScreen(ctx.v, { user: ctx.user }));
}
export async function showOrders(ctx: BotContext, page = 1) {
  const orders = await listUserOrders(ctx.user.id, Math.max(1, page), ORDERS_PAGE_SIZE, ctx.storeId);
  await show(ctx, ordersScreen(ctx.v, { orders }));
}
export async function showLanguage(ctx: BotContext) {
  await show(ctx, languageScreen(ctx.v, { current: ctx.v.lang, languages: SUPPORTED_LANGUAGES }));
}
export async function showApi(ctx: BotContext, newKey: string | null = null) {
  const key = await getActiveApiKey(ctx.user.id);
  const baseUrl = ctx.cfg.publicApiUrl ? `${ctx.cfg.publicApiUrl.replace(/\/+$/, '')}/v1` : '-';
  await show(ctx, apiScreen(ctx.v, { key, baseUrl, newKey }));
}

function currencies(ctx: BotContext): string[] {
  return [...new Set(['USD', ...Object.keys(ctx.settings.fxRates)])];
}

export const profileCallbacks: CallbackMap = {
  [A.profile]: async (ctx) => showProfile(ctx),
  [A.notify]: async (ctx) => show(ctx, notifyScreen(ctx.v, { user: ctx.user })),
  [A.notifyToggle]: async (ctx, args) => {
    const flag = notifyFromCode(args[0]);
    if (!flag) throw new CoreError('INVALID_INPUT');
    const on = await toggleNotify(ctx.user.id, flag);
    const key = flag === 'stock' ? 'notifyStock' : flag === 'info' ? 'notifyInfo' : 'notifyReferral';
    ctx.user = { ...ctx.user, [key]: on };
    await show(ctx, notifyScreen(ctx.v, { user: ctx.user }));
  },
  [A.orders]: async (ctx, args) => showOrders(ctx, intArg(args, 0, 1)),
  [A.order]: async (ctx, args) => {
    const order = await getOrder(intArg(args, 0, 0), ctx.user.id);
    if (!order) throw new CoreError('NOT_FOUND');
    await show(ctx, orderDetailScreen(ctx.v, { order, fromPage: intArg(args, 1, 1) }));
  },
  [A.orderResend]: async (ctx, args) => {
    const order = await getOrder(intArg(args, 0, 0), ctx.user.id);
    if (!order || order.status !== 'completed') throw new CoreError('NOT_FOUND');
    await deliverOrder(ctx.api, ctx.chat!.id, order, ctx.user, ctx.settings);
    await toast(ctx, ctx.v.tp('orders.resent'));
  },
  [A.ledger]: async (ctx, args) => {
    const ledger = await listLedger(ctx.user.id, Math.max(1, intArg(args, 0, 1)), LEDGER_PAGE_SIZE);
    await show(ctx, ledgerScreen(ctx.v, { ledger }));
  },
  [A.api]: async (ctx) => showApi(ctx),
  [A.apiCreate]: async (ctx) => {
    const { key } = await createApiKey(ctx.storeId, ctx.user.id);
    await showApi(ctx, key);
  },
  [A.apiRevokeAsk]: async (ctx) => show(ctx, apiRevokeConfirmScreen(ctx.v)),
  [A.apiRevoke]: async (ctx) => {
    await revokeApiKeys(ctx.user.id);
    await toast(ctx, ctx.v.tp('api.revoked'));
    await showApi(ctx);
  },
  [A.language]: async (ctx) => showLanguage(ctx),
  [A.languageSet]: async (ctx, args) => {
    const code = args[0] ?? '';
    if (!SUPPORTED_LANGUAGES.includes(code)) throw new CoreError('INVALID_INPUT');
    await setLanguage(ctx.storeId, ctx.user.id, code);
    await reloadUser(ctx);
    await toast(ctx, ctx.v.tp('language.changed'));
    await showProfile(ctx);
  },
  [A.currency]: async (ctx) => show(ctx, currencyScreen(ctx.v, { current: ctx.user.currency, currencies: currencies(ctx) })),
  [A.currencySet]: async (ctx, args) => {
    const code = args[0] ?? '';
    if (!currencies(ctx).includes(code)) throw new CoreError('INVALID_INPUT');
    await setCurrency(ctx.user.id, code);
    await reloadUser(ctx);
    await toast(ctx, ctx.v.tp('currency.changed'));
    await showProfile(ctx);
  },
  [A.timezone]: async (ctx) => show(ctx, timezoneScreen(ctx.v, { current: ctx.user.tzOffsetMinutes })),
  [A.timezoneSet]: async (ctx, args) => {
    const offset = intArg(args, 0, NaN);
    if (!TZ_OFFSETS.includes(offset)) throw new CoreError('INVALID_INPUT');
    await setTimezone(ctx.user.id, offset);
    await reloadUser(ctx);
    await toast(ctx, ctx.v.tp('timezone.changed'));
    await showProfile(ctx);
  },
};
