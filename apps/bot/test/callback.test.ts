import { describe, expect, test } from 'bun:test';
import { A, cancelInputTarget, cb, decode, encode, intArg, MAX_CALLBACK_BYTES, nextSort, notifyFromCode, sortCode, sortFromCode, SORT_ORDER } from '../src/callback';

describe('callback codec', () => {
  test('encode/decode roundtrip', () => {
    const data = encode('p', 12, 150, 1);
    expect(data).toBe('p:12:150:1');
    expect(decode(data)).toEqual({ action: 'p', args: ['12', '150', '1'] });
    expect(decode('m')).toEqual({ action: 'm', args: [] });
  });

  test('rejects ":" in args and data over 64 bytes', () => {
    expect(() => encode('x', 'a:b')).toThrow();
    expect(() => encode('x', 'y'.repeat(70))).toThrow();
    expect(() => encode('x', '🙂'.repeat(16))).toThrow(); // 4 bytes each → 66 bytes
  });

  test('intArg', () => {
    expect(intArg(['5', 'x'], 0, 1)).toBe(5);
    expect(intArg(['5', 'x'], 1, 1)).toBe(1);
    expect(intArg([], 3, 7)).toBe(7);
    expect(intArg(['-60'], 0, 0)).toBe(-60);
  });

  test('builders stay within 64 bytes for large ids', () => {
    const big = 9_999_999_999;
    const samples = [
      cb.product(big, 9999, true),
      cb.payWith(big, 9999, 'cryptobot', 'CRYPTO'),
      cb.shopRefresh(9999, 'promo', big),
      cb.order(big, 9999),
      cb.cancelInput(cb.product(big, 9999)),
      cb.timezoneSet(-720),
    ];
    for (const s of samples) expect(new TextEncoder().encode(s).length).toBeLessThanOrEqual(MAX_CALLBACK_BYTES);
  });

  test('shop format and refresh flag', () => {
    expect(cb.shop(2, 'available')).toBe('s:2:v:0');
    expect(cb.shop(1, 'all', 7)).toBe('s:1:a:7');
    expect(cb.shopRefresh(3, 'soldout', null)).toBe('s:3:s:0:r');
  });

  test('sort cycle Semua → Tersedia → Habis → Promo → Semua', () => {
    expect(nextSort('all')).toBe('available');
    expect(nextSort('available')).toBe('soldout');
    expect(nextSort('soldout')).toBe('promo');
    expect(nextSort('promo')).toBe('all');
    expect(sortFromCode('p')).toBe('promo');
    expect(sortFromCode('zz')).toBe('all');
  });

  test('notify flag codes', () => {
    expect(notifyFromCode(decode(cb.notifyToggle('referral')).args[0])).toBe('referral');
    expect(notifyFromCode('q')).toBeNull();
  });

  test('cancelInput carries the next callback', () => {
    const data = cb.cancelInput(cb.product(5, 3));
    const { action, args } = decode(data);
    expect(action).toBe(A.cancelInput);
    expect(cancelInputTarget(args)).toBe(cb.product(5, 3));
    expect(cancelInputTarget([])).toBe(cb.main());
  });

  test('action names are unique', () => {
    const values = Object.values(A);
    expect(new Set(values).size).toBe(values.length);
  });

  test('decode single action with no args', () => {
    const { action, args } = decode('m');
    expect(action).toBe('m');
    expect(args).toEqual([]);
  });

  test('encode with empty action produces empty string', () => {
    expect(encode('')).toBe('');
  });

  test('intArg with negative index falls back to default', () => {
    expect(intArg(['10'], -1, 42)).toBe(42);
  });

  test('intArg with float string falls back to default', () => {
    expect(intArg(['3.14'], 0, 0)).toBe(0);
  });

  test('encode accepts numeric zero as arg', () => {
    const data = encode('x', 0);
    expect(data).toBe('x:0');
    expect(decode(data)).toEqual({ action: 'x', args: ['0'] });
  });

  test('sortCode returns correct code for each sort', () => {
    expect(sortCode('all')).toBe('a');
    expect(sortCode('available')).toBe('v');
    expect(sortCode('soldout')).toBe('s');
    expect(sortCode('promo')).toBe('p');
  });

  test('sortCode/sortFromCode round-trip for all 4 sorts', () => {
    for (const sort of SORT_ORDER) {
      expect(sortFromCode(sortCode(sort))).toBe(sort);
    }
  });

  test('sortFromCode with undefined returns all', () => {
    expect(sortFromCode(undefined)).toBe('all');
  });

  test('nextSort full cycle returns to start', () => {
    let current = SORT_ORDER[0]!;
    for (let i = 0; i < SORT_ORDER.length; i++) {
      current = nextSort(current);
    }
    expect(current).toBe(SORT_ORDER[0]!);
  });

  test('notifyFromCode maps each valid code to its flag', () => {
    expect(notifyFromCode('s')).toBe('stock');
    expect(notifyFromCode('i')).toBe('info');
    expect(notifyFromCode('r')).toBe('referral');
  });

  test('notifyFromCode returns null for undefined', () => {
    expect(notifyFromCode(undefined)).toBeNull();
  });

  test('cb.payWith encodes provider and method in output', () => {
    const data = cb.payWith(42, 3, 'cryptobot', 'CRYPTO');
    expect(data).toBe('dm:42:3:cryptobot:CRYPTO');
    const { action, args } = decode(data);
    expect(action).toBe(A.payWith);
    expect(args).toEqual(['42', '3', 'cryptobot', 'CRYPTO']);
  });

  test('cb.shop with explicit parentId encodes it', () => {
    const data = cb.shop(1, 'promo', 55);
    expect(data).toBe('s:1:p:55');
    const { action, args } = decode(data);
    expect(action).toBe(A.shop);
    expect(args[3]).toBeUndefined(); // no refresh flag
  });

  test('cb.shop with null parentId defaults to 0', () => {
    expect(cb.shop(1, 'all', null)).toBe('s:1:a:0');
  });

  test('cancelInputTarget with multi-part args joins with colon', () => {
    // Simulate args that would come from decoding ci:p:5:3:0
    const args = ['p', '5', '3', '0'];
    expect(cancelInputTarget(args)).toBe('p:5:3:0');
  });

  test('cb.cancelInput round-trip with complex callback', () => {
    const original = cb.payWith(10, 2, 'stripe', 'card');
    const wrapped = cb.cancelInput(original);
    const { action, args } = decode(wrapped);
    expect(action).toBe(A.cancelInput);
    const recovered = cancelInputTarget(args);
    expect(recovered).toBe(original);
  });

  test('cb.cancelInput round-trip with no-arg callback', () => {
    const original = cb.main();
    const wrapped = cb.cancelInput(original);
    const { args } = decode(wrapped);
    const recovered = cancelInputTarget(args);
    expect(recovered).toBe(original);
  });

  test('cb.topupMethod encodes provider and method', () => {
    const data = cb.topupMethod('xendit', 'va_bca');
    expect(data).toBe('tm:xendit:va_bca');
  });

  test('cb.order encodes orderId and fromPage', () => {
    expect(cb.order(123, 5)).toBe('od:123:5');
    expect(cb.order(123)).toBe('od:123:1'); // default fromPage
  });

  test('cb.orders defaults page to 1', () => {
    expect(cb.orders()).toBe('o:1');
    expect(cb.orders(3)).toBe('o:3');
  });

  test('cb.ledger defaults page to 1', () => {
    expect(cb.ledger()).toBe('l:1');
    expect(cb.ledger(2)).toBe('l:2');
  });

  test('cb.product typing flag encodes as 0 or 1', () => {
    expect(cb.product(7, 2)).toBe('p:7:2:0');       // default false
    expect(cb.product(7, 2, false)).toBe('p:7:2:0');
    expect(cb.product(7, 2, true)).toBe('p:7:2:1');
  });

  test('cb.rate encodes thumbs up/down', () => {
    expect(cb.rate(1)).toBe('rs:1');
    expect(cb.rate(-1)).toBe('rs:-1');
  });

  test('cb.timezoneSet with negative offset', () => {
    expect(cb.timezoneSet(-420)).toBe('tzs:-420');
    expect(cb.timezoneSet(540)).toBe('tzs:540');
  });

  test('cb.languageSet and cb.currencySet encode codes', () => {
    expect(cb.languageSet('id')).toBe('lgs:id');
    expect(cb.currencySet('IDR')).toBe('cus:IDR');
  });

  test('encode at exactly 64 bytes is accepted', () => {
    const filler = 'a'.repeat(62); // "x:" + 62 = 64 bytes
    expect(() => encode('x', filler)).not.toThrow();
    expect(new TextEncoder().encode(encode('x', filler)).length).toBe(64);
  });

  test('encode at 65 bytes is rejected', () => {
    const filler = 'a'.repeat(63); // "x:" + 63 = 65 bytes
    expect(() => encode('x', filler)).toThrow();
  });

  test('decode with empty string returns empty action and no args', () => {
    const { action, args } = decode('');
    expect(action).toBe('');
    expect(args).toEqual([]);
  });

  test('decode with many colons returns many args', () => {
    const { action, args } = decode('a:b:c:d:e:f');
    expect(action).toBe('a');
    expect(args).toEqual(['b', 'c', 'd', 'e', 'f']);
  });

  test('intArg with empty string arg falls back to default', () => {
    expect(intArg([''], 0, 99)).toBe(99);
  });

  test('intArg with Infinity string falls back to default', () => {
    expect(intArg(['Infinity'], 0, 0)).toBe(0);
    expect(intArg(['-Infinity'], 0, 0)).toBe(0);
  });

  test('intArg with NaN string falls back to default', () => {
    expect(intArg(['NaN'], 0, 5)).toBe(5);
  });

  test('intArg with very large safe integer is kept', () => {
    expect(intArg([String(Number.MAX_SAFE_INTEGER)], 0, 0)).toBe(Number.MAX_SAFE_INTEGER);
  });

  test('intArg with beyond MAX_SAFE_INTEGER falls back', () => {
    expect(intArg(['9007199254740993'], 0, 0)).toBe(0);
  });

  test('cancelInputTarget with single arg returns it as-is', () => {
    expect(cancelInputTarget(['m'])).toBe('m');
  });

  test('notifyFromCode with empty string returns null', () => {
    expect(notifyFromCode('')).toBeNull();
  });

  test('sortFromCode with empty string returns all', () => {
    expect(sortFromCode('')).toBe('all');
  });

  test('SORT_ORDER has exactly 4 entries', () => {
    expect(SORT_ORDER.length).toBe(4);
  });

  test('all parameterless builders produce valid callbacks', () => {
    const noArgs = [
      cb.noop, cb.main, cb.topup, cb.profile, cb.notify,
      cb.api, cb.apiCreate, cb.apiRevokeAsk, cb.apiRevoke,
      cb.language, cb.currency, cb.timezone,
      cb.help, cb.supportOpen, cb.supportClose,
      cb.more, cb.twofa, cb.twofaRefresh,
      cb.rating, cb.referral, cb.referralTransfer, cb.referralWithdraw,
    ];
    for (const builder of noArgs) {
      const data = builder();
      expect(data.length).toBeGreaterThan(0);
      expect(new TextEncoder().encode(data).length).toBeLessThanOrEqual(MAX_CALLBACK_BYTES);
      const { action } = decode(data);
      expect(action.length).toBeGreaterThan(0);
    }
  });
});

