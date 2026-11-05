/**
 * The central view (plan O1). Everything is aggregated over all rows in
 * `stores` by the database, so the same queries work for 6 stores or 46.
 */
import { addDays, todayIst } from '@nirantar/shared';
import { prisma } from '../../lib/db';

/** Midnight IST of an IST calendar date, as an instant. */
function istMidnight(date: Date): Date {
  return new Date(date.getTime() - 330 * 60_000);
}

export async function getOverview(now = new Date()) {
  const today = todayIst(now);
  const todayStart = istMidnight(today);
  const weekStart = istMidnight(addDays(today, -6));

  const [byStore, unrouted, verification, rejections, safety, active] = await Promise.all([
    prisma.$queryRaw<{ code: string; name: string; today: bigint; week: bigint; open: bigint }[]>`
      SELECT s.code, s.name,
        count(o.id) FILTER (WHERE o.placed_at >= ${todayStart}) AS today,
        count(o.id) FILTER (WHERE o.placed_at >= ${weekStart}) AS week,
        count(o.id) FILTER (WHERE o.status IN ('ASSIGNED','PICKING','PACKED','OUT_FOR_DELIVERY')) AS open
      FROM stores s
      LEFT JOIN orders o ON o.store_id = s.id
      GROUP BY s.id
      ORDER BY week DESC, s.name ASC`,
    prisma.$queryRaw<{ today: bigint; week: bigint }[]>`
      SELECT
        count(*) FILTER (WHERE placed_at >= ${todayStart}) AS today,
        count(*) FILTER (WHERE placed_at >= ${weekStart}) AS week
      FROM orders WHERE store_id IS NULL`,
    prisma.$queryRaw<{ decided: bigint; median: number | null; p90: number | null }[]>`
      SELECT count(*) AS decided,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM verified_at - placed_at) / 60)::float8 AS median,
        percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM verified_at - placed_at) / 60)::float8 AS p90
      FROM orders
      WHERE verified_at IS NOT NULL AND verified_at >= ${weekStart}`,
    prisma.order.groupBy({
      by: ['rejectionReason'],
      where: { status: 'REJECTED', verifiedAt: { gte: weekStart } },
      _count: { _all: true },
      orderBy: { _count: { id: 'desc' } },
    }),
    // Measured from the data, not assumed: H/H1 items that left a store without
    // an approval. The database gate should keep this at 0 forever.
    prisma.$queryRaw<{ unapproved: bigint; dispatched: bigint }[]>`
      SELECT
        count(*) FILTER (WHERE i.approved_by_id IS NULL) AS unapproved,
        count(*) AS dispatched
      FROM order_items i
      JOIN orders o ON o.id = i.order_id
      JOIN products p ON p.id = i.product_id
      WHERE i.status = 'ACTIVE' AND p.schedule IN ('H', 'H1')
        AND o.status IN ('OUT_FOR_DELIVERY', 'DELIVERED')`,
    prisma.order.count({ where: { status: 'AWAITING_PHARMACIST' } }),
  ]);

  return {
    stores: byStore.map((s) => ({ code: s.code, name: s.name, today: Number(s.today), week: Number(s.week), open: Number(s.open) })),
    notRouted: { today: Number(unrouted[0]!.today), week: Number(unrouted[0]!.week) },
    verification: {
      decided: Number(verification[0]!.decided),
      medianMinutes: verification[0]!.median,
      p90Minutes: verification[0]!.p90,
      waitingNow: active,
    },
    rejections: rejections.map((r) => ({ reason: r.rejectionReason ?? 'OTHER', count: r._count._all })),
    safety: { unapproved: Number(safety[0]!.unapproved), dispatched: Number(safety[0]!.dispatched) },
  };
}

export async function getRules() {
  return prisma.scheduleRule.findMany({ orderBy: { schedule: 'asc' } });
}

export async function getH1Register() {
  const entries = await prisma.h1RegisterEntry.findMany({
    orderBy: { suppliedAt: 'desc' },
    take: 100,
    include: {
      order: { select: { number: true } },
      product: { select: { name: true, strength: true } },
      pharmacist: { select: { name: true, pharmacistRegNo: true } },
      store: { select: { name: true } },
    },
  });
  return entries.map((e) => ({
    id: e.id,
    suppliedAt: e.suppliedAt.toISOString(),
    orderNumber: e.order.number,
    product: e.product.name,
    quantity: e.quantity,
    patientName: e.patientName,
    patientAddress: e.patientAddress,
    prescriberName: e.prescriberName,
    prescriberRegNo: e.prescriberRegNo,
    pharmacist: e.pharmacist.name,
    pharmacistRegNo: e.pharmacist.pharmacistRegNo,
    store: e.store.name,
  }));
}
