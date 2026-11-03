/**
 * Seeds the demo world (plan §5.1). Safe to run repeatedly: it wipes the
 * demo tables first, and all timestamps are relative to "now" so the demo
 * always looks current.
 *
 * Run with: npm run db:seed (from the repo root or backend/).
 */
import { hash } from '@node-rs/argon2';
import { addDays, findLocality, lineTotalPaise, todayIst } from '@nirantar/shared';
import { env } from '../../src/config/env';
import { prisma } from '../../src/lib/db';
import type { OrderStatus, Prisma } from '../../src/generated/prisma/client';
import {
  CUSTOMERS,
  OPS_USER,
  PHARMACISTS,
  PRODUCTS,
  SCHEDULE_RULES,
  STAFF_DEMO_PASSWORD,
  STORES,
} from './data';

if (env.APP_ENV === 'production') {
  console.error('Refusing to seed: APP_ENV is production.');
  process.exit(1);
}

const now = new Date();
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
const daysAgo = (days: number) => minutesAgo(days * 24 * 60);

/** Today 07:00 in India (UTC+5:30): when the morning stock count is taken (plan A5). */
function todayAt7amIst(): Date {
  const istNow = new Date(now.getTime() + 330 * 60_000);
  const istMidnightUtc = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate());
  return new Date(istMidnightUtc + 7 * 60 * 60_000 - 330 * 60_000);
}

/** Small deterministic "random" number so stock levels are the same on every seed. */
function stableNumber(text: string, min: number, max: number): number {
  let h = 0;
  for (const char of text) h = (h * 31 + char.charCodeAt(0)) >>> 0;
  return min + (h % (max - min + 1));
}

async function resetDatabase() {
  await prisma.$executeRaw`
    TRUNCATE TABLE
      reminders, messages, refill_subscriptions, h1_register, order_events, order_items, orders,
      prescription_access_logs, prescription_files, prescriptions, stock_imports, store_stock,
      addresses, patients, otp_codes, session, users, products, schedule_rules, stores
    CASCADE`;
}

