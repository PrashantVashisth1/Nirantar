/**
 * Daily stock CSV import (plan §6.4): upload → preview (nothing changes) →
 * apply in ONE transaction, only when there are zero errors.
 *
 * Stock semantics: the CSV is the morning shelf count, so it replaces
 * `on_hand`. `reserved` is never touched: reserved packs are still on the
 * shelf and are already part of the count, so nothing is counted twice.
 */
import { createHash } from 'node:crypto';
import { parseStockCsv, type StockCsvIssue } from '../../domain/stock-csv';
import { prisma } from '../../lib/db';
import { AppError, notFound } from '../../lib/errors';
import { routeWaitingOrders } from '../routing/routing.service';

export interface ImportSummary {
  rowCount: number;
  validCount: number;
  errorCount: number;
  errors: StockCsvIssue[];
  stores: { code: string; name: string; skus: number; setToZero: number; belowReserved: number }[];
}

interface StoredRow {
  storeId: string;
  productId: string;
  onHand: number;
}

export async function previewStockImport(fileName: string, content: string, uploadedById: string) {
  const sha256 = createHash('sha256').update(content).digest('hex');
  const alreadyApplied = await prisma.stockImport.findFirst({ where: { sha256, status: 'APPLIED' } });
  if (alreadyApplied) {
    throw new AppError(422, 'FILE_ALREADY_APPLIED', `This exact file was already applied on ${alreadyApplied.appliedAt?.toISOString().slice(0, 16).replace('T', ' ')} UTC.`);
  }

  const [stores, products] = await Promise.all([
    prisma.store.findMany({ select: { id: true, code: true, name: true } }),
    prisma.product.findMany({ select: { id: true, sku: true } }),
  ]);
  const storeByCode = new Map(stores.map((s) => [s.code, s]));
  const productBySku = new Map(products.map((p) => [p.sku, p]));

  const parsed = parseStockCsv(content, {
    storeCodes: new Set(storeByCode.keys()),
    skus: new Set(productBySku.keys()),
  });
  if (parsed.fileError) throw new AppError(422, 'INVALID_FILE', parsed.fileError);

  const rows: StoredRow[] = parsed.rows.map((row) => ({
    storeId: storeByCode.get(row.storeCode)!.id,
    productId: productBySku.get(row.sku)!.id,
    onHand: row.onHand,
  }));

  // Per-store impact, so ops can see what will change before applying.
  const includedStoreIds = [...new Set(rows.map((r) => r.storeId))];
  const existing = await prisma.storeStock.findMany({ where: { storeId: { in: includedStoreIds } } });
  const storeSummaries = includedStoreIds.map((storeId) => {
    const store = stores.find((s) => s.id === storeId)!;
    const inFile = new Map(rows.filter((r) => r.storeId === storeId).map((r) => [r.productId, r.onHand]));
    const current = existing.filter((e) => e.storeId === storeId);
    return {
      code: store.code,
      name: store.name,
      skus: inFile.size,
      setToZero: current.filter((e) => !inFile.has(e.productId) && e.onHand > 0).length,
      belowReserved: current.filter((e) => (inFile.get(e.productId) ?? 0) < e.reserved).length,
    };
  });

  const summary: ImportSummary = {
    rowCount: parsed.rowCount,
    validCount: rows.length,
    errorCount: parsed.errors.length,
    errors: parsed.errors.slice(0, 500),
    stores: storeSummaries,
  };

  return prisma.stockImport.create({
    data: {
      fileName: fileName.slice(0, 200),
      sha256,
      rows: rows as unknown as object,
      summary: summary as unknown as object,
      errorCount: parsed.errors.length,
      uploadedById,
    },
  });
}

export async function applyStockImport(importId: string, now = new Date()) {
  await prisma.$transaction(async (tx) => {
    const stockImport = await tx.stockImport.findUnique({ where: { id: importId } });
    if (!stockImport) throw notFound();
    if (stockImport.errorCount > 0) {
      throw new AppError(422, 'IMPORT_HAS_ERRORS', 'Fix the errors in the file and upload it again. Nothing was changed.');
    }
    // Claim the preview: only one apply can ever succeed.
    const claimed = await tx.stockImport.updateMany({
      where: { id: importId, status: 'PREVIEW' },
      data: { status: 'APPLIED', appliedAt: now },
    });
    if (claimed.count === 0) throw new AppError(409, 'IMPORT_NOT_PREVIEW', 'This import was already applied or discarded.');
    const sameFile = await tx.stockImport.count({ where: { sha256: stockImport.sha256, status: 'APPLIED' } });
    if (sameFile > 1) throw new AppError(422, 'FILE_ALREADY_APPLIED', 'This exact file was already applied.');

    const rows = stockImport.rows as unknown as StoredRow[];
    const storeIds = [...new Set(rows.map((r) => r.storeId))];
    for (const row of rows) {
      await tx.storeStock.upsert({
        where: { storeId_productId: { storeId: row.storeId, productId: row.productId } },
        update: { onHand: row.onHand, countedAt: now },
        create: { storeId: row.storeId, productId: row.productId, onHand: row.onHand, reserved: 0, countedAt: now },
      });
    }
    // The file is a full list for each store it includes (A5): anything missing is now 0.
    for (const storeId of storeIds) {
      const listed = rows.filter((r) => r.storeId === storeId).map((r) => r.productId);
      await tx.storeStock.updateMany({
        where: { storeId, productId: { notIn: listed } },
        data: { onHand: 0, countedAt: now },
      });
    }
  });

  // New stock may let waiting orders through.
  const routing = await routeWaitingOrders(now);
  return { routedOrders: routing.routed };
}

export async function discardStockImport(importId: string) {
  const result = await prisma.stockImport.updateMany({ where: { id: importId, status: 'PREVIEW' }, data: { status: 'DISCARDED' } });
  if (result.count === 0) throw new AppError(409, 'IMPORT_NOT_PREVIEW', 'This import was already applied or discarded.');
}

export function toImportDto(stockImport: {
  id: string;
  fileName: string;
  status: string;
  summary: unknown;
  errorCount: number;
  createdAt: Date;
  appliedAt: Date | null;
  uploadedBy?: { name: string };
}) {
  return {
    id: stockImport.id,
    fileName: stockImport.fileName,
    status: stockImport.status,
    summary: stockImport.summary as ImportSummary,
    errorCount: stockImport.errorCount,
    createdAt: stockImport.createdAt.toISOString(),
    appliedAt: stockImport.appliedAt?.toISOString() ?? null,
    uploadedBy: stockImport.uploadedBy?.name ?? null,
  };
}
