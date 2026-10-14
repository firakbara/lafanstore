import { describe, expect, test } from 'bun:test';
import { btn, urlBtn, copyBtn, noopBtn, rows, pager, type Button } from '../src/keyboards';
import { cb } from '../src/callback';

describe('btn', () => {
  test('creates callback_data button', () => {
    const b = btn('Buy', 'buy:1') as any;
    expect(b.text).toBe('Buy');
    expect(b.callback_data).toBe('buy:1');
  });

  test('style option adds style property', () => {
    const b = btn('OK', 'ok', { style: 'success' }) as any;
    expect(b.style).toBe('success');
  });

  test('emojiId adds icon_custom_emoji_id', () => {
    const b = btn('Star', 'star', { emojiId: '12345' }) as any;
    expect(b.icon_custom_emoji_id).toBe('12345');
  });

  test('null emojiId is ignored', () => {
    const b = btn('Star', 'star', { emojiId: null }) as any;
    expect(b.icon_custom_emoji_id).toBeUndefined();
  });

  test('no opts produces plain button', () => {
    const b = btn('X', 'x') as any;
    expect(b.style).toBeUndefined();
    expect(b.icon_custom_emoji_id).toBeUndefined();
  });
});

describe('urlBtn', () => {
  test('creates url button', () => {
    const b = urlBtn('Open', 'https://example.com') as any;
    expect(b.text).toBe('Open');
    expect(b.url).toBe('https://example.com');
  });

  test('style option applies', () => {
    const b = urlBtn('Go', 'https://x.com', { style: 'primary' }) as any;
    expect(b.style).toBe('primary');
  });
});

describe('copyBtn', () => {
  test('creates copy_text button', () => {
    const b = copyBtn('Copy', 'hello') as any;
    expect(b.text).toBe('Copy');
    expect(b.copy_text).toEqual({ text: 'hello' });
  });

  test('truncates copy text to 256 chars', () => {
    const long = 'a'.repeat(500);
    const b = copyBtn('Copy', long) as any;
    expect(b.copy_text.text.length).toBe(256);
  });

  test('does not truncate text at exactly 256 chars', () => {
    const exact = 'b'.repeat(256);
    const b = copyBtn('Copy', exact) as any;
    expect(b.copy_text.text.length).toBe(256);
    expect(b.copy_text.text).toBe(exact);
  });
});

describe('noopBtn', () => {
  test('uses cb.noop() as callback_data', () => {
    const b = noopBtn('Label') as any;
    expect(b.text).toBe('Label');
    expect(b.callback_data).toBe(cb.noop());
  });

  test('accepts opts', () => {
    const b = noopBtn('X', { style: 'danger' }) as any;
    expect(b.style).toBe('danger');
  });
});

describe('rows', () => {
  const mkBtn = (n: number): Button => btn(`B${n}`, `d:${n}`);

  test('chunks buttons into rows of given size', () => {
    const buttons = [1, 2, 3, 4, 5].map(mkBtn);
    const result = rows(buttons, 2);
    expect(result.length).toBe(3);
    expect(result[0]!.length).toBe(2);
    expect(result[1]!.length).toBe(2);
    expect(result[2]!.length).toBe(1);
  });

  test('empty array returns empty', () => {
    expect(rows([], 3)).toEqual([]);
  });

  test('exact multiple produces full rows', () => {
    const buttons = [1, 2, 3, 4, 5, 6].map(mkBtn);
    const result = rows(buttons, 3);
    expect(result.length).toBe(2);
    expect(result[0]!.length).toBe(3);
    expect(result[1]!.length).toBe(3);
  });

  test('size 1 gives one button per row', () => {
    const buttons = [1, 2, 3].map(mkBtn);
    const result = rows(buttons, 1);
    expect(result.length).toBe(3);
    result.forEach((r) => expect(r.length).toBe(1));
  });
});

describe('pager', () => {
  const labels = { prev: '‹', next: '›', page: '1/3' };
  const to = (p: number) => `page:${p}`;

  test('returns empty for single page', () => {
    expect(pager(1, 1, to, labels)).toEqual([]);
    expect(pager(1, 0, to, labels)).toEqual([]);
  });

  test('returns 3 buttons for multiple pages', () => {
    const result = pager(2, 5, to, { prev: '‹', next: '›', page: '2/5' });
    expect(result.length).toBe(3);
    expect((result[0] as any).callback_data).toBe('page:1');
    expect(result[1]!.text).toBe('2/5');
    expect((result[2] as any).callback_data).toBe('page:3');
  });

  test('page 1 prev wraps to totalPages', () => {
    const result = pager(1, 5, to, labels);
    expect((result[0] as any).callback_data).toBe('page:5');
  });

  test('last page next wraps to 1', () => {
    const result = pager(5, 5, to, labels);
    expect((result[2] as any).callback_data).toBe('page:1');
  });

  test('middle page has correct prev/next', () => {
    const result = pager(3, 5, to, labels);
    expect((result[0] as any).callback_data).toBe('page:2');
    expect((result[2] as any).callback_data).toBe('page:4');
  });

  test('middle button is a noop', () => {
    const result = pager(2, 3, to, { prev: '‹', next: '›', page: '2/3' });
    expect((result[1] as any).callback_data).toBe(cb.noop());
  });
});
