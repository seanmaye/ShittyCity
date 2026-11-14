// The compact encodings the build ships in place of the committed data files (P6b). The committed files stay as the
// pipeline writes them (JSON, PHB1, TER1: docs/EDITING.md section 3); vite.config.js's dataCodec encodes each into one of
// these when it copies it into dist/assets/, checks that it decodes back to exactly the same values, and gzips it. The dev
// server serves the committed files as they are, so the page reads both: js/data.ts (JCOL), js/scene/city.ts (PHB2),
// js/scene/terrain.ts and js/scene/jsh/terrain.ts (TER2). The encoders run only in the build and the tests.
//
//   JCOL  any JSON: every array of integers (the flat decimetre coordinates) moves out of the text into one column of
//         zigzag deltas in 4 byte planes; the rest stays JSON. Layout: "JCOL", skeleton bytes u32, lengths bytes u32,
//         values u32, the skeleton (the JSON with [] where each such array was), the lengths (a varint per [] in the
//         skeleton, in document order: 0 for an array that was empty, else length * 4 + stride), the values (byte 0 of
//         every value, then byte 1, 2, 3). A value is the difference from the one `stride` (1 to 3) places back; an array's
//         first `stride` values are differences from the first values of the previous array of that stride.
//   TER2  TER1 (either layout) with each Int16 grid as absolute heights predicted from the left, upper and upper-left
//         neighbours (left + up - upper-left; the first row from the left, the first column from above): each residual is
//         one signed byte, or 0x80 and the residual as int16 when it is outside -127..127.
//   PHB2  PHB1's columns in the same order: the int32 columns as zigzag in 4 byte planes, each outline's first vertex as a
//         difference from the previous outline's first vertex; the u16 columns in 2 byte planes; the u8 columns as they are.

const tag = (u8: Uint8Array) => (u8.length < 4 ? '' : String.fromCharCode(u8[0], u8[1], u8[2], u8[3]));
/** the first four bytes as text: the format's name ("JCOL", "TER1", "TER2", "PHB1", "PHB2") or anything else */
export const formatOf = (buf: ArrayBuffer | Uint8Array): string => tag(buf instanceof Uint8Array ? buf : new Uint8Array(buf, 0, Math.min(4, buf.byteLength)));

const zigzag = (v: number) => ((v << 1) ^ (v >> 31)) >>> 0;
const fromPlanes32 = (u8: Uint8Array, o: number, n: number, k: number) => {
  const z = u8[o + k] | (u8[o + n + k] << 8) | (u8[o + 2 * n + k] << 16) | (u8[o + 3 * n + k] << 24);
  return (z >>> 1) ^ -(z & 1);
};
/** int32 values as zigzag in 4 byte planes */
function planes32(v: ArrayLike<number>): Uint8Array {
  const n = v.length, out = new Uint8Array(4 * n);
  for (let k = 0; k < n; k++) { const z = zigzag(v[k]); out[k] = z & 255; out[n + k] = (z >>> 8) & 255; out[2 * n + k] = (z >>> 16) & 255; out[3 * n + k] = z >>> 24; }
  return out;
}
/** u16 values in 2 byte planes */
function planes16(v: ArrayLike<number>): Uint8Array {
  const n = v.length, out = new Uint8Array(2 * n);
  for (let k = 0; k < n; k++) { out[k] = v[k] & 255; out[n + k] = v[k] >>> 8; }
  return out;
}
function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
/** a plain Uint8Array over the same bytes: a Node Buffer's slice() is a view, not a copy, and the encoders copy with slice() */
const plain = (u8: Uint8Array) => new Uint8Array(u8.buffer, u8.byteOffset, u8.byteLength);
const u32le = (...v: number[]) => { const b = new Uint8Array(4 * v.length), dv = new DataView(b.buffer); v.forEach((x, i) => dv.setUint32(4 * i, x, true)); return b; };

// ---- JCOL

/** an array JCOL moves into its column: two or more integers, none -0, each within ±2^30 (so every difference fits int32) */
const intArray = (v: unknown[]) => v.length >= 2 && v.every(x => typeof x === 'number' && Number.isInteger(x) && !Object.is(x, -0) && Math.abs(x) < 2 ** 30);

/** JSON value -> JCOL bytes (not gzipped); null if it has no integer arrays to move, or a -0 that would stay in the text
 * (JSON.stringify writes it as 0) */
