import { settings } from '@tokobun/db';
import { eq, sql } from 'drizzle-orm';
import type { Cents, StoreSettings } from '../contracts';
import { CoreError } from '../contracts';
import { db, inTx } from './util';
import type { DbOrTx } from '@tokobun/db';

export const DEFAULT_SETTINGS: StoreSettings = {
  referralPercentBp: 500,
  referralMaxPerTopup: 300,
  referralMinWithdraw: 100,
  topupMin: 100,
  topupBonusTiers: [],
  orderPaymentTtlMinutes: 15,
  fxRates: {},
  supportedLanguages: ['id', 'en'],
  storeName: 'TokoBun',
  channelUrl: null,
  supportUsername: null,
};

const KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof StoreSettings)[];

export async function getSettings(storeId: number, tx?: DbOrTx): Promise<StoreSettings> {
  const rows = await db(tx).select().from(settings).where(eq(settings.storeId, storeId));
  const out = structuredClone(DEFAULT_SETTINGS) as unknown as Record<string, unknown>;
  for (const r of rows) if ((KEYS as string[]).includes(r.key)) out[r.key] = r.value;
  return out as unknown as StoreSettings;
}

export async function updateSettings(storeId: number, patch: Partial<StoreSettings>): Promise<StoreSettings> {
  const entries = Object.entries(patch).filter(([k, v]) => v !== undefined && (KEYS as string[]).includes(k));
  for (const [k, v] of entries) validate(k as keyof StoreSettings, v);
  await inTx(undefined, async (t) => {
    for (const [key, value] of entries) {
      await t
        .insert(settings)
        .values({ storeId, key, value: value === null ? sql`'null'::jsonb` : value })
        .onConflictDoUpdate({ target: [settings.storeId, settings.key], set: { value: sql`excluded.value` } });
    }
  });
  return getSettings(storeId);
}

function validate(key: keyof StoreSettings, v: unknown) {
  const bad = (msg: string) => {
    throw new CoreError('INVALID_INPUT', `settings.${key}: ${msg}`);
  };
  switch (key) {
    case 'referralPercentBp':
      if (!Number.isInteger(v) || (v as number) < 0 || (v as number) > 10000) bad('must be 0–10000 (basis points)');
      break;
    case 'referralMaxPerTopup':
    case 'referralMinWithdraw':
    case 'topupMin':
      if (!Number.isInteger(v) || (v as number) < 0) bad('must be a non-negative integer');
      break;
    case 'orderPaymentTtlMinutes':
      if (!Number.isInteger(v) || (v as number) < 1) bad('must be at least 1 minute');
      break;
    case 'topupBonusTiers':
      if (!Array.isArray(v) || v.some((t) => !Number.isInteger(t?.minAmount) || t.minAmount < 1 || !Number.isInteger(t?.percentBp) || t.percentBp < 1 || t.percentBp > 10000)) bad('invalid tiers');
      break;
    case 'fxRates':
      if (typeof v !== 'object' || v === null || Object.values(v).some((r) => typeof r !== 'number' || !(r > 0))) bad('rates must be positive numbers');
      break;
    case 'supportedLanguages':
      if (!Array.isArray(v) || v.some((l) => typeof l !== 'string')) bad('must be string[]');
      break;
    case 'storeName':
      if (typeof v !== 'string' || !v.trim()) bad('must be a non-empty string');
      if ((v as string).length > 128) bad('too long (max 128)');
      break;
    case 'channelUrl':
      if (v !== null && typeof v !== 'string') bad('must be a string or null');
      if (typeof v === 'string' && v.length > 256) bad('too long (max 256)');
      break;
    case 'supportUsername':
      if (v !== null && typeof v !== 'string') bad('must be a string or null');
      if (typeof v === 'string' && v.length > 64) bad('too long (max 64)');
      break;
  }
}

// ---------- money ----------
function rateFor(currency: string, fxRates: Record<string, number>): number | null {
  if (currency === 'USD') return 1;
  const r = fxRates[currency];
  return typeof r === 'number' && r > 0 ? r : null;
}

const fmtCache = new Map<string, Intl.NumberFormat | null>();
const IDR_FMT = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

function getFormatter(locale: string, currency: string): Intl.NumberFormat | null {
  const key = `${locale}|${currency}`;
  if (fmtCache.has(key)) return fmtCache.get(key)!;
  try {
    const fmt = new Intl.NumberFormat(locale, { style: 'currency', currency });
    if (fmtCache.size >= 200) {
      const oldest = fmtCache.keys().next().value!;
      fmtCache.delete(oldest);
    }
    fmtCache.set(key, fmt);
    return fmt;
  } catch {
    fmtCache.set(key, null);
    return null;
  }
}

export function formatMoney(amount: Cents, currency: string, fxRates: Record<string, number>, locale?: string): string {
  const cur = (currency || 'USD').toUpperCase();
  const rate = rateFor(cur, fxRates);
  if (rate === null || cur === 'USD') return `${(amount / 100).toFixed(2)} USD`;
  const major = (amount / 100) * rate;
  if (cur === 'IDR') return `Rp${IDR_FMT.format(Math.round(major))}`;
  const fmt = getFormatter(locale ?? 'en-US', cur);
  if (fmt) return fmt.format(major);
  const digits = major >= 1000 ? 0 : 2;
  return `${major.toFixed(digits)} ${cur}`;
}

export function toBaseCents(amountMajor: number, currency: string, fxRates: Record<string, number>): Cents {
  const rate = rateFor((currency || 'USD').toUpperCase(), fxRates) ?? 1;
  return Math.round((amountMajor / rate) * 100);
}
