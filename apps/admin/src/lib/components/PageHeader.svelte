<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, subtitle, back, actions }: { title: string; subtitle?: string; back?: { href: string; label: string }; actions?: Snippet } = $props();
</script>

<svelte:head><title>{title} · TokoBun</title></svelte:head>

<div class="mb-4 flex flex-wrap items-end justify-between gap-3">
	<div class="min-w-0">
		{#if back}
			<a href={back.href} class="mb-1 inline-block text-xs text-muted hover:text-fg">← {back.label}</a>
		{/if}
		<h1 class="truncate text-lg font-semibold tracking-tight">{title}</h1>
		{#if subtitle}<p class="mt-0.5 text-[13px] text-muted">{subtitle}</p>{/if}
	</div>
	{#if actions}<div class="flex flex-wrap items-center gap-2">{@render actions()}</div>{/if}
</div>
