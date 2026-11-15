// How Kingda Ka's train moves: one number (how far its nose is along the track) and its rate of change, pushed by
// gravity, the launch, friction, the air and the brakes, with the ride's control system (the cycle of a launch) on top.
// Nothing here draws anything: train.ts builds the cars and reads s, v and g from this; test/ka-physics.test.js runs it
// on its own.
//
// The train is a chain of cars, not a point. Each car is pulled along the track by the height its two ends differ by,
// so a train bent over the top hat is pulled both ways at once: it slows until its middle is over the crest (not its
// nose), creeps there, and with too little speed hangs with its front cars over the top and slides back. Losses are
// rolling friction (in proportion to how hard the wheels are pressed on the rails, so more in the pull-up) and air drag
// (as speed squared). The brakes are magnetic (fins on the track between magnets on the cars): their drag is in
// proportion to speed, which is why they can never quite stop a train and tyres take over at a crawl.
//
// Nothing is tuned to one track. data/ka/coaster.json is fitted to a survey and may change: from whatever geometry it
// holds, calibrate() finds the air drag that brings a 128 mph launch over the crest at the speed the real ride had
// there, the thrust that reaches 128 mph in 3.5 s, the strength both sets of brakes need for the track they have, and
// (when a launch is to come up short) the speed that stalls the train a chosen distance below the top.
import { newFrame } from './layout.ts';
import type { Layout, Section } from './layout.ts';

export const G = 9.81, MPH = 2.23694, FT = 3.28084;

/** the ride's figures (the dossier: Six Flags and Intamin's published ones, and what on-ride videos show) */
export const SPEC = {
  /** the launch: 128 mph, reached in 3.5 s */
  vLaunch: 128 / MPH, tLaunch: 3.5,
  /** over the top of a normal launch, m/s (18 mph: never published; trains "only just cleared", and the dossier puts it
   *  at 7-10 m/s from on-ride videos; it varied with the weather and the load) */
  vCrest: 8,
  /** a launch in this many comes up short by itself */
  rollbackOdds: 15,
  /** rolling friction (steel-cored polyurethane wheels: 0.008-0.012) */
  mu: .01,
  /** the tyres in the station, the launch area and the turnaround: how fast they roll a train, and how hard they push */
  vCrawl: 4.2, vAdvance: 3.6, aTyre: 1.4,
  /** the little roll back onto the catch car before a launch (m), and how long before the launch it happens (s: the
   *  fins drop with it; "arms down, head back, hold on") */
  nudge: .3, arm: 4,
  /** s in the station between rides (min, max), and on the launch track before the launch (the real ride sat there
   *  15 s or more, waiting on its hydraulics and on the drop ride on the tower) */
  dwell: [15, 20], hold: [6, 8.5],
  /** the magnetic trims on the airtime hill (fitted in the ride's later years, from its crest on down), as a share of the brake run's own strength */
  trim: .3,
};

/** the train as the physics sees it: each car's length along the track (m, the first in front) and its share of the mass */
export interface Consist { cars: number[]; mass?: number[] }

/** where in a ride the train is:
 *  station (standing at the platform) -> advance (tyres roll it out to the launch position) -> hold (waiting; near the
 *  end it rolls back a little onto the catch car and the brake fins drop) -> launch (thrust) -> coast (gravity only:
 *  the tower, the hill) -> brakes (in the brake run's magnets) -> return (tyres, round the turnaround into the station).
 *  A launch that fails: coast -> rollback (backwards down the tower into the launch track's raised brakes) -> reset
 *  (tyres roll it back to the launch position) -> hold -> launch again. */
export type Phase = 'station' | 'advance' | 'hold' | 'launch' | 'coast' | 'rollback' | 'reset' | 'brakes' | 'return';

/** what a rider feels, in g: lon (+ pressed back into the seat), vert (1 sitting still; under 0 lifted out of the seat),
 *  lat (+ thrown to the rider's right) */
export interface GForce { lon: number; vert: number; lat: number }

