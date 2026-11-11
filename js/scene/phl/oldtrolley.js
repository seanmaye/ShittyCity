// The Center City streetcar network of January 1953 (data/phl/trolley1953.json), always shown.
// Every street with track gets real track (a dark bed with two steel rails), and PCC cars run on it:
// up one street of each one-way pair and back down the other, out and back on two-way Arch and
// Market. With "Show transit lines" on, each street is also drawn as a bright line on top of
// everything, like the other transit lines (colour = when its routes were abandoned), with route
// labels; track OSM still maps gets a wider outline behind its line.
// The cars can be boarded like any other train (kind 'pcc53', registered with the subway).
import * as THREE from 'three';
import { pairs } from '../../data.js';
import { M, litMats } from '../materials.js';
import { Builder, addRibbon } from '../geometry.js';
import { SPEC } from '../subway.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

// shades picked to stand apart from the live lines' colours (PATCO and monorail reds, Broad St
// and Girard oranges, the L's blue, the Atlantic City Line's purple, the shuttles' teal) when "Show transit lines" is on
const ERAS = [
  { to: 1956, name: 'Abandoned 1953–56', color: '#a3243f' },
  { to: 1957, name: 'Abandoned 1957', color: '#b85a1e' },
  { to: 1969, name: 'Abandoned 1969 (Rt 47)', color: '#c39bf0' },
  { to: 1980, name: 'Abandoned 1980 (Rt 50)', color: '#62b6f0' },
  { to: 1992, name: 'Abandoned 1992 (Rt 23)', color: '#5fdcb5' },
];
const CASING = [{ name: 'Rails still in the street (OSM)', color: '#f4f1e8' }, { name: 'Route 23 track until 1992 (OSM)', color: '#f2c84b' }];
const GAUGE = 1.588;      // Philadelphia trolley gauge, 5 ft 2 1/4 in
const RAIL_Y = 1.0;       // top of the track bed; the cars ride on it
const LINE_W = 3.5, LIFT = 5;   // overlay line: px wide, m above the street (as in transitmap.js)
const TRACKS = 1.9;       // half the spacing of the two tracks on two-way streets
const SP = SPEC.pcc, SPEED = 7, HEADWAY = 420;   // m/s; one car about every 420 m of loop
// one-way pairs (out on one street, back on the other) and two-way streets
const PAIRS = [['23rd', '22nd'], ['20th', '19th'], ['18th', '17th'], ['16th', '15th'], ['13th', '12th'], ['11th', '10th'],
  ['9th', '8th'], ['7th', '6th'], ['5th', '4th'], ['3rd', '2nd']].map(([a, b]) => [a + ' Street', b + ' Street', 1])
  .concat([['Chestnut Street', 'Walnut Street', 0], ['Lombard Street', 'South Street', 0]]);
const TWO_WAY = ['Arch Street', 'Market Street'];
// streets that take another name for a block or two
const ALIAS = { 'West Rittenhouse Square': '19th Street', 'Independence Mall West': '6th Street', 'Independence Mall East': '5th Street',
  'West Washington Square': '7th Street', 'Old 2nd Street': '2nd Street' };