describe('cancelInputTarget edge cases', () => {
  test('deeply nested args (5+ segments) join correctly', () => {
    const args = ['dm', '42', '3', 'cryptobot', 'CRYPTO'];
    expect(cancelInputTarget(args)).toBe('dm:42:3:cryptobot:CRYPTO');
  });

  test('two args join with colon', () => {
    const args = ['o', '5'];
    expect(cancelInputTarget(args)).toBe('o:5');
  });

  test('args with numeric strings preserve values', () => {
    const args = ['p', '999', '10', '1'];
    expect(cancelInputTarget(args)).toBe('p:999:10:1');
  });
});

describe('notifyFromCode edge cases', () => {
  test('uppercase valid codes return null (case-sensitive)', () => {
    expect(notifyFromCode('S')).toBeNull();
    expect(notifyFromCode('I')).toBeNull();
    expect(notifyFromCode('R')).toBeNull();
  });

  test('numeric string returns null', () => {
    expect(notifyFromCode('1')).toBeNull();
  });

  test('whitespace string returns null', () => {
    expect(notifyFromCode(' ')).toBeNull();
  });

  test('multi-char string returns null', () => {
    expect(notifyFromCode('stock')).toBeNull();
    expect(notifyFromCode('si')).toBeNull();
  });
});

