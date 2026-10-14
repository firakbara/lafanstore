<script lang="ts" module>
	export interface VoucherValue {
		id?: number;
		code: string;
		kind: 'percent' | 'fixed';
		value: number;
		minTotal: number;
		maxUses: number | null;
		perUserLimit: number;
		productId: number | null;
		expiresAt: string | null;
		isActive: boolean;
	}
</script>

<script lang="ts">
	import { apiUrl } from '#lib/current-store.ts';
	import { createForm } from '@tanstack/svelte-form';
	import { createQuery } from '@tanstack/svelte-query';
	import { api } from '#lib/api.ts';
	import { bpToPercent, centsToUsdInput, parseUsdToCents, percentToBp } from '#lib/money.ts';
	import FieldError from './FieldError.svelte';

	let { initial, onSaved, onCancel }: { initial: VoucherValue | null; onSaved: () => void | Promise<void>; onCancel: () => void } = $props();
	let serverError = $state<string | null>(null);

	const products = createQuery(() => ({
		queryKey: ['product-options', 'sellable'],
		queryFn: () => api<{ id: number; name: string; parentName: string | null }[]>(apiUrl('/products/options?kind=sellable'))
	}));

	const toLocalInput = (iso: string | null) => {
		if (!iso) return '';
		const d = new Date(iso);
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	};

	const form = createForm(() => ({
		defaultValues: {
			code: initial?.code ?? '',
			kind: initial?.kind ?? ('percent' as 'percent' | 'fixed'),
			value: initial ? (initial.kind === 'percent' ? bpToPercent(initial.value) : centsToUsdInput(initial.value)) : '',
			minTotal: centsToUsdInput(initial?.minTotal ?? 0),
			maxUses: initial?.maxUses != null ? String(initial.maxUses) : '',
			perUserLimit: String(initial?.perUserLimit ?? 1),
			productId: initial?.productId ? String(initial.productId) : '',
			expiresAt: toLocalInput(initial?.expiresAt ?? null),
			isActive: initial?.isActive ?? true
		},
		onSubmit: async ({ value }) => {
			serverError = null;
			const body = {
				code: value.code.trim().toUpperCase(),
				kind: value.kind,
				value: value.kind === 'percent' ? percentToBp(value.value) : parseUsdToCents(value.value),
				minTotal: parseUsdToCents(value.minTotal || '0'),
				maxUses: value.maxUses ? Number(value.maxUses) : null,
				perUserLimit: Number(value.perUserLimit),
				productId: value.productId ? Number(value.productId) : null,
				expiresAt: value.expiresAt ? new Date(value.expiresAt).toISOString() : null,
				isActive: value.isActive
			};
			try {
				if (initial?.id) await api(apiUrl(`/vouchers/${initial.id}`), { method: 'PUT', body });
				else await api(apiUrl('/vouchers'), { body });
				await onSaved();
			} catch (e) {
				serverError = (e as Error).message;
			}
		}
	}));
	const kind = form.useSelector((s) => s.values.kind);
	const intOrEmpty = (min: number) => ({ value }: { value: string }) => (value && (!/^\d+$/.test(value) || Number(value) < min) ? `Whole number ≥ ${min}` : undefined);
</script>

<form
	class="space-y-3"
	onsubmit={(e) => {
		e.preventDefault();
		e.stopPropagation();
		form.handleSubmit();
	}}
