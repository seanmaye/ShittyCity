// Jersey Shore's terrain: an elevation grid with land cover (data/jsh/terrain.bin.gz, written by
// tools/jsh/build_jsh.py; loaded as data.grid, see cities.js `grid`). Philadelphia's lidar terrain
// is a different format and engine (js/scene/terrain.js); this one is Jersey Shore's own. Without
// a grid loaded, everything here returns 0 and the scene stays on the flat plane y = 0.
//
// The grid is drawn as its own surface, coloured by land cover. Everything else is built flat as
// usual and then laid onto it: trees and buildings stand on the ground at their own spot
// (groundAt, groundBase, read while they are built), and the flat layers (paving, parks, water,
// streets, rail, bridges) are cut along the grid's own triangle edges and lifted by drape(), so
// each piece lies exactly in the plane of the terrain triangle under it, keeping its small
// height above the ground.
import * as THREE from 'three';
import { M } from '../materials.js';
import { Builder } from '../geometry.js';
import { seasonalGrass } from '../season.js';

let T = null;   // { n, half, cell, base, h: Float32Array (m), cover: Uint8Array }

/** decode terrain.bin: "TER1", n u32, half f32, cell f32, base f32, heights i16[n*n] (dm), cover u8[n*n] (0 open, 1 forest, 2 river bed, 3 cropland) */
export function loadTerrain(buf) {
  const dv = new DataView(buf);
  if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== 'TER1') throw new Error('terrain: bad header');
  const n = dv.getUint32(4, true), half = dv.getFloat32(8, true), cell = dv.getFloat32(12, true), base = dv.getFloat32(16, true);
  const raw = new Int16Array(buf.slice(20, 20 + n * n * 2)), h = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) h[i] = raw[i] / 10;
  T = { n, half, cell, base, h, cover: new Uint8Array(buf, 20 + n * n * 2, n * n) };
  return T;
}
export const hasTerrain = () => !!T;

/** ground height at (x, z): on the grid's triangles (each cell split from its north-west to south-east corner) */
export function groundAt(x, z) {
  if (!T) return 0;
  const { n, half, cell, h } = T, u = (x + half) / cell, v = (z + half) / cell;
  if (u < 0 || v < 0 || u > n - 1 || v > n - 1) return 0;
  const i = Math.min(n - 2, Math.floor(u)), j = Math.min(n - 2, Math.floor(v)), fu = u - i, fv = v - j, k = j * n + i;
  const h00 = h[k], h10 = h[k + 1], h01 = h[k + n], h11 = h[k + n + 1];
  return fu >= fv ? h00 + fu * (h10 - h00) + fv * (h11 - h10) : h00 + fv * (h01 - h00) + fu * (h11 - h01);
}
/** where a footprint ([[x, z], ...]) stands: its lowest corner, so no wall floats on a slope */
export function groundBase(ring) {
  if (!T) return 0;
  let lo = Infinity; for (const [x, z] of ring) lo = Math.min(lo, groundAt(x, z));
  return lo;
}

const COUNTRY = '#69775a';   // ground.js COUNTRY (not imported: ground.js imports this module)
const OPEN = new THREE.Color(COUNTRY), FOREST = new THREE.Color('#4a5d3e'), BED = new THREE.Color('#5b6650'), CROP = new THREE.Color('#8f8c62');
/** The terrain surface (in 2 km tiles, so the camera and the sun's shadow box can skip tiles) and,
 *  beyond it, flat country out to the horizon. */
