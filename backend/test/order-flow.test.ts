/**
 * The core build end to end through the real API (plan T5, T7, T12, T15–T17):
 * upload → AI draft (fake provider) → order → pharmacist → routing → store → delivered.
 */
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { decrypt } from '../src/lib/crypto';
import { prisma } from '../src/lib/db';
import { setReader } from '../src/services/ai/gemini-reader';
import type { Extraction, PrescriptionReader, ReadResult } from '../src/services/ai/extraction';
import { createCustomer, createPharmacist, createProduct, createStore, resetDb } from './helpers/factory';
import { randomPhone, signInCustomer, signInStaff } from './helpers/auth';

// One real listening server for the whole file (supertest's per-request servers can close mid-test).
const app = createApp().listen(0);
afterAll(() => new Promise<void>((resolve) => app.close(() => resolve())));

const field = (value: string | null, confidence: 'high' | 'low' = 'high') => ({ value, confidence });
function extraction(overrides: Partial<Extraction> = {}): Extraction {
  return {
    isPrescription: true,
    legibility: 'clear',
    prescriberName: field('Dr. S. Banerjee'),
    prescriberRegNo: field('DEMO-WB-48213'),
    prescribedOn: field('2026-10-20'),
    patientName: field('Test Customer'),
    items: [
      {
        lineText: 'Tab Glycora 500  1-0-1  x 30 days',
        medicineName: field('Glycora 500'),
        strength: field('500 mg'),
        dosageText: field('1-0-1'),
        durationText: field('30 days'),
        quantityText: field(null),
      },
    ],
    unreadableLineCount: 0,
    ...overrides,
  };
}
const fakeReader = (result: ReadResult): PrescriptionReader => ({ read: async () => result });

let photo: Buffer;
beforeEach(async () => {
  await resetDb();
  photo ??= await sharp({ create: { width: 600, height: 800, channels: 3, background: '#ffffff' } })
    .withMetadata({ exif: { IFD0: { Make: 'TestPhone' } } })
    .jpeg()
    .toBuffer();
  setReader(fakeReader({ ok: true, extraction: extraction(), model: 'fake' }));
});
afterEach(() => setReader(fakeReader({ ok: false, error: 'DISABLED' })));

async function world() {
  const store = await createStore('SLK');
  const pharmacist = await createPharmacist(store.id);
  const metformin = await prisma.product.create({
    data: { sku: 'MET500', name: 'Glycora 500', molecule: 'Metformin', strength: '500 mg', form: 'TABLET', packLabel: 'Strip of 15', packUnits: 15, pricePaise: 12000, schedule: 'H', manufacturer: 'T', aliases: ['Glycora 500'] },
  });
  const generic = await prisma.product.create({
    data: { sku: 'MET500G', name: 'Metformin 500 mg (generic)', molecule: 'Metformin', strength: '500 mg', form: 'TABLET', packLabel: 'Strip of 15', packUnits: 15, pricePaise: 4500, schedule: 'H', isGeneric: true, manufacturer: 'G' },
  });
  const h1 = await prisma.product.create({
    data: { sku: 'CFX200', name: 'Cefora 200', molecule: 'Cefixime', strength: '200 mg', form: 'TABLET', packLabel: 'Strip of 10', packUnits: 10, pricePaise: 11000, schedule: 'H1', manufacturer: 'T' },
  });
  const banned = await createProduct('X', { name: 'Focira 10' });
  for (const p of [metformin, generic, h1]) {
    await prisma.storeStock.create({ data: { storeId: store.id, productId: p.id, onHand: 50, countedAt: new Date() } });
  }
  const customer = await createCustomer(randomPhone());
  const address = await prisma.address.create({
    data: { accountId: customer.user.id, label: 'Home', line1: 'BD-112', localityId: 'salt-lake-2', pincode: '700091', lat: 22.586, lng: 88.406, isDefault: true },
  });
  const customerAgent = await signInCustomer(app, customer.user.phone!);
  const pharmacistAgent = await signInStaff(app, pharmacist.email!);
  return { store, pharmacist, metformin, generic, h1, banned, customer, address, customerAgent, pharmacistAgent };
}

