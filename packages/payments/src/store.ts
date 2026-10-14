// Persistence for payment rows. The service talks to this interface so its logic can be unit-tested
// with an in-memory store; `createDbStore` is the real Drizzle/Postgres implementation.
import type { Cents, PaymentStatus } from '@tokobun/core';
import { getDb, orders, payments, type Database } from '@tokobun/db';
import { and, eq, sql } from 'drizzle-orm';

export interface PaymentRow {
  id: number;
  storeId: number;
  code: string;
  userId: number;
  purpose: 'topup' | 'order';
  orderId: number | null;
  provider: string;
  method: string;
  amount: Cents;
  fee: Cents;
  payCurrency: string;
  payAmount: string;
  status: PaymentStatus;
  providerRef: string | null;
  checkoutUrl: string | null;
  qrString: string | null;
  expiresAt: Date | null;
  paidAt: Date | null;
  raw: unknown;
}

export type NewPaymentRow = Omit<PaymentRow, 'id' | 'status' | 'paidAt'>;

export interface PaymentStore {
  /** Insert a pending payment; when orderId is set also sets orders.payment_id (same transaction). */
  insert(row: NewPaymentRow): Promise<PaymentRow>;
  getById(id: number): Promise<PaymentRow | null>;
  findByProviderRef(provider: string, providerRef: string): Promise<PaymentRow | null>;
  findByCode(code: string): Promise<PaymentRow | null>;
  /** Atomically move a payment from 'pending' to `status`. Returns the updated row, or null if it was not pending. */
  transitionFromPending(id: number, status: Exclude<PaymentStatus, 'pending' | 'paid'>): Promise<PaymentRow | null>;
  /** Shallow-merge `patch` into payments.raw (best-effort audit trail). */
  mergeRaw(id: number, patch: Record<string, unknown>): Promise<void>;
}

type DbRow = typeof payments.$inferSelect;

function toRow(r: DbRow): PaymentRow {
  return {
    id: r.id,
    storeId: r.storeId,
    code: r.code,
    userId: r.userId,
    purpose: r.purpose,
    orderId: r.orderId,
    provider: r.provider,
    method: r.method,
    amount: r.amount,
    fee: r.fee,
    payCurrency: r.payCurrency,
    payAmount: r.payAmount,
    status: r.status,
    providerRef: r.providerRef,
    checkoutUrl: r.checkoutUrl,
    qrString: r.qrString,
    expiresAt: r.expiresAt,
    paidAt: r.paidAt,
    raw: r.raw,
  };
}

export function createDbStore(dbArg?: Database): PaymentStore {
  const db = () => dbArg ?? getDb();
  return {
    async insert(row) {
      return db().transaction(async (t) => {
        const [r] = await t
          .insert(payments)
          .values({ ...row, raw: row.raw ?? null, status: 'pending' })
          .returning();
        if (!r) throw new Error('payment insert returned no row');
        if (row.orderId !== null) await t.update(orders).set({ paymentId: r.id }).where(eq(orders.id, row.orderId));
        return toRow(r);
      });
    },
    async getById(id) {
      const [r] = await db().select().from(payments).where(eq(payments.id, id)).limit(1);
      return r ? toRow(r) : null;
    },
    async findByProviderRef(provider, providerRef) {
      const [r] = await db()
        .select()
        .from(payments)
        .where(and(eq(payments.provider, provider), eq(payments.providerRef, providerRef)))
        .limit(1);
      return r ? toRow(r) : null;
    },
    async findByCode(code) {
      const [r] = await db().select().from(payments).where(eq(payments.code, code)).limit(1);
      return r ? toRow(r) : null;
    },
    async transitionFromPending(id, status) {
      const [r] = await db()
        .update(payments)
        .set({ status })
        .where(and(eq(payments.id, id), eq(payments.status, 'pending')))
        .returning();
      return r ? toRow(r) : null;
    },
    async mergeRaw(id, patch) {
      await db()
        .update(payments)
        .set({ raw: sql`coalesce(${payments.raw}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb` })
        .where(eq(payments.id, id));
    },
  };
}

/** In-memory store for unit tests. */
export function createMemoryStore(): PaymentStore & { rows: PaymentRow[] } {
  const rows: PaymentRow[] = [];
  let seq = 0;
  return {
    rows,
    async insert(row) {
      const r: PaymentRow = { ...row, id: ++seq, status: 'pending', paidAt: null };
      rows.push(r);
      return { ...r };
    },
    async getById(id) {
      const r = rows.find((x) => x.id === id);
      return r ? { ...r } : null;
    },
    async findByProviderRef(provider, ref) {
      const r = rows.find((x) => x.provider === provider && x.providerRef === ref);
      return r ? { ...r } : null;
    },
    async findByCode(code) {
      const r = rows.find((x) => x.code === code);
      return r ? { ...r } : null;
    },
    async transitionFromPending(id, status) {
      const r = rows.find((x) => x.id === id);
      if (!r || r.status !== 'pending') return null;
      r.status = status;
      return { ...r };
    },
    async mergeRaw(id, patch) {
      const r = rows.find((x) => x.id === id);
      if (r) r.raw = { ...((r.raw as Record<string, unknown> | null) ?? {}), ...patch };
    },
  };
}
