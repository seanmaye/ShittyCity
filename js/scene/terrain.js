// Terrain (a city's data/<city>/terrain.bin.gz, tools/phl/build_terrain.py): the real ground
// height under everything, from USGS 3DEP bare-earth lidar. Without that file (New York) every
// lookup returns 0 and nothing here changes the scene.
//   ground(x, z)   the ground (under rivers: their bed)
//   water(x, z)    the water surface on and near water (hydro-flattened: real river levels)
//   surface(x, z)  what you stand or float on: max(ground, water)
//   profile(P)     heights for a line that crosses water on bridges (tracks, guideways): the
//                  surface smoothed along the line, and straight across water from bank to bank
//   drape / seat   fit flat-built ground geometry onto the terrain, or set objects down on it
//   buildTerrain   the ground mesh itself (index.js; city.js colours it)
import * as THREE from 'three';

export const terrain = { on: false, x0: 0, z0: 0, cell: 1, W: 0, H: 0, G: null, D: null, S: null };

/** decode TER1: header, then two Int16 grids (decimetres, rows delta-coded) */
export function setTerrain(buf) {
  terrain.on = false;
  if (!buf) return terrain;
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
  Object.assign(terrain, { on: true, x0, z0, cell, W, H, G, D, S });
  return terrain;
}

function bilinear(A, x, z) {
  const t = terrain, fx = Math.min(Math.max((x - t.x0) / t.cell, 0), t.W - 1.001), fz = Math.min(Math.max((z - t.z0) / t.cell, 0), t.H - 1.001);
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * t.W + i;
  return ((A[k] * (1 - u) + A[k + 1] * u) * (1 - v) + (A[k + t.W] * (1 - u) + A[k + t.W + 1] * u) * v) / 10;
}
export const ground = (x, z) => (terrain.on ? bilinear(terrain.G, x, z) : 0);
/** the water surface where there's water nearby, else the ground */
export function water(x, z) {
  if (!terrain.on) return 0;
  const g = bilinear(terrain.G, x, z), d = bilinear(terrain.D, x, z);
  return d === 0 ? g : g + d;
}
export const surface = (x, z) => (terrain.on ? bilinear(terrain.S, x, z) : 0);
/** on water (the surface is the water, not the bank) */
export const isWet = (x, z) => terrain.on && bilinear(terrain.D, x, z) > .3;
/** surface slope normal (for re-lighting draped flat surfaces) */
export function normalAt(x, z, out = new THREE.Vector3()) {
  const e = terrain.cell; const hx = surface(x + e, z) - surface(x - e, z), hz = surface(x, z + e) - surface(x, z - e);
  return out.set(-hx / (2 * e), 1, -hz / (2 * e)).normalize();
}

/**
 * Height offsets along a line of points ({x, z}): the surface averaged over SMOOTH m of the line
 * either side (so a track or guideway doesn't jitter over every kerb), and over water a straight
 * run from the last bank to the next (bridges stay level instead of dipping to the river).
 */
export function profile(P, smooth = 60) {
  const n = P.length, off = new Float32Array(n);
  if (!terrain.on || !n) return off;
  const s = new Float64Array(n), h = new Float64Array(n), wet = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (i) s[i] = s[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z);
    wet[i] = isWet(P[i].x, P[i].z); h[i] = surface(P[i].x, P[i].z);
  }
  // windowed mean over the dry points (arc length), prefix sums
  const cs = new Float64Array(n + 1), cn = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { cs[i + 1] = cs[i] + (wet[i] ? 0 : h[i]); cn[i + 1] = cn[i] + (wet[i] ? 0 : 1); }
  let a = 0, b = 0;
  for (let i = 0; i < n; i++) {
    while (s[a] < s[i] - smooth) a++;
    while (b < n - 1 && s[b + 1] <= s[i] + smooth) b++;
    const cnt = cn[b + 1] - cn[a];
    off[i] = cnt ? (cs[b + 1] - cs[a]) / cnt : NaN;
  }
  // across water (and anywhere the window saw only water): straight between the dry neighbours
  for (let i = 0; i < n; i++) {
    if (!wet[i] && !Number.isNaN(off[i])) continue;
    let j = i; while (j < n && (wet[j] || Number.isNaN(off[j]))) j++;
    const L = i > 0 ? off[i - 1] : NaN, R = j < n ? off[j] : NaN;
    for (let k = i; k < j; k++) {
      off[k] = Number.isNaN(L) ? (Number.isNaN(R) ? h[k] : R) : Number.isNaN(R) ? L : L + (R - L) * (s[k] - s[i - 1]) / Math.max(1e-6, s[j] - s[i - 1]);
    }
    i = j;
  }
  return off;
}

