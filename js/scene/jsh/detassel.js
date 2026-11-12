// A seed-corn block on the island (data/jsh/farms.json.gz `seed`, placed by tools/jsh/build_jsh.py)
// and the crew detasseling it.
//
// Seed corn is planted in sets of four female rows, each set between two male rows, which grow
// taller and keep their tassels to pollinate the females. In July a crew walks the female rows
// pulling every tassel: four teenagers, one to a row, and behind them the crew boss. Before the
// dew burns off (about 10:30) they wear trash bags over their torsos and legs. They work from
// 6:00 to 15:00 between SEASON[0] and SEASON[1] (days of the year); otherwise the field is
// empty. They walk the sets in turn, up one and back down the next; when the block is done
// they start a second pull, and the tassels that came up since are back.
//
// The people are Kyle's jointed figures (phl/people.js geo() and pose()), each with a face; click
// one to see through their eyes, with a card about them (crewprofiles.js), the same way as the
// people on Philadelphia's Walnut St promenade. This module offers the same interface as
// phl/pedestrians.js, so js/scene/index.js and js/ui.js use it in that one's place.
import * as THREE from 'three';
import { geo, pose } from '../phl/people.js';
import { groundAt } from '../terrain.js';
import { onSeason } from '../season.js';
import { stage, cutHole, CORN_HOLE } from './farms.js';
import { detasselerProfile, bossProfile } from './crewprofiles.js';

export const SEASON = [186, 218];   // July 5 to August 6: when the tassels are out
const HOURS = [6, 15], DEW = 10.5;  // working hours; trash bags until the dew is off
const SPEED = .25, SPACING = .3;    // walking pace in the rows (m/s); plants along a row (m)
const BAG = '#16181a';

