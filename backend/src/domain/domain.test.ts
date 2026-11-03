import { dateOnly } from '@nirantar/shared';
import { describe, expect, it } from 'vitest';
import { haversineKm, sortByDistance } from './distance';
import { calculateRefill, dueReminderOffset } from './refill-math';
import { parseStockCsv } from './stock-csv';

const base = {
  packs: 4,
  packUnits: 15,
  form: 'TABLET',
  doseMorning: 1,
  doseNoon: 0,
  doseNight: 1,
  asNeeded: false,
  fillDate: dateOnly('2026-11-01'),
};

describe('refill maths (pharmacist-confirmed dose only)', () => {
  it('4 strips of 15 at 1-0-1 last 30 days', () => {
    const r = calculateRefill(base);
    expect(r).toMatchObject({ ok: true, dailyUnits: 2, daysSupply: 30 });
    if (r.ok) expect(r.runOutOn.toISOString().slice(0, 10)).toBe('2026-12-01');
  });

  it('handles half tablets and three-a-day', () => {
    expect(calculateRefill({ ...base, doseMorning: 0.5, doseNight: 0.5 })).toMatchObject({ daysSupply: 60 });
    expect(calculateRefill({ ...base, doseMorning: 1, doseNoon: 1, doseNight: 1 })).toMatchObject({ daysSupply: 20 });
  });

  it('stacks an early reorder on the supply that is left', () => {
    const r = calculateRefill({ ...base, fillDate: dateOnly('2026-11-25'), previousRunOut: dateOnly('2026-12-01') });
    if (r.ok) expect(r.runOutOn.toISOString().slice(0, 10)).toBe('2026-12-31');
  });

  it('refuses to guess: as-needed, liquids and missing doses get no reminder', () => {
    expect(calculateRefill({ ...base, asNeeded: true })).toEqual({ ok: false, reason: 'AS_NEEDED' });
    expect(calculateRefill({ ...base, form: 'SYRUP' })).toEqual({ ok: false, reason: 'NOT_SOLID_ORAL' });
    expect(calculateRefill({ ...base, doseMorning: null, doseNoon: null, doseNight: null })).toEqual({ ok: false, reason: 'NO_CONFIRMED_DOSE' });
    expect(calculateRefill({ ...base, doseMorning: 0, doseNoon: 0, doseNight: 0 })).toEqual({ ok: false, reason: 'NO_CONFIRMED_DOSE' });
  });
});

describe('which reminder is due', () => {
  const runOut = dateOnly('2026-12-01');
  it('is nothing before 5 days out, then 5, 2 and 0', () => {
    expect(dueReminderOffset(runOut, dateOnly('2026-11-25'))).toBeNull();
    expect(dueReminderOffset(runOut, dateOnly('2026-11-26'))).toBe(5);
    expect(dueReminderOffset(runOut, dateOnly('2026-11-29'))).toBe(2);
    expect(dueReminderOffset(runOut, dateOnly('2026-12-01'))).toBe(0);
    expect(dueReminderOffset(runOut, dateOnly('2026-12-04'))).toBe(0);
  });
});

describe('distance', () => {
  it('measures Salt Lake to New Town at about 5.6 km', () => {
    const km = haversineKm({ lat: 22.586, lng: 88.406 }, { lat: 22.58, lng: 88.46 });
    expect(km).toBeGreaterThan(5);
    expect(km).toBeLessThan(6.2);
  });
  it('sorts nearest first, ties by code', () => {
    const sorted = sortByDistance({ lat: 0, lng: 0 }, [
      { code: 'B', lat: 0, lng: 1 },
      { code: 'A', lat: 0, lng: 1 },
      { code: 'C', lat: 0, lng: 0.5 },
    ]);
    expect(sorted.map((s) => s.code)).toEqual(['C', 'A', 'B']);
  });
});

describe('stock CSV validation', () => {
  const known = { storeCodes: new Set(['SLK', 'NTN']), skus: new Set(['MET500-S15', 'TEL40-S10']) };

  it('accepts a valid file in any column order, with a BOM', () => {
    const r = parseStockCsv('﻿sku,store_code,on_hand\nMET500-S15,SLK,40\nTEL40-S10,slk,0\n', known);
    expect(r.fileError).toBeNull();
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { storeCode: 'SLK', sku: 'MET500-S15', onHand: 40 },
      { storeCode: 'SLK', sku: 'TEL40-S10', onHand: 0 },
    ]);
  });

  it('reports each bad row with its row number', () => {
    const r = parseStockCsv('store_code,sku,on_hand\nXXX,MET500-S15,4\nSLK,NOPE,4\nSLK,MET500-S15,-2\nSLK,TEL40-S10,1.5\n', known);
    expect(r.errors.map((e) => [e.row, e.column])).toEqual([
      [2, 'store_code'],
      [3, 'sku'],
      [4, 'on_hand'],
      [5, 'on_hand'],
    ]);
  });

  it('ignores exact duplicates but flags conflicting ones', () => {
    const r = parseStockCsv('store_code,sku,on_hand\nSLK,MET500-S15,4\nSLK,MET500-S15,4\nSLK,MET500-S15,9\n', known);
    expect(r.rows).toHaveLength(1);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.message).toMatch(/Conflicts with row 2/);
  });

  it('rejects files with a wrong header or no rows', () => {
    expect(parseStockCsv('store,sku,qty\nSLK,MET500-S15,1', known).fileError).toMatch(/Missing column/);
    expect(parseStockCsv('store_code,sku,on_hand\n', known).fileError).toMatch(/no rows/);
    expect(parseStockCsv('', known).fileError).toMatch(/empty/);
  });
});
