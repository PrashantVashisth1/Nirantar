/**
 * Turns common prescription dose notation into morning / noon / night tablets.
 * Used ONLY to pre-fill the pharmacist's form; refills use what the
 * pharmacist confirms. Anything we don't recognise returns null (no guessing).
 */
export interface Dose {
  morning: number;
  noon: number;
  night: number;
}

const FRACTIONS: Record<string, number> = { '½': 0.5, '1/2': 0.5, '0.5': 0.5, '1½': 1.5, '1.5': 1.5 };

function amount(token: string): number | null {
  const t = token.trim();
  if (t in FRACTIONS) return FRACTIONS[t]!;
  return /^[0-3]$/.test(t) ? Number(t) : null;
}

const ABBREVIATIONS: Record<string, Dose> = {
  OD: { morning: 1, noon: 0, night: 0 },
  QD: { morning: 1, noon: 0, night: 0 },
  BD: { morning: 1, noon: 0, night: 1 },
  BID: { morning: 1, noon: 0, night: 1 },
  TDS: { morning: 1, noon: 1, night: 1 },
  TID: { morning: 1, noon: 1, night: 1 },
  HS: { morning: 0, noon: 0, night: 1 },
};

export function parseDose(text: string | null | undefined): Dose | null {
  if (!text) return null;
  const pattern = /(½|1½|\d(?:\.\d)?|1\/2)\s*-\s*(½|1½|\d(?:\.\d)?|1\/2)\s*-\s*(½|1½|\d(?:\.\d)?|1\/2)/.exec(text);
  if (pattern) {
    const [morning, noon, night] = [amount(pattern[1]!), amount(pattern[2]!), amount(pattern[3]!)];
    if (morning !== null && noon !== null && night !== null && morning + noon + night > 0) return { morning, noon, night };
    return null;
  }
  const word = /\b(OD|QD|BD|BID|TDS|TID|HS)\b/i.exec(text);
  return word ? ABBREVIATIONS[word[1]!.toUpperCase()]! : null;
}

/** "30 days", "x 30d", "1 month", "2 weeks" -> days. */
export function parseDurationDays(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = /(\d{1,3})\s*(d|day|days|w|wk|week|weeks|m|month|months)\b/i.exec(text);
  if (!match) return null;
  const n = Number(match[1]);
  const unit = match[2]!.toLowerCase();
  const days = unit.startsWith('w') ? n * 7 : unit.startsWith('m') ? n * 30 : n;
  return days > 0 && days <= 365 ? days : null;
}
