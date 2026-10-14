import { describe, expect, test } from 'bun:test';
import type { OrderDetail, SettleResult, StoreSettings, UserProfile } from '@tokobun/core';
import { startJobs } from '../src/jobs';
import { createNotifier, type Renderers, type TelegramSender } from '../src/notify';
import { createRateLimiter } from '../src/ratelimit';

const baseUser: UserProfile = {
  id: 1,
  username: 'buyer',
  firstName: 'B',
  language: 'id',
  currency: 'IDR',
  tzOffsetMinutes: 0,
  balance: 1500,
  referralCode: 'X',
  notifyStock: true,
  notifyInfo: true,
  notifyReferral: true,
  isBanned: false,
  createdAt: new Date(),
};
const settings = { fxRates: { IDR: 16300 } } as unknown as StoreSettings;

const render: Renderers = {
  renderOrderDelivery: (o, lang) =>
    o.items.length > 2 ? { text: `[${lang}] summary ${o.code}`, file: { filename: `${o.code}.txt`, content: o.items.join('\n') } } : { text: `[${lang}] items ${o.items.join(',')}`, file: null },
  renderTopupSuccess: (i, lang, m) => `[${lang}] topup ${i.credited} bal ${i.balance} ${m.currency}`,
  renderReferralEarned: (i, lang) => `[${lang}] referral ${i.amount}`,
  t: (lang, key, p) => `[${lang}] ${key} ${p ? JSON.stringify(p) : ''}`,
  hasKey: (_l, k) => k === 'admin.sale',
};

function setup(users: Record<number, UserProfile>, adminChatId: string | null = '-100') {
  const sent: { chat: number | string; text?: string; file?: string; caption?: string }[] = [];
  const sender: TelegramSender = {
    sendMessage: async (chat, text) => sent.push({ chat, text }),
    sendDocument: async (chat, file, caption) => sent.push({ chat, file: file.filename, caption }),
  };
  const n = createNotifier({
    sender,
    getUser: async (id) => users[id] ?? null,
    getSettings: async () => settings,
    render,
    adminChatId,
    log: { warn: () => {}, error: () => {} },
  });
  return { n, sent };
}

const order = (over: Partial<OrderDetail> = {}): OrderDetail => ({
  id: 1,
  storeId: 1,
  code: 'TB-1',
  productId: 1,
  productName: 'Netflix',
  quantity: 1,
  total: 500,
  status: 'completed',
  createdAt: new Date(),
  unitPrice: 500,
  subtotal: 500,
  discountAmount: 0,
  voucherDiscount: 0,
  paidWith: 'payment',
  items: ['acc:pw'],
  warranty: null,
  completedAt: new Date(),
  ...over,
});

const res = (over: Partial<SettleResult>): SettleResult => ({
  storeId: 1,
  paymentId: 9,
  alreadySettled: false,
  purpose: 'topup',
  userId: 1,
  credited: 500,
  order: null,
  referral: null,
  ...over,
});

