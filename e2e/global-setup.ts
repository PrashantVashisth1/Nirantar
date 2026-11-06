import { execSync } from 'node:child_process';
import { DATABASE_URL } from './config';

/** Every run starts from the same demo world, in the E2E database. */
export default function globalSetup() {
  const env = { ...process.env, DATABASE_URL };
  execSync('npx prisma migrate deploy', { cwd: 'backend', stdio: 'pipe', env });
  execSync('npm run db:seed', { stdio: 'inherit', env });
}
