import { describe, expect, it } from 'vitest';
import { CITIES, setCity } from '../js/cities.js';
import { G, latOf, pairs } from '../js/data.js';

describe('pairs', () => {
  it('turns flat decimetres into [x, z] pairs in metres', () => {
    expect(pairs([10, -20, 15, 0])).toEqual([[1, -2], [1.5, 0]]);
    expect(pairs(new Int32Array([123, 456]))).toEqual([[12.3, 45.6]]);
    expect(pairs([])).toEqual([]);
  });
});

describe('G and latOf', () => {
  it('project lat/lon in the active city frame, read when called', () => {
    setCity('phl');
    const f = CITIES.phl.frame, o = G(f.LAT0, f.LON0), p = G(f.LAT0 + .01, f.LON0 + .02);
    expect([o.x, o.y, o.z].map(Math.abs)).toEqual([0, 0, 0]);
    expect(p.x).toBeCloseTo(.02 * f.MX, 6);   // east
    expect(p.z).toBeCloseTo(-.01 * f.MZ, 6);   // north is -z
    expect(latOf(p.z)).toBeCloseTo(f.LAT0 + .01, 9);
    setCity('nyc');
    const n = CITIES.nyc.frame;
    expect(G(n.LAT0, n.LON0).x).toBeCloseTo(0, 9);
    expect(latOf(0)).toBe(n.LAT0);
  });
});
