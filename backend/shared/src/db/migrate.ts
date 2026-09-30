import 'dotenv/config';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { db, pgClient } from './index.js';

// Script one-shot: aplica as migrações Drizzle e encerra.
// É executado pelo container `db-migrate` do docker-compose antes dos microsserviços
// (depends_on: condition: service_completed_successfully), garantindo que apenas UM
// processo migre o banco mesmo com várias réplicas de geo-processing-service.
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
