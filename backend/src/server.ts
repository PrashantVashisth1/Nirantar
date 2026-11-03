import { env } from './config/env';
import { createApp } from './app';
import { prisma } from './lib/db';
import { logger } from './lib/logger';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT} (APP_ENV=${env.APP_ENV})`);
});

/** Stop accepting requests, finish the ones in flight, then close the DB pool. */
function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
  // Force exit if something hangs.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
