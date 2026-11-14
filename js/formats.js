// @ts-check
// The readers of the binary data files (layouts: docs/EDITING.md section 3; tools/phl/formats.py writes PHB1 and TER1).
// Pure functions of the bytes, with no three.js, DOM or CITY: the data worker (js/load-worker.js) runs them, and the
// modules that use the results re-export or call them (scene/city.js decode, scene/terrain.js setTerrain, scene/jsh/terrain.js loadTerrain).

/** Decode city_buildings.bin (PHB1; written by tools/phl/build_city.py and tools/nyc/import_nyc.py). */
/** @param {ArrayBuffer} buf */
export function decode(buf) {
  const dv = new DataView(buf);
  if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== 'PHB1') throw new Error('city buildings: bad header');
  const nB = dv.getUint32(4, true), nP = dv.getUint32(8, true), nV = dv.getUint32(12, true);
  let o = 16;
  const i32 = n => { const a = new Int32Array(buf.slice(o, o + n * 4)); o += n * 4; return a; };
  const u16 = n => { const a = new Uint16Array(buf.slice(o, o + n * 2)); o += n * 2; return a; };
  const u8 = n => { const a = new Uint8Array(buf, o, n); o += n; return a; };
  const bx = i32(nB), bz = i32(nB), vx = i32(nV), vz = i32(nV);
  const bw = u16(nB), bd = u16(nB), br = u16(nB), bh = u16(nB), pn = u16(nP), ph = u16(nP);
  const bk = u8(nB), pk = u8(nP);
  for (let i = 1; i < nB; i++) { bx[i] += bx[i - 1]; bz[i] += bz[i - 1]; }
  return { nB, nP, bx, bz, bw, bd, br, bh, bk, vx, vz, pn, ph, pk };
}

/** decode Philadelphia's TER1: header, then two Int16 grids (decimetres, rows delta-coded) */
/** @param {ArrayBuffer} buf */
export function readTerrain(buf) {
  const dv = new DataView(buf);
  if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== 'TER1') throw new Error('terrain: bad header');
  const x0 = dv.getInt32(4, true) / 10, z0 = dv.getInt32(8, true) / 10, cell = dv.getInt32(12, true) / 10, W = dv.getInt32(16, true), H = dv.getInt32(20, true);
  const read = off => {
    const a = new Int16Array(buf.slice(off, off + W * H * 2));
    for (let j = 0; j < H; j++) { let v = 0; for (let i = j * W, e = i + W; i < e; i++) { v += a[i]; a[i] = v; } }
    return a;
  };
  const G = read(24), D = read(24 + W * H * 2), S = new Int16Array(W * H);   // S: ground or water, whichever is higher
  for (let i = 0; i < S.length; i++) S[i] = D[i] > 0 ? G[i] + D[i] : G[i];
  return { x0, z0, cell, W, H, G, D, S };
}

/** decode Jersey Shore's terrain.bin: "TER1", n u32, half f32, cell f32, base f32, heights i16[n*n] (dm), cover u8[n*n] (0 open, 1 forest, 2 river bed, 3 cropland) */
/** @param {ArrayBuffer} buf */
export function readGrid(buf) {
  const dv = new DataView(buf);
  if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== 'TER1') throw new Error('terrain: bad header');
  const n = dv.getUint32(4, true), half = dv.getFloat32(8, true), cell = dv.getFloat32(12, true), base = dv.getFloat32(16, true);
  const raw = new Int16Array(buf.slice(20, 20 + n * n * 2)), h = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) h[i] = raw[i] / 10;
  return { n, half, cell, base, h, cover: new Uint8Array(buf, 20 + n * n * 2, n * n) };
}