>
	<form.Field name="code" validators={{ onChange: ({ value }) => (!/^[A-Za-z0-9_-]{2,32}$/.test(value.trim()) ? '2–32 letters, digits, _ or -' : undefined) }}>
		{#snippet children(field)}
			<label class="block">
				<span class="label">Code</span>
				<input class="input mono uppercase" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
				<FieldError {field} />
			</label>
		{/snippet}
	</form.Field>
	<div class="grid grid-cols-2 gap-3">
		<form.Field name="kind">
			{#snippet children(field)}
				<label class="block">
					<span class="label">Type</span>
					<select class="input" value={field.state.value} onchange={(e) => field.handleChange(e.currentTarget.value as 'percent' | 'fixed')}>
						<option value="percent">Percent off</option>
						<option value="fixed">Fixed amount off</option>
					</select>
				</label>
			{/snippet}
		</form.Field>
		<form.Field
			name="value"
			validators={{
				onChangeListenTo: ['kind'],
				onChange: ({ value, fieldApi }) => {
					if (fieldApi.form.getFieldValue('kind') === 'percent') {
						const bp = percentToBp(value);
						return bp === null || bp < 1 ? '0.01–100' : undefined;
					}
					const c = parseUsdToCents(value);
					return c === null || c < 1 ? 'USD amount > 0' : undefined;
				}
			}}
		>
			{#snippet children(field)}
				<label class="block">
					<span class="label">{kind.current === 'percent' ? 'Percent (%)' : 'Amount (USD)'}</span>
					<input class="input tabular" inputmode="decimal" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
					<FieldError {field} />
				</label>
			{/snippet}
		</form.Field>
		<form.Field name="minTotal" validators={{ onChange: ({ value }) => (value && parseUsdToCents(value) === null ? 'USD amount' : undefined) }}>
			{#snippet children(field)}
				<label class="block">
					<span class="label">Min order total (USD)</span>
					<input class="input tabular" inputmode="decimal" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
					<FieldError {field} />
				</label>
			{/snippet}
		</form.Field>
		<form.Field name="maxUses" validators={{ onChange: intOrEmpty(1) }}>
			{#snippet children(field)}
				<label class="block">
					<span class="label">Max uses (empty = ∞)</span>
					<input class="input tabular" inputmode="numeric" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
					<FieldError {field} />
				</label>
			{/snippet}
		</form.Field>
		<form.Field name="perUserLimit" validators={{ onChange: ({ value }) => (!/^\d+$/.test(value) || Number(value) < 1 ? 'Whole number ≥ 1' : undefined) }}>
			{#snippet children(field)}
				<label class="block">
					<span class="label">Uses per user</span>
					<input class="input tabular" inputmode="numeric" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
					<FieldError {field} />
				</label>
			{/snippet}
		</form.Field>
		<form.Field name="expiresAt">
			{#snippet children(field)}
				<label class="block">
					<span class="label">Expires (local time)</span>
					<input class="input" type="datetime-local" value={field.state.value} onchange={(e) => field.handleChange(e.currentTarget.value)} />
				</label>
			{/snippet}
		</form.Field>
	</div>
	<form.Field name="productId">
		{#snippet children(field)}
			<label class="block">
				<span class="label">Only for product</span>
				<select class="input" value={field.state.value} onchange={(e) => field.handleChange(e.currentTarget.value)}>
					<option value="">Any product</option>
					{#each products.data ?? [] as p (p.id)}<option value={String(p.id)}>{p.parentName ? `${p.parentName} › ` : ''}{p.name}</option>{/each}
				</select>
			</label>
		{/snippet}
	</form.Field>
	<form.Field name="isActive">
		{#snippet children(field)}
			<label class="flex items-center gap-2 text-[13px]"><input type="checkbox" class="checkbox" checked={field.state.value} onchange={(e) => field.handleChange(e.currentTarget.checked)} /> Active</label>
		{/snippet}
	</form.Field>
	{#if serverError}<div class="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger" role="alert">{serverError}</div>{/if}
	<div class="flex justify-end gap-2 pt-1">
		<button type="button" class="btn" onclick={onCancel}>Cancel</button>
		<form.Subscribe selector={(s) => ({ canSubmit: s.canSubmit, isSubmitting: s.isSubmitting })}>
			{#snippet children(s)}
				<button class="btn btn-primary" disabled={!s.canSubmit || s.isSubmitting}>{s.isSubmitting ? 'Saving…' : initial?.id ? 'Save' : 'Create voucher'}</button>
			{/snippet}
		</form.Subscribe>
	</div>
</form>
