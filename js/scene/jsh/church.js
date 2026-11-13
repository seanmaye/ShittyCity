// Crossroads Church, off Old Fort Road by Antes Fort ("Go to: Take me to church").
//
// Outside, the real building in place of the generic church town.js would put on its footprint:
// a long steel-sided hall under a dark brown roof, gable end to the parking lot on the east, its
// lower walls brick. On the gable: a tall window with a white cross in its mullions, a window
// either side, the CROSSROADS CHURCH sign, three pairs of brown doors between evergreens, and on
// the ridge a white steeple and spire. A low wing runs down the south side. The striped lot is in
// front, with its light poles; the small "church" footprint next door is the picnic pavilion.
//
// Inside (only drawn while the camera is in the building), the sanctuary as it is on a Sunday:
// a black ceiling with its steel trusses and swags of string lights, the stage at the west end
// with a scalloped arch backdrop, two projection screens with the slides, coral hexagon panels,
// birch trees wound with fairy lights, a drum cage and the band, moving-head lights on a truss
// sweeping coloured beams over the room, strobes, and the congregation standing in three blocks
// of chairs, some with their hands up. Up the two aisles, across the front and back round the
// middle block, a lime-green touring bike with black flames goes slowly round and round; above
// everyone the preacher flies on a tether from a turning boom in the ceiling, preaching.
//
// Inside, everything is drawn with matcap materials (a lit sphere painted with stage colours),
// so the room reads the same at noon or midnight and adds no lights to the scene. The "Go to"
// view ends with the camera held inside the hall (hold/clamp) until another view is chosen.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pairs } from '../../data.js';
import { groundAt } from './terrain.js';
import { makeFigure } from '../phl/people.js';

const TAU = Math.PI * 2;
const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// ---- the building (its own frame: x toward the front (east), y up, z to the south) -------------
const AF = 32.55, AB = -32.55;        // front and back gable walls
const BC = -3.5, HW = 14.8;           // the main hall's centre line across, and its half width (the wing takes the rest)
const EV = 8.5, PK = 13.4, BR = 3.4;  // eave, ridge and brick heights above the floor
const WING = [11.3, 18.3, 26];        // the south wing: from the hall wall to its outer wall, and its front
// ---- the sanctuary (the hall's own frame: x across, right when facing the stage; z back toward the doors)
const HX = 14.4, Z0 = -22.1, Z1 = 22, CEV = 8.05, CPK = 12.75;
const STAGE = { z: -13, y: 1 };
const ROWS = 18, ROW0 = -9.5, PITCH = .95, SEAT = .55;
const MID = 3.85, AISLE = 2.6, SIDE = 10;   // the middle block's half width, the aisles, seats in a side block
const LOOP = { x: MID + AISLE / 2, zf: -11.3, zb: 9.3, r: 2, speed: 2.1 };
const FLY = { z: -1, hub: 10.6, arm: 3, r: 7, y: 7.4, period: 30 };
const BPM = 76;

/**
 * Where the church is: the "church" footprint under the label "Crossroads Church" (data/jsh/places.json),
 * and any small church footprint beside it (the pavilion). Returns { skip, main, pavilion } or null.
 */
