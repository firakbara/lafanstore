// Sending purchased items to the buyer + sale notifications to the admin chat.
import type { OrderDetail, StoreSettings, UserProfile } from '@tokobun/core';
import { renderOrderDelivery, t } from '@tokobun/i18n';
import { InputFile, type Api } from 'grammy';
import type { BotConfig } from '../config';
import { displayName } from './format';

const CAPTION_LIMIT = 1024;

export async function deliverOrder(
  api: Api,
  chatId: number,
  order: OrderDetail,
  user: Pick<UserProfile, 'language' | 'currency'>,
  settings: Pick<StoreSettings, 'fxRates'>,
): Promise<void> {
  const { text, file } = renderOrderDelivery(order, user.language, { currency: user.currency, fxRates: settings.fxRates });
  if (!file) {
    await api.sendMessage(chatId, text, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    return;
  }
  const doc = new InputFile(new TextEncoder().encode(file.content), file.filename);
  if (text.length <= CAPTION_LIMIT) {
    await api.sendDocument(chatId, doc, { caption: text, parse_mode: 'HTML' });
  } else {
    await api.sendMessage(chatId, text, { parse_mode: 'HTML' });
    await api.sendDocument(chatId, doc);
  }
}

/** Post a sale to ADMIN_CHAT_ID (no-op when unset). Never throws. Amounts in USD. */
export async function notifyAdminSale(
  api: Api,
  cfg: BotConfig,
  buyer: Pick<UserProfile, 'id' | 'username' | 'firstName'>,
  order: OrderDetail,
  money: (cents: number) => string,
): Promise<void> {
  if (!cfg.adminChatId) return;
  const lang = cfg.adminLang;
  const text = t(lang, 'admin.sale', {
    code: order.code,
    user: buyer.username ? `@${buyer.username}` : displayName(buyer),
    userId: buyer.id,
    product: order.productName,
    qty: order.quantity,
    total: money(order.total),
    paidWith: t(lang, `orders.paidWith.${order.paidWith}`),
  });
  await api.sendMessage(cfg.adminChatId, text, { parse_mode: 'HTML' }).catch((err) => {
    console.warn('[bot] admin sale notification failed:', (err as Error).message);
  });
}
