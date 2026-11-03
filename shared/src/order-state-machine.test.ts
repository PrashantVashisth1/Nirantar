import { describe, expect, it } from 'vitest';
import { ORDER_STATUSES } from './enums';
import {
  ORDER_TRANSITIONS,
  allowedNextStatuses,
  assertTransition,
  canCustomerCancel,
  canTransition,
  InvalidTransitionError,
  isTerminal,
} from './order-state-machine';

describe('order state machine', () => {
  it('has an entry for every order status', () => {
    expect(Object.keys(ORDER_TRANSITIONS).sort()).toEqual([...ORDER_STATUSES].sort());
  });

  it('only lets a pharmacist decide on an order waiting for verification', () => {
    expect(canTransition('AWAITING_PHARMACIST', 'APPROVED', 'PHARMACIST')).toBe(true);
    expect(canTransition('AWAITING_PHARMACIST', 'APPROVED', 'CUSTOMER')).toBe(false);
    expect(canTransition('AWAITING_PHARMACIST', 'APPROVED', 'OPS')).toBe(false);
    expect(canTransition('AWAITING_PHARMACIST', 'REJECTED', 'PHARMACIST')).toBe(true);
    expect(canTransition('AWAITING_PHARMACIST', 'ON_HOLD_REUPLOAD', 'PHARMACIST')).toBe(true);
  });

  it('never allows skipping verification straight to fulfilment', () => {
    for (const to of ['ASSIGNED', 'PICKING', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED'] as const) {
      for (const actor of ['CUSTOMER', 'PHARMACIST', 'OPS', 'SYSTEM'] as const) {
        expect(canTransition('AWAITING_PHARMACIST', to, actor)).toBe(false);
      }
    }
  });

  it('routes approved orders only through the system router', () => {
    expect(allowedNextStatuses('APPROVED', 'SYSTEM').sort()).toEqual(['ASSIGNED', 'AWAITING_STOCK']);
    expect(canTransition('APPROVED', 'ASSIGNED', 'PHARMACIST')).toBe(false);
  });

  it('follows the fulfilment steps in order: pick, pack, hand over, deliver', () => {
    expect(canTransition('ASSIGNED', 'PICKING', 'PHARMACIST')).toBe(true);
    expect(canTransition('PICKING', 'PACKED', 'PHARMACIST')).toBe(true);
    expect(canTransition('PACKED', 'OUT_FOR_DELIVERY', 'PHARMACIST')).toBe(true);
    expect(canTransition('OUT_FOR_DELIVERY', 'DELIVERED', 'PHARMACIST')).toBe(true);
    // no skipping steps
    expect(canTransition('ASSIGNED', 'PACKED', 'PHARMACIST')).toBe(false);
    expect(canTransition('PICKING', 'OUT_FOR_DELIVERY', 'PHARMACIST')).toBe(false);
  });

  it('lets the customer return an on-hold order to the queue by re-uploading', () => {
    expect(canTransition('ON_HOLD_REUPLOAD', 'AWAITING_PHARMACIST', 'CUSTOMER')).toBe(true);
  });

  it('lets the customer confirm changes, which approves the order', () => {
    expect(canTransition('AWAITING_CUSTOMER', 'APPROVED', 'CUSTOMER')).toBe(true);
    expect(canTransition('AWAITING_CUSTOMER', 'APPROVED', 'PHARMACIST')).toBe(false);
  });

  it('allows customer cancellation only before picking starts', () => {
    expect(canCustomerCancel('AWAITING_PHARMACIST')).toBe(true);
    expect(canCustomerCancel('ASSIGNED')).toBe(true);
    expect(canCustomerCancel('PICKING')).toBe(false);
    expect(canCustomerCancel('OUT_FOR_DELIVERY')).toBe(false);
    expect(canCustomerCancel('DELIVERED')).toBe(false);
  });

  it('treats delivered, rejected and cancelled as final', () => {
    expect(isTerminal('DELIVERED')).toBe(true);
    expect(isTerminal('REJECTED')).toBe(true);
    expect(isTerminal('CANCELLED')).toBe(true);
    expect(isTerminal('PACKED')).toBe(false);
  });

  it('throws a clear error for an invalid move', () => {
    expect(() => assertTransition('DELIVERED', 'PICKING', 'PHARMACIST')).toThrow(
      InvalidTransitionError,
    );
    expect(() => assertTransition('ASSIGNED', 'PICKING', 'PHARMACIST')).not.toThrow();
  });
});
