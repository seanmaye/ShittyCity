// People fishing along the Schuylkill, at the real spots Philadelphians fish from: below the
// Fairmount Dam by the Water Works, the Schuylkill Banks boardwalk, Kelly Drive, MLK Drive, and
// upriver and downriver at the boat piers' banks (Bartram's Garden, Grays Ferry, Strawberry
// Mansion, East Falls, Manayunk). Each sits on a stool or stands with a rod out over the water,
// a bobber riding the current, a bucket and a cooler beside them. Clicking one (pick) opens an
// invitation to fish with them (js/fishing.js).
import * as THREE from 'three';
import { makeFigure } from './people.js';
import { terrain, surface, water } from '../terrain.js';

// [label, lat, side (1 east bank, -1 west bank)] on the river centreline; and boat-pier banks
const BANK_SPOTS = [
  ['below the Fairmount Dam', 39.9652, 1], ['on the Schuylkill Banks boardwalk', 39.9478, 1], ['at the Walnut Street dock', 39.9503, 1],
  ['on Kelly Drive', 39.9718, 1], ['on MLK Drive', 39.9745, -1], ['across from the Water Works', 39.9640, -1],
];
const PIER_SPOTS = [['Bartram\'s Garden', 'at Bartram\'s Garden'], ['Grays Ferry Crescent', 'at the Grays Ferry Crescent'],
  ['Strawberry Mansion', 'at Strawberry Mansion'], ['East Falls', 'in East Falls'], ['Manayunk (Venice Island)', 'on Venice Island in Manayunk']];
// who they are (made up), and how they say hello
const FOLK = [
  ['Dolores', 'Fish are biting by the dam today, hon. Want to wet a line with me?'],
  ['Ray', 'Catfish were jumping all morning. Grab a rod, I got a spare.'],
  ['Mr. Lee', 'Fifty years I fish this river. You want to try? I show you.'],
  ['Keisha', 'Slow day, but you never know. Want to cast with me?'],
  ['Big Tony', 'Yo! You fish? C’mere, I got bait for days.'],
  ['Marisol', 'The stripers run up this far in spring. Want to try your luck?'],
  ['Walt', 'Caught a boot last week. Still counts. You in?'],
  ['Priya', 'I’m trying for a shad. Want to keep me company and fish?'],
  ['Gus', 'Quiet out here, ain’t it. Got a second rod if you want it.'],
  ['Angela', 'My grandpop taught me on this bank. Want to learn?'],
  ['Deshawn', 'Cast out past the eddy, that’s where the big ones sit. Wanna try?'],
];
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const SKIN = ['#8d5a3c', '#c99370', '#e0b48f', '#6b4430', '#b07a55', '#f0c9a6'], HAIR = ['#1d1410', '#3a2a20', '#6b4a2b', '#9a9a96', '#2a1d16'];
const SHIRT = ['#3f6b8a', '#8a3f3a', '#4f7a3a', '#c9a227', '#6a4c93', '#e07b39', '#2e4b2a', '#b5b9be'];