async function uploadRx(agent: ReturnType<typeof request.agent>, patientId: string) {
  const res = await agent.post('/api/prescriptions').field('patientId', patientId).attach('file', photo, 'rx.jpg');
  expect(res.status).toBe(201);
  // The AI read runs in the background; wait for it to finish.
  for (let i = 0; i < 50; i++) {
    const current = await agent.get(`/api/prescriptions/${res.body.id}`);
    if (current.body.aiStatus !== 'READING') return current.body;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('AI read did not finish');
}

async function placeOrder(w: Awaited<ReturnType<typeof world>>, items: { productId: string; quantity: number }[], extra: object = {}) {
  const rx = await uploadRx(w.customerAgent, w.customer.patient.id);
  const res = await w.customerAgent.post('/api/orders').send({
    patientId: w.customer.patient.id,
    addressId: w.address.id,
    prescriptionId: rx.id,
    items,
    paymentMethod: 'COD',
    remindersOptIn: true,
    ...extra,
  });
  expect(res.status).toBe(201);
  return { orderId: res.body.id as string, prescriptionId: rx.id as string };
}

async function workspace(w: Awaited<ReturnType<typeof world>>, orderId: string) {
  const res = await w.pharmacistAgent.get(`/api/pharmacist/orders/${orderId}`);
  expect(res.status).toBe(200);
  return res.body;
}

function approveAll(ws: { order: { version: number }; items: { id: string; product: { id: string }; quantity: number }[] }, overrides: Record<string, unknown> = {}) {
  return {
    version: ws.order.version,
    prescription: { prescriberName: 'Dr. S. Banerjee', prescriberRegNo: 'DEMO-WB-48213', prescribedOn: '2026-10-20' },
    items: ws.items.map((item) => ({
      itemId: item.id,
      productId: item.product.id,
      quantity: item.quantity,
      decision: 'APPROVE',
      dose: { morning: 1, noon: 0, night: 1 },
      asNeeded: false,
      durationDays: 30,
      ...overrides,
    })),
    confirmedValid: true,
  };
}

describe('prescription upload and AI draft (T12, T17)', () => {
  it('stores the photo encrypted, without metadata, and matches the AI draft to the catalog', async () => {
    const w = await world();
    const rx = await uploadRx(w.customerAgent, w.customer.patient.id);

    expect(rx.aiStatus).toBe('READY');
    expect(rx.draft.lines[0]).toMatchObject({ quality: 'STRONG', product: { id: w.metformin.id }, suggestedQuantity: 4, dose: { morning: 1, noon: 0, night: 1 } });
    const file = await prisma.prescriptionFile.findUniqueOrThrow({ where: { prescriptionId: rx.id } });
    expect(Buffer.from(file.ciphertext).includes(Buffer.from('JFIF'))).toBe(false); // not stored in the clear
    const clean = decrypt(file, rx.id);
    expect((await sharp(clean).metadata()).exif).toBeUndefined(); // metadata stripped
    expect(() => decrypt(file, 'another-record-id')).toThrow(); // bound to its record
  });

  it('marks unreadable photos and AI failures, and the order can still be placed', async () => {
    const w = await world();
    setReader(fakeReader({ ok: true, extraction: extraction({ legibility: 'illegible', items: [] }), model: 'fake' }));
    expect((await uploadRx(w.customerAgent, w.customer.patient.id)).aiStatus).toBe('UNREADABLE');

    setReader(fakeReader({ ok: false, error: 'TIMEOUT' }));
    const failed = await uploadRx(w.customerAgent, w.customer.patient.id);
    expect(failed.aiStatus).toBe('FAILED');
    const res = await w.customerAgent.post('/api/orders').send({
      patientId: w.customer.patient.id, addressId: w.address.id, prescriptionId: failed.id,
      items: [{ productId: w.metformin.id, quantity: 4 }], paymentMethod: 'COD', remindersOptIn: false,
    });
    expect(res.status).toBe(201);
  });

  it('flags uncertain fields and refuses a different strength', async () => {
    const w = await world();
    const unsure = extraction();
    unsure.items[0] = { ...unsure.items[0]!, strength: field('850 mg', 'low') };
    setReader(fakeReader({ ok: true, extraction: unsure, model: 'fake' }));
    const rx = await uploadRx(w.customerAgent, w.customer.patient.id);
    expect(rx.aiStatus).toBe('UNSURE');
    expect(rx.draft.lines[0]).toMatchObject({ uncertain: true, quality: 'NONE', product: null });
  });

  it('recovers a read stuck for over 2 minutes as failed (T17)', async () => {
    const w = await world();
    setReader({ read: () => new Promise(() => undefined) }); // never answers
    const res = await w.customerAgent.post('/api/prescriptions').field('patientId', w.customer.patient.id).attach('file', photo, 'rx.jpg');
    await prisma.prescription.update({ where: { id: res.body.id }, data: { aiStartedAt: new Date(Date.now() - 3 * 60_000) } });
    expect((await w.customerAgent.get(`/api/prescriptions/${res.body.id}`)).body.aiStatus).toBe('FAILED');
  });

  it('rejects files that are not images, whatever their name', async () => {
    const w = await world();
    const res = await w.customerAgent.post('/api/prescriptions').field('patientId', w.customer.patient.id).attach('file', Buffer.from('%PDF-1.4 hello'), 'rx.jpg');
    expect(res.status).toBe(415);
  });

  it('shows the image only to its owner and pharmacists, and logs each view', async () => {
    const w = await world();
    const rx = await uploadRx(w.customerAgent, w.customer.patient.id);
    const stranger = await signInCustomer(app, (await createCustomer(randomPhone())).user.phone!);

    expect((await stranger.get(`/api/prescriptions/${rx.id}/image`)).status).toBe(404);
    expect((await w.pharmacistAgent.get(`/api/prescriptions/${rx.id}/image`)).status).toBe(200);
    expect((await w.customerAgent.get(`/api/prescriptions/${rx.id}/image`)).headers['cache-control']).toBe('no-store');
    expect(await prisma.prescriptionAccessLog.count({ where: { prescriptionId: rx.id, action: 'VIEW_IMAGE' } })).toBe(2);
  });
});

describe('placing an order', () => {
  it('refuses Schedule X items and prescription medicines without a prescription', async () => {
    const w = await world();
    const base = { patientId: w.customer.patient.id, addressId: w.address.id, paymentMethod: 'COD', remindersOptIn: false };
    const banned = await w.customerAgent.post('/api/orders').send({ ...base, items: [{ productId: w.banned.id, quantity: 1 }] });
    expect(banned.body.error.code).toBe('SCHEDULE_NOT_SOLD_ONLINE');
    const noRx = await w.customerAgent.post('/api/orders').send({ ...base, items: [{ productId: w.metformin.id, quantity: 1 }] });
    expect(noRx.body.error.code).toBe('PRESCRIPTION_REQUIRED');
  });
});

describe('the full lifecycle (T15)', () => {
  it('approve → routed → pick → pack → hand over → delivered, then refill tracking starts', async () => {
    const w = await world();
    const { orderId } = await placeOrder(w, [{ productId: w.metformin.id, quantity: 4 }]);

    const approve = await w.pharmacistAgent.post(`/api/pharmacist/orders/${orderId}/approve`).send(approveAll(await workspace(w, orderId)));
    expect(approve.body).toMatchObject({ outcome: 'ASSIGNED', storeId: w.store.id });

    const step = async (path: string, body: object = {}) => {
      const version = (await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).version;
      return w.pharmacistAgent.post(`/api/pharmacist/store/orders/${orderId}/${path}`).send({ version, ...body });
    };
    expect((await step('pack', { invoiceNo: 'X' })).status).toBe(409); // can't skip picking
    expect((await step('start-picking')).status).toBe(204);
    expect((await step('pack', { invoiceNo: 'SLK/1' })).status).toBe(204);
    expect((await step('handover', { riderName: 'Ravi' })).status).toBe(204);
    expect((await prisma.storeStock.findFirstOrThrow({ where: { productId: w.metformin.id } }))).toMatchObject({ onHand: 46, reserved: 0 });
    expect((await step('deliver')).status).toBe(204);

    const sub = await prisma.refillSubscription.findFirstOrThrow({ where: { patientId: w.customer.patient.id } });
    expect(sub).toMatchObject({ dailyUnits: 2, daysSupply: 30 }); // 4 × 15 at 1-0-1
    const order = await w.customerAgent.get(`/api/orders/${orderId}`);
    expect(order.body.status).toBe('DELIVERED');
    expect(order.body.verifiedBy.regNo).toMatch(/^TEST-/);
  });

  it('writes an H1 register entry with prescriber and patient details at handover', async () => {
    const w = await world();
    const { orderId } = await placeOrder(w, [{ productId: w.h1.id, quantity: 1 }]);
    await w.pharmacistAgent.post(`/api/pharmacist/orders/${orderId}/approve`).send(approveAll(await workspace(w, orderId)));
    for (const [path, body] of [['start-picking', {}], ['pack', { invoiceNo: 'SLK/2' }], ['handover', { riderName: 'Ravi' }]] as const) {
      const version = (await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).version;
      expect((await w.pharmacistAgent.post(`/api/pharmacist/store/orders/${orderId}/${path}`).send({ version, ...body })).status).toBe(204);
    }
    expect(await prisma.h1RegisterEntry.findFirstOrThrow({ where: { orderId } })).toMatchObject({ prescriberName: 'Dr. S. Banerjee', prescriberRegNo: 'DEMO-WB-48213', patientName: 'Test Customer' });
  });
});

describe('changes, generics and consent (T5, T16)', () => {
  it('a quantity change goes to the customer, who confirms, and then it is routed', async () => {
    const w = await world();
    const { orderId } = await placeOrder(w, [{ productId: w.metformin.id, quantity: 6 }]);
    const res = await w.pharmacistAgent.post(`/api/pharmacist/orders/${orderId}/approve`).send(approveAll(await workspace(w, orderId), { quantity: 4 }));
    expect(res.body.outcome).toBe('AWAITING_CUSTOMER');

    const detail = (await w.customerAgent.get(`/api/orders/${orderId}`)).body;
    const confirm = await w.customerAgent.post(`/api/orders/${orderId}/decision`).send({ version: detail.version, choices: [] });
    expect(confirm.body.outcome).toBe('ASSIGNED');
  });

  it('switches to the pharmacist-offered generic only with recorded consent, at the generic price', async () => {
    const w = await world();
    const { orderId } = await placeOrder(w, [{ productId: w.metformin.id, quantity: 4 }]);
    const ws = await workspace(w, orderId);
    expect(ws.items[0].genericOptions.map((g: { id: string }) => g.id)).toEqual([w.generic.id]);
    await w.pharmacistAgent.post(`/api/pharmacist/orders/${orderId}/approve`).send(approveAll(ws, { offerGenericProductId: w.generic.id }));

    const detail = (await w.customerAgent.get(`/api/orders/${orderId}`)).body;
    const missingChoice = await w.customerAgent.post(`/api/orders/${orderId}/decision`).send({ version: detail.version, choices: [] });
    expect(missingChoice.status).toBe(400);
    const res = await w.customerAgent.post(`/api/orders/${orderId}/decision`).send({ version: detail.version, choices: [{ itemId: detail.items[0].id, choice: 'SWITCH' }] });
    expect(res.body.outcome).toBe('ASSIGNED');

    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId } });
    expect(item).toMatchObject({ productId: w.generic.id, customerChoice: 'SWITCH', unitPricePaise: 4500 });
    expect(item.consentAt).not.toBeNull();
    const version = (await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).version;
    expect((await w.pharmacistAgent.post(`/api/pharmacist/store/orders/${orderId}/start-picking`).send({ version })).status).toBe(204);
  });
});

