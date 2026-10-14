<script lang="ts">
	import { createMutation, useQueryClient } from '@tanstack/svelte-query';
	import { renderSnippet } from '@tanstack/svelte-table';
	import { page } from '$app/state';
	import { api } from '#lib/api.ts';
	import Badge from '#lib/components/Badge.svelte';
	import DataTable from '#lib/components/DataTable.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { fmtInt } from '#lib/format.ts';
	import { createList, debounce } from '#lib/list.svelte.ts';
	import type { Columns } from '#lib/table.ts';
	import { toast } from '#lib/ui.svelte.ts';

	interface ProductRow {
		id: number;
		code: string;
		name: string;
		icon: string | null;
		customEmojiId: string | null;
		price: number;
		parentId: number | null;
		parentName: string | null;
		isCollection: boolean;
		unlimited: boolean;
		isActive: boolean;
		sortOrder: number;
		stock: number;
		variantCount: number;
		variantStock: number | null;
		tierCount: number;
		fmt: { price: string };
	}

	const list = createList<ProductRow>({
		key: 'products',
		endpoint: '/api/products',
		sort: { id: 'sortOrder', desc: false },
		filters: { kind: '', active: '', parent: '' },
		initial: page.url.searchParams,
		pageSize: 50
	});
	const qc = useQueryClient();
	let search = $state(list.state.q);
	const onSearch = debounce((v: string) => list.setQ(v));

	const patch = createMutation(() => ({
		mutationFn: (v: { id: number; body: Record<string, unknown> }) => api(`/api/products/${v.id}`, { method: 'PATCH', body: v.body }),
		onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
		onError: (e: Error) => toast.error(e.message)
	}));

	const columns: Columns<ProductRow> = [
		{ id: 'name', header: 'Product', enableSorting: true, cell: ({ row }) => renderSnippet(nameCell, row.original) },
		{ id: 'price', header: 'Price', enableSorting: true, cell: ({ row }) => renderSnippet(priceCell, row.original) },
		{ id: 'stock', header: 'Stock', enableSorting: true, cell: ({ row }) => renderSnippet(stockCell, row.original) },
		{ id: 'tiers', header: 'Promo', cell: ({ row }) => (row.original.tierCount ? `${row.original.tierCount} tier${row.original.tierCount > 1 ? 's' : ''}` : '—') },
		{ id: 'sortOrder', header: 'Sort', enableSorting: true, cell: ({ row }) => renderSnippet(sortCell, row.original) },
		{ id: 'active', header: 'Active', cell: ({ row }) => renderSnippet(activeCell, row.original) }
	];
</script>

{#snippet nameCell(p: ProductRow)}
	<div class="flex min-w-[220px] items-center gap-2">
		<span class="grid size-7 shrink-0 place-items-center rounded bg-surface-2 text-[15px]" title={p.customEmojiId ? `custom emoji ${p.customEmojiId}` : ''}>{p.icon ?? '·'}</span>
		<div class="min-w-0">
			<a class="font-medium hover:text-accent" href="/products/{p.id}">{p.name}</a>
			<div class="flex items-center gap-1.5 text-[11px] text-muted">
				<span class="mono">{p.code}</span>
				{#if p.isCollection}<Badge value="collection" tone="accent" />{/if}
				{#if p.parentName}<span>in {p.parentName}</span>{/if}
			</div>
		</div>
	</div>
{/snippet}

{#snippet priceCell(p: ProductRow)}
	<span class="tabular whitespace-nowrap">{p.isCollection ? '—' : p.fmt.price}</span>
{/snippet}

{#snippet stockCell(p: ProductRow)}
	{#if p.isCollection}
		<span class="text-muted">{p.variantCount} variants · {fmtInt(p.variantStock)}</span>
	{:else if p.unlimited}
		<span class="text-info">∞ unlimited</span>
	{:else}
		<a href="/stock?productId={p.id}" class="tabular font-medium {p.stock === 0 ? 'text-danger' : p.stock <= 5 ? 'text-warn' : ''} hover:underline">{p.stock}</a>
	{/if}
{/snippet}

{#snippet sortCell(p: ProductRow)}
	<input
		class="input h-7 w-16 px-1.5 text-center tabular"
		type="number"
		value={p.sortOrder}
		aria-label="Sort order for {p.name}"
		onchange={(e) => patch.mutate({ id: p.id, body: { sortOrder: Number((e.target as HTMLInputElement).value) || 0 } })}
	/>
{/snippet}

{#snippet activeCell(p: ProductRow)}
	<label class="relative inline-flex cursor-pointer items-center">
		<input
			type="checkbox"
			class="peer sr-only"
			checked={p.isActive}
			aria-label="Active: {p.name}"
			onchange={(e) => patch.mutate({ id: p.id, body: { isActive: (e.target as HTMLInputElement).checked } })}
		/>
		<span class="h-5 w-9 rounded-full bg-line transition-colors peer-checked:bg-ok after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4"></span>
	</label>
{/snippet}

<PageHeader title="Products" subtitle="Catalog, collections & variants, pricing tiers">
	{#snippet actions()}
		<a class="btn" href="/products/new?collection=1">New collection</a>
		<a class="btn btn-primary" href="/products/new">New product</a>
	{/snippet}
</PageHeader>

<DataTable
	{columns}
	data={list.query.data?.items}
	total={list.query.data?.total}
	state={list.state}
	loading={list.query.isPending}
	fetching={list.query.isFetching}
	error={list.query.error}
	rowHref={(p) => `/products/${p.id}`}
	empty="No products match."
>
	{#snippet toolbar()}
		<input
			class="input h-8 w-full sm:w-64"
			placeholder="Search name or code…"
			type="search"
			aria-label="Search products"
			bind:value={search}
			oninput={() => onSearch(search)}
		/>
		<select class="input w-auto" value={list.state.filters.kind} onchange={(e) => list.setFilter('kind', (e.target as HTMLSelectElement).value)} aria-label="Kind">
			<option value="">All kinds</option>
			<option value="sellable">Sellable</option>
			<option value="collection">Collections</option>
		</select>
		<select class="input w-auto" value={list.state.filters.active} onchange={(e) => list.setFilter('active', (e.target as HTMLSelectElement).value)} aria-label="Active">
			<option value="">Active + inactive</option>
			<option value="true">Active</option>
			<option value="false">Inactive</option>
		</select>
		<label class="flex items-center gap-1.5 text-xs text-muted">
			<input
				type="checkbox"
				class="checkbox"
				checked={list.state.filters.parent === 'top'}
				onchange={(e) => list.setFilter('parent', (e.target as HTMLInputElement).checked ? 'top' : '')}
			/>
			Top-level only
		</label>
	{/snippet}
</DataTable>
