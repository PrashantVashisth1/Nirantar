/**
 * Customer-facing reads and family profiles.
 *
 * OWNERSHIP RULE: every query here filters by the signed-in account
 * (`accountId`). A record that belongs to someone else is treated exactly like
 * one that doesn't exist (404), so customers can't even learn it exists.
 */
import {
  RX_VALIDITY_DAYS,
  TERMINAL_ORDER_STATUSES,
  addDays,
  daysBetween,
  todayIst,
  type HomeDto,
  type NewPatientInput,
  type PatientDto,
  type RefillDto,
} from '@nirantar/shared';
import { prisma } from '../../lib/db';
import { AppError, notFound } from '../../lib/errors';
import {
  orderDetailInclude,
  orderSummaryInclude,
  toOrderDetail,
  toOrderSummary,
  toProductSummary,
} from '../../http/presenters/order.presenter';
import type { Patient } from '../../generated/prisma/client';

const MAX_PATIENTS_PER_ACCOUNT = 10;
const terminal = [...TERMINAL_ORDER_STATUSES];

function toPatientDto(patient: Patient): PatientDto {
  return {
    id: patient.id,
    fullName: patient.fullName,
    relation: patient.relation,
    birthYear: patient.birthYear,
  };
}

export async function listPatients(accountId: string): Promise<PatientDto[]> {
  const patients = await prisma.patient.findMany({
    where: { accountId, archivedAt: null },
    orderBy: [{ relation: 'asc' }, { createdAt: 'asc' }],
  });
  return patients.map(toPatientDto);
}

export async function addPatient(accountId: string, input: NewPatientInput): Promise<PatientDto> {
  const existing = await prisma.patient.findMany({ where: { accountId, archivedAt: null } });
  if (existing.length >= MAX_PATIENTS_PER_ACCOUNT) {
    throw new AppError(422, 'TOO_MANY_PATIENTS', `You can add up to ${MAX_PATIENTS_PER_ACCOUNT} people.`);
  }
  if (input.relation === 'SELF' && existing.some((p) => p.relation === 'SELF')) {
    throw new AppError(422, 'SELF_EXISTS', 'Your own profile already exists.');
  }
  const patient = await prisma.patient.create({
    data: { accountId, fullName: input.fullName, relation: input.relation, birthYear: input.birthYear },
  });
  return toPatientDto(patient);
}

/** Everything the Home screen needs, in one request. */
export async function getHome(accountId: string, now = new Date()): Promise<HomeDto> {
  const [patients, subscriptions, activeOrders, pastOrders] = await Promise.all([
    listPatients(accountId),
    prisma.refillSubscription.findMany({
      where: { accountId, isActive: true, patient: { archivedAt: null } },
      include: {
        product: true,
        patient: { select: { id: true, fullName: true, relation: true } },
        prescription: { select: { prescribedOn: true } },
      },
      orderBy: { runOutOn: 'asc' },
    }),
    prisma.order.findMany({
      where: { accountId, status: { notIn: terminal } },
      include: orderSummaryInclude,
      orderBy: { placedAt: 'desc' },
    }),
    prisma.order.findMany({
      where: { accountId, status: { in: terminal } },
      include: orderSummaryInclude,
      orderBy: { placedAt: 'desc' },
      take: 5,
    }),
  ]);

  const today = todayIst(now);
  const refills: RefillDto[] = subscriptions.map((sub) => {
    const inProgress = activeOrders.find(
      (order) => order.patient.id === sub.patientId && order.items.some((item) => item.productId === sub.productId),
    );
    const prescribedOn = sub.prescription?.prescribedOn;
    return {
      id: sub.id,
      patient: sub.patient,
      product: toProductSummary(sub.product),
      runOutOn: sub.runOutOn.toISOString().slice(0, 10),
      daysLeft: daysBetween(today, sub.runOutOn),
      daysSupply: sub.daysSupply,
      remindersEnabled: sub.remindersEnabled,
      prescriptionValid: prescribedOn ? addDays(prescribedOn, RX_VALIDITY_DAYS) >= today : false,
      orderInProgress: inProgress ? { id: inProgress.id, number: inProgress.number } : null,
    };
  });

  return {
    patients,
    refills,
    activeOrders: activeOrders.map(toOrderSummary),
    pastOrders: pastOrders.map(toOrderSummary),
  };
}

export async function listOrders(accountId: string, state: 'active' | 'past') {
  const orders = await prisma.order.findMany({
    where: { accountId, status: state === 'active' ? { notIn: terminal } : { in: terminal } },
    include: orderSummaryInclude,
    orderBy: { placedAt: 'desc' },
    take: 50,
  });
  return orders.map(toOrderSummary);
}

export async function getOrderForCustomer(accountId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, accountId },
    include: orderDetailInclude,
  });
  if (!order) throw notFound("We couldn't find this order.");
  return toOrderDetail(order);
}
