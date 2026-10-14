import { randomBytes, randomInt } from 'node:crypto';
import { getDb, type Database, type DbOrTx, type Tx } from '@tokobun/db';
import { sql } from 'drizzle-orm';
import { CoreError } from '../contracts';

/** Run `fn` inside a transaction. If `tx` is given, a nested transaction (savepoint) is opened inside it. */
export function inTx<T>(tx: DbOrTx | undefined, fn: (t: Tx) => Promise<T>): Promise<T> {
  const base = (tx ?? getDb()) as Database;
  return base.transaction(fn);
}

export function db(tx?: DbOrTx): DbOrTx {
  return tx ?? getDb();
}

export function pageArgs(page: number | undefined, pageSize: number | undefined, defSize: number) {
  const rawSize = Math.floor(pageSize ?? defSize);
  const size = Math.max(1, Math.min(100, Number.isFinite(rawSize) ? rawSize : defSize));
  const rawPage = Math.floor(page ?? 1);
  const p = Math.max(1, Number.isFinite(rawPage) ? rawPage : 1);
  return { page: p, pageSize: size, offset: (p - 1) * size };
}

export function totalPages(total: number, pageSize: number) {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function assertCents(n: number, field = 'amount') {
  if (!Number.isSafeInteger(n)) throw new CoreError('INVALID_INPUT', `${field} must be an integer number of cents`);
}

export const bp = (amount: number, basisPoints: number) => Math.round((amount * basisPoints) / 10000);

// ---------- codes ----------
const ORDER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // base32-ish, no 0/O/1/I
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function pick(alphabet: string, len: number) {
  let s = '';
  for (let i = 0; i < len; i++) s += alphabet[randomInt(alphabet.length)];
  return s;
}

/** 8 lowercase hex chars, used for products.code (deep links `product_<code>`). */
export function generateProductCode(): string {
  return randomBytes(4).toString('hex');
}
/** "TB-" + 6 uppercase base32-ish chars, used for orders.code. */
export function generateOrderCode(): string {
  return `TB-${pick(ORDER_ALPHABET, 6)}`;
}
/** 8 chars [A-Za-z0-9], used for users.referralCode. */
export function generateReferralCode(): string {
  return pick(ALNUM, 8);
}
/** "PAY-" + 10 uppercase base32-ish chars; convenience for payments.code. */
export function generatePaymentCode(): string {
  return `PAY-${pick(ORDER_ALPHABET, 10)}`;
}

export async function healthCheck(): Promise<void> {
  await getDb().execute(sql`select 1`);
}

export function isUniqueViolation(e: unknown, constraintIncludes?: string): boolean {
  let err: any = e;
  // drizzle wraps driver errors in `cause`
  for (let i = 0; i < 3 && err; i++) {
    if (err.code === '23505') {
      return !constraintIncludes || String(err.constraint_name ?? err.constraint ?? err.message).includes(constraintIncludes);
    }
    err = err.cause;
  }
  return false;
}