describe('sortFromCode edge cases', () => {
  test('uppercase valid codes return all (case-sensitive)', () => {
    expect(sortFromCode('A')).toBe('all');
    expect(sortFromCode('V')).toBe('all');
    expect(sortFromCode('S')).toBe('all');
    expect(sortFromCode('P')).toBe('all');
  });

  test('numeric string returns all', () => {
    expect(sortFromCode('1')).toBe('all');
  });

  test('multi-char string returns all', () => {
    expect(sortFromCode('all')).toBe('all');
    expect(sortFromCode('av')).toBe('all');
  });

  test('whitespace string returns all', () => {
    expect(sortFromCode(' ')).toBe('all');
  });
});

describe('nextSort edge cases', () => {
  test('double cycle (8 steps) returns to start', () => {
    let current = SORT_ORDER[0]!;
    for (let i = 0; i < SORT_ORDER.length * 2; i++) {
      current = nextSort(current);
    }
    expect(current).toBe(SORT_ORDER[0]!);
  });

  test('each position maps to expected successor', () => {
    for (let i = 0; i < SORT_ORDER.length; i++) {
      const expected = SORT_ORDER[(i + 1) % SORT_ORDER.length]!;
      expect(nextSort(SORT_ORDER[i]!)).toBe(expected);
    }
  });
});

