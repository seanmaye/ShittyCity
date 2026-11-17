// What Kingda Ka's standing structure is built with (structure.ts and its struct-*.ts parts): frames along any piece of
// track, tubes and profiles swept along them into one merged geometry, and batches of straight members and boxes drawn as
// one InstancedMesh each. A steel coaster is thousands of round tubes: every straight one here is an instance of one unit
// cylinder (16 or 24 triangles), every curved one a strip in a merged mesh, so the whole ride is a few dozen draw calls.
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { withBounds } from '../geometry.ts';
import type { Builder } from '../geometry.ts';
import { newFrame } from './layout.ts';
import type { CoasterOpts, Frame, Layout } from './layout.ts';
import type { TrackKind } from './struct-track.ts';
import type { Coaster } from '../../types/data.ts';
import type { Label, View } from '../../types/scene.ts';

/** something with frames along it: the circuit (Layout) or a siding (openPath) */
export interface Path { L: number; at(s: number, out: Frame): Frame }

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const smooth = (t: number) => { t = clamp(t); return t * t * (3 - 2 * t); };
/** a value from a table of [t, value] rows (t rising), straight between rows */
export function table(rows: number[][], t: number) {
  if (t <= rows[0][0]) return rows[0][1];
  for (let i = 1; i < rows.length; i++) if (t <= rows[i][0]) { const a = rows[i - 1], b = rows[i]; return a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0]); }
  return rows[rows.length - 1][1];
}

/** frames along an open run of track that is not part of the circuit (coaster.json sidings: the second station lane, the
 *  transfer track): p the centreline, n the riders' up at each point (none: straight up) */
export function openPath(p: number[][], n?: number[][]): Path {
  const P = p.map(v => V(v[0], v[1], v[2])), N = P.map((_, i) => (n && n[i] ? V(n[i][0], n[i][1], n[i][2]).normalize() : V(0, 1, 0)));
  const last = P.length - 1, dist = [0];
  for (let i = 1; i <= last; i++) dist.push(dist[i - 1] + P[i].distanceTo(P[i - 1]));
  const T = P.map((_, i) => V().subVectors(P[Math.min(last, i + 1)], P[Math.max(0, i - 1)]).normalize());
  const L = dist[last];
  return {
    L,
    at(s, out) {
      s = clamp(s, 0, L);
      let a = 0, b = last - 1; while (a < b) { const m = (a + b + 1) >> 1; if (dist[m] <= s) a = m; else b = m - 1; }
      const t = clamp((s - dist[a]) / Math.max(1e-9, dist[a + 1] - dist[a]));
      out.pos.lerpVectors(P[a], P[a + 1], t); out.tan.lerpVectors(T[a], T[a + 1], t).normalize();
      out.up.lerpVectors(N[a], N[a + 1], t); out.up.addScaledVector(out.tan, -out.up.dot(out.tan)).normalize();
      out.side.crossVectors(out.up, out.tan);
      return out;
    },
  };
}

const _f = newFrame(), _c = V(), _d = V(), _e = V(), _q = new THREE.Quaternion(), _s = V(), _m = new THREE.Matrix4(), UP = V(0, 1, 0), NORTH = V(0, 0, -1);

/** a point in a frame's own axes: x to the riders' left, y up through their heads, z ahead */
export const local = (f: Frame, x: number, y: number, z = 0, out = V()) => out.copy(f.pos).addScaledVector(f.side, x).addScaledVector(f.up, y).addScaledVector(f.tan, z);

/** how many steps of about ds fit s0..s1 */
const steps = (s0: number, s1: number, ds: number) => Math.max(1, Math.round((s1 - s0) / ds));

/** A round tube swept along path from s0 to s1 (a ring every ds or so), its middle x to the left of and y above the
 *  centreline, into b. Smooth-shaded; the faces look outward. */
export function sweepTube(b: Builder, path: Path, s0: number, s1: number, ds: number, x: number, y: number, r: number, sides = 8) {
  const n = steps(s0, s1, ds), base = b.count;
  for (let i = 0; i <= n; i++) {
    path.at(s0 + (s1 - s0) * i / n, _f); local(_f, x, y, 0, _c);
    for (let k = 0; k < sides; k++) {
      const a = k / sides * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a);
      _d.copy(_f.side).multiplyScalar(cs).addScaledVector(_f.up, sn);
      b.v(_c.x + _d.x * r, _c.y + _d.y * r, _c.z + _d.z * r, _d.x, _d.y, _d.z);
    }
  }
  for (let i = 0; i < n; i++) for (let k = 0; k < sides; k++) {
    const a = base + i * sides + k, c = base + i * sides + (k + 1) % sides, d = a + sides, e = c + sides;
    b.tri(a, c, e); b.tri(a, e, d);
  }
}

/** A flat-sided section swept the same way: pts its outline in the frame's (x, y) (x the riders' left, y their up), going
 *  round from +x towards +y, so that the faces look outward. */
