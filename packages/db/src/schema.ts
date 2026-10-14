// Single source of truth for the tokobun data model.
// Money is always stored as integer cents of the base currency (USD) unless noted.
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,

  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const cents = (name: string) => bigint(name, { mode: 'number' });

// ---------- stores ----------
export const stores = pgTable('stores', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(), // URL-safe identifier, e.g. "toko-akun-ml"
  name: text('name').notNull(),
  botToken: text('bot_token').notNull().unique(),
  botUsername: text('bot_username'),
  adminIds: text('admin_ids').notNull().default(''), // comma-separated Telegram user ids
  adminChatId: bigint('admin_chat_id', { mode: 'number' }),
  channelUrl: text('channel_url'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
});

// ---------- users ----------
export const users = pgTable(
  'users',
  {
    id: bigint('id', { mode: 'number' }).primaryKey(), // Telegram user id
    username: text('username'),
    firstName: text('first_name'),
    language: text('language').notNull().default('en'),
    currency: text('currency').notNull().default('USD'),
    tzOffsetMinutes: integer('tz_offset_minutes').notNull().default(0),
    balance: cents('balance').notNull().default(0), // cache of SUM(ledger_entries.amount)
    referralCode: text('referral_code').notNull().unique(),
    referredBy: bigint('referred_by', { mode: 'number' }).references((): AnyPgColumn => users.id),
    notifyStock: boolean('notify_stock').notNull().default(true),
    notifyInfo: boolean('notify_info').notNull().default(true),
    notifyReferral: boolean('notify_referral').notNull().default(true),
    isBanned: boolean('is_banned').notNull().default(false),
    blockedBot: boolean('blocked_bot').notNull().default(false),
    createdAt: createdAt(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('users_referred_by_idx').on(t.referredBy)],
);

// ---------- catalog ----------
export const products = pgTable(
  'products',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
    code: text('code').notNull().unique(), // public short code for deep links: ?start=product_<code>
    parentId: integer('parent_id').references((): AnyPgColumn => products.id, { onDelete: 'cascade' }),
    isCollection: boolean('is_collection').notNull().default(false), // "Paket": holds variants, not sold directly
    name: text('name').notNull(),
    icon: text('icon'), // plain emoji fallback
    customEmojiId: text('custom_emoji_id'), // Telegram custom emoji id for buttons/text
    price: cents('price').notNull().default(0),
    warranty: text('warranty'), // e.g. "10d"; null = no warranty
    note: text('note'), // admin note (HTML allowed: b,i,a,code)
    unlimited: boolean('unlimited').notNull().default(false), // stock ∞: deliver unlimitedContent every time
    unlimitedContent: text('unlimited_content'),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('products_store_idx').on(t.storeId), index('products_parent_idx').on(t.parentId)],
);

export const productDiscounts = pgTable(
  'product_discounts',
  {
    id: serial('id').primaryKey(),
    productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    minQty: integer('min_qty').notNull(),
    percentBp: integer('percent_bp').notNull(), // basis points: 600 = 6.00%
  },
  (t) => [uniqueIndex('product_discounts_product_minqty_uq').on(t.productId, t.minQty)],
);

export const stockStatus = pgEnum('stock_status', ['available', 'reserved', 'sold']);

export const stockItems = pgTable(
  'stock_items',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    status: stockStatus('status').notNull().default('available'),
    orderId: bigint('order_id', { mode: 'number' }).references((): AnyPgColumn => orders.id),
    reservedUntil: timestamp('reserved_until', { withTimezone: true }),
    createdAt: createdAt(),
    soldAt: timestamp('sold_at', { withTimezone: true }),
  },
  (t) => [
    index('stock_items_product_status_idx').on(t.productId, t.status),
    index('stock_items_order_idx').on(t.orderId),
  ],
);

// ---------- vouchers ----------
export const voucherKind = pgEnum('voucher_kind', ['percent', 'fixed']);

export const vouchers = pgTable(
  'vouchers',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
    code: text('code').notNull().unique(), // stored uppercase
    kind: voucherKind('kind').notNull(),
    value: integer('value').notNull(), // percent => basis points, fixed => cents
    minTotal: cents('min_total').notNull().default(0),
    maxUses: integer('max_uses'), // null = unlimited
    usedCount: integer('used_count').notNull().default(0),
    perUserLimit: integer('per_user_limit').notNull().default(1),
    productId: integer('product_id').references(() => products.id, { onDelete: 'cascade' }), // null = any product
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index('vouchers_store_idx').on(t.storeId)],
);

