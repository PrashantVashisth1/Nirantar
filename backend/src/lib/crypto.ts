import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../config/env';

/**
 * AES-256-GCM for prescription images (DPDP: "encrypt them").
 * - A new random 96-bit IV for every file.
 * - The auth tag detects any tampering with the stored bytes.
 * - AAD = the prescription id, so an encrypted file can't be swapped onto another record.
 */
const key = () => Buffer.from(env.PRESCRIPTION_KEY, 'base64');

export function encrypt(plain: Buffer, aad: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag() };
}

export function decrypt(data: { ciphertext: Uint8Array; iv: Uint8Array; authTag: Uint8Array }, aad: string): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(data.iv));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(data.authTag));
  return Buffer.concat([decipher.update(Buffer.from(data.ciphertext)), decipher.final()]);
}
