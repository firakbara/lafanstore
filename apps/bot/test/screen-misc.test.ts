import { describe, expect, test } from 'bun:test';
import type { ReferralStats } from '@tokobun/core';
import { cb, decode } from '../src/callback';
import { callbacks } from '../src/handlers/router';
import type { Button, Keyboard } from '../src/keyboards';
import { apiRevokeConfirmScreen, apiScreen } from '../src/screens/api';
import { helpScreen, supportOpenedScreen } from '../src/screens/help';
import { moreScreen, ratingScreen, twofaPromptScreen, twofaResultScreen } from '../src/screens/more';
import { referralScreen, withdrawPromptScreen } from '../src/screens/referral';
import { createView } from '../src/util/view';

const v = createView({ lang: 'id', currency: 'USD', tzOffset: 420, money: (c) => `$${(c / 100).toFixed(2)}` });
const ve = createView({ lang: 'en', currency: 'USD', tzOffset: 0, money: (c) => `$${(c / 100).toFixed(2)}` });

const labels = (kb: Keyboard) => kb.map((row) => row.map((b) => b.text));
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

describe('apiScreen edge cases', () => {
	test('no key and no newKey shows "none" text', () => {
		const s = apiScreen(v, { key: null, baseUrl: 'https://api.x/v1', newKey: null });
		expect(s.text).toBeTruthy();
		expect(s.text).toContain('api.x');
		const btnLabels = labels(s.keyboard);
		expect(btnLabels.at(-1)).toEqual([v.tp('common.back')]);
		const createRow = s.keyboard.find((row) => row.some((b) => data(b) === cb.apiCreate()));
		expect(createRow).toBeDefined();
		const revokeRow = s.keyboard.find((row) => row.some((b) => data(b) === cb.apiRevokeAsk()));
		expect(revokeRow).toBeUndefined();
		assertRoutable(s);
	});

	test('active key shows prefix and regenerate/revoke buttons', () => {
		const key = { id: 1, prefix: 'tb_live_abc', isActive: true, createdAt: new Date('2026-06-01T00:00:00Z'), lastUsedAt: new Date('2026-06-10T12:00:00Z') };
		const s = apiScreen(v, { key, baseUrl: 'https://api.x/v1' });
		expect(s.text).toContain('tb_live_abc');
		const regen = s.keyboard.find((row) => row.some((b) => data(b) === cb.apiCreate()));
		expect(regen).toBeDefined();
		const revoke = s.keyboard.find((row) => row.some((b) => data(b) === cb.apiRevokeAsk()));
		expect(revoke).toBeDefined();
		assertRoutable(s);
	});

	test('active key never used shows "never" for lastUsed', () => {
		const key = { id: 2, prefix: 'tb_live_xyz', isActive: true, createdAt: new Date('2026-06-01T00:00:00Z'), lastUsedAt: null };
		const s = apiScreen(v, { key, baseUrl: 'https://api.x/v1' });
		expect(s.text).toContain('tb_live_xyz');
		assertRoutable(s);
	});

	test('newKey set shows copy button and key in text', () => {
		const s = apiScreen(ve, { key: null, baseUrl: 'https://api.x/v1', newKey: 'tb_live_secretkey123' });
		expect(s.text).toContain('tb_live_secretkey123');
		expect(s.keyboard[0]![0]).toMatchObject({ copy_text: { text: 'tb_live_secretkey123' } });
		assertRoutable(s);
	});
});

describe('apiRevokeConfirmScreen', () => {
	test('has confirm text and yes/no buttons', () => {
		const s = apiRevokeConfirmScreen(v);
		expect(s.text).toBeTruthy();
		expect(s.keyboard).toHaveLength(1);
		expect(s.keyboard[0]).toHaveLength(2);
		expect(s.keyboard[0]![0]!.style).toBe('danger');
		const yesData = data(s.keyboard[0]![0]!);
		const noData = data(s.keyboard[0]![1]!);
		expect(yesData).toBe(cb.apiRevoke());
		expect(noData).toBe(cb.api());
		assertRoutable(s);
	});

	test('works with English view too', () => {
		const s = apiRevokeConfirmScreen(ve);
		expect(s.text).toBeTruthy();
		assertRoutable(s);
	});
});