export function churchSite(buildings, places) {
  const lbl = places.labels.find(l => l.t === 'Crossroads Church'); if (!lbl) return null;
  const { j: J, jtypes: T, b: B } = buildings, rec = i => ({ i, type: T[J[i * 6]], cx: J[i * 6 + 1] / 10, cz: J[i * 6 + 2] / 10, w: J[i * 6 + 3] / 10, d: J[i * 6 + 4] / 10, ang: J[i * 6 + 5] / 1000 });
  let main = null, bd = 30;
  for (let i = 0; i < B.length; i++) { const r = rec(i), d = Math.hypot(r.cx - lbl.x, r.cz - lbl.z); if (r.type === 'church' && d < bd) { bd = d; main = r; } }
  if (!main) return null;
  // its long side runs front to back; the front faces east, to the lot
  const ring = pairs(B[main.i][2]);
  let ex = 0, ez = 0, best = 0;
  ring.forEach((p, k) => { const q = ring[(k + 1) % ring.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (L > best) { best = L; ex = (q[0] - p[0]) / L; ez = (q[1] - p[1]) / L; } });
  if (ex < 0) { ex = -ex; ez = -ez; }
  main.E = [ex, ez]; main.ring = ring;
  let pavilion = null;
  for (let i = 0; i < B.length; i++) { const r = rec(i); if (i !== main.i && r.type === 'church' && r.w * r.d < 200 && Math.hypot(r.cx - main.cx, r.cz - main.cz) < 60) pavilion = r; }
  return { skip: new Set([main.i, ...(pavilion ? [pavilion.i] : [])]), main, pavilion };
}

// ---- textures -------------------------------------------------------------------------------------
function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const brickTex = () => canvasTex(256, 256, (g, w, h) => {   // a tile 2 m wide, 1 m tall: 16 courses
  g.fillStyle = '#b9ab98'; g.fillRect(0, 0, w, h);
  const cols = ['#9a5a45', '#a8664e', '#8d4f3d', '#b07257', '#a05f48', '#946049'];
  for (let r = 0; r < 16; r++) for (let k = -1; k < 9; k++) {
    g.fillStyle = cols[Math.floor(hash(r * 31 + k) * cols.length)];
    g.fillRect(k * 32 + (r % 2) * 16 + 1, r * 16 + 1, 30, 14);
  }
}, true);
const ribTex = (base, dark) => canvasTex(64, 16, (g, w, h) => {   // steel siding or roofing: a rib every tile
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  g.fillStyle = dark; g.fillRect(0, 0, 6, h); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(6, 0, 3, h);
}, true);
function windowTex(cross) {
  return canvasTex(256, cross ? 512 : 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#4a5560'); gr.addColorStop(.45, '#7d8a92'); gr.addColorStop(.55, '#55606a'); gr.addColorStop(1, '#2e353c');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3b3128';   // bronze mullions
    const nc = cross ? 4 : 2, nr = cross ? 8 : 4;
    for (let i = 0; i <= nc; i++) g.fillRect(i * (w - 6) / nc, 0, 6, h);
    for (let i = 0; i <= nr; i++) g.fillRect(0, i * (h - 6) / nr, w, 6);
    if (cross) { g.fillStyle = '#ffffff'; g.fillRect(w / 2 - 17, 0, 34, h); g.fillRect(0, h * .3 - 17, w, 34); }
  });
}
const signTex = () => canvasTex(1024, 160, (g, w, h) => {
  g.clearRect(0, 0, w, h); g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 104px Arial, sans-serif'; g.strokeStyle = 'rgba(90,80,64,.6)'; g.lineWidth = 6;
  const word = 'CROSSR  ADS', tw = g.measureText(word).width; g.strokeText(word, w / 2, 62); g.fillText(word, w / 2, 62);
  const ox = w / 2 - tw / 2 + g.measureText('CROSSR ').width + g.measureText(' ').width / 2 - 4;   // the O: a teal globe with a cross
  g.fillStyle = '#2aa6c4'; g.beginPath(); g.arc(ox + 20, 60, 42, 0, TAU); g.fill();
  g.strokeStyle = '#ffffff'; g.lineWidth = 9; g.beginPath(); g.moveTo(ox + 20, 26); g.lineTo(ox + 20, 96); g.moveTo(ox - 2, 50); g.lineTo(ox + 42, 50); g.stroke();
  g.fillStyle = '#ffffff'; g.font = 'bold 34px Arial, sans-serif'; g.fillText('C H U R C H', w / 2, 136);
});
const lotTex = (L) => canvasTex(1024, 1024, (g, w, h) => {
  const px = b => (b - L.b0) / (L.b1 - L.b0) * w, py = a => (1 - (a - L.a0) / (L.a1 - L.a0)) * h, m = w / (L.b1 - L.b0);
  g.fillStyle = '#2a2a2c'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${hash(i) < .5 ? '255,255,255' : '0,0,0'},${.05 + hash(i + 1) * .06})`; g.fillRect(hash(i + 2) * w, hash(i + 3) * h, 2, 2); }
  // gravel islands between the double rows, and the stalls either side of each aisle
  for (const b of L.islands) { g.fillStyle = '#9b8f7c'; g.fillRect(px(b - 1), py(L.a1 - 2), 2 * m, py(L.stall0) - py(L.a1 - 2)); }
  g.strokeStyle = '#f2f2ee'; g.lineWidth = .13 * m;
  for (const [b0, b1, hc] of L.rows) for (let a = L.stall0; a <= L.a1 - 2; a += 2.75) {
    g.beginPath(); g.moveTo(px(b0), py(a)); g.lineTo(px(b1), py(a)); g.stroke();
    if (hc && a < L.stall0 + 8) {   // accessible stalls by the doors, hatched blue
      g.strokeStyle = '#3b8fd6'; for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(px(b0 + k), py(a)); g.lineTo(px(b0 + k + 1.2), py(a + 2.75)); g.stroke(); } g.strokeStyle = '#f2f2ee';
    }
  }
  for (const [b0, b1] of L.rows) { g.beginPath(); g.moveTo(px(b0), py(L.stall0)); g.lineTo(px(b0), py(L.a1 - 2)); g.stroke(); }
  // arrows in the drive lane
  g.fillStyle = '#f2f2ee';
  for (const b of L.arrows) { const x = px(b), y = py(L.a0 + 3.5); g.beginPath(); g.moveTo(x - .6 * m, y); g.lineTo(x + .6 * m, y); g.lineTo(x, y + 1.2 * m); g.fill(); g.fillRect(x - .15 * m, y - 1.4 * m, .3 * m, 1.4 * m); }
});
/** a soft round glow (fairy lights, beam pools) */
const glowTex = () => canvasTex(64, 64, (g, w) => {
  const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.25, 'rgba(255,255,255,.8)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, w);
});
/** brightest where a beam leaves its lamp, fading along it */
const beamTex = () => canvasTex(4, 128, (g, w, h) => {
  const r = g.createLinearGradient(0, 0, 0, h); r.addColorStop(0, '#ffffff'); r.addColorStop(.25, '#8a8a8a'); r.addColorStop(1, '#0a0a0a');
  g.fillStyle = r; g.fillRect(0, 0, w, h);
});
/** a lit sphere for MeshMatcapMaterial: a key light from the front and above, and coloured rims */
function matcapTex(key, lo, rimL, rimR) {
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N), L = [0, .55, .83];
  const cl = s => [parseInt(s.slice(1, 3), 16) / 255, parseInt(s.slice(3, 5), 16) / 255, parseInt(s.slice(5, 7), 16) / 255];
  const A = cl(rimL), B = cl(rimR);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let nx = (x + .5) / N * 2 - 1, ny = 1 - (y + .5) / N * 2; const r2 = nx * nx + ny * ny;
    if (r2 > 1) { const k = 1 / Math.sqrt(r2); nx *= k; ny *= k; }
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)), d = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
    const rim = Math.pow(1 - nz, 2), sp = Math.pow(d, 30) * .35, i = (y * N + x) * 4;
    for (let k = 0; k < 3; k++) img.data[i + k] = 255 * Math.min(1, lo + key * Math.pow(d, 1.4) + sp + rim * (Math.max(0, -nx) * A[k] + Math.max(0, nx) * B[k]));
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

// ---- geometry -------------------------------------------------------------------------------------
/** flat convex polygons by material, each wound and lit to face `hint`; UVs in metres / the material's tile */
class Shell {
  constructor() { this.parts = new Map(); }
  poly(mat, pts, hint) {
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; nx += (p[1] - q[1]) * (p[2] + q[2]); ny += (p[2] - q[2]) * (p[0] + q[0]); nz += (p[0] - q[0]) * (p[1] + q[1]); }
    const L = Math.hypot(nx, ny, nz); if (L < 1e-9) return; nx /= L; ny /= L; nz /= L;
    if (nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { pts = pts.slice().reverse(); nx = -nx; ny = -ny; nz = -nz; }
    let part = this.parts.get(mat); if (!part) this.parts.set(mat, part = { p: [], n: [], uv: [] });
    const [su, sv] = mat.userData.tile || [1, 1], p0 = pts[0];
    // u along the first edge (or the bottom edge when the polygon was reversed), v up the face
    let ux = pts[1][0] - p0[0], uy = pts[1][1] - p0[1], uz = pts[1][2] - p0[2]; const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
    const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
    const uv = p => [((p[0] - p0[0]) * ux + (p[1] - p0[1]) * uy + (p[2] - p0[2]) * uz) / su, ((p[0] - p0[0]) * vx + (p[1] - p0[1]) * vy + (p[2] - p0[2]) * vz) / sv];
    for (let i = 1; i + 1 < pts.length; i++) for (const p of [p0, pts[i], pts[i + 1]]) { part.p.push(...p); part.n.push(nx, ny, nz); part.uv.push(...uv(p)); }
  }
  /** a box (no bottom) */
  box(mat, x0, x1, y0, y1, z0, z1) {
    this.poly(mat, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]);
    this.poly(mat, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1]);
    this.poly(mat, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0]);
    this.poly(mat, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0]);
    this.poly(mat, [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [0, 1, 0]);
  }
  meshes(parent, { shadow = true } = {}) {
    for (const [mat, d] of this.parts) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(d.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(d.n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2));
      const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = shadow; parent.add(m);
    }
  }
}
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .85, ...o });
const tiled = (m, su, sv) => { m.userData.tile = [su, sv]; return m; };
const geoAt = (g, x = 0, y = 0, z = 0) => g.translate(x, y, z);

export function buildChurch(scene, site) {
  const S = site.main, [ex, ez] = S.E, sx = -ez, sz = ex;   // front (east) and south, as world directions
  const toWorld = (a, b) => [S.cx + a * ex + b * sx, S.cz + a * ez + b * sz];
  // the ground: the building stands on its lowest corner; its floor is level with the highest
  let gmin = Infinity, gmax = -Infinity;
  for (let a = AB; a <= AF + .01; a += 4) for (let b = -18; b <= 18.01; b += 4) { const [x, z] = toWorld(a, b), y = groundAt(x, z); gmin = Math.min(gmin, y); gmax = Math.max(gmax, y); }
  const FL = Math.min(2.5, gmax - gmin) + .15;
  const bld = new THREE.Group(); bld.name = 'Crossroads Church';
  bld.position.set(S.cx, gmin, S.cz); bld.rotation.y = Math.atan2(-ez, ex);
  bld.userData.terrain = 'done'; scene.add(bld);
  buildOutside(bld, FL, toWorld, gmin);
  if (site.pavilion) scene.add(pavilion(site.pavilion));

  // ---- the sanctuary ----
  const hall = new THREE.Group(); hall.position.set(-10, FL, BC); hall.rotation.y = Math.PI / 2; bld.add(hall);
  const inside = buildInside(hall);
  hall.visible = false;

  // the view: from the back of the room, over the sound desk, at the stage
  bld.updateMatrixWorld(true);
  const W = (x, y, z) => hall.localToWorld(new THREE.Vector3(x, y, z));
  const view = { id: 'church', name: 'Take me to church', pos: W(0, 6.2, 20.4), target: W(0, 2.6, -14), near: 3, abs: true };

  const local = new THREE.Vector3(), hi = new THREE.Vector3(HX - .6, CEV - .4, Z1 - .5);
  const lo = [new THREE.Vector3(-HX + .6, .7, Z0 + 9.6), new THREE.Vector3(-HX + .6, .3, Z0 + 1)];   // the camera stays off the stage; what it looks at need not
  let held = false, t = 0;
  function update(dt, camera) {
    t += dt;
    local.copy(camera.position); bld.worldToLocal(local);
    // the room is drawn only from inside the building
    const inBld = local.x > AB - .2 && local.x < AF + .2 && local.z > -18.5 && local.z < 18.5 && local.y < FL + PK;
    hall.visible = inBld;
    if (inBld) inside.update(dt, t, camera);
  }
  /** keep the free camera (and what it orbits) inside the sanctuary, once the view has arrived */
  function clamp(camera, target) {
    if (!held) return;
    [camera.position, target].forEach((v, k) => { hall.worldToLocal(v); v.clamp(lo[k], hi); hall.localToWorld(v); });
  }
  return { view, update, clamp, hold() { held = true; }, release() { held = false; }, indoors: () => hall.visible };
}

// ---- outside ---------------------------------------------------------------------------------------
function buildOutside(bld, FL, toWorld, gmin) {
  const sh = new Shell(), Y0 = -.8;
  const brick = tiled(std('#ffffff', { map: brickTex() }), 2, 1);
  const siding = tiled(std('#f3ead2', { map: ribTex('#ffffff', '#ddd5c4'), roughness: .7 }), .6, 1);
  const roof = tiled(std('#4b3d35', { map: ribTex('#ffffff', '#b9b0aa'), roughness: .6, metalness: .2 }), .5, 1);
  const trim = std('#f2efe6'), soffit = std('#d9d2c2'), white = std('#f7f6f1', { roughness: .5 });
  const z0 = BC - HW, z1 = BC + HW, top = y => FL + y;
  // gable ends: brick below, siding up to the eaves and the ridge
  for (const [a, s] of [[AF, 1], [AB, -1]]) {
    sh.poly(brick, [[a, Y0, z1], [a, Y0, z0], [a, top(BR), z0], [a, top(BR), z1]], [s, 0, 0]);
    sh.poly(siding, [[a, top(BR), z1], [a, top(BR), z0], [a, top(EV), z0], [a, top(PK), BC], [a, top(EV), z1]], [s, 0, 0]);
    // the white rake boards along the roof
    for (const [zA, zB] of [[z0 - .6, BC], [z1 + .6, BC]]) {
      const yA = top(EV) - .6 * (PK - EV) / HW - .15, yB = top(PK) + .05;
      sh.poly(trim, [[a + s * .62, yA, zA], [a + s * .62, yB, zB], [a + s * .62, yB - .45, zB], [a + s * .62, yA - .45, zA]], [s, 0, 0]);
    }
  }
  // side walls
  for (const [z, s] of [[z0, -1], [z1, 1]]) {
    sh.poly(brick, [[AB, Y0, z], [AF, Y0, z], [AF, top(BR), z], [AB, top(BR), z]], [0, 0, s]);
    sh.poly(siding, [[AB, top(BR), z], [AF, top(BR), z], [AF, top(EV), z], [AB, top(EV), z]], [0, 0, s]);
  }
  // the roof, with its overhang and soffits
  const o = .6, ye = top(EV) - o * (PK - EV) / HW;
  for (const [z, s] of [[z0 - o, -1], [z1 + o, 1]]) {
    sh.poly(roof, [[AB - o, ye, z], [AF + o, ye, z], [AF + o, top(PK), BC], [AB - o, top(PK), BC]], [0, 1, s * .3]);
    sh.poly(soffit, [[AB - o, ye, z], [AF + o, ye, z], [AF + o, top(EV), z + s * -o], [AB - o, top(EV), z + s * -o]], [0, -1, 0]);
    sh.poly(trim, [[AB - o, ye - .3, z], [AF + o, ye - .3, z], [AF + o, ye, z], [AB - o, ye, z]], [0, 0, s]);   // fascia
  }
  // the south wing: brick and siding under a low shed roof
  const [w0, w1, wf] = WING, wy = top(4.4), wr = top(5.4);
  sh.poly(brick, [[AB, Y0, w1], [wf, Y0, w1], [wf, top(BR), w1], [AB, top(BR), w1]], [0, 0, 1]);
  sh.poly(siding, [[AB, top(BR), w1], [wf, top(BR), w1], [wf, wy, w1], [AB, wy, w1]], [0, 0, 1]);
  for (const [a, s] of [[wf, 1], [AB, -1]]) {
    sh.poly(brick, [[a, Y0, w0], [a, Y0, w1], [a, top(BR), w1], [a, top(BR), w0]], [s, 0, 0]);
    sh.poly(siding, [[a, top(BR), w0], [a, top(BR), w1], [a, wy, w1], [a, wr, w0]], [s, 0, 0]);
  }
  sh.poly(roof, [[AB - .4, wy - .1, w1 + .5], [wf + .4, wy - .1, w1 + .5], [wf + .4, wr + .1, w0], [AB - .4, wr + .1, w0]], [0, 1, .2]);
  // the steeple: a white tower on the ridge near the front, and its spire
  const ta = AF - 3, tw = 1.6, tb = top(PK) + 3.6;
  sh.box(white, ta - tw, ta + tw, top(PK) - 1.6, tb, BC - tw, BC + tw);
  sh.box(trim, ta - tw - .15, ta + tw + .15, tb, tb + .35, BC - tw - .15, BC + tw + .15);
  sh.box(white, ta - tw + .25, ta + tw - .25, tb + .35, tb + 2.2, BC - tw + .25, BC + tw - .25);
  const sp = tb + 2.2, tip = sp + 13.5, r = tw - .35;
  for (const [aA, bA, aB, bB] of [[-1, 1, 1, 1], [1, 1, 1, -1], [1, -1, -1, -1], [-1, -1, -1, 1]])
    sh.poly(white, [[ta + aA * r, sp, BC + bA * r], [ta + aB * r, sp, BC + bB * r], [ta, tip, BC]], [aA + aB, .25, bA + bB]);
  // door hoods and the step along the front
  const doors = [BC + HW - 1.8, BC + HW - 8.2, BC - HW + 2.6];
  for (const b of doors) sh.box(trim, AF, AF + .5, top(2.6), top(2.75), b - 1.3, b + 1.3);
  sh.box(std('#a7a196'), AF, AF + 2.2, Y0, FL, BC - HW, BC + HW);
  sh.meshes(bld);

  // planes on the front: the windows, the sign and the doors (a plane faces +z; turned to face east, its +x is north)
  const front = (mat, w, h, b, y, d = .04) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(AF + d, y, b); m.rotation.y = Math.PI / 2; m.receiveShadow = true; bld.add(m); return m; };
  front(std('#ffffff', { map: windowTex(true), roughness: .25, metalness: .3 }), 5.2, 7.6, BC, top(7.4));
  const side = std('#ffffff', { map: windowTex(false), roughness: .25, metalness: .3 });
  front(side, 3.2, 3.8, BC + 8.2, top(6)); front(side, 3.2, 3.8, BC - 8.2, top(6));
  front(new THREE.MeshStandardMaterial({ map: signTex(), transparent: true, alphaTest: .4, roughness: .5 }), 7.6, 1.2, BC - 7, top(9.1), .06);
  const doorMat = std('#5a3a2c', { roughness: .6 });
  for (const b of doors) {
    front(doorMat, 2.1, 2.5, b, FL + 1.25);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(.18, .35, .18), new THREE.MeshStandardMaterial({ color: '#fff7e0', emissive: '#fff1c8', emissiveIntensity: .6 })); lamp.position.set(AF + .1, top(3), b + 1.5); bld.add(lamp);
  }
  // evergreens along the front, between the doors
  const tree = mergeGeometries([geoAt(new THREE.CylinderGeometry(.12, .15, .8, 6), 0, .4, 0), geoAt(new THREE.ConeGeometry(1, 1, 9), 0, 1.3, 0).scale(1, 1, 1)].map(g => g.toNonIndexed()));
  const treeMat = new THREE.MeshStandardMaterial({ color: '#2f4a2c', roughness: .95, vertexColors: false });
  for (const [b, h] of [[BC + HW - 5, 5.5], [BC + 4.4, 6.5], [BC - 4.4, 6], [BC - HW + 6.2, 5], [BC - HW + .4, 4.2], [BC + HW + 1.5, 3.4]]) {
    const m = new THREE.Mesh(tree, treeMat); m.scale.set(h * .24, h / 1.8, h * .24); m.position.set(AF + 1.3, FL, b); m.castShadow = true; bld.add(m);
  }

  // the parking lot in front, following the ground
  const L = { a0: AF + 2.2, a1: AF + 48, b0: -30, b1: 28, stall0: AF + 9 };
  L.rows = []; L.islands = []; L.arrows = [];
  { let b = L.b0 + 1; for (let k = 0; k < 3 && b + 18 < L.b1; k++) { L.rows.push([b, b + 5.5, k === 1], [b + 12, b + 17.5, k === 1]); L.arrows.push(b + 8.75); if (k < 2) L.islands.push(b + 18.5); b += 19; } }
  const nA = 24, nB = 28, pos = [], uv = [], idx = [];
  for (let i = 0; i <= nA; i++) for (let k = 0; k <= nB; k++) {
    const a = L.a0 + (L.a1 - L.a0) * i / nA, b = L.b0 + (L.b1 - L.b0) * k / nB, [x, z] = toWorld(a, b);
    pos.push(a, Math.max(groundAt(x, z) - gmin, 0) + .32, b); uv.push(k / nB, i / nA);
  }
  for (let i = 0; i < nA; i++) for (let k = 0; k < nB; k++) { const p = i * (nB + 1) + k; idx.push(p, p + 1, p + nB + 1, p + 1, p + nB + 2, p + nB + 1); }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); lg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); lg.setIndex(idx); lg.computeVertexNormals();
  const lot = new THREE.Mesh(lg, new THREE.MeshStandardMaterial({ map: lotTex(L), roughness: .95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  lot.receiveShadow = true; bld.add(lot);
  // light poles on the islands
  const poleG = mergeGeometries([geoAt(new THREE.CylinderGeometry(.35, .35, .8, 8), 0, .4, 0), geoAt(new THREE.CylinderGeometry(.09, .11, 8, 6), 0, 4.4, 0), geoAt(new THREE.BoxGeometry(.5, .22, 1.1), 0, 8.4, .3)]);
  const poleM = std('#55575a', { metalness: .4, roughness: .5 });
  for (const b of L.islands) for (const a of [L.stall0 + 8, L.stall0 + 26]) {
    const [x, z] = toWorld(a, b), m = new THREE.Mesh(poleG, poleM); m.position.set(a, groundAt(x, z) - gmin, b); m.castShadow = true; bld.add(m);
  }
}

/** the picnic pavilion: timber posts and trusses under a dark shingle gable, picnic tables */
function pavilion(r) {
  const g = new THREE.Group(), y = Math.min(...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, k]) => groundAt(r.cx + i * r.w / 2, r.cz + k * r.d / 2)));
  g.position.set(r.cx, y, r.cz); g.rotation.y = Math.atan2(Math.cos(r.ang), Math.sin(r.ang)); g.userData.terrain = 'done';
  const sh = new Shell(), wood = std('#7a5536'), shingle = std('#3a3533'), W = r.w / 2, D = r.d / 2, E = 3, P = 5.4;
  for (let x = -W + .3; x <= W - .29; x += (2 * W - .6) / 3) for (const z of [-D + .3, D - .3]) sh.box(wood, x - .15, x + .15, -.3, E, z - .15, z + .15);
  for (const z of [-D + .3, D - .3]) sh.box(wood, -W, W, E - .35, E, z - .15, z + .15);
  for (let x = -W + .3; x <= W - .29; x += (2 * W - .6) / 3) for (const s of [-1, 1]) sh.poly(wood, [[x - .1, E, s * (D - .2)], [x + .1, E, s * (D - .2)], [x + .1, P - .3, 0], [x - .1, P - .3, 0]], [1, 0, 0]);
  for (const s of [-1, 1]) sh.poly(shingle, [[-W - .4, E - .2, s * (D + .6)], [W + .4, E - .2, s * (D + .6)], [W + .4, P, 0], [-W - .4, P, 0]], [0, 1, s]);
  for (const s of [-1, 1]) sh.poly(shingle, [[-W - .4, E - .25, s * (D + .6)], [W + .4, E - .25, s * (D + .6)], [W + .4, P - .05, 0], [-W - .4, P - .05, 0]], [0, -1, 0]);
  const top = std('#8a6a4a'), seat = top;
  for (let k = -1; k <= 1; k++) {
    const x = k * W * .6;
    sh.box(top, x - .9, x + .9, .72, .78, -.4, .4); sh.box(seat, x - .9, x + .9, .42, .46, -.75, -.5); sh.box(seat, x - .9, x + .9, .42, .46, .5, .75);
    for (const s of [-1, 1]) sh.box(wood, x + s * .7 - .05, x + s * .7 + .05, 0, .72, -.6, .6);
  }
  sh.meshes(g); return g;
}

// ---- inside -----------------------------------------------------------------------------------------
function buildInside(hall) {
  const MC = { room: matcapTex(.55, .12, '#3a2a55', '#1d3a66'), stage: matcapTex(.75, .14, '#ff3fb0', '#3f7bff'), crowd: matcapTex(.42, .06, '#ff4fa8', '#4a8cff') };
  const mcs = new Map(), flashMats = [];
  const mc = (kind, color) => { const k = kind + color; let m = mcs.get(k); if (!m) { mcs.set(k, m = new THREE.MeshMatcapMaterial({ matcap: MC[kind], color })); m.userData.base = m.color.clone(); flashMats.push(m); } return m; };
  const matcapify = (root, kind) => root.traverse(o => { if (o.isMesh) { o.material = mc(kind, '#' + o.material.color.getHexString()); o.castShadow = o.receiveShadow = false; } });
  const add = (g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); hall.add(o); return o; };
  const additive = (c, o = {}) => new THREE.MeshBasicMaterial({ color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, ...o });
  const glow = glowTex();

  // the room: floor, walls, black ceiling, steel trusses
  const sh = new Shell();
  const floor = mc('room', '#6b5a48'), wall = mc('room', '#2b2a31'), black = mc('room', '#0f0e13'), steel = mc('room', '#1d1d24');
  sh.poly(floor, [[-HX, 0, Z0], [HX, 0, Z0], [HX, 0, Z1], [-HX, 0, Z1]], [0, 1, 0]);
  for (const s of [-1, 1]) {
    sh.poly(wall, [[s * HX, 0, Z0], [s * HX, 0, Z1], [s * HX, CEV, Z1], [s * HX, CEV, Z0]], [-s, 0, 0]);
    sh.poly(black, [[s * HX, CEV, Z0], [s * HX, CEV, Z1], [0, CPK, Z1], [0, CPK, Z0]], [-s * .3, -1, 0]);
  }
  sh.poly(black, [[-HX, 0, Z0], [HX, 0, Z0], [HX, CEV, Z0], [0, CPK, Z0], [-HX, CEV, Z0]], [0, 0, 1]);
  sh.poly(wall, [[-HX, 0, Z1], [HX, 0, Z1], [HX, CEV, Z1], [0, CPK, Z1], [-HX, CEV, Z1]], [0, 0, -1]);
  for (let z = Z0 + 4; z < Z1; z += 5) for (const s of [-1, 1]) {   // a truss: a steel beam up each slope, a tie
    const yA = CEV - .5, yB = CPK - .45;
    sh.poly(steel, [[s * HX, yA, z - .15], [0, yB, z - .15], [0, yB + .45, z - .15], [s * HX, yA + .45, z - .15]], [0, 0, 1]);
    sh.poly(steel, [[s * HX, yA, z + .15], [0, yB, z + .15], [0, yB + .45, z + .15], [s * HX, yA + .45, z + .15]], [0, 0, -1]);
    sh.poly(steel, [[s * HX, yA, z - .15], [0, yB, z - .15], [0, yB, z + .15], [s * HX, yA, z + .15]], [0, -1, 0]);
  }
  // the stage: black, a blue LED strip along its front
  sh.box(mc('room', '#16141b'), -HX, HX, 0, STAGE.y, Z0, STAGE.z);
  sh.box(mc('room', '#1b1a22'), -1.6, 1.6, 0, .5, STAGE.z, STAGE.z + .9);   // the step down at the middle
  // the sound desk at the back, with its monitors
  sh.box(mc('room', '#3a3026'), -3.2, 3.2, 0, 1.05, 11, 12.4);
  sh.box(mc('room', '#111114'), -2.6, -.6, 1.05, 1.75, 11.3, 11.4); sh.box(mc('room', '#111114'), .6, 2.6, 1.05, 1.75, 11.3, 11.4);
  sh.meshes(hall, { shadow: false });
  add(new THREE.BoxGeometry(2 * HX, .08, .06), additive('#2f7bff', { opacity: .9 }), 0, STAGE.y - .1, STAGE.z + .03);
  for (const x of [-1.6, 1.6]) { const s = add(new THREE.PlaneGeometry(1.9, .62), new THREE.MeshBasicMaterial({ color: '#3e6fa8' }), x, 1.4, 11.42); s.rotation.y = Math.PI; }
  add(new THREE.CylinderGeometry(.06, .045, .17, 10), mc('stage', '#f5e04a'), 2.9, 1.14, 11.6);
  add(new THREE.CylinderGeometry(.006, .006, .2, 4), mc('stage', '#3fbf4a'), 2.92, 1.28, 11.6).rotation.z = .3;
  // house lights and the exit sign
  for (const z of [-6, 4, 14]) for (const s of [-1, 1]) { const p = add(new THREE.PlaneGeometry(1.6, .5), new THREE.MeshBasicMaterial({ color: '#c9d6e8' }), s * 7, CEV + 2.1 - .05, z); p.rotation.x = Math.PI / 2; p.rotation.y = s * .32; }
  add(new THREE.BoxGeometry(.1, .3, .7), new THREE.MeshBasicMaterial({ color: '#ff2a2a' }), HX - .06, 3.2, 14);
  // two projectors hanging from the ceiling
  for (const s of [-1, 1]) { add(new THREE.BoxGeometry(.7, .35, .8), black, s * 5, 9.6, 3); add(new THREE.CylinderGeometry(.007, .007, 1.6, 4), steel, s * 5, 10.5, 3); add(new THREE.PlaneGeometry(.35, .18), new THREE.MeshBasicMaterial({ color: '#7ff0ff' }), s * 5, 9.6, 2.59).rotation.y = Math.PI; }

  // ---- the stage backdrop: the scalloped arch, the screens, hexagons, birch trees, the drum cage
  const slides = slideDeck();
  add(new THREE.CircleGeometry(4.3, 48), new THREE.MeshBasicMaterial({ map: slides.square, color: '#d8cdf0' }), 0, 5.6, Z0 + .08);
  const bumpG = new THREE.SphereGeometry(.78, 12, 8), bumpM = mc('room', '#1a1424');
  for (let k = 0; k < 26; k++) { const a = k / 26 * TAU; add(bumpG, bumpM, Math.cos(a) * 4.75, 5.6 + Math.sin(a) * 4.75, Z0 + .3).scale.z = .5; }
  const screens = [];
  for (const s of [-1, 1]) {
    const sc = add(new THREE.PlaneGeometry(7.2, 4.05), new THREE.MeshBasicMaterial({ map: slides.wide }), s * 9.6, 6.1, -15.2);
    sc.rotation.y = -s * .22; screens.push(sc);
    const bar = add(new THREE.BoxGeometry(7.8, .14, .14), mc('room', '#d9d9d9'), s * 9.6, 8.2, -15.2); bar.rotation.y = -s * .22;
  }
  // coral hexagons either side of the arch, some with a light in the middle
  const hexG = new THREE.CircleGeometry(.6, 6); hexG.rotateZ(Math.PI / 6);
  const hexPos = [];
  for (const s of [-1, 1]) for (let c = 0; c < 6; c++) for (let r = 0; r < 4; r++) {
    const x = s * (5.6 + c * 1.04), y = STAGE.y + 1 + r * 1.2 + (c % 2) * .6;
    if (hash(c * 7 + r + s * 3) < .2 || y > CEV - 1.2) continue;
    hexPos.push([x, y]);
  }
  const hexes = new THREE.InstancedMesh(hexG, new THREE.MeshBasicMaterial({ color: '#ffffff' }), hexPos.length);
  const HEX = ['#ff7f6a', '#ff9a8a', '#f2685e', '#ffb1a1', '#ff5f7a'].map(c => new THREE.Color(c)), hexBase = [];
  const dm = new THREE.Object3D();
  hexPos.forEach(([x, y], i) => { dm.position.set(x, y, Z0 + .06); dm.updateMatrix(); hexes.setMatrixAt(i, dm.matrix); hexBase.push(HEX[Math.floor(hash(i * 3.3) * HEX.length)]); hexes.setColorAt(i, hexBase[i]); });
  hall.add(hexes);
  const fairy = [];   // fairy-light points: on the hexagons, and wound round the birch trees
  hexPos.forEach(([x, y], i) => { if (hash(i + .5) < .5) fairy.push(x, y, Z0 + .1); });
  for (const [x, z] of [[-4.6, -19.6], [-13, -18.4], [4.6, -19.6], [13, -18.4], [-7.3, -20.8], [7.3, -20.8]]) {
    const parts = [];
    const limb = (x0, y0, x1, y1, r) => { const L = Math.hypot(x1 - x0, y1 - y0), g = new THREE.CylinderGeometry(r * .7, r, L, 6); g.translate(0, L / 2, 0); g.rotateZ(-Math.atan2(x1 - x0, y1 - y0)); g.translate(x0, y0, 0); parts.push(g); for (let k = 0; k < 14; k++) { const u = (k + hash(k + x) * .8) / 14; fairy.push(x + x0 + (x1 - x0) * u + (hash(k * 3 + z) - .5) * .3, STAGE.y + y0 + (y1 - y0) * u, z + (hash(k * 5 + x) - .5) * .3); } };
    limb(0, 0, (hash(x) - .5) * .4, 4.2, .09);
    for (let k = 0; k < 6; k++) { const y0 = 1.4 + k * .45, s = k % 2 ? 1 : -1; limb(0, y0, s * (.7 + hash(k + z) * .9), y0 + 1 + hash(k * 2 + x) * .9, .035); }
    add(mergeGeometries(parts), mc('stage', '#efeae6'), x, STAGE.y, z);
  }
  // the drum cage (clear panels) with its kit, stage right
  add(new THREE.CylinderGeometry(1.7, 1.7, 1.7, 8, 1, true, -Math.PI * .55, Math.PI * 1.1), new THREE.MeshBasicMaterial({ color: '#9fb6d6', transparent: true, opacity: .16, side: THREE.DoubleSide, depthWrite: false }), 9.6, STAGE.y + .85, -18.6);
  const drums = new THREE.Group(); drums.position.set(9.6, STAGE.y, -18.9); hall.add(drums);
  const shell = mc('stage', '#7a1220'), chrome = mc('stage', '#c8ccd2');
  const drum = (r, h, x, y, z, rx = 0) => { const d = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), shell); d.position.set(x, y, z); d.rotation.x = rx; drums.add(d); };
  drum(.33, .5, 0, .35, .4, Math.PI / 2); drum(.18, .14, -.45, .75, .1); drum(.2, .14, .45, .75, .1); drum(.26, .4, .7, .4, -.2);
  for (const [x, y] of [[-.8, 1.1], [.95, 1.2]]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .015, 16), mc('stage', '#d6b45a')); c.position.set(x, y, .1); drums.add(c); const st = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, y, 4), chrome); st.position.set(x, y / 2, .1); drums.add(st); }

  // ---- the band
  const band = [];
  const player = (colors, x, z, ry, kind) => {
    const F = makeFigure(colors); matcapify(F.root, 'stage');
    F.root.position.set(x, STAGE.y, z); F.root.rotation.y = ry; hall.add(F.root);
    if (kind === 'guitar') { const g = new THREE.Mesh(new THREE.BoxGeometry(.36, .5, .08), mc('stage', colors.inst || '#8a4a22')); g.position.set(0, .2, .2); g.rotation.z = .9; F.pelvis.add(g); const n = new THREE.Mesh(new THREE.BoxGeometry(.05, .6, .04), mc('stage', '#2a1a10')); n.position.set(-.35, .45, .22); n.rotation.z = .9; F.pelvis.add(n); F.shL.rotation.x = -.9; F.shR.rotation.x = -.4; F.elR.rotation.x = -.9; F.elL.rotation.x = -1; }
    if (kind === 'keys') { const k = add(new THREE.BoxGeometry(1.3, .1, .4), mc('stage', '#141418'), x, STAGE.y + .95, z + .55); k.rotation.y = ry; add(new THREE.BoxGeometry(.04, .9, .04), chrome, x, STAGE.y + .45, z + .55); F.shL.rotation.x = F.shR.rotation.x = -.7; F.elL.rotation.x = F.elR.rotation.x = -.6; }
    if (kind === 'sing') { F.shR.rotation.x = -1.9; F.elR.rotation.x = -1.7; const mic = new THREE.Mesh(new THREE.CylinderGeometry(.02, .015, .18, 6), mc('stage', '#222')); mic.position.set(0, -.3, .06); F.elR.add(mic); }
    if (kind === 'drums') { F.hipL.rotation.x = F.hipR.rotation.x = -1.5; F.kneeL.rotation.x = F.kneeR.rotation.x = 1.5; F.root.position.y -= .35; F.shL.rotation.x = F.shR.rotation.x = -.8; }
    if (kind !== 'drums' && kind !== 'keys') add(new THREE.CylinderGeometry(.012, .012, 1.5, 4), chrome, x + Math.sin(ry) * .4, STAGE.y + .75, z + .4);
    band.push({ F, kind, ph: hash(x * 9) * TAU });
  };
  player({ shirt: '#3a5a8a', shorts: '#23262e', skin: '#d1a184', hair: '#4a3020' }, -9.4, -17.2, .25, 'guitar');
  player({ shirt: '#c43a3a', shorts: '#2a2c34', skin: '#e2b896', hair: '#1c1612', inst: '#d8b46a' }, -4.6, -16.4, .1, 'guitar');
  player({ shirt: '#f2efe8', shorts: '#1f2430', skin: '#a8704e', hair: '#141010' }, 0, -14.6, 0, 'sing');
  player({ shirt: '#e88a3a', shorts: '#2b2f3a', skin: '#e0b090', hair: '#7a4a2a' }, 3.4, -16.6, -.08, 'keys');
  player({ shirt: '#2b2b30', shorts: '#30343e', skin: '#c99370', hair: '#2a1d16', inst: '#222' }, 6.4, -17, -.2, 'guitar');
  player({ shirt: '#5a8a5a', shorts: '#23262e', skin: '#e0b090', hair: '#c9a05a' }, 9.6, -19.4, 0, 'drums');
  // the clear pulpit, waiting for the preacher to come down
  add(new THREE.BoxGeometry(.7, 1.15, .5), new THREE.MeshBasicMaterial({ color: '#cfe6ff', transparent: true, opacity: .22, depthWrite: false }), 2, STAGE.y + .58, -14.2);

  // ---- chairs and the congregation
  const seats = [];
  for (let r = 0; r < ROWS; r++) {
    const z = ROW0 + .5 + r * PITCH;
    for (let k = 0; k < 14; k++) seats.push([-MID + SEAT / 2 + k * SEAT, z, r]);
    for (const s of [-1, 1]) for (let k = 0; k < SIDE; k++) seats.push([s * (MID + AISLE + SEAT / 2 + k * SEAT), z, r]);
  }
  const chairG = mergeGeometries([geoAt(new THREE.BoxGeometry(.48, .09, .44), 0, .44, 0), geoAt(new THREE.BoxGeometry(.48, .52, .07), 0, .74, .2), ...[[-.2, -.18], [.2, -.18], [-.2, .18], [.2, .18]].map(([x, z]) => geoAt(new THREE.BoxGeometry(.03, .42, .03), x, .21, z))]);
  const chairs = new THREE.InstancedMesh(chairG, mc('room', '#36405a'), seats.length);
  seats.forEach(([x, z], i) => { dm.position.set(x, 0, z); dm.rotation.set(0, 0, 0); dm.updateMatrix(); chairs.setMatrixAt(i, dm.matrix); });
  hall.add(chairs);
  const people = seats.filter(([x, , r]) => hash(x * 13.7 + r * 7.1) < .82 - r * .012).map(([x, z, r], i) => ({ i, x: x + (hash(i * 1.7) - .5) * .08, z: z - .38, r, s: .88 + hash(i * 2.3) * .2, up: hash(i * 5.1) < .22, ph: hash(i * 3.9) * TAU, yaw: (hash(i * 8.3) - .5) * .4 }));
  const crowd = crowdMeshes(people, mc);
  crowd.forEach(m => hall.add(m));

  // ---- lights: string lights in swags, moving heads and strobes on a truss over the stage front, uplights
  const bulbs = [];
  const swag = (x0, y0, z0, x1, y1, z1, sag, n) => { for (let i = 0; i <= n; i++) { const u = i / n; bulbs.push(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u - sag * 4 * u * (1 - u), z0 + (z1 - z0) * u); } };
  for (const s of [-1, 1]) for (let z = -14; z < 20; z += 5.5) swag(s * 11.5, 9, z, s * 11.5, 9, z + 5.5, 1.3, 16);   // down each side
  for (const z of [-11.5, -1, 9]) for (const s of [-1, 1]) swag(s * 11.5, 9, z, 0, 11.6, z + (s < 0 ? 3 : -3), 1.6, 24);   // swagged up to the ridge
  const pts = (arr, size, color, opacity = 1) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); const m = new THREE.Points(g, new THREE.PointsMaterial({ color, size, map: glow, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false })); hall.add(m); return m; };
  const bulbPts = pts(bulbs, .42, '#ffcf7a'), fairyPts = pts(fairy, .2, '#fff4dc');
  add(new THREE.BoxGeometry(27, .45, .45), mc('room', '#2a2a30'), 0, 8.6, -13.6);   // the truss
  const beamG = new THREE.ConeGeometry(1, 1, 20, 1, true); beamG.translate(0, -.5, 0); beamG.rotateX(-Math.PI / 2);
  const beamA = beamTex(), poolG = new THREE.CircleGeometry(1, 24); poolG.rotateX(-Math.PI / 2);
  const COLORS = ['#ff2a4d', '#ff38c8', '#2f62ff', '#25c8ff', '#9a3cff', '#ff2a4d', '#2f62ff', '#ff38c8'].map(c => new THREE.Color(c));
  const heads = [];
  for (let k = 0; k < 8; k++) {
    const x = -10.5 + k * 3;
    add(new THREE.BoxGeometry(.4, .45, .4), mc('room', '#141418'), x, 8.1, -13.6);
    const beam = add(beamG, additive('#ffffff', { alphaMap: beamA, opacity: .32 }), x, 7.95, -13.6);
    const pool = add(poolG, additive('#ffffff', { map: glow, opacity: .35 }), x, .03, 0);
    heads.push({ x, beam, pool, k, c: COLORS[k], ph: hash(k * 4.4) * TAU });
  }
  const ups = [];
  for (const [x, z, lean] of [[-12.6, -16, -.3], [-7.2, -20.6, -.15], [7.2, -20.6, .15], [12.6, -16, .3]]) {
    const beam = add(beamG, additive('#2a6bff', { alphaMap: beamA, opacity: .38 }), x, STAGE.y + .2, z);
    ups.push({ beam, lean, ph: hash(x) * TAU });
  }
  const strobeM = new THREE.MeshBasicMaterial({ color: '#ffffff' }), strobes = [];
  for (const x of [-12.5, -7.5, -1.5, 1.5, 7.5, 12.5]) strobes.push(add(new THREE.BoxGeometry(.5, .18, .2), strobeM, x, 8.3, -13.35));

  // ---- the motorcycle going round the middle block, and the preacher on his tether
  const bike = motorcycle(mc); hall.add(bike.root);
  const path = loopPath();
  const preacher = flyingPreacher(mc, matcapify); hall.add(preacher.root);
  const hub = new THREE.Group(); hub.position.set(0, FLY.hub, FLY.z); hall.add(hub);
  hub.add(new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, CPK - FLY.hub, 6), steel).translateY((CPK - FLY.hub) / 2));
  hub.add(new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, .4, 12), mc('room', '#3a3a44')));
  const boom = new THREE.Mesh(new THREE.BoxGeometry(FLY.arm, .22, .22), mc('room', '#c8c8cc')); boom.position.x = FLY.arm / 2; hub.add(boom);
  const cable = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#d8d8d8' }));
  cable.frustumCulled = false; hall.add(cable);
  const bubble = speechBubble(); hall.add(bubble.sprite);

  // ---- every frame
  const tgt = new THREE.Vector3(), dir = new THREE.Vector3(), Zv = new THREE.Vector3(0, 0, 1), white = new THREE.Color('#ffffff'), tmpC = new THREE.Color();
  let slideT = 0, strobeAt = 3, flash = 0, s = 0;
  function update(dt, t) {
    const beat = t * BPM / 60, pulse = Math.pow(1 - (beat % 1), 3);
    // strobes: a burst every few seconds
    let burst = false;
    if (t > strobeAt) { burst = Math.floor((t - strobeAt) * 16) % 2 === 0; if (t > strobeAt + .7) strobeAt = t + 4 + hash(Math.floor(t)) * 5; }
    flash = burst ? 1 : Math.max(0, flash - dt * 6);
    strobeM.color.setScalar(.25 + flash * 3);
    for (const m of flashMats) m.color.copy(m.userData.base).multiplyScalar(1 + flash * 1.6 + pulse * .08);
    // moving heads sweep over the room; their colours drift round the palette
    for (const h of heads) {
      const sw = t * .45 + h.ph;
      tgt.set(h.x * .7 + Math.sin(sw) * 6, 0, -4 + Math.sin(sw * .73 + h.k) * 7.5);
      dir.subVectors(tgt, h.beam.position); const L = dir.length(); dir.divideScalar(L);
      h.beam.quaternion.setFromUnitVectors(Zv, dir); h.beam.scale.set(L * .07, L * .07, L);
      tmpC.copy(COLORS[(h.k + Math.floor(t / 8)) % COLORS.length]);
      h.beam.material.color.copy(burst ? white : tmpC); h.beam.material.opacity = burst ? .55 : .26 + pulse * .12;
      h.pool.position.set(tgt.x, .04, tgt.z); h.pool.scale.setScalar(L * .07 * 1.1); h.pool.material.color.copy(h.beam.material.color); h.pool.material.opacity = burst ? .6 : .3;
    }
    for (const u of ups) {
      dir.set(u.lean + Math.sin(t * .6 + u.ph) * .35, 1, .5 + Math.sin(t * .4 + u.ph) * .3).normalize();
      u.beam.quaternion.setFromUnitVectors(Zv, dir); u.beam.scale.set(.9, .9, 13);
      u.beam.material.opacity = .26 + pulse * .2;
    }
    hexes.instanceColor && hexPos.forEach((_, i) => { hexes.setColorAt(i, tmpC.copy(hexBase[i]).multiplyScalar(.8 + .35 * Math.sin(beat * Math.PI + i))); });
    hexes.instanceColor.needsUpdate = true;
    bulbPts.material.opacity = .85 + .15 * Math.sin(t * 3.1); fairyPts.material.opacity = .7 + .3 * Math.sin(t * 5.3);
    // the slides
    slideT += dt; if (slideT > 8) { slideT = 0; slides.next(); }
    // the band and the congregation move with the music
    for (const b of band) {
      if (b.kind === 'drums') { b.F.shL.rotation.x = -.8 - .5 * Math.max(0, Math.sin(beat * TAU)); b.F.shR.rotation.x = -.8 - .5 * Math.max(0, Math.sin(beat * TAU + Math.PI)); continue; }
      b.F.pelvis.rotation.z = Math.sin(beat * Math.PI + b.ph) * .05; b.F.chest.rotation.y = Math.sin(beat * Math.PI * .5 + b.ph) * .12;
      if (b.kind === 'keys') { b.F.elL.rotation.x = -.6 - .15 * Math.sin(beat * TAU); b.F.elR.rotation.x = -.6 - .15 * Math.sin(beat * TAU + 1); }
    }
    crowd.sway(beat);
    // the bike, slowly round the loop
    s = (s + LOOP.speed * dt) % path.length;
    bike.place(path, s, LOOP.speed, dt);
    // the preacher, round and round on his tether
    const a = t / FLY.period * TAU;
    hub.rotation.y = a;
    const tip = new THREE.Vector3(Math.cos(a) * FLY.arm, FLY.hub - .1, FLY.z - Math.sin(a) * FLY.arm);
    const at = preacher.place(a, t);
    cable.geometry.attributes.position.setXYZ(0, tip.x, tip.y, tip.z); cable.geometry.attributes.position.setXYZ(1, at.x, at.y, at.z); cable.geometry.attributes.position.needsUpdate = true;
    bubble.sprite.position.copy(preacher.root.position).add(new THREE.Vector3(0, 1.5, 0));
    bubble.update(dt);
  }
  return { update };
}

/** the slides on the screens and the arch: one canvas, two textures (wide for the screens, a square from its middle for the arch) */
function slideDeck() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 576;
  const g = c.getContext('2d');
  const SLIDES = [
    g => { bg(g, '#1b0f3a', '#5a1f6e'); text(g, 'WELCOME HOME', 512, 250, 110, '#ffffff'); text(g, 'Crossroads Church', 512, 360, 44, '#9fe4ff'); },
    g => {
      bg(g, '#e6d6c8', '#f3e7da'); text(g, '3  ways  to  give', 512, 90, 70, '#2a7a6a', 'italic');
      [['1', 'in the bucket', 230], ['2', 'on our app', 512], ['3', 'text "give"', 794]].forEach(([n, w, x], k) => { text(g, n, x, 230 + (k === 1 ? -40 : 0), 90, '#2a6a5a'); text(g, w, x, 330 + (k === 1 ? -40 : 0), 34, '#3a3a3a'); });
      g.fillStyle = '#2aa66a'; g.fillRect(480, 260, 64, 64);
    },
    g => { bg(g, '#0a1a3a', '#1f4a8a'); text(g, 'Can I get an', 512, 220, 70, '#ffffff'); text(g, 'AMEN?', 512, 340, 140, '#ffd45a'); },
    g => { bg(g, '#2a0a1a', '#8a1f3a'); text(g, 'TAKE ME', 512, 220, 120, '#ffffff'); text(g, 'TO CHURCH', 512, 350, 120, '#ffffff'); },
    g => { bg(g, '#0a2a2a', '#1f6a5a'); text(g, 'This is the day', 512, 230, 72, '#ffffff'); text(g, 'that the Lord has made', 512, 320, 60, '#ffffff'); text(g, 'Psalm 118:24', 512, 420, 34, '#bff5df'); },
  ];
  function bg(g, a, b) { const r = g.createRadialGradient(512, 288, 40, 512, 288, 620); r.addColorStop(0, b); r.addColorStop(1, a); g.fillStyle = r; g.fillRect(0, 0, 1024, 576); }
  function text(g, s, x, y, size, col, style = 'bold') { g.fillStyle = col; g.font = `${style} ${size}px Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, x, y); }
  let i = 0; SLIDES[0](g);
  const wide = new THREE.CanvasTexture(c), square = new THREE.CanvasTexture(c);
  square.repeat.set(576 / 1024, 1); square.offset.set((1 - 576 / 1024) / 2, 0);
  return { wide, square, next() { i = (i + 1) % SLIDES.length; SLIDES[i](g); wide.needsUpdate = square.needsUpdate = true; } };
}

