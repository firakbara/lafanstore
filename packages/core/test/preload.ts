// Point the shared db at the TEST database before anything calls getDb().
import { loadRootEnv } from '../src/env';

loadRootEnv();
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is not set');
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
