// The city beyond its detailed core (data/<city>/city.json.gz and city_buildings.bin.gz): building
// footprints, streets, rail, parks, water and park trees, out to the city limits (Philadelphia's
// ~500k footprints) or the land outlines (New York's outer boroughs).
//
// Performance: buildings are instanced boxes (fitted to each footprint) in 1 km tiles, plus
// real outlines for large irregular ones. Near tiles draw full boxes with window textures;
// far tiles draw only their roofs; tiles outside the view or past the fog are hidden.
import * as THREE from 'three';
import { pairs } from '../data.js';
import { M, worldWinMat, instancedWinMat, roofColor, WIN_W, WIN_H } from './materials.js';
import { Builder, addPolygon, addRibbon, addPrism, withBounds, colorOf } from './geometry.js';
import { drawLines, GREEN, GROUND, COUNTRY, groundMat } from './ground.js';
import { buildTrees } from './nature.js';
import { seasonalGrass } from './season.js';
import { terrain, surface, footprint, buildTerrain, TOL_LAWN } from './terrain.js';
import { facadeKind, facadeColor, hash, addRooftop, aviationLights } from './buildings.js';

const TILE = 1000, FULL = 5000, TREE_FAR = 7000;

/** Decode city_buildings.bin (PHB1; written by tools/phl/build_city.py and tools/nyc/import_nyc.py). */
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

/** clear: rings ([[x, z], ...]) kept free of park trees (playing fields);
 *  sea: everything outside the land outlines (city.limits) is water, not countryside;
 *  core: the Center City extent [x0, z0, x1, z1] in metres, which buildGround paves itself */
