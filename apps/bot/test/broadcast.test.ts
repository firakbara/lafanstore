import { describe, expect, test } from 'bun:test';
import type { BroadcastJob } from '@tokobun/core';
import type { Api } from 'grammy';
import { broadcastText, startBroadcastWorker, type BroadcastStore } from '../src/workers/broadcast';

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

async function waitFor(cond: () => boolean, timeoutMs = 2_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > until) throw new Error('waitFor timed out');
    await tick(1);
  }
}

/** A fake broadcast store with one queued job for `recipients`, logging every call into `events`. */
function fakeStore(events: string[], recipients: number[]): BroadcastStore {
  let claimed = false;
  let cursor = 0;
  return {
    claimBroadcast: async () => {
      if (claimed) return null;
      claimed = true;
      return { id: 7, audience: 'all', title: null, body: 'hi' } as BroadcastJob;
    },
    nextBroadcastRecipients: async (_id, limit) => recipients.slice(cursor, cursor + limit),
    recordBroadcastProgress: async (id, sent, failed, last) => {
      cursor = recipients.indexOf(last) + 1;
      events.push(`progress:${id}:${sent}:${failed}:${last}`);
    },
    finishBroadcast: async (id, status) => void events.push(`finish:${id}:${status}`),
    markBlockedBot: async () => {},
  };
}

describe('startBroadcastWorker', () => {
  test('sends a queued broadcast to every recipient, then finishes it', async () => {
    const events: string[] = [];
    const api = { sendMessage: async (id: number) => void events.push(`send:${id}`) } as unknown as Api;
    const stop = startBroadcastWorker(api, 1, fakeStore(events, [1, 2]));
    await waitFor(() => events.includes('finish:7:done'));
    await stop();
    expect(events).toEqual(['send:1', 'send:2', 'progress:7:2:0:2', 'finish:7:done']);
  });

  test('stop() resolves only after the loop has exited, recording the partial batch', async () => {
    const events: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const api = {
      sendMessage: async (id: number) => {
        events.push(`send:${id}`);
        if (id === 1) await gate;
      },
    } as unknown as Api;
    const stop = startBroadcastWorker(api, 1, fakeStore(events, [1, 2, 3]));
    await waitFor(() => events.includes('send:1'));
    let stopped = false;
    const stopping = stop().then(() => void (stopped = true));
    await tick(20);
    expect(stopped).toBe(false); // the send to user 1 is still in flight
    release();
    await stopping;
    // User 1 counts as sent; 2 and 3 are left for the next worker, which resumes after user 1.
    expect(events).toEqual(['send:1', 'progress:7:1:0:1']);
    await tick(100);
    expect(events).toEqual(['send:1', 'progress:7:1:0:1']);
  });

  test('stop() interrupts the idle wait', async () => {
    const events: string[] = [];
    const store = { ...fakeStore(events, []), claimBroadcast: async () => null };
    const stop = startBroadcastWorker({} as Api, 1, store);
    await tick(10);
    const t0 = Date.now();
    await stop();
    expect(Date.now() - t0).toBeLessThan(1_000);
  });
});

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
