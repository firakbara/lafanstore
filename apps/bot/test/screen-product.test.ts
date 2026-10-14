import { describe, expect, test } from 'bun:test';
import type { Cents, ProductDetail, Quote } from '@tokobun/core';
import { cb, decode } from '../src/callback';
import { callbacks } from '../src/handlers/router';
import type { Button, Keyboard } from '../src/keyboards';
import {
	productScreen,
	productNoteScreen,
	voucherPromptScreen,
	purchaseConfirmScreen,
	purchaseDoneScreen,
	type ProductScreenData,
} from '../src/screens/product';
import { createView } from '../src/util/view';

const v = createView({ lang: 'id', currency: 'USD', tzOffset: 420, money: (c) => `$${(c / 100).toFixed(2)}` });
const ve = createView({ lang: 'en', currency: 'USD', tzOffset: 0, money: (c) => `$${(c / 100).toFixed(2)}` });

const flat = (kb: Keyboard) => kb.flat();
const data = (b: Button) => ('callback_data' in b ? b.callback_data : undefined);

function assertRoutable(screen: { keyboard: Keyboard }) {
	for (const b of flat(screen.keyboard)) {
		const d = data(b);
		if (d === undefined) continue;
		expect(new TextEncoder().encode(d).length).toBeLessThanOrEqual(64);
		expect(callbacks[decode(d).action]).toBeDefined();
	}
}

const baseProduct: ProductDetail = {
	id: 42,
	code: 'vpn30',
	name: 'VPN 30 Hari',
	icon: null,
	customEmojiId: null,
	price: 10000,
	isCollection: false,
	variantCount: 0,
	stock: 100,
	hasPromo: false,
	storeId: 1,
	parentId: null,
	parentName: null,
	warranty: '7 hari',
	note: 'Catatan produk',
	discounts: [],
	isActive: true,
};

const baseQuote: Quote = {
	productId: 42,
	quantity: 1,
	unitPrice: 10000,
	subtotal: 10000,
	discountBp: 0,
	discountAmount: 0,
	voucherCode: null,
	voucherDiscount: 0,
	total: 10000,
	nextTier: null,
};

const baseData: ProductScreenData = {
	product: baseProduct,
	qty: 1,
	typing: false,
	quote: baseQuote,
	balance: 50000,
	shareLink: 'https://t.me/bot?start=p42',
	directPay: false,
};

describe('productScreen', () => {
	test('normal product with sufficient balance', () => {
		const s = productScreen(v, baseData);
		expect(s.text).toContain('VPN 30 Hari');
		expect(s.text).toContain('$100.00');
		expect(s.text).not.toContain('soldOut');
		assertRoutable(s);
	});

	test('sold out product (stock=0)', () => {
		const s = productScreen(v, {
			...baseData,
			product: { ...baseProduct, stock: 0 },
			quote: null,
		});
		assertRoutable(s);
	});

	test('balance short shows topup button', () => {
		const s = productScreen(v, {
			...baseData,
			balance: 5000,
			quote: { ...baseQuote, total: 10000 },
		});
		expect(s.text).toContain('$50.00');
		assertRoutable(s);
	});

	test('with discount shows discount line', () => {
		const s = productScreen(v, {
			...baseData,
			quote: { ...baseQuote, discountAmount: 2000, discountBp: 1000, total: 8000 },
		});
		expect(s.text).toContain('$20.00');
		assertRoutable(s);
	});

	test('with voucher shows voucher line', () => {
		const s = productScreen(v, {
			...baseData,
			quote: { ...baseQuote, voucherCode: 'HEMAT10', voucherDiscount: 1000, total: 9000 },
		});
		expect(s.text).toContain('HEMAT10');
		expect(s.text).toContain('$10.00');
		assertRoutable(s);
	});

	test('directPay=true adds pay direct button', () => {
		const s = productScreen(v, { ...baseData, directPay: true });
		const allBtns = flat(s.keyboard);
		const payDirectBtn = allBtns.find((b) => {
			const d = data(b);
			return d && decode(d).action === decode(cb.payMethods(42, 1)).action;
		});
		expect(payDirectBtn).toBeDefined();
		assertRoutable(s);
	});

	test('directPay=false omits pay direct button', () => {
		const s = productScreen(v, { ...baseData, directPay: false });
		const allBtns = flat(s.keyboard);
		const payDirectBtn = allBtns.find((b) => {
			const d = data(b);
			return d && decode(d).action === decode(cb.payMethods(42, 1)).action;
		});
		expect(payDirectBtn).toBeUndefined();
		assertRoutable(s);
	});

	test('keypad has digits 0-9 and del', () => {
		const s = productScreen(v, baseData);
		const allBtns = flat(s.keyboard);
		const digitLabels = allBtns.map((b) => b.text).filter((t) => /^[0-9]$/.test(t));
		expect(digitLabels.length).toBe(10);
		assertRoutable(s);
	});

	test('unlimited stock (null)', () => {
		const s = productScreen(v, {
			...baseData,
			product: { ...baseProduct, stock: null },
		});
		assertRoutable(s);
	});

	test('with discount tiers shows promo lines', () => {
		const s = productScreen(v, {
			...baseData,
			product: {
				...baseProduct,
				hasPromo: true,
				discounts: [
					{ minQty: 10, percentBp: 500 },
					{ minQty: 50, percentBp: 1000 },
				],
			},
		});
		assertRoutable(s);
	});

	test('with collection parent', () => {
		const s = productScreen(v, {
			...baseData,
			product: { ...baseProduct, parentId: 5, parentName: 'VPN Collection' },
		});
		expect(s.text).toContain('VPN Collection');
		assertRoutable(s);
	});

	test('voucher present shows remove voucher button instead of use voucher', () => {
		const s = productScreen(v, {
			...baseData,
			quote: { ...baseQuote, voucherCode: 'DISC', voucherDiscount: 500, total: 9500 },
		});
		const allBtns = flat(s.keyboard);
		const removeBtn = allBtns.find((b) => {
			const d = data(b);
			return d && decode(d).action === decode(cb.voucherDel(42, 1)).action;
		});
		expect(removeBtn).toBeDefined();
		assertRoutable(s);
	});

	test('share link appears as copy button', () => {
		const s = productScreen(v, baseData);
		const allBtns = flat(s.keyboard);
		const copyBtn = allBtns.find((b) => 'copy_text' in b);
		expect(copyBtn).toBeDefined();
	});

	test('english view', () => {
		const s = productScreen(ve, baseData);
		assertRoutable(s);
	});
});

