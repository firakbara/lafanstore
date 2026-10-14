// Pure formatting helpers (no Telegram, no DB).

/** 420 → "UTC+7", -210 → "UTC-3:30", 0 → "UTC+0". */
export function formatTz(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Date in the user's fixed UTC offset: "2026-10-03 14:05". */
export function formatDateTime(date: Date, offsetMinutes: number): string {
  const d = new Date(date.getTime() + offsetMinutes * 60_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Date only: "2026-10-03". */
export function formatDate(date: Date, offsetMinutes: number): string {
  return formatDateTime(date, offsetMinutes).slice(0, 10);
}

/** Whole minutes until `until` (never negative, rounded up). */
export function minutesLeft(until: Date, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((until.getTime() - now.getTime()) / 60_000));
}

/** Timezone grid offsets: UTC-12 … UTC+14 in whole hours. */
export const TZ_OFFSETS: readonly number[] = Array.from({ length: 27 }, (_, i) => (i - 12) * 60);

/** Signed money for ledgers: "+1.50 USD" / "-1.50 USD". `fmt` formats absolute cents. */
export function signed(amount: number, fmt: (c: number) => string): string {
  return `${amount < 0 ? '-' : '+'}${fmt(Math.abs(amount))}`;
}

/** Display name for a Telegram user. */
export function displayName(u: { firstName?: string | null; username?: string | null; id: number }): string {
  return u.firstName || (u.username ? `@${u.username}` : String(u.id));
}
