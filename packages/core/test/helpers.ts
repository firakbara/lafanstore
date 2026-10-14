import { adminUsers, getDb, payments, productDiscounts, products, storeMembers, stockItems, stores, users, vouchers } from '@tokobun/db';
import { eq, sql } from 'drizzle-orm';
import { applyLedger, generateProductCode, generatePaymentCode } from '../src';

export const db = () => getDb();

export async function resetDb() {
  const d = db();
  await d.execute(sql`truncate table
    users, products, product_discounts, stock_items, vouchers, orders, voucher_redemptions, ledger_entries,
    payments, referral_earnings, referral_payouts, broadcasts, support_sessions, api_keys, ratings, settings
    restart identity cascade`);
  await d.delete(storeMembers);
  await d.delete(stores).where(sql`${stores.id} > 1`);
  await d.delete(adminUsers);
}

let nextUserId = 1000;
export async function makeUser(opts: { balance?: number; referredBy?: number; id?: number } = {}) {
  const id = opts.id ?? nextUserId++;
  await db()
    .insert(users)
    .values({ id, referralCode: `R${id}`, referredBy: opts.referredBy ?? null });
  if (opts.balance) await applyLedger({ userId: id, amount: opts.balance, type: 'adjustment', refType: 'admin' });
  return id;
}

export async function makeProduct(
  opts: {
    price?: number;
    stock?: number;
    unlimited?: boolean;
    discounts?: { minQty: number; percentBp: number }[];
    parentId?: number;
    isCollection?: boolean;
    name?: string;
    isActive?: boolean;
  } = {},
) {
  const [p] = await db()
    .insert(products)
    .values({
      storeId: 1,
      code: generateProductCode(),
      name: opts.name ?? 'Test product',
      price: opts.price ?? 100,
      unlimited: opts.unlimited ?? false,
      unlimitedContent: opts.unlimited ? 'https://example.com/unlimited' : null,
      parentId: opts.parentId ?? null,
      isCollection: opts.isCollection ?? false,
      isActive: opts.isActive ?? true,
    })
    .returning();
  const n = opts.stock ?? 0;
  if (n > 0) {
    await db()
      .insert(stockItems)
      .values(Array.from({ length: n }, (_, i) => ({ productId: p!.id, content: `item-${p!.id}-${i + 1}` })));
  }
  for (const d of opts.discounts ?? []) await db().insert(productDiscounts).values({ productId: p!.id, ...d });
  return p!.id;
}

export async function makeVoucher(v: Partial<typeof vouchers.$inferInsert> & { code: string; kind: 'percent' | 'fixed'; value: number }) {
  const [r] = await db().insert(vouchers).values({ storeId: 1, ...v }).returning();
  return r!.id;
}

export async function makePayment(p: {
  userId: number;
  purpose: 'topup' | 'order';
  amount: number;
  orderId?: number;
  expiresAt?: Date;
}) {
  const [r] = await db()
    .insert(payments)
    .values({
      storeId: 1,
      code: generatePaymentCode(),
      userId: p.userId,
      purpose: p.purpose,
      orderId: p.orderId ?? null,
      provider: 'manual',
      method: 'TEST',
      amount: p.amount,
      payCurrency: 'USD',
      payAmount: (p.amount / 100).toFixed(2),
      expiresAt: p.expiresAt ?? new Date(Date.now() + 15 * 60_000),
    })
    .returning();
  return r!.id;
}

let nextAdminId = 1;
export async function makeAdmin(username?: string) {
  const id = nextAdminId++;
  const name = username ?? `admin${id}`;
  const [row] = await db().insert(adminUsers).values({ username: name, passwordHash: 'test-hash' }).returning({ id: adminUsers.id });
  return row!.id;
}

/** users.balance must equal SUM(ledger) for every user. Returns mismatches. */
export async function ledgerMismatches() {
  const rows = await db().execute<{ id: string; balance: string; s: string }>(sql`
    select u.id, u.balance, coalesce(sum(l.amount), 0) as s
    from users u left join ledger_entries l on l.user_id = u.id
    group by u.id having u.balance <> coalesce(sum(l.amount), 0)`);
  return rows as unknown as unknown[];
}

export async function stockStatusCounts(productId: number) {
  const rows = await db()
    .select({ status: stockItems.status, n: sql<number>`count(*)::int` })
    .from(stockItems)
    .where(eq(stockItems.productId, productId))
    .groupBy(stockItems.status);
  const out = { available: 0, reserved: 0, sold: 0 };
  for (const r of rows) out[r.status] = Number(r.n);
  return out;
}

export async function expectCode(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e: any) {
    if (e?.code === code) return;
    throw new Error(`expected CoreError ${code}, got ${e?.code ?? e}`);
  }
  throw new Error(`expected CoreError ${code}, but it resolved`);
}