/** the congregation, standing in front of their chairs facing the stage (-z): instanced bodies, some with hands raised */
function crowdMeshes(P, mc) {
  const cyl = (r0, r1, h, x, y, z, rz = 0) => { const g = new THREE.CylinderGeometry(r0, r1, h, 7); g.rotateZ(rz); return g.translate(x, y, z); };
  const G = {
    legs: mergeGeometries([cyl(.075, .06, .86, -.1, .43, 0), cyl(.075, .06, .86, .1, .43, 0)]),
    torso: cyl(.15, .19, .62, 0, 1.16, 0),
    head: geoAt(new THREE.SphereGeometry(.11, 10, 8), 0, 1.6, 0),
    hair: geoAt(new THREE.SphereGeometry(.118, 10, 6, 0, TAU, 0, Math.PI * .55), 0, 1.62, .015),
    down: mergeGeometries([cyl(.05, .045, .62, -.23, 1.13, 0, -.08), cyl(.05, .045, .62, .23, 1.13, 0, .08)]),
    up: mergeGeometries([cyl(.045, .05, .66, -.31, 1.72, -.05, .42), cyl(.045, .05, .66, .31, 1.72, -.05, -.42)]),
  };
  const SHIRT = ['#1d2230', '#7a2a2a', '#2f3a52', '#d9d4c8', '#4a4f5a', '#8a1f2a', '#2a4a3a', '#5a3a6a', '#c6c0b0', '#26282e', '#6a7a8a', '#9a6a3a'];
  const PANTS = ['#23262e', '#2f3d55', '#3a3a3e', '#1b1d22', '#4a4038', '#2b3a5a'];
  const SKIN = ['#e8c4a8', '#d9a888', '#c08a68', '#8d5a3c', '#e0b898', '#a8704e', '#f0d0b8'];
  const HAIR = ['#2a1d16', '#4a3020', '#7a5a3a', '#c9a05a', '#9a9a98', '#e2e0dc', '#1a1412', '#6a2a1a'];
  const ups = P.filter(p => p.up), downs = P.filter(p => !p.up);
  const mk = (geo, list, pal, salt) => {
    const m = new THREE.InstancedMesh(geo, mc('crowd', '#ffffff'), list.length);
    list.forEach((p, i) => m.setColorAt(i, new THREE.Color(pal[Math.floor(hash(p.i * 1.31 + salt) * pal.length)])));
    m.userData.list = list; return m;
  };
  // (arms take the shirt colour of their owner: the same salt)
  const meshes = [mk(G.legs, P, PANTS, 1), mk(G.torso, P, SHIRT, 2), mk(G.head, P, SKIN, 3), mk(G.hair, P, HAIR, 4), mk(G.down, downs, SHIRT, 2), mk(G.up, ups, SHIRT, 2)];
  const dm = new THREE.Object3D();
  meshes.sway = beat => {
    for (const m of meshes) {
      m.userData.list.forEach((p, i) => {
        const w = Math.sin(beat * Math.PI + p.ph), hop = p.up ? Math.max(0, Math.sin(beat * TAU + p.ph)) * .04 : 0;
        dm.position.set(p.x, hop, p.z); dm.rotation.set(0, p.yaw, w * (p.up ? .07 : .035)); dm.scale.setScalar(p.s); dm.updateMatrix();
        m.setMatrixAt(i, dm.matrix);
      });
      m.instanceMatrix.needsUpdate = true;
    }
  };
  meshes.sway(0);
  meshes.forEach(m => { m.frustumCulled = false; });
  return meshes;
}

