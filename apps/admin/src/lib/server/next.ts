// Browsers treat `/\` like `//` (scheme-relative → another host) and strip tab/CR/LF anywhere in a URL,
// so `/\evil.com` or `/<TAB>/evil.com` would leave the site. Backslashes and control characters never
// appear in a path we produced ourselves (hooks percent-encode it), so anything containing them is refused.
const UNSAFE_CHAR = /[\\\u0000-\u001f\u007f]/;

/** Where to send the admin after login: a same-origin path, never /login itself; '/' when `raw` is unsafe. */
export function safeNext(raw: string | null): string {
	if (!raw || raw[0] !== '/') return '/';
	if (raw[1] === '/' || raw[1] === '\\') return '/';
	if (UNSAFE_CHAR.test(raw)) return '/';
	if (raw.startsWith('/login')) return '/';
	return raw;
}
