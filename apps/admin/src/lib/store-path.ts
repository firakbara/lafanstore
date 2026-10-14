// Pure URL helpers for store-scoped admin routes (/toko/<slug>/… and /api/toko/<slug>/…).

/** First path segment of every page that lives inside a store. */
export const STORE_SECTIONS = ['products', 'stock', 'orders', 'payments', 'users', 'vouchers', 'broadcasts', 'support', 'payouts', 'settings'] as const;

const isSection = (s: string | undefined): boolean => !!s && (STORE_SECTIONS as readonly string[]).includes(s);
const withSlash = (p: string): string => (p.startsWith('/') ? p : `/${p}`);

export function storeHref(slug: string, path = ''): string {
	const p = path === '' || path === '/' ? '' : withSlash(path);
	return `/toko/${encodeURIComponent(slug)}${p}`;
}

export function storeApi(slug: string, path: string): string {
	return `/api/toko/${encodeURIComponent(slug)}${withSlash(path)}`;
}

/** Where to go when switching to another store: same section, without detail ids (they belong to the old store). */
export function switchTarget(pathname: string, toSlug: string): string {
	const section = /^\/toko\/[^/]+\/([^/?#]+)/.exec(pathname)?.[1];
	return storeHref(toSlug, isSection(section) ? `/${section}` : '');
}

/** Pre-/toko URLs (e.g. /orders?x=1) → their store-scoped location; null when the path is not a legacy one. */
export function legacyRedirect(pathname: string, search: string, slug: string | null): string | null {
	if (!isSection(pathname.split('/')[1])) return null;
	if (!slug) return '/';
	return storeHref(slug, pathname) + search;
}
