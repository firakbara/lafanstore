# Requests from the BOT workstream

## core
1. **Store stats function** (e.g. `getStoreStats(): Promise<{ users, usersToday, ordersToday, revenueToday, orders30,
   revenue30, topupsToday, topupAmountToday, supportOpen }>`). Workaround in place: `apps/bot/src/util/stats.ts`
   runs read-only aggregate SQL via `getDb().$client`. Switch `/stats` to the core function when it exists.

## apps/api (PAYMENTS) — FYI, no change needed if already done
- When a webhook settles an **order** payment, the admin sale notification should also be sent to `ADMIN_CHAT_ID`
  (the bot only notifies for sales it settles itself via "Cek Status" or balance purchases). The message key
  `admin.sale` in `@tokobun/i18n` can be reused: params `{code, user, userId, product, qty, total, paidWith}`.
- `payment.orderRefunded` ({code}, {amount}) was added to `@tokobun/i18n` as requested.
