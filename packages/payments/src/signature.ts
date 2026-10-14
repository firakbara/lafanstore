import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export function hmacSha256Hex(key: string | Uint8Array, data: string): string {
  return createHmac('sha256', key).update(data, 'utf8').digest('hex');
}

export function sha256(data: string): Buffer {
  return createHash('sha256').update(data, 'utf8').digest();
}

/** Constant-time comparison of two hex strings (case-insensitive). */
export function safeEqualHex(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ax = a.trim().toLowerCase();
  const bx = b.trim().toLowerCase();
  if (!ax || !bx) return false;
  const x = Buffer.from(ax, 'utf8');
  const y = Buffer.from(bx, 'utf8');
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

/** "PAY-" + 12 random chars from an unambiguous alphabet. */
export function newPaymentCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 12; i++) s += alphabet[randomInt(alphabet.length)];
  return `PAY-${s}`;
}
