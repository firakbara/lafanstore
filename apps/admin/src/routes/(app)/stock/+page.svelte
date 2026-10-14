<script lang="ts">
	import { createForm } from '@tanstack/svelte-form';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { renderSnippet } from '@tanstack/svelte-table';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api } from '#lib/api.ts';
	import Badge from '#lib/components/Badge.svelte';
	import DataTable from '#lib/components/DataTable.svelte';
	import FieldError from '#lib/components/FieldError.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { fmtDate } from '#lib/format.ts';
	import { createList, debounce } from '#lib/list.svelte.ts';
	import { parseStockImport } from '#lib/stock-import.ts';
	import type { Columns } from '#lib/table.ts';
	import { confirmDialog, confirmAction, toast } from '#lib/ui.svelte.ts';

	interface Option {
		id: number;
		code: string;
		name: string;
		parentName: string | null;
		isCollection: boolean;
		unlimited: boolean;
		stock: number;
	}
	interface Item {
		id: number;
		content: string;
		status: 'available' | 'reserved' | 'sold';
		orderId: number | null;
		createdAt: string;
		soldAt: string | null;
		reservedUntil: string | null;
	}

	const qc = useQueryClient();
	const initialId = page.url.searchParams.get('productId');
	let productId = $state<number | null>(initialId && /^\d+$/.test(initialId) ? Number(initialId) : null);

	const options = createQuery(() => ({
		queryKey: ['product-options', 'sellable'],
		queryFn: () => api<Option[]>('/api/products/options?kind=sellable')
	}));
	const selected = $derived(options.data?.find((o) => o.id === productId) ?? null);

	const list = createList<Item, { status: string; counts: Record<'available' | 'reserved' | 'sold', number> }>({
		key: 'stock',
		endpoint: () => `/api/products/${productId}/stock`,
		enabled: () => productId !== null,
		sort: { id: 'id', desc: true },
		filters: { status: 'available' },
		pageSize: 50
	});
	let search = $state('');
	const onSearch = debounce((v: string) => list.setQ(v));

	let selectedIds = $state<Set<number>>(new Set());
	$effect(() => {
		// reset selection when the page of data changes
		list.query.data;
		productId;
		selectedIds = new Set();
	});

	function pickProduct(id: string) {
		productId = id ? Number(id) : null;
		list.state.pageIndex = 0;
		goto(id ? `/stock?productId=${id}` : '/stock', { replace: true, reset: false });
	}

	async function refreshAll() {
		await Promise.all([qc.invalidateQueries({ queryKey: ['stock'] }), qc.invalidateQueries({ queryKey: ['product-options'] }), qc.invalidateQueries({ queryKey: ['products'] })]);
	}

	// ----- import form (TanStack Form) -----
	const form = createForm(() => ({
		defaultValues: { text: '', mode: 'line' as 'line' | 'custom', separator: '---', dedupe: true },
		onSubmit: async ({ value, formApi }) => {
			if (!productId) return;
			try {
				const res = await api<{ imported: number; duplicatesInInput: number; duplicatesExisting: number; unlimitedWarning: boolean }>(
					`/api/products/${productId}/stock`,
					{ body: { text: value.text, separator: value.mode === 'custom' ? value.separator : null, dedupe: value.dedupe } }
				);
				const dupes = res.duplicatesInInput + res.duplicatesExisting;
				toast.success(`Imported ${res.imported} item${res.imported === 1 ? '' : 's'}${dupes ? ` · skipped ${dupes} duplicate${dupes === 1 ? '' : 's'}` : ''}`);
				if (res.unlimitedWarning) toast.info('Note: this product is unlimited — stock rows are not used for delivery.');
				formApi.setFieldValue('text', '');
				await refreshAll();
			} catch (e) {
				toast.error((e as Error).message);
			}
		}
	}));
	const formValues = form.useSelector((s) => s.values);
	const preview = $derived(
		parseStockImport(formValues.current.text, {
			separator: formValues.current.mode === 'custom' ? formValues.current.separator : null,
			dedupe: formValues.current.dedupe
		})
	);

	async function deleteSelected() {
		if (!productId || selectedIds.size === 0) return;
		if (!(await confirmAction({ title: `Delete ${selectedIds.size} item(s)?`, body: 'Only available items are deleted.', confirmLabel: 'Delete', danger: true }))) return;
		try {
			const r = await api<{ deleted: number }>(`/api/products/${productId}/stock`, { method: 'DELETE', body: { ids: [...selectedIds] } });
			toast.success(`Deleted ${r.deleted} item(s)`);
			await refreshAll();
		} catch (e) {
			toast.error((e as Error).message);
		}
	}

	async function deleteAll() {
		if (!productId) return;
		const n = list.query.data?.counts.available ?? 0;
		const r = await confirmDialog({
			title: `Delete ALL ${n} available items?`,
			body: `Reserved and sold items are kept. Type DELETE to confirm.`,
			confirmLabel: 'Delete all',
			danger: true,
			input: { label: 'Confirmation', placeholder: 'DELETE', required: true }
		});
		if (!r.ok) return;
		if (r.value !== 'DELETE') return toast.error('Confirmation text did not match');
		try {
			const res = await api<{ deleted: number }>(`/api/products/${productId}/stock`, { method: 'DELETE', body: { all: true } });
			toast.success(`Deleted ${res.deleted} item(s)`);
			await refreshAll();
		} catch (e) {
			toast.error((e as Error).message);
		}
	}

	async function notifyRestock() {
		if (!productId || !selected) return;
		const r = await confirmDialog({
			title: 'Notify restock?',
			body: `Queues a broadcast to every user with stock notifications on, announcing “${selected.name}” (${selected.unlimited ? '∞' : selected.stock} available).`,
			confirmLabel: 'Queue broadcast',
			input: { label: 'Title (optional)', placeholder: '📦 Restock' }
		});
		if (!r.ok) return;
		try {
			const res = await api<{ broadcastId: number }>(`/api/products/${productId}/restock-notify`, { body: { title: r.value || null } });
			toast.success(`Broadcast #${res.broadcastId} queued`);
			await qc.invalidateQueries({ queryKey: ['broadcasts'] });
		} catch (e) {
			toast.error((e as Error).message);
		}
	}

	function toggle(id: number, on: boolean) {
		const next = new Set(selectedIds);
		if (on) next.add(id);
		else next.delete(id);
		selectedIds = next;
	}
	const pageIds = $derived((list.query.data?.items ?? []).filter((i) => i.status === 'available').map((i) => i.id));
	const allChecked = $derived(pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id)));

	const columns: Columns<Item> = [
		{ id: 'select', header: () => renderSnippet(selectAllHeader, null), cell: ({ row }) => renderSnippet(selectCell, row.original) },
		{ id: 'id', header: '#', enableSorting: true, cell: ({ row }) => renderSnippet(idCell, row.original) },
		{ id: 'content', header: 'Content', cell: ({ row }) => renderSnippet(contentCell, row.original) },
		{ id: 'status', header: 'Status', cell: ({ row }) => renderSnippet(statusCell, row.original) },
		{ id: 'createdAt', header: 'Added', cell: ({ row }) => fmtDate(row.original.createdAt) }
	];