// ---- draping flat-built geometry onto the terrain
const SAMPLE = 10;   // m: how finely a piece is checked against the ground (the terrain grid's cell)
const TOL = [.1, .1];   // m: how far a flat piece may sink below / rise above the ground before it is split
// lawns (.3 m up) may rise a little more, but stay under the paths (.9 m) that cross them; the
// water may stray more either way (its level in the data wavers by centimetres along a river)
export const TOL_LAWN = [.15, .45], TOL_WATER = [.3, .5];

/**
 * Split triangles (and line segments) until each one follows fn(x, z) to within TOL: a piece is
 * checked against fn every SAMPLE m, and only pieces over ground that bends are split, so flat
 * streets, lawns and water stay as they were built. All attributes are interpolated; an edge two
 * triangles share is split at the same new vertex. Without fn: split until no edge is longer
 * than `sample` (plain subdivision).
 */
export function subdivide(geo, sample = SAMPLE, fn = null, [below, above] = TOL) {
  const pos = geo.attributes.position; if (!pos) return geo;
  const names = Object.keys(geo.attributes), src = names.map(k => geo.attributes[k]);
  const data = src.map(a => Array.from(a.array)), size = src.map(a => a.itemSize);
  const isLine = geo.userData.lines, P = data[names.indexOf('position')];
  const idx = geo.index ? Array.from(geo.index.array) : [...Array(pos.count).keys()];
  const F = [];   // fn at each vertex, filled as needed
  const f = a => { let v = F[a]; if (v === undefined) v = F[a] = fn(P[a * 3], P[a * 3 + 2]); return v; };
  const len2 = (a, b) => { const dx = P[a * 3] - P[b * 3], dz = P[a * 3 + 2] - P[b * 3 + 2]; return dx * dx + dz * dz; };
  const mids = new Map(), K = 2 ** 26, s2 = sample * sample, min2 = (sample / 2) ** 2;
  const mid = (a, b) => {
    const key = a < b ? a * K + b : b * K + a; let m = mids.get(key); if (m !== undefined) return m;
    m = P.length / 3;
    for (let k = 0; k < data.length; k++) { const d = data[k], z = size[k]; for (let c = 0; c < z; c++) d.push((d[a * z + c] + d[b * z + c]) / 2); }
    mids.set(key, m); return m;
  };
  // does the straight piece a-b(-c) follow fn closely enough? (barycentric samples every SAMPLE m)
  const follows = (a, b, c, L) => {
    const n = Math.max(2, Math.ceil(L / sample)), fa = f(a), fb = f(b), fc = c < 0 ? 0 : f(c);
    for (let i = 0; i <= n; i++) for (let j = 0; j <= (c < 0 ? 0 : n - i); j++) {
      const w1 = i / n, w2 = j / n, w0 = 1 - w1 - w2;
      if ((w1 === 0 && w2 === 0) || w1 === 1 || w2 === 1) continue;   // the corners themselves
      const x = P[a * 3] * w0 + P[b * 3] * w1 + (c < 0 ? 0 : P[c * 3] * w2), z = P[a * 3 + 2] * w0 + P[b * 3 + 2] * w1 + (c < 0 ? 0 : P[c * 3 + 2] * w2);
      const d = fa * w0 + fb * w1 + fc * w2 - fn(x, z);   // the flat piece above (+) or below (-) the ground
      if (d < -below || d > above) return false;
    }
    return true;
  };
  const out = [];
  if (isLine) {
    const seg = (a, b, depth) => {
      const l2 = len2(a, b);
      const done = fn ? l2 <= min2 || depth > 16 || follows(a, b, -1, Math.sqrt(l2)) : l2 <= s2;
      if (done) out.push(a, b); else { const m = mid(a, b); seg(a, m, depth + 1); seg(m, b, depth + 1); }
    };
    for (let i = 0; i < idx.length; i += 2) seg(idx[i], idx[i + 1], 0);
  } else {
    const tri = (a, b, c, depth) => {
      const ab = len2(a, b), bc = len2(b, c), ca = len2(c, a), mx = Math.max(ab, bc, ca);
      const done = depth > 16 || (fn ? mx <= min2 || follows(a, b, c, Math.sqrt(mx)) : mx <= s2);
      if (done) { out.push(a, b, c); return; }
      if (mx === ab) { const m = mid(a, b); tri(a, m, c, depth + 1); tri(m, b, c, depth + 1); }
      else if (mx === bc) { const m = mid(b, c); tri(a, b, m, depth + 1); tri(a, m, c, depth + 1); }
      else { const m = mid(c, a); tri(a, b, m, depth + 1); tri(m, b, c, depth + 1); }
    };
    for (let i = 0; i < idx.length; i += 3) tri(idx[i], idx[i + 1], idx[i + 2], 0);
  }
  const g = new THREE.BufferGeometry();
  names.forEach((k, i) => g.setAttribute(k, new THREE.Float32BufferAttribute(data[i], size[i])));
  const count = P.length / 3;
  g.setIndex(count > 65535 ? new THREE.Uint32BufferAttribute(out, 1) : new THREE.Uint16BufferAttribute(out, 1));
  g.userData = { ...geo.userData };
  return g;
}

