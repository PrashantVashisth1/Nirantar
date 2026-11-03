import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/db';

const app = createApp();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('API basics', () => {
  it('reports liveness without touching the database', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('reports readiness when the database is reachable', async () => {
    const res = await request(app).get('/api/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, db: 'up' });
  });

  it('never lets API responses be cached (health data)', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('tags every response with a request id', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns a consistent JSON error for unknown endpoints', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND' });
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('rejects malformed JSON with a 400, not a crash', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"broken": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });
});
