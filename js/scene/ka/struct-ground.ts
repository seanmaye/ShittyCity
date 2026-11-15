// Kingda Ka at ground level: the supports under the track and their footers, the station, the launch track's and the
// brake run's hardware, the railings, the entrance sign, and the buildings under the ride.
// What stands where comes from coaster.json wherever the lidar fit found it (supports, station, sidings: tools/ka/) and
// is otherwise spaced out here by rule, from what the survey and photographs of the ride show:
// - airtime hill, pull-up and pull-out: single navy columns, 8-10 m apart in the valley and up to 34 m apart over the
//   hill, the tallest 37 m; each of the hill's tall ones is propped by one long raking strut from most of the way up down
//   to a footer of its own in the infield (the strip between the hill and the launch track), and tied level to it
//   half-way up. Nothing is added between two surveyed supports: the survey saw that stretch;
// - station, switches, storage tracks, brake run, the turn back: short navy posts on square concrete pedestals, close
//   together (the lidar cannot see these under the track, so they are all by rule);
// - launch straight: low concrete piers, closer still, growing into portals and then pairs of steel columns as the
//   track climbs towards the pull-up (it rises 6 m along its length).
import * as THREE from 'three';
import { withBounds } from '../geometry.ts';
import { newFrame } from './layout.ts';
import type { Frame } from './layout.ts';
import { clamp, local, openPath, sweepTube, V } from './struct-kit.ts';
import type { Ctx, Path } from './struct-kit.ts';
import type { Tower } from './struct-tower.ts';
import { buildTrack } from './struct-track.ts';

/** how far the launch track's brake fins drop to let a train out, m */
export const FIN_DROP = .3;
/** a brake fin: a copper-alloy plate standing on edge along the track; the train's magnets pass either side of it */
const FIN_L = 1.25, FIN_H = .26, FIN_T = .022, FIN_X = .34, FIN_Y = -.09, FIN_PITCH = 1.5;   // (its top stays under the rails' tops)

const TAN = '#c9a56b', ROOF = '#2f6b4f', FLOOR = '#8e4b3a', EDGE = '#e3c22f', ROCK = '#8c8377', BRICK = '#a0524a', BEIGE = '#cdbb95';

export function buildGround(c: Ctx, tw: Tower, fin: { value: number }) {
  const sidings = (Array.isArray(c.data.sidings) ? c.data.sidings : []) as { p: number[][]; n?: number[][] }[];
  const lanes = sidings.filter(o => o && Array.isArray(o.p) && o.p.length > 1).map(o => openPath(o.p, o.n));
  // extra fixed track (the second station lane, the transfer and storage tracks): flat teal track on posts, like the station's
  for (const path of lanes) { buildTrack(path, 0, path.L, 'flat', c.rails.teal, c.lace.teal, c.ties.teal); for (let s = 1.5; s < path.L; s += 3.2) posts(c, path.at(s, F), .44); }
  const station = buildStation(c, lanes);
  supports(c, tw);
  gear(c, fin);
  outbuildings(c, tw);
  return { station: station.centre };
}

const F = newFrame();

// ---------------------------------------------------------------------------------------------------- supports

/** a support the survey found (coaster.json supports): where it stands, the height and track distance where it meets the
 *  track, its kind, its feet ([x, z] each; an 'aframe' is a column on the first and a raking strut from the second, meeting
 *  the column strut_y up, the two tied level at tie_y), and how tall its concrete pedestal is */
interface Given { x: number; z: number; y?: number; s?: number; kind?: string; feet?: number[][]; strut_y?: number; tie_y?: number; pedestal?: number }

/** a column's radius for its height: the hill's tallest are about a metre across */
const colR = (h: number) => (h < 5 ? .17 : h < 12 ? .26 : h < 24 ? .36 : .46);

/** a column from a pedestal at foot (on the ground) to top, and its concrete */
function column(c: Ctx, foot: THREE.Vector3, top: THREE.Vector3, r = colR(top.y), pedestal?: number) {
  const ped = pedestal && pedestal > .1 ? Math.min(pedestal, top.y * .6) : Math.min(1, Math.max(.3, top.y * .3));
  c.conc.add(foot.x, ped / 2, foot.z, r * 2 + 1.1, ped, r * 2 + 1.1); c.grey.add(foot.x, ped + .03, foot.z, r * 2 + .55, .06, r * 2 + .55);
  c.col.add(V(foot.x, ped, foot.z), top, r);
}

/** the saddle a column's head carries the track on: a short tube across under it */
function saddle(c: Ctx, f: Frame, depth: number, r: number) {
  c.strut.add(local(f, -.62, -depth - r * .5), local(f, .62, -depth - r * .5), Math.max(.1, r * .55));
}

