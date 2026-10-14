import { describe, expect, test } from 'bun:test';
import { broadcastText } from '../src/workers/broadcast';

describe('broadcastText', () => {
  test('short body returns as-is', () => {
    const text = broadcastText({ id: 1, audience: 'all', title: null, body: 'Hello world', status: 'queued', storeId: 1 } as any);
    expect(text).toBe('Hello world');
  });

  test('title wraps in bold with blank line', () => {
    const text = broadcastText({ id: 1, audience: 'all', title: 'News', body: 'Details here', status: 'queued', storeId: 1 } as any);
    expect(text).toBe('<b>News</b>\n\nDetails here');
  });

  test('truncates to 4096 chars with ellipsis', () => {
    const body = 'x'.repeat(5000);
    const text = broadcastText({ id: 1, audience: 'all', title: null, body, status: 'queued', storeId: 1 } as any);
    expect(text.length).toBe(4096);
    expect(text.endsWith('…')).toBe(true);
  });

  test('truncates with title included in limit', () => {
    const body = 'y'.repeat(5000);
    const text = broadcastText({ id: 1, audience: 'all', title: 'Big Title', body, status: 'queued', storeId: 1 } as any);
    expect(text.length).toBe(4096);
    expect(text.startsWith('<b>Big Title</b>')).toBe(true);
    expect(text.endsWith('…')).toBe(true);
  });

  test('HTML-escapes title', () => {
    const text = broadcastText({ id: 1, audience: 'all', title: 'A <b> & B', body: 'ok', status: 'queued', storeId: 1 } as any);
    expect(text).toContain('A &lt;b&gt; &amp; B');
  });

  test('does not split a surrogate pair when truncating', () => {
    const emoji = '😊'; // 2 UTF-16 code units (surrogate pair)
    const padding = 'x'.repeat(4094);
    const body = padding + emoji;
    expect(body.length).toBe(4096);
    const text = broadcastText({ id: 1, audience: 'all', title: null, body, status: 'queued', storeId: 1 } as any);
    expect(text.length).toBeLessThanOrEqual(4096);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) {
        expect(i + 1).toBeLessThan(text.length);
        const low = text.charCodeAt(i + 1);
        expect(low).toBeGreaterThanOrEqual(0xdc00);
        expect(low).toBeLessThanOrEqual(0xdfff);
      }
    }
  });

  test('exactly 4096 chars without surrogates stays as-is', () => {
    const body = 'a'.repeat(4096);
    const text = broadcastText({ id: 1, audience: 'all', title: null, body, status: 'queued', storeId: 1 } as any);
    expect(text).toBe(body);
  });
});
