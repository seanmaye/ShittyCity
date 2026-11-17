// What a rider on Kingda Ka hears, made as it is played (Web Audio; there are no sound files): the wind, which is most of
// it above 60 mph; the steel under the wheels, a low roar with the ties ticking past in it; the launch, a hydraulic motor
// winding a cable drum from nothing to 128 mph in three and a half seconds, with the thump of the catch car taking up
// the train; the launch track's brake fins dropping, and the brake run's taking hold; the tyres that drive the train in
// and out of the station; the air let go when it stops, and the restraints ratcheting shut. Every level follows the
// same numbers that move the train (physics.ts, through train.ts): nothing here is timed by itself, so a rollback sounds
// like one because it is one.
//
// Only while you are aboard. Browsers let a page make sound only once you have clicked or pressed a key in it; boarding
// is one, so the sound starts then. The rider can turn it off (train.ts "Sound off"), which is remembered.

/** what the ride is doing this frame (train.ts) */
export interface Heard {
  /** physics.ts Phase */
  phase: string;
  /** the section the nose is in (layout.ts) */
  section: string;
  /** m/s along the track (backwards in a rollback), and the launch speed */
  v: number; vMax: number;
  /** the launch track's fins, 0 raised .. 1 dropped; the restraints, 0 shut .. 1 open */
  fins: number; bars: number;
  /** g through the seat */
  gVert: number;
}

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

