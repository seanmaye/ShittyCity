// Kingda Ka's ride (js/scene/ka/physics.ts) on the track as it is in data/ka/coaster.json when this runs. The track is
// fitted to a survey and gets refitted, so nothing here is an exact figure: a launch must get round, a short one must
// come back, and the speeds and forces must be ones the real ride could have had.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeLayout, newFrame } from '../js/scene/ka/layout.ts';
import { makeRide, MPH, SPEC } from '../js/scene/ka/physics.ts';

const layout = makeLayout(JSON.parse(readFileSync(new URL('../data/ka/coaster.json', import.meta.url), 'utf8')));
// the same "luck" every run: .5 never rolls a rollback by itself (one launch in fifteen does), and puts a forced one mid-range
const ride = () => makeRide(layout, { rand: () => .5 });
const DT = 1 / 60;
/** run until done(r) (or for max s); what happened on the way: each phase entered, the time, and the g a front-row rider felt where the track is smooth */
function run(r, done, max = 400) {
  const phases = [r.phase], g = { lon: 0, vert: 0, lat: 0 }, felt = { lon: [9, -9], vert: [9, -9], lat: [9, -9] }; let t = 0;
  for (; t < max && !done(r); t += DT) {
    r.step(DT);
    if (r.phase !== phases[phases.length - 1]) phases.push(r.phase);
    if (!smooth(r.s - 1.2)) continue;
    r.g(1.2, g); for (const k in felt) { felt[k][0] = Math.min(felt[k][0], g[k]); felt[k][1] = Math.max(felt[k][1], g[k]); }
  }
  return { phases, felt, t };
}
// "Smooth": over the 12 m around s the track neither turns nor rolls faster than a coaster's does (a 14 m radius: the
// tightest thing a train takes at speed; a quarter turn of roll in 12 m). A survey's kinks and a placeholder's corners
// fail this; the forces there are the data's, not the ride's.
const fa = newFrame(), fb = newFrame();
function smooth(s) {
  for (let d = -6; d < 6; d += 1.5) {
    layout.at(s + d, fa); layout.at(s + d + 1.5, fb);
    if (fa.tan.angleTo(fb.tan) > 1.5 / 14 || fa.up.angleTo(fb.up) > 1.5 / 12 * Math.PI / 2 + 1.5 / 14) return false;
  }
  return true;
}

