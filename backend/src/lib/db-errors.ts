import { AppError } from './errors';

/**
 * Turns errors raised by our database rules (triggers and CHECK constraints in
 * the safety_rules migration) into clear 422 responses. Without this they
 * would surface as a generic 500.
 */
const TRIGGER_MARKER = /NIRANTAR:([A-Z_]+):\s*([^\n"\\]*)/;

const CONSTRAINTS: Record<string, { code: string; message: string }> = {
  orders_invoice_when_packed: {
    code: 'INVOICE_REQUIRED',
    message: 'Enter the store invoice number to mark this order packed.',
  },
  orders_paid_before_handover: {
    code: 'PAYMENT_REQUIRED',
    message: 'This UPI order has not been paid yet, so it cannot be handed over.',
  },
  orders_store_when_assigned: {
    code: 'STORE_REQUIRED',
    message: 'This order has no store assigned.',
  },
  store_stock_non_negative: {
    code: 'STOCK_NEGATIVE',
    message: 'Stock cannot go below zero.',
  },
};

function errorText(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error);
  const e = error as { message?: unknown; cause?: { message?: unknown }; meta?: unknown };
  return [e.message, e.cause?.message, e.meta ? JSON.stringify(e.meta) : '']
    .filter((part) => typeof part === 'string')
    .join(' ');
}

export function appErrorFromDatabase(error: unknown): AppError | null {
  const text = errorText(error);

  const marker = TRIGGER_MARKER.exec(text);
  if (marker) {
    const [, code, detail] = marker;
    return new AppError(422, code!, detail!.trim());
  }

  for (const [constraint, mapped] of Object.entries(CONSTRAINTS)) {
    if (text.includes(constraint)) return new AppError(422, mapped.code, mapped.message);
  }

  // Unique constraint (Prisma error code P2002), e.g. a duplicate invoice number.
  if ((error as { code?: unknown })?.code === 'P2002') {
    return new AppError(409, 'ALREADY_EXISTS', 'That value is already in use.');
  }

  return null;
}
