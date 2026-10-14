<script lang="ts">
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import { browser } from '$app/env';
	import UiHost from '#lib/components/UiHost.svelte';

	let { children } = $props();

	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { enabled: browser, staleTime: 10_000, retry: 1, refetchOnWindowFocus: true }
		}
	});
</script>

<QueryClientProvider client={queryClient}>
	{@render children()}
	<UiHost />
</QueryClientProvider>
