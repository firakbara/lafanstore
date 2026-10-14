<script lang="ts">
	let { value, tone }: { value: string; tone?: 'ok' | 'warn' | 'danger' | 'info' | 'muted' | 'accent' } = $props();

	const AUTO: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'muted' | 'accent'> = {
		completed: 'ok',
		paid: 'ok',
		done: 'ok',
		active: 'ok',
		open: 'warn',
		pending: 'warn',
		pending_payment: 'warn',
		queued: 'info',
		sending: 'accent',
		draft: 'muted',
		reserved: 'info',
		available: 'ok',
		sold: 'muted',
		closed: 'muted',
		inactive: 'muted',
		cancelled: 'muted',
		expired: 'muted',
		refunded: 'danger',
		rejected: 'danger',
		failed: 'danger',
		banned: 'danger'
	};
	const t = $derived(tone ?? AUTO[value] ?? 'muted');
	const cls = $derived(
		{
			ok: 'bg-ok-soft text-ok',
			warn: 'bg-warn-soft text-warn',
			danger: 'bg-danger-soft text-danger',
			info: 'bg-info-soft text-info',
			accent: 'bg-accent-soft text-accent',
			muted: 'bg-surface-2 text-muted'
		}[t]
	);
</script>

<span class="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap {cls}">{value.replace(/_/g, ' ')}</span>
