// PROPOSAL: the French Quarter, alive on Bourbon Street. Like real Bourbon, the street is packed
// with people strolling up and down, street dancers working the middle of the road, and a brass
// band playing loud second-line music that you can hear as you get close.
//
// The bodies are Kyle's jointed figures (people.js: the same limb geometry, joint layout and
// running pose), drawn instanced: one InstancedMesh per body part for the whole crowd, so ~160
// people cost about 15 draw calls. Each person has a light skeleton of Object3D joints posed on
// the CPU, and every part's world matrix is copied into its instance. The brass band is a small
// group of non-instanced figures (makeFigure) with simple instruments, so it can be picked out.
//
// The street is the real Bourbon Street centreline (OSM, metres, the model's own coordinates).
// People can be picked and inhabited (see through their eyes), the same as Walnut St in
// Philadelphia (phl/pedestrians.js).
import * as THREE from 'three';
import { geo, pose, makeFigure } from '../phl/people.js';
import { makeProfile } from './profiles.js';
import { LIGHT, makeRenderer } from '../../three-setup.js';

// ---- Bourbon Street centreline (Royal end -> Canal end), the real OSM geometry in model metres
export const BOURBON = [[-345.0, 199.7], [-340.4, 194.2], [-337.8, 191.2], [-335.9, 188.9], [-335.3, 188.2],
  [-332.8, 185.1], [-328.2, 179.5], [-322.6, 172.5], [-290.8, 132.3], [-259.0, 92.1], [-255.6, 87.9],
  [-253.2, 84.8], [-210.7, 29.6], [-192.3, 5.7], [-188.7, 1.0]];
const HALF = 8.5;          // the walkable half-width of the street (the facades sit just beyond it)
const CLEAR = 3.4;         // the middle stays clear for the dancers and the band
const PAVE_Y = .1;         // the street is flat (New Orleans has no terrain grid)

// ---- the polyline: arc length, nearest point, point at (s, offset)
const SEG = [];
{ let s = 0; for (let i = 0; i < BOURBON.length - 1; i++) {
  const [ax, az] = BOURBON[i], [bx, bz] = BOURBON[i + 1], L = Math.hypot(bx - ax, bz - az);
  SEG.push({ ax, az, tx: (bx - ax) / L, tz: (bz - az) / L, L, s }); s += L;
} }
export const BOURBON_LENGTH = SEG.reduce((s, g) => s + g.L, 0);
/** nearest point on the street: s along it, o signed offset (+ = left of travel towards Canal), t tangent */
function project(x, z) {
  let best = null;
  for (const g of SEG) {
    const s = Math.max(0, Math.min(g.L, (x - g.ax) * g.tx + (z - g.az) * g.tz));
    const px = g.ax + g.tx * s, pz = g.az + g.tz * s, d = Math.hypot(x - px, z - pz);
    if (!best || d < best.d) best = { d, s: g.s + s, o: -(x - g.ax) * g.tz + (z - g.az) * g.tx, tx: g.tx, tz: g.tz };
  }
  return best;
}
/** world point at arc length s, offset o; plus the tangent there */
function at(s, o = 0) {
  let g = SEG[SEG.length - 1];
  for (const q of SEG) if (s <= q.s + q.L) { g = q; break; }
  const l = s - g.s;
  return { x: g.ax + g.tx * l - g.tz * o, z: g.az + g.tz * l + g.tx * o, tx: g.tx, tz: g.tz };
}

