<script lang="ts">
	import { createForm } from '@tanstack/svelte-form';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { renderSnippet } from '@tanstack/svelte-table';
	import { page } from '$app/state';
	import { api } from '#lib/api.ts';
	import Badge from '#lib/components/Badge.svelte';
	import DataTable from '#lib/components/DataTable.svelte';
	import FieldError from '#lib/components/FieldError.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { fmtDate, fmtRelative } from '#lib/format.ts';
	import { createList } from '#lib/list.svelte.ts';
	import { parseUsdToCents } from '#lib/money.ts';
	import type { Columns } from '#lib/table.ts';
	import { confirmAction, toast } from '#lib/ui.svelte.ts';

	interface User {
		id: number;
		username: string | null;
		firstName: string | null;
		language: string;
		currency: string;
		tzOffsetMinutes: number;
		balance: number;
		referralCode: string;
		referrer: { id: number; username: string | null } | null;
		notifyStock: boolean;
		notifyInfo: boolean;
		notifyReferral: boolean;
		isBanned: boolean;
		blockedBot: boolean;
		createdAt: string;
		lastSeenAt: string;
		fmt: { balance: string };
		stats: { orders: number; refunded: number; spent: number; topups: number; topupSum: number; ledgerTotal: number; ledgerConsistent: boolean };
		referral: { earned: number; transferred: number; withdrawn: number; available: number; referred: number };
		fmtStats: Record<'spent' | 'topupSum' | 'earned' | 'available' | 'withdrawn' | 'transferred', string>;
	}
	interface Entry {
		id: number;
		amount: number;
		type: string;
		refType: string | null;
		refId: string | null;
		balanceAfter: number;
		note: string | null;
		createdAt: string;
		fmt: { amount: string; balanceAfter: string };
	}

	const id = $derived(Number(page.params.id));
	const qc = useQueryClient();
	const q = createQuery(() => ({ queryKey: ['user', id], queryFn: () => api<User>(`/api/users/${id}`) }));
	const ledger = createList<Entry>({ key: 'ledger', endpoint: () => `/api/users/${id}/ledger`, pageSize: 20 });

	const tz = (m: number) => `UTC${m >= 0 ? '+' : '−'}${Math.floor(Math.abs(m) / 60)}${Math.abs(m) % 60 ? ':' + String(Math.abs(m) % 60).padStart(2, '0') : ''}`;

	const adjust = createForm(() => ({
		defaultValues: { direction: 'credit' as 'credit' | 'debit', amount: '', note: '' },
		onSubmit: async ({ value, formApi }) => {
			const cents = parseUsdToCents(value.amount)!;
			const signed = value.direction === 'debit' ? -cents : cents;
			const verb = value.direction === 'debit' ? 'Debit' : 'Credit';
			if (!(await confirmAction({ title: `${verb} $${value.amount}?`, body: `Ledger entry “adjustment” with note: ${value.note}`, confirmLabel: verb, danger: value.direction === 'debit' }))) return;
			try {
				const r = await api<{ balanceAfterFmt: string }>(`/api/users/${id}/adjust`, { body: { amount: signed, note: value.note } });
				toast.success(`Balance is now ${r.balanceAfterFmt}`);
				formApi.reset();
				await Promise.all([qc.invalidateQueries({ queryKey: ['user', id] }), qc.invalidateQueries({ queryKey: ['ledger'] }), qc.invalidateQueries({ queryKey: ['users'] })]);
			} catch (e) {
				toast.error((e as Error).message);
			}
		}
	}));

	async function toggleBan(u: User) {
		const banning = !u.isBanned;
		if (!(await confirmAction({ title: banning ? 'Ban this user?' : 'Unban this user?', body: banning ? 'Banned users only get a short “account blocked” message from the bot.' : undefined, confirmLabel: banning ? 'Ban' : 'Unban', danger: banning }))) return;
		try {
			await api(`/api/users/${u.id}/ban`, { body: { banned: banning } });
			toast.success(banning ? 'User banned' : 'User unbanned');
			await qc.invalidateQueries({ queryKey: ['user', id] });
			await qc.invalidateQueries({ queryKey: ['users'] });
		} catch (e) {
			toast.error((e as Error).message);
		}
	}

	const refLink = (e: Entry) => {
		if (e.refType === 'order' && e.refId) return `/orders/${e.refId}`;
		if (e.refType === 'payment' && e.refId) return `/payments/${e.refId}`;
		return null;
	};

	const columns: Columns<Entry> = [
		{ id: 'createdAt', header: 'When', cell: ({ row }) => fmtDate(row.original.createdAt) },
		{ id: 'type', header: 'Type', cell: ({ row }) => renderSnippet(typeCell, row.original) },
		{ id: 'amount', header: 'Amount', cell: ({ row }) => renderSnippet(amountCell, row.original) },
		{ id: 'balanceAfter', header: 'Balance after', cell: ({ row }) => renderSnippet(afterCell, row.original) },
		{ id: 'ref', header: 'Reference', cell: ({ row }) => renderSnippet(refCell, row.original) }
	];
