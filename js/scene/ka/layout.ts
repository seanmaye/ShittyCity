// Kingda Ka's track as the scene uses it, and what its two halves give each other.
// The track is data/ka/coaster.json (tools/ka/build_track.py: OpenStreetMap's plan of the ride as it stood in 2024, set
// in height and twist from the USGS lidar survey of the standing structure). makeLayout() turns it into frames along the
// rails; structure.ts builds what stands still on them (track, tower, supports, station) and train.ts what moves (the
// train, its physics and the rider's seat). coaster.ts puts the two together for js/scene/index.ts.
import * as THREE from 'three';
import type { Coaster } from '../../types/data.ts';
import type { Label, RideLine, View } from '../../types/scene.ts';

/** a point on the track. tan: the way the train runs; up: the riders' up there (square to tan: banking, the tower's
 *  vertical runs and the twist of the descent are all in it); side: the riders' LEFT (up x tan), so (side, up, tan) are the
 *  x, y, z axes of something that faces along the track, the way every car in this engine faces along its local +z */
export interface Frame { pos: THREE.Vector3; tan: THREE.Vector3; up: THREE.Vector3; side: THREE.Vector3 }
/** the running rails: GAUGE m apart (centre to centre), RAIL m across. The centreline (Frame.pos) is midway between them
 *  at the height of their centres: structure.ts puts the rail tubes at pos -+ side * GAUGE / 2, train.ts its wheels on them.
 *  The gauge is the lidar's: the rails' returns span 1.00 m across (coaster.json truss.rail_span); the tube size is a guess */
export const GAUGE = 1, RAIL = .14;
export const newFrame = (): Frame => ({ pos: new THREE.Vector3(), tan: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0), side: new THREE.Vector3(1, 0, 0) });

/** a named stretch of track, s0..s1 m along it (coaster.json track.sections): station, launch, tower_up, tophat,
 *  tower_down, hill, brakes, turnaround (build_track.py may split these further; ids stay unique) */
export interface Section { id: string; s0: number; s1: number }

export interface Layout {
  /** the track's length, m (a closed circuit: s wraps at L) */
  L: number;
  /** the centreline's points, in order of travel from the station, and the riders' up at each */
  points: THREE.Vector3[];
  ups: THREE.Vector3[];
  /** how far along the track each point is, m (one more entry than points: the last is L) */
  dist: number[];
  sections: Section[];
  /** s brought into 0..L */
  wrap(s: number): number;
  /** the frame s m along the track (any s: it wraps), written into out */
  at(s: number, out: Frame): Frame;
  /** the same as a rotation: an object given it faces along the track (+z), head up (+y) */
  quatAt(s: number, out: THREE.Quaternion): THREE.Quaternion;
  /** the section s is in (null in a gap) */
  sectionAt(s: number): Section | null;
  /** a section by id */
  section(id: string): Section | null;
  /** the highest point: how far along it is and how high */
  top: { s: number; y: number };
}

const _f = newFrame(), _m = new THREE.Matrix4();