/** a skeleton with Kyle's joint layout (people.js makeFigure), without meshes */
function rig() {
  const n = (parent, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); if (parent) parent.add(o); return o; };
  const root = n(null, 0, 0, 0), F = { root };
  F.pelvis = n(root, 0, .92, 0); F.chest = n(F.pelvis, 0, .56, 0);
  F.neck = n(F.chest, 0, .08, 0); F.head = n(F.chest, 0, .17, 0); F.hair = n(F.head, 0, .01, -.01);
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    F['hip' + s] = n(F.pelvis, sx * .1, 0, 0); F['knee' + s] = n(F['hip' + s], 0, -.45, 0); F['foot' + s] = n(F['knee' + s], 0, -.45, 0);
    F['sh' + s] = n(F.chest, sx * .23, -.04, 0); F['el' + s] = n(F['sh' + s], 0, -.3, 0); F['hand' + s] = n(F['el' + s], 0, -.29, 0);
  }
  return F;
}
// body parts: [geometry in people.js geo(), joints it hangs from, colour]
const PARTS = [
  ['torso', ['pelvis'], 'shirt'], ['shorts', ['pelvis'], 'pants'], ['neck', ['neck'], 'skin'], ['head', ['head'], 'skin'],
  ['hairF', ['hair'], 'hair'], ['upper', ['shL', 'shR'], 'shirt'], ['fore', ['elL', 'elR'], 'arm'], ['hand', ['handL', 'handR'], 'skin'],
  ['thigh', ['hipL', 'hipR'], 'pants'], ['shin', ['kneeL', 'kneeR'], 'leg'], ['foot', ['footL', 'footR'], 'shoe'],
  // a face (so it shows in the portrait and up close): eyes, brows, nose, mouth; long hair for some
  ['eyeL', ['head'], 'eye'], ['eyeR', ['head'], 'eye'], ['browL', ['head'], 'hair'], ['browR', ['head'], 'hair'],
  ['nose', ['head'], 'skin'], ['mouth', ['head'], 'lip'], ['longhair', ['head'], 'hair', 'long'],
];
/** Kyle's limb geometry, plus the face and a hair cap tilted back to show the forehead */
function crowdGeometry() {
  const G = { ...geo(1) };
  const at = (g, x, y, z) => { g.translate(x, y, z); return g; };
  G.hairF = G.hair.clone(); G.hairF.rotateX(-.6);
  G.eyeL = at(new THREE.SphereGeometry(.017, 8, 6), .038, .022, .098); G.eyeR = at(new THREE.SphereGeometry(.017, 8, 6), -.038, .022, .098);
  G.browL = at(new THREE.BoxGeometry(.045, .011, .012), .039, .05, .093); G.browR = at(new THREE.BoxGeometry(.045, .011, .012), -.039, .05, .093);
  G.nose = at(new THREE.SphereGeometry(.018, 8, 6), 0, -.008, .106); G.mouth = at(new THREE.BoxGeometry(.046, .011, .012), 0, -.05, .096);
  G.longhair = at(new THREE.BoxGeometry(.22, .25, .08), 0, -.075, -.07);
  return G;
}

/** walking: Kyle's running pose, toned down to a stroll */
function walkPose(F, ph) {
  pose(F, ph, 3.4);
  F.elL.rotation.x = F.elR.rotation.x = -.25; F.shL.rotation.z = F.shR.rotation.z = 0;
  F.pelvis.rotation.x = .03; F.pelvis.position.y = .92 + Math.abs(Math.sin(ph)) * .025; F.head.rotation.x = 0;
}
/** standing still, looking around (a pause in the crowd) */
function restPose(F, t) {
  pose(F, 0, 0);
  F.pelvis.position.y = .92; F.pelvis.rotation.x = 0;
  F.shL.rotation.x = F.shR.rotation.x = -.12; F.elL.rotation.x = F.elR.rotation.x = -.3;
  F.head.rotation.y = Math.sin(t * .7) * .3;
}
/**
 * A street dancer. t is time (s), style picks the flavour (0 bounce, 1 spin, 2 arm-wave, 3 shimmy).
 * The figure bounces, sways and throws the arms around — loud and loose, like Bourbon.
 */
function dancePose(F, t, style) {
  pose(F, 0, 0);
  const b = Math.abs(Math.sin(t * 4.2));           // the bounce
  F.pelvis.position.y = .92 + b * .09;
  F.pelvis.rotation.x = .12 + b * .06;
  F.pelvis.rotation.z = Math.sin(t * 2.1) * .18;   // the sway
  F.head.rotation.x = -.06 + b * .05;
  if (style === 0) {   // the bounce: knees bent, arms pumping
    F.hipL.rotation.x = F.hipR.rotation.x = -.35 - b * .3; F.kneeL.rotation.x = F.kneeR.rotation.x = .5 + b * .4;
    F.shL.rotation.x = F.shR.rotation.x = -.5 - b * .5; F.elL.rotation.x = F.elR.rotation.x = -.6 - b * .4;
    F.shL.rotation.z = .3; F.shR.rotation.z = -.3;
  } else if (style === 1) {   // the spin: arms out, leaning into it
    F.hipL.rotation.x = F.hipR.rotation.x = -.2; F.kneeL.rotation.x = F.kneeR.rotation.x = .3;
    F.shL.rotation.z = 1.2; F.shR.rotation.z = -1.2; F.shL.rotation.x = F.shR.rotation.x = -.2;
    F.elL.rotation.x = F.elR.rotation.x = -.3;
  } else if (style === 2) {   // the arm-wave: one arm up, snaking
    F.hipL.rotation.x = F.hipR.rotation.x = -.25; F.kneeL.rotation.x = F.kneeR.rotation.x = .35;
    F.shR.rotation.z = -1.3; F.shR.rotation.x = -.3 + Math.sin(t * 5) * .3; F.elR.rotation.x = -.4 + Math.sin(t * 5 + 1) * .4;
    F.shL.rotation.x = -.4; F.elL.rotation.x = -.7;
  } else {   // the shimmy: fast shoulder and hip shimmies, arms loose
    F.hipL.rotation.x = F.hipR.rotation.x = -.3; F.kneeL.rotation.x = F.kneeR.rotation.x = .4;
    F.shL.rotation.z = .4 + Math.sin(t * 9) * .25; F.shR.rotation.z = -.4 - Math.sin(t * 9) * .25;
    F.elL.rotation.x = F.elR.rotation.x = -.5 + Math.sin(t * 9 + 2) * .2;
  }
}
/**
 * A brass-band player. role: 'trumpet' | 'trombone' | 'sax' | 'tuba' | 'drums' | 'hats'.
 * t is time; the arms move with the beat (the caller passes the beat phase).
 */
