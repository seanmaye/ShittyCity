// Landmark models for the citywide build-out (data/phl/city_landmarks.json, tools/phl/build_landmarks.py):
// the South Philadelphia sports complex (Lincoln Financial Field, Citizens Bank Park, Xfinity
// Mobile Arena), Independence Hall, Memorial Hall, and the Benjamin Franklin and Walt Whitman
// suspension bridges. Each is fitted to its real outline; the generic buildings inside those
// outlines were left out of data/city_buildings. Also the frisbee game on the Edgley fields
// (frisbee.js) and an unlabelled statue on the arena plaza.
import * as THREE from 'three';
import { pairs } from '../../data.js';
import { M, litMats, winMat, reps, addDisplay, DISPLAY_PRESETS } from '../materials.js';
import { Builder, addPolygon } from '../geometry.js';
import { makeFigure } from './people.js';
import { buildFrisbee } from './frisbee.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const cen = r => { let x = 0, z = 0; for (const p of r) { x += p[0]; z += p[1]; } return [x / r.length, z / r.length]; };
/** distance along ray c + t*dir to the ring's boundary (nearest positive hit), or null */
function rayHit(ring, c, dx, dz) {
  let best = null;
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length], ex = bx - ax, ez = bz - az;
    const den = dx * ez - dz * ex; if (Math.abs(den) < 1e-9) continue;
    const t = ((ax - c[0]) * ez - (az - c[1]) * ex) / den, u = ((ax - c[0]) * dz - (az - c[1]) * dx) / den;
    if (u >= 0 && u <= 1 && t > 0 && (best === null || t < best)) best = t;
  }
  return best;
}
/** indexed mesh from a list of quads [A, B, C, D] (each [x, y, z]); normals computed */
function quadsMesh(quads, mat) {
  const pos = [], idx = [];
  for (const q of quads) { const s = pos.length / 3; q.forEach(p => pos.push(...p)); idx.push(s, s + 1, s + 2, s, s + 2, s + 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true; return m;
}
const glowMat = (color, emissive, lit) => { const m = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 0, roughness: .6 }); m.userData.lit = lit; litMats.push(m); return m; };

// ---------------------------------------------------------------- playing surfaces
function footballTex() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const g = c.getContext('2d');
  for (let i = 0; i < 24; i++) { g.fillStyle = i % 2 ? '#3f8b3c' : '#468f40'; g.fillRect(i * 1024 / 24, 0, 1024 / 24 + 1, 512); }
  const X = yd => (yd + 10) / 120 * 1024;   // yards from the near goal line, end zones 10 yd deep
  g.fillStyle = '#1d3f6b'; g.fillRect(0, 0, X(0), 512); g.fillRect(X(100), 0, 1024 - X(100), 512);
  g.fillStyle = '#f4f4ee';
  for (let yd = 0; yd <= 100; yd += 5) g.fillRect(X(yd) - 1.5, 30, 3, 452);
  g.fillRect(0, 28, 1024, 4); g.fillRect(0, 480, 1024, 4);
  for (let yd = 1; yd < 100; yd++) { g.fillRect(X(yd) - 1, 40, 2, 8); g.fillRect(X(yd) - 1, 464, 2, 8); g.fillRect(X(yd) - 1, 200, 2, 8); g.fillRect(X(yd) - 1, 304, 2, 8); }
  g.font = 'bold 34px sans-serif'; g.textAlign = 'center';
  for (let yd = 10; yd <= 90; yd += 10) { const n = String(yd <= 50 ? yd : 100 - yd); g.fillText(n, X(yd), 110); g.fillText(n, X(yd), 430); }
  g.beginPath(); g.fillStyle = '#7fc06a'; g.arc(512, 256, 46, 0, 7); g.fill();   // midfield logo
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8; return t;
}

