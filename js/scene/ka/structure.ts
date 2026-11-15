// Kingda Ka's standing structure: the track, the top-hat tower with Zumanjaro on its face, the supports and their
// footers, the station, the launch and brake hardware, the lights, and the ride's labels and camera views.
// Everything is placed from the layout's frames and sections (layout.ts) and from what data/ka/coaster.json says about
// the tower, the supports and the station, so a better fit of the track moves all of it; nothing is a fixed coordinate.
// The parts: struct-track.ts (the track), struct-tower.ts (the tower, Zumanjaro), struct-ground.ts (supports, station,
// launch hardware, railings); struct-kit.ts is what they are built with.
//
// The ride as modelled is that of its last ten years (2014-2024, with Zumanjaro: Drop of Doom on the tower's face). Its
// paint never changed in nineteen years, only faded: lime-green track wherever it leaves the ground, teal flat track,
// a teal tower, and every other support dark navy. The hex values are read off photographs of 2019-2022, not paint codes.
import * as THREE from 'three';
import { Builder } from '../geometry.ts';
import { litMats } from '../materials.ts';
import { newFrame } from './layout.ts';
import type { CoasterOpts, Layout, StructureApi } from './layout.ts';
import { Boxes, clamp, Parts, tally, Tubes, V } from './struct-kit.ts';
import type { Ctx, Paint } from './struct-kit.ts';
import { buildGround, FIN_DROP } from './struct-ground.ts';
import { buildTower } from './struct-tower.ts';
import { buildTrack, setBoxDepth, TRACK } from './struct-track.ts';
import type { TrackKind } from './struct-track.ts';
import type { Coaster } from '../../types/data.ts';

const GREEN = '#7cc24a', TEAL = '#35a8a2', TOWER = '#4fa6a1', NAVY = '#2a2f6a', ORANGE = '#f0701f';

/** which kind of track each stretch got (struct-track.ts); anything unnamed is box track */
const KIND: Record<string, TrackKind> = { station: 'flat', launch: 'launch', brakes: 'flat', turnaround: 'flat' };
/** the flat track is teal, but for the two sliding switch tracks at the station's ends and the launch track's first
 *  stretch, which are green like the rest: so many metres at the start of the launch and the end of the turnaround */
const GREEN_START = 25, GREEN_END = 14;

// how far the launch track's brake fins have dropped, m (a shader uniform: struct-ground.ts moves them with it)
const FIN = { value: 0 };
/** Lower the launch track's brake fins for a launch (1) or raise them again to catch a rollback (0). The fins stand up
 *  between the rails along the launch straight, fail-safe up, and drop with a hiss about five seconds before the train
 *  goes; each stretch pops back up as the train clears it. (This moves all of them together.) */
export function setLaunchFins(down: number) { FIN.value = clamp(down) * FIN_DROP; }

