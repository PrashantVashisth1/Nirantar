import { parseDose } from '../src/domain/dosage';
import type { Extraction } from '../src/services/ai/extraction';
import type { EvalLabel } from './ai-eval-labels';

export interface DraftForScoring {
  aiStatus: string;
  lines: { productId: string | null; dose: { morning: number; noon: number; night: number } | null }[];
  extraction: Extraction;
}

export interface SampleScore {
  file: string;
  kind: EvalLabel['kind'];
  aiStatus: string;
  expected: number;
  /** Expected lines whose exact product (so also strength) was selected. */
  matched: number;
  /** Matched lines where the dose was also right. */
  doseCorrect: number;
  /** Lines where a product was selected that isn't on the paper. This should stay 0. */
  wrongProduct: number;
  patientCorrect: boolean | null;
  /** Blurry and non-prescription photos must not look like a confident read. */
  safe: boolean;
}

const same = (a: string | null, b: string | undefined) =>
  Boolean(a && b && a.toLowerCase().replace(/[^a-z]/g, '').includes(b.toLowerCase().replace(/[^a-z]/g, '')));

/** Compares one read with the right answers. `idOf` turns a SKU into a product id. */
export function scoreSample(label: EvalLabel, draft: DraftForScoring, idOf: (sku: string) => string): SampleScore {
  const expectedIds = new Set(label.lines.map((l) => idOf(l.sku)));
  let matched = 0;
  let doseCorrect = 0;
  for (const expected of label.lines) {
    const found = draft.lines.find((l) => l.productId === idOf(expected.sku));
    if (!found) continue;
    matched += 1;
    const dose = parseDose(expected.dose);
    if (dose && found.dose && dose.morning === found.dose.morning && dose.noon === found.dose.noon && dose.night === found.dose.night) doseCorrect += 1;
  }
  const wrongProduct = draft.lines.filter((l) => l.productId !== null && !expectedIds.has(l.productId)).length;
  const safe = label.kind === 'blurry' || label.kind === 'not_rx' ? draft.aiStatus !== 'READY' && wrongProduct === 0 : wrongProduct === 0;

  return {
    file: label.file,
    kind: label.kind,
    aiStatus: draft.aiStatus,
    expected: label.lines.length,
    matched,
    doseCorrect,
    wrongProduct,
    patientCorrect: label.patient ? same(draft.extraction.patientName.value, label.patient) : null,
    safe,
  };
}
