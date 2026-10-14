// Admin commands (ADMIN_IDS only): /addsaldo <userId> <amountUSD>, /stats.
import { applyLedger, formatMoney, getSettings, getUser, isUserInStore } from '@tokobun/core';
import { t } from '@tokobun/i18n';
import type { Bot } from 'grammy';
import type { BotConfig } from '../config';
import type { BotContext } from '../context';
import { signed } from '../util/format';
import { storeStats } from '../util/stats';

const MAX_ADDSALDO_CENTS = 100_000_00;

/** Parse "/addsaldo <userId> <amount>" args → {userId, cents} (amount in USD, may be negative). */
export function parseAddSaldo(text: string): { userId: number; cents: number } | null {
  const [idStr, amountStr] = text.trim().split(/\s+/);
  const userId = Number(idStr);
  const amount = Number((amountStr ?? '').replace(',', '.'));
  if (!Number.isSafeInteger(userId) || userId <= 0 || !Number.isFinite(amount)) return null;
  const cents = Math.round(amount * 100);
  if (cents === 0 || Math.abs(cents) > MAX_ADDSALDO_CENTS) return null;
  return { userId, cents };
}

export function registerAdmin(bot: Bot<BotContext>, cfg: BotConfig): void {
  const admin = bot.filter(
    (ctx) =>
      !!ctx.from &&
      cfg.adminIds.includes(ctx.from.id) &&
      (ctx.chat?.type === 'private' || ctx.chat?.id === cfg.adminChatId),
  );
  const lang = cfg.adminLang;

  admin.command('addsaldo', async (ctx) => {
    const parsed = parseAddSaldo(ctx.match);
    if (!parsed) {
      await ctx.reply(t(lang, 'admin.addsaldoUsage'), { parse_mode: 'HTML' });
      return;
    }
    const target = await getUser(parsed.userId);
    if (!target || !(await isUserInStore(parsed.userId, ctx.storeId))) {
      await ctx.reply(t(lang, 'admin.userNotFound'));
      return;
    }
    const [entry, settings] = await Promise.all([
      applyLedger({
        userId: target.id,
        amount: parsed.cents,
        type: 'adjustment',
        refType: 'admin',
        refId: String(ctx.from!.id),
        note: 'bot /addsaldo',
      }),
      getSettings(ctx.storeId),
    ]);
    const usd = (c: number) => formatMoney(c, 'USD', settings.fxRates);
    await ctx.reply(
      t(lang, 'admin.addsaldoDone', { userId: target.id, amount: signed(parsed.cents, usd), balance: usd(entry.balanceAfter) }),
      { parse_mode: 'HTML' },
    );
    const userMoney = (c: number) => formatMoney(c, target.currency, settings.fxRates);
    await ctx.api
      .sendMessage(
        target.id,
        t(target.language, 'wallet.adjusted', { amount: signed(parsed.cents, userMoney), balance: userMoney(entry.balanceAfter) }),
        { parse_mode: 'HTML' },
      )
      .catch(() => {});
  });

  admin.command('stats', async (ctx) => {
    const [s, settings] = await Promise.all([storeStats(ctx.storeId), getSettings(ctx.storeId)]);
    const usd = (c: number) => formatMoney(c, 'USD', settings.fxRates);
    await ctx.reply(
      t(lang, 'admin.stats', {
        ...s,
        revenueToday: usd(s.revenueToday),
        revenue30: usd(s.revenue30),
        topupAmountToday: usd(s.topupAmountToday),
      }),
      { parse_mode: 'HTML' },
    );
  });
}
