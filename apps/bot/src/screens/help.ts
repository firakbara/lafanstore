import { cb } from '../callback';
import { btn, urlBtn, type Keyboard } from '../keyboards';
import type { View } from '../util/view';
import type { Screen } from './types';

export function helpScreen(v: View, d: { supportUsername: string | null; supportOpen: boolean; liveSupport: boolean }): Screen {
  const keyboard: Keyboard = [];
  if (d.supportOpen) keyboard.push([btn(v.tp('support.close'), cb.supportClose(), { style: 'danger' })]);
  else if (d.liveSupport) keyboard.push([btn(v.tp('help.liveSupport'), cb.supportOpen(), { style: 'primary' })]);
  if (d.supportUsername) keyboard.push([urlBtn(v.tp('help.contact'), `https://t.me/${d.supportUsername.replace(/^@/, '')}`)]);
  keyboard.push([btn(v.tp('common.back'), cb.main())]);
  return { text: v.t('help.text'), keyboard };
}

export function supportOpenedScreen(v: View, d: { topicName: string | null }): Screen {
  return {
    text: d.topicName ? v.t('support.openedTopic', { topic: d.topicName }) : v.t('support.opened'),
    keyboard: [[btn(v.tp('support.close'), cb.supportClose(), { style: 'danger' })], [btn(v.tp('common.mainMenu'), cb.main())]],
  };
}
