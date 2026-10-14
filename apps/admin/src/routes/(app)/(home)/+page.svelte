<script lang="ts">
	import { createForm } from '@tanstack/svelte-form';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { api, ApiError, errorMessage } from '#lib/api.ts';
	import Badge from '#lib/components/Badge.svelte';
	import FieldError from '#lib/components/FieldError.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { storeHref } from '#lib/store-path.ts';
	import { toast } from '#lib/ui.svelte.ts';

	interface StoreCard {
		id: number;
		slug: string;
		name: string;
		botUsername: string | null;
		isActive: boolean;
		orders24h: number;
	}

	const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/;
	const TOKEN_RE = /^\d+:[A-Za-z0-9_-]{30,}$/;
	const FIELDS = ['slug', 'name', 'botToken', 'adminIds', 'adminChatId', 'channelUrl'] as const;
	type FieldName = (typeof FIELDS)[number];

	const qc = useQueryClient();
	const q = createQuery(() => ({
		queryKey: ['stores'],
		queryFn: () => api<{ items: StoreCard[] }>('/api/stores')
	}));

	const stores = $derived(q.data?.items ?? []);
	let showCreate = $state(false);
	// With no stores the form is the only thing to do here, so it is always open.
	const formOpen = $derived(showCreate || (q.isSuccess && stores.length === 0));
	let formEl = $state<HTMLFormElement>();
	let serverError = $state<string | null>(null);

	const splitIds = (v: string) =>
		v
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);

	const form = createForm(() => ({
		defaultValues: { slug: '', name: '', botToken: '', adminIds: '', adminChatId: '', channelUrl: '' },
		onSubmit: async ({ value }) => {
			serverError = null;
			const body = {
				slug: value.slug.trim(),
				name: value.name.trim(),
				botToken: value.botToken.trim(),
				adminIds: splitIds(value.adminIds).map(Number),
				adminChatId: value.adminChatId.trim() ? Number(value.adminChatId.trim()) : null,
				channelUrl: value.channelUrl.trim() || null
			};
			try {
				const res = await api<{ id: number; slug: string }>('/api/stores', { body });
				toast.success('Store created — its bot starts within 30 seconds');
				void qc.invalidateQueries({ queryKey: ['stores'], refetchType: 'none' });
				await goto(storeHref(res.slug));
			} catch (err) {
				const field = err instanceof ApiError ? err.field : undefined;
				if (field && (FIELDS as readonly string[]).includes(field)) {
					// Shown by <FieldError>; TanStack Form clears it as soon as the field is edited.
					const message = (err as ApiError).message;
					form.setFieldMeta(field as FieldName, (m) => ({ ...m, errorMap: { ...m.errorMap, onSubmit: message } }));
				} else {
					serverError = errorMessage(err);
				}
			}
		}
	}));

	const required = ({ value }: { value: string }) => (!value.trim() ? 'Required' : undefined);

	async function openCreate() {
		showCreate = true;
		await tick();
		formEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		formEl?.querySelector('input')?.focus({ preventScroll: true });
	}

	function closeCreate() {
		showCreate = false;
		serverError = null;
		form.reset();
	}
</script>

