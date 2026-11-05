import { execSync } from 'node:child_process';

/** Every run starts from the same demo world. Refuses to run in production (see the seed). */
export default function globalSetup() {
  execSync('npm run db:seed', { stdio: 'inherit' });
}
