import 'dotenv/config';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { db, pgClient } from './index.js';

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

async function runMigrations() {
  console.log('[DB] Running migrations...');
  await pgClient`CREATE EXTENSION IF NOT EXISTS postgis;`;
  await migrate(db, { migrationsFolder });
  console.log('[DB] Migrations completed successfully.');
}

runMigrations()
  .then(async () => {
    await pgClient.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[DB] Migration failed:', err);
    await pgClient.end();
    process.exit(1);
  });
