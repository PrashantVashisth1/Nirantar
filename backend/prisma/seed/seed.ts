/**
 * Command-line entry for the demo seed. Run with: npm run db:seed
 * The same world is rebuilt by the "Reset demo" button in test mode.
 */
import { env } from '../../src/config/env';
import { prisma } from '../../src/lib/db';
import { seedDemoWorld } from './world';

if (env.APP_ENV === 'production') {
  console.error('Refusing to seed: APP_ENV is production.');
  process.exit(1);
}

seedDemoWorld()
  .then((counts) => console.log('Seed complete:', counts))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
