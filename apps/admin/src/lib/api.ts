// Client fetch wrapper for the admin JSON endpoints.

export class ApiError extends Error {
	constructor(
		message: string,
		public readonly status: number,
		public readonly code?: string,
		public readonly field?: string
	) {
		super(message);
	}
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
	const res = await fetch(path, {
		method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
		headers: opts.body !== undefined ? { 'content-type': 'application/json' } : undefined,
		body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
	});
	if (res.status === 401 && typeof window !== 'undefined') {
		window.location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
		throw new ApiError('Session expired', 401);
	}
	const text = await res.text();
	let data: unknown = null;
	try {
		data = text ? JSON.parse(text) : null;
	} catch {
		data = { error: text.slice(0, 200) };
	}
	if (!res.ok) {
		const d = (data ?? {}) as { error?: string; code?: string; field?: string };
		throw new ApiError(d.error ?? `Request failed (${res.status})`, res.status, d.code, d.field);
	}
	return data as T;
}

export function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}
