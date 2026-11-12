// PROPOSAL: people on the Walnut St promenade (promenade.js). About 200 of them stroll up and
// down the walking lanes either side of the streetcar track, go into the shops (through the
// doors, and back out again later), and sit on the benches and at the cafe tables, drinking
// coffee or reading a book.
//
// The bodies are Kyle's jointed figures (people.js: the same limb geometry, joint layout and
// running pose), drawn instanced: one InstancedMesh per body part for the whole crowd, so 200
// people cost about 15 draw calls. Each person has a light skeleton of Object3D joints that is
// posed on the CPU, and every part's world matrix is copied into its instance.
//
// Routes are planned in the street's own coordinates (s along Walnut, o across it) and checked
// once at load against everything on the paving (lamps, benches, planters, trees, cafe tables):
// a seat or a door whose walk-up path isn't clear is never used.
import * as THREE from 'three';
import { geo, pose } from './people.js';
import { makeProfile, SHOPS } from './profiles.js';
import { pullBack } from './promenade.js';

const LANE = [2.4, 3.5];          // walking lanes (|o|): clear of the streetcar and of the kerb furniture
const SPEED = [1.05, 1.5];        // walking speeds, m/s
const NEAR = 250;                 // pick seats and shops within this distance along the street
const BODY = .35;                 // a person's clearance when checking routes
const SKIN = ['#8d5a3c', '#c99370', '#e0b48f', '#6b4430', '#b07a55', '#f0c9a6', '#a8704c', '#d9a77e'];
const HAIR = ['#1d1410', '#3a2a20', '#6b4a2b', '#2a1d16', '#a07a4a', '#8a8a86', '#c9a25a', '#4a2318'];
const SHIRT = ['#e8e4da', '#2f4a6b', '#8c2f2f', '#3d6b4a', '#d9b44a', '#5a4a6b', '#c86a3a', '#f2f2ee', '#1f2a33', '#7a8c99', '#b85c7a', '#4a6b8c'];
const PANTS = ['#2e3542', '#1b1f27', '#5a4a3a', '#3a4a5a', '#7a6a55', '#2a2a2a', '#4a5a6b', '#c9bfa8'];
const SHOE = ['#222222', '#e6e6e6', '#5a3a2a', '#3a3a3a', '#8c2f2f'];
const BOOK = ['#8c2f2f', '#2f4a6b', '#3d6b4a', '#d9b44a', '#e8e4da', '#5a4a6b'];
const pick = a => a[Math.floor(Math.random() * a.length)];
const rnd = (a, b) => a + Math.random() * (b - a);

/** a skeleton with Kyle's joint layout (people.js makeFigure), without meshes */
function rig() {
  const n = (parent, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); if (parent) parent.add(o); return o; };
  const root = n(null, 0, 0, 0), F = { root };
  F.pelvis = n(root, 0, .92, 0); F.chest = n(F.pelvis, 0, .56, 0);
  F.neck = n(F.chest, 0, .08, 0); F.head = n(F.chest, 0, .17, 0); F.hair = n(F.head, 0, .01, -.01);
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    F['hip' + s] = n(F.pelvis, sx * .1, 0, 0); F['knee' + s] = n(F['hip' + s], 0, -.45, 0); F['foot' + s] = n(F['knee' + s], 0, -.45, 0);
    F['sh' + s] = n(F.chest, sx * .23, -.04, 0); F['el' + s] = n(F['sh' + s], 0, -.3, 0); F['hand' + s] = n(F['el' + s], 0, -.29, 0);
  }
  return F;
}
// body parts: [geometry in people.js geo(), joints it hangs from, colour]
const PARTS = [
  ['torso', ['pelvis'], 'shirt'], ['shorts', ['pelvis'], 'pants'], ['neck', ['neck'], 'skin'], ['head', ['head'], 'skin'],
  ['hairF', ['hair'], 'hair'], ['upper', ['shL', 'shR'], 'shirt'], ['fore', ['elL', 'elR'], 'arm'], ['hand', ['handL', 'handR'], 'skin'],
  ['thigh', ['hipL', 'hipR'], 'pants'], ['shin', ['kneeL', 'kneeR'], 'leg'], ['foot', ['footL', 'footR'], 'shoe'],
  // a face (so it shows in the portrait and up close): eyes, brows, nose, mouth; long hair for some
  ['eyeL', ['head'], 'eye'], ['eyeR', ['head'], 'eye'], ['browL', ['head'], 'hair'], ['browR', ['head'], 'hair'],
  ['nose', ['head'], 'skin'], ['mouth', ['head'], 'lip'], ['longhair', ['head'], 'hair', 'long'],
];
/** Kyle's limb geometry, plus the face and a hair cap tilted back to show the forehead */
function crowdGeometry() {
  const G = { ...geo(1) };
  const at = (g, x, y, z) => { g.translate(x, y, z); return g; };
  G.hairF = G.hair.clone(); G.hairF.rotateX(-.6);
  G.eyeL = at(new THREE.SphereGeometry(.017, 8, 6), .038, .022, .098); G.eyeR = at(new THREE.SphereGeometry(.017, 8, 6), -.038, .022, .098);
  G.browL = at(new THREE.BoxGeometry(.045, .011, .012), .039, .05, .093); G.browR = at(new THREE.BoxGeometry(.045, .011, .012), -.039, .05, .093);
  G.nose = at(new THREE.SphereGeometry(.018, 8, 6), 0, -.008, .106); G.mouth = at(new THREE.BoxGeometry(.046, .011, .012), 0, -.05, .096);
  G.longhair = at(new THREE.BoxGeometry(.22, .25, .08), 0, -.075, -.07);
  return G;
}

