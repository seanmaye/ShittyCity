// The Railyard Bowl's show (yardpark.js builds the bowl): Alvin and the Chipmunks, live, to a crowd of
// punks. Go to: "Punk show at the Railyard Bowl".
//
// On stage: Alvin out front singing (red sweater, the big "A" and a cap), Simon on guitar (blue,
// glasses) and Theodore on the drums (green). Some songs the Chipettes come out from the wings and
// sing and dance with them (Brittany in pink, Jeanette in purple with glasses, Eleanor in green with
// pigtails), then walk off again. The set loops: SONGS, with a gap between each song, and the video
// screens either side say what's playing.
//
// In the pit between the stage and the seats, and up the first rows, are the punks: mohawks,
// liberty spikes, studded leather, plaid bondage pants, combat boots. Each does their own thing
// with the beat (pogo, headbang, fist in the air, mosh, smoke, drink, or sit slumped in a K-hole).
// They are drawn instanced, like the people on Walnut St (pedestrians.js): one InstancedMesh per
// body part or piece of kit for the whole crowd, posed on a light skeleton of Object3D joints.
//
// Click one to see through their eyes, with a card about them (punkprofiles.js), like the people on
// Walnut St and Mr. Kepner at the Bald Eagle Vista, and four things to do (ACTS: two drugs and two
// other things, different for each punk). Each plays out on their body and, while you are them, on
// what you see: the view sways, blurs, shakes, shifts colour (the canvas's CSS filter), or in a
// K-hole leaves the body and floats above it.
//
// js/scene/index.js treats a punk like a person you are inside (getInhabited() is the "car" you are
// aboard); js/ui.js draws the card and the action buttons from that state.
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { geo, pose } from './people.js';
import { punkProfile } from './punkprofiles.js';
import { litMats } from '../materials.js';
import { LIGHT, makeRenderer } from '../../three-setup.js';

const BPM = 172, STAGE = 1.6;     // the band's tempo; the stage deck's height in the bowl (yardpark.js)
const GAP = 7;                    // seconds between songs
const KIT = -5.5;                 // the drum riser's x: between Simon and Alvin, behind them
const SONGS = [
  { title: 'Acorn Anarchy', len: 48 },
  { title: 'Nuts to the System', len: 44 },
  { title: 'Cheek Pouch Riot', len: 50, chipettes: true },
  { title: 'Hibernate This', len: 40 },
  { title: 'Tree Rat Rebellion', len: 46 },
  { title: 'Sugar Pine Slam', len: 52, chipettes: true },
  { title: 'No Future (For Acorns)', len: 42 },
];
const SET = SONGS.reduce((s, x) => s + x.len + GAP, 0);
const MAX = 84;                   // punks
const NEAR = 650;                 // nothing moves while the camera is farther than this (m)
const KHOLE = 40, ROLL = 70;      // seconds: a K-hole; a pill, from swallowing to coming down

// the things a punk can do (each has two of DRUGS and two of OTHER), and how long each takes
const ACTS = {
  puff: { label: 'Take a puff', dur: 4.6, prop: 'joint' },
  ket: { label: 'Shoot ketamine', dur: 5, prop: 'syringe' },
  huff: { label: 'Huff glue', dur: 4.2, prop: 'bag' },
  pill: { label: 'Drop a pill', dur: 2.2 },
  bump: { label: 'Do a bump of speed', dur: 2.6 },
  beer: { label: 'Shotgun a beer', dur: 4.4, prop: 'can' },
  cig: { label: 'Light a cigarette', dur: 4.6, prop: 'cig' },
  pogo: { label: 'Pogo', dur: 8 },
  mosh: { label: 'Start a mosh pit', dur: 6 },
  surf: { label: 'Crowd surf', dur: 14 },
  spit: { label: 'Spit at the stage', dur: 1.6 },
  yell: { label: 'Yell “ALVIN!”', dur: 2.6 },
};
const DRUGS = ['puff', 'ket', 'puff', 'ket', 'huff', 'pill', 'bump'], OTHER = ['beer', 'cig', 'pogo', 'mosh', 'surf', 'spit', 'yell', 'beer'];

const SKIN = ['#f0c9a6', '#e0b48f', '#c99370', '#8d5a3c', '#f5d5bd', '#6b4430', '#d9a77e', '#efc2a0'];
const NEON = { green: '#5dff3a', pink: '#ff3ab4', blue: '#2fb8ff', red: '#e8162a', purple: '#a23aff', bleached: '#f4ec9a', black: '#141110', orange: '#ff7a14' };
const TOPS = { leather: '#17171a', denim: '#3d5778', army: '#4d5233', vest: '#46628a', tee: '#1b1b1b' };
const PANTS = { black: '#1a1a1d', plaid: '#a3161f', camo: '#4b5132', ripped: '#55739c', leopard: '#c9963f' };
const BOOTS = ['#121212', '#121212', '#4a1118', '#e9e6dc', '#121212'];
const TEES = ['#e9e6dc', '#f2f2ee', '#c42a2a', '#151515', '#e0c936', '#9a9a9a'];
const PRINTS = ['#e8162a', '#151515', '#ffffff', '#5dff3a', '#ff3ab4', '#f2c230'];
const CANS = ['#c3c8cb', '#b51f26', '#1f4fa8', '#e0c936'];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const bell = (t, a, b, e = .6) => smooth((t - a) / e) * (1 - smooth((t - b) / e));   // 0 → 1 from a, 1 → 0 by b
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const M4 = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const t = new THREE.CanvasTexture(c); t.redraw = () => { draw(c.getContext('2d'), w, h); t.needsUpdate = true; }; t.redraw(); return t; }
/** a soft round spot: white in the middle, clear at the edge (smoke) */
/** Stage lighting at night, faked in the shader (the city has no real lights): the dusk glow
 *  (litMats) takes each part's own colour (vertex or instance colour) instead of one flat tint,
 *  shaded by a key light (uniforms.stageKey, a world-space direction toward the light, set by
 *  update()) and with a rim in the beams' colours, so the band and the crowd read in colour and in
 *  the round. */
