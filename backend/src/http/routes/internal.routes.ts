import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { env } from '../../config/env';
import { notFound, unauthenticated } from '../../lib/errors';
import { runReminders } from '../../services/refills/reminder.service';

/**
 * Called by the daily GitHub Actions schedule (09:00 IST). Protected by a
 * shared secret header; disabled entirely when CRON_SECRET isn't configured.
 */
export const internalRouter = Router();

internalRouter.post('/reminders/run', async (req, res) => {
  if (!env.CRON_SECRET) throw notFound();
  const given = Buffer.from(String(req.headers['x-cron-secret'] ?? ''));
  const expected = Buffer.from(env.CRON_SECRET);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw unauthenticated('Invalid cron secret.');
  res.json(await runReminders());
});
