import { Router } from 'express';
import { UpdateMeSchema } from '@nirantar/shared';
import { prisma } from '../../lib/db';
import { currentUser, requireAuth } from '../middleware/auth';
import { toMeDto } from '../presenters/me.presenter';
import { parse } from '../validate';

export const meRouter = Router();

meRouter.use(requireAuth);

meRouter.get('/', async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: currentUser(req).id },
    include: { store: { select: { id: true, name: true } } },
  });
  res.json(toMeDto(user));
});

/** Name and language for everyone; consent and reminder choice for customers. */
meRouter.patch('/', async (req, res) => {
  const me = currentUser(req);
  const input = parse(UpdateMeSchema, req.body);
  const existing = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });

  const isCustomer = me.role === 'CUSTOMER';
  const user = await prisma.user.update({
    where: { id: me.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.locale !== undefined ? { locale: input.locale } : {}),
      // Record when consent was first given; giving it again doesn't move the date.
      ...(isCustomer && input.consentToStorePrescriptions && !existing.consentAt
        ? { consentAt: new Date() }
        : {}),
      ...(isCustomer && input.remindersOptIn !== undefined ? { remindersOptIn: input.remindersOptIn } : {}),
    },
    include: { store: { select: { id: true, name: true } } },
  });
  res.json(toMeDto(user));
});
