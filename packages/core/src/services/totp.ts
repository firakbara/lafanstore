import { createHmac } from 'node:crypto';
import { CoreError } from '../contracts';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(input: string): Buffer {
  const s = input.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase();
  if (!s.length) throw new CoreError('INVALID_INPUT', 'empty secret');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of s) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new CoreError('INVALID_INPUT', 'secret is not valid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  if (!out.length) throw new CoreError('INVALID_INPUT', 'secret too short');
  return Buffer.from(out);
}

/** RFC 6238 TOTP: HMAC-SHA1, 30 s step, 6 digits. */
export function totp(secret: string, now: Date = new Date()): { code: string; secondsRemaining: number } {
  const key = base32Decode(secret);
  const seconds = Math.floor(now.getTime() / 1000);
  const counter = Math.floor(seconds / 30);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', key).update(msg).digest();
  const offset = h[h.length - 1]! & 0x0f;
  const bin = ((h[offset]! & 0x7f) << 24) | (h[offset + 1]! << 16) | (h[offset + 2]! << 8) | h[offset + 3]!;
  const code = String(bin % 1_000_000).padStart(6, '0');
  return { code, secondsRemaining: 30 - (seconds % 30) };
}
