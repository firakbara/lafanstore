# Store-scoped Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every admin page and API request names its store in the URL (`/toko/<slug>/…`, `/api/toko/<slug>/…`), the panel starts on a store picker, store bot settings are editable with token verification, and the bot process starts/stops store bots on its own.

**Architecture:** SvelteKit route trees move under `[store]` params; `hooks.server.ts` resolves the store from `event.params.store`; client code builds URLs through two small helpers. Store membership tables are dropped (no roles). The bot entry point delegates to a supervisor that reconciles running bots against the `stores` table every 30 s.

**Tech Stack:** Bun 1.4, SvelteKit (Svelte 5 runes) + TanStack Svelte Query/Form, Drizzle ORM + Postgres 17, grammY, `bun test`.

**Spec:** `docs/superpowers/specs/2026-10-14-store-scoped-admin-design.md`

---

## Execution model

- Two waves of three tasks. Tasks in the same wave touch disjoint files and run in parallel in separate git worktrees.
  - **Wave 1:** Task 1 (DB + core), Task 2 (bot supervisor), Task 3 (admin foundation).
  - **Wave 2** starts after wave 1 is merged: Task 4 (admin API), Task 5 (admin shell + new pages), Task 6 (store pages move).
- `listStores()` already exists in `@tokobun/core` (added before wave 1).
- Worktree setup for every task:
  ```bash
  cp /c/Firman/Project/tokobun/.env .        # gitignored; tests read TEST_DATABASE_URL from it
  bun install
  (cd apps/admin && bunx svelte-kit sync)
  ```
- Local Postgres runs at `localhost:5433` (docker compose service `postgres`, already up). Test DB: `tokobun_test`.
- Commit with messages ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Code style: match the surrounding code. Admin files use tabs and single quotes. Bot/core files use 2 spaces and single quotes.
- **Interfaces fixed by this plan.** Implement exactly these; other tasks code against them:
  - `@tokobun/core`: `listStores(): Promise<StoreInfo[]>` (exists), `getStoreBySlug(slug)` (exists), `createStore`, `updateStore` (exist). Removed: `getStoresForAdmin`, `addStoreMember`, `removeStoreMember`.
  - `apps/admin/src/lib/store-path.ts`: `STORE_SECTIONS`, `storeHref(slug, path?)`, `storeApi(slug, path)`, `switchTarget(pathname, toSlug)`, `legacyRedirect(pathname, search, slug)`.
  - `apps/admin/src/lib/current-store.ts`: `currentSlug()`, `link(path?)`, `apiUrl(path)`.
  - `apps/admin/src/lib/server/telegram.ts`: `verifyBotToken(token, fetchImpl?, timeoutMs?)`.
  - `apps/admin/src/lib/server/auth.ts`: `listAllAdmins()`, `deleteAdminGuard(actorId, targetId, total)`, `deleteAdmin(actorId, targetId)`.
  - `App.Locals`: `store: PublicStore | null`, `storeId: number` (0 outside store routes), `lastStore: string | null`. `adminStores` is removed.
  - `PublicStore` (no bot token): `{ id: number; slug: string; name: string; botUsername: string | null; adminIds: number[]; adminChatId: number | null; channelUrl: string | null; isActive: boolean }`. Exported from `apps/admin/src/lib/server/stores.ts` together with `toPublicStore(s: StoreInfo): PublicStore`.
  - Store layout data (`routes/(app)/toko/[store]/+layout.server.ts`, Task 5) returns `{ store: PublicStore, stores: { slug: string; name: string; isActive: boolean }[], currency: string | null, currencies: string[], storeName: string }`.

---

## Task 1: Database + core (wave 1)

**Files:**
- Modify: `packages/db/src/schema.ts` (remove `storeMemberRole`, `storeMembers`)
- Delete: `packages/db/drizzle/0001_grey_hemingway.sql`, `packages/db/drizzle/0002_add-missing-indexes.sql`, `packages/db/drizzle/0003_unique-bot-token.sql`
- Create (generated): `packages/db/drizzle/0002_store-scoped-admin.sql`, `packages/db/drizzle/meta/0002_snapshot.json`; modify `packages/db/drizzle/meta/_journal.json`
- Modify: `packages/core/src/services/stores.ts`, `packages/core/src/index.ts`
- Modify: `packages/core/test/helpers.ts`, `packages/core/test/misc.test.ts`

- [ ] **Step 1: Remove membership from the schema**

In `packages/db/src/schema.ts` delete the whole `storeMemberRole` enum and the `storeMembers` table (currently lines ~38-50). Keep the `pgEnum` import only if other enums still use it (they do: `ledger_type` etc.).

- [ ] **Step 2: Delete the three migration files that are not in the journal**

```bash
cd packages/db
git rm drizzle/0001_grey_hemingway.sql drizzle/0002_add-missing-indexes.sql drizzle/0003_unique-bot-token.sql
```

The last two were never applied anywhere because they were missing from `_journal.json`. Their statements are regenerated from `schema.ts` in Step 3.

- [ ] **Step 3: Generate the migration**

```bash
cd packages/db
DATABASE_URL=postgres://tokobun:tokobun@localhost:5433/tokobun bunx drizzle-kit generate --name store-scoped-admin
```

Expected: a new `drizzle/0002_store-scoped-admin.sql`, a `drizzle/meta/0002_snapshot.json`, and a third journal entry.

- [ ] **Step 4: Review the generated SQL**

It must contain exactly these statements, in any order, separated by `--> statement-breakpoint`:
- `DROP TABLE "store_members"` (with or without `CASCADE`)
- `DROP TYPE "public"."store_member_role"`
- `ALTER TABLE "stores" ADD CONSTRAINT "stores_bot_token_unique" UNIQUE("bot_token")`
- `CREATE INDEX "referral_payouts_user_idx" ON "referral_payouts" USING btree ("user_id")`
- `CREATE INDEX "api_keys_user_idx" ON "api_keys" USING btree ("user_id")`
- `CREATE INDEX "admin_sessions_admin_idx" ON "admin_sessions" USING btree ("admin_id")`

If drizzle-kit emits anything else, the 0001 snapshot and the real database differ.
- Check the statement against the test DB (`docker compose exec -T postgres psql -U tokobun -d tokobun_test -c '\d <table>'`), which has 0000+0001 applied, exactly like production.
- If the object already exists there in the target form, delete the statement from the SQL file. The snapshot stays as generated.
- If drizzle puts `DROP TABLE` after `DROP TYPE`, reorder so the table is dropped first.

- [ ] **Step 5: Prove migrations apply cleanly on a fresh database and on the existing test DB**

```bash
docker compose exec -T postgres psql -U tokobun -d tokobun -c 'DROP DATABASE IF EXISTS tokobun_migcheck' -c 'CREATE DATABASE tokobun_migcheck'
cd packages/db
bun run src/migrate.ts postgres://tokobun:tokobun@localhost:5433/tokobun_migcheck   # expect "migrations applied"
bun run src/migrate.ts postgres://tokobun:tokobun@localhost:5433/tokobun_test       # expect "migrations applied"
DATABASE_URL=postgres://tokobun:tokobun@localhost:5433/tokobun bunx drizzle-kit generate --name should-be-empty
```

Expected from the last command: `No schema changes, nothing to migrate`. If it generates a file, delete that file and fix the snapshot/SQL mismatch.

Then confirm in `tokobun_migcheck`:
- `\d stores` shows `stores_bot_token_unique`;
- `\dt store_members` reports no relation.

Finally drop the scratch DB:
```bash
docker compose exec -T postgres psql -U tokobun -d tokobun -c 'DROP DATABASE tokobun_migcheck'
```

- [ ] **Step 6: Remove membership from core**

In `packages/core/src/services/stores.ts`:
- delete `getStoresForAdmin`, `addStoreMember`, `removeStoreMember`;
- change the import to `import { stores } from '@tokobun/db';` and drop `and` from the drizzle import if it becomes unused.

In `packages/core/src/index.ts` delete the three wrapper exports.

- [ ] **Step 7: Update test helpers**

In `packages/core/test/helpers.ts`:
- remove `storeMembers` from the import;
- remove the `await d.delete(storeMembers);` line.

- [ ] **Step 8: Replace the membership test with store tests (TDD for the remaining behaviour)**

In `packages/core/test/misc.test.ts`:
- remove `addStoreMember`, `getStoresForAdmin`, `removeStoreMember` from the import list and add `listStores`, `createStore`, `updateStore` if they are not already imported;
- replace the test block that uses `addStoreMember` (around lines 280-295) with:

