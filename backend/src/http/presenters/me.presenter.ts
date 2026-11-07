import { maskPhone, type MeDto } from '@nirantar/shared';
import { demoGuideFor } from '../../services/auth/demo-accounts';
import type { Store, User } from '../../generated/prisma/client';

/** What the browser is allowed to know about the signed-in user. */
export function toMeDto(user: User & { store?: Pick<Store, 'id' | 'name'> | null }): MeDto {
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    locale: user.locale,
    phoneMasked: user.phone ? maskPhone(user.phone) : null,
    email: user.email,
    needsOnboarding: user.role === 'CUSTOMER' && (!user.consentAt || user.name.trim() === ''),
    remindersOptIn: user.remindersOptIn,
    store: user.store ? { id: user.store.id, name: user.store.name } : null,
    pharmacistRegNo: user.pharmacistRegNo,
    demoGuide: demoGuideFor(user),
  };
}
