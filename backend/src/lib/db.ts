import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { env } from '../config/env';

/**
 * One Prisma client for the whole process. Prisma 7 talks to Postgres through
 * a driver adapter (here the standard `pg` driver), which manages a
 * connection pool for us.
 */
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });

export type Db = typeof prisma;
