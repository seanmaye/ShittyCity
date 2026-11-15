// Kingda Ka's train as things to draw: five cars (four with two rows of two seats, the rear row raised "stadium" style,
// and a fifth with one row and a flat deck over the mounts of a row that was never fitted: 18 riders), the nose, the
// wheel carriers that grip the rails, the restraints and the riders. train.ts puts them on the track and moves them.
//
// From the dossier (photos of the ride's last years): each train its own body colour (this is the green one: train 1,
// with the navy hood panel and yellow badge it had by 2021); the seats navy with teal inner faces and lime headrest
// covers and the restraints orange on every train; a tiger-stripe band along the sides; a low, wide, rounded sled of a
// nose; pale tan tyres on dark hubs, one wheel carrier at each car joint and one at the front; restraints with a thick
// rigid lap bar with grips and two thin shoulder straps. Guessed: every dimension (the train is "12-13 m" long; the
// rest is sized round a seated person), how much the rear rows are raised, the shape of the seats, and how the lap bar
// is carried (on two arms from the top of the seat, outside the shoulders).
//
// A car is two meshes (painted parts, metal parts), each one geometry with the colours on its vertices: the parts are
// modelled as ordinary boxes and tubes, then baked together (bake()), so the whole train is about a hundred draw calls
// however much detail a car has. Everything is in the car's own frame: +z the way it runs, +y the riders' up, +x their
// left, the origin on the track's centreline (midway between the rails, at the height of their centres) under the car's middle.
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { geo } from '../phl/people.ts';
import { GAUGE, RAIL } from './layout.ts';

/** the four trains (body, and the hood panel on the nose) */
export const LIVERY = {
  green: { body: '#5CC12F', hood: '#1E2A63' }, teal: { body: '#1FA3A6', hood: '#1FA3A6' },
  blue: { body: '#1E2A63', hood: '#5CC12F' }, orange: { body: '#F28C1E', hood: '#1E2A63' },
};
const SEAT = '#1F2B57', SEAT_IN = '#1B8FA0', HEAD = '#6DC53B', BAR = '#F47B20', TYRE = '#d2bf96', HUB = '#3a3d44', DARK = '#1c1e22', FLOORC = '#3b3e44', STEEL = '#9aa0a6', GOLD = '#F2C230', STRIPE = '#E58A1F';

/** a car: its length along the track, where its rows of seats are (z of the seat's middle) and how far each is raised */
export interface CarSpec { len: number; rows: number[]; lift: number[]; lead?: boolean; tail?: boolean }
/** the consist, front to back (physics.ts CONSIST has the same lengths) */
export const CARS: CarSpec[] = [
  { len: 2.75, rows: [.175, -.975], lift: [0, .12], lead: true },
  { len: 2.5, rows: [.3, -.85], lift: [0, .12] }, { len: 2.5, rows: [.3, -.85], lift: [0, .12] }, { len: 2.5, rows: [.3, -.85], lift: [0, .12] },
  { len: 2.5, rows: [.3], lift: [0], tail: true },
];
/** heights above the track's centreline: the floor, a front-row seat's pan; a rider's eyes above their seat's pan; how
 *  far either side of the middle the two seats are; the car's width */
export const FLOOR = .36, PAN = .8, EYE = .89, SEAT_X = .39, WIDTH = 1.56;
/** where the restraint hinges (above the pan, behind the seat's middle), and how far it swings open (radians) */
const HINGE: [number, number] = [.9, -.27], OPEN = -1.45;

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const mat = (c: string, metal = false) => new THREE.MeshStandardMaterial({ color: c, metalness: metal ? .7 : 0 });
function box(parent: THREE.Object3D, m: THREE.Material, w: number, h: number, d: number, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); parent.add(o); return o; }
/** a wheel or disc: radius r, w thick, its axle along x ('x'), y or z */
function disc(parent: THREE.Object3D, m: THREE.Material, r: number, w: number, axis: 'x' | 'y' | 'z', x: number, y: number, z: number, seg = 14) {
  const g = new THREE.CylinderGeometry(r, r, w, seg); if (axis === 'x') g.rotateZ(Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); parent.add(o); return o;
}
/** a bent tube through points */
function pipe(parent: THREE.Object3D, m: THREE.Material, pts: THREE.Vector3[], r: number, seg = 6) {
  const o = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), pts.length * 4, r, seg, false), m); parent.add(o); return o;
}
/** a side profile ([z, y] points, anticlockwise seen from +x) pushed w across the car, its middle at x */
function slab(parent: THREE.Object3D, m: THREE.Material, prof: [number, number][], w: number, x: number) {
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(prof.map(p => new THREE.Vector2(-p[0], p[1]))), { depth: w, bevelEnabled: false });
  g.rotateY(Math.PI / 2); g.translate(x - w / 2, 0, 0);   // (the shape's x runs back along the car, its depth across it)
  const o = new THREE.Mesh(g, m); parent.add(o); return o;
}

