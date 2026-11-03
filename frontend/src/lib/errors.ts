import type { TFunction } from 'i18next';
import { ApiError } from './api';

const TRANSLATED_CODES = new Set([
  'OTP_INVALID',
  'OTP_EXPIRED',
  'OTP_LOCKED',
  'OTP_TOO_SOON',
  'RATE_LIMITED',
  'INVALID_CREDENTIALS',
  'NETWORK',
]);

/** A user-facing message for an error, translated when we know the code. */
export function errorMessage(error: unknown, t: TFunction): string {
  if (error instanceof ApiError) {
    if (TRANSLATED_CODES.has(error.code)) return t(`errors.${error.code}`);
    return error.message;
  }
  return t('common.genericError');
}
