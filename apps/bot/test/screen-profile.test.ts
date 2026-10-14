import { describe, expect, test } from 'bun:test';
import type { UserProfile } from '@tokobun/core';
import { cb, decode } from '../src/callback';
import { callbacks } from '../src/handlers/router';
import type { Button, Keyboard } from '../src/keyboards';
import { mainMenuScreen } from '../src/screens/main';
import {
	ordersScreen,
	orderDetailScreen,
	ledgerScreen,
} from '../src/screens/orders';
import {
	profileScreen,
	notifyScreen,
	languageScreen,
	currencyScreen,
	timezoneScreen,
} from '../src/screens/profile';
import { createView } from '../src/util/view';

const v = createView({ lang: 'id', currency: 'IDR', tzOffset: 420, money: (c) => `Rp${c}` });
const ve = createView({ lang: 'en', currency: 'USD', tzOffset: 0, money: (c) => `$${(c / 100).toFixed(2)}` });

const labels = (kb: Keyboard) => kb.map((row) => row.map((b) => b.text));
const flat = (kb: Keyboard) => kb.flat();
const cbData = (b: Button) => ('callback_data' in b ? b.callback_data : undefined);

function assertRoutable(screen: { keyboard: Keyboard }) {
	for (const b of flat(screen.keyboard)) {
		const d = cbData(b);
		if (d === undefined) continue;
		expect(new TextEncoder().encode(d).length).toBeLessThanOrEqual(64);
		expect(callbacks[decode(d).action]).toBeDefined();
	}
}

const mockUser: UserProfile = {
	id: 12345,
	username: 'testuser',
	firstName: 'Test',
	language: 'id',
	currency: 'IDR',
	tzOffsetMinutes: 420,
	balance: 50000,
	referralCode: 'ABC123',
	notifyStock: true,
	notifyInfo: false,
	notifyReferral: true,
	isBanned: false,
	createdAt: new Date('2024-01-15T12:00:00Z'),
};

// ---- mainMenuScreen ----

describe('mainMenuScreen', () => {
	test('renders with balance and all buttons', () => {
		const s = mainMenuScreen(v, { balance: 50000, channelUrl: null });
		expect(s.text).toContain('Rp50000');
		assertRoutable(s);
		const allBtns = flat(s.keyboard);
		expect(allBtns.some((b) => cbData(b) === cb.shop(1, 'all'))).toBe(true);
		expect(allBtns.some((b) => cbData(b) === cb.topup())).toBe(true);
		expect(allBtns.some((b) => cbData(b) === cb.profile())).toBe(true);
		expect(allBtns.some((b) => cbData(b) === cb.help())).toBe(true);
		expect(allBtns.some((b) => cbData(b) === cb.more())).toBe(true);
		expect(allBtns.some((b) => cbData(b) === cb.referral())).toBe(true);
	});

	test('includes channel URL button when provided', () => {
		const s = mainMenuScreen(v, { balance: 0, channelUrl: 'https://t.me/mychannel' });
		const allBtns = flat(s.keyboard);
		const urlBtnFound = allBtns.find((b) => 'url' in b && b.url === 'https://t.me/mychannel');
		expect(urlBtnFound).toBeDefined();
	});

	test('no channel URL button when null', () => {
		const s = mainMenuScreen(v, { balance: 0, channelUrl: null });
		const allBtns = flat(s.keyboard);
		const urlBtnFound = allBtns.find((b) => 'url' in b);
		expect(urlBtnFound).toBeUndefined();
	});

	test('zero balance renders', () => {
		const s = mainMenuScreen(ve, { balance: 0, channelUrl: null });
		expect(s.text).toContain('$0.00');
		assertRoutable(s);
	});
});

// ---- profileScreen ----

describe('profileScreen', () => {
	test('contains user info', () => {
		const s = profileScreen(v, { user: mockUser });
		expect(s.text).toContain('12345');
		assertRoutable(s);
	});

	test('keyboard has profile sub-buttons', () => {
		const s = profileScreen(v, { user: mockUser });
		const allBtns = flat(s.keyboard);
		expect(allBtns.some((b) => cbData(b) === cb.notify())).toBe(true);
		expect(allBtns.some((b) => cbData(b) === cb.orders())).toBe(true);
		expect(allBtns.some((b) => cbData(b) === cb.ledger())).toBe(true);
		expect(allBtns.some((b) => cbData(b) === cb.api())).toBe(true);
		expect(allBtns.some((b) => cbData(b) === cb.language())).toBe(true);
		expect(allBtns.some((b) => cbData(b) === cb.currency())).toBe(true);
		expect(allBtns.some((b) => cbData(b) === cb.timezone())).toBe(true);
		expect(allBtns.some((b) => cbData(b) === cb.main())).toBe(true);
	});

	test('balance is formatted', () => {
		const s = profileScreen(v, { user: mockUser });
		expect(s.text).toContain('Rp50000');
	});
});

