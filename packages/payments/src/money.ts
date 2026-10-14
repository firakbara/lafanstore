// Pure conversions between base cents (USD) and a provider's pay currency.
// fxRates = units of currency per 1 USD (settings.fxRates); USD is implied 1.
import { CoreError, type Cents } from '@tokobun/core';

/** Currencies paid in whole units (no minor unit). */
const ZERO_DECIMAL = new Set(['IDR', 'JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX', 'PYG']);

export function currencyDecimals(currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2;
}

export function fxRate(currency: string, fxRates: Record<string, number>): number {
  const cur = currency.toUpperCase();
  if (cur === 'USD') return 1;
  const rate = fxRates[cur];
  if (!rate || !Number.isFinite(rate) || rate <= 0) {
    throw new CoreError('INVALID_STATE', `fx rate for ${cur} is not configured`, { currency: cur });
  }
  return rate;
}

const EPS = 1e-9;

/** Base cents -> pay currency major units, rounded UP to the currency's smallest unit
 *  (whole rupiah for IDR, cents for USD) so the store never receives less than `amount`. */
export function centsToPay(amount: Cents, currency: string, fxRates: Record<string, number>): number {
  const rate = fxRate(currency, fxRates);
  const decimals = currencyDecimals(currency);
  const factor = 10 ** decimals;
  const major = (amount / 100) * rate;
  return Math.ceil(major * factor - EPS) / factor;
}

/** Pay currency major units -> base cents. `round` defaults to 'up' (used for fees / minimums). */
export function payToCents(
  value: number,
  currency: string,
  fxRates: Record<string, number>,
  round: 'up' | 'down' | 'nearest' = 'up',
): Cents {
  const rate = fxRate(currency, fxRates);
  const cents = (value * 100) / rate;
  if (round === 'up') return Math.ceil(cents - EPS);
  if (round === 'down') return Math.floor(cents + EPS);
  return Math.round(cents);
}

/** Decimal string for storage/display, e.g. 16300 IDR -> "16300", 1.5 USD -> "1.50". */
export function formatPayAmount(value: number, currency: string): string {
  return value.toFixed(currencyDecimals(currency));
}
