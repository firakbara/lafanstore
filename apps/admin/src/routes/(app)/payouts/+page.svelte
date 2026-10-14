<script lang="ts">
	import { useQueryClient } from '@tanstack/svelte-query';
	import { renderSnippet } from '@tanstack/svelte-table';
	import { api } from '#lib/api.ts';
	import Badge from '#lib/components/Badge.svelte';
	import DataTable from '#lib/components/DataTable.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { fmtDate, userLabel } from '#lib/format.ts';
	import { createList, debounce } from '#lib/list.svelte.ts';
	import type { Columns } from '#lib/table.ts';
	import { confirmDialog, toast } from '#lib/ui.svelte.ts';

	interface PayoutRow {
		id: number;
		userId: number;
		username: string | null;
		amount: number;
		kind: string;
		status: 'pending' | 'done' | 'rejected';
		note: string | null;
		createdAt: string;
		fmt: { amount: string };
	}

	const qc = useQueryClient();
	const list = createList<PayoutRow, { pending: { count: number; sumFmt: string } }>({
		key: 'payouts',
		endpoint: '/api/payouts',
		sort: { id: 'createdAt', desc: false },
		filters: { status: 'pending', kind: 'withdraw' }
	});
	let search = $state('');
	const onSearch = debounce((v: string) => list.setQ(v));

	async function decide(p: PayoutRow, decision: 'approve' | 'reject') {
		const r = await confirmDialog(
			decision === 'approve'
				? {
						title: `Approve withdraw of ${p.fmt.amount}?`,
						body: `Confirm you have paid ${userLabel(p)} out-of-band (bank / e-wallet / crypto). The request is marked done.`,
						confirmLabel: 'Approve (paid)',
						input: { label: 'Payment reference (optional)', placeholder: 'e.g. DANA trx 123…' }
					}
				: {
						title: `Reject withdraw of ${p.fmt.amount}?`,
						body: 'The amount returns to the user’s available referral earnings (nothing is lost).',
						confirmLabel: 'Reject',
						danger: true,
						input: { label: 'Reason', placeholder: 'e.g. invalid account number', required: true }
					}
		);
		if (!r.ok) return;
		try {
			const res = await api<{ availableAfterFmt: string }>(`/api/payouts/${p.id}`, { body: { decision, reason: r.value || null } });
			toast.success(decision === 'approve' ? 'Marked as paid' : `Rejected · user's available referral balance is now ${res.availableAfterFmt}`);
			await qc.invalidateQueries({ queryKey: ['payouts'] });
		} catch (e) {
			toast.error((e as Error).message);
		}
	}

	const columns: Columns<PayoutRow> = [
		{ id: 'createdAt', header: 'Requested', enableSorting: true, cell: ({ row }) => fmtDate(row.original.createdAt) },
		{ id: 'user', header: 'User', cell: ({ row }) => renderSnippet(userCell, row.original) },
		{ id: 'amount', header: 'Amount', enableSorting: true, cell: ({ row }) => renderSnippet(amountCell, row.original) },
		{ id: 'note', header: 'Details / note', cell: ({ row }) => renderSnippet(noteCell, row.original) },
		{ id: 'status', header: 'Status', cell: ({ row }) => renderSnippet(statusCell, row.original) },
		{ id: 'actions', header: '', cell: ({ row }) => renderSnippet(actionsCell, row.original) }
	];
</script>

{#snippet userCell(p: PayoutRow)}<a class="link" href="/users/{p.userId}">{userLabel(p)}</a>{/snippet}
{#snippet amountCell(p: PayoutRow)}<span class="font-medium tabular whitespace-nowrap">{p.fmt.amount}</span>{/snippet}
{#snippet noteCell(p: PayoutRow)}<div class="max-w-[380px] text-xs break-words whitespace-pre-line text-muted">{p.note ?? '—'}</div>{/snippet}
{#snippet statusCell(p: PayoutRow)}<Badge value={p.status} />{/snippet}
{#snippet actionsCell(p: PayoutRow)}
	{#if p.status === 'pending' && p.kind === 'withdraw'}
		<div class="flex justify-end gap-1">
			<button class="btn btn-sm btn-primary" onclick={() => decide(p, 'approve')}>Approve</button>
			<button class="btn btn-sm text-danger" onclick={() => decide(p, 'reject')}>Reject</button>
		</div>
	{/if}
{/snippet}

<PageHeader
	title="Referral payouts"
	subtitle={list.query.data ? `${list.query.data.pending.count} pending withdraw request(s) · ${list.query.data.pending.sumFmt}` : 'Cash withdraw requests from referral earnings'}
/>

<DataTable
	{columns}
	data={list.query.data?.items}
	total={list.query.data?.total}
	state={list.state}
	loading={list.query.isPending}
	fetching={list.query.isFetching}
	error={list.query.error}
	empty="No requests in this view."
>
	{#snippet toolbar()}
		<div class="inline-flex rounded-md border border-line p-0.5" role="tablist">
			{#each [['pending', 'Pending'], ['done', 'Approved'], ['rejected', 'Rejected'], ['all', 'All']] as [v, label] (v)}
				<button
					role="tab"
					aria-selected={list.state.filters.status === v}
					class="rounded px-2.5 py-1 text-xs font-medium {list.state.filters.status === v ? 'bg-accent-soft text-accent' : 'text-muted hover:text-fg'}"
					onclick={() => list.setFilter('status', v!)}>{label}</button
				>
			{/each}
		</div>
		<select class="input w-auto" value={list.state.filters.kind} onchange={(e) => list.setFilter('kind', e.currentTarget.value)} aria-label="Kind">
			<option value="withdraw">Cash withdraws</option>
			<option value="transfer">Wallet transfers (log)</option>
		</select>
		<input class="input w-full sm:w-56" type="search" placeholder="@username or user id" aria-label="Search payouts" bind:value={search} oninput={() => onSearch(search)} />
	{/snippet}
</DataTable>
