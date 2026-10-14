// Loads the monorepo root .env (Bun only auto-loads .env from the cwd). Existing env vars win.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function loadRootEnv(): void {
  const envPath = join(import.meta.dir, '..', '..', '..', '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    const k = m[1]!;
    if (process.env[k] !== undefined) continue;
    process.env[k] = m[2]!.replace(/^(['"])(.*)\1$/, '$2');
  }
}