/** short posts under flat track at frame f: a pedestal under each stringer and, if the track is higher than that, a post on it */
function posts(c: Ctx, f: Frame, depth: number) {
  const u = local(f, 0, -depth); if (u.y < .25) return;
  if (u.y > 4.5) { saddle(c, f, depth, .3); column(c, V(u.x, 0, u.z), u.clone().addScaledVector(f.up, -.15)); return; }
  const ped = Math.min(1, u.y);
  for (const x of [-.36, .36]) {
    const p = local(f, x, -depth);
    c.conc.add(p.x, ped / 2, p.z, .6, ped, .6, Math.atan2(-f.tan.z, f.tan.x));
    if (p.y > ped + .05) c.navy.span(V(p.x, ped, p.z), p, .14, .14);
  }
  if (u.y > 1.6) c.navy.span(local(f, -.36, -depth - .5), local(f, .36, -depth - .5), .1, .1);
}

function supports(c: Ctx, tw: Tower) {
  const { layout } = c, given = (Array.isArray(c.data.supports) ? c.data.supports : []) as Given[];
  const f = newFrame(), depthAt = (s: number) => layout.at(s, f).pos.clone().sub(c.under(s)).length();
  // the way to the infield from p: towards the ride's long axis (through the middle of the tower's face)
  const infield = (p: THREE.Vector3) => tw.W.clone().multiplyScalar(V().subVectors(p, tw.base).dot(tw.W) > 0 ? -1 : 1);
  // where along the track a surveyed support stands, if the fit did not say: the nearest point of the circuit
  const sOf = (g: Given) => {
    if (typeof g.s === 'number') return g.s;
    let b = 0, bd = Infinity; layout.points.forEach((p, i) => { const d = (p.x - g.x) ** 2 + (p.z - g.z) ** 2 + (g.y === undefined ? 0 : (p.y - g.y) ** 2); if (d < bd) { bd = d; b = i; } });
    return layout.dist[b];
  };
  const taken: number[] = [];

  // ---- the supports the survey found
  for (const g of given) {
    if (typeof g.x !== 'number' || typeof g.z !== 'number') continue;
    const s = sOf(g);
    taken.push(s);
    const depth = depthAt(s), top = c.under(s); layout.at(s, f);
    const feet = (Array.isArray(g.feet) && g.feet.length ? g.feet : [[g.x, g.z]]).map(p => V(p[0], 0, p[1]));
    if (top.y < .4) continue;
    if (c.kindAt(s) !== 'box' && top.y < 4.5 && feet.length < 2) { if (c.kindAt(s) === 'launch') pier(c, f, depth); else posts(c, f, depth); continue; }
    saddle(c, f, depth, colR(top.y));
    const head = top.clone().addScaledVector(f.up, -colR(top.y) * .5);
    if (g.kind === 'bent' && feet.length >= 2) {
      // a portal: a post either side and a beam across under the track
      const a = feet[0].clone().setY(head.y - .3), b = feet[1].clone().setY(head.y - .3);
      column(c, feet[0], a); column(c, feet[1], b); c.col.add(a, b, colR(top.y) * .8);
      continue;
    }
    const r = colR(top.y);
    if (g.kind === 'aframe') {
      // a column and the raking strut that props it, from a footer of its own in the infield up to strut_y on the column
      // (two thirds up, if the survey did not say); the tallest are tied level to their strut part-way up
      const foot = feet[0], prop = feet[1] || foot.clone().addScaledVector(infield(top), top.y * .42);
      const at = (y: number) => foot.clone().lerp(head, clamp(y / Math.max(.1, head.y))), a = at(typeof g.strut_y === 'number' ? g.strut_y : head.y * .66);
      column(c, foot, head, r, g.pedestal); column(c, prop, a, r * .72);
      if (typeof g.tie_y === 'number' && g.tie_y > 2 && g.tie_y < a.y - 2) c.strut.add(at(g.tie_y), prop.clone().lerp(a, g.tie_y / a.y), r * .45);
      continue;
    }
    // a column (a foot away from under the track makes it a raking one), or several legs to one head
    for (const foot of feet) column(c, foot, head, r * (feet.length > 1 ? .85 : 1), g.pedestal);
  }

  // ---- and, where it found none, supports by rule
  // (not between two surveyed supports less than 45 m apart: the survey saw that stretch, and what it found is all there was)
  const free = (s: number, within: number) => !taken.some(t => Math.abs(layout.wrap(t - s + layout.L / 2) - layout.L / 2) < within);
  const sorted = taken.slice().sort((a, b) => a - b), surveyed = (s: number) => sorted.some((t, i) => i > 0 && s > sorted[i - 1] && s < t && t - sorted[i - 1] < 45);
  for (let s = 1.6; s < layout.L;) {
    const kind = c.kindAt(s), top = c.under(s), step = kind === 'flat' ? 3.2 : kind === 'launch' ? (top.y < 2.6 ? 2.5 : top.y < 4.5 ? 5 : 7.5) : top.y < 9 ? 8 : top.y < 24 ? 12 : 17.5;
    if (!tw.carries(s) && free(s, step * .7) && top.y > .3 && !(kind === 'box' && surveyed(s))) {
      layout.at(s, f); const depth = depthAt(s);
      if (kind === 'flat') posts(c, f, depth);
      else if (kind === 'launch') pier(c, f, depth);
      else {
        const r = colR(top.y), head = top.clone().addScaledVector(f.up, -r * .5), foot = V(head.x, 0, head.z);
        saddle(c, f, depth, r); column(c, foot, head, r);
        if (top.y > 28) {
          // the raking strut, from two thirds up down to its own footer in the infield (the survey shows them on the
          // hill's tall columns only: the lower ones stand alone)
          const w = infield(top), a = foot.clone().lerp(head, .66), b = foot.clone().addScaledVector(w, top.y * .42);
          column(c, b, a, r * .72);
          if (top.y > 25) { const m = foot.clone().lerp(head, .36); c.strut.add(m, b.clone().lerp(a, .36 / .66), r * .45); }
        }
      }
    }
    s += step;
  }
}

