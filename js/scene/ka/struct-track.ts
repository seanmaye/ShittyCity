// Kingda Ka's track, swept along the layout's frames: the two running rails and, under them, what carries them.
// Intamin gave the ride three kinds (told apart in photographs: no drawing was ever published; structure.ts says which
// stretch got which):
//   'box'    four tubes: the rails and two lower chords, every face laced in zigzags, about as deep as it is wide. All the
//            track that leaves the ground is this (pull-up, tower, pull-out, airtime hill): the columns stand 17-20 m
//            apart and the tower's brackets hold a track that has to carry a 128 mph train between them. There is none of
//            Intamin's three-tube track anywhere on the ride.
//   'flat'   two rails on box-section cross-ties a metre apart, like a ladder laid flat, on a pair of stringers: the
//            station, the switches, the brake run and the turn back to the station, a post under it every few metres
//   'launch' two rails on a heavy fabricated base with the catch car's trough down its middle and a cable groove either
//            side of it: the launch straight, on low concrete piers
import type { Builder } from '../geometry.ts';
import { GAUGE, RAIL, newFrame } from './layout.ts';
import type { Frame } from './layout.ts';
import { local, sweepProfile, sweepTube, V } from './struct-kit.ts';
import type { Boxes, Path, Tubes } from './struct-kit.ts';

export type TrackKind = 'flat' | 'launch' | 'box';
/** depth: how far below the rails' centres the track's underside is (where a support or a bracket meets it);
 *  pitch: the spacing of its ties, m */
export const TRACK: Record<TrackKind, { depth: number; pitch: number }> = {
  flat: { depth: .44, pitch: 1 },
  launch: { depth: .62, pitch: .75 },
  box: { depth: 1.14, pitch: 1.15 },
};
const H = GAUGE / 2, TIE = .042, LACE = .036;
/** the box track's lower chords: a little closer together than the rails, and a little lighter */
const CX = .46, CR = .06;
let CY = -1.04;
/** how deep the box track is, rail centres to chord centres, where the lidar measured it (coaster.json truss.depth) */
export function setBoxDepth(d: number) { if (d > .6 && d < 1.6) { CY = -d; TRACK.box.depth = d + CR + .04; } }

/** the track from s0 to s1 along path: rails, chords and stringers into b (one merged mesh), round ties and lacing into
 *  lace, square ones into ties, and the launch track's unpainted base into mech */
export function buildTrack(path: Path, s0: number, s1: number, kind: TrackKind, b: Builder, lace: Tubes, ties: Boxes, mech: Builder = b) {
  const K = TRACK[kind], len = s1 - s0; if (len < .05) return;
  for (const x of [-H, H]) sweepTube(b, path, s0, s1, 1, x, 0, RAIL / 2, 8);
  if (kind === 'box') for (const x of [-CX, CX]) sweepTube(b, path, s0, s1, 1, x, CY, CR, 6);
  if (kind === 'flat') {
    // the stringers the ties sit on: a pair of rolled sections just inside the rails
    for (const x of [-.36, .36]) sweepProfile(b, path, s0, s1, 2, [[x - .06, -.44], [x + .06, -.44], [x + .06, -.2], [x - .06, -.2]]);
  }
  if (kind === 'launch') {
    // the base (a welded box as wide as the track) and, standing on it, the two walls of the catch car's trough; the
    // launch cables run in the grooves between the walls and the rails
    sweepProfile(mech, path, s0, s1, 2, [[-.5, -.62], [.5, -.62], [.5, -.3], [-.5, -.3]]);
    for (const x of [-.15, .15]) sweepProfile(mech, path, s0, s1, 2, [[x - .025, -.3], [x + .025, -.3], [x + .025, -.1], [x - .025, -.1]]);
    // the painted side girders the rails' chairs stand on
    for (const x of [-H, H]) sweepProfile(b, path, s0, s1, 2, [[x - .09, -.62], [x + .09, -.62], [x + .09, -.3], [x - .09, -.3]]);
  }
  const n = Math.max(1, Math.round(len / K.pitch)), f0 = newFrame(), f1 = newFrame();
  const P = (f: Frame, x: number, y: number) => local(f, x, y, 0, V());
  for (let i = 0; i <= n; i++) {
    path.at(s0 + len * i / n, f0); const more = i < n; if (more) path.at(s0 + len * (i + 1) / n, f1);
    if (kind === 'flat') { ties.at(f0, 0, -.13, 0, GAUGE, .14, .14); continue; }
    if (kind === 'launch') {
      // the rails stand on plate chairs welded to the base, and the base's sides are stiffened by plates as closely
      for (const x of [-H, H]) { ties.at(f0, x, -.18, 0, .16, .24, .03); ties.at(f0, x * 1.2, -.46, 0, .12, .3, .025); }
      continue;
    }
    const L = P(f0, H - RAIL / 2, -.02), R = P(f0, -H + RAIL / 2, -.02), cl = P(f0, CX, CY), cr = P(f0, -CX, CY);
    // a frame at every node (tie, two posts, bottom tie), and each face braced by one diagonal a bay, leaning the other
    // way in the next: the zigzag that makes Intamin's box track read as lattice from any side
    lace.add(L, R, TIE); lace.add(L, cl, TIE); lace.add(R, cr, TIE); lace.add(cl, cr, TIE);
    if (!more) continue;
    const L1 = P(f1, H - RAIL / 2, -.02), R1 = P(f1, -H + RAIL / 2, -.02), cl1 = P(f1, CX, CY), cr1 = P(f1, -CX, CY);
    if (i % 2) { lace.add(L, cl1, LACE); lace.add(R, cr1, LACE); lace.add(cl, cr1, LACE); }
    else { lace.add(cl, L1, LACE); lace.add(cr, R1, LACE); lace.add(cr, cl1, LACE); }
  }
}
