import { describe, expect, test } from 'bun:test';
import { toView, WebhookError, TOPUP_TTL_MINUTES } from '../src/service';
import { createMemoryStore } from '../src/store';
import type { PaymentRow } from '../src/store';

const baseRow: PaymentRow = {
	id: 1,
	storeId: 2,
	code: 'PAY-ABC',
	userId: 42,
	purpose: 'topup',
	orderId: null,
	provider: 'tripay',
	method: 'QRIS',
	amount: 500,
	fee: 10,
	payCurrency: 'IDR',
	payAmount: '8150',
	status: 'pending',
	providerRef: 'T123',
	checkoutUrl: 'https://pay.example.com',
	qrString: '0002...',
	expiresAt: new Date('2026-10-03T00:15:00Z'),
	paidAt: null,
	raw: { some: 'data' },
};

describe('toView', () => {
	test('includes the correct fields from a topup row', () => {
		const view = toView(baseRow);
		expect(view).toEqual({
			id: 1,
			code: 'PAY-ABC',
			status: 'pending',
			purpose: 'topup',
			provider: 'tripay',
			method: 'QRIS',
			amount: 500,
			fee: 10,
			payCurrency: 'IDR',
			payAmount: '8150',
			checkoutUrl: 'https://pay.example.com',
			qrString: '0002...',
			expiresAt: new Date('2026-10-03T00:15:00Z'),
			orderId: null,
		});
	});

	test('omits userId, storeId, providerRef, paidAt, raw', () => {
		const view = toView(baseRow) as Record<string, unknown>;
		expect(view.userId).toBeUndefined();
		expect(view.storeId).toBeUndefined();
		expect(view.providerRef).toBeUndefined();
		expect(view.paidAt).toBeUndefined();
		expect(view.raw).toBeUndefined();
	});

	test('works with purpose order and orderId set', () => {
		const orderRow: PaymentRow = { ...baseRow, purpose: 'order', orderId: 77, status: 'paid' };
		const view = toView(orderRow);
		expect(view.purpose).toBe('order');
		expect(view.orderId).toBe(77);
		expect(view.status).toBe('paid');
	});

	test('preserves null checkoutUrl and qrString', () => {
		const row: PaymentRow = { ...baseRow, checkoutUrl: null, qrString: null };
		const view = toView(row);
		expect(view.checkoutUrl).toBeNull();
		expect(view.qrString).toBeNull();
	});

	test('preserves null expiresAt', () => {
		const row: PaymentRow = { ...baseRow, expiresAt: null };
		const view = toView(row);
		expect(view.expiresAt).toBeNull();
	});

	test('has exactly 14 keys', () => {
		const view = toView(baseRow);
		expect(Object.keys(view).length).toBe(14);
	});
});

describe('WebhookError', () => {
	test('stores status and message', () => {
		const err = new WebhookError(401, 'invalid signature');
		expect(err.status).toBe(401);
		expect(err.message).toBe('invalid signature');
	});

	test('is instanceof Error', () => {
		const err = new WebhookError(404, 'not found');
		expect(err).toBeInstanceOf(Error);
	});

	test('name is WebhookError', () => {
		const err = new WebhookError(400, 'bad request');
		expect(err.name).toBe('WebhookError');
	});

	test('status 400', () => {
		const err = new WebhookError(400, 'malformed');
		expect(err.status).toBe(400);
	});

	test('status 404', () => {
		const err = new WebhookError(404, 'unknown provider');
		expect(err.status).toBe(404);
	});
});

describe('TOPUP_TTL_MINUTES', () => {
	test('is 15', () => {
		expect(TOPUP_TTL_MINUTES).toBe(15);
	});
});

const sampleNew = {
	storeId: 1,
	code: 'PAY-ABC',
	userId: 42,
	purpose: 'topup' as const,
	orderId: null,
	provider: 'tripay',
	method: 'QRIS',
	amount: 100,
	fee: 0,
	payCurrency: 'IDR',
	payAmount: '16300',
	providerRef: 'ref-1',
	checkoutUrl: 'https://pay.example.com',
	qrString: 'qr123',
	expiresAt: new Date('2025-01-01'),
	raw: { invoice: {} },
};