export function createSound(storageKey: string) {
  type Ctor = typeof AudioContext;
  const AC: Ctor | undefined = typeof window === 'undefined' ? undefined : window.AudioContext || (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
  let enabled = true;
  try { enabled = localStorage.getItem(storageKey) !== '0'; } catch (e) { /* no storage: on, and not remembered */ }
  let ctx: AudioContext | null = null, aboard = false;
  // the parts of the sound, once there is something to play them (build)
  let master: GainNode, noise: AudioBuffer, meter: AnalyserNode;
  let wind: GainNode, windF: BiquadFilterNode, hiss: GainNode, rumble: GainNode, rumbleF: BiquadFilterNode, tick: OscillatorNode, tickDepth: GainNode;
  let howl: GainNode, howlF: BiquadFilterNode, whine: GainNode, whineA: OscillatorNode, whineB: OscillatorNode, tyre: GainNode, tyreO: OscillatorNode;
  let brake: GainNode, brakeF: BiquadFilterNode, air: GainNode;
  const was = { phase: '', fins: 0, bars: 0, speed: 0 };
  let slow = 0;   // how hard the train is being slowed, m/s^2 (eased)

  /** a level or a pitch, eased over tau s: every frame sets these, and a step would click */
  const to = (p: AudioParam, v: number, tau = .06) => p.setTargetAtTime(v, ctx.currentTime, tau);

  function build() {
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0;
    // the launch and the pull-up stack everything at once: keep the sum off the ceiling
    const limit = ctx.createDynamicsCompressor(); limit.threshold.value = -14; limit.knee.value = 10; limit.ratio.value = 6; limit.attack.value = .004; limit.release.value = .2;
    meter = ctx.createAnalyser(); meter.fftSize = 1024;
    master.connect(limit); limit.connect(meter); meter.connect(ctx.destination);
    // two seconds of hiss, looped: everything that is not a tone is cut from it
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0); let seed = 20050521;   // (the same hiss every time; the day the ride opened)
    for (let i = 0; i < d.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; d[i] = seed / 2147483648 - 1; }
    const hissOf = () => { const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; s.loopStart = Math.random() * 1.5; s.start(0, s.loopStart); return s; };
    const band = (type: BiquadFilterType, f: number, q: number) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    const level = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const tone = (type: OscillatorType, f: number) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return o; };
    const chain = (...n: AudioNode[]) => { for (let i = 1; i < n.length; i++) n[i - 1].connect(n[i]); return n[n.length - 1]; };

    // the wind: a broad rush that climbs in pitch as it climbs in level, and a thin whistle over it at speed
    windF = band('bandpass', 500, .55); wind = level(); chain(hissOf(), windF, wind, master);
    hiss = level(); chain(hissOf(), band('highpass', 3200, .7), hiss, master);
    // the wheels on the rails: a low roar, opened up by speed, with the cross-ties ticking past in it
    rumbleF = band('lowpass', 90, 1.1); rumble = level(); const beat = level(1);
    chain(hissOf(), rumbleF, beat, rumble, master);
    tick = tone('sine', 4); tickDepth = level(0); chain(tick, tickDepth); tickDepth.connect(beat.gain);
    // and the hollow track singing: Intamin's box truss rings as a train goes over it
    howlF = band('bandpass', 170, 5); howl = level(); chain(hissOf(), howlF, howl, master);
    // the launch: the hydraulic motors and the cable drum, two reeds a fifth apart winding up with the train
    whineA = tone('sawtooth', 50); whineB = tone('triangle', 75); whine = level();
    const reed = band('lowpass', 1500, .8); whineA.connect(reed); whineB.connect(reed); chain(reed, whine, master);
    // the tyres that push the train about the station and the launch position
    tyreO = tone('triangle', 90); tyre = level(); chain(tyreO, band('lowpass', 600, .7), tyre, master);
    // magnetic brakes make no noise of their own: what is heard is the train's own roar shut off and the air over the fins
    brakeF = band('bandpass', 1100, .8); brake = level(); chain(hissOf(), brakeF, brake, master);
    // the launch system holding pressure while the train waits
    air = level(); chain(hissOf(), band('highpass', 4500, .5), air, master);
  }

  // ---- things that happen once: a burst of hiss or a falling tone, shaped and let go
  function burst(f: number, q: number, peak: number, decay: number, delay = 0, type: BiquadFilterType = 'bandpass') {
    const t = ctx.currentTime + delay, s = ctx.createBufferSource(), b = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; b.type = type; b.frequency.value = f; b.Q.value = q;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + .004); g.gain.exponentialRampToValueAtTime(.0005, t + decay);
    s.connect(b); b.connect(g); g.connect(master); s.start(t, Math.random() * 1.5); s.stop(t + decay + .05);
  }
  function drop(f0: number, f1: number, peak: number, dur: number, delay = 0) {
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + .012); g.gain.exponentialRampToValueAtTime(.0005, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .05);
  }
  /** steel on steel: the fins swinging down (or up), a bank at a time along the track */
  const clack = (n: number, gap: number) => { for (let i = 0; i < n; i++) { burst(1700 + 260 * i, 7, .32, .07, i * gap); burst(320, 3, .22, .09, i * gap); } };
  /** the restraints' ratchets, a few teeth each */
  const ratchet = () => { for (let i = 0; i < 5; i++) burst(2600, 9, .12, .03, i * .07 + Math.random() * .02); };
  /** air let out of the brakes and the gates */
  const pssh = () => burst(5200, .6, .22, .7, 0, 'highpass');

  const live = () => !!ctx && ctx.state === 'running';
  /** a browser may refuse sound until the page has been clicked or a key pressed: try again at each one */
  const wake = () => { if (aboard && enabled && ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); };
  /** a tab that is hidden stops drawing, and would hold whatever note it was on */
  const hide = () => { if (!ctx) return; if (document.hidden) ctx.suspend().catch(() => {}); else wake(); };

  function start() {
    const fresh = !aboard; aboard = true;   // (changing rows boards again: the ride has not changed)
    if (!AC || !enabled) return;
    if (!ctx) { try { build(); } catch (e) { ctx = null; return; } window.addEventListener('pointerdown', wake, true); window.addEventListener('keydown', wake, true); document.addEventListener('visibilitychange', hide); }
    ctx.resume().catch(() => {});
    if (fresh || was.phase === '') { was.phase = '?'; was.speed = 0; slow = 0; }
    master.gain.cancelScheduledValues(ctx.currentTime); to(master.gain, .9, .25);
  }
  function stop() {
    aboard = false;
    if (!ctx) return;
    to(master.gain, 0, .12);
    const c = ctx; setTimeout(() => { if (!aboard && c.state === 'running') c.suspend().catch(() => {}); }, 700);
  }
  function setEnabled(on: boolean) {
    enabled = on;
    try { localStorage.setItem(storageKey, on ? '1' : '0'); } catch (e) { /* not remembered */ }
    if (on) { if (aboard) start(); } else if (ctx) { to(master.gain, 0, .05); const c = ctx; setTimeout(() => { if (!enabled && c.state === 'running') c.suspend().catch(() => {}); }, 400); }
  }

  function update(dt: number, h: Heard) {
    if (!aboard || !enabled || !live() || dt <= 0) return;
    const speed = Math.abs(h.v), k = clamp(speed / h.vMax, 0, 1.15);   // 0 standing .. 1 launch speed
    // how hard it is being slowed (eased: one frame's difference is noise). Gravity slows it too, going up: that is silent
    slow += (Math.max(0, was.speed - speed) / dt - slow) * (1 - Math.exp(-dt / .12)); was.speed = speed;
    const braking = h.phase === 'brakes' || ((h.phase === 'rollback' || h.phase === 'reset') && (h.section === 'launch' || h.section === 'station'));

    to(wind.gain, .5 * k ** 2.2); to(windF.frequency, 420 + 3000 * k); to(hiss.gain, .1 * k ** 3);
    // the seat pressing harder is the wheels pressing harder: the pull-up roars, the top of the hill goes quiet
    const press = .55 + .45 * clamp(h.gVert / 2.5, 0, 1.6);
    to(rumble.gain, .85 * k ** 1.1 * press); to(rumbleF.frequency, 70 + 300 * k);
    to(tick.frequency, clamp(speed / 1.4, .5, 42)); to(tickDepth.gain, .3 * clamp(speed / 6));   // (ties about 1.4 m apart: past 40 a second they blur into the roar)
    to(howl.gain, .3 * k ** 1.5 * press); to(howlF.frequency, 150 + 150 * k);
    // the launch: only while it is being pushed. It cuts off as the catch car lets go, and the wind is what is left
    const thrust = h.phase === 'launch';
    to(whine.gain, thrust ? .13 + .07 * k : 0, thrust ? .05 : .22); to(whineA.frequency, 46 + 640 * k ** 1.15, .04); to(whineB.frequency, 69 + 960 * k ** 1.15, .04);
    const driven = h.phase === 'advance' || h.phase === 'return' || h.phase === 'reset';
    to(tyre.gain, driven ? .05 * clamp(speed / 1.5) : 0, .15); to(tyreO.frequency, 84 + 13 * speed);
    to(brake.gain, braking ? .42 * clamp(slow / 14) : 0, .08); to(brakeF.frequency, 700 + 1400 * k);
    to(air.gain, h.phase === 'hold' && h.fins > .02 ? .035 : 0, .2);

    // once each: as the ride moves from one thing to the next (not for what it was already doing when you sat down)
    if (was.phase === '?') { was.phase = h.phase; was.fins = h.fins; was.bars = h.bars; }
    if (h.phase !== was.phase) {
      if (h.phase === 'launch') { drop(95, 30, .7, .5); burst(240, 1.2, .5, .45); }                 // the catch car takes up the train
      if (h.phase === 'station') pssh();                                                               // stopped at the platform
      if (h.phase === 'hold' && was.phase === 'advance') burst(4200, .7, .1, .35, 0, 'highpass');   // the tyres let go, the brakes take it
      if (h.phase === 'rollback') drop(70, 40, .25, .9);                                             // the train's weight coming back onto the wheels the other way
      was.phase = h.phase;
    }
    if (h.fins > .05 && was.fins <= .05) clack(4, .11);          // dropping for a launch
    if (h.fins < .95 && was.fins >= .95) clack(4, .09);          // and coming back up behind it (or to catch it)
    if (h.bars < .5 && was.bars >= .5) ratchet();               // the restraints coming down
    was.fins = h.fins; was.bars = h.bars;
  }

  /** how loud it is just now, 0..1 (the test scripts: there are no ears on them) */
  function level() {
    if (!live()) return 0;
    const b = new Float32Array(meter.fftSize); meter.getFloatTimeDomainData(b);
    let s = 0; for (const v of b) s += v * v;
    return Math.sqrt(s / b.length);
  }
  return { start, stop, update, setEnabled, enabled: () => enabled, available: () => !!AC, debug: { level, state: () => (ctx ? ctx.state : 'none') } };
}
