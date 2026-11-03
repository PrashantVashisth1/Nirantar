/**
 * Store routing (plan §6.3): give an approved order to the nearest store that
 * has EVERY item in stock, and reserve that stock without overselling.
 *
 * Concurrency: each store is tried in its own short transaction that locks
 * the store's stock rows (SELECT ... FOR UPDATE, in product-id order). Two
 * orders racing for the last strip can't both see it as available: the second
 * waits for the lock, then sees the updated `reserved` and moves on.
 * One store per transaction also means two orders can't deadlock each other.
 */
import { DELIVERY_RADIUS_KM, SAME_DAY_CUTOFF_HOUR_IST, STOCK_STALE_HOURS } from '@nirantar/shared';
import { sortByDistance } from '../../domain/distance';
import { prisma } from '../../lib/db';
import { notFound } from '../../lib/errors';
import type { Prisma } from '../../generated/prisma/client';

type Tx = Prisma.TransactionClient;

export type RoutingResult =
  | { outcome: 'ASSIGNED'; storeId: string; storeName: string; distanceKm: number }
  | { outcome: 'AWAITING_STOCK'; note: string }
  | { outcome: 'NOT_ROUTABLE'; status: string };

const ROUTABLE = ['APPROVED', 'AWAITING_STOCK'] as const;

/** Same-day promise if routed before 18:00 IST (A4), otherwise tomorrow afternoon. */
export function promisedBy(now = new Date()): Date {
  const ist = new Date(now.getTime() + 330 * 60_000);
  const istMidnightUtc = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 330 * 60_000;
  const hour = ist.getUTCHours();
  return hour < SAME_DAY_CUTOFF_HOUR_IST
    ? new Date(istMidnightUtc + 20 * 3600_000) // today 8 pm
    : new Date(istMidnightUtc + (24 + 13) * 3600_000); // tomorrow 1 pm
}

/** Candidate stores: active, fresh stock count, within the delivery radius, nearest first. */
export async function candidateStores(point: { lat: number; lng: number }, now = new Date()) {
  const stores = await prisma.store.findMany({ where: { isActive: true } });
  const freshSince = new Date(now.getTime() - STOCK_STALE_HOURS * 3600_000);
  const counted = await prisma.storeStock.groupBy({
    by: ['storeId'],
    _max: { countedAt: true },
  });
  const lastCount = new Map(counted.map((c) => [c.storeId, c._max.countedAt]));
  return sortByDistance(point, stores).filter((store) => {
    const at = lastCount.get(store.id);
    return store.distanceKm <= DELIVERY_RADIUS_KM && at !== undefined && at !== null && at >= freshSince;
  });
}

/** Tries to reserve every item at one store. Returns false (and changes nothing) if any item is short. */
async function reserveAtStore(
  tx: Tx,
  storeId: string,
  items: { productId: string; quantity: number }[],
): Promise<{ ok: true } | { ok: false; shortProductId: string }> {
  const needed = new Map<string, number>();
  for (const item of items) needed.set(item.productId, (needed.get(item.productId) ?? 0) + item.quantity);
  const productIds = [...needed.keys()].sort();

  const rows = await tx.$queryRaw<{ product_id: string; on_hand: number; reserved: number }[]>`
    SELECT product_id::text, on_hand, reserved
      FROM store_stock
     WHERE store_id = ${storeId}::uuid AND product_id = ANY(${productIds}::uuid[])
     ORDER BY product_id
       FOR UPDATE`;
  const byProduct = new Map(rows.map((row) => [row.product_id, row]));

  for (const productId of productIds) {
    const row = byProduct.get(productId);
    if (!row || row.on_hand - row.reserved < needed.get(productId)!) return { ok: false, shortProductId: productId };
  }
  for (const productId of productIds) {
    await tx.storeStock.update({
      where: { storeId_productId: { storeId, productId } },
      data: { reserved: { increment: needed.get(productId)! } },
    });
  }
  return { ok: true };
}

