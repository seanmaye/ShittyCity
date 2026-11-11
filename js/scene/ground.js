// Ground, parks and green space, streets, trails, rail lines and bridges (OpenStreetMap).
import * as THREE from 'three';
import { pairs } from '../data.js';
import { M } from './materials.js';
import { Builder, addPolygon, addRibbon } from './geometry.js';
import { seasonalGrass } from './season.js';
import { onPromenade } from './phl/promenade.js';
import { CITY } from '../cities.js';
// Colours sampled to match summer aerial imagery: mown grass, darker park woodland, asphalt,
// gravel and dirt trails, rail ballast, the mixed concrete, asphalt and yards between buildings,
// and the wooded, suburban country beyond the city limits.
export const GREEN = ['#5f8746', '#6f9a4f', '#5a9446', '#43663a', '#678a50']; // park, grass, pitch, wood, cemetery
export const GROUND = '#a7a39a', COUNTRY = '#69775a';
const ROAD = '#55585c', TRAIL = '#cbbd9c', RAIL = '#6b625a';

/** Ground between buildings: the base colour mottled at lot scale (parking, yards, paving).
 *  UVs are world metres / 400, so one texture tile spans 400 m. */
let groundTex = null;
export function groundMat(color, side = THREE.DoubleSide) {
  if (!groundTex) {
    const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d'), img = g.createImageData(N, N);
    let seed = 5; const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    // value noise over three octaves, wrapping so the tile repeats seamlessly
    const oct = [8, 24, 64].map(n => ({ n, v: Array.from({ length: n * n }, rnd) }));
    const at = (o, x, y) => {
      const fx = x / N * o.n, fy = y / N * o.n, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const v = (i, j) => o.v[((j % o.n) * o.n) + (i % o.n)], s = t => t * t * (3 - 2 * t);
      const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * s(tx), b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * s(tx);
      return a + (b - a) * s(ty);
    };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const n = at(oct[0], x, y) * .5 + at(oct[1], x, y) * .3 + at(oct[2], x, y) * .2, i = (y * N + x) * 4;
      const yard = Math.max(0, at(oct[1], x + 97, y + 31) - .62) * 2.2;   // patches of yard and street trees
      const k = 205 + n * 50 + (rnd() - .5) * 10;
      img.data[i] = k * (1 - yard * .25); img.data[i + 1] = k * (1 - yard * .08); img.data[i + 2] = k * (1 - yard * .3); img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    groundTex = new THREE.CanvasTexture(c); groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping; groundTex.anisotropy = 8;
  }
  return new THREE.MeshStandardMaterial({ color, map: groundTex, roughness: 1, side });
}

function inRings(x, z, rings) {
  let inside = false;
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i], [xj, zj] = r[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * The countryside plane (size x size metres at y = 0) without the part under the paved city
 * (`cover`: the city-limits rings, [[x,z],...]). The paving lies on top of it, so that part is
 * never seen, but it would still be shaded in full: this renderer has no early depth test.
 * It is a regular grid of cells (no T-junctions). A cell is left out only if it and its eight
 * neighbours are inside the outline and clear of its edge, so the hole stays a cell's width
 * inside the paving and is never seen past its edge, however low the camera is.
 */
function countryside(cover, size = 30000, cell = 250) {
  const n = Math.round(size / cell), o = -size / 2, inside = new Uint8Array(n * n), edge = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {   // even-odd fill along each row of cell centres
    const z = o + (j + .5) * cell, xs = [];
    for (const r of cover) for (let i = 0, k = r.length - 1; i < r.length; k = i++) {
      const [xi, zi] = r[i], [xk, zk] = r[k];
      if ((zi > z) !== (zk > z)) xs.push(xi + (z - zi) * (xk - xi) / (zk - zi));
    }
    xs.sort((a, b) => a - b);
    for (let q = 0; q + 1 < xs.length; q += 2)
      for (let i = Math.max(0, Math.ceil((xs[q] - o) / cell - .5)); i < n && o + (i + .5) * cell < xs[q + 1]; i++) inside[j * n + i] = 1;
  }
  for (const r of cover) for (let i = 0, k = r.length - 1; i < r.length; k = i++) {   // cells the outline passes through
    const [xi, zi] = r[i], [xk, zk] = r[k], steps = Math.max(1, Math.ceil(Math.hypot(xk - xi, zk - zi) / (cell / 4)));
    for (let q = 0; q <= steps; q++) {
      const ci = Math.floor((xi + (xk - xi) * q / steps - o) / cell), cj = Math.floor((zi + (zk - zi) * q / steps - o) / cell);
      if (ci >= 0 && ci < n && cj >= 0 && cj < n) edge[cj * n + ci] = 1;
    }
  }
  const hidden = (i, j) => {
    for (let b = Math.max(0, j - 1); b <= Math.min(n - 1, j + 1); b++) for (let a = Math.max(0, i - 1); a <= Math.min(n - 1, i + 1); a++) if (edge[b * n + a] || !inside[b * n + a]) return false;
    return true;
  };
  const b = new Builder(), node = new Int32Array((n + 1) * (n + 1)).fill(-1);
  const at = (i, j) => { const k = j * (n + 1) + i; if (node[k] < 0) node[k] = b.v(o + i * cell, 0, o + j * cell, 0, 1, 0); return node[k]; };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    if (hidden(i, j)) continue;
    const p00 = at(i, j), p10 = at(i + 1, j), p01 = at(i, j + 1), p11 = at(i + 1, j + 1);
    b.tri(p00, p01, p10); b.tri(p10, p01, p11);
  }
  return b.geometry();
}

