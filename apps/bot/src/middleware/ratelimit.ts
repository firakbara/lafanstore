import { resolveLanguage, tp } from '@tokobun/i18n';
import type { NextFunction } from 'grammy';
import type { BotContext } from '../context';
import { RateLimiter } from '../util/ratelimit';

/** Per-user flood guard: burst of 8, then ~3 updates/s. Admin chat traffic is not limited. */
export function rateLimit(opts = { capacity: 8, refillPerSec: 3 }) {
  const limiter = new RateLimiter(opts);
  const warned = new RateLimiter({ capacity: 1, refillPerSec: 0.2 }); // at most one warning / 5 s
  return async (ctx: BotContext, next: NextFunction): Promise<void> => {
    const id = ctx.from?.id;
    if (!id || ctx.chat?.id === ctx.cfg.adminChatId || limiter.take(id)) return next();
    const text = tp(resolveLanguage(ctx.from?.language_code), 'errors.RATE_LIMITED');
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text }).catch(() => {});
    else if (warned.take(id) && ctx.chat?.type === 'private') await ctx.reply(text).catch(() => {});
  };
}