export function buildStructure(scene: THREE.Scene, layout: Layout, data: Coaster, opts: CoasterOpts): StructureApi {
  const group = new THREE.Group(); group.name = 'Kingda Ka'; scene.add(group);
  const f = newFrame();
  // painted steel: no snow settles on tubes (index.ts gives every other up-facing surface a white top in winter)
  const steel = (color: string, o: THREE.MeshStandardMaterialParameters = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: .6, metalness: .15, ...o }); m.userData.noSnow = true; return m; };
  const mats = {
    green: steel(GREEN), teal: steel(TEAL), tower: steel(TOWER), navy: steel(NAVY), zum: steel(ORANGE),
    grey: steel('#8f9598', { roughness: .75, metalness: .1 }), mech: steel('#5d6164', { roughness: .5, metalness: .6 }),
    conc: new THREE.MeshStandardMaterial({ color: '#b8b4a8', roughness: .92 }),
    props: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85 }),
    // what the station's lamps shine on: a little of their warm light added at night (no real lights: they would cost every material)
    glow: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85, emissive: '#ffcf8a', emissiveIntensity: 0 }),
    // lamp glass: dull by day, lit from dusk (sky.ts scales litMats by how dark it is)
    lamp: steel('#d9d6cc', { emissive: '#fff0cc', emissiveIntensity: 0 }),
  };
  mats.lamp.userData.lit = 1.5; mats.glow.userData.lit = .22; litMats.push(mats.lamp, mats.glow);

  setBoxDepth(Number((data.truss as { depth?: number } | undefined)?.depth));
  // the circuit in pieces of one kind and paint
  const pieces: { s0: number; s1: number; kind: TrackKind; paint: Paint }[] = [];
  for (const o of layout.sections) {
    const kind = KIND[o.id] || 'box', paint: Paint = kind === 'box' ? 'green' : 'teal';
    const cut = o.id === 'launch' ? Math.min(o.s1, o.s0 + GREEN_START) : o.id === 'turnaround' ? Math.max(o.s0, o.s1 - GREEN_END) : -1;
    if (cut < 0) pieces.push({ s0: o.s0, s1: o.s1, kind, paint });
    else pieces.push({ s0: o.s0, s1: cut, kind, paint: o.id === 'launch' ? 'green' : paint }, { s0: cut, s1: o.s1, kind, paint: o.id === 'launch' ? paint : 'green' });
  }
  pieces.sort((a, b) => a.s0 - b.s0);
  for (let i = 0, s = 0; i <= pieces.length; i++) {   // a gap between sections is laid as box track
    const to = i < pieces.length ? pieces[i].s0 : layout.L;
    if (to - s > .1) pieces.push({ s0: s, s1: to, kind: 'box', paint: 'green' });
    if (i < pieces.length) s = pieces[i].s1;
  }
  const pieceAt = (s: number) => { s = layout.wrap(s); return pieces.find(o => s >= o.s0 && s < o.s1); };
  const kindAt = (s: number) => pieceAt(s)?.kind || 'box';

  const c: Ctx = {
    layout, data, opts, group, mats,
    rails: { green: new Builder(), teal: new Builder() }, lace: { green: new Tubes(6), teal: new Tubes(6) }, ties: { green: new Boxes(), teal: new Boxes() }, mech: new Builder(),
    big: new Tubes(14, true), brace: new Tubes(8), col: new Tubes(12, true), strut: new Tubes(8), navy: new Boxes(),
    beams: new Boxes(), conc: new Boxes(), grey: new Boxes(), pipe: new Tubes(10, true), lamp: new Boxes(), props: new Parts(), glow: new Parts(),
    kindAt, paintAt: s => pieceAt(s)?.paint || 'green',
    under(s, out = V()) { layout.at(s, f); return out.copy(f.pos).addScaledVector(f.up, -TRACK[kindAt(s)].depth); },
    labels: [], views: [], nightOnly: [], updates: [],
  };
  for (const o of pieces) if (o.s1 - o.s0 > .05) buildTrack(layout, o.s0, o.s1, o.kind, c.rails[o.paint], c.lace[o.paint], c.ties[o.paint], c.mech);

  const tower = buildTower(c);
  const ground = buildGround(c, tower, FIN);

  const add = (m: THREE.Mesh | null, receive = false) => { if (m) { m.receiveShadow = receive; group.add(m); } return m; };
  for (const paint of ['green', 'teal'] as Paint[]) {
    if (c.rails[paint].count) { const m = new THREE.Mesh(c.rails[paint].geometry(), mats[paint]); m.name = `Kingda Ka track (${paint})`; m.castShadow = true; add(m); }
    add(c.lace[paint].mesh(mats[paint], `Kingda Ka track lacing (${paint})`, false)); add(c.ties[paint].mesh(mats[paint], `Kingda Ka track ties (${paint})`, false));
  }
  if (c.mech.count) { const m = new THREE.Mesh(c.mech.geometry(), mats.mech); m.name = 'Kingda Ka launch machinery'; add(m, true); }
  add(c.big.mesh(mats.tower, 'Kingda Ka tower legs'), true); add(c.brace.mesh(mats.tower, 'Kingda Ka tower bracing'));
  add(c.col.mesh(mats.navy, 'Kingda Ka columns'), true); add(c.strut.mesh(mats.navy, 'Kingda Ka struts')); add(c.navy.mesh(mats.navy, 'Kingda Ka posts and railings', false));
  add(c.beams.mesh(mats.zum, 'Zumanjaro tracks')); add(c.conc.mesh(mats.conc, 'Kingda Ka footers'), true);
  add(c.grey.mesh(mats.grey, 'Kingda Ka galvanised steel', false)); add(c.pipe.mesh(mats.grey, 'Kingda Ka pipes and masts', false));
  add(c.lamp.mesh(mats.lamp, 'Kingda Ka lamps', false)); add(c.props.mesh(mats.props, 'Kingda Ka buildings'), true); add(c.glow.mesh(mats.glow, 'Kingda Ka station floor'), true);

  // ---- labels and "Go to" views, all from the layout
  const h = layout.top.y, { U, W } = tower, P = (s: number) => layout.at(s, newFrame());
  const sec = (id: string) => layout.section(id), mid = (id: string, t = .5) => { const o = sec(id); return o ? o.s0 + (o.s1 - o.s0) * t : 0; };
  const box = new THREE.Box3().setFromPoints(layout.points), C = box.getCenter(V()); C.y = 0;
  const S = W.z > 0 ? W.clone() : W.clone().negate();   // the ride's sunny side (south is +z)
  const up = (y: number) => V(0, y, 0);
  // the airtime hill's top: the highest point after the tower's descent
  let sHill = mid('hill'), yHill = 0; { const o = sec('hill'); if (o) for (let s = o.s0 + (o.s1 - o.s0) * .25; s < o.s1; s += 2) { const y = P(s).pos.y; if (y > yHill) { yHill = y; sHill = s; } } }
  const hill = P(sHill), st = P(mid('station')), la = P((sec('launch')?.s0 || 0) + 8), out = P(layout.top.s + h * 1.9);
  c.labels.push(
    { text: 'Kingda Ka', pos: tower.top.clone().add(up(16)), far: 9000 },
    { text: 'Zumanjaro: Drop of Doom', pos: tower.face(tower.zumTop * .45, 0, 8), far: 1100 },
    { text: 'Kingda Ka station', pos: ground.station.clone().add(up(15)), far: 900 },
    { text: 'Airtime hill, 129 ft', pos: hill.pos.clone().add(up(9)), far: 800 },
    { text: 'Launch: 0 to 128 mph in 3.5 s', pos: P(mid('launch', .4)).pos.clone().add(up(9)), far: 600 },
  );
  c.views.push(
    { id: 'ka-ride', name: 'The whole ride', pos: C.clone().addScaledVector(S, 340).addScaledVector(U, -90).add(up(95)), target: C.clone().addScaledVector(U, 35).add(up(50)) },
    { id: 'ka-tophat', name: 'The top hat from below', pos: tower.base.clone().addScaledVector(U, -46).addScaledVector(W, 5).add(up(2.2)), target: tower.top.clone().add(up(-22)), near: 12 },
    { id: 'ka-station', name: 'The station', pos: ground.station.clone().addScaledVector(st.tan, -30).addScaledVector(S, 24).setY(30), target: ground.station.clone().add(up(3)), near: 12 },
    { id: 'ka-launch', name: 'Down the launch track', pos: la.pos.clone().addScaledVector(la.up, 2.4), target: tower.face(h * .42, 0), near: 6 },
    { id: 'ka-hill', name: 'The airtime hill', pos: hill.pos.clone().addScaledVector(S, -95).addScaledVector(U, -55).setY(yHill * .5), target: hill.pos.clone().add(up(-10)), near: 12 },
    { id: 'ka-crest', name: 'Over the crest', pos: tower.top.clone().addScaledVector(U, 7).addScaledVector(W, 9).add(up(5)), target: out.pos.clone(), near: 6 },
  );

  return {
    labels: c.labels, views: c.views, nightOnly: c.nightOnly,
    update(dt, camera) { for (const u of c.updates) u(dt, camera); },
    debug: { fins: setLaunchFins, finDrop: FIN, tower, group, tally: () => tally(group) },
  };
}
