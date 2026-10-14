// Server-paginated list state + TanStack Query, shared by every table page.
import { createQuery, keepPreviousData } from '@tanstack/svelte-query';
import { api } from './api';
import type { Page } from './paging';
import { qs } from './paging';

export interface ListState {
	pageIndex: number;
	pageSize: number;
	sorting: { id: string; desc: boolean }[];
	q: string;
	filters: Record<string, string>;
}

export function createList<T, X extends object = object>(opts: {
	key: string;
	endpoint: string | (() => string);
	sort?: { id: string; desc: boolean };
	pageSize?: number;
	filters?: Record<string, string>;
	/** Initial values read from the page URL (e.g. ?status=pending&userId=1). */
	initial?: Pick<URLSearchParams, 'get' | 'entries'>;
	/** A function receives the latest data (e.g. poll faster while something is in progress). */
	refetchInterval?: number | false | ((data: (Page<T> & X) | undefined) => number | false);
	enabled?: () => boolean;
}) {
	const init = opts.initial;
	const filters: Record<string, string> = { ...(opts.filters ?? {}) };
	if (init) for (const k of Object.keys(filters)) filters[k] = init.get(k) ?? filters[k]!;
	if (init) for (const [k, v] of init.entries()) if (k !== 'q' && !(k in filters)) filters[k] = v;

	const state = $state<ListState>({
		pageIndex: 0,
		pageSize: opts.pageSize ?? 20,
		sorting: opts.sort ? [opts.sort] : [],
		q: init?.get('q') ?? '',
		filters
	});

	const url = () => {
		const s = state.sorting[0];
		const ep = typeof opts.endpoint === 'function' ? opts.endpoint() : opts.endpoint;
		return (
			ep +
			qs({
				page: state.pageIndex + 1,
				pageSize: state.pageSize,
				sort: s ? `${s.id}:${s.desc ? 'desc' : 'asc'}` : undefined,
				q: state.q,
				...state.filters
			})
		);
	};

	const query = createQuery(() => ({
		queryKey: [opts.key, url()],
		queryFn: () => api<Page<T> & X>(url()),
		placeholderData: keepPreviousData,
		enabled: typeof window !== 'undefined' && (opts.enabled ? opts.enabled() : true),
		refetchInterval: (q: { state: { data: (Page<T> & X) | undefined } }) =>
			typeof opts.refetchInterval === 'function' ? opts.refetchInterval(q.state.data) : (opts.refetchInterval ?? false)
	}));

	return {
		state,
		query,
		get queryString() {
			return qs({ q: state.q, ...state.filters }).replace(/^\?/, '');
		},
		setFilter(k: string, v: string) {
			state.filters[k] = v;
			state.pageIndex = 0;
		},
		setQ(v: string) {
			state.q = v;
			state.pageIndex = 0;
		}
	};
}

/** Debounce helper for search inputs. */
export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms = 300) {
	let t: ReturnType<typeof setTimeout> | undefined;
	return (...a: A) => {
		clearTimeout(t);
		t = setTimeout(() => fn(...a), ms);
	};
}