/** a concrete pier under the launch track at frame f: a wall across under it; a portal where the ground falls away
 *  (mid-way the launch crossed the old queue's underpass on taller piers); a pair of steel columns where it is higher still */
function pier(c: Ctx, f: Frame, depth: number) {
  const u = local(f, 0, -depth), ry = Math.atan2(-f.tan.z, f.tan.x); if (u.y < .15) return;
  if (u.y < 2.6) { c.conc.add(u.x, u.y / 2, u.z, .45, u.y, 1.8, ry); return; }
  if (u.y > 4.5) {
    const a = local(f, -.8, -depth - .2), b = local(f, .8, -depth - .2);
    column(c, V(a.x, 0, a.z), a, .2); column(c, V(b.x, 0, b.z), b, .2); c.col.add(a, b, .16);
    return;
  }
  c.conc.add(u.x, u.y - .25, u.z, .6, .5, 2.4, ry);
  for (const x of [-.85, .85]) { const p = local(f, x, -depth); c.conc.add(p.x, (u.y - .5) / 2, p.z, .5, u.y - .5, .5, ry); }
}

// ---------------------------------------------------------------------------------------------------- launch and brakes

/** a walkway or railing beside the track from s0 to s1: posts and two rails x to the riders' left of the centreline
 *  (negative: to their right), a grating deck inside it if deck, and a caged lamp on every sixth post */
function railing(c: Ctx, s0: number, s1: number, x: number, deck: boolean, lights: number[]) {
  const { layout } = c, n = Math.max(1, Math.round((s1 - s0) / 2.4)), d = (s1 - s0) / n, sx = Math.sign(x), f = newFrame();
  for (let i = 0; i <= n; i++) {
    layout.at(s0 + d * i, f);
    c.navy.at(f, x, .25, 0, .06, 1.15, .06);
    if (i < n) {
      for (const y of [.8, .3]) c.navy.at(f, x, y, d / 2, .045, .045, d);
      if (deck) c.grey.at(f, x - sx * .55, -.32, d / 2, 1, .04, d);
    }
    if (i % 6 === 3) { c.lamp.at(f, x, .95, 0, .16, .22, .16); const p = local(f, x, 1.05); lights.push(p.x, p.y, p.z); }
  }
}

