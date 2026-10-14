import { describe, expect, test } from 'bun:test';
import { CoreError, type CoreErrorCode } from '@tokobun/core';
import { WebhookError } from '@tokobun/payments';
import { asCoreError, asWebhookError, CORE_ERROR_STATUS, errorBody } from '../src/errors';

// ---------------------------------------------------------------------------
// errorBody
// ---------------------------------------------------------------------------
describe('errorBody', () => {
  test('builds error shape without meta', () => {
    expect(errorBody('NOT_FOUND', 'gone')).toEqual({
      error: { code: 'NOT_FOUND', message: 'gone' },
    });
  });

  test('includes meta when provided', () => {
    expect(errorBody('INVALID_INPUT', 'bad qty', { min: 1, max: 100 })).toEqual({
      error: { code: 'INVALID_INPUT', message: 'bad qty', meta: { min: 1, max: 100 } },
    });
  });

  test('omits meta key entirely when undefined', () => {
    const body = errorBody('INTERNAL', 'oops');
    expect('meta' in body.error).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// asCoreError  (duck-typed: works even when CoreError comes from a different
// module instance, as long as .name === "CoreError" and .code is valid)
// ---------------------------------------------------------------------------
describe('asCoreError', () => {
  test('recognises a real CoreError instance', () => {
    const err = new CoreError('OUT_OF_STOCK', 'sold out', { productId: 5 });
    const result = asCoreError(err);
    expect(result).toEqual({ code: 'OUT_OF_STOCK', message: 'sold out', meta: { productId: 5 } });
  });

  test('recognises a duck-typed CoreError (plain object)', () => {
    const duck = { name: 'CoreError', code: 'INSUFFICIENT_BALANCE', message: 'no money' };
    expect(asCoreError(duck)).toEqual({ code: 'INSUFFICIENT_BALANCE', message: 'no money', meta: undefined });
  });

  test('returns null for wrong .name', () => {
    const err = new Error('nope');
    (err as unknown as { code: string }).code = 'OUT_OF_STOCK';
    expect(asCoreError(err)).toBeNull();
  });

  test('returns null when .code is missing', () => {
    const err = { name: 'CoreError', message: 'oops' };
    expect(asCoreError(err)).toBeNull();
  });

  test('returns null when .code is not a valid CoreErrorCode', () => {
    const err = { name: 'CoreError', code: 'UNKNOWN_CODE', message: 'wat' };
    expect(asCoreError(err)).toBeNull();
  });

  test('returns null for non-object inputs', () => {
    expect(asCoreError(null)).toBeNull();
    expect(asCoreError(undefined)).toBeNull();
    expect(asCoreError(42)).toBeNull();
    expect(asCoreError('string')).toBeNull();
  });

  test('CoreError without meta keeps meta undefined', () => {
    const err = new CoreError('NOT_FOUND', 'gone');
    const result = asCoreError(err);
    expect(result).toEqual({ code: 'NOT_FOUND', message: 'gone', meta: undefined });
  });
});

// ---------------------------------------------------------------------------
// asWebhookError
// ---------------------------------------------------------------------------
describe('asWebhookError', () => {
  test('recognises a real WebhookError with status 401', () => {
    const err = new WebhookError(401, 'bad sig');
    expect(asWebhookError(err)).toEqual({ status: 401, message: 'bad sig' });
  });

  test('recognises status 400 and 404', () => {
    expect(asWebhookError(new WebhookError(400, 'bad body'))).toEqual({ status: 400, message: 'bad body' });
    expect(asWebhookError(new WebhookError(404, 'unknown'))).toEqual({ status: 404, message: 'unknown' });
  });

  test('recognises a duck-typed WebhookError', () => {
    const duck = { name: 'WebhookError', status: 401, message: 'duck sig' };
    expect(asWebhookError(duck)).toEqual({ status: 401, message: 'duck sig' });
  });

  test('returns null for wrong .name', () => {
    const err = new Error('nope');
    (err as unknown as { status: number }).status = 401;
    expect(asWebhookError(err)).toBeNull();
  });

  test('returns null for unexpected status codes', () => {
    const err = { name: 'WebhookError', status: 500, message: 'server error' };
    expect(asWebhookError(err)).toBeNull();
  });

  test('returns null for non-object inputs', () => {
    expect(asWebhookError(null)).toBeNull();
    expect(asWebhookError(undefined)).toBeNull();
    expect(asWebhookError(42)).toBeNull();
    expect(asWebhookError('string')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CORE_ERROR_STATUS mapping
// ---------------------------------------------------------------------------
describe('CORE_ERROR_STATUS', () => {
  const ALL_CODES: CoreErrorCode[] = [
    'NOT_FOUND',
    'USER_BANNED',
    'PRODUCT_INACTIVE',
    'INVALID_QUANTITY',
    'OUT_OF_STOCK',
    'INSUFFICIENT_BALANCE',
    'VOUCHER_INVALID',
    'VOUCHER_EXPIRED',
    'VOUCHER_LIMIT_REACHED',
    'VOUCHER_MIN_TOTAL',
    'AMOUNT_TOO_SMALL',
    'INVALID_STATE',
    'INVALID_INPUT',
  ];

  test('has a mapping for every CoreErrorCode', () => {
    for (const code of ALL_CODES) {
      expect(CORE_ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
      expect(CORE_ERROR_STATUS[code]).toBeLessThan(600);
    }
  });

  test('maps known codes to expected HTTP statuses', () => {
    expect(CORE_ERROR_STATUS.NOT_FOUND).toBe(404);
    expect(CORE_ERROR_STATUS.USER_BANNED).toBe(403);
    expect(CORE_ERROR_STATUS.OUT_OF_STOCK).toBe(409);
    expect(CORE_ERROR_STATUS.INSUFFICIENT_BALANCE).toBe(402);
    expect(CORE_ERROR_STATUS.INVALID_INPUT).toBe(400);
  });

  test('no extra keys beyond CoreErrorCode', () => {
    expect(Object.keys(CORE_ERROR_STATUS).sort()).toEqual(ALL_CODES.slice().sort());
  });
});
