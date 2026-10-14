import { adminSessions, adminUsers, getDb } from '@tokobun/db';
import { and, eq, gt, lt, ne, sql } from 'drizzle-orm';
import {
	generateSessionToken,
	hashSessionToken,
	isPlausibleToken,
	sessionExpiry,
	shouldRenew,
	validatePassword,
	validateUsername
} from './session';

export interface AdminIdentity {
	id: number;
	username: string;
}

// A real hash so unknown usernames cost the same as wrong passwords (no user enumeration by timing).
let dummyHash: Promise<string> | undefined;

let bootstrapped = false;
/** If admin_users is empty, create the first admin from ADMIN_PANEL_USERNAME / ADMIN_PANEL_PASSWORD. */
export async function ensureBootstrapAdmin(): Promise<void> {
	if (bootstrapped) return;
	const db = getDb();
	const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(adminUsers);
	if (n === 0) {
		const username = process.env.ADMIN_PANEL_USERNAME?.trim();
		const password = process.env.ADMIN_PANEL_PASSWORD;
		if (!username || !password) {
			console.warn('[admin] admin_users is empty and ADMIN_PANEL_USERNAME/PASSWORD are not set — nobody can log in');
			return;
		}
		const passwordHash = await Bun.password.hash(password);
		await db.insert(adminUsers).values({ username, passwordHash }).onConflictDoNothing();
		console.info(`[admin] bootstrapped first admin "${username}"`);
	}
	bootstrapped = true;
}

export async function verifyCredentials(username: string, password: string): Promise<AdminIdentity | null> {
	await ensureBootstrapAdmin();
	const db = getDb();
	const [row] = await db.select().from(adminUsers).where(eq(adminUsers.username, username)).limit(1);
	if (!row) {
		dummyHash ??= Bun.password.hash('tokobun-dummy-password');
		await Bun.password.verify(password, await dummyHash);
		return null;
	}
	const ok = await Bun.password.verify(password, row.passwordHash);
	return ok ? { id: row.id, username: row.username } : null;
}

let lastCleanup = 0;
const CLEANUP_INTERVAL_MS = 60 * 60_000;

export async function createSession(adminId: number): Promise<{ token: string; expiresAt: Date }> {
	const token = generateSessionToken();
	const expiresAt = sessionExpiry();
	const db = getDb();
	await db.insert(adminSessions).values({ id: hashSessionToken(token), adminId, expiresAt });
	const now = Date.now();
	if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
		lastCleanup = now;
		db.delete(adminSessions).where(lt(adminSessions.expiresAt, new Date())).then(() => {}, () => {});
	}
	return { token, expiresAt };
}

/** Returns the admin and (when renewed) the new expiry. */
export async function validateSession(
	token: string | undefined
): Promise<{ admin: AdminIdentity; renewedUntil: Date | null } | null> {
	if (!isPlausibleToken(token)) return null;
	const db = getDb();
	const id = hashSessionToken(token);
	const [row] = await db
		.select({ adminId: adminUsers.id, username: adminUsers.username, expiresAt: adminSessions.expiresAt })
		.from(adminSessions)
		.innerJoin(adminUsers, eq(adminUsers.id, adminSessions.adminId))
		.where(and(eq(adminSessions.id, id), gt(adminSessions.expiresAt, new Date())))
		.limit(1);
	if (!row) return null;
	let renewedUntil: Date | null = null;
	if (shouldRenew(row.expiresAt)) {
		renewedUntil = sessionExpiry();
		await db.update(adminSessions).set({ expiresAt: renewedUntil }).where(eq(adminSessions.id, id));
	}
	return { admin: { id: row.adminId, username: row.username }, renewedUntil };
}

export async function invalidateSession(token: string | undefined): Promise<void> {
	if (!isPlausibleToken(token)) return;
	await getDb().delete(adminSessions).where(eq(adminSessions.id, hashSessionToken(token)));
}

export class AuthInputError extends Error {}

export async function createAdmin(username: string, password: string): Promise<AdminIdentity> {
	const uErr = validateUsername(username) ?? validatePassword(password);
	if (uErr) throw new AuthInputError(uErr);
	const db = getDb();
	const passwordHash = await Bun.password.hash(password);
	const [row] = await db.insert(adminUsers).values({ username, passwordHash }).onConflictDoNothing().returning();
	if (!row) throw new AuthInputError(`Username "${username}" is already taken`);
	return { id: row.id, username: row.username };
}

/** Change own password; keeps the current session, drops all other sessions of this admin. */
export async function changePassword(adminId: number, current: string, next: string, keepToken?: string): Promise<void> {
	const err = validatePassword(next);
	if (err) throw new AuthInputError(err);
	const db = getDb();
	const [row] = await db.select().from(adminUsers).where(eq(adminUsers.id, adminId)).limit(1);
	if (!row || !(await Bun.password.verify(current, row.passwordHash))) throw new AuthInputError('Current password is incorrect');
	await db.update(adminUsers).set({ passwordHash: await Bun.password.hash(next) }).where(eq(adminUsers.id, adminId));
	const keep = keepToken && isPlausibleToken(keepToken) ? hashSessionToken(keepToken) : '';
	await db.delete(adminSessions).where(and(eq(adminSessions.adminId, adminId), sql`${adminSessions.id} <> ${keep}`));
}

export async function listAllAdmins() {
	return getDb()
		.select({ id: adminUsers.id, username: adminUsers.username, createdAt: adminUsers.createdAt })
		.from(adminUsers)
		.orderBy(adminUsers.id);
}

const SELF_DELETE_ERROR = 'You cannot delete your own account';
const LAST_ADMIN_ERROR = 'The last admin account cannot be deleted';

/** Why an account may not be deleted, or null when it may. */
export function deleteAdminGuard(actorId: number, targetId: number, totalAdmins: number): string | null {
	if (actorId === targetId) return SELF_DELETE_ERROR;
	if (totalAdmins <= 1) return LAST_ADMIN_ERROR;
	return null;
}

/** Deletes an admin account; its sessions go with it (FK cascade). */
export async function deleteAdmin(actorId: number, targetId: number): Promise<void> {
	// Self-deletion needs no database; the "never the last admin" rule is enforced by the DELETE itself.
	const selfErr = deleteAdminGuard(actorId, targetId, Number.POSITIVE_INFINITY);
	if (selfErr) throw new AuthInputError(selfErr);
	const db = getDb();
	// Single statement, and the count locks every admin row (FOR UPDATE): two admins deleting each other
	// at the same time serialize, and the second one counts only the survivor. A plain count(*) subquery
	// would not do — under READ COMMITTED both statements would see two rows and both delete.
	const deleted = await db
		.delete(adminUsers)
		.where(
			and(
				eq(adminUsers.id, targetId),
				ne(adminUsers.id, actorId),
				sql`(SELECT count(*) FROM (SELECT 1 FROM ${adminUsers} FOR UPDATE) AS locked) > 1`
			)
		)
		.returning({ id: adminUsers.id });
	if (deleted.length) return;
	const [stillThere] = await db.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.id, targetId)).limit(1);
	throw new AuthInputError(stillThere ? LAST_ADMIN_ERROR : 'Admin account not found');
}