// ---------------------------------------------------------------- stadium bowls
/** Stands between the playing field and the outline, rising outward, with an upper deck and a facade. */
function bowl(scene, st, opts) {
  const outline = pairs(st.outline), field = st.field ? pairs(st.field) : null, H = Math.max(22, st.h);
  const c = opts.center || cen(field || outline), N = 144, low = [], mid1 = [], mid2 = [], top = [], fac = [];
  // ray lengths to the outline and to the pitch, smoothed around the bowl so notches in the
  // OSM outlines don't turn into spikes in the stands
  const rawO = [], rawI = [];
  for (let k = 0; k < N; k++) {
    const a = 2 * Math.PI * k / N, dx = Math.cos(a), dz = Math.sin(a), tO = rayHit(outline, c, dx, dz) || 120;
    rawO.push(tO); rawI.push(field ? (rayHit(field, c, dx, dz) || tO * .5) + opts.margin : tO * .45);
  }
  const smooth = (arr, r) => arr.map((_, k) => { let s = 0; for (let j = -r; j <= r; j++) s += arr[(k + j + N) % N]; return s / (2 * r + 1); });
  const sO = smooth(rawO, 3), sI = smooth(rawI, 3);
  for (let k = 0; k < N; k++) {
    const a = 2 * Math.PI * k / N, dx = Math.cos(a), dz = Math.sin(a);
    const tO = sO[k], tI = Math.min(sI[k], tO - 12);
    const f = opts.height ? opts.height(dx, dz) : 1;
    const P = t => [c[0] + dx * t, c[1] + dz * t];
    low.push(P(tI)); mid1.push(P(tI + (tO - tI) * .52)); mid2.push(P(tI + (tO - tI) * .58)); top.push(P(tO - 1.5)); fac.push(f);
  }
  const lowQ = [], upQ = [], conQ = [], wallQ = [], rimQ = [], innerQ = [];
  for (let k = 0; k < N; k++) {
    const j = (k + 1) % N, f0 = fac[k], f1 = fac[j];
    const y1a = 3, ym0 = H * .45 * f0, ym1 = H * .45 * f1, yu0 = H * .55 * f0, yu1 = H * .55 * f1, yt0 = H * .95 * f0, yt1 = H * .95 * f1;
    lowQ.push([[low[k][0], y1a, low[k][1]], [low[j][0], y1a, low[j][1]], [mid1[j][0], ym1, mid1[j][1]], [mid1[k][0], ym0, mid1[k][1]]]);
    conQ.push([[mid1[k][0], ym0, mid1[k][1]], [mid1[j][0], ym1, mid1[j][1]], [mid2[j][0], yu1, mid2[j][1]], [mid2[k][0], yu0, mid2[k][1]]]);
    upQ.push([[mid2[k][0], yu0, mid2[k][1]], [mid2[j][0], yu1, mid2[j][1]], [top[j][0], yt1, top[j][1]], [top[k][0], yt0, top[k][1]]]);
    wallQ.push([[top[k][0], 0, top[k][1]], [top[j][0], 0, top[j][1]], [top[j][0], H * f1, top[j][1]], [top[k][0], H * f0, top[k][1]]]);
    rimQ.push([[top[k][0], yt0, top[k][1]], [top[j][0], yt1, top[j][1]], [top[j][0], H * f1, top[j][1]], [top[k][0], H * f0, top[k][1]]]);
    innerQ.push([[low[k][0], 0, low[k][1]], [low[j][0], 0, low[j][1]], [low[j][0], y1a, low[j][1]], [low[k][0], y1a, low[k][1]]]);
  }
  const seat = M(opts.seat, { roughness: .8 }), seat2 = M(opts.seat2 || opts.seat, { roughness: .8 }), conc = M('#8a8d90'), wall = M(opts.wall, { roughness: .5, metalness: .25 });
  [quadsMesh(lowQ, seat), quadsMesh(conQ, conc), quadsMesh(upQ, seat2), quadsMesh(wallQ, wall), quadsMesh(rimQ, conc), quadsMesh(innerQ, M('#3b3e41'))].forEach(m => scene.add(m));
  // a lit ring of floodlights around the top at night
  const lamp = glowMat('#dcdcd2', '#fff6dc', 1.4), lb = new Builder();
  for (let k = 0; k < N; k += 4) { const g = new THREE.BoxGeometry(2.2, .8, 2.2); g.translate(top[k][0], H * fac[k] + 1.2, top[k][1]); const p = g.attributes.position, n = g.attributes.normal, s = lb.count; for (let i = 0; i < p.count; i++) lb.v(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i)); for (let i = 0; i < g.index.count; i += 3) lb.tri(s + g.index.array[i], s + g.index.array[i + 1], s + g.index.array[i + 2]); }
  scene.add(new THREE.Mesh(lb.geometry(), lamp));
  return { c, low, top, fac, H };
}

