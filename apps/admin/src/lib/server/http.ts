import type { RequestEvent } from '@sveltejs/kit';
import { isUserInStore } from '@tokobun/core';
import { broadcasts, getDb, orders, payments, products, vouchers } from '@tokobun/db';
import { and, eq } from 'drizzle-orm';
import { AuthInputError } from './auth';

/** Thrown by request validation helpers; mapped to 400. */
export class BadRequest extends Error {
	constructor(
		message: string,
		public readonly field?: string
	) {
		super(message);
	}
}

const CORE_STATUS: Record<string, number> = {
	NOT_FOUND: 404,
	INVALID_STATE: 409,
	INSUFFICIENT_BALANCE: 409,
	OUT_OF_STOCK: 409
};

export function jsonError(status: number, message: string, extra: Record<string, unknown> = {}): Response {
	return Response.json({ error: message, ...extra }, { status });
}

/** Wraps an endpoint: maps validation / CoreError / unknown errors to JSON error responses. */
export function endpoint<E extends RequestEvent>(fn: (event: E) => Promise<unknown> | unknown) {
	return async (event: E): Promise<Response> => {
		try {
			const out = await fn(event);
			if (out instanceof Response) return out;
			return Response.json(out ?? { ok: true });
		} catch (err) {
			return toErrorResponse(err);
		}
	};
}

export function toErrorResponse(err: unknown): Response {
	if (err instanceof BadRequest) return jsonError(400, err.message, err.field ? { field: err.field } : {});
	if (err instanceof AuthInputError) return jsonError(400, err.message);
	if (err instanceof Error && err.name === 'CoreError') {
		const code = (err as Error & { code?: string }).code ?? 'CORE_ERROR';
		return jsonError(CORE_STATUS[code] ?? 400, err.message === code ? humanizeCode(code) : err.message, { code });
	}
	if (err instanceof Error && /not implemented yet/.test(err.message)) {
		return jsonError(501, err.message, { code: 'NOT_IMPLEMENTED' });
	}
	// Postgres unique violation (e.g. duplicate product/voucher code)
	const pg = err as { code?: string; detail?: string; cause?: { code?: string; detail?: string } };
	const pgCode = pg?.code ?? pg?.cause?.code;
	if (pgCode === '23505') return jsonError(409, 'Already exists: ' + (pg.detail ?? pg.cause?.detail ?? 'duplicate value'));
	if (pgCode === '23503') return jsonError(409, 'Record is referenced by other data and cannot be removed');
	console.error('[admin] request failed', err);
	return jsonError(500, 'Internal error');
}

function humanizeCode(code: string): string {
	return code.charAt(0) + code.slice(1).toLowerCase().replace(/_/g, ' ');
}

export async function readJson(request: Request, maxBytes = 1_000_000): Promise<Record<string, unknown>> {
	const cl = request.headers.get('content-length');
	if (cl && Number(cl) > maxBytes) throw new BadRequest('Request body too large');
	try {
		const body = await request.json();
		if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
	} catch {
		/* fallthrough */
	}
	throw new BadRequest('Expected a JSON object body');
}

// ---------- tiny validators ----------
type Obj = Record<string, unknown>;

export function str(o: Obj, key: string, opts: { min?: number; max?: number } = {}): string {
	const v = o[key];
	if (typeof v !== 'string') throw new BadRequest(`${key} is required`, key);
	const s = v.trim();
	if (s.length < (opts.min ?? 1)) throw new BadRequest(`${key} is required`, key);
	if (opts.max && s.length > opts.max) throw new BadRequest(`${key} is too long (max ${opts.max})`, key);
	return s;
}

export function optStr(o: Obj, key: string, opts: { max?: number } = {}): string | null {
	const v = o[key];
	if (v === undefined || v === null) return null;
	if (typeof v !== 'string') throw new BadRequest(`${key} must be text`, key);
	const s = v.trim();
	if (opts.max && s.length > opts.max) throw new BadRequest(`${key} is too long (max ${opts.max})`, key);
	return s || null;
}

export function int(o: Obj, key: string, opts: { min?: number; max?: number } = {}): number {
	const v = typeof o[key] === 'string' && /^-?\d+$/.test(o[key] as string) ? Number(o[key]) : o[key];
	if (typeof v !== 'number' || !Number.isSafeInteger(v)) throw new BadRequest(`${key} must be an integer`, key);
	if (opts.min !== undefined && v < opts.min) throw new BadRequest(`${key} must be ≥ ${opts.min}`, key);
	if (opts.max !== undefined && v > opts.max) throw new BadRequest(`${key} must be ≤ ${opts.max}`, key);
	return v;
}

