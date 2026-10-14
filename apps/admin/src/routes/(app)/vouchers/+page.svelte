<script lang="ts">
	import { useQueryClient } from '@tanstack/svelte-query';
	import { renderSnippet } from '@tanstack/svelte-table';
	import { api } from '#lib/api.ts';
	import Badge from '#lib/components/Badge.svelte';
	import DataTable from '#lib/components/DataTable.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import VoucherForm, { type VoucherValue } from '#lib/components/VoucherForm.svelte';
	import { fmtDate } from '#lib/format.ts';
	import { createList, debounce } from '#lib/list.svelte.ts';
	import type { Columns } from '#lib/table.ts';
	import { confirmAction, toast } from '#lib/ui.svelte.ts';

	interface VoucherRow extends VoucherValue {
		id: number;
		usedCount: number;
		createdAt: string;
		productName: string | null;
		valueFmt: string;
		fmt: { minTotal: string };
	}

	const qc = useQueryClient();
	const list = createList<VoucherRow>({ key: 'vouchers', endpoint: '/api/vouchers', sort: { id: 'createdAt', desc: true }, filters: { active: '' } });
	let search = $state('');
	const onSearch = debounce((v: string) => list.setQ(v));

	let editing = $state<{ v: VoucherValue | null } | null>(null);
	let dialog = $state<HTMLDialogElement>();
	$effect(() => {
		if (!dialog) return;
		if (editing && !dialog.open) dialog.showModal();
		if (!editing && dialog.open) dialog.close();
	});

	async function setActive(v: VoucherRow, isActive: boolean) {
		try {
			await api(`/api/vouchers/${v.id}`, { method: 'PATCH', body: { isActive } });
			await qc.invalidateQueries({ queryKey: ['vouchers'] });
		} catch (e) {
			toast.error((e as Error).message);
		}
	}
	async function remove(v: VoucherRow) {
		if (!(await confirmAction({ title: `Delete voucher ${v.code}?`, body: 'Redeemed vouchers cannot be deleted — deactivate them instead.', confirmLabel: 'Delete', danger: true }))) return;
		try {
			await api(`/api/vouchers/${v.id}`, { method: 'DELETE' });
			toast.success('Voucher deleted');
			await qc.invalidateQueries({ queryKey: ['vouchers'] });
		} catch (e) {
			toast.error((e as Error).message);
		}
	}

	const expired = (v: VoucherRow) => !!v.expiresAt && new Date(v.expiresAt) < new Date();

	const columns: Columns<VoucherRow> = [
		{ id: 'code', header: 'Code', enableSorting: true, cell: ({ row }) => renderSnippet(codeCell, row.original) },
		{ id: 'value', header: 'Discount', cell: ({ row }) => renderSnippet(valueCell, row.original) },
		{ id: 'usedCount', header: 'Used', enableSorting: true, cell: ({ row }) => `${row.original.usedCount} / ${row.original.maxUses ?? '∞'}` },
		{ id: 'scope', header: 'Product', cell: ({ row }) => row.original.productName ?? 'Any' },
		{ id: 'expiresAt', header: 'Expires', enableSorting: true, cell: ({ row }) => renderSnippet(expiresCell, row.original) },
		{ id: 'active', header: 'Active', cell: ({ row }) => renderSnippet(activeCell, row.original) },
		{ id: 'actions', header: '', cell: ({ row }) => renderSnippet(actionsCell, row.original) }
	];
</script>

{#snippet codeCell(v: VoucherRow)}<span class="mono font-semibold">{v.code}</span>{/snippet}
{#snippet valueCell(v: VoucherRow)}
	<span class="tabular">{v.valueFmt}</span>
	<div class="text-[11px] text-muted">{v.minTotal ? `min ${v.fmt.minTotal} · ` : ''}{v.perUserLimit}× per user</div>
{/snippet}
{#snippet expiresCell(v: VoucherRow)}
	<span class={expired(v) ? 'text-danger' : ''}>{v.expiresAt ? fmtDate(v.expiresAt) : 'never'}</span>
{/snippet}
{#snippet activeCell(v: VoucherRow)}
	<label class="flex items-center gap-2">
		<input type="checkbox" class="checkbox" checked={v.isActive} onchange={(e) => setActive(v, e.currentTarget.checked)} aria-label="Active {v.code}" />
		{#if expired(v)}<Badge value="expired" />{/if}
	</label>
{/snippet}
{#snippet actionsCell(v: VoucherRow)}
	<div class="flex justify-end gap-1">
		<button class="btn btn-sm" onclick={() => (editing = { v })}>Edit</button>
		<button class="btn btn-sm btn-ghost text-danger" onclick={() => remove(v)}>Delete</button>
	</div>
{/snippet}

<PageHeader title="Vouchers" subtitle="Discount codes customers enter via “Pakai voucher”">
	{#snippet actions()}<button class="btn btn-primary" onclick={() => (editing = { v: null })}>New voucher</button>{/snippet}
</PageHeader>

<DataTable
	{columns}
	data={list.query.data?.items}
	total={list.query.data?.total}
	state={list.state}
	loading={list.query.isPending}
	fetching={list.query.isFetching}
	error={list.query.error}
	empty="No vouchers yet."
>
	{#snippet toolbar()}
		<input class="input w-full sm:w-56" type="search" placeholder="Search code…" aria-label="Search vouchers" bind:value={search} oninput={() => onSearch(search)} />
		<select class="input w-auto" value={list.state.filters.active} onchange={(e) => list.setFilter('active', e.currentTarget.value)} aria-label="Active filter">
			<option value="">Active + inactive</option>
			<option value="true">Active</option>
			<option value="false">Inactive</option>
		</select>
	{/snippet}
</DataTable>

<dialog
	bind:this={dialog}
	class="m-auto w-[min(520px,calc(100vw-32px))] rounded-lg border border-line bg-surface p-0 text-fg shadow-xl backdrop:bg-black/40"
	oncancel={(e) => { e.preventDefault(); editing = null; }}
	onclick={(e) => { if (e.target === dialog) editing = null; }}
>
	{#if editing}
		<div class="p-5">
			<h2 class="mb-4 text-[15px] font-semibold">{editing.v ? `Edit ${editing.v.code}` : 'New voucher'}</h2>
			<VoucherForm
				initial={editing.v}
				onCancel={() => (editing = null)}
				onSaved={async () => {
					toast.success('Voucher saved');
					editing = null;
					await qc.invalidateQueries({ queryKey: ['vouchers'] });
				}}
			/>
		</div>
	{/if}
</dialog>
