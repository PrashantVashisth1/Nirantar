import type { PrescriptionDto } from '@nirantar/shared';
import { ApiError } from './api';

/**
 * Shrinks a phone photo before upload (long edge ≤ 2400 px, JPEG ~0.85), so it
 * goes up quickly on mobile data. The server re-encodes it anyway.
 */
export async function compressImage(file: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    );
    return blob ?? file;
  } catch {
    return file; // the server will reject it with a clear message if it isn't an image
  }
}

async function postFile<T>(
  path: string,
  file: Blob,
  fields: Record<string, string> = {},
): Promise<T> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  form.append('file', await compressImage(file), 'prescription.jpg');
  const response = await fetch(`/api${path}`, {
    method: 'POST',
    body: form,
    credentials: 'same-origin',
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error?.code ?? 'UNKNOWN',
      data?.error?.message ?? 'Upload failed. Please try again.',
    );
  }
  return data as T;
}

export const uploadPrescription = (file: Blob, patientId: string) =>
  postFile<PrescriptionDto>('/prescriptions', file, { patientId });

export const reuploadForOrder = (file: Blob, orderId: string) =>
  postFile<{ prescriptionId: string }>(`/orders/${orderId}/reupload`, file);

/** Loads a bundled synthetic sample prescription as if it were a photo. */
export async function sampleFile(name = 'rx-typed'): Promise<Blob> {
  const response = await fetch(`/samples/${name}.jpg`);
  return response.blob();
}