export function encodeJcol(value: unknown): Uint8Array | null {
  const lens: number[] = [], vals: number[] = [], first: number[][] = [[], [], [], []];
  let negZero = false;
  const strideOf = (a: number[]) => {   // the stride (1 to 3) whose differences are smallest: 2 for [x, z, ...], 3 for [x, y, z, ...]
    let best = 1, low = Infinity;
    for (let s = 1; s <= 3 && s < a.length; s++) { let c = 0; for (let i = s; i < a.length; i++) c += Math.abs(a[i] - a[i - s]); if (c < low) { low = c; best = s; } }
    return best;
  };
  const skeleton = (v: unknown): unknown => {
    if (Array.isArray(v)) {
      if (intArray(v)) {
        const a = v as number[], s = strideOf(a), f = first[s];
        lens.push(a.length * 4 + s);
        for (let i = 0; i < a.length; i++) vals.push(i < s ? a[i] - (f[i] || 0) : a[i] - a[i - s]);
        for (let i = 0; i < s; i++) f[i] = a[i];
        return [];
      }
      if (!v.length) lens.push(0);
      return v.map(skeleton);
    }
    if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = skeleton(v[k]); return o; }
    if (Object.is(v, -0)) negZero = true;
    return v;
  };
  const text = new TextEncoder().encode(JSON.stringify(skeleton(value)));
  if (!vals.length || negZero) return null;
  const L: number[] = [];
  for (let x of lens) { while (x >= 128) { L.push((x & 127) | 128); x = Math.floor(x / 128); } L.push(x); }
  return concat([new TextEncoder().encode('JCOL'), u32le(text.length, L.length, vals.length), text, Uint8Array.from(L), planes32(vals)]);
}

/** JCOL bytes -> the JSON value, exactly as JSON.parse gave it from the committed file */
export function decodeJcol(u8: Uint8Array): unknown {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (tag(u8) !== 'JCOL') throw new Error('JCOL: bad header');
  const sl = dv.getUint32(4, true), ll = dv.getUint32(8, true), n = dv.getUint32(12, true);
  const root = JSON.parse(new TextDecoder().decode(u8.subarray(16, 16 + sl)));
  const first: number[][] = [[], [], [], []], vo = 16 + sl + ll;
  let lo = 16 + sl, vi = 0;
  const fill = (): number[] => {   // the next length; [] for an array that was empty, else the array
    let x = 0, mul = 1, b: number;
    do { b = u8[lo++]; x += (b & 127) * mul; mul *= 128; } while (b & 128);
    if (!x) return [];
    // exactly its length, as JSON.parse makes it: built with push, the arrays kept a third more memory (phl +25 MB heap)
    const len = Math.floor(x / 4), s = x & 3, f = first[s], a: number[] = new Array(len);
    for (let i = 0; i < len; i++, vi++) { const d = fromPlanes32(u8, vo, n, vi); a[i] = i < s ? d + (f[i] || 0) : d + a[i - s]; }
    for (let i = 0; i < s; i++) f[i] = a[i];
    return a;
  };
  const isHole = (x: unknown) => Array.isArray(x) && !x.length;
  const walk = (v: unknown) => {
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) if (isHole(v[i])) v[i] = fill(); else walk(v[i]); }
    else if (v && typeof v === 'object') for (const k in v) if (isHole(v[k])) v[k] = fill(); else walk(v[k]);   // (JSON.parse's objects: own keys only, in order)
  };
  if (isHole(root)) return fill();
  walk(root);
  return root;
}

// ---- TER2

/** an Int16 grid (W x H, row by row) -> planar-predicted residuals, one byte each or 0x80 + int16 */
function encodeGrid(A: Int16Array, W: number, H: number): Uint8Array {
  const out = new Uint8Array(A.length * 3);
  let o = 0;
  for (let j = 0, k = 0; j < H; j++) for (let i = 0; i < W; i++, k++) {
    const p = i && j ? A[k - 1] + A[k - W] - A[k - W - 1] : i ? A[k - 1] : j ? A[k - W] : 0, r = ((A[k] - p) << 16) >> 16;
    if (r >= -127 && r <= 127) out[o++] = r & 255;
    else { out[o++] = 0x80; out[o++] = r & 255; out[o++] = (r >> 8) & 255; }
  }
  return out.slice(0, o);
}
/** TER2 grid at offset o -> [the absolute Int16 grid, the offset after it] */
export function decodeGrid(u8: Uint8Array, o: number, W: number, H: number): [Int16Array, number] {
  const A = new Int16Array(W * H);
  const next = () => { const b = u8[o++]; if (b !== 0x80) return (b << 24) >> 24; const r = u8[o] | (u8[o + 1] << 8); o += 2; return (r << 16) >> 16; };
  for (let i = 0; i < W; i++) A[i] = (i ? A[i - 1] : 0) + next();
  // the rows after the first: left and upper-left kept in locals (wrapped to int16 as the array stores them), so each
  // sample reads one value back (above) instead of three
  for (let j = 1, k = W; j < H; j++) {
    let ul = A[k - W], left = ((ul + next()) << 16) >> 16;
    A[k++] = left;
    for (const e = k + W - 1; k < e; k++) {
      const up = A[k - W];
      let b = u8[o++];
      if (b !== 0x80) b = (b << 24) >> 24; else { b = ((u8[o] | (u8[o + 1] << 8)) << 16) >> 16; o += 2; }
      left = ((left + up - ul + b) << 16) >> 16;
      A[k] = left; ul = up;
    }
  }
  return [A, o];
}