/** raise every vertex by fn(x, z) (world space: the object's transform is baked in first), split
 *  where the ground bends (subdivide); flat, upward-facing surfaces take the slope's normal so
 *  they light like the ground they lie on. sample: m between checks against the ground. */
export function drape(obj, fn = surface, sample = SAMPLE, tol = obj.userData.drapeTol || TOL) {
  if (!terrain.on || !obj.geometry) return;
  obj.updateMatrixWorld(true);
  let g = obj.geometry.clone(); g.applyMatrix4(obj.matrixWorld);
  if (obj.isLineSegments || obj.isLine) g.userData.lines = !!obj.isLineSegments;
  if (!obj.isPoints && !(obj.isLine && !obj.isLineSegments)) g = subdivide(g, sample, fn, tol);
  const p = g.attributes.position, nrm = g.attributes.normal, n = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, p.getY(i) + fn(x, z));
    if (nrm && nrm.getY(i) > .95) { normalAt(x, z, n); nrm.setXYZ(i, n.x, n.y, n.z); }
  }
  p.needsUpdate = true; g.computeBoundingBox(); g.computeBoundingSphere();
  obj.geometry = g; obj.position.set(0, 0, 0); obj.rotation.set(0, 0, 0); obj.scale.set(1, 1, 1); obj.updateMatrix();
  if (obj.parent && !obj.parent.isScene) { obj.parent.updateMatrixWorld(true); const inv = obj.parent.matrixWorld.clone().invert(); g.applyMatrix4(inv); }
}

/** where an object of this world box should stand: the lowest of the surface under its middle
 *  and the corners of its inner half (so it neither floats on a slope nor buries a hillside) */
export function footing(box) {
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2, hx = (box.max.x - box.min.x) / 4, hz = (box.max.z - box.min.z) / 4;
  return Math.min(surface(cx, cz), surface(cx - hx, cz - hz), surface(cx + hx, cz - hz), surface(cx - hx, cz + hz), surface(cx + hx, cz + hz));
}

