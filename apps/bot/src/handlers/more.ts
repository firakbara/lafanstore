// Lainnya: Pembaca 2FA + Penilaian.
import { rate, totp } from '@tokobun/core';
import { escapeHtml } from '@tokobun/i18n';
import { A } from '../callback';
import type { BotContext } from '../context';
import { moreScreen, ratingScreen, twofaPromptScreen, twofaResultScreen } from '../screens/more';
import { withNotice } from '../screens/types';
import { errorText, isCoreError } from '../util/errors';
import { deleteInput, show, toast } from '../util/render';
import type { CallbackMap } from './types';

async function showCode(ctx: BotContext, secret: string): Promise<void> {
  const { code, secondsRemaining } = totp(secret);
  await show(ctx, twofaResultScreen(ctx.v, { code, secondsRemaining }));
}

/** Text input: base32 secret. */
export async function onTwofaInput(ctx: BotContext, text: string): Promise<void> {
  await deleteInput(ctx);
  const secret = text.trim().slice(0, 256);
  try {
    totp(secret);
  } catch (err) {
    if (!isCoreError(err)) throw err;
    await show(ctx, withNotice(twofaPromptScreen(ctx.v), escapeHtml(errorText(err, ctx.v.lang))));
    return;
  }
  delete ctx.session.input;
  ctx.session.twofaSecret = secret;
  await showCode(ctx, secret);
}

export const moreCallbacks: CallbackMap = {
  [A.more]: async (ctx) => show(ctx, moreScreen(ctx.v)),
  [A.twofa]: async (ctx) => {
    ctx.session.input = { kind: 'twofa' };
    await show(ctx, twofaPromptScreen(ctx.v));
  },
  [A.twofaRefresh]: async (ctx) => {
    const secret = ctx.session.twofaSecret;
    if (!secret) {
      ctx.session.input = { kind: 'twofa' };
      return show(ctx, twofaPromptScreen(ctx.v));
    }
    await showCode(ctx, secret);
  },
  [A.rating]: async (ctx) => show(ctx, ratingScreen(ctx.v)),
  [A.rate]: async (ctx, args) => {
    await rate(ctx.user.id, args[0] === '-1' ? -1 : 1);
    await toast(ctx, ctx.v.tp('rating.thanks'), true);
    await show(ctx, moreScreen(ctx.v));
  },
};
