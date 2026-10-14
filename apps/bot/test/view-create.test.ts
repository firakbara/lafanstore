import { describe, expect, test } from 'bun:test';
import { createView, viewFor } from '../src/util/view';
import type { UserProfile, StoreSettings, Cents } from '@tokobun/core';

describe('createView', () => {
  test('resolves language "id" to "id"', () => {
    const view = createView({ lang: 'id', currency: 'IDR', tzOffset: 420, money: () => '' });
    expect(view.lang).toBe('id');
  });

  test('resolves unknown language "xx" to fallback "en"', () => {
    const view = createView({ lang: 'xx', currency: 'USD', tzOffset: 0, money: () => '' });
    expect(view.lang).toBe('en');
  });

  test('t() returns translated HTML string for a known key', () => {
    const view = createView({ lang: 'id', currency: 'IDR', tzOffset: 420, money: () => '' });
    const result = view.t('common.back');
    expect(result).toContain('Kembali');
  });

  test('t() returns English translation when lang resolves to en', () => {
    const view = createView({ lang: 'en', currency: 'USD', tzOffset: 0, money: () => '' });
    const result = view.t('common.back');
    expect(result).toContain('Back');
  });

  test('tp() returns plain translated string', () => {
    const view = createView({ lang: 'id', currency: 'IDR', tzOffset: 420, money: () => '' });
    const result = view.tp('common.back');
    expect(typeof result).toBe('string');
    expect(result).toContain('Kembali');
  });

  test('money() delegates to the passed function', () => {
    const moneyFn = (amount: Cents) => `$${(amount / 100).toFixed(2)}`;
    const view = createView({ lang: 'en', currency: 'USD', tzOffset: 0, money: moneyFn });
    expect(view.money(1500)).toBe('$15.00');
    expect(view.money(0)).toBe('$0.00');
  });

  test('date() formats using the tzOffset', () => {
    const view = createView({ lang: 'en', currency: 'USD', tzOffset: 420, money: () => '' });
    // 2026-10-03 00:00 UTC => with +420min (UTC+7) => 2026-10-03 07:00
    const d = new Date('2026-10-03T00:00:00Z');
    expect(view.date(d)).toBe('2026-10-03 07:00');
  });

  test('date() formats correctly with negative tzOffset', () => {
    const view = createView({ lang: 'en', currency: 'USD', tzOffset: -300, money: () => '' });
    // 2026-10-03 10:00 UTC => with -300min (UTC-5) => 2026-10-03 05:00
    const d = new Date('2026-10-03T10:00:00Z');
    expect(view.date(d)).toBe('2026-10-03 05:00');
  });

  test('currency is stored correctly', () => {
    const view = createView({ lang: 'en', currency: 'IDR', tzOffset: 0, money: () => '' });
    expect(view.currency).toBe('IDR');
  });

  test('tzOffset is stored correctly', () => {
    const view = createView({ lang: 'en', currency: 'USD', tzOffset: 420, money: () => '' });
    expect(view.tzOffset).toBe(420);
  });
});

describe('viewFor', () => {
  const mockUser: UserProfile = {
    id: 1,
    username: 'testuser',
    firstName: 'Test',
    language: 'id',
    currency: 'IDR',
    tzOffsetMinutes: 420,
    balance: 10000,
    referralCode: 'REF123',
    notifyStock: true,
    notifyInfo: true,
    notifyReferral: true,
    isBanned: false,
    createdAt: new Date('2026-01-01'),
  };

  const mockSettings: StoreSettings = {
    referralPercentBp: 500,
    referralMaxPerTopup: 300,
    referralMinWithdraw: 100,
    topupMin: 100,
    topupBonusTiers: [],
    orderPaymentTtlMinutes: 15,
    fxRates: { IDR: 16300 },
    supportedLanguages: ['id', 'en'],
    storeName: 'TestStore',
    channelUrl: null,
    supportUsername: null,
  };

  test('constructs a View with correct lang from UserProfile', () => {
    const view = viewFor(mockUser, mockSettings);
    expect(view.lang).toBe('id');
  });

  test('constructs a View with correct currency from UserProfile', () => {
    const view = viewFor(mockUser, mockSettings);
    expect(view.currency).toBe('IDR');
  });

  test('constructs a View with correct tzOffset from UserProfile', () => {
    const view = viewFor(mockUser, mockSettings);
    expect(view.tzOffset).toBe(420);
  });

  test('money() formats using formatMoney with user currency and store fxRates', () => {
    const view = viewFor(mockUser, mockSettings);
    // 100 cents = $1.00 USD, at rate 16300 IDR/USD => Rp16,300
    const result = view.money(100);
    expect(result).toContain('Rp');
    expect(result).toContain('16');
  });

  test('t() works on the constructed View', () => {
    const view = viewFor(mockUser, mockSettings);
    const result = view.t('common.back');
    expect(result).toContain('Kembali');
  });

  test('date() works on the constructed View', () => {
    const view = viewFor(mockUser, mockSettings);
    const d = new Date('2026-10-03T00:00:00Z');
    expect(view.date(d)).toBe('2026-10-03 07:00');
  });

  test('works with USD currency and empty fxRates', () => {
    const usdUser: UserProfile = { ...mockUser, currency: 'USD' };
    const emptyRatesSettings: StoreSettings = { ...mockSettings, fxRates: {} };
    const view = viewFor(usdUser, emptyRatesSettings);
    expect(view.currency).toBe('USD');
    // 150 cents = $1.50 USD
    const result = view.money(150);
    expect(result).toContain('1.50');
    expect(result).toContain('USD');
  });
});