/** TER1 -> TER2, either layout: Philadelphia's (24 byte header, two grids with rows delta-coded) or Jersey Shore's (20 byte
 * header, one grid of absolute heights, then the cover bytes); null if it is neither */
export function encodeTer2(u8: Uint8Array): Uint8Array | null {
  u8 = plain(u8);
  if (tag(u8) !== 'TER1') return null;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), head = u8.slice(0, 4);
  const W = u8.length >= 24 ? dv.getInt32(16, true) : 0, H = u8.length >= 24 ? dv.getInt32(20, true) : 0, n = dv.getUint32(4, true);
  const grid = (o: number, w: number, h: number) => new Int16Array(u8.slice(o, o + w * h * 2).buffer);
  const name = new TextEncoder().encode('TER2');
  if (W > 0 && H > 0 && 24 + 4 * W * H === u8.length) {   // Philadelphia: absolute heights from the rows' differences
    const g = [grid(24, W, H), grid(24 + 2 * W * H, W, H)];
    for (const a of g) for (let j = 0; j < H; j++) for (let i = j * W + 1, e = j * W + W; i < e; i++) a[i] += a[i - 1];
    head.set(name); return concat([head, u8.slice(4, 24), encodeGrid(g[0], W, H), encodeGrid(g[1], W, H)]);
  }
  if (n > 0 && 20 + 3 * n * n === u8.length) {   // Jersey Shore
    head.set(name); return concat([head, u8.slice(4, 20), encodeGrid(grid(20, n, n), n, n), u8.slice(20 + 2 * n * n)]);
  }
  return null;
}

// ---- PHB2

/** decode() in js/scene/city.ts: PHB1 or PHB2 */
export interface CityBuildings {
  nB: number; nP: number;
  /** box centres (decimetres), sizes (dm), rotation (0..65535 for 0..pi), height (dm), kind */
  bx: Int32Array; bz: Int32Array; bw: Uint16Array; bd: Uint16Array; br: Uint16Array; bh: Uint16Array; bk: Uint8Array;
  /** outline vertices (dm; each outline's first absolute, the rest differences), vertex count, height (dm), kind */
  vx: Int32Array; vz: Int32Array; pn: Uint16Array; ph: Uint16Array; pk: Uint8Array;
}

/** PHB1 -> PHB2 (the columns as PHB1 stores them, so decodePhb2 gives decode()'s PHB1 result exactly) */
export function encodePhb2(u8: Uint8Array): Uint8Array | null {
  u8 = plain(u8);
  if (tag(u8) !== 'PHB1') return null;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const nB = dv.getUint32(4, true), nP = dv.getUint32(8, true), nV = dv.getUint32(12, true);
  if (16 + nB * 16 + nV * 8 + nP * 4 + nB + nP !== u8.length) return null;
  let o = 16;
  const col = <T>(make: (b: ArrayBuffer) => T, bytes: number) => { const a = make(u8.slice(o, o + bytes).buffer); o += bytes; return a; };
  const bx = col(b => new Int32Array(b), nB * 4), bz = col(b => new Int32Array(b), nB * 4), vx = col(b => new Int32Array(b), nV * 4), vz = col(b => new Int32Array(b), nV * 4);
  const u16 = [0, 1, 2, 3].map(() => col(b => new Uint16Array(b), nB * 2)), pn = col(b => new Uint16Array(b), nP * 2), ph = col(b => new Uint16Array(b), nP * 2);
  const rest = u8.slice(o);   // bk, pk
  const chain = (v: Int32Array) => {   // each outline's first vertex as the difference from the previous outline's first
    const out = v.slice();
    for (let p = 0, k = 0, prev = 0; p < nP; k += pn[p++]) { out[k] = (v[k] - prev) | 0; prev = v[k]; }
    return out;
  };
  const head = u8.slice(0, 16); head.set(new TextEncoder().encode('PHB2'));
  return concat([head, planes32(bx), planes32(bz), planes32(chain(vx)), planes32(chain(vz)), ...u16.map(planes16), planes16(pn), planes16(ph), rest]);
}

