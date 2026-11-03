import type { RequestHandler } from 'express';

/**
 * API responses can contain health data. Tell every cache (browser, Vercel's
 * proxy, any CDN) never to store them, so one person's data can never be
 * served to another.
 */
export const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
};