```ts
  test('listStores returns active and inactive stores ordered by id', async () => {
    const a = await createStore({ slug: 'store-a', name: 'A', botToken: '1111:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' });
    const b = await createStore({ slug: 'store-b', name: 'B', botToken: '2222:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' });
    await updateStore(b.id, { isActive: false });
    const all = await listStores();
    const ids = all.map((s) => s.id);
    expect(ids).toEqual([...ids].sort((x, y) => x - y));
    expect(all.find((s) => s.id === a.id)?.isActive).toBe(true);
    expect(all.find((s) => s.id === b.id)?.isActive).toBe(false);
  });

  test('createStore rejects a duplicate slug and a duplicate bot token', async () => {
    await createStore({ slug: 'dup', name: 'D', botToken: '3333:CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC' });
    await expect(createStore({ slug: 'dup', name: 'D2', botToken: '4444:DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD' })).rejects.toThrow('slug');
    await expect(createStore({ slug: 'dup-2', name: 'D3', botToken: '3333:CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC' })).rejects.toThrow('bot token');
  });
```

Keep the surrounding `describe` and the `resetDb()` usage the file already has. If the file's existing store tests already cover the duplicate cases, keep only `listStores`.

- [ ] **Step 9: Run the core, payments and api suites**

```bash
(cd packages/core && bun test) && (cd packages/payments && bun test) && (cd apps/api && bun test)
```

Expected: all pass (core had 206 before this task; the count changes by the tests you added or removed).

Also typecheck:
```bash
(cd packages/core && bunx tsc --noEmit -p .) && (cd packages/db && bunx tsc --noEmit -p .)
```

- [ ] **Step 10: Commit**

```bash
git add -A packages/db packages/core
git commit -m "feat(db): drop store memberships, register missing indexes and unique bot token"
```

---

## Task 2: Bot supervisor (wave 1)

**Files:**
- Create: `apps/bot/src/reconcile.ts`, `apps/bot/src/supervisor.ts`
- Modify: `apps/bot/src/index.ts`, `apps/bot/src/config.ts`
- Test: `apps/bot/test/reconcile.test.ts`, `apps/bot/test/supervisor.test.ts`; modify `apps/bot/test/config.test.ts`

- [ ] **Step 1: Write the failing reconcile tests**

`apps/bot/test/reconcile.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import type { StoreInfo } from '@tokobun/core';
import { planReconcile, RETRY_FAILED_MS, storeFingerprint } from '../src/reconcile';

const store = (id: number, over: Partial<StoreInfo> = {}): StoreInfo => ({
  id,
  slug: `s${id}`,
  name: `Store ${id}`,
  botToken: `${id}000:TOKEN${id}`,
  botUsername: `bot${id}`,
  adminIds: [],
  adminChatId: null,
  channelUrl: null,
  isActive: true,
  ...over,
});

describe('planReconcile', () => {
  test('starts new active stores', () => {
    const p = planReconcile(new Map(), new Map(), [store(1), store(2)], 0);
    expect(p.start.map((s) => s.id)).toEqual([1, 2]);
    expect(p.restart).toEqual([]);
    expect(p.stop).toEqual([]);
  });

  test('ignores inactive stores and stops running ones that became inactive', () => {
    const s1 = store(1);
    const p = planReconcile(new Map([[1, storeFingerprint(s1)]]), new Map(), [store(1, { isActive: false }), store(2, { isActive: false })], 0);
    expect(p.start).toEqual([]);
    expect(p.stop).toEqual([1]);
  });

  test('stops running stores that disappeared', () => {
    const p = planReconcile(new Map([[9, 'x']]), new Map(), [], 0);
    expect(p.stop).toEqual([9]);
  });

  test('keeps unchanged stores and restarts changed ones', () => {
    const s1 = store(1);
    const s2 = store(2);
    const running = new Map([
      [1, storeFingerprint(s1)],
      [2, storeFingerprint(s2)],
    ]);
    const p = planReconcile(running, new Map(), [s1, store(2, { botToken: '2000:NEW' })], 0);
    expect(p.start).toEqual([]);
    expect(p.restart.map((s) => s.id)).toEqual([2]);
    expect(p.stop).toEqual([]);
  });

  test('restarts when admin ids, admin chat or channel change', () => {
    const s1 = store(1);
    const running = new Map([[1, storeFingerprint(s1)]]);
    expect(planReconcile(running, new Map(), [store(1, { adminIds: [5] })], 0).restart).toHaveLength(1);
    expect(planReconcile(running, new Map(), [store(1, { adminChatId: -100 })], 0).restart).toHaveLength(1);
    expect(planReconcile(running, new Map(), [store(1, { channelUrl: 'https://t.me/x' })], 0).restart).toHaveLength(1);
    expect(planReconcile(running, new Map(), [store(1, { name: 'Renamed' })], 0).restart).toHaveLength(0);
  });

  test('backs off a failed store until its config changes or the retry window passes', () => {
    const s1 = store(1);
    const failed = new Map([[1, { fingerprint: storeFingerprint(s1), failedAt: 1_000 }]]);
    expect(planReconcile(new Map(), failed, [s1], 1_000 + RETRY_FAILED_MS - 1).start).toEqual([]);
    expect(planReconcile(new Map(), failed, [s1], 1_000 + RETRY_FAILED_MS).start.map((s) => s.id)).toEqual([1]);
    expect(planReconcile(new Map(), failed, [store(1, { botToken: '1000:FIXED' })], 1_001).start.map((s) => s.id)).toEqual([1]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/bot && bun test test/reconcile.test.ts`
Expected: FAIL, `Cannot find module '../src/reconcile'`.

- [ ] **Step 3: Implement `apps/bot/src/reconcile.ts`**

```ts
// Pure diff between the bots that are running and the stores in the database.
import type { StoreInfo } from '@tokobun/core';

/** A failed store is retried after this long even when its config did not change. */
export const RETRY_FAILED_MS = 5 * 60_000;

export interface FailedStart {
  fingerprint: string;
  failedAt: number;
}

export interface ReconcilePlan {
  start: StoreInfo[];
  restart: StoreInfo[];
  stop: number[];
}

/** Fields that the running bot depends on; any change means the bot must be restarted. */
export function storeFingerprint(s: StoreInfo): string {
  return JSON.stringify([s.botToken, s.botUsername, s.adminIds, s.adminChatId, s.channelUrl]);
}

export function planReconcile(
  running: ReadonlyMap<number, string>,
  failed: ReadonlyMap<number, FailedStart>,
  stores: StoreInfo[],
  now: number,
): ReconcilePlan {
  const plan: ReconcilePlan = { start: [], restart: [], stop: [] };
  const active = stores.filter((s) => s.isActive);
  const activeIds = new Set(active.map((s) => s.id));
  for (const s of active) {
    const fp = storeFingerprint(s);
    const current = running.get(s.id);
    if (current !== undefined) {
      if (current !== fp) plan.restart.push(s);
      continue;
    }
    const f = failed.get(s.id);
    if (f && f.fingerprint === fp && now - f.failedAt < RETRY_FAILED_MS) continue;
    plan.start.push(s);
  }
  for (const id of running.keys()) if (!activeIds.has(id)) plan.stop.push(id);
  return plan;
}
```

- [ ] **Step 4: Run reconcile tests**

Run: `cd apps/bot && bun test test/reconcile.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Write the failing supervisor tests**

`apps/bot/test/supervisor.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import type { StoreInfo } from '@tokobun/core';
import { createSupervisor, type BotHandle } from '../src/supervisor';

const store = (id: number, over: Partial<StoreInfo> = {}): StoreInfo => ({
  id, slug: `s${id}`, name: `S${id}`, botToken: `${id}000:T${id}`, botUsername: null,
  adminIds: [], adminChatId: null, channelUrl: null, isActive: true, ...over,
});

function harness(initial: StoreInfo[], failIds: number[] = []) {
  let stores = initial;
  const events: string[] = [];
  let now = 0;
  const sup = createSupervisor({
    loadStores: async () => stores,
    startStore: async (s): Promise<BotHandle> => {
      if (failIds.includes(s.id)) throw new Error(`bad token ${s.id}`);
      events.push(`start:${s.id}`);
      return { storeId: s.id, slug: s.slug, stop: async () => void events.push(`stop:${s.id}`) };
    },
    log: { info: () => {}, warn: () => {}, error: () => {} },
    now: () => now,
  });
  return {
    sup,
    events,
    setStores: (s: StoreInfo[]) => (stores = s),
    advance: (ms: number) => (now += ms),
  };
}

