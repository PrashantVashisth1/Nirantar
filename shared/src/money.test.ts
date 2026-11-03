import { describe, expect, it } from 'vitest';
import { formatRupees, lineTotalPaise, rupeesToPaise } from './money';

describe('money', () => {
  it('formats paise as rupees with Indian digit grouping', () => {
    expect(formatRupees(48000)).toBe('₹480');
    expect(formatRupees(12050)).toBe('₹120.50');
    expect(formatRupees(12000000)).toBe('₹1,20,000');
  });

  it('rejects fractional paise', () => {
    expect(() => formatRupees(10.5)).toThrow();
  });

  it('converts rupees to paise and totals lines', () => {
    expect(rupeesToPaise(120)).toBe(12000);
    expect(rupeesToPaise(0.1 + 0.2)).toBe(30);
    // RX-50211 from the brief: 4 strips × ₹120
    expect(lineTotalPaise(12000, 4)).toBe(48000);
  });
});
