import request from 'supertest';
type Target = Parameters<typeof request.agent>[0];

/** A random valid Indian mobile number in E.164 form. */
export function randomPhone(): string {
  return `+9198${String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0')}`;
}

/** Signs a customer in through the real OTP flow (demo mode returns the code). */
export async function signInCustomer(app: Target, phone: string) {
  const agent = request.agent(app);
  const requested = await agent.post('/api/auth/otp/request').send({ phone });
  if (requested.status !== 202) throw new Error(`OTP request failed: ${requested.status}`);
  const verified = await agent.post('/api/auth/otp/verify').send({ phone, code: requested.body.demoCode });
  if (verified.status !== 200) throw new Error(`OTP verify failed: ${verified.status}`);
  return agent;
}

export async function signInStaff(app: Target, email: string, password = 'correct-horse-battery') {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/staff/login').send({ email, password });
  if (res.status !== 200) throw new Error(`Staff login failed: ${res.status}`);
  return agent;
}