export function sweepProfile(b: Builder, path: Path, s0: number, s1: number, ds: number, pts: number[][]) {
  const n = steps(s0, s1, ds), m = pts.length, base = b.count;
  for (let i = 0; i <= n; i++) {
    path.at(s0 + (s1 - s0) * i / n, _f);
    for (let k = 0; k < m; k++) {
      const p = pts[k], q = pts[(k + 1) % m], ex = q[0] - p[0], ey = q[1] - p[1], el = Math.hypot(ex, ey) || 1;
      _d.copy(_f.side).multiplyScalar(ey / el).addScaledVector(_f.up, -ex / el);   // the edge's outward normal
      local(_f, p[0], p[1], 0, _c); b.v(_c.x, _c.y, _c.z, _d.x, _d.y, _d.z);
      local(_f, q[0], q[1], 0, _c); b.v(_c.x, _c.y, _c.z, _d.x, _d.y, _d.z);
    }
  }
  for (let i = 0; i < n; i++) for (let k = 0; k < m; k++) {
    const a = base + (i * m + k) * 2, c = a + 1, d = a + m * 2, e = d + 1;
    b.tri(a, c, e); b.tri(a, e, d);
  }
}

/** Straight round members, all drawn as one InstancedMesh of a unit cylinder: add(a, b, r) one from a to b. */
export class Tubes {
  declare m: number[]; declare box: THREE.Box3; declare sides: number; declare capped: boolean;
  constructor(sides = 8, capped = false) { this.m = []; this.box = new THREE.Box3(); this.sides = sides; this.capped = capped; }
  get count() { return this.m.length / 16; }
  add(a: THREE.Vector3, b: THREE.Vector3, r: number) {
    _d.subVectors(b, a); const len = _d.length(); if (len < 1e-4) return;
    _q.setFromUnitVectors(UP, _d.divideScalar(len)); _c.addVectors(a, b).multiplyScalar(.5);
    _m.compose(_c, _q, _s.set(r, len, r)); for (let i = 0; i < 16; i++) this.m.push(_m.elements[i]);
    this.box.expandByPoint(a); this.box.expandByPoint(b);
  }
  /** a run of members through points */
  line(pts: THREE.Vector3[], r: number) { for (let i = 1; i < pts.length; i++) this.add(pts[i - 1], pts[i], r); }
  mesh(material: THREE.Material, name: string, shadow = true) {
    if (!this.count) return null;
    const geo = new THREE.CylinderGeometry(1, 1, 1, this.sides, 1, !this.capped);
    return instanced(geo, material, this.m, this.box, name, shadow);
  }
}

/** Boxes, all drawn as one InstancedMesh of a unit cube. */
export class Boxes {
  declare m: number[]; declare box: THREE.Box3;
  constructor() { this.m = []; this.box = new THREE.Box3(); }
  get count() { return this.m.length / 16; }
  /** one w x h x d (its own x, y, z) with its middle at c, turned by q */
  put(c: THREE.Vector3, q: THREE.Quaternion, w: number, h: number, d: number) {
    _m.compose(c, q, _s.set(w, h, d)); for (let i = 0; i < 16; i++) this.m.push(_m.elements[i]);
    const e = Math.max(w, h, d) / 2; this.box.expandByPoint(_e.copy(c).addScalar(e)); this.box.expandByPoint(_e.copy(c).addScalar(-e));
  }
  /** one standing on the ground frame: middle at (x, y, z), turned ry about the vertical */
  add(x: number, y: number, z: number, w: number, h: number, d: number, ry = 0) { this.put(_c.set(x, y, z), _q.setFromAxisAngle(UP, ry), w, h, d); }
  /** one in a track frame: its middle x left, y up and z ahead of the frame's point; w across, h up, d along the track */
  at(f: Frame, x: number, y: number, z: number, w: number, h: number, d: number) {
    _q.setFromRotationMatrix(_m.makeBasis(f.side, f.up, f.tan)); const c = local(f, x, y, z);
    this.put(c, _q, w, h, d);
  }
  /** one whose long (y) axis runs from a to b, w across and d deep (a beam, a rail, a plank). Its depth (z) lies as
   *  near toward as it can (none given: the vertical, so a beam stands on edge; a post's faces look north and east) */
  span(a: THREE.Vector3, b: THREE.Vector3, w: number, d: number, toward?: THREE.Vector3) {
    const dir = V().subVectors(b, a), len = dir.length(); if (len < 1e-4) return;
    dir.divideScalar(len);
    const ref = toward || (Math.abs(dir.y) > .95 ? NORTH : UP), x = V().crossVectors(dir, ref).normalize(), z = V().crossVectors(x, dir);
    _q.setFromRotationMatrix(_m.makeBasis(x, dir, z));
    this.put(V().addVectors(a, b).multiplyScalar(.5), _q, w, len, d);
  }
  mesh(material: THREE.Material, name: string, shadow = true) {
    if (!this.count) return null;
    return instanced(new THREE.BoxGeometry(1, 1, 1), material, this.m, this.box, name, shadow);
  }
}

