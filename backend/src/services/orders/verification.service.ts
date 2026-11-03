/**
 * Pharmacist verification (plan P1/P2, rules B3–B8). A registered pharmacist
 * approves EVERY item; the approval records exactly what was approved, and the
 * database dispatch gate checks it again before anything leaves a store.
 */
import {
  RX_VALIDITY_DAYS,
  addDays,
  dateOnly,
  isBannedOnline,
  maskPhone,
  todayIst,
  type QueueRowDto,
  type WorkspaceDto,
} from '@nirantar/shared';
import type { z } from 'zod';
import type { ApproveOrderSchema, RejectOrderSchema, ReuploadRequestSchema } from '@nirantar/shared';
import { prisma } from '../../lib/db';
import { AppError, notFound, ruleViolation } from '../../lib/errors';
import { orderSummaryInclude, toOrderSummary, toProductSummary } from '../../http/presenters/order.presenter';
import { recoverStaleReads, toPrescriptionDto } from '../prescriptions/prescription.service';
import { routeOrder, type RoutingResult } from '../routing/routing.service';
import { ageFrom, claimVersion, notify, recordEvent } from './order-helpers';
import type { Product } from '../../generated/prisma/client';

const REVIEW_LOCK_MS = 10 * 60_000;

interface Pharmacist {
  id: string;
  name: string;
  pharmacistRegNo: string | null;
}

export async function getQueue() {
  await recoverStaleReads();
  const orders = await prisma.order.findMany({
    where: { status: 'AWAITING_PHARMACIST' },
    include: {
      ...orderSummaryInclude,
      patient: { select: { id: true, fullName: true, relation: true, birthYear: true } },
      prescription: { select: { aiStatus: true, replacesId: true } },
      reviewingBy: { select: { name: true } },
    },
    orderBy: { placedAt: 'asc' },
  });
  const rows: QueueRowDto[] = orders.map((order) => ({
    ...toOrderSummary(order),
    aiStatus: order.prescription?.aiStatus ?? null,
    hasH1: order.items.some((i) => i.product.schedule === 'H1'),
    reupload: Boolean(order.prescription?.replacesId),
    reviewingBy: order.reviewingAt && Date.now() - order.reviewingAt.getTime() < REVIEW_LOCK_MS ? (order.reviewingBy?.name ?? null) : null,
    ageYears: ageFrom(order.patient.birthYear),
  }));
  const waits = rows.map((r) => (Date.now() - new Date(r.placedAt).getTime()) / 60_000);
  const decidedToday = await prisma.order.findMany({
    where: { verifiedAt: { gte: dateOnly(todayIst().toISOString().slice(0, 10)) } },
    select: { placedAt: true, verifiedAt: true },
  });
  const durations = decidedToday.map((o) => (o.verifiedAt!.getTime() - o.placedAt.getTime()) / 60_000).sort((a, b) => a - b);
  return {
    rows,
    summary: {
      waiting: rows.length,
      oldestMinutes: waits.length ? Math.round(Math.max(...waits)) : 0,
      medianTodayMinutes: durations.length ? Math.round(durations[Math.floor(durations.length / 2)]!) : null,
    },
  };
}

/** "Start next": the oldest order nobody else is reviewing right now. */
export async function nextInQueue(pharmacistId: string) {
  const cutoff = new Date(Date.now() - REVIEW_LOCK_MS);
  const order = await prisma.order.findFirst({
    where: {
      status: 'AWAITING_PHARMACIST',
      OR: [{ reviewingById: null }, { reviewingById: pharmacistId }, { reviewingAt: { lt: cutoff } }],
    },
    orderBy: { placedAt: 'asc' },
    select: { id: true },
  });
  return order?.id ?? null;
}

