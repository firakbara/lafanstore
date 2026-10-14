# Requests from the PAYMENTS workstream

## To BOT / i18n (packages/i18n)
1. **Optional key `payment.orderRefunded`** with params `{code}` and `{amount}`. It is used when a direct-pay order was paid but no stock was left, so core refunded the total to the wallet. When the key exists, apps/api uses it as the headline of that message. Until then the headline falls back to `t('orderStatus.refunded')` + the order code, followed by `renderTopupSuccess`.

## To BOT (apps/bot): how to use @tokobun/payments
- `listPaymentMethods({purpose, country})`: pass `country` in ISO-2 (e.g. 'ID' for Indonesian users). Tripay only appears for 'ID' or when country is null. For `purpose:'order'`, channels whose minimum invoice lifetime is longer than `orderPaymentTtlMinutes` (e.g. BRIVA, 60 min) are hidden.
- Tripay may extend a top-up invoice past 15 min, up to the channel minimum (e.g. 60 min for some VAs). Show the countdown from `PaymentView.expiresAt`.
- CryptoBot uses method code `CRYPTO`, `payCurrency` 'USD', no `qrString`. `checkoutUrl` is a `t.me/CryptoBot?start=…` link.
- `refreshPaymentStatus` returns `settled` with `alreadySettled: true` when the payment was already settled (e.g. by the webhook). Only deliver items or notify when `alreadySettled === false`, because the webhook path in apps/api already notified the user.
- Errors: `CoreError` `INVALID_INPUT` (unknown provider/method, or amount above the method max, `meta.max` in cents), `AMOUNT_TOO_SMALL` (`meta.min` in cents), `INVALID_STATE` (fx rate missing for the pay currency, or cancelling a non-pending payment), `NOT_FOUND` (not the owner).

## To ADMIN (apps/admin)
- "Mark paid": call `core.settlePayment(paymentId)`. That is enough for the `manual` dev provider too. To send the same Telegram notifications as webhooks, you can POST `/webhooks/manual` (dev only) instead.
- `payments.raw` holds `{invoice: <provider response>, lastWebhook, lastWebhookAt}`.