function bandPose(F, t, role, beat) {
  pose(F, 0, 0);
  F.pelvis.position.y = .92; F.pelvis.rotation.x = .05;
  const nod = Math.sin(beat * Math.PI * 2) * .05;   // a little head nod on the beat
  F.head.rotation.x = .1 + nod;
  if (role === 'trumpet') {
    F.shL.rotation.x = -.9; F.elL.rotation.x = -1.5; F.shL.rotation.z = .2;
    F.shR.rotation.x = -.9; F.elR.rotation.x = -1.5; F.shR.rotation.z = -.2;
  } else if (role === 'trombone') {
    F.shL.rotation.x = -.7; F.elL.rotation.x = -.5; F.shL.rotation.z = .15;
    F.shR.rotation.x = -.7 - Math.sin(beat * Math.PI * 2) * .15; F.elR.rotation.x = -.4; F.shR.rotation.z = -.15;   // the slide works
  } else if (role === 'sax') {
    F.shL.rotation.x = -.8; F.elL.rotation.x = -1.2; F.shL.rotation.z = .3;
    F.shR.rotation.x = -.8; F.elR.rotation.x = -1.2; F.shR.rotation.z = -.3;
  } else if (role === 'tuba') {
    F.shL.rotation.x = -.5; F.elL.rotation.x = -.9; F.shL.rotation.z = .5;
    F.shR.rotation.x = -.5; F.elR.rotation.x = -.9; F.shR.rotation.z = -.5;
  } else if (role === 'drums') {
    const w = Math.sin(beat * Math.PI * 4);   // fast sticks
    F.shL.rotation.x = -.9 + w * .25; F.elL.rotation.x = -1.3 + w * .3;
    F.shR.rotation.x = -.9 - w * .25; F.elR.rotation.x = -1.3 - w * .3;
  } else {   // hats / shaker
    const w = Math.sin(beat * Math.PI * 2);
    F.shR.rotation.x = -.6 - w * .2; F.elR.rotation.x = -.8 - w * .2; F.shR.rotation.z = -.3;
    F.shL.rotation.x = -.3; F.elL.rotation.x = -.5;
  }
}

const SKIN = ['#8d5a3c', '#c99370', '#e0b48f', '#6b4430', '#b07a55', '#f0c9a6', '#a8704c', '#d9a77e'];
const HAIR = ['#1d1410', '#3a2a20', '#6b4a2b', '#2a1d16', '#a07a4a', '#8a8a86', '#c9a25a', '#4a2318'];
// Bourbon is loud and colourful: bright shirts, beads, and a lot of white and red
const SHIRT = ['#e8e4da', '#d6452f', '#2f4a6b', '#3d6b4a', '#d9b44a', '#5a4a6b', '#c86a3a', '#f2f2ee', '#1f2a33', '#b85c7a', '#4a6b8c', '#e0b400', '#7a1f2f', '#2fb8a8', '#ffffff', '#8c2f2f'];
const PANTS = ['#2e3542', '#1b1f27', '#5a4a3a', '#3a4a5a', '#7a6a55', '#2a2a2a', '#4a5a6b', '#c9bfa8', '#6b1f1f'];
const SHOE = ['#222222', '#e6e6e6', '#5a3a2a', '#3a3a3a', '#8c2f2f'];
const pick = a => a[Math.floor(Math.random() * a.length)];
const rnd = (a, b) => a + Math.random() * (b - a);

