import { rateLimit } from 'express-rate-limit';
import { env, isDemoMode } from '../../config/env';

/**
 * Per-IP limit on sign-in endpoints, against password guessing and OTP spam.
 * In-memory (one server instance); per-phone OTP limits are also enforced in
 * the database by the OTP service. The demo allows more, because a reviewer
 * keeps switching between customer, pharmacist and operations accounts.
 */
export const authRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: () => (env.APP_ENV === 'test' ? 1000 : isDemoMode() ? 150 : 30),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a few minutes and try again.' },
    });
  },
});
