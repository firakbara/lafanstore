// Callback router: decode callback_data → handler. Answers the query when the handler didn't.
import type { Composer } from 'grammy';
import { decode } from '../callback';
import type { BotContext } from '../context';
import { toast } from '../util/render';
import { menuCallbacks, setDispatcher } from './menu';
import { moreCallbacks } from './more';
import { profileCallbacks } from './profile';
import { referralCallbacks } from './referral';
import { shopCallbacks } from './shop';
import { supportCallbacks } from './support';
import { topupCallbacks } from './topup';
import type { CallbackMap } from './types';

export const callbacks: CallbackMap = {
  ...menuCallbacks,
  ...shopCallbacks,
  ...topupCallbacks,
  ...profileCallbacks,
  ...supportCallbacks,
  ...moreCallbacks,
  ...referralCallbacks,
};

export async function dispatch(ctx: BotContext, data: string): Promise<void> {
  const { action, args } = decode(data);
  const handler = callbacks[action];
  if (!handler) {
    await toast(ctx, ctx.v.tp('errors.EXPIRED_BUTTON'));
    return;
  }
  await handler(ctx, args);
}

export function registerCallbacks(composer: Composer<BotContext>): void {
  setDispatcher(dispatch);
  composer.on('callback_query:data', async (ctx) => {
    // Any navigation abandons a pending text input, except screens that set a new one.
    const before = ctx.session.input;
    await dispatch(ctx, ctx.callbackQuery.data);
    if (ctx.session.input === before && before) delete ctx.session.input;
    if (!ctx.answered) {
      ctx.answered = true;
      await ctx.answerCallbackQuery().catch(() => {});
    }
  });
}