/** what calibrate() found for this track */
export interface Calibration {
  /** air drag: deceleration = k v^2 (1/m) */
  k: number; mu: number;
  /** the launch speed used (SPEC.vLaunch unless the track cannot be crested with it) and the thrust's acceleration, m/s^2 */
  vLaunch: number; thrust: number;
  /** the magnetic brakes: deceleration = c v (1/s), with the whole train in them: the brake run's and the launch straight's */
  cBrake: number; cFins: number;
  /** a normal launch, as simulated when calibrating: speed over the crest, over the airtime hill and into the brake run
   *  (m/s), the time from the launch to the crest and to the brakes (s), where the thrust lets go (m along the track) */
  vCrest: number; vHill: number; vBrakes: number; tCrest: number; tBrakes: number; sRelease: number;
  /** where the nose is when the train stands in the station, at the launch position, and balanced on the crest */
  sStation: number; sHold: number; sCrest: number;
  /** the stretches of track the brakes are on, [from, to]: the brake run, the trims on the hill before it, the launch straight's fins */
  brakeZone: [number, number]; trimZone: [number, number] | null; finZone: [number, number];
  /** the train's length, m */
  len: number;
}

export interface RideOpts { consist?: Consist; rand?: () => number; spec?: Partial<typeof SPEC> }

export interface Ride {
  /** the nose of the train: m along the track (0..L), and its speed along it (m/s; negative rolling back) and acceleration */
  s: number; v: number; a: number;
  phase: Phase;
  /** s in this phase, and (in the station and at the launch position) s until it ends */
  t: number; left: number;
  cal: Calibration;
  /** this launch is one that comes up short; armed: the next one has been told to */
  short: boolean; armed: boolean;
  /** the launch straight's brake fins: 0 raised .. 1 dropped */
  fins: number;
  /** this ride has been over the top (until the next launch) */
  crested: boolean;
  /** counted since the start: launches, rollbacks, rides finished */
  count: { launches: number; rollbacks: number; rides: number };
  /** the last ride's figures: speed over the crest, into the brakes, the highest the nose got, the fastest it went */
  last: { vCrest: number; vBrakes: number; top: number; vMax: number };
  step(dt: number): void;
  /** skip whatever wait is left (in the station or at the launch position) */
  launchNow(): void;
  /** make the next launch come up short (false: take that back) */
  forceRollback(on?: boolean): void;
  /** what a rider `back` m behind the nose feels */
  g(back: number, out: GForce): GForce;
  /** put the train somewhere, coasting (tests and the console) */
  set(s: number, v?: number, phase?: Phase): void;
  /** the id of the section the nose is in ('' in a gap) */
  section(): string;
}

/** the real consist: five cars, the first longer by its nose, the last with one row of seats and a deck where a
 *  second was never fitted (train-cars.ts builds the same: 12.75 m) */
export const CONSIST: Consist = { cars: [2.75, 2.5, 2.5, 2.5, 2.5], mass: [1.15, 1, 1, 1, .8] };

const DS = .25;          // the spacing of the tables the track is sampled into, m
const HC = .55;          // a car's centre of mass, above the track's centreline (m): what gravity lifts
const KH = 3;            // curvature is taken over this far each side (m): about a car's length, as the car itself averages it
const DT = 1 / 240;      // the longest step (s): .24 m at full speed
const KMIN = 1.2e-4, KMAX = 2.5e-3;   // air drag (deceleration / v^2, 1/m): a train this size and weight is somewhere between

