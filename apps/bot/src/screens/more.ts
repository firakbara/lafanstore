import { cb } from '../callback';
import { btn, copyBtn } from '../keyboards';
import type { View } from '../util/view';
import type { Screen } from './types';

export function moreScreen(v: View): Screen {
  return {
    text: v.t('more.title'),
    keyboard: [
      [btn(v.tp('more.twofa'), cb.twofa()), btn(v.tp('more.rating'), cb.rating())],
      [btn(v.tp('common.back'), cb.main())],
    ],
  };
}

export function twofaPromptScreen(v: View): Screen {
  return { text: v.t('twofa.prompt'), keyboard: [[btn(v.tp('common.cancel'), cb.cancelInput(cb.more()))]] };
}

export function twofaResultScreen(v: View, d: { code: string; secondsRemaining: number }): Screen {
  return {
    text: v.t('twofa.result', { code: d.code, seconds: d.secondsRemaining }),
    keyboard: [
      [copyBtn(d.code, d.code, { style: 'primary' })],
      [btn(v.tp('twofa.refresh'), cb.twofaRefresh()), btn(v.tp('twofa.new'), cb.twofa())],
      [btn(v.tp('common.back'), cb.more())],
    ],
  };
}

export function ratingScreen(v: View): Screen {
  return {
    text: v.t('rating.title'),
    keyboard: [
      [btn(v.tp('rating.up'), cb.rate(1), { style: 'success' }), btn(v.tp('rating.down'), cb.rate(-1), { style: 'danger' })],
      [btn(v.tp('common.back'), cb.more())],
    ],
  };
}
