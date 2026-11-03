/**
 * The brief's "hard part": the database itself refuses unsafe dispatch.
 * Most tests use RAW SQL on purpose, to prove the rule holds even if the
 * application code is bypassed or has a bug (plan §6.2, tests T3–T7, T16).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/db';
import {
  createCustomer,
  createOrder,
  createPharmacist,
  createProduct,
  createStore,
  resetDb,
} from './helpers/factory';

/** Moves an order to a new status with raw SQL, bypassing every service check. */
function setStatusRaw(orderId: string, status: string) {
  return prisma.$executeRaw`UPDATE orders SET status = ${status}::"OrderStatus" WHERE id = ${orderId}::uuid`;
}

async function setup() {
  const store = await createStore();
  const pharmacist = await createPharmacist(store.id);
  const customer = await createCustomer();
  return { store, pharmacist, customer };
}

beforeEach(async () => {
  await resetDb();
});

describe('dispatch gate: every item needs a pharmacist approval (T3, T4)', () => {
  it('blocks picking when a Schedule H item is not approved', async () => {
    const { store, customer } = await setup();
    const h = await createProduct('H');
    const order = await createOrder({ customer, storeId: store.id, items: [{ productId: h.id }] });

    await expect(setStatusRaw(order.id, 'PICKING')).rejects.toThrow(/NIRANTAR:DISPATCH_BLOCKED/);
  });

  it('blocks picking when an OTC item is not approved (every item, not only H/H1)', async () => {
    const { store, pharmacist, customer } = await setup();
    const h = await createProduct('H');
    const otc = await createProduct('OTC');
    const order = await createOrder({
      customer,
      storeId: store.id,
      items: [{ productId: h.id, approvedBy: pharmacist.id }, { productId: otc.id }],
    });

    await expect(setStatusRaw(order.id, 'PICKING')).rejects.toThrow(/NIRANTAR:DISPATCH_BLOCKED/);
  });

  it('allows picking once a pharmacist has approved every item', async () => {
    const { store, pharmacist, customer } = await setup();
    const h = await createProduct('H');
    const otc = await createProduct('OTC');
    const order = await createOrder({
      customer,
      storeId: store.id,
      items: [
        { productId: h.id, approvedBy: pharmacist.id },
        { productId: otc.id, approvedBy: pharmacist.id },
      ],
    });

    await setStatusRaw(order.id, 'PICKING');
    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.status).toBe('PICKING');
  });

  it('rejects approvals written by someone who is not a pharmacist', async () => {
    const { store, customer } = await setup();
    const h = await createProduct('H');
    // The "approver" is the customer themselves.
    const order = await createOrder({
      customer,
      storeId: store.id,
      items: [{ productId: h.id, approvedBy: customer.user.id }],
    });

    await expect(setStatusRaw(order.id, 'PICKING')).rejects.toThrow(/not approved by an active registered pharmacist/);
  });

  it('rejects approvals by a pharmacist who has since been deactivated', async () => {
    const { store, pharmacist, customer } = await setup();
    const h = await createProduct('H');
    const order = await createOrder({ customer, storeId: store.id, items: [{ productId: h.id, approvedBy: pharmacist.id }] });
    await prisma.user.update({ where: { id: pharmacist.id }, data: { isActive: false } });

    await expect(setStatusRaw(order.id, 'PICKING')).rejects.toThrow(/NIRANTAR:DISPATCH_BLOCKED/);
  });

  it('blocks picking while the prescription is not verified', async () => {
    const { store, pharmacist, customer } = await setup();
    const h = await createProduct('H');
    const order = await createOrder({
      customer,
      storeId: store.id,
      prescriptionVerified: false,
      items: [{ productId: h.id, approvedBy: pharmacist.id }],
    });

    await expect(setStatusRaw(order.id, 'PICKING')).rejects.toThrow(/verified prescription/);
  });

  it('refuses to create an order directly in a fulfilment state', async () => {
    const { store, customer } = await setup();
    await expect(
      prisma.$executeRaw`
        INSERT INTO orders (id, number, account_id, patient_id, status, store_id, delivery_address,
                            delivery_lat, delivery_lng, subtotal_paise, total_paise, updated_at)
        VALUES (gen_random_uuid(), 'RX-HACK', ${customer.user.id}::uuid, ${customer.patient.id}::uuid,
                'PACKED', ${store.id}::uuid, '{}'::jsonb, 22.5, 88.4, 0, 0, now())`,
    ).rejects.toThrow(/NIRANTAR:DISPATCH_BLOCKED/);
  });
});

