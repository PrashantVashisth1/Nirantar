import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';

/** Any /api route that doesn't exist. */
export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(notFound('This endpoint does not exist.'));
};

/**
 * The single place where errors become HTTP responses.
 * - AppError  -> its own status, code and safe message
 * - ZodError  -> 400 with the list of invalid fields
 * - anything else -> 500 with a generic message; the real error is only logged
 * Every response carries the request id so a support person can find the log line.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = req.id;

  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details, requestId },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Some of the information sent is not valid.',
        details: err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
        requestId,
      },
    });
    return;
  }

  // Body parser errors (malformed JSON, body too large) come with a status.
  const status = typeof err?.status === 'number' && err.status < 500 ? err.status : 500;
  if (status < 500) {
    res.status(status).json({
      error: { code: 'BAD_REQUEST', message: 'The request could not be read.', requestId },
    });
    return;
  }

  logger.error({ err, requestId }, 'Unhandled error');
  res.status(500).json({
    error: {
      code: 'INTERNAL',
      message: 'Something went wrong on our side. Please try again.',
      requestId,
    },
  });
};
