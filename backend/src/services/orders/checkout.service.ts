/**
 * Search, cart quote and placing an order (plan C3). Every lookup is scoped to
 * the signed-in account. The X/NDPS ban is checked here first (friendly
 * message) and again by the database trigger.
 */
import {
  RX_VALIDITY_DAYS,
  addDays,
  findLocality,
  isBannedOnline,
  todayIst,
  type AddressDto,
  type QuoteDto,
} from '@nirantar/shared';
import { z } from 'zod';
import { prisma } from '../../lib/db';
import { AppError, notFound, ruleViolation } from '../../lib/errors';
import { toProductSummary } from '../../http/presenters/order.presenter';
import { candidateStores, promisedBy } from '../routing/routing.service';
import type { NewAddressSchema, PlaceOrderSchema, QuoteSchema } from '@nirantar/shared';
import type { Address } from '../../generated/prisma/client';

export async function searchProducts(q: string) {
  const term = q.trim();
  if (term.length < 2) return [];
  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      OR: [
        { name: { contains: term, mode: 'insensitive' } },
        { molecule: { contains: term, mode: 'insensitive' } },
        { aliases: { has: term } },
      ],
    },
    orderBy: [{ molecule: 'asc' }, { isGeneric: 'asc' }],
    take: 20,
  });
  const rules = new Map((await prisma.scheduleRule.findMany()).map((r) => [r.schedule, r]));
  return products.map((p) => ({
    ...toProductSummary(p),
    blocked: isBannedOnline(p.schedule),
    needsPrescription: rules.get(p.schedule)?.rxRequired ?? true,
  }));
}

function toAddressDto(address: Address): AddressDto {
  return {
    id: address.id,
    label: address.label,
    line1: address.line1,
    line2: address.line2,
    localityId: address.localityId,
    localityName: findLocality(address.localityId)?.name ?? address.localityId,
    pincode: address.pincode,
    isDefault: address.isDefault,
  };
}

