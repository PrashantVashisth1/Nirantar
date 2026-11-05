/**
 * Operations overview, register and demo reset. The reset test also proves
 * the whole demo world can be built through the real database gate.
 */
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { prisma } from '../src/lib/db';
import { createCustomer, createOrder, createProduct, createStaff, createStore, resetDb } from './helpers/factory';
import { randomPhone, signInCustomer, signInStaff } from './helpers/auth';

let server: Server;
beforeAll(() => {
  server = createApp().listen(0);
});
afterAll(() => {
  server.close();
});

beforeEach(async () => {
  await resetDb();
});

async function opsAgent() {
  const ops = await createStaff('OPS');
  return signInStaff(server, ops.email!);
}

describe('GET /ops/overview', () => {
  it('counts orders per store, including stores with no orders', async () => {
    const busy = await createStore('BUSY');
    await createStore('IDLE');
    const product = await createProduct('OTC');
    const customer = await createCustomer(randomPhone());
    await createOrder({ customer, status: 'ASSIGNED', storeId: busy.id, items: [{ productId: product.id }] });

    const res = await (await opsAgent()).get('/api/ops/overview').expect(200);
    const byCode = Object.fromEntries(res.body.stores.map((s: { code: string }) => [s.code, s]));
    expect(byCode.BUSY).toMatchObject({ today: 1, week: 1, open: 1 });
    expect(byCode.IDLE).toMatchObject({ today: 0, week: 0, open: 0 });
  });

  it('computes median and p90 verification time from placed to decided', async () => {
    const product = await createProduct('OTC');
    const customer = await createCustomer(randomPhone());
    const now = Date.now();
    for (const minutes of [2, 4, 6, 8, 30]) {
      const order = await createOrder({ customer, status: 'AWAITING_PHARMACIST', items: [{ productId: product.id }] });
      await prisma.order.update({
        where: { id: order.id },
        data: { placedAt: new Date(now - minutes * 60_000), verifiedAt: new Date(now) },
      });
    }
    const res = await (await opsAgent()).get('/api/ops/overview').expect(200);
    expect(res.body.verification.decided).toBe(5);
    expect(res.body.verification.medianMinutes).toBeCloseTo(6, 1);
    expect(res.body.verification.p90Minutes).toBeCloseTo(21.2, 1);
  });

  it('reports no unapproved dispatches on a clean database', async () => {
    const res = await (await opsAgent()).get('/api/ops/overview').expect(200);
    expect(res.body.safety.unapproved).toBe(0);
  });

  it('is closed to customers', async () => {
    const phone = randomPhone();
    await createCustomer(phone);
    await (await signInCustomer(server, phone)).get('/api/ops/overview').expect(403);
  });
});

describe('POST /ops/demo/reset', () => {
  const original = env.APP_ENV;
  afterEach(() => {
    env.APP_ENV = original;
  });

  it('does not exist in production, and nothing is wiped', async () => {
    const agent = await opsAgent();
    env.APP_ENV = 'production';
    await agent.post('/api/ops/demo/reset').expect(404);
    expect(await prisma.user.count()).toBe(1);
  });

  it('is closed to customers', async () => {
    const phone = randomPhone();
    await createCustomer(phone);
    await (await signInCustomer(server, phone)).post('/api/ops/demo/reset').expect(403);
  });

  it('rebuilds the demo world through the real gate, with an H1 register and no unapproved dispatch', async () => {
    const agent = await opsAgent();
    const reset = await agent.post('/api/ops/demo/reset').expect(200);
    expect(reset.body.orders).toBeGreaterThanOrEqual(25);
    expect(reset.body.prescriptionImages).toBeGreaterThan(0);

    // Every status from the brief's lifecycle is present.
    const statuses = await prisma.order.groupBy({ by: ['status'] });
    expect(statuses.map((s) => s.status).sort()).toEqual(
      ['ASSIGNED', 'AWAITING_CUSTOMER', 'AWAITING_PHARMACIST', 'AWAITING_STOCK', 'CANCELLED', 'DELIVERED', 'ON_HOLD_REUPLOAD', 'OUT_FOR_DELIVERY', 'PACKED', 'PICKING', 'REJECTED'].sort(),
    );

    // Reset wiped the session, so sign in again with the seeded account.
    await agent.get('/api/ops/overview').expect(401);
    const fresh = request.agent(server);
    await fresh.post('/api/auth/staff/login').send({ email: 'ops@demo.example', password: 'Nirantar@2026' }).expect(200);

    const overview = await fresh.get('/api/ops/overview').expect(200);
    expect(overview.body.stores).toHaveLength(6);
    expect(overview.body.safety.unapproved).toBe(0);
    expect(overview.body.safety.dispatched).toBeGreaterThan(0);

    const register = await fresh.get('/api/ops/h1-register').expect(200);
    expect(register.body.length).toBeGreaterThan(0);
    expect(register.body[0]).toMatchObject({ prescriberRegNo: expect.stringContaining('DEMO-WB') });

    const rules = await fresh.get('/api/ops/rules').expect(200);
    expect(rules.body.map((r: { schedule: string }) => r.schedule).sort()).toEqual(['H', 'H1', 'OTC']);
  }, 60_000);
});
