import { Router, type Request } from 'express';
import { OtpRequestSchema, OtpVerifySchema, StaffLoginSchema } from '@nirantar/shared';
import { prisma } from '../../lib/db';
import { requestOtp, verifyOtp } from '../../services/auth/otp.service';
import { verifyStaffLogin } from '../../services/auth/staff-auth.service';
import { CUSTOMER_SESSION_MS, SESSION_COOKIE, STAFF_SESSION_MS } from '../middleware/session';
import { authRateLimit } from '../middleware/rate-limit';
import { toMeDto } from '../presenters/me.presenter';
import { parse } from '../validate';
import type { Role } from '@nirantar/shared';

export const authRouter = Router();

/**
 * Starts a fresh session after sign-in. regenerate() issues a NEW session id,
 * so an id an attacker planted before login is useless afterwards
 * (session fixation).
 */
function startSession(req: Request, user: { id: string; role: Role }, maxAgeMs: number) {
  return new Promise<void>((resolve, reject) => {
    req.session.regenerate((regenerateError) => {
      if (regenerateError) return reject(regenerateError);
      req.session.userId = user.id;
      req.session.role = user.role;
      req.session.cookie.maxAge = maxAgeMs;
      req.session.save((saveError) => (saveError ? reject(saveError) : resolve()));
    });
  });
}

authRouter.post('/otp/request', authRateLimit, async (req, res) => {
  const { phone } = parse(OtpRequestSchema, req.body);
  const result = await requestOtp(phone);
  res.status(202).json(result);
});

authRouter.post('/otp/verify', authRateLimit, async (req, res) => {
  const { phone, code } = parse(OtpVerifySchema, req.body);
  const { user, isNew } = await verifyOtp(phone, code);
  await startSession(req, user, CUSTOMER_SESSION_MS);
  res.json({ user: toMeDto(user), isNew });
});

authRouter.post('/staff/login', authRateLimit, async (req, res) => {
  const { email, password } = parse(StaffLoginSchema, req.body);
  const user = await verifyStaffLogin(email, password);
  await startSession(req, user, STAFF_SESSION_MS);
  const withStore = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    include: { store: { select: { id: true, name: true } } },
  });
  res.json({ user: toMeDto(withStore) });
});

authRouter.post('/logout', (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie(SESSION_COOKIE);
    res.status(204).end();
  });
});
