<script lang="ts">
	import { browser } from '$app/env';
	import { page } from '$app/state';

	let { data, children } = $props();

	const nav = [
		{ href: '/', label: 'Stores', icon: 'M3 3h18v18H3zM3 9h18M9 21V9' },
		{ href: '/akun', label: 'Accounts', icon: 'M16 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z' }
	];

	let dark = $state(browser && document.documentElement.classList.contains('dark'));

	function isActive(href: string) {
		const p = page.url.pathname;
		return href === '/' ? p === '/' : p === href || p.startsWith(href + '/');
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
</script>

<div class="min-h-dvh">
	<header class="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
		<div class="mx-auto flex h-14 max-w-[1100px] items-center gap-2 px-4 lg:px-6">
			<a href="/" class="mr-2 flex shrink-0 items-center gap-2" aria-label="TokoBun home">
				<div class="grid size-7 place-items-center rounded-md bg-accent text-[13px] font-bold text-accent-fg">TB</div>
				<span class="hidden text-[13px] font-semibold sm:inline">TokoBun</span>
			</a>
			<nav class="flex items-center gap-0.5" aria-label="Main">
				{#each nav as item (item.href)}
					<a
						href={item.href}
						class="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-colors
							{isActive(item.href) ? 'bg-accent-soft font-medium text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg'}"
						aria-current={isActive(item.href) ? 'page' : undefined}
					>
						<svg class="hidden size-4 shrink-0 sm:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d={item.icon} /></svg>
						{item.label}
					</a>
				{/each}
			</nav>
			<div class="flex-1"></div>
			<button class="btn btn-ghost px-2" onclick={toggleTheme} aria-label="Toggle dark mode" title="Toggle theme">
				{#if dark}
					<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
				{:else}
					<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" /></svg>
				{/if}
			</button>
			<span class="hidden text-xs text-muted sm:inline">{data.admin.username}</span>
			<form method="POST" action="/logout">
				<button class="btn btn-sm">Log out</button>
			</form>
		</div>
	</header>
	<main class="mx-auto max-w-[1100px] p-4 lg:p-6">
		{@render children()}
	</main>
</div>
