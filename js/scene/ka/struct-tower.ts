// Kingda Ka's top-hat tower, and Zumanjaro: Drop of Doom on its face.
//
// What the USGS lidar survey of the standing ride shows (tools/ka/src, the 2019 flight; the 2010 one for what was there
// before Zumanjaro), and what this builds:
// - The tower is a TRIPOD, a triangle in plan. Two front legs stand side by side 27-30 m apart in a plane square to the
//   launch track, one behind the rising track and one behind the falling track, each about 4 m behind the rails it carries.
//   They are straight and lean in a little (about 15 m either side of the middle at the ground, 13 m at 104 m up), then
//   bend over together under the top hat, which crosses the top SIDEWAYS: the train goes up one leg having turned a
//   quarter turn, over the crest across the tower's face, and down the other leg through the 270-degree twist.
// - A third leg stands 20 m behind them and leans forward, a little at first, then more, to meet them at the crest.
// - Nine horizontal rings tie the three legs together, 15 m apart (12.5 m up, then 27.5, 43, 58, 73.5, 88.5, 104, 119
//   and 127.5), and on each of the two side faces one diagonal a bay climbs from the front leg at one ring to the back leg
//   at the next. The front face has no diagonals: only the rings cross it.
// - From the ring at 58 m a raking strut runs down from each front leg and from the back leg to a foot out behind either
//   back corner, tied across at 30 m: the tower's wide stance.
// - Below 60 m the track curves away from the legs (the pull-up and the pull-out): level ties 6 m apart reach out from
//   each front leg to it, with diagonals under them, down to about 25 m, where columns from the ground take over. These
//   are navy, like every support on the ride that is not the tower itself (which is teal).
// - Zumanjaro (2014) put three gondola tracks up the front face between the legs, and a pair of level struts at every ring
//   from the face back to the side faces, 5.5 m either side of the middle (they are in the 2019 survey and not the 2010 one).
// From photographs (no drawing of the tower was ever published): the front tube of every ring is a walkway with railings;
// a thin galvanised lattice mast, the service lift, climbs the whole height and stands above the crest; a railed walkway
// runs along the crest track; the main tubes are 1.2-1.6 m across and the bracing 0.4-0.6 m.
// Nothing here is a fixed coordinate: the legs are found from the track itself (layout frames), and coaster.json's
// tower.legs (the feet) and tower.levels (the rings) replace the measured proportions above when the fit provides them.
import * as THREE from 'three';
import { aviationLights } from '../buildings.ts';
import { newFrame } from './layout.ts';
import { boxesGeo, clamp, smooth, table, V } from './struct-kit.ts';
import type { Ctx } from './struct-kit.ts';

const BACK0 = 4;       // how far behind the track's centreline a front leg stands, m
const LEAN = 1.3;      // how much farther out its foot is than the track above it
const DROP = 1.3;      // how far below the rails the legs pass under the crest
/** the rings and the back leg's distance behind the face, as measured on a 139 m tower (scaled to the track's height) */
const LEVELS = [12.5, 27.5, 43, 58, 73.5, 88.5, 104, 119, 127.5], H0 = 139;
const BACKD = [[0, 20], [.42, 16], [.75, 10], [.86, 6.2], [.92, 3.8], [1, 0]];
const ZUM = 6;         // the spacing of Zumanjaro's three tracks across the face, m (photographs say about 7, the survey's struts 5.5)
const TIE = 6;         // the spacing in height of the ties that hold the pull-up to the legs

export interface Tower {
  /** unit vectors on the ground: along the launch track away from the station, and across, towards the rising track */
  U: THREE.Vector3; W: THREE.Vector3;
  /** the middle of the front face on the ground, the legs' meeting point under the crest, and the rails' highest point */
  base: THREE.Vector3; crest: THREE.Vector3; top: THREE.Vector3;
  /** half the face's width at the ground */
  half: number;
  /** a point on the front face: y up, v across from its middle, d out in front of the legs' plane */
  face(y: number, v: number, d?: number): THREE.Vector3;
  /** whether the tower carries the track at s (so no column stands under it) */
  carries(s: number): boolean;
  /** how high Zumanjaro's gondolas climb */
  zumTop: number;
}

interface Sample { s: number; y: number; p: THREE.Vector3; ty: number }

