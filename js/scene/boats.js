// River boats (data/boats.json, tools/build_boats.py): a proposed water-taxi network covering
// the whole of the Philadelphia riverfront on both rivers, plus the real RiverLink Ferry across
// the Delaware to Camden. Each stop gets a pier from the real bank out to where the boat ties
// up, with a shelter; boats run out and back, easing in and dwelling at every stop. They can be
// boarded like any train (subway.js registerFleet, kind 'boat'): the cabin is walkable.
import * as THREE from 'three';
import { pairs } from '../data.js';
import { litMats } from './materials.js';

const WATER_Y = .6, LEN = 22, BEAM = 6.2, VMAX = 9, DWELL = 18;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** an out-and-back run along a polyline: s in [0, L), outbound first */
function loopRun(P) {
  const Q = [...P, ...P.slice(0, -1).reverse()], S = [0];
  for (let i = 1; i < Q.length; i++) S.push(S[i - 1] + Q[i].distanceTo(Q[i - 1]));
  const L = S[S.length - 1];
  return { L, half: S[P.length - 1], P: Q, S, at(s, out) {
    s = ((s % L) + L) % L; let lo = 0, hi = S.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
    return out.lerpVectors(Q[lo], Q[hi], (s - S[lo]) / ((S[hi] - S[lo]) || 1));
  } };
}

/** the boat: white hull with a pointed bow, a cabin with a band of windows, the wheelhouse on
 *  top forward, a roof in the line's colour and a railed open deck at the stern */
function boatModel(color, winMat) {
  const g = new THREE.Group(), white = new THREE.MeshStandardMaterial({ color: '#f3f4f2', roughness: .45 });
  const line = new THREE.MeshStandardMaterial({ color, roughness: .5 }), dark = new THREE.MeshStandardMaterial({ color: '#2a3138', roughness: .6 });
  const hw = BEAM / 2, s = new THREE.Shape();
  s.moveTo(-hw, -LEN / 2); s.lineTo(hw, -LEN / 2); s.lineTo(hw, LEN / 2 - 5); s.quadraticCurveTo(hw * .9, LEN / 2 - 1, 0, LEN / 2 + .6);
  s.quadraticCurveTo(-hw * .9, LEN / 2 - 1, -hw, LEN / 2 - 5); s.lineTo(-hw, -LEN / 2);
  const hull = new THREE.ExtrudeGeometry(s, { depth: 1.9, bevelEnabled: false }); hull.rotateX(Math.PI / 2); hull.translate(0, 1.0, 0);   // top just under the cabin floor (1.05)
  const add = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  add(hull, white);
  const band = new THREE.ExtrudeGeometry(s, { depth: .35, bevelEnabled: false }); band.rotateX(Math.PI / 2); band.scale(1.01, 1, 1.004); band.translate(0, .55, 0); add(band, line);
  // cabin walls (their floor at 1.05 m: the rideable interior sits exactly here, and these
  // outer walls are hidden while someone is aboard: the shell)
  const cab = (w, h, l, y, z, m) => add(new THREE.BoxGeometry(w, h, l), m, 0, y, z);
  g.userData.shell = [cab(BEAM - .7, .9, 13, 1.5, -1, white), cab(BEAM - .66, 1.1, 12.6, 2.5, -1, winMat), cab(BEAM - .7, .4, 13, 3.25, -1, white)];
  cab(BEAM - .3, .22, 14, 3.66, -1, line);   // roof, clear of the interior's ceiling
  cab(3, 1.3, 2.8, 4.42, 3.4, winMat); cab(3.3, .2, 3.1, 5.15, 3.4, line);   // wheelhouse
  // the open stern deck: planking, railings on posts (waist high), a bench across the stern
  const wood = new THREE.MeshStandardMaterial({ color: '#9b7b5a', roughness: .85 });
  add(new THREE.BoxGeometry(BEAM - .5, .05, 3.4), wood, 0, 1.075, -9.2);
  for (const y of [1.6, 2.1]) {
    for (const x of [-hw + .15, hw - .15]) add(new THREE.BoxGeometry(.06, .06, 3.3), dark, x, y, -9.2);
    add(new THREE.BoxGeometry(BEAM - .3, .06, .06), dark, 0, y, -10.85);
  }
  for (const x of [-hw + .15, hw - .15]) for (const z of [-7.6, -9.2, -10.85]) add(new THREE.BoxGeometry(.06, 1.05, .06), dark, x, 1.6, z);
  for (const x of [-1, 1]) add(new THREE.BoxGeometry(.06, 1.05, .06), dark, x, 1.6, -10.85);
  add(new THREE.BoxGeometry(BEAM - 1.4, .08, .45), wood, 0, 1.5, -10.35); add(new THREE.BoxGeometry(BEAM - 1.4, .5, .07), wood, 0, 1.8, -10.6);
  add(new THREE.BoxGeometry(BEAM - 1.4, .45, .3), dark, 0, 1.27, -10.35);
  add(new THREE.CylinderGeometry(.08, .08, 2.6, 6), dark, 0, 6.4, 3.4);   // mast with a light
  return g;
}