function football(scene, st) {
  const fb = st.fieldBox, long = fb ? [Math.cos(fb.ry), -Math.sin(fb.ry)] : [1, 0];
  const b = bowl(scene, st, { seat: '#1f5a4d', seat2: '#24624f', wall: '#9aa6ab', margin: 9, center: fb ? [fb.x, fb.z] : null,
    height: (dx, dz) => .9 + .1 * Math.abs(dx * -long[1] + dz * long[0]) });       // sidelines a little taller
  if (fb) {
    const g = new THREE.PlaneGeometry(fb.w + 14, fb.d + 14); g.rotateX(-Math.PI / 2);
    const surround = new THREE.Mesh(g, M('#3b7e37', { side: THREE.FrontSide })); surround.position.set(fb.x, 1.05, fb.z); surround.rotation.y = fb.ry; surround.receiveShadow = true; scene.add(surround);
    // OSM's pitch includes the sideline apron: the marked field (with end zones) is 109.7 x 48.8 m
    const FW = Math.min(fb.w, 109.7), FD = Math.min(fb.d, 48.8);
    const f = new THREE.PlaneGeometry(FW, FD); f.rotateX(-Math.PI / 2);
    const fieldMat = new THREE.MeshStandardMaterial({ map: footballTex(), roughness: .9, emissive: '#ffffff', emissiveMap: null, emissiveIntensity: 0 });
    const fm = new THREE.Mesh(f, fieldMat); fm.position.set(fb.x, 1.1, fb.z); fm.rotation.y = fb.ry; fm.receiveShadow = true; scene.add(fm);
    // goalposts
    const post = M('#f2d33b');
    for (const e of [-1, 1]) {
      const x = fb.x + long[0] * e * (FW / 2 + .5), z = fb.z + long[1] * e * (FW / 2 + .5);
      const up = new THREE.Mesh(new THREE.CylinderGeometry(.15, .15, 3, 8), post); up.position.set(x, 2.6, z);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(.2, .2, 5.6), post); bar.position.set(x, 4.1, z); bar.rotation.y = fb.ry;
      const g2 = new THREE.Group(); g2.add(up, bar);
      for (const s of [-1, 1]) { const u = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, 9, 6), post); u.position.set(x - long[1] * s * 2.8, 8.6, z + long[0] * s * 2.8); g2.add(u); }
      scene.add(g2);
    }
  }
  // the Linc's two sideline canopies: wings of roof over the upper decks
  const q = [], { c, top, fac, H } = b, N = top.length;
  for (let k = 0; k < N; k++) {
    const j = (k + 1) % N, a = 2 * Math.PI * (k + .5) / N, side = Math.abs(Math.cos(a) * -long[1] + Math.sin(a) * long[0]);
    if (side < .62) continue;
    const inw = (p, t) => [p[0] + (c[0] - p[0]) * t, p[1] + (c[1] - p[1]) * t];
    const A = top[k], B = top[j], A2 = inw(A, .3), B2 = inw(B, .3);
    q.push([[A[0], H * fac[k] + 4, A[1]], [B[0], H * fac[j] + 4, B[1]], [B2[0], H * fac[j] + 9, B2[1]], [A2[0], H * fac[k] + 9, A2[1]]]);
  }
  scene.add(quadsMesh(q, M('#e9edef', { roughness: .4, metalness: .2 })));
  // end-zone video boards
  const screen = glowMat('#1d2329', '#9cc8ff', 1.1);
  for (const e of [-1, 1]) {
    const t = rayHit(pairs(st.outline), c, long[0] * e, long[1] * e) || 100;
    const s = new THREE.Mesh(new THREE.BoxGeometry(1, 11, 50), screen);
    s.position.set(c[0] + long[0] * e * (t - 6), H * .9, c[1] + long[1] * e * (t - 6)); s.rotation.y = Math.atan2(long[0], long[1]) + Math.PI / 2; scene.add(s);
  }
}

