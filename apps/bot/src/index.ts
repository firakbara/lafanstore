// Multi-store entry: a supervisor keeps one bot per active store running, long polling or webhook.
import { listStores, type StoreInfo } from '@tokobun/core';
import { webhookCallback } from 'grammy';
import { createBot } from './bot';
import type { BotConfig } from './config';
import { parseConfig } from './config';
import { setCommands } from './handlers/commands';
import { createSupervisor, type BotHandle } from './supervisor';
import { startBroadcastWorker } from './workers/broadcast';

const RELOAD_MS = 30_000;
const allowed_updates = ['message', 'callback_query'] as const;

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

async function startStore(store: StoreInfo): Promise<BotHandle> {
  const cfg = storeToConfig(store, baseCfg);
  const bot = createBot(cfg, store.id);
  await bot.init();
  console.log(`[bot] store "${store.name}" → @${bot.botInfo.username}`);
  if (!cfg.adminChatId) console.warn(`[bot]   ⚠ store "${store.name}" has no adminChatId: sale notifications disabled`);
  await setCommands(bot.api).catch((err) => console.warn(`[bot]   setMyCommands failed for "${store.name}":`, (err as Error).message));
  const stopWorker = cfg.broadcastWorker ? startBroadcastWorker(bot.api, store.id) : () => {};

  if (baseCfg.webhookUrl) {
    const webhookPath = `${baseCfg.webhookPath}/${store.slug}`;
    const handler = webhookCallback(bot, 'std/http', { secretToken: baseCfg.webhookSecret ?? undefined });
    await bot.api.setWebhook(`${baseCfg.webhookUrl}${webhookPath}`, {
      secret_token: baseCfg.webhookSecret ?? undefined,
      allowed_updates: [...allowed_updates],
    });
    return {
      storeId: store.id,
      slug: store.slug,
      webhookPath,
      handler,
      stop: async () => {
        stopWorker();
        await bot.api.deleteWebhook().catch(() => {});
      },
    };
  }

  await bot.api.deleteWebhook();
  void bot.start({ allowed_updates: [...allowed_updates] }).catch((err) => console.error(`[bot] polling stopped for "${store.name}":`, (err as Error).message));
  return {
    storeId: store.id,
    slug: store.slug,
    stop: async () => {
      stopWorker();
      await bot.stop();
    },
  };
}

const supervisor = createSupervisor({
  loadStores: listStores,
  startStore,
  log: console,
  now: () => Date.now(),
});

await supervisor.tick();
const timer = setInterval(() => void supervisor.tick(), RELOAD_MS);
console.log(`[bot] supervisor running (${supervisor.running().size} bot(s), reload every ${RELOAD_MS / 1000}s, ${baseCfg.webhookUrl ? 'webhook' : 'long polling'})`);

let server: ReturnType<typeof Bun.serve> | null = null;
if (baseCfg.webhookUrl) {
  const MAX_WEBHOOK_BYTES = 1_000_000; // 1 MB
  server = Bun.serve({
    port: baseCfg.port,
    fetch(req) {
      const url = new URL(req.url);
      if (req.method === 'POST') {
        const cl = req.headers.get('content-length');
        if (cl && Number(cl) > MAX_WEBHOOK_BYTES) return new Response('payload too large', { status: 413 });
        const handler = supervisor.handlerFor(url.pathname);
        if (handler) return handler(req);
      }
      if (url.pathname === '/health') return new Response('ok');
      return new Response('not found', { status: 404 });
    },
  });
  console.log(`[bot] webhook server on :${server.port}`);
}

process.on('unhandledRejection', (reason) => {
  console.error('[bot] unhandled rejection:', reason);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sig, async () => {
    console.log(`[bot] ${sig}, stopping ${supervisor.running().size} bot(s)`);
    const forceTimer = setTimeout(() => {
      console.error('[bot] shutdown timed out, forcing exit');
      process.exit(1);
    }, 10_000);
    if (typeof forceTimer === 'object' && 'unref' in forceTimer) forceTimer.unref();
    clearInterval(timer);
    await supervisor.stopAll();
    await server?.stop();
    clearTimeout(forceTimer);
    process.exit(0);
  });
}