export async function buildCity(scene, data, { waterMat, status = () => {}, clear = [], sea = false, core = null }) {
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
  let ground = null;   // with terrain: the ground mesh, paved inside the city limits, country outside
  if (terrain.on) {
    // inside the limits on a 50 m lattice (even-odd fill along rows), for the paving's colour
    const C = 50, gx0 = terrain.x0, gz0 = terrain.z0, gw = Math.ceil((terrain.W - 1) * terrain.cell / C) + 1, gh = Math.ceil((terrain.H - 1) * terrain.cell / C) + 1, inside = new Uint8Array(gw * gh);
    for (let j = 0; j < gh; j++) {
      const z = gz0 + j * C, xs = [];
      for (const r of limits) for (let i = 0, k = r.length - 1; i < r.length; k = i++) { const [xi, zi] = r[i], [xk, zk] = r[k]; if ((zi > z) !== (zk > z)) xs.push(xi + (z - zi) * (xk - xi) / (zk - zi)); }
      xs.sort((a, b) => a - b);
      for (let q = 0; q + 1 < xs.length; q += 2) for (let i = Math.max(0, Math.ceil((xs[q] - gx0) / C)); i < gw && gx0 + i * C < xs[q + 1]; i++) inside[j * gw + i] = 1;
    }
    const pave = colorOf(GROUND), country = colorOf(COUNTRY);
    const colorAt = (x, z, out) => { const i = Math.round((x - gx0) / C), j = Math.round((z - gz0) / C); return out.copy(i >= 0 && j >= 0 && i < gw && j < gh && inside[j * gw + i] ? pave : country); };
    const mat = groundMat('#ffffff', THREE.FrontSide); mat.vertexColors = true;
    ground = buildTerrain(scene, mat, colorAt);
  } else if (sea) {
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(400000, 400000), waterMat);
    outer.rotation.x = -Math.PI / 2; outer.position.y = -.05; outer.receiveShadow = true; scene.add(outer);
  } else {
    const FAR = 200000, HOLE = 14500;   // buildGround's countryside plane (30 km square, y = 0) covers the middle
    const ob = new Builder(), ub = new Builder();
    const quad = (b, x0, z0, x1, z1, up) => {
      const s = b.count, ny = up ? 1 : -1;
      b.v(x0, 0, z0, 0, ny, 0); b.v(x0, 0, z1, 0, ny, 0); b.v(x1, 0, z0, 0, ny, 0); b.v(x1, 0, z1, 0, ny, 0);
      if (up) { b.tri(s, s + 1, s + 2); b.tri(s + 2, s + 1, s + 3); } else { b.tri(s, s + 2, s + 1); b.tri(s + 2, s + 3, s + 1); }
    };
    quad(ob, -FAR, -FAR, FAR, -HOLE, true); quad(ob, -FAR, HOLE, FAR, FAR, true); quad(ob, -FAR, -HOLE, -HOLE, HOLE, true); quad(ob, HOLE, -HOLE, FAR, HOLE, true);
    quad(ub, -FAR, -FAR, FAR, FAR, false);   // the whole underside: what a camera below ground sees
    const countryMat = seasonalGrass(M(COUNTRY, { roughness: 1, side: THREE.FrontSide }));
    for (const b of [ob, ub]) {
      const m = new THREE.Mesh(b.geometry(), countryMat);
      m.position.y = -.05; m.receiveShadow = true; scene.add(m);
    }
  }
  // the paved plate, without the middle of Center City, where buildGround's own paving lies on it
  const hole = core && limits.length === 1 && rectInRing(limits[0], core)
    ? [[[core[0] + 100, core[1] + 100], [core[2] - 100, core[1] + 100], [core[2] - 100, core[3] - 100], [core[0] + 100, core[3] - 100]]] : [];
  if (!terrain.on) {
    const pb = new Builder({ uv: true }); limits.forEach(r => addPolygon(pb, [r, ...hole], 0, (x, z) => [x / 400, z / 400]));
    const plate = new THREE.Mesh(pb.geometry(), groundMat(GROUND, THREE.FrontSide));
    plate.position.y = .14; plate.receiveShadow = true; scene.add(plate);
  }
  const edge = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(limits[0].map(([x, z]) => new THREE.Vector3(x, .6, z))),
    new THREE.LineBasicMaterial({ color: '#4a5a46', transparent: true, opacity: .7 }));
  if (!sea) scene.add(edge);   // the city limits (a waterfront city's land outlines are its shoreline)

  const gb = GREEN.map(() => new Builder());
  for (const [k, ...rings] of city.green) addPolygon(gb[k], rings.map(pairs), 0);
  gb.forEach((b, k) => { if (!b.count) return; const m = new THREE.Mesh(b.geometry(), seasonalGrass(M(GREEN[k], { side: THREE.FrontSide }))); m.position.y = .3 + k * .02; m.receiveShadow = true; m.userData.drapeTol = TOL_LAWN; scene.add(m); });
  const wb = new Builder(), water = city.water.map(p => p.map(pairs));
  water.forEach(p => addPolygon(wb, p, 0));
  for (const s of city.streams) addRibbon(wb, pairs(s.p), s.w, 0);
  const wm = new THREE.Mesh(wb.geometry(), waterMat); wm.position.y = terrain.on ? .15 : .6; wm.receiveShadow = true; wm.userData.terrain = 'water'; scene.add(wm);
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
  await status(`Raising ${(B.nB + B.nP).toLocaleString()} more buildings…`);
  // one instanced mesh per facade style per tile up close, one roof-only mesh per tile far away
  const per = new Map();   // tile -> { style: [indices] }
  const lights = [];
  // on terrain: each box from the lowest ground under its corners to its height above the middle
  const base = new Float32Array(B.nB), roofY = new Float32Array(B.nB);
  for (let i = 0; i < B.nB; i++) {
    const h = B.bh[i] / 10;
    if (!terrain.on) { roofY[i] = h; continue; }
    const a = B.br[i] / 65535 * Math.PI, c = Math.cos(a), s = Math.sin(a), w = B.bw[i] / 20, d = B.bd[i] / 20, x = B.bx[i] / 10, z = B.bz[i] / 10;
    const f = footprint([[x + c * w + s * d, z - s * w + c * d], [x - c * w + s * d, z + s * w + c * d], [x - c * w - s * d, z + s * w - c * d], [x + c * w - s * d, z - s * w - c * d]], h);
    base[i] = f.y0; roofY[i] = f.top;
  }
  for (let i = 0; i < B.nB; i++) {
    const x = B.bx[i] / 10, z = B.bz[i] / 10, t = tileOf(x, z), h = B.bh[i] / 10;
    let l = per.get(t); if (!l) per.set(t, l = {});
    const k = facadeKind(B.bk[i] === 0, h, hash(i + 11));
    (l[k] || (l[k] = [])).push(i); t.top = Math.max(t.top, h);
  }
  const geoBox = unitBox(), geoRoof = unitRoof(), plantMat = M('#ffffff', { roughness: .85 }), plantVC = M('#ffffff', { roughness: .85, vertexColors: true });
  const col = new THREE.Color();
  const place = (mat4, j, i, sx = 1, sy = 1, y0 = base[i], hh = roofY[i] - base[i]) => {
    const a = B.br[i] / 65535 * Math.PI, c = Math.cos(a), s = Math.sin(a), w = B.bw[i] / 10 * sx, d = B.bd[i] / 10 * sx;
    const o = j * 16;   // the rest of the matrix stays 0
    mat4[o] = c * w; mat4[o + 2] = -s * w; mat4[o + 5] = hh * sy; mat4[o + 8] = s * d; mat4[o + 10] = c * d;
    mat4[o + 12] = B.bx[i] / 10; mat4[o + 13] = y0; mat4[o + 14] = B.bz[i] / 10; mat4[o + 15] = 1;
  };
  // bounds: [centre, radius] of the instances, so the mesh can be frustum-culled (and, by the
  // sun's shadow box, skipped in the shadow pass) like any mesh; see geometry.js withBounds
  const instanced = (geo, mat, mat4, cols, bounds = null) => {
    const m = new THREE.InstancedMesh(bounds ? withBounds(geo, ...bounds) : geo, mat, mat4.length / 16);
    m.instanceMatrix = new THREE.InstancedBufferAttribute(mat4, 16); m.instanceColor = new THREE.InstancedBufferAttribute(cols, 3);
    m.frustumCulled = !!bounds; m.userData.bounded = !!bounds; m.receiveShadow = true; m.userData.tiled = true; m.userData.terrain = 'done'; scene.add(m); return m;
  };
  for (const [t, kinds] of per) {
    const all = Object.values(kinds).flat(), rm4 = new Float32Array(all.length * 16), plant = [];
    let reach = 0, high = 0, low = 0;   // how far from the tile's centre, and how high (with rooftop plant), these boxes get
    all.forEach((i, j) => {
      place(rm4, j, i);
      reach = Math.max(reach, Math.hypot(B.bx[i] / 10 - t.cx, B.bz[i] / 10 - t.cz) + Math.hypot(B.bw[i], B.bd[i]) / 20); high = Math.max(high, roofY[i] + 10); low = Math.min(low, base[i]);
    });
    const bounds = [new THREE.Vector3(t.cx, (high + low) / 2, t.cz), Math.hypot(reach, (high - low) / 2)];
    t.roof.push(instanced(geoRoof, instancedWinMat('office'), rm4, new Float32Array(all.length * 3).fill(1)));
    for (const [kind, list] of Object.entries(kinds)) {
      const mat4 = new Float32Array(list.length * 16), cols = new Float32Array(list.length * 3);
      list.forEach((i, j) => {
        place(mat4, j, i); const fc = colorOf(facadeColor(kind, hash(i))); cols[j * 3] = fc.r; cols[j * 3 + 1] = fc.g; cols[j * 3 + 2] = fc.b;
        if (!kind.startsWith('row') && B.bh[i] > 400) plant.push(i);
      });
      const full = instanced(geoBox, instancedWinMat(kind), mat4, cols, bounds); full.castShadow = true; t.full.push(full);
    }
    if (plant.length) {   // rooftop plant on buildings over 40 m, and aviation lights over 90 m
      const m4 = new Float32Array(plant.length * 16), cl = new Float32Array(plant.length * 3);
      plant.forEach((i, j) => {
        const h = B.bh[i] / 10; place(m4, j, i, .55 + hash(i + 5) * .1, 1, roofY[i], 3 + Math.min(6, h * .025));
        col.set(roofColor(hash(i + 5))).multiplyScalar(.9); cl.set([col.r, col.g, col.b], j * 3);
        if (h > 90) lights.push(B.bx[i] / 10, roofY[i] + 5 + Math.min(6, h * .025), B.bz[i] / 10);
      });
      const pm = instanced(geoBox, plantMat, m4, cl, bounds); pm.castShadow = true; t.full.push(pm);
    }
  }
  // large irregular buildings: real outlines, merged per tile and facade style
  const pBuild = new Map();
  for (let i = 0, v = 0; i < B.nP; i++) {
    const n = B.pn[i], ring = [];
    let x = 0, z = 0;
    for (let k = 0; k < n; k++) { x = k ? x + B.vx[v + k] : B.vx[v + k]; z = k ? z + B.vz[v + k] : B.vz[v + k]; ring.push([x / 10, z / 10]); }
    v += n;
    const t = tileOf(ring[0][0], ring[0][1]);
    let pk = pBuild.get(t); if (!pk) pBuild.set(t, pk = {});
    const h = B.ph[i] / 10, fk = facadeKind(B.pk[i] === 0, h, hash(i + 11)), color = facadeColor(fk, hash(i + 3)), f = footprint(ring, h);
    addPrism(pk[fk] || (pk[fk] = new Builder({ uv: true, color: true })), [ring], f.y0, f.top, hash(i + 7) * 4, WIN_W, WIN_H, colorOf(color), colorOf(roofColor(hash(i + 9))), f.mid);
    if (B.pk[i] && h > 40) addRooftop(pk.plant || (pk.plant = new Builder({ color: true })), ring, h, color, hash(i + 5), lights, f.mid);
    t.top = Math.max(t.top, h);
  }
  for (const [t, bs] of pBuild) for (const [kind, b] of Object.entries(bs)) {
    if (!b.count) continue;
    const m = new THREE.Mesh(b.geometry(), kind === 'plant' ? plantVC : worldWinMat(kind));
    m.castShadow = m.receiveShadow = true; m.userData.terrain = 'done'; scene.add(m); t.always.push(m);
  }

  // ---- park trees, tiled with a draw distance
  const tt = new Map();
  for (let i = 0; i < city.trees.length; i += 2) {
    if (clear.some(r => inRing(city.trees[i] / 10, city.trees[i + 1] / 10, r))) continue;
    const t = tileOf(city.trees[i] / 10, city.trees[i + 1] / 10);
    let l = tt.get(t); if (!l) tt.set(t, l = []); l.push(city.trees[i], city.trees[i + 1]);
  }
  for (const [t, flat] of tt) { t.trees = buildTrees(scene, flat); t.trees.forEach(m => { m.userData.tiled = true; }); }

  // ---- per-frame: frustum + distance per tile
  const frustum = new THREE.Frustum(), pm = new THREE.Matrix4(), sph = new THREE.Sphere(), tl = [...tiles.values()], fwd = new THREE.Vector3();
  tl.forEach(t => { t.base = surface(t.cx, t.cz); t.r = Math.hypot(TILE * .75, t.top + 40); });
  function update(camera, fogFar) {
    pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pm);
    const cp = camera.position;
    for (const t of tl) {
      sph.center.set(t.cx, t.base + t.top / 2, t.cz); sph.radius = t.r;
      const d = Math.hypot(cp.x - t.cx, cp.y - t.base - t.top / 2, cp.z - t.cz);
      const vis = d - t.r < fogFar && frustum.intersectsSphere(sph);
      const near = vis && d - t.r < FULL;
      t.full.forEach(m => { m.visible = near; });
      t.roof.forEach(m => { m.visible = vis && !near; });
      t.always.forEach(m => { m.visible = vis; });
      t.trees.forEach(m => { m.visible = vis && d - t.r < TREE_FAR && m.userData.season !== false; });   // bare branches and flower beds only in season
    }
    // the ground mesh: fine tiles near, coarse ones further off, whole blocks in one mesh once
    // all of a block is far, none past the fog or off screen
    if (ground) for (const B of ground.blocks) {
      sph.center.set(B.cx, B.cy, B.cz); sph.radius = B.r;
      const dB = Math.hypot(cp.x - B.cx, cp.y - B.cy, cp.z - B.cz) - B.r, inView = dB < fogFar && frustum.intersectsSphere(sph);
      const whole = inView && dB >= 3000;
      B.mesh.visible = whole;
      for (const g of B.tiles) {
        if (!inView || whole) { g.near.visible = g.far.visible = false; continue; }
        sph.center.set(g.cx, g.cy, g.cz); sph.radius = g.r;
        const d = Math.hypot(cp.x - g.cx, cp.y - g.cy, cp.z - g.cz) - g.r, vis = d < fogFar && frustum.intersectsSphere(sph);
        g.near.visible = vis && d < 3000; g.far.visible = vis && d >= 3000;
      }
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
  const beacons = aviationLights(lights); beacons.userData.terrain = 'done'; scene.add(beacons);
  return { update, view, bridgeSegs, wet, bounds: { x0, z0, x1, z1 }, buildingCount: B.nB + B.nP, nightOnly: [beacons], boxes: B };
}
