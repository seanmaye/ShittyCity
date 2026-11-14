// The loading screens: while a city loads, a slideshow of its points of interest, each a frame
// captured from the city's own 3D model (tools/loading/capture.py) with one of our jointed
// figures (scene/phl/people.js) striking a pose in front of it. The look follows the big
// open-world game loading screens: the frame drifts slowly, the figure drifts the other way,
// and each new screen slides in as a slanted panel with a white flash.
//
// The figures are rendered here, once per screen, into an image: toon shading, ink outlines,
// a low camera. Everything that moves is a transform or opacity animated with the Web
// Animations API, so it keeps running on the compositor while the city parses its data and the
// page's own code can't run. Nothing else may be animated (clip-path, colours, filters): those
// need the main thread, and froze half-way through a transition while a city loaded.
// Each city lists its screens in js/cities.js (loadingScreens).
import * as THREE from 'three';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import { makeFigure, pose as runPose } from './scene/phl/people.js';
import { makeRenderer, LIGHT } from './three-setup.js';

const HOLD = 4000;   // ms a screen stays before the next one comes in
const IN = 1700;     // the new panel's slide
// the slow drift, per second on screen: the frame pans (% of its width) and pushes in, the figure
// drifts the other way (vw). A fixed speed, so changing HOLD changes how far it goes, not how fast.
const PAN = .44, PUSH = .005, SWAY = .32;
const EASE = 'cubic-bezier(.65, 0, .35, 1)';
// the slanted panel a new screen arrives in: a window skewed this much, starting this far off
// to the side, while the picture inside is moved back by the exact inverse so it stays put
// A screen is a window a little wider than the viewport (EDGE vw spare each side, see .ls-screen in
// the CSS), skewed into the slanted panel it slides in as. Its slant uses just that spare width, so the
// window always covers the screen: about 10 degrees on a laptop, nearly upright on a phone. (Firefox
// only runs an animation off the page's main thread for elements up to ~1.125x the viewport; a wider
// window stuttered there while a city loaded.)
const EDGE = 5;
const slant = () => -Math.atan(EDGE / 50 * innerWidth / innerHeight) * 180 / Math.PI;   // degrees
/** how far (vw) the panel starts off to the side: its slanted edge's nearest corner just off screen */
const offset = () => 100 + 2 * EDGE + 1;

// ---- the figures --------------------------------------------------------------------------

// outfits: makeFigure colours, plus sunglasses and a cap (its colour) if any; a mohawk (its colour),
// a spiked collar, and legs (trousers down to the boots) for the punk
const OUTFITS = {
  tee:     { shirt: '#f2f2ee', shorts: '#2f4a6b', skin: '#b07a55', shoe: '#e6e6e6', hair: '#1d1410', shades: true },
  red:     { shirt: '#8c2f2f', shorts: '#1b1f27', skin: '#e0b48f', shoe: '#222222', hair: '#3a2a20', shades: true, cap: '#1f2a33' },
  green:   { shirt: '#3d6b4a', shorts: '#c9bfa8', skin: '#8d5a3c', shoe: '#f2f2ee', hair: '#1d1410', shades: true },
  black:   { shirt: '#1f2a33', shorts: '#2e3542', skin: '#f0c9a6', shoe: '#8c2f2f', hair: '#a07a4a', shades: true },
  yellow:  { shirt: '#d9b44a', shorts: '#3a4a5a', skin: '#6b4430', shoe: '#222222', hair: '#1d1410', shades: true, cap: '#d6452f' },
  denim:   { shirt: '#4a6b8c', shorts: '#2a2a2a', skin: '#c99370', shoe: '#e6e6e6', hair: '#6b4a2b', shades: true },
  flannel: { shirt: '#a3243f', shorts: '#3a4a5a', skin: '#e0b48f', shoe: '#5a3a2a', hair: '#6b4a2b', shades: true, cap: '#3d4a2a' },
  blaze:   { shirt: '#5a5a3a', shorts: '#4a4a3a', skin: '#c99370', shoe: '#5a3a2a', hair: '#3a2a20', shades: true, cap: '#ff6a1a' },
  // the Railyard Bowl's punks (scene/phl/concert.js): leather, red plaid, a green mohawk and a spiked collar
  punk:    { shirt: '#17171a', shorts: '#a3161f', skin: '#f0c9a6', shoe: '#121212', hair: '#1d1410', shades: true, mohawk: '#5dff3a', collar: true, legs: '#a3161f' },
};

