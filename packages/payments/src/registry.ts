// Builds the provider list from env. Providers are offered only when their env vars are set.
import { createCryptoBotProvider } from './providers/cryptobot';
import { createManualProvider } from './providers/manual';
import { createTripayProvider } from './providers/tripay';
import type { PaymentProvider } from './providers/types';

type Env = Record<string, string | undefined>;

const truthy = (v: string | undefined, dflt = false) => (v == null || v === '' ? dflt : /^(1|true|yes|on)$/i.test(v.trim()));

export function botReturnUrl(env: Env): string | null {
  const u = env.BOT_USERNAME?.trim().replace(/^@/, '');
  return u ? `https://t.me/${u}` : null;
}

export function providersFromEnv(env: Env = process.env): PaymentProvider[] {
  return [
    createTripayProvider({
      apiKey: env.TRIPAY_API_KEY ?? '',
      privateKey: env.TRIPAY_PRIVATE_KEY ?? '',
      merchantCode: env.TRIPAY_MERCHANT_CODE ?? '',
      sandbox: truthy(env.TRIPAY_SANDBOX, true),
      customerEmail: env.TRIPAY_CUSTOMER_EMAIL || undefined,
      returnUrl: botReturnUrl(env),
    }),
    createCryptoBotProvider({
      token: env.CRYPTOBOT_TOKEN ?? '',
      testnet: truthy(env.CRYPTOBOT_TESTNET, true),
      assets: env.CRYPTOBOT_ASSETS || undefined,
      feeBp: env.CRYPTOBOT_FEE_BP ? Number(env.CRYPTOBOT_FEE_BP) : 0,
      returnUrl: botReturnUrl(env),
    }),
    createManualProvider({ enabled: truthy(env.PAYMENTS_DEV_MANUAL), secret: env.PAYMENTS_DEV_MANUAL_SECRET || undefined }),
  ];
}

/** Public base URL of apps/api, used for Tripay's per-transaction callback_url. */
export function webhookUrl(provider: string, env: Env = process.env): string | null {
  const base = env.PUBLIC_API_URL?.trim().replace(/\/+$/, '');
  return base ? `${base}/webhooks/${provider}` : null;
}
