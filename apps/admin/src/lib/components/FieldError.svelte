<script lang="ts">
	import type { AnyFieldApi } from '@tanstack/svelte-form';

	let { field }: { field: AnyFieldApi } = $props();
	const errors = $derived(field.state.meta.errors.filter(Boolean) as unknown[]);
</script>

{#if (field.state.meta.isTouched || field.form.state.submissionAttempts > 0) && errors.length}
	<p class="field-error" role="alert">{errors.map((e) => (typeof e === 'string' ? e : ((e as { message?: string })?.message ?? String(e)))).join(', ')}</p>
{/if}