/** the point at height y on a run of points that climbs */
function atY(pts: THREE.Vector3[], y: number, out = V()) {
  if (y <= pts[0].y) return out.copy(pts[0]);
  for (let i = 1; i < pts.length; i++) if (y <= pts[i].y) return out.lerpVectors(pts[i - 1], pts[i], (y - pts[i - 1].y) / Math.max(1e-6, pts[i].y - pts[i - 1].y));
  return out.copy(pts[pts.length - 1]);
}
/** the point of a run of points nearest p */
function nearest(pts: THREE.Vector3[], p: THREE.Vector3, out = V()) {
  let best = Infinity; const ab = V(), q = V();
  for (let i = 1; i < pts.length; i++) {
    ab.subVectors(pts[i], pts[i - 1]); const t = clamp(q.subVectors(p, pts[i - 1]).dot(ab) / Math.max(1e-9, ab.lengthSq()));
    q.copy(pts[i - 1]).addScaledVector(ab, t); const d = q.distanceToSquared(p);
    if (d < best) { best = d; out.copy(q); }
  }
  return out;
}

export function buildTower(c: Ctx): Tower {
  const { layout, data } = c, T = (data.tower || {}) as Record<string, unknown>, f = newFrame();
  const h = layout.top.y, top = layout.at(layout.top.s, f).pos.clone();
  const launch = layout.section('launch');
  layout.at(launch ? launch.s1 - 15 : layout.top.s - 2 * h, f);
  const U = V(f.tan.x, 0, f.tan.z).normalize();

  // the two runs, sampled from the crest down: the rising one (back along the track) and the falling one
  const run = (dir: number) => {
    const a: Sample[] = []; let low = Infinity;
    for (let s = layout.top.s; Math.abs(s - layout.top.s) < layout.L * .45; s += dir * .5) {
      layout.at(s, f); if (f.pos.y > low + .02 || f.pos.y < 6) break;
      low = f.pos.y; a.push({ s, y: f.pos.y, p: f.pos.clone(), ty: Math.abs(f.tan.y) });
    }
    return a;
  };
  const runs = [run(-1), run(1)], sLo = runs[0][runs[0].length - 1].s, sHi = runs[1][runs[1].length - 1].s;
  const W = V(-U.z, 0, U.x); if (V().subVectors(runs[0][runs[0].length >> 1].p, runs[1][runs[1].length >> 1].p).dot(W) < 0) W.negate();
  const sAtY = (a: Sample[], y: number) => { for (let i = 1; i < a.length; i++) if (a[i].y <= y) return a[i].s + (a[i - 1].s - a[i].s) * (y - a[i].y) / Math.max(1e-6, a[i - 1].y - a[i].y); return a[a.length - 1].s; };

  // feet the fit found (coaster.json tower.legs, each with its role: 'up', 'down' or 'rear'; tower.feet for the
  // outriggers'), each used once: by the leg of that role, else by whichever leg expects one nearest
  const given = [...(Array.isArray(T.legs) ? T.legs : []), ...(Array.isArray(T.feet) ? T.feet : [])] as { x: number; z: number; role?: string }[], used = new Set<number>();
  const foot = (guess: THREE.Vector3, within: number, role?: string) => {
    let b = given.findIndex((g, i) => !used.has(i) && role !== undefined && g.role === role), bd = within;
    if (b < 0) given.forEach((g, i) => { const d = Math.hypot(g.x - guess.x, g.z - guess.z); if (!used.has(i) && !g.role && d < bd) { bd = d; b = i; } });
    if (b < 0) return guess;
    used.add(b); return V(given[b].x, 0, given[b].z);
  };
  // how far behind the rails the front legs stand (tower.track_offset, when the fit measured it)
  const BACK = typeof T.track_offset === 'number' ? clamp(T.track_offset, 2, 7) : BACK0;

  // ---- the front legs: straight from the foot to where the run above stops being straight, then round under the top hat
  const crest = runs[0][0].p.clone().addScaledVector(U, BACK); crest.y -= DROP;
  const behind = (o: Sample) => o.p.clone().addScaledVector(U, BACK);
  const legs = runs.map((a, k) => {
    // the straight part of the run: from a[i0] (below the top hat) down to a[i1] (above the pull-up or pull-out)
    let i0 = 0, i1 = a.length - 1;
    for (const thr of [.995, .98, .94, .85, .7, 0]) {
      i0 = a.findIndex(o => o.ty > thr); if (i0 < 0) { i0 = 0; continue; }
      i1 = a.length - 1; while (a[i1].ty <= thr) i1--;
      if (a[i0].y - a[i1].y > .3 * h) break;
    }
    const hi = behind(a[i0]), lo = behind(a[i1]);
    const guess = hi.y - lo.y > 5 ? hi.clone().lerp(lo, hi.y / (hi.y - lo.y)) : hi.clone(); guess.y = 0; guess.addScaledVector(W, (k ? -1 : 1) * LEAN);
    const pts = [foot(guess, 9, k ? 'down' : 'up'), hi];
    for (let i = i0 - 5; i > 0; i -= 5) { const p = behind(a[i]); p.y -= DROP * smooth((p.y - hi.y) / Math.max(1, h - hi.y)); if (p.y > pts[pts.length - 1].y + .2 && p.y < crest.y - .2) pts.push(p); }
    pts.push(crest);
    return { a, pts, yLow: a[i1].y };
  });
  const leg = (k: number, y: number, out = V()) => atY(legs[k].pts, y, out);
  const mid = (y: number, out = V()) => out.addVectors(leg(0, y), leg(1, y)).multiplyScalar(.5);
  const base = mid(0), half = legs[0].pts[0].distanceTo(legs[1].pts[0]) / 2;

  // ---- the back leg
  const backFoot = foot(base.clone().addScaledVector(U, BACKD[0][1] * h / H0), 12, 'rear');
  const reach = V().subVectors(backFoot, base), dScale = reach.dot(U) / BACKD[0][1], off = reach.dot(W);
  // where the fit followed it up the rings (tower.rear: [y, x, z] rows), it runs through those and then straight to the crest
  const rear = (Array.isArray(T.rear) ? T.rear as number[][] : []).filter(r => Array.isArray(r) && r.length > 2 && r[0] < crest.y - 8).map(r => V(r[1], r[0], r[2])).sort((a, b) => a.y - b.y);
  if (rear.length > 1) { if (rear[0].y > .5) rear.unshift(backFoot); else rear[0].y = Math.min(rear[0].y, 0); rear.push(crest); }
  const back = (y: number, out = V()) => {
    if (rear.length > 1) return atY(rear, y, out);
    const t = clamp(y / crest.y); return mid(y, out).addScaledVector(U, table(BACKD, t) * dScale).addScaledVector(W, off * (1 - t));
  };

  // ---- the rings
  const levels = ((Array.isArray(T.levels) && T.levels.length ? T.levels : LEVELS.map(y => y * h / H0)) as number[]).filter(y => y > 3 && y < crest.y - 4).sort((a, b) => a - b);
  const R = (y: number) => table([[0, .62], [.2, .62], [.21, .56], [.44, .56], [.45, .5], [.68, .5], [.69, .44], [.88, .44], [.89, .36]], y / h);   // a main leg's radius: the sections step down in size going up
  // the legs themselves, in the lengths they were bolted together from, a flange at every joint
  const joints = [0, ...levels.flatMap((y, i) => [(y + (i ? levels[i - 1] : 0)) / 2, y])];
  const column = (at: (y: number, out?: THREE.Vector3) => THREE.Vector3, ys: number[], scale = 1) => {
    for (let i = 1; i < ys.length; i++) {
      const a = at(ys[i - 1]), b = at(ys[i]), r = R((ys[i - 1] + ys[i]) / 2) * scale;
      c.big.add(a, b, r);
      if (i < ys.length - 1 && joints.includes(ys[i])) { const d = V().subVectors(b, a).normalize(); c.big.add(b.clone().addScaledVector(d, -.07), b.clone().addScaledVector(d, .07), r + .13); }
    }
  };
  legs.forEach((L, k) => column((y, out) => leg(k, y, out), [...new Set([...joints, ...L.pts.map(p => p.y)])].sort((a, b) => a - b)));
  const topRing = levels[levels.length - 1] || 0;
  column(back, [...joints, ...[.25, .5, .75, 1].map(t => topRing + (crest.y - topRing) * t)], .92);

  let pL = legs[0].pts[0], pR = legs[1].pts[0];
  const nodes = levels.map(y => {
    const L = leg(0, y), Rr = leg(1, y), B = back(y);
    c.brace.add(L, Rr, .3); c.brace.add(L, B, .26); c.brace.add(Rr, B, .26);
    c.brace.add(pL, B, .21); c.brace.add(pR, B, .21);   // the side faces' diagonals, front leg up to back leg
    pL = L; pR = Rr;
    // the front tube is a walkway: a grating along its top between railings
    const a = L.clone().lerp(Rr, .04).setY(y + .33), b = Rr.clone().lerp(L, .04).setY(y + .33);
    c.grey.span(a, b, .8, .04, U);
    for (const d of [-.42, .42]) for (const hgt of [.55, 1.1]) c.grey.span(a.clone().addScaledVector(U, d).setY(y + .33 + hgt), b.clone().addScaledVector(U, d).setY(y + .33 + hgt), .04, .04, U);
    return { y, L, R: Rr, B };
  });
  // above the top ring: one last pair of diagonals, from the front legs up to the back leg just under the crest
  { const y = topRing + (crest.y - topRing) * .7, B = back(y); c.brace.add(pL, B, .24); c.brace.add(pR, B, .24); }

  // ---- the outriggers: the tower's wide stance. Out behind either back corner stands a foot; from it one raking strut
  // climbs to the front leg and one to the back leg, both arriving at the ring four up (58 m), each with a node 30 m up
  // where it is tied level to its leg, tied to the other, and braced down to its leg's own foot.
  const struts = (Array.isArray(T.struts) ? T.struts as number[][] : []).filter(o => Array.isArray(o) && o.length > 5);
  if (struts.length) {
    // as the fit measured them: [x0, y0, z0, x1, y1, z1] each; the ones that reach the ground are the rakers
    const feet = new Map<string, THREE.Vector3>();
    for (const o of struts) {
      const a = V(o[0], o[1], o[2]), b = V(o[3], o[4], o[5]), lowest = a.y < b.y ? a : b, raker = lowest.y < 2.5 && !legs.some(L => Math.hypot(L.pts[0].x - lowest.x, L.pts[0].z - lowest.z) < 3) && Math.hypot(backFoot.x - lowest.x, backFoot.z - lowest.z) > 3;
      if (lowest.y < 2.5) lowest.y = Math.min(lowest.y, 0);
      if (raker) { c.big.add(a, b, .4); feet.set(Math.round(lowest.x) + ',' + Math.round(lowest.z), lowest); } else c.brace.add(a, b, Math.abs(a.y - b.y) < 1.5 ? .22 : .26);
    }
    for (const F of feet.values()) footer(c, F, U, 4.5, .4);
  } else if (nodes.length > 4) {
    const N = nodes[3], y1 = nodes[1].y + 2.5, k = h / H0;
    for (const sgn of [1, -1]) {
      const node = sgn > 0 ? N.L : N.R, legFoot = legs[sgn > 0 ? 0 : 1].pts[0];
      const F = foot(base.clone().addScaledVector(U, 20.5 * k).addScaledVector(W, sgn * (half + 7.5 * k)), 14);
      const n1 = F.clone().lerp(node, y1 / node.y), n2 = F.clone().lerp(N.B, y1 / N.B.y);
      c.big.add(F, node, .4); c.big.add(F, N.B, .36);
      c.brace.add(n1, n2, .22); c.brace.add(n1, leg(sgn > 0 ? 0 : 1, y1), .22); c.brace.add(n2, back(y1), .22);
      c.brace.add(n1, legFoot, .22); c.brace.add(n2, backFoot, .22);
      footer(c, F, U, 4.5, .4);
    }
  }
  for (const L of legs) footer(c, L.pts[0], U, 5.5, .62);
  footer(c, backFoot, U, 5.5, .6);

  // ---- how the track hangs on it
  // close to a leg (the straight runs and the top hat): a bracket every few metres from the track's underside straight to
  // the leg, and a second one down to it at a slant, so each is a triangle
  const p = V(), q = V(), yTie = levels.find(y => y > .15 * h) || .2 * h, carry = yTie - 3;
  for (let s = sLo; s <= sHi; s += 4.6) {
    c.under(s, p); const L = legs[s < layout.top.s ? 0 : 1], d = nearest(L.pts, p, q).distanceTo(p);
    if (d > 7.5) continue;
    c.brace.add(p, q, .15);
    if (d > 2 && q.y > 6) c.brace.add(p, atY(L.pts, q.y - 2.6), .11);
  }
  // away from it (the pull-up and the pull-out): level ties, and a diagonal under each long one
  legs.forEach((L, k) => {
    for (let y = yTie; y < L.yLow + TIE; y += TIE) {
      c.under(sAtY(L.a, y), p); leg(k, p.y, q); const d = p.distanceTo(q);
      if (d < 7.5) continue;
      c.strut.add(p, q, .2);
      if (d > 11) c.strut.add(leg(k, p.y - TIE * 1.25), p, .16);
    }
  });
  const carries = (s: number) => { s = layout.wrap(s); return s >= sLo && s <= sHi && c.under(s, V()).y > carry; };

  // ---- the crown: the walkway along the tower side of the crest track, and the service lift's mast
  const face = (y: number, v: number, d = 0) => mid(Math.min(y, crest.y)).addScaledVector(W, v).addScaledVector(U, -d).setY(y);
  const white: number[] = [];
  for (let s = layout.top.s - 9; s <= layout.top.s + 9.01; s += 1.5) {
    layout.at(s, f); const sx = f.side.dot(U) > 0 ? 1 : -1, last = s + 1.5 > layout.top.s + 9.01;
    c.grey.at(f, sx * 1.5, -.3, 0, .8, .04, 1.6);
    c.grey.at(f, sx * 1.9, .25, 0, .04, 1.1, .04);
    if (!last) { c.grey.at(f, sx * 1.9, .8, .75, .04, .04, 1.6); c.grey.at(f, sx * 1.9, .3, .75, .04, .04, 1.6); }
    if (Math.round((s - layout.top.s) / 1.5) % 4 === 0) { const l = f.pos.clone().addScaledVector(f.side, sx * 1.9).addScaledVector(f.up, .95); c.lamp.put(l, new THREE.Quaternion(), .14, .2, .14); white.push(l.x, l.y + .1, l.z); }
  }
  // the lift: a thin galvanised lattice mast the whole height of the tower, just behind the face and off its middle,
  // standing a few metres above the crest with its cab at the top (staff rode it up to push a train stalled on the crest)
  const mastTop = top.y + 3.5, mv = ZUM / 2, M = (y: number, du: number, dv: number) => face(Math.min(y, crest.y - 6), mv + dv, -2.2 - du).setY(y);
  for (const [du, dv] of [[0, 0], [.9, 0], [0, .9], [.9, .9]]) c.pipe.add(M(.5, du, dv), M(mastTop, du, dv), .045);
  for (let y = 1, i = 0; y < mastTop - 2; y += 2, i++) {
    const a = i % 2 ? 0 : .9, b = .9 - a;
    c.grey.span(M(y, a, 0), M(y + 2, b, 0), .04, .04); c.grey.span(M(y, 0, b), M(y + 2, 0, a), .04, .04);
    c.grey.span(M(y, a, .9), M(y + 2, b, .9), .04, .04); c.grey.span(M(y, .9, b), M(y + 2, .9, a), .04, .04);
  }
  const cab = M(mastTop - 1.2, .45, .45); c.grey.add(cab.x, cab.y, cab.z, 1.3, 2.3, 1.3, Math.atan2(-U.z, U.x));
  for (const N of nodes) c.brace.add(M(N.y, .45, .45), N.L.clone().lerp(N.R, .5 - mv / N.L.distanceTo(N.R)), .07);

  // ---- lights. The tower had no show lighting: by night it was dark but for its red obstruction lights (in pairs on
  // the two front legs at about 30, 55 and 75 % of the height, and at the top) and a few white work lights along the crest.
  const red = [crest.clone().setY(top.y + 1.2).addScaledVector(U, 2)];
  for (const t of [.3, .55, .75]) for (const k of [0, 1]) for (const d of [-.8, .8]) red.push(leg(k, t * h).addScaledVector(W, k ? -.8 : .8).addScaledVector(U, d));
  const beacon = aviationLights(red[0].toArray()), sides = aviationLights(red.slice(1).flatMap(v => v.toArray())), work = aviationLights(white);
  (beacon.material as THREE.PointsMaterial).size = 5; (sides.material as THREE.PointsMaterial).size = 3;
  (work.material as THREE.PointsMaterial).color.set('#fff3d6'); (work.material as THREE.PointsMaterial).size = 2.5;
  beacon.name = 'Kingda Ka beacon'; sides.name = 'Kingda Ka obstruction lights'; work.name = 'Kingda Ka crest lights';
  c.group.add(beacon, sides, work); c.nightOnly.push(beacon, sides, work);
  // the top one pulses slowly, as a red beacon on a mast this tall does (a guess: the photographs cannot say)
  let clock = 0;
  c.updates.push(dt => { clock += dt; (beacon.material as THREE.PointsMaterial).size = 3.5 + 2.5 * clamp(.5 + Math.sin(clock * Math.PI)); });

  const zum = (T.zumanjaro || data.zumanjaro || {}) as Record<string, number>;
  const tower: Tower = { U, W, base, crest, top, half, face, carries, zumTop: zum.h || h * 415 / 456 };
  buildZumanjaro(c, tower, nodes);
  return tower;
}

