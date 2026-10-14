# TokoBun — Design Spec (2026-10-03)

Telegram auto-delivery digital store bot, modeled on @bunaistore_bot, for a multi-country market.
Customers browse a catalog inside Telegram, pay with wallet balance or directly (QRIS / VA / e-wallet / crypto), and
receive the purchased items (codes, accounts, links) instantly.

## Stack
- Runtime: **Bun** (1.4). Language: TypeScript (strict). Package manager: bun workspaces.
- Bot: **grammY** (webhook in prod, long polling in dev).
- Admin panel: **SvelteKit (Svelte 5)** + `@tanstack/svelte-query`, `@tanstack/svelte-table`, `@tanstack/svelte-form`.
  (TanStack Start does not support Svelte; SvelteKit is the framework.)
- HTTP API (payment webhooks + reseller API): **Hono** on Bun.
- DB: **PostgreSQL 17** (docker-compose, host port 5433) + **Drizzle ORM**.

## Repository layout & ownership
```
packages/db        schema + client + migrations          (FOUNDATION — frozen, append-only changes)
packages/core      business logic services                (workstream CORE)
packages/i18n      all bot text, locales id+en            (workstream BOT)
packages/payments  gateway adapters + payment lifecycle   (workstream PAYMENTS)
apps/bot           grammY bot                             (workstream BOT)
apps/api           Hono: webhooks, reseller API, jobs     (workstream PAYMENTS)
apps/admin         SvelteKit admin panel                  (workstream ADMIN)
```
Contracts are frozen: `packages/core/src/contracts.ts` + function signatures in `packages/core/src/index.ts`,
`packages/payments/src/index.ts`, `packages/i18n/src/index.ts`. Implementers replace `todo()` bodies and may add
new exports; they must not change existing signatures. Each workstream edits only the directories it owns.
Schema changes: only by adding (new columns nullable/defaulted, new tables), then `bun run db:generate`.

## Conventions
- Money: integer **cents of USD** (`Cents`) everywhere in storage and logic. Display converts via `settings.fxRates`
  with `formatMoney`. Payment providers that charge in another currency store `payCurrency` + `payAmount`.
- Percentages: basis points (`600` = 6%).
- Every balance change goes through `applyLedger` (row lock on user, ledger row with `balance_after`, balance never < 0).
- Stock picking: `SELECT ... FOR UPDATE SKIP LOCKED` inside the purchase transaction.
- Settlement is idempotent: `settlePayment` locks the payment row; a second call returns `alreadySettled: true`.
- Errors crossing package boundaries are `CoreError` with a `code`; UIs map codes to translated messages.
- Telegram text uses `parse_mode: 'HTML'`; escape all user/admin-provided text.
- Tests: `bun test`, against the real Postgres test DB (`TEST_DATABASE_URL`, db `tokobun_test`). Tests truncate the
  tables they use. No mocking of the database.

## Features

### Bot (apps/bot + packages/i18n)
Single "menu message" navigation: every inline button edits the same message (`editMessageText`), state lives in
`callback_data` (≤ 64 bytes, short prefixes). Buttons use Bot API `style` colors where helpful (success = in stock,
danger = sold out / delete, primary = main action) and custom emoji when `customEmojiId` is set.

- `/start [payload]` — upsert user (language from Telegram `language_code`), referral `ref_<code>`, deep link
  `product_<code>` opens product detail. Main menu: saldo + buttons Toko, Isi Saldo, Profil, Bantuan, Lainnya,
  Dapatkan (referral), Channel (url).
- **Toko**: 15 per page, pagination `‹ n/N ›`, Segarkan, sort cycle Semua → Tersedia → Habis → Promo.
  Button label: `<icon> Name - <price> (Stok: N|∞)`; collections show `(Paket: N)` and open a variant list.
- **Product detail**: name, base price, stock, collection, warranty, promo tiers hint, quantity, total (quote), balance.
  Keypad 1-9/0 + Del + "Jml: N" (max 4 digits, capped at stock). Buttons: **Beli dengan saldo** (when balance ≥ total),
  **Bayar langsung** (direct pay methods), Isi Saldo (when balance short), Pakai voucher (asks for code via text),
  Bagikan Tautan (`copy_text` button with deep link), Lihat Catatan, Kembali.
- **Purchase**: confirm screen → `purchaseWithBalance` → delivery via `renderOrderDelivery` (as .txt document when
  > 10 items or > 3500 chars). Notify ADMIN_CHAT_ID of each sale.