// ---- notifyScreen ----

describe('notifyScreen', () => {
	test('all toggle buttons present and routable', () => {
		const s = notifyScreen(v, { user: mockUser });
		assertRoutable(s);
		const allBtns = flat(s.keyboard);
		expect(allBtns.some((b) => cbData(b) === cb.notifyToggle('stock'))).toBe(true);
		expect(allBtns.some((b) => cbData(b) === cb.notifyToggle('info'))).toBe(true);
		expect(allBtns.some((b) => cbData(b) === cb.notifyToggle('referral'))).toBe(true);
		expect(allBtns.some((b) => cbData(b) === cb.profile())).toBe(true);
	});

	test('all-off user', () => {
		const off = { ...mockUser, notifyStock: false, notifyInfo: false, notifyReferral: false };
		const s = notifyScreen(v, { user: off });
		assertRoutable(s);
	});
});

// ---- languageScreen ----

describe('languageScreen', () => {
	test('marks current language with checkmark', () => {
		const s = languageScreen(v, { current: 'id', languages: ['en', 'id'] });
		const allBtns = flat(s.keyboard);
		const idBtn = allBtns.find((b) => cbData(b) === cb.languageSet('id'));
		expect(idBtn?.text).toContain('✅');
		const enBtn = allBtns.find((b) => cbData(b) === cb.languageSet('en'));
		expect(enBtn?.text).not.toContain('✅');
		assertRoutable(s);
	});

	test('single language option', () => {
		const s = languageScreen(v, { current: 'en', languages: ['en'] });
		assertRoutable(s);
	});

	test('has back button', () => {
		const s = languageScreen(v, { current: 'en', languages: ['en', 'id'] });
		const lastRow = s.keyboard.at(-1)!;
		expect(lastRow.some((b) => cbData(b) === cb.profile())).toBe(true);
	});
});

// ---- currencyScreen ----

describe('currencyScreen', () => {
	test('marks current currency', () => {
		const s = currencyScreen(v, { current: 'IDR', currencies: ['USD', 'IDR', 'MYR'] });
		const allBtns = flat(s.keyboard);
		const idrBtn = allBtns.find((b) => cbData(b) === cb.currencySet('IDR'));
		expect(idrBtn?.text).toContain('✅');
		const usdBtn = allBtns.find((b) => cbData(b) === cb.currencySet('USD'));
		expect(usdBtn?.text).not.toContain('✅');
		assertRoutable(s);
	});

	test('has back button', () => {
		const s = currencyScreen(v, { current: 'USD', currencies: ['USD'] });
		expect(s.keyboard.at(-1)!.some((b) => cbData(b) === cb.profile())).toBe(true);
	});
});

// ---- timezoneScreen ----

describe('timezoneScreen', () => {
	test('marks current timezone', () => {
		const s = timezoneScreen(v, { current: 420 });
		const allBtns = flat(s.keyboard);
		const currentBtn = allBtns.find((b) => cbData(b) === cb.timezoneSet(420));
		expect(currentBtn?.text).toContain('✅');
		assertRoutable(s);
	});

	test('non-matching tz has no checkmark', () => {
		const s = timezoneScreen(v, { current: 420 });
		const allBtns = flat(s.keyboard);
		const otherBtn = allBtns.find((b) => cbData(b) === cb.timezoneSet(0));
		expect(otherBtn?.text).not.toContain('✅');
	});

	test('has back button', () => {
		const s = timezoneScreen(v, { current: 0 });
		expect(s.keyboard.at(-1)!.some((b) => cbData(b) === cb.profile())).toBe(true);
	});
});

// ---- ordersScreen ----