// poses: joint angles on a makeFigure (people.js: rotate .x to swing forward, .z out to the side)
const POSES = {
  // power stance, fists on hips, chin up
  akimbo(F) {
    F.root.rotation.y = -.42;
    F.hipL.rotation.z = .2; F.hipR.rotation.z = -.2;
    F.kneeL.rotation.z = -.08; F.kneeR.rotation.z = .08;
    F.shL.rotation.set(.18, 0, .78); F.elL.rotation.set(0, 0, -1.8);
    F.shR.rotation.set(.18, 0, -.78); F.elR.rotation.set(0, 0, 1.8);
    F.chest.rotation.set(-.06, .12, 0);
    F.head.rotation.set(-.14, .35, 0);
  },
  // hand behind the head, the other arm pointing across the frame
  point(F) {
    F.root.rotation.y = .3;
    F.pelvis.rotation.z = .06;
    F.hipL.rotation.set(-.08, 0, .1); F.hipR.rotation.set(-.3, 0, -.16); F.kneeR.rotation.x = .5;
    F.shL.rotation.set(-.35, 0, 1.5); F.elL.rotation.set(0, 0, .1);
    F.shR.rotation.set(.4, 0, -2.35); F.elR.rotation.set(0, 0, -1.95);
    F.chest.rotation.set(.04, .12, .04);
    F.head.rotation.set(-.04, .45, -.06);
  },
  // a double biceps flex
  flex(F) {
    F.root.rotation.y = -.25;
    F.hipL.rotation.z = .22; F.hipR.rotation.z = -.22;
    F.kneeL.rotation.z = -.1; F.kneeR.rotation.z = .1;
    F.shL.rotation.set(0, 0, 1.45); F.elL.rotation.set(0, 0, 1.75);
    F.shR.rotation.set(0, 0, -1.45); F.elR.rotation.set(0, 0, -1.75);
    F.chest.rotation.set(-.08, 0, 0);
    F.head.rotation.set(-.12, .25, 0);
  },
  // one hand up in a wave, the other on the hip
  wave(F) {
    F.root.rotation.y = .32;
    F.pelvis.rotation.z = -.05;
    F.hipL.rotation.set(-.25, 0, .12); F.kneeL.rotation.x = .4; F.hipR.rotation.z = -.06;
    F.shL.rotation.set(-.1, 0, 2.55); F.elL.rotation.set(0, 0, .45);
    F.shR.rotation.set(.18, 0, -.78); F.elR.rotation.set(0, 0, 1.8);
    F.chest.rotation.set(0, .1, .05);
    F.head.rotation.set(-.08, .3, .12);
  },
  // mid-stride, walking at the camera
  strut(F) {
    F.root.rotation.y = -.3;
    runPose(F, 1.15, 2.2);
    F.pelvis.rotation.x = 0; F.pelvis.position.y = .92;
    F.shL.rotation.z = .12; F.shR.rotation.z = -.12;
    F.head.rotation.set(-.1, .3, 0);
  },
  // a fist in the air, the other hand on the hip
  rock(F) {
    F.root.rotation.y = -.3;
    F.hipL.rotation.z = .2; F.hipR.rotation.z = -.2; F.kneeL.rotation.z = -.08; F.kneeR.rotation.z = .08;
    F.shR.rotation.set(-.15, 0, -2.75); F.elR.rotation.set(0, 0, -.3);
    F.shL.rotation.set(.18, 0, .78); F.elL.rotation.set(0, 0, -1.8);
    F.chest.rotation.set(-.1, .12, 0);
    F.head.rotation.set(-.28, .3, 0);
  },
  // arms folded across the chest
  folded(F) {
    F.root.rotation.y = .36;
    F.hipL.rotation.z = .16; F.hipR.rotation.z = -.16;
    for (const [s, k] of [['L', 1], ['R', -1]]) {
      F['sh' + s].rotation.set(-.42, 0, k * .26, 'XZY');
      F['el' + s].rotation.set(-1.62, k * -1.1, 0, 'YXZ');
    }
    F.elR.position.z += .03;   // the right forearm over the left
    F.chest.rotation.set(-.05, -.1, 0);
    F.head.rotation.set(-.16, -.2, 0);
  },
};

