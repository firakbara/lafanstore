<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head><title>{page.status} · TokoBun Admin</title></svelte:head>

<div class="grid min-h-dvh place-items-center px-4">
	<div class="text-center">
		<div class="text-6xl font-bold text-muted">{page.status}</div>
		<p class="mt-3 text-[15px] text-fg">{page.error?.message ?? 'Something went wrong'}</p>
		<a class="btn btn-primary mt-6 inline-block" href="/">Back to dashboard</a>
	</div>
</div>
