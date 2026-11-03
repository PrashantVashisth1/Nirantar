import { parse } from 'csv-parse/sync';

/**
 * Validates a daily stock CSV (plan §6.4). Pure: it only needs the known
 * store codes and SKUs. Nothing is written until the preview is applied.
 *
 * Format: store_code,sku,on_hand  (header required, any column order)
 */
export interface StockCsvIssue {
  row: number;
  column: string;
  value: string;
  message: string;
}

export interface ParsedStockRow {
  storeCode: string;
  sku: string;
  onHand: number;
}

export interface StockCsvResult {
  rows: ParsedStockRow[];
  errors: StockCsvIssue[];
  /** File-level problem (bad header, empty file): nothing can be previewed. */
  fileError: string | null;
  rowCount: number;
}

const REQUIRED = ['store_code', 'sku', 'on_hand'] as const;
export const MAX_STOCK_ROWS = 20_000;

export function parseStockCsv(
  text: string,
  known: { storeCodes: Set<string>; skus: Set<string> },
): StockCsvResult {
  let records: string[][];
  try {
    records = parse(text.replace(/^\u{FEFF}/u, ''), { skip_empty_lines: true, trim: true, relax_column_count: true });
  } catch {
    return { rows: [], errors: [], fileError: 'The file could not be read as CSV.', rowCount: 0 };
  }

  const [header, ...body] = records;
  if (!header) return { rows: [], errors: [], fileError: 'The file is empty.', rowCount: 0 };
  const columns = header.map((h) => h.toLowerCase());
  const missing = REQUIRED.filter((c) => !columns.includes(c));
  if (missing.length > 0) {
    return { rows: [], errors: [], fileError: `Missing column(s): ${missing.join(', ')}. Expected header: store_code,sku,on_hand`, rowCount: 0 };
  }
  if (body.length === 0) return { rows: [], errors: [], fileError: 'The file has a header but no rows.', rowCount: 0 };
  if (body.length > MAX_STOCK_ROWS) {
    return { rows: [], errors: [], fileError: `Too many rows (max ${MAX_STOCK_ROWS}).`, rowCount: body.length };
  }

  const at = (record: string[], name: string) => record[columns.indexOf(name)] ?? '';
  const errors: StockCsvIssue[] = [];
  const seen = new Map<string, { onHand: number; row: number }>();
  const rows: ParsedStockRow[] = [];

  body.forEach((record, index) => {
    const row = index + 2; // +1 for the header, +1 for 1-based numbering
    const storeCode = at(record, 'store_code').toUpperCase();
    const sku = at(record, 'sku').toUpperCase();
    const rawQty = at(record, 'on_hand');
    let ok = true;

    if (!known.storeCodes.has(storeCode)) {
      errors.push({ row, column: 'store_code', value: storeCode, message: 'Unknown store code' });
      ok = false;
    }
    if (!known.skus.has(sku)) {
      errors.push({ row, column: 'sku', value: sku, message: 'Unknown SKU' });
      ok = false;
    }
    const onHand = Number(rawQty);
    if (!/^\d+$/.test(rawQty) || onHand > 99_999) {
      errors.push({ row, column: 'on_hand', value: rawQty, message: 'Must be a whole number from 0 to 99999' });
      ok = false;
    }
    if (!ok) return;

    const key = `${storeCode}:${sku}`;
    const previous = seen.get(key);
    if (previous) {
      if (previous.onHand !== onHand) {
        errors.push({
          row,
          column: 'on_hand',
          value: rawQty,
          message: `Conflicts with row ${previous.row} for the same store and SKU`,
        });
      }
      return; // exact duplicates are ignored
    }
    seen.set(key, { onHand, row });
    rows.push({ storeCode, sku, onHand });
  });

  return { rows, errors, fileError: null, rowCount: body.length };
}
