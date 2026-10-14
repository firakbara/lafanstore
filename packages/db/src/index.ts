import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export * from './schema';
export { schema };

export type Database = ReturnType<typeof createDb>;
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Either the root db or an open transaction — core services accept both. */
export type DbOrTx = Database | Tx;

export function createDb(url = process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL is not set');
  const client = postgres(url, { max: 10 });
  return drizzle(client, { schema, casing: 'snake_case' });
}

let shared: Database | undefined;
/** Process-wide db instance (lazy). */
export function getDb(): Database {
  shared ??= createDb();
  return shared;
}