function ballpark(scene, st) {
  const plate = st.plate, cf = st.cf;
  bowl(scene, st, { seat: '#264b3c', seat2: '#2c5545', wall: '#b9a58e', margin: 7,
    center: plate ? [plate[0] + cf[0] * 55, plate[1] + cf[1] * 55] : null,
    height: (dx, dz) => (cf && dx * cf[0] + dz * cf[1] > .55 ? .42 : 1) });   // low bleachers in the outfield
  if (!st.field || !plate) return;
  const field = pairs(st.field), B = (g, y, col) => { const m = new THREE.Mesh(g, M(col, { side: THREE.FrontSide })); m.position.y = y; m.receiveShadow = true; scene.add(m); };
  const fb = new Builder(); addPolygon(fb, [field], 0); B(fb.geometry(), 1.0, '#a8774f');          // warning track
  const inner = field.map(([x, z]) => [plate[0] + (x - plate[0]) * .95, plate[1] + (z - plate[1]) * .95]);
  const gb = new Builder(); addPolygon(gb, [inner], 0); B(gb.geometry(), 1.05, '#3f8a3a');
  const mound = [plate[0] + cf[0] * 18.4, plate[1] + cf[1] * 18.4];
  const disc = (r, x, z, y, col, seg = 48) => { const g = new THREE.CircleGeometry(r, seg); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, M(col, { side: THREE.FrontSide })); m.position.set(x, y, z); m.receiveShadow = true; scene.add(m); };
  disc(29, mound[0], mound[1], 1.1, '#b07d52');                                                       // infield dirt
  const sq = new THREE.PlaneGeometry(24, 24); sq.rotateX(-Math.PI / 2);
  const grass = new THREE.Mesh(sq, M('#45923f', { side: THREE.FrontSide })); grass.position.set(plate[0] + cf[0] * 19.4, 1.15, plate[1] + cf[1] * 19.4);
  grass.rotation.y = Math.atan2(cf[0], cf[1]) + Math.PI / 4; scene.add(grass);                       // infield grass (inside the base paths)
  disc(2.9, mound[0], mound[1], 1.2, '#b07d52'); disc(4, plate[0], plate[1], 1.2, '#b07d52');
  // foul lines
  const line = new Builder();
  for (const s of [-1, 1]) {
    const a = Math.atan2(cf[1], cf[0]) + s * Math.PI / 4, dx = Math.cos(a), dz = Math.sin(a), L = rayHit(field, [plate[0] + dx * .5, plate[1] + dz * .5], dx, dz) || 100;
    const nx = -dz * .1, nz = dx * .1, s0 = line.count;
    line.v(plate[0] + nx, 0, plate[1] + nz, 0, 1, 0); line.v(plate[0] - nx, 0, plate[1] - nz, 0, 1, 0);
    line.v(plate[0] + dx * L + nx, 0, plate[1] + dz * L + nz, 0, 1, 0); line.v(plate[0] + dx * L - nx, 0, plate[1] + dz * L - nz, 0, 1, 0);
    line.tri(s0, s0 + 2, s0 + 1); line.tri(s0 + 1, s0 + 2, s0 + 3);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, 22, 8), M('#f2d33b')); pole.position.set(plate[0] + dx * (L + 1), 11, plate[1] + dz * (L + 1)); scene.add(pole);
  }
  B(line.geometry(), 1.25, '#f4f4ee');
  // the scoreboard beyond left-centre field
  const a = Math.atan2(cf[1], cf[0]) - .35, d = (rayHit(pairs(st.outline), plate, Math.cos(a), Math.sin(a)) || 130) - 4;
  const sb = new THREE.Mesh(new THREE.BoxGeometry(2, 18, 46), glowMat('#1d2329', '#bfe0ff', 1.1));
  sb.position.set(plate[0] + Math.cos(a) * d, 26, plate[1] + Math.sin(a) * d); sb.rotation.y = -a; scene.add(sb);
  const leg = new THREE.Mesh(new THREE.BoxGeometry(1.5, 17, 1.5), M('#5b6166')); leg.position.set(sb.position.x, 8.5, sb.position.z); scene.add(leg);
}

