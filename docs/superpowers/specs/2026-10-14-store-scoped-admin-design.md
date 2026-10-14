# Store-scoped admin panel — Design Spec (2026-10-14)

Stage 1 of 3 of the "one store, one operation" roadmap:

1. **Store-scoped admin panel + self-managing bots** (this spec)
2. Per-store customer wallet and per-store base currency (balance, ledger, referral, ban, prices in the store's own
   currency, e.g. whole rupiah for IDR stores)
3. Per-store payment gateway accounts (Tripay / CryptoBot keys per store, per-store webhooks, public API hostname)

Stage 2 must ship before stage 3: once money goes to each store's own gateway account, a shared wallet would let a
customer top up in store A and spend in store B.

## Decisions (from the product owner)
- **1 store = 1 Telegram bot.** A bot token belongs to exactly one store.
- **No roles.** Every admin account is equal and can open and manage every store, create stores and manage admin
  accounts. All admins are trusted. Per-person access limits may be added later; nothing here should block that.
- Each store is operated separately: after login the admin picks a store and everything shown or saved is that
  store's data.
- The store is part of the URL (`/toko/<slug>/...`) so two tabs can work on two stores without mixing them up.
- Stores are deactivated, never deleted (deleting would cascade into orders and payments).

## Goals
- Store picker after login; all store pages under `/toko/<slug>/`.
- No hidden "current store" state: every page and API request names its store in the URL.
- Store settings (bot token, admin ids, admin chat, channel, active) editable from the panel; a bad bot token is
  rejected before it is saved.
- The bot process picks up new, changed and deactivated stores by itself within ~30 s. No SSH restart needed.

## Non-goals
Per-store wallet/currency (stage 2), per-store payment accounts (stage 3), per-admin store access, deleting stores,
renaming a store's slug.

## Data model
Migration `0004_drop-store-members`:
- `DROP TABLE store_members; DROP TYPE store_member_role;`
- Core: remove `addStoreMember`, `removeStoreMember`, `getStoresForAdmin`; add `listStores()` (all stores, active and
  inactive, ordered by `id`).
- `ensureBootstrapAdmin` keeps creating the first admin from `ADMIN_PANEL_USERNAME/PASSWORD` when `admin_users` is
  empty, without store memberships.

Migration bookkeeping fix (done in the same change):
- `0002_add-missing-indexes` and `0003_unique-bot-token` exist as files but are missing from
  `drizzle/meta/_journal.json`, so `migrate` never applied them. Add both to the journal ahead of `0004`.
- Delete the orphan `0001_grey_hemingway.sql` (superseded by `0001_add-multi-store.sql`, never in the journal).
- Snapshots must match the schema: after the change, `bun run db:generate` on an unchanged `schema.ts` must produce no
  new migration.
- `0003` adds `UNIQUE(bot_token)`. Live data has one store, so it applies cleanly.

## Admin panel

### Routes
```
/login
/                                  store picker (cards: name, @bot, active badge, orders in the last 24 h;
                                   "New store" form)
/akun                              admin accounts (list, add, delete) + change own password
/toko/[store]                      store dashboard
/toko/[store]/{products,stock,orders,payments,users,vouchers,broadcasts,support,payouts,settings}[/...]
```
`[store]` is the store slug. `/stores` (old store list/edit page) and `/admins` are removed; their functions move
to `/`, `/toko/[store]/settings` and `/akun`.

After login, `next` is honoured when present. Otherwise the admin lands on `/`. With exactly one store the picker
still shows, so the "New store" button stays visible.

### API
- Store-scoped endpoints move under `/api/toko/[store]/...` with the same sub-paths as today (`/api/products` →
  `/api/toko/[store]/products`, `/api/orders/export` → `/api/toko/[store]/orders/export`, ...). The CSV export links are
  plain `<a download>` links, so the store must be in the URL, not a header.
- Global endpoints stay unscoped: `/api/stores` (GET list for the picker, POST create), `/api/admins` (GET, POST),
  `/api/admins/[id]` (DELETE), `/api/admins/password`, `/api/currency`, `/api/health`.
- New `PATCH /api/toko/[store]/store` updates the store's bot and store fields (replaces `PATCH /api/stores`).
- Removed: `/api/store`, `/api/stores/switch`.

### Store resolution (hooks)
- `hooks.server.ts` reads `event.params.store` for any route under `/toko/[store]` or `/api/toko/[store]`, loads the
  store by slug and sets `locals.store` (`StoreInfo`) and `locals.storeId`. Unknown slug → 404 (JSON for `/api/...`).
  Inactive stores remain reachable so they can be re-activated.
- `locals.storeId` is only set on store routes; global routes must not read it. The old `storeId = 1` default, the
  store cookie as scope, and `locals.adminStores` are removed.
- Page visits to a store set a `last_store` cookie (slug, 1 year). It is a convenience only and is never used to scope
  data.
- Legacy URLs (`/products...`, `/orders...`, `/stock`, `/payments...`, `/users...`, `/vouchers`, `/broadcasts`,
  `/support`, `/payouts`, `/settings`) redirect (303) to `/toko/<last_store or first store>/<same path and query>`, so
  old bookmarks keep working. With no stores they redirect to `/`.

### Layouts and navigation
- `(app)/+layout`: authenticated shell for global pages (picker, accounts): top bar with "All stores", "Accounts",
  logout.
- `(app)/toko/[store]/+layout.server.ts`: loads the store, its settings (currency list, name) and the list of all
  stores for the switcher.
