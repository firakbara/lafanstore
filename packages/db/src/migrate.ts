import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb } from './index';

const url = process.argv[2] ?? process.env.DATABASE_URL;
const db = createDb(url);
await migrate(db, { migrationsFolder: new URL('../drizzle', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
console.log('migrations applied');
process.exit(0);
