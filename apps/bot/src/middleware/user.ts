// Loads ctx.user / ctx.settings / ctx.v for private-chat updates and callback queries.
// upsertTelegramUser (which also bumps lastSeen) runs on /start and at most once per
// UPSERT_INTERVAL_MS per user; other updates do a cheap getUser for a fresh balance.
import { getUser, upsertTelegramUser, type UserProfile } from '@tokobun/core';
import { tp } from '@tokobun/i18n';
import type { NextFunction } from 'grammy';
import type { BotContext } from '../context';
import { cachedSettings } from '../util/cache';
import { viewFor } from '../util/view';

const UPSERT_INTERVAL_MS = 5 * 60_000;
const MAX_UPSERT_ENTRIES = 50_000;
const lastUpsert = new Map<number, number>();

function startPayload(ctx: BotContext): string | null {
  const text = ctx.message?.text;
  if (!text?.startsWith('/start')) return null;
  return text.split(/\s+/)[1] ?? '';
}

/** True for updates this middleware should load a user for. */
export function needsUser(ctx: BotContext): boolean {
  return !!ctx.from && !ctx.from.is_bot && (ctx.chat?.type === 'private' || !!ctx.callbackQuery);
}

export async function loadUser(ctx: BotContext, next: NextFunction): Promise<void> {
  if (!needsUser(ctx)) return next();
  const from = ctx.from!;
  const payload = startPayload(ctx);
  const now = Date.now();
  const settingsP = cachedSettings(ctx.storeId);
  let user: UserProfile | null = null;
  if (payload === null && now - (lastUpsert.get(from.id) ?? 0) < UPSERT_INTERVAL_MS) {
    user = await getUser(from.id);
  }
  if (!user) {
    ({ user } = await upsertTelegramUser(ctx.storeId, {
      id: from.id,
      username: from.username ?? null,
      firstName: from.first_name ?? null,
      languageCode: from.language_code ?? null,
      startPayload: payload || null,
    }));
    lastUpsert.set(from.id, now);
    if (lastUpsert.size > MAX_UPSERT_ENTRIES) {
      const cutoff = now - UPSERT_INTERVAL_MS;
      for (const [id, ts] of lastUpsert) if (ts < cutoff) lastUpsert.delete(id);
      if (lastUpsert.size > MAX_UPSERT_ENTRIES) lastUpsert.clear();
    }
  }
  ctx.user = user;
  ctx.settings = await settingsP;
  ctx.v = viewFor(user, ctx.settings);

  if (user.isBanned) {
    const text = tp(ctx.v.lang, 'errors.USER_BANNED');
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text, show_alert: true }).catch(() => {});
    else await ctx.reply(text).catch(() => {});
    return;
  }
  await next();
}
