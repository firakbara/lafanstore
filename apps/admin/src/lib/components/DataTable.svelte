<script lang="ts" generics="T extends Row">
	import { createTable, FlexRender } from '@tanstack/svelte-table';
	import type { Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import type { ListState } from '#lib/list.svelte.ts';
	import { features, type Columns, type Row } from "#lib/table.ts";

	let {
		columns,
		data,
		total,
		state: ls,
		loading = false,
		fetching = false,
		error = null,
		rowHref,
		empty = 'Nothing here yet.',
		toolbar,
		pageSizes = [20, 50, 100]
	}: {
		columns: Columns<T>;
		data: T[] | undefined;
		total: number | undefined;
		state: ListState;
		loading?: boolean;
		fetching?: boolean;
		error?: Error | null;
		rowHref?: (row: T) => string;
		empty?: string;
		toolbar?: Snippet;
		pageSizes?: number[];
	} = $props();

	const EMPTY: T[] = [];

	const table = createTable({
		features,
		get columns() {
			return columns;
		},
		get data() {
			return data ?? EMPTY;
		},
		get rowCount() {
			return total ?? 0;
		},
		manualPagination: true,
		manualSorting: true,
		enableSortingRemoval: false,
		defaultColumn: { enableSorting: false },
		state: {
			get pagination() {
				return { pageIndex: ls.pageIndex, pageSize: ls.pageSize };
			},
			get sorting() {
				return ls.sorting;
			}
		},
		onPaginationChange: (updater) => {
			const cur = { pageIndex: ls.pageIndex, pageSize: ls.pageSize };
			const next = typeof updater === 'function' ? updater(cur) : updater;
			if (next.pageSize !== ls.pageSize) {
				ls.pageSize = next.pageSize;
				ls.pageIndex = 0;
			} else ls.pageIndex = next.pageIndex;
		},
		onSortingChange: (updater) => {
			ls.sorting = typeof updater === 'function' ? updater(ls.sorting) : updater;
			ls.pageIndex = 0;
		}
	});

	const pageCount = $derived(Math.max(1, Math.ceil((total ?? 0) / ls.pageSize)));
	const from = $derived((total ?? 0) === 0 ? 0 : ls.pageIndex * ls.pageSize + 1);
	const to = $derived(Math.min(total ?? 0, (ls.pageIndex + 1) * ls.pageSize));

	function onRowClick(e: MouseEvent, row: T) {
		if (!rowHref) return;
		const target = e.target as HTMLElement;
		if (target.closest('a,button,input,select,label,textarea')) return;
		const href = rowHref(row);
		if (e.metaKey || e.ctrlKey) window.open(href, '_blank');
		else goto(href);
	}
</script>

<div class="card overflow-hidden">
	{#if toolbar}
		<div class="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">{@render toolbar()}</div>
	{/if}
	<div class="relative overflow-x-auto">
		{#if fetching && !loading}
			<div class="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-accent/60"></div>
		{/if}
		<table class="w-full border-collapse text-[13px]">
			<thead>
				{#each table.getHeaderGroups() as hg (hg.id)}
					<tr class="border-b border-line bg-surface-2/60">
						{#each hg.headers as header (header.id)}
							<th class="px-3 py-2 text-left text-[11px] font-semibold tracking-wide whitespace-nowrap text-muted uppercase">
								{#if !header.isPlaceholder}
									{#if header.column.getCanSort()}
										<button class="inline-flex items-center gap-1 uppercase hover:text-fg" onclick={header.column.getToggleSortingHandler()}>
											<FlexRender {header} />
											<span class="text-[10px] {header.column.getIsSorted() ? 'text-accent' : 'opacity-40'}">
												{header.column.getIsSorted() === 'asc' ? '▲' : header.column.getIsSorted() === 'desc' ? '▼' : '↕'}
											</span>
										</button>
									{:else}
										<FlexRender {header} />
									{/if}
								{/if}
							</th>
						{/each}
					</tr>
				{/each}
			</thead>
			<tbody>
				{#if loading}
					{#each Array(6) as _, i (i)}
						<tr class="border-b border-line last:border-0">
							<td colspan={columns.length} class="px-3 py-2.5"><div class="h-4 animate-pulse rounded bg-surface-2"></div></td>
						</tr>
					{/each}
				{:else if error}
					<tr><td colspan={columns.length} class="px-3 py-8 text-center text-danger">{error.message}</td></tr>
				{:else if !data?.length}
					<tr><td colspan={columns.length} class="px-3 py-10 text-center text-muted">{empty}</td></tr>
				{:else}
					{#each table.getRowModel().rows as row (row.id)}
						<tr
							class="border-b border-line last:border-0 {rowHref ? 'cursor-pointer hover:bg-surface-2/70' : ''}"
							onclick={(e) => onRowClick(e, row.original)}
							tabindex={rowHref ? 0 : undefined}
							role={rowHref ? 'link' : undefined}
							onkeydown={rowHref ? (e) => { if (e.key === 'Enter') { e.preventDefault(); onRowClick(e as unknown as MouseEvent, row.original); } } : undefined}
						>
							{#each row.getAllCells() as cell (cell.id)}
								<td class="px-3 py-2 align-middle"><FlexRender {cell} /></td>
							{/each}
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
	<div class="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2 text-xs text-muted">
		<div class="tabular">{from}–{to} of {(total ?? 0).toLocaleString('en-US')}</div>
		<div class="flex items-center gap-2">
			<select
				class="input h-7 w-auto py-0 text-xs"
				aria-label="Rows per page"
				value={ls.pageSize}
				onchange={(e) => table.setPageSize(Number((e.target as HTMLSelectElement).value))}
			>
				{#each pageSizes as s (s)}<option value={s}>{s} / page</option>{/each}
			</select>
			<button class="btn btn-sm" disabled={!table.getCanPreviousPage()} onclick={() => table.firstPage()} aria-label="First page">«</button>
			<button class="btn btn-sm" disabled={!table.getCanPreviousPage()} onclick={() => table.previousPage()} aria-label="Previous page">‹</button>
			<span class="tabular">Page {ls.pageIndex + 1} / {pageCount}</span>
			<button class="btn btn-sm" disabled={!table.getCanNextPage()} onclick={() => table.nextPage()} aria-label="Next page">›</button>
			<button class="btn btn-sm" disabled={!table.getCanNextPage()} onclick={() => table.lastPage()} aria-label="Last page">»</button>
		</div>
	</div>
</div>