/** a pier from the bank (sx, sz) to the landing (x, z): deck on pilings, a float and a shelter */
function pier(scene, st, color, mats) {
  const a = V(st.sx, 0, st.sz), b = V(st.x, 0, st.z), d = b.clone().sub(a), L = d.length(), ry = Math.atan2(d.x, d.z);
  const g = new THREE.Group(); g.position.copy(a); g.rotation.y = ry; scene.add(g);
  const part = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  // the boat's centre line passes through (x, z): the pier stops short of its hull, and a float
  // along the channel takes passengers down to deck level
  const D = L - BEAM / 2 - 3.2;
  part(new THREE.BoxGeometry(4, .4, D), mats.deck, 0, 2.1, D / 2);
  for (let z = 4; z < D - 1; z += 8) for (const x of [-1.8, 1.8]) part(new THREE.CylinderGeometry(.22, .22, 2.3, 6), mats.pile, x, .95, z);
  for (const x of [-2, 2]) part(new THREE.BoxGeometry(.06, .9, D), mats.rail, x, 2.75, D / 2);
  part(new THREE.BoxGeometry(LEN * .8, .5, 3), mats.deck, 0, 1.0, D + 1.5);
  part(new THREE.BoxGeometry(6, .14, 3.2), mats.roof(color), 0, 3.6, D + 1.5);   // shelter on the float
  for (const x of [-2.7, 2.7]) for (const z of [D + .2, D + 2.8]) part(new THREE.CylinderGeometry(.07, .07, 2.4, 6), mats.rail, x, 2.45, z);
  return g;
}

export function buildBoats(scene, data) {
  const winMat = new THREE.MeshStandardMaterial({ color: '#25384a', roughness: .2, metalness: .3, emissive: '#ffe2b0', emissiveIntensity: 0 });
  winMat.userData.lit = .7; litMats.push(winMat);
  const roofs = {}, mats = {
    deck: new THREE.MeshStandardMaterial({ color: '#8a7a68', roughness: .9 }), pile: new THREE.MeshStandardMaterial({ color: '#4c4038', roughness: 1 }),
    rail: new THREE.MeshStandardMaterial({ color: '#3a4046', roughness: .6 }), roof: c => roofs[c] || (roofs[c] = new THREE.MeshStandardMaterial({ color: c, roughness: .6 })),
  };
  const slots = [], lines = [], routes = [], labels = [], fleet = [], seen = new Set();
  for (const ln of data.lines) {
    const P = pairs(ln.p).map(([x, z]) => V(x, WATER_Y, z)), run = loopRun(P), id = 'boat:' + ln.id;
    // stops on the way out and the way back, in loop order (the next-stop sign and line diagram)
    run.stops = [...ln.stops.map(s => ({ s: Math.min(s.s, run.half - .01), t: s.t })), ...ln.stops.slice(0, -1).reverse().map(s => ({ s: run.L - s.s, t: s.t }))].sort((a, b) => a.s - b.s);
    // the line diagram (subway.js rideStrip): out to the last stop and back, known exactly
    const fold = s => (s <= run.half ? s / run.half : (run.L - s) / (run.L - run.half));
    run.strip = { back: true, out: run.half, u: s => ((s % run.L) + run.L) % run.L, fold, stops: ln.stops.map(st => ({ t: st.t, f: Math.min(1, st.s / run.half) })) };
    const name = ln.name + (ln.proposed ? ' (proposed)' : '');
    routes.push({ id, color: ln.color, kind: 'boat', P });
    lines.push({ id, name, color: ln.color, hint: `You’re aboard a ${ln.proposed ? 'river boat' : 'RiverLink ferry'} on the ${ln.name}, calling at every pier on its route and back.` });
    for (const st of ln.stops) {
      if (seen.has(st.t)) continue; seen.add(st.t);
      pier(scene, st, ln.color, mats);
      labels.push({ text: st.t, pos: V(st.x, 9, st.z), stn: 'boat', far: 4500 });
    }
    // boats spread evenly round the loop, one per 6 km of route (at least one)
    const n = Math.max(1, Math.round(run.half / 6000));
    for (let k = 0; k < n; k++) {
      const model = boatModel(ln.color, winMat); scene.add(model);
      const sl = { line: id, lineName: name, led: ln.name, color: ln.color, k, c: 0, run, s: run.L * k / n, dwell: 0, pos: V(0, 0, 0), dir: V(0, 0, 1), q: new THREE.Quaternion(), hidden: false,
        model, bob: k * 1.7, sync() {}, onBoard(on) { model.userData.shell.forEach(m => { m.visible = !on; }); } };   // aboard: the walkable cabin replaces the outer walls; hull and deck stay
      slots.push(sl); fleet.push(sl);
    }
  }
  const a = V(0, 0, 0), b = V(0, 0, 0), fwd = V(0, 0, 1);
  let t = 0;
  function place(sl) {
    const r = sl.run;
    r.at(sl.s + 5, a); r.at(sl.s - 5, b); sl.dir.subVectors(a, b).setY(0); if (sl.dir.lengthSq() < 1e-6) sl.dir.set(0, 0, 1); sl.dir.normalize();
    r.at(sl.s, sl.pos); sl.pos.y = WATER_Y - .15 + Math.sin(t * 1.3 + sl.bob) * .06;
    sl.q.setFromUnitVectors(fwd, sl.dir);
    sl.model.position.copy(sl.pos); sl.model.quaternion.copy(sl.q);
    sl.model.rotateZ(Math.sin(t * .9 + sl.bob) * .012);   // a gentle roll
  }
  function update(dt) {
    t += dt;
    for (const sl of fleet) {
      if (sl.dwell > 0) sl.dwell -= dt;
      else {
        // ease in to the next stop ahead on the loop, then tie up for a while
        const r = sl.run, s = ((sl.s % r.L) + r.L) % r.L;
        const nx = r.stops.find(o => o.s > s + .5) || { s: r.stops[0].s + r.L }, d = nx.s - s;
        const v = Math.min(VMAX, 1.2 + d * .08), step = v * dt;
        if (d <= step) { sl.s = nx.s % r.L; sl.dwell = DWELL; } else sl.s = s + step;
      }
      place(sl);
    }
  }
  update(0);
  return { slots, lines, routes, labels, update, spec: { car: LEN } };
}
