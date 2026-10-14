<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();
	let submitting = $state(false);
</script>

<svelte:head><title>Sign in · TokoLafan Admin</title></svelte:head>

<div class="grid min-h-dvh place-items-center px-4">
	<div class="w-full max-w-[360px]">
		<div class="mb-6 flex items-center gap-2.5">
			<div class="grid size-9 place-items-center rounded-lg bg-accent text-sm font-bold text-accent-fg">TL</div>
			<div>
				<div class="text-[15px] font-semibold">TokoLafan Admin</div>
				<div class="text-xs text-muted">Sign in to manage the store</div>
			</div>
		</div>
		<form
			method="POST"
			class="card space-y-4 p-5"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update();
					submitting = false;
				};
			}}
		>
			{#if form?.error}
				<div class="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger" role="alert">{form.error}</div>
			{/if}
			<label class="block">
				<span class="label">Username</span>
				<!-- svelte-ignore a11y_autofocus -->
				<input class="input" name="username" autocomplete="username" required autofocus value={form?.username ?? ''} />
			</label>
			<label class="block">
				<span class="label">Password</span>
				<input class="input" name="password" type="password" autocomplete="current-password" required />
			</label>
			<button class="btn btn-primary w-full" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button>
		</form>
	</div>
</div>
