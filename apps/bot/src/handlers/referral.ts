// Dapatkan: referral stats, transfer to wallet, cash-out request.
import { CoreError, getReferralStats, getUser, requestReferralWithdraw, transferReferralToWallet } from '@tokobun/core';
import { A } from '../callback';
import type { BotContext } from '../context';
import { referralScreen, withdrawPromptScreen } from '../screens/referral';
import { withNotice } from '../screens/types';
import { withUserLock } from '../util/lock';
import { deleteInput, show, toast } from '../util/render';
import type { InputState } from '../util/session';
import { botUsername } from './shop';
import type { CallbackMap } from './types';

export async function showReferral(ctx: BotContext, notice?: string): Promise<void> {
  const stats = await getReferralStats(ctx.storeId, ctx.user.id);
  const link = `https://t.me/${botUsername(ctx)}?start=ref_${stats.referralCode}`;
  const screen = referralScreen(ctx.v, { stats, link });
  await show(ctx, notice ? withNotice(screen, notice) : screen);
}

/** Text input: payout details for a cash-out request. */
export async function onWithdrawInput(ctx: BotContext, state: Extract<InputState, { kind: 'withdraw' }>, text: string): Promise<void> {
  await deleteInput(ctx);
  delete ctx.session.input;
  const ran = await withUserLock(ctx.user.id, async () => {
    const id = await requestReferralWithdraw(ctx.storeId, ctx.user.id, state.amount, text.trim().slice(0, 500));
    await showReferral(ctx, ctx.v.t('referral.withdrawRequested', { id, amount: ctx.v.money(state.amount) }));
  });
  if (!ran) await toast(ctx, ctx.v.tp('errors.RATE_LIMITED'));
}

export const referralCallbacks: CallbackMap = {
  [A.referral]: async (ctx) => showReferral(ctx),
  [A.referralTransfer]: async (ctx) => {
    const ran = await withUserLock(ctx.user.id, async () => {
      const stats = await getReferralStats(ctx.storeId, ctx.user.id);
      if (stats.available <= 0) {
        await toast(ctx, ctx.v.tp('referral.nothing'), true);
        return;
      }
      const moved = await transferReferralToWallet(ctx.user.id);
      const u = await getUser(ctx.user.id);
      if (u) ctx.user = u;
      await toast(ctx, ctx.v.tp('referral.transferred', { amount: ctx.v.money(moved) }), true);
      await showReferral(ctx);
    });
    if (!ran) await toast(ctx, ctx.v.tp('errors.RATE_LIMITED'));
  },
  [A.referralWithdraw]: async (ctx) => {
    const stats = await getReferralStats(ctx.storeId, ctx.user.id);
    if (stats.available < stats.minWithdraw || stats.available <= 0) throw new CoreError('AMOUNT_TOO_SMALL');
    ctx.session.input = { kind: 'withdraw', amount: stats.available };
    await show(ctx, withdrawPromptScreen(ctx.v, { amount: stats.available, min: stats.minWithdraw }));
  },
};