describe('Kingda Ka: the ride on the track in data/ka/coaster.json', () => {
  it('calibrates to the real ride: 128 mph in 3.5 s, a slow crest, a believable brake run', () => {
    const c = ride().cal;
    expect(c.vLaunch * MPH).toBeGreaterThan(120); expect(c.vLaunch * MPH).toBeLessThan(140);   // 128 unless the track cannot be crested with it
    expect(c.thrust / 9.81).toBeGreaterThan(1.4); expect(c.thrust / 9.81).toBeLessThan(2.3);   // 1.67 g, plus what drag and the slope take
    expect(c.vCrest).toBeGreaterThan(5); expect(c.vCrest).toBeLessThan(12);                    // "only just cleared": 7-10 m/s
    expect(c.k).toBeGreaterThan(1e-4); expect(c.k).toBeLessThan(2.5e-3);                       // air drag a train could have
    expect(c.vBrakes * MPH).toBeGreaterThan(35); expect(c.vBrakes * MPH).toBeLessThan(115);    // into the brake run, after the hill's trims
    expect(c.vHill).toBeGreaterThan(c.vBrakes * .8);
    expect(c.tBrakes).toBeGreaterThan(14); expect(c.tBrakes).toBeLessThan(40);                 // the real ride: about 22 s from launch to brakes
    expect(c.cBrake * c.vBrakes / 9.81).toBeLessThan(3.5);                                      // the brakes' first bite, in g
    expect(c.len).toBeGreaterThan(12); expect(c.len).toBeLessThan(13.5);
  });

  it('a normal launch goes round the circuit and stops in the station', () => {
    const r = ride(), c = r.cal;
    expect(r.phase).toBe('station'); expect(r.s).toBeCloseTo(c.sStation, 3);
    const out = run(r, x => x.count.rides === 1);
    expect(out.phases).toEqual(['station', 'advance', 'hold', 'launch', 'coast', 'brakes', 'return', 'station']);
    expect(r.count).toEqual({ launches: 1, rollbacks: 0, rides: 1 });
    expect(r.v).toBe(0); expect(r.s).toBeCloseTo(c.sStation, 3);
    expect(out.t).toBeGreaterThan(45); expect(out.t).toBeLessThan(150);
    // the launch reached its speed; the crest was slow but sure; the brake run was met at speed and left at a crawl
    expect(r.last.vMax * MPH).toBeGreaterThan(c.vLaunch * MPH - 1); expect(r.last.vMax * MPH).toBeLessThan(c.vLaunch * MPH + 3);
    expect(r.last.vCrest).toBeGreaterThan(4); expect(r.last.vCrest).toBeLessThan(13);
    expect(r.last.vBrakes * MPH).toBeGreaterThan(35); expect(r.last.vBrakes * MPH).toBeLessThan(115);
    expect(r.last.top).toBeGreaterThan(layout.top.y - 1);
    // what the rider felt, wherever the track is smooth enough to say
    expect(out.felt.lon[1]).toBeGreaterThan(1.3); expect(out.felt.lon[1]).toBeLessThan(2.6);   // the launch: 1.67 g and a little
    expect(out.felt.lon[0]).toBeGreaterThan(-3.5);                                              // the brakes
    expect(out.felt.vert[1]).toBeLessThan(7.5); expect(out.felt.vert[0]).toBeGreaterThan(-3);
    expect(Math.max(-out.felt.lat[0], out.felt.lat[1])).toBeLessThan(3);
  });

  it('launches again and again', () => {
    const r = ride();
    run(r, x => x.count.rides === 3, 600);
    expect(r.count).toEqual({ launches: 3, rollbacks: 0, rides: 3 });
  });

  it('a forced rollback stops short of the crest, comes to rest on the launch straight, and is launched again', () => {
    const r = ride(), c = r.cal, launch = layout.section('launch');
    r.forceRollback(); expect(r.armed).toBe(true);
    run(r, x => x.phase === 'rollback');
    expect(r.short).toBe(true); expect(r.armed).toBe(false); expect(r.crested).toBe(false);
    expect(r.last.vMax).toBeLessThan(c.vLaunch); expect(r.last.vMax).toBeGreaterThan(c.vLaunch * .75);   // only a little short
    expect(r.last.top).toBeLessThan(layout.top.y + .1); expect(r.last.top).toBeGreaterThan(layout.top.y * .5);
    // back down the tower: fast, backwards, into the raised fins
    let vBack = 0; const down = run(r, x => { vBack = Math.min(vBack, x.v); return x.phase === 'reset'; });
    expect(r.phase).toBe('reset'); expect(r.fins).toBe(0);
    expect(-vBack * MPH).toBeGreaterThan(50);
    expect(down.felt.lon[1]).toBeLessThan(3.5);   // the fins catching it (it is going backwards: pressed into the seat back)
    if (launch) { expect(layout.wrap(r.s - launch.s0)).toBeLessThan(launch.s1 - launch.s0 + 1); expect(layout.wrap(r.s - c.sHold)).toBeLessThan(launch.s1 - launch.s0); }   // well short of the station
    expect(Math.abs(r.v)).toBeLessThan(3);
    // rolled back to the launch position, held, launched again, and this time round
    const out = run(r, x => x.count.rides === 1);
    expect(out.phases).toEqual(['reset', 'hold', 'launch', 'coast', 'brakes', 'return', 'station']);
    expect(r.count).toEqual({ launches: 2, rollbacks: 1, rides: 1 });
    expect(r.crested).toBe(true); expect(r.s).toBeCloseTo(c.sStation, 3);
  });

  it('a short launch can stop anywhere from high on the tower to just under the crest, and always comes back', () => {
    for (const luck of [.02, .35, .7, .98]) {
      const r = makeRide(layout, { rand: () => luck });
      r.forceRollback(); run(r, x => x.phase === 'rollback' || x.count.rides === 1);
      expect(r.phase).toBe('rollback');
      run(r, x => x.phase === 'hold');
      expect(r.phase).toBe('hold'); expect(r.count.rollbacks).toBe(1);
    }
  });

  it('comes up short by itself now and then: about one launch in fifteen', () => {
    let seed = 2005; const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const r = makeRide(layout, { rand, spec: { dwell: [1, 1] } });
    run(r, x => x.count.rides === 45, 6000);
    expect(r.count.rides).toBe(45); expect(r.count.launches).toBe(45 + r.count.rollbacks);   // every one that failed was launched again, once
    expect(r.count.rollbacks).toBeGreaterThan(0); expect(r.count.rollbacks).toBeLessThan(10);
  });

  it('"Launch now" skips the waiting, and the fins drop for a launch and rise behind it', () => {
    const r = ride(), usual = run(ride(), x => x.phase === 'launch').t;
    r.launchNow(); const a = run(r, x => x.phase === 'launch');
    expect(a.t).toBeLessThan(usual - SPEC.dwell[0] + 1);   // (the roll out and the catch car still take their time)
    expect(a.t).toBeGreaterThan(SPEC.arm);
    expect(r.fins).toBe(1);
    run(r, x => x.crested);
    expect(r.fins).toBe(0);
  });

  it('sits still in the station and at the launch position', () => {
    const r = ride(); r.step(1); expect(r.v).toBe(0); expect(r.a).toBe(0);
    const g = r.g(1.2, { lon: 0, vert: 0, lat: 0 });
    expect(Math.hypot(g.lon, g.vert, g.lat)).toBeCloseTo(1, 1);   // one g, whichever way the station track leans
  });
});
