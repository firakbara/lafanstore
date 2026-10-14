// Map errors to user-facing text (pure) + Telegram error classification.
import { CoreError } from '@tokobun/core';
import { tp } from '@tokobun/i18n';

/** Plain text for an error (used in callback alerts and as message text). */
export function errorText(err: unknown, lang: string): string {
  if (err instanceof CoreError) return tp(lang, `errors.${err.code}`);
  // CoreError may cross a module-instance boundary (duplicate installs) — duck-type it.
  const code = (err as { name?: string; code?: unknown } | null)?.name === 'CoreError' ? (err as { code: unknown }).code : null;
  if (typeof code === 'string') return tp(lang, `errors.${code}`);
  return tp(lang, 'errors.GENERIC');
}

export function isCoreError(err: unknown): boolean {
  return err instanceof CoreError || (err as { name?: string } | null)?.name === 'CoreError';
}

function description(err: unknown): string {
  return String((err as { description?: string; message?: string } | null)?.description ?? (err as Error)?.message ?? '');
}

export const isNotModified = (err: unknown) => /message is not modified/i.test(description(err));
export const isMessageGone = (err: unknown) =>
  /message to edit not found|message can't be edited|message to delete not found|there is no (text|caption) in the message|MESSAGE_ID_INVALID/i.test(
    description(err),
  );
export const isBlocked = (err: unknown) =>
  (err as { error_code?: number } | null)?.error_code === 403 || /bot was blocked|user is deactivated|chat not found/i.test(description(err));
export const retryAfter = (err: unknown): number | null =>
  (err as { parameters?: { retry_after?: number } } | null)?.parameters?.retry_after ?? null;
