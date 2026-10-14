// Parse money amounts typed by users ("50.000", "50,000", "1,5", "Rp 50.000", "$5") — pure.

/** Currencies without minor units (amounts are typed as whole numbers). */
const ZERO_DECIMAL = new Set(['IDR', 'JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX', 'PYG']);

export function isZeroDecimal(currency: string): boolean {
  return ZERO_DECIMAL.has(currency.toUpperCase());
}

/** Returns the amount in major units, or null if the text is not a positive number. */
export function parseAmount(text: string, currency: string): number | null {
  let s = text.trim().replace(/[^\d.,]/g, '');
  if (!/\d/.test(s)) return null;
  if (isZeroDecimal(currency)) {
    // Thousands separators only; drop a trailing ",00"/".00" style decimal part.
    s = s.replace(/[.,]\d{1,2}$/, '').replace(/[.,]/g, '');
  } else {
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    if (lastDot >= 0 && lastComma >= 0) {
      const dec = Math.max(lastDot, lastComma);
      s = s.slice(0, dec).replace(/[.,]/g, '') + '.' + s.slice(dec + 1);
    } else if (lastComma >= 0 || lastDot >= 0) {
      const sep = lastComma >= 0 ? ',' : '.';
      const parts = s.split(sep);
      const tail = parts[parts.length - 1] ?? '';
      // One separator followed by 1-2 digits = decimal mark; otherwise thousands grouping.
      if (parts.length === 2 && tail.length > 0 && tail.length <= 2) s = parts.join('.');
      else s = parts.join('');
    }
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** A friendly example amount (major units) around `minMajor * 5`, rounded to 2 significant digits. */
export function exampleAmount(minMajor: number, currency: string): string {
  const target = Math.max(minMajor * 5, isZeroDecimal(currency) ? 1 : 0.01);
  const mag = 10 ** Math.max(0, Math.floor(Math.log10(target)) - 1);
  const rounded = Math.ceil(target / mag) * mag;
  return isZeroDecimal(currency) ? String(Math.round(rounded)) : String(Number(rounded.toFixed(2)));
}
