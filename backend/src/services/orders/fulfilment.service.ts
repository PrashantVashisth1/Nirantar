/**
 * Store fulfilment (plan S1): pick → pack (store invoice no.) → hand over →
 * delivered, for the pharmacist's own store. The database dispatch gate runs
 * on every one of these steps, so an order that isn't validly approved can't
 * move, whatever this code does.
 */
import { todayIst, type StoreOrderDto } from '@nirantar/shared';
import { calculateRefill } from '../../domain/refill-math';
import { prisma } from '../../lib/db';
import { AppError, notFound } from '../../lib/errors';
import { toProductSummary } from '../../http/presenters/order.presenter';
import { claimVersion, notify, recordEvent } from './order-helpers';
import type { OrderStatus } from '../../generated/prisma/client';

const TABS: Record<string, OrderStatus[]> = {
  to_pick: ['ASSIGNED', 'PICKING'],
  packed: ['PACKED'],
  out: ['OUT_FOR_DELIVERY'],
  delivered: ['DELIVERED'],
};

const include = {
  patient: { select: { fullName: true } },
  verifiedBy: { select: { name: true, pharmacistRegNo: true } },
  items: { where: { status: 'ACTIVE' as const }, include: { product: true } },
};

export async function listStoreOrders(storeId: string, tab: keyof typeof TABS): Promise<StoreOrderDto[]> {
  const orders = await prisma.order.findMany({
    where: {
      storeId,
      status: { in: TABS[tab] },
      ...(tab === 'delivered' ? { deliveredAt: { gte: new Date(Date.now() - 24 * 3600_000) } } : {}),
    },
    include,
    orderBy: { promisedBy: 'asc' },
  });
  return orders.map((o) => ({
    id: o.id,
    number: o.number,
    status: o.status,
    version: o.version,
    // First name + initial only: the store doesn't need the full name to pack.
    patientName: (() => {
      const [first, ...rest] = o.patient.fullName.split(' ');
      return rest.length ? `${first} ${rest[rest.length - 1]![0]}.` : first!;
    })(),
    items: o.items.map((i) => {
      const p = toProductSummary(i.product);
      return { name: p.displayName, brand: p.brandName, packLabel: p.packLabel, quantity: i.quantity, schedule: i.product.schedule };
    }),
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    totalPaise: o.totalPaise,
    promisedBy: o.promisedBy?.toISOString() ?? null,
    approvedBy: o.verifiedBy ? { name: o.verifiedBy.name, regNo: o.verifiedBy.pharmacistRegNo } : null,
    invoiceNo: o.invoiceNo,
    riderName: o.riderName,
  }));
}

async function storeOrder(storeId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, storeId },
    include: { ...include, prescription: true, account: { select: { id: true } } },
  });
  if (!order) throw notFound();
  return order;
}

export async function startPicking(user: { id: string; storeId: string }, orderId: string, version: number) {
  const order = await storeOrder(user.storeId, orderId);
  await prisma.$transaction(async (tx) => {
    await claimVersion(tx, order.id, version, ['ASSIGNED']);
    await tx.order.update({ where: { id: order.id }, data: { status: 'PICKING' } });
    await recordEvent(tx, { orderId: order.id, from: 'ASSIGNED', to: 'PICKING', actorId: user.id, actorRole: 'PHARMACIST' });
  });
}

export async function markPacked(user: { id: string; storeId: string }, orderId: string, version: number, invoiceNo: string) {
  const order = await storeOrder(user.storeId, orderId);
  await prisma.$transaction(async (tx) => {
    await claimVersion(tx, order.id, version, ['PICKING']);
    await tx.order.update({ where: { id: order.id }, data: { status: 'PACKED', invoiceNo } });
    await recordEvent(tx, { orderId: order.id, from: 'PICKING', to: 'PACKED', actorId: user.id, actorRole: 'PHARMACIST', note: `Invoice ${invoiceNo}` });
  });
}

/**
 * Handover = the moment of sale (A13): H1 register entries are written, the
 * stock physically leaves the store (on_hand and reserved both go down), all in
 * one transaction with the status change.
 */
