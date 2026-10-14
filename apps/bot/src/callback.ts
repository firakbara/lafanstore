// Compact callback_data codec. Format: "<action>[:<arg>]*", at most 64 bytes (Telegram limit).
// Every button in the bot is built through `cb.*` so formats live in one place; the router
// (handlers/router.ts) decodes them back with `decode`.
import type { CatalogSort, NotifyFlag } from '@tokobun/core';

export const MAX_CALLBACK_BYTES = 64;

export type Arg = string | number;

export function encode(action: string, ...args: Arg[]): string {
  for (const a of [action, ...args]) {
    if (String(a).includes(':')) throw new Error(`callback arg must not contain ':' (${String(a)})`);
  }
  const data = [action, ...args.map(String)].join(':');
  if (new TextEncoder().encode(data).length > MAX_CALLBACK_BYTES) {
    throw new Error(`callback_data too long (${data})`);
  }
  return data;
}

export interface Decoded {
  action: string;
  args: string[];
}

export function decode(data: string): Decoded {
  const [action = '', ...args] = data.split(':');
  return { action, args };
}

/** Parse an integer arg; returns `fallback` if missing or malformed. */
export function intArg(args: string[], i: number, fallback: number): number {
  const v = args[i];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : fallback;
}

const SORT_CODES: Record<CatalogSort, string> = { all: 'a', available: 'v', soldout: 's', promo: 'p' };
export const SORT_ORDER: readonly CatalogSort[] = ['all', 'available', 'soldout', 'promo'];

export function sortCode(sort: CatalogSort): string {
  return SORT_CODES[sort];
}
export function sortFromCode(code: string | undefined): CatalogSort {
  return SORT_ORDER.find((s) => SORT_CODES[s] === code) ?? 'all';
}
export function nextSort(sort: CatalogSort): CatalogSort {
  return SORT_ORDER[(SORT_ORDER.indexOf(sort) + 1) % SORT_ORDER.length]!;
}

const NOTIFY_CODES: Record<NotifyFlag, string> = { stock: 's', info: 'i', referral: 'r' };
export function notifyFromCode(code: string | undefined): NotifyFlag | null {
  return (Object.keys(NOTIFY_CODES) as NotifyFlag[]).find((f) => NOTIFY_CODES[f] === code) ?? null;
}

/** Action names. Kept short: they count against the 64-byte limit. */
export const A = {
  noop: 'x',
  main: 'm',
  shop: 's', // s:<page>:<sort>:<parentId|0>[:r]  (r = refresh pressed)
  product: 'p', // p:<id>:<qty>:<typing 0|1>
  note: 'n', // n:<id>:<qty>
  voucher: 'v', // v:<id>:<qty>  (asks for a code via text)
  voucherDel: 'vx', // vx:<id>:<qty>
  buyConfirm: 'b', // b:<id>:<qty>
  buy: 'B', // B:<id>:<qty>
  payMethods: 'dp', // dp:<id>:<qty>
  payWith: 'dm', // dm:<id>:<qty>:<provider>:<method>
  topup: 't',
  topupMethod: 'tm', // tm:<provider>:<method>
  invoice: 'pi', // pi:<paymentId>
  invoiceCheck: 'pc', // pc:<paymentId>
  invoiceCancel: 'px', // px:<paymentId>
  profile: 'pr',
  notify: 'nt',
  notifyToggle: 'ntt', // ntt:<flag code>
  orders: 'o', // o:<page>
  order: 'od', // od:<orderId>:<fromPage>
  orderResend: 'or', // or:<orderId>
  ledger: 'l', // l:<page>
  api: 'ap',
  apiCreate: 'apc',
  apiRevokeAsk: 'apr',
  apiRevoke: 'apR',
  language: 'lg',
  languageSet: 'lgs', // lgs:<code>
  currency: 'cu',
  currencySet: 'cus', // cus:<code>
  timezone: 'tz',
  timezoneSet: 'tzs', // tzs:<offsetMinutes>
  help: 'h',
  supportOpen: 'hs',
  supportClose: 'hx',
  more: 'mo',
  twofa: '2f',
  twofaRefresh: '2r',
  rating: 'rt',
  rate: 'rs', // rs:<1|-1>
  referral: 'r',
  referralTransfer: 'rtw',
  referralWithdraw: 'rwd',
  cancelInput: 'ci', // ci:<callback to go to afterwards...>
} as const;

