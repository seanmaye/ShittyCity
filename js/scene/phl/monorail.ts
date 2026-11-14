// The proposed monorail: a loop up the east bank and back down the west bank,
// offset from the real shoreline, with stations and a four-car train.
import * as THREE from 'three';
import { terrain, surface, profile } from '../terrain.js';
export const H = 18;               // guideway height (m)
const EAST = 58, WEST = 65;        // set-back from the water's edge (m)
const SOUTH_LAT = 39.9452, NORTH_LAT = 39.9752;
// [lat, bank (1 east, -1 west), name]: the names are for the ride bar's stops (js/ridebar.js)
const STATIONS = [[39.9478, 1, 'Schuylkill River Park'], [39.9640, 1, 'Art Museum'], [39.9702, 1, 'Boathouse Row'], [39.9548, -1, '30th Street Station'], [39.9662, -1, 'Spring Garden']];

function segDist2(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L)) : 0;
  const ex = ax + t * dx - px, ez = az + t * dz - pz; return ex * ex + ez * ez;
}

/** Lookup of everything tall enough to hit the guideway: real footprints over 15 m plus landmark models. */
export function obstacles(buildings, lm) {
  const CELL = 50, grid = new Map(), add = (o, x0, z0, x1, z1) => {
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
      const k = i + ',' + j; (grid.get(k) || grid.set(k, []).get(k)).push(o);
    }
  };
  for (const b of buildings.b) {
    if (b[0] < 150) continue;
    const r = b[2], pts = []; for (let i = 0; i < r.length; i += 2) pts.push([r[i] / 10, r[i + 1] / 10]);
    const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
    add({ pts }, Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs));
  }
  const box = b => { const c = Math.cos(b.ry), s = Math.sin(b.ry), pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => { const lx = u * b.w / 2, lz = v * b.d / 2; return [b.x + lx * c + lz * s, b.z - lx * s + lz * c]; }); const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]); add({ pts }, Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)); };
  [...lm.towers, lm.station, lm.cityhall].forEach(box);
  box({ x: lm.museum.x, z: lm.museum.z, w: 250, d: 250, ry: 0 });
  const PAD = 5;
  return function blocked(x, z) {
    for (const o of grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || []) {
      const r = o.pts; let inside = false;
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [xi, zi] = r[i], [xj, zj] = r[j];
        if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
        if (segDist2(x, z, xi, zi, xj, zj) < PAD * PAD) return true;
      }
      if (inside) return true;
    }
    return false;
  };
}

/** Per-sample set-back: the preferred distance where it's clear, pulled toward the water where a
 *  real building is in the way, then eased over a few hundred metres so the guideway sweeps
 *  gently instead of zig-zagging around each building. */
function setbacks(samples, side, pref, blocked) {
  const raw = samples.map(s => {
    for (let o = pref; o >= -14; o -= 2) { // negative = cantilevered over the water's edge
      const d = s.w / 2 + o, x = s.p.x + s.n.x * d * side, z = s.p.z + s.n.z * d * side;
      if (!blocked(x, z)) return o;
    }
    return -14;
  });
  const lo = raw.map((_, i) => Math.min(...raw.slice(Math.max(0, i - 10), i + 11)));
  return ease(lo, 14);
}
const ease = (a, r) => a.map((_, i) => { const w = a.slice(Math.max(0, i - r), i + r + 1); return w.reduce((p, q) => p + q) / w.length; });

