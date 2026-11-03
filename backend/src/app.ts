import { randomUUID } from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { logger } from './lib/logger';
import { errorHandler, notFoundHandler } from './http/middleware/error-handler';
import { noStore } from './http/middleware/no-store';
import { originCheck } from './http/middleware/origin-check';
import { sessionMiddleware } from './http/middleware/session';
import { authRouter } from './http/routes/auth.routes';
import { customerRouter } from './http/routes/customer.routes';
import { healthRouter } from './http/routes/health.routes';
import { meRouter } from './http/routes/me.routes';
import { opsRouter, pharmacistRouter } from './http/routes/staff.routes';

/**
 * Builds the Express app without starting a server, so tests can call it
 * directly with Supertest.
 *
 * Middleware order matters:
 *  1. security headers   2. request id + logging   3. no-store on /api
 *  4. JSON body parsing  5. CSRF origin check      6. health (no session needed)
 *  7. session            8. routes                 9. 404, then error handler
 */
export function createApp() {
  const app = express();

  // Render and Vercel sit in front of us as proxies; trust the first hop so
  // req.ip and secure cookies work correctly.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    pinoHttp({
      logger,
      // Log only what's needed to trace a request: never headers or bodies,
      // which can contain cookies, phone numbers or health data.
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && incoming.length <= 64 ? incoming : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
    }),
  );

  app.use('/api', noStore);
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', originCheck);

  app.use('/api', healthRouter);

  app.use('/api', sessionMiddleware());
  app.use('/api/auth', authRouter);
  app.use('/api/me', meRouter);
  app.use('/api/pharmacist', pharmacistRouter);
  app.use('/api/ops', opsRouter);
  app.use('/api', customerRouter);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}