describe('supervisor', () => {
  test('starts, restarts and stops bots across ticks', async () => {
    const h = harness([store(1), store(2)]);
    await h.sup.tick();
    expect(h.events).toEqual(['start:1', 'start:2']);
    h.setStores([store(1), store(2, { botToken: '2000:NEW' }), store(3)]);
    await h.sup.tick();
    expect(h.events.slice(2)).toEqual(['stop:2', 'start:2', 'start:3']);
    h.setStores([store(1, { isActive: false }), store(2, { botToken: '2000:NEW' }), store(3)]);
    await h.sup.tick();
    expect(h.events.slice(5)).toEqual(['stop:1']);
    expect([...h.sup.running().keys()].sort()).toEqual([2, 3]);
  });

  test('a failing store does not block others and is retried only after backoff', async () => {
    const h = harness([store(1), store(2)], [1]);
    await h.sup.tick();
    expect(h.events).toEqual(['start:2']);
    await h.sup.tick();
    expect(h.events).toEqual(['start:2']);
  });

  test('overlapping ticks do not double-start', async () => {
    const h = harness([store(1)]);
    await Promise.all([h.sup.tick(), h.sup.tick()]);
    expect(h.events).toEqual(['start:1']);
  });

  test('stopAll stops every running bot', async () => {
    const h = harness([store(1), store(2)]);
    await h.sup.tick();
    await h.sup.stopAll();
    expect(h.events.filter((e) => e.startsWith('stop')).sort()).toEqual(['stop:1', 'stop:2']);
    expect(h.sup.running().size).toBe(0);
  });

  test('handlerFor returns the webhook handler of a running bot', async () => {
    const h = harness([]);
    const sup = createSupervisor({
      loadStores: async () => [store(7)],
      startStore: async (s) => ({ storeId: s.id, slug: s.slug, stop: async () => {}, webhookPath: '/telegram/s7', handler: () => new Response('ok') }),
      log: { info: () => {}, warn: () => {}, error: () => {} },
      now: () => 0,
    });
    await sup.tick();
    expect(sup.handlerFor('/telegram/s7')).toBeDefined();
    expect(sup.handlerFor('/telegram/other')).toBeUndefined();
    void h;
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `cd apps/bot && bun test test/supervisor.test.ts`
Expected: FAIL, `Cannot find module '../src/supervisor'`.

- [ ] **Step 7: Implement `apps/bot/src/supervisor.ts`**

```ts
// Keeps one running bot per active store in sync with the database.
import type { StoreInfo } from '@tokobun/core';
import { planReconcile, storeFingerprint, type FailedStart } from './reconcile';

export interface BotHandle {
  storeId: number;
  slug: string;
  stop(): Promise<void>;
  /** Webhook mode only: path served by the webhook server and its handler. */
  webhookPath?: string;
  handler?: (req: Request) => Response | Promise<Response>;
}

export interface SupervisorDeps {
  loadStores(): Promise<StoreInfo[]>;
  /** Starts the bot for a store; throws when it cannot (bad token, Telegram down). */
  startStore(store: StoreInfo): Promise<BotHandle>;
  log: { info(...a: unknown[]): void; warn(...a: unknown[]): void; error(...a: unknown[]): void };
  now(): number;
}

export function createSupervisor(deps: SupervisorDeps) {
  const handles = new Map<number, BotHandle>();
  const fingerprints = new Map<number, string>();
  const failed = new Map<number, FailedStart>();
  let busy: Promise<void> | null = null;
  let warnedEmpty = false;

  async function stopOne(id: number): Promise<void> {
    const h = handles.get(id);
    handles.delete(id);
    fingerprints.delete(id);
    if (!h) return;
    try {
      await h.stop();
    } catch (err) {
      deps.log.error(`[bot] store id=${id} stop failed:`, (err as Error).message);
    }
  }

  async function startOne(s: StoreInfo): Promise<void> {
    const fp = storeFingerprint(s);
    try {
      const h = await deps.startStore(s);
      handles.set(s.id, h);
      fingerprints.set(s.id, fp);
      failed.delete(s.id);
      deps.log.info(`[bot] store "${s.name}" (${s.slug}) running`);
    } catch (err) {
      failed.set(s.id, { fingerprint: fp, failedAt: deps.now() });
      deps.log.error(`[bot] ✗ store "${s.name}" (id=${s.id}) failed to start:`, (err as Error).message);
    }
  }

  async function run(): Promise<void> {
    let stores: StoreInfo[];
    try {
      stores = await deps.loadStores();
    } catch (err) {
      deps.log.error('[bot] loading stores failed:', (err as Error).message);
      return;
    }
    const plan = planReconcile(fingerprints, failed, stores, deps.now());
    for (const id of plan.stop) await stopOne(id);
    for (const s of plan.restart) {
      await stopOne(s.id);
      await startOne(s);
    }
    for (const s of plan.start) await startOne(s);
    if (!stores.some((s) => s.isActive)) {
      if (!warnedEmpty) deps.log.warn('[bot] no active stores yet — waiting for one to be added in the admin panel');
      warnedEmpty = true;
    } else {
      warnedEmpty = false;
    }
  }

  return {
    /** One reconcile pass. Concurrent calls share the pass already in flight. */
    tick(): Promise<void> {
      busy ??= run().finally(() => {
        busy = null;
      });
      return busy;
    },
    async stopAll(): Promise<void> {
      if (busy) await busy;
      await Promise.all([...handles.keys()].map((id) => stopOne(id)));
    },
    running(): ReadonlyMap<number, BotHandle> {
      return handles;
    },
    handlerFor(path: string): ((req: Request) => Response | Promise<Response>) | undefined {
      for (const h of handles.values()) if (h.webhookPath === path) return h.handler;
      return undefined;
    },
  };
}
```

- [ ] **Step 8: Run supervisor tests**

Run: `cd apps/bot && bun test test/supervisor.test.ts test/reconcile.test.ts`
Expected: PASS.

- [ ] **Step 9: Make `BOT_TOKEN` optional (TDD)**

In `apps/bot/test/config.test.ts`, replace the `throws when BOT_TOKEN missing` test with:

```ts
	test('BOT_TOKEN is optional (stores come from the database)', () => {
		expect(parseConfig({}).botToken).toBe('');
		expect(parseConfig({ BOT_TOKEN: '  ' }).botToken).toBe('');
	});
```

Keep the file's indentation style. Run `cd apps/bot && bun test test/config.test.ts`: expect FAIL.

Then in `apps/bot/src/config.ts` replace
```ts
  const botToken = str(env.BOT_TOKEN);
  if (!botToken) throw new Error('BOT_TOKEN is not set (get one from @BotFather and put it in the root .env)');
```
with
```ts
  // Per-store tokens live in the stores table; BOT_TOKEN is only a legacy fallback value.
  const botToken = str(env.BOT_TOKEN) ?? '';
```
Run `cd apps/bot && bun test test/config.test.ts`: expect PASS.

- [ ] **Step 10: Rewrite `apps/bot/src/index.ts` around the supervisor**

Replace the whole file with:

```ts
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
```

Before replacing, read the current `index.ts` and carry over anything this listing does not cover, such as extra logging or options passed to `createBot`. `listStores` returns inactive stores too; `planReconcile` filters them.

- [ ] **Step 11: Typecheck and run the whole bot suite**

```bash
cd apps/bot && bunx tsc --noEmit -p . && bun test
```
Expected: no type errors; all tests pass (756 before, plus the new ones).

- [ ] **Step 12: Smoke run against the local DB**

```bash
cd apps/bot && timeout 15 bun --env-file=../../.env src/index.ts; echo "exit $?"
```

Expected:
- The log shows `supervisor running`.
- With no valid tokens locally, it logs `failed to start` per store or the "no active stores" warning.
- It keeps running until the timeout (`exit 124`). It must not exit with 1.

- [ ] **Step 13: Commit**

```bash
git add apps/bot
git commit -m "feat(bot): supervisor reconciles store bots every 30s; BOT_TOKEN optional"
```

---

## Task 3: Admin foundation (wave 1)

**Files:**
- Create: `apps/admin/src/lib/store-path.ts`, `apps/admin/src/lib/store-path.test.ts`
- Create: `apps/admin/src/lib/current-store.ts`
- Create: `apps/admin/src/lib/server/telegram.ts`, `apps/admin/src/lib/server/telegram.test.ts`
- Create: `apps/admin/src/lib/server/stores.ts`
- Modify: `apps/admin/src/lib/server/auth.ts`, `apps/admin/src/lib/server/session.ts`, `apps/admin/src/lib/server/session.test.ts` (only if it references `STORE_COOKIE`)
- Create: `apps/admin/src/lib/server/admins.test.ts`
- Modify: `apps/admin/src/hooks.server.ts`, `apps/admin/src/app.d.ts`

Do NOT touch anything under `apps/admin/src/routes/`. Tasks 4-6 own it. Route files that still reference removed names (`locals.adminStores`, `STORE_COOKIE`, `addStoreMember`) will fail `svelte-check` until wave 2; that is expected. Only files this task owns must be error-free.

- [ ] **Step 1: Write failing tests for the path helpers**

`apps/admin/src/lib/store-path.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { legacyRedirect, storeApi, storeHref, switchTarget } from './store-path';

describe('storeHref / storeApi', () => {
	test('builds store page paths', () => {
		expect(storeHref('patungin')).toBe('/toko/patungin');
		expect(storeHref('patungin', '/')).toBe('/toko/patungin');
		expect(storeHref('patungin', '/orders')).toBe('/toko/patungin/orders');
		expect(storeHref('patungin', 'orders/5?x=1')).toBe('/toko/patungin/orders/5?x=1');
	});
	test('builds store API paths', () => {
		expect(storeApi('patungin', '/orders')).toBe('/api/toko/patungin/orders');
		expect(storeApi('patungin', 'products/options?kind=sellable')).toBe('/api/toko/patungin/products/options?kind=sellable');
	});
});

describe('switchTarget', () => {
	test('keeps the section and drops detail ids', () => {
		expect(switchTarget('/toko/a/orders/15', 'b')).toBe('/toko/b/orders');
		expect(switchTarget('/toko/a/products/new', 'b')).toBe('/toko/b/products');
		expect(switchTarget('/toko/a/settings', 'b')).toBe('/toko/b/settings');
	});
	test('falls back to the dashboard', () => {
		expect(switchTarget('/toko/a', 'b')).toBe('/toko/b');
		expect(switchTarget('/toko/a/unknown', 'b')).toBe('/toko/b');
		expect(switchTarget('/akun', 'b')).toBe('/toko/b');
	});
});

describe('legacyRedirect', () => {
	test('maps old section URLs into the store, keeping the query', () => {
		expect(legacyRedirect('/orders', '?status=paid', 'patungin')).toBe('/toko/patungin/orders?status=paid');
		expect(legacyRedirect('/users/42', '', 'patungin')).toBe('/toko/patungin/users/42');
		expect(legacyRedirect('/settings', '', 'x')).toBe('/toko/x/settings');
	});
	test('goes to the picker when there is no store', () => {
		expect(legacyRedirect('/orders', '', null)).toBe('/');
	});
	test('ignores non-legacy paths', () => {
		for (const p of ['/', '/akun', '/login', '/toko/a/orders', '/api/orders', '/ordersx']) expect(legacyRedirect(p, '', 'a')).toBeNull();
	});
});
```

Run: `cd apps/admin && bun test src/lib/store-path.test.ts`. Expected: FAIL (module missing).

- [ ] **Step 2: Implement `apps/admin/src/lib/store-path.ts`**

```ts
// Pure URL helpers for store-scoped admin routes (/toko/<slug>/… and /api/toko/<slug>/…).

/** First path segment of every page that lives inside a store. */
export const STORE_SECTIONS = ['products', 'stock', 'orders', 'payments', 'users', 'vouchers', 'broadcasts', 'support', 'payouts', 'settings'] as const;

const isSection = (s: string | undefined): boolean => !!s && (STORE_SECTIONS as readonly string[]).includes(s);
const withSlash = (p: string): string => (p.startsWith('/') ? p : `/${p}`);

export function storeHref(slug: string, path = ''): string {
	const p = path === '' || path === '/' ? '' : withSlash(path);
	return `/toko/${encodeURIComponent(slug)}${p}`;
}

export function storeApi(slug: string, path: string): string {
	return `/api/toko/${encodeURIComponent(slug)}${withSlash(path)}`;
}

/** Where to go when switching to another store: same section, without detail ids (they belong to the old store). */
export function switchTarget(pathname: string, toSlug: string): string {
	const section = /^\/toko\/[^/]+\/([^/?#]+)/.exec(pathname)?.[1];
	return storeHref(toSlug, isSection(section) ? `/${section}` : '');
}

/** Pre-/toko URLs (e.g. /orders?x=1) → their store-scoped location; null when the path is not a legacy one. */
export function legacyRedirect(pathname: string, search: string, slug: string | null): string | null {
	if (!isSection(pathname.split('/')[1])) return null;
	if (!slug) return '/';
	return storeHref(slug, pathname) + search;
}
```

Run: `cd apps/admin && bun test src/lib/store-path.test.ts`. Expected: PASS.

- [ ] **Step 3: Implement `apps/admin/src/lib/current-store.ts`**

```ts
// Store-scoped URLs for the page that is currently open (/toko/[store]/…).
// Call these during component render or from event handlers / query functions, never at module top level.
import { page } from '$app/state';
import { storeApi, storeHref } from './store-path';

export function currentSlug(): string {
	const slug = page.params.store;
	if (!slug) throw new Error('current-store helpers used outside /toko/[store]');
	return slug;
}

/** Link inside the current store, e.g. link('/orders/5') → /toko/<slug>/orders/5. */
export function link(path = ''): string {
	return storeHref(currentSlug(), path);
}

/** API URL of the current store, e.g. apiUrl('/orders') → /api/toko/<slug>/orders. */
export function apiUrl(path: string): string {
	return storeApi(currentSlug(), path);
}
```

- [ ] **Step 4: Write failing tests for token verification**

`apps/admin/src/lib/server/telegram.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { verifyBotToken } from './telegram';

const fakeFetch = (status: number, body: unknown) =>
	(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('verifyBotToken', () => {
	test('accepts a token Telegram knows and returns the username', async () => {
		const r = await verifyBotToken('1:abc', fakeFetch(200, { ok: true, result: { is_bot: true, username: 'patunginbot' } }));
		expect(r).toEqual({ ok: true, username: 'patunginbot' });
	});
	test('rejects a token Telegram refuses', async () => {
		const r = await verifyBotToken('1:abc', fakeFetch(401, { ok: false, error_code: 401, description: 'Unauthorized' }));
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.reason).toBe('invalid');
	});
	test('treats 404 as an invalid token', async () => {
		const r = await verifyBotToken('1:abc', fakeFetch(404, { ok: false, description: 'Not Found' }));
		expect(r.ok === false && r.reason).toBe('invalid');
	});
	test('reports network failures separately', async () => {
		const failing = (async () => {
			throw new TypeError('fetch failed');
		}) as unknown as typeof fetch;
		const r = await verifyBotToken('1:abc', failing);
		expect(r.ok === false && r.reason).toBe('network');
	});
	test('reports Telegram 5xx as network', async () => {
		const r = await verifyBotToken('1:abc', fakeFetch(502, { ok: false }));
		expect(r.ok === false && r.reason).toBe('network');
	});
	test('calls getMe on the bot API', async () => {
		let called = '';
		const spy = (async (url: string) => {
			called = url;
			return new Response(JSON.stringify({ ok: true, result: { is_bot: true, username: 'x' } }));
		}) as unknown as typeof fetch;
		await verifyBotToken('123:XYZ', spy);
		expect(called).toBe('https://api.telegram.org/bot123:XYZ/getMe');
	});
});
```

Run: `cd apps/admin && bun test src/lib/server/telegram.test.ts`. Expected: FAIL.

- [ ] **Step 5: Implement `apps/admin/src/lib/server/telegram.ts`**

```ts
// Checks a BotFather token against Telegram before it is stored.

export type VerifyResult =
	| { ok: true; username: string }
	| { ok: false; reason: 'invalid' | 'network'; message: string };

export async function verifyBotToken(token: string, fetchImpl: typeof fetch = fetch, timeoutMs = 10_000): Promise<VerifyResult> {
	let res: Response;
	try {
		res = await fetchImpl(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(timeoutMs) });
	} catch {
		return { ok: false, reason: 'network', message: 'Could not reach Telegram to check the bot token. Try again.' };
	}
	if (res.status === 401 || res.status === 404) {
		return { ok: false, reason: 'invalid', message: 'Telegram rejected this bot token. Copy it again from @BotFather.' };
	}
	const body = (await res.json().catch(() => null)) as { ok?: boolean; result?: { is_bot?: boolean; username?: string } } | null;
	if (!res.ok || !body) return { ok: false, reason: 'network', message: `Telegram returned an error (${res.status}). Try again.` };
	if (!body.ok || !body.result?.is_bot || !body.result.username) {
		return { ok: false, reason: 'invalid', message: 'Telegram rejected this bot token. Copy it again from @BotFather.' };
	}
	return { ok: true, username: body.result.username };
}
```

Run: `cd apps/admin && bun test src/lib/server/telegram.test.ts`. Expected: PASS.

- [ ] **Step 6: Implement `apps/admin/src/lib/server/stores.ts`**

```ts
// Store shape that is safe to hand to pages and API responses (no bot token).
import type { StoreInfo } from '@tokobun/core';

export interface PublicStore {
	id: number;
	slug: string;
	name: string;
	botUsername: string | null;
	adminIds: number[];
	adminChatId: number | null;
	channelUrl: string | null;
	isActive: boolean;
}

export function toPublicStore(s: StoreInfo): PublicStore {
	return {
		id: s.id,
		slug: s.slug,
		name: s.name,
		botUsername: s.botUsername,
		adminIds: s.adminIds,
		adminChatId: s.adminChatId,
		channelUrl: s.channelUrl,
		isActive: s.isActive
	};
}
```

- [ ] **Step 7: Write failing tests for the account-deletion guard**

`apps/admin/src/lib/server/admins.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { deleteAdminGuard } from './auth';

describe('deleteAdminGuard', () => {
	test('refuses to delete your own account', () => {
		expect(deleteAdminGuard(1, 1, 3)).toBe('You cannot delete your own account');
	});
	test('refuses to delete the last account', () => {
		expect(deleteAdminGuard(1, 2, 1)).toBe('The last admin account cannot be deleted');
	});
	test('allows deleting another account when more remain', () => {
		expect(deleteAdminGuard(1, 2, 2)).toBeNull();
	});
});
```

Run: `cd apps/admin && bun test src/lib/server/admins.test.ts`. Expected: FAIL (`deleteAdminGuard` not exported).

`auth.ts` imports `@tokobun/db`. If importing it in a test needs `DATABASE_URL`, the root `.env` copy covers it; `getDb()` is lazy, so no connection is opened.

- [ ] **Step 8: Update `apps/admin/src/lib/server/auth.ts`**

1. Change the first import to `import { adminSessions, adminUsers, getDb } from '@tokobun/db';`.
2. In `ensureBootstrapAdmin`, replace the block
   ```ts
		const [admin] = await db.insert(adminUsers).values({ username, passwordHash }).onConflictDoNothing().returning();
		if (admin) {
			const allStores = await db.select({ id: stores.id }).from(stores);
			if (allStores.length) {
				await db.insert(storeMembers).values(allStores.map((s) => ({ storeId: s.id, adminUserId: admin.id, role: 'owner' as const }))).onConflictDoNothing();
			}
		}
   ```
   with
   ```ts
		await db.insert(adminUsers).values({ username, passwordHash }).onConflictDoNothing();
   ```
3. Replace `listAdmins(storeId)` with:
   ```ts
export async function listAllAdmins() {
	return getDb()
		.select({ id: adminUsers.id, username: adminUsers.username, createdAt: adminUsers.createdAt })
		.from(adminUsers)
		.orderBy(adminUsers.id);
}

/** Why an account may not be deleted, or null when it may. */
export function deleteAdminGuard(actorId: number, targetId: number, totalAdmins: number): string | null {
	if (actorId === targetId) return 'You cannot delete your own account';
	if (totalAdmins <= 1) return 'The last admin account cannot be deleted';
	return null;
}

/** Deletes an admin account; its sessions go with it (FK cascade). */
export async function deleteAdmin(actorId: number, targetId: number): Promise<void> {
	const db = getDb();
	const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(adminUsers);
	const err = deleteAdminGuard(actorId, targetId, n);
	if (err) throw new AuthInputError(err);
	const deleted = await db.delete(adminUsers).where(eq(adminUsers.id, targetId)).returning({ id: adminUsers.id });
	if (!deleted.length) throw new AuthInputError('Admin account not found');
}
   ```

Run: `cd apps/admin && bun test src/lib/server/admins.test.ts`. Expected: PASS.

- [ ] **Step 9: Replace the store cookie in `session.ts`**

In `apps/admin/src/lib/server/session.ts` replace `export const STORE_COOKIE = 'tb_store';` with:

```ts
/** Slug of the store opened last; only used to pick where legacy URLs redirect, never to scope data. */
export const LAST_STORE_COOKIE = 'tb_last_store';
```

If `session.test.ts` imports `STORE_COOKIE`, update it to `LAST_STORE_COOKIE`.

- [ ] **Step 10: Update `apps/admin/src/app.d.ts`**

```ts
// See https://svelte.dev/docs/kit/types#app.d.ts
import type { PublicStore } from '#lib/server/stores.ts';

declare global {
	namespace App {
		interface Locals {
			admin: { id: number; username: string } | null;
			sessionToken: string | null;
			/** Secondary display currency (from fxRates) chosen in the top bar; null = USD only. */
			currency: string | null;
			/** Store named by the URL (/toko/[store] or /api/toko/[store]); null on global routes or unknown slug. */
			store: PublicStore | null;
			/** locals.store.id on store routes; 0 elsewhere. Global routes must not read it. */
			storeId: number;
			/** Slug from the last-store cookie when it names an existing store. */
			lastStore: string | null;
		}
	}
}

export {};
```

If the `#lib/...` alias does not resolve inside `app.d.ts` for svelte-check, use the relative path `./lib/server/stores`.

- [ ] **Step 11: Rewrite `apps/admin/src/hooks.server.ts`**

Keep everything after `const response = await resolve(event);` (security headers) exactly as it is. Replace the part before it with:

```ts
import type { Handle } from '@sveltejs/kit/hooks';
import { getStoreBySlug, listStores } from '@tokobun/core';
import { validateSession } from '#lib/server/auth.ts';
import { CURRENCY_COOKIE } from '#lib/server/money.ts';
import { LAST_STORE_COOKIE, SESSION_COOKIE, sessionCookieOptions as cookieOptions } from '#lib/server/session.ts';
import { toPublicStore } from '#lib/server/stores.ts';
import { legacyRedirect } from '#lib/store-path.ts';

const PUBLIC_PATHS = new Set(['/login', '/favicon.svg', '/robots.txt', '/api/health']);

async function fallbackSlug(lastStore: string | null): Promise<string | null> {
	if (lastStore) return lastStore;
	const all = await listStores();
	return all[0]?.slug ?? null;
}

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE) ?? null;
	event.locals.admin = null;
	event.locals.sessionToken = null;
	event.locals.store = null;
	event.locals.storeId = 0;
	event.locals.lastStore = null;
	const ccy = event.cookies.get(CURRENCY_COOKIE);
	event.locals.currency = ccy && /^[A-Z]{3,5}$/.test(ccy) ? ccy : null;

	if (token) {
		const session = await validateSession(token).catch((err) => {
			console.error('[admin] session validation failed', err);
			return null;
		});
		if (session) {
			event.locals.admin = session.admin;
			event.locals.sessionToken = token;
			if (session.renewedUntil) {
				event.cookies.set(SESSION_COOKIE, token, cookieOptions(session.renewedUntil));
			}
		} else {
			event.cookies.delete(SESSION_COOKIE, { path: '/' });
		}
	}

	const path = event.url.pathname;
	const isApi = path.startsWith('/api/');
	const isPublic = PUBLIC_PATHS.has(path) || path.startsWith('/_app/');
	if (!event.locals.admin && !isPublic) {
		if (isApi) return Response.json({ error: 'Unauthorized' }, { status: 401 });
		const next = encodeURIComponent(path + event.url.search);
		return new Response(null, { status: 303, headers: { location: `/login?next=${next}` } });
	}

	if (event.locals.admin) {
		const lastRaw = event.cookies.get(LAST_STORE_COOKIE);
		const last = lastRaw && /^[a-z0-9-]{1,64}$/.test(lastRaw) ? await getStoreBySlug(lastRaw) : null;
		event.locals.lastStore = last?.slug ?? null;

		// Old bookmarks (/orders, /products/5, …) land in the last-used store.
		if (event.request.method === 'GET' && !isApi) {
			const target = legacyRedirect(path, event.url.search, legacyRedirect(path, '', 'x') ? await fallbackSlug(event.locals.lastStore) : null);
			if (target) return new Response(null, { status: 303, headers: { location: target } });
		}

		const slug = event.params.store;
		if (slug) {
			const store = /^[a-z0-9-]{1,64}$/.test(slug) ? await getStoreBySlug(slug) : null;
			if (store) {
				event.locals.store = toPublicStore(store);
				event.locals.storeId = store.id;
				if (!isApi && event.request.method === 'GET' && event.locals.lastStore !== store.slug) {
					event.cookies.set(LAST_STORE_COOKIE, store.slug, { path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 });
				}
			} else if (isApi) {
				return Response.json({ error: 'Store not found' }, { status: 404 });
			}
			// Unknown slug on a page: the store layout's load throws a 404 (Task 5).
		}
	}
```

The `legacyRedirect(path, '', 'x') ? … : null` guard calls `fallbackSlug`, which queries the database, only for legacy paths.

- [ ] **Step 12: Run the admin unit tests and check this task's files**

```bash
cd apps/admin && bun test src
bunx svelte-kit sync && bunx svelte-check --tsconfig ./tsconfig.json 2>&1 | grep -E "hooks.server|lib/(store-path|current-store|server/(telegram|stores|auth|session))|app.d.ts" || echo "no errors in task-3 files"
```

Expected: all `bun test src` tests pass. svelte-check reports no errors in this task's files. Errors in `routes/**` are expected until wave 2.

- [ ] **Step 13: Commit**

```bash
git add apps/admin/src/lib apps/admin/src/hooks.server.ts apps/admin/src/app.d.ts
git commit -m "feat(admin): resolve store from URL, path helpers, bot token check, account deletion"
```

---

## Task 4: Admin API under /api/toko/[store] (wave 2)

**Files:**
- Move: `apps/admin/src/routes/api/{broadcasts,dashboard,orders,payments,payouts,products,settings,support,users,vouchers}` → `apps/admin/src/routes/api/toko/[store]/…` (same sub-paths)
- Create: `apps/admin/src/routes/api/toko/[store]/store/+server.ts`
- Modify: `apps/admin/src/routes/api/toko/[store]/settings/+server.ts` (after the move)
- Rewrite: `apps/admin/src/routes/api/stores/+server.ts`, `apps/admin/src/routes/api/admins/+server.ts`
- Create: `apps/admin/src/routes/api/admins/[id]/+server.ts`
- Delete: `apps/admin/src/routes/api/store/`, `apps/admin/src/routes/api/stores/switch/`

Touch nothing outside `apps/admin/src/routes/api/`.

- [ ] **Step 1: Move the store-scoped endpoints**

```bash
cd apps/admin/src/routes/api
mkdir -p "toko/[store]"
for d in broadcasts dashboard orders payments payouts products settings support users vouchers; do git mv "$d" "toko/[store]/$d"; done
git rm -r store stores/switch
```

The handlers keep reading `locals.storeId`. Hooks (Task 3) now set it from the `[store]` param and return 404 for unknown slugs. Imports use `#lib/...` aliases, so the moves do not change them. Grep the moved files for relative imports (`from '\.\./`) and fix any you find.

- [ ] **Step 2: Bot & store endpoint**

`apps/admin/src/routes/api/toko/[store]/store/+server.ts`:

```ts
import { getStore, updateStore, type StoreInfo } from '@tokobun/core';
import { BadRequest, endpoint, jsonError, readJson } from '#lib/server/http.ts';
import { toPublicStore } from '#lib/server/stores.ts';
import { verifyBotToken } from '#lib/server/telegram.ts';

export const GET = endpoint(async ({ locals }) => locals.store);

/** Bot token (empty = keep), admin Telegram ids, admin chat id, active flag. Name/channel are saved via /settings. */
export const PATCH = endpoint(async ({ request, locals }) => {
	const body = await readJson(request);
	const patch: Parameters<typeof updateStore>[1] = {};

	const rawToken = typeof body.botToken === 'string' ? body.botToken.trim() : '';
	if (rawToken) {
		if (rawToken.length > 256) throw new BadRequest('Bot token is too long', 'botToken');
		const current = (await getStore(locals.storeId)) as StoreInfo;
		if (rawToken !== current.botToken) {
			const v = await verifyBotToken(rawToken);
			if (!v.ok) {
				if (v.reason === 'invalid') throw new BadRequest(v.message, 'botToken');
				return jsonError(502, v.message);
			}
			patch.botToken = rawToken;
			patch.botUsername = v.username;
		}
	}
	if (Array.isArray(body.adminIds)) {
		patch.adminIds = body.adminIds.filter((n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n > 0).slice(0, 100);
	}
	if (body.adminChatId === null) patch.adminChatId = null;
	else if (typeof body.adminChatId === 'number' && Number.isSafeInteger(body.adminChatId)) patch.adminChatId = body.adminChatId;
	else if (body.adminChatId !== undefined) throw new BadRequest('Admin chat id must be a whole number', 'adminChatId');
	if (typeof body.isActive === 'boolean') patch.isActive = body.isActive;

	const updated = await updateStore(locals.storeId, patch);
	return toPublicStore(updated);
});
```

- [ ] **Step 3: Keep store name/channel in sync from settings**

In the moved `routes/api/toko/[store]/settings/+server.ts`, after the successful `updateSettings(...)` call in `PUT`, also update the store row:

```ts
	await updateStore(locals.storeId, { name: storeName, channelUrl: channelUrl ?? null });
```

Use the variable names the handler already uses for the validated store name and channel URL (read the file; `storeName` exists, the channel variable may differ). Import `updateStore` from `@tokobun/core`. Keep the handler's existing return value.

- [ ] **Step 4: Rewrite `routes/api/stores/+server.ts` (picker list + create)**

```ts
import { createStore, listStores, updateSettings } from '@tokobun/core';
import { getDb, orders } from '@tokobun/db';
import { and, gt, inArray, sql } from 'drizzle-orm';
import { BadRequest, endpoint, jsonError, readJson, str } from '#lib/server/http.ts';
import { verifyBotToken } from '#lib/server/telegram.ts';

/** Every store for the picker, with a 24 h order count. */
export const GET = endpoint(async () => {
	const stores = await listStores();
	if (!stores.length) return { items: [] };
	const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
	const counts = await getDb()
		.select({ storeId: orders.storeId, n: sql<number>`count(*)::int` })
		.from(orders)
		.where(and(inArray(orders.storeId, stores.map((s) => s.id)), gt(orders.createdAt, since)))
		.groupBy(orders.storeId);
	const byStore = new Map(counts.map((c) => [c.storeId, c.n]));
	return {
		items: stores.map((s) => ({
			id: s.id,
			slug: s.slug,
			name: s.name,
			botUsername: s.botUsername,
			isActive: s.isActive,
			orders24h: byStore.get(s.id) ?? 0
		}))
	};
});

export const POST = endpoint(async ({ request }) => {
	const body = await readJson(request);
	const slug = str(body, 'slug', { max: 64 }).toLowerCase().trim();
	if (!/^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/.test(slug)) throw new BadRequest('2–64 characters: a-z, 0-9 and -, not starting or ending with -', 'slug');
	const name = str(body, 'name', { max: 128 }).trim();
	if (!name) throw new BadRequest('Required', 'name');
	const botToken = str(body, 'botToken', { max: 256 }).trim();
	if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(botToken)) throw new BadRequest('Bot token format looks wrong (expected 123456:ABC…)', 'botToken');
	const adminIds = Array.isArray(body.adminIds) ? body.adminIds.filter((n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n > 0).slice(0, 100) : [];
	const adminChatId = typeof body.adminChatId === 'number' && Number.isSafeInteger(body.adminChatId) ? body.adminChatId : null;
	const rawChannel = typeof body.channelUrl === 'string' ? body.channelUrl.trim() : '';
	if (rawChannel && (rawChannel.length > 256 || !/^https?:\/\/\S+$/i.test(rawChannel))) throw new BadRequest('Must be a URL starting with https://', 'channelUrl');
	const channelUrl = rawChannel || null;

	const v = await verifyBotToken(botToken);
	if (!v.ok) {
		if (v.reason === 'invalid') throw new BadRequest(v.message, 'botToken');
		return jsonError(502, v.message);
	}
	let store;
	try {
		store = await createStore({ slug, name, botToken, botUsername: v.username, adminIds, adminChatId, channelUrl });
	} catch (err) {
		const msg = (err as Error).message;
		if (/slug/.test(msg)) throw new BadRequest('A store with this slug already exists', 'slug');
		if (/bot token/.test(msg)) throw new BadRequest('This bot is already used by another store', 'botToken');
		throw err;
	}
	await updateSettings(store.id, { storeName: name, channelUrl });
	return { id: store.id, slug: store.slug };
});
```

- [ ] **Step 5: Rewrite `routes/api/admins/+server.ts` and add `routes/api/admins/[id]/+server.ts`**

`routes/api/admins/+server.ts`:
```ts
import { createAdmin, listAllAdmins } from '#lib/server/auth.ts';
import { endpoint, readJson, str } from '#lib/server/http.ts';

export const GET = endpoint(async ({ locals }) => ({ items: await listAllAdmins(), me: locals.admin }));

export const POST = endpoint(async ({ request }) => {
	const body = await readJson(request);
	const password = typeof body.password === 'string' ? body.password.slice(0, 1000) : '';
	return createAdmin(str(body, 'username', { max: 32 }), password);
});
```

`routes/api/admins/[id]/+server.ts`:
```ts
import { deleteAdmin } from '#lib/server/auth.ts';
import { endpoint, idParam } from '#lib/server/http.ts';

export const DELETE = endpoint(async ({ params, locals }) => {
	await deleteAdmin(locals.admin!.id, idParam(params.id));
	return { ok: true };
});
```

- [ ] **Step 6: Typecheck the API tree**

```bash
cd apps/admin && bunx svelte-kit sync && bunx svelte-check --tsconfig ./tsconfig.json 2>&1 | grep -E "routes[\\\\/]api" || echo "no errors under routes/api"
bun test src
```

Expected:
- no svelte-check errors under `routes/api`;
- no remaining reference to `locals.adminStores`, `addStoreMember` or `STORE_COOKIE` under `routes/api` (check with `grep -rn "adminStores\|addStoreMember\|STORE_COOKIE" src/routes/api` → no output);
- unit tests still pass.

- [ ] **Step 7: Commit**

```bash
git add -A apps/admin/src/routes/api
git commit -m "feat(admin): store-scoped API under /api/toko/[store], store picker list/create, account deletion"
```

---

## Task 5: Admin shell, picker, accounts page, store layout (wave 2)

**Files:**
- Rewrite: `apps/admin/src/routes/(app)/+layout.svelte`, `apps/admin/src/routes/(app)/+layout.server.ts`
- Create: `apps/admin/src/routes/(app)/(home)/+layout.svelte`
- Create: `apps/admin/src/routes/(app)/(home)/+page.svelte` (store picker, URL `/`)
- Create: `apps/admin/src/routes/(app)/(home)/akun/+page.svelte` (accounts, URL `/akun`)
- Create: `apps/admin/src/routes/(app)/toko/[store]/+layout.server.ts`, `apps/admin/src/routes/(app)/toko/[store]/+layout.svelte`
- Delete: `apps/admin/src/routes/(app)/stores/`, `apps/admin/src/routes/(app)/admins/`

Do not move the section pages; Task 6 does. Task 6 also moves the current `(app)/+page.svelte` (the dashboard) to `toko/[store]/+page.svelte`, and Task 6 alone deletes it from `(app)/`. Your picker lives at `(app)/(home)/+page.svelte`. Until both tasks are merged, two pages map to `/`, which is expected.

- [ ] **Step 1: Read the existing files you are replacing**

Read:
- `routes/(app)/+layout.svelte`: the sidebar, header, currency select and theme toggle shown in the plan context;
- `routes/(app)/stores/+page.svelte`: the create-store form and its TanStack Form/Query patterns;
- `routes/(app)/admins/+page.svelte`: add-admin and change-password forms;
- `lib/components/PageHeader.svelte` and `lib/ui.svelte.ts` (`toast`).

Reuse their markup, CSS classes (`card`, `btn`, `input`, `label`, `text-muted`…) and form patterns so the new pages look native.

- [ ] **Step 2: `(app)/+layout.server.ts` and `(app)/+layout.svelte`**

```ts
// routes/(app)/+layout.server.ts
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => ({ admin: locals.admin! });
```

`(app)/+layout.svelte` keeps only what every authenticated page shares:
- the `QueryClient` + `QueryClientProvider` setup from the current file, with the same `defaultOptions`;
- `{@render children()}`;
- `<UiHost />`.

Move the sidebar, header, currency select, theme toggle and store switcher out of it (Step 4 and Step 3 take them).

- [ ] **Step 3: `(home)` layout, picker and accounts page**

`(app)/(home)/+layout.svelte`: a top bar (h-14, `border-b border-line bg-surface`, same look as the current header) containing:
- the "TB" logo badge and the text "TokoBun";
- links "Stores" (`/`) and "Accounts" (`/akun`), with the active one highlighted like the current sidebar items;
- the theme toggle (copy `toggleTheme` and the icons from the old layout);
- the admin username (`page.data.admin.username`);
- the logout form (`<form method="POST" action="/logout">`).

Below it, `<main class="mx-auto max-w-[1100px] p-4 lg:p-6">{@render children()}</main>`.

`(app)/(home)/+page.svelte` (store picker):
- `PageHeader` title "Stores", subtitle "Pick a store to manage. Each store has its own bot, catalog, orders and settings."
- `createQuery({ queryKey: ['stores'], queryFn: () => api('/api/stores') })`. The response is `{ items: { id, slug, name, botUsername, isActive, orders24h }[] }`.
- A responsive grid (`grid gap-3 sm:grid-cols-2 xl:grid-cols-3`) of cards. Each card is an `<a href={storeHref(s.slug)}>` (import from `#lib/store-path.ts`) with:
  - the name;
  - `@botUsername`, or "bot not verified" when null;
  - a badge "Active"/"Inactive" (reuse `Badge.svelte`);
  - "{orders24h} orders in 24h".
- Empty state: "No stores yet. Create the first one below."
- A "New store" card with a form. Fields:
  - Slug: hint "Used in the URL, cannot be changed later", `placeholder="patungin"`;
  - Store name;
  - Bot token: `type="password"`, `autocomplete="off"`, hint "From @BotFather. It is checked with Telegram before saving.";
  - optional Admin Telegram IDs (comma-separated);
  - optional Admin chat ID;
  - optional Channel URL.

  Client validation: slug `^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$`; token `^\d+:[A-Za-z0-9_-]{30,}$`. Submit sends `api('/api/stores', { body: { slug, name, botToken, adminIds, adminChatId, channelUrl } })`, with `adminIds` parsed to a number array and `adminChatId` to a number or null.
  - On success: toast "Store created — its bot starts within 30 seconds", then `goto(storeHref(res.slug))`.
  - On `ApiError` with `field`: show the message under that field. Otherwise show it in the form-level error box (same pattern as ProductForm's `serverError`).

`(app)/(home)/akun/+page.svelte` (accounts):
- Port from `routes/(app)/admins/+page.svelte`: the list, the add form and the change-password form, with their behaviour unchanged.
- Changes:
  - the list now shows all accounts (`api('/api/admins')` → `{ items, me }`);
  - each row except `me` gets a "Delete" button. It confirms with `confirm('Delete admin "<username>"? They will be logged out.')`, sends `api(\`/api/admins/${id}\`, { method: 'DELETE' })`, then invalidates `['admins']` and toasts. Errors are toasted.
  - Remove any mention of stores or "manager" from the copy. The subtitle is "Admin accounts. Every account can manage every store."
  - Change-password keeps calling `/api/admins/password`.

- [ ] **Step 4: Store layout**

`(app)/toko/[store]/+layout.server.ts`:
```ts
import { error } from '@sveltejs/kit';
import { listStores } from '@tokobun/core';
import { safeSettings } from '#lib/server/money.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.store) error(404, 'Store not found');
	const [settings, all] = await Promise.all([safeSettings(locals.store.id), listStores()]);
	return {
		store: locals.store,
		stores: all.map((s) => ({ slug: s.slug, name: s.name, isActive: s.isActive })),
		currency: locals.currency,
		currencies: Object.keys(settings?.fxRates ?? {}).filter((c) => c !== 'USD'),
		storeName: settings?.storeName ?? locals.store.name
	};
};
```
(`locals.store` is a `PublicStore` without the bot token. Never return `StoreInfo` objects to the page.)

`(app)/toko/[store]/+layout.svelte`: the old `(app)/+layout.svelte` sidebar + header, with these changes:
- Nav items keep the same labels and icons but use `link()` from `#lib/current-store.ts`:
  ```ts
	const sections = [
		{ path: '', label: 'Dashboard', icon: '…' },
		{ path: '/products', label: 'Products', icon: '…' },
		// stock, orders, payments, users, vouchers, payouts, broadcasts, support, settings — same icons as before
	];
  ```
  Render `href={link(item.path)}`. Remove the old "Stores" and "Admins" items.
- `isActive(path)`: the dashboard (`''`) is active only when `page.url.pathname === link('')`. Other items are active when the pathname equals `link(path)` or starts with `link(path) + '/'`.
- Sidebar head:
  - the store name (`data.store.name`) with an "Inactive" badge when `!data.store.isActive`;
  - when `data.stores.length > 1`, a `<select>` of `data.stores` whose `onchange` calls `goto(switchTarget(page.url.pathname, slug))` (import from `#lib/store-path.ts`), with no reload;
  - under it, a small link "← All stores" to `/`.
- Header: keep the currency select (`/api/currency`, then `queryClient.invalidateQueries()`). Use `useQueryClient()` from `@tanstack/svelte-query`, because the provider now lives in the parent layout. Also keep the theme toggle, the username and the logout form.
- Remove `switchStore` and every `/api/stores/switch` reference.

- [ ] **Step 5: Delete the old pages**

```bash
cd apps/admin/src/routes/\(app\)
git rm -r stores admins
```

- [ ] **Step 6: Check**

```bash
cd apps/admin && bunx svelte-kit sync && bunx svelte-check --tsconfig ./tsconfig.json 2>&1 | grep -E "\(app\)[\\\\/](\+layout|\(home\)|toko[\\\\/]\[store\][\\\\/]\+layout)" || echo "no errors in task-5 files"
```

Expected: no errors in this task's files.

- [ ] **Step 7: Commit**

```bash
git add -A "apps/admin/src/routes/(app)/+layout.svelte" "apps/admin/src/routes/(app)/+layout.server.ts" "apps/admin/src/routes/(app)/(home)" "apps/admin/src/routes/(app)/toko/[store]/+layout.server.ts" "apps/admin/src/routes/(app)/toko/[store]/+layout.svelte" "apps/admin/src/routes/(app)/stores" "apps/admin/src/routes/(app)/admins"
git commit -m "feat(admin): store picker, accounts page, store layout with switcher"
```

---

## Task 6: Move store pages under /toko/[store] and scope every link and API call (wave 2)

**Files:**
- Move: `apps/admin/src/routes/(app)/+page.svelte` → `apps/admin/src/routes/(app)/toko/[store]/+page.svelte`
- Move: `apps/admin/src/routes/(app)/{products,stock,orders,payments,users,vouchers,broadcasts,support,payouts,settings}` → `apps/admin/src/routes/(app)/toko/[store]/…`
- Modify: every moved page, plus `apps/admin/src/lib/components/ProductForm.svelte` and `apps/admin/src/lib/components/VoucherForm.svelte`
- Modify: `apps/admin/src/routes/(app)/toko/[store]/settings/+page.svelte` (adds the Bot & store section)

Do not create or edit the `[store]` layout files (Task 5). Do not touch `routes/api/` (Task 4).

- [ ] **Step 1: Move the pages**

```bash
cd "apps/admin/src/routes/(app)"
mkdir -p "toko/[store]"
git mv +page.svelte "toko/[store]/+page.svelte"
for d in products stock orders payments users vouchers broadcasts support payouts settings; do git mv "$d" "toko/[store]/$d"; done
```

- [ ] **Step 2: Rewrite links and API calls**

In every moved file and in `ProductForm.svelte` / `VoucherForm.svelte`, add `import { apiUrl, link } from '#lib/current-store.ts';` and convert:

| Before | After |
|---|---|
| `api('/api/orders')` | `api(apiUrl('/orders'))` |
| ``api(`/api/orders/${id}/cancel`)`` | ``api(apiUrl(`/orders/${id}/cancel`))`` |
| `createList({ endpoint: '/api/orders', … })` | `createList({ endpoint: () => apiUrl('/orders'), … })` |
| `href="/api/orders/export?{list.queryString}"` | `href={apiUrl(\`/orders/export?${list.queryString}\`)}` |
| `href="/orders/{o.id}"` | `href={link(\`/orders/${o.id}\`)}` |
| `href="/stock?productId={p.id}"` | `href={link(\`/stock?productId=${p.id}\`)}` |
| `goto('/products')` | `goto(link('/products'))` |
| ``goto(`/products/${id}`)`` | ``goto(link(`/products/${id}`))`` |
| ``goto(id ? `/stock?productId=${id}` : '/stock', …)`` | ``goto(link(id ? `/stock?productId=${id}` : '/stock'), …)`` |
| `rowHref: (r) => \`/orders/${r.id}\`` (or similar, passed to DataTable) | `rowHref: (r) => link(\`/orders/${r.id}\`)` |

Find every site with:
```bash
cd apps/admin/src
grep -rnE "['\"\`]/api/|href=\"/|href=\{\`/|goto\(|rowHref|endpoint:" "routes/(app)/toko" lib/components/ProductForm.svelte lib/components/VoucherForm.svelte
```

Run it again when you are done. The remaining hits must all go through `link(`/`apiUrl(`, or point to `/`, `/login`, `/logout` or `/akun`. TanStack Query `queryKey`s may stay as they are: each store page lives under its own URL, and Task 5's switcher navigates with `goto`, which re-creates the queries. Prefix keys with the slug only if you find a page that keeps a component mounted across stores.

- [ ] **Step 3: Bot & store section in settings**

In `routes/(app)/toko/[store]/settings/+page.svelte` add a separate `<section class="card space-y-3 p-4">` titled "Bot & store", outside the main settings `<form>` and in the same grid. It has its own small form (TanStack Form, same patterns as the file) with fields:
- Bot: a read-only line showing `@{page.data.store.botUsername}` (or "not verified");
- New bot token: `type="password"`, `autocomplete="off"`, empty = keep current; hint "Checked with Telegram before saving. The bot restarts within 30 seconds.";
- Admin Telegram IDs: comma-separated, prefilled from `page.data.store.adminIds.join(', ')`;
- Admin chat ID: prefilled, may be empty;
- Active: checkbox, prefilled from `page.data.store.isActive`, hint "Inactive stores stop their bot."

Submit:
- send `api(apiUrl('/store'), { method: 'PATCH', body: { botToken, adminIds, adminChatId, isActive } })`;
- on success: toast "Bot & store saved", clear the token field, then `invalidateAll()` (from `$app/navigation`) so the layout data refreshes;
- field errors (`ApiError.field`) appear under the field; anything else goes in an error box.

Store name and channel URL stay in the existing "Store" section (Task 4 makes `/settings` also update the store row).

- [ ] **Step 4: Check**

```bash
cd apps/admin && bunx svelte-kit sync && bunx svelte-check --tsconfig ./tsconfig.json 2>&1 | grep -E "toko[\\\\/]\[store\]|ProductForm|VoucherForm" | grep -v "+layout" || echo "no errors in task-6 files"
bun test src
```

Expected:
- no svelte-check errors in the moved pages or the two forms;
- unit tests pass;
- the grep from Step 2 shows no unscoped `/api/` or section links.

- [ ] **Step 5: Commit**

```bash
git add -A "apps/admin/src/routes/(app)" apps/admin/src/lib/components/ProductForm.svelte apps/admin/src/lib/components/VoucherForm.svelte
git commit -m "feat(admin): store pages under /toko/[store] with scoped links and API calls; bot & store settings"
```

---

## Task 7: Integration, verification and deploy (orchestrator)

- [ ] Merge the wave 2 branches into `feat/multi-store-admin`. Resolve conflicts; the only expected overlap is that `(app)/+page.svelte` is deleted by Task 6 while Task 5 adds `(app)/(home)/+page.svelte`.
- [ ] Run `bun install` and `cd apps/admin && bunx svelte-kit sync`.
- [ ] Run every suite: `packages/core`, `packages/payments`, `packages/i18n`, `apps/bot`, `apps/api`, `apps/admin (bun test src)`. All must pass.
- [ ] `cd apps/admin && bunx svelte-check --tsconfig ./tsconfig.json` → 0 errors.
- [ ] `cd apps/admin && bun run build` → succeeds.
- [ ] `grep -rn "adminStores\|STORE_COOKIE\|getStoresForAdmin\|addStoreMember\|store_members\|/api/stores/switch" apps packages --include=*.ts --include=*.svelte` → no hits outside `node_modules` and `drizzle/0001_add-multi-store.sql`.
- [ ] Local smoke test against the local DB:
  - run `bun --env-file=../../.env build/index.js` with `PORT=3299 ORIGIN=http://localhost:3299` (http origin locally);
  - log in;
  - `/` lists stores;
  - `/toko/default/orders` renders, and `/api/toko/default/orders` returns JSON;
  - `/orders` returns 303 to `/toko/default/orders`;
  - `/api/toko/nope/orders` returns 404 JSON;
  - creating a store with an invalid token returns a 400 field error.
- [ ] Production deploy:
  - back up the DB first: `docker exec tokobun-postgres pg_dump -U tokobun tokobun > ~/backups/tokobun-<ts>.sql`;
  - push the branch, fast-forward `main`;
  - on the server: `git pull`, `bun install`, admin build, migrate, restart the 3 units.
- [ ] Production verification on https://ai.firmanakbar.com:
  - login → picker;
  - `/toko/default/...` works;
  - bot log shows `supervisor running` and `@patunginbot` running;
  - the `stores_bot_token_unique` constraint exists.