function arena(scene, st) {
  const ring = pairs(st.outline), H = Math.max(30, st.h), c = cen(ring), N = ring.length;
  const scaled = (k, y) => ring.map(p => [c[0] + (p[0] - c[0]) * k, y, c[1] + (p[1] - c[1]) * k]);
  const band = (A, B) => { const q = []; for (let i = 0; i < N; i++) { const j = (i + 1) % N; q.push([A[i], A[j], B[j], B[i]]); } return q; };
  // glass concourse at street level, set in under the main walls
  scene.add(quadsMesh(band(scaled(.97, 0), scaled(.97, 8)), M('#33424f', { roughness: .15, metalness: .6 })));
  scene.add(quadsMesh(band(scaled(1, 8), scaled(1, H)), M('#8b98a6', { roughness: .35, metalness: .4 })));
  scene.add(quadsMesh(band(scaled(.97, 8), scaled(1, 8)), M('#6c7884')));
  // the LED ribbon that wraps the upper facade
  const led = glowMat('#2a4f7a', '#5fa8ff', 1.2); led.side = THREE.DoubleSide;
  scene.add(quadsMesh(band(scaled(1.006, H * .7), scaled(1.006, H * .8)), led));
  // vertical fins on the facade
  const fins = [];
  for (let i = 0; i < N; i++) {
    const A = ring[i], B = ring[(i + 1) % N], L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    for (let t = 4; t < L - 2; t += 8) fins.push([A[0] + (B[0] - A[0]) * t / L, A[1] + (B[1] - A[1]) * t / L, Math.atan2(B[0] - A[0], B[1] - A[1])]);
  }
  const fg = new THREE.BoxGeometry(.6, H - 8, 1.2); fg.translate(0, (H - 8) / 2 + 8, 0);
  const im = new THREE.InstancedMesh(fg, M('#c3cad1', { metalness: .4, roughness: .4 }), fins.length), o3 = new THREE.Object3D();
  fins.forEach(([x, z, ry], i) => { o3.position.set(x + (x - c[0]) * .004, 0, z + (z - c[1]) * .004); o3.rotation.y = ry; o3.updateMatrix(); im.setMatrixAt(i, o3.matrix); });
  im.frustumCulled = false; im.castShadow = true; scene.add(im);
  // roof: a parapet, then a shallow slope up to a flat top
  scene.add(quadsMesh(band(scaled(1, H), scaled(.96, H + 1.5)), M('#b9bfc4')));
  scene.add(quadsMesh(band(scaled(.96, H + 1.5), scaled(.72, H + 7)), M('#d3d7da', { roughness: .6 })));
  const rb = new Builder(); addPolygon(rb, [scaled(.72, 0).map(p => [p[0], p[2]])], 0);
  const roof = new THREE.Mesh(rb.geometry(), M('#dcdfe1')); roof.position.y = H + 7; roof.receiveShadow = true; scene.add(roof);
}

/**
 * Easter egg: a bronze of LeBron James rising for a one-handed dunk, on a granite plinth on the
 * arena plaza, facing away from the building toward (dx, dz). No label: you have to find it.
 */
function lebron(scene, ring, dx, dz) {
  const c = cen(ring), L = Math.hypot(dx, dz); dx /= L; dz /= L;
  const r = (rayHit(ring, c, dx, dz) || 80) + 45, x = c[0] + dx * r, z = c[1] + dz * r;
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.atan2(dx, dz); scene.add(g);
  const granite = M('#3c3e42', { roughness: .45, metalness: .1 }), bronze = new THREE.MeshStandardMaterial({ color: '#b08048', roughness: .42, metalness: .3 });
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.2, 2.8), granite); plinth.position.y = 1.1; plinth.castShadow = plinth.receiveShadow = true; g.add(plinth);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(3.1, .2, 3.1), granite); cap.position.y = 2.3; g.add(cap);
  const step = new THREE.Mesh(new THREE.BoxGeometry(4.4, .25, 4.4), M('#9a968e')); step.position.y = .125; step.receiveShadow = true; g.add(step);
  // the plaque on the front face, lit at night
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
  const x2 = cv.getContext('2d'); x2.fillStyle = '#6b4c26'; x2.fillRect(0, 0, 512, 256); x2.strokeStyle = '#d8b878'; x2.lineWidth = 10; x2.strokeRect(14, 14, 484, 228);
  x2.fillStyle = '#f0d9a0'; x2.textAlign = 'center'; x2.font = 'bold 52px Georgia, serif'; x2.fillText('LEBRON JAMES', 256, 112);
  x2.font = 'italic 34px Georgia, serif'; x2.fillText('“The King” · 23', 256, 175);
  const pt = new THREE.CanvasTexture(cv), pm = new THREE.MeshStandardMaterial({ map: pt, emissive: '#ffffff', emissiveMap: pt, emissiveIntensity: 0, roughness: .4, metalness: .5 });
  pm.userData.lit = .5; litMats.push(pm);
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.8, .9), pm); plaque.position.set(0, 1.25, 1.41); g.add(plaque);
  // the figure, twice life size: left knee driving up, right arm stretched up with the ball
  const F = makeFigure({}, bronze, 1.45);
  F.pelvis.rotation.x = -.1; F.head.rotation.x = -.45; F.chest.rotation.z = .12;
  F.hipL.rotation.x = -1.3; F.kneeL.rotation.x = 1.75; F.hipR.rotation.x = .18; F.kneeR.rotation.x = .25;
  F.shR.rotation.x = -2.95; F.elR.rotation.x = -.15; F.shL.rotation.x = -.5; F.shL.rotation.z = .8; F.elL.rotation.x = -.7;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(.12, 14, 10), bronze); ball.position.set(0, -.38, .05); F.elR.add(ball);
  F.root.scale.setScalar(2.05); g.add(F.root);
  F.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(F.root);   // stand him on the right toe on the plinth
  F.root.position.y = 2.4 - (box.min.y - g.position.y);
  F.root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { x, z };
}

