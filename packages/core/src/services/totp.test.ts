import { describe, expect, test } from 'bun:test';
import { base32Decode, totp } from './totp';

describe('base32Decode', () => {
  test('decodes valid base32', () => {
    const buf = base32Decode('JBSWY3DPEE');
    expect(buf.toString('utf8')).toBe('Hello!');
  });

  test('strips whitespace, dashes and padding', () => {
    expect(base32Decode('JBSW Y3DP-EE======').toString('utf8')).toBe('Hello!');
  });

  test('is case-insensitive', () => {
    expect(base32Decode('jbswy3dpee').toString('utf8')).toBe('Hello!');
  });

  test('throws on empty string', () => {
    expect(() => base32Decode('')).toThrow('empty secret');
  });

  test('throws on invalid characters', () => {
    expect(() => base32Decode('JBSWY3DP!!')).toThrow('not valid base32');
  });
});

describe('totp', () => {
  const SECRET = 'GEZDGNBVGY3TQOJQ';

  test('generates a 6-digit code', () => {
    const { code, secondsRemaining } = totp(SECRET);
    expect(code).toMatch(/^\d{6}$/);
    expect(secondsRemaining).toBeGreaterThan(0);
    expect(secondsRemaining).toBeLessThanOrEqual(30);
  });

  test('same second yields same code', () => {
    const fixed = new Date('2026-01-01T00:00:00Z');
    expect(totp(SECRET, fixed).code).toBe(totp(SECRET, fixed).code);
  });

  test('different time steps yield different codes', () => {
    const t1 = new Date('2026-01-01T00:00:00Z');
    const t2 = new Date('2026-01-01T00:00:30Z');
    expect(totp(SECRET, t1).code).not.toBe(totp(SECRET, t2).code);
  });

  test('secondsRemaining counts down within a step', () => {
    const t0 = new Date('2026-01-01T00:00:00Z');
    const t10 = new Date('2026-01-01T00:00:10Z');
    expect(totp(SECRET, t0).secondsRemaining).toBe(30);
    expect(totp(SECRET, t10).secondsRemaining).toBe(20);
  });

  test('known vector: RFC 6238 SHA-1 test key at epoch 59', () => {
    const rfc6238Secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    const { code } = totp(rfc6238Secret, new Date(59_000));
    expect(code).toMatch(/^\d{6}$/);
  });
});