function gear(c: Ctx, fin: { value: number }) {
  const { layout } = c, o = layout.section('launch'); if (!o) return;
  const f = newFrame(), len = o.s1 - o.s0, lights: number[] = [];
  // ---- the anti-rollback fins: in pairs between the rails along the teal part of the launch straight, in banks of
  // eight with a gap between banks. Raised (fail-safe: air holds them down, a spring lifts them) they would stop a train
  // that came back down the tower; they drop out of the way to let one launch. The drop is one shader uniform, so
  // moving all of them costs nothing (structure.ts setLaunchFins).
  const at: number[] = [];
  for (let s = o.s0 + Math.min(30, len * .15), i = 0; s < o.s1 - 3; s += FIN_PITCH, i++) if (i % 9 !== 8) at.push(s);
  const mat = new THREE.MeshStandardMaterial({ color: '#b58a5c', roughness: .5, metalness: .2 }); mat.userData.noSnow = true;
  const moving = mat.clone(); moving.userData.noSnow = true;
  moving.onBeforeCompile = sh => {
    sh.uniforms.uFinDrop = fin;
    sh.vertexShader = 'uniform float uFinDrop;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed.y -= uFinDrop;');
  };
  moving.customProgramCacheKey = () => 'kaLaunchFins';
  const finGeo = new THREE.BoxGeometry(FIN_T, FIN_H, FIN_L), m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = V(1, 1, 1);
  const place = (mesh: THREE.InstancedMesh, list: number[], y: number) => {
    const box = new THREE.Box3();
    list.forEach((s, i) => {
      layout.at(s, f); q.setFromRotationMatrix(m.makeBasis(f.side, f.up, f.tan));
      for (const k of [0, 1]) { const p = local(f, k ? FIN_X : -FIN_X, y); mesh.setMatrixAt(i * 2 + k, m.compose(p, q, one)); box.expandByPoint(p); }
    });
    mesh.instanceMatrix.needsUpdate = true; mesh.castShadow = false;
    const sph = box.getBoundingSphere(new THREE.Sphere()); c.group.add(withBounds(mesh, sph.center, sph.radius + 2));
  };
  if (at.length) { const mesh = new THREE.InstancedMesh(finGeo, moving, at.length * 2); mesh.name = 'Kingda Ka launch fins'; place(mesh, at, FIN_Y); }

  // ---- the fixed fins: the brake run's (two rows the length of it: permanent magnets under the cars, nothing touches),
  // which in the ride's later years began on the airtime hill's crest and ran all the way down it (the trim fins that
  // took most of the hill's airtime away). coaster.json brakes.fins_s0 .. s1 says where; without it: the hill's crest and
  // the brake run
  const fixed: number[] = [], b = layout.section('brakes'), hill = layout.section('hill'), B = (c.data.brakes || {}) as Record<string, number>;
  const plate = (s: number) => { if (c.kindAt(s) === 'box') c.ties.green.at(layout.at(s, f), 0, -.2, 0, .95, .05, .5); };   // on box track they stand on a plate across the ties
  if (B.fins_s0 > 0 && B.s1 > B.fins_s0) for (let s = B.fins_s0, i = 0; s < B.s1 - 2; s += FIN_PITCH, i++) { if (i % 9 !== 8) { fixed.push(s); plate(s); } }
  else {
    if (b) for (let s = b.s0 + 2; s < b.s1 - 2; s += FIN_PITCH) fixed.push(s);
    if (hill) {
      let top = 0, sTop = 0; for (let s = hill.s0 + (hill.s1 - hill.s0) * .25; s < hill.s1; s += 1) { const y = layout.at(s, f).pos.y; if (y > top) { top = y; sTop = s; } }
      for (let s = sTop - 12; s < sTop + 21; s += FIN_PITCH) { fixed.push(s); plate(s); }
    }
  }
  if (fixed.length) { const mesh = new THREE.InstancedMesh(finGeo, mat, fixed.length * 2); mesh.name = 'Kingda Ka brake fins'; place(mesh, fixed, FIN_Y); }

  // ---- alongside the launch: navy railings both sides, a grating walkway on the riders' right, caged lamps on the posts
  railing(c, o.s0 + 2, o.s1 - 6, 1.15, false, []);
  railing(c, o.s0 + 2, o.s1 - 6, -2.05, true, lights);
  if (b) railing(c, b.s0 + 1, b.s1 - 1, -2.05, true, lights);
  // the thick green pipe that runs the length of it (hydraulic return), and the grey pressure tank a third of the way down
  sweepTube(c.rails.green, layout, o.s0 + 4, o.s1 - 8, 4, .98, -.48, .11, 8);
  layout.at(o.s0 + len / 3, f);
  const t = local(f, -4.4, 0); t.y = Math.max(1.45, f.pos.y - 2.2);
  c.pipe.add(t.clone().addScaledVector(f.tan, -2.3), t.clone().addScaledVector(f.tan, 2.3), .8);
  for (const d of [-1.4, 1.4]) { const p = t.clone().addScaledVector(f.tan, d); c.conc.add(p.x, (t.y - .5) / 2, p.z, .4, t.y - .5, 1.4, Math.atan2(-f.tan.z, f.tan.x)); }

  if (lights.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(lights, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: '#fff3d6', size: 2.2, sizeAttenuation: false, fog: false }));
    pts.name = 'Kingda Ka launch lamps'; pts.visible = false; pts.frustumCulled = false; c.group.add(pts); c.nightOnly.push(pts);
  }
}

// ---------------------------------------------------------------------------------------------------- station

/** The station: an open-sided timber pavilion in the Golden Kingdom's jungle style, over two parallel tracks (each long
 *  enough for two trains nose to tail: four loading bays, with a sliding switch track at either end). Honey-coloured
 *  beams on round tan columns under a dark green standing-seam roof with deep eaves and bare rafters; red-brown concrete
 *  platforms with a yellow edge; a carved stone tiger's head with the ride's name in the gable that faces the plaza. */