export function makeRide(layout: Layout, opts: RideOpts = {}): Ride {
  const P = { ...SPEC, ...opts.spec }, rand = opts.rand || Math.random;
  const L = layout.L, wrap = layout.wrap;
  const consist = opts.consist || CONSIST, NC = consist.cars.length, clen = consist.cars, cm = consist.mass || clen.map(() => 1);
  const LEN = clen.reduce((a, b) => a + b, 0), M = cm.reduce((a, b) => a + b, 0);
  const coff: number[] = []; clen.reduce((a, b, i) => (coff[i] = a, a + b), 0);   // each car's front, behind the nose

  // ---- the track, sampled: the height of a car's centre of mass, and the frame (tangent, up) for curvature
  const N = Math.max(8, Math.ceil(L / DS)), ds = L / N;
  const Y = new Float32Array(N), TX = new Float32Array(N * 3), UP = new Float32Array(N * 3);
  { const f = newFrame();
    for (let i = 0; i < N; i++) { layout.at(i * ds, f); Y[i] = f.pos.y + HC * f.up.y; f.tan.toArray(TX, i * 3); f.up.toArray(UP, i * 3); } }
  const yAt = (s: number) => { const u = wrap(s) / ds, i = Math.floor(u) % N, t = u - Math.floor(u); return Y[i] + (Y[(i + 1) % N] - Y[i]) * t; };
  const ix = (s: number) => (Math.round(wrap(s) / ds) % N) * 3;
  /** the specific force on something moving at v with acceleration a along the track at s (what an accelerometer there
   *  reads, m/s^2), along the track's own axes: [along, up, left] */
  const felt = [0, 0, 0];
  function force(s: number, v: number, a: number) {
    const i = ix(s), p = ix(s + KH), q = ix(s - KH), v2 = v * v / (2 * KH);
    const tx = TX[i], ty = TX[i + 1], tz = TX[i + 2], ux = UP[i], uy = UP[i + 1], uz = UP[i + 2];
    const kx = (TX[p] - TX[q]) * v2, ky = (TX[p + 1] - TX[q + 1]) * v2 + G, kz = (TX[p + 2] - TX[q + 2]) * v2;   // centripetal, plus holding it up against gravity
    felt[0] = a + G * ty; felt[1] = kx * ux + ky * uy + kz * uz;
    felt[2] = kx * (uy * tz - uz * ty) + ky * (uz * tx - ux * tz) + kz * (ux * ty - uy * tx);   // (side = up x tan)
    return felt;
  }

  // ---- the sections this needs, and something sensible where the file has none
  const sec = (id: string, s0: number, s1: number): Section => layout.section(id) || { id, s0: wrap(s0), s1: wrap(s1) };
  const station = sec('station', 0, Math.min(26, L * .03));
  const launch = sec('launch', station.s1, (layout.section('pullup') || layout.section('tower_up') || { s0: station.s1 + L * .25 }).s0);
  const brakes = sec('brakes', L * .87, L * .93);
  /** how far ahead of a (along the direction of travel) b is */
  const ahead = (a: number, b: number) => wrap(b - a);
  /** the share of the train (nose at s) that is in the stretch z */
  const share = (s: number, z: [number, number]) => { const f = ahead(z[0], s), zl = ahead(z[0], z[1]); return Math.max(0, Math.min(f, zl) - Math.max(f - LEN, 0)) / LEN; };

  // the nose's place when the train stands in the middle of the station; at the launch position (a fifth of the way
  // along the launch straight, past the switch that the station's two lanes join at: the 100 m of thrust then ends about
  // two thirds of the way along, as the real one did, with the catch car's own braking zone beyond); and when the train
  // is balanced on the crest (its cars' mean height greatest)
  const sStation = wrap((station.s0 + ahead(station.s0, station.s1) / 2) + LEN / 2);
  const launchLen = ahead(launch.s0, launch.s1);
  const sHold = wrap(launch.s0 + Math.min(launchLen * .5, Math.max(LEN + 5, launchLen * .2)));
  const meanY = (s: number) => { let y = 0; for (let i = 0; i < NC; i++) y += cm[i] * yAt(s - coff[i] - clen[i] / 2); return y / M; };
  let sCrest = layout.top.s + LEN / 2;
  { let best = -Infinity; for (let s = layout.top.s - LEN; s <= layout.top.s + 2 * LEN; s += .1) { const y = meanY(s); if (y > best) { best = y; sCrest = s; } } sCrest = wrap(sCrest); }
  // the brake run's magnets: the whole section; the trims: from the top of the airtime hill down to the brake run; the
  // launch straight's fins: from just ahead of a waiting train to the foot of the pull-up
  const brakeZone: [number, number] = [brakes.s0, brakes.s1];
  const hill = layout.section('hill');
  let trimZone: [number, number] | null = null;
  if (hill) {   // (its crest: the highest place in the section that is higher than the track 5 m either side of it, not the pull-out the section may begin on)
    let top = -1; for (let s = hill.s0 + 5; s < hill.s0 + ahead(hill.s0, hill.s1) - 5; s += 1) if (yAt(s) >= yAt(s - 5) && yAt(s) >= yAt(s + 5) && (top < 0 || yAt(s) > yAt(top))) top = s;
    if (top >= 0 && ahead(top, brakes.s0) < L / 3) trimZone = [wrap(top), brakes.s0];
  }
  const finZone: [number, number] = [wrap(sHold + 3), launch.s1];

  const cal: Calibration = { k: 3e-4, mu: P.mu, vLaunch: P.vLaunch, thrust: P.vLaunch / P.tLaunch, cBrake: .3, cFins: .3, vCrest: 0, vHill: 0, vBrakes: 0, tCrest: 0, tBrakes: 0,
    sRelease: 0, sStation, sHold, sCrest, brakeZone, trimZone, finZone, len: LEN };

  /** the train's acceleration along the track: nose at s, moving at v, pushed by `thrust`, with the launch straight's
   *  fins `up` (0..1) and the brake run's magnets live or not */
  function accel(s: number, v: number, thrust: number, up: number, run = true) {
    let ag = 0;
    for (let i = 0; i < NC; i++) { const f = s - coff[i]; ag -= cm[i] * (yAt(f) - yAt(f - clen[i])) / clen[i]; }   // each car: the slope between its ends
    ag *= G / M;
    const f = force(s - LEN / 2, v, 0), load = Math.min(8 * G, Math.hypot(f[1], f[2]));   // how hard the wheels press on the rails
    const res = cal.mu * load + cal.k * v * v;
    let c = up > 0 ? cal.cFins * up * share(s, finZone) : 0;
    if (run) c += cal.cBrake * (share(s, brakeZone) + (trimZone ? P.trim * share(s, trimZone) : 0));
    const a = ag + thrust - c * v;
    if (v > 0) return a - res; if (v < 0) return a + res;
    return Math.abs(a) <= cal.mu * load ? 0 : a - Math.sign(a) * res;   // standing: friction holds it on a gentle slope
  }
  /** one step of free running (semi-implicit Euler: the speed first, then the place with the new speed, which keeps
   *  energy over thousands of steps); a train that friction brings to a stand stops rather than being pushed backwards by it */
  const st = { s: 0, v: 0, a: 0 };
  function free(s: number, v: number, dt: number, thrust: number, up: number, run = true) {
    const a = accel(s, v, thrust, up, run); let w = v + a * dt;
    if (v !== 0 && w * v < 0) w = 0;
    st.s = s + w * dt; st.v = w; st.a = a;
    return st;
  }

  // ---- calibration: trial runs on this track
  /** a launch from the hold position to speed vT and on, with the brakes off: how fast and when it crests (v 0: it
   *  doesn't), the highest the nose gets, where the thrust lets go, how fast and when it reaches the brake run */
  function trial(vT: number, thrust: number, toBrakes: boolean | number = false) {
    let s = sHold, v = 0, t = 0, on = true, top = s, sRel = s, tRel = 0, vC = 0, tC = 0;
    const dCrest = ahead(sHold, sCrest), dBrake = ahead(sHold, brakes.s0) + (toBrakes === true ? 0 : +toBrakes), dHill = trimZone ? ahead(sHold, trimZone[0]) : 0; let d = 0, vH = 0;
    for (let i = 0; i < 90 / DT; i++) {
      const r = free(s, v, DT, on ? thrust : 0, 0, !!toBrakes); d += r.s - s; s = r.s; v = r.v; t += DT;
      if (!vH && d >= dHill) vH = v;
      if (on && v >= vT) { v = vT; on = false; sRel = s; tRel = t; }   // (let go at exactly that speed, whatever the step)
      if (d > top - sHold) top = sHold + d;
      if (!on && v <= 0) break;
      if (!vC && d >= dCrest) { vC = v; tC = t; if (!toBrakes) break; }
      if (d >= dBrake) return { vC, tC, top, sRel, tRel, vH, vB: v, tB: t };
    }
    return { vC, tC, top, sRel, tRel, vH, vB: 0, tB: 0 };
  }
  // how near the crest a train can stop and still slide back: where the top hat is all but level friction would hold it
  // there (it has happened to rides like this one; here a launch that fails always comes back), so a short launch stops
  // at least this far back: on a slope friction cannot hold, and more than half a metre lower than the balance
  let dMin = 1; while (dMin < 60 && (meanY(sCrest - dMin + .5) - meanY(sCrest - dMin - .5) < 6 * P.mu || meanY(sCrest) - meanY(sCrest - dMin) < .6)) dMin += .5;
  /** x in lo..hi where f(x) crosses 0, f rising */
  const solve = (f: (x: number) => number, lo: number, hi: number, n = 28) => { for (let i = 0; i < n; i++) { const m = (lo + hi) / 2; if (f(m) < 0) lo = m; else hi = m; } return (lo + hi) / 2; };
  function calibrate() {
    const thrustFor = (vT: number) => solve(a => -(trial(vT, a).tRel || 99) + P.tLaunch, vT / P.tLaunch * .8, vT / P.tLaunch * 1.6);
    const crest = () => trial(cal.vLaunch, cal.thrust).vC;
    for (let pass = 0; pass < 3; pass++) {   // (the thrust depends a little on the drag, and the drag's reach on where the thrust lets go)
      cal.thrust = thrustFor(cal.vLaunch);
      // the air drag that leaves the real ride's speed at the crest. A track too tall for that with even the least drag a
      // train could have (KMIN) keeps that least drag and gets a faster launch instead: as much as it needs
      cal.k = KMIN;
      if (crest() > P.vCrest) cal.k = solve(k => { cal.k = k; return P.vCrest - crest(); }, KMIN, KMAX);
      else { const v0 = cal.vLaunch, a0 = cal.thrust; cal.vLaunch = solve(v => trial(v, a0 * v / v0).vC - P.vCrest, v0, P.vLaunch * 1.6); }
    }
    // magnetic brakes take speed off in proportion to the distance run through them (dv = -c ds): the brake run's (and
    // the hill's trims with them) are as strong as brings the train down to little more than a crawl with its nose four
    // fifths of the way along the brake run
    const end = ahead(brakeZone[0], brakeZone[1]) * .8, slow = P.vCrawl * 1.25;
    cal.cBrake = solve(c => { cal.cBrake = c; const q = trial(cal.vLaunch, cal.thrust, end); return q.vB ? slow - q.vB : 1; }, .03, 3);
    const r = trial(cal.vLaunch, cal.thrust, true);
    cal.vCrest = r.vC; cal.tCrest = r.tC; cal.vHill = r.vH; cal.vBrakes = r.vB; cal.tBrakes = r.tB; cal.sRelease = wrap(r.sRel);
    // the launch straight's: a train that fell back from just under the crest, stopped in four fifths of theirs
    let s = sCrest - dMin, v = -1; const d0 = ahead(finZone[1], s);
    for (let i = 0, d = 0; i < 60 / DT && d > -d0; i++) { const q = free(s, v, DT, 0, 0, false); d += q.s - s; s = q.s; v = q.v; }
    cal.cFins = Math.max(.12, Math.abs(v) / Math.max(8, ahead(finZone[0], finZone[1]) * .8 - LEN * .5));
  }
  calibrate();
  /** the launch speed that leaves the train hanging with its nose d m short of where it would balance on the crest */
  const shortSpeed = (d: number) => solve(v => trial(v, cal.thrust * v / cal.vLaunch).top - (sHold + ahead(sHold, sCrest) - d), cal.vLaunch * .6, cal.vLaunch);

  // ---- the ride
  const ride: Ride = { s: sStation, v: 0, a: 0, phase: 'station', t: 0, left: 0, cal, short: false, armed: false, fins: 0, crested: false,
    count: { launches: 0, rollbacks: 0, rides: 0 }, last: { vCrest: 0, vBrakes: 0, top: 0, vMax: 0 },
    step, launchNow, forceRollback, g, set, section: () => layout.sectionAt(ride.s)?.id || '' };
  let dwell = P.dwell[0] + rand() * (P.dwell[1] - P.dwell[0]), holdT = 0, vT = cal.vLaunch, thrust = cal.thrust;
  let again = false, hurry = false, inBrakes = false, stuck = 0, nudged = 0;
  const go = (p: Phase) => { ride.phase = p; ride.t = 0; ride.left = 0; };

  /** the tyres: roll the nose to `to` (dir 1 forwards, -1 backwards) at up to vmax, easing to a stand there; true once there */
  function drive(to: number, dir: number, vmax: number, dt: number) {
    const d = dir > 0 ? ahead(ride.s, to) : ahead(to, ride.s), v = ride.v * dir;
    if (d < .02 || d > L - 1) { ride.s = to; ride.v = ride.a = 0; return true; }   // (d just under L: it has run a hair past)
    // as fast as leaves room to stop; a train arriving faster than the tyres turn is slowed harder (they are brakes too)
    const want = Math.min(vmax, Math.sqrt(2 * P.aTyre * .8 * d) + .05), rate = v > want + .5 || v < 0 ? 4.5 : P.aTyre;
    const w = v < want ? Math.min(want, v + rate * dt) : Math.max(want, v - rate * dt);
    ride.a = (w - v) / dt * dir; ride.v = w * dir; ride.s = wrap(ride.s + ride.v * dt);
    return false;
  }
  function begin() {   // a launch: how fast this one will be
    ride.short = ride.armed || (!again && rand() < 1 / P.rollbackOdds); ride.armed = false; again = false;
    // a normal launch varies by a fraction of a per cent (enough to change the crest by a few mph); a short one stops
    // anywhere from the top of the vertical to just short of balancing on the crest (most are near misses)
    vT = ride.short ? shortSpeed(dMin + 55 * rand() ** 2) : cal.vLaunch * (1 + (rand() - .35) * .008);
    thrust = cal.thrust * vT / cal.vLaunch;
    ride.crested = inBrakes = false; stuck = 0; ride.count.launches++; ride.last.vMax = 0; ride.last.top = 0; ride.last.vCrest = 0;
    go('launch');
  }
  function sub(dt: number) {
    ride.t += dt;
    const ph = ride.phase;
    // the launch straight's fins: dropped from the moment the catch car latches until the train's tail has left them
    const down = (ph === 'hold' && ride.t > holdT - P.arm) || ph === 'launch' || (ph === 'coast' && !ride.crested && share(ride.s, finZone) > 0 && ride.v > 0);
    ride.fins = Math.max(0, Math.min(1, ride.fins + (down ? dt : -dt) / .7));
    if (ph === 'station') {
      ride.v = ride.a = 0; ride.left = Math.max(0, dwell - ride.t);
      if (ride.t >= dwell || (hurry && ride.t > .4)) go('advance');   // (sent early, it does not dawdle at the launch position either)
    } else if (ph === 'advance') {
      if (drive(sHold, 1, P.vAdvance, dt)) { holdT = hurry ? P.arm + .2 : P.hold[0] + rand() * (P.hold[1] - P.hold[0]); hurry = false; nudged = 0; go('hold'); }
    } else if (ph === 'hold') {
      // a few seconds before the launch the tyres let go and the train settles back onto the catch car
      const u = Math.max(0, Math.min(1, (ride.t - (holdT - P.arm)) / .8)), e = u * u * (3 - 2 * u); ride.left = Math.max(0, holdT - ride.t);
      ride.s = wrap(sHold - P.nudge * e); ride.v = -P.nudge * (e - nudged) / dt; ride.a = 0; nudged = e;
      if (ride.t >= holdT) { ride.s = wrap(sHold - P.nudge); ride.v = 0; begin(); }
    } else if (ph === 'return') {
      if (drive(sStation, 1, P.vCrawl, dt)) { ride.count.rides++; dwell = hurry ? 3 : P.dwell[0] + rand() * (P.dwell[1] - P.dwell[0]); hurry = false; go('station'); }
    } else if (ph === 'reset') {
      if (drive(sHold, -1, P.vCrawl * 1.3, dt)) { holdT = hurry ? P.arm + .2 : P.arm + 2 + rand() * 2; hurry = false; again = true; nudged = 0; go('hold'); }
    } else {   // launch, coast, rollback, brakes: free running
      const r = free(ride.s, ride.v, dt, ph === 'launch' ? thrust : 0, 1 - ride.fins), was = ride.s;
      ride.s = wrap(r.s); ride.v = r.v; ride.a = r.a;
      ride.last.vMax = Math.max(ride.last.vMax, Math.abs(r.v));
      const y = yAt(ride.s) - HC * UP[ix(ride.s) + 1]; if (y > ride.last.top) ride.last.top = y;
      if (ph === 'launch') { if (ride.v >= vT) { ride.v = vT; go('coast'); } return; }
      if (!ride.crested && ahead(was, sCrest) < 5 && ahead(ride.s, sCrest) > L / 2) { ride.crested = true; ride.last.vCrest = ride.v; }
      if (ph === 'coast' && !ride.crested && ride.v < 0) { ride.count.rollbacks++; go('rollback'); return; }
      const home = ahead(brakes.s0, ride.s) < ahead(brakes.s0, sStation);   // from the start of the brake run to the station
      if (ph === 'coast' && ride.crested && home && !inBrakes) { inBrakes = true; ride.last.vBrakes = ride.v; go('brakes'); }
      if (ph === 'brakes' && (ride.v <= P.vCrawl || share(ride.s, brakeZone) === 0)) { go('return'); return; }
      if (ph === 'rollback' && Math.abs(ride.v) <= 2 && share(ride.s, finZone) > .5) { go('reset'); return; }
      if (ph === 'rollback' && ride.v < 0 && ahead(ride.s, sHold) < L / 2 && ahead(ride.s, sHold) > 0) { again = true; go('advance'); return; }   // (right through the fins: the tyres catch it and bring it forward again)
      // a train that has come to a stand out on the course (a track still being fitted may have a hollow it cannot climb
      // out of, or a ledge it can sit on): short of the crest it is shoved off backwards, on the fins or past the crest the
      // tyres fetch it, as a lift would
      stuck = Math.abs(ride.v) < .4 ? stuck + dt : 0;
      if (stuck > 6 || ride.t > 150) {
        stuck = 0;
        if (ride.crested) go('return'); else if (share(ride.s, finZone) > 0) go('reset');
        else { if (ph === 'coast') { ride.count.rollbacks++; go('rollback'); } ride.v = -1.5; }
      }
    }
  }
  function step(dt: number) {
    dt = Math.min(dt, .25);   // (a tab left in the background comes back with one long frame)
    for (let n = Math.max(1, Math.ceil(dt / DT)), h = dt / n, i = 0; i < n; i++) sub(h);
  }
  function launchNow() {
    hurry = true;
    if (ride.phase === 'hold') { if (ride.t < holdT - P.arm) ride.t = holdT - P.arm; hurry = false; }
  }
  function forceRollback(on = true) { ride.armed = on; }
  function g(back: number, out: GForce) {
    const f = force(ride.s - back, ride.v, ride.a);
    out.lon = f[0] / G; out.vert = f[1] / G; out.lat = f[2] / G;
    return out;
  }
  function set(s: number, v = 0, phase: Phase = 'coast') {
    ride.s = wrap(s); ride.v = v; ride.a = 0; go(phase); stuck = 0; inBrakes = false; ride.fins = 0;
    ride.crested = ahead(sCrest, ride.s) < ahead(sCrest, sStation);   // (anywhere from the crest round to the station)
  }
  return ride;
}
