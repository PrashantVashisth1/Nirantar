/**
 * Enum values shared by the frontend and backend.
 *
 * Each list is a readonly tuple so we get both a runtime array (for validation,
 * dropdowns, tests) and a TypeScript union type from one definition.
 * The same names are used for the Postgres enums in backend/prisma/schema.prisma.
 */

export const ROLES = ['CUSTOMER', 'PHARMACIST', 'OPS'] as const;
export type Role = (typeof ROLES)[number];

export const LOCALES = ['en', 'hi', 'bn'] as const;
export type Locale = (typeof LOCALES)[number];

/** Drug schedules under the Drugs and Cosmetics Rules (as used in the brief). */
export const SCHEDULES = ['OTC', 'H', 'H1', 'X', 'NDPS'] as const;
export type Schedule = (typeof SCHEDULES)[number];

/**
 * Plan rule B1: Schedule X and narcotic (NDPS) products are never sold online.
 * This is a FIXED rule. It is deliberately not part of the configurable
 * `schedule_rules` table, so no configuration change can switch it off.
 * The database enforces the same list in a trigger.
 */
export const BANNED_ONLINE_SCHEDULES: readonly Schedule[] = ['X', 'NDPS'];

export function isBannedOnline(schedule: Schedule): boolean {
  return BANNED_ONLINE_SCHEDULES.includes(schedule);
}

export const RELATIONS = ['SELF', 'PARENT', 'SPOUSE', 'CHILD', 'SIBLING', 'OTHER'] as const;
export type Relation = (typeof RELATIONS)[number];

export const ORDER_STATUSES = [
  'AWAITING_PHARMACIST',
  'ON_HOLD_REUPLOAD',
  'AWAITING_CUSTOMER',
  'APPROVED',
  'AWAITING_STOCK',
  'ASSIGNED',
  'PICKING',
  'PACKED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'REJECTED',
  'CANCELLED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_SOURCES = ['NEW', 'REFILL'] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

export const ITEM_STATUSES = ['ACTIVE', 'REMOVED'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

/** The customer's answer when a pharmacist offers a generic alternative. */
export const CUSTOMER_CHOICES = ['KEEP', 'SWITCH'] as const;
export type CustomerChoice = (typeof CUSTOMER_CHOICES)[number];

/** What the AI managed to do with an uploaded prescription. */
export const AI_STATUSES = ['READING', 'READY', 'UNSURE', 'UNREADABLE', 'FAILED'] as const;
export type AiStatus = (typeof AI_STATUSES)[number];

/** What the pharmacist decided about the prescription itself. */
export const REVIEW_STATUSES = ['PENDING', 'VERIFIED', 'REUPLOAD_ASKED', 'REJECTED'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const PAYMENT_METHODS = ['COD', 'UPI_TEST'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * NOT_DUE: before pharmacist approval (amount not final yet, plan A8)
 * DUE: UPI selected and order approved, waiting for the customer to pay
 * PAID / FAILED: result of the last UPI test payment
 * COD_PENDING / COD_COLLECTED: cash on delivery
 * VOID: order rejected or cancelled before any payment
 * REFUNDED: order cancelled after a UPI test payment
 */
export const PAYMENT_STATUSES = [
  'NOT_DUE',
  'DUE',
  'PAID',
  'FAILED',
  'COD_PENDING',
  'COD_COLLECTED',
  'VOID',
  'REFUNDED',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const REJECTION_REASONS = [
  'PRESCRIPTION_INVALID',
  'PRESCRIPTION_EXPIRED',
  'PATIENT_MISMATCH',
  'PRESCRIBER_DETAILS_MISSING',
  'NOT_ON_PRESCRIPTION',
  'DUPLICATE_ORDER',
  'OTHER',
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

export const REUPLOAD_REASONS = [
  'BLURRY',
  'CROPPED',
  'GLARE',
  'WRONG_DOCUMENT',
  'PAGE_MISSING',
  'OTHER',
] as const;
export type ReuploadReason = (typeof REUPLOAD_REASONS)[number];

export const MESSAGE_CHANNELS = ['SMS', 'WHATSAPP', 'IN_APP'] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

export const REMINDER_STATUSES = ['SENT', 'SKIPPED', 'SUPPRESSED'] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];
