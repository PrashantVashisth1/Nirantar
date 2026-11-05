import multer from 'multer';
import {
  CustomerDecisionSchema,
  NewAddressSchema,
  PlaceOrderSchema,
  QuoteSchema,
} from '@nirantar/shared';
import { prisma } from '../../lib/db';
import {
  addAddress,
  listAddresses,
  placeOrder,
  quote,
  reorderDraft,
  searchProducts,
} from '../../services/orders/checkout.service';
import {
  cancelOrder,
  confirmChanges,
  payTest,
  reuploadPrescription,
  switchToCash,
} from '../../services/orders/customer-actions.service';
import {
  getPrescriptionForCustomer,
  MAX_UPLOAD_BYTES,
  uploadPrescription,
} from '../../services/prescriptions/prescription.service';
import { AppError } from '../../lib/errors';
import { Router } from 'express';
import { z } from 'zod';
import { notFound } from '../../lib/errors';
import { NewPatientSchema } from '@nirantar/shared';
import {
  addPatient,
  getHome,
  getOrderForCustomer,
  listOrders,
  listPatients,
} from '../../services/customers/customer.service';
import { currentUser, requireAuth, requireRole } from '../middleware/auth';
import { parse, parseId } from '../validate';

/**
 * Routes for signed-in customers. Every handler passes the caller's own
 * account id to the service, which filters by it.
 *
 * The guard is attached per route (not with router.use) because this router
 * is mounted at /api: a router-wide guard would also catch unknown URLs and
 * answer "please sign in" instead of 404.
 */
export const customerRouter = Router();

const customerOnly = [requireAuth, requireRole('CUSTOMER')];

customerRouter.get('/home', ...customerOnly, async (req, res) => {
  res.json(await getHome(currentUser(req).id));
});

customerRouter.get('/patients', ...customerOnly, async (req, res) => {
  res.json(await listPatients(currentUser(req).id));
});

customerRouter.post('/patients', ...customerOnly, async (req, res) => {
  const input = parse(NewPatientSchema, req.body);
  res.status(201).json(await addPatient(currentUser(req).id, input));
});

const OrderListQuery = z.object({ state: z.enum(['active', 'past']).default('active') });

customerRouter.get('/orders', ...customerOnly, async (req, res) => {
  const { state } = parse(OrderListQuery, req.query);
  res.json(await listOrders(currentUser(req).id, state));
});

customerRouter.get('/orders/:id', ...customerOnly, async (req, res) => {
  res.json(await getOrderForCustomer(currentUser(req).id, parseId(req.params.id)));
});

// ── Day 4: search, addresses, prescriptions, cart & checkout ──

/** Photos are held in memory only long enough to clean and encrypt them; nothing is written to disk. */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});
const requireFile = (file: Express.Multer.File | undefined) => {
  if (!file) throw new AppError(400, 'VALIDATION_FAILED', 'Choose a photo of the prescription.');
  return file.buffer;
};

customerRouter.get('/products', ...customerOnly, async (req, res) => {
  res.json(
    await searchProducts(parse(z.object({ q: z.string().max(60).default('') }), req.query).q),
  );
});

customerRouter.get('/addresses', ...customerOnly, async (req, res) => {
  res.json(await listAddresses(currentUser(req).id));
});

customerRouter.post('/addresses', ...customerOnly, async (req, res) => {
  res.status(201).json(await addAddress(currentUser(req).id, parse(NewAddressSchema, req.body)));
});

customerRouter.post('/prescriptions', ...customerOnly, upload.single('file'), async (req, res) => {
  const { patientId } = parse(z.object({ patientId: z.uuid() }), req.body);
  const id = await uploadPrescription({
    accountId: currentUser(req).id,
    patientId,
    file: requireFile(req.file),
  });
  res.status(201).json(await getPrescriptionForCustomer(currentUser(req).id, id));
});

customerRouter.get('/prescriptions/:id', ...customerOnly, async (req, res) => {
  res.json(await getPrescriptionForCustomer(currentUser(req).id, parseId(req.params.id)));
});

const RefillSettingsSchema = z.object({ remindersEnabled: z.boolean() }).strict();

customerRouter.patch('/refills/:id', ...customerOnly, async (req, res) => {
  const { remindersEnabled } = parse(RefillSettingsSchema, req.body);
  // Scoped to the account: someone else's refill looks like it doesn't exist.
  const updated = await prisma.refillSubscription.updateMany({
    where: { id: parseId(req.params.id), accountId: currentUser(req).id },
    data: { remindersEnabled },
  });
  if (updated.count === 0) throw notFound("We couldn't find that medicine.");
  res.status(204).end();
});

customerRouter.get('/refills/reorder', ...customerOnly, async (req, res) => {
  const { ids } = parse(z.object({ ids: z.string().min(1) }), req.query);
  res.json(await reorderDraft(currentUser(req).id, ids.split(',').map(parseId)));
});

customerRouter.post('/checkout/quote', ...customerOnly, async (req, res) => {
  res.json(await quote(currentUser(req).id, parse(QuoteSchema, req.body)));
});

customerRouter.post('/orders', ...customerOnly, async (req, res) => {
  const order = await placeOrder(currentUser(req).id, parse(PlaceOrderSchema, req.body));
  res.status(201).json({ id: order.id, number: order.number });
});

customerRouter.post('/orders/:id/decision', ...customerOnly, async (req, res) => {
  res.json(
    await confirmChanges(
      currentUser(req).id,
      parseId(req.params.id),
      parse(CustomerDecisionSchema, req.body),
    ),
  );
});

customerRouter.post(
  '/orders/:id/reupload',
  ...customerOnly,
  upload.single('file'),
  async (req, res) => {
    const prescriptionId = await reuploadPrescription(
      currentUser(req).id,
      parseId(req.params.id),
      requireFile(req.file),
    );
    res.json({ prescriptionId });
  },
);

customerRouter.post('/orders/:id/cancel', ...customerOnly, async (req, res) => {
  await cancelOrder(
    currentUser(req).id,
    parseId(req.params.id),
    parse(z.object({ version: z.number().int() }), req.body).version,
  );
  res.status(204).end();
});

customerRouter.post('/orders/:id/pay-test', ...customerOnly, async (req, res) => {
  const { outcome } = parse(z.object({ outcome: z.enum(['SUCCESS', 'FAILURE']) }), req.body);
  res.json(await payTest(currentUser(req).id, parseId(req.params.id), outcome));
});

customerRouter.post('/orders/:id/pay-cash', ...customerOnly, async (req, res) => {
  await switchToCash(currentUser(req).id, parseId(req.params.id));
  res.status(204).end();
});

customerRouter.get('/messages', ...customerOnly, async (req, res) => {
  const messages = await prisma.message.findMany({
    where: { accountId: currentUser(req).id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(
    messages.map((m) => ({
      id: m.id,
      channel: m.channel,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      orderId: m.orderId,
    })),
  );
});