/** every mesh under root (that pick lets through) as one geometry in root's frame, each part's material colour on its vertices */
const _m = new THREE.Matrix4(), _c = new THREE.Color();
export function bake(root: THREE.Object3D, pick: (m: THREE.Mesh) => boolean = () => true): THREE.BufferGeometry | null {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), geos: THREE.BufferGeometry[] = [];
  root.traverse(o => {
    const me = o as THREE.Mesh; if (!me.isMesh || !pick(me)) return;
    const g = me.geometry.index ? me.geometry.toNonIndexed() : me.geometry.clone();
    g.applyMatrix4(_m.multiplyMatrices(inv, me.matrixWorld));
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    const n = g.attributes.position.count, col = new Float32Array(n * 3); _c.copy((me.material as THREE.MeshStandardMaterial).color);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); geos.push(g);
  });
  return geos.length ? BufferGeometryUtils.mergeGeometries(geos) : null;
}
const isMetal = (m: THREE.Mesh) => (m.material as THREE.MeshStandardMaterial).metalness > .3;

/** a seat's shell, at the seat's own origin (the pan's top, under the rider's hips) */
function seatShell(g: THREE.Object3D, M: Record<string, THREE.Material>, x: number, pan: number, z: number, floor: number) {
  const s = new THREE.Group(); s.position.set(x, pan, z); g.add(s);
  box(s, M.seat, .5, .1, .5, 0, -.06, .02); box(s, M.seatIn, .4, .02, .42, 0, 0, .04);                                   // the pan and its cushion
  const back = new THREE.Group(); back.position.set(0, 0, -.25); back.rotation.x = -.09; s.add(back);                     // the back, leaning a little
  // wide to the middle of the back, narrower to the shoulders, then only a post for the headrest: the rider behind
  // looks past it either side, at the track and at the shoulders of whoever sits here
  box(back, M.seat, .5, .52, .1, 0, .21, -.03); box(back, M.seat, .36, .2, .1, 0, .56, -.03); box(back, M.seatIn, .34, .56, .02, 0, .33, .03); box(back, M.seat, .16, .14, .09, 0, .71, -.03);
  box(back, M.head, .24, .22, .12, 0, .84, 0);                                                                            // the headrest's cover
  for (const sx of [1, -1]) { box(s, M.seat, .05, .22, .42, sx * .25, .06, .02); box(back, M.seat, .05, .26, .15, sx * .25, .3, .04); }   // wings at the hips and the ribs
  box(s, M.dark, .36, pan - floor - .1, .3, 0, -(pan - floor) / 2 - .05, 0);                                              // its pedestal
}

