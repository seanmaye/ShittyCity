// The build's data encodings (js/formats.ts; vite.config.js dataCodec ships them): JCOL, TER2 and PHB2 must decode, through
// the page's own readers, to exactly what the committed files decode to. The committed files are all checked, as the build
// would encode them, and so are the PHB1 and TER1 fixtures that tools/phl/formats.py writes (test/roundtrip.test.js).
import { readdirSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, test } from 'vitest';
import { decodeJcol, encodeData, encodeJcol, encodePhb2, encodeTer2, formatOf, sameValue } from '../js/formats.ts';
import { decode } from '../js/scene/city.ts';
import { loadTerrain } from '../js/scene/jsh/terrain.ts';
import { setTerrain } from '../js/scene/terrain.ts';

const own = u8 => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
const bytesOf = path => { const b = readFileSync(new URL(path, import.meta.url)); return b[0] === 0x1f && b[1] === 0x8b ? gunzipSync(b) : b; };
// setTerrain fills one shared object, and its grids are replaced on the next call: copy it
const terrainOf = buf => ({ ...setTerrain(buf) });
const jcol = v => decodeJcol(encodeJcol(v));

describe('JCOL', () => {
  test('moves integer arrays out and puts them back, anywhere in the value', () => {
    const v = { a: [10, -20, 15, 0, 7, 7], b: { c: [[1, 2, 3], [4, 5, 6, 7, 8, 9]], d: 'x', e: [] }, f: [1.5, 2], g: null, h: true, i: [[], [3, 4]] };
    expect(sameValue(jcol(v), v)).toBe(true);
    expect(sameValue(jcol([5, 6, 7, 8]), [5, 6, 7, 8])).toBe(true);   // the whole value an integer array
    expect(sameValue(jcol([[1, 2], [3]]), [[1, 2], [3]])).toBe(true);   // [3]: one value, left in the text
  });

  test('picks the stride per array: [x, z, ...] by 2, [x, y, z, ...] by 3, and chains first values across arrays', () => {
    const xz = Array.from({ length: 40 }, (_, i) => (i % 2 ? 5000 + i : -3000 + i * 3));
    const xyz = Array.from({ length: 60 }, (_, i) => [100000, 20, -70000][i % 3] + i);
    const v = { p: [xz, xz.map(x => x + 1)], t: [xyz, xyz] };
    expect(sameValue(jcol(v), v)).toBe(true);
  });

  test('leaves alone what it cannot carry exactly: big integers, mixed arrays; a -0 keeps the file as JSON', () => {
    const big = { a: [2 ** 30, 1], b: [2 ** 31, -(2 ** 40)], c: [1, 'x'], d: [1, 2] };
    expect(sameValue(jcol(big), big)).toBe(true);
    expect(encodeJcol({ a: [1, 2], b: -0 })).toBe(null);
    expect(encodeJcol({ a: [1, -0, 2], b: [3, 4] })).toBe(null);   // the -0 would stay in the text, which writes it as 0
    expect(encodeJcol({ a: 'no integer arrays' })).toBe(null);
  });

  test('gives arrays the shape JSON.parse gives them (plain, packed)', () => {
    const out = jcol({ a: [1, 2, 3] });
    expect(Array.isArray(out.a) && Object.getPrototypeOf(out.a) === Array.prototype).toBe(true);
  });
});

describe('TER2 and PHB2 from the fixtures', () => {
  test('TER2 reads as the TER1 fixture does (setTerrain)', () => {
    const ter1 = bytesOf('./fixtures/ter1.bin'), ter2 = encodeTer2(ter1);
    expect(formatOf(ter2)).toBe('TER2');
    expect(sameValue(terrainOf(own(ter2)), terrainOf(own(ter1)))).toBe(true);
  });

  test('PHB2 reads as the PHB1 fixture does (decode)', () => {
    const phb1 = bytesOf('./fixtures/phb1.bin'), phb2 = encodePhb2(phb1);
    expect(formatOf(phb2)).toBe('PHB2');
    expect(sameValue(decode(own(phb2)), decode(own(phb1)))).toBe(true);
  });
});

// every committed data file the build would encode, read by the page's reader both ways
const files = readdirSync(new URL('../data/', import.meta.url)).flatMap(c => readdirSync(new URL(`../data/${c}/`, import.meta.url)).map(f => [c, f]));
const read = (city, file, buf) => {
  if (file.startsWith('terrain.')) return city === 'jsh' ? { ...loadTerrain(buf) } : terrainOf(buf);
  if (file.startsWith('city_buildings.')) return decode(buf);
  const u8 = new Uint8Array(buf);
  return formatOf(u8) === 'JCOL' ? decodeJcol(u8) : JSON.parse(new TextDecoder().decode(u8));
};

describe('committed data, as the build ships it', () => {
  const encoded = files.filter(([, f]) => !f.endsWith('.webp')).map(([c, f]) => [c, f, encodeData(f, bytesOf(`../data/${c}/${f}`))]);

  test('the large files are encoded (none skipped)', () => {
    expect(encoded.filter(([, , e]) => e && 'skip' in e).map(([c, f, e]) => `${c}/${f}: ${e.skip}`)).toEqual([]);
    for (const [c, f] of [['phl', 'terrain.bin.gz'], ['jsh', 'terrain.bin.gz'], ['phl', 'city_buildings.bin.gz'], ['nyc', 'city.json.gz'], ['phl', 'buildings.json']])
      expect(encoded.find(([c2, f2]) => c2 === c && f2 === f)[2]).toHaveProperty('bytes');
  });

  test.each(encoded.filter(([, , e]) => e && 'bytes' in e).map(([c, f, e]) => [`${c}/${f}`, c, f, e]))('%s reads the same', (_, city, file, e) => {
    const committed = own(bytesOf(`../data/${city}/${file}`));
    expect(sameValue(read(city, file, own(e.bytes)), read(city, file, committed))).toBe(true);
  });
});
