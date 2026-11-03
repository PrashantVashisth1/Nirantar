import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, istDateString, dateOnly } from './dates';
import { maskPhone, normalizeIndianMobile } from './phone';

describe('Indian mobile numbers', () => {
  it('accepts the formats people actually type', () => {
    for (const input of ['9830012345', '98300 12345', '+91 98300-12345', '919830012345', '09830012345']) {
      expect(normalizeIndianMobile(input)).toBe('+919830012345');
    }
  });

  it('rejects numbers that are not Indian mobiles', () => {
    for (const input of ['12345', '5830012345', '98300123456', 'abcdefghij', '']) {
      expect(normalizeIndianMobile(input)).toBeNull();
    }
  });

  it('masks all but the last five digits', () => {
    expect(maskPhone('+919000010001')).toBe('••••• 10001');
  });
});

describe('IST dates', () => {
  it('uses the Kolkata calendar date, not the UTC one', () => {
    // 20:00 UTC on 3 Nov is 01:30 on 4 Nov in Kolkata.
    expect(istDateString(new Date('2026-11-03T20:00:00Z'))).toBe('2026-11-04');
    expect(istDateString(new Date('2026-11-03T10:00:00Z'))).toBe('2026-11-03');
  });

  it('counts whole days between calendar dates', () => {
    expect(daysBetween(dateOnly('2026-11-04'), dateOnly('2026-11-09'))).toBe(5);
    expect(daysBetween(dateOnly('2026-11-09'), dateOnly('2026-11-04'))).toBe(-5);
    expect(addDays(dateOnly('2026-11-28'), 5).toISOString().slice(0, 10)).toBe('2026-12-03');
  });
});
