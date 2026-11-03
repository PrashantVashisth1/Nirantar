/**
 * Small builders for integration tests. Each test creates exactly the data it
 * needs, so tests are independent and easy to read.
 */
import { randomUUID } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { prisma } from '../../src/lib/db';
import type { ProductForm, Schedule } from '../../src/generated/prisma/client';

export async function resetDb() {
  await prisma.$executeRaw`
    TRUNCATE TABLE
      reminders, messages, refill_subscriptions, h1_register, order_events, order_items, orders,
      prescription_access_logs, prescription_files, prescriptions, stock_imports, store_stock,
      addresses, patients, otp_codes, session, users, products, schedule_rules, stores
    CASCADE`;
  await prisma.scheduleRule.createMany({
    data: [
      { schedule: 'OTC', rxRequired: false, registerRequired: false, label: 'OTC' },
      { schedule: 'H', rxRequired: true, registerRequired: false, label: 'H' },
      { schedule: 'H1', rxRequired: true, registerRequired: true, label: 'H1' },
    ],
  });
}

const short = () => randomUUID().slice(0, 8);

export function createStore(code = `S${short()}`) {
  return prisma.store.create({
    data: { code, name: `Store ${code}`, localityId: 'salt-lake-2', lat: 22.586, lng: 88.406 },
  });
}

export function createProduct(
  schedule: Schedule,
  overrides: Partial<{ name: string; molecule: string; isGeneric: boolean; form: ProductForm; pricePaise: number }> = {},
) {
  return prisma.product.create({
    data: {
      sku: `SKU-${short()}`,
      name: overrides.name ?? `Test ${schedule} product`,
      molecule: overrides.molecule ?? 'Testmolecule',
      strength: '10 mg',
      form: overrides.form ?? 'TABLET',
      packLabel: 'Strip of 10',
      packUnits: 10,
      pricePaise: overrides.pricePaise ?? 10000,
      schedule,
      isGeneric: overrides.isGeneric ?? false,
      manufacturer: 'Test Labs',
    },
  });
}

export async function createPharmacist(storeId: string, overrides: Partial<{ email: string; isActive: boolean }> = {}) {
  return prisma.user.create({
    data: {
      role: 'PHARMACIST',
      name: 'Test Pharmacist',
      email: overrides.email ?? `ph-${short()}@test.example`,
      passwordHash: await hash('correct-horse-battery'),
      pharmacistRegNo: `TEST-${short()}`,
      storeId,
      isActive: overrides.isActive ?? true,
    },
  });
}

export async function createStaff(role: 'OPS', password = 'correct-horse-battery') {
  return prisma.user.create({
    data: { role, name: 'Test Ops', email: `ops-${short()}@test.example`, passwordHash: await hash(password) },
  });
}

/** A customer with one patient (themselves) and an onboarded account. */
export async function createCustomer(phone = `+9190000${Math.floor(10000 + Math.random() * 89999)}`) {
  const user = await prisma.user.create({
    data: { role: 'CUSTOMER', name: 'Test Customer', phone, consentAt: new Date() },
  });
  const patient = await prisma.patient.create({
    data: { accountId: user.id, fullName: 'Test Customer', relation: 'SELF', birthYear: 1980 },
  });
  return { user, patient };
}

interface ItemSpec {
  productId: string;
  quantity?: number;
  /** Pharmacist who approved this item (approval fields are filled in to match). */
  approvedBy?: string;
}

/**
 * An order with items, in a given status (not a fulfilment status: the
 * database refuses to create those directly).
 */
export async function createOrder(opts: {
  customer: { user: { id: string }; patient: { id: string } };
  storeId?: string;
  items: ItemSpec[];
  prescriptionVerified?: boolean;
  status?: 'AWAITING_PHARMACIST' | 'APPROVED' | 'ASSIGNED';
  paymentMethod?: 'COD' | 'UPI_TEST';
}) {
  const prescription = await prisma.prescription.create({
    data: {
      patientId: opts.customer.patient.id,
      uploadedById: opts.customer.user.id,
      aiStatus: 'READY',
      reviewStatus: opts.prescriptionVerified === false ? 'PENDING' : 'VERIFIED',
      prescriberName: 'Dr Test',
      prescriberRegNo: 'TEST-DR-1',
      prescribedOn: new Date('2026-10-01'),
    },
  });
  const status = opts.status ?? 'ASSIGNED';
  return prisma.order.create({
    data: {
      number: `RX-T${short()}`,
      accountId: opts.customer.user.id,
      patientId: opts.customer.patient.id,
      prescriptionId: prescription.id,
      status,
      storeId: opts.storeId,
      deliveryAddress: { line1: 'Test address' },
      deliveryLat: 22.586,
      deliveryLng: 88.406,
      paymentMethod: opts.paymentMethod ?? 'COD',
      subtotalPaise: 10000,
      totalPaise: 10000,
      items: {
        create: opts.items.map((item) => {
          const quantity = item.quantity ?? 1;
          return {
            productId: item.productId,
            quantity,
            requestedProductId: item.productId,
            requestedQuantity: quantity,
            unitPricePaise: 10000,
            ...(item.approvedBy
              ? {
                  approvedById: item.approvedBy,
                  approvedAt: new Date(),
                  approvedProductId: item.productId,
                  approvedQuantity: quantity,
                  approvedPrescriptionId: prescription.id,
                }
              : {}),
          };
        }),
      },
    },
    include: { items: true },
  });
}