// ---- one figure: Kyle's limbs and joints, with a face, long sleeves and trousers, a cap,
// and trash bags (shown in the morning); the boss gets a scowl, a belt and a holstered pistol
function figure(spec) {
  const g = geo(1), F = { root: new THREE.Group(), mats: [] };
  const mat = (c, o = {}) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: .8, ...o }); F.mats.push(m); return m; };
  const M = { shirt: mat(spec.shirt), pants: mat(spec.pants), skin: mat(spec.skin), shoe: mat('#3a3029'), hair: mat(spec.hair), cap: mat(spec.cap),
    eye: mat('#1b1b1b'), lip: mat('#8a4a44'), bag: mat(BAG, { roughness: .32, metalness: .15 }) };
  const mesh = (gg, mm, x = 0, y = 0, z = 0, parent) => { const o = new THREE.Mesh(gg, mm); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const grp = (parent, x, y, z) => { const o = new THREE.Group(); o.position.set(x, y, z); parent.add(o); return o; };
  F.bags = [];
  F.pelvis = grp(F.root, 0, .92, 0);
  mesh(g.torso, M.shirt, 0, 0, 0, F.pelvis); mesh(g.shorts, M.pants, 0, 0, 0, F.pelvis);
  const tb = new THREE.CylinderGeometry(.205, .23, .74, 10); tb.translate(0, .22, 0);   // up to the shoulders   // a bag with holes for the head and arms
  F.bags.push(mesh(tb, M.bag, 0, 0, 0, F.pelvis));
  F.chest = grp(F.pelvis, 0, .56, 0);
  mesh(g.neck, M.skin, 0, .08, 0, F.chest);
  F.head = mesh(g.head, M.skin, 0, .17, 0, F.chest);
  const hair = g.hair.clone(); hair.rotateX(-.6); mesh(hair, M.hair, 0, .01, -.01, F.head);
  // cap: crown and a brim over the eyes
  const crown = new THREE.SphereGeometry(.118, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.1); mesh(crown, M.cap, 0, .02, -.005, F.head);
  const brim = new THREE.BoxGeometry(.17, .012, .12); mesh(brim, M.cap, 0, .035, .14, F.head);
  // face: eyes, brows (the boss's pulled down to a scowl), nose, mouth (the boss's turned down)
  for (const sx of [1, -1]) { const e = mesh(new THREE.SphereGeometry(.017, 8, 6), M.eye, sx * .038, .018, .098, F.head); if (spec.mean) e.scale.y = .45; }   // the boss squints
  // the boss's brows are thick and pulled down toward the nose
  for (const sx of [1, -1]) { const b = mesh(new THREE.BoxGeometry(.052, spec.mean ? .02 : .013, .016), M.hair, sx * .036, spec.mean ? .036 : .05, .1, F.head); if (spec.mean) b.rotation.z = sx * .55; }
  mesh(new THREE.SphereGeometry(.018, 8, 6), M.skin, 0, -.008, .106, F.head);
  if (spec.mean) for (const sx of [1, -1]) { const m = mesh(new THREE.BoxGeometry(.032, .013, .012), M.lip, sx * .015, -.052, .096, F.head); m.rotation.z = -sx * .55; }   // a frown
  else mesh(new THREE.BoxGeometry(.046, .011, .012), M.lip, 0, -.05, .096, F.head);
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    const hip = F['hip' + s] = grp(F.pelvis, sx * .1, 0, 0);
    mesh(g.thigh, M.pants, 0, 0, 0, hip);
    const lb = new THREE.CylinderGeometry(.11, .1, .47, 8); lb.translate(0, -.22, 0); F.bags.push(mesh(lb, M.bag, 0, 0, 0, hip));
    const knee = F['knee' + s] = grp(hip, 0, -.45, 0);
    mesh(g.shin, M.pants, 0, 0, 0, knee); mesh(g.foot, M.shoe, 0, -.45, 0, knee);
    const sb = new THREE.CylinderGeometry(.09, .08, .44, 8); sb.translate(0, -.21, 0); F.bags.push(mesh(sb, M.bag, 0, 0, 0, knee));
    const sh = F['sh' + s] = grp(F.chest, sx * .23, -.04, 0);
    mesh(g.upper, M.shirt, 0, 0, 0, sh);
    const el = F['el' + s] = grp(sh, 0, -.3, 0);
    mesh(g.fore, M.shirt, 0, 0, 0, el);   // long sleeves: corn leaves cut
    F['hand' + s] = mesh(g.hand, M.skin, 0, -.29, 0, el);
  }
  if (spec.mean) {   // belt, holster and pistol on the right hip
    mesh(new THREE.CylinderGeometry(.172, .172, .04, 14), mat('#2b211a'), 0, .1, 0, F.pelvis);
    const hol = grp(F.pelvis, -.18, .03, .02); hol.rotation.z = .08;
    mesh(new THREE.BoxGeometry(.045, .17, .1), mat('#3b2a1c'), 0, 0, 0, hol);
    const gun = mat('#1f2224', { roughness: .4, metalness: .6 });
    mesh(new THREE.BoxGeometry(.035, .1, .045), gun, 0, .12, -.015, hol);   // grip above the holster
  }
  F.root.scale.setScalar(spec.scale);
  F.root.traverse(o => { o.userData.grounded = true; });
  return F;
}

/** walking slowly down the row; pull (0..1) raises one arm to a tassel and snaps it down */
function workPose(F, ph, pull, arm) {
  pose(F, ph, 2.2);
  F.elL.rotation.x = F.elR.rotation.x = -.5; F.shL.rotation.z = F.shR.rotation.z = 0;
  F.pelvis.rotation.x = .04; F.pelvis.position.y = .92 + Math.abs(Math.sin(ph)) * .02; F.head.rotation.x = -.15 * pull;
  if (pull > 0) { const sh = arm ? F.shR : F.shL, el = arm ? F.elR : F.elL; sh.rotation.x = -2.75 * pull; el.rotation.x = -.25 * pull; }
}
/** the boss: a slow walk, arms folded, head turning along the rows */
function bossPose(F, ph, t) {
  pose(F, ph, 1.8);
  F.shL.rotation.x = F.shR.rotation.x = -.55; F.elL.rotation.x = F.elR.rotation.x = -1.9; F.shL.rotation.z = -.25; F.shR.rotation.z = .25;
  F.pelvis.rotation.x = -.03; F.head.rotation.y = Math.sin(t * .4) * .5;
}