function stageLit(m, uniforms) {
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.fragmentShader = 'uniform vec3 stageKey;\nuniform vec3 stageRim;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      vec3 stageK = normalize((viewMatrix * vec4(stageKey, 0.)).xyz);
      float stageL = .18 + .82 * max(dot(normal, stageK), 0.);
      float stageR = pow(1. - clamp(dot(normal, normalize(vViewPosition)), 0., 1.), 3.);
      totalEmissiveRadiance = emissive * (diffuseColor.rgb * stageL + stageRim * stageR);`);
  };
  m.customProgramCacheKey = () => 'concert-stagelit';
  return m;
}
const spotTex = () => canvasTex(64, 64, g => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.55, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.clearRect(0, 0, 64, 64); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });

// ---- building blocks for the band (meshes, merged per joint by bake())
const Y = new THREE.Vector3(0, 1, 0);
const stdMat = c => new THREE.MeshStandardMaterial({ color: c, roughness: .75 });
function grp(parent, x = 0, y = 0, z = 0) { const o = new THREE.Group(); o.position.set(x, y, z); parent.add(o); return o; }
function box(parent, m, w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); parent.add(o); return o; }
function ball(parent, m, r, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); parent.add(o); return o; }
function tube(parent, m, a, b, r0, r1 = r0, seg = 10) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, A.distanceTo(B), seg), m);
  o.position.copy(A).add(B).multiplyScalar(.5); o.quaternion.setFromUnitVectors(Y, B.sub(A).normalize()); parent.add(o); return o;
}
function cyl(parent, m, r, h, x, y, z, rx = 0, rz = 0, seg = 16) { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); parent.add(o); return o; }

/** Merge the plain meshes under each group into one mesh with vertex colours: a figure costs one draw
 *  per joint instead of one per piece. Meshes marked userData.keep (textured ones) stay as they are. */
function bake(root, material) {
  const holders = []; root.traverse(o => { if (!o.isMesh) holders.push(o); });
  for (const h of holders) {
    const ms = h.children.filter(c => c.isMesh && !c.userData.keep && !c.children.length);
    if (!ms.length) continue;
    const geos = ms.map(m => {
      m.updateMatrix(); let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); g.applyMatrix4(m.matrix);
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
      const c = m.material.color, n = g.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
    });
    const merged = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(geos), material); merged.castShadow = true;
    ms.forEach(m => { h.remove(m); m.geometry.dispose(); }); h.add(merged);
  }
}

// ---- a chipmunk: about 1.4 m (before the stage's scale), facing +z, joints like Kyle's figures
function chipmunk(spec) {
  const F = { root: new THREE.Group(), spec };
  const fur = stdMat(spec.fur), belly = stdMat(spec.belly), cloth = stdMat(spec.shirt), black = stdMat('#141414'), white = stdMat('#fbfbf6'), dark = stdMat('#5a3a1c');
  const hair = spec.hair ? stdMat(spec.hair) : null, w = spec.chubby ? 1.2 : 1;
  const P = F.pelvis = grp(F.root, 0, .42, 0);
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    const hip = F['hip' + s] = grp(P, sx * .12 * w, 0, 0); tube(hip, fur, [0, 0, 0], [0, -.2, 0], .085, .075);
    const knee = F['knee' + s] = grp(hip, 0, -.2, 0); tube(knee, fur, [0, 0, 0], [0, -.16, 0], .07, .06); ball(knee, fur, .08, 0, -.19, .06, 1, .55, 1.7);
  }
  const sw = new THREE.Mesh(new THREE.CylinderGeometry(.25 * w, .32 * w, .54, 18), cloth); sw.position.y = .2; sw.scale.z = .9; P.add(sw);
  box(P, cloth, .5 * w, .06, .5 * w * .9, 0, -.05, 0).scale.set(1, 1, 1);   // the sweater's hem, a little flared
  // the tail: bushy, curling up the back
  ball(P, fur, .12, 0, .05, -.3, 1, 1, 1.1); ball(P, fur, .15, 0, .36, -.44); ball(P, fur, .14, 0, .68, -.4, 1, 1.1, 1); ball(P, fur, .1, 0, .88, -.28); ball(P, dark, .06, 0, .9, -.2);
  const C = F.chest = grp(P, 0, .42, 0);
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    const sh = F['sh' + s] = grp(C, sx * .27 * w, 0, 0); tube(sh, cloth, [0, 0, 0], [0, -.24, 0], .078, .068);
    const el = F['el' + s] = grp(sh, 0, -.24, 0); tube(el, cloth, [0, 0, 0], [0, -.17, 0], .068, .064); ball(el, fur, .066, 0, -.21, 0);
    F['hand' + s] = grp(el, 0, -.22, 0);
  }
  const H = F.head = grp(C, 0, .36, 0);
  ball(H, fur, .3, 0, 0, 0, 1.05, .95, .95);
  ball(H, belly, .2, 0, -.07, .15, 1.25, .95, .85); ball(H, belly, .11, 0, -.11, .25, 1.2, .85, 1);
  ball(H, black, .042, 0, -.06, .355);
  for (const sx of [1, -1]) {
    box(H, white, .042, .06, .02, sx * .024, -.2, .3);                                                     // buck teeth
    ball(H, white, .09, sx * .11, .05, .22, 1, 1.25, .7); ball(H, black, .048, sx * .105, .045, .28); ball(H, white, .014, sx * .09, .07, .31);   // eyes
    ball(H, fur, .09, sx * .2, .25, -.02, 1, 1.1, .5); ball(H, belly, .055, sx * .2, .25, .02, 1, 1.1, .4);   // ears
    box(H, dark, .05, .025, .14, sx * .11, .2, .12, .25, 0, sx * -.2);                                       // a stripe over each eye
    if (spec.lashes) for (let k = 0; k < 3; k++) box(H, black, .012, .055, .012, sx * (.07 + .04 * k), .18, .25, 0, 0, sx * (k - 1) * .45);
  }
  box(H, dark, .07, .03, .32, 0, .27, -.05, .45);                                                             // the dark stripe on the crown
  if (spec.cap) {
    const m = stdMat(spec.cap), cap = new THREE.Mesh(new THREE.SphereGeometry(.315, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), m); cap.position.y = .05; H.add(cap);
    box(H, m, .32, .025, .22, 0, .1, .3, -.12);
  }
  if (spec.glasses) {
    const fr = stdMat(spec.glasses);
    for (const sx of [1, -1]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(.098, .014, 6, 20), fr); ring.position.set(sx * .11, .05, .31); H.add(ring); box(H, fr, .014, .014, .2, sx * .2, .06, .2); }
    box(H, fr, .05, .016, .016, 0, .07, .32);
  }
  if (hair) {
    const top = new THREE.Mesh(new THREE.SphereGeometry(.318, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.5), hair); top.position.set(0, .04, -.01); H.add(top);
    if (spec.style === 'ponytail') { ball(H, hair, .13, 0, .12, -.28); tube(H, hair, [0, .08, -.36], [0, -.3, -.42], .1, .04); ball(H, stdMat('#ff7ac0'), .05, 0, .12, -.33); }
    if (spec.style === 'bun') { ball(H, hair, .13, 0, .3, -.14); }
    if (spec.style === 'pigtails') for (const sx of [1, -1]) { ball(H, hair, .11, sx * .3, .08, -.05); tube(H, hair, [sx * .32, .02, -.05], [sx * .38, -.3, -.02], .09, .03); }
  }
  if (spec.letter) {   // the big letter on the sweater (kept out of the bake: it's a texture)
    const t = canvasTex(128, 128, (g, W, Hh) => { g.clearRect(0, 0, W, Hh); g.fillStyle = spec.letterColor; g.font = 'bold 118px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(spec.letter, W / 2, Hh / 2 + 6); });
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(.34, .34), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
    pl.position.set(0, .26, .26 * w + .022); pl.rotation.x = -.11; pl.userData.keep = true; P.add(pl);
  }
  return F;
}
const resetJoints = F => { for (const k of ['pelvis', 'chest', 'head', 'hipL', 'hipR', 'kneeL', 'kneeR', 'shL', 'shR', 'elL', 'elR']) F[k].rotation.set(0, 0, 0); };

// ---- the instruments and the backline
function drumKit() {
  const g = new THREE.Group(), shell = stdMat('#b21f2a'), head = stdMat('#efeee8'), brass = stdMat('#d8b04a'), chrome = stdMat('#9aa1a6');
  const bd = cyl(g, shell, .3, .3, 0, .3, .1, Math.PI / 2); bd.scale.set(1, 1, 1);
  cyl(g, head, .29, .01, 0, .3, .26, Math.PI / 2);
  for (const sx of [1, -1]) { cyl(g, shell, .12, .15, sx * .14, .7, .1, .35); cyl(g, head, .118, .01, sx * .14, .78, .13, .35); }
  cyl(g, shell, .16, .13, .3, .58, -.18); cyl(g, head, .158, .01, .3, .65, -.18);           // snare (his left)
  cyl(g, shell, .17, .32, -.4, .4, -.18); cyl(g, head, .168, .01, -.4, .565, -.18);          // floor tom
  for (const [x, y, z, r] of [[.48, .88, -.16, .17], [-.38, 1.12, .12, .22], [.32, 1.18, .14, .2]]) { tube(g, chrome, [x, 0, z], [x, y, z], .012); cyl(g, brass, r, .012, x, y, z, .12); }
  cyl(g, stdMat('#222'), .17, .36, 0, .18, -.6);                                              // the throne
  return g;
}
function guitar() {
  const g = new THREE.Group(), body = stdMat('#1d3f8a'), guard = stdMat('#f2f2ee'), neck = stdMat('#6b4426'), metal = stdMat('#c9ced2');
  ball(g, body, .2, -.1, 0, 0, 1.2, 1, .28); ball(g, body, .15, .14, .02, 0, 1.2, 1, .28);
  box(g, guard, .16, .1, .02, -.05, -.05, .055); box(g, neck, .58, .05, .03, .5, 0, 0); box(g, neck, .13, .07, .032, .84, 0, 0);
  box(g, metal, .04, .14, .02, -.12, 0, .06);
  return g;
}
function amp(w, h) { const g = new THREE.Group(); box(g, stdMat('#141416'), w, h, .7, 0, h / 2, 0); box(g, stdMat('#2a2724'), w * .9, h * .62, .02, 0, h * .42, .36); box(g, stdMat('#d8c9a0'), w * .3, .05, .02, 0, h * .86, .36); return g; }

// ---- the punks: one skeleton each (posed on the CPU), drawn by part
function rig() {
  const n = (p, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); if (p) p.add(o); return o; };
  const F = { root: n(null, 0, 0, 0) };
  F.pelvis = n(F.root, 0, .92, 0); F.chest = n(F.pelvis, 0, .56, 0); F.head = n(F.chest, 0, .17, 0);
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    F['hip' + s] = n(F.pelvis, sx * .1, 0, 0); F['knee' + s] = n(F['hip' + s], 0, -.45, 0); F['foot' + s] = n(F['knee' + s], 0, -.45, 0);
    F['sh' + s] = n(F.chest, sx * .23, -.04, 0); F['el' + s] = n(F['sh' + s], 0, -.3, 0); F['hand' + s] = n(F['el' + s], 0, -.29, 0);
  }
  return F;
}
const JOINTS = ['pelvis', 'chest', 'head', 'hipL', 'hipR', 'kneeL', 'kneeR', 'shL', 'shR', 'elL', 'elR'];
function rest(F) { for (const k of JOINTS) F[k].rotation.set(0, 0, 0); F.pelvis.position.set(0, .92, 0); }
/** bend an arm (shoulder x and z, elbow x) so `eff` comes as near as it can to `target` (as overlook.js) */
function reach(sh, el, eff, target) {
  const p = new THREE.Vector3(); let best = [0, 0, -.4], bd = Infinity;
  const cost = (rx, rz, ex) => { sh.rotation.set(rx, 0, rz); el.rotation.x = ex; return eff.getWorldPosition(p).distanceTo(target) + .012 * Math.abs(rz); };
  for (let rx = -2.8; rx <= .81; rx += .2) for (let rz = -1.2; rz <= 1.21; rz += .2) for (let ex = -2.7; ex <= .01; ex += .2) { const d = cost(rx, rz, ex); if (d < bd) { bd = d; best = [rx, rz, ex]; } }
  for (const step of [.06, .018]) {
    const [cx, cz, ce] = best;
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) for (let k = -3; k <= 3; k++) { const rx = cx + i * step, rz = cz + j * step, ex = Math.min(0, ce + k * step), d = cost(rx, rz, ex); if (d < bd) { bd = d; best = [rx, rz, ex]; } }
  }
  sh.rotation.set(0, 0, 0); el.rotation.x = 0;
  return best;
}
const setArm = (F, s, a, b = a, k = 0) => { F['sh' + s].rotation.set(a[0] + (b[0] - a[0]) * k, 0, a[1] + (b[1] - a[1]) * k); F['el' + s].rotation.x = a[2] + (b[2] - a[2]) * k; };

/** what each punk has on: hair, top, trousers, boots and the extras (also read by punkprofiles.js) */
function outfit(r) {
  const pick = a => a[Math.floor(r() * a.length)];
  const hair = pick(['mohawk', 'mohawk', 'mohawk', 'spikes', 'spikes', 'shaved', 'crop', 'long', 'bunches', 'beanie']);
  const hairName = pick(Object.keys(NEON).filter(k => hair === 'mohawk' || hair === 'spikes' ? k !== 'black' : true));
  const top = pick(['leather', 'leather', 'leather', 'denim', 'army', 'vest', 'tee', 'tee']), pants = pick(['black', 'black', 'plaid', 'plaid', 'camo', 'ripped', 'leopard']);
  const jacket = top !== 'tee';
  return { hair, hairName, hairC: NEON[hairName], top, topC: TOPS[top] === '#1b1b1b' ? pick(TEES) : TOPS[top], jacket, sleeves: ['leather', 'denim', 'army'].includes(top),
    teeC: pick(TEES), printC: pick(PRINTS), patchC: pick(PRINTS), pants, pantsC: PANTS[pants], bootC: pick(BOOTS), skin: pick(SKIN), canC: pick(CANS),
    studs: top === 'leather' && r() < .7, collar: r() < .35, shades: r() < .2, chain: r() < .45 };
}

// The parts: geometry, the joint it hangs from, its offset (or offsets, one per slot) and colour.
// col(look) null leaves that part off that punk; dyn(P) decides each frame (props, the head while
// you're looking out of it).
function partList() {
  const G = geo(1), skin = L => L.skin, head = { head: true };
  const capG = new THREE.SphereGeometry(.118, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.2);
  const spikeG = new THREE.ConeGeometry(.024, .2, 5); spikeG.translate(0, .1, 0);
  const spikes = [Y.clone(), ...[0, 1, 2, 3, 4, 5].map(k => { const a = k / 6 * Math.PI * 2 + .3; return new THREE.Vector3(Math.sin(.75) * Math.cos(a), Math.cos(.75), Math.sin(.75) * Math.sin(a)); })]
    .map(d => new THREE.Matrix4().compose(d.clone().multiplyScalar(.095), new THREE.Quaternion().setFromUnitVectors(Y, d), new THREE.Vector3(1, 1, 1)));
  const studs = []; for (const sx of [1, -1]) for (let k = 0; k < 5; k++) studs.push(M4(sx * (.05 + .034 * k), -.07 - .012 * k, .158));
  const cspikes = []; for (let k = 0; k < 6; k++) { const a = -1.1 + k * .44, d = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)); cspikes.push(new THREE.Matrix4().compose(d.clone().multiplyScalar(.066).setY(.05), new THREE.Quaternion().setFromUnitVectors(Y, d), new THREE.Vector3(1, 1, 1))); }
  const stickG = new THREE.CylinderGeometry(.0055, .0065, .075, 5); stickG.rotateX(Math.PI / 2);
  const syrG = new THREE.CylinderGeometry(.007, .007, .11, 6); syrG.rotateX(Math.PI / 2);
  const needleG = new THREE.CylinderGeometry(.0015, .0015, .05, 4); needleG.rotateX(Math.PI / 2);
  const both = (key, g, j, at, col, o = {}) => [['L', 1], ['R', -1]].map(([s, sx]) => ({ key: key + s, geo: g, joint: j + s, at: typeof at === 'function' ? at(sx) : at, col, ...o }));
  return [
    { key: 'torso', geo: G.torso, joint: 'pelvis', col: L => L.topC, shadow: true },
    { key: 'tee', geo: new THREE.BoxGeometry(.2, .27, .02), joint: 'pelvis', at: M4(0, .32, .17, .07), col: L => (L.jacket ? L.teeC : null) },
    { key: 'print', geo: new THREE.BoxGeometry(.12, .09, .02), joint: 'pelvis', at: M4(0, .35, .178, .07), col: L => L.printC },
    { key: 'patch', geo: new THREE.BoxGeometry(.16, .16, .02), joint: 'pelvis', at: M4(0, .34, -.172, -.07), col: L => (L.jacket ? L.patchC : null) },
    { key: 'stud', geo: new THREE.SphereGeometry(.014, 6, 4), joint: 'chest', at: studs, col: L => (L.studs ? '#dcdfe2' : null) },
    { key: 'hips', geo: G.shorts, joint: 'pelvis', col: L => L.pantsC },
    { key: 'belt', geo: new THREE.CylinderGeometry(.173, .173, .035, 14), joint: 'pelvis', at: M4(0, .1, 0), col: () => '#1c1a18' },
    { key: 'chain', geo: new THREE.TorusGeometry(.07, .006, 4, 12, Math.PI), joint: 'pelvis', at: M4(-.168, .08, .02, 0, Math.PI / 2, Math.PI), col: L => (L.chain ? '#c8cbd0' : null) },
    ...both('thigh', G.thigh, 'hip', null, L => L.pantsC, { shadow: true }),
    ...both('shin', G.shin, 'knee', null, L => L.pantsC),
    ...both('boot', (() => { const b = new THREE.BoxGeometry(.12, .13, .28); b.translate(0, -.03, .05); return b; })(), 'foot', null, L => L.bootC),
    ...both('upper', G.upper, 'sh', null, L => (L.sleeves ? L.topC : L.skin)),
    ...both('fore', G.fore, 'el', null, L => (L.sleeves ? L.topC : L.skin)),
    ...both('hand', G.hand, 'hand', null, skin),
    { key: 'neck', geo: G.neck, joint: 'chest', at: M4(0, .08, 0), col: skin },
    { key: 'head', geo: G.head, joint: 'head', col: skin, ...head, shadow: true },
    { key: 'hair', geo: G.hair, joint: 'head', at: M4(0, .01, -.01, -.6), col: L => (['crop', 'long', 'bunches', 'spikes'].includes(L.hair) ? L.hairC : null), ...head },
    { key: 'long', geo: new THREE.BoxGeometry(.2, .26, .06), joint: 'head', at: M4(0, -.08, -.1), col: L => (L.hair === 'long' ? L.hairC : null), ...head },
    { key: 'mohawk', geo: new THREE.BoxGeometry(.036, .17, .26), joint: 'head', at: M4(0, .15, -.02), col: L => (L.hair === 'mohawk' ? L.hairC : null), ...head },
    { key: 'stubble', geo: G.hair, joint: 'head', at: M4(0, .006, -.012, -.6, 0, 0, 1.01, 1.01, 1.01), col: L => (L.hair === 'mohawk' || L.hair === 'shaved' ? '#3a2e28' : null), ...head },
    { key: 'spike', geo: spikeG, joint: 'head', at: spikes, col: L => (L.hair === 'spikes' ? L.hairC : null), ...head },
    { key: 'bunch', geo: new THREE.SphereGeometry(.05, 8, 6), joint: 'head', at: [M4(.11, .04, -.03), M4(-.11, .04, -.03)], col: L => (L.hair === 'bunches' ? L.hairC : null), ...head },
    { key: 'beanie', geo: capG, joint: 'head', at: M4(0, .018, -.004), col: L => (L.hair === 'beanie' ? '#151515' : null), ...head },
    { key: 'shades', geo: new THREE.BoxGeometry(.17, .036, .02), joint: 'head', at: M4(0, .022, .106), col: L => (L.shades ? '#0a0a0a' : null), ...head },
    { key: 'eye', geo: new THREE.SphereGeometry(.016, 6, 5), joint: 'head', at: [M4(.038, .018, .099), M4(-.038, .018, .099)], col: L => (L.shades ? null : '#1b1b1b'), ...head },
    { key: 'mouth', geo: new THREE.BoxGeometry(.045, .012, .012), joint: 'head', at: M4(0, -.05, .097), col: () => '#6e2a2a', ...head },
    { key: 'collar', geo: new THREE.TorusGeometry(.058, .013, 5, 14), joint: 'chest', at: M4(0, .05, 0, Math.PI / 2), col: L => (L.collar ? '#111111' : null) },
    { key: 'cspike', geo: new THREE.ConeGeometry(.009, .03, 4), joint: 'chest', at: cspikes, col: L => (L.collar ? '#dcdfe2' : null) },
    // what's in the right hand (P.prop says which)
    { key: 'stick', geo: stickG, joint: 'handR', at: M4(0, -.02, .05), col: () => '#f4f1ea', dyn: P => P.prop === 'joint' || P.prop === 'cig' },
    { key: 'can', geo: new THREE.CylinderGeometry(.033, .033, .12, 10), joint: 'handR', at: M4(0, -.02, .02), col: L => L.canC, dyn: P => P.prop === 'can' },
    { key: 'syringe', geo: syrG, joint: 'handR', at: M4(0, -.01, .06), col: () => '#d6eef5', dyn: P => P.prop === 'syringe' },
    { key: 'needle', geo: needleG, joint: 'handR', at: M4(0, -.01, .135), col: () => '#8a8f94', dyn: P => P.prop === 'syringe' },
    { key: 'bag', geo: new THREE.BoxGeometry(.13, .15, .09), joint: 'handR', at: M4(.05, -.02, .06), col: () => '#b8925a', dyn: P => P.prop === 'bag', scale: P => P.bagK || 1 },
  ];
}

/**
 * Build the show in the bowl `bowl` (yardpark.js's group: +z toward the audience, y = 0 the lawn).
 * opts: canvas (the city's, for the effects), night(): 0 day .. 1 night, avoid: lines ({ p: [x, z]*10 }
 * as ground.json) that pass over the bowl, such as the rail viaduct across its seats: nobody stands under them.
 */
export function buildConcert(bowl, { canvas = null, night = () => 0, avoid = [] } = {}) {
  const group = new THREE.Group(); group.name = 'concert'; bowl.add(group);
  const T = { spot: spotTex() };
  // the band's light: from the front truss, up and out over the pit (in the bowl's frame; update() puts it in the world)
  const KEY = new THREE.Vector3(.3, .75, 1).normalize(), stage = { stageKey: { value: KEY.clone() }, stageRim: { value: new THREE.Color('#b48cff') } };
  const CROWD_KEY = new THREE.Vector3(-.15, .5, -1).normalize(), crowd = { stageKey: { value: CROWD_KEY.clone() }, stageRim: { value: new THREE.Color('#7fb8ff') } };   // from the stage
  const bandMat = stageLit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .7, emissive: '#fff4e6', emissiveIntensity: 0 }), stage); bandMat.userData.lit = .95; litMats.push(bandMat);

  // ---------------------------------------------------------------- the stage
  const kitM = stageLit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .6, emissive: '#fff4e6', emissiveIntensity: 0 }), stage); kitM.userData.lit = .8; litMats.push(kitM);
  const backline = new THREE.Group(); group.add(backline);
  box(backline, stdMat('#2c2622'), 8, .6, 5.5, KIT, STAGE + .3, -3);                         // the drum riser
  for (const [x, w, h] of [[-17, 2.6, 4.4], [-14.3, 2.6, 4.4], [5, 2.8, 3], [7.9, 2.8, 3]]) { const a = amp(w, h); a.position.set(x, STAGE, -4.5); backline.add(a); }
  for (const x of [-3, 3]) { const wedge = box(backline, stdMat('#141416'), 1.4, .6, .8, x, STAGE + .3, 10, -.5); wedge.rotation.y = x < 0 ? .3 : -.3; }
  const scale = 3;   // giant chipmunks: stars, and big enough to see from the back of the lawn
  const SPECS = {
    alvin: { fur: '#a8743e', belly: '#ecca98', shirt: '#d21f2b', cap: '#d21f2b', letter: 'A', letterColor: '#f6d23a' },
    simon: { fur: '#9c6c3a', belly: '#e6c494', shirt: '#2b5fb8', glasses: '#1b1b1f' },
    theodore: { fur: '#b07c46', belly: '#efd0a2', shirt: '#3c8f3a', chubby: true },
    brittany: { fur: '#bd8a52', belly: '#f2d6ae', shirt: '#ea5aa2', hair: '#a5521f', style: 'ponytail', lashes: true },
    jeanette: { fur: '#b8844e', belly: '#efd2a8', shirt: '#7b4fc4', hair: '#5a3a24', style: 'bun', lashes: true, glasses: '#4a2a6a' },
    eleanor: { fur: '#c39058', belly: '#f4dab2', shirt: '#3fae8a', hair: '#f0cf66', style: 'pigtails', lashes: true, chubby: true },
  };
  const band = {};
  for (const [id, spec] of Object.entries(SPECS)) { const F = chipmunk(spec); F.root.scale.setScalar(scale); band[id] = F; group.add(F.root); }
  const { alvin, simon, theodore, brittany, jeanette, eleanor } = band;
  // Alvin's microphone; Simon's guitar; Theodore's kit and sticks; a mic each for the Chipettes
  const mic = parent => { const g = new THREE.Group(); tube(g, stdMat('#1b1b1b'), [0, 0, 0], [0, 0, .2], .022, .028); ball(g, stdMat('#6a6f73'), .045, 0, 0, .23); parent.add(g); return g; };
  mic(alvin.handR); mic(brittany.handR);
  const gtr = guitar(); gtr.position.set(-.02, -.28, .33); gtr.rotation.set(0, 0, .45); simon.chest.add(gtr);
  for (const s of ['L', 'R']) { const st = new THREE.Group(); tube(st, stdMat('#d9b98a'), [0, 0, -.02], [0, 0, .34], .012, .009); theodore['hand' + s].add(st); }
  const kit = drumKit(); kit.scale.setScalar(scale); kit.position.set(KIT, STAGE + .6, -1.6); group.add(kit);
  Object.values(band).forEach(F => bake(F.root, bandMat)); bake(kit, kitM); bake(backline, kitM);
  const HOME = { alvin: [0, 7.5], simon: [-12, 3.5], brittany: [7.5, 7.5], jeanette: [12, 5.5], eleanor: [16.5, 3.5] }, WING = 27;
  alvin.root.position.set(...[HOME.alvin[0], STAGE, HOME.alvin[1]]); simon.root.position.set(HOME.simon[0], STAGE, HOME.simon[1]); simon.root.rotation.y = .2;
  theodore.root.position.set(KIT, STAGE + .6, -1.6 - .6 * scale);
  for (const id of ['brittany', 'jeanette', 'eleanor']) { band[id].root.position.set(WING, STAGE, HOME[id][1]); band[id].root.visible = false; }

  // ---- the screens either side, and a banner under the bandshell's outer arch
  let screenSong = '', screenSub = '';
  const scr = canvasTex(512, 288, (g, W, H) => {
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#1a0b1e'); gr.addColorStop(1, '#3a0c12'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.textAlign = 'center'; g.fillStyle = '#f6d23a'; g.font = 'bold 34px Arial Black, Arial, sans-serif'; g.fillText('ALVIN AND THE CHIPMUNKS', W / 2, 58, W - 30);
    g.fillStyle = '#ffffff'; g.font = 'bold 50px Arial, sans-serif'; g.fillText(screenSong, W / 2, 160, W - 40);
    g.fillStyle = '#ff5aa8'; g.font = 'italic bold 30px Arial, sans-serif'; g.fillText(screenSub, W / 2, 222, W - 40);
    g.fillStyle = 'rgba(255,255,255,.12)'; for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);   // scan lines
  });
  const scrM = new THREE.MeshBasicMaterial({ map: scr, toneMapped: false });
  for (const s of [-1, 1]) {   // in front of yardpark.js's screens (36 m out, 15 up, turned in by .35)
    const a = -s * .35, p = new THREE.Mesh(new THREE.PlaneGeometry(13.4, 7.5), scrM); p.position.set(s * 36 + Math.sin(a) * .27, 15, 4 + Math.cos(a) * .27); p.rotation.y = a; group.add(p);
  }
  const bannerT = canvasTex(1024, 128, (g, W, H) => {
    g.fillStyle = '#111014'; g.fillRect(0, 0, W, H); g.fillStyle = '#d21f2b'; g.fillRect(0, 0, W, 10); g.fillRect(0, H - 10, W, 10);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f6d23a'; g.font = 'bold 60px Arial Black, Arial, sans-serif'; g.fillText('ALVIN AND THE CHIPMUNKS', W / 2, 52, W - 40);
    g.fillStyle = '#ffffff'; g.font = 'bold 26px Arial, sans-serif'; g.fillText('LIVE AT THE RAILYARD BOWL  ·  ALL AGES  ·  NO REFUNDS', W / 2, 98, W - 40);
  });
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(26, 3.25), new THREE.MeshBasicMaterial({ map: bannerT, toneMapped: false })); banner.position.set(0, STAGE + 19.5, .6); group.add(banner);

  // ---------------------------------------------------------------- the crowd
  const r = rng(1977), spots = [];
  // what passes overhead, in the bowl's frame (segments [ax, az, bx, bz])
  bowl.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(bowl.matrixWorld).invert(), over = [];
  for (const l of avoid) {
    const pts = []; for (let i = 0; i < l.p.length; i += 2) pts.push(new THREE.Vector3(l.p[i] / 10, 0, l.p[i + 1] / 10).applyMatrix4(inv));
    for (let i = 0; i < pts.length - 1; i++) if (Math.hypot(pts[i].x, pts[i].z) < 140 || Math.hypot(pts[i + 1].x, pts[i + 1].z) < 140) over.push([pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z]);
  }
  const clear = (x, z) => over.every(([ax, az, bx, bz]) => {
    const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz, t = L ? clamp(((x - ax) * dx + (z - az) * dz) / L, 0, 1) : 0;
    return Math.hypot(ax + t * dx - x, az + t * dz - z) > 4.5;
  });
  // the pit: the lawn between the stage's apron (a half circle of 16 m round z = 11) and the first row
  const apronEdge = a => 11 * Math.cos(a) + Math.sqrt(121 * Math.cos(a) ** 2 + 135);
  for (let k = 0; k < 22; k++) { const a = (r() - .5) * 1.3, r0 = apronEdge(a) + 1.2, rr = r0 + r() * (29.4 - r0); spots.push({ x: Math.sin(a) * rr, z: Math.cos(a) * rr, y: 0, pit: true }); }
  // the rows (yardpark.js: a row every 1.1 m from 30 m out, its floor .045 m higher per metre; stand in the aisle part)
  for (let row = 0; row < 9; row++) {
    const rr = 30 + row * 1.1 + .85, y = .15 + row * 1.1 * .045;
    for (let a = -.62; a <= .62; a += .95 / rr) if (r() < .62 - row * .05 - Math.abs(a) * .25 && clear(Math.sin(a) * rr, Math.cos(a) * rr)) spots.push({ x: Math.sin(a + (r() - .5) * .01) * rr, z: Math.cos(a) * rr, y, row, ra: rr });
  }
  while (spots.length > MAX) spots.splice(22 + Math.floor(r() * (spots.length - 22)), 1);
  const HABITS = ['pogo', 'pogo', 'bang', 'bang', 'fist', 'fist', 'smoke', 'smoke', 'drink', 'drink', 'sway', 'khole'];
  const punks = spots.map((s, i) => {
    const rr = rng(i * 131 + 7), look = outfit(rr);
    const habit = s.pit ? (rr() < .8 ? 'mosh' : 'pogo') : HABITS[Math.floor(rr() * HABITS.length)];
    const smokeKind = rr() < .55 ? 'joint' : 'cig';
    const key = habit === 'smoke' ? (smokeKind === 'joint' ? 'puff' : 'cig') : habit === 'drink' ? 'beer' : habit === 'khole' ? 'khole' : ['ket', 'huff', 'pill', 'bump', 'puff', 'beer'][Math.floor(rr() * 6)];
    const prof = punkProfile(i, look, key);
    // four things to do: two drugs (their own first, if it is one) and two other things
    const ds = [], os = [];
    if (['puff', 'ket', 'huff', 'pill', 'bump'].includes(key)) ds.push(key); if (habit === 'khole') ds.push('ket');
    while (ds.length < 2) { const d = DRUGS[Math.floor(rr() * DRUGS.length)]; if (!ds.includes(d)) ds.push(d); }
    if (key === 'beer' || key === 'cig') os.push(key); if (s.pit) os.push('mosh');
    while (os.length < 2) { const o = OTHER[Math.floor(rr() * OTHER.length)]; if (!os.includes(o)) os.push(o); }
    const acts = [...ds, ...os].slice(0, 4).map((id, k) => ({ id, label: ACTS[id].label, key: String(k + 1) }));
    const F = rig(); F.root.scale.setScalar(prof.scale);
    const P = { i, ...s, x0: s.x, z0: s.z, y0: s.y, look, habit, prof, acts, F, ph: rr() * 6.28, amp: .7 + rr() * .5, prop: habit === 'smoke' ? smokeKind : habit === 'drink' ? 'can' : null,
      idleProp: habit === 'smoke' ? smokeKind : habit === 'drink' ? 'can' : null, cyc: rr() * 10, act: null, push: new THREE.Vector2(), vx: 0, vz: 0,
      fx: { high: 0, khole: habit === 'khole' ? 1e9 : 0, huff: 0, roll: 0, speed: 0, drunk: 0 }, bagK: 1, hideHead: false };
    P.h = Math.atan2(-P.x, 8 - P.z);   // facing the stage (Alvin)
    return P;
  });
  const N = punks.length;

  // instanced parts
  // lit by the spill off the stage in front of them (and the beams' rim from behind), dimmer than the band
  const PARTS = partList(), crowdMat = stageLit(new THREE.MeshStandardMaterial({ roughness: .8, emissive: '#ffeede', emissiveIntensity: 0 }), crowd); crowdMat.userData.lit = .5; litMats.push(crowdMat);
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0), ONE = new THREE.Matrix4(), col = new THREE.Color();
  for (const part of PARTS) {
    part.offs = Array.isArray(part.at) ? part.at : [part.at || ONE]; const n = part.offs.length;
    part.mesh = new THREE.InstancedMesh(part.geo, crowdMat, N * n); part.mesh.frustumCulled = false; part.mesh.castShadow = !!part.shadow; part.mesh.receiveShadow = true;
    part.on = new Uint8Array(N);
    punks.forEach((P, i) => {
      const c = part.col(P.look); part.on[i] = c ? 1 : 0;
      for (let k = 0; k < n; k++) { part.mesh.setColorAt(i * n + k, col.set(c || '#000000')); part.mesh.setMatrixAt(i * n + k, ZERO); }
    });
    if (!part.on.some(Boolean)) continue;
    group.add(part.mesh);
  }

  // ---- poses solved once on a bare skeleton: each hand to the mouth, the right to the nose, a
  // needle into the crook of the left arm
  const A = {};
  {
    const F = rig(); rest(F); F.root.updateMatrixWorld(true);
    const mouth = F.head.localToWorld(new THREE.Vector3(0, -.05, .14)), nose = F.head.localToWorld(new THREE.Vector3(0, -.005, .14));
    A.mouthR = reach(F.shR, F.elR, F.handR, mouth); A.mouthL = reach(F.shL, F.elL, F.handL, mouth); A.noseR = reach(F.shR, F.elR, F.handR, nose);
    A.injL = [-1.25, -.35, -.25]; setArm(F, 'L', A.injL); F.root.updateMatrixWorld(true);
    const crook = F.elL.localToWorld(new THREE.Vector3(.02, -.02, .05)); A.injR = reach(F.shR, F.elR, F.handR, crook);
    A.down = [.05, 0, -.15]; A.downR = [.05, 0, -.15]; A.fistR = [-2.8, -.2, -.25]; A.fistL = [-2.8, .2, -.25];
  }

  // ---- smoke, and a gob of spit
  const smoke = Array.from({ length: 70 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.spot, transparent: true, opacity: 0, depthWrite: false })); s.visible = false; group.add(s); return { s, life: 0, max: 1, v: new THREE.Vector3(), s0: 0, s1: 0, a: 0 }; });
  function puff(p, v, life, s0, s1, a) { const q = smoke.find(o => o.life <= 0); if (!q) return; q.s.position.copy(p); q.v.copy(v); q.life = q.max = life; q.s0 = s0; q.s1 = s1; q.a = a; q.s.visible = true; }
  const gob = new THREE.Mesh(new THREE.SphereGeometry(.03, 6, 5), new THREE.MeshBasicMaterial({ color: '#e8f0e8' })); gob.visible = false; group.add(gob);
  const spit = { t: -1, a: new THREE.Vector3(), b: new THREE.Vector3() };

  // ---------------------------------------------------------------- "Go to"
  // from the side of the rows, looking across the punks at Alvin (kept in world coordinates: update())
  const VIEW_POS = new THREE.Vector3(-21, 7.5, 37), VIEW_TGT = new THREE.Vector3(3, 2.2, 11);   // (from the side of the rows, in front of the viaduct over the seats)
  const view = { id: 'punks', name: 'Punk show at the Railyard Bowl', pos: new THREE.Vector3(), target: new THREE.Vector3(), abs: true, near: 8,
    when: { days: [0, 400], hours: [17, 24], day: 200, hour: 20.5 } };   // an evening show
  const placeView = () => { bowl.updateMatrixWorld(true); view.pos.copy(VIEW_POS); group.localToWorld(view.pos); view.target.copy(VIEW_TGT); group.localToWorld(view.target); };
  placeView();

  // ---------------------------------------------------------------- the show
  let clock = 0, inside = null, cam = null, baseFov = 0, filterNow = '', point = 0, pointAt = null;
  const look = { yaw: 0, pitch: 0 };
  /** where the set is: the song (or null between songs), how far into it, and the beat's phase */
  function song() {
    let t = clock % SET;
    for (const s of SONGS) { if (t < s.len) return { s, t, playing: true }; t -= s.len; if (t < GAP) return { s, t, playing: false }; t -= GAP; }
    return { s: SONGS[0], t: 0, playing: false };
  }
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), q = new THREE.Quaternion();

  function bandUpdate(dt, now) {
    const b = clock * BPM / 60 * Math.PI * 2, playing = now.playing, k = playing ? 1 : 0;
    // ---- Alvin: bouncing at the mic, the other fist pumping; between songs, arms up
    resetJoints(alvin);
    alvin.root.position.y = STAGE + (playing ? .1 * Math.abs(Math.sin(b / 2)) : 0) * scale;
    alvin.root.rotation.y = playing ? Math.sin(b / 8) * .35 : 0;
    alvin.shR.rotation.set(-1.25, 0, .55); alvin.elR.rotation.x = -1.55; alvin.head.rotation.x = playing ? -.12 + .08 * Math.sin(b) : 0;
    if (playing) { alvin.shL.rotation.set(-2.4 - .4 * Math.sin(b), 0, .25); alvin.elL.rotation.x = -.6; alvin.hipL.rotation.x = -.15 * Math.sin(b); alvin.hipR.rotation.x = .15 * Math.sin(b); }
    else { alvin.shL.rotation.set(-2.9, 0, .3); alvin.shR.rotation.set(-2.9, 0, -.3); alvin.elR.rotation.x = -.2; }
    if (point > 0 && pointAt) {   // somebody yelled his name: he turns and points at them
      point -= dt; const kk = smooth(Math.min(point, 4 - point) * 2);
      const want = Math.atan2(pointAt.x - alvin.root.position.x, pointAt.z - alvin.root.position.z);
      alvin.root.rotation.y += (want - alvin.root.rotation.y) * kk; alvin.shL.rotation.set(-1.5 * kk + alvin.shL.rotation.x * (1 - kk), 0, 0); alvin.elL.rotation.x = -.05;
      alvin.head.rotation.x = -.15 * kk;
    }
    // ---- Simon strums, his head nodding
    resetJoints(simon);
    simon.shL.rotation.set(-1.05, 0, -.55); simon.elL.rotation.x = -.85;
    simon.shR.rotation.set(-.55, 0, .7); simon.elR.rotation.x = -1.35 + (playing ? .22 * Math.sin(b * 2) : 0);
    simon.head.rotation.x = playing ? .12 + .1 * Math.sin(b) : .05; simon.chest.rotation.x = playing ? .05 : 0;
    // ---- Theodore on the kit: sitting, sticks going
    resetJoints(theodore);
    theodore.pelvis.position.y = .36; theodore.hipL.rotation.x = theodore.hipR.rotation.x = -1.45; theodore.kneeL.rotation.x = theodore.kneeR.rotation.x = 1.45;
    theodore.hipL.rotation.z = .15; theodore.hipR.rotation.z = -.15;
    const hit = playing ? Math.sin(b * 2) : 0;
    theodore.shL.rotation.set(-.85 + .3 * hit, 0, .2); theodore.shR.rotation.set(-.85 - .3 * hit, 0, -.2); theodore.elL.rotation.x = theodore.elR.rotation.x = -.95;
    theodore.head.rotation.x = playing ? .1 * Math.sin(b) : 0; theodore.kneeR.rotation.x = 1.45 + (playing ? .12 * Math.max(0, Math.sin(b)) : 0);
    // ---- the Chipettes: out from the wing for their songs, back off at the end
    const theirs = now.s.chipettes && playing, t = now.t;
    for (const [n, id] of [[0, 'brittany'], [1, 'jeanette'], [2, 'eleanor']]) {
      const F = band[id], [hx, hz] = HOME[id];
      const walkIn = theirs ? smooth((t - n * .5) / 4) : 0, walkOut = theirs ? smooth((t - (now.s.len - 5) - n * .4) / 4) : 1;
      const k2 = theirs ? walkIn * (1 - walkOut) : 0;
      F.root.visible = k2 > .001;
      if (!F.root.visible) continue;
      resetJoints(F);
      const moving = (walkIn > 0 && walkIn < 1) || (walkOut > 0 && walkOut < 1);
      F.root.position.set(WING + (hx - WING) * k2 + (moving ? 0 : .25 * Math.sin(b / 2 + n)), STAGE + (moving ? 0 : .05 * Math.abs(Math.sin(b))), hz);
      F.root.rotation.y = moving ? (walkOut > 0 ? Math.PI / 2 : -Math.PI / 2) : -.15;
      if (moving) { const s = Math.sin(clock * 9); F.hipL.rotation.x = s * .55; F.hipR.rotation.x = -s * .55; F.shL.rotation.x = -s * .4; F.shR.rotation.x = s * .4; }
      else {
        const up = Math.sin(b / 2 + n * 1.3);
        F.shL.rotation.set(-1.6 - 1.1 * Math.max(0, up), 0, .5); F.elL.rotation.x = -.4;
        if (id === 'brittany') { F.shR.rotation.set(-1.25, 0, .55); F.elR.rotation.x = -1.55; }
        else { F.shR.rotation.set(-1.6 - 1.1 * Math.max(0, -up), 0, -.5); F.elR.rotation.x = -.4; }
        F.hipL.rotation.x = -.2 * Math.max(0, Math.sin(b)); F.hipR.rotation.x = -.2 * Math.max(0, -Math.sin(b)); F.head.rotation.z = .12 * Math.sin(b / 2 + n);
      }
    }
    // ---- the screens: what's playing
    const name = playing ? `“${now.s.title}”` : 'ALVIN! ALVIN! ALVIN!', sub = now.s.chipettes && playing ? 'with THE CHIPETTES' : playing ? 'live at the Railyard Bowl' : 'thank you Philadelphia!';
    if (name !== screenSong || sub !== screenSub) { screenSong = name; screenSub = sub; scr.redraw(); }
  }

  // ---- each punk, every frame (near the bowl)
  function stand(P) {   // relaxed, a little bounce to the beat
    rest(P.F); setArm(P.F, 'L', A.down); setArm(P.F, 'R', A.downR);
  }
  function habitPose(P, b, playing) {
    const F = P.F;
    stand(P);
    if (P.fx.khole > 0 && !(P.act && P.act.id === 'surf')) {   // slumped: sitting on the seat, head down, arms hanging
      F.pelvis.position.y = .5; F.hipL.rotation.x = F.hipR.rotation.x = -1.45; F.kneeL.rotation.x = F.kneeR.rotation.x = 1.35;
      F.hipL.rotation.z = .12; F.hipR.rotation.z = -.12; F.chest.rotation.x = .55; F.head.rotation.set(.55, 0, .25 * Math.sin(clock * .3 + P.ph));
      setArm(F, 'L', [-.25, .15, -.2]); setArm(F, 'R', [-.25, -.15, -.2]);
      return;
    }
    if (!playing && !['smoke', 'drink'].includes(P.habit)) {   // between songs: arms up, yelling for more
      setArm(F, 'L', A.fistL); setArm(F, 'R', A.fistR); F.root.position.y += .06 * Math.abs(Math.sin(clock * 4 + P.ph)); return;
    }
    const jb = b + P.ph;
    switch (P.habit) {
      case 'pogo': {
        const up = Math.max(0, Math.sin(jb / 2)) ** .8; F.root.position.y += .3 * P.amp * up * P.prof.scale;
        F.kneeL.rotation.x = F.kneeR.rotation.x = .5 * (1 - up); F.hipL.rotation.x = F.hipR.rotation.x = -.25 * (1 - up);
        setArm(F, 'L', [-.3 - .4 * up, .25, -.7]); setArm(F, 'R', [-.3 - .4 * up, -.25, -.7]); F.head.rotation.x = -.15 * up; break;
      }
      case 'bang': {
        F.chest.rotation.x = .25 + .32 * Math.sin(jb); F.head.rotation.x = .3 * Math.sin(jb + .6); F.pelvis.rotation.x = .1; F.kneeL.rotation.x = F.kneeR.rotation.x = .15;
        setArm(F, 'L', [-.35, .15, -.5]); setArm(F, 'R', [-.35, -.15, -.5]); break;
      }
      case 'fist': {
        setArm(F, 'R', [-2.65 - .3 * Math.sin(jb), -.2, -.3 - .3 * (1 + Math.sin(jb)) / 2]); F.kneeL.rotation.x = F.kneeR.rotation.x = .12 * Math.abs(Math.sin(jb));
        F.head.rotation.x = -.2; F.root.position.y -= .02 * Math.abs(Math.sin(jb)); break;
      }
      case 'sway': {
        F.pelvis.rotation.z = .06 * Math.sin(jb / 4); F.chest.rotation.z = -.08 * Math.sin(jb / 4); setArm(F, 'L', [-.5, -.3, -1.9]); setArm(F, 'R', [-.5, .3, -1.9]); F.head.rotation.x = .08 * Math.sin(jb / 2); break;
      }
      case 'mosh': {
        pose(F, P.ph * 3 + clock * 7, 2.4); F.pelvis.position.y = .9; F.pelvis.rotation.x = .28;
        setArm(F, 'L', [-.6, .95, -1.3]); setArm(F, 'R', [-.6, -.95, -1.3]); F.chest.rotation.y = .5 * Math.sin(jb / 2); break;
      }
      case 'smoke': case 'drink': {   // a drag or a sip every so often
        P.cyc += 1 / 60; const L = P.habit === 'smoke' ? 11 : 15, c = (clock + P.ph * 3) % L, k = bell(c, .3, 2.6, .7);
        setArm(F, 'R', A.downR, A.mouthR, k); F.head.rotation.x = P.habit === 'drink' ? -.45 * bell(c, 1.2, 2.4, .4) : 0;
        F.pelvis.rotation.z = .04 * Math.sin(jb / 4);
        if (P.habit === 'smoke' && c > 3 && c < 3.6 && Math.random() < .5) breathe(P);
        break;
      }
      default: break;
    }
  }
  /** smoke out of the mouth, toward where they're facing */
  function breathe(P, big = 1) {
    const F = P.F; F.head.updateWorldMatrix(true, false); const m = F.head.localToWorld(tmp.set(0, -.05, .14));
    const fx = Math.sin(P.h), fz = Math.cos(P.h);
    puff(m.clone(), tmp2.set(fx * (.5 + Math.random() * .4) + (Math.random() - .5) * .15, .12 + Math.random() * .1, fz * (.5 + Math.random() * .4) + (Math.random() - .5) * .15), 1.6 + Math.random() * .6, .06 * big, .55 * big, .22);
  }

  // an action under way (P.act: { id, t }): the body
  function actPose(P, dt, b) {
    const F = P.F, a = P.act, t = a.t, id = a.id;
    switch (id) {
      case 'puff': case 'cig': {
        const k = bell(t, .2, 2.4, .9); setArm(F, 'R', A.downR, A.mouthR, k);
        if (t > 2.9 && t < 4 && (a.breath = (a.breath || 0) - dt) <= 0) { a.breath = .05; breathe(P, id === 'puff' ? 1.4 : 1); }
        if (t > .9 && t < 2.3 && id === 'puff' && Math.random() < .3) puff(F.handR.getWorldPosition(tmp).clone(), tmp2.set(0, .25, 0), 1.6, .02, .14, .3);
        break;
      }
      case 'beer': {
        const k = bell(t, .2, 3.6, .8); setArm(F, 'R', A.downR, A.mouthR, k); F.head.rotation.x = -.6 * bell(t, 1, 3.3, .5); F.chest.rotation.x = -.15 * bell(t, 1, 3.3, .5); break;
      }
      case 'ket': {
        const k = bell(t, .1, 3.8, 1); setArm(F, 'L', A.down, A.injL, k); setArm(F, 'R', A.downR, A.injR, k); F.head.rotation.x = .35 * k; break;
      }
      case 'huff': {
        const k = bell(t, .1, 3.5, .7); setArm(F, 'R', A.downR, A.mouthR, k); setArm(F, 'L', A.down, A.mouthL, k * .9);
        P.bagK = 1 + .25 * Math.sin(t * 5) * k; break;
      }
      case 'pill': { const k = bell(t, .1, 1.5, .5); setArm(F, 'R', A.downR, A.mouthR, k); F.head.rotation.x = -.35 * bell(t, 1, 1.9, .3); break; }
      case 'bump': { const k = bell(t, .1, 1.7, .5); setArm(F, 'R', A.downR, A.noseR, k); F.head.rotation.x = -.2 * bell(t, 1.1, 1.7, .2) + .15 * bell(t, .6, 1.2, .2); break; }
      case 'pogo': {
        const up = Math.max(0, Math.sin(t * 7)) ** .8; F.root.position.y += .42 * up * P.prof.scale; F.kneeL.rotation.x = F.kneeR.rotation.x = .55 * (1 - up);
        setArm(F, 'L', A.fistL); setArm(F, 'R', [-.4, -.3, -.8]); break;
      }
      case 'mosh': {
        pose(F, t * 9, 3); F.pelvis.rotation.x = .3; setArm(F, 'L', [-.8, 1, -1.2]); setArm(F, 'R', [-.8, -1, -1.2]); F.chest.rotation.y = .6 * Math.sin(t * 4);
        const fx = Math.sin(P.h + .8 * Math.sin(t * 1.3)), fz = Math.cos(P.h + .8 * Math.sin(t * 1.3)); a.dx = (a.dx || 0) + fx * dt * 1.2; a.dz = (a.dz || 0) + fz * dt * 1.2;
        // shove whoever's in the way
        for (const Q of punks) { if (Q === P) continue; const dx = Q.x - (P.x0 + a.dx), dz = Q.z - (P.z0 + a.dz), d = Math.hypot(dx, dz); if (d < 1.1 && d > .01) Q.push.set(Q.push.x + dx / d * dt * 4, Q.push.y + dz / d * dt * 4); }
        break;
      }
      case 'surf': {   // lifted up and passed toward the stage on everybody's hands, then back
        const k = smooth(t / 1.5) * (1 - smooth((t - 12.5) / 1.5)), go = Math.sin(clamp((t - 1.5) / 11, 0, 1) * Math.PI);
        F.root.position.y += 1.85 * k; F.pelvis.rotation.x = -1.5 * k; F.pelvis.position.y = .92 - .4 * k + .05 * Math.sin(t * 3);
        setArm(F, 'L', [-.3 * k, 1.3 * k, -.2]); setArm(F, 'R', [-.3 * k, -1.3 * k, -.2]);
        const reachR = Math.max(0, Math.hypot(P.x0, P.z0) - 27.5); a.dx = -Math.sin(Math.atan2(P.x0, P.z0)) * reachR * go; a.dz = -Math.cos(Math.atan2(P.x0, P.z0)) * reachR * go;
        break;
      }
      case 'spit': {
        F.head.rotation.x = -.25 * bell(t, .1, .5, .2) + .3 * bell(t, .5, .9, .15); F.chest.rotation.x = .2 * bell(t, .4, .9, .2);
        if (t > .55 && !a.fired) { a.fired = true; F.head.updateWorldMatrix(true, false); spit.a.copy(F.head.localToWorld(tmp.set(0, -.05, .13))); spit.b.set((Math.random() - .5) * 6, STAGE + .3, 9 + Math.random() * 2); spit.t = 0; }
        break;
      }
      case 'yell': { setArm(F, 'L', A.fistL); setArm(F, 'R', A.fistR); F.head.rotation.x = -.35 * bell(t, .1, 2.3, .3); break; }
      default: break;
    }
  }
  function startAct(P, id) {
    if (P.act || !ACTS[id]) return false;
    if (P.fx.khole > 0 && id !== 'ket') return false;   // can't do much from in there
    P.act = { id, t: 0 }; P.prop = ACTS[id].prop || P.prop;
    if (id === 'pill' || id === 'bump') P.prop = null;
    if (id === 'yell') { point = 4; P.F.root.updateWorldMatrix(true, false); pointAt = new THREE.Vector3(P.x, 0, P.z); }
    return true;
  }
  function endAct(P) {
    const id = P.act.id, fx = P.fx; P.act = null; P.prop = P.idleProp; P.bagK = 1;
    if (id === 'puff') fx.high = Math.min(120, fx.high + 40);
    if (id === 'ket') fx.khole = KHOLE;
    if (id === 'huff') fx.huff = 16;
    if (id === 'pill') fx.roll = ROLL;
    if (id === 'bump') fx.speed = 30;
    if (id === 'beer') fx.drunk = Math.min(8, fx.drunk + 1);
  }

  const near = () => cam && cam.position.distanceToSquared(group.getWorldPosition(tmp)) < NEAR * NEAR;
  let placed = false;
  function update(dt, camera) {
    cam = camera; clock += dt;
    if (!placed) { placed = true; placeView(); stage.stageKey.value.copy(KEY).transformDirection(group.matrixWorld); crowd.stageKey.value.copy(CROWD_KEY).transformDirection(group.matrixWorld); }   // (once the deck has been set on the ground: index.js)
    const isNear = !!inside || near(); group.visible = isNear;
    if (!isNear) return;
    const now = song(), b = clock * BPM / 60 * Math.PI * 2;
    bandUpdate(dt, now);
    // the punks
    for (const P of punks) {
      const F = P.F, fx = P.fx;
      for (const k of ['high', 'huff', 'speed']) fx[k] = Math.max(0, fx[k] - dt);
      if (fx.khole < 1e8) fx.khole = Math.max(0, fx.khole - dt);
      fx.roll = Math.max(0, fx.roll - dt); fx.drunk = Math.max(0, fx.drunk - dt / 60);
      // moshers wander the pit
      if (P.habit === 'mosh' && !P.act && now.playing && P !== inside) {
        P.vx += (Math.random() - .5) * dt * 6; P.vz += (Math.random() - .5) * dt * 6; P.vx *= 1 - dt * .8; P.vz *= 1 - dt * .8;
        P.x0 += P.vx * dt; P.z0 += P.vz * dt;
        const a = Math.atan2(P.x0, P.z0), rr = Math.hypot(P.x0, P.z0), lo = apronEdge(a) + 1, hi = 29.4, ac = clamp(a, -.65, .65), rc = clamp(rr, lo, hi);
        if (ac !== a || rc !== rr) { P.x0 = Math.sin(ac) * rc; P.z0 = Math.cos(ac) * rc; P.vx *= -.5; P.vz *= -.5; }
        if (Math.hypot(P.vx, P.vz) > .2) P.h = Math.atan2(P.vx, P.vz);
      }
      P.push.multiplyScalar(Math.exp(-dt * 2.5));
      P.x = P.x0 + P.push.x + (P.act && P.act.dx || 0); P.z = P.z0 + P.push.y + (P.act && P.act.dz || 0);
      if (P.act && P.act.id === 'surf') { const rr = Math.hypot(P.x, P.z); P.y = rr < 30 ? 0 : .15 + Math.floor((rr - 30) / 1.1) * 1.1 * .045; } else P.y = P.y0;
      F.root.position.set(P.x, P.y, P.z); F.root.rotation.set(0, P.h, 0);
      if (P.act) { stand(P); actPose(P, dt, b); P.act.t += dt; if (P.act.t >= ACTS[P.act.id].dur) endAct(P); }
      else {
        // by themselves, now and then, they do one of their own things
        habitPose(P, b, now.playing);
        if (P !== inside && P.fx.khole === 0 && Math.random() < dt / 45) { const pick = P.acts[Math.floor(Math.random() * P.acts.length)].id; if (!['surf', 'yell', 'ket', 'spit'].includes(pick) || Math.random() < .25) startAct(P, pick); }
      }
      // embers on the joints and cigarettes
      if ((P.prop === 'joint' || P.prop === 'cig') && Math.random() < dt * 3) puff(F.handR.getWorldPosition(tmp).clone().add(tmp2.set(0, .03, 0)), tmp2.set((Math.random() - .5) * .05, .2, (Math.random() - .5) * .05), 2, .02, .16, .25);
      P.hideHead = P === inside && kholeK(P) < .35;
    }
    // copy every joint into the parts
    const jm = new THREE.Matrix4(), m = new THREE.Matrix4();
    for (const P of punks) P.F.root.updateMatrixWorld(true);
    for (const part of PARTS) {
      if (!part.mesh.parent) continue;
      const n = part.offs.length, im = part.mesh;
      for (let i = 0; i < N; i++) {
        const P = punks[i];
        let show = part.on[i] && (!part.head || !P.hideHead) && (!part.dyn || part.dyn(P));
        if (!show) { for (let k = 0; k < n; k++) im.setMatrixAt(i * n + k, ZERO); continue; }
        jm.copy(P.F[part.joint].matrixWorld);
        for (let k = 0; k < n; k++) { m.multiplyMatrices(jm, part.offs[k]); if (part.scale) m.scale(tmp.setScalar(part.scale(P))); im.setMatrixAt(i * n + k, m); }
      }
      im.instanceMatrix.needsUpdate = true;
    }
    // smoke and spit
    const grey = .3 + .6 * (1 - night());
    for (const p of smoke) {
      if (p.life <= 0) continue;
      p.life -= dt; if (p.life <= 0) { p.s.visible = false; continue; }
      const k = 1 - p.life / p.max; p.s.position.addScaledVector(p.v, dt); p.v.multiplyScalar(1 - dt * .9); p.v.y += dt * .12;
      p.s.scale.setScalar(p.s0 + (p.s1 - p.s0) * k); p.s.material.opacity = p.a * (1 - k) * Math.min(1, k * 8); p.s.material.color.setScalar(grey);
    }
    if (spit.t >= 0) { spit.t += dt / .9; gob.visible = spit.t < 1; gob.position.lerpVectors(spit.a, spit.b, spit.t); gob.position.y += Math.sin(spit.t * Math.PI) * 1.4; if (spit.t >= 1) spit.t = -1; }
    if (inside) effects(dt);
  }

  // ---------------------------------------------------------------- being one of them
  const kholeK = P => (P.fx.khole > 0 && P.fx.khole < 1e8 ? smooth((KHOLE - P.fx.khole) / 4) * smooth(P.fx.khole / 5) : 0);
  const sway = { yaw: 0, pitch: 0, roll: 0, fov: 1, oob: 0 };
  function effects() {
    const P = inside, f = P.fx, t = clock;
    const kH = Math.min(1, f.high / 30), kHu = Math.min(1, f.huff / 8), kK = kholeK(P), kS = Math.min(1, f.speed / 6), kD = Math.min(1, f.drunk / 5);
    const kR = smooth((ROLL - f.roll - 5) / 8) * smooth(f.roll / 8);
    const mosh = P.act && P.act.id === 'mosh' ? 1 : 0;
    sway.yaw = .05 * kH * Math.sin(t * .3) + .04 * kD * Math.sin(t * .5) + .015 * kS * (Math.random() - .5) + .04 * mosh * (Math.random() - .5);
    sway.pitch = .03 * kH * Math.sin(t * .23) + .05 * kHu * Math.sin(t * 3.1) + .015 * kS * (Math.random() - .5) + .04 * mosh * (Math.random() - .5);
    sway.roll = .1 * kD * Math.sin(t * .7) + .08 * kHu * Math.sin(t * 4.3) + .04 * kR * Math.sin(t * .9) + .1 * kK * Math.sin(t * .2);
    sway.fov = 1 + .18 * kK + .1 * kHu - .06 * kS; sway.oob = kK;
    const parts = [];
    const blur = .5 * kH + 2.2 * kHu + 1.1 * kK + .5 * kD;
    const sat = 1 + .35 * kH + 1 * kR + .3 * kS - .55 * kK, con = 1 - .05 * kH + .28 * kS - .22 * kK, bri = 1 + .55 * kHu + .06 * kR;
    if (blur > .02) parts.push(`blur(${blur.toFixed(2)}px)`);
    if (Math.abs(sat - 1) > .01) parts.push(`saturate(${sat.toFixed(2)})`);
    if (Math.abs(con - 1) > .01) parts.push(`contrast(${con.toFixed(2)})`);
    if (Math.abs(bri - 1) > .01) parts.push(`brightness(${bri.toFixed(2)})`);
    if (kR > .01) parts.push(`hue-rotate(${Math.round(kR * ((t * 45) % 360))}deg)`);
    if (kH > .01) parts.push(`sepia(${(.18 * kH).toFixed(2)})`);
    setFilter(parts.join(' '));
  }
  function setFilter(s) { if (!canvas || s === filterNow) return; filterNow = s; canvas.style.filter = s; }

  const eye = new THREE.Vector3(), fwd = new THREE.Vector3(), up = new THREE.Vector3();
  function frame(camera) {
    const P = inside; if (!P) return;
    group.updateWorldMatrix(true, false); P.F.root.updateMatrixWorld(true);
    // (the skeleton is in the bowl's frame: into the world)
    group.localToWorld(eye.copy(P.F.head.localToWorld(tmp.set(0, .04, .1))));
    const surfing = P.act && P.act.id === 'surf' ? smooth(P.act.t / 1.5) * (1 - smooth((P.act.t - 12.5) / 1.5)) : 0;
    const yaw = P.h + look.yaw + sway.yaw, pitch = clamp(look.pitch + sway.pitch + .95 * surfing, -1.4, 1.45);
    fwd.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).transformDirection(group.matrixWorld);
    if (sway.oob > .01) {   // out of the body: float up and back, looking down at yourself
      const k = sway.oob, back = tmp2.set(-Math.sin(P.h), 0, -Math.cos(P.h)).transformDirection(group.matrixWorld);
      const self = group.localToWorld(P.F.head.localToWorld(tmp.set(0, 0, 0)));
      camera.position.copy(eye).addScaledVector(back, 2.4 * k).add(up.set(0, 3.2 * k, 0));
      camera.position.x += Math.sin(clock * .15) * .8 * k; camera.position.z += Math.cos(clock * .15) * .8 * k;
      const aim = eye.clone().add(fwd).lerp(self, k);
      camera.up.set(0, 1, 0); camera.lookAt(aim);
    } else { camera.position.copy(eye); camera.up.set(0, 1, 0); camera.lookAt(eye.x + fwd.x, eye.y + fwd.y, eye.z + fwd.z); }
    camera.rotateZ(sway.roll);
    if (!baseFov) baseFov = camera.fov;
    const fov = baseFov * sway.fov; if (Math.abs(camera.fov - fov) > .01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }
  const lookAt = (dx, dy) => { look.yaw = clamp(look.yaw - dx * .0045, -2.4, 2.4); look.pitch = clamp(look.pitch - dy * .0045, -1.2, 1.2); };

  const pv = new THREE.Vector3();
  function pick(camera, x, y, w, h) {
    if (!group.visible) return null;
    const f = h / (2 * Math.tan(camera.fov * Math.PI / 360)), cp = camera.position; let best = null;
    for (const P of punks) {
      if (P === inside) continue;
      group.localToWorld(P.F.chest.getWorldPosition(pv));
      const dist = pv.distanceTo(cp); if (dist > 260) continue;
      pv.project(camera); if (pv.z > 1) continue;
      const d = Math.hypot((pv.x + 1) / 2 * w - x, (1 - pv.y) / 2 * h - y), tol = Math.max(9, f * .4 / dist);
      if (d < tol && (!best || d / tol < best.r)) best = { punk: P.i, r: d / tol };
    }
    return best && { punk: best.punk };
  }
  function inhabit(i) {
    const P = punks[i]; if (!P) return null;
    if (inside && inside !== P) leave();
    inside = P; look.yaw = 0; look.pitch = 0; baseFov = cam ? cam.fov : 0;
    if (P.fx.khole > 1e8) P.fx.khole = 9;
    P.h = Math.atan2(-P.x0, 8 - P.z0);   // facing the band   // the one slumped on the steps: you come round in a few seconds
    return getInhabited();
  }
  function leave() {
    if (!inside) return null;
    const P = inside; inside = null; P.hideHead = false; setFilter('');
    if (cam && baseFov) { cam.fov = baseFov; cam.updateProjectionMatrix(); } baseFov = 0;
    const p = group.localToWorld(new THREE.Vector3(P.x, P.y, P.z)), dir = new THREE.Vector3(Math.sin(P.h), 0, Math.cos(P.h)).transformDirection(group.matrixWorld);
    return { p, dir, cam: p.clone().addScaledVector(dir, -14).add(new THREE.Vector3(0, 8, 0)) };
  }
  function activity(P) {
    const f = P.fx, now = song(), tune = now.playing ? `“${now.s.title}”` : 'the break between songs';
    if (P.act) {
      const t = P.act.t;
      return { puff: 'Taking a long puff off the joint', cig: 'Lighting a cigarette off a stranger’s', ket: t < 3 ? 'Finding a vein in the crook of the elbow' : 'Pushing the plunger', huff: 'Huffing glue out of a paper bag',
        pill: 'Washing a pill down with somebody else’s beer', bump: 'Doing a bump off a house key', beer: 'Shotgunning a tallboy', pogo: `Pogoing to ${tune}`, mosh: 'Throwing elbows in the pit',
        surf: t < 7 ? 'Crowd surfing toward the stage' : 'Getting passed back over everybody’s heads', spit: 'Spitting at the stage', yell: 'Screaming “ALVIN!” at the top of their lungs' }[P.act.id];
    }
    if (point > 0 && pointAt && P === inside) return 'Alvin is pointing right at you';
    if (f.khole > 0) return f.khole > 1e8 ? 'Slumped on the steps, deep in a K-hole' : 'In a K-hole, watching yourself from somewhere above';
    if (f.roll > 0 && f.roll < ROLL - 5) return `Rolling: ${tune} has never sounded this good`;
    if (f.huff > 0) return 'Seeing double after the glue';
    if (f.speed > 0) return 'Wired, grinding teeth, explaining Simon’s guitar tone to a stranger';
    if (f.high > 0) return `Stoned, swaying to ${tune}`;
    if (f.drunk >= 3) return `${Math.round(f.drunk)} beers deep, singing along to ${tune}`;
    if (point > 0 && pointAt && P === inside) return 'Alvin is pointing right at you';
    return now.playing ? { pogo: `Pogoing to ${tune}`, bang: `Headbanging to ${tune}`, fist: `Fist in the air for ${tune}`, mosh: `In the pit for ${tune}`, smoke: `Smoking and nodding along to ${tune}`, drink: `Drinking and yelling along to ${tune}`, sway: `Arms folded, nodding along to ${tune}`, khole: '' }[P.habit] || `Watching ${tune}`
      : 'Yelling for the next song';
  }
  function getInhabited() {
    if (!inside) return null;
    const P = inside, p = P.prof, busy = !!P.act;
    const actions = P.acts.map(a => ({ ...a, on: busy && P.act.id === a.id }));
    return { kind: 'person', id: 'punk' + P.i, name: p.name, sex: p.sex, age: p.age, height: p.height, kg: p.kg, lb: p.lb, bio: p.bio, now: activity(P), actions, portrait: () => portrait(P),
      hint: `At the Alvin and the Chipmunks show in the Railyard Bowl, through ${p.name.replace(/ “.*” /, ' ')}’s eyes. Drag or click to look around; ${P.acts.map(a => `${a.key} ${a.label.replace(/“|”/g, '')}`).join(', ')}. Space, Esc or “Leave” to step out.`,
      hintTouch: `At the Alvin and the Chipmunks show, through ${p.name.replace(/ “.*” /, ' ')}’s eyes. Tap a button below to ${P.acts.map(a => a.label.charAt(0).toLowerCase() + a.label.slice(1)).join(', ')}. Drag to look around; “Leave” to step out.` };
  }
  const act = id => (inside ? startAct(inside, id) : false);

  // a head-and-shoulders portrait for the card: the same parts on a bare skeleton, facing the camera
  let pr = null;
  function portrait(P, size = 176) {
    if (!pr) {
      const c = document.createElement('canvas'), renderer = makeRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      const sc = new THREE.Scene(), pc = new THREE.PerspectiveCamera(28, 1, .05, 10);
      sc.add(new THREE.HemisphereLight('#fff4e6', '#4a5560', .85 * LIGHT)); const key = new THREE.DirectionalLight('#ffffff', .75 * LIGHT); key.position.set(.6, 1.2, 1.4); sc.add(key);
      pr = { c, renderer, sc, pc, bust: null, for: -1 };
    }
    if (pr.for === P.i) return pr.c;
    pr.renderer.setSize(size, size, false);
    if (pr.bust) { pr.sc.remove(pr.bust); pr.bust.traverse(o => { if (o.material) o.material.dispose(); }); }
    const F = rig(); rest(F); F.root.updateMatrixWorld(true); const bust = new THREE.Group();
    for (const part of PARTS) {
      const c = part.col(P.look); if (!c || part.dyn) continue;
      for (const off of part.offs) { const o = new THREE.Mesh(part.geo, new THREE.MeshStandardMaterial({ color: c, roughness: .8 })); o.matrixAutoUpdate = false; o.matrix.multiplyMatrices(F[part.joint].matrixWorld, off); bust.add(o); }
    }
    pr.sc.add(bust); pr.bust = bust; pr.for = P.i;
    const hd = F.head.getWorldPosition(new THREE.Vector3()); pr.pc.position.set(hd.x + .06, hd.y + .02, hd.z + .82); pr.pc.lookAt(hd.x, hd.y - .08, hd.z);
    pr.renderer.render(pr.sc, pr.pc);
    return pr.c;
  }

  return { view, update, frame, lookAt, pick, inhabit, leave, act, getInhabited, on: () => !!inside, punks, band, song };
}
