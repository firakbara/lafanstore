import type { Keyboard } from '../keyboards';

/** What every screen renderer returns. Rendering (edit vs send) is done by util/render.ts. */
export interface Screen {
  /** Telegram HTML (or a photo caption when `photo` is set — keep it under 1024 chars). */
  text: string;
  keyboard: Keyboard;
  /** PNG bytes to show as a photo with `text` as caption (e.g. QRIS invoice). */
  photo?: Uint8Array;
}

/** Prefix a screen with a notice line (e.g. a validation error after text input). */
export function withNotice(screen: Screen, notice: string): Screen {
  return { ...screen, text: `${notice}\n\n${screen.text}` };
}
