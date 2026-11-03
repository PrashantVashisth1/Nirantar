/**
 * Stock import, routing and reminders against the real database
 * (plan tests T8–T11, T13, T14).
 */
import { addDays, dateOnly, todayIst } from '@nirantar/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/db';
import { applyStockImport, previewStockImport } from '../src/services/inventory/stock-import.service';
import { runReminders } from '../src/services/refills/reminder.service';
import { routeOrder } from '../src/services/routing/routing.service';
import { createCustomer, createOrder, createPharmacist, createProduct, createStore, resetDb } from './helpers/factory';

beforeEach(resetDb);

async function storeAt(code: string, lat: number, lng: number) {
  const store = await createStore(code);
  return prisma.store.update({ where: { id: store.id }, data: { lat, lng } });
}

async function stock(storeId: string, productId: string, onHand: number, reserved = 0) {
  await prisma.storeStock.create({ data: { storeId, productId, onHand, reserved, countedAt: new Date() } });
}

/** An APPROVED order delivered at (22.586, 88.406), which is where the factory puts it. */
async function approvedOrder(items: { productId: string; quantity?: number }[]) {
  const customer = await createCustomer();
  return createOrder({ customer, status: 'APPROVED', items });
}

describe('routing to the nearest store with every item (T11)', () => {
  it('skips the nearest store when it lacks one item and uses the next one', async () => {
    const near = await storeAt('NEAR', 22.586, 88.406);
    const far = await storeAt('FAR', 22.58, 88.46); // ~5.6 km
    const a = await createProduct('H');
    const b = await createProduct('H');
    await stock(near.id, a.id, 10);
    await stock(near.id, b.id, 0); // near has A but not B
    await stock(far.id, a.id, 10);
    await stock(far.id, b.id, 10);
    const order = await approvedOrder([{ productId: a.id, quantity: 2 }, { productId: b.id, quantity: 1 }]);

    const result = await routeOrder(order.id);

    expect(result).toMatchObject({ outcome: 'ASSIGNED', storeId: far.id });
    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.status).toBe('ASSIGNED');
    expect(await prisma.storeStock.findMany({ where: { storeId: far.id }, orderBy: { productId: 'asc' } })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ productId: a.id, reserved: 2 }),
        expect.objectContaining({ productId: b.id, reserved: 1 }),
      ]),
    );
    // Nothing was reserved at the store that couldn't take the whole order.
    expect((await prisma.storeStock.findFirstOrThrow({ where: { storeId: near.id, productId: a.id } })).reserved).toBe(0);
  });

  it('waits for stock when no store within range has everything, with a reason', async () => {
    const store = await storeAt('ONLY', 22.586, 88.406);
    const a = await createProduct('H', { name: 'Telmora 40' });
    await stock(store.id, a.id, 1);
    const order = await approvedOrder([{ productId: a.id, quantity: 3 }]);

    const result = await routeOrder(order.id);

    expect(result.outcome).toBe('AWAITING_STOCK');
    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.status).toBe('AWAITING_STOCK');
    expect(after.routingNote).toMatch(/not enough Telmora 40/);
  });

  it('ignores stores farther than the delivery radius and stores with a stale stock count', async () => {
    const tooFar = await storeAt('FARAWAY', 23.5, 88.4); // ~100 km
    const stale = await storeAt('STALE', 22.586, 88.406);
    const a = await createProduct('H');
    await stock(tooFar.id, a.id, 50);
    await prisma.storeStock.create({
      data: { storeId: stale.id, productId: a.id, onHand: 50, countedAt: new Date(Date.now() - 72 * 3600_000) },
    });
    const order = await approvedOrder([{ productId: a.id }]);

    expect((await routeOrder(order.id)).outcome).toBe('AWAITING_STOCK');
  });
});

describe('concurrent orders cannot oversell (T8)', () => {
  it('gives the last strip to exactly one of 20 orders racing for it', async () => {
    const store = await storeAt('ONE', 22.586, 88.406);
    const product = await createProduct('H');
    await stock(store.id, product.id, 1);
    const orders = [];
    for (let i = 0; i < 20; i++) orders.push(await approvedOrder([{ productId: product.id, quantity: 1 }]));

    const results = await Promise.all(orders.map((o) => routeOrder(o.id)));

    expect(results.filter((r) => r.outcome === 'ASSIGNED')).toHaveLength(1);
    expect(results.filter((r) => r.outcome === 'AWAITING_STOCK')).toHaveLength(19);
    const row = await prisma.storeStock.findFirstOrThrow({ where: { storeId: store.id } });
    expect(row.reserved).toBe(1);
    expect(row.reserved).toBeLessThanOrEqual(row.onHand);
  });
});

