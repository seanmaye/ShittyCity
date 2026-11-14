import { describe, expect, it } from 'vitest';
import { CITIES, septaLines } from '../js/cities.ts';

const LINES = { L: { group: 'SEPTA Metro' }, B1: { group: 'SEPTA Metro' }, G1: { group: 'SEPTA Metro' }, T1: { group: 'SEPTA Metro' }, PAO: { group: 'Regional Rail' }, CHW: { group: 'Regional Rail' }, PATCO: { group: 'PATCO' } };

describe('septaLines', () => {
  it('is Philadelphia’s station tagger', () => expect(CITIES.phl.stationLines).toBe(septaLines));
  it('lists Metro ids, then trolleys, then the other networks once each', () => {
    expect(septaLines({ lines: ['PAO', 'B1', 'CHW', 'L', 'PATCO'] }, LINES)).toBe('B1 · L · Regional Rail · PATCO');
    expect(septaLines({ lines: ['G1', 'T1'] }, LINES)).toBe('G1 · T1');
  });
  it('joins three or more consecutive trolleys into a range', () => {
    expect(septaLines({ lines: ['T5', 'T3', 'T1', 'T4', 'T2'] }, LINES)).toBe('T1–T5');
    expect(septaLines({ lines: ['T2', 'T1'] }, LINES)).toBe('T1, T2');
    expect(septaLines({ lines: ['T4', 'T1', 'T2'] }, LINES)).toBe('T1, T2, T4');
  });
  it('is empty for a station without lines', () => {
    expect(septaLines({}, LINES)).toBe('');
    expect(septaLines({ lines: ['XYZ'] }, LINES)).toBe('');
  });
});