describe('notifier', () => {
  test('top-up: user message in their language/currency + referrer + admin line', async () => {
    const referrer = { ...baseUser, id: 2, language: 'en', currency: 'USD' };
    const { n, sent } = setup({ 1: baseUser, 2: referrer });
    await n.notifySettlement(res({ referral: { referrerId: 2, amount: 25 } }));
    expect(sent[0]).toEqual({ chat: 1, text: '[id] topup 500 bal 1500 IDR' });
    expect(sent[1]).toEqual({ chat: 2, text: '[en] referral 25' });
    expect(sent[2]!.chat).toBe(-100);
    expect(sent[2]!.text).toContain('$5.00');
  });

  test('referrer with notifyReferral off gets nothing', async () => {
    const { n, sent } = setup({ 1: baseUser, 2: { ...baseUser, id: 2, notifyReferral: false } }, null);
    await n.notifySettlement(res({ referral: { referrerId: 2, amount: 25 } }));
    expect(sent.map((s) => s.chat)).toEqual([1]);
  });

  test('order: inline delivery vs document', async () => {
    const { n, sent } = setup({ 1: baseUser }, null);
    await n.notifySettlement(res({ purpose: 'order', credited: 0, order: order() }));
    expect(sent[0]).toEqual({ chat: 1, text: '[id] items acc:pw' });
    await n.notifySettlement(res({ purpose: 'order', credited: 0, order: order({ items: ['a', 'b', 'c'] }) }));
    expect(sent[1]).toEqual({ chat: 1, file: 'TB-1.txt', caption: '[id] summary TB-1' });
  });

  test('order refunded (no stock): user told about the wallet credit, admin warned', async () => {
    const { n, sent } = setup({ 1: baseUser });
    await n.notifySettlement(res({ purpose: 'order', credited: 500, order: order({ status: 'refunded', items: [] }) }));
    expect(sent[0]!.text).toContain('orderStatus.refunded');
    expect(sent[0]!.text).toContain('topup 500');
    expect(sent[1]!.text).toContain('out of stock');
  });

  test('alreadySettled -> nothing sent; admin sale uses i18n admin.sale', async () => {
    const { n, sent } = setup({ 1: baseUser });
    await n.notifySettlement(res({ alreadySettled: true }));
    expect(sent).toHaveLength(0);
    await n.notifyApiSale(order(), baseUser, 1);
    expect(sent[0]!.text).toContain('admin.sale');
  });

  test('saleLine falls back to hardcoded HTML when hasKey returns false', async () => {
    const sent: { chat: number | string; text?: string }[] = [];
    const sender: TelegramSender = { sendMessage: async (c, t) => sent.push({ chat: c, text: t }), sendDocument: async () => {} };
    const noI18n: Renderers = { ...render, hasKey: () => false };
    const n = createNotifier({ sender, getUser: async () => baseUser, getSettings: async () => settings, render: noI18n, adminChatId: '-100', log: { warn: () => {}, error: () => {} } });
    await n.notifyApiSale(order({ productName: 'A<B>' }), baseUser, 1);
    const line = sent[0]!.text!;
    expect(line).toContain('Sale');
    expect(line).toContain('A&lt;B&gt;');
    expect(line).toContain('$5.00');
    expect(line).toContain('@buyer');
  });

  test('sender failures are swallowed', async () => {
    const n = createNotifier({
      sender: { sendMessage: async () => Promise.reject(new Error('403')), sendDocument: async () => Promise.reject(new Error('403')) },
      getUser: async () => baseUser,
      getSettings: async () => settings,
      render,
      log: { warn: () => {}, error: () => {} },
    });
    await n.notifySettlement(res({}));
  });

  test('per-store sender used when getSenderForStore is provided', async () => {
    const storeSent: { chat: number | string; text?: string }[] = [];
    const storeSender: TelegramSender = {
      sendMessage: async (chat, text) => storeSent.push({ chat, text }),
      sendDocument: async () => {},
    };
    const n = createNotifier({
      sender: null,
      getSenderForStore: async () => ({ sender: storeSender, adminChatId: -999 }),
      getUser: async () => baseUser,
      getSettings: async () => settings,
      render,
      log: { warn: () => {}, error: () => {} },
    });
    await n.notifySettlement(res({}));
    expect(storeSent.some((s) => s.chat === 1)).toBe(true);
    expect(storeSent.some((s) => s.chat === -999)).toBe(true);
  });

  test('long caption sends text + document separately', async () => {
    const longRender: Renderers = {
      ...render,
      renderOrderDelivery: (o) => ({ text: 'x'.repeat(1200), file: { filename: `${o.code}.txt`, content: 'data' } }),
    };
    const sent: { chat: number | string; text?: string; file?: string; caption?: string }[] = [];
    const sender: TelegramSender = {
      sendMessage: async (chat, text) => sent.push({ chat, text }),
      sendDocument: async (chat, file, caption) => sent.push({ chat, file: file.filename, caption }),
    };
    const n = createNotifier({
      sender,
      getUser: async () => baseUser,
      getSettings: async () => settings,
      render: longRender,
      log: { warn: () => {}, error: () => {} },
    });
    await n.notifySettlement(res({ purpose: 'order', credited: 0, order: order({ items: ['a', 'b', 'c'] }) }));
    expect(sent[0]!.text).toBe('x'.repeat(1200));
    expect(sent[1]!.file).toBe('TB-1.txt');
    expect(sent[1]!.caption).toBeUndefined();
  });

  test('no sender and no getSenderForStore still sends nothing without error', async () => {
    const n = createNotifier({
      sender: null,
      getUser: async () => baseUser,
      getSettings: async () => settings,
      render,
      log: { warn: () => {}, error: () => {} },
    });
    await n.notifySettlement(res({}));
  });
});

describe('jobs', () => {
  test('overlapping ticks are skipped; failures isolated', async () => {
    let release!: () => void;
    let calls = 0;
    let second = 0;
    const j = startJobs(
      [
        {
          name: 'slow',
          run: () => {
            calls++;
            return new Promise<void>((r) => (release = r));
          },
        },
        {
          name: 'after',
          run: async () => {
            second++;
            throw new Error('boom');
          },
        },
      ],
      { intervalMs: 1_000_000, runAtStart: false, log: { info: () => {}, error: () => {} } },
    );
    const first = j.tick();
    expect(await j.tick()).toBe('skipped');
    release();
    expect(await first).toBe('ran');
    expect(calls).toBe(1);
    expect(second).toBe(1);
    j.stop();
  });
});

