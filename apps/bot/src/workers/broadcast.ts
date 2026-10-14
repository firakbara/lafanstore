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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TG_MESSAGE_LIMIT = 4096;

export function broadcastText(job: BroadcastJob): string {
  const full = job.title ? `<b>${escapeHtml(job.title)}</b>\n\n${job.body}` : job.body;
  if (full.length <= TG_MESSAGE_LIMIT) return full;
  let end = TG_MESSAGE_LIMIT - 1;
  const code = full.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end--;
  return full.slice(0, end) + '…';
}

const MAX_RETRY_WAIT_SEC = 120;

async function sendOne(api: Api, userId: number, text: string): Promise<'sent' | 'failed'> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await api.sendMessage(userId, text, { parse_mode: 'HTML' });
      return 'sent';
    } catch (err) {
      const wait = retryAfter(err);
      if (wait !== null) {
        await sleep((Math.min(wait, MAX_RETRY_WAIT_SEC) + 1) * 1000);
        continue;
      }
      if (isBlocked(err)) await markBlockedBot(userId, true).catch(() => {});
      return 'failed';
    }
  }
  return 'failed';
}

async function runJob(api: Api, job: BroadcastJob, stopped: () => boolean): Promise<void> {
  const text = broadcastText(job);
  while (!stopped()) {
    const recipients = await nextBroadcastRecipients(job.id, BATCH);
    if (recipients.length === 0) {
      await finishBroadcast(job.id, 'done');
      return;
    }
    let sent = 0;
    let failed = 0;
    for (const userId of recipients) {
      if ((await sendOne(api, userId, text)) === 'sent') sent++;
      else failed++;
      await sleep(SEND_INTERVAL_MS);
    }
    await recordBroadcastProgress(job.id, sent, failed, recipients[recipients.length - 1]!);
  }
}

/** Start the worker loop; returns a stop function. */
export function startBroadcastWorker(api: Api, storeId: number): () => void {
  let stopped = false;
  void (async () => {
    while (!stopped) {
      try {
        const job = await claimBroadcast(storeId);
        if (!job) {
          await sleep(IDLE_MS);
          continue;
        }
        console.log(`[broadcast] sending #${job.id} (${job.audience})`);
        await runJob(api, job, () => stopped);
      } catch (err) {
        console.error('[broadcast] worker error:', (err as Error).message);
        await sleep(ERROR_BACKOFF_MS);
      }
    }
  })();
  return () => {
    stopped = true;
  };
}
