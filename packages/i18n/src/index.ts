// @tokobun/i18n — all user-facing bot text, shared by apps/bot and apps/api (payment notifications).
// SIGNATURES ARE FROZEN. Owned by the bot workstream; locales live in ./locales/<lang>.ts
import { formatMoney, type OrderDetail, type Cents } from '@tokobun/core';
import { en } from './locales/en';
import { id, type LocaleKey } from './locales/id';

export type { LocaleKey } from './locales/id';

export const SUPPORTED_LANGUAGES: readonly string[] = ['id', 'en'];

/** All locale tables, keyed by language code. */
export const LOCALES: Readonly<Record<string, Readonly<Record<string, string>>>> = { id, en };

const FALLBACK_LANG = 'en';

/** Escape text for Telegram HTML (parse_mode: 'HTML'). */
export function escapeHtml(value: string | number): string {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function lookup(lang: string, key: string): string {
  return LOCALES[lang]?.[key] ?? LOCALES[FALLBACK_LANG]?.[key] ?? key;
}

function interpolate(template: string, params: Record<string, string | number> | undefined, escape: boolean): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    if (value === undefined) return match;
    return escape ? escapeHtml(value) : String(value);
  });
}

/** Translate `key` for `lang` (falls back to 'en', then the key itself). {name} placeholders are replaced.
 *  Output is Telegram HTML (parse_mode: 'HTML'); params are HTML-escaped. */
export function t(lang: string, key: string, params?: Record<string, string | number>): string {
  return interpolate(lookup(lang, key), params, true);
}

/** Plain-text variant of `t` for button labels, toasts and alerts (no HTML parsing there):
 *  params are inserted verbatim. Use only with keys whose template contains no HTML. */
export function tp(lang: string, key: string, params?: Record<string, string | number>): string {
  return interpolate(lookup(lang, key), params, false);
}

/** True when `key` exists in the given locale (no fallback). */
export function hasKey(lang: string, key: string): boolean {
  return LOCALES[lang]?.[key] !== undefined;
}

/** Normalise any language code to a supported one ('id-ID' → 'id', unknown → 'en'). */
export function resolveLanguage(lang: string | null | undefined): string {
  const base = (lang ?? '').toLowerCase().split(/[-_]/)[0] ?? '';
  return SUPPORTED_LANGUAGES.includes(base) ? base : FALLBACK_LANG;
}

/** Basis points → percent string with one decimal, e.g. 600 → "6.0". */
export function formatPercent(bp: number): string {
  return (bp / 100).toFixed(1);
}

export interface MoneyCtx {
  currency: string;
  fxRates: Record<string, number>;
}

/** Format base cents for `money` (thin wrapper over core formatMoney). */
export function money(amount: Cents, ctx: MoneyCtx): string {
  return formatMoney(amount, ctx.currency, ctx.fxRates);
}

/** Deliveries above these limits are sent as a .txt attachment. */
export const DELIVERY_MAX_INLINE_ITEMS = 10;
export const DELIVERY_MAX_INLINE_CHARS = 3500;

/** Message sent after a successful purchase. When there are many/long items, `file` holds a .txt
 *  attachment and `text` is a short summary. */
export function renderOrderDelivery(order: OrderDetail, lang: string, money_: MoneyCtx): { text: string; file: { filename: string; content: string } | null } {
  const header = t(lang, 'delivery.header', {
    code: order.code,
    product: order.productName,
    qty: order.quantity,
    total: money(order.total, money_),
  });
  const footer: string[] = [];
  if (order.warranty) footer.push(t(lang, 'delivery.warranty', { warranty: order.warranty }));
  footer.push(t(lang, 'delivery.thanks'));

  const numbered = order.items.length > 1;
  const itemsBlock = order.items
    .map((item, i) => (numbered ? `${i + 1}. <code>${escapeHtml(item)}</code>` : `<code>${escapeHtml(item)}</code>`))
    .join('\n');
  const suffix = t(lang, 'delivery.itemsSuffix');
  const inline = [header, '', t(lang, 'delivery.items'), itemsBlock, suffix, '', ...footer].join('\n');

  if (order.items.length <= DELIVERY_MAX_INLINE_ITEMS && inline.length <= DELIVERY_MAX_INLINE_CHARS) {
    return { text: inline, file: null };
  }
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const fileHeader = tp(lang, 'delivery.fileHeader', { code: order.code, product: order.productName, qty: order.quantity, date });
  const fileItems = order.items.map((item, i) => (numbered ? `${i + 1}. ${item}` : item)).join('\n');
  return {
    text: [header, '', t(lang, 'delivery.file', { count: order.items.length }), '', ...footer].join('\n'),
    file: {
      filename: `${order.code}.txt`,
      content: `${fileHeader}\n${'─'.repeat(30)}\n\n${fileItems}\n`,
    },
  };
}

/** Message sent when a wallet top-up is credited. */
export function renderTopupSuccess(input: { credited: Cents; balance: Cents }, lang: string, money_: MoneyCtx): string {
  return t(lang, 'topup.success', { credited: money(input.credited, money_), balance: money(input.balance, money_) });
}

/** Message sent to a referrer when they earn a commission. */
export function renderReferralEarned(input: { amount: Cents }, lang: string, money_: MoneyCtx): string {
  return t(lang, 'referral.earned', { amount: money(input.amount, money_) });
}

// Compile-time guard: `id` is the canonical key set.
const _keys: readonly LocaleKey[] = Object.keys(id) as LocaleKey[];
/** Every translation key (from the canonical 'id' locale). */
export const ALL_KEYS: readonly string[] = _keys;
