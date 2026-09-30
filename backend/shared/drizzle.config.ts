import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dbCredentials: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRES_USER || 'ecopulse_user',
    password: process.env.POSTGRES_PASSWORD || 'ecopulse_pass',
    database: process.env.POSTGRES_DB || 'ecopulse_db',
  },
  verbose: true,
  strict: true,
});
