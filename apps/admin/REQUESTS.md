# Requests from ADMIN to other workstreams

## CORE

All money-moving actions in the admin panel already use core functions:

- `settlePayment`
- `refundOrder`
- `applyLedger` (type `adjustment`)
- `setBanned`
- `createBroadcast`, `queueBroadcast`, `countBroadcastAudience`
- `updateSettings`
- `resolveReferralPayout`
- `cancelPendingOrder`

The items below are optional nice-to-haves. The admin panel implements them locally with read-only queries or status-only updates that do not move money.

1. **`cancelQueuedBroadcast(id)`**: the panel sets `status = 'failed'` on a broadcast that is still `queued` (guarded by `WHERE status = 'queued'`). A core function would keep broadcast state transitions in one place.
2. **`deleteDraftBroadcast(id)`**: the panel deletes rows where `status = 'draft'`.
3. **Admin referral summary**: the panel computes `earned − transferred − withdrawn(pending|done)` locally to show the user's available referral balance after a payout decision. `getReferralStats(userId)` covers this too, but it also computes the 24h/7d counters that the panel does not need.
4. **`markPaid` audit**: the panel logs who marked a payment paid to the server console only. A core-level `paidBy` / audit note on the payment (for example in `raw`) would be useful.