// ---- the loud music: a procedural second-line brass band (Web Audio). A module-level singleton,
// so it survives the scene being rebuilt when you change cities. It only sounds when the camera
// is close to the band (the caller sets the volume from the distance).
const BPM = 132, STEP = 60 / BPM / 2;   // an 8th note
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
// a 4-bar loop (32 8th notes): a driving second-line riff in C
const RIFF = [60, 60, 64, 67, 67, 64, 60, 62,  64, 64, 67, 72, 72, 67, 64, 62,
  60, 60, 64, 67, 67, 64, 60, 62,  64, 64, 67, 72, 74, 72, 67, 64];
const BASS = [36, 36, 43, 36,  41, 41, 45, 41,  36, 36, 43, 36,  38, 38, 43, 35];   // one per beat

class BrassBand {
  constructor() { this.ctx = null; this.master = null; this.running = false; this.nextTime = 0; this.step = 0; this.timer = null; this.targetVol = 0; this.vol = 0; this.noise = null; }
  /** create (or resume) the AudioContext; needs a user gesture, so this is also called on the first click */
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
    if (typeof window === 'undefined' || !(window.AudioContext || window.webkitAudioContext)) return false;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0;
    const comp = this.ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(this.ctx.destination);
    // a shared white-noise buffer for the drums
    const len = this.ctx.sampleRate * .5, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    return true;
  }
  start() { if (!this.ensure() || this.running) return; this.running = true; this.nextTime = this.ctx.currentTime + .1; this.step = 0; this.timer = setInterval(() => this.schedule(), 25); }
  stop() { if (!this.running) return; this.running = false; if (this.timer) { clearInterval(this.timer); this.timer = null; } }
  setVolume(v) { this.targetVol = Math.max(0, Math.min(1, v)); }
  /** called every frame: ease the master gain toward the target so it swells as you approach */
  update() { if (!this.ctx) return; this.vol += (this.targetVol - this.vol) * .08; this.master.gain.value = this.vol; }
  schedule() {
    while (this.nextTime < this.ctx.currentTime + .12) { this.playStep(this.step % 32, this.nextTime); this.nextTime += STEP; this.step++; }
  }
  playStep(s, t) {
    if (s % 4 === 0) this.kick(t);                       // four on the floor
    if (s % 8 === 4) this.snare(t);                      // beats 2 and 4
    this.hat(t, s % 2 === 1);                            // 8ths, accented off-beat
    if (s % 4 === 0) this.bass(mtof(BASS[(s / 4) | 0]), t, STEP * 1.8);
    this.brass(mtof(RIFF[s]), t, STEP * .95);            // the riff, every 8th
  }
  env(g, t, a, d, peak) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.001, t + a + d); }
  brass(f, t, dur) {
    const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator(), flt = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o2.type = 'sawtooth'; o.frequency.value = f; o2.frequency.value = f * 1.007;   // a hair of detune
    flt.type = 'lowpass'; flt.frequency.value = 1900; flt.Q.value = 1.2;
    o.connect(flt); o2.connect(flt); flt.connect(g); g.connect(this.master);
    this.env(g, t, .012, dur, .5);
    o.start(t); o2.start(t); o.stop(t + dur + .05); o2.stop(t + dur + .05);
  }
  bass(f, t, dur) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.value = f; o.connect(g); g.connect(this.master);
    this.env(g, t, .01, dur, .7);
    o.start(t); o.stop(t + dur + .05);
  }
  kick(t) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + .12);
    o.connect(g); g.connect(this.master); this.env(g, t, .004, .16, .9);
    o.start(t); o.stop(t + .2);
  }
  snare(t) {
    const c = this.ctx, src = c.createBufferSource(), flt = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noise; flt.type = 'bandpass'; flt.frequency.value = 1900; flt.Q.value = .8;
    src.connect(flt); flt.connect(g); g.connect(this.master); this.env(g, t, .002, .14, .5);
    src.start(t); src.stop(t + .16);
  }
  hat(t, accent) {
    const c = this.ctx, src = c.createBufferSource(), flt = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noise; flt.type = 'highpass'; flt.frequency.value = 7500;
    src.connect(flt); flt.connect(g); g.connect(this.master); this.env(g, t, .001, accent ? .05 : .03, accent ? .28 : .16);
    src.start(t); src.stop(t + .06);
  }
}
export const brassBand = new BrassBand();
// the browser won't start audio until a gesture: arm it on the first click or key
if (typeof window !== 'undefined') {
  const arm = () => { brassBand.ensure(); window.removeEventListener('pointerdown', arm); window.removeEventListener('keydown', arm); };
  window.addEventListener('pointerdown', arm); window.addEventListener('keydown', arm);
}

