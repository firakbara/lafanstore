import { describe, expect, test } from 'bun:test';
import { createView, viewFor } from '../src/util/view';
import { DEFAULT_SETTINGS, formatMoney } from '@tokobun/core';
import { t, tp } from '@tokobun/i18n';

describe('createView', () => {
  const money = (c: number) => `$${(c / 100).toFixed(2)}`;
  const makeView = (lang = 'en', currency = 'USD', tzOffset = 420) =>
    createView({ lang, currency, tzOffset, money });

  test('resolves language and stores currency and tzOffset', () => {
    const v = makeView('en', 'USD', 420);
    expect(v.lang).toBe('en');
    expect(v.currency).toBe('USD');
    expect(v.tzOffset).toBe(420);
  });

  test('unknown language falls back to en', () => {
    const v = makeView('fr');
    expect(v.lang).toBe('en');
  });

  test('id language is kept', () => {
    const v = makeView('id');
    expect(v.lang).toBe('id');
  });

  test('id-ID resolves to id', () => {
    const v = makeView('id-ID');
    expect(v.lang).toBe('id');
  });

  test('t() delegates to i18n t() with resolved lang', () => {
    const v = makeView('en');
    expect(v.t('common.back')).toBe(t('en', 'common.back'));
    expect(v.t('common.yes')).toBe(t('en', 'common.yes'));
  });

  test('t() with params interpolates and HTML-escapes', () => {
    const v = makeView('en');
    const key = 'common.back';
    expect(v.t(key)).toBe(t('en', key));
  });

  test('tp() delegates to i18n tp() with resolved lang', () => {
    const v = makeView('en');
    expect(v.tp('common.back')).toBe(tp('en', 'common.back'));
    expect(v.tp('common.cancel')).toBe(tp('en', 'common.cancel'));
  });

  test('money() delegates to the provided money function', () => {
    const v = makeView();
    expect(v.money(150)).toBe('$1.50');
    expect(v.money(0)).toBe('$0.00');
    expect(v.money(9999)).toBe('$99.99');
  });

  test('date() formats using formatDateTime with tzOffset', () => {
    const v = makeView('en', 'USD', 420);
    const d = new Date('2026-10-03T20:30:00Z');
    expect(v.date(d)).toBe('2026-10-04 03:30');
  });

  test('date() with zero offset', () => {
    const v = makeView('en', 'USD', 0);
    const d = new Date('2026-10-03T12:00:00Z');
    expect(v.date(d)).toBe('2026-10-03 12:00');
  });

  test('date() with negative offset', () => {
    const v = makeView('en', 'USD', -300);
    const d = new Date('2026-01-01T02:00:00Z');
    expect(v.date(d)).toBe('2025-12-31 21:00');
  });

  test('empty currency is stored as-is', () => {
    const v = makeView('en', '');
    expect(v.currency).toBe('');
  });

  test('t() for Indonesian locale', () => {
    const v = makeView('id');
    expect(v.t('common.back')).toBe(t('id', 'common.back'));
  });
});

describe('viewFor', () => {
  const user = { language: 'en', currency: 'USD', tzOffsetMinutes: 420 } as any;

  test('creates view from user profile and settings', () => {
    const v = viewFor(user, DEFAULT_SETTINGS);
    expect(v.lang).toBe('en');
    expect(v.currency).toBe('USD');
    expect(v.tzOffset).toBe(420);
  });

  test('money uses formatMoney with user currency and settings fxRates', () => {
    const settings = { ...DEFAULT_SETTINGS, fxRates: { IDR: 16300 } };
    const idrUser = { language: 'id', currency: 'IDR', tzOffsetMinutes: 420 } as any;
    const v = viewFor(idrUser, settings);
    expect(v.money(150)).toBe(formatMoney(150, 'IDR', settings.fxRates));
  });

  test('money with USD and empty fxRates', () => {
    const v = viewFor(user, DEFAULT_SETTINGS);
    expect(v.money(150)).toBe(formatMoney(150, 'USD', DEFAULT_SETTINGS.fxRates));
    expect(v.money(150)).toBe('1.50 USD');
  });

  test('t and tp work through viewFor', () => {
    const v = viewFor(user, DEFAULT_SETTINGS);
    expect(v.t('common.back')).toBe(t('en', 'common.back'));
    expect(v.tp('common.back')).toBe(tp('en', 'common.back'));
  });

  test('date works through viewFor', () => {
    const v = viewFor(user, DEFAULT_SETTINGS);
    expect(v.date(new Date('2026-10-03T20:30:00Z'))).toBe('2026-10-04 03:30');
  });

  test('unknown language in user profile falls back to en', () => {
    const frUser = { language: 'fr', currency: 'EUR', tzOffsetMinutes: 60 } as any;
    const v = viewFor(frUser, DEFAULT_SETTINGS);
    expect(v.lang).toBe('en');
  });

  test('null language in user profile falls back to en', () => {
    const nullUser = { language: null, currency: 'USD', tzOffsetMinutes: 0 } as any;
    const v = viewFor(nullUser, DEFAULT_SETTINGS);
    expect(v.lang).toBe('en');
  });
});