</script>

{#snippet selectAllHeader(_: null)}
	<input
		type="checkbox"
		class="checkbox"
		aria-label="Select all on page"
		checked={allChecked}
		disabled={pageIds.length === 0}
		onchange={(e) => (selectedIds = e.currentTarget.checked ? new Set(pageIds) : new Set())}
	/>
{/snippet}
{#snippet selectCell(i: Item)}
	<input
		type="checkbox"
		class="checkbox"
		aria-label="Select item {i.id}"
		disabled={i.status !== 'available'}
		checked={selectedIds.has(i.id)}
		onchange={(e) => toggle(i.id, e.currentTarget.checked)}
	/>
{/snippet}
{#snippet idCell(i: Item)}<span class="text-muted tabular">{i.id}</span>{/snippet}
{#snippet contentCell(i: Item)}
	<code class="mono block max-w-[560px] truncate" title={i.content}>{i.content}</code>
{/snippet}
{#snippet statusCell(i: Item)}
	<div class="flex items-center gap-2">
		<Badge value={i.status} />
		{#if i.orderId}<a class="link text-xs" href="/orders/{i.orderId}">order #{i.orderId}</a>{/if}
	</div>
{/snippet}

<PageHeader title="Stock" subtitle="Bulk import items, review and clean up available stock">
	{#snippet actions()}
		<select class="input w-[min(360px,80vw)]" value={productId ? String(productId) : ''} onchange={(e) => pickProduct(e.currentTarget.value)} aria-label="Product">
			<option value="">Choose a product…</option>
			{#each options.data ?? [] as o (o.id)}
				<option value={String(o.id)}>{o.parentName ? `${o.parentName} › ` : ''}{o.name} ({o.unlimited ? '∞' : o.stock})</option>
			{/each}
		</select>
		{#if selected}<button class="btn" onclick={notifyRestock}>Notify restock</button>{/if}
	{/snippet}
</PageHeader>

{#if !productId}
	<div class="card px-6 py-14 text-center text-[13px] text-muted">Choose a product to import or manage its stock.</div>
{:else}
	{#if selected?.unlimited}
		<div class="mb-3 rounded-md border border-info/30 bg-info-soft px-3 py-2 text-[13px] text-info">
			This product is <b>unlimited</b>: it always delivers its configured content, stock rows are not used.
		</div>
	{/if}
	<div class="grid gap-4 xl:grid-cols-[400px_1fr]">
		<form
			class="card h-fit space-y-3 p-4"
			onsubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				form.handleSubmit();
			}}
		>
			<h2 class="text-[13px] font-semibold">Bulk import</h2>
			<form.Field name="mode">
				{#snippet children(field)}
					<div class="flex gap-4 text-[13px]">
						<label class="flex items-center gap-1.5"><input type="radio" class="text-accent" name="mode" checked={field.state.value === 'line'} onchange={() => field.handleChange('line')} /> One item per line</label>
						<label class="flex items-center gap-1.5"><input type="radio" class="text-accent" name="mode" checked={field.state.value === 'custom'} onchange={() => field.handleChange('custom')} /> Custom separator</label>
					</div>
				{/snippet}
			</form.Field>
			{#if formValues.current.mode === 'custom'}
				<form.Field name="separator" validators={{ onChange: ({ value }) => (!value ? 'Enter a separator (use \\n for newline)' : undefined) }}>
					{#snippet children(field)}
						<label class="block">
							<span class="label">Separator (e.g. <code class="mono">---</code>, <code class="mono">|</code>, <code class="mono">\n\n</code> for blank line)</span>
							<input class="input mono" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
							<FieldError {field} />
						</label>
					{/snippet}
				</form.Field>
			{/if}
			<form.Field name="text" validators={{ onSubmit: ({ value }) => (!value.trim() ? 'Paste at least one item' : undefined) }}>
				{#snippet children(field)}
					<label class="block">
						<span class="label">Items</span>
						<textarea
							class="input mono"
							rows="12"
							placeholder={'email1@example.com:password1\nemail2@example.com:password2'}
							value={field.state.value}
							onblur={field.handleBlur}
							oninput={(e) => field.handleChange(e.currentTarget.value)}
						></textarea>
						<FieldError {field} />
					</label>
				{/snippet}
			</form.Field>
			<form.Field name="dedupe">
				{#snippet children(field)}
					<label class="flex items-center gap-2 text-[13px]">
						<input type="checkbox" class="checkbox" checked={field.state.value} onchange={(e) => field.handleChange(e.currentTarget.checked)} />
						Skip duplicates (in the paste and already in stock)
					</label>
				{/snippet}
			</form.Field>
			<div class="rounded-md bg-surface-2 px-3 py-2 text-xs text-muted tabular">
				<b class="text-fg">{preview.items.length}</b> item{preview.items.length === 1 ? '' : 's'} to import
				{#if preview.duplicatesInInput}· {preview.duplicatesInInput} duplicate{preview.duplicatesInInput === 1 ? '' : 's'} in paste{/if}
				{#if preview.emptySkipped}· {preview.emptySkipped} empty skipped{/if}
			</div>
			<form.Subscribe selector={(s) => s.isSubmitting}>
				{#snippet children(isSubmitting)}
					<button class="btn btn-primary w-full" disabled={isSubmitting || preview.items.length === 0}>
						{isSubmitting ? 'Importing…' : `Import ${preview.items.length || ''} item${preview.items.length === 1 ? '' : 's'}`}
					</button>
				{/snippet}
			</form.Subscribe>
		</form>

		<div class="min-w-0">
			<div class="mb-2 flex flex-wrap items-center gap-1" role="tablist">
				{#each ['available', 'reserved', 'sold'] as s (s)}
					<button
						role="tab"
						aria-selected={list.state.filters.status === s}
						class="rounded-md px-3 py-1.5 text-[13px] font-medium capitalize {list.state.filters.status === s ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2'}"
						onclick={() => list.setFilter('status', s)}
					>
						{s} <span class="tabular opacity-70">{list.query.data?.counts[s as 'available'] ?? ''}</span>
					</button>
				{/each}
			</div>
			<DataTable
				{columns}
				data={list.query.data?.items}
				total={list.query.data?.total}
				state={list.state}
				loading={list.query.isPending}
				fetching={list.query.isFetching}
				error={list.query.error}
				empty="No items with this status."
				pageSizes={[50, 100, 250, 500]}
			>
				{#snippet toolbar()}
					<input class="input w-full sm:w-64" type="search" placeholder="Search content…" aria-label="Search stock" bind:value={search} oninput={() => onSearch(search)} />
					<div class="flex-1"></div>
					{#if list.state.filters.status === 'available'}
						<button class="btn btn-sm" disabled={selectedIds.size === 0} onclick={deleteSelected}>Delete selected ({selectedIds.size})</button>
						<button class="btn btn-sm text-danger" disabled={!list.query.data?.counts.available} onclick={deleteAll}>Delete all available</button>
					{/if}
				{/snippet}
			</DataTable>
		</div>
	</div>
{/if}