/** polyline offset sideways by d metres */
function offset(pts, d) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    return [p[0] - dz / L * d, p[1] + dx / L * d];
  });
}
/** a street's runs joined into one polyline running up axis ax (0 = x, 1 = z); gaps under 220 m are bridged */
function chain(runs, ax) {
  const rs = runs.map(r => (r[0][ax] <= r[r.length - 1][ax] ? r : [...r].reverse())).sort((a, b) => a[0][ax] - b[0][ax]);
  const chains = [];
  for (const r of rs) {
    const c = chains[chains.length - 1], end = c && c[c.length - 1];
    if (c && Math.hypot(r[0][0] - end[0], r[0][1] - end[1]) < 220 && r[r.length - 1][ax] > end[ax]) c.push(...r.filter(p => p[ax] > end[ax]));
    else chains.push([...r]);
  }
  const len = c => c.reduce((s, p, i) => s + (i ? Math.hypot(p[0] - c[i - 1][0], p[1] - c[i - 1][1]) : 0), 0);
  return chains.sort((a, b) => len(b) - len(a))[0];
}
/** the part of a polyline (increasing along ax) between lo and hi on that axis */
function clipAx(P, ax, lo, hi) {
  const at = (a, b, v) => { const t = (v - a[ax]) / ((b[ax] - a[ax]) || 1); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
  const out = [];
  for (let i = 0; i < P.length; i++) {
    const p = P[i], q = P[i + 1];
    if (p[ax] >= lo && p[ax] <= hi) out.push(p);
    if (q && (p[ax] - lo) * (q[ax] - lo) < 0) out.push(at(p, q, lo));
    if (q && (p[ax] - hi) * (q[ax] - hi) < 0) out.push(at(p, q, hi));
  }
  return out.sort((a, b) => a[ax] - b[ax]);
}
/** arc-length lookup on a closed loop of [x, z] points */
function loopRunner(P) {
  const S = [0]; for (let i = 1; i < P.length; i++) S.push(S[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const L = S[S.length - 1];
  return { L, at(s, out) {
    s = ((s % L) + L) % L; let lo = 0, hi = S.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
    const t = (s - S[lo]) / ((S[hi] - S[lo]) || 1);
    return out.set(P[lo][0] + (P[hi][0] - P[lo][0]) * t, RAIL_Y, P[lo][1] + (P[hi][1] - P[lo][1]) * t);
  } };
}

export function buildOldTrolleys(scene, data, renderer) {
  const group = new THREE.Group(); scene.add(group);                               // track and cars
  const overlay = new THREE.Group(); overlay.visible = false; scene.add(overlay);   // the "Show transit lines" lines
  const gone = Object.fromEntries(data.routes.map(r => [r.n, r.gone]));
  const eraOf = rs => { const y = Math.max(...rs.map(n => gone[n] || 0)); const i = ERAS.findIndex(e => y <= e.to); return i < 0 ? ERAS.length - 1 : i; };
  const bed = new Builder(), rails = new Builder();
  const segs = ERAS.map(() => []), casSegs = CASING.map(() => []);   // flat [x0,y0,z0, x1,y1,z1, ...] per colour
  const addSegs = (out, pts) => { for (let i = 1; i < pts.length; i++) out.push(pts[i - 1][0], LIFT, pts[i - 1][1], pts[i][0], LIFT, pts[i][1]); };
  const track = pts => {   // one track: bed and two rails
    addRibbon(bed, pts, 2.8, 0);
    for (const sd of [-1, 1]) addRibbon(rails, offset(pts, sd * GAUGE / 2), .14, 0);
  };
  const groups = new Map(), byStreet = new Map();   // route list -> longest run (labels); street -> runs (loops)
  for (const s of data.streets) {
    const pts = pairs(s.p), name = ALIAS[s.s] || s.s, two = TWO_WAY.includes(name);
    addSegs(segs[eraOf(s.r)], pts);
    if (two) { track(offset(pts, TRACKS)); track(offset(pts, -TRACKS)); } else track(pts);
    (byStreet.get(name) || byStreet.set(name, []).get(name)).push({ pts, r: s.r });
    let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const key = s.r.join(','), g = groups.get(key);
    if (!g || L > g.L) groups.set(key, { L, pts, r: s.r });
  }
  for (const r of data.rails) {
    const pts = pairs(r.p);
    addSegs(casSegs[r.st], pts);
    if (r.st === 0) track(pts);
  }

  // --- the loops the cars run on
  const loops = [];
  const routesOf = names => [...new Set(names.flatMap(n => (byStreet.get(n) || []).flatMap(o => o.r)))].sort((a, b) => a - b);
  for (const [a, b, ax] of PAIRS) {
    if (!byStreet.has(a) || !byStreet.has(b)) continue;
    const A = chain(byStreet.get(a).map(o => o.pts), ax), B = chain(byStreet.get(b).map(o => o.pts), ax);
    const lo = Math.max(A[0][ax], B[0][ax]), hi = Math.min(A[A.length - 1][ax], B[B.length - 1][ax]);
    if (hi - lo < 200) continue;
    const a2 = clipAx(A, ax, lo, hi), b2 = clipAx(B, ax, lo, hi);
    const P = [...a2, ...b2.reverse(), a2[0]];
    track([a2[a2.length - 1], b2[0]]); track([b2[b2.length - 1], a2[0]]);   // turning track across the ends
    loops.push({ P, r: routesOf([a, b]), name: `${a.replace(' Street', '')} & ${b.replace(' Street', '')} Sts` });
  }
  for (const n of TWO_WAY) {
    if (!byStreet.has(n)) continue;
    const C = chain(byStreet.get(n).map(o => o.pts), 0), out = offset(C, TRACKS), back = offset(C, -TRACKS).reverse();
    loops.push({ P: [...out, ...back, out[0]], r: routesOf([n]), name: n.replace(' Street', ' St') });
  }

  // --- the cars: PCC cars in a cream and green livery, one instance of each part per car
  const slots = [];
  loops.forEach((lp, li) => {
    const run = loopRunner(lp.P), n = Math.max(1, Math.round(run.L / HEADWAY));
    const rt = lp.r.length ? (lp.r.length > 1 ? 'Routes ' : 'Route ') + lp.r.join(', ') : 'Streetcar';
    for (let k = 0; k < n; k++) slots.push({
      path: run, s: (li * 131 + k * run.L / n) % run.L, v: SPEED * (.9 + .2 * ((li * 7 + k * 3) % 5) / 4),
      line: 'h53:' + li, lineName: `${rt} streetcar (1953, ${lp.name})`, color: '#3c6e47',
      k: 0, c: 0, pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1), q: new THREE.Quaternion(), hidden: false, boarded: false,
      sync() {}, onBoard(on) { this.boarded = on; },
    });
  });
  const geo = (w, h, l, y) => { const g = new THREE.BoxGeometry(w, h, l); g.translate(0, y, 0); return g; };
  const win = new THREE.MeshStandardMaterial({ color: '#1e2c3a', roughness: .25, metalness: .3, emissive: '#ffe6b8', emissiveIntensity: 0 });
  win.userData.lit = .8; litMats.push(win);
  const body = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .45, metalness: .25 }, o));
  const parts = [
    [geo(SP.w, SP.ch - .45, SP.car, .9 + (SP.ch - .45) / 2), body('#ece3c4')],                 // body
    [geo(SP.w - .5, .45, SP.car - 2.4, .9 + SP.ch - .2), body('#d9cfae')],                      // rounded-off roof
    [geo(SP.w + .04, .55, SP.car - .2, 1.35), body('#3c6e47')],                                 // green belt
    [geo(SP.w + .06, 1.0, SP.car - 2.2, .9 + SP.ch * .58), win],                                // windows
    [geo(SP.w * .72, .8, SP.car * .8, .45), body('#2b2b2b')],                                   // trucks and underframe
  ].map(([g, m]) => { const im = new THREE.InstancedMesh(g, m, Math.max(1, slots.length)); im.frustumCulled = false; im.castShadow = true; group.add(im); return im; });

  const p = new THREE.Vector3(), q = new THREE.Vector3(), dummy = new THREE.Object3D();
  function update(dt) {
    if (!slots.length) return;
    slots.forEach((sl, i) => {
      sl.s += sl.v * dt;
      const o = SP.car * .35;   // the body rides on two trucks, so it follows the turns smoothly
      sl.path.at(sl.s + o, p); sl.path.at(sl.s - o, q);
      sl.pos.addVectors(p, q).multiplyScalar(.5); sl.dir.subVectors(p, q);
      if (sl.dir.lengthSq() < 1e-6) sl.dir.set(0, 0, 1); sl.dir.normalize();
      dummy.position.copy(sl.pos); dummy.lookAt(sl.pos.x + sl.dir.x, sl.pos.y, sl.pos.z + sl.dir.z);
      sl.q.copy(dummy.quaternion);
      dummy.scale.setScalar(sl.boarded ? 0 : 1); dummy.updateMatrix();
      parts.forEach(m => m.setMatrixAt(i, dummy.matrix));
    });
    parts.forEach(m => { m.instanceMatrix.needsUpdate = true; });
  }

  const add = (b, color, y, lit, o = {}, into = group) => {
    if (!b.count) return;
    const mat = M(color, Object.assign({ roughness: .7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }, o));
    if (lit) { mat.emissive.set(color); mat.emissiveIntensity = 0; mat.userData.lit = lit; litMats.push(mat); }   // glows at night
    const m = new THREE.Mesh(b.geometry(), mat); m.position.y = y; m.receiveShadow = true; into.add(m);
  };
  // overlay: screen-space fat lines drawn over everything, one draw call per colour
  const mats = [], size = new THREE.Vector2();
  const fat = (flat, color, width, order) => {
    if (!flat.length) return;
    const g = new LineSegmentsGeometry(); g.setPositions(flat);
    const m = new LineMaterial({ color: new THREE.Color(color).getHex(), linewidth: width, transparent: true, opacity: .95, depthTest: false });
    m.userData.noClip = true; mats.push(m);
    const l = new LineSegments2(g, m); l.renderOrder = order; l.frustumCulled = false; overlay.add(l);
  };
  casSegs.forEach((f, i) => fat(f, CASING[i].color, LINE_W + 4, 19));   // outline behind the line
  segs.forEach((f, i) => fat(f, ERAS[i].color, LINE_W, 20));
  const resize = () => { renderer.getSize(size); mats.forEach(m => m.resolution.set(size.x, size.y)); };
  window.addEventListener('resize', resize); resize();
  add(bed, '#4a4743', .96, 0, { roughness: .95 });
  add(rails, '#b4b9be', RAIL_Y + .12, 0, { roughness: .35, metalness: .7 });

  // one label per group of routes, in the middle of its longest run (shown only with the overlay)
  const labels = [...groups.values()].map(({ pts, r }) => {
    const pt = pts[Math.floor(pts.length / 2)];
    return { text: (r.length > 1 ? 'Rts ' : 'Rt ') + r.join(' · '), pos: new THREE.Vector3(pt[0], 10, pt[1]), layer: 't53', far: 3200 };
  });
  update(0);
  return {
    labels, slots, update, cars: slots.length, loops: loops.length,
    // one "Ride a line" entry per loop, boarded through subway.boardLine('h53:<i>')
    lines: loops.map((lp, li) => ({
      id: 'h53:' + li, color: ERAS[eraOf(lp.r)].color,
      name: `${lp.r.length > 1 ? 'Rts' : 'Rt'} ${lp.r.join(', ')} · ${lp.name}`,
      hint: `You’re aboard a PCC car on the 1953 streetcar track along ${lp.name}. The cars loop out on one street and back on the other (out and back on two-way streets).`,
    })),
    setOverlay: on => { overlay.visible = !!on; return overlay.visible; },
    legend: [...ERAS.map(e => ({ ...e, kind: 'band' })), ...CASING.map(c => ({ ...c, kind: 'casing' }))],
  };
}
