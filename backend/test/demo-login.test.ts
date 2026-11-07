/**
 * One-tap demo sign-in. It's a real shortcut past authentication, so the part
 * that matters most is that it doesn't exist outside test mode.
 */
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { createCustomer, createPharmacist, createStore, resetDb } from './helpers/factory';

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

describe('in test mode', () => {
  it('lists people and their jobs, but no phones, emails or passwords', async () => {
    const res = await request(server).get('/api/config').expect(200);
    expect(res.body.demoAccounts.length).toBeGreaterThanOrEqual(5);
    expect(res.body.demoAccounts[0]).toMatchObject({ key: 'debasish', job: expect.any(String), tryThis: expect.any(String) });
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('+91');
    expect(text).not.toContain('@demo.example');
    expect(text).not.toContain('Nirantar@');
  });

  it('signs in a customer in one tap, and says what they do', async () => {
    await createCustomer('+919000010001');
    const agent = request.agent(server);
    const res = await agent.post('/api/auth/demo-login').send({ key: 'debasish' }).expect(200);
    expect(res.body.user.role).toBe('CUSTOMER');
    expect(res.body.user.demoGuide).toMatchObject({ name: 'Debasish Ghosh', tryThis: expect.stringContaining('Reorder') });
    expect((await agent.get('/api/me').expect(200)).body.demoGuide.name).toBe('Debasish Ghosh');
  });

  it('signs in a pharmacist with their own role, and only that role', async () => {
    const store = await createStore();
    await createPharmacist(store.id, { email: 'sanjukta.roy@demo.example' });
    const agent = request.agent(server);
    const res = await agent.post('/api/auth/demo-login').send({ key: 'sanjukta' }).expect(200);
    expect(res.body.user.role).toBe('PHARMACIST');
    await agent.get('/api/pharmacist/queue').expect(200);
    await agent.get('/api/ops/overview').expect(403);
  });

  it('refuses anyone not on the list, or who is not in the database', async () => {
    await request(server).post('/api/auth/demo-login').send({ key: 'nobody' }).expect(404);
    await request(server).post('/api/auth/demo-login').send({ key: 'debasish' }).expect(404);
    await request(server).post('/api/auth/demo-login').send({}).expect(400);
  });

  it('shows no guide for an account outside the demo list', async () => {
    const agent = request.agent(server);
    const phone = '+919111111111';
    await createCustomer(phone);
    const { body } = await agent.post('/api/auth/otp/request').send({ phone });
    const verified = await agent.post('/api/auth/otp/verify').send({ phone, code: body.demoCode }).expect(200);
    expect(verified.body.user.demoGuide).toBeNull();
  });
});

describe('in production', () => {
  const original = env.APP_ENV;
  beforeEach(() => {
    env.APP_ENV = 'production';
  });
  afterEach(() => {
    env.APP_ENV = original;
  });

  it('the list is not sent', async () => {
    const res = await request(server).get('/api/config').expect(200);
    expect(res.body).toEqual({ testMode: false });
  });

  it('the shortcut does not exist, and starts no session', async () => {
    await createCustomer('+919000010001');
    const agent = request.agent(server);
    await agent.post('/api/auth/demo-login').send({ key: 'debasish' }).expect(404);
    await agent.get('/api/me').expect(401);
  });
});
