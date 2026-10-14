<script lang="ts">
	import { renderSnippet } from '@tanstack/svelte-table';
	import { page } from '$app/state';
	import Badge from '#lib/components/Badge.svelte';
	import DataTable from '#lib/components/DataTable.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { fmtDate, userLabel } from '#lib/format.ts';
	import { createList, debounce } from '#lib/list.svelte.ts';
	import type { Columns } from '#lib/table.ts';

	interface OrderRow {
		id: number;
		code: string;
		userId: number;
		username: string | null;
		productId: number;
		productName: string;
		quantity: number;
		total: number;
		status: string;
		paidWith: string;
		createdAt: string;
		fmt: { total: string };
	}

	const list = createList<OrderRow>({
		key: 'orders',
		endpoint: '/api/orders',
		sort: { id: 'createdAt', desc: true },
		filters: { status: '', paidWith: '', from: '', to: '' },
		initial: page.url.searchParams
	});
	let search = $state(list.state.q);
	const onSearch = debounce((v: string) => list.setQ(v));
	const scoped = $derived(
		[list.state.filters.userId ? `user ${list.state.filters.userId}` : '', list.state.filters.productId ? `product #${list.state.filters.productId}` : '']
			.filter(Boolean)
			.join(', ')
	);

	const columns: Columns<OrderRow> = [
		{ id: 'code', header: 'Order', cell: ({ row }) => renderSnippet(codeCell, row.original) },
		{ id: 'user', header: 'User', cell: ({ row }) => renderSnippet(userCell, row.original) },
		{ id: 'product', header: 'Product', cell: ({ row }) => row.original.productName },
		{ id: 'quantity', header: 'Qty', enableSorting: true, cell: ({ row }) => row.original.quantity },
		{ id: 'total', header: 'Total', enableSorting: true, cell: ({ row }) => renderSnippet(totalCell, row.original) },
		{ id: 'status', header: 'Status', cell: ({ row }) => renderSnippet(statusCell, row.original) },
		{ id: 'createdAt', header: 'Created', enableSorting: true, cell: ({ row }) => fmtDate(row.original.createdAt) }
	];
</script>

{#snippet codeCell(o: OrderRow)}<a class="mono font-medium whitespace-nowrap hover:text-accent" href="/orders/{o.id}">{o.code}</a>{/snippet}
{#snippet userCell(o: OrderRow)}<a class="link" href="/users/{o.userId}">{userLabel(o)}</a>{/snippet}
{#snippet totalCell(o: OrderRow)}<span class="tabular whitespace-nowrap">{o.fmt.total}</span>{/snippet}
{#snippet statusCell(o: OrderRow)}
	<div class="flex items-center gap-1.5"><Badge value={o.status} /><span class="text-[11px] text-muted">{o.paidWith}</span></div>
{/snippet}

<PageHeader title="Orders" subtitle={scoped ? `Filtered: ${scoped}` : 'All purchases (balance and direct pay)'}>
	{#snippet actions()}
		{#if scoped}<a class="btn" href="/orders" data-sveltekit-reload>Clear scope</a>{/if}
		<a class="btn" href="/api/orders/export?{list.queryString}" download>Export CSV</a>
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
	rowHref={(o) => `/orders/${o.id}`}
	empty="No orders match."
>
	{#snippet toolbar()}
		<input class="input w-full sm:w-64" type="search" placeholder="Code, @username, user id, product…" aria-label="Search orders" bind:value={search} oninput={() => onSearch(search)} />
		<select class="input w-auto" value={list.state.filters.status} onchange={(e) => list.setFilter('status', e.currentTarget.value)} aria-label="Status">
			<option value="">All statuses</option>
			<option value="completed">Completed</option>
			<option value="pending_payment">Pending payment</option>
			<option value="cancelled">Cancelled</option>
			<option value="refunded">Refunded</option>
		</select>
		<select class="input w-auto" value={list.state.filters.paidWith} onchange={(e) => list.setFilter('paidWith', e.currentTarget.value)} aria-label="Paid with">
			<option value="">Any payment</option>
			<option value="balance">Balance</option>
			<option value="payment">Direct pay</option>
		</select>
		<label class="flex items-center gap-1 text-xs text-muted">From <input class="input w-auto" type="date" value={list.state.filters.from} onchange={(e) => list.setFilter('from', e.currentTarget.value)} /></label>
		<label class="flex items-center gap-1 text-xs text-muted">To <input class="input w-auto" type="date" value={list.state.filters.to} onchange={(e) => list.setFilter('to', e.currentTarget.value)} /></label>
	{/snippet}
</DataTable>
