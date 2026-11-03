import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 configuration: where the schema and migrations live, and which
 * database the CLI (migrate, studio) talks to. The running app connects
 * separately through the pg driver adapter in src/lib/db.ts.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