describe('createMemoryStore', () => {
	test('insert creates row with auto-incrementing id, status pending, paidAt null', async () => {
		const store = createMemoryStore();
		const row1 = await store.insert(sampleNew);
		expect(row1.id).toBe(1);
		expect(row1.status).toBe('pending');
		expect(row1.paidAt).toBeNull();

		const row2 = await store.insert({ ...sampleNew, code: 'PAY-DEF', providerRef: 'ref-2' });
		expect(row2.id).toBe(2);
		expect(row2.status).toBe('pending');
		expect(row2.paidAt).toBeNull();
	});

	test('getById returns copy of matching row or null', async () => {
		const store = createMemoryStore();
		const inserted = await store.insert(sampleNew);
		const found = await store.getById(inserted.id);
		expect(found).not.toBeNull();
		expect(found!.id).toBe(inserted.id);
		expect(found!.code).toBe('PAY-ABC');
		// should be a copy, not the same reference
		expect(found).not.toBe(inserted);

		const missing = await store.getById(999);
		expect(missing).toBeNull();
	});

	test('findByProviderRef finds match or null', async () => {
		const store = createMemoryStore();
		await store.insert(sampleNew);
		const found = await store.findByProviderRef('tripay', 'ref-1');
		expect(found).not.toBeNull();
		expect(found!.providerRef).toBe('ref-1');

		const wrongProvider = await store.findByProviderRef('xendit', 'ref-1');
		expect(wrongProvider).toBeNull();

		const wrongRef = await store.findByProviderRef('tripay', 'ref-999');
		expect(wrongRef).toBeNull();
	});

	test('findByCode finds match or null', async () => {
		const store = createMemoryStore();
		await store.insert(sampleNew);
		const found = await store.findByCode('PAY-ABC');
		expect(found).not.toBeNull();
		expect(found!.code).toBe('PAY-ABC');

		const missing = await store.findByCode('PAY-MISSING');
		expect(missing).toBeNull();
	});

	test('transitionFromPending: pending to expired works', async () => {
		const store = createMemoryStore();
		await store.insert(sampleNew);
		const updated = await store.transitionFromPending(1, 'expired');
		expect(updated).not.toBeNull();
		expect(updated!.status).toBe('expired');
	});

	test('transitionFromPending: non-pending returns null', async () => {
		const store = createMemoryStore();
		await store.insert(sampleNew);
		// first transition succeeds
		await store.transitionFromPending(1, 'expired');
		// second transition on same (now expired) row returns null
		const result = await store.transitionFromPending(1, 'cancelled');
		expect(result).toBeNull();
	});

	test('transitionFromPending: non-existent id returns null', async () => {
		const store = createMemoryStore();
		const result = await store.transitionFromPending(999, 'expired');
		expect(result).toBeNull();
	});

	test('mergeRaw shallow-merges into raw', async () => {
		const store = createMemoryStore();
		await store.insert(sampleNew);
		await store.mergeRaw(1, { lastWebhook: { foo: 'bar' } });
		const row = await store.getById(1);
		expect(row).not.toBeNull();
		const raw = row!.raw as Record<string, unknown>;
		// original key preserved
		expect(raw.invoice).toEqual({});
		// new key merged in
		expect(raw.lastWebhook).toEqual({ foo: 'bar' });
	});

	test('rows array reflects inserts', async () => {
		const store = createMemoryStore();
		expect(store.rows).toHaveLength(0);
		await store.insert(sampleNew);
		expect(store.rows).toHaveLength(1);
		await store.insert({ ...sampleNew, code: 'PAY-XYZ', providerRef: 'ref-x' });
		expect(store.rows).toHaveLength(2);
	});

	test('mergeRaw with null raw initializes from empty object', async () => {
		const store = createMemoryStore();
		await store.insert({ ...sampleNew, raw: null });
		await store.mergeRaw(1, { key: 'value' });
		const row = await store.getById(1);
		expect((row!.raw as Record<string, unknown>).key).toBe('value');
	});

	test('mergeRaw on nonexistent id is a no-op', async () => {
		const store = createMemoryStore();
		await store.mergeRaw(999, { x: 1 });
		expect(store.rows).toHaveLength(0);
	});

	test('insert returns a copy — mutating it does not affect the store', async () => {
		const store = createMemoryStore();
		const returned = await store.insert(sampleNew);
		returned.status = 'expired' as any;
		const fromStore = await store.getById(returned.id);
		expect(fromStore!.status).toBe('pending');
	});

	test('transitionFromPending returns a copy — mutating does not affect store', async () => {
		const store = createMemoryStore();
		await store.insert(sampleNew);
		const updated = await store.transitionFromPending(1, 'expired');
		updated!.status = 'cancelled' as any;
		const fromStore = await store.getById(1);
		expect(fromStore!.status).toBe('expired');
	});
});
