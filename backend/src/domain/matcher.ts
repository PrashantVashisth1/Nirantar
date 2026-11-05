/**
 * Matches a medicine line read from a prescription to our catalog (plan §8).
 * Deterministic and explainable: name similarity + exact strength. The AI
 * never chooses a product, and a different strength is NEVER auto-selected.
 */
export interface CatalogProduct {
  id: string;
  name: string;
  molecule: string;
  strength: string;
  aliases: string[];
  packUnits: number;
  isGeneric: boolean;
}

export type MatchQuality = 'STRONG' | 'CHECK' | 'NONE';

const FORM_WORDS = /\b(tab|tabs|tablet|tablets|cap|caps|capsule|capsules|syp|syrup|inj|injection|t\.|c\.)\b/gi;

export function normalizeName(text: string): string {
  return text.toLowerCase().replace(FORM_WORDS, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** "500mg", "0.5 g", "50 µg" -> "500mg", "500mg", "50mcg". */
export function normalizeStrength(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = /(\d+(?:\.\d+)?)\s*(mg|mcg|µg|ug|g|ml|iu|%)/i.exec(text);
  if (!match) return null;
  let value = Number(match[1]);
  let unit = match[2]!.toLowerCase();
  if (unit === 'µg' || unit === 'ug') unit = 'mcg';
  if (unit === 'g') {
    value *= 1000;
    unit = 'mg';
  }
  return `${value}${unit}`;
}

function firstNumber(text: string | null | undefined): number | null {
  const match = /\d+(?:\.\d+)?/.exec(text ?? '');
  return match ? Number(match[0]) : null;
}

/** Dice similarity of letter pairs: 1 = same, 0 = nothing in common. Robust to small typos. */
export function similarity(a: string, b: string): number {
  const x = a.replace(/ /g, '');
  const y = b.replace(/ /g, '');
  if (!x || !y) return 0;
  if (x === y) return 1;
  const pairs = (s: string) => {
    const result = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) result.set(s.slice(i, i + 2), (result.get(s.slice(i, i + 2)) ?? 0) + 1);
    return result;
  };
  const px = pairs(x);
  const py = pairs(y);
  let overlap = 0;
  for (const [pair, count] of px) overlap += Math.min(count, py.get(pair) ?? 0);
  return (2 * overlap) / (x.length - 1 + (y.length - 1));
}

function nameScore(written: string, product: CatalogProduct): number {
  const w = normalizeName(written);
  // Compare against the brand, the molecule and known aliases; also against the
  // written name without its trailing number ("glycora 500" -> "glycora").
  const wNoNumber = w.replace(/\d+(\.\d+)?/g, '').trim();
  const targets = [product.name, product.molecule, ...product.aliases].map(normalizeName);
  return Math.max(...targets.flatMap((t) => [similarity(w, t), similarity(wNoNumber, t.replace(/\d+(\.\d+)?/g, '').trim())]));
}

export interface MatchResult {
  quality: MatchQuality;
  productId: string | null;
  candidateIds: string[];
}

export function matchLine(
  medicineName: string | null,
  strengthText: string | null,
  catalog: CatalogProduct[],
): MatchResult {
  if (!medicineName) return { quality: 'NONE', productId: null, candidateIds: [] };
  const writtenStrength = normalizeStrength(strengthText) ?? normalizeStrength(medicineName);
  // Handwritten brands usually have no unit: "Glimora 2" means 2 mg, "Thyrova 100" means 100 mcg.
  const writtenNumber = writtenStrength === null ? (firstNumber(strengthText) ?? firstNumber(medicineName)) : null;
  const strengthKnown = writtenStrength !== null || writtenNumber !== null;

  const scored = catalog
    .map((product) => {
      const name = nameScore(medicineName, product);
      const productStrength = normalizeStrength(product.strength);
      const matches =
        writtenStrength !== null
          ? productStrength === writtenStrength
          : writtenNumber !== null && firstNumber(product.strength) === writtenNumber;
      const strength = !strengthKnown ? 0.5 : matches ? 1 : 0;
      return { product, name, strengthMatches: matches, score: 0.7 * name + 0.3 * strength };
    })
    // Brands before generics when scores tie: the pharmacist offers generics separately.
    .sort((a, b) => b.score - a.score || Number(a.product.isGeneric) - Number(b.product.isGeneric));

  const candidateIds = scored.filter((s) => s.name >= 0.4).slice(0, 5).map((s) => s.product.id);
  const best = scored[0];
  if (!best || best.name < 0.5) return { quality: 'NONE', productId: null, candidateIds };
  if (strengthKnown && !best.strengthMatches) {
    // The name matches but we don't stock that strength: never substitute another strength.
    return { quality: 'NONE', productId: null, candidateIds };
  }
  if (!strengthKnown) {
    // No strength written, and we stock this medicine in several: choosing one would be a guess.
    const bestStrength = normalizeStrength(best.product.strength);
    const ambiguous = scored.some((s) => s.name >= best.name - 0.05 && normalizeStrength(s.product.strength) !== bestStrength);
    if (ambiguous) return { quality: 'NONE', productId: null, candidateIds };
  }
  const quality: MatchQuality = best.score >= 0.8 && best.strengthMatches ? 'STRONG' : 'CHECK';
  return { quality, productId: best.product.id, candidateIds };
}

/** Packs to suggest: from "#60" / "60 tabs" / "2 strips", else dose × days; pharmacist confirms. */
export function suggestPacks(opts: {
  quantityText: string | null;
  dailyUnits: number | null;
  durationDays: number | null;
  packUnits: number;
}): number {
  const q = opts.quantityText ?? '';
  const packs = /(\d+)\s*(strip|strips|bottle|bottles|pack|packs|box)/i.exec(q);
  if (packs) return clamp(Number(packs[1]));
  const units = /#?\s*(\d+)\s*(tab|tabs|tablets|cap|caps|capsules)?/i.exec(q);
  if (units && Number(units[1]) > 0) return clamp(Math.ceil(Number(units[1]) / opts.packUnits));
  if (opts.dailyUnits && opts.durationDays) return clamp(Math.ceil((opts.dailyUnits * opts.durationDays) / opts.packUnits));
  return 1;
}

const clamp = (n: number) => Math.min(30, Math.max(1, n));