export function makeLayout(data: Coaster): Layout {
  const T = data.track, n = T.p.length;
  const points = T.p.map(p => new THREE.Vector3(p[0], p[1], p[2])), ups = T.n.map(v => new THREE.Vector3(v[0], v[1], v[2]).normalize());
  const dist = [0];
  for (let i = 0; i < n; i++) dist.push(dist[i] + points[i].distanceTo(points[(i + 1) % n]));
  const L = dist[n];
  // the direction of travel at each point, from its neighbours (the circuit is closed)
  const tans = points.map((_, i) => new THREE.Vector3().subVectors(points[(i + 1) % n], points[(i + n - 1) % n]).normalize());
  const wrap = (s: number) => ((s % L) + L) % L;
  let last = 0;   // where the last lookup landed: the next is nearly always beside it
  const index = (s: number) => {
    let i = Math.min(n - 1, last);
    if (dist[i] > s || dist[i + 1] <= s) { let a = 0, b = n - 1; while (a < b) { const m = (a + b + 1) >> 1; if (dist[m] <= s) a = m; else b = m - 1; } i = a; }
    return (last = i);
  };
  function at(s: number, out: Frame) {
    s = wrap(s);
    const i = index(s), j = (i + 1) % n, t = Math.min(1, Math.max(0, (s - dist[i]) / Math.max(1e-9, dist[i + 1] - dist[i])));
    out.pos.lerpVectors(points[i], points[j], t);
    out.tan.lerpVectors(tans[i], tans[j], t).normalize();
    out.up.lerpVectors(ups[i], ups[j], t); out.up.addScaledVector(out.tan, -out.up.dot(out.tan)).normalize();
    out.side.crossVectors(out.up, out.tan);
    return out;
  }
  const quatAt = (s: number, out: THREE.Quaternion) => { at(s, _f); return out.setFromRotationMatrix(_m.makeBasis(_f.side, _f.up, _f.tan)); };
  const sections = T.sections.map(o => ({ ...o }));
  const sectionAt = (s: number) => { s = wrap(s); return sections.find(o => s >= o.s0 && s < o.s1) || null; };
  const section = (id: string) => sections.find(o => o.id === id) || null;
  let ti = 0; points.forEach((p, i) => { if (p.y > points[ti].y) ti = i; });
  return { L, points, ups, dist, sections, wrap, at, quatAt, sectionAt, section, top: { s: dist[ti], y: points[ti].y } };
}

/** what index.ts gives the ride: how dark it is (0 day .. 1 night), the hour (0-24), and the page's canvas */
export interface CoasterOpts { night(): number; hour(): number; canvas: HTMLCanvasElement }

/** structure.ts: everything that stands still */
export interface StructureApi {
  labels: Label[];
  views: View[];
  /** objects shown only after dark (sky.ts nightOnly) */
  nightOnly: THREE.Object3D[];
  update(dt: number, camera: THREE.Camera): void;
  /** for the console and the test scripts (window.__city.coaster.structure.debug) */
  debug?: Record<string, unknown>;
}

/** what the page shows about the ride you are on (js/ui.ts syncCar and syncActions read it every frame): kind 'coaster'
 *  (seated: no walking; Esc gets off), hint for the panel, now a line that may change every frame, actions the buttons
 *  at the bottom (index.ts actCar -> train.act(id)) */
export interface RideState {
  kind: 'coaster'; id: number; line: string; lineName: string; model: string; hint: string; hintTouch?: string; now?: string;
  actions?: { id: string; label: string; key?: string; on?: boolean }[];
  [more: string]: unknown;
}

/** train.ts: the train and whoever rides it */
export interface TrainApi {
  /** move the train (every frame, aboard or not) */
  update(dt: number, camera: THREE.Camera): void;
  /** aboard: put the camera in the rider's head (called after update, every frame) */
  frame(camera: THREE.PerspectiveCamera): void;
  /** the seat under a screen point (x, y px in a w x h canvas), or null */
  pick(camera: THREE.Camera, x: number, y: number, w: number, h: number): number | null;
  /** sit down in a seat (none given: the front row); the ride's state */
  board(seat?: number): RideState | null;
  /** get off: where the train is and which way it faces, for the camera to step back from; null if not aboard */
  leave(): { p: THREE.Vector3; dir: THREE.Vector3; cam?: THREE.Vector3 } | null;
  /** drag to look around (px) */
  look(dx: number, dy: number): void;
  act(id: string): boolean;
  getState(): RideState | null;
  on(): boolean;
  /** the lead car, for cinematic mode to film (subway.ts cars(): pos and dir are live; at: null) */
  vehicles(): { kind: string; pos: THREE.Vector3; dir: THREE.Vector3; speed: number; hidden(): boolean; at: null }[];
  /** the "Ride a line" entry */
  line: RideLine;
  /** for the console and the test scripts (window.__city.coaster.train.debug) */
  debug?: Record<string, unknown>;
}