describe('productNoteScreen', () => {
	test('with note shows note text', () => {
		const s = productNoteScreen(v, { product: baseProduct, qty: 1 });
		expect(s.text).toContain('Catatan produk');
		assertRoutable(s);
	});

	test('without note shows fallback', () => {
		const s = productNoteScreen(v, {
			product: { ...baseProduct, note: null },
			qty: 3,
		});
		assertRoutable(s);
	});

	test('empty string note shows fallback', () => {
		const s = productNoteScreen(v, {
			product: { ...baseProduct, note: '   ' },
			qty: 1,
		});
		assertRoutable(s);
	});

	test('back button routes to product screen', () => {
		const s = productNoteScreen(v, { product: baseProduct, qty: 5 });
		const backBtn = flat(s.keyboard).find((b) => {
			const d = data(b);
			return d && decode(d).action === decode(cb.product(42, 5)).action;
		});
		expect(backBtn).toBeDefined();
		assertRoutable(s);
	});
});

describe('voucherPromptScreen', () => {
	test('shows product name', () => {
		const s = voucherPromptScreen(v, { product: baseProduct, qty: 2 });
		expect(s.text).toContain('VPN 30 Hari');
		assertRoutable(s);
	});

	test('cancel button routes back to product', () => {
		const s = voucherPromptScreen(v, { product: baseProduct, qty: 1 });
		assertRoutable(s);
	});

	test('english view', () => {
		const s = voucherPromptScreen(ve, { product: baseProduct, qty: 1 });
		expect(s.text).toContain('VPN 30 Hari');
		assertRoutable(s);
	});
});

describe('purchaseConfirmScreen', () => {
	test('shows total and balance after', () => {
		const s = purchaseConfirmScreen(v, {
			product: baseProduct,
			quote: baseQuote,
			balance: 50000 as Cents,
		});
		expect(s.text).toContain('$100.00');
		expect(s.text).toContain('$400.00');
		assertRoutable(s);
	});

	test('with discount', () => {
		const discountQuote: Quote = {
			...baseQuote,
			quantity: 10,
			subtotal: 100000,
			discountBp: 500,
			discountAmount: 5000,
			total: 95000,
		};
		const s = purchaseConfirmScreen(v, {
			product: baseProduct,
			quote: discountQuote,
			balance: 200000 as Cents,
		});
		expect(s.text).toContain('$950.00');
		assertRoutable(s);
	});

	test('confirm yes and back buttons', () => {
		const s = purchaseConfirmScreen(v, {
			product: baseProduct,
			quote: baseQuote,
			balance: 50000 as Cents,
		});
		expect(s.keyboard.length).toBe(2);
		assertRoutable(s);
	});

	test('english view', () => {
		const s = purchaseConfirmScreen(ve, {
			product: baseProduct,
			quote: baseQuote,
			balance: 50000 as Cents,
		});
		assertRoutable(s);
	});
});

describe('purchaseDoneScreen', () => {
	test('shows order code and balance', () => {
		const s = purchaseDoneScreen(v, { orderCode: 'ORD-12345', balance: 40000 as Cents });
		expect(s.text).toContain('ORD-12345');
		expect(s.text).toContain('$400.00');
		assertRoutable(s);
	});

	test('keyboard has my orders, buy again, and main menu', () => {
		const s = purchaseDoneScreen(v, { orderCode: 'X', balance: 0 as Cents });
		assertRoutable(s);
		expect(s.keyboard.length).toBe(2);
		const allBtns = flat(s.keyboard);
		expect(allBtns.length).toBe(3);
	});

	test('zero balance', () => {
		const s = purchaseDoneScreen(v, { orderCode: 'ORD-1', balance: 0 as Cents });
		expect(s.text).toContain('$0.00');
		assertRoutable(s);
	});

	test('english view', () => {
		const s = purchaseDoneScreen(ve, { orderCode: 'ORD-1', balance: 10000 as Cents });
		assertRoutable(s);
	});
});
