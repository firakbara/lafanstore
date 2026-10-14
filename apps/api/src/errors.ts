import type { CoreErrorCode } from '@tokobun/core';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** HTTP status for each CoreError code (reseller API). */
export const CORE_ERROR_STATUS: Record<CoreErrorCode, ContentfulStatusCode> = {
  NOT_FOUND: 404,
  USER_BANNED: 403,
  PRODUCT_INACTIVE: 409,
  INVALID_QUANTITY: 422,
  OUT_OF_STOCK: 409,
  INSUFFICIENT_BALANCE: 402,
  VOUCHER_INVALID: 422,
  VOUCHER_EXPIRED: 422,
  VOUCHER_LIMIT_REACHED: 422,
  VOUCHER_MIN_TOTAL: 422,
  AMOUNT_TOO_SMALL: 422,
  INVALID_STATE: 409,
  INVALID_INPUT: 400,
};

export interface ApiErrorBody {
  error: { code: string; message: string; meta?: Record<string, unknown> };
}

export function errorBody(code: string, message: string, meta?: Record<string, unknown>): ApiErrorBody {
  return { error: meta ? { code, message, meta } : { code, message } };
}

/** Duck-typed CoreError check (works across module instances). */
export function asCoreError(err: unknown): { code: CoreErrorCode; message: string; meta?: Record<string, unknown> } | null {
  if (err && typeof err === 'object' && (err as Error).name === 'CoreError') {
    const code = (err as { code?: string }).code;
    if (code && code in CORE_ERROR_STATUS) {
      return { code: code as CoreErrorCode, message: (err as Error).message, meta: (err as { meta?: Record<string, unknown> }).meta };
    }
  }
  return null;
}

/** Duck-typed WebhookError from @tokobun/payments. */
export function asWebhookError(err: unknown): { status: 400 | 401 | 404; message: string } | null {
  if (err && typeof err === 'object' && (err as Error).name === 'WebhookError') {
    const status = (err as { status?: number }).status;
    if (status === 400 || status === 401 || status === 404) return { status, message: (err as Error).message };
  }
  return null;
}
