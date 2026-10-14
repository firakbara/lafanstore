# @tokobun/admin

Admin panel for TokoBun: SvelteKit 3 (Svelte 5 runes), TanStack Query / Table / Form, and Tailwind CSS v4 with light and dark mode. It runs on Bun.

## Environment

All variables are read from the **repo-root `.env`**. `vite.config.ts` loads that file for dev, build and preview, and `bun run start` passes it with `--env-file`.

| Variable | Used for |
| --- | --- |
| `DATABASE_URL` | Postgres (via `@tokobun/db`) |
| `ADMIN_PANEL_USERNAME` / `ADMIN_PANEL_PASSWORD` | Bootstraps the first admin when `admin_users` is empty, on the first login-page hit. Change the password afterwards under **Admins** |
| `SESSION_SECRET` | Not needed by the current design. Sessions are random 32-byte tokens, and only `sha256(token)` is stored in `admin_sessions` |
| `ADMIN_CHAT_ID` | Optional. Builds "open topic" links on the Support page |

## Run

```bash
bun install                      # at repo root
bun run dev:admin                # or: bun --cwd apps/admin run dev   → http://localhost:5174
```

`dev`, `build` and `preview` run Vite with `bun --bun`, so `Bun.password` is available on the server.

## Build / production

```bash
bun --cwd apps/admin run build   # adapter-node output in apps/admin/build
bun --cwd apps/admin run start   # = bun --env-file=../../.env build/index.js  (PORT=3000 by default)
```

- `svelte-adapter-bun` only supports SvelteKit 2, so the app uses `@sveltejs/adapter-node` 6 and runs the output under Bun.
- Serve the panel behind HTTPS. The session cookie is `Secure`, and adapter-node 6 assumes `https` when it computes the request origin for CSRF checks. Behind a reverse proxy, set `PROTOCOL_HEADER=x-forwarded-proto` and `HOST_HEADER=x-forwarded-host`. For a public origin that differs from the request host, set `paths.origin` in `vite.config.ts`.
- Settings like `PORT`, `HOST`, `BODY_SIZE_LIMIT` and the other adapter-node env vars work as documented.

## Scripts

| Script | |
| --- | --- |
| `dev` | Vite dev server on port 5174 |
| `build` / `preview` / `start` | Production build, local preview, run the build on Bun |
| `check` | `svelte-kit sync && svelte-check` (TypeScript 6 is pinned locally because svelte-check does not support the root TS 7) |
| `test` | `bun test src`: unit tests for money parsing, stock-import parsing and dedupe, list/paging params, session token hashing, and Telegram HTML validation |

## Architecture

- `src/hooks.server.ts`: the auth guard. Every route except `/login` (and `/_app` assets) needs a valid session. API routes return a 401 JSON response, and page routes redirect to `/login?next=…`. Sessions are 7 days long and slide (they renew in the second half of their lifetime). CSRF uses SvelteKit's built-in origin check.
- `src/lib/server/**`: server-only code.
  - `auth.ts` and `session.ts`: bootstrap, `Bun.password` hashing and verification, session create, validate and invalidate, add admin, change password. Changing a password signs out the admin's other sessions.
  - `repo/*.ts`: listing and CRUD queries with Drizzle. Pagination, search, filters and sorting all happen in SQL.
  - **Every money move goes through `@tokobun/core`**:
    - "mark paid" uses `settlePayment`
    - refunds use `refundOrder`
    - balance adjustments use `applyLedger` with type `adjustment`
    - ban uses `setBanned`
    - broadcasts use `createBroadcast`, `queueBroadcast` and `countBroadcastAudience`
    - settings use `updateSettings`
    - payouts use `resolveReferralPayout`
    - cancelling a pending order uses `cancelPendingOrder`
  - `money.ts`: money is formatted on the server with core `formatMoney` (USD, plus an optional secondary currency picked in the top bar and stored in a cookie).
- `src/routes/api/**/+server.ts`: JSON endpoints that the client reads through TanStack Query.
- `src/lib/components/DataTable.svelte`: a TanStack Table v9 wrapper with manual (server-side) sorting and pagination. Column ids match the server sort keys.
- Forms use TanStack Form with field validation. Money inputs are USD with at most 2 decimals and are converted to integer cents (`#lib/money.ts`).
- SvelteKit 3 notes: `$lib` is now `#lib` (subpath imports in `package.json`), the config lives in `vite.config.ts`, and `tsconfig.json` extends `$app/tsconfig`.

## Pages

Dashboard · Products (with collections and variants, discount tiers, active toggle, sort order, note editor with a Telegram preview, custom emoji id, unlimited content) · Stock (bulk import, dedupe, delete, notify restock) · Orders (filters, detail with delivered items, refund, cancel pending) · Payments (filters, raw payload, mark paid) · Users (search, ledger, balance adjustment, ban) · Vouchers · Referral payouts · Broadcasts (compose with live preview, auto-refreshing progress) · Support · Settings (including FX rates and top-up bonus tiers) · Admins.