describe('editing after approval invalidates it (T5)', () => {
  it('blocks picking when the quantity changed after approval', async () => {
    const { store, pharmacist, customer } = await setup();
    const h = await createProduct('H');
    const order = await createOrder({ customer, storeId: store.id, items: [{ productId: h.id, quantity: 2, approvedBy: pharmacist.id }] });

    await prisma.$executeRaw`UPDATE order_items SET quantity = 5 WHERE id = ${order.items[0]!.id}::uuid`;

    await expect(setStatusRaw(order.id, 'PICKING')).rejects.toThrow(/quantity changed after approval/);
  });

  it('blocks picking when the product was swapped after approval', async () => {
    const { store, pharmacist, customer } = await setup();
    const h = await createProduct('H');
    const other = await createProduct('H', { name: 'Something else' });
    const order = await createOrder({ customer, storeId: store.id, items: [{ productId: h.id, approvedBy: pharmacist.id }] });

    await prisma.$executeRaw`UPDATE order_items SET product_id = ${other.id}::uuid WHERE id = ${order.items[0]!.id}::uuid`;

    await expect(setStatusRaw(order.id, 'PICKING')).rejects.toThrow(/not the product the pharmacist approved/);
  });

  it('blocks picking when the order now points at a different prescription', async () => {
    const { store, pharmacist, customer } = await setup();
    const h = await createProduct('H');
    const order = await createOrder({ customer, storeId: store.id, items: [{ productId: h.id, approvedBy: pharmacist.id }] });
    const otherRx = await prisma.prescription.create({
      data: { patientId: customer.patient.id, uploadedById: customer.user.id, reviewStatus: 'VERIFIED' },
    });

    await prisma.order.update({ where: { id: order.id }, data: { prescriptionId: otherRx.id } });

    await expect(setStatusRaw(order.id, 'PICKING')).rejects.toThrow(/different prescription/);
  });
});

describe('generic substitution needs pharmacist approval and customer consent (T16)', () => {
  async function orderWithGenericOffer() {
    const { store, pharmacist, customer } = await setup();
    const brand = await createProduct('H', { molecule: 'Telmisartan' });
    const generic = await createProduct('H', { molecule: 'Telmisartan', isGeneric: true });
    const order = await createOrder({ customer, storeId: store.id, items: [{ productId: brand.id, approvedBy: pharmacist.id }] });
    const itemId = order.items[0]!.id;
    await prisma.orderItem.update({ where: { id: itemId }, data: { approvedGenericProductId: generic.id } });
    return { order, itemId, generic };
  }

  it('blocks a switch to the generic without recorded consent', async () => {
    const { order, itemId, generic } = await orderWithGenericOffer();
    await prisma.$executeRaw`UPDATE order_items SET product_id = ${generic.id}::uuid WHERE id = ${itemId}::uuid`;

    await expect(setStatusRaw(order.id, 'PICKING')).rejects.toThrow(/consented to the generic/);
  });

  it('allows the approved generic once the customer chose it and consent is recorded', async () => {
    const { order, itemId, generic } = await orderWithGenericOffer();
    await prisma.orderItem.update({
      where: { id: itemId },
      data: { productId: generic.id, customerChoice: 'SWITCH', consentAt: new Date() },
    });

    await setStatusRaw(order.id, 'PICKING');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('PICKING');
  });

  it('still allows the original product when the customer keeps it', async () => {
    const { order, itemId } = await orderWithGenericOffer();
    await prisma.orderItem.update({ where: { id: itemId }, data: { customerChoice: 'KEEP', consentAt: new Date() } });

    await setStatusRaw(order.id, 'PICKING');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('PICKING');
  });
});

