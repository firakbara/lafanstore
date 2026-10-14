# @tokobun/api

Hono on Bun: payment webhooks, the reseller API, and the background jobs.

```bash
bun run dev        # from apps/api (or `bun run dev:api` at the repo root). Loads ../../.env
bun test           # unit tests. The app is built with fake deps, so no DB is needed
```

## Environment

| Var | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres (core/payments) |
| `API_PORT` | Listen port (default 3100) |
| `PUBLIC_API_URL` | Public base URL. If it is `https://…`, it is sent to Tripay as the per-transaction `callback_url` |
| `BOT_TOKEN` | Used to send Telegram notifications after a payment settles. If it is empty, nothing is sent |
| `BOT_USERNAME` | Return / "Open Bot" link on gateway pages (`https://t.me/<username>`) |
| `ADMIN_CHAT_ID` | Gets a short line for each top-up and sale (optional) |
| `ADMIN_LANG` | Language of the admin-chat lines (default `en`) |
| `TRIPAY_API_KEY`, `TRIPAY_PRIVATE_KEY`, `TRIPAY_MERCHANT_CODE` | Tripay is enabled only when all three are set |
| `TRIPAY_SANDBOX` | `true` (default): `https://tripay.co.id/api-sandbox`; `false`: `https://tripay.co.id/api` |
| `TRIPAY_CUSTOMER_EMAIL` | `customer_email` sent to Tripay, `{userId}` placeholder (default `tg{userId}@example.com`) |
| `CRYPTOBOT_TOKEN` | Crypto Pay app token. CryptoBot is enabled when it is set |
| `CRYPTOBOT_TESTNET` | `true` (default): `testnet-pay.crypt.bot`; `false`: `pay.crypt.bot` |
| `CRYPTOBOT_ASSETS` | Accepted assets for the USD invoices (default `USDT,TON,BTC`) |
| `CRYPTOBOT_FEE_BP` | Optional fee in basis points added to the customer's total (default 0) |
| `PAYMENTS_DEV_MANUAL` | **Dev only.** `true` offers the `manual` provider (an admin marks it paid) |
| `PAYMENTS_DEV_MANUAL_SECRET` | Secret for the `x-manual-secret` header on `/webhooks/manual` |
| `API_RATE_LIMIT_PER_MIN` | Reseller API requests per minute per key (default 60) |

## Webhook URLs to register

| Provider | URL | Where |
| --- | --- | --- |
| Tripay | `https://<PUBLIC_API_URL>/webhooks/tripay` | Tripay member area → Merchant → callback URL. It is also sent per transaction when `PUBLIC_API_URL` is https. To test: Sandbox callback simulator `https://tripay.co.id/simulator/console/callback`. If you whitelist IPs, allow Tripay's 95.111.200.230 |
| CryptoBot | `https://<PUBLIC_API_URL>/webhooks/cryptobot` | @CryptoBot (or @CryptoTestnetBot) → Crypto Pay → My Apps → your app → Webhooks → enable + URL |
| manual (dev) | `POST /webhooks/manual` | Header `x-manual-secret: $PAYMENTS_DEV_MANUAL_SECRET`, body `{"code":"PAY-…","status":"paid"}` |

Signatures are checked against the **raw** body:
- Tripay: `X-Callback-Signature = hex(HMAC-SHA256(rawBody, TRIPAY_PRIVATE_KEY))`. Only `X-Callback-Event: payment_status` is handled.
- CryptoBot: `crypto-pay-api-signature = hex(HMAC-SHA256(rawBody, SHA256(CRYPTOBOT_TOKEN)))`. Only `update_type: invoice_paid` is handled.

Responses:
- Success: Tripay gets `200 {"success":true}`, CryptoBot gets `200 OK`, unknown or ignored payments still get `200`.
- Bad signature: `401`. Unknown or unconfigured provider: `404`. Malformed body: `400`.
- Internal error: `500`, so the gateway retries.

User, referrer and admin notifications are sent in the background after the response. They are sent once per payment: repeated webhooks return `alreadySettled` and do not notify again.

## Background jobs

Every 60 s, and once at start, the server runs `expireStalePayments()` and then `cancelExpiredOrders()`. A tick is skipped while the previous one is still running.

## Reseller API

Base path: `/v1`. Auth: `Authorization: Bearer tb_live_…` (create the key in the bot: Profil → API Developer). All amounts are **integer USD cents**. The rate limit is per key: 60 req/min by default. Every response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset`. A `429` also carries `Retry-After`.

Errors are always JSON: `{"error":{"code":"OUT_OF_STOCK","message":"…","meta":{…}}}`.

| Code | HTTP |
| --- | --- |
| `UNAUTHORIZED` (missing/invalid key) | 401 |
| `USER_BANNED` | 403 |
| `NOT_FOUND` | 404 |
| `INSUFFICIENT_BALANCE` | 402 |
| `OUT_OF_STOCK`, `PRODUCT_INACTIVE`, `INVALID_STATE` | 409 |
| `INVALID_QUANTITY`, `VOUCHER_INVALID`, `VOUCHER_EXPIRED`, `VOUCHER_LIMIT_REACHED`, `VOUCHER_MIN_TOTAL`, `AMOUNT_TOO_SMALL` | 422 |
| `INVALID_INPUT` | 400 |
| `RATE_LIMITED` | 429 |
| `INTERNAL` | 500 |

### Endpoints

`GET /health` (no auth). Returns `{"ok":true,"time":"…"}`.

`GET /v1/me`. Returns `{"user":{"id","username","firstName","balance","currency":"USD","displayCurrency","language","createdAt"}}`.

`GET /v1/products?page=1&pageSize=50&sort=all|available|soldout|promo&collection=<code>`. Lists top-level products, or the variants of a collection. Returns `{"currency":"USD","items":[{"id","code","name","icon","price","isCollection","variantCount","stock"(null = unlimited),"hasPromo",…}],"page","totalPages","total"}`.

`GET /v1/products/:code`. Returns `{"currency":"USD","product":{…ProductDetail, "discounts":[{"minQty","percentBp"}]},"variants":[…]}`. `variants` is only present for collections.

`POST /v1/orders`. Body: `{"productCode":"NFX","quantity":2,"voucherCode":"HEMAT"}`. `voucherCode` is optional. Pays with the wallet balance and delivers at once. Returns `201 {"order":{"id","code","productName","quantity","unitPrice","subtotal","discountAmount","voucherDiscount","total","status":"completed","items":["…"],"warranty",…}}`.

`GET /v1/orders?page=1&pageSize=20`. Returns `{"items":[OrderSummary],"page","totalPages","total"}`.

`GET /v1/orders/:code`. Returns `{"order":OrderDetail}` (owner only). `items` holds the delivered contents.

```bash
curl -H "Authorization: Bearer $KEY" https://api.example.com/v1/products
curl -X POST -H "Authorization: Bearer $KEY" -H 'content-type: application/json' \
     -d '{"productCode":"NFX","quantity":1}' https://api.example.com/v1/orders
```