function instanced(geo: THREE.BufferGeometry, material: THREE.Material, m: number[], box: THREE.Box3, name: string, shadow: boolean) {
  const mesh = new THREE.InstancedMesh(geo, material, m.length / 16);
  (mesh.instanceMatrix.array as Float32Array).set(m); mesh.instanceMatrix.needsUpdate = true;
  mesh.name = name; mesh.castShadow = shadow; mesh.receiveShadow = false;
  // made while the scene is built: without its instances' sphere it would be drawn unculled (geometry.ts withBounds)
  const sph = box.getBoundingSphere(new THREE.Sphere());
  return withBounds(mesh, sph.center, sph.radius + 2);
}

/** boxes [w, h, d, x, y, z, colour] (middle at x, y, z) merged into one vertex-coloured geometry: something small made of
 *  several colours that is drawn a few times over (a gondola, a sign) costs one draw call */
export function boxesGeo(list: [number, number, number, number, number, number, string][]) {
  const col = new THREE.Color(), geos = list.map(([w, h, d, x, y, z, color]) => {
    const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z), n = g.attributes.position.count, a = new Float32Array(n * 3);
    col.set(color); for (let i = 0; i < n; i++) col.toArray(a, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
  });
  return BufferGeometryUtils.mergeGeometries(geos);
}

/** how many triangles an object draws (instances counted), and how many draw calls */
export function tally(root: THREE.Object3D) {
  let tris = 0, draws = 0;
  root.traverse((o: THREE.Object3D) => {
    const me = o as THREE.InstancedMesh; if (!me.isMesh || !me.geometry) return;
    const g = me.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3;
    tris += n * (me.isInstancedMesh ? me.count : 1); draws += Array.isArray(me.material) ? me.material.length : 1;
  });
  return { tris: Math.round(tris), draws };
}

/** Odd pieces of many colours (a building, a sign, a platform), merged into one vertex-coloured mesh: one draw call for
 *  all of them. Each is added in the axes of `frame` (the station sets it to its own place and turn). */
export class Parts {
  declare geos: THREE.BufferGeometry[]; declare frame: THREE.Matrix4;
  constructor() { this.geos = []; this.frame = new THREE.Matrix4(); }
  add(g: THREE.BufferGeometry, color: string) {
    if (g.index) g = g.toNonIndexed();
    g.applyMatrix4(this.frame); g.deleteAttribute('uv');
    const n = g.attributes.position.count, a = new Float32Array(n * 3), col = new THREE.Color(color);
    for (let i = 0; i < n; i++) col.toArray(a, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); this.geos.push(g);
  }
  /** a box w x h x d with its middle at (x, y, z), turned rx about its long (x) axis then ry about the vertical */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: string, rx = 0, ry = 0) {
    const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); if (ry) g.rotateY(ry);
    this.add(g.translate(x, y, z), color);
  }
  /** an upright round post, radius r (r1 at the top), from y0 to y1 */
  post(r: number, x: number, y0: number, y1: number, z: number, color: string, sides = 10, r1 = r) {
    this.add(new THREE.CylinderGeometry(r1, r, y1 - y0, sides).translate(x, (y0 + y1) / 2, z), color);
  }
  mesh(material: THREE.Material, name: string) {
    if (!this.geos.length) return null;
    const m = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(this.geos), material); m.name = name; m.castShadow = m.receiveShadow = true;
    return m;
  }
}

/** the two paints the track itself wears: lime green everywhere it leaves the ground, teal on the flat track */
export type Paint = 'green' | 'teal';

/** what structure.ts hands each of its parts: the layout and data, and the batches everything goes into */
export interface Ctx {
  layout: Layout; data: Coaster; opts: CoasterOpts; group: THREE.Group;
  /** the track's own steel, by paint: the curved tubes (one merged mesh each) and the ties between them */
  rails: Record<Paint, Builder>; lace: Record<Paint, Tubes>; ties: Record<Paint, Boxes>;
  /** unpainted machinery swept along the track: the launch track's base and the catch car's trough */
  mech: Builder;
  /** the tower's steel (teal): legs (round, capped) and bracing (lighter) */
  big: Tubes; brace: Tubes;
  /** every other support (navy): columns and struts; and navy square sections (posts, railings) */
  col: Tubes; strut: Tubes; navy: Boxes;
  /** Zumanjaro's orange; concrete (footers, piers); bare galvanised steel, flat and round; lamps that glow after dark */
  beams: Boxes; conc: Boxes; grey: Boxes; pipe: Tubes; lamp: Boxes;
  /** buildings and other many-coloured pieces; and those of them that lamps light after dark (the station's floor) */
  props: Parts; glow: Parts;
  /** the track's weight and paint at s (struct-track.ts), and the point on its underside there, where a support meets it */
  kindAt(s: number): TrackKind;
  paintAt(s: number): Paint;
  under(s: number, out?: THREE.Vector3): THREE.Vector3;
  mats: Record<string, THREE.MeshStandardMaterial>;
  labels: Label[]; views: View[]; nightOnly: THREE.Object3D[];
  /** called every frame */
  updates: ((dt: number, camera: THREE.Camera) => void)[];
}