/** walking: Kyle's running pose, toned down to a stroll */
function walkPose(F, ph) {
  pose(F, ph, 3.4);
  F.elL.rotation.x = F.elR.rotation.x = -.25; F.shL.rotation.z = F.shR.rotation.z = 0;
  F.pelvis.rotation.x = .03; F.pelvis.position.y = .92 + Math.abs(Math.sin(ph)) * .025; F.head.rotation.x = 0;
}
/** k: 0 standing .. 1 seated; act: 'coffee' | 'book' | 'rest'; sip 0..1 lifts the cup */
function sitPose(F, k, act, sip, hip) {
  pose(F, 0, 0);
  F.pelvis.position.y = .92 + (hip - .92) * k; F.pelvis.rotation.x = -.04 * k;
  F.hipL.rotation.x = F.hipR.rotation.x = -1.45 * k; F.kneeL.rotation.x = F.kneeR.rotation.x = 1.6 * k;
  F.shL.rotation.z = F.shR.rotation.z = 0; F.head.rotation.x = 0;
  F.shL.rotation.x = F.shR.rotation.x = -.3 * k; F.elL.rotation.x = F.elR.rotation.x = -.3 - .75 * k;   // hands in the lap
  if (act === 'coffee') { F.shR.rotation.x = (-.5 - sip * .3) * k; F.elR.rotation.x = -.3 - (.9 + sip * 1.35) * k; F.head.rotation.x = .08 * k * (1 - sip); }
  if (act === 'book') {
    F.shL.rotation.x = F.shR.rotation.x = -.75 * k; F.shL.rotation.z = -.32 * k; F.shR.rotation.z = .32 * k;
    F.elL.rotation.x = F.elR.rotation.x = -.3 - .85 * k; F.head.rotation.x = .38 * k;
  }
}

