<script lang="ts">
	import { useQueryClient } from '@tanstack/svelte-query';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import ProductForm from '#lib/components/ProductForm.svelte';
	import { toast } from '#lib/ui.svelte.ts';

	const qc = useQueryClient();
	const isCollection = page.url.searchParams.get('collection') === '1';
	const parent = page.url.searchParams.get('parent');
	const initial = {
		name: '',
		code: '',
		price: 0,
		isCollection,
		parentId: parent && /^\d+$/.test(parent) ? Number(parent) : null,
		icon: null,
		customEmojiId: null,
		warranty: null,
		note: null,
		unlimited: false,
		unlimitedContent: null,
		isActive: true,
		sortOrder: 0,
		discounts: []
	};
</script>

<PageHeader title={isCollection ? 'New collection' : 'New product'} back={{ href: '/products', label: 'Products' }} />

<ProductForm
	{initial}
	onSaved={async (id) => {
		toast.success('Created');
		await qc.invalidateQueries({ queryKey: ['products'] });
		await goto(`/products/${id}`);
	}}
/>
