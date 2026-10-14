<script lang="ts">
	import { renderSnippet } from '@tanstack/svelte-table';
	import Badge from '#lib/components/Badge.svelte';
	import DataTable from '#lib/components/DataTable.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { fmtDate, fmtRelative, userLabel } from '#lib/format.ts';
	import { createList, debounce } from '#lib/list.svelte.ts';
	import type { Columns } from '#lib/table.ts';

	interface Session {
		id: number;
		userId: number;
		username: string | null;
		firstName: string | null;
		userThreadId: number | null;
		adminThreadId: number | null;
		status: 'open' | 'closed';
		createdAt: string;
		closedAt: string | null;
	}

	const list = createList<Session, { counts: { open: number; closed: number }; adminChatId: string | null }>({
		key: 'support',
		endpoint: '/api/support',
		sort: { id: 'createdAt', desc: true },
		filters: { status: 'open' },
		refetchInterval: 20_000
	});
	let search = $state('');
	const onSearch = debounce((v: string) => list.setQ(v));

	/** Link to the forum topic in the admin group (private supergroup links use the id without -100). */
	function topicLink(s: Session): string | null {
		const chat = list.query.data?.adminChatId;
		if (!chat || !s.adminThreadId) return null;
		const internal = chat.replace(/^-100/, '');
		return `https://t.me/c/${internal}/${s.adminThreadId}`;
	}

	const columns: Columns<Session> = [
		{ id: 'id', header: '#', cell: ({ row }) => row.original.id },
		{ id: 'user', header: 'User', cell: ({ row }) => renderSnippet(userCell, row.original) },
		{ id: 'status', header: 'Status', cell: ({ row }) => renderSnippet(statusCell, row.original) },
		{ id: 'topic', header: 'Admin topic', cell: ({ row }) => renderSnippet(topicCell, row.original) },
		{ id: 'createdAt', header: 'Opened', cell: ({ row }) => renderSnippet(openedCell, row.original) },
		{ id: 'closedAt', header: 'Closed', cell: ({ row }) => fmtDate(row.original.closedAt) }
	];
</script>

{#snippet userCell(s: Session)}<a class="link" href="/users/{s.userId}">{userLabel(s)}</a> <span class="text-xs text-muted">{s.userId}</span>{/snippet}
{#snippet statusCell(s: Session)}<Badge value={s.status} />{/snippet}
{#snippet topicCell(s: Session)}
	{@const link = topicLink(s)}
	{#if link}<a class="link" href={link} target="_blank" rel="noopener noreferrer">Open topic #{s.adminThreadId} ↗</a>{:else}<span class="text-muted">—</span>{/if}
{/snippet}
{#snippet openedCell(s: Session)}<span title={fmtDate(s.createdAt)}>{fmtRelative(s.createdAt)}</span>{/snippet}

<PageHeader title="Support" subtitle="Live support sessions — replies happen in the admin forum topic in Telegram" />

<DataTable
	{columns}
	data={list.query.data?.items}
	total={list.query.data?.total}
	state={list.state}
	loading={list.query.isPending}
	fetching={list.query.isFetching}
	error={list.query.error}
	empty="No sessions in this view."
>
	{#snippet toolbar()}
		<div class="inline-flex rounded-md border border-line p-0.5" role="tablist">
			{#each [['open', 'Open'], ['closed', 'Closed'], ['all', 'All']] as [v, label] (v)}
				<button
					role="tab"
					aria-selected={list.state.filters.status === v}
					class="rounded px-2.5 py-1 text-xs font-medium {list.state.filters.status === v ? 'bg-accent-soft text-accent' : 'text-muted hover:text-fg'}"
					onclick={() => list.setFilter('status', v!)}
				>
					{label}
					{#if v !== 'all' && list.query.data}<span class="tabular opacity-70">{list.query.data.counts[v as 'open' | 'closed']}</span>{/if}
				</button>
			{/each}
		</div>
		<input class="input w-full sm:w-56" type="search" placeholder="@username or user id" aria-label="Search support sessions" bind:value={search} oninput={() => onSearch(search)} />
	{/snippet}
</DataTable>
