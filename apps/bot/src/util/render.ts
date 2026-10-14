// "Single menu message" rendering: callbacks edit the message the button belongs to; anything
// else (commands, text input) replaces the previous menu message with a fresh one.
import { InputFile } from 'grammy';
import type { BotContext } from '../context';
import type { Screen } from '../screens/types';
import { isMessageGone, isNotModified } from './errors';

const NO_PREVIEW = { is_disabled: true } as const;

async function send(ctx: BotContext, screen: Screen): Promise<void> {
  const reply_markup = { inline_keyboard: screen.keyboard };
  const msg = screen.photo
    ? await ctx.replyWithPhoto(new InputFile(screen.photo, 'qr.png'), { caption: screen.text, parse_mode: 'HTML', reply_markup })
    : await ctx.reply(screen.text, { parse_mode: 'HTML', reply_markup, link_preview_options: NO_PREVIEW });
  ctx.session.menuMsgId = msg.message_id;
}

async function deleteQuietly(ctx: BotContext, messageId: number | undefined): Promise<void> {
  if (!messageId || !ctx.chat) return;
  await ctx.api.deleteMessage(ctx.chat.id, messageId).catch(() => {});
}

/** Show `screen` as the menu message. */
export async function show(ctx: BotContext, screen: Screen): Promise<void> {
  const reply_markup = { inline_keyboard: screen.keyboard };
  const msg = ctx.callbackQuery?.message;
  if (msg && ctx.chat) {
    const hasPhoto = 'photo' in msg && Array.isArray(msg.photo) && msg.photo.length > 0;
    try {
      if (!screen.photo && !hasPhoto) {
        await ctx.api.editMessageText(ctx.chat.id, msg.message_id, screen.text, {
          parse_mode: 'HTML',
          reply_markup,
          link_preview_options: NO_PREVIEW,
        });
        ctx.session.menuMsgId = msg.message_id;
        return;
      }
      if (screen.photo && hasPhoto) {
        // Same invoice re-rendered: keep the photo, update caption + buttons only.
        await ctx.api.editMessageCaption(ctx.chat.id, msg.message_id, { caption: screen.text, parse_mode: 'HTML', reply_markup });
        ctx.session.menuMsgId = msg.message_id;
        return;
      }
    } catch (err) {
      if (isNotModified(err)) return;
      if (!isMessageGone(err)) throw err;
    }
    // Text <-> photo switch (or the message is gone): replace it.
    await deleteQuietly(ctx, msg.message_id);
    await send(ctx, screen);
    return;
  }
  await deleteQuietly(ctx, ctx.session.menuMsgId);
  await send(ctx, screen);
}

/** Answer the callback query with a toast/alert (or reply when not in a callback). */
export async function toast(ctx: BotContext, text: string, alert = false): Promise<void> {
  if (!ctx.callbackQuery) {
    await ctx.reply(text);
    return;
  }
  if (ctx.answered) return;
  ctx.answered = true;
  await ctx.answerCallbackQuery({ text, show_alert: alert }).catch(() => {});
}

/** Delete a user's input message (amounts, voucher codes, secrets) to keep the chat tidy. */
export async function deleteInput(ctx: BotContext): Promise<void> {
  if (ctx.message && ctx.chat?.type === 'private') await ctx.deleteMessage().catch(() => {});
}
