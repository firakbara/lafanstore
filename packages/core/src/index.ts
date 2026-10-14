// @tokobun/core — business logic shared by bot, admin panel and API.
// Every function uses the shared db (getDb()) unless a `tx` is passed.
import type { DbOrTx } from '@tokobun/db';
import type {
  ApiKeyInfo,
  BroadcastAudience,
  BroadcastJob,
  CatalogSort,
  Cents,
  LedgerEntry,
  LedgerType,
  NotifyFlag,
  OrderDetail,
  OrderSummary,
  Paged,
  ProductDetail,
  ProductListItem,
  ProductPage,
  PurchaseResult,
  Quote,
  ReferralStats,
  SettleResult,
  StoreInfo,
  StoreSettings,
  SupportSession,
  TelegramUserInput,
  UserProfile,
} from './contracts';

export * from './contracts';

import * as apikeys from './services/apikeys';
import * as broadcasts from './services/broadcasts';
import * as catalog from './services/catalog';
import * as orders from './services/orders';
import * as payments from './services/payments';
import * as pricing from './services/pricing';
import * as referral from './services/referral';
import * as settingsSvc from './services/settings';
import * as storesSvc from './services/stores';
import * as support from './services/support';
import * as totpSvc from './services/totp';
import * as users from './services/users';
import * as wallet from './services/wallet';

// ----- additional exports (non-frozen helpers; safe for other workstreams to use) -----
export {
  generateOrderCode,
  generatePaymentCode,
  generateProductCode,
  generateReferralCode,
  healthCheck,
} from './services/util';
export { DEFAULT_SETTINGS } from './services/settings';
export { cancelPendingOrder, getOrderByCode } from './services/orders';
export { resolveReferralPayout } from './services/referral';
export { countBroadcastAudience, queueBroadcast } from './services/broadcasts';
export { listOpenSupportSessions } from './services/support';
export { hashApiKey } from './services/apikeys';
export { MAX_QUANTITY } from './services/pricing';

// ===== stores =====
export async function listActiveStores(): Promise<StoreInfo[]> {
  return storesSvc.listActiveStores();
}
export async function listStores(): Promise<StoreInfo[]> {
  return storesSvc.listStores();
}
export async function getStore(storeId: number): Promise<StoreInfo | null> {
  return storesSvc.getStore(storeId);
}
export async function getStoreBySlug(slug: string): Promise<StoreInfo | null> {
  return storesSvc.getStoreBySlug(slug);
}
export async function getStoreByBotToken(botToken: string): Promise<StoreInfo | null> {
  return storesSvc.getStoreByBotToken(botToken);
}
export async function createStore(input: {
  slug: string;
  name: string;
  botToken: string;
  botUsername?: string | null;
  adminIds?: number[];
  adminChatId?: number | null;
  channelUrl?: string | null;
}): Promise<StoreInfo> {
  return storesSvc.createStore(input);
}
export async function updateStore(
  storeId: number,
  patch: Partial<Pick<StoreInfo, 'name' | 'botToken' | 'botUsername' | 'adminIds' | 'adminChatId' | 'channelUrl' | 'isActive'>>,
): Promise<StoreInfo> {
  return storesSvc.updateStore(storeId, patch);
}
export async function getStoresForAdmin(adminUserId: number): Promise<StoreInfo[]> {
  return storesSvc.getStoresForAdmin(adminUserId);
}
export async function addStoreMember(storeId: number, adminUserId: number, role: 'owner' | 'manager'): Promise<void> {
  return storesSvc.addStoreMember(storeId, adminUserId, role);
}
export async function removeStoreMember(storeId: number, adminUserId: number): Promise<void> {
  return storesSvc.removeStoreMember(storeId, adminUserId);
}

// ===== users =====
export async function upsertTelegramUser(storeId: number, input: TelegramUserInput): Promise<{ user: UserProfile; isNew: boolean }> {
  return users.upsertTelegramUser(storeId, input);
}
export async function getUser(userId: number): Promise<UserProfile | null> {
  return users.getUser(userId);
}
export async function isUserInStore(userId: number, storeId: number): Promise<boolean> {
  return users.isUserInStore(userId, storeId);
}
export async function setLanguage(storeId: number, userId: number, language: string): Promise<void> {
  return users.setLanguage(storeId, userId, language);
}
export async function setCurrency(userId: number, currency: string): Promise<void> {
  return users.setCurrency(userId, currency);
}
export async function setTimezone(userId: number, offsetMinutes: number): Promise<void> {
  return users.setTimezone(userId, offsetMinutes);
}
export async function toggleNotify(userId: number, flag: NotifyFlag): Promise<boolean> {
  return users.toggleNotify(userId, flag);
}
export async function setBanned(userId: number, banned: boolean): Promise<void> {
  return users.setBanned(userId, banned);
}
export async function markBlockedBot(userId: number, blocked: boolean): Promise<void> {
  return users.markBlockedBot(userId, blocked);
}

// ===== catalog =====
export async function listProducts(opts: {
  storeId: number;
  page?: number;
  pageSize?: number;
  sort?: CatalogSort;
  parentId?: number | null;
}): Promise<ProductPage> {
  return catalog.listProducts(opts);
}
export async function getProduct(productId: number): Promise<ProductDetail | null> {
  return catalog.getProduct(productId);
}
export async function getProductByCode(code: string): Promise<ProductDetail | null> {
  return catalog.getProductByCode(code);
}
export async function availableStock(productId: number): Promise<number | null> {
  return catalog.availableStock(productId);
}

// ===== pricing =====
export async function quote(input: {
  storeId: number;
  userId: number;
  productId: number;
  quantity: number;
  voucherCode?: string | null;
}): Promise<Quote> {
  return pricing.quote(input);
}

