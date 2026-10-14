# Schema requests from packages/core

Non-blocking; core works around each one today.

1. **Snapshot delivered content for unlimited products** — add `orders.delivered_content text` (nullable).
   Unlimited products have no stock rows, so `getOrder().items` is rebuilt from the product's *current*
   `unlimited_content` repeated `quantity` times. If an admin edits the content later, old orders show the new one.
   Workaround: re-derive at read time.

2. **Order expiry timestamp** — add `orders.expires_at timestamptz` (nullable) for pending_payment orders.
   `cancelExpiredOrders` currently treats a pending order as expired when any reserved stock row has
   `reserved_until <= now`, or when `created_at <= now - orderPaymentTtlMinutes` (needed for unlimited products,
   which reserve nothing). Changing the TTL setting therefore shifts the expiry of in-flight unlimited orders.
