// Client-safe money helpers. Storage/logic is always integer USD cents; admin inputs are USD with ≤ 2 decimals.

const USD_RE = /^(-)?(\d{1,12})(?:\.(\d{0,2}))?$/;

/** Parse a USD amount typed by an admin ("12", "12.5", "1,234.56") into integer cents.
 *  Returns null for anything that is not a valid amount with at most 2 decimals. */
export function parseUsdToCents(input: string | number, opts: { allowNegative?: boolean } = {}): number | null {
	const s = String(input).trim().replace(/[\s,]/g, '').replace(/^\$/, '');
	const m = USD_RE.exec(s);
	if (!m) return null;
	const [, neg, whole, frac = ''] = m;
	if (neg && !opts.allowNegative) return null;
	const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
	if (!Number.isSafeInteger(cents)) return null;
	return neg ? -cents : cents;
}

/** Cents → "12.50" (for prefilling USD inputs). */
export function centsToUsdInput(cents: number | null | undefined): string {
	if (cents == null) return '';
	const neg = cents < 0;
	const abs = Math.abs(cents);
	return `${neg ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Basis points → percent string ("600" → "6"). */
export function bpToPercent(bp: number): string {
	return String(bp / 100);
}

/** Percent input ("6", "6.25") → basis points; null when invalid or > 100%. */
export function percentToBp(input: string | number): number | null {
	const s = String(input).trim();
	if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
	const bp = Math.round(Number(s) * 100);
	return bp <= 10000 ? bp : null;
}

/** Plain local display used only as a fallback when the server did not send a formatted value. */
export function usd(cents: number | null | undefined): string {
	if (cents == null) return '—';
	return `${centsToUsdInput(cents)} USD`;
}
