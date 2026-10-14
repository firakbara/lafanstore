<script lang="ts">
	import { createForm } from '@tanstack/svelte-form';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { api } from '#lib/api.ts';
	import FieldError from '#lib/components/FieldError.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { fmtDate } from '#lib/format.ts';
	import { toast } from '#lib/ui.svelte.ts';

	const qc = useQueryClient();
	const q = createQuery(() => ({
		queryKey: ['admins'],
		queryFn: () => api<{ items: { id: number; username: string; createdAt: string }[]; me: { id: number; username: string } }>('/api/admins')
	}));

	const pwRule = ({ value }: { value: string }) => (value.length < 8 ? 'At least 8 characters' : undefined);

	const addForm = createForm(() => ({
		defaultValues: { username: '', password: '', confirm: '' },
		onSubmit: async ({ value, formApi }) => {
			try {
				await api('/api/admins', { body: { username: value.username.trim(), password: value.password } });
				toast.success(`Admin “${value.username}” added`);
				formApi.reset();
				await qc.invalidateQueries({ queryKey: ['admins'] });
			} catch (e) {
				toast.error((e as Error).message);
			}
		}
	}));

	const pwForm = createForm(() => ({
		defaultValues: { current: '', next: '', confirm: '' },
		onSubmit: async ({ value, formApi }) => {
			try {
				await api('/api/admins/password', { body: { current: value.current, next: value.next } });
				toast.success('Password changed — other sessions were signed out');
				formApi.reset();
			} catch (e) {
				toast.error((e as Error).message);
			}
		}
	}));
</script>

<PageHeader title="Admins" subtitle="Panel accounts. New admins are added as managers of the current store." />

<div class="grid gap-4 lg:grid-cols-[1fr_360px]">
	<section class="card h-fit">
		<div class="border-b border-line px-4 py-3 text-[13px] font-semibold">Accounts</div>
		{#if q.isPending}
			<div class="h-24 animate-pulse"></div>
		{:else if q.isError}
			<p class="p-4 text-danger">{q.error.message}</p>
		{:else if q.data}
			<ul class="divide-y divide-line text-[13px]">
				{#each q.data.items as a (a.id)}
					<li class="flex items-center justify-between px-4 py-2.5">
						<span class="font-medium">{a.username} {#if a.id === q.data.me.id}<span class="ml-1 text-xs text-accent">(you)</span>{/if}</span>
						<span class="text-xs text-muted">added {fmtDate(a.createdAt, false)}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<div class="space-y-4">
		<form
			class="card space-y-3 p-4"
			onsubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				addForm.handleSubmit();
			}}
		>
			<h2 class="text-[13px] font-semibold">Add admin</h2>
			<addForm.Field name="username" validators={{ onChange: ({ value }) => (!/^[a-zA-Z0-9_.-]{3,32}$/.test(value.trim()) ? '3–32 chars: letters, digits, _ . -' : undefined) }}>
				{#snippet children(field)}
					<label class="block">
						<span class="label">Username</span>
						<input class="input" autocomplete="off" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
						<FieldError {field} />
					</label>
				{/snippet}
			</addForm.Field>
			<addForm.Field name="password" validators={{ onChange: pwRule }}>
				{#snippet children(field)}
					<label class="block">
						<span class="label">Password</span>
						<input class="input" type="password" autocomplete="new-password" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
						<FieldError {field} />
					</label>
				{/snippet}
			</addForm.Field>
			<addForm.Field
				name="confirm"
				validators={{ onChangeListenTo: ['password'], onChange: ({ value, fieldApi }) => (value !== fieldApi.form.getFieldValue('password') ? 'Passwords do not match' : undefined) }}
			>
				{#snippet children(field)}
					<label class="block">
						<span class="label">Confirm password</span>
						<input class="input" type="password" autocomplete="new-password" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
						<FieldError {field} />
					</label>
				{/snippet}
			</addForm.Field>
			<addForm.Subscribe selector={(s) => ({ canSubmit: s.canSubmit, isSubmitting: s.isSubmitting })}>
				{#snippet children(s)}<button class="btn btn-primary w-full" disabled={!s.canSubmit || s.isSubmitting}>Add admin</button>{/snippet}
			</addForm.Subscribe>
		</form>

		<form
			class="card space-y-3 p-4"
			onsubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				pwForm.handleSubmit();
			}}
		>
			<h2 class="text-[13px] font-semibold">Change your password</h2>
			<pwForm.Field name="current" validators={{ onChange: ({ value }) => (!value ? 'Required' : undefined) }}>
				{#snippet children(field)}
					<label class="block">
						<span class="label">Current password</span>
						<input class="input" type="password" autocomplete="current-password" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
						<FieldError {field} />
					</label>
				{/snippet}
			</pwForm.Field>
			<pwForm.Field name="next" validators={{ onChange: pwRule }}>
				{#snippet children(field)}
					<label class="block">
						<span class="label">New password</span>
						<input class="input" type="password" autocomplete="new-password" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
						<FieldError {field} />
					</label>
				{/snippet}
			</pwForm.Field>
			<pwForm.Field
				name="confirm"
				validators={{ onChangeListenTo: ['next'], onChange: ({ value, fieldApi }) => (value !== fieldApi.form.getFieldValue('next') ? 'Passwords do not match' : undefined) }}
			>
				{#snippet children(field)}
					<label class="block">
						<span class="label">Confirm new password</span>
						<input class="input" type="password" autocomplete="new-password" value={field.state.value} onblur={field.handleBlur} oninput={(e) => field.handleChange(e.currentTarget.value)} />
						<FieldError {field} />
					</label>
				{/snippet}
			</pwForm.Field>
			<pwForm.Subscribe selector={(s) => ({ canSubmit: s.canSubmit, isSubmitting: s.isSubmitting })}>
				{#snippet children(s)}<button class="btn w-full" disabled={!s.canSubmit || s.isSubmitting}>Change password</button>{/snippet}
			</pwForm.Subscribe>
		</form>
	</div>
</div>
