import { A, cancelInputTarget } from '../callback';
import type { BotContext } from '../context';
import { mainMenuScreen } from '../screens/main';
import { show } from '../util/render';
import type { CallbackMap } from './types';

export async function showMain(ctx: BotContext): Promise<void> {
  await show(ctx, mainMenuScreen(ctx.v, { balance: ctx.user.balance, channelUrl: ctx.settings.channelUrl ?? ctx.cfg.channelUrl }));
}

/** Late-bound dispatcher so cancelInput can continue to any other callback. */
let dispatch: ((ctx: BotContext, data: string) => Promise<void>) | null = null;
export function setDispatcher(fn: (ctx: BotContext, data: string) => Promise<void>) {
  dispatch = fn;
}

export const menuCallbacks: CallbackMap = {
  [A.noop]: async () => {},
  [A.main]: async (ctx) => {
    delete ctx.session.input;
    await showMain(ctx);
  },
  [A.cancelInput]: async (ctx, args) => {
    delete ctx.session.input;
    const target = cancelInputTarget(args);
    if (dispatch) await dispatch(ctx, target);
    else await showMain(ctx);
  },
};
