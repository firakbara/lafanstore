<script lang="ts">
	import { apiUrl, link } from '#lib/current-store.ts';
	import { createForm } from '@tanstack/svelte-form';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { renderSnippet } from '@tanstack/svelte-table';
	import { api } from '#lib/api.ts';
	import Badge from '#lib/components/Badge.svelte';
	import DataTable from '#lib/components/DataTable.svelte';
	import FieldError from '#lib/components/FieldError.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import TelegramPreview from '#lib/components/TelegramPreview.svelte';
	import { fmtDate, fmtRelative } from '#lib/format.ts';
	import { createList } from '#lib/list.svelte.ts';
	import type { Columns } from '#lib/table.ts';
	import { confirmAction, toast } from '#lib/ui.svelte.ts';

	type Audience = 'all' | 'stock' | 'info' | 'referral';
	interface Broadcast {
		id: number;
		audience: Audience;
		title: string | null;
		body: string;
		status: 'draft' | 'queued' | 'sending' | 'done' | 'failed';
		totalCount: number;
		sentCount: number;
		failedCount: number;
		createdAt: string;
		startedAt: string | null;
		finishedAt: string | null;
	}

	const AUDIENCES: { id: Audience; label: string; hint: string }[] = [
		{ id: 'all', label: 'Everyone', hint: 'all users (ignores notification toggles)' },
		{ id: 'info', label: 'Info', hint: 'users with info notifications on' },
		{ id: 'stock', label: 'Stock', hint: 'users with stock notifications on' },
		{ id: 'referral', label: 'Referral', hint: 'users with referral notifications on' }
	];

	const qc = useQueryClient();
	const list = createList<Broadcast>({
		key: 'broadcasts',
		endpoint: () => apiUrl('/broadcasts'),
		sort: { id: 'createdAt', desc: true },
		pageSize: 20,
		// Auto-refresh progress while something is queued/sending.
		refetchInterval: (d) => (d?.items.some((b) => b.status === 'queued' || b.status === 'sending') ? 3000 : 15000)
	});
	const active = $derived((list.query.data?.items ?? []).some((b) => b.status === 'queued' || b.status === 'sending'));

	const form = createForm(() => ({
		defaultValues: { audience: 'info' as Audience, title: '', body: '' },
		onSubmitMeta: { queue: true },
		onSubmit: async ({ value, formApi, meta }) => {
			const queue = meta.queue;
			if (queue && !(await confirmAction({ title: 'Queue broadcast now?', body: `Sends to ~${audienceCount.data?.count ?? '?'} users (${value.audience}). The bot starts sending within seconds.`, confirmLabel: 'Queue & send' }))) return;
			try {
				const r = await api<{ id: number }>(apiUrl('/broadcasts'), { body: { audience: value.audience, title: value.title || null, body: value.body, queue } });
				toast.success(queue ? `Broadcast #${r.id} queued` : `Draft #${r.id} saved`);
				formApi.reset();
				await qc.invalidateQueries({ queryKey: ['broadcasts'] });
			} catch (e) {
				toast.error((e as Error).message);
			}
		}
	}));
	const values = form.useSelector((s) => s.values);
	const audienceCount = createQuery(() => ({
		queryKey: ['audience', values.current.audience],
		queryFn: () => api<{ count: number }>(apiUrl(`/broadcasts/audience?audience=${values.current.audience}`))
	}));

	async function action(b: Broadcast, kind: 'queue' | 'cancel' | 'delete') {
		const labels = { queue: 'Queue this draft?', cancel: 'Cancel this queued broadcast?', delete: 'Delete this draft?' };
		if (!(await confirmAction({ title: labels[kind], confirmLabel: kind === 'queue' ? 'Queue' : kind === 'cancel' ? 'Cancel broadcast' : 'Delete', danger: kind !== 'queue' }))) return;
		try {
			if (kind === 'delete') await api(apiUrl(`/broadcasts/${b.id}`), { method: 'DELETE' });
			else await api(apiUrl(`/broadcasts/${b.id}`), { body: { action: kind } });
			await qc.invalidateQueries({ queryKey: ['broadcasts'] });
		} catch (e) {
			toast.error((e as Error).message);
		}
	}

	function loadIntoComposer(b: Broadcast) {
		form.setFieldValue('audience', b.audience);
		form.setFieldValue('title', b.title ?? '');
		form.setFieldValue('body', b.body);
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	const insert = (open: string, close: string) => {
		const el = document.getElementById('bc-body') as HTMLTextAreaElement | null;
		const cur = form.getFieldValue('body');
		if (!el) return form.setFieldValue('body', cur + open + close);
		const { selectionStart: s, selectionEnd: e } = el;
		form.setFieldValue('body', cur.slice(0, s) + open + cur.slice(s, e) + close + cur.slice(e));
		requestAnimationFrame(() => {
			el.focus();
			el.setSelectionRange(s + open.length, e + open.length);
		});
	};

	const columns: Columns<Broadcast> = [
		{ id: 'createdAt', header: 'Created', cell: ({ row }) => renderSnippet(createdCell, row.original) },
		{ id: 'message', header: 'Message', cell: ({ row }) => renderSnippet(msgCell, row.original) },
		{ id: 'audience', header: 'Audience', cell: ({ row }) => row.original.audience },
		{ id: 'status', header: 'Status', cell: ({ row }) => renderSnippet(statusCell, row.original) },
		{ id: 'progress', header: 'Progress', cell: ({ row }) => renderSnippet(progressCell, row.original) },
		{ id: 'actions', header: '', cell: ({ row }) => renderSnippet(actionsCell, row.original) }
	];
</script>

{#snippet createdCell(b: Broadcast)}<span class="whitespace-nowrap" title={fmtDate(b.createdAt)}>#{b.id} · {fmtRelative(b.createdAt)}</span>{/snippet}
{#snippet msgCell(b: Broadcast)}
	<div class="max-w-[360px]">
		{#if b.title}<div class="truncate font-medium">{b.title}</div>{/if}
		<div class="truncate text-xs text-muted">{b.body.replace(/<[^>]+>/g, '')}</div>
	</div>
{/snippet}
{#snippet statusCell(b: Broadcast)}<Badge value={b.status} />{/snippet}
{#snippet progressCell(b: Broadcast)}
	{@const done = b.sentCount + b.failedCount}
	{@const pct = b.totalCount ? Math.min(100, Math.round((done / b.totalCount) * 100)) : b.status === 'done' ? 100 : 0}
	<div class="w-40">
		<div class="h-1.5 overflow-hidden rounded-full bg-surface-2">
			<div class="h-full rounded-full {b.status === 'failed' ? 'bg-danger' : 'bg-accent'} transition-all" style="width: {pct}%"></div>
		</div>
		<div class="mt-1 text-[11px] text-muted tabular">{b.sentCount} sent · {b.failedCount} failed / {b.totalCount || '?'}</div>
	</div>
{/snippet}
{#snippet actionsCell(b: Broadcast)}
	<div class="flex justify-end gap-1">
		<button class="btn btn-sm btn-ghost" onclick={() => loadIntoComposer(b)} title="Copy into composer">Reuse</button>
		{#if b.status === 'draft'}
			<button class="btn btn-sm btn-primary" onclick={() => action(b, 'queue')}>Queue</button>
			<button class="btn btn-sm btn-ghost text-danger" onclick={() => action(b, 'delete')}>Delete</button>
		{:else if b.status === 'queued'}
			<button class="btn btn-sm text-danger" onclick={() => action(b, 'cancel')}>Cancel</button>
		{/if}
	</div>
{/snippet}

<PageHeader title="Broadcasts" subtitle="Message users through the bot — Telegram HTML, sent at ~25 msg/s" />

<form
	class="card mb-6 grid gap-4 p-4 lg:grid-cols-[1fr_400px]"
	onsubmit={(e) => {
		e.preventDefault();
		e.stopPropagation();
		const submitter = (e as SubmitEvent).submitter as HTMLButtonElement | null;
		form.handleSubmit({ queue: submitter?.value !== 'draft' });
	}}
>
	<div class="space-y-3">
		<form.Field name="audience">
			{#snippet children(field)}
				<fieldset>
					<legend class="label">Audience</legend>
					<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
						{#each AUDIENCES as a (a.id)}
							<label class="cursor-pointer rounded-md border px-3 py-2 text-[13px] {field.state.value === a.id ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2'}">
								<input type="radio" class="sr-only" name="audience" checked={field.state.value === a.id} onchange={() => field.handleChange(a.id)} />
								<div class="font-medium">{a.label}</div>
								<div class="text-[11px] text-muted">{a.hint}</div>
							</label>
						{/each}
					</div>
					<p class="mt-1.5 text-xs text-muted">
						Reaches <b class="text-fg tabular">{audienceCount.data?.count ?? '…'}</b> users right now (excludes banned and users who blocked the bot).
					</p>
				</fieldset>
			{/snippet}
		</form.Field>
		<form.Field name="title" validators={{ onChange: ({ value }) => (value.length > 200 ? 'Max 200 characters' : undefined) }}>
			{#snippet children(field)}
				<label class="block">
					<span class="label">Title (bold, optional)</span>
					<input class="input" placeholder="📢 Pengumuman" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
					<FieldError {field} />
				</label>
			{/snippet}
		</form.Field>
		<form.Field
			name="body"
			validators={{
				onChange: ({ value }) => (!value.trim() ? 'Write a message' : value.length > 3800 ? 'Max 3800 characters' : undefined)
			}}
		>
			{#snippet children(field)}
				<div>
					<div class="mb-1 flex flex-wrap items-center justify-between gap-2">
						<label class="label mb-0" for="bc-body">Message (HTML)</label>
						<div class="flex gap-1">
							<button type="button" class="btn btn-sm font-bold" onclick={() => insert('<b>', '</b>')} aria-label="Bold">B</button>
							<button type="button" class="btn btn-sm italic" onclick={() => insert('<i>', '</i>')} aria-label="Italic">I</button>
							<button type="button" class="btn btn-sm underline" onclick={() => insert('<u>', '</u>')} aria-label="Underline">U</button>
							<button type="button" class="btn btn-sm mono" onclick={() => insert('<code>', '</code>')} aria-label="Code">&lt;/&gt;</button>
							<button type="button" class="btn btn-sm" onclick={() => insert('<a href="https://">', '</a>')} aria-label="Link">Link</button>
							<button type="button" class="btn btn-sm" onclick={() => insert('<tg-spoiler>', '</tg-spoiler>')} aria-label="Spoiler">Spoiler</button>
						</div>
					</div>
					<textarea id="bc-body" class="input" rows="9" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)}></textarea>
					<div class="mt-1 flex justify-between text-[11px] text-muted"><FieldError {field} /><span class="ml-auto tabular">{field.state.value.length}/3800</span></div>
				</div>
			{/snippet}
		</form.Field>
		<form.Subscribe selector={(s) => ({ canSubmit: s.canSubmit, isSubmitting: s.isSubmitting })}>
			{#snippet children(s)}
				<div class="flex justify-end gap-2">
					<button class="btn" value="draft" disabled={!s.canSubmit || s.isSubmitting}>Save draft</button>
					<button class="btn btn-primary" value="queue" disabled={!s.canSubmit || s.isSubmitting}>{s.isSubmitting ? 'Working…' : 'Queue & send'}</button>
				</div>
			{/snippet}
		</form.Subscribe>
	</div>
	<TelegramPreview title={values.current.title || null} html={values.current.body} label="Preview (as seen in Telegram)" />
</form>

<div class="mb-2 flex items-center gap-2">
	<h2 class="text-[13px] font-semibold">History</h2>
	{#if active}<span class="flex items-center gap-1 text-xs text-accent"><span class="size-1.5 animate-pulse rounded-full bg-accent"></span> live — refreshing every 3s</span>{/if}
</div>
<DataTable
	{columns}
	data={list.query.data?.items}
	total={list.query.data?.total}
	state={list.state}
	loading={list.query.isPending}
	fetching={list.query.isFetching}
	error={list.query.error}
	empty="No broadcasts yet."
/>
