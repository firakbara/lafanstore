import type { Cents } from '@tokobun/core';
import { cb } from '../callback';
import { btn, urlBtn, type Keyboard } from '../keyboards';
import type { View } from '../util/view';
import type { Screen } from './types';

export function mainMenuScreen(v: View, data: { balance: Cents; channelUrl: string | null }): Screen {
  const keyboard: Keyboard = [
    [btn(v.tp('menu.shop'), cb.shop(1, 'all'), { style: 'primary' })],
    [btn(v.tp('menu.topup'), cb.topup()), btn(v.tp('menu.profile'), cb.profile())],
    [btn(v.tp('menu.help'), cb.help()), btn(v.tp('menu.more'), cb.more())],
  ];
  const last = [btn(v.tp('menu.referral'), cb.referral())];
  if (data.channelUrl) last.push(urlBtn(v.tp('menu.channel'), data.channelUrl));
  keyboard.push(last);
  return { text: v.t('menu.welcome', { balance: v.money(data.balance) }), keyboard };
}
