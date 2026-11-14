// The PHB1 and TER1 contract between the Python writers and the app's readers. test/fixtures/phb1.bin and ter1.bin
// are what tools/phl/formats.py writes from test/fixtures/roundtrip.json (tools/tests/test_roundtrip.py checks
// that); here decode() and setTerrain() must read the same values back. Then the committed files decode whole.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, test } from 'vitest';
import { decode } from '../js/scene/city.ts';
import { setTerrain } from '../js/scene/terrain.ts';

const arrayBuffer = b => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const read = path => arrayBuffer(readFileSync(new URL(path, import.meta.url)));
const gunzip = path => arrayBuffer(gunzipSync(readFileSync(new URL(path, import.meta.url))));
const spec = JSON.parse(readFileSync(new URL('./fixtures/roundtrip.json', import.meta.url), 'utf8'));
// setTerrain fills one shared object: copy it before the next call
const terrainOf = buf => ({ ...setTerrain(buf) });

describe('PHB1 fixture', () => {
  const { boxes, polys } = spec.phb1, B = decode(read('./fixtures/phb1.bin'));

  test('counts', () => {
    expect([B.nB, B.nP, B.vx.length]).toEqual([boxes.length, polys.length, polys.reduce((n, p) => n + p.ring.length, 0)]);
  });

  test('boxes: decimetres, rotation 0..65535 for 0..pi', () => {
    boxes.forEach((b, i) => {
      expect([B.bx[i], B.bz[i], B.bw[i], B.bd[i], B.bh[i]].map(v => v / 10)).toEqual([b.x, b.z, b.w, b.d, b.h]);
      expect(B.bk[i]).toBe(b.kind);
      expect(Math.abs(B.br[i] / 65535 * Math.PI - b.ry)).toBeLessThanOrEqual(Math.PI / 65535 / 2);
    });
  });

  test('outlines: decimetres, each first vertex absolute and the rest deltas', () => {
    let v = 0;
    polys.forEach((p, i) => {
      expect([B.pn[i], B.ph[i] / 10, B.pk[i]]).toEqual([p.ring.length, p.h, p.kind]);
      let x = 0, z = 0;
      const ring = [];
      for (let k = 0; k < B.pn[i]; k++) { x = k ? x + B.vx[v + k] : B.vx[v + k]; z = k ? z + B.vz[v + k] : B.vz[v + k]; ring.push([x / 10, z / 10]); }
      expect(ring).toEqual(p.ring);
      v += B.pn[i];
    });
  });
});

describe('TER1 fixture', () => {
  const t = spec.ter1;

  test('header and grids: decimetres, rows delta-coded', () => {
    const T = terrainOf(read('./fixtures/ter1.bin'));
    expect([T.on, T.x0, T.z0, T.cell, T.W, T.H]).toEqual([true, t.x0, t.z0, t.cell, t.W, t.H]);
    expect(Array.from(T.G, v => v / 10)).toEqual(t.ground);
    expect(Array.from(T.D, v => v / 10)).toEqual(t.water);
    // the surface: the water where it stands above the ground, else the ground
    expect(Array.from(T.S)).toEqual(t.ground.map((g, i) => Math.round(g * 10) + (t.water[i] > 0 ? Math.round(t.water[i] * 10) : 0)));
  });
});

describe('committed data', () => {
  test.each(['phl', 'nyc', 'nola', 'jsh'])('%s city_buildings.bin.gz decodes whole', city => {
    const buf = gunzip(`../data/${city}/city_buildings.bin.gz`), B = decode(buf);
    // per box: x, z i32, w, d, ry, h u16, kind u8 (17 bytes); per outline: count, h u16, kind u8 (5); per vertex: x, z i32 (8)
    expect(16 + B.nB * 17 + B.nP * 5 + B.vx.length * 8).toBe(buf.byteLength);
    expect(B.pn.reduce((n, c) => n + c, 0)).toBe(B.vx.length);
    if (city === 'jsh') expect([B.nB, B.nP, B.vx.length]).toEqual([0, 0, 0]);
  });

  // data/jsh/terrain.bin.gz starts "TER1" too, but is another layout (js/scene/jsh/terrain.ts reads it)
  test('phl terrain.bin.gz decodes whole', () => {
    const buf = gunzip('../data/phl/terrain.bin.gz'), T = terrainOf(buf);
    expect(24 + T.W * T.H * 2 * 2).toBe(buf.byteLength);
    expect(T.on).toBe(true);
  });
});
