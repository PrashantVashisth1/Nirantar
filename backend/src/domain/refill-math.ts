import { addDays, REMINDER_OFFSETS_DAYS } from '@nirantar/shared';

/**
 * Refill maths (plan §6.5). Uses ONLY the dose and quantity a pharmacist
 * confirmed; never AI output. Returns a reason instead of a guess when the
 * supply can't be calculated honestly.
 */
export interface RefillInput {
  packs: number;
  packUnits: number;
  form: string;
  doseMorning: number | null;
  doseNoon: number | null;
  doseNight: number | null;
  asNeeded: boolean;
  /** Date the medicine reached the patient. */
  fillDate: Date;
  /** Run-out date of the previous fill, if any (for early reorders). */
  previousRunOut?: Date | null;
}

export type RefillResult =
  | { ok: true; dailyUnits: number; daysSupply: number; runOutOn: Date }
  | { ok: false; reason: 'AS_NEEDED' | 'NOT_SOLID_ORAL' | 'NO_CONFIRMED_DOSE' };

const SOLID_ORAL = new Set(['TABLET', 'CAPSULE']);

export function calculateRefill(input: RefillInput): RefillResult {
  if (input.asNeeded) return { ok: false, reason: 'AS_NEEDED' };
  if (!SOLID_ORAL.has(input.form)) return { ok: false, reason: 'NOT_SOLID_ORAL' };
  if (input.doseMorning === null && input.doseNoon === null && input.doseNight === null) {
    return { ok: false, reason: 'NO_CONFIRMED_DOSE' };
  }
  const dailyUnits = (input.doseMorning ?? 0) + (input.doseNoon ?? 0) + (input.doseNight ?? 0);
  if (dailyUnits <= 0) return { ok: false, reason: 'NO_CONFIRMED_DOSE' };

  const units = input.packs * input.packUnits; // e.g. 4 strips × 15 = 60 tablets
  const daysSupply = Math.floor(units / dailyUnits); // 60 ÷ 2 a day = 30 days
  // Reordering early stacks on what's left, so reminders don't come too soon.
  const start =
    input.previousRunOut && input.previousRunOut > input.fillDate ? input.previousRunOut : input.fillDate;
  return { ok: true, dailyUnits, daysSupply, runOutOn: addDays(start, daysSupply) };
}

/**
 * Which reminder is due on `asOf`: the most recent offset whose day has
 * arrived (5, 2 or 0 days before run-out). Older unsent offsets are skipped
 * so nobody gets three messages at once.
 */
export function dueReminderOffset(
  runOutOn: Date,
  asOf: Date,
  offsets: readonly number[] = REMINDER_OFFSETS_DAYS,
): number | null {
  const due = offsets.filter((offset) => asOf >= addDays(runOutOn, -offset));
  return due.length === 0 ? null : Math.min(...due);
}