let toonRamp = null;
function ramp() {
  if (toonRamp) return toonRamp;
  const t = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
  return (toonRamp = t);
}
const toon = color => new THREE.MeshToonMaterial({ color, gradientMap: ramp() });

function dress(F, o) {
  F.root.traverse(m => { if (m.isMesh) m.material = toon(m.material.color.clone()); });
  const nose = new THREE.Mesh(new THREE.BoxGeometry(.03, .045, .04), F.head.material);
  nose.position.set(0, -.05, .11); F.head.add(nose);
  if (o.shades) {
    const m = toon('#0c0c10'), lens = new THREE.Mesh(new THREE.BoxGeometry(.2, .05, .05), m);
    lens.position.set(0, -.012, .1); F.head.add(lens);
    for (const s of [1, -1]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(.012, .012, .16), m); arm.position.set(s * .108, -.005, .03); F.head.add(arm); }
  }
  if (o.mohawk) {   // the hair shaved off, a fin down the middle; a spiked collar
    F.head.children[0].visible = false;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(.045, .2, .27), toon(o.mohawk)); fin.position.set(0, .16, -.02); F.head.add(fin);
  }
  if (o.legs) for (const s of ['L', 'R']) F['knee' + s].children[0].material = toon(o.legs);   // trousers, not shorts
  if (o.collar) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(.06, .016, 6, 16), toon('#0c0c10')); band.rotation.x = Math.PI / 2; band.position.y = .05; F.chest.add(band);
    for (let k = 0; k < 7; k++) {
      const a = -1.3 + k * .43, d = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), sp = new THREE.Mesh(new THREE.ConeGeometry(.011, .04, 5), toon('#e6e8ea'));
      sp.position.copy(d).multiplyScalar(.074).setY(.05); sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); F.chest.add(sp);
    }
  }
  if (o.cap) {
    const m = toon(o.cap);
    F.head.children[0].visible = false;   // the hair
    const crown = new THREE.Mesh(new THREE.SphereGeometry(.122, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), m);
    crown.position.y = .02; F.head.add(crown);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(.11, .11, .015, 16, 1, false, -Math.PI / 2, Math.PI), m);
    brim.scale.set(1, 1, 1.4); brim.position.set(0, .03, .07); F.head.add(brim);
  }
}

/**
 * The figure as a sticker: a thick white outline and a hard drop shadow drawn into the image, as a
 * PNG data URL. (Drawn once here rather than as CSS filters, which the browser re-applies on every
 * frame the figure moves: that made Philadelphia take half as long again to load.)
 */
function sticker(src, edge = 11, shadow = [30, 39]) {
  const w = src.width, h = src.height;
  const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
  const tint = (color, alpha = 1) => {   // the figure's silhouette in one colour
    const [c, x] = mk(); x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in';
    x.globalAlpha = alpha; x.fillStyle = color; x.fillRect(0, 0, w, h); return c;
  };
  const white = tint('#fff'), dark = tint('#000'), [out, x] = mk();
  // the shadow falls from the outlined shape: the dark silhouette, spread like the outline, offset
  for (let a = 0; a < 16; a++) x.drawImage(dark, shadow[0] + Math.cos(a * Math.PI / 8) * edge, shadow[1] + Math.sin(a * Math.PI / 8) * edge);
  x.globalCompositeOperation = 'copy'; x.globalAlpha = .45;   // flatten the overlapping copies to one even shade
  x.drawImage(out, 0, 0);
  x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
  for (let a = 0; a < 16; a++) x.drawImage(white, Math.cos(a * Math.PI / 8) * edge, Math.sin(a * Math.PI / 8) * edge);
  x.drawImage(src, 0, 0);
  return out.toDataURL('image/png');
}