// ---- the brass band: six players (makeFigure) with simple gold instruments, in the middle of
// the street. They are non-instanced (only six) so each can hold its own instrument.
const GOLD = '#d8b24a';
function instrument(role) {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: GOLD, roughness: .35, metalness: .7 });
  const wood = new THREE.MeshStandardMaterial({ color: '#7a4a2a', roughness: .7 });
  const white = new THREE.MeshStandardMaterial({ color: '#f2f2ee', roughness: .5 });
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o; };
  if (role === 'trumpet') {
    add(new THREE.CylinderGeometry(.03, .03, .34, 8), gold, 0, 0, .12, Math.PI / 2, 0, 0);   // the lead pipe
    add(new THREE.ConeGeometry(.07, .12, 10, 1, true), gold, 0, 0, .3, Math.PI / 2, 0, 0);    // the bell
  } else if (role === 'trombone') {
    add(new THREE.CylinderGeometry(.03, .03, .5, 8), gold, 0, 0, .18, Math.PI / 2, 0, 0);
    add(new THREE.ConeGeometry(.09, .14, 10, 1, true), gold, 0, 0, .44, Math.PI / 2, 0, 0);
    add(new THREE.CylinderGeometry(.02, .02, .3, 6), gold, 0, -.06, .1, Math.PI / 2, 0, 0);   // the slide
  } else if (role === 'sax') {
    add(new THREE.ConeGeometry(.08, .22, 10, 1, true), gold, 0, -.14, .16, .5, 0, .5);        // the bell, angled down
    add(new THREE.CylinderGeometry(.025, .025, .2, 8), gold, 0, .02, .12, .3, 0, 0);
  } else if (role === 'tuba') {
    add(new THREE.ConeGeometry(.16, .3, 12, 1, true), gold, 0, .28, .1, -.3, 0, 0);           // the big bell on top
    add(new THREE.CylinderGeometry(.1, .12, .2, 12), gold, 0, .1, .1);
  } else if (role === 'drums') {
    add(new THREE.CylinderGeometry(.16, .16, .14, 12), white, 0, .5, .3);                      // the snare
    add(new THREE.CylinderGeometry(.13, .13, .12, 12), wood, -.2, .42, .2);                    // a tom
    add(new THREE.CylinderGeometry(.13, .13, .12, 12), wood, .2, .42, .2);
    add(new THREE.CylinderGeometry(.02, .02, .5, 6), new THREE.MeshStandardMaterial({ color: '#333', metalness: .6, roughness: .5 }), 0, .25, .3);   // the stand
  } else {   // hats
    add(new THREE.CylinderGeometry(.14, .14, .01, 12), gold, 0, .6, .3);                       // the cymbal
    add(new THREE.CylinderGeometry(.02, .02, .6, 6), new THREE.MeshStandardMaterial({ color: '#333', metalness: .6, roughness: .5 }), 0, .3, .3);
  }
  return g;
}
/** the six players, arranged in a loose arc in the middle of the street facing the crowd */
function buildBand(parent, cx, cz, face) {
  const group = new THREE.Group(); parent.add(group);
  const roles = [
    ['tuba', 0, -1.1], ['trumpet', -1.5, -.3], ['trombone', 1.5, -.3],
    ['sax', -1.1, .9], ['drums', 0, 1.2], ['hats', 1.1, .9],
  ];
  const members = [];
  for (const [role, ox, oz] of roles) {
    const F = makeFigure({ shirt: pick(SHIRT), shorts: pick(PANTS), skin: pick(SKIN), shoe: pick(SHOE), hair: pick(HAIR) });
    const x = cx + ox * Math.cos(face) - oz * Math.sin(face), z = cz + ox * Math.sin(face) + oz * Math.cos(face);
    F.root.position.set(x, PAVE_Y, z); F.root.rotation.y = face; F.root.updateMatrixWorld(true);
    const inst = instrument(role);
    if (role === 'drums' || role === 'hats') {   // on a stand on the ground, in front
      inst.position.set(x, PAVE_Y, z); inst.rotation.y = face; group.add(inst);
    } else {   // held up in front of the face
      const chest = F.chest; inst.position.set(0, .12, .28); chest.add(inst);
    }
    members.push({ F, role, x, z });
  }
  return { group, members };
}

