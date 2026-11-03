/**
 * What a customer can do to their own order (plan C4): confirm pharmacist
 * changes and choose generics (consent is recorded), upload a clearer photo,
 * pay by test UPI or switch to cash, and cancel before picking.
 */
import { canCustomerCancel } from '@nirantar/shared';
import type { z } from 'zod';
import type { CustomerDecisionSchema } from '@nirantar/shared';
import { isDemoMode } from '../../config/env';
import { prisma } from '../../lib/db';
import { AppError, notFound, ruleViolation } from '../../lib/errors';
import { uploadPrescription } from '../prescriptions/prescription.service';
import { releaseReservation, routeOrder } from '../routing/routing.service';
import { claimVersion, notify, recordEvent } from './order-helpers';

async function ownOrder(accountId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, accountId },
    include: { items: { include: { product: true, approvedGeneric: true } } },
  });
  if (!order) throw notFound("We couldn't find this order.");
  return order;
}

/** Confirm the pharmacist's changes; for each offered generic, keep the original or switch. */
export async function confirmChanges(accountId: string, orderId: string, input: z.output<typeof CustomerDecisionSchema>) {
  const order = await ownOrder(accountId, orderId);
  if (order.status !== 'AWAITING_CUSTOMER') throw ruleViolation('NOTHING_TO_CONFIRM', 'This order has nothing waiting for your confirmation.');

  const offered = order.items.filter((i) => i.status === 'ACTIVE' && i.approvedGenericProductId);
  for (const item of offered) {
    if (!input.choices.some((c) => c.itemId === item.id)) {
      throw new AppError(400, 'VALIDATION_FAILED', 'Choose "keep" or "switch" for every medicine with a generic option.');
    }
  }
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await claimVersion(tx, order.id, input.version, ['AWAITING_CUSTOMER']);
    let total = 0;
    for (const item of order.items.filter((i) => i.status === 'ACTIVE')) {
      const choice = input.choices.find((c) => c.itemId === item.id)?.choice;
      if (item.approvedGenericProductId && choice) {
        const generic = item.approvedGeneric!;
        const switching = choice === 'SWITCH';
        // Consent is recorded either way; a switch moves the item to the pharmacist-approved generic.
        await tx.orderItem.update({
          where: { id: item.id },
          data: {
            customerChoice: choice,
            consentAt: now,
            ...(switching ? { productId: generic.id, unitPricePaise: generic.pricePaise } : {}),
          },
        });
        total += (switching ? generic.pricePaise : item.unitPricePaise) * item.quantity;
      } else {
        total += item.unitPricePaise * item.quantity;
      }
    }
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: 'APPROVED',
        subtotalPaise: total,
        totalPaise: total,
        paymentStatus: order.paymentMethod === 'COD' ? 'COD_PENDING' : 'DUE',
      },
    });
    await recordEvent(tx, { orderId: order.id, from: 'AWAITING_CUSTOMER', to: 'APPROVED', actorId: accountId, actorRole: 'CUSTOMER', note: 'Customer confirmed the changes' });
  });
  return routeOrder(order.id);
}

export async function reuploadPrescription(accountId: string, orderId: string, file: Buffer) {
  const order = await ownOrder(accountId, orderId);
  if (order.status !== 'ON_HOLD_REUPLOAD') throw ruleViolation('NOT_ON_HOLD', 'This order is not waiting for a new photo.');
  const prescriptionId = await uploadPrescription({ accountId, patientId: order.patientId, file, replacesId: order.prescriptionId ?? undefined });
  await prisma.$transaction(async (tx) => {
    await claimVersion(tx, order.id, order.version, ['ON_HOLD_REUPLOAD']);
    await tx.order.update({ where: { id: order.id }, data: { status: 'AWAITING_PHARMACIST', prescriptionId, reuploadReason: null } });
    await recordEvent(tx, { orderId: order.id, from: 'ON_HOLD_REUPLOAD', to: 'AWAITING_PHARMACIST', actorId: accountId, actorRole: 'CUSTOMER', note: 'New prescription photo uploaded' });
  });
  return prescriptionId;
}

export async function cancelOrder(accountId: string, orderId: string, version: number) {
  const order = await ownOrder(accountId, orderId);
  if (!canCustomerCancel(order.status)) throw ruleViolation('CANNOT_CANCEL', 'This order is already being packed and can no longer be cancelled.');
  await prisma.$transaction(async (tx) => {
    await claimVersion(tx, order.id, version, [order.status]);
    if (order.status === 'ASSIGNED') {
      await releaseReservation(tx, { storeId: order.storeId, items: order.items.filter((i) => i.status === 'ACTIVE') });
    }
    await tx.order.update({
      where: { id: order.id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), paymentStatus: order.paymentStatus === 'PAID' ? 'REFUNDED' : 'VOID' },
    });
    await recordEvent(tx, { orderId: order.id, from: order.status, to: 'CANCELLED', actorId: accountId, actorRole: 'CUSTOMER', note: 'Cancelled by customer' });
  });
}

const PAYABLE = ['APPROVED', 'AWAITING_STOCK', 'ASSIGNED', 'PICKING', 'PACKED'];

/** Test-mode UPI: the outcome is chosen on the test sheet, like a gateway callback would report it. */
export async function payTest(accountId: string, orderId: string, outcome: 'SUCCESS' | 'FAILURE') {
  if (!isDemoMode()) throw new AppError(404, 'NOT_FOUND', 'Test payments are not available.');
  const order = await ownOrder(accountId, orderId);
  if (order.paymentMethod !== 'UPI_TEST' || !['DUE', 'FAILED'].includes(order.paymentStatus) || !PAYABLE.includes(order.status)) {
    throw ruleViolation('NOT_PAYABLE', 'There is nothing to pay for this order right now.');
  }
  const paid = outcome === 'SUCCESS';
  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: paid ? 'PAID' : 'FAILED', version: { increment: 1 } } });
    await notify(tx, accountId, order.id, paid ? `Payment received for order ${order.number}. Thank you.` : `The UPI payment for order ${order.number} didn't go through. You can try again or pay cash on delivery.`);
  });
  return { paymentStatus: paid ? 'PAID' : 'FAILED' };
}

export async function switchToCash(accountId: string, orderId: string) {
  const order = await ownOrder(accountId, orderId);
  if (order.paymentStatus === 'PAID' || !PAYABLE.includes(order.status) && order.status !== 'AWAITING_PHARMACIST' && order.status !== 'AWAITING_CUSTOMER') {
    throw ruleViolation('CANNOT_SWITCH', 'The payment method can no longer be changed.');
  }
  await prisma.order.update({
    where: { id: order.id },
    data: { paymentMethod: 'COD', paymentStatus: order.paymentStatus === 'NOT_DUE' ? 'NOT_DUE' : 'COD_PENDING', version: { increment: 1 } },
  });
}