/**
 * capRings: outline of the rail-yard deck; road bridges over it land on the deck instead.
 * sea: a waterfront city (New York): the land is only what city.js paves from the land outlines,
 * so neither the countryside nor a paved rectangle is drawn here.
 * paved: outline of the paved city plate that buildCity lays over the countryside plane.
 */
export function buildGround(scene, data, river, capRings = [], { sea = false, paved = [] } = {}) {
  const cap = capRings.map(pairs);
  if (!sea && !CITY.terrain) {   // a city with terrain has its own country (terrain.js)
    const outer = new THREE.Mesh(countryside(paved.map(pairs)), seasonalGrass(M(COUNTRY, { roughness: 1, side: THREE.FrontSide })));
    outer.receiveShadow = true; scene.add(outer);
  }
  if (!sea) {
    // paved city within the mapped extent
    const [x0, z0, x1, z1] = data.bbox.map(v => v / 10);
    const cb = new Builder({ uv: true }); addPolygon(cb, [[[x0, z0], [x1, z0], [x1, z1], [x0, z1]]], 0, (x, z) => [x / 400, z / 400]);
    const city = new THREE.Mesh(cb.geometry(), groundMat(GROUND));
    city.position.y = .15; city.receiveShadow = true; scene.add(city);
  }

  // green space, one mesh per kind
  const gb = GREEN.map(() => new Builder());
  for (const [k, ...rings] of data.green) addPolygon(gb[k], rings.map(pairs), 0);
  gb.forEach((b, k) => {
    if (!b.count) return;
    const m = new THREE.Mesh(b.geometry(), seasonalGrass(M(GREEN[k], { side: THREE.FrontSide })));
    m.position.y = .3 + k * .02; m.receiveShadow = true; scene.add(m);
  });

  const { bridgeSegs } = drawLines(scene, data.lines, { cap, wet: (x, z) => { const r = river.riverInfo(x, z); return Math.abs(r.d) < r.w / 2 - 4; } });
  return { bridgeSegs };
}

/**
 * Streets, trails, rail and bridge decks for a list of OSM lines ({k, w, b, l, x?, p}).
 * cap: rings where road bridges land on the rail-yard deck; wet(x, z): is this over water (piers);
 * tile: if set, split the meshes into tile x tile metre squares so off-screen ones are culled.
 */
