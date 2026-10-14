// Bot factory: middleware chain + handlers. No network calls here (index.ts starts it).
import { Bot, session } from 'grammy';
import type { BotConfig } from './config';
import type { BotContext } from './context';
import { registerAdmin } from './handlers/admin';
import { registerCommands } from './handlers/commands';
import { registerCallbacks } from './handlers/router';
import { registerSupportRelay } from './handlers/support';
import { registerText } from './handlers/text';
import { handleError } from './middleware/errors';
import { rateLimit } from './middleware/ratelimit';
import { loadUser } from './middleware/user';
import { createSessionStorage, initialSession, type SessionStore } from './util/session';

export function createBot(cfg: BotConfig, storeId: number, opts: { storage?: SessionStore } = {}): Bot<BotContext> {
  const bot = new Bot<BotContext>(cfg.botToken);

  bot.use(async (ctx, next) => {
    ctx.cfg = cfg;
    ctx.storeId = storeId;
    ctx.answered = false;
    await next();
  });
  bot.use(rateLimit());
  bot.use(
    session({
      initial: initialSession,
      storage: opts.storage ?? createSessionStorage(),
      // Per user (not per chat) so the same state is seen from a private topic or callback.
      getSessionKey: (ctx) => (ctx.from ? String(ctx.from.id) : undefined),
    }),
  );

  // Admin chat (group) traffic: admin commands + support relay; no user loading there.
  registerAdmin(bot, cfg);
  registerSupportRelay(bot, cfg);

  const user = bot.filter((ctx) => !!ctx.from).use(loadUser);
  registerCommands(user);
  registerCallbacks(user);
  registerText(user);

  bot.catch(handleError);
  return bot;
}