export async function getWorkspace(pharmacistId: string, orderId: string): Promise<WorkspaceDto> {
  await recoverStaleReads();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      patient: true,
      account: { select: { name: true, phone: true } },
      previewStore: { select: { name: true } },
      reviewingBy: { select: { id: true, name: true } },
      prescription: { include: { file: { select: { prescriptionId: true } } } },
      items: { include: { product: true }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!order) throw notFound();

  const someoneElse =
    order.reviewingBy && order.reviewingBy.id !== pharmacistId && order.reviewingAt && Date.now() - order.reviewingAt.getTime() < REVIEW_LOCK_MS
      ? order.reviewingBy.name
      : null;
  if (order.status === 'AWAITING_PHARMACIST' && !someoneElse) {
    // Informational "being reviewed by" (not a lock; the version check protects decisions).
    await prisma.order.update({ where: { id: order.id }, data: { reviewingById: pharmacistId, reviewingAt: new Date() } });
  }

  const generics = await genericOptions(order.items.map((i) => i.product));
  return {
    order: {
      id: order.id,
      number: order.number,
      status: order.status,
      version: order.version,
      source: order.source,
      placedAt: order.placedAt.toISOString(),
      customerNote: order.customerNote,
      previewStoreName: order.previewStore?.name ?? null,
    },
    patient: { fullName: order.patient.fullName, relation: order.patient.relation, ageYears: ageFrom(order.patient.birthYear) },
    customer: { name: order.account.name, phoneMasked: order.account.phone ? maskPhone(order.account.phone) : null },
    prescription: order.prescription ? await toPrescriptionDto(order.prescription) : null,
    items: order.items.map((item) => ({
      id: item.id,
      product: { ...toProductSummary(item.product), molecule: item.product.molecule, strength: item.product.strength, packUnits: item.product.packUnits, form: item.product.form },
      quantity: item.quantity,
      requestedQuantity: item.requestedQuantity,
      status: item.status,
      dose: item.doseMorning === null ? null : { morning: item.doseMorning, noon: item.doseNoon ?? 0, night: item.doseNight ?? 0 },
      asNeeded: item.doseAsNeeded,
      durationDays: item.durationDays,
      genericOptions: (generics.get(item.productId) ?? []).map(toProductSummary),
      offeredGenericId: item.approvedGenericProductId,
    })),
    reviewingBy: someoneElse,
  };
}

/** Cheaper generics from OUR catalog: same molecule, strength and form (plan A17). */
async function genericOptions(products: Product[]) {
  const result = new Map<string, Product[]>();
  for (const product of products) {
    const options = await prisma.product.findMany({
      where: {
        isActive: true,
        isGeneric: true,
        molecule: product.molecule,
        strength: product.strength,
        form: product.form,
        pricePaise: { lt: product.pricePaise },
        id: { not: product.id },
      },
      orderBy: { pricePaise: 'asc' },
    });
    result.set(product.id, options.filter((p) => !isBannedOnline(p.schedule)));
  }
  return result;
}

