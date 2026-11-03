/**
 * Business dates are Indian calendar dates (IST, UTC+5:30). We store
 * timestamps in UTC, but "runs out on 13 Nov" or "today" must mean the date in
 * Kolkata, not in London where the server clock might be.
 */
const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

/** The IST calendar date of an instant, as "YYYY-MM-DD". */
export function istDateString(instant: Date = new Date()): string {
  return new Date(instant.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** A "YYYY-MM-DD" date as a Date at 00:00 UTC (how Postgres DATE values arrive). */
export function dateOnly(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

/** Whole days from one calendar date to another (negative if `to` is earlier). */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfUtcDay(to) - startOfUtcDay(from)) / DAY_MS);
}

/** Adds whole days to a calendar date. */
export function addDays(date: Date, days: number): Date {
  return new Date(startOfUtcDay(date) + days * DAY_MS);
}

/** Today's IST calendar date as a Date at 00:00 UTC. */
export function todayIst(now: Date = new Date()): Date {
  return dateOnly(istDateString(now));
}

function startOfUtcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}
