import { hash, verify } from '@node-rs/argon2';
import { prisma } from '../../lib/db';
import { AppError } from '../../lib/errors';

// Verified against when the email doesn't exist, so a wrong email and a wrong
// password take the same time (no hint about which accounts exist).
const dummyHashPromise = hash('not-a-real-password-just-for-equal-timing');

const INVALID = () => new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');

/** Pharmacists and operations staff sign in with email + password (argon2 hashes). */
export async function verifyStaffLogin(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.passwordHash || user.role === 'CUSTOMER') {
    await verify(await dummyHashPromise, password).catch(() => false);
    throw INVALID();
  }

  const ok = await verify(user.passwordHash, password).catch(() => false);
  if (!ok) throw INVALID();
  if (!user.isActive) throw new AppError(403, 'ACCOUNT_DISABLED', 'This account has been disabled.');

  return user;
}
