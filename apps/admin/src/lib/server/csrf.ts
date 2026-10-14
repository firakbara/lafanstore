// SvelteKit's built-in CSRF check only covers form content types (urlencoded / multipart / text/plain).
// The JSON API is called with fetch, so a cross-site `fetch(…, { mode: 'no-cors', credentials: 'include' })`
// from a same-site page (any *.firmanakbar.com host) would carry the SameSite=Lax session cookie and slip past it.
// Browsers always send `Origin` on non-GET/HEAD fetches, so requiring it to match closes that hole.

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** True when a state-changing /api/ request did not come from this origin (missing or foreign `Origin`). */
export function isCrossSiteApiWrite(method: string, path: string, originHeader: string | null, urlOrigin: string): boolean {
	if (!path.startsWith('/api/')) return false;
	if (SAFE_METHODS.has(method.toUpperCase())) return false;
	return originHeader !== urlOrigin;
}
