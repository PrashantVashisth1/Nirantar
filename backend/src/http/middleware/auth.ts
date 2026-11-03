import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Role } from '@nirantar/shared';
import { prisma } from '../../lib/db';
import { forbidden, unauthenticated } from '../../lib/errors';

/** The signed-in user, attached to the request by requireAuth. */
export interface CurrentUser {
  id: string;
  role: Role;
  name: string;
  storeId: string | null;
  pharmacistRegNo: string | null;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: CurrentUser;
  }
}

/**
 * Loads the signed-in user from the session. The user is re-read from the
 * database on every request, so deactivating an account takes effect at once.
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const userId = req.session.userId;
  if (!userId) return next(unauthenticated());

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, name: true, storeId: true, pharmacistRegNo: true, isActive: true },
  });
  if (!user || !user.isActive) {
    req.session.destroy(() => undefined);
    return next(unauthenticated('Your session has ended. Please sign in again.'));
  }

  req.user = {
    id: user.id,
    role: user.role,
    name: user.name,
    storeId: user.storeId,
    pharmacistRegNo: user.pharmacistRegNo,
  };
  next();
};

/** Only lets the listed roles through (use after requireAuth). */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthenticated());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}

/** The signed-in user; throws if a route forgot requireAuth (a programming error). */
export function currentUser(req: Request): CurrentUser {
  if (!req.user) throw new Error('currentUser() used on a route without requireAuth');
  return req.user;
}
