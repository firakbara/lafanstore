<script lang="ts">
	import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
	import { page } from '$app/state';
	import { api } from '#lib/api.ts';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { toast } from '#lib/ui.svelte.ts';

	interface StoreRow {
		id: number;
		slug: string;
		name: string;
		botUsername: string | null;
		adminChatId: number | null;
		channelUrl: string | null;
		isActive: boolean;
		productCount: number;
		totalProducts: number;
		totalOrders: number;
		revenue: number;
	}

	const qc = useQueryClient();
	const q = createQuery(() => ({
		queryKey: ['stores'],
		queryFn: () => api<{ items: StoreRow[] }>('/api/stores').then((r) => r.items)
	}));

	let showCreate = $state(false);
	let newStore = $state({ slug: '', name: '', botToken: '', botUsername: '', adminIds: '', adminChatId: '', channelUrl: '' });

	const createMut = createMutation(() => ({
		mutationFn: (body: Record<string, unknown>) => api('/api/stores', { body }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['stores'] });
			showCreate = false;
			newStore = { slug: '', name: '', botToken: '', botUsername: '', adminIds: '', adminChatId: '', channelUrl: '' };
			toast.success('Store created');
		},
		onError: (e: Error) => toast.error(e.message)
	}));

	const switchMut = createMutation(() => ({
		mutationFn: (storeId: number) => api('/api/stores/switch', { body: { storeId } }),
		onSuccess: () => window.location.reload(),
		onError: (e: Error) => toast.error(e.message)
	}));

	let editId = $state<number | null>(null);
	let editValues = $state({ name: '', botToken: '', botUsername: '', adminIds: '', adminChatId: '', channelUrl: '', isActive: true });

	function startEdit(s: StoreRow) {
		editId = s.id;
		editValues = { name: s.name, botToken: '', botUsername: s.botUsername ?? '', adminIds: '', adminChatId: s.adminChatId != null ? String(s.adminChatId) : '', channelUrl: s.channelUrl ?? '', isActive: s.isActive };
	}

	const updateMut = createMutation(() => ({
		mutationFn: (body: Record<string, unknown>) => api('/api/stores', { method: 'PATCH', body }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['stores'] });
			editId = null;
			toast.success('Store updated');
		},
		onError: (e: Error) => toast.error(e.message)
	}));

	function submitCreate() {
		const body: Record<string, unknown> = {
			slug: newStore.slug.trim(),
			name: newStore.name.trim(),
			botToken: newStore.botToken.trim(),
			botUsername: newStore.botUsername.trim() || null,
			adminIds: newStore.adminIds
				.split(',')
				.map((s) => Number(s.trim()))
				.filter((n) => n > 0),
			adminChatId: newStore.adminChatId.trim() ? Number(newStore.adminChatId) : null,
			channelUrl: newStore.channelUrl.trim() || null
		};
		$createMut.mutate(body);
	}

	function submitUpdate() {
		if (!editId) return;
		const body: Record<string, unknown> = { id: editId, name: editValues.name.trim(), isActive: editValues.isActive };
		if (editValues.botToken.trim()) body.botToken = editValues.botToken.trim();
		body.botUsername = editValues.botUsername.trim() || null;
		body.channelUrl = editValues.channelUrl.trim() || null;
		if (editValues.adminIds.trim()) {
			body.adminIds = editValues.adminIds.split(',').map((s) => Number(s.trim())).filter((n) => n > 0);
		}
		body.adminChatId = editValues.adminChatId.trim() ? Number(editValues.adminChatId) : null;
		$updateMut.mutate(body);
	}
</script>

<PageHeader title="Stores" subtitle="Manage stores on this platform. Each store gets its own Telegram bot." />

<div class="mb-4 flex justify-end">
	<button class="btn btn-primary" onclick={() => (showCreate = !showCreate)}>
		{showCreate ? 'Cancel' : '+ New store'}
	</button>
</div>

