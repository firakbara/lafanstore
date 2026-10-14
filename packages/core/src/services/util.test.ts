import { describe, expect, test } from 'bun:test';
import { CoreError } from '../contracts';
import { assertCents, bp, isUniqueViolation, pageArgs, totalPages } from './util';

describe('pageArgs', () => {
  test('defaults to page 1 with default size', () => {
    expect(pageArgs(undefined, undefined, 20)).toEqual({ page: 1, pageSize: 20, offset: 0 });
  });

  test('respects provided values', () => {
    expect(pageArgs(3, 10, 20)).toEqual({ page: 3, pageSize: 10, offset: 20 });
  });

  test('clamps page minimum to 1', () => {
    expect(pageArgs(0, 10, 20).page).toBe(1);
    expect(pageArgs(-5, 10, 20).page).toBe(1);
  });

  test('clamps pageSize between 1 and 100', () => {
    expect(pageArgs(1, 0, 20).pageSize).toBe(1);
    expect(pageArgs(1, 200, 20).pageSize).toBe(100);
  });

  test('floors fractional values', () => {
    expect(pageArgs(2.9, 10.7, 20)).toEqual({ page: 2, pageSize: 10, offset: 10 });
  });
});

describe('totalPages', () => {
  test('calculates correctly', () => {
    expect(totalPages(0, 10)).toBe(1);
    expect(totalPages(10, 10)).toBe(1);
    expect(totalPages(11, 10)).toBe(2);
    expect(totalPages(100, 10)).toBe(10);
  });
});

describe('assertCents', () => {
  test('passes for safe integers', () => {
    expect(() => assertCents(0)).not.toThrow();
    expect(() => assertCents(100)).not.toThrow();
    expect(() => assertCents(-500)).not.toThrow();
  });

  test('throws for non-integers', () => {
    expect(() => assertCents(1.5)).toThrow(CoreError);
    expect(() => assertCents(NaN)).toThrow(CoreError);
    expect(() => assertCents(Infinity)).toThrow(CoreError);
  });
});

describe('bp (basis points)', () => {
  test('computes correctly', () => {
    expect(bp(10000, 500)).toBe(500);
    expect(bp(10000, 600)).toBe(600);
    expect(bp(1000, 250)).toBe(25);
  });

  test('rounds to nearest integer', () => {
    expect(bp(333, 100)).toBe(3);
    expect(bp(150, 333)).toBe(5);
  });
});

describe('isUniqueViolation', () => {
  test('detects code 23505', () => {
    const err = { code: '23505', constraint_name: 'products_code_unique' };
    expect(isUniqueViolation(err)).toBe(true);
  });

  test('filters by constraint name', () => {
    const err = { code: '23505', constraint_name: 'products_code_unique' };
    expect(isUniqueViolation(err, 'code')).toBe(true);
    expect(isUniqueViolation(err, 'email')).toBe(false);
  });

  test('walks cause chain up to 3 levels', () => {
    const inner = { code: '23505', constraint_name: 'orders_code_unique' };
    const wrapped = { cause: { cause: inner } };
    expect(isUniqueViolation(wrapped, 'code')).toBe(true);
  });

  test('returns false for non-unique errors', () => {
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation({ code: '23502' })).toBe(false);
  });

  test('falls back to message when no constraint_name', () => {
    const err = { code: '23505', message: 'duplicate key value violates constraint "referral_code"' };
    expect(isUniqueViolation(err, 'referral_code')).toBe(true);
  });
});
