<script lang="ts" module>
	export interface ProductInitial {
		name: string;
		code: string;
		price: number;
		isCollection: boolean;
		parentId: number | null;
		icon: string | null;
		customEmojiId: string | null;
		warranty: string | null;
		note: string | null;
		unlimited: boolean;
		unlimitedContent: string | null;
		isActive: boolean;
		sortOrder: number;
		discounts: { minQty: number; percentBp: number }[];
	}
</script>

<script lang="ts">
	import { createForm } from '@tanstack/svelte-form';
	import { createQuery } from '@tanstack/svelte-query';
	import { api, ApiError } from '#lib/api.ts';
	import { bpToPercent, centsToUsdInput, parseUsdToCents, percentToBp } from '#lib/money.ts';
	import FieldError from './FieldError.svelte';
	import TelegramPreview from './TelegramPreview.svelte';


	let {
		initial,
		productId = null,
		onSaved
	}: { initial: ProductInitial; productId?: number | null; onSaved: (id: number) => void | Promise<void> } = $props();

	let serverError = $state<string | null>(null);

	const collections = createQuery(() => ({
		queryKey: ['product-options', 'collection'],
		queryFn: () => api<{ id: number; name: string }[]>('/api/products/options?kind=collection')
	}));

	const form = createForm(() => ({
		defaultValues: {
			name: initial.name,
			code: initial.code,
			price: centsToUsdInput(initial.price),
			isCollection: initial.isCollection,
			parentId: initial.parentId ? String(initial.parentId) : '',
			icon: initial.icon ?? '',
			customEmojiId: initial.customEmojiId ?? '',
			warranty: initial.warranty ?? '',
			note: initial.note ?? '',
			unlimited: initial.unlimited,
			unlimitedContent: initial.unlimitedContent ?? '',
			isActive: initial.isActive,
			sortOrder: String(initial.sortOrder),
			discounts: initial.discounts.map((d) => ({ minQty: String(d.minQty), percent: bpToPercent(d.percentBp) }))
		},
		onSubmit: async ({ value }) => {
			serverError = null;
			const body = {
				name: value.name,
				code: value.code || null,
				price: value.isCollection ? 0 : parseUsdToCents(value.price),
				isCollection: value.isCollection,
				parentId: value.parentId ? Number(value.parentId) : null,
				icon: value.icon || null,
				customEmojiId: value.customEmojiId || null,
				warranty: value.warranty || null,
				note: value.note || null,
				unlimited: value.unlimited,
				unlimitedContent: value.unlimitedContent || null,
				isActive: value.isActive,
				sortOrder: Number(value.sortOrder) || 0,
				discounts: value.discounts.map((d) => ({ minQty: Number(d.minQty), percentBp: percentToBp(d.percent) }))
			};
			try {
				const res = productId
					? await api<{ id: number }>(`/api/products/${productId}`, { method: 'PUT', body })
					: await api<{ id: number }>('/api/products', { body });
				await onSaved(res.id);
			} catch (err) {
				serverError = err instanceof ApiError ? err.message : String(err);
			}
		}
	}));

	const isCollection = form.useSelector((s) => s.values.isCollection);
	const unlimited = form.useSelector((s) => s.values.unlimited);
	const note = form.useSelector((s) => s.values.note);

	const required = ({ value }: { value: string }) => (!value.trim() ? 'Required' : undefined);
</script>

<form
	class="grid gap-4 xl:grid-cols-[1fr_380px]"
	onsubmit={(e) => {
		e.preventDefault();
		e.stopPropagation();
		form.handleSubmit();
	}}