export async function approveOrder(
  pharmacist: Pharmacist,
  orderId: string,
  input: z.output<typeof ApproveOrderSchema>,
): Promise<{ outcome: 'AWAITING_CUSTOMER' } | RoutingResult> {
  if (!pharmacist.pharmacistRegNo) throw new AppError(403, 'FORBIDDEN', 'Only registered pharmacists can approve.');

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { product: true } }, prescription: true },
  });
  if (!order) throw notFound();

  const products = new Map(
    (await prisma.product.findMany({ where: { id: { in: input.items.flatMap((i) => [i.productId, i.offerGenericProductId ?? i.productId]) } } })).map((p) => [p.id, p]),
  );
  const rules = new Map((await prisma.scheduleRule.findMany()).map((r) => [r.schedule, r]));
  const approved = input.items.filter((i) => i.decision === 'APPROVE');
  if (approved.length === 0) throw ruleViolation('NOTHING_APPROVED', 'Approve at least one medicine, or reject the order with a reason.');

  for (const item of input.items) {
    const product = products.get(item.productId);
    if (!product || !product.isActive) throw notFound('A selected medicine is not in the catalog.');
    if (item.decision === 'APPROVE' && isBannedOnline(product.schedule)) {
      throw ruleViolation('SCHEDULE_NOT_SOLD_ONLINE', `${product.name} can't be sold online.`);
    }
    if (item.decision === 'REMOVE' && !item.removedReason) throw new AppError(400, 'VALIDATION_FAILED', 'Give a reason for each removed medicine.');
    if (item.itemId && !order.items.some((existing) => existing.id === item.itemId)) throw notFound();
    if (item.offerGenericProductId) {
      const generic = products.get(item.offerGenericProductId);
      const valid =
        generic && generic.isGeneric && generic.isActive && !isBannedOnline(generic.schedule) &&
        generic.molecule === product.molecule && generic.strength === product.strength && generic.form === product.form &&
        generic.pricePaise < product.pricePaise;
      if (!valid) throw new AppError(400, 'VALIDATION_FAILED', 'That generic is not a valid cheaper equivalent.');
    }
  }

  const needsPrescription = approved.some((i) => rules.get(products.get(i.productId)!.schedule)?.rxRequired ?? true);
  const needsRegister = approved.some((i) => rules.get(products.get(i.productId)!.schedule)?.registerRequired ?? false);
  if (needsPrescription && !order.prescription) throw ruleViolation('PRESCRIPTION_REQUIRED', 'This order has no prescription. Request one or reject.');
  if (needsPrescription && !input.prescription) throw new AppError(400, 'VALIDATION_FAILED', 'Enter the prescription details.');
  if (input.prescription) {
    if (addDays(dateOnly(input.prescription.prescribedOn), RX_VALIDITY_DAYS) < todayIst()) {
      throw ruleViolation('PRESCRIPTION_EXPIRED', `The prescription is older than ${RX_VALIDITY_DAYS} days (policy). Reject the order instead.`);
    }
    if (dateOnly(input.prescription.prescribedOn) > todayIst()) throw new AppError(400, 'VALIDATION_FAILED', 'The prescription date is in the future.');
  }
  if (needsRegister && !input.prescription?.prescriberRegNo) {
    throw new AppError(400, 'VALIDATION_FAILED', "H1 medicines need the prescriber's registration number for the H1 register.");
  }

  // A change the customer must agree to: different product or quantity, an
  // added or removed medicine, or a generic offer.
  const changed = input.items.some((item) => {
    if (!item.itemId || item.decision === 'REMOVE' || item.offerGenericProductId) return true;
    const original = order.items.find((o) => o.id === item.itemId)!;
    return original.requestedProductId !== item.productId || original.requestedQuantity !== item.quantity;
  });
  const now = new Date();
  const nextStatus = changed ? 'AWAITING_CUSTOMER' : 'APPROVED';

  await prisma.$transaction(async (tx) => {
    await claimVersion(tx, order.id, input.version, ['AWAITING_PHARMACIST']);

    if (order.prescription && input.prescription) {
      await tx.prescription.update({
        where: { id: order.prescription.id },
        data: {
          prescriberName: input.prescription.prescriberName,
          prescriberRegNo: input.prescription.prescriberRegNo || null,
          prescribedOn: dateOnly(input.prescription.prescribedOn),
          patientNameOnRx: input.prescription.patientNameOnRx || null,
          reviewStatus: 'VERIFIED',
          verifiedById: pharmacist.id,
          verifiedAt: now,
        },
      });
    }

    let total = 0;
    for (const item of input.items) {
      const product = products.get(item.productId)!;
      const common = {
        productId: product.id,
        quantity: item.quantity,
        unitPricePaise: product.pricePaise,
        doseMorning: item.dose?.morning ?? null,
        doseNoon: item.dose?.noon ?? null,
        doseNight: item.dose?.night ?? null,
        doseAsNeeded: item.asNeeded,
        durationDays: item.durationDays,
      };
      const approval =
        item.decision === 'APPROVE'
          ? {
              status: 'ACTIVE' as const,
              removedReason: null,
              approvedById: pharmacist.id,
              approvedAt: now,
              approvedProductId: product.id,
              approvedQuantity: item.quantity,
              approvedPrescriptionId: order.prescriptionId,
              approvedGenericProductId: item.offerGenericProductId ?? null,
              customerChoice: null,
              consentAt: null,
            }
          : { status: 'REMOVED' as const, removedReason: item.removedReason, approvedById: null, approvedAt: null, approvedProductId: null, approvedQuantity: null, approvedPrescriptionId: null, approvedGenericProductId: null };
      if (item.itemId) {
        await tx.orderItem.update({ where: { id: item.itemId }, data: { ...common, ...approval } });
      } else {
        await tx.orderItem.create({
          data: { orderId: order.id, requestedProductId: product.id, requestedQuantity: item.quantity, ...common, ...approval },
        });
      }
      if (item.decision === 'APPROVE') total += product.pricePaise * item.quantity;
    }

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: nextStatus,
        verifiedById: pharmacist.id,
        verifiedAt: now,
        reviewingById: null,
        reviewingAt: null,
        subtotalPaise: total,
        totalPaise: total,
        paymentStatus: nextStatus === 'APPROVED' ? (order.paymentMethod === 'COD' ? 'COD_PENDING' : 'DUE') : 'NOT_DUE',
      },
    });
    await recordEvent(tx, {
      orderId: order.id,
      from: 'AWAITING_PHARMACIST',
      to: nextStatus,
      actorId: pharmacist.id,
      actorRole: 'PHARMACIST',
      note: changed ? 'Approved with changes; waiting for the customer to confirm' : 'All items approved',
    });
    await notify(
      tx,
      order.accountId,
      order.id,
      changed
        ? `Your pharmacist checked order ${order.number} and suggested changes. Please open the app to confirm.`
        : `Your pharmacist approved order ${order.number}.`,
    );
  });

  if (nextStatus === 'AWAITING_CUSTOMER') return { outcome: 'AWAITING_CUSTOMER' };
  return routeOrder(order.id);
}

