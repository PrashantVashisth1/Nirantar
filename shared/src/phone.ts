/**
 * Indian mobile numbers: 10 digits starting with 6, 7, 8 or 9.
 * Accepts what people actually type ("90000 12345", "+91 90000-12345",
 * "090000 12345") and stores one canonical form: "+919000012345".
 */
export function normalizeIndianMobile(input: string): string | null {
  let digits = input.replace(/[\s\-().]/g, '');
  if (digits.startsWith('+91')) digits = digits.slice(3);
  else if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
  else if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

/** "+919000010001" -> "••••• 10001" (safe to show on screen and in logs). */
export function maskPhone(e164: string): string {
  return `••••• ${e164.slice(-5)}`;
}