describe('notifier edge cases', () => {
  test('usd helper formats correctly', async () => {
    const { usd } = await import('../src/notify');
    expect(usd(0)).toBe('$0.00');
    expect(usd(1)).toBe('$0.01');
    expect(usd(150)).toBe('$1.50');
    expect(usd(-525)).toBe('$-5.25');
    expect(usd(99999)).toBe('$999.99');
  });

  test('banned referrer gets no notification', async () => {
    const { n, sent } = setup({ 1: baseUser, 2: { ...baseUser, id: 2, isBanned: true } }, null);
    await n.notifySettlement(res({ referral: { referrerId: 2, amount: 25 } }));
    expect(sent.map((s) => s.chat)).toEqual([1]);
  });

  test('zero referral amount gets no notification', async () => {
    const { n, sent } = setup({ 1: baseUser, 2: { ...baseUser, id: 2 } }, null);
    await n.notifySettlement(res({ referral: { referrerId: 2, amount: 0 } }));
    expect(sent.map((s) => s.chat)).toEqual([1]);
  });

  test('unknown user falls back to userId in admin message', async () => {
    const { n, sent } = setup({}, '-100');
    await n.notifySettlement(res({ userId: 999 }));
    const adminMsg = sent.find((s) => s.chat === -100);
    expect(adminMsg).toBeDefined();
    expect(adminMsg!.text).toContain('999');
  });

  test('getSettings failure gracefully returns', async () => {
    const sender: TelegramSender = {
      sendMessage: async () => {},
      sendDocument: async () => {},
    };
    const n = createNotifier({
      sender,
      getUser: async () => { throw new Error('db down'); },
      getSettings: async () => settings,
      render,
      log: { warn: () => {}, error: () => {} },
    });
    await n.notifySettlement(res({}));
  });

  test('getSenderForStore failure falls back to default sender', async () => {
    const sent: { chat: number | string; text?: string }[] = [];
    const sender: TelegramSender = {
      sendMessage: async (chat, text) => sent.push({ chat, text }),
      sendDocument: async () => {},
    };
    const n = createNotifier({
      sender,
      getSenderForStore: async () => { throw new Error('store not found'); },
      getUser: async () => baseUser,
      getSettings: async () => settings,
      render,
      adminChatId: '-200',
      log: { warn: () => {}, error: () => {} },
    });
    await n.notifySettlement(res({}));
    expect(sent.some((s) => s.chat === 1)).toBe(true);
    expect(sent.some((s) => s.chat === -200)).toBe(true);
  });
});

describe('jobs edge cases', () => {
  test('runAtStart defaults to true', async () => {
    let ran = false;
    const j = startJobs(
      [{ name: 'check', run: async () => { ran = true; } }],
      { intervalMs: 1_000_000, log: { info: () => {}, error: () => {} } },
    );
    await Bun.sleep(10);
    expect(ran).toBe(true);
    j.stop();
  });

  test('job returning positive number is logged', async () => {
    let logged = '';
    const j = startJobs(
      [{ name: 'expiry', run: async () => 5 }],
      { intervalMs: 1_000_000, runAtStart: false, log: { info: (msg: string) => { logged = msg; }, error: () => {} } },
    );
    await j.tick();
    expect(logged).toContain('expiry');
    expect(logged).toContain('5');
    j.stop();
  });

  test('job returning 0 is not logged', async () => {
    let logged = false;
    const j = startJobs(
      [{ name: 'noop', run: async () => 0 }],
      { intervalMs: 1_000_000, runAtStart: false, log: { info: () => { logged = true; }, error: () => {} } },
    );
    await j.tick();
    expect(logged).toBe(false);
    j.stop();
  });
});

describe('rate limiter', () => {
  test('fixed window resets', () => {
    let t = 0;
    const rl = createRateLimiter({ limit: 2, windowMs: 1000, now: () => t });
    expect(rl.hit('k').allowed).toBe(true);
    expect(rl.hit('k').allowed).toBe(true);
    expect(rl.hit('k').allowed).toBe(false);
    t = 1001;
    expect(rl.hit('k').allowed).toBe(true);
  });

  test('different keys have independent limits', () => {
    let t = 0;
    const rl = createRateLimiter({ limit: 1, windowMs: 1000, now: () => t });
    expect(rl.hit('a').allowed).toBe(true);
    expect(rl.hit('a').allowed).toBe(false);
    expect(rl.hit('b').allowed).toBe(true);
    expect(rl.hit('b').allowed).toBe(false);
  });

  test('remaining count decreases correctly', () => {
    let t = 0;
    const rl = createRateLimiter({ limit: 3, windowMs: 1000, now: () => t });
    expect(rl.hit('k').remaining).toBe(2);
    expect(rl.hit('k').remaining).toBe(1);
    expect(rl.hit('k').remaining).toBe(0);
    expect(rl.hit('k').remaining).toBe(0);
  });

  test('retryAfterSec is positive when rate limited', () => {
    let t = 500;
    const rl = createRateLimiter({ limit: 1, windowMs: 1000, now: () => t });
    rl.hit('k');
    const result = rl.hit('k');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSec).toBeGreaterThan(0);
  });
});
