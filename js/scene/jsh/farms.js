// Jersey Shore's farms (data/jsh/farms.json.gz, written by tools/jsh/build_jsh.py): crop fields
// from the USDA Cropland Data Layer, and the barns and silos found among the footprints.
//
// Fields follow the farming year (season.js day): corn and soybeans are planted into tilled
// soil in May, come up in rows, grow into a canopy (corn to about 2.7 m) that dries to tan in
// September, and are harvested from early October to stubble; winter wheat is green from autumn
// to spring, turns gold and is cut in July; hay is cut three times a summer and left in round
// bales. Each crop's fields are split into three groups a week or so apart, so the valley
// isn't all planted or harvested on one day. The ground and canopy are built flat and draped
// onto the terrain with everything else (terrain.js); barns and silos stand on it themselves.
import * as THREE from 'three';
import { pairs } from '../../data.js';
import { M } from '../materials.js';
import { Builder, addPolygon } from '../geometry.js';
import { onSeason } from '../season.js';
import { groundAt, groundBase } from './terrain.js';

/** where real corn plants stand in for the canopy slab (cornlod.js sets it each frame): x, z, radius */
export const CORN_HOLE = { value: new THREE.Vector3(0, 0, 0) };
/** discard a material's fragments inside CORN_HOLE (the slab's colour and its shadow), or with
 *  inside = true everywhere else (the plants, which stand only in the hole; reach: metres past its edge) */