/** the loop round the middle block: up the left aisle, across the front, down the right aisle, across the back */
function loopPath() {
  const { x, zf, zb, r } = LOOP, V = (a, b) => new THREE.Vector3(a, 0, b), P = new THREE.CurvePath();
  const corner = (cx, cz, a0) => { const pts = []; for (let k = 0; k <= 8; k++) { const a = a0 + k / 8 * Math.PI / 2; pts.push(V(cx + Math.cos(a) * r, cz + Math.sin(a) * r)); } return new THREE.CatmullRomCurve3(pts); };
  P.add(new THREE.LineCurve3(V(-x, zb - r), V(-x, zf + r)));      // up the left aisle, toward the stage
  P.add(corner(-x + r, zf + r, Math.PI));                          // round to the front
  P.add(new THREE.LineCurve3(V(-x + r, zf), V(x - r, zf)));       // across in front of the stage
  P.add(corner(x - r, zf + r, -Math.PI / 2));
  P.add(new THREE.LineCurve3(V(x, zf + r), V(x, zb - r)));         // down the right aisle
  P.add(corner(x - r, zb - r, 0));
  P.add(new THREE.LineCurve3(V(x - r, zb), V(-x + r, zb)));       // across the back
  P.add(corner(-x + r, zb - r, Math.PI / 2));
  P.length = P.getLength();
  return P;
}

