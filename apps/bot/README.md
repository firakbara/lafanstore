# @tokobun/bot

grammY Telegram bot for TokoBun. All text comes from `@tokobun/i18n` (locales `id`, `en`); business logic from
`@tokobun/core`; payments from `@tokobun/payments`.

## Environment (root `.env`)

| Var | Required | Meaning |
| --- | --- | --- |
| `BOT_TOKEN` | yes | BotFather token |
| `DATABASE_URL` | yes | Postgres (used through core) |
| `BOT_USERNAME` | no | Used in deep links (`?start=product_…`, `ref_…`); defaults to `getMe` username |
| `ADMIN_IDS` | no | Comma-separated Telegram ids allowed to use `/addsaldo`, `/stats` |
| `ADMIN_CHAT_ID` | no | Forum supergroup for sale notifications + support topics. Unset = both disabled |
| `ADMIN_LANG` | no | Language of admin-chat messages (default `id`) |
| `CHANNEL_URL` | no | Channel button in the main menu (settings.channelUrl takes precedence) |
| `PUBLIC_API_URL` | no | Shown on the Developer API screen (`<url>/v1`) |
| `WEBHOOK_URL` | no | When set: webhook mode, Telegram posts to `WEBHOOK_URL + WEBHOOK_PATH` |
| `WEBHOOK_PATH` / `WEBHOOK_SECRET` / `BOT_PORT` | no | Defaults `/telegram`, none, `8081` (`GET /health` also served) |
| `BROADCAST_WORKER` | no | `false` disables the in-process broadcast sender |
| `PAYMENTS_DEV_MANUAL` | no | (payments) `true` enables the dev "Manual" provider |

## Run

```sh
bun run db:up && bun run db:migrate && bun run db:seed   # from repo root, once
bun run dev:bot             # = bun --cwd apps/bot run dev  (long polling, watch mode)
bun --cwd apps/bot run start        # no watch; webhook mode if WEBHOOK_URL is set
bun --cwd apps/bot test             # unit tests (no network, no DB)
bun --cwd apps/bot run smoke        # offline end-to-end: fake updates through real core/DB, Telegram calls intercepted
```

On startup the bot calls `setMyCommands` for the default scope + `id` + `en`.

## Layout

```
src/index.ts          entry: polling (dev) / Bun.serve webhook (WEBHOOK_URL), broadcast worker, setMyCommands
src/bot.ts            createBot(cfg): middleware chain + handler registration
src/config.ts         env parsing
src/callback.ts       callback_data codec (≤ 64 bytes) + typed `cb.*` builders, action table `A`
src/keyboards.ts      button helpers (style colors, custom emoji, copy_text, pager)
src/screens/*.ts      pure renderers → { text, keyboard, photo? } (main, shop, product, payment, profile, orders, api, help, more, referral)
src/handlers/*.ts     callback router, commands, text input, support relay, admin commands
src/middleware/*.ts   rate limit, user loading (upsert throttled to 1×/5 min, banned check), error boundary
src/workers/broadcast.ts  claimBroadcast loop, ~25 msg/s, 403 → markBlockedBot, 429 → retry_after
src/util/*            render (edit-in-place menu message), session store, QR, delivery, formatting, parsing
```

## Behaviour notes

- **One menu message**: callbacks edit the message they belong to; commands / text input delete the previous menu
  message and send a new one. Photo (QR invoice) ↔ text switches delete + resend. "message is not modified" is ignored.
- **Sessions** (text-input state, menu id, applied voucher, last 2FA secret) are per user, in memory
  (`util/session.ts`, grammY `StorageAdapter`). Swap `createSessionStorage()` for a persistent adapter if needed.
- **Support relay**: user-side private topic only when `getMe().has_topics_enabled` (enable topics for the bot in
  BotFather), otherwise the plain chat. Admin side: one forum topic per session in `ADMIN_CHAT_ID`; admins reply in the
  topic (or reply to a relayed message when topics can't be created). `/close` inside the topic ends the session.
- **Payments**: "Cek Status" calls `refreshPaymentStatus`; items/notifications are sent only when
  `settled.alreadySettled === false` (the webhook path in apps/api handles the other case).