</script>

{#snippet typeCell(e: Entry)}<Badge value={e.type} tone={e.amount >= 0 ? 'ok' : 'muted'} />{/snippet}
{#snippet amountCell(e: Entry)}<span class="tabular whitespace-nowrap {e.amount >= 0 ? 'text-ok' : 'text-danger'}">{e.amount >= 0 ? '+' : ''}{e.fmt.amount}</span>{/snippet}
{#snippet afterCell(e: Entry)}<span class="tabular whitespace-nowrap">{e.fmt.balanceAfter}</span>{/snippet}
{#snippet refCell(e: Entry)}
	{@const link = refLink(e)}
	<div class="max-w-[320px] text-xs">
		{#if link}<a class="link" href={link}>{e.refType} #{e.refId}</a>{:else if e.refType}<span class="text-muted">{e.refType} {e.refId ?? ''}</span>{/if}
		{#if e.note}<div class="truncate text-muted" title={e.note}>{e.note}</div>{/if}
	</div>
{/snippet}

{#if q.isPending}
	<div class="card h-64 animate-pulse"></div>
{:else if q.isError}
	<PageHeader title="User" back={{ href: '/users', label: 'Users' }} />
	<div class="card p-6 text-danger">{q.error.message}</div>
{:else if q.data}
	{@const u = q.data}
	<PageHeader title={u.username ? `@${u.username}` : (u.firstName ?? String(u.id))} subtitle={`Telegram id ${u.id}${u.firstName ? ' · ' + u.firstName : ''}`} back={{ href: '/users', label: 'Users' }}>
		{#snippet actions()}
			{#if u.isBanned}<Badge value="banned" />{/if}
			{#if u.blockedBot}<Badge value="blocked bot" tone="muted" />{/if}
			<a class="btn" href="/orders?userId={u.id}">Orders</a>
			<a class="btn" href="/payments?userId={u.id}">Payments</a>
			<button class="btn {u.isBanned ? '' : 'text-danger'}" onclick={() => toggleBan(u)}>{u.isBanned ? 'Unban' : 'Ban'}</button>
		{/snippet}
	</PageHeader>

	<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
		<div class="card p-4">
			<div class="text-xs text-muted">Balance</div>
			<div class="mt-1 text-xl font-semibold tabular">{u.fmt.balance}</div>
			{#if !u.stats.ledgerConsistent}<div class="mt-1 text-xs text-danger">⚠ ledger sum differs from cached balance</div>{/if}
		</div>
		<div class="card p-4">
			<div class="text-xs text-muted">Spent</div>
			<div class="mt-1 text-xl font-semibold tabular">{u.fmtStats.spent}</div>
			<div class="mt-1 text-xs text-muted">{u.stats.orders} orders{u.stats.refunded ? ` · ${u.stats.refunded} refunded` : ''}</div>
		</div>
		<div class="card p-4">
			<div class="text-xs text-muted">Top-ups</div>
			<div class="mt-1 text-xl font-semibold tabular">{u.fmtStats.topupSum}</div>
			<div class="mt-1 text-xs text-muted">{u.stats.topups} paid</div>
		</div>
		<div class="card p-4">
			<div class="text-xs text-muted">Referral</div>
			<div class="mt-1 text-xl font-semibold tabular">{u.fmtStats.available}</div>
			<div class="mt-1 text-xs text-muted">available · earned {u.fmtStats.earned} · {u.referral.referred} referred</div>
		</div>
	</div>

	<div class="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
		<section class="card p-4">
			<h2 class="mb-3 text-[13px] font-semibold">Profile</h2>
			<dl class="kv">
				<dt>Language</dt>
				<dd>{u.language}</dd>
				<dt>Display currency</dt>
				<dd>{u.currency}</dd>
				<dt>Time zone</dt>
				<dd>{tz(u.tzOffsetMinutes)}</dd>
				<dt>Referral code</dt>
				<dd class="mono">{u.referralCode}</dd>
				<dt>Referred by</dt>
				<dd>{#if u.referrer}<a class="link" href="/users/{u.referrer.id}">{u.referrer.username ? `@${u.referrer.username}` : u.referrer.id}</a>{:else}—{/if}</dd>
				<dt>Notifications</dt>
				<dd class="flex flex-wrap gap-1">
					<Badge value="stock" tone={u.notifyStock ? 'ok' : 'muted'} /><Badge value="info" tone={u.notifyInfo ? 'ok' : 'muted'} /><Badge value="referral" tone={u.notifyReferral ? 'ok' : 'muted'} />
				</dd>
				<dt>Referral payouts</dt>
				<dd>transferred {u.fmtStats.transferred} · withdrawn {u.fmtStats.withdrawn}</dd>
				<dt>Joined</dt>
				<dd>{fmtDate(u.createdAt)}</dd>
				<dt>Last seen</dt>
				<dd>{fmtRelative(u.lastSeenAt)}</dd>
			</dl>
		</section>

		<form
			class="card h-fit space-y-3 p-4"
			onsubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				adjust.handleSubmit();
			}}
		>
			<h2 class="text-[13px] font-semibold">Adjust balance</h2>
			<adjust.Field name="direction">
				{#snippet children(field)}
					<div class="grid grid-cols-2 gap-1 rounded-md border border-line p-0.5" role="radiogroup" aria-label="Direction">
						{#each [['credit', 'Credit (+)'], ['debit', 'Debit (−)']] as [v, label] (v)}
							<button
								type="button"
								role="radio"
								aria-checked={field.state.value === v}
								class="rounded px-2 py-1 text-xs font-medium {field.state.value === v ? (v === 'credit' ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger') : 'text-muted'}"
								onclick={() => field.handleChange(v as 'credit' | 'debit')}>{label}</button
							>
						{/each}
					</div>
				{/snippet}
			</adjust.Field>
			<adjust.Field
				name="amount"
				validators={{
					onChange: ({ value }) => {
						const c = parseUsdToCents(value);
						return c === null ? 'USD amount with up to 2 decimals' : c === 0 ? 'Must be more than 0' : undefined;
					}
				}}
			>
				{#snippet children(field)}
					<label class="block">
						<span class="label">Amount (USD)</span>
						<div class="relative">
							<span class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted">$</span>
							<input class="input pl-6 tabular" inputmode="decimal" placeholder="5.00" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
						</div>
						<FieldError {field} />
					</label>
				{/snippet}
			</adjust.Field>
			<adjust.Field name="note" validators={{ onChange: ({ value }) => (value.trim().length < 3 ? 'Explain the adjustment (min 3 chars)' : undefined) }}>
				{#snippet children(field)}
					<label class="block">
						<span class="label">Note (saved in ledger)</span>
						<input class="input" placeholder="e.g. compensation for ticket #12" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
						<FieldError {field} />
					</label>
				{/snippet}
			</adjust.Field>
			<adjust.Subscribe selector={(s) => ({ canSubmit: s.canSubmit, isSubmitting: s.isSubmitting })}>
				{#snippet children(s)}
					<button class="btn btn-primary w-full" disabled={!s.canSubmit || s.isSubmitting}>{s.isSubmitting ? 'Applying…' : 'Apply adjustment'}</button>
				{/snippet}
			</adjust.Subscribe>
			<p class="text-[11px] text-muted">Debits cannot take the balance below zero.</p>
		</form>
	</div>

	<h2 class="mt-6 mb-2 text-[13px] font-semibold">Balance history</h2>
	<DataTable
		{columns}
		data={ledger.query.data?.items}
		total={ledger.query.data?.total}
		state={ledger.state}
		loading={ledger.query.isPending}
		fetching={ledger.query.isFetching}
		error={ledger.query.error}
		empty="No ledger entries yet."
	/>
{/if}
