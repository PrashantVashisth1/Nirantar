import type { OrderStatus } from '@nirantar/shared';
import { conflict } from '../../lib/errors';
import type { Prisma } from '../../generated/prisma/client';

type Tx = Prisma.TransactionClient;

/**
 * Optimistic concurrency: the change only applies if nobody else changed the
 * order since this screen loaded it. Otherwise 409 and the screen reloads,
 * instead of silently overwriting someone's decision.
 */
export async function claimVersion(tx: Tx, orderId: string, version: number, allowed: OrderStatus[]) {
  const claimed = await tx.order.updateMany({
    where: { id: orderId, version, status: { in: allowed } },
    data: { version: { increment: 1 } },
  });
  if (claimed.count === 0) throw conflict('CONFLICT_VERSION', 'This order was just updated. Please reload to see the latest.');
}

export function recordEvent(
  tx: Tx,
  data: { orderId: string; from: OrderStatus | null; to: OrderStatus; actorId: string | null; actorRole: string; note?: string },
) {
  return tx.orderEvent.create({
    data: { orderId: data.orderId, fromStatus: data.from, toStatus: data.to, actorId: data.actorId, actorRole: data.actorRole, note: data.note },
  });
}

/** Test-mode outbox: the message the customer would get by SMS/WhatsApp (plan A14). */
export function notify(tx: Tx, accountId: string, orderId: string, body: string) {
  return tx.message.create({ data: { accountId, orderId, channel: 'SMS', body: `Nirantar (test): ${body}` } });
}

export function ageFrom(birthYear: number | null, now = new Date()): number | null {
  return birthYear ? now.getFullYear() - birthYear : null;
}