async function main() {
  console.log('Resetting demo data…');
  await resetDatabase();

  // ── Stores ──
  const storeIdByCode = new Map<string, string>();
  for (const store of STORES) {
    const created = await prisma.store.create({ data: store });
    storeIdByCode.set(store.code, created.id);
  }
  const storeId = (code: string) => storeIdByCode.get(code)!;

  // ── Rules and catalog ──
  await prisma.scheduleRule.createMany({ data: SCHEDULE_RULES });

  const productBySku = new Map<string, { id: string; pricePaise: number }>();
  for (const p of PRODUCTS) {
    const created = await prisma.product.create({
      data: {
        sku: p.sku,
        name: p.name,
        molecule: p.molecule,
        strength: p.strength,
        form: p.form,
        packLabel: p.packLabel,
        packUnits: p.packUnits,
        pricePaise: p.priceRupees * 100,
        schedule: p.schedule,
        isGeneric: p.isGeneric ?? false,
        manufacturer: p.manufacturer,
        aliases: p.aliases ?? [],
      },
    });
    productBySku.set(p.sku, { id: created.id, pricePaise: created.pricePaise });
  }
  const product = (sku: string) => productBySku.get(sku)!;

  // ── Stock: this morning's count for each store (Dum Dum's is 3 days old = stale) ──
  const morningCount = todayAt7amIst();
  const stockRows: Prisma.StoreStockCreateManyInput[] = [];
  for (const store of STORES) {
    for (const p of PRODUCTS) {
      stockRows.push({
        storeId: storeId(store.code),
        productId: product(p.sku).id,
        onHand: stableNumber(`${store.code}:${p.sku}`, 6, 48),
        reserved: 0,
        countedAt: store.code === 'DMD' ? daysAgo(3) : morningCount,
      });
    }
  }
  // Salt Lake has only the 4 strips of Metformin 500 that are packed for RX-50211,
  // so a new Metformin order from Salt Lake is routed to another store (New Town).
  const slkMetformin = stockRows.find(
    (row) => row.storeId === storeId('SLK') && row.productId === product('MET500-S15').id,
  )!;
  slkMetformin.onHand = 4;
  slkMetformin.reserved = 4;
  await prisma.storeStock.createMany({ data: stockRows });

  // ── Staff ──
  const passwordHash = await hash(STAFF_DEMO_PASSWORD);
  const pharmacistIdByEmail = new Map<string, string>();
  for (const ph of PHARMACISTS) {
    const created = await prisma.user.create({
      data: {
        role: 'PHARMACIST',
        name: ph.name,
        email: ph.email,
        passwordHash,
        pharmacistRegNo: ph.regNo,
        storeId: storeId(ph.storeCode),
      },
    });
    pharmacistIdByEmail.set(ph.email, created.id);
  }
  await prisma.user.create({
    data: { role: 'OPS', name: OPS_USER.name, email: OPS_USER.email, passwordHash },
  });
  const sanjukta = pharmacistIdByEmail.get('sanjukta.roy@demo.example')!;
  const imran = pharmacistIdByEmail.get('imran.hossain@demo.example')!;

  // ── Customers, family profiles, addresses ──
  const customerId = new Map<string, string>();
  const patientId = new Map<string, string>();
  const addressOf = new Map<string, Prisma.InputJsonObject & { lat: number; lng: number }>();
  for (const c of CUSTOMERS) {
    const user = await prisma.user.create({
      data: {
        role: 'CUSTOMER',
        name: c.name,
        phone: c.phone,
        locale: c.locale,
        consentAt: c.onboarded ? daysAgo(40) : null,
        remindersOptIn: c.onboarded,
      },
    });
    customerId.set(c.key, user.id);

    for (const p of c.patients) {
      const patient = await prisma.patient.create({
        data: { accountId: user.id, fullName: p.fullName, relation: p.relation, birthYear: p.birthYear },
      });
      patientId.set(p.key, patient.id);
    }

    if (c.address) {
      const locality = findLocality(c.address.localityId)!;
      await prisma.address.create({
        data: {
          accountId: user.id,
          label: c.address.label,
          line1: c.address.line1,
          localityId: locality.id,
          pincode: c.address.pincode,
          lat: locality.lat,
          lng: locality.lng,
          isDefault: true,
        },
      });
      addressOf.set(c.key, {
        label: c.address.label,
        line1: c.address.line1,
        locality: locality.name,
        city: locality.city,
        pincode: c.address.pincode,
        lat: locality.lat,
        lng: locality.lng,
      });
    }
  }

  // ── The three sample orders from the brief ──

  // RX-50211 · Debasish Ghosh, for mother · Metformin 500 mg ×4 · H · Approved · Salt Lake · Packed
  {
    const debasish = customerId.get('debasish')!;
    const placedAt = minutesAgo(180);
    const verifiedAt = minutesAgo(173);
    const prescription = await prisma.prescription.create({
      data: {
        patientId: patientId.get('anjali')!,
        uploadedById: debasish,
        aiStatus: 'READY',
        aiStartedAt: placedAt,
        reviewStatus: 'VERIFIED',
        prescriberName: 'Dr. S. Banerjee',
        prescriberRegNo: 'DEMO-WB-48213',
        prescribedOn: new Date('2026-08-12'),
        patientNameOnRx: 'Anjali Ghosh',
        verifiedById: sanjukta,
        verifiedAt,
        createdAt: placedAt,
      },
    });
    const metformin = product('MET500-S15');
    const address = addressOf.get('debasish')!;
    // Created as ASSIGNED, then moved to PICKING and PACKED below: the database
    // dispatch gate refuses to create an order directly in a fulfilment state.
    const order = await prisma.order.create({
      data: {
        number: 'RX-50211',
        accountId: debasish,
        patientId: patientId.get('anjali')!,
        prescriptionId: prescription.id,
        status: 'ASSIGNED',
        version: 3,
        storeId: storeId('SLK'),
        previewStoreId: storeId('SLK'),
        deliveryAddress: address,
        deliveryLat: address.lat,
        deliveryLng: address.lng,
        paymentMethod: 'COD',
        paymentStatus: 'COD_PENDING',
        subtotalPaise: lineTotalPaise(metformin.pricePaise, 4),
        totalPaise: lineTotalPaise(metformin.pricePaise, 4),
        remindersOptIn: true,
        routingNote: 'Salt Lake store had all items in stock.',
        promisedBy: minutesAgo(-120),
        verifiedById: sanjukta,
        verifiedAt,
        placedAt,
        items: {
          create: {
            productId: metformin.id,
            quantity: 4,
            requestedProductId: metformin.id,
            requestedQuantity: 4,
            unitPricePaise: metformin.pricePaise,
            asWritten: 'Tab Glycora 500  1-0-1  x 1 month',
            doseMorning: 1,
            doseNoon: 0,
            doseNight: 1,
            durationDays: 30,
            approvedById: sanjukta,
            approvedAt: verifiedAt,
            approvedProductId: metformin.id,
            approvedQuantity: 4,
            approvedPrescriptionId: prescription.id,
          },
        },
        events: {
          create: [
            event(null, 'AWAITING_PHARMACIST', debasish, 'CUSTOMER', placedAt, 'Order placed'),
            event('AWAITING_PHARMACIST', 'APPROVED', sanjukta, 'PHARMACIST', verifiedAt, 'All items approved'),
            event('APPROVED', 'ASSIGNED', null, 'SYSTEM', verifiedAt, 'Routed to Salt Lake store'),
            event('ASSIGNED', 'PICKING', sanjukta, 'PHARMACIST', minutesAgo(120)),
            event('PICKING', 'PACKED', sanjukta, 'PHARMACIST', minutesAgo(100), 'Invoice SLK/26/1042'),
          ],
        },
      },
    });
    await prisma.order.update({ where: { id: order.id }, data: { status: 'PICKING', version: 4 } });
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'PACKED', invoiceNo: 'SLK/26/1042', version: 5 },
    });
  }

  // RX-50214 · Rina Sen · Telmisartan 40 mg ×3 · H · Pending · Behala (preview) · Awaiting pharmacist
  {
    const rina = customerId.get('rina')!;
    const placedAt = minutesAgo(7);
    const prescription = await prisma.prescription.create({
      data: {
        patientId: patientId.get('rina-self')!,
        uploadedById: rina,
        aiStatus: 'READY',
        aiStartedAt: placedAt,
        reviewStatus: 'PENDING',
        createdAt: placedAt,
      },
    });
    const telmisartan = product('TEL40-S10');
    const address = addressOf.get('rina')!;
    await prisma.order.create({
      data: {
        number: 'RX-50214',
        accountId: rina,
        patientId: patientId.get('rina-self')!,
        prescriptionId: prescription.id,
        status: 'AWAITING_PHARMACIST',
        previewStoreId: storeId('BHL'),
        deliveryAddress: address,
        deliveryLat: address.lat,
        deliveryLng: address.lng,
        paymentMethod: 'COD',
        paymentStatus: 'NOT_DUE',
        subtotalPaise: lineTotalPaise(telmisartan.pricePaise, 3),
        totalPaise: lineTotalPaise(telmisartan.pricePaise, 3),
        remindersOptIn: true,
        placedAt,
        items: {
          create: {
            productId: telmisartan.id,
            quantity: 3,
            requestedProductId: telmisartan.id,
            requestedQuantity: 3,
            unitPricePaise: telmisartan.pricePaise,
            asWritten: 'Tab Telmora 40  1-0-0  x 30 days',
          },
        },
        events: {
          create: [event(null, 'AWAITING_PHARMACIST', rina, 'CUSTOMER', placedAt, 'Order placed')],
        },
      },
    });
  }

  // RX-50219 · Arif Mondal · Levothyroxine 50 mcg ×1 · H · Re-upload asked · Howrah Maidan (preview) · On hold
  {
    const arif = customerId.get('arif')!;
    const placedAt = minutesAgo(95);
    const askedAt = minutesAgo(88);
    const prescription = await prisma.prescription.create({
      data: {
        patientId: patientId.get('arif-self')!,
        uploadedById: arif,
        aiStatus: 'UNREADABLE',
        aiStartedAt: placedAt,
        reviewStatus: 'REUPLOAD_ASKED',
        createdAt: placedAt,
      },
    });
    const levothyroxine = product('LEV50-B100');
    const address = addressOf.get('arif')!;
    const order = await prisma.order.create({
      data: {
        number: 'RX-50219',
        accountId: arif,
        patientId: patientId.get('arif-self')!,
        prescriptionId: prescription.id,
        status: 'ON_HOLD_REUPLOAD',
        version: 2,
        previewStoreId: storeId('HWM'),
        deliveryAddress: address,
        deliveryLat: address.lat,
        deliveryLng: address.lng,
        paymentMethod: 'COD',
        paymentStatus: 'NOT_DUE',
        subtotalPaise: lineTotalPaise(levothyroxine.pricePaise, 1),
        totalPaise: lineTotalPaise(levothyroxine.pricePaise, 1),
        remindersOptIn: true,
        reuploadReason: 'BLURRY',
        placedAt,
        items: {
          create: {
            productId: levothyroxine.id,
            quantity: 1,
            requestedProductId: levothyroxine.id,
            requestedQuantity: 1,
            unitPricePaise: levothyroxine.pricePaise,
          },
        },
        events: {
          create: [
            event(null, 'AWAITING_PHARMACIST', arif, 'CUSTOMER', placedAt, 'Order placed'),
            event(
              'AWAITING_PHARMACIST',
              'ON_HOLD_REUPLOAD',
              imran,
              'PHARMACIST',
              askedAt,
              'The photo is blurry. Asked for a clearer photo.',
            ),
          ],
        },
      },
    });
    await prisma.message.create({
      data: {
        accountId: arif,
        channel: 'SMS',
        orderId: order.id,
        body: 'Nirantar (test): We need a clearer photo of your prescription for order RX-50219. Please open the app to upload it again.',
        createdAt: askedAt,
      },
    });
  }

  // ── Refill subscriptions (pharmacist-confirmed dose; run-out dates relative to today) ──
  // Each one would normally come from a delivered order; the full delivered
  // history is added in seed v2. Different cases are covered on purpose:
  // due soon, reorder already in progress, runs out today, prescription expired.
  const today = todayIst(now);
  const verifiedRx = async (patientKey: string, accountKey: string, prescribedOn: string, prescriber: string) =>
    prisma.prescription.create({
      data: {
        patientId: patientId.get(patientKey)!,
        uploadedById: customerId.get(accountKey)!,
        aiStatus: 'READY',
        reviewStatus: 'VERIFIED',
        prescriberName: prescriber,
        prescriberRegNo: 'DEMO-WB-' + stableNumber(prescriber, 10000, 99999),
        prescribedOn: new Date(prescribedOn),
        verifiedById: sanjukta,
        verifiedAt: daysAgo(30),
        createdAt: daysAgo(31),
      },
    });

  const anjaliRx = await prisma.prescription.findFirstOrThrow({
    where: { patientId: patientId.get('anjali')!, reviewStatus: 'VERIFIED' },
  });
  const debasishRx = await verifiedRx('debasish-self', 'debasish', '2026-07-20', 'Dr. A. Mukherjee');
  const rinaOldRx = await verifiedRx('rina-self', 'rina', '2026-04-02', 'Dr. P. Sarkar');
  const haripadaRx = await verifiedRx('haripada', 'sudipta', '2026-05-15', 'Dr. R. Basu');
  const farhanaRx = await verifiedRx('farhana-self', 'farhana', '2026-03-01', 'Dr. N. Islam');

  const subscriptions: {
    account: string;
    patient: string;
    sku: string;
    dailyUnits: number;
    /** Days the last fill lasts: units dispensed ÷ daily units. */
    daysSupply: number;
    daysLeft: number;
    prescriptionId: string;
  }[] = [
    // Reorder already in progress: RX-50211 is this refill (4 strips × 15 at 1-0-1 = 30 days).
    { account: 'debasish', patient: 'anjali', sku: 'MET500-S15', dailyUnits: 2, daysSupply: 30, daysLeft: 5, prescriptionId: anjaliRx.id },
    // Due soon, nothing ordered yet: shows the Reorder button (3 strips × 10 at 1 a day).
    { account: 'debasish', patient: 'debasish-self', sku: 'AML5-S10', dailyUnits: 1, daysSupply: 30, daysLeft: 4, prescriptionId: debasishRx.id },
    // Not due yet: a quiet row (bottle of 100 at 1 a day).
    { account: 'debasish', patient: 'anjali', sku: 'LEV25-B100', dailyUnits: 1, daysSupply: 100, daysLeft: 19, prescriptionId: anjaliRx.id },
    // Rina's new order RX-50214 is in progress; her old prescription has expired under the policy.
    { account: 'rina', patient: 'rina-self', sku: 'TEL40-S10', dailyUnits: 1, daysSupply: 30, daysLeft: 2, prescriptionId: rinaOldRx.id },
    // Runs out today.
    { account: 'sudipta', patient: 'haripada', sku: 'ATV10-S10', dailyUnits: 1, daysSupply: 30, daysLeft: 0, prescriptionId: haripadaRx.id },
    // Ran out yesterday and the prescription has expired: needs a new upload.
    { account: 'farhana', patient: 'farhana-self', sku: 'GLM2-S10', dailyUnits: 1, daysSupply: 30, daysLeft: -1, prescriptionId: farhanaRx.id },
  ];
  for (const sub of subscriptions) {
    await prisma.refillSubscription.create({
      data: {
        accountId: customerId.get(sub.account)!,
        patientId: patientId.get(sub.patient)!,
        productId: product(sub.sku).id,
        prescriptionId: sub.prescriptionId,
        dailyUnits: sub.dailyUnits,
        daysSupply: sub.daysSupply,
        runOutOn: addDays(today, sub.daysLeft),
        confirmedById: sanjukta,
      },
    });
  }

  const counts = {
    stores: await prisma.store.count(),
    products: await prisma.product.count(),
    users: await prisma.user.count(),
    patients: await prisma.patient.count(),
    orders: await prisma.order.count(),
    refills: await prisma.refillSubscription.count(),
  };
  console.log('Seed complete:', counts);
}

function event(
  fromStatus: OrderStatus | null,
  toStatus: OrderStatus,
  actorId: string | null,
  actorRole: 'CUSTOMER' | 'PHARMACIST' | 'OPS' | 'SYSTEM',
  at: Date,
  note?: string,
) {
  return { fromStatus, toStatus, actorId, actorRole, at, note };
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
