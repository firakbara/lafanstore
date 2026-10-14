// List query params shared by every admin listing endpoint: ?page=1&pageSize=20&sort=createdAt:desc&q=...

export interface ListParams<S extends string = string> {
	page: number; // 1-based
	pageSize: number;
	offset: number;
	sort: S;
	dir: 'asc' | 'desc';
	q: string;
}

export interface Page<T> {
	items: T[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
}

function int(v: string | null, fallback: number): number {
	if (v == null || !/^\d+$/.test(v)) return fallback;
	const n = Number(v);
	return Number.isSafeInteger(n) ? n : fallback;
}

export function parseListParams<S extends string>(
	params: URLSearchParams,
	opts: { sortable: readonly S[]; defaultSort: S; defaultDir?: 'asc' | 'desc'; maxPageSize?: number; defaultPageSize?: number }
): ListParams<S> {
	const max = opts.maxPageSize ?? 100;
	const page = Math.max(1, int(params.get('page'), 1));
	const pageSize = Math.min(max, Math.max(1, int(params.get('pageSize'), opts.defaultPageSize ?? 20)));
	const [rawSort, rawDir] = (params.get('sort') ?? '').split(':');
	const sort = (opts.sortable as readonly string[]).includes(rawSort ?? '') ? (rawSort as S) : opts.defaultSort;
	const dir = rawDir === 'asc' || rawDir === 'desc' ? rawDir : (opts.defaultDir ?? 'desc');
	const q = (params.get('q') ?? '').trim().slice(0, 200);
	return { page, pageSize, offset: (page - 1) * pageSize, sort, dir, q };
}

export function toPage<T>(items: T[], total: number, p: { page: number; pageSize: number }): Page<T> {
	return { items, total, page: p.page, pageSize: p.pageSize, totalPages: Math.max(1, Math.ceil(total / p.pageSize)) };
}

/** Build a query string from defined, non-empty values. */
export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
	const sp = new URLSearchParams();
	for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
	const s = sp.toString();
	return s ? `?${s}` : '';
}