export function drawLines(scene, lines, { cap = [], wet = () => false, tile = 0 } = {}) {
  // streets, trails and rail at grade (one set of builders per tile when tiled)
  const tiles = new Map();
  const T = key => { let t = tiles.get(key); if (!t) { t = { rb: new Builder(), pb: new Builder(), tb: new Builder(), xb: new Builder(), bc: new Builder(), bd: new Builder(), bg: new Builder() }; tiles.set(key, t); } return t; };
  const keyOf = pts => (tile ? Math.floor(pts[0][0] / tile) + ',' + Math.floor(pts[0][1] / tile) : '0');
  const bridges = [];
  for (const l of lines) {
    const pts = pairs(l.p);
    if (l.b) { bridges.push({ ...l, pts }); continue; }
    if (l.k === 0 && CITY.id === 'phl' && onPromenade(pts)) continue;   // Walnut St is paved as a promenade (promenade.js)
    const { rb, pb, tb, xb } = T(keyOf(pts));
    if (l.x) {
      // proposal: expressway carriageways become park, ramps become greenway trails
      addRibbon(xb, pts, l.w + (l.w > 8 ? 8 : 4), 0);
      if (l.w <= 8) addRibbon(pb, pts, 3.5, 0);
      continue;
    }
    addRibbon(l.k === 0 ? rb : l.k === 1 ? pb : tb, pts, l.w, 0);
  }

  // bridges: decks ramp up from the street ends; piers wherever the deck is over water
  const conc = new THREE.MeshStandardMaterial({ color: '#cfc8bb', roughness: .9 }), dark = new THREE.MeshStandardMaterial({ color: '#6b6660', roughness: .8 });
  const greenDeck = seasonalGrass(new THREE.MeshStandardMaterial({ color: '#86a96d', roughness: .95 })); // former expressway viaducts, now park bridges
  const piers = [];
  const bridgeSegs = [];
  for (const br of bridges) {
    const { bc, bd, bg } = T(keyOf(br.pts));
    const b = br.x ? bg : br.k === 2 ? bd : bc;
    const top = Math.min(17, 9 + 4 * Math.max(0, br.l - 1));
    // resample every ~6 m so the ramp profile is smooth
    const P = [], S = [];
    let s = 0;
    for (let i = 0; i < br.pts.length - 1; i++) {
      const [ax, az] = br.pts[i], [bx, bz] = br.pts[i + 1]; const L = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.ceil(L / 6));
      for (let k = 0; k < n; k++) { P.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]); S.push(s + L * k / n); }
      s += L;
      bridgeSegs.push([ax, az, bx, bz]);
    }
    P.push(br.pts[br.pts.length - 1]); S.push(s);
    const Y = S.map(d => Math.min(top, .8 + .15 * Math.min(d, s - d)));
    const hw = br.w / 2 + (br.k === 2 ? .6 : 1);
    for (let i = 0; i < P.length - 1; i++) {
      const [ax, az] = P[i], [bx, bz] = P[i + 1]; let dx = bx - ax, dz = bz - az; const L = Math.hypot(dx, dz); if (L < .01) continue;
      if (br.k !== 2 && cap.length && inRings((ax + bx) / 2, (az + bz) / 2, cap)) continue;
      dx /= L; dz /= L; const nx = -dz * hw, nz = dx * hw, ya = Y[i], yb = Y[i + 1];
      // deck top
      let q = b.count;
      b.v(ax + nx, ya, az + nz, 0, 1, 0); b.v(ax - nx, ya, az - nz, 0, 1, 0); b.v(bx + nx, yb, bz + nz, 0, 1, 0); b.v(bx - nx, yb, bz - nz, 0, 1, 0);
      b.tri(q, q + 2, q + 1); b.tri(q + 1, q + 2, q + 3);
      // sides with a parapet above the deck
      for (const sd of [1, -1]) {
        const ox = nx * sd, oz = nz * sd, nnx = -dz * sd, nnz = dx * sd;
        q = b.count;
        b.v(ax + ox, ya - 1.6, az + oz, nnx, 0, nnz); b.v(bx + ox, yb - 1.6, bz + oz, nnx, 0, nnz);
        b.v(bx + ox, yb + .9, bz + oz, nnx, 0, nnz); b.v(ax + ox, ya + .9, az + oz, nnx, 0, nnz);
        if (sd > 0) { b.tri(q, q + 1, q + 2); b.tri(q, q + 2, q + 3); } else { b.tri(q, q + 2, q + 1); b.tri(q, q + 3, q + 2); }
      }
      // underside
      q = b.count;
      b.v(ax + nx, ya - 1.6, az + nz, 0, -1, 0); b.v(ax - nx, ya - 1.6, az - nz, 0, -1, 0); b.v(bx + nx, yb - 1.6, bz + nz, 0, -1, 0); b.v(bx - nx, yb - 1.6, bz - nz, 0, -1, 0);
      b.tri(q, q + 1, q + 2); b.tri(q + 1, q + 3, q + 2);
      // piers every ~36 m over the river
      if (Math.floor(S[i] / 36) !== Math.floor(S[i + 1] / 36) && ya > 6) {
        if (wet(ax, az)) piers.push({ x: ax, z: az, h: ya - 1.6, w: br.w * .8, ry: Math.atan2(-dz, dx) });
      }
    }
  }
  const meshes = [], flat = [];   // flat: the ribbons lying on the ground (not bridges or piers)
  const add = m => { scene.add(m); meshes.push(m); return m; };
  const xMat = seasonalGrass(M('#78a85c', { side: THREE.FrontSide })), lineMat = { [ROAD]: M(ROAD, { side: THREE.FrontSide }), [RAIL]: M(RAIL, { side: THREE.FrontSide }), [TRAIL]: M(TRAIL, { side: THREE.FrontSide }) };
  // in winter the streets are ploughed and the rail beds partly clear (see season.js addSnow)
  lineMat[ROAD].userData.snowAmt = .3; lineMat[RAIL].userData.snowAmt = .5; dark.userData.snowAmt = conc.userData.snowAmt = .35;
  for (const t of tiles.values()) {
    if (t.xb.count) { const m = add(new THREE.Mesh(t.xb.geometry(), xMat)); m.position.y = .33; m.receiveShadow = true; flat.push(m); }
    [[t.rb, ROAD, .8], [t.tb, RAIL, .85], [t.pb, TRAIL, .9]].forEach(([b, c, y]) => {
      if (!b.count && tile) return;
      const m = add(new THREE.Mesh(b.geometry(), lineMat[c])); m.position.y = y; m.receiveShadow = true; flat.push(m);
    });
    [[t.bc, conc], [t.bd, dark], [t.bg, greenDeck]].forEach(([b, m]) => { if (!b.count) return; const mesh = add(new THREE.Mesh(b.geometry(), m)); mesh.castShadow = mesh.receiveShadow = true; });
  }
  if (piers.length) {
    const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, .5, 0);
    const im = new THREE.InstancedMesh(g, conc, piers.length), o = new THREE.Object3D();
    piers.forEach((p, i) => { o.position.set(p.x, 0, p.z); o.rotation.y = p.ry; o.scale.set(4, p.h, p.w); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    im.castShadow = true; im.frustumCulled = false; scene.add(im); meshes.push(im);
  }
  return { bridgeSegs, meshes, flat };
}
