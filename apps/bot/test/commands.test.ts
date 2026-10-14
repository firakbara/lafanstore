import { describe, expect, test } from 'bun:test';
import { parseStartPayload, COMMANDS } from '../src/handlers/commands';

describe('parseStartPayload', () => {
  test('parses valid product payload', () => {
    expect(parseStartPayload('product_abc123')).toEqual({ productCode: 'abc123' });
  });

  test('allows hyphens in product code', () => {
    expect(parseStartPayload('product_my-product-code')).toEqual({ productCode: 'my-product-code' });
  });

  test('minimum length code (1 char)', () => {
    expect(parseStartPayload('product_a')).toEqual({ productCode: 'a' });
  });

  test('maximum length code (64 chars)', () => {
    const code = 'a'.repeat(64);
    expect(parseStartPayload(`product_${code}`)).toEqual({ productCode: code });
  });

  test('rejects code over 64 chars', () => {
    expect(parseStartPayload(`product_${'a'.repeat(65)}`)).toBeNull();
  });

  test('returns null for empty payload', () => {
    expect(parseStartPayload('')).toBeNull();
  });

  test('returns null for referral payload', () => {
    expect(parseStartPayload('ref_abc')).toBeNull();
  });

  test('returns null for product_ with no code', () => {
    expect(parseStartPayload('product_')).toBeNull();
  });

  test('trims whitespace before matching', () => {
    expect(parseStartPayload('  product_abc  ')).toEqual({ productCode: 'abc' });
  });

  test('rejects special characters', () => {
    expect(parseStartPayload('product_abc!@#')).toBeNull();
  });

  test('is case-sensitive (PRODUCT_ rejected)', () => {
    expect(parseStartPayload('PRODUCT_abc')).toBeNull();
  });

  test('allows underscores in product code', () => {
    expect(parseStartPayload('product_my_code')).toEqual({ productCode: 'my_code' });
  });

  test('allows digits-only code', () => {
    expect(parseStartPayload('product_12345')).toEqual({ productCode: '12345' });
  });

  test('rejects spaces in product code', () => {
    expect(parseStartPayload('product_abc def')).toBeNull();
  });
});

describe('COMMANDS', () => {
  test('contains all expected commands', () => {
    const expected = ['start', 'shop', 'topup', 'orders', 'profile', 'language', 'support', 'api'];
    for (const cmd of expected) {
      expect((COMMANDS as readonly string[])).toContain(cmd);
    }
  });

  test('has exactly 8 commands', () => {
    expect(COMMANDS.length).toBe(8);
  });
});