/**
 * Set everything added to the scene since `from` (an index into scene.children) onto the terrain,
 * unless an object says otherwise in userData.terrain:
 *   'done'   already placed by its module            'water'  drape onto the water surface
 *   'drape'  drape onto the surface                  'rigid'  move as one, by footing()
 *   {y}      move as one, by this height
 * Defaults: instanced meshes move each instance by the surface under it; meshes, lines and point
 * clouds wider than 80 m drape, smaller ones and groups move as one.
 */
export function seat(scene, from = 0) {
  if (!terrain.on) return;
  const box = new THREE.Box3(), m = new THREE.Matrix4(), v = new THREE.Vector3();
  for (const o of scene.children.slice(from)) {
    const how = o.userData.terrain;
    if (how === 'done' || o.isLight || o.isCamera) continue;
    if (how && typeof how === 'object') { o.position.y += how.y; continue; }
    if (how === 'water') { drape(o, water, SAMPLE, TOL_WATER); continue; }
    if (how === 'drape') { drape(o); continue; }
    if (o.isInstancedMesh && how !== 'rigid') {
      const a = o.instanceMatrix.array;
      for (let i = 0; i < o.count; i++) { m.fromArray(a, i * 16); v.setFromMatrixPosition(m); a[i * 16 + 13] += surface(v.x, v.z); }
      o.instanceMatrix.needsUpdate = true; continue;
    }
    box.setFromObject(o);
    if (box.isEmpty()) continue;
    const wide = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) > 80;
    if (!o.isGroup && (o.isMesh || o.isLine || o.isPoints) && wide && how !== 'rigid') drape(o);
    else o.position.y += footing(box);
  }
}

/**
 * The ground mesh: square tiles (TILE m) of the terrain grid at STEP m near the camera and STEP*4
 * further off, and for the far distance whole blocks of BLOCK x BLOCK tiles in one mesh each (far
 * fewer draw calls when the whole city is in view). A block's vertices are exactly its tiles' far
 * vertices, so a block meets the far tiles beside it without a crack. Coloured per vertex by
 * colorAt(x, z) (city.js: paved inside the city limits, country outside), plus a skirt that
 * carries the edge heights far out to the horizon. Returns the tiles and blocks for culling.
 */
