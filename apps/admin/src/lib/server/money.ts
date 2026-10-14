import { formatMoney, getSettings, type StoreSettings } from '@tokobun/core';
import { usd } from '#lib/money.ts';

export const CURRENCY_COOKIE = 'tb_ccy';

export async function safeSettings(storeId: number): Promise<StoreSettings | null> {
	try {
		return await getSettings(storeId);
	} catch (err) {
		console.warn('[admin] getSettings failed:', (err as Error).message);
		return null;
	}
}

export type MoneyFmt = (cents: number | null | undefined) => string;

/** Formatter built from core formatMoney: "12.50 USD (Rp203.750)" when a secondary currency is selected. */
export async function moneyFormatter(storeId: number, secondary?: string | null): Promise<MoneyFmt> {
	const fx = (await safeSettings(storeId))?.fxRates ?? {};
	const alt = secondary && secondary !== 'USD' && fx[secondary] ? secondary : null;
	const one = (c: number, ccy: string) => {
		try {
			return formatMoney(c, ccy, fx);
		} catch {
			return ccy === 'USD' ? usd(c) : '';
		}
	};
	return (cents) => {
		if (cents == null) return '—';
		const base = one(cents, 'USD');
		const second = alt ? one(cents, alt) : '';
		return second ? `${base} (${second})` : base;
	};
}

/** Adds `fmt: { field: "..." }` with formatted money for the given cents fields. */
export function withFmt<T extends object, K extends keyof T>(fmt: MoneyFmt, row: T, keys: K[]): T & { fmt: Record<K, string> } {
	const out = {} as Record<K, string>;
	for (const k of keys) out[k] = fmt(row[k] as unknown as number | null);
	return { ...row, fmt: out };
}