/** PHB2 -> the same columns as decode() reads from PHB1 (box centres summed up) */
export function decodePhb2(buf: ArrayBuffer): CityBuildings {
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  if (tag(u8) !== 'PHB2') throw new Error('city buildings: bad header');
  const nB = dv.getUint32(4, true), nP = dv.getUint32(8, true), nV = dv.getUint32(12, true);
  let o = 16;
  const z32 = (n: number) => {
    const a = new Int32Array(n), p0 = u8.subarray(o, o + n), p1 = u8.subarray(o + n, o + 2 * n), p2 = u8.subarray(o + 2 * n, o + 3 * n), p3 = u8.subarray(o + 3 * n, o + 4 * n);
    for (let k = 0; k < n; k++) { const z = p0[k] | (p1[k] << 8) | (p2[k] << 16) | (p3[k] << 24); a[k] = (z >>> 1) ^ -(z & 1); }
    o += 4 * n; return a;
  };
  const p16 = (n: number) => { const a = new Uint16Array(n), p0 = u8.subarray(o, o + n), p1 = u8.subarray(o + n, o + 2 * n); for (let k = 0; k < n; k++) a[k] = p0[k] | (p1[k] << 8); o += 2 * n; return a; };
  const b8 = (n: number) => { const a = new Uint8Array(buf, o, n); o += n; return a; };
  const bx = z32(nB), bz = z32(nB), vx = z32(nV), vz = z32(nV);
  const bw = p16(nB), bd = p16(nB), br = p16(nB), bh = p16(nB), pn = p16(nP), ph = p16(nP);
  const bk = b8(nB), pk = b8(nP);
  for (let i = 1; i < nB; i++) { bx[i] += bx[i - 1]; bz[i] += bz[i - 1]; }
  for (let p = 0, k = 0, fx = 0, fz = 0; p < nP; k += pn[p++]) { fx = vx[k] += fx; fz = vz[k] += fz; }
  return { nB, nP, bx, bz, bw, bd, br, bh, bk, vx, vz, pn, ph, pk };
}

// ---- the page's readers (both formats of each), which the build also checks its encodings with

/** city_buildings (PHB1 or PHB2) -> its columns; decode() in js/scene/city.ts */
export function decodeCityBuildings(buf: ArrayBuffer): CityBuildings {
  if (formatOf(buf) === 'PHB2') return decodePhb2(buf);
  const dv = new DataView(buf);
  if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== 'PHB1') throw new Error('city buildings: bad header');
  const nB = dv.getUint32(4, true), nP = dv.getUint32(8, true), nV = dv.getUint32(12, true);
  let o = 16;
  const i32 = (n: number) => { const a = new Int32Array(buf.slice(o, o + n * 4)); o += n * 4; return a; };
  const u16 = (n: number) => { const a = new Uint16Array(buf.slice(o, o + n * 2)); o += n * 2; return a; };
  const u8 = (n: number) => { const a = new Uint8Array(buf, o, n); o += n; return a; };
  const bx = i32(nB), bz = i32(nB), vx = i32(nV), vz = i32(nV);
  const bw = u16(nB), bd = u16(nB), br = u16(nB), bh = u16(nB), pn = u16(nP), ph = u16(nP);
  const bk = u8(nB), pk = u8(nP);
  for (let i = 1; i < nB; i++) { bx[i] += bx[i - 1]; bz[i] += bz[i - 1]; }
  return { nB, nP, bx, bz, bw, bd, br, bh, bk, vx, vz, pn, ph, pk };
}

/** Philadelphia's terrain (TER1 or TER2) -> its frame (metres) and two grids of absolute decimetres: G the ground, D the
 * water surface less the ground; setTerrain() in js/scene/terrain.ts */