export function buildPedestrians(scene, nav, count = 200) {
  const { at, project, seats, doors, obst, pave } = nav, L = nav.length, gr = nav.ground || (() => 0);   // gr: the street's real height there

  // ---- which seats and doors can be reached: the walk from the lane must be clear
  const segDist = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz; const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0; return Math.hypot(px - ax - dx * t, pz - az - dz * t); };
  const OG = new Map(), ok = (x, z) => Math.floor(x / 10) + ',' + Math.floor(z / 10);
  obst.forEach(o => { const k = ok(o[0], o[1]); (OG.get(k) || OG.set(k, []).get(k)).push(o); });
  const near = (x, z) => { const out = [], i = Math.floor(x / 10), j = Math.floor(z / 10); for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) out.push(...(OG.get(a + ',' + b) || [])); return out; };
  /** is the straight walk a -> b clear? things within `skip` m of `tx, tz` (the target itself) don't count */
  function clear(ax, az, bx, bz, tx = 0, tz = 0, skip = 0) {
    const L2 = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L2 / 8));
    const seen = new Set();
    for (let k = 0; k <= n; k++) for (const o of near(ax + (bx - ax) * k / n, az + (bz - az) * k / n)) {
      if (seen.has(o)) continue; seen.add(o);
      if (skip && Math.hypot(o[0] - tx, o[1] - tz) < skip) continue;
      if (segDist(o[0], o[1], ax, az, bx, bz) < o[2] + BODY) return false;
    }
    return true;
  }
  const laneO = side => side * rnd(LANE[0], LANE[1]);
  // the lane point a target is walked up to from, at the middle of the walking lane
  const entry = (x, z) => { const p = project(x, z), side = Math.sign(p.o) || 1, q = at(p.s, side * (LANE[0] + LANE[1]) / 2); return { s: p.s, side, x: q.x, z: q.z }; };
  for (const st of seats) {
    // a bench seats two, side by side; a cafe chair one
    const rx = Math.cos(st.ry), rz = -Math.sin(st.ry);
    st.slots = st.kind === 'bench' ? [-.45, .45] : [0];
    st.occ = st.slots.map(() => null);
    st.e = entry(st.ax, st.az);
    st.ok = st.e.s > 3 && st.e.s < L - 3 && clear(st.e.x, st.e.z, st.ax, st.az, st.x, st.z, st.kind === 'bench' ? 1.05 : .9);
    st.rx = rx; st.rz = rz;
  }
  for (const d of doors) {
    d.ox = d.x + d.nx * .5; d.oz = d.z + d.nz * .5;      // just outside the door
    d.ix = d.x - d.nx * 1.6; d.iz = d.z - d.nz * 1.6;    // inside the shop
    d.e = entry(d.ox, d.oz); d.shop = SHOPS[Math.floor(Math.abs(Math.sin(d.x * 12.9898 + d.z * 78.233) * 43758.5453) % 1 * SHOPS.length)];
    d.ok = d.e.s > 3 && d.e.s < L - 3 && clear(d.e.x, d.e.z, d.ox, d.oz);
  }
  const okSeats = seats.map((st, i) => i).filter(i => seats[i].ok), okDoors = doors.filter(d => d.ok);

  // ---- shop doors: a wooden leaf with a lit glass panel, hinged on one side, that swings into
  // the shop while someone goes in or out
  const leafG = new THREE.BoxGeometry(.94, 2.2, .05); leafG.translate(.47, 1.1, 0);
  const glassG = new THREE.PlaneGeometry(.6, 1.35); glassG.translate(.47, 1.3, .03);
  const leaves = new THREE.InstancedMesh(leafG, new THREE.MeshStandardMaterial({ color: '#3a2b1f', roughness: .7 }), doors.length);
  const glass = new THREE.InstancedMesh(glassG, nav.shopMat, doors.length);
  for (const im of [leaves, glass]) { im.frustumCulled = false; im.userData.terrain = 'done'; scene.add(im); }   // the doors stay when the people are off; on the ground by gr below
  const doorM = new THREE.Object3D();
  function setDoor(i) {
    const d = doors[i], hx = Math.cos(d.ry), hz = -Math.sin(d.ry);   // the door's local +x, along the facade
    doorM.position.set(d.x - hx * .47 + d.nx * .09, pave + gr(d.x, d.z), d.z - hz * .47 + d.nz * .09); doorM.rotation.set(0, d.ry + d.angle, 0); doorM.updateMatrix();
    leaves.setMatrixAt(i, doorM.matrix); glass.setMatrixAt(i, doorM.matrix);
  }
  doors.forEach((d, i) => { d.i = i; d.angle = 0; d.until = -1; setDoor(i); });
  let clock = 0;
  const openDoor = d => { d.until = clock + .6; };

  // ---- the instanced body parts and props
  const group = new THREE.Group(); group.name = 'walnut-people'; scene.add(group);
  group.userData.terrain = 'done';   // each person already stands on the street's real height (gr)
  const G = crowdGeometry(), mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .8 });
  const parts = PARTS.map(([g, joints, col, flag]) => {
    const im = new THREE.InstancedMesh(G[g], mat, count * joints.length);
    im.frustumCulled = false; im.castShadow = false; im.receiveShadow = true; group.add(im);
    return { im, joints, col, flag };
  });
  const cupG = new THREE.CylinderGeometry(.042, .034, .1, 10); cupG.translate(0, .02, 0);
  const bookG = new THREE.BoxGeometry(.24, .03, .17);
  const cups = new THREE.InstancedMesh(cupG, new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: .5 }), count);
  const books = new THREE.InstancedMesh(bookG, mat, count);
  for (const im of [cups, books]) { im.frustumCulled = false; group.add(im); }

  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0), col = new THREE.Color(), dummy = new THREE.Object3D(), v = new THREE.Vector3(), v2 = new THREE.Vector3();
  const people = [];
  for (let i = 0; i < count; i++) {
    const long = Math.random() < .7, sleeves = Math.random() < .4;
    const prof = makeProfile(i);   // a made-up life: name, age, sex, height, weight, biography (profiles.js)
    const c = { shirt: pick(SHIRT), pants: pick(PANTS), skin: pick(SKIN), hair: prof.grey ? pick(['#9a9a96', '#c8c8c4', '#e2e0da']) : pick(HAIR), shoe: pick(SHOE) };
    c.leg = long ? c.pants : c.skin; c.arm = sleeves ? c.shirt : c.skin; c.eye = '#1b1512'; c.lip = '#7a3b34';
    parts.forEach(p => p.joints.forEach((j, k) => p.im.setColorAt(i * p.joints.length + k, col.set(c[p.col]))));
    books.setColorAt(i, col.set(pick(BOOK)));
    const P = { i, F: rig(), x: 0, z: 0, h: 0, sp: rnd(SPEED[0], SPEED[1]), path: [], then: null, state: 'walk', t: 0, k: 0,
      seat: null, slot: 0, act: 'rest', sipT: rnd(0, 6), ph: rnd(0, 6), hidden: false, lod: i % 8, dirty: true };
    P.prof = prof; P.col = c; P.F.root.scale.setScalar(prof.scale);
    P.long = Math.random() < (prof.sex === 'Female' ? .6 : prof.sex === 'Male' ? .08 : .4);
    people.push(P);
  }
  parts.forEach(p => { p.im.instanceColor.needsUpdate = true; });

  // ---- planning
  const lanePath = (s0, s1, o) => {
    const out = [], n = Math.max(1, Math.ceil(Math.abs(s1 - s0) / 25));
    for (let k = 1; k <= n; k++) { const q = at(s0 + (s1 - s0) * k / n, o); out.push([q.x, q.z]); }
    return out;
  };
  /** from where P is now, onto the lane on `side`, along it to s */
  function walkTo(P, s, side) {
    // keep to one half of the lane by direction (towards Front St nearer the middle), so people
    // walking opposite ways mostly pass rather than walk through each other
    const p = project(P.x, P.z), mid = (LANE[0] + LANE[1]) / 2, o = side * (s > p.s ? rnd(LANE[0], mid - .05) : rnd(mid + .05, LANE[1])), q = at(p.s, o);
    return [[q.x, q.z], ...lanePath(p.s, s, o)];
  }
  const free = (st, j) => !st.user && !st.occ[j];
  function plan(P) {
    const here = project(P.x, P.z).s, r = Math.random();
    const within = (s) => Math.abs(s - here) < NEAR;
    if (r < .42) {   // sit down somewhere
      const want = Math.random() < .6 ? 'cafe' : 'bench';
      const cand = okSeats.filter(i => seats[i].kind === want && within(seats[i].e.s) && seats[i].slots.some((_, j) => free(seats[i], j)));
      if (cand.length) {
        const i = pick(cand), st = seats[i], j = st.slots.findIndex((_, jj) => free(st, jj));
        st.occ[j] = P; P.seat = i; P.slot = j;
        const off = st.slots[j], sx = st.x + st.rx * off, sz = st.z + st.rz * off;
        P.path = [...walkTo(P, st.e.s, st.e.side), [st.e.x, st.e.z], [st.ax + st.rx * off, st.az + st.rz * off], [sx, sz]];
        P.state = 'walk'; P.then = 'sit';
        P.act = st.kind === 'cafe' ? (Math.random() < .6 ? 'coffee' : 'book') : (Math.random() < .35 ? 'book' : 'rest');
        return;
      }
    }
    if (r < .72) {   // go into a shop
      const cand = okDoors.filter(d => within(d.e.s));
      if (cand.length) {
        const d = pick(cand); P.door = d;
        P.path = [...walkTo(P, d.e.s, d.e.side), [d.e.x, d.e.z], [d.ox, d.oz], [d.x, d.z], [d.ix, d.iz]];
        P.state = 'walk'; P.then = 'enter'; return;
      }
    }
    // stroll somewhere along the street, then look around for a moment
    const s = Math.max(5, Math.min(L - 5, here + rnd(-180, 180)));
    P.path = walkTo(P, s, Math.random() < .5 ? -1 : 1); P.state = 'walk'; P.then = 'pause';
  }
  /** leave the seat: stand up, then walk back out to the lane */
  function standUp(P) { P.state = 'standing'; P.t = 0; }
  // the viewer sits down (promenade.js seating): take a free place if there is one, else move someone on.
  // Whoever has to go (or was on the way to that place) leaves from the lane, out of the viewer's face.
  seats.onUserSit = i => {
    const st = seats[i]; let j = st.occ.findIndex(o => !o);
    if (j < 0) j = 0;
    const P = st.occ[j];
    if (P && P !== 'user') {
      const there = P.state !== 'walk';   // sitting (or getting up/down) rather than still on the way
      st.occ[j] = null; P.seat = null; P.k = 0; P.posed = false;
      if (there) { P.x = st.e.x; P.z = st.e.z; }
      P.state = 'walk'; P.path = []; P.then = null; plan(P);
    }
    st.occ[j] = 'user';
    return st.slots[j];
  };
  seats.onUserStand = i => { const st = seats[i]; st.occ = st.occ.map(o => (o === 'user' ? null : o)); };

  // ---- start: some people already seated, a few in the shops, the rest out walking
  const place = (P, x, z) => { P.x = x; P.z = z; };
  people.forEach((P, n) => {
    const r = n / count;
    if (r < .3 && okSeats.length) {
      for (let tries = 0; tries < 20; tries++) {
        const i = pick(okSeats), st = seats[i], j = st.occ.findIndex(o => !o); if (j < 0) continue;
        st.occ[j] = P; P.seat = i; P.slot = j; const off = st.slots[j];
        place(P, st.x + st.rx * off, st.z + st.rz * off); P.h = st.ry; P.state = 'sit'; P.k = 1; P.t = rnd(5, 90);
        P.act = st.kind === 'cafe' ? (Math.random() < .6 ? 'coffee' : 'book') : (Math.random() < .35 ? 'book' : 'rest');
        return;
      }
    }
    if (r < .4 && okDoors.length) { const d = pick(okDoors); P.door = d; place(P, d.ix, d.iz); P.state = 'inside'; P.t = rnd(2, 60); P.hidden = true; return; }
    const q = at(rnd(5, L - 5), laneO(Math.random() < .5 ? -1 : 1)); place(P, q.x, q.z); plan(P);
  });

  // ---- per frame
  const turn = (P, want, dt) => { P.h += Math.atan2(Math.sin(want - P.h), Math.cos(want - P.h)) * Math.min(1, dt * 7); };
  function step(P, dt) {
    switch (P.state) {
      case 'walk': {
        let go = P.sp * dt;
        while (go > 0 && P.path.length) {
          const [tx, tz] = P.path[0], dx = tx - P.x, dz = tz - P.z, d = Math.hypot(dx, dz);
          if (d < 1e-3) { P.path.shift(); continue; }
          turn(P, Math.atan2(dx, dz), dt);
          const m = Math.min(go, d); P.x += dx / d * m; P.z += dz / d * m; go -= m;
          if (m >= d) P.path.shift();
        }
        P.ph += dt * 5.6 * P.sp / 1.3;
        // through the door (held open): out of sight once past the facade
        if (P.then === 'enter' && P.door && P.path.length <= 3) openDoor(P.door);
        if (P.exiting) openDoor(P.door);
        if (P.then === 'enter' && P.door && (P.x - P.door.x) * P.door.nx + (P.z - P.door.z) * P.door.nz < -.35) P.hidden = true;
        if (!P.path.length) {
          if (P.then === 'sit') { P.state = 'sitting'; P.t = 0; }
          else if (P.then === 'enter') { P.state = 'inside'; P.t = rnd(15, 120); P.hidden = true; }
          else if (P.then === 'pause') { P.state = 'pause'; P.t = rnd(1.5, 6); }
          else plan(P);
        }
        break;
      }
      case 'sitting': {   // turn to face the way the seat faces, and sit down
        const st = seats[P.seat]; turn(P, st.ry, dt * 1.5);
        P.k = Math.min(1, P.k + dt / .8); if (P.k >= 1) { P.state = 'sit'; P.t = rnd(25, 150); }
        break;
      }
      case 'sit': {
        P.sipT += dt; if ((P.t -= dt) <= 0) standUp(P);
        break;
      }
      case 'standing': {
        P.k = Math.max(0, P.k - dt / .8);
        if (P.k <= 0) {
          const st = seats[P.seat], off = st.slots[P.slot];
          st.occ[P.slot] = null; P.seat = null;
          P.path = [[st.ax + st.rx * off, st.az + st.rz * off], [st.e.x, st.e.z]]; P.state = 'walk'; P.then = null;
        }
        break;
      }
      case 'inside': {
        if ((P.t -= dt) <= 0) {   // back out through the same door
          const d = P.door; P.hidden = false; P.x = d.ix; P.z = d.iz; P.h = Math.atan2(d.nx, d.nz);
          P.path = [[d.x, d.z], [d.ox, d.oz], [d.e.x, d.e.z]]; P.state = 'walk'; P.then = null; P.exiting = true;
        }
        break;
      }
      case 'pause': { if ((P.t -= dt) <= 0) plan(P); break; }
    }
    // stepping out of the door: hidden until past the facade
    if (P.exiting) { const d = P.door; const out = (P.x - d.x) * d.nx + (P.z - d.z) * d.nz; P.hiddenOut = out < -.35; if (out > .3) P.exiting = false; } else P.hiddenOut = false;
  }

  let frame = 0, enabled = true, inside = null;
  const swinging = new Set();
  function update(dt, camera) {
    frame++; clock += dt;
    const cp = camera.position, far = cp.y > 1500;   // from very high up nobody is visible anyway
    for (const P of people) {
      step(P, dt);
      // re-pose near people every frame, further ones every 3rd or 10th; someone sitting still
      // (not sipping a coffee) is posed once
      const me = P === inside, d = Math.hypot(P.x - cp.x, P.z - cp.z), every = me || d < 120 ? 1 : d < 350 ? 3 : 10;
      if ((far && !me) || (frame + P.lod) % every) continue;
      const hide = P.hidden || P.hiddenOut, F = P.F;
      const still = P.state === 'sit' && P.act !== 'coffee' && !me;
      if (still && P.posed) continue;
      P.posed = still;
      if (!hide) {
        if (P.state === 'walk') walkPose(F, P.ph);
        else if (P.state === 'pause' && !P.seat) sitPose(F, 0, 'rest', 0, .92);
        else {
          const st = P.seat != null ? seats[P.seat] : null;
          const sipPhase = (P.sipT % 7) / 7, sip = P.act === 'coffee' ? Math.max(0, Math.sin(Math.min(1, Math.max(0, (sipPhase - .7) / .3)) * Math.PI)) : 0;
          sitPose(F, P.k, P.k > .9 ? P.act : 'rest', sip, st && st.kind === 'bench' ? .6 : .56);
        }
        // seated: sit a little back on the seat
        let x = P.x, z = P.z;
        if (P.k > 0 && P.seat != null) { const st = seats[P.seat]; x -= Math.sin(st.ry) * .1 * P.k; z -= Math.cos(st.ry) * .1 * P.k; }
        F.root.position.set(x, pave + gr(x, z), z); F.root.rotation.y = P.h; F.root.updateMatrixWorld(true);
      }
      // the person being inhabited has no head (the camera is in it)
      for (const p of parts) p.joints.forEach((j, k) => p.im.setMatrixAt(P.i * p.joints.length + k, hide || (me && (j === 'head' || j === 'hair')) || (p.flag && !P[p.flag]) ? ZERO : F[j].matrixWorld));
      // props: a coffee cup in the right hand, or a book held in both
      const seated = !hide && P.k > .9;
      if (seated && P.act === 'coffee') { F.handR.getWorldPosition(v); dummy.position.copy(v); dummy.rotation.set(0, P.h, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); cups.setMatrixAt(P.i, dummy.matrix); }
      else cups.setMatrixAt(P.i, ZERO);
      if (seated && P.act === 'book') {
        F.handL.getWorldPosition(v); F.handR.getWorldPosition(v2); v.add(v2).multiplyScalar(.5);
        dummy.position.copy(v); dummy.position.y += .05; dummy.rotation.set(-.75, P.h, 0, 'YXZ'); dummy.scale.setScalar(1); dummy.updateMatrix(); books.setMatrixAt(P.i, dummy.matrix);
      } else books.setMatrixAt(P.i, ZERO);
    }
    for (const p of parts) p.im.instanceMatrix.needsUpdate = true;
    // doors: open while someone is going through, then swing shut
    for (const P of people) if (P.door && (P.door.until > clock)) swinging.add(P.door);
    if (swinging.size) {
      for (const d of swinging) {
        const want = d.until > clock ? 1.35 : 0, a = d.angle;
        d.angle += Math.sign(want - a) * Math.min(Math.abs(want - a), dt * (want ? 3.5 : 1.8));
        setDoor(d.i); if (!want && d.angle === 0) swinging.delete(d);
      }
      leaves.instanceMatrix.needsUpdate = glass.instanceMatrix.needsUpdate = true;
    }
    cups.instanceMatrix.needsUpdate = true; books.instanceMatrix.needsUpdate = true;
  }
  const stats = () => {
    const n = {}; people.forEach(P => { const k = P.state === 'walk' ? (P.then === 'enter' ? 'toShop' : P.then === 'sit' ? 'toSeat' : 'walk') : P.state; n[k] = (n[k] || 0) + 1; });
    return { ...n, seats: okSeats.length + '/' + seats.length, doors: okDoors.length + '/' + doors.length };
  };
  // ---- inhabiting someone: click a person to see through their eyes (you can look around, not steer)
  const pv = new THREE.Vector3();
  /** the person under screen point (x, y), within 300 m */
  function pickPerson(camera, x, y, w, h) {
    if (!enabled) return null;
    const f = h / (2 * Math.tan(camera.fov * Math.PI / 360)), cp = camera.position; let best = null;
    for (const P of people) {
      if (P.hidden || P.hiddenOut || P === inside) continue;
      const cy = pave + gr(P.x, P.z) + (P.k > .5 ? .95 : 1.25) * P.prof.scale, dist = Math.hypot(P.x - cp.x, cy - cp.y, P.z - cp.z); if (dist > 300) continue;
      pv.set(P.x, cy, P.z).project(camera); if (pv.z > 1) continue;
      const d = Math.hypot((pv.x + 1) / 2 * w - x, (1 - pv.y) / 2 * h - y), tol = Math.max(8, f * .45 / dist);
      if (d < tol && (!best || d / tol < best.r)) best = { person: P.i, r: d / tol };
    }
    return best && { person: best.person };
  }
  const look = { yaw: 0, pitch: 0 };
  function inhabit(i) { inside = people[i] || null; look.yaw = 0; look.pitch = 0; if (inside) inside.posed = false; return getInhabited(); }
  function leave() {
    if (!inside) return null;
    const P = inside; inside = null; P.posed = false;
    return { p: new THREE.Vector3(P.x, pave + gr(P.x, P.z), P.z), dir: new THREE.Vector3(Math.sin(P.h), 0, Math.cos(P.h)), cam: pullBack(P.x, P.z, P.h) };
  }
  /** what they're doing right now, in words */
  function activity(P) {
    const st = P.seat != null ? seats[P.seat] : null, shop = P.door && P.door.shop;
    if (P.state === 'inside') return `Browsing in the ${shop}`;
    if (P.exiting) return `Leaving the ${shop}`;
    if (P.state === 'walk') return P.then === 'sit' ? (st && st.kind === 'cafe' ? 'Walking to a café table' : 'Looking for a bench') : P.then === 'enter' ? `Heading into the ${shop}` : 'Strolling down Walnut Street';
    if (P.state === 'pause') return 'Window shopping';
    if (P.state === 'sitting') return 'Sitting down';
    if (P.state === 'standing') return 'Getting up';
    if (P.state === 'sit') return P.act === 'coffee' ? `Drinking ${P.prof.drink}` : P.act === 'book' ? `Reading ${P.prof.book}` : 'Resting on a bench, people-watching';
    return '';
  }
  function getInhabited() {
    if (!inside) return null;
    const p = inside.prof;
    return { kind: 'person', id: inside.i, name: p.name, sex: p.sex, age: p.age, height: p.height, kg: p.kg, lb: p.lb, bio: p.bio, now: activity(inside) };
  }
  const lookAt = (dx, dy) => { look.yaw = Math.max(-2.2, Math.min(2.2, look.yaw - dx * .0045)); look.pitch = Math.max(-1.1, Math.min(1.1, look.pitch - dy * .0045)); };
  const eye = new THREE.Vector3(), fwd = new THREE.Vector3();
  /** put the camera behind their eyes (after update has posed them this frame) */
  function inhabitFrame(camera) {
    const P = inside; if (!P) return;
    if (P.hidden || P.hiddenOut) {   // in the shop: just inside the (held open) door, looking out through the shopfront
      const d = P.door; openDoor(d); eye.set(d.x - d.nx * .9, pave + gr(d.x, d.z) + 1.6 * P.prof.scale, d.z - d.nz * .9);
      const a = Math.atan2(d.nx, d.nz) + Math.max(-1, Math.min(1, look.yaw)); fwd.set(Math.sin(a), Math.sin(look.pitch - .05), Math.cos(a));
    } else {
      P.F.head.getWorldPosition(eye); eye.y += .04;
      // at a cafe table, look past the umbrella pole, half towards the street (as when the viewer sits)
      const st = P.seat != null ? seats[P.seat] : null, past = st && st.kind === 'cafe' ? (st.yaw0 || 0) * P.k : 0;
      const a = P.h + look.yaw + past, down = P.state === 'sit' && P.act === 'book' ? -.55 : P.k > .5 ? -.12 : -.06;
      eye.x += Math.sin(P.h) * .1; eye.z += Math.cos(P.h) * .1;
      const pt = look.pitch + down; fwd.set(Math.sin(a) * Math.cos(pt), Math.sin(pt), Math.cos(a) * Math.cos(pt));
    }
    camera.position.copy(eye); camera.up.set(0, 1, 0); camera.lookAt(eye.x + fwd.x, eye.y + fwd.y, eye.z + fwd.z);
  }
  // ---- a head-and-shoulders portrait (for the card while you inhabit someone): the same parts and
  // colours as their figure, facing the camera, drawn by a small renderer of its own
  let pr = null;
  function portrait(i, size = 176) {
    const P = people[i]; if (!P) return null;
    if (!pr) {
      const canvas = document.createElement('canvas');
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(28, 1, .05, 10);
      sc.add(new THREE.HemisphereLight('#fff4e6', '#4a5560', .85));
      const key = new THREE.DirectionalLight('#ffffff', .75); key.position.set(.6, 1.2, 1.4); sc.add(key);
      const bust = new THREE.Group(); sc.add(bust);
      pr = { canvas, renderer, sc, cam, bust };
    }
    pr.renderer.setSize(size, size, false);
    // rebuild the bust: a skeleton standing still, its upper-body parts in this person's colours
    pr.bust.children.forEach(m => m.material.dispose()); pr.bust.clear();
    const F = rig(); pose(F, 0, 0); F.root.scale.setScalar(P.prof.scale); F.root.updateMatrixWorld(true);
    const UPPER = new Set(['torso', 'neck', 'head', 'hairF', 'upper', 'eyeL', 'eyeR', 'browL', 'browR', 'nose', 'mouth', 'longhair']);
    for (const [g, joints, col, flag] of PARTS) {
      if (!UPPER.has(g) || (flag && !P[flag])) continue;
      const m = new THREE.MeshStandardMaterial({ color: P.col[col], roughness: .75 });
      for (const j of joints) { const mesh = new THREE.Mesh(G[g], m); mesh.matrixAutoUpdate = false; mesh.matrix.copy(F[j].matrixWorld); pr.bust.add(mesh); }
    }
    const head = F.head.getWorldPosition(new THREE.Vector3());
    pr.cam.position.set(head.x + .06, head.y - .02, head.z + .78); pr.cam.lookAt(head.x, head.y - .1, head.z);
    pr.renderer.render(pr.sc, pr.cam);
    return pr.canvas;
  }
  const setVisible = on => { group.visible = on; enabled = on; if (!on) inside = null; };
  return { update: (dt, camera) => { if (enabled) update(dt, camera); }, people, stats, setVisible, pickPerson, inhabit, leave, getInhabited, lookAt, inhabitFrame, portrait };
}