// ---------- orders ----------
export const orderStatus = pgEnum('order_status', [
  'pending_payment', // direct-pay order waiting for payment, stock reserved
  'completed', // paid and delivered
  'cancelled', // expired/cancelled before payment, stock released
  'refunded',
]);

export const orders = pgTable(
  'orders',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    storeId: integer('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
    code: text('code').notNull().unique(), // public e.g. "TB-7K3Q9X"
    userId: bigint('user_id', { mode: 'number' }).notNull().references(() => users.id),
    productId: integer('product_id').notNull().references(() => products.id),
    productName: text('product_name').notNull(), // snapshot
    quantity: integer('quantity').notNull(),
    unitPrice: cents('unit_price').notNull(),
    subtotal: cents('subtotal').notNull(),
    discountBp: integer('discount_bp').notNull().default(0),
    discountAmount: cents('discount_amount').notNull().default(0),
    voucherId: integer('voucher_id').references(() => vouchers.id),
    voucherDiscount: cents('voucher_discount').notNull().default(0),
    total: cents('total').notNull(),
    status: orderStatus('status').notNull(),
    paidWith: text('paid_with').notNull(), // 'balance' | 'payment'
    paymentId: bigint('payment_id', { mode: 'number' }).references((): AnyPgColumn => payments.id),
    createdAt: createdAt(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('orders_user_idx').on(t.userId, t.createdAt),
    index('orders_store_idx').on(t.storeId, t.createdAt),
    index('orders_store_status_completed_idx').on(t.storeId, t.status, t.completedAt),
  ],
);

export const voucherRedemptions = pgTable(
  'voucher_redemptions',
  {
    id: serial('id').primaryKey(),
    voucherId: integer('voucher_id').notNull().references(() => vouchers.id),
    userId: bigint('user_id', { mode: 'number' }).notNull().references(() => users.id),
    orderId: bigint('order_id', { mode: 'number' }).notNull().references(() => orders.id),
    createdAt: createdAt(),
  },
  (t) => [index('voucher_redemptions_voucher_user_idx').on(t.voucherId, t.userId)],
);

// ---------- wallet ----------
export const ledgerType = pgEnum('ledger_type', [
  'topup',
  'topup_bonus',
  'purchase',
  'refund',
  'adjustment', // manual by admin
  'referral_transfer', // referral earnings moved into wallet
]);

export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: bigint('user_id', { mode: 'number' }).notNull().references(() => users.id),
    amount: cents('amount').notNull(), // signed
    type: ledgerType('type').notNull(),
    refType: text('ref_type'), // 'order' | 'payment' | 'admin' | 'referral_payout'
    refId: text('ref_id'),
    balanceAfter: cents('balance_after').notNull(),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [index('ledger_user_idx').on(t.userId, t.createdAt)],
);

// ---------- payments ----------
export const paymentPurpose = pgEnum('payment_purpose', ['topup', 'order']);
export const paymentStatus = pgEnum('payment_status', ['pending', 'paid', 'expired', 'failed', 'cancelled']);

export const payments = pgTable(
  'payments',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    storeId: integer('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
    code: text('code').notNull().unique(), // our merchant reference, e.g. "PAY-..."
    userId: bigint('user_id', { mode: 'number' }).notNull().references(() => users.id),
    purpose: paymentPurpose('purpose').notNull(),
    orderId: bigint('order_id', { mode: 'number' }).references((): AnyPgColumn => orders.id),
    provider: text('provider').notNull(), // 'tripay' | 'cryptobot' | 'manual' ...
    method: text('method').notNull(), // provider method code, e.g. 'QRIS', 'BRIVA', 'USDT'
    amount: cents('amount').notNull(), // value credited/charged in base currency cents
    fee: cents('fee').notNull().default(0), // fee charged to the customer, base cents
    payCurrency: text('pay_currency').notNull(), // currency the customer actually pays in, e.g. 'IDR'
    payAmount: text('pay_amount').notNull(), // decimal string in payCurrency, e.g. "16350" or "1.25"
    status: paymentStatus('status').notNull().default('pending'),
    providerRef: text('provider_ref'),
    checkoutUrl: text('checkout_url'),
    qrString: text('qr_string'), // raw QRIS payload when available
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    raw: jsonb('raw'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('payments_provider_ref_uq').on(t.provider, t.providerRef),
    index('payments_user_idx').on(t.userId, t.createdAt),
    index('payments_status_idx').on(t.status, t.expiresAt),
    index('payments_store_idx').on(t.storeId, t.createdAt),
    index('payments_store_topup_idx').on(t.storeId, t.purpose, t.status, t.paidAt),
  ],
);

// ---------- referral ----------
export const referralEarnings = pgTable(
  'referral_earnings',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    referrerId: bigint('referrer_id', { mode: 'number' }).notNull().references(() => users.id),
    refereeId: bigint('referee_id', { mode: 'number' }).notNull().references(() => users.id),
    paymentId: bigint('payment_id', { mode: 'number' }).notNull().references(() => payments.id).unique(),
    amount: cents('amount').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('referral_earnings_referrer_idx').on(t.referrerId)],
);

