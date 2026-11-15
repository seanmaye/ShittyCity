// Kingda Ka's train on its track, and the seat you ride in.
//
// One train (train 1, the green one) runs the circuit all day whether anyone is aboard or not: it loads in the station
// for a quarter of a minute, is rolled out to the launch position, waits, settles back onto the catch car, is thrown
// to 128 mph in 3.5 s, goes straight up the tower, over the top at a crawl, straight down through the spiral, over the
// hill into the brakes and creeps round the turnaround home. About one launch in fifteen comes up short, as the real
// ones sometimes did: the train stops short of the crest, falls back down the tower into the launch track's raised
// brake fins, is rolled back and launched again. physics.ts decides all of that (it is the only thing that moves the
// train); train-cars.ts is the cars, riders and restraints; hud.ts the rider's readout; sound.ts what they hear. This file puts each car on the
// rails at its own place along them, so the train bends through the pull-up and round the twist; opens the restraints
// and changes the riders in the station; and is the seat: click one (pick), sit in it (board), and frame() holds the
// camera at that rider's eyes with the whole of the track's attitude (the car's own rotation: the track goes vertical
// and rolls right over, so there is no "up" to look at it with), a neck's worth of looking about, a shake and a field
// of view that grow with speed, and a head that is pressed back by the launch and lifts over the hill.
//
// js/scene/index.ts calls update() every frame and frame() after it while you are aboard; js/ui.ts reads getState().
import * as THREE from 'three';
import { newFrame } from './layout.ts';
import type { CoasterOpts, Layout, RideState, TrainApi } from './layout.ts';
import type { Coaster } from '../../types/data.ts';
import { FT, MPH, makeRide } from './physics.ts';
import type { GForce, Phase } from './physics.ts';
import { buildConsist, poseArms } from './train-cars.ts';
import { createHud } from './hud.ts';
import { createSound } from './sound.ts';
import { CITY } from '../../cities.ts';
import { setLaunchFins } from './structure.ts';

