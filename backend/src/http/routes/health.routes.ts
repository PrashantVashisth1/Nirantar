import { Router } from 'express';
import { prisma } from '../../lib/db';

export const healthRouter = Router();

/**
 * Liveness: is the process up? Deliberately does NOT touch the database, so
 * uptime pings don't keep the (free-tier) database awake.
 */
healthRouter.get('/health', (_req, res) => {
  res.json({ ok: true });
});

/** Readiness: can we reach the database? */
healthRouter.get('/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: 'up' });
  } catch {
    res.status(503).json({ ok: false, db: 'down' });
  }
});