export function cutHole(m, inside = false, reach = 4) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    sh.uniforms.uHole = CORN_HOLE;
    sh.vertexShader = 'varying vec2 vHoleXZ;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  vec4 holeP = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    holeP = instanceMatrix * holeP;
  #endif
  vHoleXZ = (modelMatrix * holeP).xz;`);
    // the slab thins out over the hole's last 8 m in a fine stipple, so it blends into the plants
    // (which reach past the edge) instead of ending in a hard circle
    const test = inside ? `distance(vHoleXZ, uHole.xy) >= uHole.z + ${reach.toFixed(1)}`
      : '(distance(vHoleXZ, uHole.xy) < uHole.z && fract(sin(dot(floor(vHoleXZ * 3.0), vec2(12.9898, 78.233))) * 43758.5453) < clamp((uHole.z - distance(vHoleXZ, uHole.xy)) / 8.0, 0.0, 1.0))';
    sh.fragmentShader = 'uniform vec3 uHole;\nvarying vec2 vHoleXZ;\n' + sh.fragmentShader.replace('void main() {', `void main() {\n  if (${test}) discard;`);
    if (prev) prev(sh, r);
  };
  m.customProgramCacheKey = () => (inside ? 'corn-plants' : 'corn-hole');
  return m;
}

const C = h => new THREE.Color(h);
const SOIL = C('#6e5641'), STUBBLE = C('#a8946c'), WINTER = C('#8a8560');
const smooth = (a, b, d) => { const t = Math.max(0, Math.min(1, (d - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a.clone().lerp(b, t);

/** stripes across v: rows of plants (light) and soil between them (dark), multiplied by the stage colour */
let rowTex = null;
export function rows() {
  if (rowTex) return rowTex;
  const c = document.createElement('canvas'); c.width = 8; c.height = 64; const g = c.getContext('2d');
  for (let y = 0; y < 64; y++) { const k = Math.round(222 + 33 * Math.cos(y / 16 * Math.PI * 2)); g.fillStyle = `rgb(${k},${k},${k})`; g.fillRect(0, y, 8, 1); }
  rowTex = new THREE.CanvasTexture(c); rowTex.wrapS = rowTex.wrapT = THREE.RepeatWrapping; rowTex.anisotropy = 16;
  return rowTex;
}

/**
 * What a field of crop `k` looks like on `day`, `dd` days behind the earliest group:
 * { ground: colour, canopy: height (m, 0 = none), top: canopy colour, bales: hay just cut }
 * harvestDay: the day this field comes off, when it isn't its group's (harvest.js: the last corn standing)
 */
export function stage(k, day, dd, harvestDay) {
  const d = day - dd;
  if (k === 'corn' || k === 'soy' || k === 'veg') {
    const corn = k !== 'soy', tall = corn ? 2.7 : .9, plant = corn ? 130 : 140, harvest = harvestDay ?? (corn ? 282 + dd * 1.5 : 275 + dd);
    if (day >= harvest || d < 105) return { ground: day >= harvest && day < 345 ? STUBBLE : mix(STUBBLE, WINTER, .4), canopy: 0 };
    if (d < plant + 20) return { ground: mix(SOIL, C('#6f8a3c'), smooth(plant + 8, plant + 20, d) * .45), canopy: 0 };
    const h = tall * smooth(plant + 18, corn ? 215 : 205, d);
    const top = corn ? mix(mix(C('#5d8f37'), C('#47752b'), smooth(170, 200, d)), C('#c2a96e'), smooth(238, 268, d))
      : mix(mix(C('#6a9a3e'), C('#cdb84a'), smooth(240, 258, d)), C('#8f7448'), smooth(258, 272, d));
    // under a closed canopy the ground is in leaf shade (it shows only between the near plants, cornlod.js)
    return { ground: mix(SOIL, top.clone().multiplyScalar(.5), smooth(plant + 30, plant + 70, d) * .85), canopy: h, top };
  }
  if (k === 'grain') {   // winter wheat: sown in October, cut in July
    const cut = 192 + dd;
    if (day >= cut && day < 285) return { ground: day < 268 ? C('#cdb27a') : SOIL, canopy: 0 };
    const green = mix(C('#7da34a'), WINTER, day > 330 || day < 75 ? .55 : 0);
    if (day >= 285 || d < 105) return { ground: mix(SOIL, green, day >= 285 ? smooth(290, 310, day) : 1), canopy: 0 };
    return { ground: SOIL, canopy: .2 + .75 * smooth(105, 150, d), top: mix(C('#6f9a45'), C('#d4b35a'), smooth(160, 182, d)) };
  }
  // hay: green from April, cut three times, dormant over winter
  const cuts = [158, 205, 255].map(c => c + dd), last = cuts.filter(c => day >= c).pop();
  const since = last === undefined ? 99 : day - last, grow = mix(C('#7aa34d'), C('#5f8e3c'), smooth(110, 150, day));
  if (day < 95 || day > 320) return { ground: mix(WINTER, C('#7a8a4f'), smooth(80, 105, day) * (day < 200 ? 1 : 0)), canopy: 0 };
  return { ground: since < 12 ? mix(C('#b3b06a'), grow, since / 12) : grow, canopy: 0, bales: since < 26 };
}

/** skip: the index of a field that is drawn elsewhere (harvest.js) */
export function buildFarms(scene, data, skip = -1) {
  const tex = rows(), groups = new Map();   // "kind:cohort" -> { k, dd, fields: [] }
  for (const [i, f] of data.fields.entries()) {
    if (i === skip) continue;
    const c = Math.min(2, Math.floor(f.s * 3)), key = f.k + ':' + c;
    if (!groups.has(key)) groups.set(key, { k: f.k, dd: c * 8, fields: [] });
    groups.get(key).fields.push(f);
  }
  const ROW = { corn: 3.05, soy: 3.05, veg: 3.05, grain: 1.2, hay: 9 };   // metres per texture repeat across the rows
  const parts = [];
  let rnd = 1; const rand = () => ((rnd = (rnd * 16807) % 2147483647) - 1) / 2147483646;
  const inRings = (x, z, rings) => { let c = false; for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
  for (const g of groups.values()) {
    const gb = new Builder({ uv: true }), cb = new Builder({ uv: true }), period = ROW[g.k] || 3, bales = [];
    for (const f of g.fields) {
      const rings = f.p.map(pairs), ca = Math.cos(f.a), sa = Math.sin(f.a);
      const uv = (x, z) => [(x * ca + z * sa) / 40, (-x * sa + z * ca) / period];
      addPolygon(gb, rings, 0, uv);
      if (g.k === 'hay') {   // round bales scattered where they were dropped
        const xs = rings[0].map(p => p[0]), zs = rings[0].map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
        const n = Math.round((x1 - x0) * (z1 - z0) / 2500);
        for (let i = 0; i < n; i++) { const x = x0 + rand() * (x1 - x0), z = z0 + rand() * (z1 - z0); if (inRings(x, z, rings)) bales.push(x, z, rand()); }
        continue;
      }
      // the canopy: a slab with the field's outline, lowered into the ground as it grows
      addPolygon(cb, rings, 0, uv);
      for (const r of rings) for (let i = 0; i < r.length; i++) {
        const [ax, az] = r[i], [bx, bz] = r[(i + 1) % r.length], L = Math.hypot(bx - ax, bz - az); if (L < .01) continue;
        const nx = (bz - az) / L, nz = -(bx - ax) / L, s = cb.count;   // outward for outer rings and holes alike
        cb.v(ax, 0, az, nx, 0, nz, 0, 0); cb.v(bx, 0, bz, nx, 0, nz, 0, L / 1.5); cb.v(ax, -4, az, nx, 0, nz, 1, 0); cb.v(bx, -4, bz, nx, 0, nz, 1, L / 1.5);
        cb.tri(s, s + 1, s + 2); cb.tri(s + 1, s + 3, s + 2);
      }
    }
    const gm = M('#ffffff', { map: tex, roughness: 1, side: THREE.FrontSide }), ground = new THREE.Mesh(gb.geometry(), gm);
    ground.position.y = .45; ground.receiveShadow = true; scene.add(ground);
    let canopy = null, cm = null, baleMesh = null;
    if (cb.count) {
      cm = M('#ffffff', { map: tex, roughness: .95 }); canopy = new THREE.Mesh(cb.geometry(), cm);
      canopy.castShadow = canopy.receiveShadow = true; scene.add(canopy);
      if (g.k === 'corn') {   // near the camera, real plants stand here instead (cornlod.js)
        cutHole(cm); canopy.customDepthMaterial = cutHole(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
      }
    }
    if (bales.length) {
      const geo = new THREE.CylinderGeometry(.8, .8, 1.25, 12); geo.rotateZ(Math.PI / 2); geo.translate(0, .8, 0);
      baleMesh = new THREE.InstancedMesh(geo, M('#ffffff', { roughness: .95 }), bales.length / 3);
      const o = new THREE.Object3D(), col = new THREE.Color();
      for (let i = 0; i < bales.length / 3; i++) {
        const x = bales[i * 3], z = bales[i * 3 + 1], r = bales[i * 3 + 2];
        o.position.set(x, groundAt(x, z), z); o.rotation.set(0, r * 6.28, 0); o.updateMatrix(); baleMesh.setMatrixAt(i, o.matrix);
        baleMesh.setColorAt(i, col.set(r < .3 ? '#ecebe4' : '#c9b57c'));   // wrapped, or dry
      }
      baleMesh.castShadow = baleMesh.receiveShadow = true; baleMesh.frustumCulled = false; baleMesh.userData.grounded = true; scene.add(baleMesh);
    }
    parts.push({ ...g, gm, canopy, cm, baleMesh });
  }

  // barns: gambrel (most), plain gable, or a long low pole barn; walls a little into the ground
  const wb = new Builder({ color: true }), rb = new Builder({ color: true }), col = new THREE.Color(), door = new THREE.Color();
  for (const b of data.barns) {
    const c = Math.cos(b.ry), s = Math.sin(b.ry), W = b.w / 2, D = b.d / 2;
    const P = (x, z) => [b.x + x * c + z * s, b.z - x * s + z * c];
    const base = groundBase([P(-W, -D), P(W, -D), P(W, D), P(-W, D)]), y0 = base - 1;
    const he = base + (b.t === 'pole' ? 4.2 : 3.2 + b.d * .08);
    const prof = b.t === 'gambrel' ? [[-D, 0], [-.6 * D, .6 * D], [0, .84 * D], [.6 * D, .6 * D], [D, 0]]
      : b.t === 'gable' ? [[-D, 0], [0, .62 * D], [D, 0]] : [[-D, 0], [0, .24 * D], [D, 0]];
    col.set(b.c); door.copy(col).multiplyScalar(.45);
    const wv = (x, y, z, nx, nz, cc) => { const [wx, wz] = P(x, z); return wb.v(wx, y, wz, nx * c + nz * s, 0, -nx * s + nz * c, 0, 0, cc); };
    const quad = (pts, nx, nz, cc) => { const k = pts.map(([x, y, z]) => wv(x, y, z, nx, nz, cc)); wb.tri(k[0], k[1], k[2]); wb.tri(k[0], k[2], k[3]); };
    // long walls (local z = +-D) and gable ends (x = +-W) with their gable triangles above the eave
    quad([[-W, y0, D], [W, y0, D], [W, he, D], [-W, he, D]], 0, 1, col);
    quad([[W, y0, -D], [-W, y0, -D], [-W, he, -D], [W, he, -D]], 0, -1, col);
    for (const sx of [1, -1]) {
      quad(sx > 0 ? [[W, y0, D], [W, y0, -D], [W, he, -D], [W, he, D]] : [[-W, y0, -D], [-W, y0, D], [-W, he, D], [-W, he, -D]], sx, 0, col);
      const top = prof.map(([z, y]) => wv(sx * W, he + y, z, sx, 0, col)), mid = wv(sx * W, he, 0, sx, 0, col);
      for (let i = 0; i + 1 < top.length; i++) sx > 0 ? wb.tri(mid, top[i], top[i + 1]) : wb.tri(mid, top[i + 1], top[i]);
      // a big sliding door in each end
      const dw = Math.min(D * .7, 2.6), dh = Math.min(he - base - .3, 3.6), fx = sx * (W + .06);
      quad(sx > 0 ? [[fx, base, dw], [fx, base, -dw], [fx, base + dh, -dw], [fx, base + dh, dw]] : [[fx, base, -dw], [fx, base, dw], [fx, base + dh, dw], [fx, base + dh, -dw]], sx, 0, door);
    }
    // roof: the profile run along the barn, with a little overhang
    col.set(b.r);
    const O = .4;
    for (let i = 0; i + 1 < prof.length; i++) {
      let [za, ya] = prof[i], [zb, yb] = prof[i + 1];
      if (i === 0) { const t = O / Math.hypot(zb - za, yb - ya); za -= (zb - za) * t; ya -= (yb - ya) * t; }
      if (i + 2 === prof.length) { const t = O / Math.hypot(zb - za, yb - ya); zb += (zb - za) * t; yb += (yb - ya) * t; }
      const L = Math.hypot(zb - za, yb - ya), nz = -(yb - ya) / L, ny = (zb - za) / L;
      const rv = (x, y, z) => { const [wx, wz] = P(x, z); return rb.v(wx, he + y + .05, wz, nz * s, ny, nz * c, 0, 0, col); };
      const k = [rv(-W - O, ya, za), rv(W + O, ya, za), rv(W + O, yb, zb), rv(-W - O, yb, zb)];
      rb.tri(k[0], k[2], k[1]); rb.tri(k[0], k[3], k[2]);
    }
  }
  const walls = new THREE.Mesh(wb.geometry(), M('#ffffff', { vertexColors: true, roughness: .9, side: THREE.FrontSide }));
  const roofs = new THREE.Mesh(rb.geometry(), M('#ffffff', { vertexColors: true, roughness: .6, metalness: .2 }));
  // silos: concrete stave or blue glass-lined, with a dome
  const sb = new Builder({ color: true });
  for (const sl of data.silos) {
    const base = groundAt(sl.x, sl.z) - 1, top = base + 1 + sl.h, n = 16; col.set(sl.c);
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, s0 = sb.count;
      for (const [a, y] of [[a0, base], [a1, base], [a1, top], [a0, top]]) sb.v(sl.x + Math.cos(a) * sl.r, y, sl.z + Math.sin(a) * sl.r, Math.cos(a), 0, Math.sin(a), 0, 0, col);
      sb.tri(s0, s0 + 2, s0 + 1); sb.tri(s0, s0 + 3, s0 + 2);
      const d0 = sb.count; door.copy(col).multiplyScalar(.85);
      sb.v(sl.x + Math.cos(a0) * sl.r, top, sl.z + Math.sin(a0) * sl.r, Math.cos(a0) * .7, .7, Math.sin(a0) * .7, 0, 0, door);
      sb.v(sl.x + Math.cos(a1) * sl.r, top, sl.z + Math.sin(a1) * sl.r, Math.cos(a1) * .7, .7, Math.sin(a1) * .7, 0, 0, door);
      sb.v(sl.x, top + sl.r * .8, sl.z, 0, 1, 0, 0, 0, door);
      sb.tri(d0, d0 + 2, d0 + 1);
    }
  }
  const silos = new THREE.Mesh(sb.geometry(), M('#ffffff', { vertexColors: true, roughness: .85 }));
  for (const m of [walls, roofs, silos]) { m.castShadow = m.receiveShadow = true; m.userData.draped = true; scene.add(m); }

  onSeason(st => {
    for (const p of parts) {
      const s = stage(p.k, st.day, p.dd);
      p.gm.color.copy(s.ground);
      if (p.canopy) { p.canopy.visible = s.canopy > .05; p.canopy.position.y = .45 + s.canopy; if (s.top) p.cm.color.copy(s.top).multiplyScalar(p.k === 'corn' ? .8 : 1); }   // corn: as dark as the self-shaded plants that replace it near the camera
      if (p.baleMesh) p.baleMesh.visible = !!s.bales;
    }
  });
  return { fields: data.fields.length, barns: data.barns.length, silos: data.silos.length };
}
