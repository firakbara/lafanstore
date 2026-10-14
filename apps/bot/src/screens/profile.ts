import type { UserProfile } from '@tokobun/core';
import { cb } from '../callback';
import { btn, rows, type Keyboard } from '../keyboards';
import { displayName, formatDate, formatTz, TZ_OFFSETS } from '../util/format';
import type { View } from '../util/view';
import type { Screen } from './types';

export function profileScreen(v: View, d: { user: UserProfile }): Screen {
  const u = d.user;
  return {
    text: v.t('profile.text', {
      id: u.id,
      name: displayName(u),
      balance: v.money(u.balance),
      language: v.tp(`language.name.${v.lang}`),
      currency: u.currency,
      tz: formatTz(u.tzOffsetMinutes),
      joined: formatDate(u.createdAt, u.tzOffsetMinutes),
    }),
    keyboard: [
      [btn(v.tp('profile.notifications'), cb.notify()), btn(v.tp('profile.orders'), cb.orders())],
      [btn(v.tp('profile.ledger'), cb.ledger()), btn(v.tp('profile.api'), cb.api())],
      [btn(v.tp('profile.language'), cb.language()), btn(v.tp('profile.currency'), cb.currency())],
      [btn(v.tp('profile.timezone'), cb.timezone())],
      [btn(v.tp('common.back'), cb.main())],
    ],
  };
}

export function notifyScreen(v: View, d: { user: UserProfile }): Screen {
  const state = (on: boolean) => v.tp(on ? 'common.on' : 'common.off');
  const toggle = (key: string, flag: 'stock' | 'info' | 'referral', on: boolean) =>
    btn(v.tp(key, { state: state(on) }), cb.notifyToggle(flag), { style: on ? 'success' : 'danger' });
  return {
    text: v.t('notify.title'),
    keyboard: [
      [toggle('notify.stock', 'stock', d.user.notifyStock)],
      [toggle('notify.info', 'info', d.user.notifyInfo)],
      [toggle('notify.referral', 'referral', d.user.notifyReferral)],
      [btn(v.tp('common.back'), cb.profile())],
    ],
  };
}

export function languageScreen(v: View, d: { current: string; languages: readonly string[] }): Screen {
  const keyboard: Keyboard = rows(
    d.languages.map((code) =>
      btn(`${code === d.current ? '✅ ' : ''}${v.tp(`language.name.${code}`)}`, cb.languageSet(code)),
    ),
    2,
  );
  keyboard.push([btn(v.tp('common.back'), cb.profile())]);
  return { text: v.t('language.title'), keyboard };
}

export function currencyScreen(v: View, d: { current: string; currencies: string[] }): Screen {
  const keyboard = rows(
    d.currencies.map((c) => btn(`${c === d.current ? '✅ ' : ''}${c}`, cb.currencySet(c))),
    3,
  );
  keyboard.push([btn(v.tp('common.back'), cb.profile())]);
  return { text: v.t('currency.title'), keyboard };
}

export function timezoneScreen(v: View, d: { current: number }): Screen {
  const keyboard = rows(
    TZ_OFFSETS.map((m) => btn(`${m === d.current ? '✅ ' : ''}${formatTz(m)}`, cb.timezoneSet(m))),
    4,
  );
  keyboard.push([btn(v.tp('common.back'), cb.profile())]);
  return { text: v.t('timezone.title', { tz: formatTz(d.current) }), keyboard };
}