/** one car's fixed parts (body, floor, seats; the nose on the first; the deck on the last) */
function carBody(spec: CarSpec, livery: { body: string; hood: string }) {
  const g = new THREE.Group(), M = { body: mat(livery.body), hood: mat(livery.hood), seat: mat(SEAT), seatIn: mat(SEAT_IN), head: mat(HEAD), dark: mat(DARK), floor: mat(FLOORC),
    steel: mat(STEEL, true), gold: mat(GOLD), stripe: mat(STRIPE) };
  const h = spec.len / 2, f = spec.lead ? h - .4 : h - .15, r = -h + .1;   // the body runs from r to f (the first car's ends early: the nose is ahead of it)
  box(g, M.dark, 1, .2, spec.len - .1, 0, .23, 0);                         // the chassis beam
  box(g, M.floor, WIDTH - .1, .05, f - r, 0, FLOOR - .025, (f + r) / 2);
  // the sides: low by the front row's feet, stepping up to the raised rear row
  const step = spec.rows[0] - .3, top = spec.tail ? PAN + .02 : PAN + .34;
  for (const sx of [1, -1]) {
    slab(g, M.body, [[r, .3], [f, .3], [f, .74], [f - .5, .9], [step + .12, .92], [step - .2, top], [r, top + .03]], .13, sx * (WIDTH / 2 - .065));
    // the tiger-stripe band and its medallions; the diamond-plate step
    box(g, M.dark, .012, .15, f - r - .3, sx * (WIDTH / 2 + .004), .52, (f + r) / 2);
    for (let z = r + .34; z < f - .3; z += .2) { const o = box(g, M.stripe, .014, .19, .045, sx * (WIDTH / 2 + .008), .52, z); o.rotation.x = .6 * (Math.round(z * 5) % 2 ? 1 : .55); }
    for (const z of [r + .16, f - .16]) disc(g, M.gold, .085, .02, 'x', sx * (WIDTH / 2 + .008), .52, z);
    box(g, M.steel, .14, .03, f - r - .5, sx * (WIDTH / 2 + .06), .32, (f + r) / 2);
  }
  box(g, M.body, WIDTH, spec.lead ? .56 : .46, .1, 0, spec.lead ? .58 : .53, f - .05);   // the cowl ahead of the front row's feet
  box(g, M.body, WIDTH, top - .27, .08, 0, (top + .33) / 2, r + .04);      // the back panel
  spec.rows.forEach((z, i) => {
    const lift = spec.lift[i], floor = FLOOR + lift;
    if (lift) box(g, M.floor, WIDTH - .26, lift, z + .62 - r, 0, FLOOR + lift / 2 - .02, (z + .62 + r) / 2);   // the rear row's raised floor
    for (const sx of [1, -1]) seatShell(g, M, sx * SEAT_X, PAN + lift, z, floor);
    box(g, M.dark, .12, .3, .5, 0, PAN + lift - .1, z);                    // the divider between the two seats
  });
  if (spec.tail) {   // the deck over the mounts of the row that was never fitted
    box(g, M.body, WIDTH, .06, spec.rows[0] - .45 - r, 0, PAN + .05, (spec.rows[0] - .45 + r) / 2);
    box(g, M.steel, WIDTH - .5, .012, spec.rows[0] - .75 - r, 0, PAN + .085, (spec.rows[0] - .6 + r) / 2);
  }
  if (spec.lead) {   // the nose: a low, wide, rounded sled; the hood panel on top of it; the yellow badge at its tip
    const half = (m: THREE.Material, sx: number, sy: number, sz: number, y: number) => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI), m); s.scale.set(sx, sy, sz); s.position.set(0, y, f - .02); g.add(s); return s;   // (the half towards +z)
    };
    half(M.body, WIDTH / 2, .3, .68, .52); half(M.hood, WIDTH / 2 - .1, .365, .63, .5);
    box(g, M.body, WIDTH, .1, .1, 0, .27, f - .05);
    disc(g, M.gold, .11, .03, 'z', 0, .5, f + .66); disc(g, M.gold, .22, .012, 'y', 0, .858, f + .17, 20).scale.z = .55;   // the badge, and the logo on the hood
  }
  const paint = bake(g, m => !isMetal(m)), metal = bake(g, isMetal);
  return { paint, metal };
}

/** a wheel carrier, in the frame of the track where it sits: a beam across under the car, and at each rail a running
 *  wheel on top, a guide wheel outside and an up-stop wheel underneath (what holds the train on over the top hat) */
