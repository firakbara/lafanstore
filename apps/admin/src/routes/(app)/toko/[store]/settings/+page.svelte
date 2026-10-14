<script lang="ts">
	import { apiUrl, link } from '#lib/current-store.ts';
	import { createForm } from '@tanstack/svelte-form';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { invalidateAll, refreshAll } from '$app/navigation';
	import { page } from '$app/state';
	import { api, ApiError } from '#lib/api.ts';
	import FieldError from '#lib/components/FieldError.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { bpToPercent, centsToUsdInput, parseUsdToCents, percentToBp } from '#lib/money.ts';
	import { toast } from '#lib/ui.svelte.ts';

	interface Settings {
		referralPercentBp: number;
		referralMaxPerTopup: number;
		referralMinWithdraw: number;
		topupMin: number;
		topupBonusTiers: { minAmount: number; percentBp: number }[];
		orderPaymentTtlMinutes: number;
		fxRates: Record<string, number>;
		supportedLanguages: string[];
		storeName: string;
		channelUrl: string | null;
		supportUsername: string | null;
	}

	const qc = useQueryClient();
	const q = createQuery(() => ({ queryKey: ['settings'], queryFn: () => api<Settings>(apiUrl('/settings')) }));

	const usd = ({ value }: { value: string }) => (parseUsdToCents(value) === null ? 'USD amount, e.g. 1.00' : undefined);
	const pct = ({ value }: { value: string }) => (percentToBp(value) === null ? '0–100, up to 2 decimals' : undefined);

	function toForm(s: Settings) {
		return {
			storeName: s.storeName,
			channelUrl: s.channelUrl ?? '',
			supportUsername: s.supportUsername ?? '',
			supportedLanguages: s.supportedLanguages.join(', '),
			referralPercent: bpToPercent(s.referralPercentBp),
			referralMaxPerTopup: centsToUsdInput(s.referralMaxPerTopup),
			referralMinWithdraw: centsToUsdInput(s.referralMinWithdraw),
			topupMin: centsToUsdInput(s.topupMin),
			orderPaymentTtlMinutes: String(s.orderPaymentTtlMinutes),
			topupBonusTiers: s.topupBonusTiers.map((t) => ({ minAmount: centsToUsdInput(t.minAmount), percent: bpToPercent(t.percentBp) })),
			fxRates: Object.entries(s.fxRates).map(([currency, rate]) => ({ currency, rate: String(rate) }))
		};
	}
	type FormValues = ReturnType<typeof toForm>;

	const EMPTY: FormValues = {
		storeName: '',
		channelUrl: '',
		supportUsername: '',
		supportedLanguages: '',
		referralPercent: '',
		referralMaxPerTopup: '',
		referralMinWithdraw: '',
		topupMin: '',
		orderPaymentTtlMinutes: '',
		topupBonusTiers: [],
		fxRates: []
	};

	const form = createForm(() => ({
		defaultValues: q.data ? toForm(q.data) : EMPTY,
		onSubmit: async ({ value, formApi }) => {
			const body = {
				storeName: value.storeName,
				channelUrl: value.channelUrl || null,
				supportUsername: value.supportUsername || null,
				supportedLanguages: value.supportedLanguages.split(/[\s,]+/).filter(Boolean),
				referralPercentBp: percentToBp(value.referralPercent),
				referralMaxPerTopup: parseUsdToCents(value.referralMaxPerTopup),
				referralMinWithdraw: parseUsdToCents(value.referralMinWithdraw),
				topupMin: parseUsdToCents(value.topupMin),
				orderPaymentTtlMinutes: Number(value.orderPaymentTtlMinutes),
				topupBonusTiers: value.topupBonusTiers.map((t) => ({ minAmount: parseUsdToCents(t.minAmount), percentBp: percentToBp(t.percent) })),
				fxRates: Object.fromEntries(value.fxRates.map((r) => [r.currency.trim().toUpperCase(), Number(r.rate)]))
			};
			try {
				const saved = await api<Settings>(apiUrl('/settings'), { method: 'PUT', body });
				qc.setQueryData(['settings'], saved);
				formApi.reset(toForm(saved));
				toast.success('Settings saved');
				await qc.invalidateQueries();
				await refreshAll(); // refresh layout (currency list, store name)
			} catch (e) {
				toast.error((e as Error).message);
			}
		}
	}));

	// Load server values into the form once they arrive.
	let loaded = false;
	$effect(() => {
		if (q.data && !loaded) {
			loaded = true;
			form.reset(toForm(q.data));
		}
	});

	// --- Bot & store (token, admins, active flag) ---
	const botStore = $derived(page.data.store);
	let botFieldErrors = $state<Record<string, string>>({});
	let botError = $state('');
	const parseAdminIds = (v: string) => v.split(/[\s,]+/).filter(Boolean);

	const botForm = createForm(() => ({
		defaultValues: {
			botToken: '',
			adminIds: (botStore?.adminIds ?? []).join(', '),
			adminChatId: botStore?.adminChatId == null ? '' : String(botStore.adminChatId),
			isActive: botStore?.isActive ?? true
		},
		onSubmit: async ({ value, formApi }) => {
			botFieldErrors = {};
			botError = '';
			try {
				await api(apiUrl('/store'), {
					method: 'PATCH',
					body: {
						botToken: value.botToken.trim(),
						adminIds: parseAdminIds(value.adminIds).map(Number),
						adminChatId: value.adminChatId.trim() === '' ? null : Number(value.adminChatId),
						isActive: value.isActive
					}
				});
				toast.success('Bot & store saved');
				formApi.setFieldValue('botToken', '');
				await invalidateAll(); // refresh layout data (page.data.store)
			} catch (e) {
				if (e instanceof ApiError && e.field) botFieldErrors = { [e.field]: e.message };
				else botError = (e as Error).message;
			}
		}
	}));
