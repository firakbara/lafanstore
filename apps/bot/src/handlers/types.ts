import type { BotContext } from '../context';

export type CallbackHandler = (ctx: BotContext, args: string[]) => Promise<void>;
/** action (see callback.ts `A`) → handler */
export type CallbackMap = Record<string, CallbackHandler>;
