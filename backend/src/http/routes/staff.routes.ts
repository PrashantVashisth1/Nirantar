import { Router } from 'express';
import { z } from 'zod';
import { ApproveOrderSchema, RejectOrderSchema, ReuploadRequestSchema } from '@nirantar/shared';
import { prisma } from '../../lib/db';
import { AppError } from '../../lib/errors';
import { searchProducts } from '../../services/orders/checkout.service';
import { handOver, listStoreOrders, markDelivered, markPacked, startPicking } from '../../services/orders/fulfilment.service';
import { approveOrder, getQueue, getWorkspace, nextInQueue, rejectOrder, requestReupload } from '../../services/orders/verification.service';
import { getPrescriptionImage, retryRead } from '../../services/prescriptions/prescription.service';
import { currentUser, requireAuth, requireRole } from '../middleware/auth';
import { parse, parseId } from '../validate';

/** Pharmacist verification (P1, P2). */
export const pharmacistRouter = Router();
pharmacistRouter.use(requireAuth, requireRole('PHARMACIST'));

pharmacistRouter.get('/queue', async (_req, res) => {
  res.json(await getQueue());
});

pharmacistRouter.post('/queue/next', async (req, res) => {
  const id = await nextInQueue(currentUser(req).id);
  if (!id) return void res.status(204).end();
  res.json({ orderId: id });
});

pharmacistRouter.get('/orders/:id', async (req, res) => {
  res.json(await getWorkspace(currentUser(req).id, parseId(req.params.id)));
});

pharmacistRouter.get('/products', async (req, res) => {
  res.json(await searchProducts(parse(z.object({ q: z.string().max(60).default('') }), req.query).q));
});

pharmacistRouter.post('/orders/:id/approve', async (req, res) => {
  const me = currentUser(req);
  res.json(await approveOrder({ id: me.id, name: me.name, pharmacistRegNo: me.pharmacistRegNo }, parseId(req.params.id), parse(ApproveOrderSchema, req.body)));
});

pharmacistRouter.post('/orders/:id/reject', async (req, res) => {
  const me = currentUser(req);
  await rejectOrder({ id: me.id, name: me.name, pharmacistRegNo: me.pharmacistRegNo }, parseId(req.params.id), parse(RejectOrderSchema, req.body));
  res.status(204).end();
});

pharmacistRouter.post('/orders/:id/request-reupload', async (req, res) => {
  const me = currentUser(req);
  await requestReupload({ id: me.id, name: me.name, pharmacistRegNo: me.pharmacistRegNo }, parseId(req.params.id), parse(ReuploadRequestSchema, req.body));
  res.status(204).end();
});

pharmacistRouter.post('/prescriptions/:id/retry-ai', async (req, res) => {
  await retryRead(parseId(req.params.id));
  res.status(202).end();
});

// ── Store fulfilment (S1): the pharmacist's own store only (plan A2) ──
const Version = z.object({ version: z.number().int() });
const storeId = (req: Parameters<typeof currentUser>[0]) => {
  const me = currentUser(req);
  if (!me.storeId) throw new AppError(403, 'FORBIDDEN', 'You are not assigned to a store.');
  return { id: me.id, storeId: me.storeId };
};

pharmacistRouter.get('/store/orders', async (req, res) => {
  const { tab } = parse(z.object({ tab: z.enum(['to_pick', 'packed', 'out', 'delivered']).default('to_pick') }), req.query);
  res.json(await listStoreOrders(storeId(req).storeId, tab));
});

pharmacistRouter.get('/store/counts', async (req, res) => {
  const id = storeId(req).storeId;
  const grouped = await prisma.order.groupBy({
    by: ['status'],
    where: { storeId: id, status: { in: ['ASSIGNED', 'PICKING', 'PACKED', 'OUT_FOR_DELIVERY'] } },
    _count: true,
  });
  const count = (statuses: string[]) => grouped.filter((g) => statuses.includes(g.status)).reduce((n, g) => n + g._count, 0);
  res.json({ to_pick: count(['ASSIGNED', 'PICKING']), packed: count(['PACKED']), out: count(['OUT_FOR_DELIVERY']) });
});

pharmacistRouter.post('/store/orders/:id/start-picking', async (req, res) => {
  await startPicking(storeId(req), parseId(req.params.id), parse(Version, req.body).version);
  res.status(204).end();
});

pharmacistRouter.post('/store/orders/:id/pack', async (req, res) => {
  const { version, invoiceNo } = parse(Version.extend({ invoiceNo: z.string().trim().min(1, 'Enter the store invoice number.').max(40) }), req.body);
  await markPacked(storeId(req), parseId(req.params.id), version, invoiceNo);
  res.status(204).end();
});

pharmacistRouter.post('/store/orders/:id/handover', async (req, res) => {
  const { version, riderName } = parse(Version.extend({ riderName: z.string().trim().min(1, "Enter the delivery person's name.").max(60) }), req.body);
  await handOver(storeId(req), parseId(req.params.id), version, riderName);
  res.status(204).end();
});

pharmacistRouter.post('/store/orders/:id/deliver', async (req, res) => {
  await markDelivered(storeId(req), parseId(req.params.id), parse(Version, req.body).version);
  res.status(204).end();
});

/** The prescription image for its owner or a pharmacist; every view is logged (DPDP). */
export const prescriptionImageRouter = Router();
prescriptionImageRouter.get('/:id/image', requireAuth, async (req, res) => {
  const image = await getPrescriptionImage(currentUser(req), parseId(req.params.id));
  res.setHeader('Content-Type', image.mimeType);
  res.setHeader('Content-Disposition', 'inline');
  res.send(image.bytes);
});
