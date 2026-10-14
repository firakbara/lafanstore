import { describe, expect, test } from 'bun:test';
import { hmacSha256Hex, newPaymentCode, safeEqualHex, sha256 } from '../src/signature';

describe('hmacSha256Hex', () => {
  test('produces consistent hex output', () => {
    const sig = hmacSha256Hex('secret', 'data');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(hmacSha256Hex('secret', 'data')).toBe(sig);
  });

  test('different key or data yields different result', () => {
    const a = hmacSha256Hex('key1', 'data');
    const b = hmacSha256Hex('key2', 'data');
    const c = hmacSha256Hex('key1', 'other');
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  test('empty data produces valid HMAC', () => {
    const sig = hmacSha256Hex('key', '');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  test('empty key produces valid HMAC', () => {
    const sig = hmacSha256Hex('', 'data');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  test('handles UTF-8 data', () => {
    const sig = hmacSha256Hex('key', '日本語テスト');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(hmacSha256Hex('key', '日本語テスト')).toBe(sig);
  });

  test('handles Uint8Array key', () => {
    const key = new Uint8Array([0x01, 0x02, 0x03, 0xff]);
    const sig = hmacSha256Hex(key, 'data');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(hmacSha256Hex(key, 'data')).toBe(sig);
  });

  test('very long payload produces valid HMAC', () => {
    const big = 'x'.repeat(100_000);
    const sig = hmacSha256Hex('key', big);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('sha256', () => {
  test('returns a 32-byte buffer', () => {
    const hash = sha256('hello');
    expect(hash.length).toBe(32);
  });
});

describe('safeEqualHex', () => {
  test('matches identical hex strings', () => {
    expect(safeEqualHex('abcdef', 'abcdef')).toBe(true);
  });

  test('is case-insensitive', () => {
    expect(safeEqualHex('ABCDEF', 'abcdef')).toBe(true);
    expect(safeEqualHex('AbCdEf', 'abcdef')).toBe(true);
  });

  test('trims whitespace', () => {
    expect(safeEqualHex(' abcdef ', 'abcdef')).toBe(true);
  });

  test('rejects different values', () => {
    expect(safeEqualHex('aaa', 'bbb')).toBe(false);
  });

  test('rejects different lengths', () => {
    expect(safeEqualHex('aabb', 'aabbcc')).toBe(false);
  });

  test('returns false for null/undefined/empty', () => {
    expect(safeEqualHex(null, 'abc')).toBe(false);
    expect(safeEqualHex('abc', undefined)).toBe(false);
    expect(safeEqualHex('', 'abc')).toBe(false);
    expect(safeEqualHex(null, null)).toBe(false);
  });

  test('both null returns false (not vacuously true)', () => {
    expect(safeEqualHex(null, undefined)).toBe(false);
    expect(safeEqualHex(undefined, undefined)).toBe(false);
  });

  test('both empty returns false', () => {
    expect(safeEqualHex('', '')).toBe(false);
  });

  test('whitespace-only strings return false after trim', () => {
    expect(safeEqualHex('  ', 'abc')).toBe(false);
    expect(safeEqualHex('  ', '  ')).toBe(false);
    expect(safeEqualHex(' \t', ' \n')).toBe(false);
  });

  test('matches full-length SHA-256 hex', () => {
    const hash = 'a'.repeat(64);
    expect(safeEqualHex(hash, hash)).toBe(true);
    expect(safeEqualHex(hash, hash.replace(/a$/, 'b'))).toBe(false);
  });

  test('trims tabs and mixed whitespace', () => {
    expect(safeEqualHex('\tabcdef\n', 'abcdef')).toBe(true);
  });

  test('one-character-difference strings are rejected', () => {
    expect(safeEqualHex('abcde0', 'abcde1')).toBe(false);
  });
});

describe('sha256', () => {
  test('produces deterministic output', () => {
    expect(sha256('test').equals(sha256('test'))).toBe(true);
  });

  test('different inputs produce different hashes', () => {
    expect(sha256('a').equals(sha256('b'))).toBe(false);
  });

  test('empty string produces a valid 32-byte hash', () => {
    expect(sha256('').length).toBe(32);
  });

  test('handles UTF-8 input', () => {
    const hash = sha256('日本語');
    expect(hash.length).toBe(32);
  });

  test('known SHA-256 vector for empty string', () => {
    expect(sha256('').toString('hex')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

describe('newPaymentCode', () => {
  test('starts with PAY- and has 16 chars total', () => {
    const code = newPaymentCode();
    expect(code).toMatch(/^PAY-[A-Z2-9]{12}$/);
  });

  test('generates unique codes', () => {
    const codes = new Set(Array.from({ length: 50 }, () => newPaymentCode()));
    expect(codes.size).toBe(50);
  });

  test('excludes ambiguous characters (0, 1, I, O)', () => {
    const codes = Array.from({ length: 200 }, () => newPaymentCode());
    for (const code of codes) {
      const body = code.slice(4);
      expect(body).not.toMatch(/[01IO]/);
    }
  });

  test('total length is exactly 16 characters', () => {
    for (let i = 0; i < 20; i++) {
      expect(newPaymentCode().length).toBe(16);
    }
  });
});