export function buildMonorail(scene, river, bridgeSegs, buildings, lm, onCourt = () => false) {
  const { RS, NS, atLat } = river;
  const blocked = obstacles(buildings, lm);
  // Offset from the centreline along smoothed normals.
  const samples = [];
  for (let i = 0; i < NS; i += 2) {
    const s = RS[i]; if (s.lat < SOUTH_LAT || s.lat > NORTH_LAT) continue;
    const t = RS[Math.min(NS - 1, i + 10)].p.clone().sub(RS[Math.max(0, i - 10)].p).normalize();
    samples.push({ p: s.p, w: s.w, lat: s.lat, t, n: new THREE.Vector3(-t.z, 0, t.x) });
  }
  const offE = setbacks(samples, 1, EAST, blocked), offW = setbacks(samples, -1, WEST, blocked);
  const at = (s, side, o) => { const d = s.w / 2 + o; return new THREE.Vector3(s.p.x + s.n.x * d * side, H, s.p.z + s.n.z * d * side); };
  /** On the inside of a bend, offset points double back on themselves; drop any point that
   *  doesn't move forward along the river, then ease the result. Returns points + sample index. */
  function untangle(side, off) {
    const pts = [], idx = [];
    samples.forEach((s, i) => {
      const q = at(s, side, off[i]);
      if (pts.length && q.clone().sub(pts[pts.length - 1]).dot(s.t) < 6) return;
      pts.push(q); idx.push(i);
    });
    // ease twice (ends held), so the spline through these points has no small kinks
    let sm = pts;
    for (let k = 0; k < 2; k++) sm = sm.map((p, i) => { if (i < 2 || i > sm.length - 3) return p.clone(); const w = sm.slice(Math.max(0, i - 4), i + 5); return w.reduce((a, b) => a.add(b), new THREE.Vector3()).divideScalar(w.length); });
    return { pts: sm, idx };
  }
  /** A rounded turn across the river from the end of one bank's line to the other's: a cubic
   *  Bezier leaving and arriving along each line's own heading, so there is no hairpin. */
  function turn(A, B, out) {
    const a = A.pts, b = B.pts, n = a.length, m = b.length;
    const p0 = out ? a[n - 1] : a[0], p3 = out ? b[m - 1] : b[0];
    const ta = (out ? a[n - 1].clone().sub(a[n - 6]) : a[0].clone().sub(a[5])).setY(0).normalize();
    const tb = (out ? b[m - 1].clone().sub(b[m - 6]) : b[0].clone().sub(b[5])).setY(0).normalize();
    const k = p0.distanceTo(p3) * .75, p1 = p0.clone().addScaledVector(ta, k), p2 = p3.clone().addScaledVector(tb, k);
    const c = new THREE.CubicBezierCurve3(p0, p1, p2, p3), r = [];
    for (let i = 1; i < 12; i++) r.push(c.getPoint(i / 12).setY(H));
    return r;
  }
  let E, W, curve;
  const build = () => {
    E = untangle(1, offE); W = untangle(-1, offW);
    // control points every ~40 m: the spline then follows the eased line, not its sample noise
    const thin = P => P.filter((_, i) => i % 3 === 0 || i === P.length - 1);
    curve = new THREE.CatmullRomCurve3([...thin(E.pts), ...turn(E, W, true), ...thin([...W.pts].reverse()), ...turn(W, E, false)], true, 'centripetal');
  };
  // The spline can still clip a corner between control points: walk it, and wherever it
  // passes through a building pull the nearby set-backs toward the water and rebuild.
  for (let iter = 0; iter < 10; iter++) {
    build();
    const pts = curve.getSpacedPoints(Math.round(curve.getLength() / 3));
    let moved = false;
    for (const p of pts) {
      if (!blocked(p.x, p.z)) continue;
      let bi = 0, bd = 1e18, side = 1;
      E.pts.forEach((q, i) => { const d = q.distanceToSquared(p); if (d < bd) { bd = d; bi = E.idx[i]; side = 1; } });
      W.pts.forEach((q, i) => { const d = q.distanceToSquared(p); if (d < bd) { bd = d; bi = W.idx[i]; side = -1; } });
      const off = side > 0 ? offE : offW;
      for (let k = Math.max(0, bi - 5); k <= Math.min(off.length - 1, bi + 5); k++) if (off[k] > -14) { off[k] = Math.max(-14, off[k] - 4); moved = true; }
    }
    if (!moved) break;
  }
  const stationPoint = (lat, side) => {
    const S = side > 0 ? E : W; let bi = 0, bd = 1e18;
    S.idx.forEach((si, i) => { const d = Math.abs(samples[si].lat - lat); if (d < bd) { bd = d; bi = i; } });
    return S.pts[bi].clone();
  };
  liftCurve(curve, H);
  const L = curve.getLength();

  // guideway beam
  beam(scene, curve, L);

  // piers, skipping the river itself and the bridge decks
  const spots = [];
  for (let s = 0; s < L; s += 32) {
    // nudge a pier along the beam if it would land on a sports court
    let p = null;
    for (const o of [0, 5, -5, 10, -10, 15, -15]) { const q = curve.getPointAt(((s + o) % L + L) % L / L); if (!onCourt(q.x, q.z)) { p = q; break; } }
    if (!p) continue;
    const r = river.riverInfo(p.x, p.z); if (Math.abs(r.d) < r.w / 2 + 2) continue;
    if (bridgeSegs.some(b => segDist2(p.x, p.z, b[0], b[1], b[2], b[3]) < 15 * 15)) continue;
    spots.push(p);
  }
  piers(scene, spots, H);

  // stations
  const pts = []; for (let i = 0; i < 2400; i++) pts.push(curve.getPointAt(i / 2400));
  const plat = new THREE.MeshStandardMaterial({ color: '#bfc4c8' }), can = new THREE.MeshStandardMaterial({ color: '#d6452f', roughness: .6 });
  const stations = STATIONS.map(([lat, side, name]) => {
    const tgt = stationPoint(lat, side);
    let bi = 0, bd = 1e18; pts.forEach((p, i) => { const d = p.distanceToSquared(tgt); if (d < bd) { bd = d; bi = i; } });
    station(scene, curve, bi / 2400, H, can, plat);
    return { u: bi / 2400, name };   // where it is along the loop (0..1), for the line diagram
  });

  // train
  const { cars, trainWinMat, CAR, GAP } = train(scene, 4, '#d6452f');

  const SPEED = 24, wrap = v => ((v % 1) + 1) % 1;
  const t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), camGoal = new THREE.Vector3(), lookGoal = new THREE.Vector3(), look = new THREE.Vector3();
  let u = 0;
  function update(dt, riding, camera) {
    u = wrap(u + SPEED * dt / L);
    cars.forEach((c, i) => { const ui = wrap(u - i * (CAR + GAP) / L); curve.getPointAt(ui, t1); curve.getPointAt(wrap(ui + .0008), t2); c.position.set(t1.x, t1.y + 3.3, t1.z); c.lookAt(t2.x, t2.y + 3.3, t2.z); });
    if (riding) {
      curve.getPointAt(wrap(u + (CAR / 2 + 3) / L), t1); camGoal.set(t1.x, t1.y + 5.2, t1.z);
      curve.getPointAt(wrap(u + 90 / L), t2); lookGoal.set(t2.x, t2.y + 3, t2.z);
      camera.position.lerp(camGoal, .3); look.lerp(lookGoal, .12); camera.lookAt(look);
    }
  }
  return { curve, length: L, trainWinMat, update, cars, stations };
}