{#if showCreate}
	<form class="card mb-4 space-y-3 p-4" onsubmit={(e) => { e.preventDefault(); submitCreate(); }}>
		<h2 class="text-[13px] font-semibold">Create store</h2>
		<div class="grid gap-3 sm:grid-cols-2">
			<label class="block">
				<span class="label">Slug (URL-safe identifier)</span>
				<input class="input" placeholder="my-store" bind:value={newStore.slug} required />
			</label>
			<label class="block">
				<span class="label">Display name</span>
				<input class="input" placeholder="My Store" bind:value={newStore.name} required />
			</label>
			<label class="block">
				<span class="label">Bot token (from @BotFather)</span>
				<input class="input mono" type="password" autocomplete="off" placeholder="123456:ABC-DEF..." bind:value={newStore.botToken} required />
			</label>
			<label class="block">
				<span class="label">Bot username (optional)</span>
				<input class="input" placeholder="mystore_bot" bind:value={newStore.botUsername} />
			</label>
			<label class="block">
				<span class="label">Admin Telegram IDs (comma-separated)</span>
				<input class="input" placeholder="123456789, 987654321" bind:value={newStore.adminIds} />
			</label>
			<label class="block">
				<span class="label">Admin chat ID (optional)</span>
				<input class="input" placeholder="-1001234567890" bind:value={newStore.adminChatId} />
			</label>
			<label class="block sm:col-span-2">
				<span class="label">Channel URL (optional)</span>
				<input class="input" placeholder="https://t.me/mychannel" bind:value={newStore.channelUrl} />
			</label>
		</div>
		<div class="flex justify-end">
			<button class="btn btn-primary" disabled={$createMut.isPending}>
				{$createMut.isPending ? 'Creating...' : 'Create store'}
			</button>
		</div>
	</form>
{/if}

{#if q.isPending}
	<div class="card h-40 animate-pulse"></div>
{:else if q.isError}
	<div class="card p-6 text-danger">{q.error.message}</div>
{:else if q.data}
	<div class="card divide-y divide-line">
		{#each q.data as store (store.id)}
			<div class="flex items-center gap-4 px-4 py-3">
				<div class="grid size-8 place-items-center rounded-md {store.isActive ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted'} text-xs font-bold">
					{store.name.charAt(0).toUpperCase()}
				</div>
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-2">
						<span class="truncate text-sm font-medium">{store.name}</span>
						<span class="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">{store.slug}</span>
						{#if !store.isActive}
							<span class="shrink-0 rounded bg-danger/10 px-1.5 py-0.5 text-[10px] text-danger">Inactive</span>
						{/if}
					</div>
					<div class="flex items-center gap-3 text-xs text-muted">
						{#if store.botUsername}<span>@{store.botUsername}</span><span class="text-line">|</span>{/if}
						<span>{store.productCount} products</span>
						<span class="text-line">|</span>
						<span>{store.totalOrders} orders</span>
						{#if store.revenue > 0}
							<span class="text-line">|</span>
							<span class="font-medium text-accent">${(store.revenue / 100).toFixed(2)}</span>
						{/if}
					</div>
				</div>
				{#if page.data.storeId === store.id}
					<span class="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">Current</span>
				{:else}
					<button class="btn btn-sm" disabled={$switchMut.isPending} onclick={() => $switchMut.mutate(store.id)}>Switch</button>
				{/if}
				{#if editId === store.id}
					<button class="btn btn-sm" onclick={() => (editId = null)}>Cancel</button>
				{:else}
					<button class="btn btn-sm" onclick={() => startEdit(store)}>Edit</button>
				{/if}
			</div>

			{#if editId === store.id}
				<form class="space-y-3 bg-surface-2/50 px-4 py-3" onsubmit={(e) => { e.preventDefault(); submitUpdate(); }}>
					<div class="grid gap-3 sm:grid-cols-2">
						<label class="block">
							<span class="label">Display name</span>
							<input class="input" bind:value={editValues.name} required />
						</label>
						<label class="block">
							<span class="label">Bot token (leave empty to keep current)</span>
							<input class="input mono" type="password" autocomplete="off" placeholder="unchanged" bind:value={editValues.botToken} />
						</label>
						<label class="block">
							<span class="label">Bot username</span>
							<input class="input" bind:value={editValues.botUsername} />
						</label>
						<label class="block">
							<span class="label">Channel URL (clear to remove)</span>
							<input class="input" bind:value={editValues.channelUrl} />
						</label>
						<label class="block">
							<span class="label">Admin Telegram IDs (comma-separated)</span>
							<input class="input" placeholder="leave empty to keep current" bind:value={editValues.adminIds} />
						</label>
						<label class="block">
							<span class="label">Admin chat ID (clear to remove)</span>
							<input class="input" bind:value={editValues.adminChatId} />
						</label>
					</div>
					<div class="flex items-center justify-between">
						<label class="flex items-center gap-2 text-sm">
							<input type="checkbox" class="checkbox" bind:checked={editValues.isActive} />
							Active
						</label>
						<button class="btn btn-primary btn-sm" disabled={$updateMut.isPending}>
							{$updateMut.isPending ? 'Saving...' : 'Save'}
						</button>
					</div>
				</form>
			{/if}
		{/each}
		{#if q.data.length === 0}
			<div class="px-4 py-8 text-center text-sm text-muted">No stores yet. Create one above.</div>
		{/if}
	</div>
{/if}