describe('stock CSV import (T9, T10)', () => {
  async function setup() {
    const store = await createStore('SLK');
    const ops = await prisma.user.create({ data: { role: 'OPS', name: 'Ops', email: 'ops@t.example', passwordHash: 'x' } });
    const a = await prisma.product.update({ where: { id: (await createProduct('H')).id }, data: { sku: 'AAA-1' } });
    const b = await prisma.product.update({ where: { id: (await createProduct('H')).id }, data: { sku: 'BBB-1' } });
    await stock(store.id, a.id, 5, 2); // 2 packs reserved for an assigned order
    await stock(store.id, b.id, 7);
    return { store, ops, a, b };
  }

  it('refuses to apply a file with any bad row, and changes nothing', async () => {
    const { store, ops } = await setup();
    const preview = await previewStockImport('bad.csv', 'store_code,sku,on_hand\nSLK,AAA-1,40\nSLK,NOPE,3\n', ops.id);
    expect(preview.errorCount).toBe(1);

    await expect(applyStockImport(preview.id)).rejects.toMatchObject({ code: 'IMPORT_HAS_ERRORS' });
    const rows = await prisma.storeStock.findMany({ where: { storeId: store.id } });
    expect(rows.map((r) => r.onHand).sort()).toEqual([5, 7]);
  });

  it('replaces on_hand, keeps reserved, zeroes SKUs missing from the file, and refuses the same file twice', async () => {
    const { store, ops, a, b } = await setup();
    const content = 'store_code,sku,on_hand\nSLK,AAA-1,40\n';
    const preview = await previewStockImport('good.csv', content, ops.id);
    expect(preview.errorCount).toBe(0);

    await applyStockImport(preview.id);

    const aRow = await prisma.storeStock.findUniqueOrThrow({ where: { storeId_productId: { storeId: store.id, productId: a.id } } });
    const bRow = await prisma.storeStock.findUniqueOrThrow({ where: { storeId_productId: { storeId: store.id, productId: b.id } } });
    expect(aRow).toMatchObject({ onHand: 40, reserved: 2 });
    expect(bRow.onHand).toBe(0);
    await expect(previewStockImport('again.csv', content, ops.id)).rejects.toMatchObject({ code: 'FILE_ALREADY_APPLIED' });
  });

  it('routes waiting orders once new stock arrives', async () => {
    const { store, ops, a } = await setup();
    const order = await approvedOrder([{ productId: a.id, quantity: 10 }]);
    expect((await routeOrder(order.id)).outcome).toBe('AWAITING_STOCK');

    const preview = await previewStockImport('morning.csv', 'store_code,sku,on_hand\nSLK,AAA-1,30\n', ops.id);
    const result = await applyStockImport(preview.id);

    expect(result.routedOrders).toBe(1);
    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after).toMatchObject({ status: 'ASSIGNED', storeId: store.id });
  });
});

describe('refill reminders (T13, T14)', () => {
  async function subscription(daysLeft: number) {
    const store = await createStore();
    const pharmacist = await createPharmacist(store.id);
    const customer = await createCustomer();
    await prisma.user.update({ where: { id: customer.user.id }, data: { remindersOptIn: true } });
    const product = await createProduct('H', { molecule: 'Metformin' });
    const prescription = await prisma.prescription.create({
      data: { patientId: customer.patient.id, uploadedById: customer.user.id, reviewStatus: 'VERIFIED', prescribedOn: todayIst() },
    });
    const sub = await prisma.refillSubscription.create({
      data: {
        accountId: customer.user.id,
        patientId: customer.patient.id,
        productId: product.id,
        prescriptionId: prescription.id,
        dailyUnits: 2,
        daysSupply: 30,
        runOutOn: addDays(todayIst(), daysLeft),
        confirmedById: pharmacist.id,
      },
    });
    return { customer, product, sub };
  }

  it('sends one message per due reminder, however many times the job runs', async () => {
    const { customer } = await subscription(5);
    const first = await runReminders();
    const second = await runReminders();

    expect(first.sent).toBe(1);
    expect(second.sent).toBe(0);
    const messages = await prisma.message.findMany({ where: { accountId: customer.user.id } });
    expect(messages).toHaveLength(1);
    expect(messages[0]!.body).toMatch(/Metformin 10 mg may run out around/);
    expect(messages[0]!.body).not.toMatch(/take|tablet a day/i); // no dosing advice
  });

  it('stays quiet while an order for that medicine is already in progress', async () => {
    const { customer, product } = await subscription(2);
    await createOrder({ customer, status: 'AWAITING_PHARMACIST', items: [{ productId: product.id }] });

    const result = await runReminders();

    expect(result).toMatchObject({ sent: 0, suppressed: 1 });
    expect(await prisma.message.count()).toBe(0);
  });

  it('sends only the latest due reminder after a gap, never a burst', async () => {
    const { sub } = await subscription(0);
    const result = await runReminders();

    expect(result.sent).toBe(1);
    const decided = await prisma.reminder.findMany({ where: { subscriptionId: sub.id }, orderBy: { offsetDays: 'asc' } });
    expect(decided.map((r) => [r.offsetDays, r.status])).toEqual([
      [0, 'SENT'],
      [2, 'SKIPPED'],
      [5, 'SKIPPED'],
    ]);
  });

  it('does nothing before the first reminder is due', async () => {
    await subscription(12);
    expect((await runReminders()).sent).toBe(0);
    expect(await runReminders(dateOnly(addDays(todayIst(), 7).toISOString().slice(0, 10)))).toMatchObject({ sent: 1 });
  });
});