export async function rejectOrder(pharmacist: Pharmacist, orderId: string, input: z.output<typeof RejectOrderSchema>) {
  if (input.reason === 'OTHER' && !input.note) throw new AppError(400, 'VALIDATION_FAILED', 'Add a note explaining the reason.');
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw notFound();
  await prisma.$transaction(async (tx) => {
    await claimVersion(tx, order.id, input.version, ['AWAITING_PHARMACIST', 'ON_HOLD_REUPLOAD']);
    await tx.order.update({
      where: { id: order.id },
      data: { status: 'REJECTED', rejectionReason: input.reason, rejectionNote: input.note, verifiedById: pharmacist.id, verifiedAt: new Date(), paymentStatus: 'VOID', reviewingById: null },
    });
    if (order.prescriptionId && input.reason.startsWith('PRESCRIPTION')) {
      await tx.prescription.update({ where: { id: order.prescriptionId }, data: { reviewStatus: 'REJECTED' } });
    }
    await recordEvent(tx, { orderId: order.id, from: order.status, to: 'REJECTED', actorId: pharmacist.id, actorRole: 'PHARMACIST', note: input.note ?? input.reason });
    await notify(tx, order.accountId, order.id, `Order ${order.number} couldn't be approved. Please open the app to see why and what to do next.`);
  });
}

export async function requestReupload(pharmacist: Pharmacist, orderId: string, input: z.output<typeof ReuploadRequestSchema>) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw notFound();
  await prisma.$transaction(async (tx) => {
    await claimVersion(tx, order.id, input.version, ['AWAITING_PHARMACIST']);
    await tx.order.update({ where: { id: order.id }, data: { status: 'ON_HOLD_REUPLOAD', reuploadReason: input.reason, reviewingById: null } });
    if (order.prescriptionId) await tx.prescription.update({ where: { id: order.prescriptionId }, data: { reviewStatus: 'REUPLOAD_ASKED' } });
    await recordEvent(tx, { orderId: order.id, from: 'AWAITING_PHARMACIST', to: 'ON_HOLD_REUPLOAD', actorId: pharmacist.id, actorRole: 'PHARMACIST', note: input.note ?? input.reason });
    await notify(tx, order.accountId, order.id, `We need a clearer photo of your prescription for order ${order.number}. Please open the app to upload it again.`);
  });
}