/** Typed builders for every callback the bot emits. */
export const cb = {
  noop: () => encode(A.noop),
  main: () => encode(A.main),
  shop: (page: number, sort: CatalogSort, parentId?: number | null) => encode(A.shop, page, sortCode(sort), parentId ?? 0),
  shopRefresh: (page: number, sort: CatalogSort, parentId?: number | null) =>
    encode(A.shop, page, sortCode(sort), parentId ?? 0, 'r'),
  product: (id: number, qty: number, typing = false) => encode(A.product, id, qty, typing ? 1 : 0),
  note: (id: number, qty: number) => encode(A.note, id, qty),
  voucher: (id: number, qty: number) => encode(A.voucher, id, qty),
  voucherDel: (id: number, qty: number) => encode(A.voucherDel, id, qty),
  buyConfirm: (id: number, qty: number) => encode(A.buyConfirm, id, qty),
  buy: (id: number, qty: number) => encode(A.buy, id, qty),
  payMethods: (id: number, qty: number) => encode(A.payMethods, id, qty),
  payWith: (id: number, qty: number, provider: string, method: string) => encode(A.payWith, id, qty, provider, method),
  topup: () => encode(A.topup),
  topupMethod: (provider: string, method: string) => encode(A.topupMethod, provider, method),
  invoice: (paymentId: number) => encode(A.invoice, paymentId),
  invoiceCheck: (paymentId: number) => encode(A.invoiceCheck, paymentId),
  invoiceCancel: (paymentId: number) => encode(A.invoiceCancel, paymentId),
  profile: () => encode(A.profile),
  notify: () => encode(A.notify),
  notifyToggle: (flag: NotifyFlag) => encode(A.notifyToggle, NOTIFY_CODES[flag]),
  orders: (page = 1) => encode(A.orders, page),
  order: (orderId: number, fromPage = 1) => encode(A.order, orderId, fromPage),
  orderResend: (orderId: number) => encode(A.orderResend, orderId),
  ledger: (page = 1) => encode(A.ledger, page),
  api: () => encode(A.api),
  apiCreate: () => encode(A.apiCreate),
  apiRevokeAsk: () => encode(A.apiRevokeAsk),
  apiRevoke: () => encode(A.apiRevoke),
  language: () => encode(A.language),
  languageSet: (code: string) => encode(A.languageSet, code),
  currency: () => encode(A.currency),
  currencySet: (code: string) => encode(A.currencySet, code),
  timezone: () => encode(A.timezone),
  timezoneSet: (offsetMinutes: number) => encode(A.timezoneSet, offsetMinutes),
  help: () => encode(A.help),
  supportOpen: () => encode(A.supportOpen),
  supportClose: () => encode(A.supportClose),
  more: () => encode(A.more),
  twofa: () => encode(A.twofa),
  twofaRefresh: () => encode(A.twofaRefresh),
  rating: () => encode(A.rating),
  rate: (value: 1 | -1) => encode(A.rate, value),
  referral: () => encode(A.referral),
  referralTransfer: () => encode(A.referralTransfer),
  referralWithdraw: () => encode(A.referralWithdraw),
  /** Cancel the pending text input, then continue to `next` (another encoded callback). */
  cancelInput: (next: string) => {
    const { action, args } = decode(next);
    return encode(A.cancelInput, action, ...args);
  },
};

/** Inverse of cb.cancelInput: the callback to continue to after cancelling. */
export function cancelInputTarget(args: string[]): string {
  return args.length ? args.join(':') : cb.main();
}
