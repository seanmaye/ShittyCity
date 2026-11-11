// The rest of Philadelphia, out to the city limits: ~500k building footprints (City of
// Philadelphia LI footprints), streets, rail, parks, water and park trees (OpenStreetMap).
// Everything here lies outside the original Center City extent, which keeps its own data.
//
// Performance: buildings are instanced boxes (fitted to each footprint) in 1 km tiles, plus
// real outlines for large irregular ones. Near tiles draw full boxes with window textures;
// far tiles draw only their roofs; tiles outside the view or past the fog are hidden.
import * as THREE from 'three';
import { pairs } from '../data.js';
import { M, worldWinMat, litMats, WIN_W, WIN_H } from './materials.js';
import { Builder, addPolygon, addRibbon, addPrism, withBounds } from './geometry.js';
import { drawLines } from './ground.js';
import { buildTrees } from './nature.js';
import { OFFICE, BRICK } from './buildings.js';

const TILE = 1000, FULL = 5000, TREE_FAR = 7000;
const GREEN = ['#6c9a52', '#7aa65a', '#5f9a4e', '#557d45', '#6f9256'];
const hash = i => { let x = (i + 1) * 2654435761 >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822507) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; };

/** Decode city_buildings.bin (see tools/build_city.py). */
function decode(buf) {
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

/** Facade material for instanced boxes: window UVs are worked out on the GPU from each
 *  instance's size, so one unit box serves every building. */
function instancedWinMat(kind) {
  const m = worldWinMat(kind).clone();
  m.vertexColors = false; litMats.push(m);
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `
#ifdef USE_UV
  vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  float along = abs(normal.x) > .5 ? (position.z + .5) * sc.z : (position.x + .5) * sc.x;
  float jit = fract(instanceMatrix[3].x * .0131 + instanceMatrix[3].z * .0173) * 4.0;
  vUv = abs(normal.y) > .5 ? vec2(.01, .01) : vec2(along / ${WIN_W.toFixed(1)} + jit, position.y * sc.y / ${WIN_H.toFixed(1)});
#endif`);
  };
  m.customProgramCacheKey = () => 'instWin' + kind;
  return m;
}

function unitBox() {   // 1 x 1 x 1 box standing on y = 0, without a bottom face
  const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, .5, 0);
  const idx = g.index.array, keep = [];
  g.groups.forEach((gr, gi) => { if (gi !== 3) for (let i = gr.start; i < gr.start + gr.count; i++) keep.push(idx[i]); });
  g.setIndex(keep); g.clearGroups(); return g;
}
function unitRoof() { const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); g.translate(0, 1, 0); return g; }

/** Does the rectangle [x0, z0, x1, z1] lie wholly inside the ring ([[x,z],...])? */
function rectInRing(ring, [x0, z0, x1, z1]) {
  const inside = (x, z) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, zi] = ring[i], [xj, zj] = ring[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
  if (![[x0, z0], [x1, z0], [x1, z1], [x0, z1]].every(([x, z]) => inside(x, z))) return false;
  // all four corners are inside, so it is wholly inside unless the outline dips into it somewhere
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[j];
    let t0 = 0, t1 = 1;   // clip the edge to the rectangle (Liang-Barsky)
    const clip = (p, q) => { if (p === 0) return q >= 0; const t = q / p; if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } return true; };
    if (clip(ax - bx, ax - x0) && clip(bx - ax, x1 - ax) && clip(az - bz, az - z0) && clip(bz - az, z1 - az)) return false;
  }
  return true;
}