// ---------------------------------------------------------------- halls
function frame(scene, h) {
  let { w, d, ry } = h;
  if (d > w) { [w, d] = [d, w]; ry += Math.PI / 2; }
  const g = new THREE.Group(); g.position.set(h.x, 0, h.z); g.rotation.y = ry; scene.add(g);
  const south = Math.cos(ry) > 0 ? 1 : -1;   // local +z points south when cos(ry) > 0
  return { g, w, d, south };
}
const part = (g, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };

function independenceHall(scene, h) {
  const { g, w, d, south } = frame(scene, h);
  const L = Math.min(w, 33.5), D = Math.min(d, 14), brick = '#9a4b37', white = M('#f1eee6'), slate = M('#4b4c53');
  const r = reps(L, 12.5);
  part(g, new THREE.BoxGeometry(L, 12.5, D), winMat(brick, r[0], 1, 1, 'stone'), 0, 6.25, 0);
  part(g, new THREE.BoxGeometry(L + .6, .8, D + .6), white, 0, 12.9, 0);                 // cornice
  const roof = new THREE.ConeGeometry(1, 1, 4); roof.rotateY(Math.PI / 4); roof.scale(L * .74, 5, D * .74);
  part(g, roof, slate, 0, 15.8, 0);
  part(g, new THREE.BoxGeometry(L * .35, .6, 1.2), white, 0, 18.1, 0);                   // roof balustrade
  // the tower on the south side: brick base, then the white wooden steeple
  const tz = south * (D / 2 + 4.5);
  part(g, new THREE.BoxGeometry(9.5, 21.5, 9), winMat(brick, 1, 1, 2, 'stone'), 0, 10.75, tz);
  part(g, new THREE.BoxGeometry(10, .8, 9.5), white, 0, 21.8, tz);
  part(g, new THREE.CylinderGeometry(4, 4.3, 6, 8), white, 0, 25.2, tz);
  part(g, new THREE.CylinderGeometry(3.2, 3.5, 5.5, 8), white, 0, 31, tz);
  const clock = M('#ffffff', { emissive: '#fff2d0', emissiveIntensity: 0 }); clock.userData.lit = .8; litMats.push(clock);
  for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const c = new THREE.Mesh(new THREE.CircleGeometry(1.4, 24), clock); c.position.set(dx * 3.3, 31, tz + dz * 3.3); c.rotation.y = Math.atan2(dx, dz); g.add(c); }
  part(g, new THREE.CylinderGeometry(2.4, 2.8, 4.5, 8), white, 0, 36, tz);
  part(g, new THREE.ConeGeometry(2.3, 9, 8), white, 0, 42.7, tz);
  part(g, new THREE.CylinderGeometry(.12, .2, 4, 6), M('#c9a648', { metalness: .6, roughness: .3 }), 0, 49.2, tz);
  // the arcades to Congress Hall and Old City Hall
  for (const e of [-1, 1]) part(g, new THREE.BoxGeometry(14, 6, 6), winMat(brick, 1, 1, 0, 'stone'), e * (L / 2 + 7), 3, 0);
  // Congress Hall and Old City Hall close the row at either end when the outline covers them
  const wl = Math.min(22, (w - L - 28) / 2);
  if (wl > 8) for (const e of [-1, 1]) {
    const x = e * (L / 2 + 14 + wl / 2), wd = Math.min(D + 4, d);
    part(g, new THREE.BoxGeometry(wl, 11, wd), winMat(brick, 2, 1, 1, 'stone'), x, 5.5, 0);
    part(g, new THREE.BoxGeometry(wl + .4, .6, wd + .4), white, x, 11.3, 0);
    const hr = new THREE.ConeGeometry(1, 1, 4); hr.rotateY(Math.PI / 4); hr.scale(wl * .74, 4, wd * .74);
    part(g, hr, slate, x, 13.6, 0);
    part(g, new THREE.CylinderGeometry(1.3, 1.5, 3, 8), white, x, 16.6, 0);                // cupola
    part(g, new THREE.ConeGeometry(1.4, 2.4, 8), white, x, 19.3, 0);
  }
}