export async function listAddresses(accountId: string) {
  const addresses = await prisma.address.findMany({ where: { accountId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
  return addresses.map(toAddressDto);
}

export async function addAddress(accountId: string, input: z.output<typeof NewAddressSchema>) {
  const locality = findLocality(input.localityId);
  if (!locality) throw new AppError(400, 'VALIDATION_FAILED', 'Choose a locality from the list.');
  const hasDefault = (await prisma.address.count({ where: { accountId, isDefault: true } })) > 0;
  const address = await prisma.address.create({
    data: { accountId, ...input, lat: locality.lat, lng: locality.lng, isDefault: !hasDefault },
  });
  return toAddressDto(address);
}

async function loadCart(accountId: string, input: { patientId: string; addressId?: string; prescriptionId?: string; items: { productId: string; quantity: number }[] }) {
  const patient = await prisma.patient.findFirst({ where: { id: input.patientId, accountId, archivedAt: null } });
  if (!patient) throw notFound("We couldn't find that person on your account.");
  const address = input.addressId ? await prisma.address.findFirst({ where: { id: input.addressId, accountId } }) : null;
  if (input.addressId && !address) throw notFound("We couldn't find that address.");
  const prescription = input.prescriptionId
    ? await prisma.prescription.findFirst({ where: { id: input.prescriptionId, patientId: patient.id } })
    : null;
  if (input.prescriptionId && !prescription) throw notFound("We couldn't find that prescription for this person.");

  const products = await prisma.product.findMany({ where: { id: { in: input.items.map((i) => i.productId) }, isActive: true } });
  const rules = new Map((await prisma.scheduleRule.findMany()).map((r) => [r.schedule, r]));
  // Merge repeated products into one line.
  const quantities = new Map<string, number>();
  for (const item of input.items) quantities.set(item.productId, Math.min(30, (quantities.get(item.productId) ?? 0) + item.quantity));

  const lines = [...quantities].map(([productId, quantity]) => {
    const product = products.find((p) => p.id === productId);
    if (!product) throw notFound('One of the medicines is no longer available.');
    return { product, quantity, needsPrescription: rules.get(product.schedule)?.rxRequired ?? true };
  });
  return { patient, address, prescription, lines };
}

export async function quote(accountId: string, input: z.output<typeof QuoteSchema>): Promise<QuoteDto> {
  const { address, lines } = await loadCart(accountId, input);
  const allowed = lines.filter((l) => !isBannedOnline(l.product.schedule));
  const subtotal = allowed.reduce((sum, l) => sum + l.product.pricePaise * l.quantity, 0);

  // Non-binding delivery preview: the nearest store that has everything right now.
  let delivery: QuoteDto['delivery'] = null;
  if (address && allowed.length > 0) {
    for (const store of await candidateStores(address)) {
      const stock = await prisma.storeStock.findMany({ where: { storeId: store.id, productId: { in: allowed.map((l) => l.product.id) } } });
      const hasAll = allowed.every((l) => {
        const row = stock.find((s) => s.productId === l.product.id);
        return row && row.onHand - row.reserved >= l.quantity;
      });
      if (hasAll) {
        delivery = { storeName: store.name, distanceKm: Math.round(store.distanceKm * 10) / 10, promisedBy: promisedBy().toISOString() };
        break;
      }
    }
  }

  return {
    lines: allowed.map((l) => ({ product: toProductSummary(l.product), quantity: l.quantity, lineTotalPaise: l.product.pricePaise * l.quantity, needsPrescription: l.needsPrescription })),
    subtotalPaise: subtotal,
    totalPaise: subtotal, // delivery is free in the prototype (A22-style assumption)
    needsPrescription: allowed.some((l) => l.needsPrescription),
    blocked: lines.filter((l) => isBannedOnline(l.product.schedule)).map((l) => ({ productId: l.product.id, reason: 'Not sold online (Schedule X / narcotic)' })),
    delivery,
  };
}

export async function placeOrder(accountId: string, input: z.output<typeof PlaceOrderSchema>) {
  const { patient, address, prescription, lines } = await loadCart(accountId, input);
  if (!address) throw notFound("We couldn't find that address.");

  const banned = lines.find((l) => isBannedOnline(l.product.schedule));
  if (banned) {
    throw ruleViolation('SCHEDULE_NOT_SOLD_ONLINE', `${banned.product.name} can't be sold online. Please remove it from your cart.`);
  }
  const needsPrescription = lines.some((l) => l.needsPrescription);
  if (needsPrescription && !prescription) {
    throw ruleViolation('PRESCRIPTION_REQUIRED', 'Some of these medicines need a prescription. Please add a photo of it.');
  }
  if (prescription?.reviewStatus === 'REJECTED') {
    throw ruleViolation('PRESCRIPTION_REJECTED', 'This prescription was not accepted. Please upload a new one.');
  }
  if (prescription?.reviewStatus === 'VERIFIED' && prescription.prescribedOn && addDays(prescription.prescribedOn, RX_VALIDITY_DAYS) < todayIst()) {
    throw ruleViolation('PRESCRIPTION_EXPIRED', 'The prescription on file has expired. Please upload a new one.');
  }

  const [sequence] = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('order_number_seq')`;
  const nextval = sequence!.nextval;
  const locality = findLocality(address.localityId);
  const subtotal = lines.reduce((sum, l) => sum + l.product.pricePaise * l.quantity, 0);

  const order = await prisma.order.create({
    data: {
      number: `RX-${nextval}`,
      accountId,
      patientId: patient.id,
      prescriptionId: prescription?.id,
      source: input.source,
      deliveryAddress: { label: address.label, line1: address.line1, line2: address.line2, locality: locality?.name, city: locality?.city, pincode: address.pincode },
      deliveryLat: address.lat,
      deliveryLng: address.lng,
      customerNote: input.note,
      paymentMethod: input.paymentMethod,
      paymentStatus: 'NOT_DUE',
      subtotalPaise: subtotal,
      totalPaise: subtotal,
      remindersOptIn: input.remindersOptIn,
      items: {
        create: lines.map((l) => ({
          productId: l.product.id,
          quantity: l.quantity,
          requestedProductId: l.product.id,
          requestedQuantity: l.quantity,
          unitPricePaise: l.product.pricePaise,
        })),
      },
      events: { create: { toStatus: 'AWAITING_PHARMACIST', actorId: accountId, actorRole: 'CUSTOMER', note: 'Order placed' } },
    },
  });
  if (input.remindersOptIn) await prisma.user.update({ where: { id: accountId }, data: { remindersOptIn: true } });
  await prisma.message.create({
    data: { accountId, orderId: order.id, channel: 'IN_APP', body: `Order ${order.number} received. A registered pharmacist will check it shortly.` },
  });
  return order;
}

/** One-tap reorder: what to put in the cart for the chosen refills. */
export async function reorderDraft(accountId: string, refillIds: string[]) {
  const subs = await prisma.refillSubscription.findMany({
    where: { id: { in: refillIds }, accountId, isActive: true },
    include: { product: true, prescription: true },
  });
  if (subs.length === 0) throw notFound();
  const patientIds = new Set(subs.map((s) => s.patientId));
  if (patientIds.size > 1) throw new AppError(400, 'VALIDATION_FAILED', 'Reorder one person at a time.');
  const prescription = subs[0]!.prescription;
  const valid = prescription?.prescribedOn ? addDays(prescription.prescribedOn, RX_VALIDITY_DAYS) >= todayIst() : false;
  return {
    patientId: subs[0]!.patientId,
    prescriptionId: valid ? prescription!.id : null,
    prescriptionOnFile: prescription && valid ? { prescriberName: prescription.prescriberName, prescribedOn: prescription.prescribedOn!.toISOString().slice(0, 10) } : null,
    items: subs.map((s) => ({
      product: toProductSummary(s.product),
      // Same supply as last time: days × daily dose ÷ units per pack.
      quantity: Math.min(30, Math.max(1, Math.ceil((s.daysSupply * s.dailyUnits) / s.product.packUnits))),
    })),
  };
}
