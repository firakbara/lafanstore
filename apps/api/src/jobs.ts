export interface Job {
  name: string;
  run: () => Promise<unknown>;
}

/** Runs `jobs` every `intervalMs` (and once at start). A tick is skipped while the previous one is
 *  still running, so slow DB calls never overlap. Each job's failure is logged and isolated. */
export function startJobs(jobs: Job[], opts: { intervalMs?: number; log?: Pick<Console, 'error' | 'info'>; runAtStart?: boolean } = {}) {
  const log = opts.log ?? console;
  let running = false;

  async function tick(): Promise<'ran' | 'skipped'> {
    if (running) return 'skipped';
    running = true;
    try {
      for (const job of jobs) {
        try {
          const r = await job.run();
          if (typeof r === 'number' && r > 0) log.info(`[jobs] ${job.name}: ${r}`);
        } catch (err) {
          log.error(`[jobs] ${job.name} failed:`, err);
        }
      }
      return 'ran';
    } finally {
      running = false;
    }
  }

  const timer = setInterval(() => void tick(), opts.intervalMs ?? 60_000);
  if (opts.runAtStart !== false) void tick();
  return {
    tick,
    stop: () => clearInterval(timer),
  };
}
