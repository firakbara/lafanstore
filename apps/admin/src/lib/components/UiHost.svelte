<script lang="ts">
	import { confirmState, dismissToast, toasts } from '#lib/ui.svelte.ts';

	let dialog = $state<HTMLDialogElement>();
	let value = $state('');

	$effect(() => {
		if (!dialog) return;
		if (confirmState.current && !dialog.open) {
			value = '';
			dialog.showModal();
		} else if (!confirmState.current && dialog.open) dialog.close();
	});

	function finish(ok: boolean) {
		const cur = confirmState.current;
		if (!cur) return;
		if (ok && cur.input?.required && !value.trim()) return;
		confirmState.current = null;
		cur.resolve({ ok, value: value.trim() });
	}
</script>

<dialog
	bind:this={dialog}
	class="m-auto w-[min(440px,calc(100vw-32px))] rounded-lg border border-line bg-surface p-0 text-fg shadow-xl backdrop:bg-black/40"
	oncancel={(e) => {
		e.preventDefault();
		finish(false);
	}}
>
	{#if confirmState.current}
		{@const c = confirmState.current}
		<form
			method="dialog"
			class="p-5"
			onsubmit={(e) => {
				e.preventDefault();
				finish(true);
			}}
		>
			<h2 class="text-[15px] font-semibold">{c.title}</h2>
			{#if c.body}<p class="mt-2 text-[13px] whitespace-pre-line text-muted">{c.body}</p>{/if}
			{#if c.input}
				<label class="mt-4 block">
					<span class="label">{c.input.label}</span>
					<input class="input" bind:value placeholder={c.input.placeholder ?? ''} />
				</label>
			{/if}
			<div class="mt-5 flex justify-end gap-2">
				<button type="button" class="btn" onclick={() => finish(false)}>Cancel</button>
				<button type="submit" class="btn {c.danger ? 'btn-danger' : 'btn-primary'}" disabled={!!c.input?.required && !value.trim()}>
					{c.confirmLabel ?? 'Confirm'}
				</button>
			</div>
		</form>
	{/if}
</dialog>

<div class="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(380px,calc(100vw-32px))] flex-col gap-2" aria-live="polite">
	{#each toasts as t (t.id)}
		<div
			class="pointer-events-auto flex items-start gap-3 rounded-md border px-3 py-2.5 text-[13px] shadow-lg
				{t.kind === 'success' ? 'border-ok/30 bg-ok-soft' : t.kind === 'error' ? 'border-danger/30 bg-danger-soft' : 'border-line bg-surface'}"
			role="status"
		>
			<span class="mt-0.5 size-2 shrink-0 rounded-full {t.kind === 'success' ? 'bg-ok' : t.kind === 'error' ? 'bg-danger' : 'bg-info'}"></span>
			<span class="flex-1">{t.text}</span>
			<button class="text-muted hover:text-fg" aria-label="Dismiss" onclick={() => dismissToast(t.id)}>×</button>
		</div>
	{/each}
</div>
