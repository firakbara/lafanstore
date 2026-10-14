// Quantity keypad logic for the product screen (pure).
// State = (qty, typing). `typing=false` means the next digit replaces the quantity;
// after a digit press typing=true and digits append. Max 4 digits, capped at `max`.

export const MAX_QTY_DIGITS = 4;
export const MAX_QTY = 10 ** MAX_QTY_DIGITS - 1;

export type KeypadKey = number | 'del';

export interface QtyState {
  qty: number;
  typing: boolean;
}

/** Clamp a quantity into [1, max]. `max` null = unlimited (still bounded by MAX_QTY). */
export function clampQty(qty: number, max: number | null): number {
  const upper = Math.max(1, Math.min(MAX_QTY, max ?? MAX_QTY));
  return Math.min(Math.max(1, Math.trunc(qty) || 1), upper);
}

export function pressKey(state: QtyState, key: KeypadKey, max: number | null): QtyState {
  if (key === 'del') {
    if (!state.typing) return { qty: 1, typing: false };
    const next = Math.floor(state.qty / 10);
    return next < 1 ? { qty: 1, typing: false } : { qty: clampQty(next, max), typing: true };
  }
  const base = state.typing ? state.qty : 0;
  const raw = String(base) === '0' ? key : base * 10 + key;
  if (raw < 1) return { qty: 1, typing: false }; // leading zero is ignored
  if (String(raw).length > MAX_QTY_DIGITS) return { qty: clampQty(state.qty, max), typing: true };
  return { qty: clampQty(raw, max), typing: true };
}

/** Max quantity a user can choose for a product with `stock` (null = unlimited). */
export function maxQtyFor(stock: number | null): number | null {
  return stock === null ? null : Math.max(1, stock);
}