export const payoutKind = pgEnum('payout_kind', ['transfer', 'withdraw']);
export const payoutStatus = pgEnum('payout_status', ['pending', 'done', 'rejected']);

export const referralPayouts = pgTable(
  'referral_payouts',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: bigint('user_id', { mode: 'number' }).notNull().references(() => users.id),
    amount: cents('amount').notNull(),
    kind: payoutKind('kind').notNull(), // transfer = into wallet (instant), withdraw = cash via admin
    status: payoutStatus('status').notNull(),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [index('referral_payouts_user_idx').on(t.userId)],
);

// ---------- broadcasts ----------
export const broadcastAudience = pgEnum('broadcast_audience', ['all', 'stock', 'info', 'referral']);
export const broadcastStatus = pgEnum('broadcast_status', ['draft', 'queued', 'sending', 'done', 'failed']);

export const broadcasts = pgTable(
  'broadcasts',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
    audience: broadcastAudience('audience').notNull(), // which notify_* flag must be on ('all' ignores flags)
    title: text('title'), // shown bold on top, e.g. "Peringatan Darurat Admin"
    body: text('body').notNull(), // HTML
    status: broadcastStatus('status').notNull().default('draft'),
    totalCount: integer('total_count').notNull().default(0),
    sentCount: integer('sent_count').notNull().default(0),
    failedCount: integer('failed_count').notNull().default(0),
    lastUserId: bigint('last_user_id', { mode: 'number' }), // cursor so sending can resume
    createdAt: createdAt(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [index('broadcasts_store_status_idx').on(t.storeId, t.status)],
);

// ---------- support ----------
export const supportStatus = pgEnum('support_status', ['open', 'closed']);

export const supportSessions = pgTable(
  'support_sessions',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
    userId: bigint('user_id', { mode: 'number' }).notNull().references(() => users.id),
    userThreadId: integer('user_thread_id'), // topic id inside the user's private chat
    adminThreadId: integer('admin_thread_id'), // topic id inside ADMIN_CHAT_ID forum
    status: supportStatus('status').notNull().default('open'),
    createdAt: createdAt(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (t) => [index('support_user_status_idx').on(t.userId, t.status), index('support_admin_thread_idx').on(t.adminThreadId), index('support_store_status_idx').on(t.storeId, t.status)],
);

// ---------- developer API ----------
export const apiKeys = pgTable(
  'api_keys',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
    userId: bigint('user_id', { mode: 'number' }).notNull().references(() => users.id),
    prefix: text('prefix').notNull(), // first 8 chars shown to user, e.g. "tb_live_ab12cd34"
    keyHash: text('key_hash').notNull().unique(), // sha256 hex of full key
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => [index('api_keys_user_idx').on(t.userId)],
);

// ---------- misc ----------
export const ratings = pgTable('ratings', {
  userId: bigint('user_id', { mode: 'number' }).primaryKey().references(() => users.id),
  value: smallint('value').notNull(), // 1 = like, -1 = dislike
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable(
  'settings',
  {
    storeId: integer('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
  },
  (t) => [uniqueIndex('settings_store_key_uq').on(t.storeId, t.key)],
);

export const adminUsers = pgTable('admin_users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(), // Bun.password hash
  createdAt: createdAt(),
});

export const adminSessions = pgTable(
  'admin_sessions',
  {
    id: text('id').primaryKey(), // sha256 hex of the session token held in the cookie
    adminId: integer('admin_id').notNull().references(() => adminUsers.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('admin_sessions_admin_idx').on(t.adminId)],
);
