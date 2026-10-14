<script lang="ts">
	import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/svelte-query';
	import { browser } from '$app/env';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api } from '#lib/api.ts';
	import Badge from '#lib/components/Badge.svelte';
	import { link } from '#lib/current-store.ts';
	import { switchTarget } from '#lib/store-path.ts';
	import { toast } from '#lib/ui.svelte.ts';

	let { data, children } = $props();

	// Each store gets its own QueryClient. Store pages use query keys without the slug (['dashboard'],
	// ['settings'], …), and the outgoing store's pages stay mounted (and may refetch) until the incoming
	// ones render, so a shared cache could hand one store's data to another even right after clearing it.
	// `slug` is its own derived so that new `data` for the same store (invalidateAll) keeps the client.
	const appClient = useQueryClient(); // the (app) layout's client: store picker, accounts
	const slug = $derived(data.store.slug);
	const storeClient = $derived.by(() => {
		void slug; // a new client (with an empty cache) for every store
		return new QueryClient({
			defaultOptions: {
				queries: { enabled: browser, staleTime: 10_000, retry: 1, refetchOnWindowFocus: true }
			}
		});
	});
	$effect(() => {
		const client = storeClient;
		return () => {
			// Runs on a store switch and when leaving the store: drop the discarded cache (and its timers).
			client.clear();
			// Store pages' invalidations only reach their own client; app-level lists (store names,
			// active flags, order counts) may have changed meanwhile.
			void appClient.invalidateQueries();
		};
	});

	const sections = [
		{ path: '', label: 'Dashboard', icon: 'M3 12l9-9 9 9M5 10v10h14V10' },
		{ path: '/products', label: 'Products', icon: 'M20 7l-8-4-8 4m16 0v10l-8 4m8-14l-8 4m0 10l-8-4V7m8 14V11' },
		{ path: '/stock', label: 'Stock', icon: 'M4 6h16M4 12h16M4 18h10' },
		{ path: '/orders', label: 'Orders', icon: 'M6 2l-2 4v14a2 2 0 002 2h12a2 2 0 002-2V6l-2-4zM4 6h16M16 10a4 4 0 01-8 0' },
		{ path: '/payments', label: 'Payments', icon: 'M2 7h20v12H2zM2 11h20' },
		{ path: '/users', label: 'Users', icon: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75' },
		{ path: '/vouchers', label: 'Vouchers', icon: 'M20 12V8a2 2 0 00-2-2H6a2 2 0 00-2 2v4a2 2 0 010 4v0a2 2 0 002 2h12a2 2 0 002-2v0a2 2 0 010-4zM10 6v12' },
		{ path: '/payouts', label: 'Referral payouts', icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6' },
		{ path: '/broadcasts', label: 'Broadcasts', icon: 'M3 11l18-8v18L3 13zM7 12v6a2 2 0 004 0v-4' },
		{ path: '/support', label: 'Support', icon: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z' },
		{ path: '/settings', label: 'Settings', icon: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z' }
	];

	// The cookie is global but rates are per store: a currency this store has no rate for shows as USD only.
	const shownCurrency = $derived(data.currency && data.currencies.includes(data.currency) ? data.currency : 'USD');

	let menuOpen = $state(false);
	let dark = $state(browser && document.documentElement.classList.contains('dark'));

	function isActive(path: string) {
		const p = page.url.pathname;
		const href = link(path);
		return path === '' ? p === href : p === href || p.startsWith(href + '/');
	}

	function toggleTheme() {
		dark = !dark;
		document.documentElement.classList.toggle('dark', dark);
		try {
			localStorage.setItem('tb-theme', dark ? 'dark' : 'light');
		} catch {
			/* ignore */
		}
	}

	async function setCurrency(e: Event) {
		const currency = (e.target as HTMLSelectElement).value;
		try {
			await api('/api/currency', { body: { currency } });
			await storeClient.invalidateQueries();
		} catch (err) {
			toast.error((err as Error).message);
		}
	}

	function switchStore(e: Event & { currentTarget: HTMLSelectElement }) {
		const slug = e.currentTarget.value;
		if (slug !== data.store.slug) goto(switchTarget(page.url.pathname, slug));
	}

	$effect(() => {
		page.url.pathname;
		menuOpen = false;
	});
</script>

<div class="min-h-dvh lg:grid lg:grid-cols-[220px_1fr]">
	<!-- Sidebar -->
	<aside
		class="fixed inset-y-0 left-0 z-40 flex w-[240px] -translate-x-full flex-col border-r border-line bg-surface transition-transform lg:sticky lg:top-0 lg:h-dvh lg:w-auto lg:translate-x-0
			{menuOpen ? 'translate-x-0' : ''}"
	>
		<div class="flex h-14 shrink-0 items-center gap-2 border-b border-line px-4">
			<div class="grid size-7 shrink-0 place-items-center rounded-md text-[13px] font-bold {data.store.isActive ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted'}">
				{data.store.name.charAt(0).toUpperCase()}
			</div>
			<div class="min-w-0 flex-1">
				<div class="flex min-w-0 items-center gap-1.5">
					<span class="truncate text-[13px] font-semibold" title={data.store.name}>{data.store.name}</span>
					{#if !data.store.isActive}<Badge value="Inactive" tone="danger" />{/if}
				</div>
				<div class="truncate text-[11px] text-muted">{data.store.botUsername ? `@${data.store.botUsername}` : 'Admin panel'}</div>
			</div>
		</div>
		<div class="shrink-0 space-y-1 border-b border-line p-2">
			{#if data.stores.length > 1}
				<select class="input h-7 text-xs leading-7" value={data.store.slug} onchange={switchStore} aria-label="Switch store" title="Switch store">
					{#each data.stores as s (s.slug)}<option value={s.slug}>{s.name}{s.isActive ? '' : ' (inactive)'}</option>{/each}
				</select>
			{/if}
			<a href="/" class="flex items-center rounded-md px-2.5 py-1 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg">← All stores</a>
		</div>
		<nav class="flex flex-col gap-0.5 overflow-y-auto p-2" aria-label="Store">
			{#each sections as item (item.path)}
				<a
					href={link(item.path)}
					class="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors
						{isActive(item.path) ? 'bg-accent-soft font-medium text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg'}"
					aria-current={isActive(item.path) ? 'page' : undefined}
				>
					<svg class="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d={item.icon} /></svg>
					{item.label}
				</a>
			{/each}
		</nav>
	</aside>
	{#if menuOpen}
		<button class="fixed inset-0 z-30 bg-black/40 lg:hidden" aria-label="Close menu" onclick={() => (menuOpen = false)}></button>
	{/if}

	<div class="min-w-0">
		<header class="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-surface/90 px-4 backdrop-blur">
			<button class="btn btn-ghost px-2 lg:hidden" aria-label="Open menu" onclick={() => (menuOpen = true)}>
				<svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
			</button>
			<span class="min-w-0 truncate text-[13px] font-semibold lg:hidden">{data.store.name}</span>
			<div class="flex-1"></div>
			<label class="flex shrink-0 items-center gap-1.5 text-xs text-muted">
				<span class="hidden sm:inline">Also show</span>
				<select class="input h-7 w-auto py-0 text-xs" value={shownCurrency} onchange={setCurrency} aria-label="Secondary currency">
					<option value="USD">USD only</option>
					{#each data.currencies as c (c)}<option value={c}>{c}</option>{/each}
				</select>
			</label>
			<button class="btn btn-ghost shrink-0 px-2" onclick={toggleTheme} aria-label="Toggle dark mode" title="Toggle theme">
				{#if dark}
					<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
				{:else}
					<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" /></svg>
				{/if}
			</button>
			<span class="hidden text-xs text-muted sm:inline">{data.admin.username}</span>
			<form method="POST" action="/logout" class="shrink-0">
				<button class="btn btn-sm">Log out</button>
			</form>
		</header>
		<main class="mx-auto max-w-[1400px] p-4 lg:p-6">
			<!--
				Re-create the pages with the store's own QueryClient on a store switch: same-route navigation would otherwise
				keep them (and their state) mounted. Works like {#key slug} (storeClient changes exactly when the slug does),
				but hands each branch its client as a fixed value: QueryClientProvider reads its `client` prop again in
				onDestroy, so a reactive prop would unmount the incoming client instead of the outgoing one.
			-->
			{#each [storeClient] as client (client)}
				<QueryClientProvider {client}>
					{@render children()}
				</QueryClientProvider>
			{/each}
		</main>
	</div>
</div>
