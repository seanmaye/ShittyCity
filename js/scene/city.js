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
import { Builder, addPolygon, addRibbon, addPrism } from './geometry.js';
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

export function buildCity(scene, data, { waterMat, status = () => {} }) {
  const city = data.city, B = decode(data.cityBuildings);
  const tiles = new Map();   // key -> { cx, cz, r, full: [], roof: [], trees: [] }
  const tileOf = (x, z) => {
    const i = Math.floor(x / TILE), j = Math.floor(z / TILE), k = i + ',' + j;
    let t = tiles.get(k);
    if (!t) { t = { cx: (i + .5) * TILE, cz: (j + .5) * TILE, r: TILE * .75, top: 20, full: [], roof: [], trees: [], always: [] }; tiles.set(k, t); }
    return t;
  };

  // ---- ground: paved city limits, a wider countryside plane, parks, water, streams
  const limits = city.limits.map(pairs);
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(400000, 400000), M('#7d8a6e', { roughness: 1 }));
  outer.rotation.x = -Math.PI / 2; outer.position.y = -.05; outer.receiveShadow = true; scene.add(outer);
  const pb = new Builder(); limits.forEach(r => addPolygon(pb, [r], 0));
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
  const { bridgeSegs } = drawLines(scene, city.lines, { wet, tile: 2000 });

  // ---- buildings
  status(`Raising ${(B.nB + B.nP).toLocaleString()} more buildings…`);
  const per = new Map();   // tile -> [kind0 indices, kind1 indices]
  for (let i = 0; i < B.nB; i++) {
    const x = B.bx[i] / 10, z = B.bz[i] / 10, t = tileOf(x, z);
    let l = per.get(t); if (!l) per.set(t, l = [[], []]);
    l[B.bk[i]].push(i); t.top = Math.max(t.top, B.bh[i] / 10);
  }
  const geoBox = unitBox(), geoRoof = unitRoof(), mats = [instancedWinMat('row'), instancedWinMat('office')];
  const col = new THREE.Color();
  for (const [t, kinds] of per) kinds.forEach((list, kind) => {
    if (!list.length) return;
    const n = list.length, mat4 = new Float32Array(n * 16), cols = new Float32Array(n * 3), pal = kind ? OFFICE : BRICK;
    list.forEach((i, j) => {
      const a = B.br[i] / 65535 * Math.PI, c = Math.cos(a), s = Math.sin(a), w = B.bw[i] / 10, d = B.bd[i] / 10, h = B.bh[i] / 10;
      mat4.set([c * w, 0, -s * w, 0, 0, h, 0, 0, s * d, 0, c * d, 0, B.bx[i] / 10, 0, B.bz[i] / 10, 1], j * 16);
      col.set(pal[Math.floor(hash(i) * pal.length)]); cols.set([col.r, col.g, col.b], j * 3);
    });
    const full = new THREE.InstancedMesh(geoBox, mats[kind], n), roof = new THREE.InstancedMesh(geoRoof, mats[kind], n);
    full.instanceMatrix = new THREE.InstancedBufferAttribute(mat4, 16); roof.instanceMatrix = full.instanceMatrix;
    full.instanceColor = new THREE.InstancedBufferAttribute(cols, 3); roof.instanceColor = full.instanceColor;
    for (const m of [full, roof]) { m.frustumCulled = false; m.receiveShadow = true; m.userData.tiled = true; scene.add(m); }
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
    const kind = B.pk[i], pal = kind ? OFFICE : BRICK;
    addPrism(pk[kind], [ring], 0, B.ph[i] / 10, hash(i + 7) * 4, WIN_W, WIN_H, new THREE.Color(pal[Math.floor(hash(i + 3) * pal.length)]));
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
  for (const [t, flat] of tt) { t.trees = buildTrees(scene, flat); t.trees.forEach(m => { m.frustumCulled = false; m.userData.tiled = true; }); }

  // ---- per-frame: frustum + distance per tile
  const frustum = new THREE.Frustum(), pm = new THREE.Matrix4(), sph = new THREE.Sphere(), tl = [...tiles.values()];
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
  }

  // the whole city from above, north up
  const [x0, z0, x1, z1] = city.bbox.map(v => v / 10), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const view = { id: 'city', name: 'Whole city', pos: new THREE.Vector3(cx, 26000, cz + 16000), target: new THREE.Vector3(cx, 0, cz - 1500) };
  return { update, view, bridgeSegs, wet, bounds: { x0, z0, x1, z1 }, buildingCount: B.nB + B.nP };
}
