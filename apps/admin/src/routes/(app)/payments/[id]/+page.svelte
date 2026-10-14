<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { page } from '$app/state';
	import { api } from '#lib/api.ts';
	import Badge from '#lib/components/Badge.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { fmtDate } from '#lib/format.ts';
	import { confirmAction, toast } from '#lib/ui.svelte.ts';

	interface Payment {
		id: number;
		code: string;
		userId: number;
		username: string | null;
		purpose: 'topup' | 'order';
		orderId: number | null;
		orderCode: string | null;
		orderStatus: string | null;
		provider: string;
		method: string;
		amount: number;
		fee: number;
		payCurrency: string;
		payAmount: string;
		status: string;
		providerRef: string | null;
		checkoutUrl: string | null;
		qrString: string | null;
		expiresAt: string | null;
		paidAt: string | null;
		createdAt: string;
		raw: unknown;
		fmt: { amount: string; fee: string };
	}

	const id = $derived(Number(page.params.id));
	const qc = useQueryClient();
	const q = createQuery(() => ({ queryKey: ['payment', id], queryFn: () => api<Payment>(`/api/payments/${id}`) }));
	let busy = $state(false);

	async function markPaid(p: Payment) {
		const what = p.purpose === 'topup' ? `credits ${p.fmt.amount} (+ any top-up bonus) to the user's wallet` : `completes order ${p.orderCode ?? ''} and delivers its items`;
		if (
			!(await confirmAction({
				title: `Mark ${p.code} as paid?`,
				body: `Only do this after verifying the money arrived (${p.payAmount} ${p.payCurrency} via ${p.provider}).\nThis ${what}. Settlement is idempotent.`,
				confirmLabel: 'Mark paid',
				danger: true
			}))
		)
			return;
		busy = true;
		try {
			const r = await api<{ alreadySettled: boolean; creditedFmt: string; orderCode: string | null; orderStatus: string | null }>(`/api/payments/${p.id}/mark-paid`, { body: {} });
			if (r.alreadySettled) toast.info('Payment was already settled — nothing changed');
			else if (p.purpose === 'topup') toast.success(`Settled · credited ${r.creditedFmt}`);
			else toast.success(`Settled · order ${r.orderCode} is ${r.orderStatus}`);
			await Promise.all([qc.invalidateQueries({ queryKey: ['payment', id] }), qc.invalidateQueries({ queryKey: ['payments'] })]);
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			busy = false;
		}
	}
</script>

{#if q.isPending}
	<div class="card h-64 animate-pulse"></div>
{:else if q.isError}
	<PageHeader title="Payment" back={{ href: '/payments', label: 'Payments' }} />
	<div class="card p-6 text-danger">{q.error.message}</div>
{:else if q.data}
	{@const p = q.data}
	<PageHeader title={`Payment ${p.code}`} subtitle={`${p.purpose === 'topup' ? 'Wallet top-up' : 'Direct pay for an order'} · ${p.provider} ${p.method}`} back={{ href: '/payments', label: 'Payments' }}>
		{#snippet actions()}
			<Badge value={p.status} />
			{#if p.status !== 'paid'}<button class="btn btn-primary" disabled={busy} onclick={() => markPaid(p)}>Mark paid</button>{/if}
		{/snippet}
	</PageHeader>

	<div class="grid gap-4 lg:grid-cols-2">
		<section class="card p-4">
			<h2 class="mb-3 text-[13px] font-semibold">Details</h2>
			<dl class="kv">
				<dt>User</dt>
				<dd><a class="link" href="/users/{p.userId}">{p.username ? `@${p.username}` : p.userId}</a></dd>
				{#if p.orderId}
					<dt>Order</dt>
					<dd><a class="link mono" href="/orders/{p.orderId}">{p.orderCode}</a> {#if p.orderStatus}<Badge value={p.orderStatus} />{/if}</dd>
				{/if}
				<dt>Amount</dt>
				<dd class="tabular">{p.fmt.amount}</dd>
				<dt>Fee</dt>
				<dd class="tabular">{p.fmt.fee}</dd>
				<dt>Customer pays</dt>
				<dd class="tabular">{p.payAmount} {p.payCurrency}</dd>
				<dt>Provider ref</dt>
				<dd class="mono">{p.providerRef ?? '—'}</dd>
				<dt>Checkout</dt>
				<dd>{#if p.checkoutUrl}<a class="link break-all" href={p.checkoutUrl} target="_blank" rel="noopener noreferrer">{p.checkoutUrl}</a>{:else}—{/if}</dd>
				<dt>Created</dt>
				<dd>{fmtDate(p.createdAt)}</dd>
				<dt>Expires</dt>
				<dd>{fmtDate(p.expiresAt)}</dd>
				<dt>Paid</dt>
				<dd>{fmtDate(p.paidAt)}</dd>
			</dl>
			{#if p.qrString}
				<details class="mt-3 text-xs">
					<summary class="cursor-pointer text-muted">QRIS payload</summary>
					<code class="mono mt-1 block break-all">{p.qrString}</code>
				</details>
			{/if}
		</section>
		<section class="card flex min-h-0 flex-col">
			<div class="border-b border-line px-4 py-3 text-[13px] font-semibold">Raw gateway payload</div>
			<pre class="mono max-h-[520px] flex-1 overflow-auto p-4 whitespace-pre-wrap">{p.raw == null ? 'null' : JSON.stringify(p.raw, null, 2)}</pre>
		</section>
	</div>
{/if}
