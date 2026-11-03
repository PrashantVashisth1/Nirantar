import type { OrderStatus, Role } from './enums';

/**
 * Who can trigger a status change. SYSTEM = the backend itself (store routing),
 * not a person.
 */
export type Actor = Role | 'SYSTEM';

/**
 * The order lifecycle (plan §6.1) as one table.
 *
 * Read it as: from this status -> to that status -> who is allowed to do it.
 * Anything not listed here is an invalid move. The backend checks every status
 * change against this table, and the database adds a final "dispatch gate"
 * for the fulfilment statuses (plan §6.2, rule B7).
 */
export const ORDER_TRANSITIONS: Readonly<
  Record<OrderStatus, Readonly<Partial<Record<OrderStatus, readonly Actor[]>>>>
> = {
  AWAITING_PHARMACIST: {
    APPROVED: ['PHARMACIST'], // approved exactly as the customer asked
    AWAITING_CUSTOMER: ['PHARMACIST'], // pharmacist changed something or offered a generic
    ON_HOLD_REUPLOAD: ['PHARMACIST'], // prescription unreadable or incomplete
    REJECTED: ['PHARMACIST'],
    CANCELLED: ['CUSTOMER'],
  },
  ON_HOLD_REUPLOAD: {
    AWAITING_PHARMACIST: ['CUSTOMER'], // customer uploaded a new photo
    REJECTED: ['PHARMACIST'],
    CANCELLED: ['CUSTOMER'],
  },
  AWAITING_CUSTOMER: {
    APPROVED: ['CUSTOMER'], // customer accepted the changes / chose keep or switch
    CANCELLED: ['CUSTOMER'],
  },
  APPROVED: {
    ASSIGNED: ['SYSTEM'], // a store with every item in stock was found and reserved
    AWAITING_STOCK: ['SYSTEM'], // no store within range has every item
    CANCELLED: ['CUSTOMER'],
  },
  AWAITING_STOCK: {
    ASSIGNED: ['SYSTEM'], // retried after a stock import or by operations
    CANCELLED: ['CUSTOMER', 'OPS'],
  },
  ASSIGNED: {
    PICKING: ['PHARMACIST'],
    CANCELLED: ['CUSTOMER'], // last point where the customer can cancel
  },
  PICKING: {
    PACKED: ['PHARMACIST'],
  },
  PACKED: {
    OUT_FOR_DELIVERY: ['PHARMACIST'],
  },
  OUT_FOR_DELIVERY: {
    DELIVERED: ['PHARMACIST'],
  },
  DELIVERED: {},
  REJECTED: {},
  CANCELLED: {},
};

/** Statuses protected by the database dispatch gate (plan rule B7). */
export const FULFILMENT_STATUSES: readonly OrderStatus[] = [
  'PICKING',
  'PACKED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

/** Statuses where store stock is reserved for the order. */
export const STOCK_RESERVED_STATUSES: readonly OrderStatus[] = ['ASSIGNED', 'PICKING', 'PACKED'];

export function allowedNextStatuses(from: OrderStatus, actor: Actor): OrderStatus[] {
  const moves = ORDER_TRANSITIONS[from];
  return (Object.keys(moves) as OrderStatus[]).filter((to) => moves[to]?.includes(actor));
}

export function canTransition(from: OrderStatus, to: OrderStatus, actor: Actor): boolean {
  return ORDER_TRANSITIONS[from][to]?.includes(actor) ?? false;
}

export function isTerminal(status: OrderStatus): boolean {
  return Object.keys(ORDER_TRANSITIONS[status]).length === 0;
}

export function canCustomerCancel(status: OrderStatus): boolean {
  return canTransition(status, 'CANCELLED', 'CUSTOMER');
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
    readonly actor: Actor,
  ) {
    super(`An order can't move from ${from} to ${to} (requested by ${actor}).`);
    this.name = 'InvalidTransitionError';
  }
}

/** Throws InvalidTransitionError when the move isn't in the table. */
export function assertTransition(from: OrderStatus, to: OrderStatus, actor: Actor): void {
  if (!canTransition(from, to, actor)) {
    throw new InvalidTransitionError(from, to, actor);
  }
}