describe('payments, re-upload and rejection', () => {
  it('blocks handover of an unpaid UPI order until the test payment succeeds', async () => {
    const w = await world();
    const { orderId } = await placeOrder(w, [{ productId: w.metformin.id, quantity: 4 }], { paymentMethod: 'UPI_TEST' });
    await w.pharmacistAgent.post(`/api/pharmacist/orders/${orderId}/approve`).send(approveAll(await workspace(w, orderId)));
    const go = async (path: string, body: object = {}) => {
      const version = (await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).version;
      return w.pharmacistAgent.post(`/api/pharmacist/store/orders/${orderId}/${path}`).send({ version, ...body });
    };
    await go('start-picking');
    await go('pack', { invoiceNo: 'SLK/3' });
    expect((await go('handover', { riderName: 'Ravi' })).body.error.code).toBe('PAYMENT_REQUIRED');

    expect((await w.customerAgent.post(`/api/orders/${orderId}/pay-test`).send({ outcome: 'FAILURE' })).body.paymentStatus).toBe('FAILED');
    expect((await w.customerAgent.post(`/api/orders/${orderId}/pay-test`).send({ outcome: 'SUCCESS' })).body.paymentStatus).toBe('PAID');
    expect((await go('handover', { riderName: 'Ravi' })).status).toBe(204);
  });

  it('a re-upload request puts the order on hold; a new photo sends it back to the queue', async () => {
    const w = await world();
    const { orderId, prescriptionId } = await placeOrder(w, [{ productId: w.metformin.id, quantity: 4 }]);
    const ws = await workspace(w, orderId);
    expect((await w.pharmacistAgent.post(`/api/pharmacist/orders/${orderId}/request-reupload`).send({ version: ws.order.version, reason: 'BLURRY' })).status).toBe(204);
    expect((await w.customerAgent.get(`/api/orders/${orderId}`)).body.status).toBe('ON_HOLD_REUPLOAD');

    const re = await w.customerAgent.post(`/api/orders/${orderId}/reupload`).attach('file', photo, 'rx2.jpg');
    expect(re.status).toBe(200);
    const after = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(after.status).toBe('AWAITING_PHARMACIST');
    expect(after.prescriptionId).not.toBe(prescriptionId);
  });

  it('rejection needs a reason and tells the customer', async () => {
    const w = await world();
    const { orderId } = await placeOrder(w, [{ productId: w.metformin.id, quantity: 4 }]);
    const ws = await workspace(w, orderId);
    expect((await w.pharmacistAgent.post(`/api/pharmacist/orders/${orderId}/reject`).send({ version: ws.order.version, reason: 'OTHER' })).status).toBe(400);
    expect((await w.pharmacistAgent.post(`/api/pharmacist/orders/${orderId}/reject`).send({ version: ws.order.version, reason: 'PATIENT_MISMATCH' })).status).toBe(204);
    const order = (await w.customerAgent.get(`/api/orders/${orderId}`)).body;
    expect(order).toMatchObject({ status: 'REJECTED', rejectionReason: 'PATIENT_MISMATCH' });
  });

  it('a stale screen cannot overwrite a newer decision (409)', async () => {
    const w = await world();
    const { orderId } = await placeOrder(w, [{ productId: w.metformin.id, quantity: 4 }]);
    const ws = await workspace(w, orderId);
    await w.pharmacistAgent.post(`/api/pharmacist/orders/${orderId}/request-reupload`).send({ version: ws.order.version, reason: 'GLARE' });
    expect((await w.pharmacistAgent.post(`/api/pharmacist/orders/${orderId}/approve`).send(approveAll(ws))).status).toBe(409);
  });
});
