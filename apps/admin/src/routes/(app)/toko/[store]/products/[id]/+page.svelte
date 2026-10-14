<script lang="ts">
	import { apiUrl, link } from '#lib/current-store.ts';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api } from '#lib/api.ts';
	import Badge from '#lib/components/Badge.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import ProductForm, { type ProductInitial } from '#lib/components/ProductForm.svelte';
	import { confirmAction, toast } from '#lib/ui.svelte.ts';

	interface Product extends ProductInitial {
		id: number;
		stock: number;
		parentName: string | null;
		orderCount: number;
		fmt: { price: string };
		variants: { id: number; code: string; name: string; price: number; isActive: boolean; unlimited: boolean; stock: number; fmt: { price: string } }[];
	}

	const id = $derived(Number(page.params.id));
	const qc = useQueryClient();
	const q = createQuery(() => ({ queryKey: ['product', id], queryFn: () => api<Product>(apiUrl(`/products/${id}`)) }));

	async function remove() {
		if (!(await confirmAction({ title: 'Delete product?', body: 'This removes the product, its variants, tiers and unsold stock. Products with orders cannot be deleted — deactivate them instead.', confirmLabel: 'Delete', danger: true }))) return;
		try {
			await api(apiUrl(`/products/${id}`), { method: 'DELETE' });
			toast.success('Product deleted');
			await qc.invalidateQueries({ queryKey: ['products'] });
			await goto(link('/products'));
		} catch (e) {
			toast.error((e as Error).message);
		}
	}
</script>

{#if q.isPending}
	<div class="card h-64 animate-pulse"></div>
{:else if q.isError}
	<PageHeader title="Product" back={{ href: link('/products'), label: 'Products' }} />
	<div class="card p-6 text-danger">{q.error.message}</div>
{:else if q.data}
	{@const p = q.data}
	<PageHeader
		title={`${p.icon ? p.icon + ' ' : ''}${p.name}`}
		subtitle={`${p.isCollection ? 'Collection' : p.parentName ? `Variant of ${p.parentName}` : 'Product'} · code ${p.code} · ${p.orderCount} orders`}
		back={{ href: link('/products'), label: 'Products' }}
	>
		{#snippet actions()}
			{#if !p.isCollection}
				<a class="btn" href={link(`/stock?productId=${p.id}`)}>Stock: {p.unlimited ? '∞' : p.stock}</a>
				<a class="btn" href={link(`/orders?productId=${p.id}`)}>Orders</a>
			{:else}
				<a class="btn" href={link(`/products/new?parent=${p.id}`)}>+ Add variant</a>
			{/if}
			<button class="btn text-danger" onclick={remove}>Delete</button>
		{/snippet}
	</PageHeader>

	{#if p.isCollection}
		<section class="card mb-4">
			<div class="border-b border-line px-4 py-3 text-[13px] font-semibold">Variants ({p.variants.length})</div>
			{#if p.variants.length === 0}
				<p class="px-4 py-6 text-center text-[13px] text-muted">No variants yet. <a class="link" href={link(`/products/new?parent=${p.id}`)}>Add one</a>.</p>
			{:else}
				<ul class="divide-y divide-line text-[13px]">
					{#each p.variants as v (v.id)}
						<li class="flex flex-wrap items-center gap-3 px-4 py-2">
							<a class="link flex-1 font-medium" href={link(`/products/${v.id}`)}>{v.name}</a>
							<span class="mono text-muted">{v.code}</span>
							<span class="tabular">{v.fmt.price}</span>
							<span class="w-20 text-right tabular">{v.unlimited ? '∞' : `${v.stock} in stock`}</span>
							<Badge value={v.isActive ? 'active' : 'inactive'} />
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}

	{#key p.id}
		<ProductForm
			initial={p}
			productId={p.id}
			onSaved={async () => {
				toast.success('Saved');
				await qc.invalidateQueries({ queryKey: ['product', id] });
				await qc.invalidateQueries({ queryKey: ['products'] });
			}}
		/>
	{/key}
{/if}
