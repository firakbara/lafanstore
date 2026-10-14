import type { Cents, ReferralStats } from '@tokobun/core';
import { formatPercent } from '@tokobun/i18n';
import { cb } from '../callback';
import { btn, copyBtn, type Keyboard } from '../keyboards';
import type { View } from '../util/view';
import type { Screen } from './types';

export function referralScreen(v: View, d: { stats: ReferralStats; link: string }): Screen {
  const s = d.stats;
  const keyboard: Keyboard = [[copyBtn(v.tp('referral.copy'), d.link, { style: 'primary' })]];
  if (s.available > 0) {
    const row = [btn(v.tp('referral.transfer'), cb.referralTransfer(), { style: 'success' })];
    if (s.available >= s.minWithdraw) row.push(btn(v.tp('referral.withdraw'), cb.referralWithdraw()));
    keyboard.push(row);
  }
  keyboard.push([btn(v.tp('common.back'), cb.main())]);
  return {
    text: v.t('referral.text', {
      percent: formatPercent(s.percentBp),
      max: v.money(s.maxPerTopup),
      d1: s.referred24h,
      d7: s.referred7d,
      total: s.referredTotal,
      earned: v.money(s.earned),
      available: v.money(s.available),
      transferred: v.money(s.transferred),
      withdrawn: v.money(s.withdrawn),
      link: d.link,
    }),
    keyboard,
  };
}

export function withdrawPromptScreen(v: View, d: { amount: Cents; min: Cents }): Screen {
  return {
    text: v.t('referral.withdrawPrompt', { amount: v.money(d.amount), min: v.money(d.min) }),
    keyboard: [[btn(v.tp('common.cancel'), cb.cancelInput(cb.referral()))]],
  };
}
