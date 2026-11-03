import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { prisma } from '../src/lib/db';
import { createCustomer, createPharmacist, createStore, resetDb } from './helpers/factory';
import { randomPhone, signInCustomer } from './helpers/auth';

const app = createApp();

beforeEach(async () => {
  await resetDb();
});

describe('customer sign-in with OTP', () => {
  it('rejects a phone number that is not an Indian mobile', async () => {
    const res = await request(app).post('/api/auth/otp/request').send({ phone: '12345' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('stores only a keyed hash of the code, never the code itself', async () => {
    const phone = randomPhone();
    const res = await request(app).post('/api/auth/otp/request').send({ phone });
    expect(res.status).toBe(202);

    const stored = await prisma.otpCode.findFirstOrThrow({ where: { phone } });
    expect(stored.codeHash).not.toContain(res.body.demoCode);
    expect(stored.codeHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('signs in with the right code and creates a new customer who still needs onboarding', async () => {
    const phone = randomPhone();
    const agent = request.agent(app);
    const { body } = await agent.post('/api/auth/otp/request').send({ phone: phone.slice(3) });
    const verified = await agent.post('/api/auth/otp/verify').send({ phone, code: body.demoCode });

    expect(verified.status).toBe(200);
    expect(verified.body.isNew).toBe(true);
    expect(verified.body.user.needsOnboarding).toBe(true);
    const cookie = verified.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toMatch(/^nr_sid=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const me = await agent.get('/api/me');
    expect(me.status).toBe(200);
    expect(me.body.role).toBe('CUSTOMER');
    expect(me.body.phoneMasked).toBe(`••••• ${phone.slice(-5)}`);
  });

  it('counts down wrong guesses and locks the code after 5', async () => {
    const phone = randomPhone();
    const { body } = await request(app).post('/api/auth/otp/request').send({ phone });
    const wrong = body.demoCode === '000000' ? '111111' : '000000';

    const first = await request(app).post('/api/auth/otp/verify').send({ phone, code: wrong });
    expect(first.status).toBe(400);
    expect(first.body.error.code).toBe('OTP_INVALID');
    expect(first.body.error.details.triesLeft).toBe(4);

    for (let i = 0; i < 4; i++) await request(app).post('/api/auth/otp/verify').send({ phone, code: wrong });
    const locked = await request(app).post('/api/auth/otp/verify').send({ phone, code: body.demoCode });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('OTP_LOCKED');
  });

  it('does not accept the same code twice', async () => {
    const phone = randomPhone();
    const { body } = await request(app).post('/api/auth/otp/request').send({ phone });
    await request(app).post('/api/auth/otp/verify').send({ phone, code: body.demoCode });
    const again = await request(app).post('/api/auth/otp/verify').send({ phone, code: body.demoCode });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('OTP_EXPIRED');
  });

  it('makes people wait before asking for another code', async () => {
    const phone = randomPhone();
    await request(app).post('/api/auth/otp/request').send({ phone });
    const tooSoon = await request(app).post('/api/auth/otp/request').send({ phone });
    expect(tooSoon.status).toBe(429);
    expect(tooSoon.body.error.code).toBe('OTP_TOO_SOON');
  });

  it('lets a new customer finish onboarding (name + consent)', async () => {
    const phone = randomPhone();
    const agent = await signInCustomer(app, phone);
    const res = await agent.patch('/api/me').send({ name: 'Mitali Das', consentToStorePrescriptions: true, locale: 'bn' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Mitali Das', locale: 'bn', needsOnboarding: false });
  });
});

describe('the demo OTP is never shown in production (T18)', () => {
  const original = env.APP_ENV;
  afterEach(() => {
    env.APP_ENV = original;
  });

  it('returns the code in demo/test environments', async () => {
    const res = await request(app).post('/api/auth/otp/request').send({ phone: randomPhone() });
    expect(res.body.demoCode).toMatch(/^\d{6}$/);
  });

  it('never returns the code when APP_ENV is production', async () => {
    env.APP_ENV = 'production';
    const res = await request(app).post('/api/auth/otp/request').send({ phone: randomPhone() });
    expect(res.status).toBe(202);
    expect(res.body).not.toHaveProperty('demoCode');
    expect(JSON.stringify(res.body)).not.toMatch(/\b\d{6}\b/);
  });
});

describe('staff sign-in', () => {
  it('signs a pharmacist in and returns their store', async () => {
    const store = await createStore('SLK');
    const pharmacist = await createPharmacist(store.id, { email: 'ph@test.example' });
    const res = await request(app)
      .post('/api/auth/staff/login')
      .send({ email: 'PH@test.example', password: 'correct-horse-battery' });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: pharmacist.id, role: 'PHARMACIST', store: { name: 'Store SLK' } });
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const store = await createStore();
    await createPharmacist(store.id, { email: 'ph2@test.example' });
    const wrongPassword = await request(app)
      .post('/api/auth/staff/login')
      .send({ email: 'ph2@test.example', password: 'nope' });
    const unknownEmail = await request(app)
      .post('/api/auth/staff/login')
      .send({ email: 'nobody@test.example', password: 'nope' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
  });

  it('ends the session on logout', async () => {
    const phone = randomPhone();
    await createCustomer(phone);
    const agent = await signInCustomer(app, phone);
    expect((await agent.get('/api/me')).status).toBe(200);

    expect((await agent.post('/api/auth/logout')).status).toBe(204);
    expect((await agent.get('/api/me')).status).toBe(401);
  });
});

describe('CSRF origin check', () => {
  it('refuses a state-changing request from another website', async () => {
    const res = await request(app)
      .post('/api/auth/otp/request')
      .set('Origin', 'https://evil.example')
      .send({ phone: randomPhone() });
    expect(res.status).toBe(403);
  });

  it('accepts the same request from our own frontend', async () => {
    const res = await request(app)
      .post('/api/auth/otp/request')
      .set('Origin', env.APP_ORIGIN)
      .send({ phone: randomPhone() });
    expect(res.status).toBe(202);
  });
});