/** a lime-green touring bagger with black flames, and its rider; faces +z, 2.6 m long */
function motorcycle(mc) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const flameTex = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#8fd61e'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#121410';
    for (let k = 0; k < 7; k++) {
      const y = 18 + k * 15, len = 120 + hash(k) * 110;
      g.beginPath(); g.moveTo(0, y - 9); g.bezierCurveTo(len * .4, y - 16, len * .7, y + 8, len, y - 4 + hash(k + 3) * 8); g.bezierCurveTo(len * .6, y + 12, len * .3, y + 4, 0, y + 9); g.fill();
    }
    g.strokeStyle = '#c9ff4a'; g.lineWidth = 2; g.stroke();
  });
  const lime = new THREE.MeshMatcapMaterial({ matcap: mc('stage', '#ffffff').matcap, map: flameTex });
  const plainLime = mc('stage', '#8fd61e'), black = mc('stage', '#151517'), chrome = mc('stage', '#e2e6ea'), rubber = mc('stage', '#1a1a1a');
  const put = (g, m, x, y, z, parent = body) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); parent.add(o); return o; };
  const wheels = [];
  for (const z of [.86, -.82]) {
    const w = new THREE.Group(); w.position.set(0, .34, z); body.add(w); wheels.push(w);
    const tire = new THREE.Mesh(new THREE.TorusGeometry(.27, .085, 10, 24), rubber); tire.rotation.y = Math.PI / 2; w.add(tire);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, .07, 16), chrome); rim.rotation.z = Math.PI / 2; w.add(rim);
    for (let k = 0; k < 5; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(.03, .4, .04), black); sp.rotation.x = k / 5 * Math.PI; w.add(sp); }
  }
  put(new THREE.CylinderGeometry(.03, .03, .78, 6), chrome, .09, .7, .72).rotation.x = -.45;   // forks
  put(new THREE.CylinderGeometry(.03, .03, .78, 6), chrome, -.09, .7, .72).rotation.x = -.45;
  put(new THREE.BoxGeometry(.26, .08, .5), plainLime, 0, .66, .88).rotation.x = .2;            // front fender
  put(new THREE.BoxGeometry(.32, .36, .52), black, 0, .46, .1);                                 // the engine
  for (const s of [-1, 1]) { const c = put(new THREE.CylinderGeometry(.09, .1, .3, 10), chrome, s * .14, .64, .1 + s * .12); c.rotation.x = s * .5; }
  const tank = put(new THREE.SphereGeometry(.3, 16, 12), lime, 0, .92, .28); tank.scale.set(.85, .5, 1.3);
  const fairing = put(new THREE.SphereGeometry(.42, 18, 12, 0, TAU, 0, Math.PI / 2), lime, 0, .98, .72); fairing.scale.set(1.25, .8, .7); fairing.rotation.x = Math.PI / 2 - .15;
  put(new THREE.PlaneGeometry(.62, .34), new THREE.MeshBasicMaterial({ color: '#202833', transparent: true, opacity: .55, side: THREE.DoubleSide }), 0, 1.38, .72).rotation.x = -.5;
  put(new THREE.CircleGeometry(.09, 12), new THREE.MeshBasicMaterial({ color: '#fff8d8' }), 0, .98, 1.11);   // the headlight
  put(new THREE.BoxGeometry(.32, .12, .7), black, 0, .98, -.22);                               // the seat
  put(new THREE.BoxGeometry(.3, .14, .3), black, 0, 1.08, -.55);                               // the pillion
  put(new THREE.BoxGeometry(.3, .2, .6), lime, 0, .78, -.68);                                  // the rear fender
  for (const s of [-1, 1]) {
    const bag = put(new THREE.BoxGeometry(.2, .42, .78), lime, s * .3, .66, -.62); bag.rotation.y = s * .04;   // saddlebags
    put(new THREE.CylinderGeometry(.05, .05, 1.1, 8), chrome, s * .22, .26, -.45).rotation.x = Math.PI / 2 - .1;   // exhausts
    put(new THREE.CylinderGeometry(.015, .015, .4, 5), chrome, s * .26, 1.18, .58).rotation.z = s * 1.2;           // bars
    put(new THREE.BoxGeometry(.1, .06, .02), chrome, s * .44, 1.32, .62);                                           // mirrors
  }
  put(new THREE.BoxGeometry(.24, .07, .03), new THREE.MeshBasicMaterial({ color: '#ff2a2a' }), 0, .86, -.99);   // the tail light
  // the rider: black leather and jeans, a black helmet
  const F = makeFigure({ shirt: '#1b1b1d', shorts: '#2f4a6e', skin: '#d9a888', shoe: '#111', hair: '#8a8a88' });
  F.root.traverse(o => { if (o.isMesh) { o.material = mc('stage', '#' + o.material.color.getHexString()); o.castShadow = false; } });
  F.root.position.set(0, .12, -.28); body.add(F.root);
  F.pelvis.rotation.x = .2; F.hipL.rotation.x = F.hipR.rotation.x = -1.35; F.kneeL.rotation.x = F.kneeR.rotation.x = 1.25;
  F.hipL.rotation.z = .25; F.hipR.rotation.z = -.25;
  F.shL.rotation.x = F.shR.rotation.x = -1.05; F.elL.rotation.x = F.elR.rotation.x = -.35; F.shL.rotation.z = .25; F.shR.rotation.z = -.25;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(.15, 14, 10), black); helmet.scale.set(1, 1, 1.12); F.head.add(helmet);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(.2, .05, .04), mc('stage', '#3a3a40')); visor.position.set(0, -.01, .14); F.head.add(visor);
  let yaw = 0, lean = 0;
  const p = new THREE.Vector3(), tan = new THREE.Vector3();
  return {
    root,
    place(path, s, v, dt) {
      const u = s / path.length;
      path.getPointAt(u, p); path.getTangentAt(u, tan);
      const y1 = Math.atan2(tan.x, tan.z), dy = Math.atan2(Math.sin(y1 - yaw), Math.cos(y1 - yaw));
      yaw = y1;
      const want = dt > 0 ? -Math.atan(v * (dy / dt) / 9.8) : 0;   // lean into the turns
      lean += (want - lean) * Math.min(1, dt * 4);
      root.position.copy(p); root.rotation.set(0, yaw, 0); body.rotation.z = lean;
      for (const w of wheels) w.rotation.x += v * dt / .36;
    },
  };
}

