import { z } from 'zod';

/**
 * Every environment variable the API reads, validated once at startup.
 * If something is missing or malformed the process stops immediately with a
 * clear message, instead of failing later in the middle of a request.
 *
 * Only variable NAMES live in the repository (.env.example). Values live in
 * a local .env file (git-ignored) or in the hosting provider's settings.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /**
   * Where the app is running. Different from NODE_ENV on purpose: the public
   * reviewer demo runs a production build (NODE_ENV=production) but is a
   * demo environment (APP_ENV=demo), where showing the test OTP is allowed.
   * With APP_ENV=production the OTP is never returned (plan A16).
   */
  APP_ENV: z.enum(['development', 'test', 'demo', 'production']).default('development'),

  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  /** The frontend's public URL. Used to reject cross-site requests (CSRF). */
  APP_ORIGIN: z.string().min(1).default('http://localhost:5173'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  /** Signs the session cookie. Long random string; different per environment. */
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),

  /** Server-side secret mixed into OTP hashes, so a leaked table can't be brute-forced. */
  OTP_PEPPER: z.string().min(32, 'OTP_PEPPER must be at least 32 characters'),

  /** Shared secret for the scheduled reminder job. Optional: without it the endpoint is off. */
  CRON_SECRET: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(32).optional()),

  /** AES-256 key (32 bytes, base64) for prescription images. Never commit it. */
  PRESCRIPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'PRESCRIPTION_KEY must be 32 bytes, base64-encoded'),

  /** Gemini (Google AI Studio). Optional: without it, every prescription goes to manual entry. */
  // Empty or "off" means no AI: every prescription goes to manual entry.
  GEMINI_API_KEY: z.preprocess((v) => (v === '' || v === 'off' ? undefined : v), z.string().optional()),
  GEMINI_MODEL: z.string().default('gemini-3.8-flash'),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    // eslint-disable-next-line no-console
    console.error(`Invalid environment configuration:\n${problems}`);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();

/**
 * Demo/test-only conveniences (visible OTP, test payments, demo reset).
 * A function rather than a constant so tests can check production behaviour.
 */
export function isDemoMode(): boolean {
  return env.APP_ENV !== 'production';
}
