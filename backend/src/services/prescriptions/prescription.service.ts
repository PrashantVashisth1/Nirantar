/**
 * Prescription upload and AI reading (plan §8).
 *
 * Upload: check the real file type from its bytes → fix rotation, strip all
 * metadata (incl. GPS), resize → AES-256-GCM encrypt → store → respond.
 * The AI then reads it in the background; the customer's screen polls.
 * A read stuck in READING for over 2 minutes (e.g. a restart) is marked
 * FAILED the next time anyone looks at it, and the pharmacist enters items by hand.
 */
import { createHash, randomUUID } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import {
  AI_READING_STALE_MS,
  RX_VALIDITY_DAYS,
  addDays,
  isBannedOnline,
  type PrescriptionDto,
  type Role,
} from '@nirantar/shared';
import { parseDose, parseDurationDays } from '../../domain/dosage';
import { matchLine, suggestPacks, type CatalogProduct, type MatchQuality } from '../../domain/matcher';
import { decrypt, encrypt } from '../../lib/crypto';
import { prisma } from '../../lib/db';
import { AppError, notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { toProductSummary } from '../../http/presenters/order.presenter';
import type { Prisma, Prescription } from '../../generated/prisma/client';
import type { Extraction } from '../ai/extraction';
import { getReader } from '../ai/gemini-reader';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

interface StoredDraft {
  extraction: Extraction;
  lines: {
    lineIndex: number;
    quality: MatchQuality;
    productId: string | null;
    candidateIds: string[];
    suggestedQuantity: number;
    dose: { morning: number; noon: number; night: number } | null;
    durationDays: number | null;
  }[];
}

export async function uploadPrescription(opts: {
  accountId: string;
  patientId: string;
  file: Buffer;
  replacesId?: string;
  /** When false (tests), the AI read is awaited instead of running in the background. */
  background?: boolean;
}) {
  const patient = await prisma.patient.findFirst({ where: { id: opts.patientId, accountId: opts.accountId, archivedAt: null } });
  if (!patient) throw notFound("We couldn't find that person on your account.");

  if (opts.file.length > MAX_UPLOAD_BYTES) throw new AppError(413, 'FILE_TOO_LARGE', 'The photo must be smaller than 10 MB.');
  const detected = await fileTypeFromBuffer(opts.file);
  if (!detected || !ALLOWED_TYPES.has(detected.mime)) {
    throw new AppError(415, 'FILE_TYPE_NOT_ALLOWED', 'Please upload a photo (JPEG, PNG or WebP).');
  }

  // Re-encode: fixes phone rotation, drops ALL metadata (sharp keeps none by default),
  // limits size, and neutralises anything odd hidden in the original file.
  let clean: Buffer;
  try {
    clean = await sharp(opts.file, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    throw new AppError(415, 'FILE_UNREADABLE', "We couldn't open this image. Please take the photo again.");
  }

  const id = randomUUID();
  const sealed = encrypt(clean, id);
  const now = new Date();
  await prisma.$transaction([
    prisma.prescription.create({
      data: {
        id,
        patientId: patient.id,
        uploadedById: opts.accountId,
        replacesId: opts.replacesId,
        aiStatus: 'READING',
        aiStartedAt: now,
      },
    }),
    prisma.prescriptionFile.create({
      data: { prescriptionId: id, ...sealed, mimeType: 'image/jpeg', byteSize: clean.length, sha256: createHash('sha256').update(opts.file).digest('hex') },
    }),
  ]);

  const reading = readPrescription(id).catch((error) => logger.error({ err: error, prescriptionId: id }, 'AI read crashed'));
  if (opts.background === false) await reading;
  return id;
}

/** Runs the AI read and stores the matched draft. Never throws into the request. */
export async function readPrescription(prescriptionId: string) {
  const file = await prisma.prescriptionFile.findUniqueOrThrow({ where: { prescriptionId } });
  const image = decrypt(file, prescriptionId);
  await prisma.prescriptionAccessLog.create({ data: { prescriptionId, action: 'AI_READ' } });

  const result = await getReader().read(image, file.mimeType);
  if (!result.ok) {
    await prisma.prescription.updateMany({
      where: { id: prescriptionId, aiStatus: 'READING' },
      data: { aiStatus: 'FAILED' },
    });
    return;
  }

  const draft = buildDraft(result.extraction, await loadCatalog());
  await prisma.prescription.updateMany({
    where: { id: prescriptionId, aiStatus: { in: ['READING', 'FAILED'] } },
    data: { ...draft, aiModel: result.model },
  });
}

/** Turns what the AI transcribed into a catalog-matched draft and a status. */
export function buildDraft(extraction: Extraction, catalog: CatalogProduct[]) {
  const lines: StoredDraft['lines'] = extraction.items.map((item, lineIndex) => {
    const match = matchLine(item.medicineName.value, item.strength.value, catalog);
    const dose = parseDose(item.dosageText.value);
    const durationDays = parseDurationDays(item.durationText.value);
    const product = catalog.find((p) => p.id === match.productId);
    return {
      lineIndex,
      quality: match.quality,
      productId: match.productId,
      candidateIds: match.candidateIds,
      suggestedQuantity: suggestPacks({
        quantityText: item.quantityText.value,
        dailyUnits: dose ? dose.morning + dose.noon + dose.night : null,
        durationDays,
        packUnits: product?.packUnits ?? 10,
      }),
      dose,
      durationDays,
    };
  });

  const uncertain = extraction.items.some((item) =>
    [item.medicineName, item.strength, item.dosageText].some((f) => f.confidence !== 'high' || f.value === null),
  );
  const aiStatus =
    !extraction.isPrescription || extraction.legibility === 'illegible' || extraction.items.length === 0
      ? 'UNREADABLE'
      : extraction.legibility === 'clear' && !uncertain && extraction.unreadableLineCount === 0 && lines.every((l) => l.quality === 'STRONG')
        ? 'READY'
        : 'UNSURE';

  return { aiStatus, aiDraft: { extraction, lines } as unknown as Prisma.InputJsonValue } as const;
}

export async function loadCatalog(): Promise<CatalogProduct[]> {
  const products = await prisma.product.findMany({ where: { isActive: true } });
  return products.filter((p) => !isBannedOnline(p.schedule));
}

/** Plan §8 recovery: a read still "in progress" after 2 minutes has failed. */
export async function recoverStaleReads(now = new Date()) {
  await prisma.prescription.updateMany({
    where: { aiStatus: 'READING', aiStartedAt: { lt: new Date(now.getTime() - AI_READING_STALE_MS) } },
    data: { aiStatus: 'FAILED' },
  });
}

export async function retryRead(prescriptionId: string) {
  const updated = await prisma.prescription.updateMany({
    where: { id: prescriptionId, aiStatus: { in: ['FAILED', 'UNREADABLE', 'UNSURE'] } },
    data: { aiStatus: 'READING', aiStartedAt: new Date() },
  });
  if (updated.count === 0) throw new AppError(409, 'NOT_RETRYABLE', 'This prescription is already being read.');
  void readPrescription(prescriptionId).catch((error) => logger.error({ err: error }, 'AI retry crashed'));
}

export async function toPrescriptionDto(prescription: Prescription & { file?: { prescriptionId: string } | null }): Promise<PrescriptionDto> {
  const draft = prescription.aiDraft as unknown as StoredDraft | null;
  let lines: NonNullable<PrescriptionDto['draft']>['lines'] = [];
  if (draft) {
    const ids = [...new Set(draft.lines.flatMap((l) => [l.productId, ...l.candidateIds]).filter((id): id is string => !!id))];
    const products = new Map((await prisma.product.findMany({ where: { id: { in: ids } } })).map((p) => [p.id, toProductSummary(p)]));
    lines = draft.lines.map((line) => {
      const item = draft.extraction.items[line.lineIndex]!;
      return {
        lineIndex: line.lineIndex,
        asWritten: item.lineText,
        medicineName: item.medicineName.value,
        strength: item.strength.value,
        dosageText: item.dosageText.value,
        durationText: item.durationText.value,
        uncertain: [item.medicineName, item.strength, item.dosageText].some((f) => f.confidence !== 'high' || f.value === null),
        quality: line.quality,
        product: line.productId ? (products.get(line.productId) ?? null) : null,
        candidates: line.candidateIds.map((id) => products.get(id)).filter((p) => !!p),
        suggestedQuantity: line.suggestedQuantity,
        dose: line.dose,
        durationDays: line.durationDays,
      };
    });
  }
  const f = (field: { value: string | null; confidence: string }) => ({ value: field.value, uncertain: field.confidence !== 'high' });
  return {
    id: prescription.id,
    patientId: prescription.patientId,
    aiStatus: prescription.aiStatus,
    reviewStatus: prescription.reviewStatus,
    createdAt: prescription.createdAt.toISOString(),
    hasImage: Boolean(prescription.file),
    draft: draft
      ? {
          isPrescription: draft.extraction.isPrescription,
          legibility: draft.extraction.legibility,
          prescriberName: f(draft.extraction.prescriberName),
          prescriberRegNo: f(draft.extraction.prescriberRegNo),
          prescribedOn: f(draft.extraction.prescribedOn),
          patientName: f(draft.extraction.patientName),
          lines,
          unreadableLineCount: draft.extraction.unreadableLineCount,
        }
      : null,
    prescriberName: prescription.prescriberName,
    prescriberRegNo: prescription.prescriberRegNo,
    prescribedOn: prescription.prescribedOn?.toISOString().slice(0, 10) ?? null,
    validUntil: prescription.prescribedOn ? addDays(prescription.prescribedOn, RX_VALIDITY_DAYS).toISOString().slice(0, 10) : null,
  };
}

export async function getPrescriptionForCustomer(accountId: string, id: string) {
  await recoverStaleReads();
  const prescription = await prisma.prescription.findFirst({
    where: { id, patient: { accountId } },
    include: { file: { select: { prescriptionId: true } } },
  });
  if (!prescription) throw notFound();
  return toPrescriptionDto(prescription);
}

/**
 * The decrypted image, for the owner or a pharmacist only (operations and
 * other customers get 404). Every view is written to the access log (DPDP).
 */
export async function getPrescriptionImage(user: { id: string; role: Role }, id: string) {
  const prescription = await prisma.prescription.findFirst({
    where: user.role === 'CUSTOMER' ? { id, patient: { accountId: user.id } } : { id },
    include: { file: true },
  });
  if (!prescription || !prescription.file || (user.role !== 'CUSTOMER' && user.role !== 'PHARMACIST')) throw notFound();
  await prisma.prescriptionAccessLog.create({ data: { prescriptionId: id, userId: user.id, action: 'VIEW_IMAGE' } });
  return { bytes: decrypt(prescription.file, id), mimeType: prescription.file.mimeType };
}