/** the preacher in a flying harness: hangs from the cable, mic in his left hand, preaching with his right */
function flyingPreacher(mc, matcapify) {
  const F = makeFigure({ shirt: '#f4f1ea', shorts: '#26262c', skin: '#8d5a3c', shoe: '#111', hair: '#141010' });
  matcapify(F.root, 'stage');
  const strap = mc('stage', '#1a1a1e');
  for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(.05, .62, .4), strap); b.position.set(s * .1, .3, 0); b.rotation.z = s * .35; F.pelvis.add(b); }
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .08, 12), strap); belt.position.y = .02; F.pelvis.add(belt);
  const mic = new THREE.Mesh(new THREE.CylinderGeometry(.02, .016, .2, 6), mc('stage', '#202024')); mic.position.set(0, -.32, .06); mic.rotation.x = .4; F.elL.add(mic);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(.035, 8, 6), mc('stage', '#8a8a90')); ball.position.set(0, -.1, 0); mic.add(ball);
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body); body.add(F.root);
  F.root.position.y = -1.48;   // the harness ring, between his shoulders, is at the group's origin
  const ring = new THREE.Vector3(0, 0, -.1);
  const at = new THREE.Vector3();
  return {
    root,
    /** a: his angle round the hub; returns where the cable meets his harness */
    place(a, t) {
      const r = FLY.r, y = FLY.y + Math.sin(t * .7) * .35;
      root.position.set(Math.cos(a) * r, y, FLY.z - Math.sin(a) * r);
      // he faces out over the people below and a little ahead, leaning out on the cable
      root.rotation.set(0, Math.PI / 2 + a + .5, 0);
      body.rotation.set(.35 + Math.sin(t * 1.1) * .05, 0, Math.sin(t * .9) * .06);
      F.shL.rotation.x = -2.1; F.elL.rotation.x = -1.5; F.shL.rotation.z = .25;   // mic to his mouth
      F.shR.rotation.x = -1.6 - Math.sin(t * 2.6) * .7; F.shR.rotation.z = -.35 - Math.max(0, Math.sin(t * 1.3)) * .5; F.elR.rotation.x = -.3 - Math.max(0, Math.sin(t * 2.6 + 1)) * .6;
      F.hipL.rotation.x = .25 + Math.sin(t * 1.4) * .2; F.hipR.rotation.x = .1 - Math.sin(t * 1.4) * .2; F.kneeL.rotation.x = F.kneeR.rotation.x = .35;
      F.head.rotation.x = .25 + Math.sin(t * 2.6) * .08;
      root.updateMatrix(); body.updateMatrix();
      return at.copy(ring).applyMatrix4(body.matrix).applyMatrix4(root.matrix);
    },
  };
}

