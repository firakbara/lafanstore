// See https://svelte.dev/docs/kit/types#app.d.ts
import type { PublicStore } from '#lib/server/stores.ts';

declare global {
	namespace App {
		interface Locals {
			admin: { id: number; username: string } | null;
			sessionToken: string | null;
			/** Secondary display currency (from fxRates) chosen in the top bar; null = USD only. */
			currency: string | null;
			/** Store named by the URL (/toko/[store] or /api/toko/[store]); null on global routes or unknown slug. */
			store: PublicStore | null;
			/** locals.store.id on store routes; 0 elsewhere. Global routes must not read it. */
			storeId: number;
			/** Slug from the last-store cookie when it names an existing store. */
			lastStore: string | null;
		}
	}
}

export {};
