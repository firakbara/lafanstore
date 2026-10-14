<script lang="ts">
	import { apiUrl, link } from '#lib/current-store.ts';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { page } from '$app/state';
	import { api } from '#lib/api.ts';
	import Badge from '#lib/components/Badge.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { fmtDate } from '#lib/format.ts';
	import { confirmAction, confirmDialog, toast } from '#lib/ui.svelte.ts';

	interface Order {
		id: number;
		code: string;
		userId: number;
		username: string | null;
		firstName: string | null;
		productId: number;
		productName: string;
		quantity: number;
		unitPrice: number;
		subtotal: number;
		discountBp: number;
		discountAmount: number;
		voucherCode: string | null;
		voucherDiscount: number;
		total: number;
		status: string;
		paidWith: string;
		paymentId: number | null;
		paymentCode: string | null;
		paymentStatus: string | null;
		warranty: string | null;
		createdAt: string;
		completedAt: string | null;
		items: string[];
		reservedCount: number;
		fmt: Record<'unitPrice' | 'subtotal' | 'discountAmount' | 'voucherDiscount' | 'total', string>;
	}

	const id = $derived(Number(page.params.id));
	const qc = useQueryClient();
	const q = createQuery(() => ({ queryKey: ['order', id], queryFn: () => api<Order>(apiUrl(`/orders/${id}`)) }));
	let busy = $state(false);

	async function refund(o: Order) {
		const r = await confirmDialog({
			title: `Refund ${o.code}?`,
			body: `${o.fmt.total} goes back to the user's wallet balance (ledger “refund”). Delivered items are NOT returned to stock.`,
			confirmLabel: 'Refund to wallet',
			danger: true,
			input: { label: 'Reason (stored in the ledger note)', placeholder: 'e.g. invalid account delivered', required: true }
		});
		if (!r.ok) return;
		busy = true;
		try {
			await api(apiUrl(`/orders/${o.id}/refund`), { body: { note: r.value } });
			toast.success('Order refunded to wallet');
			await qc.invalidateQueries({ queryKey: ['order', id] });
			await qc.invalidateQueries({ queryKey: ['orders'] });
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			busy = false;
		}
	}

	async function cancel(o: Order) {
		if (!(await confirmAction({ title: `Cancel ${o.code}?`, body: 'The order is cancelled and its reserved stock is released.', confirmLabel: 'Cancel order', danger: true }))) return;
		busy = true;
		try {
			await api(apiUrl(`/orders/${o.id}/cancel`), { body: {} });
			toast.success('Order cancelled');
			await qc.invalidateQueries({ queryKey: ['order', id] });
			await qc.invalidateQueries({ queryKey: ['orders'] });
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			busy = false;
		}
	}

	let copied = $state(false);
	async function copyItems(items: string[]) {
		await navigator.clipboard.writeText(items.join('\n'));
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}
</script>

{#if q.isPending}
	<div class="card h-64 animate-pulse"></div>
{:else if q.isError}
	<PageHeader title="Order" back={{ href: link('/orders'), label: 'Orders' }} />
	<div class="card p-6 text-danger">{q.error.message}</div>
{:else if q.data}
	{@const o = q.data}
	<PageHeader title={`Order ${o.code}`} subtitle={`${o.productName} × ${o.quantity}`} back={{ href: link('/orders'), label: 'Orders' }}>
		{#snippet actions()}
			<Badge value={o.status} />
			{#if o.status === 'completed'}<button class="btn text-danger" disabled={busy} onclick={() => refund(o)}>Refund to wallet</button>{/if}
			{#if o.status === 'pending_payment'}<button class="btn text-danger" disabled={busy} onclick={() => cancel(o)}>Cancel order</button>{/if}
		{/snippet}
	</PageHeader>

	<div class="grid gap-4 lg:grid-cols-[1fr_1fr]">
		<section class="card p-4">
			<h2 class="mb-3 text-[13px] font-semibold">Details</h2>
			<dl class="kv">
				<dt>User</dt>
				<dd><a class="link" href={link(`/users/${o.userId}`)}>{o.username ? `@${o.username}` : (o.firstName ?? o.userId)}</a> <span class="text-muted">({o.userId})</span></dd>
				<dt>Product</dt>
				<dd><a class="link" href={link(`/products/${o.productId}`)}>{o.productName}</a></dd>
				<dt>Warranty</dt>
				<dd>{o.warranty ?? '—'}</dd>
				<dt>Paid with</dt>
				<dd>
					{o.paidWith}
					{#if o.paymentId}· <a class="link mono" href={link(`/payments/${o.paymentId}`)}>{o.paymentCode}</a> {#if o.paymentStatus}<Badge value={o.paymentStatus} />{/if}{/if}
				</dd>
				<dt>Created</dt>
				<dd>{fmtDate(o.createdAt)}</dd>
				<dt>Completed</dt>
				<dd>{fmtDate(o.completedAt)}</dd>
				{#if o.reservedCount}
					<dt>Reserved</dt>
					<dd>{o.reservedCount} item(s) held until payment/expiry</dd>
				{/if}
			</dl>
		</section>
		<section class="card p-4">
			<h2 class="mb-3 text-[13px] font-semibold">Pricing</h2>
			<dl class="kv tabular">
				<dt>Unit price</dt>
				<dd>{o.fmt.unitPrice} × {o.quantity}</dd>
				<dt>Subtotal</dt>
				<dd>{o.fmt.subtotal}</dd>
				<dt>Tier discount</dt>
				<dd>{o.discountBp ? `−${o.fmt.discountAmount} (${o.discountBp / 100}%)` : '—'}</dd>
				<dt>Voucher</dt>
				<dd>{o.voucherCode ? `${o.voucherCode}: −${o.fmt.voucherDiscount}` : '—'}</dd>
				<dt class="font-semibold text-fg">Total</dt>
				<dd class="font-semibold">{o.fmt.total}</dd>
			</dl>
		</section>
	</div>

	<section class="card mt-4">
		<div class="flex items-center justify-between border-b border-line px-4 py-3">
			<h2 class="text-[13px] font-semibold">Delivered items ({o.items.length})</h2>
			{#if o.items.length}<button class="btn btn-sm" onclick={() => copyItems(o.items)} aria-label="Copy all delivered items">{copied ? 'Copied ✓' : 'Copy all'}</button>{/if}
		</div>
		{#if o.items.length === 0}
			<p class="px-4 py-6 text-center text-[13px] text-muted">{o.status === 'completed' ? 'No items recorded.' : 'Items are delivered once the order is completed.'}</p>
		{:else}
			<ol class="max-h-[420px] divide-y divide-line overflow-auto">
				{#each o.items as item, i (i)}
					<li class="flex gap-3 px-4 py-1.5"><span class="w-8 shrink-0 text-right text-xs text-muted tabular">{i + 1}</span><code class="mono break-all">{item}</code></li>
				{/each}
			</ol>
		{/if}
	</section>
{/if}
