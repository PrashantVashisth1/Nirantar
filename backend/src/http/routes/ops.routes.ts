import { Router } from 'express';
import { z } from 'zod';
import { ORDER_STATUSES, dateOnly, todayIst } from '@nirantar/shared';
import { seedDemoWorld } from '../../../prisma/seed/world';
import { isDemoMode } from '../../config/env';
import { prisma } from '../../lib/db';
import { AppError, notFound } from '../../lib/errors';
import {
  applyStockImport,
  discardStockImport,
  previewStockImport,
  toImportDto,
} from '../../services/inventory/stock-import.service';
import { getH1Register, getOverview, getRules } from '../../services/ops/overview.service';
import { recentReminders, runReminders } from '../../services/refills/reminder.service';
import { routeOrder } from '../../services/routing/routing.service';
import { currentUser, requireAuth, requireRole } from '../middleware/auth';
import { orderSummaryInclude, toOrderSummary } from '../presenters/order.presenter';
import { parse, parseId } from '../validate';

/** Central operations: stock import, stock view, waiting orders, reminder runs. */
export const opsRouter = Router();
opsRouter.use(requireAuth, requireRole('OPS'));

opsRouter.get('/stores', async (_req, res) => {
  res.json(await prisma.store.findMany({ orderBy: { name: 'asc' }, select: { id: true, code: true, name: true, isActive: true } }));
});

// ── Stock import ──
const UploadSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  content: z.string().min(1).max(2_000_000, 'The file must be smaller than 2 MB.'),
});

opsRouter.post('/stock-imports', async (req, res) => {
  const { fileName, content } = parse(UploadSchema, req.body);
  const created = await previewStockImport(fileName, content, currentUser(req).id);
  res.status(201).json(toImportDto(created));
});

opsRouter.get('/stock-imports', async (_req, res) => {
  const imports = await prisma.stockImport.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { uploadedBy: { select: { name: true } } },
  });
  res.json(imports.map(toImportDto));
});

opsRouter.post('/stock-imports/:id/apply', async (req, res) => {
  res.json(await applyStockImport(parseId(req.params.id)));
});

opsRouter.post('/stock-imports/:id/discard', async (req, res) => {
  await discardStockImport(parseId(req.params.id));
  res.status(204).end();
});

opsRouter.get('/stock-template.csv', async (_req, res) => {
  const [stores, products] = await Promise.all([
    prisma.store.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } }),
    prisma.product.findMany({ where: { isActive: true }, orderBy: { sku: 'asc' } }),
  ]);
  const lines = ['store_code,sku,on_hand', ...stores.flatMap((s) => products.map((p) => `${s.code},${p.sku},0`))];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="stock-template.csv"');
  res.send(lines.join('\n'));
});

// ── Current stock ──
const StockQuery = z.object({ storeId: z.uuid().optional(), q: z.string().trim().max(60).optional() });

opsRouter.get('/stock', async (req, res) => {
  const { storeId, q } = parse(StockQuery, req.query);
  const rows = await prisma.storeStock.findMany({
    where: {
      ...(storeId ? { storeId } : {}),
      ...(q ? { product: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { molecule: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }] } } : {}),
    },
    include: { store: { select: { code: true, name: true } }, product: { select: { sku: true, name: true, molecule: true, strength: true, schedule: true } } },
    orderBy: [{ store: { code: 'asc' } }, { product: { molecule: 'asc' } }],
    take: 500,
  });
  res.json(
    rows.map((r) => ({
      storeCode: r.store.code,
      storeName: r.store.name,
      sku: r.product.sku,
      product: `${r.product.molecule} ${r.product.strength}`,
      brand: r.product.name,
      schedule: r.product.schedule,
      onHand: r.onHand,
      reserved: r.reserved,
      available: r.onHand - r.reserved,
      countedAt: r.countedAt?.toISOString() ?? null,
    })),
  );
});

// ── Orders waiting for stock ──
opsRouter.get('/awaiting-stock', async (_req, res) => {
  const orders = await prisma.order.findMany({
    where: { status: { in: ['APPROVED', 'AWAITING_STOCK'] } },
    include: orderSummaryInclude,
    orderBy: { placedAt: 'asc' },
  });
  res.json(orders.map((o) => ({ ...toOrderSummary(o), routingNote: o.routingNote })));
});

opsRouter.post('/orders/:id/retry-routing', async (req, res) => {
  res.json(await routeOrder(parseId(req.params.id)));
});

// ── Overview, rules and the H1 register ──
opsRouter.get('/overview', async (_req, res) => {
  res.json(await getOverview());
});

opsRouter.get('/rules', async (_req, res) => {
  res.json(await getRules());
});

opsRouter.get('/h1-register', async (_req, res) => {
  res.json(await getH1Register());
});

// The client's "one view of orders across all stores". No patient names: operations
// doesn't need them here, so health data stays with the people checking the order.
const OrdersQuery = z.object({ storeId: z.uuid().optional(), status: z.enum(ORDER_STATUSES).optional() });

opsRouter.get('/orders', async (req, res) => {
  const { storeId, status } = parse(OrdersQuery, req.query);
  const where = { ...(storeId ? { storeId } : {}), ...(status ? { status } : {}) };
  const [orders, total] = await Promise.all([
    prisma.order.findMany({ where, include: orderSummaryInclude, orderBy: { placedAt: 'desc' }, take: 50 }),
    prisma.order.count({ where }),
  ]);
  res.json({
    total,
    orders: orders.map((order) => {
      const { patient: _patient, ...summary } = toOrderSummary(order);
      return summary;
    }),
  });
});

// ── Reset demo: test mode only; in production this route doesn't exist ──
let resetting = false;
opsRouter.post('/demo/reset', async (_req, res) => {
  if (!isDemoMode()) throw notFound('Not found.');
  if (resetting) throw new AppError(409, 'RESET_IN_PROGRESS', 'The demo is already being reset.');
  resetting = true;
  try {
    res.json(await seedDemoWorld());
  } finally {
    resetting = false;
  }
});

// ── Reminders ──
const RunSchema = z.object({ asOf: z.iso.date().optional() }).strict();

opsRouter.post('/reminders/run', async (req, res) => {
  const { asOf } = parse(RunSchema, req.body);
  // Simulating a future day is a demo aid only (plan §3.4, O1).
  if (asOf && !isDemoMode()) throw new AppError(422, 'NOT_ALLOWED', 'A custom date is only allowed in test mode.');
  res.json(await runReminders(asOf ? dateOnly(asOf) : todayIst()));
});

opsRouter.get('/reminders', async (_req, res) => {
  res.json(await recentReminders());
});