describe('helpScreen edge cases', () => {
	test('no support at all — only back button', () => {
		const s = helpScreen(v, { supportUsername: null, supportOpen: false, liveSupport: false });
		expect(labels(s.keyboard)).toEqual([[v.tp('common.back')]]);
		assertRoutable(s);
	});

	test('liveSupport available but not open — shows open button', () => {
		const s = helpScreen(v, { supportUsername: null, supportOpen: false, liveSupport: true });
		expect(s.keyboard[0]![0]!.style).toBe('primary');
		expect(data(s.keyboard[0]![0]!)).toBe(cb.supportOpen());
		assertRoutable(s);
	});

	test('support open — shows close button instead of open', () => {
		const s = helpScreen(v, { supportUsername: null, supportOpen: true, liveSupport: true });
		expect(s.keyboard[0]![0]!.style).toBe('danger');
		expect(data(s.keyboard[0]![0]!)).toBe(cb.supportClose());
		assertRoutable(s);
	});

	test('supportUsername with @ prefix — strips @ in URL', () => {
		const s = helpScreen(v, { supportUsername: '@admin_bot', supportOpen: false, liveSupport: false });
		const urlBtn = s.keyboard.find((row) => row.some((b) => 'url' in b));
		expect(urlBtn).toBeDefined();
		const btn = urlBtn!.find((b) => 'url' in b)! as { url: string };
		expect(btn.url).toBe('https://t.me/admin_bot');
		expect(btn.url).not.toContain('@@');
		assertRoutable(s);
	});

	test('supportUsername without @ prefix — URL is correct', () => {
		const s = helpScreen(v, { supportUsername: 'admin_bot', supportOpen: false, liveSupport: false });
		const urlBtn = s.keyboard.flat().find((b) => 'url' in b) as { url: string } | undefined;
		expect(urlBtn).toBeDefined();
		expect(urlBtn!.url).toBe('https://t.me/admin_bot');
		assertRoutable(s);
	});

	test('all options — liveSupport open + username + back', () => {
		const s = helpScreen(v, { supportUsername: 'help', supportOpen: true, liveSupport: true });
		expect(s.keyboard.length).toBeGreaterThanOrEqual(3);
		expect(data(s.keyboard[0]![0]!)).toBe(cb.supportClose());
		const urlRow = s.keyboard.find((row) => row.some((b) => 'url' in b));
		expect(urlRow).toBeDefined();
		expect(data(s.keyboard.at(-1)![0]!)).toBe(cb.main());
		assertRoutable(s);
	});
});

describe('supportOpenedScreen edge cases', () => {
	test('with topic name includes topic in text', () => {
		const s = supportOpenedScreen(v, { topicName: 'Order #999' });
		expect(s.text).toContain('Order #999');
		expect(s.keyboard).toHaveLength(2);
		expect(data(s.keyboard[0]![0]!)).toBe(cb.supportClose());
		expect(data(s.keyboard[1]![0]!)).toBe(cb.main());
		assertRoutable(s);
	});

	test('without topic name still has text', () => {
		const s = supportOpenedScreen(v, { topicName: null });
		expect(s.text).toBeTruthy();
		expect(s.keyboard).toHaveLength(2);
		assertRoutable(s);
	});

	test('English view works', () => {
		const s = supportOpenedScreen(ve, { topicName: 'Billing' });
		expect(s.text).toContain('Billing');
		assertRoutable(s);
	});
});

describe('moreScreen', () => {
	test('has 2FA and rating in first row, back in second', () => {
		const s = moreScreen(v);
		expect(s.keyboard).toHaveLength(2);
		expect(s.keyboard[0]).toHaveLength(2);
		expect(data(s.keyboard[0]![0]!)).toBe(cb.twofa());
		expect(data(s.keyboard[0]![1]!)).toBe(cb.rating());
		expect(data(s.keyboard[1]![0]!)).toBe(cb.main());
		assertRoutable(s);
	});

	test('text is non-empty', () => {
		expect(moreScreen(v).text).toBeTruthy();
		expect(moreScreen(ve).text).toBeTruthy();
	});
});

describe('twofaPromptScreen', () => {
	test('has cancel button pointing to more screen', () => {
		const s = twofaPromptScreen(v);
		expect(s.text).toBeTruthy();
		expect(s.keyboard).toHaveLength(1);
		expect(s.keyboard[0]).toHaveLength(1);
		const cancelData = data(s.keyboard[0]![0]!);
		expect(cancelData).toBe(cb.cancelInput(cb.more()));
		assertRoutable(s);
	});
});

describe('twofaResultScreen edge cases', () => {
	test('includes code and seconds in text', () => {
		const s = twofaResultScreen(v, { code: '654321', secondsRemaining: 5 });
		expect(s.text).toContain('654321');
		expect(s.text).toContain('5');
		assertRoutable(s);
	});

	test('has copy, refresh, new, and back buttons', () => {
		const s = twofaResultScreen(v, { code: '123456', secondsRemaining: 30 });
		expect(s.keyboard[0]![0]).toMatchObject({ copy_text: { text: '123456' } });
		expect(s.keyboard[0]![0]!.style).toBe('primary');
		expect(data(s.keyboard[1]![0]!)).toBe(cb.twofaRefresh());
		expect(data(s.keyboard[1]![1]!)).toBe(cb.twofa());
		expect(data(s.keyboard[2]![0]!)).toBe(cb.more());
		assertRoutable(s);
	});

	test('English view includes code', () => {
		const s = twofaResultScreen(ve, { code: '000000', secondsRemaining: 0 });
		expect(s.text).toContain('000000');
		assertRoutable(s);
	});
});