function buildStation(c: Ctx, lanes: Path[]) {
  const { layout, data } = c, o = layout.section('station') || { s0: 0, s1: 30 }, f = layout.at((o.s0 + o.s1) / 2, newFrame());
  const S = (data.station || {}) as Record<string, number>, R = (typeof data.station?.roof === 'object' && data.station.roof ? data.station.roof : {}) as Record<string, number>;
  const X = V(f.tan.x, 0, f.tan.z).normalize(), Y = V(0, 1, 0), Z = V().crossVectors(X, Y);   // along the track, up, to the riders' right
  const given = typeof S.x === 'number' && Math.hypot(S.x - f.pos.x, S.z - f.pos.z) < 45;
  const centre = given ? V(S.x, 0, S.z) : f.pos.clone().setY(0);
  // w, d: the roof's length along the track and its width, eave to eave (coaster.json station: the lidar's outline of it)
  const OVER = 1.6, w = clamp(S.w || o.s1 - o.s0 + 8, 16, 80), yT = f.pos.y, yP = typeof S.floor === 'number' && Math.abs(S.floor - yT - .4) < .8 ? S.floor : yT + .28;
  // the lanes' places across the building: the circuit's own track, and any siding that runs through the station
  const zs = [V().subVectors(f.pos, centre).dot(Z)], g = newFrame();
  for (const path of lanes) {
    let sum = 0, n = 0;
    for (let s = 0; s <= path.L; s += 2) { const p = path.at(s, g).pos.clone().sub(centre); if (Math.abs(p.dot(X)) < w / 2 && Math.abs(p.dot(Z)) < 14) { sum += p.dot(Z); n++; } }
    if (n > 3 && zs.every(z => Math.abs(z - sum / n) > 2.5)) zs.push(sum / n);
  }
  // the fit may know of the second lane without having its track (station.lanes: both lanes' offsets): it lies as far
  // from the first as they are apart, on the side the building's middle is
  const off = (Array.isArray(data.station?.lanes) ? data.station.lanes : []) as number[];
  if (zs.length === 1 && off.length === 2 && Math.abs(off[0] - off[1]) > 2.5) zs.push(zs[0] + (zs[0] > 0 ? -1 : 1) * Math.abs(off[0] - off[1]));
  zs.sort((a, b) => a - b);
  // wide enough for a platform outside each outer lane
  const d = Math.max(S.d || 0, zs[zs.length - 1] - zs[0] + 12 + 2 * OVER), z0 = given ? 0 : (zs[0] + zs[zs.length - 1]) / 2;
  if (!given) centre.addScaledVector(Z, z0);
  const lane = zs.map(z => z - (given ? 0 : z0)), half = d / 2, zc = half - OVER, wp = w - 2;
  const ridge = Math.max(S.h || 0, yP + 6), e0 = S.eave || R.eave, eave = e0 ? clamp(e0, yP + 2.9, ridge - 1.5) : Math.max(yP + 3.4, ridge - Math.max(2.6, d * .16));
  // the roof in section, from one eave to the ridge: plainly gabled, or (as the lidar shows it) low slopes up to a raised
  // middle with its own eaves and gable, upper_d wide and upper_w long
  const tiered = R.upper_d > 2 && R.upper_d < d - 2 && R.lower_top > eave && R.upper_eave >= R.lower_top && R.upper_eave < ridge;
  const hd = tiered ? R.upper_d / 2 : 0, lowTop = tiered ? R.lower_top : ridge, upEave = tiered ? R.upper_eave : ridge, upW = tiered ? clamp(R.upper_w || w, 6, w) : w;
  const yAt = (z: number) => { z = Math.abs(z); return z >= hd ? eave + (lowTop - eave) * (half - z) / Math.max(.1, half - hd) : upEave + (ridge - upEave) * (hd - z) / Math.max(.1, hd); };   // the roof's underside over z
  const P = c.props, G = c.glow; P.frame.makeBasis(X, Y, Z).setPosition(centre); G.frame.copy(P.frame);
  const world = (x: number, y: number, z: number) => V(x, y, z).applyMatrix4(P.frame);
  /** a sloping slab len long (along the track) from the edge at (zA, yA) to the edge at (zB, yB) */
  const slab = (len: number, th: number, wid: number, zA: number, yA: number, zB: number, yB: number, color: string, x = 0) =>
    P.box(wid || len, th, Math.hypot(zB - zA, yB - yA), x, (yA + yB) / 2, (zA + zB) / 2, color, Math.atan2(yA - yB, zB - zA));

  // platforms either side of each lane's pit, with the yellow strip along every edge
  const PIT = 1.08, ph = zc + .45, edges = [-ph, ...lane.flatMap(z => [z - PIT, z + PIT]), ph];
  for (let i = 0; i < edges.length; i += 2) {
    const a = edges[i], b = edges[i + 1]; if (b - a < .3) continue;
    G.box(wp, yP, b - a, 0, yP / 2, (a + b) / 2, FLOOR);
    if (i > 0) G.box(wp, .02, .3, 0, yP + .01, a + .15, EDGE);
    if (i < edges.length - 2) G.box(wp, .02, .3, 0, yP + .01, b - .15, EDGE);
  }
  for (const z of lane) {
    // the air gates along both sides of a lane, one a row; and the tyre drives between the rails that creep the trains about
    for (let x = -wp / 2 + 3; x < wp / 2 - 3; x += 1.32) for (const k of [-1, 1]) if (Math.abs(z + k * (PIT + .55)) < ph) P.box(.95, .95, .05, x, yP + .5, z + k * (PIT + .55), '#8d9296');
    for (let x = -wp / 2 + 1.5; x < wp / 2; x += 2.6) for (const k of [-1, 1]) P.box(.5, .42, .16, x, yT - .1, z + k * .2, '#1a1a1c');
  }
  // round columns down both long sides, a beam along each row and one across at every pair, a post up to the ridge
  const nb = Math.max(2, Math.round(wp / 5.2)), yc = yAt(zc) - .1;
  for (let i = 0; i <= nb; i++) {
    const x = -wp / 2 + .4 + (wp - .8) * i / nb;
    for (const k of [-1, 1]) { P.post(.2, x, yP, yc, k * zc, TAN, 10, .17); P.box(.5, .12, .5, x, yP + .06, k * zc, '#a58a5c'); }
    P.box(.24, .42, zc * 2 + .3, x, yc - .1, 0, TAN);
    if (tiered) for (const k of [-1, 1]) P.box(.2, upEave - yc, .2, x, (upEave + yc) / 2, k * (hd - .15), TAN); else P.box(.2, ridge - yc - .2, .2, x, (ridge + yc) / 2 - .1, 0, TAN);
    // banners hang from the cross beams: red, green and gold
    if (i > 0 && i < nb) for (const k of [-1, 1]) P.box(.04, 1.5, .75, x, yc - 1.1, k * zc * .55, ['#b23a2e', '#2f6b4f', '#d8a933'][(i + (k > 0 ? 1 : 0)) % 3]);
  }
  for (const k of [-1, 1]) P.box(wp, .42, .26, 0, yc - .1, k * zc, TAN);
  // the roof: dark green standing-seam metal on bare rafters, eaves well out past the columns
  for (const k of [-1, 1]) {
    slab(w, .09, 0, k * half, eave + .2, k * hd, lowTop + .2, ROOF);
    for (let x = -w / 2 + .3; x <= w / 2 - .29; x += 1.3) slab(0, .2, .09, k * half, eave + .05, k * hd, lowTop + .05, TAN, x);
    if (!tiered) continue;
    // the raised middle: a slatted band under its own eaves, and its own gable
    P.box(upW, upEave - lowTop, .12, 0, (upEave + lowTop) / 2 + .1, k * hd, '#8a7a55');
    slab(upW + 1.2, .09, 0, k * (hd + .9), upEave + .2 - .9 * (ridge - upEave) / hd, 0, ridge + .2, ROOF);
    for (let x = -upW / 2; x <= upW / 2 + .01; x += 1.3) slab(0, .18, .09, k * (hd + .7), upEave + .05 - .7 * (ridge - upEave) / hd, 0, ridge + .05, TAN, x);
  }
  P.box(upW + 1.3, .14, .5, 0, ridge + .28, 0, '#28593f');   // ridge cap
  P.box(upW, .3, .22, 0, ridge - .12, 0, TAN);
  // the gable over the way in (the end the trains come home to): the tiger's head on its stone disc, and the name under it
  const xg = -wp / 2 - .1, yg = (yc + yAt(0)) / 2 + .3;
  P.add(new THREE.CylinderGeometry(1.25, 1.25, .3, 14).rotateZ(Math.PI / 2).translate(xg, yg, 0), ROCK);
  P.box(.36, .9, 1.1, xg - .1, yg - .05, 0, '#b7722a'); P.box(.4, .3, 1.5, xg - .1, yg + .5, 0, '#b7722a');   // the face and ears, orange stone
  P.box(.44, .3, .5, xg - .14, yg - .3, 0, '#e8dcc0');   // the muzzle
  for (const k of [-1, 1]) { P.box(.42, .16, .22, xg - .12, yg + .12, k * .28, '#f2d24a'); P.box(.4, .5, .08, xg - .12, yg + .3, k * .45, '#2a1c12'); }   // the eyes, and a stripe either side
  const bw = Math.min(6.4, d * .36);
  P.box(.16, .8, bw, xg, yc - .1, 0, '#c9b458');
  const board = new THREE.Mesh(new THREE.PlaneGeometry(bw - .16, .66), nameMat()); board.name = 'Kingda Ka station name';
  board.position.copy(world(xg - .09, yc - .1, 0)); board.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(Z, Y, X.clone().negate())); c.group.add(board);
  // a timber railing round the outer edges, and the ramp up from the plaza to the platform at the home end, on the side
  // away from the track coming back in
  const br = layout.section('brakes'), far = br ? Math.sign(layout.at((br.s0 + br.s1) / 2, g).pos.clone().sub(centre).dot(Z)) || 1 : 1;
  for (const k of [-1, 1]) {
    for (let x = -wp / 2 + .4; x < wp / 2; x += 2.6) P.box(.1, 1.1, .1, x, yP + .55, k * (ph - .08), TAN);
    for (const y of [1.05, .55]) P.box(wp * .72, .08, .08, wp * .14, yP + y, k * (ph - .08), TAN);
    if (k === far) continue;
    const L = Math.max(6, yP * 7), a = Math.atan2(yP, L);
    P.add(new THREE.BoxGeometry(Math.hypot(L, yP), .2, 2.4).rotateZ(a).translate(-wp / 2 - L / 2 + .4, yP / 2 - .1, k * (ph - 1.3)), FLOOR);
    for (const e of [-1.2, 1.2]) P.add(new THREE.BoxGeometry(Math.hypot(L, yP), .08, .08).rotateZ(a).translate(-wp / 2 - L / 2 + .4, yP / 2 + 1, k * (ph - 1.3) + e), TAN);
  }
  // the way out: a stair up from the far platform and a footbridge back over the tracks, at the launch end
  const xb = w / 2 + 1.6, yB = yT + 3.5;
  P.box(2, .2, ph * 2 + 1.5, xb, yB, 0, TAN);
  for (const k of [-1, 1]) {
    P.box(.08, .08, ph * 2 + 1.5, xb + k * .95, yB + 1.05, 0, TAN); P.box(.08, .08, ph * 2 + 1.5, xb + k * .95, yB + .55, 0, TAN);
    const L = (yB - yP) * 1.6, a = Math.atan2(yB - yP, L);
    P.add(new THREE.BoxGeometry(Math.hypot(L, yB - yP), .22, 1.6).rotateZ(a).translate(xb - 1 - L / 2, (yB + yP) / 2, k * (ph - .2)), TAN);
    for (const zz of [-ph - .5, ph + .5]) P.post(.14, xb + k * .8, 0, yB, zz, TAN, 8);
  }
  // pendant lamps under the cross beams: dark by day, lit from dusk
  for (let i = 0; i <= nb; i++) for (const k of [-1, 0, 1]) { const p = world(-wp / 2 + .4 + (wp - .8) * i / nb, yc - .55, k * zc * .6); c.lamp.put(p, new THREE.Quaternion(), .35, .22, .35); }

  // the entrance sign stands on the plaza behind the station, clear of the turn the trains come home round
  let back = -w / 2; const tu = layout.section('turnaround');
  if (tu) for (let s = tu.s0; s < tu.s1; s += 2) back = Math.min(back, layout.at(s, g).pos.clone().sub(centre).dot(X));
  buildSign(c, world(back - 14, 0, -far * 5), X);
  P.frame.identity(); G.frame.identity();
  return { centre: centre.clone().setY(yP) };
}