// ===== orders =====
export async function purchaseWithBalance(input: {
  storeId: number;
  userId: number;
  productId: number;
  quantity: number;
  voucherCode?: string | null;
}): Promise<PurchaseResult> {
  return orders.purchaseWithBalance(input);
}
export async function createPendingOrder(input: {
  storeId: number;
  userId: number;
  productId: number;
  quantity: number;
  voucherCode?: string | null;
}): Promise<OrderDetail> {
  return orders.createPendingOrder(input);
}
export async function cancelExpiredOrders(now?: Date): Promise<number> {
  return orders.cancelExpiredOrders(now);
}
export async function listUserOrders(userId: number, page?: number, pageSize?: number, storeId?: number): Promise<Paged<OrderSummary>> {
  return orders.listUserOrders(userId, page, pageSize, storeId);
}
export async function getOrder(orderId: number, userId: number | null): Promise<OrderDetail | null> {
  return orders.getOrder(orderId, userId);
}
export async function refundOrder(orderId: number, note?: string): Promise<OrderDetail> {
  return orders.refundOrder(orderId, note);
}

// ===== wallet =====
export async function getBalance(userId: number): Promise<Cents> {
  return wallet.getBalance(userId);
}
export async function applyLedger(
  input: { userId: number; amount: Cents; type: LedgerType; refType?: string; refId?: string; note?: string },
  tx?: DbOrTx,
): Promise<LedgerEntry> {
  return wallet.applyLedger(input, tx);
}
export async function listLedger(userId: number, page?: number, pageSize?: number): Promise<Paged<LedgerEntry>> {
  return wallet.listLedger(userId, page, pageSize);
}

// ===== payments (core side) =====
export async function settlePayment(paymentId: number): Promise<SettleResult> {
  return payments.settlePayment(paymentId);
}
export async function expireStalePayments(now?: Date): Promise<number> {
  return payments.expireStalePayments(now);
}

// ===== referral =====
export async function getReferralStats(storeId: number, userId: number): Promise<ReferralStats> {
  return referral.getReferralStats(storeId, userId);
}
export async function transferReferralToWallet(userId: number, amount?: Cents): Promise<Cents> {
  return referral.transferReferralToWallet(userId, amount);
}
export async function requestReferralWithdraw(storeId: number, userId: number, amount: Cents, note?: string): Promise<number> {
  return referral.requestReferralWithdraw(storeId, userId, amount, note);
}

// ===== settings & money =====
export async function getSettings(storeId: number): Promise<StoreSettings> {
  return settingsSvc.getSettings(storeId);
}
export async function updateSettings(storeId: number, patch: Partial<StoreSettings>): Promise<StoreSettings> {
  return settingsSvc.updateSettings(storeId, patch);
}
export function formatMoney(amount: Cents, currency: string, fxRates: Record<string, number>, locale?: string): string {
  return settingsSvc.formatMoney(amount, currency, fxRates, locale);
}
export function toBaseCents(amountMajor: number, currency: string, fxRates: Record<string, number>): Cents {
  return settingsSvc.toBaseCents(amountMajor, currency, fxRates);
}

// ===== broadcasts =====
export async function createBroadcast(input: { storeId: number; audience: BroadcastAudience; title?: string | null; body: string; queue?: boolean }): Promise<number> {
  return broadcasts.createBroadcast(input);
}
export async function claimBroadcast(storeId?: number): Promise<BroadcastJob | null> {
  return broadcasts.claimBroadcast(storeId);
}
export async function nextBroadcastRecipients(broadcastId: number, limit: number): Promise<number[]> {
  return broadcasts.nextBroadcastRecipients(broadcastId, limit);
}
export async function recordBroadcastProgress(broadcastId: number, sent: number, failed: number, lastUserId: number): Promise<void> {
  return broadcasts.recordBroadcastProgress(broadcastId, sent, failed, lastUserId);
}
export async function finishBroadcast(broadcastId: number, status: 'done' | 'failed'): Promise<void> {
  return broadcasts.finishBroadcast(broadcastId, status);
}

// ===== support =====
export async function getOpenSupportSession(storeId: number, userId: number): Promise<SupportSession | null> {
  return support.getOpenSupportSession(storeId, userId);
}
export async function openSupportSession(storeId: number, userId: number): Promise<SupportSession> {
  return support.openSupportSession(storeId, userId);
}
export async function setSupportThreads(sessionId: number, threads: { userThreadId?: number | null; adminThreadId?: number | null }): Promise<void> {
  return support.setSupportThreads(sessionId, threads);
}
export async function findSupportSessionByAdminThread(adminThreadId: number): Promise<SupportSession | null> {
  return support.findSupportSessionByAdminThread(adminThreadId);
}
export async function closeSupportSession(sessionId: number): Promise<void> {
  return support.closeSupportSession(sessionId);
}

// ===== developer API keys =====
export async function createApiKey(storeId: number, userId: number): Promise<{ key: string; info: ApiKeyInfo }> {
  return apikeys.createApiKey(storeId, userId);
}
export async function getActiveApiKey(userId: number): Promise<ApiKeyInfo | null> {
  return apikeys.getActiveApiKey(userId);
}
export async function revokeApiKeys(userId: number): Promise<void> {
  return apikeys.revokeApiKeys(userId);
}
export async function verifyApiKey(key: string): Promise<{ user: UserProfile; storeId: number } | null> {
  return apikeys.verifyApiKey(key);
}

// ===== misc =====
export function totp(secret: string, now?: Date): { code: string; secondsRemaining: number } {
  return totpSvc.totp(secret, now);
}
export async function rate(userId: number, value: 1 | -1): Promise<void> {
  return users.rate(userId, value);
}
