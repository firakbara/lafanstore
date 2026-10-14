// Per-user session (text-input state, menu message id, voucher, 2FA secret).
// Storage is isolated behind grammY's StorageAdapter interface: swap createSessionStorage()
// for a Redis/Postgres adapter without touching handlers.
import type { Cents } from '@tokobun/core';
import { MemorySessionStorage, type StorageAdapter } from 'grammy';

export type InputState =
  | { kind: 'topup'; provider: string; method: string }
  | { kind: 'voucher'; productId: number; qty: number }
  | { kind: 'twofa' }
  | { kind: 'withdraw'; amount: Cents };

export interface SessionData {
  /** Waiting for the user to type something. */
  input?: InputState;
  /** The single "menu message" edited in place. */
  menuMsgId?: number;
  /** Voucher applied on the product screen. */
  voucher?: { productId: number; code: string };
  /** Last 2FA secret (memory only) so "Perbarui" can recompute the code. */
  twofaSecret?: string;
}

export type SessionStore = StorageAdapter<SessionData>;

export const initialSession = (): SessionData => ({});

/** In-memory store with a 24h idle TTL. Lost on restart, which only resets UI state. */
export function createSessionStorage(): SessionStore {
  return new MemorySessionStorage<SessionData>(24 * 60 * 60 * 1000);
}
