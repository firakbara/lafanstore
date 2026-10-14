// Store-scoped URLs for the page that is currently open (/toko/[store]/…).
// Call these during component render or from event handlers / query functions, never at module top level.
import { page } from '$app/state';
import { storeApi, storeHref } from './store-path';

export function currentSlug(): string {
	const slug = page.params.store;
	if (!slug) throw new Error('current-store helpers used outside /toko/[store]');
	return slug;
}

/** Link inside the current store, e.g. link('/orders/5') → /toko/<slug>/orders/5. */
export function link(path = ''): string {
	return storeHref(currentSlug(), path);
}

/** API URL of the current store, e.g. apiUrl('/orders') → /api/toko/<slug>/orders. */
export function apiUrl(path: string): string {
	return storeApi(currentSlug(), path);
}