describe('Schedule X and narcotics are never sold online (T6)', () => {
  it('rejects adding a Schedule X item, even with raw SQL', async () => {
    const { customer } = await setup();
    const h = await createProduct('H');
    const x = await createProduct('X');
    const order = await createOrder({ customer, status: 'AWAITING_PHARMACIST', items: [{ productId: h.id }] });

    await expect(
      prisma.$executeRaw`
        INSERT INTO order_items (id, order_id, product_id, quantity, requested_product_id, requested_quantity, unit_price_paise)
        VALUES (gen_random_uuid(), ${order.id}::uuid, ${x.id}::uuid, 1, ${x.id}::uuid, 1, 100)`,
    ).rejects.toThrow(/NIRANTAR:SCHEDULE_NOT_SOLD_ONLINE/);
  });

  it('rejects changing an existing item into a narcotic (NDPS) product', async () => {
    const { customer } = await setup();
    const h = await createProduct('H');
    const ndps = await createProduct('NDPS');
    const order = await createOrder({ customer, status: 'AWAITING_PHARMACIST', items: [{ productId: h.id }] });

    await expect(
      prisma.orderItem.update({ where: { id: order.items[0]!.id }, data: { productId: ndps.id } }),
    ).rejects.toThrow(/NIRANTAR:SCHEDULE_NOT_SOLD_ONLINE/);
  });

  it('does not let the configurable rules table hold a rule for Schedule X', async () => {
    await expect(
      prisma.$executeRaw`INSERT INTO schedule_rules (schedule, rx_required, register_required, label, updated_at)
                         VALUES ('X', false, false, 'hack', now())`,
    ).rejects.toThrow(/schedule_rules_only_configurable/);
  });
});

describe('fulfilment steps (T7)', () => {
  async function packedOrder(opts: { schedule: 'H' | 'H1'; paymentMethod?: 'COD' | 'UPI_TEST' }) {
    const { store, pharmacist, customer } = await setup();
    const product = await createProduct(opts.schedule);
    const order = await createOrder({
      customer,
      storeId: store.id,
      paymentMethod: opts.paymentMethod,
      items: [{ productId: product.id, approvedBy: pharmacist.id }],
    });
    await setStatusRaw(order.id, 'PICKING');
    await prisma.order.update({ where: { id: order.id }, data: { status: 'PACKED', invoiceNo: 'INV-1' } });
    return { order, store, pharmacist, product };
  }

  it('requires the store invoice number to mark an order packed', async () => {
    const { store, pharmacist, customer } = await setup();
    const h = await createProduct('H');
    const order = await createOrder({ customer, storeId: store.id, items: [{ productId: h.id, approvedBy: pharmacist.id }] });
    await setStatusRaw(order.id, 'PICKING');

    await expect(setStatusRaw(order.id, 'PACKED')).rejects.toThrow(/orders_invoice_when_packed/);
  });

  it('blocks handover of an H1 item until its register entry exists', async () => {
    const { order } = await packedOrder({ schedule: 'H1' });
    await expect(setStatusRaw(order.id, 'OUT_FOR_DELIVERY')).rejects.toThrow(/NIRANTAR:REGISTER_MISSING/);
  });

  it('allows handover of an H1 item with prescriber and patient details in the register', async () => {
    const { order, store, pharmacist, product } = await packedOrder({ schedule: 'H1' });
    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
    await prisma.$transaction([
      prisma.h1RegisterEntry.create({
        data: {
          orderItemId: item.id,
          orderId: order.id,
          productId: product.id,
          quantity: item.quantity,
          patientName: 'Test Customer',
          patientAddress: 'Test address',
          prescriberName: 'Dr Test',
          prescriberRegNo: 'TEST-DR-1',
          pharmacistId: pharmacist.id,
          storeId: store.id,
        },
      }),
      prisma.order.update({ where: { id: order.id }, data: { status: 'OUT_FOR_DELIVERY', riderName: 'Ravi' } }),
    ]);

    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('OUT_FOR_DELIVERY');
  });

  it('blocks handover of a UPI order that has not been paid', async () => {
    const { order } = await packedOrder({ schedule: 'H', paymentMethod: 'UPI_TEST' });
    await expect(setStatusRaw(order.id, 'OUT_FOR_DELIVERY')).rejects.toThrow(/orders_paid_before_handover/);
  });

  it('allows handover of a cash-on-delivery order', async () => {
    const { order } = await packedOrder({ schedule: 'H', paymentMethod: 'COD' });
    await setStatusRaw(order.id, 'OUT_FOR_DELIVERY');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('OUT_FOR_DELIVERY');
  });
});