function bogieGeo() {
  const g = new THREE.Group(), hub = mat(HUB), tyre = mat(TYRE), R = RAIL / 2;
  box(g, hub, GAUGE + .42, .09, .15, 0, .27, 0);
  for (const sx of [1, -1]) {
    const x = sx * GAUGE / 2;
    box(g, hub, .05, .4, .3, x + sx * (R + .185), .03, 0);   // the carrier plate, outside the rail
    box(g, hub, .05, .12, .46, x + sx * (R + .185), .2, 0); box(g, hub, .28, .05, .3, x + sx * .08, .3, 0);
    for (const z of [.17, -.17]) { disc(g, tyre, .13, .09, 'x', x, R + .13, z); disc(g, hub, .07, .11, 'x', x, R + .13, z, 8); }
    disc(g, tyre, .085, .07, 'y', x + sx * (R + .085), 0, 0); disc(g, hub, .04, .09, 'y', x + sx * (R + .085), 0, 0, 8);
    disc(g, tyre, .075, .08, 'x', x, -R - .075, 0); disc(g, hub, .035, .1, 'x', x, -R - .075, 0, 8);
    // the magnets the track's brake fins pass between (struct-ground.ts stands the fins .34 m either side of the middle)
    for (const d of [.05, -.05]) box(g, hub, .035, .17, .46, sx * .34 + d, .11, 0);
    box(g, hub, .16, .04, .46, sx * .34, .2, 0);
  }
  return bake(g);
}

/** the two restraints of a row, in the frame of their hinge (x across the car, the hinge along it). As the ride's own
 *  description has it: a thick rigid lap bar with hand grips, and two thin flexible shoulder straps. The bar is carried
 *  on two arms that come over from the top of the seat outside the rider's shoulders (where they frame the view without
 *  filling it); the straps run from the seat top over the shoulders down to the bar */
function barGeo() {
  const g = new THREE.Group(), bar = mat(BAR), dark = mat(DARK);
  for (const side of [1, -1]) {
    const s = new THREE.Group(); s.position.set(side * SEAT_X, -HINGE[0], -HINGE[1]); g.add(s);   // (the seat's origin, seen from the hinge)
    for (const sx of [1, -1]) {
      pipe(s, bar, [V(sx * .27, .9, -.27), V(sx * .275, .9, 0), V(sx * .27, .74, .25), V(sx * .245, .46, .37), V(sx * .21, .31, .385)], .03);
      pipe(s, dark, [V(sx * .1, .9, -.24), V(sx * .1, .8, .08), V(sx * .1, .62, .21), V(sx * .08, .37, .33)], .013, 5);     // a shoulder strap
      pipe(s, dark, [V(sx * .1, .36, .42), V(sx * .1, .45, .47), V(sx * .1, .5, .44)], .016, 5);                             // a grip
    }
    disc(s, bar, .065, .48, 'x', 0, .31, .385, 10); box(s, dark, .22, .17, .05, 0, .31, .33);       // the lap bar and its pad
    box(s, dark, .6, .05, .06, 0, .9, -.28);                                                        // the hinge tube across the back of the seat, behind the neck
  }
  return bake(g);
}

/** a rider: one mesh for the seated body, and arms that move (shoulder and elbow, each side; x on the shoulder swings
 *  it forward (negative), as phl/people.ts) */
export interface Rider {
  root: THREE.Group; shL: THREE.Group; shR: THREE.Group; elL: THREE.Group; elR: THREE.Group;
  /** how keen they are to put their hands up (0 never .. 1 from the launch on), and a phase for their waving */
  brave: number; wave: number; up: number;
}
const SKIN = ['#e8c4a0', '#d2a37f', '#c99370', '#a8744f', '#7d5236', '#5a3a26'], HAIR = ['#2a1d16', '#3b2a1c', '#6a4a2a', '#b08a4a', '#1a1a1c', '#8a8782', '#a23a22'];
const SHIRT = ['#d8d8d8', '#c0392b', '#2e6fb5', '#f2c230', '#2f8f5b', '#e67e22', '#8e44ad', '#1d2b36', '#e9a0b8', '#58b5c9', '#f4f1e8', '#7a8a3a'], PANTS = ['#2e3542', '#3d5a80', '#6b6f76', '#c2b280', '#23262b', '#7a4a2a'];
/** the hands at rest: on the grips of the lap pad (above the seat's pan, ahead of its middle), and with the restraint
 *  up out of the way, in the lap */