/** the ride's name as the park lettered it: dark green capitals edged with gold, on rock; drawn once to a small canvas */
let NAME: THREE.MeshStandardMaterial | null = null;
function nameMat() {
  if (NAME) return NAME;
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 128;
  const g = cv.getContext('2d');
  if (g) {
    g.fillStyle = ROCK; g.fillRect(0, 0, 1024, 128);
    g.font = '900 104px Archivo, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineWidth = 12; g.strokeStyle = '#c9b458'; g.strokeText('KINGDA KA', 512, 70, 980); g.fillStyle = '#1f4d3a'; g.fillText('KINGDA KA', 512, 70, 980);
  }
  const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 8;
  NAME = new THREE.MeshStandardMaterial({ map: tex, roughness: .9 }); NAME.userData.noSnow = true;
  return NAME;
}

/** The entrance sign: a faux-rock lintel on rock piers patched with red brick, a stone tiger lying along the top, and
 *  "Kingda Ka" in dark green letters edged with gold. Stood across the way in; facing: the way guests walk under it
 *  (where exactly it stood on the plaza is a guess: before the station's home end). */
function buildSign(c: Ctx, at: THREE.Vector3, facing: THREE.Vector3) {
  const P = c.props, X = facing.clone().setY(0).normalize(), Y = V(0, 1, 0), Z = V().crossVectors(X, Y);
  P.frame.makeBasis(X, Y, Z).setPosition(at);
  for (const k of [-1, 1]) {
    P.box(1.7, 4.6, 1.9, 0, 2.3, k * 4.4, ROCK); P.box(1.9, .7, 2.1, 0, .35, k * 4.4, '#7c746a');
    P.box(1.74, .9, 1.1, 0, 1.9, k * 4.5, BRICK); P.box(1.74, .6, .8, 0, 3.5, k * 4.2, BRICK);
  }
  P.box(2, 1.6, 11.6, 0, 5.3, 0, ROCK); P.box(2.2, .3, 12, 0, 6.2, 0, '#7c746a');
  // the tiger, lying along the lintel: body, haunches, head, forepaws, tail
  P.box(.9, .8, 2.6, 0, 6.75, -.2, '#a89f92'); P.box(1, .95, .9, 0, 6.8, -1.3, '#a89f92'); P.box(.8, .75, .8, 0, 7.15, 1.35, '#a89f92');
  P.box(.3, .25, 1, .3, 6.5, 1.9, '#a89f92'); P.box(.3, .25, 1, -.3, 6.5, 1.9, '#a89f92'); P.box(.2, .2, 1.4, 0, 6.5, -2.4, '#a89f92');
  const mat = nameMat();
  for (const k of [-1, 1]) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 1.2), mat); face.name = 'Kingda Ka entrance sign';
    face.position.copy(at).addScaledVector(X, k * 1.02).setY(5.3); face.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(Z.clone().multiplyScalar(-k), Y, X.clone().multiplyScalar(k)));
    c.group.add(face);
  }
}