export function optInt(o: Obj, key: string, opts: { min?: number; max?: number } = {}): number | null {
	if (o[key] === undefined || o[key] === null || o[key] === '') return null;
	return int(o, key, opts);
}

export function bool(o: Obj, key: string, fallback?: boolean): boolean {
	const v = o[key];
	if (typeof v === 'boolean') return v;
	if (v === undefined && fallback !== undefined) return fallback;
	throw new BadRequest(`${key} must be true/false`, key);
}

export function oneOf<T extends string>(o: Obj, key: string, values: readonly T[]): T {
	const v = o[key];
	if (typeof v === 'string' && (values as readonly string[]).includes(v)) return v as T;
	throw new BadRequest(`${key} must be one of ${values.join(', ')}`, key);
}

export function optDate(o: Obj, key: string): Date | null {
	const v = o[key];
	if (v === undefined || v === null || v === '') return null;
	const d = new Date(String(v));
	if (Number.isNaN(d.getTime())) throw new BadRequest(`${key} must be a date`, key);
	return d;
}

export function idParam(raw: string | undefined): number {
	if (!raw || !/^\d+$/.test(raw)) throw new BadRequest('Invalid id');
	return Number(raw);
}

export function enumParam<T extends string>(sp: URLSearchParams, key: string, values: readonly T[]): T | null {
	const v = sp.get(key);
	return v && (values as readonly string[]).includes(v) ? (v as T) : null;
}

export function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Verify a product belongs to the given store; throws 404 if not. */
export async function assertProductInStore(productId: number, storeId: number): Promise<void> {
	const [row] = await getDb()
		.select({ id: products.id })
		.from(products)
		.where(and(eq(products.id, productId), eq(products.storeId, storeId)))
		.limit(1);
	if (!row) throw new BadRequest('Product not found');
}

/** Verify an order belongs to the given store; throws 404 if not. */
export async function assertOrderInStore(orderId: number, storeId: number): Promise<void> {
	const [row] = await getDb()
		.select({ id: orders.id })
		.from(orders)
		.where(and(eq(orders.id, orderId), eq(orders.storeId, storeId)))
		.limit(1);
	if (!row) throw new BadRequest('Order not found');
}

/** Verify a payment belongs to the given store; throws 404 if not. */
export async function assertPaymentInStore(paymentId: number, storeId: number): Promise<void> {
	const [row] = await getDb()
		.select({ id: payments.id })
		.from(payments)
		.where(and(eq(payments.id, paymentId), eq(payments.storeId, storeId)))
		.limit(1);
	if (!row) throw new BadRequest('Payment not found');
}

/** Verify a voucher belongs to the given store; throws 404 if not. */
export async function assertVoucherInStore(voucherId: number, storeId: number): Promise<void> {
	const [row] = await getDb()
		.select({ id: vouchers.id })
		.from(vouchers)
		.where(and(eq(vouchers.id, voucherId), eq(vouchers.storeId, storeId)))
		.limit(1);
	if (!row) throw new BadRequest('Voucher not found');
}

/** Verify a broadcast belongs to the given store; throws 404 if not. */
export async function assertBroadcastInStore(broadcastId: number, storeId: number): Promise<void> {
	const [row] = await getDb()
		.select({ id: broadcasts.id })
		.from(broadcasts)
		.where(and(eq(broadcasts.id, broadcastId), eq(broadcasts.storeId, storeId)))
		.limit(1);
	if (!row) throw new BadRequest('Broadcast not found');
}

/** Verify a user has activity (orders or payments) in the given store; throws 404 if not. */
export async function assertUserInStore(userId: number, storeId: number): Promise<void> {
	if (!(await isUserInStore(userId, storeId))) throw new BadRequest('User not found');
}

export function escapeCsv(v: string): string {
	const needsQuote = /[,"\n\r\t]/.test(v) || /^[=+\-@]/.test(v);
	if (needsQuote) return `"${v.replace(/"/g, '""')}"`;
	return v;
}

/** Escape LIKE/ILIKE wildcards so user input is treated as literal text. */
export function escapeLike(v: string): string {
	return v.replace(/[%_\\]/g, '\\$&');
}