const GRIP = [.1, .46, .46], LAP = [.09, .25, .3];
function rider(rand: () => number, cloth: THREE.Material): Rider {
  const G = geo(), root = new THREE.Group(), pick = (a: string[]) => a[Math.floor(rand() * a.length)];
  const skin = mat(pick(SKIN)), shirt = mat(pick(SHIRT)), pants = mat(pick(PANTS)), hair = mat(pick(HAIR)), shoe = mat(rand() < .5 ? '#e9e9e6' : '#222222'), bare = rand() < .6;
  const mesh = (gg: THREE.BufferGeometry, mm: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(gg, mm); o.position.set(x, y, z); parent.add(o); return o; };
  const grp = (parent: THREE.Object3D, x: number, y: number, z: number) => { const o = new THREE.Group(); o.position.set(x, y, z); parent.add(o); return o; };
  // seated: hips a hand above the pan, leaning back with the seat, thighs out along it, feet on the floor ahead
  const body = new THREE.Group(), pelvis = grp(body, 0, .11, 0); pelvis.rotation.x = -.09;
  mesh(G.torso, shirt, pelvis); mesh(G.shorts, pants, pelvis);
  const chest = grp(pelvis, 0, .56, 0); mesh(G.neck, skin, chest, 0, .08, 0);
  const head = mesh(G.head, skin, chest, 0, .17, 0); mesh(G.hair, hair, head, 0, .01, -.01);
  if (rand() < .45) mesh(new THREE.SphereGeometry(.118, 10, 6, 0, Math.PI * 2, Math.PI * .28, Math.PI * .5), hair, head, 0, -.01, -.035).scale.set(1, 1.25, .8);   // long hair, down the back of the neck
  for (const sx of [1, -1]) {
    const hip = grp(pelvis, sx * .1, 0, 0); hip.rotation.set(-1.5, 0, sx * .08); mesh(G.thigh, pants, hip);
    const knee = grp(hip, 0, -.45, 0); knee.rotation.x = 1.38; mesh(G.shin, bare ? skin : pants, knee); mesh(G.foot, shoe, knee, 0, -.45, 0);
  }
  const bg = bake(body), bm = new THREE.Mesh(bg, cloth); bm.castShadow = true; root.add(bm);
  // the arms: built on the same joints, each bone its own little mesh
  body.updateMatrixWorld(true);
  const R = { root, brave: rand(), wave: rand() * 6.28, up: 0 } as Rider, shY = chest.getWorldPosition(V(0, 0, 0));
  for (const [s, sx] of [['L', 1], ['R', -1]] as [string, number][]) {
    const sh = grp(root, sx * .23, shY.y - .04, shY.z), el = grp(sh, 0, -.3, 0);
    const fore = new THREE.Group(); mesh(G.fore, bare || rand() < .7 ? skin : shirt, fore); mesh(G.hand, skin, fore, 0, -.29, 0);
    sh.add(new THREE.Mesh(bake(mesh(G.upper, shirt, new THREE.Group()).parent), cloth)); el.add(new THREE.Mesh(bake(fore), cloth));
    R['sh' + s] = sh; R['el' + s] = el;
  }
  return R;
}
/** the arm's angles with the hand on the grip ([shoulder x, shoulder z, elbow x] for the left arm; the right mirrors z):
 *  two bones and the distance between shoulder and grip give the elbow, the direction gives the shoulder */
function reachPose(R: Rider, to: number[]) {
  const S = R.shL.position, dx = to[0] - S.x, dy = to[1] - S.y, dz = to[2] - S.z, a = .3, b = .29, d = Math.min(a + b - .01, Math.hypot(dx, dy, dz));
  const bend = Math.PI - Math.acos((a * a + b * b - d * d) / (2 * a * b)), lead = Math.acos((a * a + d * d - b * b) / (2 * a * d));
  return [-(Math.atan2(dz, -dy) - lead), Math.asin(dx / d), -bend];
}
/** arms: k 0 hands at rest (rest: those angles) .. 1 up (and a little forward, into the wind), waving a little (t: a clock) */
export function poseArms(R: Rider, rest: number[], k: number, t: number) {
  const e = k * k * (3 - 2 * k), w = Math.sin(t * 5 + R.wave) * .09 * e;
  for (const [sh, el, sx] of [[R.shL, R.elL, 1], [R.shR, R.elR, -1]] as [THREE.Group, THREE.Group, number][]) {
    sh.rotation.set(rest[0] + (-2.5 + w - rest[0]) * e, 0, sx * (rest[1] + (.2 + w * .6 - rest[1]) * e));
    el.rotation.x = rest[2] + (-.25 - rest[2]) * e;
  }
}

