/**
 * Seed v2: a table of realistic orders in every state, so the queue, the store
 * board, the operations overview and the H1 register all have something to show.
 *
 * Orders are moved through their statuses one step at a time, so every row
 * passes the same database dispatch gate as a real order.
 */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { lineTotalPaise } from '@nirantar/shared';
import { encrypt } from '../../src/lib/crypto';
import { prisma } from '../../src/lib/db';
import { orderMessages, type OrderMessage } from '../../src/services/orders/order-messages';
import { buildDraft, loadCatalog } from '../../src/services/prescriptions/prescription.service';
import type { Extraction } from '../../src/services/ai/extraction';
import type { OrderStatus, Prisma, Schedule } from '../../src/generated/prisma/client';

const MIN = 60_000;

/** Walks up from this file so it works from the source tree and from the bundled server. */
function findSamplesDir(): string | null {
  let dir = import.meta.dirname;
  for (let i = 0; i < 6; i += 1) {
    const candidate = path.join(dir, 'frontend', 'public', 'samples');
    if (existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  return null;
}
const samplesDir = findSamplesDir();

/** Encrypts a synthetic sample exactly as an upload would be. */
export async function attachSample(prescriptionId: string, sample: string) {
  if (!samplesDir) return;
  const image = readFileSync(path.join(samplesDir, `${sample}.jpg`));
  await prisma.prescriptionFile.create({
    data: {
      prescriptionId,
      ...encrypt(image, prescriptionId),
      mimeType: 'image/jpeg',
      byteSize: image.length,
      sha256: createHash('sha256').update(image).digest('hex'),
    },
  });
}

export interface DraftLine {
  name: string;
  strength: string;
  dose: string;
  duration: string;
  /** How sure the AI is about this line; anything below "high" shows as "please check". */
  confidence?: 'high' | 'medium' | 'low';
}

/** A stored AI draft, built by the same matcher a real AI read goes through. */
export async function aiDraft(lines: DraftLine[], details: { prescriber: string; regNo: string; prescribedOn: string; patient: string }) {
  const known = (value: string) => ({ value, confidence: 'high' as const });
  const extraction: Extraction = {
    isPrescription: true,
    legibility: lines.some((l) => l.confidence && l.confidence !== 'high') ? 'partly_legible' : 'clear',
    prescriberName: known(details.prescriber),
    prescriberRegNo: known(details.regNo),
    prescribedOn: known(details.prescribedOn),
    patientName: known(details.patient),
    items: lines.map((line) => ({
      lineText: `Tab ${line.name} ${line.strength} ${line.dose} x ${line.duration}`,
      medicineName: { value: line.name, confidence: line.confidence ?? 'high' },
      strength: known(line.strength),
      dosageText: { value: line.dose, confidence: line.confidence ?? 'high' },
      durationText: known(line.duration),
      quantityText: { value: null, confidence: 'high' },
    })),
    unreadableLineCount: 0,
  };
  return buildDraft(extraction, await loadCatalog());
}

export interface SeedItem {
  sku: string;
  qty: number;
  dose?: [number, number, number];
  days?: number;
  /** Pharmacist changed the quantity from this (customer must confirm). */
  requestedQty?: number;
  /** Generic the pharmacist offered. */
  genericSku?: string;
  /** The customer accepted the generic: the item now carries it. */
  switched?: boolean;
}

export interface SeedRx {
  sample: string;
  prescriber: string;
  regNo: string;
  prescribedOn: string;
  patientOnRx: string;
  ai?: 'READY' | 'UNSURE' | 'UNREADABLE' | 'FAILED';
}

export interface SeedOrder {
  number: string;
  account: string;
  patient: string;
  store?: string;
  previewStore?: string;
  status: OrderStatus;
  placedMinutesAgo: number;
  /** Minutes the pharmacist took (feeds the verification-time numbers). */
  verifyMinutes?: number;
  pharmacist?: string;
  upiPaid?: boolean;
  source?: 'NEW' | 'REFILL';
  rx?: SeedRx;
  /** Reuse an existing prescription (refills of the same paper). */
  rxId?: string;
  items: SeedItem[];
  rejection?: { reason: string; note?: string };
  rider?: string;
  reviewing?: string;
}

export interface SeedContext {
  customerId: Map<string, string>;
  patientId: Map<string, string>;
  patientName: Map<string, string>;
  addressOf: Map<string, Prisma.InputJsonObject & { lat: number; lng: number; line1: string; locality: string; city: string; pincode: string }>;
  storeId: (code: string) => string;
  product: (sku: string) => { id: string; pricePaise: number; schedule: Schedule; name: string; strength: string };
  pharmacist: (key: string) => string;
  now: Date;
}

const FULFILMENT_PATH: OrderStatus[] = ['ASSIGNED', 'PICKING', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED'];
const STILL_RESERVED: OrderStatus[] = ['ASSIGNED', 'PICKING', 'PACKED'];

let invoiceCounter = 1100;

export async function createSeedOrder(spec: SeedOrder, ctx: SeedContext): Promise<string> {
  const at = (minutesAgo: number) => new Date(ctx.now.getTime() - minutesAgo * MIN);
  const placedAt = at(spec.placedMinutesAgo);
  const accountId = ctx.customerId.get(spec.account)!;
  const patientId = ctx.patientId.get(spec.patient)!;
  const address = ctx.addressOf.get(spec.account)!;
  const pharmacistId = spec.pharmacist ? ctx.pharmacist(spec.pharmacist) : null;
  const decided = spec.verifyMinutes !== undefined && pharmacistId !== null;
  const verifiedAt = decided ? new Date(placedAt.getTime() + spec.verifyMinutes! * MIN) : null;
  const rejected = spec.status === 'REJECTED';

  // ── Prescription ──
  let prescriptionId = spec.rxId ?? null;
  if (spec.rx) {
    const rx = spec.rx;
    prescriptionId = randomUUID();
    const verified = decided && !rejected;
    const hasDraft = !rx.ai || rx.ai === 'READY' || rx.ai === 'UNSURE';
    const draft = hasDraft
      ? await aiDraft(
          spec.items.map((item, index) => {
            const p = ctx.product(item.sku);
            const dose = item.dose ?? [1, 0, 0];
            return {
              name: p.name.split(' ')[0]!,
              strength: p.strength,
              dose: dose.join('-'),
              duration: `${item.days ?? 30} days`,
              confidence: rx.ai === 'UNSURE' && index === 0 ? ('medium' as const) : ('high' as const),
            };
          }),
          { prescriber: rx.prescriber, regNo: rx.regNo, prescribedOn: rx.prescribedOn, patient: rx.patientOnRx },
        )
      : null;
    await prisma.prescription.create({
      data: {
        id: prescriptionId,
        patientId,
        uploadedById: accountId,
        aiStatus: draft?.aiStatus ?? rx.ai!,
        ...(draft ? { aiDraft: draft.aiDraft } : {}),
        aiStartedAt: placedAt,
        reviewStatus: rejected ? 'REJECTED' : verified ? 'VERIFIED' : 'PENDING',
        ...(verified
          ? {
              prescriberName: rx.prescriber,
              prescriberRegNo: rx.regNo,
              prescribedOn: new Date(rx.prescribedOn),
              patientNameOnRx: rx.patientOnRx,
              verifiedById: pharmacistId,
              verifiedAt,
            }
          : {}),
        createdAt: placedAt,
      },
    });
    await attachSample(prescriptionId, rx.sample);
  }

  // ── Items ──
  const itemRows = spec.items.map((item) => {
    const requested = ctx.product(item.sku);
    const carried = item.switched && item.genericSku ? ctx.product(item.genericSku) : requested;
    return {
      productId: carried.id,
      quantity: item.qty,
      requestedProductId: requested.id,
      requestedQuantity: item.requestedQty ?? item.qty,
      unitPricePaise: carried.pricePaise,
      asWritten: `Tab ${requested.name} ${(item.dose ?? [1, 0, 0]).join('-')} x ${item.days ?? 30} days`,
      ...(decided && !rejected
        ? {
            doseMorning: (item.dose ?? [1, 0, 0])[0],
            doseNoon: (item.dose ?? [1, 0, 0])[1],
            doseNight: (item.dose ?? [1, 0, 0])[2],
            durationDays: item.days ?? 30,
            approvedById: pharmacistId,
            approvedAt: verifiedAt,
            approvedProductId: requested.id,
            approvedQuantity: item.qty,
            approvedPrescriptionId: prescriptionId,
            approvedGenericProductId: item.genericSku ? ctx.product(item.genericSku).id : null,
            customerChoice: item.switched ? ('SWITCH' as const) : null,
            consentAt: item.switched ? new Date(verifiedAt!.getTime() + 20 * MIN) : null,
          }
        : {}),
    };
  });
  const total = itemRows.reduce((sum, row) => sum + lineTotalPaise(row.unitPricePaise, row.quantity), 0);

  // ── Timeline ──
  const finalStep = FULFILMENT_PATH.indexOf(spec.status);
  const events: Prisma.OrderEventCreateWithoutOrderInput[] = [];
  const addEvent = (fromStatus: OrderStatus | null, toStatus: OrderStatus, role: 'CUSTOMER' | 'PHARMACIST' | 'SYSTEM', when: Date, note?: string) =>
    events.push({ fromStatus, toStatus, actorRole: role, at: when, note, actor: role === 'SYSTEM' ? undefined : { connect: { id: role === 'CUSTOMER' ? accountId : pharmacistId! } } });

  addEvent(null, 'AWAITING_PHARMACIST', 'CUSTOMER', placedAt, 'Order placed');
  const storeName = spec.store ? (await prisma.store.findUniqueOrThrow({ where: { id: ctx.storeId(spec.store) } })).name : '';
  if (rejected) addEvent('AWAITING_PHARMACIST', 'REJECTED', 'PHARMACIST', verifiedAt!, spec.rejection?.note);
  if (spec.status === 'CANCELLED') addEvent('AWAITING_PHARMACIST', 'CANCELLED', 'CUSTOMER', at(spec.placedMinutesAgo - 8), 'Cancelled by the customer');
  if (spec.status === 'AWAITING_CUSTOMER') addEvent('AWAITING_PHARMACIST', 'AWAITING_CUSTOMER', 'PHARMACIST', verifiedAt!, 'Pharmacist suggested changes');
  if (spec.status === 'AWAITING_STOCK') {
    addEvent('AWAITING_PHARMACIST', 'APPROVED', 'PHARMACIST', verifiedAt!, 'All items approved');
    addEvent('APPROVED', 'AWAITING_STOCK', 'SYSTEM', verifiedAt!, 'No nearby store had every item');
  }

  // Steps after approval are spread evenly between the decision and now.
  const window = verifiedAt ? ctx.now.getTime() - verifiedAt.getTime() : 0;
  const stepAt = (step: number) => new Date(verifiedAt!.getTime() + (window * Math.min(step, 4)) / 5);
  if (finalStep >= 0) {
    addEvent('AWAITING_PHARMACIST', 'APPROVED', 'PHARMACIST', verifiedAt!, 'All items approved');
    addEvent('APPROVED', 'ASSIGNED', 'SYSTEM', verifiedAt!, `Routed to ${storeName} store`);
    for (let step = 1; step <= finalStep; step += 1) {
      addEvent(FULFILMENT_PATH[step - 1]!, FULFILMENT_PATH[step]!, 'PHARMACIST', stepAt(step));
    }
  }

  const paymentStatus = (() => {
    if (spec.status === 'REJECTED' || spec.status === 'CANCELLED') return 'VOID' as const;
    if (spec.upiPaid) return 'PAID' as const;
    if (!decided || spec.status === 'AWAITING_CUSTOMER') return 'NOT_DUE' as const;
    return spec.status === 'DELIVERED' ? ('COD_COLLECTED' as const) : ('COD_PENDING' as const);
  })();

  // ── The order: created before fulfilment, then walked through the gate ──
  const order = await prisma.order.create({
    data: {
      number: spec.number,
      accountId,
      patientId,
      prescriptionId,
      source: spec.source ?? 'NEW',
      status: finalStep >= 0 ? 'ASSIGNED' : spec.status,
      storeId: spec.store && finalStep >= 0 ? ctx.storeId(spec.store) : null,
      previewStoreId: spec.previewStore ? ctx.storeId(spec.previewStore) : spec.store ? ctx.storeId(spec.store) : null,
      deliveryAddress: address,
      deliveryLat: address.lat,
      deliveryLng: address.lng,
      paymentMethod: spec.upiPaid ? 'UPI_TEST' : 'COD',
      paymentStatus,
      subtotalPaise: total,
      totalPaise: total,
      remindersOptIn: true,
      routingNote: finalStep >= 0 ? 'Nearest store with every item in stock.' : spec.status === 'AWAITING_STOCK' ? 'No store within 8 km has every item in stock right now.' : null,
      promisedBy: finalStep >= 0 && finalStep < 4 ? at(-180) : null,
      verifiedById: decided ? pharmacistId : null,
      verifiedAt,
      rejectionReason: spec.rejection?.reason,
      rejectionNote: spec.rejection?.note,
      reviewingById: spec.reviewing ? ctx.pharmacist(spec.reviewing) : null,
      reviewingAt: spec.reviewing ? at(1) : null,
      placedAt,
      cancelledAt: spec.status === 'CANCELLED' ? at(spec.placedMinutesAgo - 8) : null,
      version: events.length,
      items: { create: itemRows },
      events: { create: events },
    },
    include: { items: true },
  });

  if (finalStep >= 0) {
    const storeId = ctx.storeId(spec.store!);
    // Handed-over H1 items need their register row before the gate lets them out.
    if (finalStep >= 3) {
      const rx = spec.rx;
      for (const item of order.items) {
        if (ctx.product(spec.items.find((s) => ctx.product(s.sku).id === item.requestedProductId)!.sku).schedule !== 'H1') continue;
        await prisma.h1RegisterEntry.create({
          data: {
            orderItemId: item.id,
            orderId: order.id,
            productId: item.productId,
            quantity: item.quantity,
            patientName: ctx.patientName.get(spec.patient)!,
            patientAddress: [address.line1, address.locality, address.city, address.pincode].join(', '),
            prescriberName: rx!.prescriber,
            prescriberRegNo: rx!.regNo,
            pharmacistId: pharmacistId!,
            storeId,
            suppliedAt: stepAt(3),
          },
        });
      }
    }
    for (let step = 1; step <= finalStep; step += 1) {
      const status = FULFILMENT_PATH[step]!;
      await prisma.order.update({
        where: { id: order.id },
        data: {
          status,
          ...(status === 'PACKED' ? { invoiceNo: `${spec.store}/26/${(invoiceCounter += 1)}` } : {}),
          ...(status === 'OUT_FOR_DELIVERY' ? { riderName: spec.rider ?? 'Bapi Das' } : {}),
          ...(status === 'DELIVERED' ? { deliveredAt: stepAt(step) } : {}),
        },
      });
    }
    if (STILL_RESERVED.includes(spec.status)) {
      for (const item of order.items) {
        await prisma.storeStock.updateMany({
          where: { storeId, productId: item.productId },
          data: { reserved: { increment: item.quantity } },
        });
      }
    }
  }

  // ── What the customer's test inbox would have received ──
  const { locale } = await prisma.user.findUniqueOrThrow({ where: { id: accountId }, select: { locale: true } });
  const lastMessage: Partial<Record<OrderStatus, OrderMessage>> = {
    AWAITING_CUSTOMER: orderMessages.changes(spec.number),
    REJECTED: orderMessages.rejected(spec.number),
    ASSIGNED: orderMessages.approved(spec.number),
    PICKING: orderMessages.approved(spec.number),
    OUT_FOR_DELIVERY: orderMessages.onTheWay(spec.number, spec.rider ?? 'Bapi Das'),
    DELIVERED: orderMessages.delivered(spec.number),
  };
  const body = lastMessage[spec.status]?.[locale];
  if (body) {
    await prisma.message.create({
      data: { accountId, orderId: order.id, channel: 'SMS', body: `Nirantar (test): ${body}`, createdAt: finalStep >= 3 ? stepAt(finalStep) : (verifiedAt ?? placedAt) },
    });
  }
  return order.id;
}

const DAY = 24 * 60;

const RX = {
  mitali: { sample: 'rx-mitali', prescriber: 'Dr. S. Banerjee', regNo: 'DEMO-WB-48213', prescribedOn: '2026-10-19', patientOnRx: 'Mitali Dutta' },
  nirmal: { sample: 'rx-nirmal', prescriber: 'Dr. R. Basu', regNo: 'DEMO-WB-62214', prescribedOn: '2026-10-08', patientOnRx: 'Nirmal Dutta' },
  tapas: { sample: 'rx-tapas', prescriber: 'Dr. A. Mukherjee', regNo: 'DEMO-WB-15557', prescribedOn: '2026-10-12', patientOnRx: 'Tapas Nandi' },
  sharmila: { sample: 'rx-sharmila', prescriber: 'Dr. P. Sarkar', regNo: 'DEMO-WB-30177', prescribedOn: '2026-10-22', patientOnRx: 'Sharmila Das' },
  bikram: { sample: 'rx-bikram', prescriber: 'Dr. N. Islam', regNo: 'DEMO-WB-55120', prescribedOn: '2026-10-26', patientOnRx: 'Bikram Saha' },
  sudipta: { sample: 'rx-h1', prescriber: 'Dr. A. Mukherjee', regNo: 'DEMO-WB-15557', prescribedOn: '2026-11-02', patientOnRx: 'Sudipta Roy' },
  farhana: { sample: 'rx-farhana', prescriber: 'Dr. N. Islam', regNo: 'DEMO-WB-55120', prescribedOn: '2026-10-30', patientOnRx: 'Farhana Begum' },
} satisfies Record<string, SeedRx>;

/** Orders that don't feed the refill subscriptions: background volume across stores. */
export const BACKGROUND_ORDERS: SeedOrder[] = [
  // ── Delivered history (with verification times that make the overview meaningful) ──
  { number: 'RX-50146', account: 'mitali', patient: 'mitali-self', store: 'SLK', status: 'DELIVERED', placedMinutesAgo: 3 * DAY, verifyMinutes: 7, pharmacist: 'sanjukta', rx: RX.mitali, items: [{ sku: 'CFX200-S10', qty: 1, dose: [1, 0, 1], days: 5 }] },
  { number: 'RX-50147', account: 'tapas', patient: 'tapas-self', store: 'GRH', status: 'DELIVERED', placedMinutesAgo: 2 * DAY, verifyMinutes: 12, pharmacist: 'ananya', upiPaid: true, rx: RX.tapas, items: [{ sku: 'TEL40-S10', qty: 3 }] },
  { number: 'RX-50148', account: 'tapas', patient: 'tapas-self', store: 'GRH', status: 'DELIVERED', placedMinutesAgo: 9 * DAY, verifyMinutes: 5, pharmacist: 'ananya', rx: RX.tapas, items: [{ sku: 'LVF500-S5', qty: 1, days: 5 }] },
  { number: 'RX-50149', account: 'sharmila', patient: 'sharmila-self', store: 'BHL', status: 'DELIVERED', placedMinutesAgo: DAY + 200, verifyMinutes: 3, pharmacist: 'moumita', rx: RX.sharmila, items: [{ sku: 'LOS50-S10', qty: 3 }] },
  { number: 'RX-50150', account: 'bikram', patient: 'bikram-self', store: 'HWM', status: 'DELIVERED', placedMinutesAgo: 4 * DAY, verifyMinutes: 8, pharmacist: 'sourav', rx: RX.bikram, items: [{ sku: 'MTP25-S10', qty: 3, dose: [1, 0, 1], days: 15 }] },
  { number: 'RX-50151', account: 'sudipta', patient: 'sudipta-self', store: 'NTN', status: 'DELIVERED', placedMinutesAgo: 6 * DAY, verifyMinutes: 2, pharmacist: 'imran', items: [{ sku: 'ORS-21G', qty: 4 }] },
  { number: 'RX-50152', account: 'mitali', patient: 'nirmal', store: 'SLK', status: 'DELIVERED', placedMinutesAgo: 12 * DAY, verifyMinutes: 9, pharmacist: 'sanjukta', rx: RX.nirmal, items: [{ sku: 'ATV10-S10', qty: 3, dose: [0, 0, 1], genericSku: 'ATV10-G10', switched: true }] },
  { number: 'RX-50153', account: 'bikram', patient: 'bikram-self', store: 'HWM', status: 'DELIVERED', placedMinutesAgo: 5 * DAY, verifyMinutes: 15, pharmacist: 'sourav', rx: RX.bikram, items: [{ sku: 'AML5-S10', qty: 3, dose: [0, 0, 1] }] },

  // ── Rejected and cancelled ──
  { number: 'RX-50170', account: 'tapas', patient: 'tapas-self', previewStore: 'GRH', status: 'REJECTED', placedMinutesAgo: 5 * DAY, verifyMinutes: 6, pharmacist: 'ananya', rx: RX.nirmal, items: [{ sku: 'CLO75-S10', qty: 3 }], rejection: { reason: 'PATIENT_MISMATCH', note: 'The prescription is in another patient’s name.' } },
  { number: 'RX-50171', account: 'sharmila', patient: 'sharmila-self', previewStore: 'BHL', status: 'REJECTED', placedMinutesAgo: 2 * DAY, verifyMinutes: 4, pharmacist: 'moumita', rx: RX.sharmila, items: [{ sku: 'LOS50-S10', qty: 3 }], rejection: { reason: 'PRESCRIPTION_EXPIRED' } },
  { number: 'RX-50172', account: 'bikram', patient: 'bikram-self', previewStore: 'HWM', status: 'REJECTED', placedMinutesAgo: 6 * DAY, verifyMinutes: 11, pharmacist: 'sourav', rx: RX.bikram, items: [{ sku: 'LVF500-S5', qty: 2, days: 5 }], rejection: { reason: 'NOT_ON_PRESCRIPTION' } },
  { number: 'RX-50173', account: 'mitali', patient: 'mitali-self', previewStore: 'SLK', status: 'CANCELLED', placedMinutesAgo: 6 * DAY, rx: RX.mitali, items: [{ sku: 'MET1000-S15', qty: 4, dose: [1, 0, 1] }] },

  // ── At the stores right now ──
  { number: 'RX-50220', account: 'mitali', patient: 'mitali-self', store: 'SLK', status: 'ASSIGNED', placedMinutesAgo: 40, verifyMinutes: 6, pharmacist: 'sanjukta', rx: RX.mitali, items: [{ sku: 'MET1000-S15', qty: 4, dose: [1, 0, 1] }] },
  { number: 'RX-50221', account: 'mitali', patient: 'nirmal', store: 'SLK', status: 'PICKING', placedMinutesAgo: 75, verifyMinutes: 9, pharmacist: 'sanjukta', rx: RX.nirmal, items: [{ sku: 'CLO75-S10', qty: 3 }] },
  { number: 'RX-50222', account: 'tapas', patient: 'tapas-self', store: 'GRH', status: 'ASSIGNED', placedMinutesAgo: 30, verifyMinutes: 4, pharmacist: 'ananya', rx: RX.tapas, items: [{ sku: 'CLO75-S10', qty: 3, dose: [0, 0, 1] }] },
  { number: 'RX-50223', account: 'mitali', patient: 'mitali-self', store: 'SLK', status: 'OUT_FOR_DELIVERY', placedMinutesAgo: 240, verifyMinutes: 8, pharmacist: 'sanjukta', rider: 'Bapi Das', rx: RX.mitali, items: [{ sku: 'CFX200-S10', qty: 1, dose: [1, 0, 1], days: 5 }] },
  { number: 'RX-50224', account: 'sharmila', patient: 'sharmila-self', store: 'BHL', status: 'PACKED', placedMinutesAgo: 150, verifyMinutes: 5, pharmacist: 'moumita', upiPaid: true, rx: RX.sharmila, items: [{ sku: 'LEV100-B100', qty: 1, days: 100 }] },
  { number: 'RX-50225', account: 'bikram', patient: 'bikram-self', store: 'HWM', status: 'PICKING', placedMinutesAgo: 60, verifyMinutes: 10, pharmacist: 'sourav', rx: RX.bikram, items: [{ sku: 'MTP25-S10', qty: 3, dose: [1, 0, 1], days: 15 }] },

  // ── Waiting for the customer: the pharmacist changed the quantity and offered a generic ──
  { number: 'RX-50226', account: 'sudipta', patient: 'sudipta-self', previewStore: 'NTN', status: 'AWAITING_CUSTOMER', placedMinutesAgo: 50, verifyMinutes: 7, pharmacist: 'imran', rx: RX.sudipta, items: [{ sku: 'TEL40-S10', qty: 3, requestedQty: 6, genericSku: 'TEL40-G10' }] },

  // ── Approved but no store has it: uploading docs/demo/stock-valid.csv routes it ──
  { number: 'RX-50227', account: 'farhana', patient: 'farhana-self', previewStore: 'GRH', status: 'AWAITING_STOCK', placedMinutesAgo: 130, verifyMinutes: 6, pharmacist: 'ananya', rx: RX.farhana, items: [{ sku: 'SIT100-S10', qty: 3, dose: [0, 0, 1] }] },

  // ── The verification queue (oldest first; one overdue, one H1, one photo only, one OTC) ──
  { number: 'RX-50228', account: 'sharmila', patient: 'sharmila-self', previewStore: 'BHL', status: 'AWAITING_PHARMACIST', placedMinutesAgo: 22, rx: { ...RX.sharmila, ai: 'FAILED' }, items: [] },
  { number: 'RX-50229', account: 'bikram', patient: 'bikram-self', previewStore: 'HWM', status: 'AWAITING_PHARMACIST', placedMinutesAgo: 14, rx: { ...RX.bikram, ai: 'UNSURE' }, items: [{ sku: 'MTP25-S10', qty: 3, dose: [1, 0, 1], days: 15 }, { sku: 'AML5-S10', qty: 3, dose: [0, 0, 1] }] },
  { number: 'RX-50230', account: 'tapas', patient: 'tapas-self', previewStore: 'GRH', status: 'AWAITING_PHARMACIST', placedMinutesAgo: 4, reviewing: 'imran', rx: RX.tapas, items: [{ sku: 'LVF500-S5', qty: 1, days: 5 }] },
  { number: 'RX-50231', account: 'sudipta', patient: 'sudipta-self', previewStore: 'NTN', status: 'AWAITING_PHARMACIST', placedMinutesAgo: 3, rx: RX.sudipta, items: [{ sku: 'CFX200-S10', qty: 1, dose: [1, 0, 1], days: 5 }] },
  { number: 'RX-50232', account: 'mitali', patient: 'mitali-self', previewStore: 'SLK', status: 'AWAITING_PHARMACIST', placedMinutesAgo: 2, items: [{ sku: 'PCM500-S15', qty: 2 }, { sku: 'ORS-21G', qty: 4 }] },
];

/** The delivered fills behind the refill subscriptions: one per subscription. */
export function historyOrders(rx: { anjali: string; debasish: string; rinaOld: string; haripada: string; farhanaOld: string }): SeedOrder[] {
  return [
    { number: 'RX-50140', account: 'debasish', patient: 'anjali', store: 'SLK', status: 'DELIVERED', placedMinutesAgo: 25 * DAY, verifyMinutes: 6, pharmacist: 'sanjukta', rxId: rx.anjali, source: 'REFILL', items: [{ sku: 'MET500-S15', qty: 4, dose: [1, 0, 1] }] },
    { number: 'RX-50141', account: 'debasish', patient: 'debasish-self', store: 'SLK', status: 'DELIVERED', placedMinutesAgo: 26 * DAY, verifyMinutes: 4, pharmacist: 'sanjukta', rxId: rx.debasish, items: [{ sku: 'AML5-S10', qty: 3 }] },
    { number: 'RX-50142', account: 'debasish', patient: 'anjali', store: 'SLK', status: 'DELIVERED', placedMinutesAgo: 81 * DAY, verifyMinutes: 9, pharmacist: 'sanjukta', rxId: rx.anjali, items: [{ sku: 'LEV25-B100', qty: 1, days: 100 }] },
    { number: 'RX-50143', account: 'rina', patient: 'rina-self', store: 'BHL', status: 'DELIVERED', placedMinutesAgo: 28 * DAY, verifyMinutes: 8, pharmacist: 'moumita', rxId: rx.rinaOld, items: [{ sku: 'TEL40-S10', qty: 3 }] },
    { number: 'RX-50144', account: 'sudipta', patient: 'haripada', store: 'NTN', status: 'DELIVERED', placedMinutesAgo: 30 * DAY, verifyMinutes: 11, pharmacist: 'imran', rxId: rx.haripada, items: [{ sku: 'ATV10-S10', qty: 3, dose: [0, 0, 1] }] },
    { number: 'RX-50145', account: 'farhana', patient: 'farhana-self', store: 'GRH', status: 'DELIVERED', placedMinutesAgo: 31 * DAY, verifyMinutes: 5, pharmacist: 'ananya', rxId: rx.farhanaOld, items: [{ sku: 'GLM2-S10', qty: 3 }] },
  ];
}