function memorialHall(scene, h) {
  const { g, w, d } = frame(scene, h);
  const L = Math.min(w, 111), D = Math.min(d, 64), stone = '#cdbf9f', r = reps(L, 16);
  part(g, new THREE.BoxGeometry(L, 16, D), winMat(stone, r[0], 1, 1, 'stone'), 0, 8, 0);
  for (const ex of [-1, 1]) for (const ez of [-1, 1]) part(g, new THREE.BoxGeometry(18, 20, 18), winMat(stone, 1, 1, 2, 'stone'), ex * (L / 2 - 9), 10, ez * (D / 2 - 9));
  part(g, new THREE.BoxGeometry(32, 26, 32), winMat(stone, 2, 1, 0, 'stone'), 0, 13, 0);
  part(g, new THREE.CylinderGeometry(13, 14, 6, 24), M(stone), 0, 29, 0);
  const dome = new THREE.SphereGeometry(13, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2); dome.scale(1, 1.05, 1);
  part(g, dome, M('#9cb5a3', { roughness: .4, metalness: .3 }), 0, 32, 0);
  part(g, new THREE.CylinderGeometry(.6, .9, 4, 8), M('#b8a36a', { metalness: .5 }), 0, 47, 0);      // Columbia
}

// ---------------------------------------------------------------- suspension bridges
function bridge(scene, b, nightOnly) {
  const [ax, az] = b.a, [bx, bz] = b.b, L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L, nx = -dz, nz = dx;
  const W = b.width, [t1, t2] = b.towers, [a1, a2] = b.anchors, deckY = s => Math.min(b.deckH, 1 + .045 * Math.min(s, L - s));
  const at = (s, o, y) => [ax + dx * s + nx * o, y, az + dz * s + nz * o];
  // deck: road surface, sides and underside every 10 m
  const top = [], sides = [], under = [];
  for (let s = 0; s < L; s += 10) {
    const s2 = Math.min(L, s + 10), y0 = deckY(s), y1 = deckY(s2);
    top.push([at(s, W / 2, y0), at(s, -W / 2, y0), at(s2, -W / 2, y1), at(s2, W / 2, y1)].reverse());
    for (const o of [W / 2, -W / 2]) sides.push([at(s, o, y0 - 3), at(s2, o, y1 - 3), at(s2, o, y1 + 1.1), at(s, o, y0 + 1.1)]);
    under.push([at(s, W / 2, y0 - 3), at(s, -W / 2, y0 - 3), at(s2, -W / 2, y1 - 3), at(s2, W / 2, y1 - 3)]);
  }
  scene.add(quadsMesh(top, M('#55585b')), quadsMesh(sides, M(b.color, { roughness: .6, metalness: .3 })), quadsMesh(under, M('#6c6f72')));
  const steel = M(b.color, { roughness: .55, metalness: .35 }), conc = M('#b7b1a6');
  const ry = Math.atan2(dx, dz);
  // towers: two legs, cross struts, on piers in the river
  for (const s of [t1, t2]) {
    const g = new THREE.Group(); const [x, , z] = at(s, 0, 0); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
    for (const e of [-1, 1]) {
      part(g, new THREE.BoxGeometry(5.5, b.towerH, 8), steel, e * (W / 2 + 2), b.towerH / 2, 0);
      part(g, new THREE.BoxGeometry(10, 8, 16), conc, e * (W / 2 + 2), 4, 0);
    }
    for (const y of [b.deckH - 6, b.towerH * .62, b.towerH * .97]) part(g, new THREE.BoxGeometry(W + 4, 4, 5), steel, 0, y, 0);
  }
  // main cables: tower tops sag to just above the deck at midspan; side spans run down to the anchorages
  const span = t2 - t1, sm = (t1 + t2) / 2, sag = b.deckH + 4;
  const cableY = s => {
    if (s >= t1 && s <= t2) { const u = (s - sm) / (span / 2); return sag + (b.towerH - sag) * u * u; }
    const [t, an] = s < t1 ? [t1, a1] : [t2, a2], u = (s - an) / (t - an), base = deckY(an) + 2;
    return base + (b.towerH - base) * u * u * .3 + (b.towerH - base) * u * .7;
  };
  const lights = [], hang = [];
  for (const o of [W / 2 + 2, -(W / 2 + 2)]) {
    const pts = [];
    for (let s = a1; s <= a2 + .1; s += 6) pts.push(V(...at(s, o, cableY(s))));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, .7, 6, false), steel); tube.castShadow = true; scene.add(tube);
    for (let s = a1 + 8; s < a2; s += 8) { lights.push(...at(s, o, cableY(s) + .9)); if (Math.abs(cableY(s) - deckY(s)) > 3) hang.push([s, o]); }
  }
  // suspenders
  const hg = new THREE.BoxGeometry(.25, 1, .25); hg.translate(0, .5, 0);
  const im = new THREE.InstancedMesh(hg, steel, hang.length), o3 = new THREE.Object3D();
  hang.forEach(([s, o], i) => { const [x, y, z] = at(s, o, deckY(s) + 1); o3.position.set(x, y, z); o3.scale.set(1, cableY(s) - deckY(s) - 1, 1); o3.updateMatrix(); im.setMatrixAt(i, o3.matrix); });
  im.frustumCulled = false; im.castShadow = true; scene.add(im);
  // anchorages and approach piers
  for (const s of [a1, a2]) { const [x, , z] = at(s, 0, 0), y = deckY(s); const m = part(scene, new THREE.BoxGeometry(W + 10, y + 6, 34), conc, x, (y + 6) / 2, z); m.rotation.y = ry; }
  for (let s = 40; s < L - 20; s += 60) {
    if (s > t1 - 20 && s < t2 + 20) continue;
    const y = deckY(s); if (y < 6) continue;
    const [x, , z] = at(s, 0, 0); const m = part(scene, new THREE.BoxGeometry(W * .8, y - 3, 4), conc, x, (y - 3) / 2, z); m.rotation.y = ry;
  }
  // the necklace of lights along the main cables at night: warm white, or the skyline colour scheme
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(lights, 3));
  const pm = new THREE.PointsMaterial({ color: '#fff1c8', size: 3, sizeAttenuation: false });
  addDisplay(hex => pm.color.set(hex === DISPLAY_PRESETS[0].colors[0] ? '#fff1c8' : hex));
  const pts = new THREE.Points(pg, pm); pts.frustumCulled = false; scene.add(pts); nightOnly.push(pts);
  return { deckY, a: b.a, d: [dx, dz] };
}