/** Platforms, canopy and stair tower at parameter u along a guideway curve of height h. */
/** raise a guideway's control points to height h above the ground under them (smoothed along the
 *  line, straight across water: terrain.js profile) */
export function liftCurve(curve, h, smooth = 150) {
  if (!terrain.on) return curve;
  const off = profile(curve.points, smooth);
  curve.points.forEach((p, i) => { p.y = h + off[i]; });
  curve.updateArcLengths(); return curve;
}

export function station(scene, curve, u, h, canopyMat, platMat) {
  const p = curve.getPointAt(u), t = curve.getTangentAt(u);
  const g = new THREE.Group(); g.position.copy(p); g.rotation.y = Math.atan2(t.x, t.z); g.userData.terrain = 'done'; scene.add(g);   // p is on the lifted beam already
  [-1, 1].forEach(k => { const b = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1, 75), platMat); b.position.set(k * 4.6, -.3, 0); b.castShadow = b.receiveShadow = true; g.add(b); });
  const c = new THREE.Mesh(new THREE.BoxGeometry(15, .7, 78), canopyMat); c.position.y = 7.5; c.castShadow = true; g.add(c);
  [[-6.5, -30], [6.5, -30], [-6.5, 0], [6.5, 0], [-6.5, 30], [6.5, 30]].forEach(([x, z]) => { const q = new THREE.Mesh(new THREE.CylinderGeometry(.4, .4, 8, 8), platMat); q.position.set(x, 3.5, z); g.add(q); });
  const drop = Math.max(2, p.y - surface(p.x + Math.cos(g.rotation.y) * 9, p.z - Math.sin(g.rotation.y) * 9));   // the stair tower reaches the ground
  const st = new THREE.Mesh(new THREE.BoxGeometry(6, drop, 6), platMat); st.position.set(9, -drop / 2, 0); st.castShadow = true; g.add(st);
  g.userData.terrain = 'done';
  return g;
}

