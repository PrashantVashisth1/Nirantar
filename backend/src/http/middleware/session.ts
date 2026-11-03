import connectPgSimple from 'connect-pg-simple';
import session from 'express-session';
import type { Role } from '@nirantar/shared';
import { env } from '../../config/env';

declare module 'express-session' {
  interface SessionData {
    userId: string;
    role: Role;
  }
}

export const SESSION_COOKIE = 'nr_sid';
export const CUSTOMER_SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days: caregivers shouldn't re-login every visit
export const STAFF_SESSION_MS = 12 * 60 * 60 * 1000; // 12 hours: about one shift

const PgStore = connectPgSimple(session);

/**
 * Sessions live in Postgres (the `session` table), so they survive restarts
 * and can be revoked server-side. The browser only holds a random, signed id
 * in an HttpOnly cookie: JavaScript on the page can't read it.
 */
export function sessionMiddleware() {
  return session({
    store: new PgStore({
      conString: env.DATABASE_URL,
      tableName: 'session',
      createTableIfMissing: false,
      // Clean up expired sessions every 15 minutes (not in tests, to avoid stray timers).
      pruneSessionInterval: env.APP_ENV === 'test' ? false : 15 * 60,
    }),
    name: SESSION_COOKIE,
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      maxAge: CUSTOMER_SESSION_MS,
    },
  });
}
