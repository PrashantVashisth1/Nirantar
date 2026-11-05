/**
 * Measures the prescription reader on our labelled synthetic set (plan §8).
 *
 *   npm run ai:eval              every sample; writes docs/ai-eval-results.json
 *   npm run ai:eval -- --limit 1 one sample: a quick check that the key works
 *
 * Needs GEMINI_API_KEY in backend/.env and a seeded database (for the catalog).
 * Only synthetic images are ever sent.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { env } from '../src/config/env';
import { prisma } from '../src/lib/db';
import { GeminiReader } from '../src/services/ai/gemini-reader';
import { buildDraft, loadCatalog } from '../src/services/prescriptions/prescription.service';
import { EVAL_LABELS } from './ai-eval-labels';
import { scoreSample, type SampleScore } from './ai-eval-score';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SAMPLES = path.join(ROOT, 'frontend', 'public', 'samples');
/** Free-tier quota is per minute, so samples are spaced out. */
const GAP_MS = 6_000;

function explain(detail: string): string {
  if (/api.?key|401|403|permission|unauth/i.test(detail)) return 'The key was refused. Check GEMINI_API_KEY in backend/.env (no quotes, no spaces) and that it is restricted to the Gemini API.';
  if (/404|not found/i.test(detail)) return `The model "${env.GEMINI_MODEL}" isn't available for this key. Try GEMINI_MODEL=gemini-3.6-flash in backend/.env.`;
  if (/429|quota|rate|exhausted/i.test(detail)) return 'Free-tier quota reached. Wait a minute (or until tomorrow for the daily limit) and run again.';
  return 'Provider error. Run again; if it repeats, check the message above.';
}

async function main() {
  if (!env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set in backend/.env, so there is nothing to evaluate.');
    process.exitCode = 1;
    return;
  }
  const limitAt = process.argv.indexOf('--limit');
  const limit = limitAt > -1 ? Number(process.argv[limitAt + 1]) : Infinity;

  const reader = new GeminiReader(env.GEMINI_API_KEY);
  const catalog = await loadCatalog();
  if (catalog.length === 0) {
    console.error('The catalog is empty. Run: npm run db:seed');
    process.exitCode = 1;
    return;
  }
  const idBySku = new Map(catalog.map((p) => [(p as unknown as { sku: string }).sku, p.id]));
  const idOf = (sku: string) => idBySku.get(sku) ?? sku;

  const labels = EVAL_LABELS.filter((l) => existsSync(path.join(SAMPLES, `${l.file}.jpg`))).slice(0, limit);
  const skipped = EVAL_LABELS.filter((l) => !existsSync(path.join(SAMPLES, `${l.file}.jpg`))).map((l) => l.file);
  console.log(`Model: ${env.GEMINI_MODEL} · samples: ${labels.length}${skipped.length ? ` · not found, skipped: ${skipped.join(', ')}` : ''}\n`);

  const scores: (SampleScore & { latencyMs: number })[] = [];
  const failures: { file: string; error: string }[] = [];
  for (const [index, label] of labels.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, GAP_MS));
    // The same clean-up an upload gets, so the model sees what it would see in production.
    const image = await sharp(readFileSync(path.join(SAMPLES, `${label.file}.jpg`)))
      .rotate()
      .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    const started = Date.now();
    const result = await reader.read(image, 'image/jpeg');
    const latencyMs = Date.now() - started;

    if (!result.ok) {
      failures.push({ file: label.file, error: result.error });
      console.log(`${label.file.padEnd(20)} FAILED ${result.error} ${result.detail ?? ''}`);
      console.log(`  → ${explain(`${result.error} ${result.detail ?? ''}`)}\n`);
      // A refused key or missing model fails the same way for every sample.
      if (/api.?key|401|403|404|permission|unauth|not found/i.test(result.detail ?? '')) break;
      continue;
    }
    const built = buildDraft(result.extraction, catalog);
    const draft = built.aiDraft as unknown as { lines: { productId: string | null; dose: { morning: number; noon: number; night: number } | null }[] };
    const score = scoreSample(label, { aiStatus: built.aiStatus, lines: draft.lines, extraction: result.extraction }, idOf);
    scores.push({ ...score, latencyMs });
    console.log(
      `${label.file.padEnd(20)} ${score.aiStatus.padEnd(10)} matched ${score.matched}/${score.expected} · dose ${score.doseCorrect}/${score.expected} · wrong product ${score.wrongProduct} · ${(latencyMs / 1000).toFixed(1)} s`,
    );
  }

  const readable = scores.filter((s) => s.kind !== 'blurry' && s.kind !== 'not_rx');
  const sum = (key: 'expected' | 'matched' | 'doseCorrect' | 'wrongProduct') => readable.reduce((total, s) => total + s[key], 0);
  const groups = ['typed', 'handwriting_font', 'handwritten_photo'].map((kind) => {
    const rows = readable.filter((s) => s.kind === kind);
    return {
      kind,
      samples: rows.length,
      linesExpected: rows.reduce((t, s) => t + s.expected, 0),
      linesMatched: rows.reduce((t, s) => t + s.matched, 0),
      dosesCorrect: rows.reduce((t, s) => t + s.doseCorrect, 0),
    };
  });
  const latencies = scores.map((s) => s.latencyMs).sort((a, b) => a - b);
  const summary = {
    model: env.GEMINI_MODEL,
    runAt: new Date().toISOString(),
    samplesRead: scores.length,
    failures,
    linesExpected: sum('expected'),
    linesMatched: sum('matched'),
    dosesCorrect: sum('doseCorrect'),
    wrongProductSelected: scores.reduce((t, s) => t + s.wrongProduct, 0),
    unsafeReads: scores.filter((s) => !s.safe).map((s) => s.file),
    patientNamesCorrect: readable.filter((s) => s.patientCorrect).length,
    medianLatencySeconds: latencies.length ? Number((latencies[Math.floor(latencies.length / 2)]! / 1000).toFixed(1)) : null,
    byKind: groups,
    note: 'Measured on a small synthetic set, so this does not prove accuracy on real prescriptions.',
  };

  console.log('\n', summary);
  if (limit === Infinity && scores.length > 0) {
    writeFileSync(path.join(ROOT, 'docs', 'ai-eval-results.json'), `${JSON.stringify({ summary, scores }, null, 2)}\n`);
    console.log('\nSaved to docs/ai-eval-results.json');
  }
  if (scores.length === 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