describe('cb.cancelInput edge cases', () => {
  test('wrapping a deeply nested callback preserves all segments', () => {
    const inner = cb.payWith(100, 5, 'xendit', 'va_bca');
    const wrapped = cb.cancelInput(inner);
    const { action, args } = decode(wrapped);
    expect(action).toBe(A.cancelInput);
    expect(cancelInputTarget(args)).toBe(inner);
  });

  test('wrapping cb.noop produces recoverable callback', () => {
    const inner = cb.noop();
    const wrapped = cb.cancelInput(inner);
    const { args } = decode(wrapped);
    expect(cancelInputTarget(args)).toBe(inner);
  });

  test('wrapping cb.shop preserves sort and parentId', () => {
    const inner = cb.shop(3, 'promo', 42);
    const wrapped = cb.cancelInput(inner);
    const { args } = decode(wrapped);
    expect(cancelInputTarget(args)).toBe(inner);
  });

  test('wrapping cb.orders with page preserves page', () => {
    const inner = cb.orders(7);
    const wrapped = cb.cancelInput(inner);
    const { args } = decode(wrapped);
    expect(cancelInputTarget(args)).toBe(inner);
  });
});

describe('cb.payWith edge cases', () => {
  test('decode roundtrip recovers provider and method', () => {
    const data = cb.payWith(1, 1, 'stripe', 'card');
    const { action, args } = decode(data);
    expect(action).toBe(A.payWith);
    expect(args[2]).toBe('stripe');
    expect(args[3]).toBe('card');
  });

  test('different providers encode distinctly', () => {
    const a = cb.payWith(1, 1, 'xendit', 'va_bca');
    const b = cb.payWith(1, 1, 'cryptobot', 'BTC');
    expect(a).not.toBe(b);
    expect(decode(a).args[2]).toBe('xendit');
    expect(decode(b).args[2]).toBe('cryptobot');
  });

  test('stays within 64 bytes for long provider/method names', () => {
    const data = cb.payWith(1, 1, 'cryptobot', 'CRYPTO');
    expect(new TextEncoder().encode(data).length).toBeLessThanOrEqual(MAX_CALLBACK_BYTES);
  });
});

describe('cb.order edge cases', () => {
  test('default fromPage is 1', () => {
    const data = cb.order(99);
    const { args } = decode(data);
    expect(args[1]).toBe('1');
  });

  test('large orderId and page number', () => {
    const data = cb.order(999999, 50);
    const { action, args } = decode(data);
    expect(action).toBe(A.order);
    expect(args[0]).toBe('999999');
    expect(args[1]).toBe('50');
  });

  test('fromPage 0 is encoded as 0', () => {
    const data = cb.order(1, 0);
    expect(decode(data).args[1]).toBe('0');
  });
});

describe('cb.timezoneSet edge cases', () => {
  test('zero offset', () => {
    expect(cb.timezoneSet(0)).toBe('tzs:0');
  });

  test('max positive offset (UTC+14 = 840)', () => {
    expect(cb.timezoneSet(840)).toBe('tzs:840');
  });

  test('max negative offset (UTC-12 = -720)', () => {
    expect(cb.timezoneSet(-720)).toBe('tzs:-720');
  });

  test('decode roundtrip recovers offset via intArg', () => {
    const data = cb.timezoneSet(-330);
    const { args } = decode(data);
    expect(intArg(args, 0, 0)).toBe(-330);
  });
});

