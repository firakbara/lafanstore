// Telegram notifications after a payment is settled (user + referrer + admin chat).
import type { Cents, OrderDetail, SettleResult, StoreSettings, UserProfile } from '@tokobun/core';
import { escapeHtml } from '@tokobun/i18n';

/** Minimal Telegram sender (adapted from grammY `Api` in deps.ts; faked in tests). */
export interface TelegramSender {
  sendMessage(chatId: number | string, html: string): Promise<unknown>;
  sendDocument(chatId: number | string, file: { filename: string; content: string }, captionHtml?: string): Promise<unknown>;
}

export interface Renderers {
  renderOrderDelivery(order: OrderDetail, lang: string, money: { currency: string; fxRates: Record<string, number> }): {
    text: string;
    file: { filename: string; content: string } | null;
  };
  renderTopupSuccess(input: { credited: Cents; balance: Cents }, lang: string, money: { currency: string; fxRates: Record<string, number> }): string;
  renderReferralEarned(input: { amount: Cents }, lang: string, money: { currency: string; fxRates: Record<string, number> }): string;
  t(lang: string, key: string, params?: Record<string, string | number>): string;
  hasKey?(lang: string, key: string): boolean;
}

export interface NotifierDeps {
  sender: TelegramSender | null; // fallback for single-store setups
  getSenderForStore?(storeId: number): Promise<{ sender: TelegramSender; adminChatId: number | null } | null>;
  getUser(userId: number): Promise<UserProfile | null>;
  getSettings(storeId: number): Promise<StoreSettings>;
  render: Renderers;
  adminChatId?: string | null;
  adminLang?: string;
  log?: Pick<Console, 'warn' | 'error'>;
}

export const usd = (c: Cents) => `$${(c / 100).toFixed(2)}`;

const CAPTION_MAX = 1024;

export function createNotifier(deps: NotifierDeps) {
  const log = deps.log ?? console;
  const adminLang = deps.adminLang ?? 'en';

  async function safe(label: string, fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (err) {
      log.warn(`[notify] ${label} failed:`, (err as Error).message ?? err);
    }
  }

  async function resolveStore(storeId: number): Promise<{ sender: TelegramSender; adminChatId: number | null } | null> {
    if (deps.getSenderForStore) {
      const result = await deps.getSenderForStore(storeId).catch(() => null);
      if (result) return result;
    }
    if (deps.sender) return { sender: deps.sender, adminChatId: deps.adminChatId ? Number(deps.adminChatId) : null };
    return null;
  }

  async function toAdmin(storeId: number, html: string) {
    const store = await resolveStore(storeId);
    if (!store?.sender || !store.adminChatId) return;
    await safe('admin chat', () => store.sender.sendMessage(store.adminChatId!, html));
  }

  function userLabel(u: UserProfile | null, id: number) {
    if (!u) return String(id);
    return escapeHtml(u.username ? `@${u.username}` : (u.firstName ?? String(id)));
  }

  /** Line for the admin chat about a sale (direct pay, reseller API, ...). Uses i18n 'admin.sale'. */
  function saleLine(order: OrderDetail, user: UserProfile | null, userId: number, via: string) {
    const params = {
      code: order.code,
      user: user ? (user.username ? `@${user.username}` : (user.firstName ?? String(userId))) : String(userId),
      userId,
      product: order.productName,
      qty: order.quantity,
      total: usd(order.total),
      paidWith: via,
    };
    if (deps.render.hasKey?.(adminLang, 'admin.sale') ?? true) {
      try {
        const s = deps.render.t(adminLang, 'admin.sale', params);
        if (s !== 'admin.sale') return s;
      } catch {
        /* fall through */
      }
    }
    return `🛒 <b>Sale</b> <code>${escapeHtml(order.code)}</code> · ${escapeHtml(order.productName)} × ${order.quantity} · ${usd(order.total)} · ${userLabel(user, userId)} (<code>${userId}</code>) · ${escapeHtml(via)}`;
  }

  return {
    /** Notify everyone concerned about a settlement. Never throws. No-op for alreadySettled results. */
    async notifySettlement(result: SettleResult): Promise<void> {
      if (result.alreadySettled) return;
      const store = await resolveStore(result.storeId);
      const sender = store?.sender ?? null;
      let settings: StoreSettings;
      let user: UserProfile | null;
      try {
        [settings, user] = await Promise.all([deps.getSettings(result.storeId), deps.getUser(result.userId)]);
      } catch (err) {
        log.error('[notify] could not load user/settings:', err);
        return;
      }
      const lang = user?.language ?? 'en';
      const money = { currency: user?.currency ?? 'USD', fxRates: settings.fxRates };

      if (sender) {
        if (result.purpose === 'topup') {
          await safe('topup message', () =>
            sender.sendMessage(result.userId, deps.render.renderTopupSuccess({ credited: result.credited, balance: user?.balance ?? 0 }, lang, money)),
          );
        } else if (result.order && result.order.status === 'completed') {
          const order = result.order;
          await safe('order delivery', async () => {
            const d = deps.render.renderOrderDelivery(order, lang, money);
            if (!d.file) return sender.sendMessage(result.userId, d.text);
            if (d.text.length <= CAPTION_MAX) return sender.sendDocument(result.userId, d.file, d.text);
            await sender.sendMessage(result.userId, d.text);
            return sender.sendDocument(result.userId, d.file);
          });
        } else if (result.order) {
          const order = result.order;
          await safe('order refunded message', () => {
            const head =
              deps.render.hasKey?.(lang, 'payment.orderRefunded')
                ? deps.render.t(lang, 'payment.orderRefunded', { code: order.code, amount: usd(result.credited || order.total) })
                : `${deps.render.t(lang, 'orderStatus.refunded')} <code>${escapeHtml(order.code)}</code>`;
            const body = deps.render.renderTopupSuccess({ credited: result.credited || order.total, balance: user?.balance ?? 0 }, lang, money);
            return sender.sendMessage(result.userId, `${head}\n\n${body}`);
          });
        }

        if (result.referral && result.referral.amount > 0) {
          const ref = result.referral;
          await safe('referral message', async () => {
            const referrer = await deps.getUser(ref.referrerId);
            if (!referrer || !referrer.notifyReferral || referrer.isBanned) return;
            const m = { currency: referrer.currency, fxRates: settings.fxRates };
            return sender.sendMessage(ref.referrerId, deps.render.renderReferralEarned({ amount: ref.amount }, referrer.language, m));
          });
        }
      }

      if (result.purpose === 'topup') {
        await toAdmin(result.storeId, `💰 <b>Top-up</b> ${usd(result.credited)} · ${userLabel(user, result.userId)} (<code>${result.userId}</code>) · payment #${result.paymentId}`);
      } else if (result.order) {
        const o = result.order;
        if (o.status === 'completed') await toAdmin(result.storeId, saleLine(o, user, result.userId, `direct pay #${result.paymentId}`));
        else
          await toAdmin(
            result.storeId,
            `⚠️ <b>Paid but out of stock</b> <code>${escapeHtml(o.code)}</code> · ${escapeHtml(o.productName)} × ${o.quantity} · refunded ${usd(result.credited || o.total)} to wallet of <code>${result.userId}</code>`,
          );
      }
    },

    /** Admin-chat line for a reseller-API purchase. Never throws. */
    async notifyApiSale(order: OrderDetail, user: UserProfile, storeId: number): Promise<void> {
      await toAdmin(storeId, saleLine(order, user, user.id, 'balance (API)'));
    },
  };
}

export type Notifier = ReturnType<typeof createNotifier>;
