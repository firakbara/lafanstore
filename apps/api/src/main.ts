// Entry point: `bun run dev` (loads ../../.env via --env-file).
import { cancelExpiredOrders, expireStalePayments } from '@tokobun/core';
import { createApp } from './app';
import { createRealDeps } from './deps';
import { startJobs } from './jobs';

const port = Number(process.env.API_PORT) || 3100;
const app = createApp(createRealDeps());

const jobs = startJobs(
  [
    { name: 'expireStalePayments', run: () => expireStalePayments() },
    { name: 'cancelExpiredOrders', run: () => cancelExpiredOrders() },
  ],
  { intervalMs: 60_000 },
);

const server = Bun.serve({ port, fetch: app.fetch });
console.info(`[api] listening on http://localhost:${server.port}`);

process.on('unhandledRejection', (reason) => {
  console.error('[api] unhandled rejection:', reason);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sig, () => {
    jobs.stop();
    void server.stop();
    process.exit(0);
  });
}
