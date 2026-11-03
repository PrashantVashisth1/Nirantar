import type { RequestHandler } from 'express';
import { env } from '../../config/env';
import { forbidden } from '../../lib/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection. Browsers send an Origin header on every cross-site
 * POST/PATCH/DELETE. If a request that changes data comes from a different
 * site than our frontend, refuse it. Together with SameSite=Lax cookies this
 * stops another website from acting as a signed-in user.
 *
 * Requests with no Origin/Referer at all (curl, server-to-server) are allowed:
 * they can't carry the user's browser cookies, so they can't be CSRF.
 */
export const originCheck: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.headers.origin ?? refererOrigin(req.headers.referer);
  if (origin && origin !== env.APP_ORIGIN) {
    return next(forbidden('This request came from an unexpected website.'));
  }
  next();
};

function refererOrigin(referer: string | undefined): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return 'invalid';
  }
}