export function buildTerrain(scene) {
  const { n, half, cell, h, cover } = T, TILE = 50, col = new THREE.Color();
  const mat = seasonalGrass(M('#ffffff', { vertexColors: true, roughness: 1, side: THREE.FrontSide }));
  // colour: open land, woods and river bed, softened over a cell either side
  const cv = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    let f = 0, w = 0, c = 0, p = 0;
    for (let b = Math.max(0, j - 1); b <= Math.min(n - 1, j + 1); b++) for (let a = Math.max(0, i - 1); a <= Math.min(n - 1, i + 1); a++) {
      const q = cover[b * n + a]; c++; if (q === 1) f++; else if (q === 2) w++; else if (q === 3) p++;
    }
    col.copy(OPEN).lerp(CROP, p / c * .8).lerp(FOREST, f / c).lerp(BED, w / c);
    // a little variation so the fields don't read as one flat sheet
    const r = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453; col.multiplyScalar(.94 + (r - Math.floor(r)) * .1);
    col.toArray(cv, (j * n + i) * 3);
  }
  // normals from the grid
  const nv = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const hl = h[j * n + Math.max(0, i - 1)], hr = h[j * n + Math.min(n - 1, i + 1)], hu = h[Math.max(0, j - 1) * n + i], hd = h[Math.min(n - 1, j + 1) * n + i];
    const nx = (hl - hr) / (2 * cell), nz = (hu - hd) / (2 * cell), L = Math.hypot(nx, 1, nz);
    nv.set([nx / L, 1 / L, nz / L], (j * n + i) * 3);
  }
  const meshes = [];
  for (let tj = 0; tj < n - 1; tj += TILE) for (let ti = 0; ti < n - 1; ti += TILE) {
    const b = new Builder({ color: true }), j1 = Math.min(n - 1, tj + TILE), i1 = Math.min(n - 1, ti + TILE), w = i1 - ti + 1, c3 = new THREE.Color();
    for (let j = tj; j <= j1; j++) for (let i = ti; i <= i1; i++) {
      const k = j * n + i; c3.fromArray(cv, k * 3);
      b.v(-half + i * cell, h[k], -half + j * cell, nv[k * 3], nv[k * 3 + 1], nv[k * 3 + 2], 0, 0, c3);
    }
    for (let j = 0; j < j1 - tj; j++) for (let i = 0; i < i1 - ti; i++) {
      const a = j * w + i;
      b.tri(a, a + w + 1, a + 1); b.tri(a, a + w, a + w + 1);   // split NW-SE, as groundAt
    }
    const m = new THREE.Mesh(b.geometry(), mat); m.receiveShadow = m.castShadow = true; m.userData.draped = true;
    scene.add(m); meshes.push(m);
  }
  // flat country around the grid (the grid fades to y = 0 at its edge)
  const FAR = 200000, ob = new Builder();
  const quad = (x0, z0, x1, z1) => { const s = ob.count; ob.v(x0, 0, z0, 0, 1, 0); ob.v(x0, 0, z1, 0, 1, 0); ob.v(x1, 0, z0, 0, 1, 0); ob.v(x1, 0, z1, 0, 1, 0); ob.tri(s, s + 1, s + 2); ob.tri(s + 2, s + 1, s + 3); };
  quad(-FAR, -FAR, FAR, -half); quad(-FAR, half, FAR, FAR); quad(-FAR, -half, -half, half); quad(half, -half, FAR, half);
  const outer = new THREE.Mesh(ob.geometry(), seasonalGrass(M(COUNTRY, { roughness: 1, side: THREE.FrontSide })));
  outer.position.y = -.05; outer.receiveShadow = true; outer.userData.draped = true; scene.add(outer);
  return meshes;
}

