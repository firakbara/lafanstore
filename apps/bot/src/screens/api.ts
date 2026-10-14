import type { ApiKeyInfo } from '@tokobun/core';
import { cb } from '../callback';
import { btn, copyBtn, type Keyboard } from '../keyboards';
import type { View } from '../util/view';
import type { Screen } from './types';

export function apiScreen(v: View, d: { key: ApiKeyInfo | null; baseUrl: string; newKey?: string | null }): Screen {
  const parts = [v.t('api.title', { baseUrl: d.baseUrl }), ''];
  if (d.newKey) parts.push(v.t('api.created', { key: d.newKey }));
  else if (d.key) {
    parts.push(
      v.t('api.active', {
        prefix: d.key.prefix,
        created: v.date(d.key.createdAt),
        lastUsed: d.key.lastUsedAt ? v.date(d.key.lastUsedAt) : v.tp('common.never'),
      }),
    );
  } else parts.push(v.t('api.none'));
  const keyboard: Keyboard = [];
  if (d.newKey) keyboard.push([copyBtn('📋 API key', d.newKey, { style: 'primary' })]);
  keyboard.push(
    d.key
      ? [btn(v.tp('api.regenerate'), cb.apiCreate()), btn(v.tp('api.revoke'), cb.apiRevokeAsk(), { style: 'danger' })]
      : [btn(v.tp('api.create'), cb.apiCreate(), { style: 'success' })],
  );
  keyboard.push([btn(v.tp('common.back'), cb.profile())]);
  return { text: parts.join('\n'), keyboard };
}

export function apiRevokeConfirmScreen(v: View): Screen {
  return {
    text: v.t('api.revokeConfirm'),
    keyboard: [[btn(v.tp('common.yes'), cb.apiRevoke(), { style: 'danger' }), btn(v.tp('common.no'), cb.api())]],
  };
}