export function readTerrain(buf: ArrayBuffer): { x0: number; z0: number; cell: number; W: number; H: number; G: Int16Array; D: Int16Array } {
  const dv = new DataView(buf), name = formatOf(buf);
  if (name !== 'TER1' && name !== 'TER2') throw new Error('terrain: bad header');
  const x0 = dv.getInt32(4, true) / 10, z0 = dv.getInt32(8, true) / 10, cell = dv.getInt32(12, true) / 10, W = dv.getInt32(16, true), H = dv.getInt32(20, true);
  if (name === 'TER2') {
    const u8 = new Uint8Array(buf), [G, o] = decodeGrid(u8, 24, W, H), [D] = decodeGrid(u8, o, W, H);
    return { x0, z0, cell, W, H, G, D };
  }
  const read = (off: number) => {
    const a = new Int16Array(buf.slice(off, off + W * H * 2));
    for (let j = 0; j < H; j++) { let v = 0; for (let i = j * W, e = i + W; i < e; i++) { v += a[i]; a[i] = v; } }
    return a;
  };
  return { x0, z0, cell, W, H, G: read(24), D: read(24 + W * H * 2) };
}

/** Jersey Shore's terrain (TER1 or TER2, its own layout) -> n x n heights in decimetres and the cover bytes (a view into
 * buf); loadTerrain() in js/scene/jsh/terrain.ts */
export function readGridTerrain(buf: ArrayBuffer): { n: number; half: number; cell: number; base: number; raw: Int16Array; cover: Uint8Array } {
  const dv = new DataView(buf), name = formatOf(buf);
  if (name !== 'TER1' && name !== 'TER2') throw new Error('terrain: bad header');
  const n = dv.getUint32(4, true), half = dv.getFloat32(8, true), cell = dv.getFloat32(12, true), base = dv.getFloat32(16, true);
  if (name === 'TER2') { const [raw, o] = decodeGrid(new Uint8Array(buf), 20, n, n); return { n, half, cell, base, raw, cover: new Uint8Array(buf, o, n * n) }; }
  return { n, half, cell, base, raw: new Int16Array(buf.slice(20, 20 + n * n * 2)), cover: new Uint8Array(buf, 20 + n * n * 2, n * n) };
}

// ---- what the build ships

/** the same values, exactly: numbers by Object.is (so -0 is not 0), typed arrays byte for byte, objects key by key in order */
export function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' || typeof b === 'number') return Object.is(a, b);
  if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) {
    if (!ArrayBuffer.isView(a) || !ArrayBuffer.isView(b) || a.constructor !== b.constructor || a.byteLength !== b.byteLength) return false;
    const x = new Uint8Array(a.buffer, a.byteOffset, a.byteLength), y = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  }
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k, i) => k === kb[i] && sameValue(a[k], b[k]));
  }
  return a === b;
}

/** JSON files this size (decoded) or larger ship as JCOL; smaller ones stay JSON, as committed */
export const JCOL_MIN = 32 * 1024;
const own = (u8: Uint8Array) => plain(u8).slice().buffer;

/**
 * A committed data file (its name, and its bytes gunzipped if it is a .gz) -> the encoding the build ships in its place
 * (not gzipped yet) and the name it ships under, or null to ship the file as committed: JSON of JCOL_MIN or more -> JCOL
 * (<name>.jcol.gz), TER1 -> TER2 and PHB1 -> PHB2 (same name). Each encoding is decoded again with the page's readers and
 * kept only if they give exactly what the committed file gives (else null, and why).
 */
export function encodeData(name: string, u8: Uint8Array): { name: string; bytes: Uint8Array } | { skip: string } | null {
  u8 = plain(u8);
  if (/\.json(\.gz)?$/.test(name)) {
    if (u8.length < JCOL_MIN) return null;
    const value = JSON.parse(new TextDecoder().decode(u8)), bytes = encodeJcol(value);
    if (!bytes) return null;
    return sameValue(decodeJcol(bytes), value) ? { name: name.replace(/\.json(\.gz)?$/, '.jcol.gz'), bytes } : { skip: 'JCOL does not decode to the same values' };
  }
  const kind = formatOf(u8);
  if (kind === 'TER1') {
    const bytes = encodeTer2(u8);
    if (!bytes) return { skip: 'TER1 in neither terrain layout' };
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), read = u8.length === 24 + 4 * dv.getInt32(16, true) * dv.getInt32(20, true) ? readTerrain : readGridTerrain;
    return sameValue(read(own(bytes)), read(own(u8))) ? { name, bytes } : { skip: 'TER2 does not decode to the same grid' };
  }
  if (kind === 'PHB1') {
    const bytes = encodePhb2(u8);
    if (!bytes) return { skip: 'PHB1 of the wrong length' };
    return sameValue(decodeCityBuildings(own(bytes)), decodeCityBuildings(own(u8))) ? { name, bytes } : { skip: 'PHB2 does not decode to the same columns' };
  }
  return null;
}
