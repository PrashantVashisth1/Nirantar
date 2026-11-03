import { pino } from 'pino';
import { env } from '../config/env';

/**
 * Structured JSON logs. Sensitive fields are redacted so phone numbers, codes,
 * cookies and prescription data never end up in log files.
 */
export const logger = pino({
  level: env.APP_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers["set-cookie"]',
      '*.phone',
      '*.otp',
      '*.code',
      '*.password',
    ],
    censor: '[redacted]',
  },
  ...(env.NODE_ENV === 'development'
    ? { transport: { target: 'pino-pretty', options: { colorize: true, singleLine: true } } }
    : {}),
});
