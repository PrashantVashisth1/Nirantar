import { timingSafeEqual } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { env } from '../../config/env';
import { notFound, unauthenticated } from '../../lib/errors';
import { resetDemo } from '../../services/ops/demo.service';
import { runReminders } from '../../services/refills/reminder.service';

/**
 * Called by the GitHub Actions schedules. Protected by a shared secret header;
 * disabled entirely when CRON_SECRET isn't configured.
 */
export const internalRouter = Router();

const cronSecret: RequestHandler = (req, _res, next) => {
  if (!env.CRON_SECRET) throw notFound();
  const given = Buffer.from(String(req.headers['x-cron-secret'] ?? ''));
  const expected = Buffer.from(env.CRON_SECRET);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw unauthenticated('Invalid cron secret.');
  next();
};

internalRouter.post('/reminders/run', cronSecret, async (_req, res) => {
  res.json(await runReminders());
});

// Nightly: keeps the public demo's dates and stock counts current (see demo-refresh.yml).
internalRouter.post('/demo/reset', cronSecret, async (_req, res) => {
  res.json(await resetDemo());
});
