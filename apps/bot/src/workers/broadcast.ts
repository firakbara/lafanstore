// Broadcast sender: claims queued broadcasts and sends them at ~25 msg/s.
// 403 (blocked / deactivated) marks the user blockedBot; 429 waits retry_after and retries.
import {
  claimBroadcast,
  finishBroadcast,
  markBlockedBot,
  nextBroadcastRecipients,
  recordBroadcastProgress,
  type BroadcastJob,
} from '@tokobun/core';
import { escapeHtml } from '@tokobun/i18n';
import type { Api } from 'grammy';
import { isBlocked, retryAfter } from '../util/errors';

const BATCH = 25;
const SEND_INTERVAL_MS = 40; // ≈ 25 msg/s
const IDLE_MS = 5_000;
const ERROR_BACKOFF_MS = 30_000;

/** Waits `ms`, or less when `signal` aborts first. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
  });
}

const TG_MESSAGE_LIMIT = 4096;

export function broadcastText(job: BroadcastJob): string {
  const full = job.title ? `<b>${escapeHtml(job.title)}</b>\n\n${job.body}` : job.body;
  if (full.length <= TG_MESSAGE_LIMIT) return full;
  let end = TG_MESSAGE_LIMIT - 1;
  const code = full.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end--;
  return full.slice(0, end) + '…';
}

/** The broadcast queue the worker reads and updates (the core services; replaceable in tests). */
export interface BroadcastStore {
  claimBroadcast(storeId: number): Promise<BroadcastJob | null>;
  nextBroadcastRecipients(broadcastId: number, limit: number): Promise<number[]>;
  recordBroadcastProgress(broadcastId: number, sent: number, failed: number, lastUserId: number): Promise<void>;
  finishBroadcast(broadcastId: number, status: 'done' | 'failed'): Promise<void>;
  markBlockedBot(userId: number, blocked: boolean): Promise<void>;
}

const coreStore: BroadcastStore = { claimBroadcast, nextBroadcastRecipients, recordBroadcastProgress, finishBroadcast, markBlockedBot };

const MAX_RETRY_WAIT_SEC = 120;

/** 'aborted': the worker was stopped while waiting out a 429; the message was not sent. */
async function sendOne(api: Api, store: BroadcastStore, userId: number, text: string, signal: AbortSignal): Promise<'sent' | 'failed' | 'aborted'> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await api.sendMessage(userId, text, { parse_mode: 'HTML' });
      return 'sent';
    } catch (err) {
      const wait = retryAfter(err);
      if (wait !== null) {
        await sleep((Math.min(wait, MAX_RETRY_WAIT_SEC) + 1) * 1000, signal);
        if (signal.aborted) return 'aborted';
        continue;
      }
      if (isBlocked(err)) await store.markBlockedBot(userId, true).catch(() => {});
      return 'failed';
    }
  }
  return 'failed';
}

async function runJob(api: Api, store: BroadcastStore, job: BroadcastJob, signal: AbortSignal): Promise<void> {
  const text = broadcastText(job);
  while (!signal.aborted) {
    const recipients = await store.nextBroadcastRecipients(job.id, BATCH);
    if (recipients.length === 0) {
      await store.finishBroadcast(job.id, 'done');
      return;
    }
    let sent = 0;
    let failed = 0;
    let last: number | null = null;
    // On stop, the batch is cut short after the message in flight; progress covers exactly the
    // recipients handled, so the next worker resumes after them without sending twice.
    for (const userId of recipients) {
      if (signal.aborted) break;
      const result = await sendOne(api, store, userId, text, signal);
      if (result === 'aborted') break;
      if (result === 'sent') sent++;
      else failed++;
      last = userId;
      await sleep(SEND_INTERVAL_MS, signal);
    }
    if (last !== null) await store.recordBroadcastProgress(job.id, sent, failed, last);
  }
}

/**
 * Start the worker loop; returns a stop function whose promise resolves once the loop has exited
 * (the message in flight sent and the progress of the partial batch recorded).
 */
export function startBroadcastWorker(api: Api, storeId: number, store: BroadcastStore = coreStore): () => Promise<void> {
  const abort = new AbortController();
  const { signal } = abort;
  const loop = (async () => {
    while (!signal.aborted) {
      try {
        const job = await store.claimBroadcast(storeId);
        if (!job) {
          await sleep(IDLE_MS, signal);
          continue;
        }
        console.log(`[broadcast] sending #${job.id} (${job.audience})`);
        await runJob(api, store, job, signal);
      } catch (err) {
        console.error('[broadcast] worker error:', (err as Error).message);
        await sleep(ERROR_BACKOFF_MS, signal);
      }
    }
  })();
  return () => {
    abort.abort();
    return loop;
  };
}