// ---- draping flat geometry
// A vertex is [x, y, z, ...other attributes]; a polygon is a list of vertices.
function lerpV(a, b, t) { const o = new Array(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] + (b[i] - a[i]) * t; return o; }
/** split a convex polygon by the line f(v) = k into the parts below and above it */
function split(poly, f, k, lo, hi) {
  const A = [], B = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], fp = f(p) - k, fq = f(q) - k;
    if (fp <= 0) A.push(p); if (fp >= 0) B.push(p);
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) { const m = lerpV(p, q, fp / (fp - fq)); A.push(m); B.push(m); }
  }
  if (A.length >= 3) lo.push(A); if (B.length >= 3) hi.push(B);
}
/** cut a triangle along every grid line (u, v integer) and cell diagonal (u - v integer) it crosses */
function cut(tri) {
  const { half, cell } = T, fu = p => (p[0] + half) / cell, fv = p => (p[2] + half) / cell, fw = p => fu(p) - fv(p);
  let polys = [tri];
  for (const f of [fu, fv, fw]) {
    const vals = tri.map(f), k0 = Math.floor(Math.min(...vals)) + 1, k1 = Math.ceil(Math.max(...vals)) - 1;
    for (let k = k0; k <= k1; k++) {
      const next = [];
      for (const p of polys) {
        const pv = p.map(f), mn = Math.min(...pv), mx = Math.max(...pv);
        if (mx <= k || mn >= k) { next.push(p); continue; }
        const lo = [], hi = []; split(p, f, k, lo, hi); next.push(...lo, ...hi);
      }
      polys = next;
    }
  }
  return polys;
}
/** a flat mesh's geometry, cut along the grid and lifted onto it (world x, z = local x, z) */
function drapeGeometry(g) {
  const names = Object.keys(g.attributes).filter(k => ['position', 'normal', 'uv', 'color'].includes(k));
  const attrs = names.map(k => g.attributes[k]), sizes = attrs.map(a => a.itemSize), W = sizes.reduce((a, b) => a + b, 0);
  const idx = g.index ? g.index.array : null, nTri = (idx ? idx.length : g.attributes.position.count) / 3;
  const vert = i => { const o = []; attrs.forEach(a => { for (let c = 0; c < a.itemSize; c++) o.push(a.array[i * a.itemSize + c]); }); return o; };
  const out = [];
  for (let t = 0; t < nTri; t++) {
    const tri = [0, 1, 2].map(c => vert(idx ? idx[t * 3 + c] : t * 3 + c));
    for (const p of cut(tri)) for (let k = 1; k + 1 < p.length; k++) out.push(p[0], p[k], p[k + 1]);
  }
  const ng = new THREE.BufferGeometry();
  let off = 0;
  names.forEach((name, a) => {
    const s = sizes[a], arr = new Float32Array(out.length * s);
    out.forEach((v, i) => { for (let c = 0; c < s; c++) arr[i * s + c] = v[off + c]; });
    if (name === 'position') for (let i = 0; i < out.length; i++) arr[i * 3 + 1] += groundAt(arr[i * 3], arr[i * 3 + 2]);
    ng.setAttribute(name, new THREE.BufferAttribute(arr, s));
    off += s;
  });
  ng.computeBoundingSphere(); ng.computeBoundingBox();
  return ng;
}

/**
 * Lay what was built flat onto the terrain: meshes are cut and lifted, instanced meshes (bridge
 * piers) have each instance lifted, lines get a point every 20 m. Skips anything marked
 * userData.draped (the terrain itself, buildings) or userData.grounded (trees, built standing on it).
 */
export function drape(objects) {
  if (!T) return;
  const mv = new THREE.Matrix4();
  for (const root of objects) root.traverse(o => {
    if (o.userData.draped || o.userData.grounded) return;
    if (o.rotation.x || o.rotation.z || o.position.x || o.position.z) return;   // only plain flat layers
    if (o.isInstancedMesh) {
      const a = o.instanceMatrix.array;
      for (let i = 0; i < o.count; i++) { mv.fromArray(a, i * 16); a[i * 16 + 13] += groundAt(a[i * 16 + 12], a[i * 16 + 14]); }
      o.instanceMatrix.needsUpdate = true;
    } else if (o.isMesh) {
      const g = drapeGeometry(o.geometry); o.geometry.dispose(); o.geometry = g;
    } else if (o.isLine) {
      const p = o.geometry.attributes.position, pts = [], n = p.count + (o.isLineLoop ? 1 : 0);
      for (let i = 0; i + 1 < n; i++) {
        const a = new THREE.Vector3().fromBufferAttribute(p, i), b = new THREE.Vector3().fromBufferAttribute(p, (i + 1) % p.count), steps = Math.max(1, Math.ceil(a.distanceTo(b) / 20));
        for (let s = 0; s < steps; s++) { const q = a.clone().lerp(b, s / steps); q.y += groundAt(q.x, q.z); pts.push(q); }
      }
      o.geometry.dispose(); o.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    }
    o.userData.draped = true;
  });
}