describe('ordersScreen', () => {
	test('empty orders shows empty text and back', () => {
		const s = ordersScreen(v, { orders: { items: [], page: 1, totalPages: 0, total: 0 } });
		expect(s.keyboard.length).toBeGreaterThanOrEqual(1);
		const allBtns = flat(s.keyboard);
		expect(allBtns.some((b) => cbData(b) === cb.profile())).toBe(true);
		assertRoutable(s);
	});

	test('renders order items', () => {
		const s = ordersScreen(v, {
			orders: {
				items: [
					{ id: 1, storeId: 1, code: 'ORD001', productId: 10, productName: 'VPN 30d', quantity: 1, status: 'completed', total: 10000, createdAt: new Date() },
					{ id: 2, storeId: 1, code: 'ORD002', productId: 11, productName: 'Game Key', quantity: 2, status: 'pending_payment', total: 25000, createdAt: new Date() },
				],
				page: 1,
				totalPages: 1,
				total: 2,
			},
		});
		assertRoutable(s);
		const allBtns = flat(s.keyboard);
		expect(allBtns.some((b) => cbData(b) === cb.order(1, 1))).toBe(true);
		expect(allBtns.some((b) => cbData(b) === cb.order(2, 1))).toBe(true);
	});

	test('multi-page shows pager', () => {
		const items = [{ id: 1, storeId: 1, code: 'X', productId: 1, productName: 'Y', quantity: 1, status: 'completed' as const, total: 100, createdAt: new Date() }];
		const s = ordersScreen(v, { orders: { items, page: 1, totalPages: 3, total: 30 } });
		assertRoutable(s);
		const allBtns = flat(s.keyboard);
		expect(allBtns.some((b) => cbData(b) === cb.orders(2))).toBe(true);
	});
});

// ---- orderDetailScreen ----

describe('orderDetailScreen', () => {
	const baseOrder = {
		id: 10,
		storeId: 1,
		code: 'ORD010',
		productId: 5,
		productName: 'VPN Key',
		quantity: 1,
		unitPrice: 5000,
		subtotal: 5000,
		discountAmount: 0,
		voucherDiscount: 0,
		total: 5000,
		paidWith: 'balance' as const,
		status: 'completed' as const,
		items: ['KEY-ABC'],
		warranty: null,
		createdAt: new Date('2024-06-01'),
		completedAt: new Date('2024-06-01'),
	};

	test('completed order has resend button', () => {
		const s = orderDetailScreen(v, { order: baseOrder, fromPage: 1 });
		assertRoutable(s);
		const allBtns = flat(s.keyboard);
		expect(allBtns.some((b) => cbData(b) === cb.orderResend(10))).toBe(true);
	});

	test('pending order has no resend button', () => {
		const pending = { ...baseOrder, status: 'pending_payment' as const, items: [], completedAt: null };
		const s = orderDetailScreen(v, { order: pending, fromPage: 1 });
		assertRoutable(s);
		const allBtns = flat(s.keyboard);
		expect(allBtns.some((b) => cbData(b) === cb.orderResend(10))).toBe(false);
	});

	test('back goes to correct page', () => {
		const s = orderDetailScreen(v, { order: baseOrder, fromPage: 3 });
		const allBtns = flat(s.keyboard);
		expect(allBtns.some((b) => cbData(b) === cb.orders(3))).toBe(true);
	});

	test('completed with no items has no resend', () => {
		const noItems = { ...baseOrder, items: [] };
		const s = orderDetailScreen(v, { order: noItems, fromPage: 1 });
		const allBtns = flat(s.keyboard);
		expect(allBtns.some((b) => cbData(b) === cb.orderResend(10))).toBe(false);
	});

	test('shows discount and voucher when present', () => {
		const withDiscount = { ...baseOrder, discountAmount: 1000, voucherDiscount: 500, total: 3500 };
		const s = orderDetailScreen(v, { order: withDiscount, fromPage: 1 });
		expect(s.text).toContain('Rp1000');
		expect(s.text).toContain('Rp500');
	});
});

// ---- ledgerScreen ----

describe('ledgerScreen', () => {
	test('empty ledger', () => {
		const s = ledgerScreen(v, { ledger: { items: [], page: 1, totalPages: 0, total: 0 } });
		assertRoutable(s);
		expect(flat(s.keyboard).some((b) => cbData(b) === cb.profile())).toBe(true);
	});

	test('renders ledger entries', () => {
		const items = [
			{ id: 1, type: 'topup' as const, amount: 10000, balanceAfter: 10000, refType: null, refId: null, note: null, createdAt: new Date() },
			{ id: 2, type: 'purchase' as const, amount: -5000, balanceAfter: 5000, refType: null, refId: null, note: null, createdAt: new Date() },
		];
		const s = ledgerScreen(v, { ledger: { items, page: 1, totalPages: 1, total: 2 } });
		assertRoutable(s);
		expect(s.text).toContain('Rp10000');
	});

	test('multi-page ledger', () => {
		const items = [{ id: 1, type: 'topup' as const, amount: 100, balanceAfter: 100, refType: null, refId: null, note: null, createdAt: new Date() }];
		const s = ledgerScreen(v, { ledger: { items, page: 2, totalPages: 4, total: 40 } });
		assertRoutable(s);
		const allBtns = flat(s.keyboard);
		expect(allBtns.some((b) => cbData(b) === cb.ledger(1))).toBe(true);
		expect(allBtns.some((b) => cbData(b) === cb.ledger(3))).toBe(true);
	});
});
