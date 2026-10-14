// A View bundles everything a screen renderer needs to produce text for one user:
// language, money formatting and dates. Screens take a View so they stay pure.
import { formatMoney, type Cents, type StoreSettings, type UserProfile } from '@tokobun/core';
import { resolveLanguage, t, tp } from '@tokobun/i18n';
import { formatDateTime } from './format';

export interface View {
  lang: string;
  currency: string;
  tzOffset: number;
  /** HTML translation (params escaped). */
  t(key: string, params?: Record<string, string | number>): string;
  /** Plain translation for button labels / toasts. */
  tp(key: string, params?: Record<string, string | number>): string;
  money(amount: Cents): string;
  date(d: Date): string;
}

export function createView(opts: {
  lang: string;
  currency: string;
  tzOffset: number;
  money: (amount: Cents) => string;
}): View {
  const lang = resolveLanguage(opts.lang);
  return {
    lang,
    currency: opts.currency,
    tzOffset: opts.tzOffset,
    t: (key, params) => t(lang, key, params),
    tp: (key, params) => tp(lang, key, params),
    money: opts.money,
    date: (d) => formatDateTime(d, opts.tzOffset),
  };
}

export function viewFor(user: UserProfile, settings: StoreSettings): View {
  return createView({
    lang: user.language,
    currency: user.currency,
    tzOffset: user.tzOffsetMinutes,
    money: (amount) => formatMoney(amount, user.currency, settings.fxRates),
  });
}
