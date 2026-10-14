// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Locals {
			admin: { id: number; username: string } | null;
			sessionToken: string | null;
			/** Secondary display currency (from fxRates) chosen in the top bar; null = USD only. */
			currency: string | null;
			/** Currently selected store ID for multi-store admin. */
			storeId: number;
			/** Stores accessible by the admin (cached from hooks to avoid re-querying in layout). */
			adminStores: { id: number; slug: string; name: string; botUsername: string | null; adminChatId: number | null; channelUrl: string | null; isActive: boolean }[];
		}
	}
}

export {};