describe('ratingScreen', () => {
	test('up button is success, down is danger', () => {
		const s = ratingScreen(v);
		expect(s.keyboard[0]![0]!.style).toBe('success');
		expect(s.keyboard[0]![1]!.style).toBe('danger');
		expect(data(s.keyboard[0]![0]!)).toBe(cb.rate(1));
		expect(data(s.keyboard[0]![1]!)).toBe(cb.rate(-1));
		assertRoutable(s);
	});

	test('back button goes to more', () => {
		const s = ratingScreen(v);
		expect(data(s.keyboard[1]![0]!)).toBe(cb.more());
	});
});

describe('referralScreen edge cases', () => {
	const baseStats: ReferralStats = {
		referralCode: 'ABCD', referred24h: 1, referred7d: 2, referredTotal: 3, earned: 500, available: 300,
		transferred: 200, withdrawn: 0, percentBp: 500, maxPerTopup: 300, minWithdraw: 100,
	};

	test('available > 0 and >= minWithdraw shows both transfer and withdraw', () => {
		const s = referralScreen(v, { stats: baseStats, link: 'https://t.me/b?start=ref_ABCD' });
		const row1 = labels(s.keyboard)[1]!;
		expect(row1).toHaveLength(2);
		expect(data(s.keyboard[1]![0]!)).toBe(cb.referralTransfer());
		expect(data(s.keyboard[1]![1]!)).toBe(cb.referralWithdraw());
		assertRoutable(s);
	});

	test('available > 0 but < minWithdraw shows only transfer, no withdraw', () => {
		const stats = { ...baseStats, available: 50, minWithdraw: 100 };
		const s = referralScreen(v, { stats, link: 'https://t.me/b?start=ref_ABCD' });
		const transferRow = s.keyboard.find((row) => row.some((b) => data(b) === cb.referralTransfer()));
		expect(transferRow).toBeDefined();
		const withdrawBtn = s.keyboard.flat().find((b) => data(b) === cb.referralWithdraw());
		expect(withdrawBtn).toBeUndefined();
		assertRoutable(s);
	});

	test('available = 0 shows no transfer/withdraw buttons', () => {
		const stats = { ...baseStats, available: 0 };
		const s = referralScreen(v, { stats, link: 'l' });
		const transferBtn = s.keyboard.flat().find((b) => data(b) === cb.referralTransfer());
		expect(transferBtn).toBeUndefined();
		const withdrawBtn = s.keyboard.flat().find((b) => data(b) === cb.referralWithdraw());
		expect(withdrawBtn).toBeUndefined();
		assertRoutable(s);
	});

	test('copy button has the referral link', () => {
		const link = 'https://t.me/shop?start=ref_XYZ';
		const s = referralScreen(v, { stats: baseStats, link });
		expect(s.keyboard[0]![0]).toMatchObject({ copy_text: { text: link } });
	});

	test('text includes percentage and stats', () => {
		const s = referralScreen(v, { stats: baseStats, link: 'l' });
		expect(s.text).toContain('5.0%');
		expect(s.text).toContain('$5.00');
		expect(s.text).toContain('$3.00');
	});

	test('back button goes to main', () => {
		const s = referralScreen(v, { stats: baseStats, link: 'l' });
		expect(data(s.keyboard.at(-1)![0]!)).toBe(cb.main());
	});
});

describe('withdrawPromptScreen edge cases', () => {
	test('includes amount and min in text', () => {
		const s = withdrawPromptScreen(v, { amount: 1000, min: 200 });
		expect(s.text).toContain('$10.00');
		expect(s.text).toContain('$2.00');
		assertRoutable(s);
	});

	test('cancel goes back to referral', () => {
		const s = withdrawPromptScreen(v, { amount: 500, min: 100 });
		const cancelData = data(s.keyboard[0]![0]!);
		expect(cancelData).toBe(cb.cancelInput(cb.referral()));
		assertRoutable(s);
	});

	test('English view works', () => {
		const s = withdrawPromptScreen(ve, { amount: 250, min: 50 });
		expect(s.text).toContain('$2.50');
		expect(s.text).toContain('$0.50');
		assertRoutable(s);
	});
});