export function buildCityMarks(scene, data) {
  const nightOnly = [];
  for (const st of data.stadiums || []) {
    if (st.type === 'football') football(scene, st);
    else if (st.type === 'baseball') ballpark(scene, st);
    else {
      arena(scene, st);
      // the statue stands on the plaza on the side toward the ballpark and the Broad Street Line
      const ring = pairs(st.outline), c = cen(ring), bp = (data.stadiums || []).find(o => o.type === 'baseball');
      lebron(scene, ring, bp ? bp.plate[0] - c[0] : 1, bp ? bp.plate[1] - c[1] : -1);
    }
  }
  // the frisbee game on the Belmont & Edgley cricket ground
  const games = (data.fields || []).map(f => buildFrisbee(scene, f));
  for (const h of data.halls || []) (h.type === 'independence' ? independenceHall : memorialHall)(scene, h);
  for (const b of data.bridges || []) bridge(scene, b, nightOnly);
  const labels = (data.labels || []).map(l => ({ text: l.t, pos: V(l.x, l.y, l.z) }));
  // camera presets
  const views = [];
  const stad = (data.stadiums || []).map(s => cen(pairs(s.outline)));
  if (stad.length) {
    const c = stad.reduce((a, p) => [a[0] + p[0] / stad.length, a[1] + p[1] / stad.length], [0, 0]);
    views.push({ id: 'stadiums', name: 'Sports Complex', pos: V(c[0] + 170, 530, c[1] + 610), target: V(c[0] + 20, 10, c[1] - 40) });
  }
  const ih = (data.halls || []).find(h => h.type === 'independence');
  if (ih) views.push({ id: 'indhall', name: 'Independence Hall', pos: V(ih.x - 60, 70, ih.z + 160), target: V(ih.x, 18, ih.z) });
  const bf = (data.bridges || []).find(b => /Franklin/.test(b.name));
  if (bf) {   // from downstream, centred a little west of the main span so the HUD doesn't hide it
    const L = Math.hypot(bf.b[0] - bf.a[0], bf.b[1] - bf.a[1]), s = (bf.towers[0] + bf.towers[1]) / 2;
    const m = [bf.a[0] + (bf.b[0] - bf.a[0]) * s / L, bf.a[1] + (bf.b[1] - bf.a[1]) * s / L];
    views.push({ id: 'bfb', name: 'Ben Franklin Bridge', pos: V(m[0] - 300, 140, m[1] + 750), target: V(m[0] - 150, 40, m[1]) });
  }
  views.push(...games.map(gm => gm.view));
  return { labels, views, nightOnly, update: dt => games.forEach(gm => gm.update(dt)) };
}