/** core: the Center City extent [x0, z0, x1, z1] in metres, which buildGround paves itself. */
export function buildCity(scene, data, { waterMat, status = () => {}, core = null }) {
  const city = data.city, B = decode(data.cityBuildings);
  const tiles = new Map();   // key -> { cx, cz, r, full: [], roof: [], trees: [] }
  const tileOf = (x, z) => {
    const i = Math.floor(x / TILE), j = Math.floor(z / TILE), k = i + ',' + j;
    let t = tiles.get(k);
    if (!t) { t = { cx: (i + .5) * TILE, cz: (j + .5) * TILE, r: TILE * .75, top: 20, full: [], roof: [], trees: [], always: [] }; tiles.set(k, t); }
    return t;
  };

  // ---- ground: paved city limits, a wider countryside plane, parks, water, streams
  // Each ground surface is drawn only where it is the top one. Nothing rejects hidden pixels
  // before they are shaded here (the logarithmic depth buffer writes depth per pixel), so every
  // full layer stacked under the city used to cost a screenful of lighting and shadow lookups.
  const limits = city.limits.map(pairs);
  const FAR = 200000, HOLE = 14500;   // buildGround's countryside plane (30 km square, y = 0) covers the middle
  const ob = new Builder(), ub = new Builder();
  const quad = (b, x0, z0, x1, z1, up) => {
    const s = b.count, ny = up ? 1 : -1;
    b.v(x0, 0, z0, 0, ny, 0); b.v(x0, 0, z1, 0, ny, 0); b.v(x1, 0, z0, 0, ny, 0); b.v(x1, 0, z1, 0, ny, 0);
    if (up) { b.tri(s, s + 1, s + 2); b.tri(s + 2, s + 1, s + 3); } else { b.tri(s, s + 2, s + 1); b.tri(s + 2, s + 3, s + 1); }
  };
  quad(ob, -FAR, -FAR, FAR, -HOLE, true); quad(ob, -FAR, HOLE, FAR, FAR, true); quad(ob, -FAR, -HOLE, -HOLE, HOLE, true); quad(ob, HOLE, -HOLE, FAR, HOLE, true);
  quad(ub, -FAR, -FAR, FAR, FAR, false);   // the whole underside: what a camera below ground sees
  for (const b of [ob, ub]) {
    const m = new THREE.Mesh(b.geometry(), M('#7d8a6e', { roughness: 1, side: THREE.FrontSide }));
    m.position.y = -.05; m.receiveShadow = true; scene.add(m);
  }
  // the paved plate, without the middle of Center City, where buildGround's own paving lies on it
  const hole = core && limits.length === 1 && rectInRing(limits[0], core)
    ? [[[core[0] + 100, core[1] + 100], [core[2] - 100, core[1] + 100], [core[2] - 100, core[3] - 100], [core[0] + 100, core[3] - 100]]] : [];
  const pb = new Builder(); limits.forEach(r => addPolygon(pb, [r, ...hole], 0));
  const plate = new THREE.Mesh(pb.geometry(), M('#bdb6a8', { roughness: 1, side: THREE.FrontSide }));
  plate.position.y = .14; plate.receiveShadow = true; scene.add(plate);
  const edge = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(limits[0].map(([x, z]) => new THREE.Vector3(x, .6, z))),
    new THREE.LineBasicMaterial({ color: '#4a5a46', transparent: true, opacity: .7 }));
  scene.add(edge);

  const gb = GREEN.map(() => new Builder());
  for (const [k, ...rings] of city.green) addPolygon(gb[k], rings.map(pairs), 0);
  gb.forEach((b, k) => { if (!b.count) return; const m = new THREE.Mesh(b.geometry(), M(GREEN[k], { side: THREE.FrontSide })); m.position.y = .3 + k * .02; m.receiveShadow = true; scene.add(m); });
  const wb = new Builder(), water = city.water.map(p => p.map(pairs));
  water.forEach(p => addPolygon(wb, p, 0));
  for (const s of city.streams) addRibbon(wb, pairs(s.p), s.w, 0);
  const wm = new THREE.Mesh(wb.geometry(), waterMat); wm.position.y = .6; wm.receiveShadow = true; scene.add(wm);
  const db = new Builder(); for (const d of city.dams) addRibbon(db, pairs(d), 5, 0);
  if (db.count) { const dmesh = new THREE.Mesh(db.geometry(), M('#e8eef0')); dmesh.position.y = 1.2; scene.add(dmesh); }

  // water lookup for bridge piers
  const WG = new Map(), wkey = (x, z) => Math.floor(x / 400) + ',' + Math.floor(z / 400);
  water.forEach(p => {
    const xs = p[0].map(q => q[0]), zs = p[0].map(q => q[1]);
    for (let i = Math.floor(Math.min(...xs) / 400); i <= Math.floor(Math.max(...xs) / 400); i++)
      for (let j = Math.floor(Math.min(...zs) / 400); j <= Math.floor(Math.max(...zs) / 400); j++) { const k = i + ',' + j; (WG.get(k) || WG.set(k, []).get(k)).push(p); }
  });
  const inRing = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
  const wet = (x, z) => (WG.get(wkey(x, z)) || []).some(p => inRing(x, z, p[0]) && !p.slice(1).some(h => inRing(x, z, h)));

  // ---- streets, rail and bridges, tiled
  const { bridgeSegs, flat: streets } = drawLines(scene, city.lines, { wet, tile: 2000 });

  // ---- buildings
  status(`Raising ${(B.nB + B.nP).toLocaleString()} more buildings…`);
  const per = new Map();   // tile -> [kind0 indices, kind1 indices]
  for (let i = 0; i < B.nB; i++) {
    const x = B.bx[i] / 10, z = B.bz[i] / 10, t = tileOf(x, z);
    let l = per.get(t); if (!l) per.set(t, l = [[], []]);
    l[B.bk[i]].push(i); t.top = Math.max(t.top, B.bh[i] / 10);
  }
  const geoBox = unitBox(), geoRoof = unitRoof(), mats = [instancedWinMat('row'), instancedWinMat('office')];
  const PAL = [BRICK, OFFICE].map(p => p.map(c => new THREE.Color(c)));   // by kind
  for (const [t, kinds] of per) kinds.forEach((list, kind) => {
    if (!list.length) return;
    const n = list.length, mat4 = new Float32Array(n * 16), cols = new Float32Array(n * 3), pal = PAL[kind];
    let reach = 0, high = 0;   // how far from the tile's centre, and how high, these boxes get
    list.forEach((i, j) => {
      const a = B.br[i] / 65535 * Math.PI, c = Math.cos(a), s = Math.sin(a), w = B.bw[i] / 10, d = B.bd[i] / 10, h = B.bh[i] / 10;
      reach = Math.max(reach, Math.hypot(B.bx[i] / 10 - t.cx, B.bz[i] / 10 - t.cz) + Math.hypot(w, d) / 2); high = Math.max(high, h);
      const o = j * 16, col = pal[Math.floor(hash(i) * pal.length)];   // the rest of the matrix stays 0
      mat4[o] = c * w; mat4[o + 2] = -s * w; mat4[o + 5] = h; mat4[o + 8] = s * d; mat4[o + 10] = c * d; mat4[o + 12] = B.bx[i] / 10; mat4[o + 14] = B.bz[i] / 10; mat4[o + 15] = 1;
      cols[j * 3] = col.r; cols[j * 3 + 1] = col.g; cols[j * 3 + 2] = col.b;
    });
    // the full boxes cast shadows: with their own bounds, tiles outside the sun's shadow box are skipped there
    const fullGeo = withBounds(geoBox, new THREE.Vector3(t.cx, high / 2, t.cz), Math.hypot(reach, high / 2));
    const full = new THREE.InstancedMesh(fullGeo, mats[kind], n), roof = new THREE.InstancedMesh(geoRoof, mats[kind], n);
    full.instanceMatrix = new THREE.InstancedBufferAttribute(mat4, 16); roof.instanceMatrix = full.instanceMatrix;
    full.instanceColor = new THREE.InstancedBufferAttribute(cols, 3); roof.instanceColor = full.instanceColor;
    for (const m of [full, roof]) { m.frustumCulled = false; m.receiveShadow = true; m.userData.tiled = true; scene.add(m); }
    full.frustumCulled = true; full.userData.bounded = true;
    full.castShadow = true;
    t.full.push(full); t.roof.push(roof);
  });
  // large irregular buildings: real outlines, merged per tile
  const pBuild = new Map();
  for (let i = 0, v = 0; i < B.nP; i++) {
    const n = B.pn[i], ring = [];
    let x = 0, z = 0;
    for (let k = 0; k < n; k++) { x = k ? x + B.vx[v + k] : B.vx[v + k]; z = k ? z + B.vz[v + k] : B.vz[v + k]; ring.push([x / 10, z / 10]); }
    v += n;
    const t = tileOf(ring[0][0], ring[0][1]), key = t;
    let pk = pBuild.get(key); if (!pk) pBuild.set(key, pk = [new Builder({ uv: true, color: true }), new Builder({ uv: true, color: true })]);
    const kind = B.pk[i], pal = PAL[kind];
    addPrism(pk[kind], [ring], 0, B.ph[i] / 10, hash(i + 7) * 4, WIN_W, WIN_H, pal[Math.floor(hash(i + 3) * pal.length)]);
    t.top = Math.max(t.top, B.ph[i] / 10);
  }
  for (const [t, bs] of pBuild) bs.forEach((b, kind) => {
    if (!b.count) return;
    const m = new THREE.Mesh(b.geometry(), worldWinMat(kind ? 'office' : 'row'));
    m.castShadow = m.receiveShadow = true; scene.add(m); t.always.push(m);
  });

  // ---- park trees, tiled with a draw distance
  const tt = new Map();
  for (let i = 0; i < city.trees.length; i += 2) {
    const t = tileOf(city.trees[i] / 10, city.trees[i + 1] / 10);
    let l = tt.get(t); if (!l) tt.set(t, l = []); l.push(city.trees[i], city.trees[i + 1]);
  }
  for (const [t, flat] of tt) { t.trees = buildTrees(scene, flat); t.trees.forEach(m => { m.userData.tiled = true; }); }

  // ---- per-frame: frustum + distance per tile
  const frustum = new THREE.Frustum(), pm = new THREE.Matrix4(), sph = new THREE.Sphere(), tl = [...tiles.values()], fwd = new THREE.Vector3();
  tl.forEach(t => { t.r = Math.hypot(TILE * .75, t.top); });
  function update(camera, fogFar) {
    pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pm);
    const cp = camera.position;
    for (const t of tl) {
      sph.center.set(t.cx, t.top / 2, t.cz); sph.radius = t.r;
      const d = Math.hypot(cp.x - t.cx, cp.y - t.top / 2, cp.z - t.cz);
      const vis = d - t.r < fogFar && frustum.intersectsSphere(sph);
      const near = vis && d - t.r < FULL;
      t.full.forEach(m => { m.visible = near; });
      t.roof.forEach(m => { m.visible = vis && !near; });
      t.always.forEach(m => { m.visible = vis; });
      t.trees.forEach(m => { m.visible = vis && d - t.r < TREE_FAR; });
    }
    // Street, rail and trail ribbons wholly past the fog (by view depth, which is what the fog goes
    // by) come out exactly the fog's colour, the same as the paving they lie on: don't draw them.
    camera.getWorldDirection(fwd);
    for (const m of streets) {
      const c = m.geometry.boundingSphere.center, depth = (c.x - cp.x) * fwd.x + (c.y - cp.y) * fwd.y + (c.z - cp.z) * fwd.z;
      m.visible = depth - m.geometry.boundingSphere.radius - 1 < fogFar;
    }
  }

  // the whole city from above, north up
  const [x0, z0, x1, z1] = city.bbox.map(v => v / 10), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const view = { id: 'city', name: 'Whole city', pos: new THREE.Vector3(cx, 26000, cz + 16000), target: new THREE.Vector3(cx, 0, cz - 1500) };
  return { update, view, bridgeSegs, wet, bounds: { x0, z0, x1, z1 }, buildingCount: B.nB + B.nP };
}