/** A monorail train of nc cars with a coloured stripe. */
export function train(scene, nc, stripe) {
  const trainWinMat = new THREE.MeshStandardMaterial({ color: '#24364a', roughness: .2, metalness: .3, emissive: '#ffe2b0', emissiveIntensity: .8 });
  const shellMat = new THREE.MeshStandardMaterial({ color: '#f4f6f8', roughness: .35, metalness: .15 }), stripeMat = new THREE.MeshStandardMaterial({ color: stripe, roughness: .5 }), skMat = new THREE.MeshStandardMaterial({ color: '#9aa3aa' });
  const cars = [], CAR = 14, GAP = 1.2;
  for (let i = 0; i < nc; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.2, CAR), shellMat);
    const st = new THREE.Mesh(new THREE.BoxGeometry(3.26, .45, CAR - .2), stripeMat); st.position.y = -.9;
    const win = new THREE.Mesh(new THREE.BoxGeometry(3.28, 1.1, CAR - 2), trainWinMat); win.position.y = .45;
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.5, CAR - .6), skMat); skirt.position.y = -2.2;
    g.add(body, st, win, skirt);
    if (i === 0 || i === nc - 1) {
      const sg = i === 0 ? 1 : -1;
      const nose = new THREE.Mesh(new THREE.SphereGeometry(1.6, 20, 14), shellMat); nose.scale.set(1, .98, 2.4); nose.position.z = sg * CAR / 2; g.add(nose);
      const nw = new THREE.Mesh(new THREE.SphereGeometry(1.62, 20, 14, 0, Math.PI * 2, 0, Math.PI * .42), trainWinMat); nw.scale.set(1, .98, 2.4); nw.rotation.x = sg * Math.PI / 2; nw.position.set(0, .2, sg * CAR / 2); g.add(nw);
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; }); g.userData.terrain = 'done'; scene.add(g); cars.push(g);
  }
  return { cars, trainWinMat, CAR, GAP };
}

/** Square guideway beam extruded along a curve. */
export function beam(scene, curve, L) {
  const sq = new THREE.Shape(); sq.moveTo(-.9, -.8); sq.lineTo(.9, -.8); sq.lineTo(.9, .8); sq.lineTo(-.9, .8); sq.lineTo(-.9, -.8);
  const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sq, { steps: Math.round(L / 5), bevelEnabled: false, extrudePath: curve }), new THREE.MeshStandardMaterial({ color: '#e4e7ea', roughness: .5 }));
  m.castShadow = m.receiveShadow = true; m.userData.terrain = 'done'; scene.add(m); return m;
}

/** Instanced piers of height h at the given points. */
export function piers(scene, spots, h) {
  const dm = new THREE.Object3D();
  const pgm = new THREE.CylinderGeometry(.9, 1.3, h - 1, 10); pgm.translate(0, (h - 1) / 2, 0);
  const cg = new THREE.BoxGeometry(3.6, 1, 3.6); cg.translate(0, h - 1.3, 0);
  const mat = new THREE.MeshStandardMaterial({ color: '#d4d9dc', roughness: .6 });
  const ip = new THREE.InstancedMesh(pgm, mat, spots.length), ic = new THREE.InstancedMesh(cg, mat, spots.length);
  // each pier from the ground up to the beam (spots carry the beam's height when on terrain)
  spots.forEach((p, i) => { const g0 = surface(p.x, p.z), top = terrain.on ? p.y : h; dm.position.set(p.x, g0, p.z); dm.scale.set(1, (top - g0) / h, 1); dm.updateMatrix(); ip.setMatrixAt(i, dm.matrix); ic.setMatrixAt(i, dm.matrix); });
  ip.userData.terrain = ic.userData.terrain = 'done';
  ip.castShadow = ic.castShadow = true; scene.add(ip, ic);
}
