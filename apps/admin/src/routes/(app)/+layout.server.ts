import { safeSettings } from '#lib/server/money.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const settings = await safeSettings(locals.storeId);
	return {
		admin: locals.admin!,
		storeId: locals.storeId,
		stores: locals.adminStores,
		currency: locals.currency,
		currencies: Object.keys(settings?.fxRates ?? {}).filter((c) => c !== 'USD'),
		storeName: settings?.storeName ?? 'TokoBun'
	};
};
