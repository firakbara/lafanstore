// Real wiring: core + payments + grammY Telegram sender.
import * as core from '@tokobun/core';
import * as i18n from '@tokobun/i18n';
import * as payments from '@tokobun/payments';
import { Api, InputFile } from 'grammy';
import type { ApiDeps } from './app';
import { createNotifier, type TelegramSender } from './notify';

export function createTelegramSender(token: string): TelegramSender {
  const api = new Api(token);
  return {
    sendMessage: (chatId, html) => api.sendMessage(chatId, html, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }),
    sendDocument: (chatId, file, caption) =>
      api.sendDocument(chatId, new InputFile(new TextEncoder().encode(file.content), file.filename), caption ? { caption, parse_mode: 'HTML' } : {}),
  };
}

const SENDER_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_SENDER_CACHE = 200;
const senderCache = new Map<number, { sender: TelegramSender; adminChatId: number | null; token: string; cachedAt: number }>();

async function getSenderForStore(storeId: number): Promise<{ sender: TelegramSender; adminChatId: number | null } | null> {
  const now = Date.now();
  const cached = senderCache.get(storeId);
  if (cached && now - cached.cachedAt < SENDER_CACHE_TTL_MS) return cached;
  const store = await core.getStore(storeId);
  if (!store?.botToken) return null;
  const sender = cached?.token === store.botToken ? cached.sender : createTelegramSender(store.botToken);
  const entry = { sender, adminChatId: store.adminChatId, token: store.botToken, cachedAt: now };
  senderCache.set(storeId, entry);
  if (senderCache.size > MAX_SENDER_CACHE) {
    for (const [k, v] of senderCache) if (now - v.cachedAt > SENDER_CACHE_TTL_MS) senderCache.delete(k);
  }
  return entry;
}

export function createRealDeps(env: Record<string, string | undefined> = process.env): ApiDeps {
  const token = env.BOT_TOKEN?.trim();
  if (!token) console.warn('[api] BOT_TOKEN is not set: falling back to per-store tokens for notifications');
  const notifier = createNotifier({
    sender: token ? createTelegramSender(token) : null,
    getSenderForStore,
    getUser: core.getUser,
    getSettings: core.getSettings,
    render: {
      renderOrderDelivery: i18n.renderOrderDelivery,
      renderTopupSuccess: i18n.renderTopupSuccess,
      renderReferralEarned: i18n.renderReferralEarned,
      t: i18n.t,
      hasKey: (i18n as { hasKey?: (l: string, k: string) => boolean }).hasKey,
    },
    adminChatId: env.ADMIN_CHAT_ID?.trim() || null,
    adminLang: env.ADMIN_LANG?.trim() || 'en',
  });
  return {
    handleWebhook: payments.handleWebhook,
    webhookAck: payments.webhookAck,
    verifyApiKey: core.verifyApiKey,
    listProducts: core.listProducts,
    getProductByCode: core.getProductByCode,
    purchaseWithBalance: core.purchaseWithBalance,
    listUserOrders: core.listUserOrders,
    getOrderByCode: core.getOrderByCode,
    onSettled: (r) => notifier.notifySettlement(r),
    onApiPurchase: (order, user) => notifier.notifyApiSale(order, user, order.storeId),
    healthCheck: core.healthCheck,
    rateLimit: { limit: Number(env.API_RATE_LIMIT_PER_MIN) > 0 ? Number(env.API_RATE_LIMIT_PER_MIN) : 60, windowMs: 60_000 },
  };
}