>
	<div class="space-y-4">
		<section class="card p-4">
			<h2 class="mb-3 text-[13px] font-semibold">Basics</h2>
			<div class="grid gap-3 sm:grid-cols-2">
				<form.Field name="name" validators={{ onChange: required }}>
					{#snippet children(field)}
						<label class="block sm:col-span-2">
							<span class="label">Name</span>
							<input class="input" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
							<FieldError {field} />
						</label>
					{/snippet}
				</form.Field>
				<form.Field
					name="code"
					validators={{ onChange: ({ value }) => (value && !/^[A-Za-z0-9_-]{1,32}$/.test(value) ? 'Letters, digits, _ and - (max 32)' : undefined) }}
				>
					{#snippet children(field)}
						<label class="block">
							<span class="label">Code (deep link <span class="mono">product_&lt;code&gt;</span>)</span>
							<input class="input mono" placeholder="auto-generated" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
							<FieldError {field} />
						</label>
					{/snippet}
				</form.Field>
				<form.Field name="isCollection">
					{#snippet children(field)}
						<label class="flex items-center gap-2 self-end pb-1.5 text-[13px]">
							<input type="checkbox" class="checkbox" checked={field.state.value} onchange={(e) => field.handleChange(e.currentTarget.checked)} />
							Collection (“Paket”) — holds variants, not sold directly
						</label>
					{/snippet}
				</form.Field>
				{#if !isCollection.current}
					<form.Field
						name="price"
						validators={{ onChange: ({ value }) => (parseUsdToCents(value) === null ? 'Enter a USD amount like 2.50' : undefined) }}
					>
						{#snippet children(field)}
							<label class="block">
								<span class="label">Price (USD)</span>
								<div class="relative">
									<span class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted">$</span>
									<input class="input pl-6 tabular" inputmode="decimal" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
								</div>
								<FieldError {field} />
							</label>
						{/snippet}
					</form.Field>
					<form.Field name="parentId">
						{#snippet children(field)}
							<label class="block">
								<span class="label">Collection (makes this a variant)</span>
								<select class="input" value={field.state.value} onchange={(e) => field.handleChange(e.currentTarget.value)}>
									<option value="">— none (top-level product) —</option>
									{#each collections.data ?? [] as c (c.id)}
										{#if c.id !== productId}<option value={String(c.id)}>{c.name}</option>{/if}
									{/each}
								</select>
							</label>
						{/snippet}
					</form.Field>
				{/if}
				<form.Field name="icon" validators={{ onChange: ({ value }) => (value.length > 16 ? 'Too long' : undefined) }}>
					{#snippet children(field)}
						<label class="block">
							<span class="label">Icon (emoji fallback)</span>
							<input class="input" placeholder="🎬" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
							<FieldError {field} />
						</label>
					{/snippet}
				</form.Field>
				<form.Field name="customEmojiId" validators={{ onChange: ({ value }) => (value && !/^\d{1,32}$/.test(value) ? 'Numeric Telegram custom emoji id' : undefined) }}>
					{#snippet children(field)}
						<label class="block">
							<span class="label">Custom emoji id</span>
							<input class="input mono" placeholder="5368324170671202286" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
							<FieldError {field} />
						</label>
					{/snippet}
				</form.Field>
				<form.Field name="warranty">
					{#snippet children(field)}
						<label class="block">
							<span class="label">Warranty</span>
							<input class="input" placeholder="e.g. 10d (empty = none)" value={field.state.value} oninput={(e) => field.handleChange(e.currentTarget.value)} />
						</label>
					{/snippet}
				</form.Field>
				<form.Field name="sortOrder" validators={{ onChange: ({ value }) => (!/^-?\d+$/.test(value) ? 'Whole number' : undefined) }}>
					{#snippet children(field)}
						<label class="block">
							<span class="label">Sort order (lower = first)</span>
							<input class="input tabular" inputmode="numeric" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
							<FieldError {field} />
						</label>
					{/snippet}
				</form.Field>
				<form.Field name="isActive">
					{#snippet children(field)}
						<label class="flex items-center gap-2 text-[13px] sm:col-span-2">
							<input type="checkbox" class="checkbox" checked={field.state.value} onchange={(e) => field.handleChange(e.currentTarget.checked)} />
							Active (visible in the bot)
						</label>
					{/snippet}
				</form.Field>
			</div>
		</section>

		{#if !isCollection.current}
			<section class="card p-4">
				<h2 class="mb-1 text-[13px] font-semibold">Delivery</h2>
				<p class="mb-3 text-xs text-muted">Stock items are imported on the Stock page. Unlimited products deliver the same content every time (stock ∞).</p>
				<form.Field name="unlimited">
					{#snippet children(field)}
						<label class="flex items-center gap-2 text-[13px]">
							<input type="checkbox" class="checkbox" checked={field.state.value} onchange={(e) => field.handleChange(e.currentTarget.checked)} />
							Unlimited stock
						</label>
					{/snippet}
				</form.Field>
				{#if unlimited.current}
					<form.Field
						name="unlimitedContent"
						validators={{ onChangeListenTo: ['unlimited'], onChange: ({ value, fieldApi }) => (fieldApi.form.getFieldValue('unlimited') && !value.trim() ? 'Content is required for unlimited products' : undefined) }}
					>
						{#snippet children(field)}
							<label class="mt-3 block">
								<span class="label">Content delivered for each unit</span>
								<textarea class="input mono" rows="4" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)}></textarea>
								<FieldError {field} />
							</label>
						{/snippet}
					</form.Field>
				{/if}
			</section>

			<section class="card p-4">
				<div class="mb-3 flex items-center justify-between">
					<div>
						<h2 class="text-[13px] font-semibold">Quantity discount tiers</h2>
						<p class="text-xs text-muted">The best tier with min qty ≤ quantity applies, e.g. buy 150+ → −6%.</p>
					</div>
				</div>
				<form.Field name="discounts" mode="array">
					{#snippet children(field)}
						<div class="space-y-2">
							{#each field.state.value as _, i (i)}
								<div class="flex items-start gap-2">
									<form.Field
										name={`discounts[${i}].minQty`}
										validators={{ onChange: ({ value }: { value: string }) => (!/^\d+$/.test(value) || Number(value) < 2 ? 'Min qty ≥ 2' : undefined) }}
									>
										{#snippet children(sub)}
											<label class="block flex-1">
												<span class="label">Min qty</span>
												<input class="input tabular" inputmode="numeric" value={sub.state.value} onblur={sub.handleBlur} oninput={(e) => sub.handleChange(e.currentTarget.value)} />
												<FieldError field={sub} />
											</label>
										{/snippet}
									</form.Field>
									<form.Field
										name={`discounts[${i}].percent`}
										validators={{ onChange: ({ value }: { value: string }) => (percentToBp(value) === null || percentToBp(value)! < 1 || percentToBp(value)! > 9900 ? '0.01–99%' : undefined) }}
									>
										{#snippet children(sub)}
											<label class="block flex-1">
												<span class="label">Discount %</span>
												<input class="input tabular" inputmode="decimal" value={sub.state.value} onblur={sub.handleBlur} oninput={(e) => sub.handleChange(e.currentTarget.value)} />
												<FieldError field={sub} />
											</label>
										{/snippet}
									</form.Field>
									<button type="button" class="btn btn-ghost mt-5 text-danger" aria-label="Remove tier" onclick={() => field.removeValue(i)}>Remove</button>
								</div>
							{/each}
							<button type="button" class="btn btn-sm" onclick={() => field.pushValue({ minQty: '', percent: '' })}>+ Add tier</button>
						</div>
					{/snippet}
				</form.Field>
			</section>
		{/if}
	</div>

	<div class="space-y-4">
		<section class="card p-4">
			<h2 class="mb-1 text-[13px] font-semibold">Note</h2>
			<p class="mb-2 text-xs text-muted">Shown under “Lihat Catatan”. Telegram HTML: &lt;b&gt; &lt;i&gt; &lt;a href&gt; &lt;code&gt;.</p>
			<form.Field name="note" validators={{ onChange: ({ value }) => (value.length > 3500 ? 'Max 3500 characters' : undefined) }}>
				{#snippet children(field)}
					<textarea class="input" rows="6" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)}></textarea>
					<div class="mt-1 flex justify-between text-[11px] text-muted"><FieldError {field} /><span class="ml-auto tabular">{field.state.value.length}/3500</span></div>
				{/snippet}
			</form.Field>
			<div class="mt-3"><TelegramPreview html={note.current} /></div>
		</section>

		<div class="card sticky top-[72px] space-y-2 p-4">
			{#if serverError}<div class="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger" role="alert">{serverError}</div>{/if}
			<form.Subscribe selector={(s) => ({ canSubmit: s.canSubmit, isSubmitting: s.isSubmitting, isDirty: s.isDirty })}>
				{#snippet children(s)}
					<button type="submit" class="btn btn-primary w-full" disabled={!s.canSubmit || s.isSubmitting}>
						{s.isSubmitting ? 'Saving…' : productId ? 'Save changes' : 'Create'}
					</button>
					{#if productId && s.isDirty}<p class="text-center text-[11px] text-warn">Unsaved changes</p>{/if}
				{/snippet}
			</form.Subscribe>
		</div>
	</div>
</form>
