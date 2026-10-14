<script lang="ts">
	import { apiUrl, link } from '#lib/current-store.ts';
	import { renderSnippet } from '@tanstack/svelte-table';
	import { page } from '$app/state';
	import Badge from '#lib/components/Badge.svelte';
	import DataTable from '#lib/components/DataTable.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { fmtDate, fmtRelative } from '#lib/format.ts';
	import { createList, debounce } from '#lib/list.svelte.ts';
	import type { Columns } from '#lib/table.ts';

	interface UserRow {
		id: number;
		username: string | null;
		firstName: string | null;
		language: string;
		currency: string;
		balance: number;
		isBanned: boolean;
		blockedBot: boolean;
		orderCount: number;
		createdAt: string;
		lastSeenAt: string;
		fmt: { balance: string };
	}

	const list = createList<UserRow>({
		key: 'users',
		endpoint: () => apiUrl('/users'),
		sort: { id: 'createdAt', desc: true },
		filters: { banned: '', hasBalance: '' },
		initial: page.url.searchParams
	});
	let search = $state(list.state.q);
	const onSearch = debounce((v: string) => list.setQ(v));

	const columns: Columns<UserRow> = [
		{ id: 'id', header: 'User', enableSorting: true, cell: ({ row }) => renderSnippet(userCell, row.original) },
		{ id: 'balance', header: 'Balance', enableSorting: true, cell: ({ row }) => renderSnippet(balanceCell, row.original) },
		{ id: 'orders', header: 'Orders', cell: ({ row }) => row.original.orderCount },
		{ id: 'locale', header: 'Lang / ccy', cell: ({ row }) => `${row.original.language} · ${row.original.currency}` },
		{ id: 'flags', header: 'Status', cell: ({ row }) => renderSnippet(flagsCell, row.original) },
		{ id: 'createdAt', header: 'Joined', enableSorting: true, cell: ({ row }) => fmtDate(row.original.createdAt, false) },
		{ id: 'lastSeenAt', header: 'Last seen', enableSorting: true, cell: ({ row }) => fmtRelative(row.original.lastSeenAt) }
	];
</script>

{#snippet userCell(u: UserRow)}
	<a class="font-medium hover:text-accent" href={link(`/users/${u.id}`)}>{u.username ? `@${u.username}` : (u.firstName ?? 'no name')}</a>
	<div class="mono text-[11px] text-muted">{u.id}{u.username && u.firstName ? ` · ${u.firstName}` : ''}</div>
{/snippet}
{#snippet balanceCell(u: UserRow)}<span class="tabular whitespace-nowrap {u.balance > 0 ? '' : 'text-muted'}">{u.fmt.balance}</span>{/snippet}
{#snippet flagsCell(u: UserRow)}
	<div class="flex gap-1">
		{#if u.isBanned}<Badge value="banned" />{/if}
		{#if u.blockedBot}<Badge value="blocked bot" tone="muted" />{/if}
		{#if !u.isBanned && !u.blockedBot}<Badge value="active" />{/if}
	</div>
{/snippet}

<PageHeader title="Users" subtitle="Telegram customers, balances and bans" />

<DataTable
	{columns}
	data={list.query.data?.items}
	total={list.query.data?.total}
	state={list.state}
	loading={list.query.isPending}
	fetching={list.query.isFetching}
	error={list.query.error}
	rowHref={(u) => link(`/users/${u.id}`)}
	empty="No users match."
>
	{#snippet toolbar()}
		<input class="input w-full sm:w-72" type="search" placeholder="Telegram id, @username, name, referral code…" aria-label="Search users" bind:value={search} oninput={() => onSearch(search)} />
		<select class="input w-auto" value={list.state.filters.banned} onchange={(e) => list.setFilter('banned', e.currentTarget.value)} aria-label="Ban status">
			<option value="">Banned + active</option>
			<option value="false">Not banned</option>
			<option value="true">Banned</option>
		</select>
		<label class="flex items-center gap-1.5 text-xs text-muted">
			<input type="checkbox" class="checkbox" checked={list.state.filters.hasBalance === 'true'} onchange={(e) => list.setFilter('hasBalance', e.currentTarget.checked ? 'true' : '')} />
			With balance
		</label>
	{/snippet}
</DataTable>
