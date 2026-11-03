import { z } from 'zod';
import { CUSTOMER_CHOICES, PAYMENT_METHODS, REJECTION_REASONS, REUPLOAD_REASONS } from '../enums';

const id = z.uuid();
const quantity = z.number().int().min(1).max(30);

export const CartItemSchema = z.object({ productId: id, quantity }).strict();

export const QuoteSchema = z
  .object({
    patientId: id,
    addressId: id.optional(),
    prescriptionId: id.optional(),
    items: z.array(CartItemSchema).min(1).max(20),
  })
  .strict();

export const PlaceOrderSchema = z
  .object({
    patientId: id,
    addressId: id,
    prescriptionId: id.optional(),
    items: z.array(CartItemSchema).min(1, 'Add at least one medicine.').max(20),
    paymentMethod: z.enum(PAYMENT_METHODS),
    remindersOptIn: z.boolean(),
    note: z.string().trim().max(500).optional(),
    source: z.enum(['NEW', 'REFILL']).default('NEW'),
  })
  .strict();

export const NewAddressSchema = z
  .object({
    label: z.string().trim().min(1).max(40),
    line1: z.string().trim().min(3, 'Enter the house and street.').max(200),
    line2: z.string().trim().max(200).optional(),
    localityId: z.string().min(1),
    pincode: z.string().regex(/^[1-9]\d{5}$/, 'Enter a 6-digit pincode.'),
  })
  .strict();

const Dose = z.object({
  morning: z.number().min(0).max(4),
  noon: z.number().min(0).max(4),
  night: z.number().min(0).max(4),
});

/** The pharmacist's whole decision on an order, submitted at once (plan §6.2). */
export const ApproveOrderSchema = z
  .object({
    version: z.number().int(),
    prescription: z
      .object({
        prescriberName: z.string().trim().min(1, "Enter the prescriber's name.").max(120),
        prescriberRegNo: z.string().trim().max(60).optional(),
        prescribedOn: z.iso.date(),
        patientNameOnRx: z.string().trim().max(120).optional(),
      })
      .strict()
      .optional(),
    items: z
      .array(
        z
          .object({
            itemId: id.optional(),
            productId: id,
            quantity,
            decision: z.enum(['APPROVE', 'REMOVE']),
            removedReason: z.string().trim().max(200).optional(),
            dose: Dose.nullable(),
            asNeeded: z.boolean().default(false),
            durationDays: z.number().int().min(1).max(365).nullable(),
            offerGenericProductId: id.nullable().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    confirmedValid: z.literal(true, { error: 'Confirm the prescription is valid and matches the patient.' }),
  })
  .strict();

export const RejectOrderSchema = z
  .object({ version: z.number().int(), reason: z.enum(REJECTION_REASONS), note: z.string().trim().max(500).optional() })
  .strict();

export const ReuploadRequestSchema = z
  .object({ version: z.number().int(), reason: z.enum(REUPLOAD_REASONS), note: z.string().trim().max(500).optional() })
  .strict();

export const CustomerDecisionSchema = z
  .object({
    version: z.number().int(),
    choices: z.array(z.object({ itemId: id, choice: z.enum(CUSTOMER_CHOICES) }).strict()).max(20),
  })
  .strict();

export type ApproveOrderInput = z.input<typeof ApproveOrderSchema>;
export type PlaceOrderInput = z.input<typeof PlaceOrderSchema>;