/** what he is saying, over his head */
function speechBubble() {
  const LINES = ['Can I get an AMEN?!', 'Hallelujah!', 'Love thy neighbor!', 'He is RISEN!', 'Praise the Lord!', 'Turn to your neighbor and say “Neighbor!”', 'This is the day the Lord has made!', 'Somebody shout GLORY!', 'Let the church say AMEN!', 'Can I get a witness?!', 'Feel that SPIRIT!', 'Ride on, brother, ride on!'];
  const c = document.createElement('canvas'); c.width = 512; c.height = 200;
  const g = c.getContext('2d'), tex = new THREE.CanvasTexture(c);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(3.4, 1.33, 1); sprite.renderOrder = 3;
  let i = -1, t = 99;
  function draw() {
    i = (i + 1) % LINES.length;
    const s = LINES[i];
    g.clearRect(0, 0, 512, 200);
    g.fillStyle = 'rgba(255,255,255,.94)'; g.strokeStyle = '#222'; g.lineWidth = 5;
    g.beginPath(); g.roundRect(8, 8, 496, 140, 36); g.moveTo(230, 146); g.lineTo(256, 192); g.lineTo(286, 146); g.fill(); g.stroke();
    g.fillStyle = '#ffffff'; g.fillRect(232, 140, 52, 8);
    let size = 52; g.font = `bold ${size}px Arial, sans-serif`;
    while (g.measureText(s).width > 460 && size > 24) { size -= 2; g.font = `bold ${size}px Arial, sans-serif`; }
    g.fillStyle = '#1a1a1a'; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (g.measureText(s).width > 460) { const k = s.lastIndexOf(' ', s.length / 2 + 4); g.fillText(s.slice(0, k), 256, 54); g.fillText(s.slice(k + 1), 256, 102); }
    else g.fillText(s, 256, 78);
    tex.needsUpdate = true;
  }
  return { sprite, update(dt) { t += dt; if (t > 3.6) { t = 0; draw(); } } };
}