</script>

<PageHeader title="Settings" subtitle="Store-wide configuration used by the bot, API and payments" />

{#if q.isPending}
	<div class="card h-64 animate-pulse"></div>
{:else if q.isError}
	<div class="card p-6 text-danger">{q.error.message}</div>
{:else}
	<form
		class="grid gap-4 xl:grid-cols-2"
		onsubmit={(e) => {
			e.preventDefault();
			e.stopPropagation();
			form.handleSubmit();
		}}
	>
		<section class="card space-y-3 p-4">
			<h2 class="text-[13px] font-semibold">Store</h2>
			<form.Field name="storeName" validators={{ onChange: ({ value }) => (!value.trim() ? 'Required' : value.length > 64 ? 'Max 64' : undefined) }}>
				{#snippet children(field)}
					<label class="block">
						<span class="label">Store name</span>
						<input class="input" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
						<FieldError {field} />
					</label>
				{/snippet}
			</form.Field>
			<form.Field name="channelUrl" validators={{ onChange: ({ value }) => (value && !/^https?:\/\/\S+$/.test(value) ? 'Must start with https://' : undefined) }}>
				{#snippet children(field)}
					<label class="block">
						<span class="label">Channel URL (main menu button)</span>
						<input class="input" placeholder="https://t.me/yourchannel" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
						<FieldError {field} />
					</label>
				{/snippet}
			</form.Field>
			<form.Field name="supportUsername" validators={{ onChange: ({ value }) => (value && !/^@?[A-Za-z0-9_]{4,32}$/.test(value) ? 'Telegram username' : undefined) }}>
				{#snippet children(field)}
					<label class="block">
						<span class="label">Support username</span>
						<input class="input" placeholder="tokobun_support" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
						<FieldError {field} />
					</label>
				{/snippet}
			</form.Field>
			<form.Field name="supportedLanguages" validators={{ onChange: ({ value }) => (!value.split(/[\s,]+/).filter(Boolean).every((l) => /^[a-z]{2,3}$/.test(l)) || !value.trim() ? 'Comma-separated codes, e.g. id, en' : undefined) }}>
				{#snippet children(field)}
					<label class="block">
						<span class="label">Supported languages</span>
						<input class="input" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
						<FieldError {field} />
						<p class="mt-0.5 text-[11px] text-muted">ISO 639-1 codes, comma-separated. Currently supported: en, id</p>
					</label>
				{/snippet}
			</form.Field>
		</section>

		<section class="card space-y-3 p-4">
			<h2 class="text-[13px] font-semibold">Top-ups & orders</h2>
			<div class="grid grid-cols-2 gap-3">
				<form.Field name="topupMin" validators={{ onChange: usd }}>
					{#snippet children(field)}
						<label class="block">
							<span class="label">Minimum top-up (USD)</span>
							<input class="input tabular" inputmode="decimal" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
							<FieldError {field} />
						</label>
					{/snippet}
				</form.Field>
				<form.Field name="orderPaymentTtlMinutes" validators={{ onChange: ({ value }) => (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 1440 ? '1–1440 minutes' : undefined) }}>
					{#snippet children(field)}
						<label class="block">
							<span class="label">Direct-pay reservation (minutes)</span>
							<input class="input tabular" inputmode="numeric" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
							<FieldError {field} />
						</label>
					{/snippet}
				</form.Field>
			</div>
			<form.Field name="topupBonusTiers" mode="array">
				{#snippet children(field)}
					<div>
						<span class="label">Top-up bonus tiers (top up ≥ amount → bonus %)</span>
						<div class="space-y-2">
							{#each field.state.value as _, i (i)}
								<div class="flex items-start gap-2">
									<form.Field name={`topupBonusTiers[${i}].minAmount`} validators={{ onChange: usd }}>
										{#snippet children(sub)}
											<div class="flex-1">
												<input class="input tabular" inputmode="decimal" placeholder="min USD" aria-label="Minimum amount USD" value={sub.state.value} onblur={sub.handleBlur} oninput={(e) => sub.handleChange(e.currentTarget.value)} />
												<FieldError field={sub} />
											</div>
										{/snippet}
									</form.Field>
									<form.Field name={`topupBonusTiers[${i}].percent`} validators={{ onChange: pct }}>
										{#snippet children(sub)}
											<div class="flex-1">
												<input class="input tabular" inputmode="decimal" placeholder="bonus %" aria-label="Bonus percent" value={sub.state.value} onblur={sub.handleBlur} oninput={(e) => sub.handleChange(e.currentTarget.value)} />
												<FieldError field={sub} />
											</div>
										{/snippet}
									</form.Field>
									<button type="button" class="btn btn-ghost text-danger" onclick={() => field.removeValue(i)}>Remove</button>
								</div>
							{/each}
							<button type="button" class="btn btn-sm" onclick={() => field.pushValue({ minAmount: '', percent: '' })}>+ Add tier</button>
						</div>
					</div>
				{/snippet}
			</form.Field>
		</section>

		<section class="card space-y-3 p-4">
			<h2 class="text-[13px] font-semibold">Referral program</h2>
			<div class="grid grid-cols-3 gap-3">
				<form.Field name="referralPercent" validators={{ onChange: pct }}>
					{#snippet children(field)}
						<label class="block">
							<span class="label">Commission %</span>
							<input class="input tabular" inputmode="decimal" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
							<FieldError {field} />
						</label>
					{/snippet}
				</form.Field>
				<form.Field name="referralMaxPerTopup" validators={{ onChange: usd }}>
					{#snippet children(field)}
						<label class="block">
							<span class="label">Max per top-up (USD)</span>
							<input class="input tabular" inputmode="decimal" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
							<FieldError {field} />
						</label>
					{/snippet}
				</form.Field>
				<form.Field name="referralMinWithdraw" validators={{ onChange: usd }}>
					{#snippet children(field)}
						<label class="block">
							<span class="label">Min withdraw (USD)</span>
							<input class="input tabular" inputmode="decimal" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
							<FieldError {field} />
						</label>
					{/snippet}
				</form.Field>
			</div>
		</section>

		<section class="card space-y-3 p-4">
			<div>
				<h2 class="text-[13px] font-semibold">Exchange rates</h2>
				<p class="text-xs text-muted">Units of currency per 1 USD (USD is implied 1). Used for display and for converting amounts users type.</p>
			</div>
			<form.Field name="fxRates" mode="array">
				{#snippet children(field)}
					<div class="space-y-2">
						{#each field.state.value as _, i (i)}
							<div class="flex items-start gap-2">
								<form.Field
									name={`fxRates[${i}].currency`}
									validators={{
										onChange: ({ value, fieldApi }) => {
											const v = value.trim().toUpperCase();
											if (!/^[A-Z]{3,5}$/.test(v) || v === 'USD') return '3-letter code (not USD)';
											const all = (fieldApi.form.getFieldValue('fxRates') as { currency: string }[]).map((r) => r.currency.trim().toUpperCase());
											return all.filter((c) => c === v).length > 1 ? 'Duplicate' : undefined;
										}
									}}
								>
									{#snippet children(sub)}
										<div class="w-28">
											<input class="input mono uppercase" placeholder="IDR" aria-label="Currency code" value={sub.state.value} onblur={sub.handleBlur} oninput={(e) => sub.handleChange(e.currentTarget.value)} />
											<FieldError field={sub} />
										</div>
									{/snippet}
								</form.Field>
								<form.Field name={`fxRates[${i}].rate`} validators={{ onChange: ({ value }) => (!(Number(value) > 0) ? 'Positive number' : undefined) }}>
									{#snippet children(sub)}
										<div class="flex-1">
											<input class="input tabular" inputmode="decimal" placeholder="16300" aria-label="Rate per USD" value={sub.state.value} onblur={sub.handleBlur} oninput={(e) => sub.handleChange(e.currentTarget.value)} />
											<FieldError field={sub} />
										</div>
									{/snippet}
								</form.Field>
								<button type="button" class="btn btn-ghost text-danger" onclick={() => field.removeValue(i)}>Remove</button>
							</div>
						{/each}
						<button type="button" class="btn btn-sm" onclick={() => field.pushValue({ currency: '', rate: '' })}>+ Add currency</button>
					</div>
				{/snippet}
			</form.Field>
		</section>

		<div class="xl:col-span-2">
			<form.Subscribe selector={(s) => ({ canSubmit: s.canSubmit, isSubmitting: s.isSubmitting, isDirty: s.isDirty })}>
				{#snippet children(s)}
					<div class="card flex items-center justify-end gap-3 p-3">
						{#if s.isDirty}<span class="text-xs text-warn">Unsaved changes</span>{/if}
						<button type="button" class="btn" disabled={!s.isDirty} onclick={() => q.data && form.reset(toForm(q.data))}>Discard</button>
						<button class="btn btn-primary" disabled={!s.canSubmit || s.isSubmitting}>{s.isSubmitting ? 'Saving…' : 'Save settings'}</button>
					</div>
				{/snippet}
			</form.Subscribe>
		</div>
	</form>
{/if}

<form
	class="mt-4 grid gap-4 xl:grid-cols-2"
	onsubmit={(e) => {
		e.preventDefault();
		e.stopPropagation();
		botForm.handleSubmit();
	}}
>
	<section class="card space-y-3 p-4">
		<h2 class="text-[13px] font-semibold">Bot & store</h2>
		<p class="text-[13px]">
			<span class="label">Bot</span>
			{#if botStore?.botUsername}<span class="mono">@{botStore.botUsername}</span>{:else}<span class="text-muted">not verified</span>{/if}
		</p>
		<botForm.Field name="botToken">
			{#snippet children(field)}
				<label class="block">
					<span class="label">New bot token</span>
					<input class="input mono" type="password" autocomplete="off" placeholder="leave empty to keep current" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
					{#if botFieldErrors.botToken}<p class="field-error" role="alert">{botFieldErrors.botToken}</p>{/if}
					<p class="mt-0.5 text-[11px] text-muted">Checked with Telegram before saving. The bot restarts within 30 seconds.</p>
				</label>
			{/snippet}
		</botForm.Field>
		<botForm.Field name="adminIds" validators={{ onChange: ({ value }) => (!parseAdminIds(value).every((v) => /^\d+$/.test(v)) ? 'Comma-separated Telegram IDs, e.g. 12345, 67890' : undefined) }}>
			{#snippet children(field)}
				<label class="block">
					<span class="label">Admin Telegram IDs</span>
					<input class="input mono" inputmode="numeric" placeholder="12345, 67890" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
					<FieldError {field} />
					{#if botFieldErrors.adminIds}<p class="field-error" role="alert">{botFieldErrors.adminIds}</p>{/if}
				</label>
			{/snippet}
		</botForm.Field>
		<botForm.Field name="adminChatId" validators={{ onChange: ({ value }) => (value.trim() && !/^-?\d+$/.test(value.trim()) ? 'Numeric chat ID, or leave empty' : undefined) }}>
			{#snippet children(field)}
				<label class="block">
					<span class="label">Admin chat ID</span>
					<input class="input mono" inputmode="numeric" placeholder="optional, e.g. -1001234567890" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
					<FieldError {field} />
					{#if botFieldErrors.adminChatId}<p class="field-error" role="alert">{botFieldErrors.adminChatId}</p>{/if}
				</label>
			{/snippet}
		</botForm.Field>
		<botForm.Field name="isActive">
			{#snippet children(field)}
				<label class="flex items-center gap-2">
					<input type="checkbox" class="checkbox" checked={field.state.value} onchange={(e) => field.handleChange(e.currentTarget.checked)} />
					<span class="text-[13px]">Active</span>
				</label>
				<p class="text-[11px] text-muted">Inactive stores stop their bot.</p>
			{/snippet}
		</botForm.Field>
		{#if botError}<div class="rounded border border-danger/40 p-2 text-[13px] text-danger" role="alert">{botError}</div>{/if}
		<botForm.Subscribe selector={(s) => ({ canSubmit: s.canSubmit, isSubmitting: s.isSubmitting })}>
			{#snippet children(s)}
				<div class="flex justify-end">
					<button class="btn btn-primary" disabled={!s.canSubmit || s.isSubmitting}>{s.isSubmitting ? 'Saving…' : 'Save bot & store'}</button>
				</div>
			{/snippet}
		</botForm.Subscribe>
	</section>
</form>
