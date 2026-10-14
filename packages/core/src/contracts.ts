// Public contract of @tokobun/core. Bot, admin panel and API depend ONLY on these
// types + the functions re-exported from ./index.ts. Signatures here are frozen:
// implementations may add new exports, but must not change existing ones.

export type Cents = number; // integer cents of base currency (USD)

export type CoreErrorCode =
  | 'NOT_FOUND'
  | 'USER_BANNED'
  | 'PRODUCT_INACTIVE'
  | 'INVALID_QUANTITY'
  | 'OUT_OF_STOCK'
  | 'INSUFFICIENT_BALANCE'
  | 'VOUCHER_INVALID'
  | 'VOUCHER_EXPIRED'
  | 'VOUCHER_LIMIT_REACHED'
  | 'VOUCHER_MIN_TOTAL'
  | 'AMOUNT_TOO_SMALL'
  | 'INVALID_STATE'
  | 'INVALID_INPUT';

export class CoreError extends Error {
  constructor(
    public readonly code: CoreErrorCode,
    message?: string,
    public readonly meta?: Record<string, unknown>,
  ) {
    super(message ?? code);
    this.name = 'CoreError';
  }
}

// ---------- stores ----------
export interface StoreInfo {
  id: number;
  slug: string;
  name: string;
  botToken: string;
  botUsername: string | null;
  adminIds: number[];
  adminChatId: number | null;
  channelUrl: string | null;
  isActive: boolean;
}

// ---------- users ----------
export interface TelegramUserInput {
  id: number;
  username?: string | null;
  firstName?: string | null;
  languageCode?: string | null; // from Telegram, used for first-time language
  startPayload?: string | null; // /start payload, e.g. "ref_ABCD1234" — referral attached only on first creation
}

export interface UserProfile {
  id: number;
  username: string | null;
  firstName: string | null;
  language: string; // 'id' | 'en' | ...
  currency: string; // display currency, e.g. 'USD', 'IDR'
  tzOffsetMinutes: number;
  balance: Cents;
  referralCode: string;
  notifyStock: boolean;
  notifyInfo: boolean;
  notifyReferral: boolean;
  isBanned: boolean;
  createdAt: Date;
}

export type NotifyFlag = 'stock' | 'info' | 'referral';

// ---------- catalog ----------
export type CatalogSort = 'all' | 'available' | 'soldout' | 'promo';

export interface ProductListItem {
  id: number;
  code: string;
  name: string;
  icon: string | null;
  customEmojiId: string | null;
  price: Cents;
  isCollection: boolean;
  variantCount: number; // collections only, else 0
  stock: number | null; // null = unlimited (∞). Collections: sum of variants (null if any unlimited)
  hasPromo: boolean;
}

export interface ProductPage {
  items: ProductListItem[];
  page: number; // 1-based
  totalPages: number;
  total: number;
}

export interface DiscountTier {
  minQty: number;
  percentBp: number;
}

export interface ProductDetail extends ProductListItem {
  storeId: number;
  parentId: number | null;
  parentName: string | null; // "Koleksi"
  warranty: string | null;
  note: string | null;
  discounts: DiscountTier[]; // sorted by minQty asc
  isActive: boolean;
}

export interface Quote {
  productId: number;
  quantity: number;
  unitPrice: Cents;
  subtotal: Cents;
  discountBp: number; // tier discount applied
  discountAmount: Cents;
  voucherCode: string | null;
  voucherDiscount: Cents;
  total: Cents;
  nextTier: DiscountTier | null; // next tier the user could reach (for "Beli 150+ → -6%" hint)
}

// ---------- orders ----------
export type OrderStatus = 'pending_payment' | 'completed' | 'cancelled' | 'refunded';

export interface OrderSummary {
  id: number;
  storeId: number;
  code: string;
  productId: number;
  productName: string;
  quantity: number;
  total: Cents;
  status: OrderStatus;
  createdAt: Date;
}

export interface OrderDetail extends OrderSummary {
  unitPrice: Cents;
  subtotal: Cents;
  discountAmount: Cents;
  voucherDiscount: Cents;
  paidWith: 'balance' | 'payment';
  items: string[]; // delivered contents (empty unless completed)
  warranty: string | null;
  completedAt: Date | null;
}

export interface PurchaseResult {
  order: OrderDetail;
}

// ---------- wallet ----------
export type LedgerType = 'topup' | 'topup_bonus' | 'purchase' | 'refund' | 'adjustment' | 'referral_transfer';

export interface LedgerEntry {
  id: number;
  amount: Cents;
  type: LedgerType;
  refType: string | null;
  refId: string | null;
  balanceAfter: Cents;
  note: string | null;
  createdAt: Date;
}

export interface Paged<T> {
  items: T[];
  page: number;
  totalPages: number;
  total: number;
}

// ---------- payments (core side; gateways live in @tokobun/payments) ----------
export type PaymentStatus = 'pending' | 'paid' | 'expired' | 'failed' | 'cancelled';

export interface SettleResult {
  paymentId: number;
  storeId: number;
  alreadySettled: boolean; // true when called again for an already-paid payment (idempotent no-op)
  purpose: 'topup' | 'order';
  userId: number;
  credited: Cents; // topup amount + bonus credited to wallet (0 for order)
  order: OrderDetail | null; // for purpose=order: the completed order with items
  referral: { referrerId: number; amount: Cents } | null; // commission recorded, if any
}

// ---------- referral ----------
export interface ReferralStats {
  referralCode: string;
  referred24h: number;
  referred7d: number;
  referredTotal: number;
  earned: Cents;
  available: Cents; // earned - transferred - withdrawn(pending|done)
  transferred: Cents;
  withdrawn: Cents;
  percentBp: number; // current commission rate
  maxPerTopup: Cents;
  minWithdraw: Cents;
}

// ---------- settings ----------
export interface StoreSettings {
  referralPercentBp: number; // default 500 (5%)
  referralMaxPerTopup: Cents; // default 300 ($3)
  referralMinWithdraw: Cents; // default 100 ($1)
  topupMin: Cents; // default 100 ($1)
  topupBonusTiers: { minAmount: Cents; percentBp: number }[]; // default []
  orderPaymentTtlMinutes: number; // default 15 — reservation + invoice lifetime for direct pay
  fxRates: Record<string, number>; // units of currency per 1 USD, e.g. { IDR: 16300 }. USD implied 1
  supportedLanguages: string[]; // default ['id','en']
  storeName: string; // default 'TokoBun'
  channelUrl: string | null;
  supportUsername: string | null; // e.g. 'tokobun_support'
}

// ---------- broadcasts ----------
export type BroadcastAudience = 'all' | 'stock' | 'info' | 'referral';

export interface BroadcastJob {
  id: number;
  audience: BroadcastAudience;
  title: string | null;
  body: string;
}

// ---------- support ----------
export interface SupportSession {
  id: number;
  userId: number;
  userThreadId: number | null;
  adminThreadId: number | null;
  status: 'open' | 'closed';
  createdAt: Date;
}

// ---------- developer API ----------
export interface ApiKeyInfo {
  id: number;
  prefix: string;
  isActive: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
}