// ---- corn plants: a stalk, alternate leaves arching out, and (female) an ear; unit height
export function plantGeometry(ear) {
  const pos = [], idx = [];
  const v = (x, y, z) => pos.push(x, y, z) / 3 - 1;
  // stalk: a thin five-sided tube
  const n = 5;
  for (let i = 0; i < n; i++) { const a = i / n * 6.283; v(Math.cos(a) * .02, 0, Math.sin(a) * .02); v(Math.cos(a) * .012, 1, Math.sin(a) * .012); }
  for (let i = 0; i < n; i++) { const a = i * 2, b = ((i + 1) % n) * 2; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  // leaves: alternate sides up the stalk, each a long blade that arches out and droops
  for (let k = 0; k < 7; k++) {
    const y = .22 + k * .1, s = k % 2 ? 1 : -1, L = .42 - Math.abs(k - 3) * .04, w = .06, o = pos.length / 3;
    v(0, y, -w); v(0, y, w); v(s * L * .5, y + .12, -w * .8); v(s * L * .5, y + .12, w * .8); v(s * L, y + .02, 0);
    idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3, o + 2, o + 4, o + 3);
  }
  if (ear) {   // an ear in its husk, angled out from the stalk
    const o = pos.length / 3;
    v(0, .5, 0); v(.07, .5, -.025); v(.07, .5, .025); v(.12, .66, 0);
    idx.push(o, o + 1, o + 3, o, o + 3, o + 2, o + 1, o + 2, o + 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
export function tasselGeometry() {   // a spike and four branches, 35 cm
  const pos = [], idx = [];
  const blade = (ax, ay, az, bx, by, bz) => { const o = pos.length / 3; pos.push(ax - .008, ay, az, ax + .008, ay, az, bx, by, bz, ax, ay, az - .008, ax, ay, az + .008); idx.push(o, o + 1, o + 2, o + 3, o + 4, o + 2); };
  blade(0, 0, 0, 0, .35, 0);
  for (let k = 0; k < 4; k++) { const a = k * 1.57 + .4; blade(0, .1, 0, Math.cos(a) * .14, .24, Math.sin(a) * .14); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** opts.hour(): the clock (0..24) */
export function buildDetassel(scene, seed, { hour = () => 9 } = {}) {
  const { x: cx, z: cz, a, len: L, sets: S, row: RW } = seed, R = S * 5 + 1;
  const ux = Math.cos(a), uz = Math.sin(a), vx = -uz, vz = ux;
  const at = (u, v) => [cx + ux * u + vx * v, cz + uz * u + vz * v];
  const vRow = r => (r - (R - 1) / 2) * RW;
  const group = new THREE.Group(); scene.add(group);

  // ---- the corn: one instanced mesh for the female plants, one for the male, one for the tassels
  const nAlong = Math.floor(L / SPACING) + 1, female = [], male = [];
  for (let r = 0; r < R; r++) for (let i = 0; i < nAlong; i++) {
    const u = -L / 2 + i * SPACING + (Math.random() - .5) * .08, [x, z] = at(u, vRow(r) + (Math.random() - .5) * .06);
    (r % 5 ? female : male).push({ x, z, y: groundAt(x, z), ry: a + Math.PI / 2 + (Math.random() - .5) * .9, j: .92 + Math.random() * .14, r, u });
  }
  const leafMat = new THREE.MeshStandardMaterial({ color: '#4f7f30', roughness: .9, side: THREE.DoubleSide });
  const tasMat = new THREE.MeshStandardMaterial({ color: '#d2b866', roughness: .9, side: THREE.DoubleSide });
  const fm = new THREE.InstancedMesh(plantGeometry(true), leafMat, female.length), mm = new THREE.InstancedMesh(plantGeometry(false), leafMat, male.length);
  const tf = new THREE.InstancedMesh(tasselGeometry(), tasMat, female.length), tm = new THREE.InstancedMesh(tasselGeometry(), tasMat, male.length);
  // like every corn field (cornlod.js), the plants stand only in the circle around the camera
  // (CORN_HOLE); everywhere else the block is under its field's canopy (the field isn't cut for it)
  cutHole(leafMat, true); cutHole(tasMat, true);
  const plantDepth = cutHole(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), true);
  for (const m of [fm, mm, tf, tm]) { m.frustumCulled = false; m.castShadow = m.receiveShadow = true; m.userData.grounded = true; m.customDepthMaterial = plantDepth; group.add(m); }
  const [x0, z0] = at(0, 0);

  // which female tassels are pulled (index into `female`); each set's rows in walking order
  const pulled = new Uint8Array(female.length), rowIdx = new Map();
  female.forEach((p, k) => { if (!rowIdx.has(p.r)) rowIdx.set(p.r, []); rowIdx.get(p.r).push(k); });
  let heightF = 0, heightM = 0, tassels = false;
  const o = new THREE.Object3D(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const placePlant = (im, p, k, h) => { o.position.set(p.x, p.y, p.z); o.rotation.set(0, p.ry, 0); o.scale.set(p.j, h * p.j, p.j); o.updateMatrix(); im.setMatrixAt(k, o.matrix); };
  const placeTassel = (im, p, k, h, show) => {
    if (!show) { im.setMatrixAt(k, ZERO); return; }
    o.position.set(p.x, p.y + h * p.j - .05, p.z); o.rotation.set(0, p.ry, 0); o.scale.setScalar(.9 + p.j * .3); o.updateMatrix(); im.setMatrixAt(k, o.matrix);
  };
  function setTassels() {
    female.forEach((p, k) => placeTassel(tf, p, k, heightF, tassels && !pulled[k]));
    male.forEach((p, k) => placeTassel(tm, p, k, heightM, tassels));
    tf.instanceMatrix.needsUpdate = tm.instanceMatrix.needsUpdate = true;
  }
  let inSeason = false;
  onSeason(st => {
    const s = stage('corn', st.day, 0);
    // seed-corn parents are short inbreds: the females about 2 m when the tassels are out (a
    // detasseler's head and arms show above them), the male rows half a metre taller
    heightF = s.canopy * .76; heightM = s.canopy * .96;
    tassels = st.day >= 180 && st.day < 282 && s.canopy > 2;
    female.forEach((p, k) => placePlant(fm, p, k, heightF)); male.forEach((p, k) => placePlant(mm, p, k, heightM));
    fm.instanceMatrix.needsUpdate = mm.instanceMatrix.needsUpdate = true;
    if (s.top) leafMat.color.copy(s.top);
    tasMat.color.set(st.day > 225 ? '#9c8358' : '#d2b866');
    for (const m of [fm, mm, tf, tm]) m.userData.on = s.canopy > .05;
    inSeason = st.day >= SEASON[0] && st.day <= SEASON[1];
    if (!inSeason) pulled.fill(0);   // a new summer: every tassel is back
    setTassels();
  });

  // ---- the crew
  const SKIN = ['#e0b48f', '#f0c9a6', '#c99370', '#d9a77e', '#8d5a3c'], HAIR = ['#6b4a2b', '#2a1d16', '#c9a25a', '#3a2a20', '#a07a4a'];
  const SHIRT = ['#2f4a6b', '#8c2f2f', '#7a8c99', '#3d6b4a', '#d9b44a'], PANTS = ['#3a4a5a', '#2e3542', '#4a5a6b', '#5a4a3a'], CAP = ['#c86a3a', '#1f2a33', '#e8e4da', '#3d6b4a'];
  const crew = [0, 1, 2, 3].map(i => ({ i, prof: detasselerProfile(i), spec: { shirt: SHIRT[i], pants: PANTS[i], skin: SKIN[i], hair: HAIR[i], cap: CAP[i] } }))
    .concat([{ i: 4, prof: bossProfile(), spec: { shirt: '#5b5a3c', pants: '#4a4034', skin: '#c99370', hair: '#3a2a20', cap: '#4f553a', mean: true } }]);
  if (crew[4].prof.grey) crew[4].spec.hair = '#9a9a96';
  crew.forEach(P => { P.spec.scale = P.prof.scale; P.F = figure(P.spec); group.add(P.F.root); P.ph = Math.random() * 6; P.pullT = Math.random() * 1.4; P.arm = P.i % 2; });

  // the route: each set walked in turn (up one, back down the next), then around again
  const CROSS = 5 * RW, legs = [];
  for (let k = 0; k < S; k++) { const dir = k % 2 ? -1 : 1; legs.push({ k, dir, len: L + 2 }); if (k < S - 1) legs.push({ cross: true, from: k, to: k + 1, end: dir, len: CROSS + 2 }); }
  legs.push({ cross: true, from: S - 1, to: 0, end: (S - 1) % 2 ? -1 : 1, len: (S - 1) * 5 * RW + 4, wrap: true });
  const LOOP = legs.reduce((s, l) => s + l.len, 0);
  let D = 0, pass = 1;
  const setV = k => vRow(5 * k + 2.5);
  /** where the crew is: leg, how far along it, and each person's [u, v, heading] */
  function where() {
    let d = D % LOOP, leg = legs[0];
    for (const l of legs) { if (d < l.len) { leg = l; break; } d -= l.len; }
    const out = [];
    if (!leg.cross) {
      const u0 = -leg.dir * (L / 2 + 1), u = u0 + leg.dir * d, h = leg.dir;
      for (let j = 0; j < 4; j++) out.push([u - leg.dir * (j % 2) * .6, vRow(5 * leg.k + 1 + j) + RW / 2, h]);
      out.push([u - leg.dir * 3.5, setV(leg.k), h]);   // the boss, a few steps behind
      return { leg, out, u };
    }
    // crossing the headland to the next set (or back to the first)
    const t = d / leg.len, ue = leg.end * (L / 2 + 1.5), v0 = setV(leg.from), v1 = setV(leg.to), sv = Math.sign(v1 - v0);
    for (let j = 0; j < 5; j++) out.push([ue, (j < 4 ? vRow(5 * leg.from + 1 + j) + RW / 2 : v0) + (v1 - v0) * t, 0, sv]);
    return { leg, out, u: ue };
  }
  // tassels pulled as each detasseler passes them
  function pullTo(leg, u) {
    for (let j = 0; j < 4; j++) {
      const list = rowIdx.get(5 * leg.k + 1 + j), reach = u - leg.dir * (j % 2) * .6 + leg.dir * .3;
      for (const k of list) if (!pulled[k] && (leg.dir > 0 ? female[k].u <= reach : female[k].u >= reach)) { pulled[k] = 1; placeTassel(tf, female[k], k, heightF, false); tf.instanceMatrix.needsUpdate = true; }
    }
  }

  // "Go to: Detasseling crew": just behind and beside the crew, wherever they are (kept up to date;
  // the camera flight reads it as it goes)
  const view = { id: 'crew', name: 'Detasseling crew', pos: new THREE.Vector3(x0 + vx * 14, groundAt(x0, z0) + 9, z0 + vz * 14), target: new THREE.Vector3(x0, groundAt(x0, z0) + 1, z0) };
  let inside = null, clock = 0, working = false, lastLeg = null;
  const look = { yaw: 0, pitch: 0 };
  function update(dt, camera) {
    clock += dt;
    const h = hour(), on = inSeason && h >= HOURS[0] && h < HOURS[1] && fm.userData.on;
    working = on || !!inside;
    // plants only when the circle of real corn reaches the block (half its length plus the plants' reach)
    const hl = CORN_HOLE.value, reachBlock = hl.z > 0 && Math.hypot(hl.x - x0, hl.y - z0) < hl.z + 4 + L / 2 + 10;
    fm.visible = mm.visible = tf.visible = tm.visible = reachBlock && fm.userData.on;
    const far = camera.position.distanceTo(new THREE.Vector3(x0, camera.position.y, z0)) > 300 && camera.position.y - groundAt(x0, z0) > 60;
    crew.forEach(P => { P.F.root.visible = working && !far; });
    if (!working || (far && !inside)) return;
    D += SPEED * dt;
    const w = where();
    if (w.leg !== lastLeg) { if (w.leg === legs[0] && lastLeg && lastLeg.wrap) { pass++; pulled.fill(0); setTassels(); } lastLeg = w.leg; }
    if (!w.leg.cross && tassels) pullTo(w.leg, w.u);
    const bags = h < DEW;
    crew.forEach((P, j) => {
      const [u, v, hd, sv] = w.out[j], [x, z] = at(u, v);
      // heading: along the rows, or across them on the headland
      const dx = hd ? ux * hd : vx * sv, dz = hd ? uz * hd : vz * sv;
      P.x = x; P.z = z; P.h = Math.atan2(dx, dz);
      P.ph += SPEED * dt * 4.2;
      P.pullT += dt; const cyc = (P.pullT % 1.4) / 1.4;
      const pull = j < 4 && !w.leg.cross && tassels ? Math.max(0, Math.sin(Math.min(1, cyc / .45) * Math.PI)) : 0;
      P.arm = Math.floor(P.pullT / 1.4) % 2;
      if (j < 4) workPose(P.F, P.ph, pull, P.arm); else bossPose(P.F, P.ph, clock);
      P.F.bags.forEach(b => { b.visible = bags && j < 4; });
      P.F.head.visible = P !== inside;
      P.F.root.position.set(x, groundAt(x, z), z); P.F.root.rotation.y = P.h;
      P.leg = w.leg;
    });
    const B = crew[4], gy = groundAt(B.x, B.z), hx = Math.sin(B.h), hz = Math.cos(B.h);
    view.target.set(crew[1].x, gy + 1.3, crew[1].z);
    view.pos.set(B.x - hx * 7 + hz * 6, gy + 6, B.z - hz * 7 - hx * 6);
  }

  // ---- seeing through their eyes (the same calls as phl/pedestrians.js)
  const pv = new THREE.Vector3();
  function pickPerson(camera, x, y, w, h) {
    if (!working) return null;
    const f = h / (2 * Math.tan(camera.fov * Math.PI / 360)), cp = camera.position; let best = null;
    for (const P of crew) {
      if (P === inside || P.x === undefined) continue;
      const cy = groundAt(P.x, P.z) + 1.25 * P.prof.scale, dist = Math.hypot(P.x - cp.x, cy - cp.y, P.z - cp.z); if (dist > 300) continue;
      pv.set(P.x, cy, P.z).project(camera); if (pv.z > 1) continue;
      const d = Math.hypot((pv.x + 1) / 2 * w - x, (1 - pv.y) / 2 * h - y), tol = Math.max(10, f * .45 / dist);
      if (d < tol && (!best || d / tol < best.r)) best = { person: P.i, r: d / tol };
    }
    return best && { person: best.person };
  }
  function inhabit(i) { inside = crew[i] || null; look.yaw = 0; look.pitch = 0; return getInhabited(); }
  function leave() {
    if (!inside) return null;
    const P = inside; inside = null; P.F.head.visible = true;
    const p = new THREE.Vector3(P.x, groundAt(P.x, P.z), P.z), dir = new THREE.Vector3(Math.sin(P.h), 0, Math.cos(P.h));
    return { p, dir, cam: p.clone().addScaledVector(dir, -14).add(new THREE.Vector3(0, 7, 0)) };
  }
  function activity(P) {
    const leg = P.leg, h = hour();
    if (!leg) return '';
    if (P.prof.boss) {
      if (leg.cross) return 'Hollering at the crew to line up on the next set';
      const slow = crew[Math.floor(clock / 27) % 4];
      return Math.floor(clock / 9) % 3 === 0 ? `Yelling at ${slow.prof.name.split(' ')[0]} about a missed tassel` : `Following the crew down set ${leg.k + 1}, checking for missed tassels`;
    }
    const bag = h < DEW ? ', in a trash bag against the dew' : '';
    if (leg.cross) return `Crossing the headland to the next set${bag}`;
    const row = 5 * leg.k + 2 + P.i, done = rowIdx.get(row - 1).filter(k => pulled[k]).length, left = rowIdx.get(row - 1).length - done;
    return `Pulling tassels in row ${row}${pass > 1 ? ' (second pull)' : ''}${bag}: ${left * SPACING | 0} m to the end`;
  }
  function getInhabited() {
    if (!inside) return null;
    const p = inside.prof;
    return { kind: 'person', id: inside.i, name: p.name, sex: p.sex, age: p.age, height: p.height, kg: p.kg, lb: p.lb, bio: p.bio, now: activity(inside) };
  }
  const lookAt = (dx, dy) => { look.yaw = Math.max(-2.2, Math.min(2.2, look.yaw - dx * .0045)); look.pitch = Math.max(-1.1, Math.min(1.1, look.pitch - dy * .0045)); };
  const eye = new THREE.Vector3(), fwd = new THREE.Vector3();
  function inhabitFrame(camera) {
    const P = inside; if (!P) return;
    P.F.root.updateMatrixWorld(true); P.F.head.getWorldPosition(eye); eye.y += .04;
    eye.x += Math.sin(P.h) * .1; eye.z += Math.cos(P.h) * .1;
    const a2 = P.h + look.yaw, pt = look.pitch - .05; fwd.set(Math.sin(a2) * Math.cos(pt), Math.sin(pt), Math.cos(a2) * Math.cos(pt));
    camera.position.copy(eye); camera.up.set(0, 1, 0); camera.lookAt(eye.x + fwd.x, eye.y + fwd.y, eye.z + fwd.z);
  }
  // a head-and-shoulders portrait for the card: a fresh figure in their colours, facing the camera
  let pr = null;
  function portrait(i, size = 176) {
    const P = crew[i]; if (!P) return null;
    if (!pr) {
      const canvas = document.createElement('canvas');
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(28, 1, .05, 10);
      sc.add(new THREE.HemisphereLight('#fff4e6', '#4a5560', .85));
      const key = new THREE.DirectionalLight('#ffffff', .75); key.position.set(.6, 1.2, 1.4); sc.add(key);
      pr = { canvas, renderer, sc, cam, bust: null };
    }
    pr.renderer.setSize(size, size, false);
    if (pr.bust) { pr.sc.remove(pr.bust.root); pr.bust.mats.forEach(m => m.dispose()); }
    const F = pr.bust = figure({ ...P.spec, scale: 1 }); pose(F, 0, 0);
    F.bags.forEach(b => { b.visible = hour() < DEW && !P.prof.boss; });
    pr.sc.add(F.root); F.root.updateMatrixWorld(true);
    const head = F.head.getWorldPosition(new THREE.Vector3());
    pr.cam.position.set(head.x + .06, head.y - .02, head.z + .78); pr.cam.lookAt(head.x, head.y - .1, head.z);
    pr.renderer.render(pr.sc, pr.cam);
    return pr.canvas;
  }
  const setVisible = on => { group.visible = on; if (!on) inside = null; };
  return { update, view, people: crew, pickPerson, inhabit, leave, getInhabited, lookAt, inhabitFrame, portrait, setVisible };
}
