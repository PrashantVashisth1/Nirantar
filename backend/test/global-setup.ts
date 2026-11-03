import { execSync } from 'node:child_process';

/**
 * Runs once before all tests: brings the test database up to the latest
 * migration (tables, triggers and constraints), exactly like production.
 */
export default function setup() {
  const databaseUrl =
    process.env.DATABASE_URL ??
    'postgresql://nirantar:nirantar_local_only@localhost:5433/nirantar_test';
  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
