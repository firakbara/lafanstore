// Inline keyboard building blocks. Screens return plain InlineKeyboardButton[][] so they stay
// pure and testable; grammY accepts them directly as reply_markup.inline_keyboard.
import type { InlineKeyboardButton } from 'grammy/types';
import { cb } from './callback';

export type Button = InlineKeyboardButton;
export type Keyboard = Button[][];
export type ButtonStyle = 'primary' | 'success' | 'danger';

export interface ButtonOpts {
  /** Bot API button color. */
  style?: ButtonStyle;
  /** Telegram custom emoji shown before the label. */
  emojiId?: string | null;
}

function decorate<T extends Button>(button: T, opts?: ButtonOpts): T {
  if (opts?.style) button.style = opts.style;
  if (opts?.emojiId) button.icon_custom_emoji_id = opts.emojiId;
  return button;
}

export const btn = (text: string, data: string, opts?: ButtonOpts): Button =>
  decorate({ text, callback_data: data }, opts);

export const urlBtn = (text: string, url: string, opts?: ButtonOpts): Button => decorate({ text, url }, opts);

/** Button that copies `copy` to the clipboard (Bot API copy_text, max 256 chars). */
export const copyBtn = (text: string, copy: string, opts?: ButtonOpts): Button =>
  decorate({ text, copy_text: { text: copy.slice(0, 256) } }, opts);

export const noopBtn = (text: string, opts?: ButtonOpts): Button => btn(text, cb.noop(), opts);

/** Chunk buttons into rows of `size`. */
export function rows(buttons: Button[], size: number): Keyboard {
  const out: Keyboard = [];
  for (let i = 0; i < buttons.length; i += size) out.push(buttons.slice(i, i + size));
  return out;
}

/** [‹ prev][page/total][next ›]; wraps around at the edges so the layout never changes. */
export function pager(
  page: number,
  totalPages: number,
  to: (page: number) => string,
  labels: { prev: string; next: string; page: string },
): Button[] {
  if (totalPages <= 1) return [];
  const prev = page > 1 ? page - 1 : totalPages;
  const next = page < totalPages ? page + 1 : 1;
  return [btn(labels.prev, to(prev)), noopBtn(labels.page), btn(labels.next, to(next))];
}