export function buildTerrain(scene, material, colorAt, { TILE = 1000, STEP = 20, BLOCK = 4 } = {}) {
  const t = terrain, x0 = t.x0, z0 = t.z0, x1 = t.x0 + (t.W - 1) * t.cell, z1 = t.z0 + (t.H - 1) * t.cell;
  const tiles = [], blocks = [], c = new THREE.Color();
  const steps = (a, b, step) => { const n = Math.max(1, Math.round((b - a) / step)), o = []; for (let i = 0; i <= n; i++) o.push(a + (b - a) * i / n); return o; };
  const mesh = (xs, zs) => {
    const nx = xs.length - 1, nz = zs.length - 1;
    const pos = [], nrm = [], col = [], uv = [], idx = [], n = new THREE.Vector3();
    for (const z of zs) for (const x of xs) {
      pos.push(x, ground(x, z), z); normalAt(x, z, n); nrm.push(n.x, n.y, n.z); colorAt(x, z, c); col.push(c.r, c.g, c.b); uv.push(x / 400, z / 400);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1; idx.push(a, d, b, b, d, e); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeBoundingSphere();
    const o = new THREE.Mesh(g, material); o.receiveShadow = true; o.userData.terrain = 'done'; o.frustumCulled = false; scene.add(o); return o;
  };
  const range = (ax, az, bx, bz) => { let top = -1e9, low = 1e9; for (let z = az; z <= bz; z += 100) for (let x = ax; x <= bx; x += 100) { const h = ground(x, z); top = Math.max(top, h); low = Math.min(low, h); } return [low, top]; };
  const xe = [], ze = []; for (let a = x0; a < x1 - 1; a += TILE) xe.push([a, Math.min(a + TILE, x1)]); for (let a = z0; a < z1 - 1; a += TILE) ze.push([a, Math.min(a + TILE, z1)]);
  for (let J = 0; J < ze.length; J += BLOCK) for (let I = 0; I < xe.length; I += BLOCK) {
    const bt = [], fx = [], fz = [];   // this block's tiles, and its far vertices (its tiles' far vertices, joined)
    for (let j = J; j < Math.min(J + BLOCK, ze.length); j++) { const s = steps(ze[j][0], ze[j][1], STEP * 4); fz.push(...(fz.length ? s.slice(1) : s)); }
    for (let i = I; i < Math.min(I + BLOCK, xe.length); i++) { const s = steps(xe[i][0], xe[i][1], STEP * 4); fx.push(...(fx.length ? s.slice(1) : s)); }
    for (let j = J; j < Math.min(J + BLOCK, ze.length); j++) for (let i = I; i < Math.min(I + BLOCK, xe.length); i++) {
      const [ax, bx] = xe[i], [az, bz] = ze[j], [low, top] = range(ax, az, bx, bz);
      const near = mesh(steps(ax, bx, STEP), steps(az, bz, STEP)), far = mesh(steps(ax, bx, STEP * 4), steps(az, bz, STEP * 4));
      near.visible = far.visible = false;
      const tile = { cx: (ax + bx) / 2, cz: (az + bz) / 2, cy: (top + low) / 2, r: Math.hypot(bx - ax, bz - az, top - low) / 2, near, far };
      tiles.push(tile); bt.push(tile);
    }
    const [ax, bx, az, bz] = [fx[0], fx[fx.length - 1], fz[0], fz[fz.length - 1]], [low, top] = range(ax, az, bx, bz);
    blocks.push({ cx: (ax + bx) / 2, cz: (az + bz) / 2, cy: (top + low) / 2, r: Math.hypot(bx - ax, bz - az, top - low) / 2, mesh: mesh(fx, fz), tiles: bt });
  }
  // the skirt: each edge's heights carried 150 km outward, so the horizon has no cliff
  const sk = [], skc = [], skn = [], R = 150000, S = 200;
  const edge = (x, z, ox, oz) => { const h = ground(x, z); colorAt(-1e9, -1e9, c); sk.push(x, h, z, x + ox * R, h, z + oz * R); for (let k = 0; k < 2; k++) { skc.push(c.r, c.g, c.b); skn.push(0, 1, 0); } };
  const strip = (ax, az, bx, bz, ox, oz) => { const n = Math.ceil(Math.hypot(bx - ax, bz - az) / S); for (let i = 0; i <= n; i++) edge(ax + (bx - ax) * i / n, az + (bz - az) * i / n, ox, oz); return n; };
  const idx = []; let base = 0;
  for (const [ax, az, bx, bz, ox, oz] of [[x0, z0, x1, z0, 0, -1], [x1, z0, x1, z1, 1, 0], [x1, z1, x0, z1, 0, 1], [x0, z1, x0, z0, -1, 0]]) {
    const n = strip(ax, az, bx, bz, ox, oz);
    for (let i = 0; i < n; i++) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    base += (n + 1) * 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(sk, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(skn, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(skc, 3));
  g.setIndex(idx);
  const skirt = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
  skirt.position.y = -.3; skirt.receiveShadow = true; skirt.userData.terrain = 'done'; skirt.frustumCulled = false; scene.add(skirt);
  return { tiles, blocks, skirt };
}

/** a building on the terrain: its base at the lowest ground under its outline (less half a metre,
 *  so no wall shows a gap on a slope) and its roof h above the ground at its middle. ring:
 *  [[x, z], ...]. Returns { y0, top, mid } (mid: the ground at the middle, where windows count from). */
export function footprint(ring, h) {
  if (!terrain.on) return { y0: 0, top: h, mid: 0 };
  let cx = 0, cz = 0, lo = Infinity;
  for (const [x, z] of ring) { cx += x / ring.length; cz += z / ring.length; lo = Math.min(lo, surface(x, z)); }
  const mid = surface(cx, cz);
  return { y0: Math.min(lo, mid) - .5, top: mid + h, mid };
}