<PageHeader title="Stores" subtitle="Pick a store to manage. Each store has its own bot, catalog, orders and settings.">
	{#snippet actions()}
		{#if stores.length > 0 && !formOpen}
			<button class="btn btn-primary" onclick={openCreate}>New store</button>
		{/if}
	{/snippet}
</PageHeader>

{#if q.isPending}
	<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
		{#each [0, 1, 2] as i (i)}<div class="card h-[118px] animate-pulse"></div>{/each}
	</div>
{:else if q.isError}
	<div class="card p-6 text-danger">{q.error.message}</div>
{:else if stores.length === 0}
	<div class="card px-4 py-10 text-center">
		<div class="mx-auto mb-2 grid size-9 place-items-center rounded-md bg-surface-2 text-muted">
			<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h18v18H3zM3 9h18M9 21V9" /></svg>
		</div>
		<p class="text-[13px] text-muted">No stores yet. Create the first one below.</p>
	</div>
{:else}
	<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
		{#each stores as s (s.id)}
			<a
				href={storeHref(s.slug)}
				class="card group flex flex-col p-4 transition-colors hover:border-accent/50 hover:bg-surface-2/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
			>
				<div class="flex items-start gap-3">
					<div class="grid size-9 shrink-0 place-items-center rounded-md text-sm font-bold {s.isActive ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted'}">
						{s.name.charAt(0).toUpperCase()}
					</div>
					<div class="min-w-0 flex-1">
						<div class="truncate text-sm font-semibold transition-colors group-hover:text-accent">{s.name}</div>
						{#if s.botUsername}
							<div class="truncate text-xs text-muted">@{s.botUsername}</div>
						{:else}
							<div class="text-xs text-warn">bot not verified</div>
						{/if}
					</div>
					<Badge value={s.isActive ? 'Active' : 'Inactive'} tone={s.isActive ? 'ok' : 'muted'} />
				</div>
				<div class="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3 text-xs text-muted">
					<span><span class="tabular font-semibold text-fg">{s.orders24h}</span> order{s.orders24h === 1 ? '' : 's'} in 24h</span>
					<span class="flex min-w-0 items-center gap-1">
						<span class="mono truncate">/toko/{s.slug}</span>
						<svg class="size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6" /></svg>
					</span>
				</div>
			</a>
		{/each}
	</div>
{/if}

{#if formOpen}
	<form
		bind:this={formEl}
		class="card mt-4 scroll-mt-20 p-4"
		onsubmit={(e) => {
			e.preventDefault();
			e.stopPropagation();
			form.handleSubmit();
		}}
	>
		<div class="mb-3 flex items-start justify-between gap-3">
			<div>
				<h2 class="text-[13px] font-semibold">New store</h2>
				<p class="mt-0.5 text-xs text-muted">Each store runs its own Telegram bot. Create the bot with @BotFather first.</p>
			</div>
			{#if stores.length > 0}
				<button type="button" class="btn btn-ghost btn-sm" onclick={closeCreate}>Cancel</button>
			{/if}
		</div>

		<div class="grid gap-3 sm:grid-cols-2">
			<form.Field name="slug" validators={{ onChange: ({ value }) => (!SLUG_RE.test(value.trim()) ? '2–64 characters: a-z, 0-9 and -, not starting or ending with -' : undefined) }}>
				{#snippet children(field)}
					<label class="block">
						<span class="label">Slug</span>
						<div class="relative">
							<span class="mono pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted">/toko/</span>
							<input
								class="input mono pl-14"
								placeholder="patungin"
								autocomplete="off"
								autocapitalize="off"
								spellcheck="false"
								value={field.state.value}
								onblur={field.handleBlur}
								oninput={(e) => field.handleChange(e.currentTarget.value.toLowerCase())}
							/>
						</div>
						<p class="mt-1 text-[11px] text-muted">Used in the URL, cannot be changed later</p>
						<FieldError {field} />
					</label>
				{/snippet}
			</form.Field>
			<form.Field name="name" validators={{ onChange: ({ value }) => required({ value }) ?? (value.length > 128 ? 'Max 128 characters' : undefined) }}>
				{#snippet children(field)}
					<label class="block">
						<span class="label">Store name</span>
						<input class="input" placeholder="Patungin Store" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
						<FieldError {field} />
					</label>
				{/snippet}
			</form.Field>
			<form.Field name="botToken" validators={{ onChange: ({ value }) => (!TOKEN_RE.test(value.trim()) ? 'Bot token format looks wrong (expected 123456:ABC…)' : undefined) }}>
				{#snippet children(field)}
					<label class="block sm:col-span-2">
						<span class="label">Bot token</span>
						<input
							class="input mono"
							type="password"
							autocomplete="off"
							placeholder="123456789:AAH…"
							value={field.state.value}
							onblur={field.handleBlur}
							oninput={(e) => field.handleChange(e.currentTarget.value)}
						/>
						<p class="mt-1 text-[11px] text-muted">From @BotFather. It is checked with Telegram before saving.</p>
						<FieldError {field} />
					</label>
				{/snippet}
			</form.Field>
		</div>

		<div class="my-4 flex items-center gap-3 text-[11px] font-medium tracking-wide text-muted uppercase">
			<span>Optional</span>
			<span class="h-px flex-1 bg-line"></span>
		</div>

		<div class="grid gap-3 sm:grid-cols-2">
			<form.Field name="adminIds" validators={{ onChange: ({ value }) => (splitIds(value).some((s) => !/^\d{1,15}$/.test(s) || Number(s) <= 0) ? 'Numeric Telegram user IDs, separated by commas' : undefined) }}>
				{#snippet children(field)}
					<label class="block">
						<span class="label">Admin Telegram IDs</span>
						<input class="input mono" inputmode="numeric" placeholder="123456789, 987654321" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
						<p class="mt-1 text-[11px] text-muted">Comma-separated. These users can use the bot's admin commands.</p>
						<FieldError {field} />
					</label>
				{/snippet}
			</form.Field>
			<form.Field name="adminChatId" validators={{ onChange: ({ value }) => (value.trim() && (!/^-?\d{1,20}$/.test(value.trim()) || !Number.isSafeInteger(Number(value.trim()))) ? 'A numeric chat ID, e.g. -1001234567890' : undefined) }}>
				{#snippet children(field)}
					<label class="block">
						<span class="label">Admin chat ID</span>
						<input class="input mono" placeholder="-1001234567890" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
						<p class="mt-1 text-[11px] text-muted">Group that receives live support chats.</p>
						<FieldError {field} />
					</label>
				{/snippet}
			</form.Field>
			<form.Field name="channelUrl" validators={{ onChange: ({ value }) => (value.trim() && (value.trim().length > 256 || !/^https?:\/\/\S+$/i.test(value.trim())) ? 'Must be a URL starting with https://' : undefined) }}>
				{#snippet children(field)}
					<label class="block sm:col-span-2">
						<span class="label">Channel URL</span>
						<input class="input" inputmode="url" autocomplete="off" placeholder="https://t.me/yourchannel" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
						<FieldError {field} />
					</label>
				{/snippet}
			</form.Field>
		</div>

		{#if serverError}<div class="mt-4 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger" role="alert">{serverError}</div>{/if}

		<div class="mt-4 flex items-center justify-end gap-2">
			<form.Subscribe selector={(s) => ({ canSubmit: s.canSubmit, isSubmitting: s.isSubmitting })}>
				{#snippet children(s)}
					<button class="btn btn-primary" disabled={!s.canSubmit || s.isSubmitting}>{s.isSubmitting ? 'Checking token…' : 'Create store'}</button>
				{/snippet}
			</form.Subscribe>
		</div>
	</form>
{/if}
