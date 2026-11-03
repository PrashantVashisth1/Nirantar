import { Router } from 'express';
import { prisma } from '../../lib/db';
import { requireAuth, requireRole } from '../middleware/auth';
import { orderSummaryInclude, toOrderSummary } from '../presenters/order.presenter';

/**
 * Pharmacist routes. Day 2 only has the queue listing; the verification
 * workspace and its actions are added on Day 5 (plan §11).
 */
export const pharmacistRouter = Router();
pharmacistRouter.use(requireAuth, requireRole('PHARMACIST'));

pharmacistRouter.get('/queue', async (_req, res) => {
  const orders = await prisma.order.findMany({
    where: { status: 'AWAITING_PHARMACIST' },
    include: orderSummaryInclude,
    orderBy: { placedAt: 'asc' }, // oldest first: whoever has waited longest is seen first
  });
  res.json({ rows: orders.map(toOrderSummary) });
});

/**
 * Central operations routes. Day 2 only lists stores; stock import and the
 * dashboard are added on Day 3 and Day 6.
 */
export const opsRouter = Router();
opsRouter.use(requireAuth, requireRole('OPS'));

opsRouter.get('/stores', async (_req, res) => {
  const stores = await prisma.store.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, code: true, name: true, isActive: true },
  });
  res.json(stores);
});