/** The buildings under and beside the ride, which the park's own data leaves to this module. Their outlines and heights
 *  are the lidar's (2019); what they were is from photographs, and their finish is a guess from two of those.
 *  - the winch house: beige corrugated metal with green trim, low between the tower's legs (the launch's hydraulic motors
 *    and winch drum stood at the tower end of the launch track; Zumanjaro's 17 ft winch drum joined them in 2014);
 *  - Zumanjaro's shelter: a flat roof 8.5 m up on steel posts, 14 m by 27, in front of the tower's face from its middle
 *    out past the launch line, in two leaves (it slid open: the walkway to the drop tower passes under Kingda Ka's
 *    pull-up, and the roof kept anything a train dropped off the people below);
 *  - the maintenance shed by the two storage tracks, and the old queue house in the infield: an open pavilion, green
 *    roofed, left standing after the first queue (under the launch track and through it) was given up in June 2005. */
function outbuildings(c: Ctx, tw: Tower) {
  const P = c.props, Y = V(0, 1, 0), X = tw.U, Z = V().crossVectors(X, Y), k = Z.dot(tw.W) > 0 ? 1 : -1;   // k: which way the launch side is in z
  const set = (at: THREE.Vector3) => P.frame.makeBasis(X, Y, Z).setPosition(at.clone().setY(0));
  // the winch house, behind the face
  set(tw.base.clone().addScaledVector(tw.U, 5.6));
  const d = Math.min(19, tw.half * 1.35), hh = 3.8;
  P.box(8.6, hh, d, 0, hh / 2, 0, BEIGE); P.box(9.1, .2, d + .5, 0, hh + .1, 0, ROOF); P.box(8.66, .3, d + .06, 0, hh - .45, 0, ROOF);
  P.box(.1, 2.8, 3, -4.32, 1.4, d * .2, '#7f8a84'); P.box(1.6, 1, 2.2, 0, hh + .7, -d * .2, '#9fa4a6');
  // Zumanjaro's shelter
  const x0 = -21.6, x1 = -7.6, z0 = .5, z1 = 27.5, top = 8.5, gap = 11.6;
  set(tw.base);
  for (const [a, b] of [[z0, gap - .25], [gap + .25, z1]]) { P.box(x1 - x0, .16, b - a, (x0 + x1) / 2, top, k * (a + b) / 2, '#aeb4b1'); P.box(x1 - x0 + .2, .3, .2, (x0 + x1) / 2, top - .2, k * a, '#7d8386'); P.box(x1 - x0 + .2, .3, .2, (x0 + x1) / 2, top - .2, k * b, '#7d8386'); }
  for (const x of [x0 + .3, (x0 + x1) / 2, x1 - .3]) {
    P.box(.22, .3, z1 - z0, x, top - .22, k * (z0 + z1) / 2, '#7d8386');
    for (let i = 0; i <= 4; i++) { const p = V(x, 0, k * (z0 + .3 + (z1 - z0 - .6) * i / 4)).applyMatrix4(P.frame); c.pipe.add(p, p.clone().setY(top - .3), .13); c.conc.add(p.x, .15, p.z, .9, .3, .9); }
  }
  // the maintenance shed (grey ducting along the wall that faces the storage tracks)
  set(V(-90.5, 0, 48.1));
  P.box(15, 3.2, 4.5, 0, 1.6, 0, BEIGE); P.box(15.6, .2, 5.1, 0, 3.3, 0, ROOF); P.box(11, .55, .55, -1, 2.3, k * 2.55, '#9fa4a6'); P.box(2.4, 2.4, .08, 4, 1.2, k * 2.27, '#7f8a84');
  // the old queue house
  set(V(-44.3, 0, 24.2));
  const pw = 23, pd = 13, eave = 3.1, ridge = 4.7, pitch = Math.atan2(ridge - eave, pd / 2), slope = Math.hypot(pd / 2 + .8, (ridge - eave) * (1 + 1.6 / pd));
  for (const s of [-1, 1]) {
    P.box(pw + 1.2, .1, slope, 0, (eave + ridge) / 2 + .05, s * (pd / 4 + .2), ROOF, s * pitch);
    for (let i = 0; i <= 5; i++) { const x = -pw / 2 + .5 + (pw - 1) * i / 5; P.post(.16, x, 0, eave, s * (pd / 2 - .4), TAN, 8); if (s > 0) P.box(.2, .3, pd - .8, x, eave, 0, TAN); }
    P.box(pw, .3, .2, 0, eave, s * (pd / 2 - .4), TAN);
  }
  P.box(pw, .08, pd - 1, 0, .04, 0, '#a39c8f');
  P.frame.identity();
}