const NECK = { yaw: 2.2, up: 1.25, down: 1.15 };   // how far a head turns each way, and tips (radians): past the shoulder, not right round
const FOV = 22;                                    // degrees the view opens by at launch speed (speed is felt at the edges of the eye)
const PITCH = [-.17, -.07];                        // where the head rests (radians): in the front row down a little, on the track and the nose; behind it, over the row in front
const HEAD = 16;                                   // how fast the head follows the car's attitude (1/s): rigid enough to read the track, soft enough to take the buzz out of it
/** what the readout calls each stretch of track (an id it does not know is shown as written) */
const WHERE: Record<string, string> = { station: 'In the station', launch: 'Launch track', pullup: 'Pull-up', tower_up: 'Straight up', tophat: 'Over the top',
  tower_down: 'Straight down · 270° spiral', pullout: 'Pull-out', hill: 'Airtime hill', brakes: 'Brake run', turnaround: 'Turnaround' };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function buildTrain(scene: THREE.Scene, layout: Layout, data: Coaster, _opts: CoasterOpts): TrainApi {
  const ride = makeRide(layout), C = buildConsist('green'), hud = createHud(), snd = createSound(CITY.storage + 'sound');
  for (const c of C.cars) scene.add(c.group);
  for (const b of C.bogies) scene.add(b);
  ride.t = 8;   // (the first launch of a visit comes soon)

  // ---- the train on the track
  const fa = newFrame(), fb = newFrame(), vx = new THREE.Vector3(), vy = new THREE.Vector3(), vz = new THREE.Vector3(), mb = new THREE.Matrix4();
  const dir = new THREE.Vector3(0, 0, 1);
  function place() {
    // a car sits on the rails at two places, near its ends: it points along the chord between them, and its up is the
    // mean of the track's there (so a car on the twist leans half-way between its ends, as a real one is wrung)
    C.cars.forEach((c, i) => {
      const s = ride.s - C.carAt[i], h = c.spec.len / 2 - .25;
      layout.at(s + h, fa); layout.at(s - h, fb);
      vz.subVectors(fa.pos, fb.pos).normalize(); vy.addVectors(fa.up, fb.up); vy.addScaledVector(vz, -vy.dot(vz)).normalize(); vx.crossVectors(vy, vz);
      c.group.position.addVectors(fa.pos, fb.pos).multiplyScalar(.5); c.group.quaternion.setFromRotationMatrix(mb.makeBasis(vx, vy, vz));
      if (!i) dir.copy(vz);
    });
    // a wheel carrier is square to the track exactly where it is: its wheels stay round the rails
    C.bogies.forEach((b, j) => { layout.at(ride.s - C.bogieAt[j], fa); b.position.copy(fa.pos); b.quaternion.setFromRotationMatrix(mb.makeBasis(fa.side, fa.up, fa.tan)); });
  }

  // ---- the riders and their restraints
  let seat = -1, bars = 0, load = 2, loadT = 0, clock = 0, frozen = false;
  /** a fresh trainload: most seats taken, a different few empty each time (yours stays yours) */
  function fill(on: boolean) {
    C.seats.forEach((s, i) => { s.rider.root.visible = i === seat || (on && Math.sin(i * 12.9898 + ride.count.rides * 78.233 + 1) * 43758.5453 % 1 > -.72); if (on) s.rider.brave = Math.abs(Math.sin(i * 7.31 + ride.count.rides * 3.7) * 9973 % 1); });
  }
  fill(true);
  function people(dt: number) {
    // in the station the restraints come up, one trainload gets off and the next sits down, and they close again a few
    // seconds before the train leaves (at once if it is sent early)
    const st = ride.phase === 'station', want = st && ride.t > 1.5 && ride.left > 4.5 ? 1 : 0;
    const moved = bars !== want, rest = bars > 0 || moved ? C.restAt(bars * bars * (3 - 2 * bars)) : C.rest;
    if (moved) { bars = clamp(bars + Math.sign(want - bars) * dt / 1.1, 0, 1); C.setBars(bars); }
    if (st && load === 2 && ride.t < 1) load = 0;
    if (load === 0 && bars > .95) { load = 1; loadT = 0; fill(false); }
    if (load === 1 && ((loadT += dt) > 3 || !st)) { load = 2; fill(true); }
    // hands: on the grips for the launch itself unless they are bold; up over the top and all the way to the brakes
    const flying = ride.phase === 'launch' || ride.phase === 'coast';
    C.seats.forEach((s, i) => {
      const r = s.rider; if (!r.root.visible) return;
      const up = flying && (i === seat ? ride.crested : r.brave > (ride.crested ? .25 : ride.phase === 'launch' ? .8 : .55)) ? 1 : 0;
      if (r.up !== up || r.up > 0 || moved) { r.up = clamp(r.up + Math.sign(up - r.up) * dt * 2.2, 0, 1); poseArms(r, rest, r.up, clock); }
    });
  }

  // ---- the rider: what they feel, where they look
  const raw: GForce = { lon: 0, vert: 1, lat: 0 }, g: GForce = { lon: 0, vert: 1, lat: 0 };
  const qHead = new THREE.Quaternion(), qLook = new THREE.Quaternion(), eul = new THREE.Euler(), eye = new THREE.Vector3(), FLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  let yaw = 0, pitch = 0, widen = 0, grey = 0, fov0 = 48, fovSet = NaN, cam: THREE.PerspectiveCamera | null = null;
  /** how far behind the nose the rider (or, with nobody aboard, the front row) is */
  const back = () => { const s = C.seats[Math.max(0, seat)]; return C.carAt[s.car] - s.z; };

  function update(dt: number) {
    clock += dt;
    if (!frozen) ride.step(dt);
    place(); people(dt);
    setLaunchFins(ride.fins);   // the launch straight's brake fins: down for the launch, up again behind the train to catch it if it comes back
    // the g-forces, eased over a tenth of a second (a body is not an accelerometer, and the track is surveyed, not drawn)
    ride.g(back(), raw); const k = 1 - Math.exp(-dt / .1);
    g.lon += (raw.lon - g.lon) * k; g.vert += (raw.vert - g.vert) * k; g.lat += (raw.lat - g.lat) * k;
    if (seat < 0) return;
    snd.update(dt, { phase: ride.phase, section: ride.section(), v: ride.v, vMax: ride.cal.vLaunch, fins: ride.fins, bars, gVert: g.vert });
    qHead.slerp(C.cars[C.seats[seat].car].group.quaternion, 1 - Math.exp(-dt * HEAD));
    const sp = Math.min(1.1, Math.abs(ride.v) / ride.cal.vLaunch);
    widen += (sp ** 1.4 + .12 * clamp(g.lon, 0, 2) - widen) * (1 - Math.exp(-dt * 3.5));
    // sight greys at the edges under sustained load: over three g through the seat, and it takes a second to come on and go
    grey += (clamp((g.vert - 3) / 2.5, 0, 1) - grey) * (1 - Math.exp(-dt / (g.vert > 3 ? .9 : .5)));
    hud.show(true); hud.set(readout());
  }

  /** the camera at the rider's eyes (index.ts, every frame after update) */
  function frame(camera: THREE.PerspectiveCamera) {
    if (seat < 0) return;
    cam = camera;
    const S = C.seats[seat], car = C.cars[S.car].group, a = Math.min(1.2, Math.abs(ride.v) / ride.cal.vLaunch) ** 2;
    // the head on its neck: pressed back by the launch, down into the shoulders in the pull-up, lifted over the hill,
    // thrown outward by the turns; and the buzz of the wheels, growing with speed
    const n = (f: number, p: number) => Math.sin(clock * f + p) + .6 * Math.sin(clock * f * 1.71 + p * 2.3);
    eye.copy(S.eye); eye.z -= clamp(g.lon, -2, 2.2) * .028; eye.y -= clamp(g.vert - 1, -1.6, 4) * .011; eye.x -= clamp(g.lat, -2, 2) * .018;
    eye.x += .004 * a * n(41, 0); eye.y += .006 * a * n(53, 1);
    camera.position.copy(eye).applyQuaternion(car.quaternion).add(car.position);
    // facing the way the car faces (a camera looks down its own -z), then the turn of the head
    eul.set(pitch + .0035 * a * n(37, 2) + .014 * clamp(g.lon, -2, 2), yaw + .0025 * a * n(29, 3), .003 * a * n(47, 4), 'YXZ');
    camera.quaternion.copy(qHead).multiply(FLIP).multiply(qLook.setFromEuler(eul));
    // the field of view opens with speed. The camera's own is the page's to set (core.ts, by the window's width): if it
    // is not what was last put here, the page has changed it, and that is the new one to open from and give back
    if (!(Math.abs(camera.fov - fovSet) < 1e-3)) fov0 = camera.fov;
    const f = fov0 + FOV * widen;
    if (Math.abs(f - camera.fov) > .01) { camera.fov = fovSet = f; camera.updateProjectionMatrix(); } else fovSet = camera.fov;
  }
  function look(dx: number, dy: number) { yaw = clamp(yaw - dx * .0045, -NECK.yaw, NECK.yaw); pitch = clamp(pitch - dy * .0045, -NECK.down, NECK.up); }

  // ---- the page
  // heights are read above the ground at the tower's foot (the file's y is above one datum for the whole ride, and the
  // tower stands a little below it): that is the height the ride's 456 ft is
  const base = typeof data.tower?.base === 'number' ? data.tower.base : 0;
  const height = () => { layout.at(ride.s - back(), fa); return (fa.pos.y - base) * FT; };
  function readout() {
    const p: Phase = ride.phase, id = ride.section(), tot = Math.hypot(g.lon, g.vert, g.lat);
    let phase = WHERE[id] || id.replace(/_/g, ' '), hot = false;
    if (p === 'station') phase = ride.left > 1 ? `Boarding · leaving in ${Math.ceil(ride.left)} s` : 'Clear';
    else if (p === 'advance') phase = 'Rolling out to the launch track';
    else if (p === 'hold') phase = ride.fins > 0 ? 'Arms down. Head back. Hold on.' : 'Hold…';
    else if (p === 'launch') { phase = 'Launch'; hot = true; }
    else if (p === 'rollback') { phase = 'Rollback!'; hot = ride.v < -1; }
    else if (p === 'reset') phase = 'Rolling back to launch again';
    else if (p === 'brakes') phase = 'Brakes';
    else if (p === 'return') phase = 'Back to the station';
    else if (id === 'tophat') phase = `Over the top · ${Math.round((layout.top.y - base) * FT)} ft`;
    else if (!ride.crested && ride.short && ride.v < 14) phase = 'Not going to make it…';
    return { phase, hot, mph: Math.abs(ride.v) * MPH, ft: height(), g: tot, vert: g.vert, grey: grey < .02 ? 0 : grey };
  }
  const ACTS: { id: string; label: string; key: string; on?: boolean }[] = [{ id: 'launch', label: 'Launch now', key: '1' }, { id: 'rollback', label: 'Force a rollback', key: '2', on: false }, { id: 'row', label: 'Back row', key: '3' },
    ...(snd.available() ? [{ id: 'sound', label: 'Sound off', key: '4' }] : [])];   // (a browser with no Web Audio gets no button)
  const rows = C.seats.length / 2, rowOf = (i: number) => Math.floor(i / 2);
  function state(): RideState {
    const row = rowOf(seat), r = readout();
    ACTS[1].on = ride.armed; ACTS[2].label = row === rows - 1 ? 'Front row' : 'Back row'; if (ACTS[3]) ACTS[3].label = snd.enabled() ? 'Sound off' : 'Sound on';
    // (the hint does not say which row: the page rewrites it only when you board, and the 3 key changes rows without that)
    const what = 'Riding Kingda Ka: 128 mph in 3.5 seconds, straight up a 456 ft tower, and straight down through a 270° spiral.';
    const acts = '“Launch now” skips the waiting; “Force a rollback” makes the next launch come up short, as about one in fifteen does by itself.';
    return { kind: 'coaster', id: seat, line: 'ka', lineName: 'Kingda Ka', model: 'Intamin accelerator coaster train', actions: ACTS,
      hint: `${what} Drag to look around. ${acts} Esc or “Get off” to leave.`, hintTouch: `${what} Drag to look around. ${acts} Tap “Get off” to leave.`,
      now: `Row ${row + 1} of ${rows} · ${r.phase} · ${Math.round(r.mph)} mph · ${Math.max(0, Math.round(r.ft))} ft up · ${r.g.toFixed(1)} g` };
  }
  function board(i = 0) {
    seat = i >= 0 && i < C.seats.length ? Math.floor(i) : 0;
    yaw = 0; pitch = PITCH[seat < 2 ? 0 : 1]; widen = grey = 0;
    C.seats[seat].rider.root.visible = true;
    qHead.copy(C.cars[C.seats[seat].car].group.quaternion);
    hud.show(true); hud.set(readout()); snd.start();
    return state();
  }
  function leave() {
    if (seat < 0) return null;
    seat = -1; hud.show(false); snd.stop();
    if (cam && Number.isFinite(fovSet)) { cam.fov = fov0; cam.updateProjectionMatrix(); }
    fovSet = NaN;
    // somewhere to watch the train from: off to the riders' right (the outside of the circuit), a little behind and above.
    // (Not "back along the way it faces": on the tower that is straight down.)
    const p = C.cars[2].group.position.clone(); layout.at(ride.s - C.len / 2, fa);
    vx.set(-fa.side.x, 0, -fa.side.z); if (vx.lengthSq() < .01) vx.set(1, 0, 0); vx.normalize();
    vz.set(fa.tan.x, 0, fa.tan.z); if (vz.lengthSq() < .01) vz.set(0, 0, 0); else vz.normalize();
    const at = p.clone().addScaledVector(vx, 30).addScaledVector(vz, -12); at.y = Math.max(p.y + 9, 11);
    return { p, dir: vz.lengthSq() ? vz.clone() : vx.clone(), cam: at };
  }
  /** the seat under a click: the nearest rider's chest, within about their own width on screen */
  function pick(camera: THREE.Camera, x: number, y: number, w: number, h: number) {
    if (seat >= 0) return null;
    const f = h / (2 * Math.tan((camera as THREE.PerspectiveCamera).fov * Math.PI / 360)); let best: number | null = null, bd = Infinity;
    C.seats.forEach((S, i) => {
      const car = C.cars[S.car].group; vy.set(S.x, S.y + .45, S.z).applyQuaternion(car.quaternion).add(car.position);
      const dist = camera.position.distanceTo(vy); if (dist > 700) return;
      vy.project(camera); if (vy.z > 1 || vy.z < -1) return;
      const d = Math.hypot((vy.x + 1) / 2 * w - x, (1 - vy.y) / 2 * h - y);
      if (d < Math.max(11, f * .5 / dist) && d < bd) { bd = d; best = i; }
    });
    return best;
  }
  function act(id: string) {
    if (seat < 0) return false;
    if (id === 'launch') ride.launchNow();
    else if (id === 'rollback') ride.forceRollback(!ride.armed);
    else if (id === 'sound') snd.setEnabled(!snd.enabled());
    else if (id === 'row') { const last = rowOf(seat) === rows - 1, side = seat % 2; C.seats[seat].rider.up = 0; poseArms(C.seats[seat].rider, C.rest, 0, 0); board(last ? side : C.seats.length - 2 + side); }
    else return false;
    return true;
  }

  place();
  // for the console and the test scripts: window.__city.coaster.train.debug
  const debug = {
    ride, consist: C, layout,
    state: () => ({ phase: ride.phase, t: ride.t, s: ride.s, v: ride.v, mph: Math.abs(ride.v) * MPH, ft: height(), section: ride.section(), seat, short: ride.short, armed: ride.armed, fins: ride.fins,
      g: { ...g }, last: { ...ride.last }, count: { ...ride.count }, cal: ride.cal }),
    /** put the nose s m along the track, coasting at v m/s */
    setS(s: number, v = 0) { ride.set(s, v); place(); },
    launch() { ride.launchNow(); }, rollback(on = true) { ride.forceRollback(on); },
    /** stop (or restart) the clock of the ride: the train stays where it is */
    freeze(on = true) { frozen = on; },
    /** run the ride on, faster than the clock, until it is in this phase (and the nose in this section, and t s into it) */
    to(phase: Phase, section = '', t = 0) {
      for (let i = 0; i < 400 * 60 && !(ride.phase === phase && (!section || ride.section() === section)); i++) ride.step(1 / 60);
      for (let i = 0; i < t * 60; i++) ride.step(1 / 60);
      for (let i = 0; i < 30; i++) { place(); people(1 / 60); ride.g(back(), raw); g.lon = raw.lon; g.vert = raw.vert; g.lat = raw.lat; }
      if (seat >= 0) qHead.copy(C.cars[C.seats[seat].car].group.quaternion);
      return debug.state();
    },
    seat(i = 0) { return board(i); },
    /** the sound: level() 0..1 as it is being played, state() the audio context's */
    sound: snd.debug,
  };
  return {
    line: { id: 'ka', name: 'Kingda Ka', group: 'Roller coasters', color: '#3f9b4b', hint: 'You’re in the front row of Kingda Ka.' },
    update, frame, pick, board, leave, look, act,
    getState: () => (seat >= 0 ? state() : null),
    on: () => seat >= 0,
    vehicles: () => [{ kind: 'coaster', pos: C.cars[0].group.position, dir, get speed() { return Math.abs(ride.v); }, hidden: () => false, at: null }],
    debug,
  };
}