export async function handOver(user: { id: string; storeId: string }, orderId: string, version: number, riderName: string) {
  const order = await storeOrder(user.storeId, orderId);
  if (order.paymentMethod === 'UPI_TEST' && order.paymentStatus !== 'PAID') {
    throw new AppError(422, 'PAYMENT_REQUIRED', 'The customer has not paid by UPI yet. Hand over once paid, or after they switch to cash.');
  }
  const rules = new Map((await prisma.scheduleRule.findMany()).map((r) => [r.schedule, r]));
  const address = order.deliveryAddress as { line1?: string; line2?: string; locality?: string; city?: string; pincode?: string };
  const addressText = [address.line1, address.line2, address.locality, address.city, address.pincode].filter(Boolean).join(', ');

  await prisma.$transaction(async (tx) => {
    await claimVersion(tx, order.id, version, ['PACKED']);
    for (const item of order.items) {
      if (rules.get(item.product.schedule)?.registerRequired) {
        if (!order.prescription?.prescriberName || !order.prescription.prescriberRegNo) {
          throw new AppError(422, 'REGISTER_MISSING', 'Prescriber details are missing for the H1 register.');
        }
        await tx.h1RegisterEntry.create({
          data: {
            orderItemId: item.id,
            orderId: order.id,
            productId: item.productId,
            quantity: item.quantity,
            patientName: order.patient.fullName,
            patientAddress: addressText,
            prescriberName: order.prescription.prescriberName,
            prescriberRegNo: order.prescription.prescriberRegNo,
            pharmacistId: user.id,
            storeId: user.storeId,
          },
        });
      }
      await tx.storeStock.update({
        where: { storeId_productId: { storeId: user.storeId, productId: item.productId } },
        data: { onHand: { decrement: item.quantity }, reserved: { decrement: item.quantity } },
      });
    }
    await tx.order.update({ where: { id: order.id }, data: { status: 'OUT_FOR_DELIVERY', riderName } });
    await recordEvent(tx, { orderId: order.id, from: 'PACKED', to: 'OUT_FOR_DELIVERY', actorId: user.id, actorRole: 'PHARMACIST', note: `Handed to ${riderName}` });
    await notify(tx, order.accountId, order.id, `Order ${order.number} is on the way with ${riderName}.`);
  });
}

/** Delivered: COD is collected, and refill tracking starts from the pharmacist-confirmed dose. */
export async function markDelivered(user: { id: string; storeId: string }, orderId: string, version: number) {
  const order = await storeOrder(user.storeId, orderId);
  const today = todayIst();
  await prisma.$transaction(async (tx) => {
    await claimVersion(tx, order.id, version, ['OUT_FOR_DELIVERY']);
    await tx.order.update({
      where: { id: order.id },
      data: { status: 'DELIVERED', deliveredAt: new Date(), paymentStatus: order.paymentMethod === 'COD' ? 'COD_COLLECTED' : order.paymentStatus },
    });
    await recordEvent(tx, { orderId: order.id, from: 'OUT_FOR_DELIVERY', to: 'DELIVERED', actorId: user.id, actorRole: 'PHARMACIST' });

    if (order.remindersOptIn) {
      for (const item of order.items) {
        if (!item.approvedById) continue; // only pharmacist-confirmed doses
        const existing = await tx.refillSubscription.findUnique({ where: { patientId_productId: { patientId: order.patientId, productId: item.productId } } });
        const refill = calculateRefill({
          packs: item.quantity,
          packUnits: item.product.packUnits,
          form: item.product.form,
          doseMorning: item.doseMorning,
          doseNoon: item.doseNoon,
          doseNight: item.doseNight,
          asNeeded: item.doseAsNeeded,
          fillDate: today,
          previousRunOut: existing?.isActive ? existing.runOutOn : null,
        });
        if (!refill.ok) continue; // e.g. "as needed" or a syrup: no automatic reminders (A7)
        const data = {
          dailyUnits: refill.dailyUnits,
          daysSupply: refill.daysSupply,
          runOutOn: refill.runOutOn,
          prescriptionId: order.prescriptionId,
          lastOrderId: order.id,
          confirmedById: item.approvedById,
          isActive: true,
        };
        if (existing) {
          await tx.refillSubscription.update({ where: { id: existing.id }, data: { ...data, cycle: { increment: 1 } } });
        } else {
          await tx.refillSubscription.create({ data: { ...data, accountId: order.accountId, patientId: order.patientId, productId: item.productId } });
        }
      }
    }
    await notify(tx, order.accountId, order.id, `Order ${order.number} has been delivered.`);
  });
}
