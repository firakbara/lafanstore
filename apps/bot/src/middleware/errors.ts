// Error boundary: CoreError codes → translated alert/message; Telegram "not modified" is ignored.
import { escapeHtml, resolveLanguage } from '@tokobun/i18n';
import type { BotError } from 'grammy';
import type { BotContext } from '../context';
import { errorText, isCoreError, isMessageGone, isNotModified, retryAfter } from '../util/errors';

export async function handleError(err: BotError<BotContext>): Promise<void> {
  const ctx = err.ctx;
  const e = err.error;
  if (isNotModified(e) || isMessageGone(e)) return;
  const ra = retryAfter(e);
  if (ra !== null) {
    console.warn(`[bot] rate limited for ${ra}s on update ${ctx.update.update_id}`);
    return;
  }
  if (!isCoreError(e)) console.error(`[bot] update ${ctx.update.update_id} failed:`, e);
  if (!ctx.from || ctx.from.is_bot) return;
  const lang = ctx.v?.lang ?? resolveLanguage(ctx.from.language_code);
  const text = errorText(e, lang);
  try {
    if (ctx.callbackQuery) {
      if (!ctx.answered) {
        ctx.answered = true;
        await ctx.answerCallbackQuery({ text, show_alert: true });
      }
    } else if (ctx.chat?.type === 'private') {
      await ctx.reply(escapeHtml(text), { parse_mode: 'HTML' });
    }
  } catch (sendErr) {
    console.error('[bot] failed to report error to user:', sendErr);
  }
}