let heroRenderer = null;
/** one figure in a pose, as a PNG data URL (transparent background); mirror flips it left-right */
function renderHero(poseName, outfit, { mirror = false, dusk = false } = {}) {
  const w = 1300, h = 1400;
  if (!heroRenderer) {
    heroRenderer = makeRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    heroRenderer.setPixelRatio(1); heroRenderer.setSize(w, h, false); heroRenderer.setClearColor(0x000000, 0);
  }
  const o = OUTFITS[outfit] || OUTFITS.tee, scene = new THREE.Scene();
  const F = makeFigure(o, null, 1.08);
  dress(F, o);
  (POSES[poseName] || POSES.akimbo)(F);
  if (mirror) F.root.scale.x = -1;
  scene.add(F.root);
  // warm key light from the front, a coloured rim from behind (sunset gold, or dusk pink and blue)
  scene.add(new THREE.HemisphereLight('#c9d8ff', '#5a4030', .55 * LIGHT));
  const key = new THREE.DirectionalLight(dusk ? '#ffc0d0' : '#ffd9a8', 1.05 * LIGHT); key.position.set(2.5, 3, 3); scene.add(key);
  const rim = new THREE.DirectionalLight(dusk ? '#5aa8ff' : '#9fe0ff', .9 * LIGHT); rim.position.set(-3, 1.5, -2.5); scene.add(rim);
  const cam = new THREE.PerspectiveCamera(24, w / h, .1, 50);
  cam.position.set(0, .55, 5.6); cam.lookAt(0, 1.0, 0);
  // OutlineEffect leaves autoClear off after its second pass: clear by hand, or figures pile up
  heroRenderer.autoClear = true; heroRenderer.clear();
  new OutlineEffect(heroRenderer, { defaultThickness: .0085, defaultColor: [.04, .03, .05] }).render(scene, cam);
  const url = sticker(heroRenderer.domElement);
  scene.traverse(m => { if (m.isMesh) m.material.dispose(); });
  return url;
}

// ---- the screens --------------------------------------------------------------------------

const TIPS = [
  'Click any train car to board it, then walk its cabin with W A S D.',
  'Right-click the view to fly with the mouse. Scroll sets the speed, Esc lets go.',
  'Drag the Time slider to sunset and watch the office lights come on.',
  'The Season slider brings snow in winter and blossom in spring.',
  'Click the minimap in the corner to fly straight there.',
  'Pick a line under “Ride a line” and the line diagram follows your train stop by stop.',
  'Skyline lights paint the towers and bridges in any colour you like.',
];

const el = (tag, cls, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.append(e); return e; };
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function buildScreen(city, s) {
  const side = s.side === 'left' ? 'left' : 'right';
  const root = el('div', 'ls-screen'); root.dataset.side = side;
  const inner = el('div', 'ls-inner', root);
  const pan = el('div', 'ls-pan', inner), bg = el('img', 'ls-bg', pan);
  bg.alt = ''; bg.decoding = 'async'; bg.src = `${city.dir}/${s.file}`;
  el('div', 'ls-grade', inner);
  const glow = el('div', 'ls-glow', inner), dim = el('div', 'ls-dim', inner);
  const drift = el('div', 'ls-drift', inner), hero = el('img', 'ls-hero', drift);
  hero.alt = '';
  const [poseName, outfit] = s.hero || ['akimbo', 'tee'];
  // a figure on the left of the frame faces right: mirror the ones posed facing left
  hero.src = renderHero(poseName, outfit, { mirror: side === 'right' && poseName === 'point', dusk: (s.hour ?? -1) > -.4 });
  const cap = el('div', 'ls-poi', inner);
  el('small', '', cap).textContent = s.area ? `${city.name} · ${s.area}` : city.name;
  el('b', '', cap).textContent = s.name;
  const ready = Promise.all([bg, hero].map(i => i.decode().catch(() => {})));
  return { root, inner, pan, bg, glow, dim, drift, hero, cap, side, ready };
}

