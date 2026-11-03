import { z } from 'zod';
import { LOCALES, RELATIONS } from '../enums';
import { normalizeIndianMobile } from '../phone';

/** A 10-digit Indian mobile number in any common format, normalised to +91XXXXXXXXXX. */
export const PhoneSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const normalized = normalizeIndianMobile(value);
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: 'Enter a 10-digit Indian mobile number.' });
      return z.NEVER;
    }
    return normalized;
  });

export const OtpRequestSchema = z.object({ phone: PhoneSchema }).strict();

export const OtpVerifySchema = z
  .object({
    phone: PhoneSchema,
    code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code.'),
  })
  .strict();

export const StaffLoginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(200),
    password: z.string().min(1, 'Enter your password.').max(200),
  })
  .strict();

/** Profile updates, including first-time onboarding for customers. */
export const UpdateMeSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter your name.').max(80).optional(),
    locale: z.enum(LOCALES).optional(),
    /** Must be exactly true: consent can be given here, withdrawal is a separate action. */
    consentToStorePrescriptions: z.literal(true).optional(),
    remindersOptIn: z.boolean().optional(),
  })
  .strict();

export const NewPatientSchema = z
  .object({
    fullName: z.string().trim().min(1, 'Enter a name.').max(80),
    relation: z.enum(RELATIONS),
    birthYear: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
  })
  .strict();

export type OtpRequestInput = z.input<typeof OtpRequestSchema>;
export type OtpVerifyInput = z.input<typeof OtpVerifySchema>;
export type StaffLoginInput = z.input<typeof StaffLoginSchema>;
export type UpdateMeInput = z.input<typeof UpdateMeSchema>;
export type NewPatientInput = z.input<typeof NewPatientSchema>;