/** a leg's concrete: a pad on the ground and the pedestal the base plate is bolted to */
function footer(c: Ctx, p: THREE.Vector3, U: THREE.Vector3, size: number, r: number) {
  const ry = Math.atan2(-U.z, U.x);
  c.conc.add(p.x, .25, p.z, size, .5, size, ry); c.conc.add(p.x, .85, p.z, r * 2 + 1.5, .9, r * 2 + 1.5, ry);
  c.grey.add(p.x, 1.33, p.z, r * 2 + .9, .07, r * 2 + .9, ry);
}

// ---- Zumanjaro: Drop of Doom (Intamin, 2014-2024): three gondolas of eight seats on tracks up the tower's face, lifted
// 415 ft (126 m) in about half a minute and let go: 90 mph by the brakes, ten seconds from the top to the ground. Riders
// face out from the tower, down the launch track, as Kingda Ka's train comes at them at 128 mph and goes up beside them.
function buildZumanjaro(c: Ctx, tw: Tower, nodes: { y: number; L: THREE.Vector3; R: THREE.Vector3; B: THREE.Vector3 }[]) {
  const { U, W } = tw, zTop = tw.zumTop, OUT = 1.1;   // the tracks stand this far out in front of the legs' plane
  const toward = U.clone().negate();
  const B = c.beams, P = (y: number, v: number, d = OUT) => tw.face(y, v, d);
  const ry = Math.atan2(-U.z, U.x), heads: number[] = [];
  for (const k of [-1, 0, 1]) {
    const v = k * ZUM;
    // the track: an orange box column (red-orange when new, faded by the 2020s) with a rail on each edge, and the
    // brake fins (the gondola's magnets pass either side of them) up its lowest quarter: 810 ft of brake between the three
    B.span(P(.4, v), P(zTop + 4, v), .55, .7, toward);
    for (const e of [-.5, .5]) B.span(P(.4, v + e, OUT + .25), P(zTop + 3, v + e, OUT + .25), .14, .18, toward);
    c.grey.span(P(2, v, OUT + .5), P(zTop * .27, v, OUT + .5), .03, .34, W);
    // the head: a small machinery platform with railings, the sheave the lift cable turns over, and a work light
    const d = P(zTop + 4.1, v, OUT - .2);
    c.grey.add(d.x, d.y, d.z, 2.4, .1, 3, ry); B.span(P(zTop + 4.2, v), P(zTop + 5.6, v), 1.1, 1.2, toward);
    for (const [du, dw] of [[1.2, 0], [-1.2, 0], [0, 1.5], [0, -1.5]]) for (const hgt of [.55, 1.1])
      c.grey.add(d.x + U.x * du + W.x * dw, d.y + hgt, d.z + U.z * du + W.z * dw, du ? .04 : 2.4, .04, du ? 3 : .04, ry);
    const l = P(zTop + 5.4, v, OUT + .7); c.lamp.add(l.x, l.y, l.z, .3, .2, .3, ry); heads.push(l.x, l.y, l.z);
  }
  const glow = aviationLights(heads); (glow.material as THREE.PointsMaterial).color.set('#fff3d6'); (glow.material as THREE.PointsMaterial).size = 2.5;
  glow.name = 'Zumanjaro head lights'; c.group.add(glow); c.nightOnly.push(glow);
  // held to the tower at every ring: a stub to the ring's front tube, and (the outer two) a strut on back through the
  // tower to its side face
  for (const N of nodes) {
    if (N.y > zTop + 6) continue;
    const C = V().addVectors(N.L, N.R).multiplyScalar(.5), hw = N.L.distanceTo(N.R) / 2;
    for (const k of [-1, 0, 1]) {
      const v = k * ZUM, onRing = C.clone().addScaledVector(W, v);
      c.brace.add(P(N.y, v, OUT - .3), onRing, .13);
      if (k && hw > ZUM + 1) c.brace.add(onRing, (k > 0 ? N.L : N.R).clone().lerp(N.B, 1 - ZUM / hw), .14);
    }
  }
  // the loading platform at the foot of the face
  const deck = P(0, 0, OUT + 3.2);
  c.conc.add(deck.x, .3, deck.z, 7.5, .6, ZUM * 2 + 8, ry);

  // the gondolas: a row of eight seats under a beam, hung on a carriage that rides the track. Built facing +z, 0 at the
  // seats' height; instanced three times and moved every frame (one draw call)
  const seat = '#1b1b1e', lime = '#6cc04a', frame = '#e9b92b', list: [number, number, number, number, number, number, string][] = [
    [5.4, .4, .5, 0, 1.75, -.15, frame], [5.4, .16, .7, 0, -.42, .12, frame], [.2, 2.2, .5, -2.75, .65, -.15, frame], [.2, 2.2, .5, 2.75, .65, -.15, frame],   // the yellow frame round the row
    [5.2, 1.3, .05, 0, 2.6, -.3, '#141416'],   // the black mesh panel above the riders
    [1.3, 2.6, .5, 0, .7, -.75, frame], [1.7, 1.3, .4, 0, .6, -1.15, '#f2c230'],   // the arm back to the carriage, and the carriage block
  ];
  for (let i = 0; i < 8; i++) {
    const x = (i - 3.5) * .64;
    list.push([.5, 1.15, .14, x, .28, -.12, seat], [.5, .12, .46, x, -.3, .14, seat], [.34, .24, .18, x, .98, -.1, lime]);   // back, cushion, headrest
    list.push([.4, .5, .1, x, .52, .2, seat], [.07, .5, .07, x - .17, .98, .08, seat], [.07, .5, .07, x + .17, .98, .08, seat]);   // the over-the-shoulder bar
  }
  const cars = new THREE.InstancedMesh(boxesGeo(list), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .6, metalness: .2 }), 3);
  cars.name = 'Zumanjaro gondolas'; cars.frustumCulled = false; cars.material.userData.noSnow = true;
  c.group.add(cars);
  const m = new THREE.Matrix4().makeBasis(V(0, 1, 0).cross(toward), V(0, 1, 0), toward), o = new THREE.Object3D();
  o.quaternion.setFromRotationMatrix(m);
  // one cycle: load, climb together in about half a minute, hang, then each is let go on its own: free fall to the
  // brake fins (40 m/s, 90 mph, by then), about 3.5 g to a stop, and a creep down to the platform
  const Y0 = 2.1, Y1 = zTop, LOAD = 28, CLIMB = 30, HANG = 4, GAP = 2.3, G = 9.81, yBrake = Y0 + (Y1 - Y0) * .27;
  const tFall = Math.sqrt(2 * (Y1 - yBrake) / G), vB = G * tFall, tStop = 2 * (yBrake - Y0 - 2) / vB, CREEP = 4, CYCLE = LOAD + CLIMB + HANG + 2 * GAP + tFall + tStop + CREEP;
  const height = (t: number, wait: number) => {
    if (t < LOAD) return Y0;
    if ((t -= LOAD) < CLIMB) return Y0 + (Y1 - Y0) * (t / CLIMB - Math.sin(t / CLIMB * Math.PI * 2) / (Math.PI * 2));
    if ((t -= CLIMB) < HANG + wait) return Y1;
    if ((t -= HANG + wait) < tFall) return Y1 - G * t * t / 2;
    if ((t -= tFall) < tStop) return yBrake - vB * t + vB / tStop * t * t / 2;
    return Y0 + 2 * (1 - smooth((t - tStop) / CREEP));
  };
  let clock = LOAD + CLIMB * .55;
  const place = () => {
    for (let k = 0; k < 3; k++) {
      const y = height(clock % CYCLE, [1, 0, 2][k] * GAP);
      o.position.copy(P(y, (k - 1) * ZUM, OUT + 1.75)); o.updateMatrix(); cars.setMatrixAt(k, o.matrix);
    }
    cars.instanceMatrix.needsUpdate = true;
  };
  place(); c.updates.push(dt => { clock += Math.min(dt, .1); place(); });
}