describe('cb.shopRefresh edge cases', () => {
  test('with each sort type', () => {
    for (const sort of SORT_ORDER) {
      const data = cb.shopRefresh(1, sort, 0);
      const { args } = decode(data);
      expect(args[args.length - 1]).toBe('r'); // refresh flag is last
    }
  });

  test('undefined parentId defaults to 0', () => {
    const data = cb.shopRefresh(1, 'all');
    expect(data).toBe('s:1:a:0:r');
  });

  test('with large parentId', () => {
    const data = cb.shopRefresh(1, 'all', 99999);
    const { action, args } = decode(data);
    expect(action).toBe(A.shop);
    expect(args[2]).toBe('99999');
    expect(args[3]).toBe('r');
  });

  test('shopRefresh vs shop differ only by refresh flag', () => {
    const refreshed = cb.shopRefresh(2, 'available', 5);
    const plain = cb.shop(2, 'available', 5);
    expect(refreshed).toBe(plain + ':r');
  });
});

describe('untested cb.* builders', () => {
  test('cb.note encodes id and qty', () => {
    const data = cb.note(10, 3);
    expect(data).toBe('n:10:3');
    const { action, args } = decode(data);
    expect(action).toBe(A.note);
    expect(args).toEqual(['10', '3']);
  });

  test('cb.voucher encodes id and qty', () => {
    const data = cb.voucher(7, 2);
    expect(data).toBe('v:7:2');
    const { action } = decode(data);
    expect(action).toBe(A.voucher);
  });

  test('cb.voucherDel encodes id and qty', () => {
    const data = cb.voucherDel(7, 2);
    expect(data).toBe('vx:7:2');
    const { action } = decode(data);
    expect(action).toBe(A.voucherDel);
  });

  test('cb.buyConfirm encodes id and qty', () => {
    const data = cb.buyConfirm(5, 1);
    expect(data).toBe('b:5:1');
    const { action } = decode(data);
    expect(action).toBe(A.buyConfirm);
  });

  test('cb.buy encodes id and qty', () => {
    const data = cb.buy(5, 1);
    expect(data).toBe('B:5:1');
    const { action } = decode(data);
    expect(action).toBe(A.buy);
  });

  test('cb.payMethods encodes id and qty', () => {
    const data = cb.payMethods(12, 4);
    expect(data).toBe('dp:12:4');
    const { action } = decode(data);
    expect(action).toBe(A.payMethods);
  });

  test('cb.invoice encodes paymentId', () => {
    const data = cb.invoice(555);
    expect(data).toBe('pi:555');
    const { action, args } = decode(data);
    expect(action).toBe(A.invoice);
    expect(args).toEqual(['555']);
  });

  test('cb.invoiceCheck encodes paymentId', () => {
    const data = cb.invoiceCheck(555);
    expect(data).toBe('pc:555');
    const { action } = decode(data);
    expect(action).toBe(A.invoiceCheck);
  });

  test('cb.invoiceCancel encodes paymentId', () => {
    const data = cb.invoiceCancel(555);
    expect(data).toBe('px:555');
    const { action } = decode(data);
    expect(action).toBe(A.invoiceCancel);
  });

  test('cb.orderResend encodes orderId', () => {
    const data = cb.orderResend(42);
    expect(data).toBe('or:42');
    const { action, args } = decode(data);
    expect(action).toBe(A.orderResend);
    expect(args).toEqual(['42']);
  });

  test('cb.notifyToggle encodes each flag correctly', () => {
    const flags: Array<'stock' | 'info' | 'referral'> = ['stock', 'info', 'referral'];
    for (const flag of flags) {
      const data = cb.notifyToggle(flag);
      const { action, args } = decode(data);
      expect(action).toBe(A.notifyToggle);
      expect(notifyFromCode(args[0])).toBe(flag);
    }
  });

  test('all arg-taking builders stay within MAX_CALLBACK_BYTES', () => {
    const samples = [
      cb.note(9999999, 9999),
      cb.voucher(9999999, 9999),
      cb.voucherDel(9999999, 9999),
      cb.buyConfirm(9999999, 9999),
      cb.buy(9999999, 9999),
      cb.payMethods(9999999, 9999),
      cb.invoice(9999999999),
      cb.invoiceCheck(9999999999),
      cb.invoiceCancel(9999999999),
      cb.orderResend(9999999999),
      cb.notifyToggle('stock'),
      cb.notifyToggle('info'),
      cb.notifyToggle('referral'),
    ];
    for (const s of samples) {
      expect(new TextEncoder().encode(s).length).toBeLessThanOrEqual(MAX_CALLBACK_BYTES);
    }
  });
});