// ---- the crowd on Bourbon: walkers strolling the lanes, street dancers working the middle, and
// the brass band. Returns the same interface as phl/pedestrians.js, so it slots in as `peds`.
export function buildFrenchQuarter(scene, opts = {}) {
  const group = new THREE.Group(); group.name = 'fq-bourbon'; scene.add(group);
  const G = crowdGeometry();
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .8 });

  const N_WALK = 150, N_DANCE = 12, COUNT = N_WALK + N_DANCE;
  const parts = PARTS.map(([g, joints, col, flag]) => {
    const im = new THREE.InstancedMesh(G[g], mat, COUNT * joints.length);
    im.frustumCulled = false; im.castShadow = false; im.receiveShadow = true; group.add(im);
    return { im, joints, col, flag };
  });

  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0), col = new THREE.Color();
  const people = [];
  for (let i = 0; i < COUNT; i++) {
    const isDancer = i >= N_WALK;
    const longPants = Math.random() < .7, sleeves = Math.random() < .4;
    const prof = makeProfile(i);
    const c = { shirt: pick(SHIRT), pants: pick(PANTS), skin: pick(SKIN), hair: prof.grey ? pick(['#9a9a96', '#c8c8c4', '#e2e0da']) : pick(HAIR), shoe: pick(SHOE) };
    c.leg = longPants ? c.pants : c.skin; c.arm = sleeves ? c.shirt : c.skin; c.eye = '#1b1512'; c.lip = '#7a3b34';
    parts.forEach(p => p.joints.forEach((j, k) => p.im.setColorAt(i * p.joints.length + k, col.set(c[p.col]))));
    const P = { i, F: rig(), x: 0, z: 0, h: 0, sp: rnd(1.0, 1.5), path: [], then: null, state: 'walk', t: 0, k: 0,
      ph: rnd(0, 6), hidden: false, lod: i % 8, dirty: true, dancer: isDancer, style: i % 4, posed: false };
    P.prof = prof; P.col = c; P.F.root.scale.setScalar(prof.scale);
    P.long = Math.random() < (prof.sex === 'Female' ? .6 : prof.sex === 'Male' ? .08 : .4);
    people.push(P);
  }
  parts.forEach(p => { p.im.instanceColor.needsUpdate = true; });
  // start every instance at zero scale so nobody flashes at the origin before their first pose
  parts.forEach(p => { for (let i = 0; i < p.im.count; i++) p.im.setMatrixAt(i, ZERO); p.im.instanceMatrix.needsUpdate = true; });

  // the band, in the middle of the street
  const BAND_S = 110, bandQ = at(BAND_S, 0), bandCenter = { x: bandQ.x, z: bandQ.z };
  const band = buildBand(group, bandCenter.x, bandCenter.z, Math.atan2(bandQ.tx, bandQ.tz));
  // street dancers: three little crews working the middle of the road at a few spots
  const DANCE_SPOTS = [50, 165, 220].map(s => { const q = at(s, 0); return { x: q.x, z: q.z, h: Math.atan2(q.tx, q.tz) }; });
  const dancers = people.filter(P => P.dancer);
  dancers.forEach((P, i) => {
    const sp = DANCE_SPOTS[Math.floor(i / 4) % DANCE_SPOTS.length], j = i % 4;
    const off = [[0, 0], [1.3, .7], [-1.3, .7], [0, 1.6]][j];
    P.x = sp.x + off[0]; P.z = sp.z + off[1]; P.h = sp.h + rnd(-.5, .5); P.state = 'dance'; P.t = rnd(0, 10);
  });

  // ---- planning: walkers stroll the lanes either side of the clear middle, with pauses
  const LANE = [CLEAR + .6, HALF - .5];
  function lanePath(s0, s1, o) {
    const out = [], n = Math.max(1, Math.ceil(Math.abs(s1 - s0) / 25));
    for (let k = 1; k <= n; k++) { const q = at(s0 + (s1 - s0) * k / n, o); out.push([q.x, q.z]); }
    return out;
  }
  function plan(P) {
    const here = project(P.x, P.z).s, r = Math.random();
    if (r < .22) {   // stop and take it in (face roughly down the street)
      const p = project(P.x, P.z); P.state = 'pause'; P.t = rnd(2, 7); P.h = Math.atan2(p.tx, p.tz) + rnd(-1.2, 1.2); return;
    }
    // a third of the time, head for the band and hang around it
    const target = r < .5 ? BAND_S + rnd(-18, 18) : Math.max(6, Math.min(BOURBON_LENGTH - 6, here + rnd(-120, 120)));
    const side = Math.random() < .5 ? -1 : 1, o = side * rnd(LANE[0], LANE[1]);
    const p = project(P.x, P.z), q = at(p.s, o);
    P.path = [[q.x, q.z], ...lanePath(p.s, Math.max(6, Math.min(BOURBON_LENGTH - 6, target)), o)]; P.state = 'walk';
  }
  // start: the walkers out on the street
  for (const P of people) if (!P.dancer) {
    const s = rnd(8, BOURBON_LENGTH - 8), side = Math.random() < .5 ? -1 : 1, o = side * rnd(LANE[0], LANE[1]);
    const q = at(s, o); P.x = q.x; P.z = q.z; P.h = Math.atan2(q.tx, q.tz); plan(P);
  }

  // ---- per frame
  const turn = (P, want, dt) => { P.h += Math.atan2(Math.sin(want - P.h), Math.cos(want - P.h)) * Math.min(1, dt * 7); };
  function step(P, dt) {
    if (P.dancer) { P.t += dt; return; }   // dancers just dance (posed in update)
    switch (P.state) {
      case 'walk': {
        let go = P.sp * dt;
        while (go > 0 && P.path.length) {
          const [tx, tz] = P.path[0], dx = tx - P.x, dz = tz - P.z, d = Math.hypot(dx, dz);
          if (d < 1e-3) { P.path.shift(); continue; }
          turn(P, Math.atan2(dx, dz), dt);
          const m = Math.min(go, d); P.x += dx / d * m; P.z += dz / d * m; go -= m;
          if (m >= d) P.path.shift();
        }
        P.ph += dt * 5.6 * P.sp / 1.3;
        if (!P.path.length) plan(P);
        break;
      }
      case 'pause': { if ((P.t -= dt) <= 0) plan(P); break; }
    }
  }

  let frame = 0, enabled = true, inside = null, clock = 0;
  function update(dt, camera) {
    frame++; clock += dt;
    const cp = camera.position, far = cp.y > 1500;
    // the loud music: full volume close to the band, falling off to silence ~280 m out
    const bandDist = Math.hypot(bandCenter.x - cp.x, bandCenter.z - cp.z);
    const vol = enabled ? Math.max(0, Math.min(1, 1 - (bandDist - 18) / 260)) : 0;
    brassBand.setVolume(vol);
    if (vol > .01) brassBand.start(); else if (vol < .004) brassBand.stop();
    brassBand.update();
    const beat = (clock * BPM / 60) % 1;   // the beat phase, driving the players' arms
    for (const m of band.members) { bandPose(m.F, clock, m.role, beat); m.F.root.updateMatrixWorld(true); }
    for (const P of people) {
      step(P, dt);
      // re-pose near people every frame, further ones every 3rd or 10th
      const me = P === inside, d = Math.hypot(P.x - cp.x, P.z - cp.z), every = me || d < 120 ? 1 : d < 350 ? 3 : 10;
      if ((far && !me) || (frame + P.lod) % every) continue;
      const F = P.F;
      if (P.dancer) dancePose(F, P.t, P.style);
      else if (P.state === 'walk') walkPose(F, P.ph);
      else restPose(F, clock + P.i);
      F.root.position.set(P.x, PAVE_Y, P.z); F.root.rotation.y = P.h; F.root.updateMatrixWorld(true);
      // the person being inhabited has no head (the camera is in it)
      for (const p of parts) p.joints.forEach((j, k) => p.im.setMatrixAt(P.i * p.joints.length + k, (me && (j === 'head' || j === 'hair')) || (p.flag && !P[p.flag]) ? ZERO : F[j].matrixWorld));
    }
    for (const p of parts) p.im.instanceMatrix.needsUpdate = true;
  }

  // ---- picking and inhabiting (see through someone's eyes), as on Walnut St
  const pv = new THREE.Vector3();
  function pickPerson(camera, x, y, w, h) {
    if (!enabled) return null;
    const f = h / (2 * Math.tan(camera.fov * Math.PI / 360)), cp = camera.position; let best = null;
    for (const P of people) {
      if (P === inside) continue;
      const cy = PAVE_Y + 1.25 * P.prof.scale, dist = Math.hypot(P.x - cp.x, cy - cp.y, P.z - cp.z); if (dist > 300) continue;
      pv.set(P.x, cy, P.z).project(camera); if (pv.z > 1) continue;
      const d = Math.hypot((pv.x + 1) / 2 * w - x, (1 - pv.y) / 2 * h - y), tol = Math.max(8, f * .45 / dist);
      if (d < tol && (!best || d / tol < best.r)) best = { person: P.i, r: d / tol };
    }
    return best && { person: best.person };
  }
  const look = { yaw: 0, pitch: 0 };
  function inhabit(i) { inside = people[i] || null; look.yaw = 0; look.pitch = 0; if (inside) inside.posed = false; return getInhabited(); }
  function leave() {
    if (!inside) return null;
    const P = inside; inside = null;
    return { p: new THREE.Vector3(P.x, PAVE_Y, P.z), dir: new THREE.Vector3(Math.sin(P.h), 0, Math.cos(P.h)), cam: pullBack(P.x, P.z, P.h) };
  }
  function activity(P) {
    if (P.dancer) return 'Dancing in the middle of Bourbon for tips';
    if (P.state === 'walk') return 'Strolling down Bourbon Street';
    if (P.state === 'pause') return 'Soaking in the noise, the crowd and the band';
    return '';
  }
  function getInhabited() {
    if (!inside) return null;
    const p = inside.prof;
    return { kind: 'person', id: inside.i, name: p.name, sex: p.sex, age: p.age, height: p.height, kg: p.kg, lb: p.lb, bio: p.bio, now: activity(inside) };
  }
  const lookAt = (dx, dy) => { look.yaw = Math.max(-2.2, Math.min(2.2, look.yaw - dx * .0045)); look.pitch = Math.max(-1.1, Math.min(1.1, look.pitch - dy * .0045)); };
  const eye = new THREE.Vector3(), fwd = new THREE.Vector3();
  function inhabitFrame(camera) {
    const P = inside; if (!P) return;
    P.F.head.getWorldPosition(eye); eye.y += .04;
    const a = P.h + look.yaw, down = -.06;
    eye.x += Math.sin(P.h) * .1; eye.z += Math.cos(P.h) * .1;
    const pt = look.pitch + down; fwd.set(Math.sin(a) * Math.cos(pt), Math.sin(pt), Math.cos(a) * Math.cos(pt));
    camera.position.copy(eye); camera.up.set(0, 1, 0); camera.lookAt(eye.x + fwd.x, eye.y + fwd.y, eye.z + fwd.z);
  }
  // a head-and-shoulders portrait for the card, as on Walnut St
  let pr = null;
  function portrait(i, size = 176) {
    const P = people[i]; if (!P) return null;
    if (!pr) {
      const canvas = document.createElement('canvas');
      const renderer = makeRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(28, 1, .05, 10);
      sc.add(new THREE.HemisphereLight('#fff4e6', '#4a5560', .85 * LIGHT));
      const key = new THREE.DirectionalLight('#ffffff', .75 * LIGHT); key.position.set(.6, 1.2, 1.4); sc.add(key);
      const bust = new THREE.Group(); sc.add(bust);
      pr = { canvas, renderer, sc, cam, bust };
    }
    pr.renderer.setSize(size, size, false);
    pr.bust.children.forEach(m => m.material.dispose()); pr.bust.clear();
    const F = rig(); pose(F, 0, 0); F.root.scale.setScalar(P.prof.scale); F.root.updateMatrixWorld(true);
    const UPPER = new Set(['torso', 'neck', 'head', 'hairF', 'upper', 'eyeL', 'eyeR', 'browL', 'browR', 'nose', 'mouth', 'longhair']);
    for (const [g, joints, col, flag] of PARTS) {
      if (!UPPER.has(g) || (flag && !P[flag])) continue;
      const m = new THREE.MeshStandardMaterial({ color: P.col[col], roughness: .75 });
      for (const j of joints) { const mesh = new THREE.Mesh(G[g], m); mesh.matrixAutoUpdate = false; mesh.matrix.copy(F[j].matrixWorld); pr.bust.add(mesh); }
    }
    const head = F.head.getWorldPosition(new THREE.Vector3());
    pr.cam.position.set(head.x + .06, head.y - .02, head.z + .78); pr.cam.lookAt(head.x, head.y - .1, head.z);
    pr.renderer.render(pr.sc, pr.cam);
    return pr.canvas;
  }
  /** where the camera goes when you step out of someone: 40 m back down the street */
  function pullBack(x, z, heading) {
    const p = project(x, z), dir = Math.sign(Math.sin(heading) * p.tx + Math.cos(heading) * p.tz) || 1;
    const q = at(Math.max(0, Math.min(BOURBON_LENGTH, p.s - dir * 40)), 0);
    return new THREE.Vector3(q.x, 24, q.z);
  }
  const setVisible = on => { group.visible = on; enabled = on; if (!on) { inside = null; brassBand.stop(); } };
  // a view down the street from the Royal end, onto the dancers and the band
  const a = at(15, 0), b = at(140, 0);
  const view = { id: 'bourbon', name: 'Bourbon Street', pos: new THREE.Vector3(a.x, 21, a.z), target: new THREE.Vector3(b.x, 1, b.z) };

  return { update, people, stats: () => ({ walkers: N_WALK, dancers: N_DANCE, band: band.members.length }),
    pickPerson, inhabit, leave, getInhabited, lookAt, inhabitFrame, portrait, setVisible, view };
}





