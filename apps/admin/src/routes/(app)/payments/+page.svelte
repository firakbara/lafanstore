<script lang="ts">
	import { renderSnippet } from '@tanstack/svelte-table';
	import { page } from '$app/state';
	import Badge from '#lib/components/Badge.svelte';
	import DataTable from '#lib/components/DataTable.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { fmtDate, userLabel } from '#lib/format.ts';
	import { createList, debounce } from '#lib/list.svelte.ts';
	import type { Columns } from '#lib/table.ts';

	interface PaymentRow {
		id: number;
		code: string;
		userId: number;
		username: string | null;
		purpose: string;
		provider: string;
		method: string;
		amount: number;
		fee: number;
		payCurrency: string;
		payAmount: string;
		status: string;
		createdAt: string;
		paidAt: string | null;
		fmt: { amount: string; fee: string };
	}

	const list = createList<PaymentRow, { providers: string[] }>({
		key: 'payments',
		endpoint: '/api/payments',
		sort: { id: 'createdAt', desc: true },
		filters: { status: '', purpose: '', provider: '', from: '', to: '' },
		initial: page.url.searchParams
	});
	let search = $state(list.state.q);
	const onSearch = debounce((v: string) => list.setQ(v));

	const columns: Columns<PaymentRow> = [
		{ id: 'code', header: 'Payment', cell: ({ row }) => renderSnippet(codeCell, row.original) },
		{ id: 'user', header: 'User', cell: ({ row }) => renderSnippet(userCell, row.original) },
		{ id: 'method', header: 'Method', cell: ({ row }) => `${row.original.provider} · ${row.original.method}` },
		{ id: 'amount', header: 'Amount', enableSorting: true, cell: ({ row }) => renderSnippet(amountCell, row.original) },
		{ id: 'status', header: 'Status', cell: ({ row }) => renderSnippet(statusCell, row.original) },
		{ id: 'createdAt', header: 'Created', enableSorting: true, cell: ({ row }) => fmtDate(row.original.createdAt) },
		{ id: 'paidAt', header: 'Paid', enableSorting: true, cell: ({ row }) => fmtDate(row.original.paidAt) }
	];
</script>

{#snippet codeCell(p: PaymentRow)}
	<a class="mono font-medium whitespace-nowrap hover:text-accent" href="/payments/{p.id}">{p.code}</a>
	<div class="text-[11px] text-muted">{p.purpose}</div>
{/snippet}
{#snippet userCell(p: PaymentRow)}<a class="link" href="/users/{p.userId}">{userLabel(p)}</a>{/snippet}
{#snippet amountCell(p: PaymentRow)}
	<div class="tabular whitespace-nowrap">{p.fmt.amount}</div>
	<div class="text-[11px] whitespace-nowrap text-muted tabular">pays {p.payAmount} {p.payCurrency}{p.fee ? ` · fee ${p.fmt.fee}` : ''}</div>
{/snippet}
{#snippet statusCell(p: PaymentRow)}<Badge value={p.status} />{/snippet}

<PageHeader title="Payments" subtitle="Top-up and direct-pay invoices from all gateways">
	{#snippet actions()}
		<a class="btn" href="/api/payments/export?{list.queryString}" download>Export CSV</a>
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
	rowHref={(p) => `/payments/${p.id}`}
	empty="No payments match."
>
	{#snippet toolbar()}
		<input class="input w-full sm:w-64" type="search" placeholder="Code, provider ref, @user, user id…" aria-label="Search payments" bind:value={search} oninput={() => onSearch(search)} />
		<select class="input w-auto" value={list.state.filters.status} onchange={(e) => list.setFilter('status', e.currentTarget.value)} aria-label="Status">
			<option value="">All statuses</option>
			{#each ['pending', 'paid', 'expired', 'failed', 'cancelled'] as s (s)}<option value={s}>{s}</option>{/each}
		</select>
		<select class="input w-auto" value={list.state.filters.purpose} onchange={(e) => list.setFilter('purpose', e.currentTarget.value)} aria-label="Purpose">
			<option value="">Top-up + order</option>
			<option value="topup">Top-up</option>
			<option value="order">Order</option>
		</select>
		<select class="input w-auto" value={list.state.filters.provider} onchange={(e) => list.setFilter('provider', e.currentTarget.value)} aria-label="Provider">
			<option value="">All providers</option>
			{#each list.query.data?.providers ?? [] as p (p)}<option value={p}>{p}</option>{/each}
		</select>
		<label class="flex items-center gap-1 text-xs text-muted">From <input class="input w-auto" type="date" value={list.state.filters.from} onchange={(e) => list.setFilter('from', e.currentTarget.value)} /></label>
		<label class="flex items-center gap-1 text-xs text-muted">To <input class="input w-auto" type="date" value={list.state.filters.to} onchange={(e) => list.setFilter('to', e.currentTarget.value)} /></label>
	{/snippet}
</DataTable>
