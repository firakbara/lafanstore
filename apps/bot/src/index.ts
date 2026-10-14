// Multi-store entry: starts one bot per active store, long polling or webhook.
import { listActiveStores, type StoreInfo } from '@tokobun/core';
import { Bot, webhookCallback } from 'grammy';
import { createBot } from './bot';
import type { BotConfig } from './config';
import { parseConfig } from './config';
import type { BotContext } from './context';
import { setCommands } from './handlers/commands';
import { startBroadcastWorker } from './workers/broadcast';

function storeToConfig(store: StoreInfo, base: BotConfig): BotConfig {
  return {
    ...base,
    botToken: store.botToken,
    botUsername: store.botUsername,
    adminIds: store.adminIds,
    adminChatId: store.adminChatId,
    channelUrl: store.channelUrl,
  };
}

const baseCfg = parseConfig(process.env);
const stores = await listActiveStores();

if (!stores.length) {
  console.error('[bot] no active stores found — add a store to the database first');
  process.exit(1);
}

console.log(`[bot] found ${stores.length} active store(s)`);

const bots: { bot: Bot<BotContext>; store: StoreInfo; stopWorker: () => void }[] = [];

for (const store of stores) {
  try {
    const cfg = storeToConfig(store, baseCfg);
    const bot = createBot(cfg, store.id);
    await bot.init();
    console.log(`[bot] store "${store.name}" → @${bot.botInfo.username}`);
    if (!cfg.adminChatId) console.warn(`[bot]   ⚠ store "${store.name}" has no adminChatId: sale notifications disabled`);
    await setCommands(bot.api).catch((err) => console.warn(`[bot]   setMyCommands failed for "${store.name}":`, (err as Error).message));
    const stopWorker = cfg.broadcastWorker ? startBroadcastWorker(bot.api, store.id) : () => {};
    bots.push({ bot, store, stopWorker });
  } catch (err) {
    console.error(`[bot] ✗ store "${store.name}" (id=${store.id}) failed to start:`, (err as Error).message);
  }
}

if (!bots.length) {
  console.error('[bot] no bots started successfully — check bot tokens');
  process.exit(1);
}

const allowed_updates = ['message', 'callback_query'] as const;

let shutdown: () => Promise<void>;
if (baseCfg.webhookUrl) {
  const handlers = new Map<string, (req: Request) => Response | Promise<Response>>();
  for (const { bot, store } of bots) {
    const path = `${baseCfg.webhookPath}/${store.slug}`;
    const handle = webhookCallback(bot, 'std/http', { secretToken: baseCfg.webhookSecret ?? undefined });
    handlers.set(path, handle);
    await bot.api.setWebhook(`${baseCfg.webhookUrl}${path}`, {
      secret_token: baseCfg.webhookSecret ?? undefined,
      allowed_updates: [...allowed_updates],
    });
    console.log(`[bot]   webhook: ${path}`);
  }
  const MAX_WEBHOOK_BYTES = 1_000_000; // 1 MB
  const server = Bun.serve({
    port: baseCfg.port,
    fetch(req) {
      const url = new URL(req.url);
      if (req.method === 'POST') {
        const cl = req.headers.get('content-length');
        if (cl && Number(cl) > MAX_WEBHOOK_BYTES) return new Response('payload too large', { status: 413 });
        const handler = handlers.get(url.pathname);
        if (handler) return handler(req);
      }
      if (url.pathname === '/health') return new Response('ok');
      return new Response('not found', { status: 404 });
    },
  });
  console.log(`[bot] webhook server on :${server.port}`);
  shutdown = async () => {
    await server.stop();
  };
} else {
  for (const { bot } of bots) {
    await bot.api.deleteWebhook();
    void bot.start({ allowed_updates: [...allowed_updates] });
  }
  console.log(`[bot] long polling started for ${bots.length} bot(s)`);
  shutdown = async () => {
    await Promise.all(bots.map(({ bot }) => bot.stop()));
  };
}

process.on('unhandledRejection', (reason) => {
  console.error('[bot] unhandled rejection:', reason);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sig, async () => {
    console.log(`[bot] ${sig}, stopping ${bots.length} bot(s)`);
    const forceTimer = setTimeout(() => {
      console.error('[bot] shutdown timed out, forcing exit');
      process.exit(1);
    }, 10_000);
    if (typeof forceTimer === 'object' && 'unref' in forceTimer) forceTimer.unref();
    for (const { stopWorker } of bots) stopWorker();
    await shutdown();
    clearTimeout(forceTimer);
    process.exit(0);
  });
}