- Sidebar inside a store: store name, switcher, section links, "← All stores". Switching keeps the current section
  (`/toko/a/orders/15` → `/toko/b/orders`). Detail ids are dropped because they belong to the other store.
- Links and API calls inside store pages are built with a small helper from the current slug:
  `storeHref(slug, '/orders')` and `storeApi(slug, '/orders')`. No hard-coded `/orders` or `/api/orders` remain in
  store pages.

### Creating and editing a store
- Create form (picker page): slug, name, bot token. Optional at creation: admin Telegram ids, admin chat id, channel.
  - The slug is lower-case `[a-z0-9-]`, unique, and **immutable** after creation (it is used in URLs and in the bot
    webhook path).
  - The token is verified with Telegram `getMe` (10 s timeout) before saving. The bot username is taken from the
    `getMe` answer, so the form no longer asks for it. If Telegram cannot be reached, the save fails with a retry
    message; unverified tokens are never stored.
  - A token already used by another store fails with a field error (from `UNIQUE(bot_token)`).
  - The new store's `settings.storeName` and `settings.channelUrl` are initialised from the form.
- Store settings page gains a **Bot & store** section: bot token (empty = unchanged, otherwise re-verified;
  shows the current `@username`), admin Telegram ids, admin chat id, active switch.
- Store name and channel stay in the existing **Store** settings section, so there is a single field for each.
  - Saving them writes both the `settings.*` key and `stores.name` / `stores.channel_url`, so the panel, the picker
    and the bot never show different values.
  - Existing stores whose two values differ today (live: `Default Store` vs `TokoBun`) are reconciled the first time
    the section is saved.
- The bot token is never sent to the browser.

### Accounts page
- Lists all admin accounts, adds an account (username + password, same validation as today), deletes an account.
- An admin cannot delete their own account, and the last remaining account cannot be deleted.
- Deleting an account also deletes its sessions.
- Change-own-password form moves here unchanged.

## Bot process: self-managing bots
New `apps/bot/src/supervisor.ts` owns the set of running bots. `index.ts` becomes a thin entry that starts the
supervisor, the webhook server (webhook mode only) and signal handling.

- Every 30 s (and once at startup) the supervisor loads active stores and reconciles them against the running
  bots. Ticks never overlap.
- `planReconcile(running, desired)` is a pure function returning `{ start, stop, restart }` store ids.
  - Each store's fingerprint is built from `botToken`, `botUsername`, `adminIds`, `adminChatId` and `channelUrl`.
  - A changed fingerprint means restart.
  - A missing or inactive store means stop.
- Start a store's bot: `createBot` → `init` → `setCommands` → broadcast worker →
  - polling mode: `deleteWebhook` + `start`;
  - webhook mode: register the handler for `${webhookPath}/${slug}` + `setWebhook`.
- Stop a store's bot:
  - stop its broadcast worker;
  - polling mode: `bot.stop()`;
  - webhook mode: remove the handler + `deleteWebhook`.
- A store whose start fails (bad token, Telegram error) is logged and remembered with its fingerprint. It is retried
  when its fingerprint changes or after 5 minutes. Other stores are unaffected.
- With zero active stores the process stays up and logs one warning, instead of exiting as it does today.
- `BOT_TOKEN` in `.env` is no longer required; stores come only from the database.
- Shutdown (SIGINT/SIGTERM) stops every running bot with the existing 10 s force-exit guard.
- `apps/api` already refreshes store bot tokens through its 60 s sender cache; no change needed there.

## Error handling
- Unknown store slug: 404 page or `{"error":"Store not found"}` 404.
- Telegram `getMe` failure: 400 with a field error on `botToken` (invalid token) or a retryable 502 message
  (network).
- Duplicate slug or token: 400 field errors.
- Deleting self / the last account: 400 with a message.

## Testing
- Core (real test DB, as today): `listStores`; `createStore` duplicate slug and duplicate token errors; migration
  `0004` applied by `migrate` on a fresh DB.
- Admin unit tests:
  - legacy-path redirect mapping;
  - `storeHref` / `storeApi`;
  - switcher target path (detail ids dropped);
  - `verifyBotToken` with an injected fetch (ok, invalid token, network error);
  - account-deletion guards.
- Bot unit tests:
  - `planReconcile`: new, removed, deactivated, token changed, unchanged, failed with backoff;
  - supervisor with fake bots: start, stop and restart calls, one failing store not blocking others.
- All existing suites stay green: `bun test` in every package, `svelte-check`, and `vite build` of the admin.

## Rollout
1. Implement on branch `feat/multi-store-admin`. Push to GitHub and merge to `main` only after the owner confirms.
2. Server deploy as today: `git pull`, `bun install`, admin build, `migrate`, restart the three units.
3. Verify on https://ai.firmanakbar.com:
   - login lands on the picker;
   - `/toko/default/...` pages work and CSV export downloads;
   - an old `/orders` link redirects;
   - creating a second store with a real token brings its bot online within ~30 s without a restart;
   - deactivating it stops the bot.

## Acceptance criteria
- No admin request reads a store id from a cookie or a default; every store-scoped request has the slug in its URL.
- Two tabs on two stores can create products at the same time and each product lands in its tab's store.
- A newly created store's bot answers `/start` within 60 s, with no manual restart.
- A bad bot token cannot be saved.
- `bun run db:generate` on the final schema produces no migration.
