import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { OtpRequestResult } from '@nirantar/shared';
import { env, isDemoMode } from '../../config/env';
import { prisma } from '../../lib/db';
import { AppError } from '../../lib/errors';

export const OTP_TTL_MS = 5 * 60 * 1000; // a code works for 5 minutes
export const OTP_MAX_ATTEMPTS = 5; // wrong guesses allowed per code
export const OTP_RESEND_AFTER_S = 30; // minimum gap between two codes
export const OTP_MAX_PER_WINDOW = 3; // codes per phone...
export const OTP_WINDOW_MS = 15 * 60 * 1000; // ...per 15 minutes

/**
 * Only a keyed hash (HMAC) of the code is stored. A plain hash of a 6-digit
 * code could be reversed by trying all 1,000,000 options; with a server-side
 * secret (the pepper) that isn't possible from a leaked table alone.
 */
function hashCode(phone: string, code: string): string {
  return createHmac('sha256', env.OTP_PEPPER).update(`${phone}:${code}`).digest('hex');
}

/**
 * Creates a sign-in code for a phone number. The response is the same whether
 * or not the number already has an account, so it can't be used to discover
 * who is a customer. SMS sending is mocked (plan A14): in demo mode the code
 * is returned so the reviewer can see it; in production it never is (A16).
 */
export async function requestOtp(phone: string, now = new Date()): Promise<OtpRequestResult> {
  const recent = await prisma.otpCode.findMany({
    where: { phone, createdAt: { gte: new Date(now.getTime() - OTP_WINDOW_MS) } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  const latest = recent[0];
  if (latest) {
    const secondsSince = (now.getTime() - latest.createdAt.getTime()) / 1000;
    if (secondsSince < OTP_RESEND_AFTER_S) {
      throw new AppError(429, 'OTP_TOO_SOON', 'Please wait a few seconds before asking for a new code.', {
        retryAfterSeconds: Math.ceil(OTP_RESEND_AFTER_S - secondsSince),
      });
    }
  }
  if (recent.length >= OTP_MAX_PER_WINDOW) {
    throw new AppError(429, 'RATE_LIMITED', 'Too many codes requested. Please wait 15 minutes and try again.');
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

  await prisma.$transaction([
    // Only the newest code works; older unused ones are retired.
    prisma.otpCode.updateMany({ where: { phone, consumedAt: null }, data: { consumedAt: now } }),
    prisma.otpCode.create({ data: { phone, codeHash: hashCode(phone, code), expiresAt, createdAt: now } }),
  ]);

  return {
    expiresAt: expiresAt.toISOString(),
    resendAfterSeconds: OTP_RESEND_AFTER_S,
    ...(isDemoMode() ? { demoCode: code } : {}),
  };
}

/**
 * Checks a code. On success the code is used up and the customer account is
 * returned (created on first sign-in; onboarding then asks for name and consent).
 */
export async function verifyOtp(phone: string, code: string, now = new Date()) {
  const otp = await prisma.otpCode.findFirst({
    where: { phone, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (!otp || otp.expiresAt <= now) {
    throw new AppError(400, 'OTP_EXPIRED', 'This code has expired. Please ask for a new one.');
  }
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    throw new AppError(429, 'OTP_LOCKED', 'Too many wrong tries. Please ask for a new code.');
  }

  const expected = Buffer.from(otp.codeHash, 'hex');
  const given = Buffer.from(hashCode(phone, code), 'hex');
  const matches = expected.length === given.length && timingSafeEqual(expected, given);

  if (!matches) {
    const updated = await prisma.otpCode.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    const triesLeft = Math.max(0, OTP_MAX_ATTEMPTS - updated.attempts);
    throw new AppError(
      400,
      'OTP_INVALID',
      triesLeft > 0 ? `That code didn't match. ${triesLeft} ${triesLeft === 1 ? 'try' : 'tries'} left.` : 'Too many wrong tries. Please ask for a new code.',
      { triesLeft },
    );
  }

  // Mark used only if still unused, so the same code can't sign in twice in parallel.
  const consumed = await prisma.otpCode.updateMany({
    where: { id: otp.id, consumedAt: null },
    data: { consumedAt: now },
  });
  if (consumed.count === 0) {
    throw new AppError(400, 'OTP_EXPIRED', 'This code has already been used. Please ask for a new one.');
  }

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    if (existing.role !== 'CUSTOMER' || !existing.isActive) {
      throw new AppError(403, 'FORBIDDEN', "This number can't be used to sign in.");
    }
    return { user: existing, isNew: false };
  }

  const user = await prisma.user.create({ data: { role: 'CUSTOMER', name: '', phone } });
  return { user, isNew: true };
}