/** a seat: which car and row, where its middle is in the car's frame (x: + the riders' left; y: the pan), where the
 *  rider's eyes are, who sits in it */
export interface Seat { car: number; row: number; x: number; y: number; z: number; eye: THREE.Vector3; rider: Rider }
export interface Consist {
  /** the cars, front to back: group is what train.ts moves; bars[row] turns on its hinge (setBars) */
  cars: { group: THREE.Group; spec: CarSpec; bars: THREE.Group[] }[];
  /** the wheel carriers, and how far behind the nose each rides */
  bogies: THREE.Mesh[]; bogieAt: number[];
  /** each car's middle, behind the nose */
  carAt: number[];
  /** 18 seats: front row first, in each row the riders' left then right */
  seats: Seat[];
  len: number;
  /** the arms' angles at rest, for poseArms: hands on the grips, and in the lap; restAt(open) between the two as the restraints open */
  rest: number[]; lap: number[];
  restAt(open: number): number[];
  /** restraints: 0 down and locked .. 1 open */
  setBars(open: number): void;
}

export function buildConsist(livery: keyof typeof LIVERY = 'green'): Consist {
  let seed = 20050521; const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  // colours on the vertices; none of it takes snow (season.ts): it is a moving machine, wiped down every morning
  const share = (o: THREE.MeshStandardMaterialParameters) => { const m = new THREE.MeshStandardMaterial({ vertexColors: true, ...o }); m.userData.noSnow = true; return m; };
  const paint = share({ roughness: .42, metalness: .08 }), metal = share({ roughness: .45, metalness: .55 }), gear = share({ roughness: .6, metalness: .2 }), cloth = share({ roughness: .85 }), barMat = share({ roughness: .6 });
  const bogie = bogieGeo(), bar = barGeo();
  const C: Consist = { cars: [], bogies: [], bogieAt: [], carAt: [], seats: [], len: 0, rest: [0, 0, 0], lap: [0, 0, 0], restAt: open => C.rest.map((a, i) => a + (C.lap[i] - a) * open), setBars(open) { for (const c of C.cars) for (const b of c.bars) b.rotation.x = OPEN * open; } };
  let at = 0;
  CARS.forEach((spec, ci) => {
    const group = new THREE.Group(), body = carBody(spec, LIVERY[livery]), bars: THREE.Group[] = [];
    const pm = new THREE.Mesh(body.paint, paint); pm.castShadow = true; group.add(pm);
    if (body.metal) group.add(new THREE.Mesh(body.metal, metal));
    spec.rows.forEach((z, row) => {
      const y = PAN + spec.lift[row], hinge = new THREE.Group(); hinge.position.set(0, y + HINGE[0], z + HINGE[1]); hinge.add(new THREE.Mesh(bar, barMat)); group.add(hinge); bars.push(hinge);
      for (const sx of [1, -1]) {
        const R = rider(rand, cloth); R.root.position.set(sx * SEAT_X, y, z); group.add(R.root);
        C.seats.push({ car: ci, row, x: sx * SEAT_X, y, z, eye: V(sx * SEAT_X, y + EYE, z + .07), rider: R });
      }
    });
    C.cars.push({ group, spec, bars }); C.carAt.push(at + spec.len / 2);
    if (spec.lead) C.bogieAt.push(at + .95);
    at += spec.len; C.bogieAt.push(at - (spec.tail ? .4 : .02));   // one at each joint (under the tail of the car ahead), and the last under its own car
  });
  C.len = at;
  C.bogieAt.forEach(() => { const b = new THREE.Mesh(bogie, gear); b.castShadow = true; C.bogies.push(b); });
  C.rest = reachPose(C.seats[0].rider, GRIP); C.lap = reachPose(C.seats[0].rider, LAP);
  for (const s of C.seats) poseArms(s.rider, C.rest, 0, 0);
  return C;
}
