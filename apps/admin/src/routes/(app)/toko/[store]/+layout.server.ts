import { error } from '@sveltejs/kit';
import { listStores } from '@tokobun/core';
import { safeSettings } from '#lib/server/money.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, params }) => {
	// hooks.server.ts resolves the slug; locals.store is a PublicStore (never the bot token).
	// Reading params.store also makes SvelteKit re-run this load when switching stores
	// (it does not track locals).
	if (!locals.store || locals.store.slug !== params.store) error(404, 'Store not found');
	const [settings, all] = await Promise.all([safeSettings(locals.store.id), listStores()]);
	return {
		store: locals.store,
		stores: all.map((s) => ({ slug: s.slug, name: s.name, isActive: s.isActive })),
		currency: locals.currency,
		currencies: Object.keys(settings?.fxRates ?? {}).filter((c) => c !== 'USD'),
		storeName: settings?.storeName ?? locals.store.name
	};
};