- **Isi Saldo**: choose method (from `listPaymentMethods`), enter amount (text input, in user's display currency),
  invoice screen: amount, fee, pay amount, expiry countdown, QR image (generated from `qrString`, else checkoutUrl
  button), buttons Cek Status / Batalkan. On success: `renderTopupSuccess`.
- **Profil**: ID, saldo, bahasa, mata uang, zona waktu, join date. Sub: Notifikasi (toggle stock/info/referral),
  Pesanan Saya (paged, detail re-sends items), Riwayat Saldo (ledger), API Developer (show prefix / create / revoke,
  plaintext key shown once), Bahasa, Mata Uang, Zona Waktu (UTC-12..+14 grid).
- **Bantuan**: Dukungan Langsung (opens a private-chat topic when supported, mirrors messages to a topic in the
  ADMIN_CHAT_ID forum; admin replies in that topic are relayed back; "Batalkan Dukungan" closes), contact links.
- **Lainnya**: Pembaca 2FA (user sends base32 secret → current code + seconds remaining), Penilaian (👍/👎).
- **Dapatkan**: referral stats, copy link button, Transfer ke saldo, Tarik tunai (request; admin handles).
- Commands (set per language via `setMyCommands`): start, shop, topup, orders, profile, language, support, api.
- Admin commands (ADMIN_IDS only): `/addsaldo <userId> <amount>` (adjustment), `/stats`.
- Workers in the bot process: broadcast sender (claimBroadcast loop, ~25 msg/s, marks blockedBot on 403).
- Rate limiting per user; banned users get a short "akun diblokir" message.

### Payments (packages/payments + apps/api)
- Adapters behind one interface: **Tripay** (QRIS, VA, e-wallet, retail; IDR; sandbox flag) and **CryptoBot / Crypto Pay
  API** (USDT/TON/BTC…, USD invoices; testnet flag). Adding a gateway = adding one adapter file.
- Provider is offered only when its env vars are set. Region filter: Tripay for country `ID`; crypto everywhere.
- Fees: provider fee is added to what the customer pays (shown on the invoice); the wallet is credited the full amount.
- Top-up invoice lifetime 15 min (direct pay: `orderPaymentTtlMinutes`). Jobs in apps/api every 60 s:
  `expireStalePayments`, `cancelExpiredOrders`.
- Webhooks: `POST /webhooks/tripay`, `POST /webhooks/cryptobot` — verify signatures, `handleWebhook`, then notify the
  user through the Telegram Bot API (grammY `Api` with BOT_TOKEN) using `@tokobun/i18n` renderers; order payments
  deliver the items; referral commission notifies the referrer.
- Reseller API (`Authorization: Bearer tb_live_…`, via `verifyApiKey`): `GET /v1/me`, `GET /v1/products`,
  `GET /v1/products/:code`, `POST /v1/orders {productCode, quantity, voucherCode?}` (pays with balance),
  `GET /v1/orders`, `GET /v1/orders/:code`. JSON, rate-limited per key. `GET /health`.

### Admin panel (apps/admin)
Login (admin_users; first admin bootstrapped from ADMIN_PANEL_USERNAME/PASSWORD, Bun.password hashes, session cookie
backed by admin_sessions). Pages: Dashboard (revenue today/7d/30d, orders, top-ups, new users, low-stock list),
Products (table, create/edit, collections & variants, discount tiers, toggle active, sort), Stock (bulk import:
one item per line or custom separator, view/delete available items, notify-restock → creates a 'stock' broadcast),
Orders (filter, detail, refund), Payments (filter, detail with raw payload, manual "mark paid" → settlePayment),
Users (search, detail with ledger, adjust balance, ban), Vouchers (CRUD), Referral payouts (approve/reject withdraws),
Broadcasts (compose HTML, audience, preview, queue, progress), Support (open sessions list), Settings (StoreSettings
form incl. fx rates), Admins (add/change password). Responsive, light/dark.

### Core (packages/core)
Implements every function in `index.ts` per its doc comment, plus `src/seed.ts` (demo catalog: ~20 products incl. a
collection with 2 variants, unlimited item, discount tiers, stock rows; default settings) and tests covering:
purchase happy path, out-of-stock, insufficient balance, concurrent purchases never oversell, discount tiers +
voucher, ledger consistency (balance == sum ledger), settlePayment idempotency (topup & order), referral commission
cap, expiry/cancellation releasing stock, formatMoney/toBaseCents, totp (RFC 6238 vector).

## Out of scope (for now)
Multi-admin roles/permissions, multiple bots/tenants, automatic replacement for warranty claims (handled via support),
refunds back to the original payment method.