/** waterPolys: polygons (lists of flat dm rings) of the real water outline */
export function buildAnglers(scene, river, boats, waterPolys = []) {
  // point-in-water test against the real outline (bounding boxes first)
  const polys = waterPolys.map(p => { const rings = p.map(r => { const o = []; for (let i = 0; i < r.length; i += 2) o.push([r[i] / 10, r[i + 1] / 10]); return o; });
    const xs = rings[0].map(q => q[0]), zs = rings[0].map(q => q[1]); return { rings, x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) }; });
  const inRing = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
  const wet = (x, z) => polys.some(p => x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1 && inRing(x, z, p.rings[0]) && !p.rings.slice(1).some(h => inRing(x, z, h)));
  /** from a point on the water, walk along dir until the bank: stand just past the edge, facing back */
  const toBank = (from, dir) => { const q = from.clone(); for (let k = 0; k < 400 && wet(q.x, q.z); k++) q.addScaledVector(dir, 1); return q.addScaledVector(dir, 1.2); };
  const spots = [];
  for (const [label, lat, side] of BANK_SPOTS) {
    const s = river.atLat && river.atLat(lat); if (!s) continue;
    const out = V(s.n.x * side, 0, s.n.z * side);
    spots.push({ label, at: polys.length ? toBank(s.p.clone(), out) : s.p.clone().addScaledVector(out, s.w / 2 + 2.5), face: out.clone().negate() });
  }
  const stops = boats ? boats.lines.flatMap(l => l.stops) : [];
  for (const [name, label] of PIER_SPOTS) {
    const st = stops.find(s => s.t === name); if (!st) continue;
    const d = V(st.x - st.sx, 0, st.z - st.sz).normalize(), along = V(-d.z, 0, d.x);
    const from = V(st.x, 0, st.z).addScaledVector(along, 16);   // out on the water a little way along from the pier
    spots.push({ label, at: polys.length ? toBank(from, d.clone().negate()) : V(st.sx, 0, st.sz).addScaledVector(along, 16).addScaledVector(d, 4), face: d });
  }
  const rodMat = new THREE.MeshStandardMaterial({ color: '#2b2b2b', roughness: .4 }), lineMat = new THREE.LineBasicMaterial({ color: '#e8e8e8', transparent: true, opacity: .7 });
  const bob = [new THREE.MeshStandardMaterial({ color: '#e0302a', roughness: .5 }), new THREE.MeshStandardMaterial({ color: '#f4f4f0', roughness: .5 })];
  const bucket = new THREE.MeshStandardMaterial({ color: '#d8d4c8', roughness: .7 }), cooler = new THREE.MeshStandardMaterial({ color: '#2f6ab0', roughness: .6 }), lid = new THREE.MeshStandardMaterial({ color: '#f1f1ec' });
  const anglers = spots.map((sp, i) => {
    const [name, hello] = FOLK[i % FOLK.length], sit = i % 3 !== 1;
    const g = new THREE.Group(); g.position.copy(sp.at).setY(terrain.on ? surface(sp.at.x, sp.at.z) + .3 : .45); g.rotation.y = Math.atan2(sp.face.x, sp.face.z); g.userData.terrain = 'done'; scene.add(g);
    const F = makeFigure({ shirt: SHIRT[(i * 3) % SHIRT.length], skin: SKIN[(i * 5) % SKIN.length], hair: HAIR[(i * 7) % HAIR.length], shorts: '#3a3f4a' });
    g.add(F.root);
    if (sit) {   // on a folding stool
      F.pelvis.position.y = .55; F.hipL.rotation.x = F.hipR.rotation.x = -1.45; F.kneeL.rotation.x = F.kneeR.rotation.x = 1.45;
      const st = new THREE.Mesh(new THREE.BoxGeometry(.4, .06, .35), cooler); st.position.set(0, .52, -.02); g.add(st);
      for (const x of [-.16, .16]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(.015, .015, .52, 4), rodMat); l.position.set(x, .26, 0); g.add(l); }
    }
    // both hands on the rod, held out and up over the water
    F.shR.rotation.x = -.9; F.elR.rotation.x = -.5; F.shL.rotation.x = -.7; F.elL.rotation.x = -.8; F.shL.rotation.z = -.3;
    g.updateMatrixWorld(true);
    const hand = F.handR.getWorldPosition(V(0, 0, 0)); g.worldToLocal(hand);
    const len = 3.4, tipL = hand.clone().add(V(0, len * Math.sin(.55), len * Math.cos(.55)));
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(.012, .028, len, 6), rodMat);
    rod.position.copy(hand).lerp(tipL, .5); g.add(rod); rod.updateMatrixWorld(true);
    rod.lookAt(g.localToWorld(tipL.clone())); rod.rotateX(Math.PI / 2);   // the cylinder's axis along hand -> tip
    // line from the tip to a bobber out on the water
    const cast = 7 + (i % 4) * 1.5, bobber = new THREE.Group();
    const b1 = new THREE.Mesh(new THREE.SphereGeometry(.09, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), bob[0]), b2 = new THREE.Mesh(new THREE.SphereGeometry(.09, 10, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), bob[1]);
    bobber.add(b1, b2); bobber.position.set(.3, 0, cast); g.add(bobber); g.updateMatrixWorld(true);
    const bw = g.localToWorld(V(.3, 0, cast)), by = (terrain.on ? water(bw.x, bw.z) + .15 : .6) - g.position.y;   // the water surface out there
    bobber.position.y = by;
    const lg = new THREE.BufferGeometry().setFromPoints([tipL, bobber.position]); const line = new THREE.Line(lg, lineMat); g.add(line);
    // a bait bucket and a cooler on the bank
    const bk = new THREE.Mesh(new THREE.CylinderGeometry(.16, .13, .36, 10), bucket); bk.position.set(-.6, .18, -.2); g.add(bk);
    const co = new THREE.Mesh(new THREE.BoxGeometry(.55, .38, .36), cooler); co.position.set(.7, .19, -.3); g.add(co);
    const cl = new THREE.Mesh(new THREE.BoxGeometry(.57, .06, .38), lid); cl.position.set(.7, .41, -.3); g.add(cl);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const head = V(0, 0, 0);
    return { name, hello, spot: sp.label, g, F, bobber, line, tip: tipL, cast, by, phase: i * 1.3, nibble: 0, head, sit,
      view: { pos: g.localToWorld(V(-2.2, 3.4, -4.2)), target: g.localToWorld(V(.4, .9, cast * .6)), abs: true } };
  });

  const pv = new THREE.Vector3();
  let t = 0;
  function update(dt) {
    t += dt;
    for (const A of anglers) {
      // the bobber rides the ripples; now and then a nibble tugs it under for a moment
      if (A.nibble <= 0 && Math.random() < dt * .08) A.nibble = .6;
      A.nibble -= dt;
      const dip = A.nibble > 0 ? Math.sin(A.nibble * 18) * .06 - .05 : 0;
      A.bobber.position.y = A.by + Math.sin(t * 2.1 + A.phase) * .025 + dip;
      const p = A.line.geometry.attributes.position; p.setXYZ(1, A.bobber.position.x, A.bobber.position.y + .05, A.bobber.position.z); p.needsUpdate = true;
      A.F.chest.rotation.y = Math.sin(t * .4 + A.phase) * .08;   // shifting about, watching the water
    }
  }
  /** the angler under screen point (x, y), or null */
  function pick(camera, x, y, w, h) {
    const f = h / (2 * Math.tan(camera.fov * Math.PI / 360)), cp = camera.position; let best = null;
    anglers.forEach((A, i) => {
      A.F.head.getWorldPosition(A.head); A.head.y -= .3;
      const dist = A.head.distanceTo(cp); if (dist > 400) return;
      pv.copy(A.head).project(camera); if (pv.z > 1) return;
      const d = Math.hypot((pv.x + 1) / 2 * w - x, (1 - pv.y) / 2 * h - y), tol = Math.max(10, f * .6 / dist);
      if (d < tol && (!best || d / tol < best.r)) best = { i, r: d / tol };
    });
    return best ? best.i : null;
  }
  const info = i => { const A = anglers[i]; return A && { name: A.name, hello: A.hello, spot: A.spot, view: A.view }; };
  // a "Go to" view: Keisha on Kelly Drive, from out over the river looking back at the bank, so
  // nothing stands between (the park's trees are behind her). The orbit controls keep the camera
  // at least 40 m from what it looks at, so it frames her right of centre, clear of the panel.
  const A = anglers.find(x => x.spot === 'on Kelly Drive') || anglers[0];
  const views = [];
  if (A) {
    const ry = A.g.rotation.y, fwd = V(Math.sin(ry), 0, Math.cos(ry)), right = V(-fwd.z, 0, fwd.x), at = A.g.position.clone();
    views.push({ id: 'fishing', name: 'Fishing on the Schuylkill', pos: at.clone().addScaledVector(fwd, 36).addScaledVector(right, -6).setY(A.g.position.y + 12), target: at.clone().addScaledVector(right, 9).setY(A.g.position.y + 1), abs: true });
  }
  return { update, pick, info, views, count: anglers.length };
}
