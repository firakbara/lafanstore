import { getSettings, updateSettings, type StoreSettings } from '@tokobun/core';
import { BadRequest, endpoint, int, readJson } from '#lib/server/http.ts';

export const GET = endpoint(async ({ locals }) => getSettings(locals.storeId));

/** Validates and forwards a full StoreSettings object to core updateSettings. */
export const PUT = endpoint(async ({ request, locals }) => {
	const b = await readJson(request);
	const rawTiers = Array.isArray(b.topupBonusTiers) ? (b.topupBonusTiers as Record<string, unknown>[]) : [];
	if (rawTiers.length > 20) throw new BadRequest('Too many bonus tiers (max 20)', 'topupBonusTiers');
	const tiers = rawTiers;
	const fx = (b.fxRates && typeof b.fxRates === 'object' ? b.fxRates : {}) as Record<string, unknown>;
	const fxEntries = Object.entries(fx);
	if (fxEntries.length > 50) throw new BadRequest('Too many currency rates (max 50)', 'fxRates');
	const fxRates: Record<string, number> = {};
	for (const [k, v] of fxEntries) {
		if (!/^[A-Z]{3,5}$/.test(k)) throw new BadRequest(`Invalid currency code "${k}"`, 'fxRates');
		if (k === 'USD') continue;
		if (typeof v !== 'number' || !(v > 0) || !Number.isFinite(v)) throw new BadRequest(`Rate for ${k} must be a positive number`, 'fxRates');
		fxRates[k] = v;
	}
	const langs = Array.isArray(b.supportedLanguages) ? b.supportedLanguages.map(String).map((s) => s.trim()).filter(Boolean) : [];
	if (!langs.length || langs.length > 20 || langs.some((l) => !/^[a-z]{2,3}$/.test(l))) throw new BadRequest('Languages must be 1–20 codes of 2–3 letters, e.g. id, en', 'supportedLanguages');
	const optText = (k: string, re: RegExp, msg: string) => {
		const v = typeof b[k] === 'string' ? (b[k] as string).trim() : '';
		if (!v) return null;
		if (!re.test(v)) throw new BadRequest(msg, k);
		return v;
	};
	const storeName = typeof b.storeName === 'string' ? b.storeName.trim() : '';
	if (!storeName || storeName.length > 64) throw new BadRequest('Store name is required (max 64)', 'storeName');
	const patch: StoreSettings = {
		storeName,
		channelUrl: optText('channelUrl', /^https?:\/\/\S+$/, 'Channel URL must start with http(s)://'),
		supportUsername: optText('supportUsername', /^@?[A-Za-z0-9_]{4,32}$/, 'Support username must be a Telegram username')?.replace(/^@/, '') ?? null,
		supportedLanguages: [...new Set(langs)],
		referralPercentBp: int(b, 'referralPercentBp', { min: 0, max: 10000 }),
		referralMaxPerTopup: int(b, 'referralMaxPerTopup', { min: 0 }),
		referralMinWithdraw: int(b, 'referralMinWithdraw', { min: 0 }),
		topupMin: int(b, 'topupMin', { min: 1 }),
		orderPaymentTtlMinutes: int(b, 'orderPaymentTtlMinutes', { min: 1, max: 1440 }),
		topupBonusTiers: tiers
			.map((t) => ({ minAmount: int(t, 'minAmount', { min: 1 }), percentBp: int(t, 'percentBp', { min: 1, max: 10000 }) }))
			.sort((a, c) => a.minAmount - c.minAmount),
		fxRates
	};
	return updateSettings(locals.storeId, patch);
});