/**
 * Start the slideshow inside the loading screen `host` for city. Returns { stop() }.
 * With no loadingScreens for the city it does nothing.
 */
export function startLoadingScreens(city, host) {
  const list = city.loadingScreens || [];
  const stage = host.querySelector('.ls-stage'), flash = host.querySelector('.ls-flash'), tip = host.querySelector('.ls-tip');
  if (!list.length || !stage) return { settle() {}, stop() {} };
  host.classList.add('ls-on');
  // a tile of film grain for the overlay
  const g = document.createElement('canvas'); g.width = g.height = 256;
  const gx = g.getContext('2d'), px = gx.createImageData(256, 256);
  for (let i = 0; i < px.data.length; i += 4) { px.data[i] = px.data[i + 1] = px.data[i + 2] = Math.random() * 255; px.data[i + 3] = 255; }
  gx.putImageData(px, 0, 0);
  host.style.setProperty('--grain', `url(${g.toDataURL()})`);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tips = shuffle(TIPS.slice()), timers = new Set(), anims = new Set();
  const screens = shuffle(list.map((_, i) => i)).map(i => buildScreen(city, list[i]));
  const PERIOD = HOLD + IN;   // from one screen starting to slide in to the next
  let stopped = false, settled = false, tipN = 0;

  const now = () => document.timeline.currentTime;
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (!stopped) fn(); }, Math.max(0, ms)); timers.add(t); };
  let collect = null;   // while planning a slide, its animations are gathered here (see settle)
  const animate = (node, frames, opts) => { const a = node.animate(frames, { fill: 'both', ...opts }); anims.add(a); collect?.push(a); a.finished.then(() => anims.delete(a), () => {}); return a; };
  const planned = [];   // { at: timeline ms the slide starts, anims }

  /** Bring screen S on in `delay` ms: its slide in (unless it's the very first), its figure and caption,
   *  and its slow drift for `life` ms (until the next one has covered it, or longer for the last of a
   *  run, in case the page is too busy to plan the next run on time). */
  function bringOn(S, delay, first, life = PERIOD + IN) {
    const dir = S.side === 'right' ? 1 : -1, d = { delay };
    if (still) {
      // reduced motion: a plain crossfade, nothing pans
      animate(S.root, [{ opacity: first ? 1 : 0 }, { opacity: 1 }], { duration: 600, ...d });
      return;
    }
    // the slow drift for the whole time on screen: frame one way, figure the other
    // (at most ~13 s of travel, so the picture never slides past its 5% margin; then it rests)
    const travel = Math.min(life, 13000), secs = travel / 1000, pan = PAN * secs / 2, sway = SWAY * secs / 2;
    animate(S.bg, [{ transform: `translate3d(${-pan * dir}%, 0, 0) scale(1.02)` }, { transform: `translate3d(${pan * dir}%, 0, 0) scale(${1.02 + PUSH * secs})` }], { duration: travel, easing: 'linear', ...d });
    animate(S.drift, [{ transform: `translate3d(${sway * dir}vw, 0, 0)` }, { transform: `translate3d(${-sway * dir}vw, 0, 0)` }], { duration: travel, easing: 'linear', ...d });
    if (!first) {
      // The new frame arrives from its figure's side as a slanted panel and slides over the old one.
      // (the window slides in; its contents slide back by the same amount, so only the edge moves)
      const off = offset() * dir, sk = slant();
      animate(S.root, [{ transform: `translate3d(${off}vw, 0, 0) skewX(${sk}deg)` }, { transform: `translate3d(0, 0, 0) skewX(${sk}deg)` }], { duration: IN, easing: EASE, ...d });
      animate(S.inner, [{ transform: `skewX(${-sk}deg) translate3d(${-off}vw, 0, 0)` }, { transform: `skewX(${-sk}deg) translate3d(0, 0, 0)` }], { duration: IN, easing: EASE, ...d });
      animate(S.pan, [{ transform: `translate3d(${4 * dir}%, 0, 0)` }, { transform: 'none' }], { duration: IN, easing: EASE, ...d });
      animate(S.glow, [{ opacity: .35 }, { opacity: 0 }], { duration: IN, easing: 'ease-out', ...d });
      // (no fill: several of these wait on the one element, and a waiting one mustn't hide the others)
      animate(flash, [{ opacity: 0 }, { opacity: .38, offset: .5 }, { opacity: 0 }], { duration: 400, delay: delay + IN * .5 - 200, fill: 'none' });
    }
    // the figure slides in, then the caption
    animate(S.hero, [{ transform: `translate3d(${38 * dir}vw, 0, 0)`, opacity: 0 }, { opacity: 1, offset: .2 }, { transform: 'none', opacity: 1 }], { duration: IN + 200, delay: delay + (first ? 0 : 180), easing: EASE });
    animate(S.cap, [{ transform: `translate3d(${-6 * dir}vw, 0, 0)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 600, delay: delay + (first ? 150 : 420), easing: 'cubic-bezier(.2, .8, .2, 1)' });
    // the tip changes with the screen (page code, so only when the page is free; it's only text)
    later(() => { tip.textContent = tips[tipN++ % tips.length]; }, delay + 200);
  }

  /** Put a screen on top of the others, waiting off to its side (or invisible, with reduced motion)
   *  until its slide, with any animations from its last turn cleared. */
  function line(S) {
    for (const a of S.root.getAnimations({ subtree: true })) { a.cancel(); anims.delete(a); }
    if (still) S.root.style.opacity = 0;
    else {
      const off = offset() * (S.side === 'right' ? 1 : -1), sk = slant();
      S.root.style.transform = `translate3d(${off}vw, 0, 0) skewX(${sk}deg)`;
      S.inner.style.transform = `skewX(${-sk}deg) translate3d(${-off}vw, 0, 0)`;
    }
    stage.append(S.root);
  }

  // A whole run of transitions is planned at once, as animations that wait their turn: the browser
  // plays them by itself, so they go on while a city is being built and no page code can run (a
  // timer for each one never fired until the city was done). Near the end of a run, as soon as the
  // page is free, the next run is planned, starting from the screen that is up.
  function run(top, firstAt) {
    if (settled) return;
    const rest = shuffle(screens.filter(S => S !== top));
    const t = now(), start = Math.max(firstAt - t, 120);
    const last = rest[rest.length - 1];
    rest.forEach((S, i) => {
      line(S); collect = [];
      bringOn(S, start + i * PERIOD, false, S === last ? PERIOD * 6 : undefined);
      planned.push({ at: t + start + i * PERIOD, anims: collect }); collect = null;
    });
    const lastAt = t + start + (rest.length - 1) * PERIOD;
    later(() => run(last, lastAt + PERIOD), lastAt - t + IN + 200);
  }

  const first = screens[0];
  first.ready.then(() => {
    if (stopped) return;
    stage.append(first.root);
    bringOn(first, 0, true, PERIOD * 6);
    const shownAt = now();
    // the rest get drawn while the first is up, then the first run is planned
    if (screens.length > 1) Promise.all(screens.map(S => S.ready)).then(() => { if (!stopped) run(first, shownAt + HOLD); });
  });
  return {
    // Hold still from now on: slides that haven't started are called off (one under way finishes),
    // so the screen that is up stays up. main.js calls this as the city draws its first frames: the
    // GPU is busy compiling and uploading the whole city then, and a slide during it stuttered badly
    // (a third to a quarter of its frames dropped, against almost none while the city was being built).
    settle() {
      settled = true;
      for (const t of timers) clearTimeout(t); timers.clear();
      const t = now();
      for (const p of planned) if (p.at > t) for (const a of p.anims) { a.cancel(); anims.delete(a); }
    },
    stop() { stopped = true; for (const t of timers) clearTimeout(t); for (const a of anims) a.cancel(); heroRenderer?.dispose(); heroRenderer?.forceContextLoss(); heroRenderer = null; },
  };
}