export async function routeOrder(orderId: string, now = new Date()): Promise<RoutingResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { where: { status: 'ACTIVE' }, include: { product: { select: { name: true } } } } },
  });
  if (!order) throw notFound();
  if (!ROUTABLE.includes(order.status as (typeof ROUTABLE)[number])) {
    return { outcome: 'NOT_ROUTABLE', status: order.status };
  }

  const items = order.items.map((item) => ({ productId: item.productId, quantity: item.quantity }));
  const stores = await candidateStores({ lat: order.deliveryLat, lng: order.deliveryLng }, now);
  const shortages: string[] = [];

  for (const store of stores) {
    const assigned = await prisma.$transaction(async (tx) => {
      const reservation = await reserveAtStore(tx, store.id, items);
      if (!reservation.ok) {
        const name = order.items.find((i) => i.productId === reservation.shortProductId)?.product.name;
        shortages.push(`${store.name}: not enough ${name ?? 'stock'}`);
        throw new SkipStore(); // roll back nothing-yet-changed, try the next store
      }
      // Only route an order once, even if two routing calls race.
      const updated = await tx.order.updateMany({
        where: { id: order.id, status: { in: [...ROUTABLE] } },
        data: {
          status: 'ASSIGNED',
          storeId: store.id,
          promisedBy: promisedBy(now),
          routingNote: `Nearest store with every item in stock (${store.distanceKm.toFixed(1)} km).`,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) throw new SkipStore(true);
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: 'ASSIGNED',
          actorRole: 'SYSTEM',
          note: `Routed to ${store.name} store (${store.distanceKm.toFixed(1)} km)`,
        },
      });
      return true;
    }).catch((error) => {
      if (error instanceof SkipStore) {
        if (error.alreadyRouted) throw error;
        return false;
      }
      throw error;
    });

    if (assigned) return { outcome: 'ASSIGNED', storeId: store.id, storeName: store.name, distanceKm: store.distanceKm };
  }

  const note =
    stores.length === 0
      ? `No store within ${DELIVERY_RADIUS_KM} km has up-to-date stock.`
      : `Checked ${stores.length} store(s) within ${DELIVERY_RADIUS_KM} km; none has every item. ${shortages.join('; ')}.`;
  if (order.status === 'APPROVED') {
    await prisma.$transaction([
      prisma.order.updateMany({
        where: { id: order.id, status: 'APPROVED' },
        data: { status: 'AWAITING_STOCK', routingNote: note, version: { increment: 1 } },
      }),
      prisma.orderEvent.create({
        data: { orderId: order.id, fromStatus: 'APPROVED', toStatus: 'AWAITING_STOCK', actorRole: 'SYSTEM', note },
      }),
    ]);
  } else {
    await prisma.order.update({ where: { id: order.id }, data: { routingNote: note } });
  }
  return { outcome: 'AWAITING_STOCK', note };
}

class SkipStore extends Error {
  constructor(readonly alreadyRouted = false) {
    super('skip store');
  }
}

/** Retries every order waiting for stock (after a stock import, or from operations). */
export async function routeWaitingOrders(now = new Date()) {
  const waiting = await prisma.order.findMany({
    where: { status: { in: [...ROUTABLE] } },
    orderBy: { placedAt: 'asc' },
    select: { id: true },
  });
  let routed = 0;
  for (const order of waiting) {
    const result = await routeOrder(order.id, now).catch(() => null);
    if (result?.outcome === 'ASSIGNED') routed += 1;
  }
  return { checked: waiting.length, routed };
}

/** Gives reserved stock back when an assigned order is cancelled (before picking). */
export async function releaseReservation(tx: Tx, order: { storeId: string | null; items: { productId: string; quantity: number }[] }) {
  if (!order.storeId) return;
  for (const item of order.items) {
    await tx.storeStock.update({
      where: { storeId_productId: { storeId: order.storeId, productId: item.productId } },
      data: { reserved: { decrement: item.quantity } },
    });
  }
}
