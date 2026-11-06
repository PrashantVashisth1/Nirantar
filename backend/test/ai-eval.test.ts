/**
 * Checks the evaluation itself, without calling the AI: given a perfect
 * transcription of every sample, our matcher must pick exactly the right
 * product. So when a real run scores lower, the reader is what missed it.
 */
import { describe, expect, it } from 'vitest';
import { EVAL_LABELS, type EvalLabel } from '../scripts/ai-eval-labels';
import { scoreSample } from '../scripts/ai-eval-score';
import { PRODUCTS } from '../prisma/seed/data';
import type { Extraction } from '../src/services/ai/extraction';
import type { CatalogProduct } from '../src/domain/matcher';
import { buildDraft } from '../src/services/prescriptions/prescription.service';

const catalog = PRODUCTS.filter((p) => p.schedule !== 'X' && p.schedule !== 'NDPS').map(
  (p) => ({ ...p, id: p.sku, aliases: p.aliases ?? [] }) as unknown as CatalogProduct,
);

const known = (value: string | null) => ({ value, confidence: 'high' as const });

function perfectRead(label: EvalLabel): Extraction {
  return {
    isPrescription: true,
    legibility: 'clear',
    prescriberName: known(label.prescriber ?? null),
    prescriberRegNo: known('DEMO-WB-00000'),
    prescribedOn: known('2026-10-01'),
    patientName: known(label.patient ?? null),
    items: label.lines.map((l) => ({
      lineText: `Tab ${l.name} ${l.strength} ${l.dose} x ${l.duration}`,
      medicineName: known(l.name),
      strength: known(l.strength),
      dosageText: known(l.dose),
      durationText: known(l.duration),
      quantityText: known(null),
    })),
    unreadableLineCount: 0,
  };
}

function scorePerfect(label: EvalLabel) {
  const extraction = perfectRead(label);
  const built = buildDraft(extraction, catalog);
  const draft = built.aiDraft as unknown as { lines: { productId: string | null; dose: { morning: number; noon: number; night: number } | null }[] };
  return scoreSample(label, { aiStatus: built.aiStatus, lines: draft.lines, extraction }, (sku) => sku);
}

describe('reads of poor photos', () => {
  const statusOf = (legibility: Extraction['legibility'], name: string, confidence: 'high' | 'medium' | 'low') => {
    const extraction: Extraction = {
      ...perfectRead(EVAL_LABELS.find((l) => l.file === 'rx-debasish')!),
      legibility,
    };
    extraction.items[0] = { ...extraction.items[0]!, medicineName: { value: name, confidence } };
    const built = buildDraft(extraction, catalog);
    return { status: built.aiStatus, line: (built.aiDraft as unknown as { lines: { productId: string | null; candidateIds: string[] }[] }).lines[0]! };
  };

  // Seen on a real blurred photo: the model returned a medicine that isn't on the paper.
  it('asks for a new photo when a hard-to-read photo matches nothing', () => {
    expect(statusOf('partly_legible', 'Pyrexia', 'medium').status).toBe('UNREADABLE');
  });

  it('keeps a clear photo of a medicine we do not stock for the pharmacist, not for a retake', () => {
    expect(statusOf('clear', 'Pyrexia', 'high').status).toBe('UNSURE');
  });

  it('never selects a product from a name the AI itself doubts, but still lists it', () => {
    const { line } = statusOf('partly_legible', 'Amlora', 'low');
    expect(line.productId).toBeNull();
    expect(line.candidateIds).toContain('AML5-S10');
  });
});

describe('AI evaluation labels', () => {
  it.each(EVAL_LABELS.filter((l) => l.lines.length > 0).map((l) => [l.file, l] as const))(
    '%s: a perfect read matches every medicine and dose',
    (_file, label) => {
      const score = scorePerfect(label);
      expect(score.matched).toBe(label.lines.length);
      expect(score.doseCorrect).toBe(label.lines.length);
      expect(score.wrongProduct).toBe(0);
    },
  );

  it('counts a wrong strength as a wrong product, and a confident read of a blurry photo as unsafe', () => {
    const label = EVAL_LABELS.find((l) => l.file === 'rx-debasish')!;
    const extraction = perfectRead(label);
    const score = scoreSample(label, { aiStatus: 'READY', lines: [{ productId: 'AML10', dose: null }], extraction }, (sku) => sku);
    expect(score).toMatchObject({ matched: 0, wrongProduct: 1, safe: false });

    const blurry = EVAL_LABELS.find((l) => l.file === 'rx-blurry')!;
    expect(scoreSample(blurry, { aiStatus: 'READY', lines: [], extraction }, (sku) => sku).safe).toBe(false);
    expect(scoreSample(blurry, { aiStatus: 'UNREADABLE', lines: [], extraction }, (sku) => sku).safe).toBe(true);
  });
});
