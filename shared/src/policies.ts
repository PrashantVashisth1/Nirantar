/**
 * Business policies in one place. Each value is an assumption from the plan
 * (§1.1), not a fact from the brief or the law, so it's easy to find and change.
 */

/** A3: how long a prescription stays usable for refills, from its date. Placeholder for the client's compliance team. */
export const RX_VALIDITY_DAYS = 180;

/** A4: stores farther than this (straight-line km) from the delivery locality are not used. */
export const DELIVERY_RADIUS_KM = 8;

/** A4: orders routed before this hour (IST) are promised for the same day. */
export const SAME_DAY_CUTOFF_HOUR_IST = 18;

/** Stores whose last stock count is older than this are not used for routing. */
export const STOCK_STALE_HOURS = 48;

/** Refill reminders go out this many days before the estimated run-out date. */
export const REMINDER_OFFSETS_DAYS = [5, 2, 0] as const;

/** Refills due within this many days get a Reorder card on Home. */
export const REFILL_DUE_SOON_DAYS = 7;

/** A prescription still "being read" after this long is treated as failed (plan §8). */
export const AI_READING_STALE_MS = 2 * 60 * 1000;

/** Statuses after which an order is finished. */
export const TERMINAL_ORDER_STATUSES = ['DELIVERED', 'REJECTED', 'CANCELLED'] as const;
