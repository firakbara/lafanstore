import { describe, expect, test } from 'bun:test';
import { botReturnUrl, providersFromEnv, webhookUrl } from '../src/registry';

describe('botReturnUrl', () => {
  test('builds https://t.me/<username> from BOT_USERNAME', () => {
    expect(botReturnUrl({ BOT_USERNAME: 'shop_bot' })).toBe('https://t.me/shop_bot');
  });

  test('strips leading @ from BOT_USERNAME', () => {
    expect(botReturnUrl({ BOT_USERNAME: '@shop_bot' })).toBe('https://t.me/shop_bot');
  });

  test('trims whitespace', () => {
    expect(botReturnUrl({ BOT_USERNAME: '  shop_bot  ' })).toBe('https://t.me/shop_bot');
  });

  test('returns null when BOT_USERNAME is missing or empty', () => {
    expect(botReturnUrl({})).toBeNull();
    expect(botReturnUrl({ BOT_USERNAME: '' })).toBeNull();
    expect(botReturnUrl({ BOT_USERNAME: undefined })).toBeNull();
  });
});

describe('webhookUrl', () => {
  test('builds <base>/webhooks/<provider> from PUBLIC_API_URL', () => {
    expect(webhookUrl('tripay', { PUBLIC_API_URL: 'https://api.example.com' })).toBe('https://api.example.com/webhooks/tripay');
  });

  test('strips trailing slashes from PUBLIC_API_URL', () => {
    expect(webhookUrl('cryptobot', { PUBLIC_API_URL: 'https://api.example.com///' })).toBe('https://api.example.com/webhooks/cryptobot');
  });

  test('trims whitespace', () => {
    expect(webhookUrl('manual', { PUBLIC_API_URL: '  https://api.example.com  ' })).toBe('https://api.example.com/webhooks/manual');
  });

  test('returns null when PUBLIC_API_URL is missing or empty', () => {
    expect(webhookUrl('tripay', {})).toBeNull();
    expect(webhookUrl('tripay', { PUBLIC_API_URL: '' })).toBeNull();
    expect(webhookUrl('tripay', { PUBLIC_API_URL: '  ' })).toBeNull();
  });
});

describe('truthy env parsing', () => {
  test('"yes", "on", "YES", "True" all enable manual provider', () => {
    for (const v of ['yes', 'on', 'YES', 'True', 'ON', 'Yes']) {
      const p = providersFromEnv({ PAYMENTS_DEV_MANUAL: v });
      expect(p[2]!.isConfigured()).toBe(true);
    }
  });

  test('"false", "no", "off", "random" all disable manual provider', () => {
    for (const v of ['false', 'no', 'off', 'random', 'FALSE']) {
      const p = providersFromEnv({ PAYMENTS_DEV_MANUAL: v });
      expect(p[2]!.isConfigured()).toBe(false);
    }
  });

  test('whitespace around truthy values is trimmed', () => {
    const p = providersFromEnv({ PAYMENTS_DEV_MANUAL: '  true  ' });
    expect(p[2]!.isConfigured()).toBe(true);
  });

  test('sandbox defaults to true when env var is missing', () => {
    const p = providersFromEnv({ TRIPAY_API_KEY: 'k', TRIPAY_PRIVATE_KEY: 'pk', TRIPAY_MERCHANT_CODE: 'MC' });
    expect(p[0]!.isConfigured()).toBe(true);
  });
});

describe('providersFromEnv', () => {
  test('returns three providers with empty env (none configured)', () => {
    const providers = providersFromEnv({});
    expect(providers).toHaveLength(3);
    expect(providers[0]!.name).toBe('tripay');
    expect(providers[1]!.name).toBe('cryptobot');
    expect(providers[2]!.name).toBe('manual');
    expect(providers.every((p) => !p.isConfigured())).toBe(true);
  });

  test('manual provider enabled via truthy env value', () => {
    const p = providersFromEnv({ PAYMENTS_DEV_MANUAL: '1' });
    expect(p[2]!.isConfigured()).toBe(true);
    const p2 = providersFromEnv({ PAYMENTS_DEV_MANUAL: 'true' });
    expect(p2[2]!.isConfigured()).toBe(true);
    const p3 = providersFromEnv({ PAYMENTS_DEV_MANUAL: '0' });
    expect(p3[2]!.isConfigured()).toBe(false);
  });

  test('tripay configured when API key + private key + merchant code provided', () => {
    const p = providersFromEnv({
      TRIPAY_API_KEY: 'key',
      TRIPAY_PRIVATE_KEY: 'pk',
      TRIPAY_MERCHANT_CODE: 'MC',
    });
    expect(p[0]!.isConfigured()).toBe(true);
  });

  test('cryptobot configured when token provided', () => {
    const p = providersFromEnv({ CRYPTOBOT_TOKEN: '123:ABC' });
    expect(p[1]!.isConfigured()).toBe(true);
  });
});
