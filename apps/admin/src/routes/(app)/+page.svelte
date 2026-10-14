<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { api } from '#lib/api.ts';
	import PageHeader from '#lib/components/PageHeader.svelte';

	type M = { cents: number; fmt: string };
	interface Dash {
		revenue: { today: M; d7: M; d30: M };
		orders: { today: number; d7: number; d30: number };
		topups: { today: M; d7: M; d30: M; count: { today: number; d7: number; d30: number } };
		users: { total: number; today: number; d7: number; d30: number; wallet: M };
		lowStock: { id: number; name: string; code: string; stock: number }[];
		lowStockThreshold: number;
		series: { day: string; revenue: number; revenueFmt: string; orders: number }[];
		attention: { pendingWithdraws: number; openSupport: number; activeBroadcasts: number; pendingPayments: number };
	}

	const q = createQuery(() => ({ queryKey: ['dashboard'], queryFn: () => api<Dash>('/api/dashboard'), refetchInterval: 60_000 }));

	let period = $state<'today' | 'd7' | 'd30'>('today');
	const periods = [
		{ id: 'today', label: 'Today' },
		{ id: 'd7', label: '7 days' },
		{ id: 'd30', label: '30 days' }
	] as const;

	const maxRev = $derived(Math.max(1, ...(q.data?.series.map((s) => s.revenue) ?? [1])));
	let hover = $state<number | null>(null);
</script>

<PageHeader title="Dashboard" subtitle="Sales, top-ups and things that need attention">
	{#snippet actions()}
		<div class="inline-flex rounded-md border border-line bg-surface p-0.5" role="tablist">
			{#each periods as p (p.id)}
				<button
					role="tab"
					aria-selected={period === p.id}
					class="rounded px-2.5 py-1 text-xs font-medium {period === p.id ? 'bg-accent-soft text-accent' : 'text-muted hover:text-fg'}"
					onclick={() => (period = p.id)}>{p.label}</button
				>
			{/each}
		</div>
	{/snippet}
</PageHeader>

{#if q.isPending}
	<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
		{#each Array(4) as _, i (i)}<div class="card h-[92px] animate-pulse"></div>{/each}
	</div>
{:else if q.isError}
	<div class="card p-6 text-danger">{q.error.message}</div>
{:else if q.data}
	{@const d = q.data}
	<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
		<div class="card p-4">
			<div class="text-xs text-muted">Revenue</div>
			<div class="mt-1 text-xl font-semibold tabular">{d.revenue[period].fmt}</div>
			<div class="mt-1 text-xs text-muted">from completed orders</div>
		</div>
		<div class="card p-4">
			<div class="text-xs text-muted">Orders</div>
			<div class="mt-1 text-xl font-semibold tabular">{d.orders[period].toLocaleString('en-US')}</div>
			<div class="mt-1 text-xs text-muted">completed</div>
		</div>
		<div class="card p-4">
			<div class="text-xs text-muted">Top-ups</div>
			<div class="mt-1 text-xl font-semibold tabular">{d.topups[period].fmt}</div>
			<div class="mt-1 text-xs text-muted">{d.topups.count[period]} paid invoices</div>
		</div>
		<div class="card p-4">
			<div class="text-xs text-muted">New users</div>
			<div class="mt-1 text-xl font-semibold tabular">{d.users[period].toLocaleString('en-US')}</div>
			<div class="mt-1 text-xs text-muted">{d.users.total.toLocaleString('en-US')} total · wallets {d.users.wallet.fmt}</div>
		</div>
	</div>

	<div class="mt-3 grid gap-3 xl:grid-cols-[1fr_360px]">
		<div class="card p-4">
			<div class="mb-3 flex items-baseline justify-between">
				<h2 class="text-[13px] font-semibold">Revenue, last 14 days</h2>
				<span class="text-xs text-muted tabular">
					{#if hover !== null && d.series[hover]}
						{@const s = d.series[hover]!}
						{s.day}: {s.revenueFmt} · {s.orders} orders
					{:else}
						hover a bar for details
					{/if}
				</span>
			</div>
			<div class="flex h-40 items-end gap-1" role="img" aria-label="Daily revenue bar chart">
				{#each d.series as s, i (s.day)}
					<div
						class="group flex h-full flex-1 flex-col justify-end"
						role="presentation"
						onmouseenter={() => (hover = i)}
						onmouseleave={() => (hover = null)}
					>
						<div
							class="w-full rounded-t-sm transition-colors {hover === i ? 'bg-accent' : 'bg-accent/45'}"
							style="height: {Math.max(2, (s.revenue / maxRev) * 100)}%"
						></div>
					</div>
				{/each}
			</div>
			<div class="mt-1.5 flex justify-between text-[11px] text-muted tabular">
				<span>{d.series[0]?.day.slice(5)}</span><span>{d.series[d.series.length - 1]?.day.slice(5)}</span>
			</div>
		</div>

		<div class="card p-4">
			<h2 class="mb-3 text-[13px] font-semibold">Needs attention</h2>
			<ul class="space-y-1.5 text-[13px]">
				<li><a class="flex justify-between rounded px-2 py-1 hover:bg-surface-2" href="/payouts"><span>Pending withdraw requests</span><b class="tabular {d.attention.pendingWithdraws ? 'text-warn' : 'text-muted'}">{d.attention.pendingWithdraws}</b></a></li>
				<li><a class="flex justify-between rounded px-2 py-1 hover:bg-surface-2" href="/support"><span>Open support sessions</span><b class="tabular {d.attention.openSupport ? 'text-warn' : 'text-muted'}">{d.attention.openSupport}</b></a></li>
				<li><a class="flex justify-between rounded px-2 py-1 hover:bg-surface-2" href="/payments?status=pending"><span>Pending payments</span><b class="tabular text-muted">{d.attention.pendingPayments}</b></a></li>
				<li><a class="flex justify-between rounded px-2 py-1 hover:bg-surface-2" href="/broadcasts"><span>Broadcasts queued / sending</span><b class="tabular text-muted">{d.attention.activeBroadcasts}</b></a></li>
			</ul>
		</div>
	</div>

	<div class="card mt-3">
		<div class="flex items-baseline justify-between border-b border-line px-4 py-3">
			<h2 class="text-[13px] font-semibold">Low stock</h2>
			<span class="text-xs text-muted">active products with ≤ {d.lowStockThreshold} items available</span>
		</div>
		{#if d.lowStock.length === 0}
			<p class="px-4 py-6 text-center text-[13px] text-muted">All products are well stocked.</p>
		{:else}
			<ul class="divide-y divide-line">
				{#each d.lowStock as p (p.id)}
					<li class="flex items-center justify-between gap-3 px-4 py-2 text-[13px]">
						<a class="link truncate" href="/products/{p.id}">{p.name}</a>
						<div class="flex items-center gap-3">
							<span class="tabular font-semibold {p.stock === 0 ? 'text-danger' : 'text-warn'}">{p.stock === 0 ? 'sold out' : `${p.stock} left`}</span>
							<a class="btn btn-sm" href="/stock?productId={p.id}">Add stock</a>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}
