import { seedDemoWorld } from '../../../prisma/seed/world';
import { isDemoMode } from '../../config/env';
import { AppError, notFound } from '../../lib/errors';

let resetting = false;

/** Rebuilds the demo world. In production this doesn't exist, and the seed refuses to run anyway. */
export async function resetDemo() {
  if (!isDemoMode()) throw notFound('Not found.');
  if (resetting) throw new AppError(409, 'RESET_IN_PROGRESS', 'The demo is already being reset.');
  resetting = true;
  try {
    return await seedDemoWorld();
  } finally {
    resetting = false;
  }
}
