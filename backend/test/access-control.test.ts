/**
 * Roles and ownership (plan tests T1, T2): a customer only ever sees their own
 * records, and staff endpoints are closed to customers.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import {
  createCustomer,
  createOrder,
  createPharmacist,
  createProduct,
  createStore,
  resetDb,
} from './helpers/factory';
import { randomPhone, signInCustomer, signInStaff } from './helpers/auth';

const app = createApp();

async function twoCustomersWithOrders() {
  const product = await createProduct('H');
  const alice = await createCustomer(randomPhone());
  const bob = await createCustomer(randomPhone());
  const aliceOrder = await createOrder({ customer: alice, status: 'AWAITING_PHARMACIST', items: [{ productId: product.id }] });
  const bobOrder = await createOrder({ customer: bob, status: 'AWAITING_PHARMACIST', items: [{ productId: product.id }] });
  return { alice, bob, aliceOrder, bobOrder };
}

beforeEach(async () => {
  await resetDb();
});

describe("customers can't see each other's data (T1)", () => {
  it("answers 404 for another customer's order, with no order data in the body", async () => {
    const { bob, aliceOrder } = await twoCustomersWithOrders();
    const bobAgent = await signInCustomer(app, bob.user.phone!);

    const res = await bobAgent.get(`/api/orders/${aliceOrder.id}`);
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain(aliceOrder.number);
  });

  it('shows the customer their own order', async () => {
    const { bob, bobOrder } = await twoCustomersWithOrders();
    const bobAgent = await signInCustomer(app, bob.user.phone!);

    const res = await bobAgent.get(`/api/orders/${bobOrder.id}`);
    expect(res.status).toBe(200);
    expect(res.body.number).toBe(bobOrder.number);
  });

  it("never includes another customer's orders or family on Home", async () => {
    const { alice, bob, aliceOrder, bobOrder } = await twoCustomersWithOrders();
    const bobAgent = await signInCustomer(app, bob.user.phone!);

    const res = await bobAgent.get('/api/home');
    expect(res.status).toBe(200);
    const ids = res.body.activeOrders.map((o: { id: string }) => o.id);
    expect(ids).toContain(bobOrder.id);
    expect(ids).not.toContain(aliceOrder.id);
    expect(res.body.patients.map((p: { id: string }) => p.id)).not.toContain(alice.patient.id);
  });

  it('answers 404 (not 400) for ids that are not valid UUIDs', async () => {
    const { bob } = await twoCustomersWithOrders();
    const bobAgent = await signInCustomer(app, bob.user.phone!);
    expect((await bobAgent.get('/api/orders/RX-50211')).status).toBe(404);
  });

  it('requires sign-in for customer data', async () => {
    expect((await request(app).get('/api/home')).status).toBe(401);
  });
});

describe('role checks (T2)', () => {
  it('blocks customers from pharmacist and operations endpoints', async () => {
    const { bob } = await twoCustomersWithOrders();
    const bobAgent = await signInCustomer(app, bob.user.phone!);
    expect((await bobAgent.get('/api/pharmacist/queue')).status).toBe(403);
    expect((await bobAgent.get('/api/ops/stores')).status).toBe(403);
  });

  it('lets a pharmacist see the queue but not customer-only screens', async () => {
    await twoCustomersWithOrders();
    const store = await createStore();
    const pharmacist = await createPharmacist(store.id);
    const agent = await signInStaff(app, pharmacist.email!);

    const queue = await agent.get('/api/pharmacist/queue');
    expect(queue.status).toBe(200);
    expect(queue.body.rows).toHaveLength(2);
    expect((await agent.get('/api/home')).status).toBe(403);
    expect((await agent.get('/api/ops/stores')).status).toBe(403);
  });

  it('still answers 404 for unknown API paths', async () => {
    expect((await request(app).get('/api/nothing-here')).status).toBe(404);
  });
});
