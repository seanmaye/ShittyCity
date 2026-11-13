// 1938 Pine St Kitchen: one kitchen, modelled from photos, with every drawer and cabinet that
// the kitchen organization plan covers. Click a drawer or door (or pick it in the panel) to open
// it and see what goes inside. Units are inches: x runs east, z runs south, y is up, and the
// room's north-west corner is the origin.
//
// Plan (overhead, north at the top):
//   north wall: fridge | B1 + D1 | range (microwave over) | D2–D5 stack | lazy susan corner (B2)
//   east wall:  corner | dishwasher | sink (window over) | D6 + cabinet | end of counter, trash
//   island:     parallel to the sink run; drawers I1–I4 face the sink, two big cabinets below,
//               overhang with stools on the west side, wall end at the south wall by the back door
// The island sits so the aisle between it and the sink run is as wide as the gap between the
// island's far (west) edge and the west wall: see ISLAND below.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { LIGHT, makeRenderer } from '../../three-setup.js';
import * as I from './items.js';
import { buildMiniRail } from './minirail.js';
import { buildSubway } from '../subway.js';
import { createRidebar } from '../../ridebar.js';

const { B, C, mat, mesh } = I;
const PI = Math.PI;

// ---- the room
const ROOM = { w: 128, d: 140, h: 108 };            // east wall at x = 128, south wall at z = 140
const COUNTER = 36, BASE_D = 24, UPPER_D = 12;
const SINK_FRONT = ROOM.w - BASE_D;                 // the sink run's cabinet fronts (x = 104)
const SINK_EDGE = SINK_FRONT - 1.5;                 // its counter edge
// The island: 24in cabinets facing the sink, a 1.5in front overhang and a 12in seating overhang on
// the west. Equal gaps: (SINK_EDGE - island's east edge) = (island's west edge - west wall).
const ISLAND_TOP = 24 + 1 + 12;                     // counter depth, east edge to west edge
const GAP = (SINK_EDGE - ISLAND_TOP) / 2;
const ISLAND = { west: GAP, east: GAP + ISLAND_TOP, front: GAP + ISLAND_TOP - 1, north: 72, cabN: 90 };

// ---- textures
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(...repeat);
  t.anisotropy = 8; return t;
}
const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
function mapleTex() {
  return canvasTex(128, 256, (x, w, h) => {
    x.fillStyle = '#e2cb9e'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      x.strokeStyle = `rgba(${150 + rnd() * 40},${100 + rnd() * 30},${50 + rnd() * 20},${.05 + rnd() * .09})`;
      x.lineWidth = .5 + rnd() * 2; x.beginPath(); let px = rnd() * w; x.moveTo(px, 0);
      for (let y = 0; y <= h; y += 16) { px += (rnd() - .5) * 3; x.lineTo(px, y); } x.stroke();
    }
  });
}
function tileTex() {   // 12in mauve quarry tiles with grey grout, one tile per repeat
  return canvasTex(128, 128, (x, w) => {
    x.fillStyle = '#a49ca2'; x.fillRect(0, 0, w, w);
    x.fillStyle = '#6c5160'; x.fillRect(3, 3, w - 6, w - 6);
    for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(${rnd() > .5 ? '255,235,245' : '60,30,45'},${rnd() * .07})`; x.fillRect(3 + rnd() * (w - 8), 3 + rnd() * (w - 8), 4 + rnd() * 10, 4 + rnd() * 10); }
  }, [ROOM.w / 12, ROOM.d / 12]);
}
function speckleTex() {   // the grey-beige laminate counters
  return canvasTex(128, 128, (x, w) => {
    x.fillStyle = '#c3b9b0'; x.fillRect(0, 0, w, w);
    for (let i = 0; i < 1400; i++) { x.fillStyle = rnd() > .5 ? 'rgba(90,78,70,.25)' : 'rgba(255,255,255,.3)'; x.fillRect(rnd() * w, rnd() * w, 1, 1); }
  }, [.1, .1]);
}
function rugTex() {
  return canvasTex(128, 320, (x, w, h) => {
    x.fillStyle = '#d9d1bf'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#b9ae96'; x.lineWidth = 6; x.strokeRect(5, 5, w - 10, h - 10);
    for (let i = 0; i < 26; i++) {
      const cx = 14 + rnd() * (w - 28), cy = 14 + rnd() * (h - 28);
      x.fillStyle = rnd() > .4 ? 'rgba(38,52,96,.8)' : 'rgba(110,120,140,.6)';
      for (let p = 0; p < 6; p++) { x.beginPath(); x.ellipse(cx + Math.cos(p) * 7, cy + Math.sin(p) * 7, 7, 3.5, p, 0, 7); x.fill(); }
    }
  });
}
function textTex(text, bg, fg, w = 128, h = 48, font = 'italic 600 30px Georgia') {
  return canvasTex(w, h, (x) => { x.fillStyle = bg; x.fillRect(0, 0, w, h); x.fillStyle = fg; x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + 2); });
}
function paintingTex() {   // the still life of onions by the window
  return canvasTex(128, 96, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#3a3128'); g.addColorStop(1, '#1f1a15'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = '#6b4a2e'; x.fillRect(0, h * .72, w, h * .28);
    x.fillStyle = '#8a5a34'; x.beginPath(); x.ellipse(40, 46, 16, 20, 0, 0, 7); x.fill();
    for (let i = 0; i < 9; i++) { x.fillStyle = ['#b98a4a', '#c99a5a', '#a0703a'][i % 3]; x.beginPath(); x.arc(62 + (i % 5) * 12, 66 - Math.floor(i / 5) * 9, 6.5, 0, 7); x.fill(); }
  });
}

/**
 * Build the kitchen into the canvas. Returns { start(): Promise (first frame drawn) }.
 * hud: the page's panel (main.js hides the city controls; this fills in the kitchen ones).
 */
export function buildKitchen(canvas) {
  const renderer = makeRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#2b2530');
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
  scene.environmentIntensity = .45;

  const camera = new THREE.PerspectiveCamera(50, 1, .5, 4000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = .09;
  controls.minDistance = 4; controls.maxDistance = 600; controls.maxPolarAngle = PI * .96;
  controls.screenSpacePanning = true;
  controls.addEventListener('start', () => { flight = null; });

  // lights: the ceiling fixtures, daylight through the windows, and the room's own bounce
  scene.add(new THREE.HemisphereLight('#fffaf2', '#8a7680', .32 * LIGHT));
  const sun = new THREE.DirectionalLight('#fff1dc', .5 * LIGHT);
  sun.position.set(ROOM.w + 160, 230, 40); sun.target.position.set(60, 0, 80);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 3; sun.shadow.bias = -.0005; sun.shadow.normalBias = .4;
  Object.assign(sun.shadow.camera, { left: -130, right: 130, top: 130, bottom: -130, near: 10, far: 700 });
  scene.add(sun, sun.target);
  for (const z of [40, 104]) {
    const p = new THREE.PointLight('#ffe9cc', .2 * LIGHT, 0, 0); p.position.set(64, ROOM.h - 8, z); scene.add(p);
    scene.add(C(7, 7, .8, mat('#fffdf6', { e: '#fff6dd' }), 64, ROOM.h - .8, z, 24));
  }

  // ---- materials
  const MAPLE = new THREE.MeshStandardMaterial({ color: '#ffffff', map: mapleTex(), roughness: .55 });
  const PLY = mat('#dcc396', { r: .7 }), TOE = mat('#4a3b2e', { r: .9 });
  const LINER = mat('#3d3f44', { r: .95 }), WALL = mat('#e9e7e1', { r: .9 }), TRIM = mat('#f6f4ef', { r: .5 });
  const TOP = new THREE.MeshStandardMaterial({ color: '#ffffff', map: speckleTex(), roughness: .45 });
  const NICKEL = mat('#c9c6bf', { m: .8, r: .35 }), BRASS = mat('#d9c38a', { m: .85, r: .3 });

  // ---- the shell: floor, walls with their openings, ceiling (walls face inward, so from outside
  // the room you see straight in, like a dollhouse)
  const floor = mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), mat('#ffffff', { map: tileTex(), r: .5 }), ROOM.w / 2, 0, ROOM.d / 2);
  floor.rotation.x = -PI / 2; scene.add(floor);
  const wood = mesh(new THREE.PlaneGeometry(48, 60), mat('#6e4c33', { r: .6 }), -24, -.05, 30); wood.rotation.x = -PI / 2; scene.add(wood);
  const ceiling = mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), mat('#f7f6f2', { r: .95 }), ROOM.w / 2, ROOM.h, ROOM.d / 2);
  ceiling.rotation.x = PI / 2; scene.add(ceiling);

  /** a group whose local frame is a wall or cabinet run: x along it (left to right as you face
   * it), z out of it toward you, origin at floor level on the front plane */
  function run(x, z, theta) { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = theta; scene.add(g); return g; }
  function wall(g, len, holes = []) {
    const s = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(len, 0), new THREE.Vector2(len, ROOM.h), new THREE.Vector2(0, ROOM.h)]);
    for (const [u0, u1, v0, v1] of holes) s.holes.push(new THREE.Path([new THREE.Vector2(u0, v0), new THREE.Vector2(u0, v1), new THREE.Vector2(u1, v1), new THREE.Vector2(u1, v0)]));
    const m = new THREE.Mesh(new THREE.ShapeGeometry(s), WALL); m.receiveShadow = true; g.add(m);
  }
  const NW = run(0, 0, 0), EW = run(ROOM.w, 0, -PI / 2), SW = run(ROOM.w, ROOM.d, PI), WW = run(0, ROOM.d, PI / 2);
  const EAST_WIN = [50, 106, 42, 96], BACK_DOOR = [ROOM.w - 102, ROOM.w - 72, 0, 81], SOUTH_WIN = [ROOM.w - 30, ROOM.w - 4, 46, 96];
  wall(NW, ROOM.w); wall(EW, ROOM.d, [EAST_WIN]); wall(SW, ROOM.w, [BACK_DOOR, SOUTH_WIN]); wall(WW, ROOM.d, [[80, 140, 0, 84]]);

  function windowIn(g, [u0, u1, v0, v1], panes = 2) {
    const w = u1 - u0, h = v1 - v0, cx = (u0 + u1) / 2, sky = new THREE.MeshBasicMaterial({ color: '#dde8f0' });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), sky); glass.position.set(cx, v0 + h / 2, -4); g.add(glass);
    for (const [x, y, ww, hh, dd, zz] of [[cx, v0 - .5, w + 7, 1.2, 5.5, -1.5], [cx, v1, w + 6, 3, 1, .5], [u0 - 1.5, v0, 3, h, 1, .5], [u1 + 1.5, v0, 3, h, 1, .5], [cx, v0 - 3.5, w + 4, 3, 1, .5]])
      g.add(B(ww, hh, dd, TRIM, x, y, zz));
    for (const [x, ww] of [[u0 + .4, .8], [u1 - .4, .8]]) g.add(B(ww, h, 4, TRIM, x, v0, -2));
    g.add(B(w, .8, 4, TRIM, cx, v1 - .8, -2));
    for (let i = 0; i < panes; i++) {   // double-hung sashes: frame and meeting rail
      const a = u0 + i * w / panes, b = a + w / panes, sx = (a + b) / 2;
      for (const [x, y, ww, hh] of [[sx, v0 + h / 2 - .8, b - a, 1.6], [a + .9, v0, 1.8, h], [b - .9, v0, 1.8, h], [sx, v0, b - a, 2.2], [sx, v1 - 2.2, b - a, 2.2]])
        g.add(B(ww, hh, 1.6, TRIM, x, y, -3));
    }
  }
  const WALLS = [NW, EW, SW, WW], _v = new THREE.Vector3();
  windowIn(EW, EAST_WIN); windowIn(SW, SOUTH_WIN, 1);
  { // the back door, white with a brass knob and deadbolt, and the casings
    const [u0, u1] = BACK_DOOR, cx = (u0 + u1) / 2;
    SW.add(B(u1 - u0, 80, 1.75, mat('#f3f1ec', { r: .45 }), cx, 0, -2.5));
    for (const [x, w] of [[u0 - 1.75, 3.5], [u1 + 1.75, 3.5]]) SW.add(B(w, 84, .8, TRIM, x, 0, .4));
    SW.add(B(u1 - u0 + 7, 3.5, .8, TRIM, cx, 81, .4));
    SW.add(C(1.1, 1.1, 1, BRASS, u1 - 3, 36, -1.1).rotateX(PI / 2), C(.9, .9, .8, BRASS, u1 - 3, 44, -1.1).rotateX(PI / 2));
    // the opening to the dining room in the west wall
    for (const [x, w] of [[78.25, 3.5], [141.75, 3.5]]) WW.add(B(w, 84, .8, TRIM, x, 0, .4));
    WW.add(B(67, 3.5, .8, TRIM, 110, 84, .4));
  }
  // baseboards where no cabinets stand
  WW.add(B(78, 4, .6, TRIM, 39, 0, .3));
  SW.add(B(ROOM.w - 102 - 1, 4, .6, TRIM, (ROOM.w - 102) / 2, 0, .3), B(ROOM.w - 72 - 34, 4, .6, TRIM, (ROOM.w - 72 + ROOM.w - 34) / 2 + 0, 0, .3));
  EW.add(B(ROOM.d - 115, 4, .6, TRIM, (115 + ROOM.d) / 2, 0, .3));
  // the painting beside the east window
  EW.add(B(16, 12, .8, mat('#ffffff', { map: paintingTex(), r: .8 }), 120, 60, .4), B(17, 13, .6, mat('#3b2b1c'), 120, 59.5, .2));
  // the alphabet magnets poster by the back door
  SW.add(B(9, 11, .2, mat('#ffffff', { map: textTex('ABC 67', '#f4f1ea', '#c8312b', 96, 96, '700 22px Archivo, sans-serif'), r: .8 }), ROOM.w - 66 + 3, 52, .1));

  // ---- storage: everything that opens
  const openables = [], pickables = [];
  function register(o) {
    o.t = 0; o.goal = 0; openables.push(o);
    o.part.traverse(m => { if (m.isMesh) { m.userData.op = o; pickables.push(m); } });
    for (const p of o.extra || []) p.traverse(m => { if (m.isMesh) { m.userData.op = o; pickables.push(m); } });
    return o;
  }
  const frontMat = (m = MAPLE) => { const f = m.clone(); f.emissive = new THREE.Color('#000000'); return f; };
  function knob(x, y, z, m = NICKEL) { const g = new THREE.Group(); g.position.set(x, y, z); const k = mesh(new THREE.SphereGeometry(.62, 16, 10), m, 0, 0, .9); k.scale.z = .75; g.add(k); g.add(C(.22, .22, .9, m, 0, -.45, .45).rotateX(PI / 2)); return g; }

  /** cabinet box: sides, bottom, top, back, shelves {y, d} and a face frame with rails */
  function carcass(g, x0, w, y0, h, d, o = {}) {
    const t = .75, zf = o.zf || 0, zb = zf - d, m = PLY;
    g.add(B(t, h, d, m, x0 + t / 2, y0, zf - d / 2), B(t, h, d, m, x0 + w - t / 2, y0, zf - d / 2), B(w, t, d, m, x0 + w / 2, y0, zf - d / 2), B(w, h, t, m, x0 + w / 2, y0, zb + t / 2));
    if (o.top !== false) g.add(B(w, t, d, m, x0 + w / 2, y0 + h - t, zf - d / 2));
    for (const s of o.shelves || []) {
      const sd = s.d || d - 1.5;
      g.add(B(w - 2 * t, t, sd, m, x0 + w / 2, y0 + s.y, zb + t + sd / 2));
      if (s.liner) g.add(B(w - 2 * t - .2, .08, sd - .2, LINER, x0 + w / 2, y0 + s.y + t, zb + t + sd / 2));
    }
    if (o.liner) g.add(B(w - 2 * t - .2, .08, d - 1.6, LINER, x0 + w / 2, y0 + t, zf - d / 2));
    const f = 1.5, fz = zf - t / 2, F = MAPLE;
    g.add(B(f, h, t, F, x0 + f / 2, y0, fz), B(f, h, t, F, x0 + w - f / 2, y0, fz), B(w, f, t, F, x0 + w / 2, y0, fz), B(w, f, t, F, x0 + w / 2, y0 + h - f, fz));
    for (const r of o.rails || []) g.add(B(w, f, t, F, x0 + w / 2, y0 + r, fz));
    if (o.mid) g.add(B(f, h, t, F, x0 + w / 2, y0, fz));
  }
  /** a raised-panel door, hinged at its left (sign 1) or right (sign -1) edge */
  function door(g, xh, y0, w, h, sign, o = {}) {
    const pivot = new THREE.Group(), m = o.m || frontMat(), zf = o.zf || 0;
    pivot.position.set(xh, y0, zf); g.add(pivot);
    const d = new THREE.Group(); d.position.x = sign > 0 ? 0 : -w; pivot.add(d);
    const s = 2.4, tt = .3;
    d.add(B(w, h, .75, m, w / 2, 0, .375));
    d.add(B(s, h, tt, m, s / 2, 0, .75 + tt / 2), B(s, h, tt, m, w - s / 2, 0, .75 + tt / 2), B(w - 2 * s, s, tt, m, w / 2, 0, .75 + tt / 2), B(w - 2 * s, s, tt, m, w / 2, h - s, .75 + tt / 2));
    d.add(B(w - 2 * s - 1.4, h - 2 * s - 1.4, .14, m, w / 2, s + .7, .82));
    const kx = sign > 0 ? w - 1.6 : 1.6, ky = o.upper ? 2.8 : h - 2.8;
    if (o.knob !== false) d.add(knob(kx, ky, .75, o.km));
    return { pivot, sign, m };
  }
  /** a drawer: a front with a box behind it; .inside is the box's floor, centred */
  function drawer(g, x0, w, y0, h, iw, id, ih, o = {}) {
    const part = new THREE.Group(), m = o.m || frontMat(), zf = o.zf || 0;
    part.position.set(x0 + w / 2, y0, zf); g.add(part);
    const fw = w - .3, fh = h - .25;
    part.add(B(fw, fh, .75, m, 0, .12, .375));
    if (!o.plain) part.add(B(fw - 1.2, fh - 1.2, .12, m, 0, .72, .8));
    if (o.handle) part.add(o.handle); else part.add(knob(0, fh / 2 + .12, .75, o.km));
    const by = Math.max(.6, (fh - ih) / 2 - .2);
    part.add(B(iw + 1, .5, id, PLY, 0, by - .5, -id / 2), B(.5, ih, id, PLY, -iw / 2 - .25, by, -id / 2), B(.5, ih, id, PLY, iw / 2 + .25, by, -id / 2), B(iw, ih, .5, PLY, 0, by, -id + .25));
    if (o.liner !== false) part.add(B(iw - .1, .05, id - .6, LINER, 0, by, -id / 2));
    const inside = new THREE.Group(); inside.position.set(0, by + .05, -id / 2); part.add(inside);
    return { part, inside, m, travel: id * .78, z0: zf };
  }
  /** where a cabinet's things sit: a group at the middle of its floor */
  function interior(g, x, y, z) { const i = new THREE.Group(); i.position.set(x, y, z); g.add(i); return i; }
  const toe = (g, x0, w, depth = BASE_D) => g.add(B(w, 4, .5, TOE, x0 + w / 2, 0, -3.25), B(w, .5, depth - 3, TOE, x0 + w / 2, 0, -depth / 2 - 1.5));

  function addDrawer(spec, g, x0, w, y0, h, iw, ih, fill, o = {}) {
    const dr = drawer(g, x0, w, y0, h, iw, o.id || 18, ih, o);
    fill(dr.inside, iw, o.id || 18, ih);
    return register({ ...spec, kind: 'drawer', part: dr.part, fronts: [dr.m], run: g,
      set(t) { dr.part.position.z = dr.z0 + t * dr.travel; },
      look: { local: new THREE.Vector3(x0 + w / 2, y0 + h / 2, (o.zf || 0) - (o.id || 18) / 2 + dr.travel), dist: 15, lift: 30 } });
  }
  function addCabinet(spec, g, doors, look, extra = {}) {
    return register({ ...spec, kind: 'door', part: doors[0].pivot, extra: doors.slice(1).map(d => d.pivot), fronts: doors.map(d => d.m), run: g,
      set(t) { for (const d of doors) d.pivot.rotation.y = -d.sign * t * 1.85 * (extra.swing || 1); }, look });
  }

  // ===== north wall: fridge, B1/D1, range, the D2–D5 stack, the corner
  const N = run(0, BASE_D, 0), base = 4, top = 34.5;
  { // the fridge: white, top freezer, spice racks and oven mitts on its west side
    const F = mat('#f3f2ee', { r: .35 }), fz = 30;
    scene.add(B(33, 66.5, 29, F, 17.5, 1.5, 14.5), B(31, 1.5, 27, TOE, 17.5, 0, 14.5));
    scene.add(B(33, 15.6, 1.6, F, 17.5, 52.4, fz), B(33, 50.6, 1.6, F, 17.5, 1.5, fz));
    scene.add(B(1, 9, 1.4, F, 32.5, 55, fz + 1.4), B(1, 18, 1.4, F, 32.5, 30, fz + 1.4));
    const notes = [['#f2c230', 6, 46], ['#3a6fc0', 12, 40], ['#ffffff', 22, 44], ['#d97b6a', 8, 26], ['#e8e2d0', 18, 20], ['#2f8a47', 26, 57]];
    for (const [c, x, y] of notes) scene.add(B(4.5 + (x % 3), 5.5, .1, mat(c, { r: .8 }), x + 1, y, fz + .85));
    const rack = mat('#5aa7d6', { r: .5 });
    for (const y of [46, 58]) {
      scene.add(B(3.2, .5, 15, rack, -.6, y, 14), B(3.2, 2, .4, rack, -.6, y, 6.7), B(3.2, 2, .4, rack, -.6, y, 21.3), B(.4, 1.6, 15, rack, -2, y, 14));
      const row = I.spiceRow(7); row.rotation.y = PI / 2; row.position.set(-.6, y + .5, 14); scene.add(row);
    }
    for (const [z, c] of [[8, '#2f4f9a'], [12, '#2f4f9a'], [18, '#56606a']]) { const mt = I.mitt(c); mt.rotation.y = PI / 2; mt.position.set(-.7, 44, z); scene.add(mt); }
  }
  // B1 + D1 (x 34–49)
  carcass(N, 34, 15, base, top - base, BASE_D, { shelves: [{ y: 23.6, d: 22.5 }, { y: 12, d: 11 }], rails: [24.2] }); toe(N, 34, 15);
  addDrawer({ code: 'D1', name: 'Cooking tools', where: 'Between the fridge and the stove, top drawer', size: '12.9 × 18 × 3 in',
    items: ['Turners and spatulas', 'Tongs', 'Ladles', 'Whisks', 'Wooden spoons'], why: 'It is the widest drawer that touches the stove, so the tools are one step from the burners.' },
  N, 34, 15, 28.5, 6, 12.9, 3, (g) => {
    g.add(at(I.turner(), -5, 0, 0), at(I.spatula(), -3, 0, .5), at(I.tongs(), -1, 0, 0), at(I.ladle(), 1.6, 0, -.5), at(I.whisk(), 4.2, 0, 0), at(I.spoonWood(), -5.6, .5, 1, .1), at(I.spoonWood(), 3, .4, 2, -.1));
  });
  addCabinet({ code: 'B1', name: 'Frying pans and lids', where: 'Cabinet under D1, beside the stove', size: '13.5 × 22.5 × 22 in',
    items: ['Frying pans on edge in a vertical pan rack (moved off the top of the fridge)', 'Pot lids', 'Spare cooking oils'], why: 'Pans live right next to the burners, filed on edge so any one comes out without lifting the others.' },
  N, [door(N, 34.25, 4.5, 14.5, 23.2, 1, { km: BRASS })], { local: new THREE.Vector3(41.5, 16, -12), dist: 42, lift: 16 });
  { const g = interior(N, 41.5, 4.75, -12);
    g.add(at(I.panRack(3, 9, 18), 0, 0, 1));
    [['#2a2b2e', 5], ['#c3c7cb', 5.4], ['#2a2b2e', 4.4]].forEach(([c, r], i) => g.add(at(I.panOnEdge(r, c), -3 + i * 3, .3, 2)));
    g.add(at(I.lid(4.5), -3, 12.75, -6), at(I.lid(3.8), -2.6, 13.4, -6), at(I.oilBottle(), 2.5, 12.75, -8), at(I.oilBottle('#c8a23a'), 4.6, 12.75, -5.5), at(I.bottle(1.2, 9, '#2d3a2a', { glassy: true }), 2.8, 12.75, -4.5));
  }
  // the range (x 49–79): black, stainless backguard, and its bottom drawer
  {
    const blk = mat('#1b1c1f', { r: .35 }), ss = I.M.steel();
    N.add(B(30, 9.5, 25.5, blk, 64, 0, -11.25), B(30, 26.5, 25.5, blk, 64, 9.5, -11.25));
    N.add(B(29.6, 21, .4, mat('#0d0e10', { r: .1, m: .3 }), 64, 10.5, 1.7), B(20, 9, .2, mat('#24272c', { r: .05 }), 64, 15, 1.95));
    N.add(rod(.45, 27, ss, 64, 31.5, 3.2));
    for (const sx of [-13, 13]) N.add(B(.6, .6, 1.6, ss, 64 + sx, 31.2, 2.4));
    N.add(B(30, 3.2, .3, blk, 64, 32.8, 1.75));
    for (let i = 0; i < 5; i++) N.add(C(.8, .8, .9, ss, 52.5 + i * 5.75 - (i > 1 ? 0 : 0), 34.4, 2.2).rotateX(PI / 2));
    N.add(B(30, .6, 25.5, blk, 64, 36, -11.25), B(30, 11, 1.8, ss, 64, 36, -23.1), B(6, 2.2, .2, mat('#0b2730', { e: '#1d9ec8' }), 64, 43, -22.1));
    const grate = mat('#121315', { r: .5 });
    for (const gx of [56.5, 71.5]) {
      for (let i = 0; i < 4; i++) N.add(B(.5, .5, 22, grate, gx - 5.5 + i * 3.67, 36.6, -11.25));
      for (let j = 0; j < 4; j++) N.add(B(14, .5, .5, grate, gx, 36.6, -21.5 + j * 6.8));
      for (const bz of [-17.5, -5]) N.add(C(1.8, 1.8, .6, mat('#2a2b2e', { m: .4, r: .4 }), gx, 36.4, bz));
    }
    const pot = I.pot(4.8, 5.2); pot.position.set(71.5, 37.1, -17.5); N.add(pot);
    const k = I.kettle(); k.position.set(56.5, 37.1, -5); k.rotation.y = .6; N.add(k);
    // dish towels over the oven handle
    for (const [x, base0, line] of [[56, '#e9e4d6', '#8a8f9a'], [63.5, '#d9d4c4', '#3a3f4a'], [70, '#efe9d9', '#7a5a4a']]) {
      const cloth = I.clothMat(base0, line);
      N.add(B(6.5, 13, .25, cloth, x, 19, 3.85), B(6.5, 1.4, 1.4, cloth, x, 31, 3.2), B(6.5, 7, .25, cloth, x, 25, 2.5));
    }
    addDrawer({ code: 'R', name: 'Baking sheets', where: 'The range’s bottom drawer', size: 'about 24 × 18 × 4.5 in',
      items: ['Baking sheets', 'Pizza stone', 'Muffin tin', 'Cooling racks'], why: 'Flat bakeware stacks under the oven it goes into. (Assuming the drawer is free: it wasn’t in the photos.)' },
    N, 49, 30, .6, 8.8, 24, 4.6, (g) => {
      g.add(at(I.bakingSheet(11, 16), -6, 0, 0), at(I.bakingSheet(11, 16), -6, .65, 0), at(I.muffinTin(10.5, 14), -6, 1.3, 0));
      g.add(at(I.pizzaStone(11, 14), 6, 0, -1), at(I.coolingRack(10, 14), 6, .7, -1), at(I.coolingRack(10, 14), 6, 1.6, -1));
    }, { zf: 2, m: frontMat(blk), plain: true, liner: false, handle: rod(.35, 24, ss, 0, 6.4, 1.6) });
  }
  // the D2–D5 stack (x 79–91)
  carcass(N, 79, 12, base, top - base, BASE_D, { rails: [12.25, 18.25, 24.25] }); toe(N, 79, 12);
  const STACK = [
    ['D2', 'Knives', 28.5, 5.75, 3, ['Chef’s and paring knives', 'Kitchen shears', 'Peeler'], 'Keep as is: the cutting-board counter is right above it.',
      g => g.add(at(I.knife(12), -3.4, 0, 0), at(I.knife(10, '#3a2a1e'), -1.6, 0, 1), at(I.knife(7), .2, 0, 2), at(I.shears(), 2.4, 0, 0), at(I.peeler(), 3.9, 0, 4))],
    ['D3', 'Prep gadgets', 22.5, 6, 3, ['Can opener', 'Garlic press', 'Zester', 'Thermometer'], '“Scoop/serving” moved to D1, which freed this drawer for the small gadgets.',
      g => g.add(at(I.canOpener(), -2.8, 0, 1), at(I.garlicPress(), -.2, 0, -1), at(I.zester(), 2.2, 0, 0), at(I.thermometer(), 3.8, 0, 5))],
    ['D4', 'Measuring', 16.5, 6, 3, ['Measuring cups', 'Measuring spoons'], 'Keep as is.',
      g => g.add(at(I.measuringCups(), -1.8, 0, 2.5), at(I.measuringCups('#2f8a47'), 2, 0, -2.5, PI), at(I.measuringSpoons(), 1.5, 0, 5))],
    ['D5', 'Wraps and bags', 4.5, 11.75, 8, ['Aluminium foil', 'Parchment paper', 'Plastic wrap', 'Zip bags'], 'Keep as is: the 8in-deep drawer lets the boxes stand on edge.',
      g => {
        [['#d4d8db', '#2f6cc8'], ['#f4efe2', '#9b6b2f'], ['#f2f0ea', '#c8312b']].forEach(([c, b], i) => { const w = I.wrapBox(14, c, b); w.rotation.set(0, PI / 2, PI / 2); w.position.set(-3.6 + i * 2.3, 1, 0); g.add(w); });
        g.add(at(I.zipBags('#3a6fc0'), 2.6, 0, 3.6), at(I.zipBags('#2f8a47'), 2.6, 0, -4.6));
      }],
  ];
  for (const [code, name, y0, h, ih, items, why, fill] of STACK) {
    addDrawer({ code, name, where: `Stack right of the stove, ${['top', 'second', 'third', 'bottom (deep)'][STACK.findIndex(s => s[0] === code)]} drawer`, size: `9.9 × 18 × ${ih} in`, items, why }, N, 79, 12, y0, h, 9.9, ih, fill);
  }
  // ===== the corner: a pie-cut lazy susan (B2); its two doors turn with the trays
  {
    const g = scene, t = .75;
    g.add(B(37, .75, 24, PLY, 109.5, base, 12), B(24, .75, 12, PLY, 116, base, 30), B(.75, top - base, BASE_D, PLY, 91.4, base, 12), B(24, top - base, .75, PLY, 116, base, 35.6));
    g.add(B(37, top - base, .4, PLY, 109.5, base, .2), B(.4, top - base, 36, PLY, 127.8, base, 18));
    g.add(B(13, 4, .5, TOE, 97.5, 0, 21), B(.5, 4, 12, TOE, 101, 0, 30));
    const susan = new THREE.Group(); susan.position.set(SINK_FRONT, 0, BASE_D); scene.add(susan);
    const tray = mat('#d9b880', { r: .55 }), r = 13;
    for (const y of [6, 19]) {
      susan.add(mesh(new THREE.CylinderGeometry(r - .2, r - .2, .75, 40, 1, false, 0, PI * 1.5), tray, 0, y, 0));
      susan.add(mesh(new THREE.CylinderGeometry(r, r, 1.6, 40, 1, true, 0, PI * 1.5), mat('#cfa86c', { r: .55, side: THREE.DoubleSide }), 0, y + .4, 0));
    }
    susan.add(C(.6, .6, 28, I.M.steel(), 0, 5, 0));
    const fm = frontMat();
    const d1 = door(susan, 0, 4.5, 12.7, 29.5, -1, { m: fm, knob: false }); d1.pivot.position.set(-.1, 4.5, 0);
    const d2 = new THREE.Group(); d2.rotation.y = -PI / 2; susan.add(d2);
    door(d2, 0, 4.5, 11.7, 29.5, 1, { m: fm, knob: false }).pivot.position.set(.1, 4.5, 0);
    susan.add(knob(-1.6, 30.5, .75));
    // what's on the trays: pots and saucepans on top; slow cooker and stockpot below
    const onTray = (o, ang, rad, y) => { o.position.set(Math.sin(ang) * rad, y, Math.cos(ang) * rad); susan.add(o); };
    onTray(I.pot(5, 5.5), PI * .25, 7.5, 19.75); onTray(I.pot(4.2, 4.5, { long: 6 }), PI * .75, 7.5, 19.75); onTray(I.pot(4.5, 5, { glassLid: true }), PI * 1.2, 7.8, 19.75);
    onTray(I.slowCooker(), PI * .45, 6.5, 6.75); onTray(I.pot(5.6, 9), PI * 1.15, 7, 6.75);
    register({ code: 'B2', name: 'Pots and the slow cooker', where: 'Corner lazy susan', size: '2 trays, about 26in across',
      items: ['Top tray: pots and saucepans', 'Bottom tray: slow cooker and stockpot'], why: 'Heavy, bulky cookware on the turning trays beside the stove. The rice cooker and multi-cooker moved to the island’s appliance cabinet.',
      kind: 'susan', part: susan, fronts: [fm], run: scene,
      set(t) { susan.rotation.y = t * PI; }, look: { world: new THREE.Vector3(112, 14, 18), cam: new THREE.Vector3(80, 46, 58) } });
  }

  // ===== east wall: dishwasher, sink, D6
  const E = run(SINK_FRONT, 0, -PI / 2);
  { // dishwasher (z 36–60)
    const ss = I.M.steel();
    E.add(B(24, 30, .8, ss, 48, 4, .4), B(24, 4.2, .9, mat('#a7acb1', { m: .5, r: .3 }), 48, 30, .45), B(18, .8, 1.2, ss, 48, 31.6, 1.1));
    E.add(B(24, 30, BASE_D - 1, mat('#2a2b2e'), 48, 4, -BASE_D / 2), B(24, 4, .5, TOE, 48, 0, -1.25));
    E.add(B(6, 2.2, .1, mat('#ffffff', { map: textTex('Clean', '#f7f5f0', '#1d1e21') }), 52, 25, .85));
  }
  { // the sink base: false fronts and two doors (under the sink is not part of the plan)
    carcass(E, 60, 36, base, top - base, BASE_D, { rails: [24.2], mid: true }); toe(E, 60, 36);
    E.add(B(17.6, 5.5, .75, MAPLE, 69, 28.6, .375), B(17.6, 5.5, .75, MAPLE, 87, 28.6, .375));
    door(E, 60.25, 4.5, 17.6, 23.2, 1, { m: MAPLE, km: BRASS }); door(E, 95.75, 4.5, 17.6, 23.2, -1, { m: MAPLE, km: BRASS });
  }
  carcass(E, 96, 18, base, top - base, BASE_D, { shelves: [{ y: 23.6, d: 22.5 }, { y: 11, d: 11 }], rails: [24.2] }); toe(E, 96, 18);
  addDrawer({ code: 'D6', name: 'Silverware', where: 'Between the sink and the end of the counter (trash)', size: '16 × 18 × 3 in',
    items: ['Forks, knives and spoons in the 2.5in-high expandable bamboo tray (13.3–20.2in, opened to 16in)', 'Serving spoons in the wide slot'],
    why: 'A few steps from the dishwasher, so unloading is quick, and away from the cook at the stove.' },
  E, 96, 18, 28.5, 6, 16, 3, g => g.add(at(I.silverwareTray(15.8, 17), 0, 0, 0)), { km: BRASS });
  addCabinet({ code: 'S', name: 'Cleaning and prep', where: 'Cabinet under D6', size: '16.5 × 22.5 × 22 in',
    items: ['Colander', 'Salad spinner', 'Trash bags', 'Dishwasher pods'], why: 'Rinse-and-drain things beside the sink, bags beside the trash, pods beside the dishwasher.' },
  E, [door(E, 113.75, 4.5, 17.5, 23.2, -1, { km: BRASS })], { local: new THREE.Vector3(105, 16, -12), dist: 40, lift: 18 });
  { const g = interior(E, 105, 4.75, -12);
    g.add(at(I.colander(), -3.5, 0, 3), at(I.saladSpinner(), 4, 0, -4), at(I.trashBags(), 4.5, 11.75, -6), at(I.podTub(), -4, 11.75, -6));
  }
  // ===== counters, backsplash and sink
  {
    const slab = (pts, holes = [], round = 0) => {
      const s = new THREE.Shape(); pts.forEach(([x, z], i) => i ? s.lineTo(x, -z) : s.moveTo(x, -z));
      for (const [x0, x1, z0, z1] of holes) s.holes.push(new THREE.Path([new THREE.Vector2(x0, -z0), new THREE.Vector2(x1, -z0), new THREE.Vector2(x1, -z1), new THREE.Vector2(x0, -z1)]));
      const m = mesh(new THREE.ExtrudeGeometry(s, { depth: 1.1, bevelEnabled: true, bevelSize: .35, bevelThickness: .2, bevelSegments: 3, curveSegments: round || 12 }), TOP, 0, COUNTER - 1.3, 0);
      m.rotation.x = -PI / 2; scene.add(m); return m;
    };
    const edge = BASE_D + 1.5;
    slab([[34, 0], [49, 0], [49, edge], [34, edge]]);
    const SINK = [SINK_EDGE + 4, ROOM.w - 3, 61, 95];
    slab([[79, 0], [ROOM.w, 0], [ROOM.w, 114.5], [SINK_EDGE, 114.5], [SINK_EDGE, edge], [79, edge]], [SINK]);
    const bs = mat('#ffffff', { map: TOP.map, r: .5 });
    scene.add(B(15, 4, .6, bs, 41.5, COUNTER, .3), B(49, 4, .6, bs, 103.5, COUNTER, .3), B(.6, 4, 114.5, bs, ROOM.w - .3, COUNTER, 57.25));
    // the island top, rounded at its free end
    const { west, east, north } = ISLAND, r = 7, s = new THREE.Shape();
    s.moveTo(west, -ROOM.d); s.lineTo(east, -ROOM.d); s.lineTo(east, -(north + r)); s.quadraticCurveTo(east, -north, east - r, -north);
    s.lineTo(west + r, -north); s.quadraticCurveTo(west, -north, west, -(north + r)); s.lineTo(west, -ROOM.d);
    const it = mesh(new THREE.ExtrudeGeometry(s, { depth: 1.1, bevelEnabled: true, bevelSize: .35, bevelThickness: .2, bevelSegments: 3 }), TOP, 0, COUNTER - 1.3, 0);
    it.rotation.x = -PI / 2; scene.add(it);
    // double stainless sink
    const ss = mat('#b9bdc1', { m: .85, r: .28, side: THREE.DoubleSide }), [x0, x1, z0, z1] = SINK, cx = (x0 + x1) / 2;
    for (const [a, b] of [[z0 + .5, (z0 + z1) / 2 - .5], [(z0 + z1) / 2 + .5, z1 - .5]]) {
      const w = x1 - x0 - 1, l = b - a, y = COUNTER - 8.5;
      scene.add(B(w, .3, l, ss, cx, y, (a + b) / 2), B(w, 8.2, .3, ss, cx, y, a), B(w, 8.2, .3, ss, cx, y, b), B(.3, 8.2, l, ss, x0 + .5, y, (a + b) / 2), B(.3, 8.2, l, ss, x1 - .5, y, (a + b) / 2));
      scene.add(C(1.6, 1.6, .35, I.M.darkSteel(), cx, y + .2, (a + b) / 2));
    }
    const fct = I.M.steel(), spout = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 9, 0), new THREE.Vector3(-3, 12, 0), new THREE.Vector3(-6.5, 9, 0)]), 30, .45, 10);
    scene.add(C(1.2, 1.4, 1.5, fct, ROOM.w - 1.8, COUNTER, 78), mesh(spout, fct, ROOM.w - 1.8, COUNTER + 1.5, 78), B(.6, .6, 4, fct, ROOM.w - 1.8, COUNTER + 4, 74.5));
  }

  // ===== the island: drawers I1–I4 face the sink, two big cabinets below
  const IS = run(ISLAND.front, ROOM.d, PI / 2), ICAB = ROOM.d - ISLAND.cabN;   // local x = 140 - z
  const ILOOK = (x) => ({ local: new THREE.Vector3(x, 17, -12), dist: 42, lift: 20 });
  carcass(IS, 0, ICAB, 3.5, 31, BASE_D, { shelves: [{ y: 26.3, d: 22.5 }], rails: [26.8], mid: true });
IS.add(B(ICAB / 2 - 2, .75, 11, PLY, ICAB / 4, 17.25, -BASE_D + .75 + 5.5));   // the appliance cabinet's half-depth shelf
  toe(IS, 0, ICAB);
  // the second cabinet's two full-depth shelves, and the divider between the cabinets
  IS.add(B(.75, 26, BASE_D - 1, PLY, ICAB / 2, 4.25, -BASE_D / 2));
  for (const y of [13.5, 21.5]) IS.add(B(ICAB / 2 - 2, .75, 21, PLY, ICAB * .75, y, -BASE_D / 2 - .5));
  IS.add(B(ICAB, 31, .75, mat('#ffffff', { map: MAPLE.map, r: .55 }), ICAB / 2, 3.5, -BASE_D - .38));   // finished back, facing the stools
  const ID = [
    ['I1', 'Utility', 'nearest the back door', ['Scissors', 'Tape', 'Pens', 'Batteries', 'Lighter'], 'Nearest the door and furthest from the cooking.',
      g => g.add(at(I.scissors(), -3.4, 0, 2), at(I.tape(), 2.6, 0, 4.5), at(I.pen('#1d1e21'), .4, 0, -2), at(I.pen('#2f6cc8'), 1, 0, -2.4), at(I.pen('#c8312b'), 1.6, 0, -1.8), at(I.batteries(5), -4, 0, -5.5), at(I.lighter(), 4.4, 0, -3))],
    ['I2', 'Bar tools', 'second from the back door', ['Corkscrew', 'Bottle opener', 'Jigger', 'Wine stoppers', 'Straws'], 'Under the bar-glass cabinet (U7).',
      g => g.add(at(I.corkscrew(), -3, 0, 4), at(I.bottleOpener(), 3.4, 0, 4), at(I.jigger(), -3, 0, -2), at(I.stopper('#c3c7cb'), .6, 0, -1), at(I.stopper('#c47a4a'), 2.4, 0, -1), at(I.straws(9), 0, 0, -3.5))],
    ['I3', 'Food storage extras', 'third from the back door', ['Container lids', 'Bag clips', 'Reusable bags'], 'Over the food-storage cabinet; your lunch bags already live on the island.',
      g => g.add(at(I.reusableBag('#7dbb57'), -2.6, 0, 3.5), at(I.reusableBag('#5aa7d6'), -2.6, .4, 3), at(I.chipClips(4), 3.2, 0, 2), at(I.containerStack(1, 5, .4, 5, '#3a6fc0'), 2.6, 0, -5), at(I.container(4, .3, 4, '#2f8a47'), -2.8, 0, -5))],
    ['I4', 'Towels and potholders', 'at the rounded end', ['Dish towels', 'Potholders', 'Trivets'], 'The closest island drawer to the stove and sink; gets the towels off the oven door.',
      g => g.add(at(I.towel('#e9e4d6', '#8a8f9a'), -2.6, 0, 3.5), at(I.towel('#d9d4c4', '#3a3f4a'), -2.6, .95, 3.5), at(I.towel('#efe9d9', '#c8312b'), 2.6, 0, 3.5), at(I.potholder('#2f4f9a'), -1.8, 0, -4.5), at(I.trivet(), 3, 0, -5), at(I.trivet(), 3, .45, -5))],
  ];
  ID.forEach(([code, name, place, items, why, fill], i) => {
    addDrawer({ code, name, where: `Island top drawer, ${place}`, size: '11.4 × 18 × 3 in', items, why }, IS, i * ICAB / 4, ICAB / 4, 30.6, 3.9, 11.4, 3, fill, { km: BRASS });
  });
  const IH = 25.8, IW = ICAB / 4 - .4;
  addCabinet({ code: 'IA', name: 'Small appliances', where: 'Big island cabinet under I1 + I2 (back-door end)', size: '22.8 × 18 × 26 in',
    items: ['Rice cooker', 'Multi-cooker', 'Spare blenders (bases on the floor)', 'Food processor', 'Immersion blender', 'Blender jars, lids and attachments on the shelf'],
    why: 'The wall outlet is at this end of the island, so appliances come out, plug in and go back in one spot.' },
  IS, [door(IS, .3, 4.3, IW, IH, 1, { km: BRASS }), door(IS, ICAB / 2 - .1, 4.3, IW, IH, -1, { km: BRASS })], ILOOK(ICAB / 4));
  addCabinet({ code: 'IB', name: 'Food storage and bowls', where: 'Big island cabinet under I3 + I4 (rounded end)', size: '22.8 × 18 × 26 in',
    items: ['Food storage containers', 'Mixing bowls', 'Glass baking and casserole dishes', 'A second shelf, so the 26in height isn’t wasted'],
    why: 'Under the food-storage drawer, and the closest island cabinet to the stove and fridge for packing leftovers.' },
  IS, [door(IS, ICAB / 2 + .1, 4.3, IW, IH, 1, { km: BRASS }), door(IS, ICAB - .3, 4.3, IW, IH, -1, { km: BRASS })], ILOOK(ICAB * .75));
  { // what's in them (x across the island run, z toward the sink)
    const a = interior(IS, ICAB / 4, 4.25, -12);
    a.add(at(I.riceCooker(), -6.5, 0, 4), at(I.multiCooker(), 5.5, 0, 3.5), at(G2(B(6, 5, 6, mat('#c8312b', { r: .35 }))), -7, 0, -6.5));
    a.add(at(G2(B(6, 5, 6, mat('#2a2b2e', { r: .35 }))), -.5, 0, -6.5), at(G2(B(7, 5, 8, I.M.white())), 6.5, 0, -6));
    a.add(at(I.blenderJar(8), -7, 13.75, -6.5), at(I.blenderJar(7), -1.5, 13.75, -6.5), at(G2(C(3.6, 3.6, 6, I.M.glass())), 4, 13.75, -6.5), at(I.immersionBlender(), 8.5, 13.75, -6));
    const b = interior(IS, ICAB * .75, 4.25, -12);
    b.add(at(I.containerStack(3, 8, 3, 6, '#3a6fc0'), -5.5, 0, 2), at(I.containerStack(3, 6, 2.5, 6, '#2f8a47'), 4.5, 0, 3), at(I.mixingBowl(5.5, 4.5), 0, 0, -5), at(I.mixingBowl(4.5, 3.8), 0, 1.3, -5));
    b.add(at(I.bakingDish(13, 9, 2), -2.5, 10, -1), at(I.bakingDish(8.5, 8.5, 2), 6, 10, 0), at(I.bakingDish(11, 7, 2.5), -2.5, 12.3, -1));
    b.add(at(I.containerStack(2, 6, 2.5, 5, '#c8312b'), -6, 18, 0), at(I.containerStack(4, 4, 2, 4, '#f2c230'), 1.5, 18, 0), at(I.container(7, 3, 5, '#7dbb57'), 7.3, 18, 0));
  }

  // ===== upper cabinets
  const UPPER = (code, name, where, size, items, why, g, x0, w, y0, h, shelves, doors, zf = -UPPER_D) => {
    carcass(g, x0, w, y0, h, UPPER_D, { zf, shelves: shelves.map(y => ({ y, d: UPPER_D - 1.5, liner: true })), liner: true, mid: doors === 2 });
    const ds = doors === 2
      ? [door(g, x0 + .25, y0 + .25, w / 2 - .4, h - .5, 1, { zf, upper: true }), door(g, x0 + w - .25, y0 + .25, w / 2 - .4, h - .5, -1, { zf, upper: true })]
      : [door(g, x0 + .25, y0 + .25, w - .5, h - .5, 1, { zf, upper: true })];
    addCabinet({ code, name, where, size, items, why }, g, ds, { local: new THREE.Vector3(x0 + w / 2, y0 + h / 2, zf - UPPER_D / 2), dist: 44, lift: -4 });
    return interior(g, x0 + w / 2, y0 + .75, zf - UPPER_D / 2 + .3);
  };
  { const g = UPPER('U1', 'Rarely used bakeware', 'Above the fridge', '33 × 12 × 18 in', ['Cake pans, loaf pan and silicone molds', 'The bulk kosher salt box', 'Spare paper towels'],
    'Hard to reach, so only things you need a few times a year.', N, 1, 33, 72, 18, [], 2);
    g.add(at(I.saltBox(), -12.5, 0, 0), at(I.paperTowels(), -7, 0, .5), at(I.cakePan(4.4), 6, 0, 0), at(I.cakePan(4.4), 6, 2.1, 0), at(I.loafPan(), 12.5, 0, 0, PI / 2), at(I.siliconeMold(), 6, 4.2, 0), at(I.siliconeMold('#5aa7d6'), 6, 4.6, .4));
    g.add(B(.75, 16.5, UPPER_D - 1, PLY, 0, 0, -.3));
  }
  { const g = UPPER('U2', 'Glasses and mugs', 'Left of the microwave', '15 × 12 × 36 in', ['Everyday tumblers and pint glasses', 'Mugs'], 'No change: right at the entry and over the fridge-side counter.', N, 34, 15, 54, 36, [12, 24], 1);
    [[-4, '#5b8fd6'], [-1.2, '#5b8fd6'], [1.6, '#7fc7a8'], [4.3, '#e4f1f3']].forEach(([x, c]) => g.add(at(I.glass(1.3, 5.5, c), x, 0, x % 2 ? 1.5 : -1.5)));
    [-3.8, 0, 3.8].forEach(x => g.add(at(I.glass(1.7, 6, '#e4f1f3', .8), x, 12.75, 0)));
    [[-3.6, '#c8312b'], [0, '#f2f0ea'], [3.6, '#2f6cc8']].forEach(([x, c]) => g.add(at(I.mug(1.6, 3.8, c), x, 24.75, 0, PI / 2)));
  }
  { // the microwave over the range
    const ss = I.M.steel();
    N.add(B(30, 16.5, 15.5, ss, 64, 54.5, -UPPER_D - 4.25), B(21, 12.5, .3, mat('#0c0d10', { r: .08, m: .3 }), 59, 56.5, -8.4), B(7.2, 14, .3, mat('#17181b', { r: .2 }), 74.8, 55.5, -8.4), B(.9, 12, 1.4, ss, 70, 57, -7.8));
    N.add(B(4, 1, .1, mat('#0a2a20', { e: '#2ea56b' }), 74.8, 67, -8.2));
  }
  { const g = UPPER('U3', 'Water and travel', 'Above the microwave', '30 × 12 × 18 in', ['Brita filters', 'Water bottles', 'Travel mugs'], 'Light, rarely needed things up high.', N, 49, 30, 71.5, 18.5, [], 2);
    g.add(at(I.britaBox(), -11.5, 0, 0), at(I.britaBox(), -6, 0, 0), at(I.waterBottle('#2a4a7a'), 0, 0, 0), at(I.waterBottle('#c3c7cb'), 3.6, 0, 0), at(I.waterBottle('#7dbb57'), 7.2, 0, .5), at(I.travelMug('#c8312b'), 11.5, 0, 0));
  }
  { const g = UPPER('U4', 'Plates and bowls', 'Right of the microwave (double door)', '25 × 12 × 36 in', ['Dinner plates', 'Side plates', 'Bowls', 'Ramekins and sauce dishes (moved from U7)'], 'Next to the stove for plating, and near the dishwasher.', N, 79, 25, 54, 36, [12, 24], 2);
    g.add(at(I.plates(6, 5, '#e9e6df'), -6, 0, 0), at(I.plates(6, 5, '#f4f1ea'), 6, 0, 0));
    g.add(at(I.plates(5, 4, '#f4f1ea'), -6, 12.75, 0), at(I.bowls(4, 3.4, 2.4, '#f4f1ea'), 6, 12.75, 0));
    g.add(at(I.bowls(3, 4, 2.8, '#f6f3ea'), -6, 24.75, 0), at(I.ramekin(1.6), 4, 24.75, -1.5), at(I.ramekin(1.6), 7.5, 24.75, -1.5), at(I.ramekin(1.3, '#d35d4a'), 5.6, 24.75, 2.2));
  }
  { // U5: the corner upper, a five-sided box with its door on the diagonal
    const pent = [[104, 0], [128, 0], [128, 24], [116, 24], [104, 12]], y0 = 54, h = 36;
    const shape = new THREE.Shape(pent.map(([x, z]) => new THREE.Vector2(x, -z)));
    for (const y of [y0, y0 + 12, y0 + 24, y0 + h - .75]) { const p = mesh(new THREE.ExtrudeGeometry(shape, { depth: .75, bevelEnabled: false }), PLY, 0, y + .75, 0); p.rotation.x = -PI / 2; scene.add(p); }
    for (const y of [y0, y0 + 12, y0 + 24]) { const p = mesh(new THREE.ShapeGeometry(shape), LINER, 0, y + .8, 0); p.rotation.x = -PI / 2; scene.add(p); }
    scene.add(B(.75, h, 12, PLY, 104.4, y0, 6), B(12, h, .75, PLY, 122, y0, 23.6));
    const D = run(104, 12, -PI / 4), L = Math.hypot(12, 12);
    carcass(D, 0, L, y0, h, .1, { top: false });
    const dd = door(D, .25, y0 + .25, L - .5, h - .5, 1, { upper: true });
    addCabinet({ code: 'U5', name: 'Prep bowls and Pyrex', where: 'Corner upper cabinet', size: 'corner, 24 × 24 × 36 in',
      items: ['Pyrex measuring cups', 'Everyday prep bowls', 'Free space for overflow glasses or dishes'], why: 'Mixing bowls and baking dishes went to the island, so this only holds the light prep things you grab most.' },
    D, [dd], { local: new THREE.Vector3(L / 2, y0 + h / 2, -8), dist: 40, lift: -4 });
    const put = (o, x, y, z) => { o.position.set(x, y, z); scene.add(o); };
    put(I.pyrexCup(2.3, 4.5), 112, y0 + .8, 9); put(I.pyrexCup(1.8, 3.6), 117, y0 + .8, 6); put(I.bowls(3, 3.2, 2.2, '#cfd3d6'), 122, y0 + .8, 10);
    put(I.bowls(3, 2.8, 2, '#f4f1ea'), 113, y0 + 12.8, 8); put(I.glass(1.4, 5.5), 120, y0 + 12.8, 8); put(I.glass(1.4, 5.5), 123, y0 + 12.8, 12);
  }
  { const g = UPPER('U6', 'Backup and baking spices', 'Narrow upper by the window', '16 × 12 × 36 in', ['Backup spices', 'Baking spices and extracts', 'All on tiered risers'],
    'Martini glasses and shakers moved to U7; the weekly spices stay on the racks on the fridge.', E, 24, 16, 54, 36, [12, 24], 1);
    g.add(at(I.tieredRiser(13, 9, 3), 0, 0, 0), at(I.tieredRiser(13, 9, 3), 0, 12.75, 0), at(I.jar(1.8, 6, '#f2c230', '#c8312b'), -4, 24.75, 0), at(I.jar(1.5, 5, '#e8e2d0', '#1d1e21'), 0, 24.75, 0), at(I.carton(3, 6, 2.5, '#f4efe2', '#2f6cc8'), 4, 24.75, 0));
  }
  { const g = UPPER('U7', 'Bar and entertaining glassware', 'Above the island’s wall end', '30 × 12 × 30 in', ['Rocks and bar glasses', 'Pint glasses', 'Copper mule mugs', 'Martini glasses and shakers (moved from U6)', 'Wine glasses'],
    'All the bar glassware in one place, over the bar-tools drawer (I2).', run(ISLAND.west + ISLAND_TOP / 2 + 15, ROOM.d - UPPER_D, PI), 0, 30, 58, 30, [10, 20], 2, 0);
    [-11, -8, -5].forEach(x => g.add(at(I.glass(1.5, 3.6, '#e4f1f3', .95), x, 0, 0)));
    [-1, 2.8].forEach(x => g.add(at(I.glass(1.7, 6, '#e4f1f3', .8), x, 0, 0)));
    [7, 11].forEach(x => g.add(at(I.mug(1.7, 3.6, '#c47a4a'), x, 0, 0, PI / 2)));
    g.add(at(I.stemGlass('martini'), -10, 10.75, 0), at(I.stemGlass('martini'), -5.5, 10.75, 0), at(G2(C(1.8, 1.8, 8, mat('#c8312b', { r: .4 }))), 0, 10.75, 0), at(G2(C(1.6, 1.4, 7, I.M.steel())), 4, 10.75, 0), at(I.mug(1.7, 3.6, '#c47a4a'), 9, 10.75, 0, PI / 2));
    [-9, -5, -1, 3].forEach(x => g.add(at(I.stemGlass('wine'), x, 20.75, 0)));
  }
  // the uppers' tops are clear: the blenders and food processor went into the island

  // ===== the island's surroundings and the things out on the counters
  { const put = (o, x, y, z, ry = 0) => { o.position.set(x, y, z); o.rotation.y = ry; scene.add(o); return o; };
    put(I.crock(), 42, COUNTER, 8); put(I.oilBottle(), 37, COUNTER, 5); put(I.oilBottle('#c8a23a'), 39.6, COUNTER, 3.5); put(I.bottle(1.1, 9, '#f2f0ea'), 46, COUNTER, 4);
    put(I.cuttingBoard(11, 14), 86, COUNTER + 6.7, 2.8).rotation.x = -1.35;
    put(I.waterBottle('#2a4a7a'), 88.5, COUNTER, 16);
    put(I.toaster(), 116, COUNTER, 7, 0); put(I.paperTowels(), 102, COUNTER, 18); put(C(3.2, 3.2, .5, I.M.steel()), 102, COUNTER, 18);
    put(I.blender('#1d1e21', 9), 124, COUNTER, 16);   // the one blender used daily stays out
    put(I.wireBasketTiers(), 119, COUNTER, 30); put(I.dishRack(), 119, COUNTER, 46, PI / 2); put(I.bottle(1.1, 7, '#3a6fc0'), 126, COUNTER, 70);
    put(I.toasterOven(), ISLAND.west + 22, COUNTER, ROOM.d - 7, 0);
    put(I.lunchBag('#5aa7d6'), ISLAND.west + 8, COUNTER, ROOM.d - 18, .2); put(I.lunchBag('#6a7a4a'), ISLAND.west + 20, COUNTER, ROOM.d - 21, -.1);
    put(I.fruitBowl(), ISLAND.west + 20, COUNTER, 96); put(I.cuttingBoard(10, 14), ISLAND.west + 23, COUNTER, 112);
    // window sill things
    for (const [z, c] of [[60, '#f2c230'], [64, '#c8312b'], [90, '#2f8a47']]) put(I.mug(1.4, 3.2, c), ROOM.w - 3, 42, z);
    // the stool at the island's seating side (the second one clipped into the pantry rack)
    { const blk = mat('#202124', { r: .5 });
      put(new THREE.Group(), ISLAND.west - 6, 0, 102).add(C(6.5, 6.5, 1.5, blk, 0, 22.5), C(.5, .5, 22.5, blk, 0, 0), C(5.5, 6.5, .5, blk, 0, 0), mesh(new THREE.TorusGeometry(5.5, .35, 6, 24), blk, 0, 9, 0).rotateX(PI / 2));
    }
    // the rolling wire cart under the island's free end
    { const blk = mat('#1d1e21', { m: .5, r: .45 }), cart = put(new THREE.Group(), ISLAND.front - 9, 0, ISLAND.north + 9);
      for (const sx of [-7, 7]) for (const sz of [-6, 6]) cart.add(C(.35, .35, 30, blk, sx, 1, sz));
      for (const y of [4, 15, 29]) cart.add(B(15, .4, 13, blk, 0, y, 0));
      cart.add(at(I.cakePan(5.5, '#e6e2d6'), -3, 15.4, 0), at(I.carton(5, 7, 3, '#f2c230', '#c8312b'), 4, 4.4, 0), at(I.pan(5, '#e6e2d6', 5), 0, 29.4, 0));
    }
    // the wire pantry rack by the south window, the trash and the recycling
    { const blk = mat('#1d1e21', { m: .5, r: .45 }), rack = put(new THREE.Group(), 16, 0, ROOM.d - 8);
      for (const sx of [-14, 14]) for (const sz of [-6.5, 6.5]) rack.add(C(.4, .4, 56, blk, sx, 0, sz));
      for (const y of [3, 17, 30, 43, 55]) rack.add(B(29, .4, 14, blk, 0, y, 0));
      rack.add(at(I.carton(9, 6, 5, '#e8e2d0', '#9b3b23'), -9, 3.4, 0), at(I.jar(2.6, 4.5, '#f2f0ea', '#c8312b'), 9, 3.4, 0), at(I.bottle(1.5, 9, '#c8a23a', { glassy: true }), 2, 30.4, 0), at(I.bottle(1.3, 8, '#5b2a1a'), -3, 30.4, 1));
      rack.add(at(I.carton(4, 6, 4, '#c8312b', '#ffffff'), 8, 43.4, 0), at(I.jar(2.2, 3.5, '#d9b44a', '#1d1e21'), -6, 43.4, 0), at(I.jar(3, 6, '#f2f0ea', '#2f6cc8'), 0, 55.4, 0), at(I.carton(6, 5, 4, '#e9d9a8', '#7a5532'), -8, 17.4, 0));
      for (let i = 0; i < 4; i++) rack.add(at(I.carton(3, 4, 6, '#e6c88a', '#c8312b'), -10 + i * 3.4, 17.4, 0));
      put(G2(B(14, 26, 11, mat('#1d1e21', { r: .4 })), B(14.4, 1.5, 11.4, mat('#2a2b2e', { r: .35 }), 0, 26)), ROOM.w - 8.5, 0, 121);
      put(G2(B(14, 22, 10, mat('#2a63c4', { r: .45 })), B(14.3, 1.6, 10.4, mat('#2a63c4', { r: .45 }), 0, 22)), ROOM.w - 17, 0, ROOM.d - 5.5);
    }
    // the rug in the aisle
    const rug = mesh(new THREE.PlaneGeometry(22, 58), mat('#ffffff', { map: rugTex(), r: .95 }), (ISLAND.east + SINK_EDGE) / 2, .08, 82);
    rug.rotation.x = -PI / 2; scene.add(rug);
  }

  // ===== interaction: hover a front to name it, click to open or close, panel list to fly there
  const byCode = Object.fromEntries(openables.map(o => [o.code, o]));
  scene.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster(), ptr = new THREE.Vector2();
  const tip = document.createElement('div'); tip.className = 'ktip'; tip.hidden = true; document.body.appendChild(tip);
  let hovered = null, selected = null, down = null;
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    ptr.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    raycaster.setFromCamera(ptr, camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    return hit ? hit.object.userData.op : null;
  }
  function setHover(o, e) {
    if (hovered && hovered !== o) for (const m of hovered.fronts) m.emissive.set('#000000');
    hovered = o;
    if (o) for (const m of o.fronts) m.emissive.set('#3a2a12');
    canvas.style.cursor = o ? 'pointer' : '';
    tip.hidden = !o;
    if (o) { tip.textContent = `${o.code} · ${o.name} — click to ${o.goal ? 'close' : 'open'}`; tip.style.left = e.clientX + 'px'; tip.style.top = e.clientY + 'px'; }
  }
  canvas.addEventListener('pointermove', e => {
    if (aboard) { if (e.buttons) transit.look(e.movementX, e.movementY); return; }
    if (e.buttons) { setHover(null); return; }
    // over a monorail car you can board: a hand and "Ride the ..." (a click boards it)
    const r = canvas.getBoundingClientRect(), car = transit.pick(camera, e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    if (car) {
      setHover(null); canvas.style.cursor = 'pointer'; tip.hidden = false;
      tip.textContent = `Ride the ${mini.slots[car.i].lineName} — click to get on`; tip.style.left = e.clientX + 'px'; tip.style.top = e.clientY + 'px';
      return;
    }
    setHover(pick(e), e);
  });
  canvas.addEventListener('pointerleave', () => setHover(null));
  canvas.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5 || aboard) return;
    const r = canvas.getBoundingClientRect(), car = transit.pick(camera, e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    if (car) { board(() => transit.board(car)); return; }
    const o = pick(e); if (!o) return;
    toggle(o, !o.goal); show(o.goal ? o : null); setHover(o, e);
  });

  // camera flights
  let flight = null;
  // the mini monorails, boarded like the cities' trains: the shared ride system (subway.js), empty
  // but for these cars, gives the walkable monorail cabin, its next-stop sign and the line diagram
  const mini = buildMiniRail(scene);
  const transit = buildSubway(scene, { lines: [], tracks: [], runs: [], platforms: [], stations: [], entrances: [], sections: [] }, null);
  transit.registerFleet('monorail', mini.fleet, mini.slots);
  const linesLit = mini.highlight(renderer), ridebar = createRidebar({ rideStrip: transit.rideStrip });
  let aboard = false;
  const keys = {};
  function board(go) {
    if (!go()) return;
    transit.look(-Math.PI / .0045, 0);   // turn round to face the cabin's passenger, who waves
    aboard = true; flight = null; controls.enabled = false; setHover(null); show(null);
    camera.near = .03; camera.updateProjectionMatrix(); syncAboard();
  }
  function getOff() {
    const out = transit.leave(); aboard = false; controls.enabled = true;
    camera.near = .5; camera.updateProjectionMatrix();
    if (out) {   // step back from the car and look at it
      camera.position.copy(out.p).addScaledVector(out.dir, -16).add(new THREE.Vector3(0, 9, 0)).addScaledVector(new THREE.Vector3(-out.dir.z, 0, out.dir.x), 8);
      controls.target.copy(out.p); controls.update();
    }
    syncAboard();
  }
  const move = () => transit.move((keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0), (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0));
  window.addEventListener('keydown', e => {
    if (!aboard || (e.target.closest && e.target.closest('input, select, textarea'))) return;
    if (e.key === 'Escape') { getOff(); return; }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) { keys[e.code] = true; move(); e.preventDefault(); }
  });
  window.addEventListener('keyup', e => { if (keys[e.code]) { keys[e.code] = false; move(); } });
  function fly(pos, target, ms = 900) { flight = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target, start: performance.now(), ms }; }
  function lookAt(o) {
    if (o.look.world) return fly(o.look.cam.clone(), o.look.world.clone());
    const target = o.run.localToWorld(o.look.local.clone());
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(o.run.getWorldQuaternion(new THREE.Quaternion()));
    fly(target.clone().addScaledVector(normal, o.look.dist).add(new THREE.Vector3(0, o.look.lift, 0)), target);
  }
  function toggle(o, open) { o.goal = open ? 1 : 0; syncList(); }

  // ---- the panel: views, open/close everything, every storage spot, and the details card
  const VIEWS = [
    ['Whole kitchen', [-34, 215, 222], [66, 18, 62]],
    ['From the doorway', [-26, 64, 34], [92, 36, 82]],
    ['Stove wall', [64, 66, 118], [64, 46, 6]],
    ['Sink wall', [30, 66, 76], [118, 40, 74]],
    ['Island', [100, 62, 50], [52, 26, 116]],
    ['Upper cabinets', [62, 58, 96], [94, 72, 8]],
  ];
  const body = document.getElementById('hud-body');
  const box = document.createElement('div'); box.className = 'kitchen-panel';
  const viewRow = document.createElement('div'); viewRow.className = 'views'; viewRow.innerHTML = '<span class="views-h">Go to</span><div class="row"></div>';
  for (const [label, p, t] of VIEWS) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'ghost'; b.textContent = label;
    b.addEventListener('click', () => fly(new THREE.Vector3(...p), new THREE.Vector3(...t)));
    viewRow.lastChild.appendChild(b);
  }
  const allRow = document.createElement('div'); allRow.className = 'row kall';
  const openAll = document.createElement('button'); openAll.type = 'button'; openAll.textContent = 'Open everything';
  const closeAll = document.createElement('button'); closeAll.type = 'button'; closeAll.className = 'ghost'; closeAll.textContent = 'Close everything';
  openAll.addEventListener('click', () => { for (const o of openables) o.goal = 1; show(null); syncList(); });
  closeAll.addEventListener('click', () => { for (const o of openables) o.goal = 0; show(null); syncList(); });
  allRow.append(openAll, closeAll);
  const list = document.createElement('div'); list.className = 'views klist';
  const GROUPS = [['Drawers', ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'I1', 'I2', 'I3', 'I4', 'R']], ['Base cabinets', ['B1', 'B2', 'S', 'IA', 'IB']], ['Upper cabinets', ['U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U7']]];
  const listBtns = new Map();
  for (const [h, codes] of GROUPS) {
    const head = document.createElement('span'); head.className = 'views-h'; head.textContent = h;
    const row = document.createElement('div'); row.className = 'row';
    for (const c of codes) {
      const o = byCode[c], b = document.createElement('button'); b.type = 'button'; b.className = 'ghost';
      b.innerHTML = `<b>${c === 'R' ? 'Range' : c === 'S' ? 'Under D6' : c}</b> ${o.name}`;
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => { const opening = !(selected === o && o.goal); if (opening) { toggle(o, true); show(o); lookAt(o); } else { toggle(o, false); show(null); } });
      listBtns.set(o, b); row.appendChild(b);
    }
    list.append(head, row);
  }
  // the mini monorails: show the lines; each line's name, colour and stations, and a button to ride
  // it (sit in its lead car, as "Ride a line" does in the cities); Get off while aboard
  const railRow = document.createElement('div'); railRow.className = 'views klines';
  railRow.innerHTML = '<span class="views-h">Mini monorail</span>';
  const railCtl = document.createElement('div'); railCtl.className = 'row';
  const showLines = document.createElement('button'); showLines.type = 'button'; showLines.className = 'ghost'; showLines.textContent = 'Show lines';
  showLines.setAttribute('aria-pressed', 'false');
  showLines.addEventListener('click', () => { const on = linesLit.set(!linesLit.get()); showLines.textContent = on ? 'Hide lines' : 'Show lines'; showLines.setAttribute('aria-pressed', String(on)); });
  const offBtn = document.createElement('button'); offBtn.type = 'button'; offBtn.textContent = 'Get off'; offBtn.hidden = true;
  offBtn.addEventListener('click', getOff);
  const aboardHint = document.createElement('p'); aboardHint.className = 'khint'; aboardHint.hidden = true;
  aboardHint.textContent = 'Drag to look around, W A S D to walk, Esc to get off.';
  railCtl.append(showLines, offBtn); railRow.append(railCtl, aboardHint);
  const rideBtns = [];
  mini.lines.forEach((l, i) => {
    const item = document.createElement('div'); item.className = 'kline';
    const name = document.createElement('b'), dot = document.createElement('span'); dot.className = 'kdot'; dot.style.background = l.color;
    name.append(dot, l.name);
    const stops = document.createElement('span'); stops.className = 'kstops'; stops.textContent = l.stations.join(' · ');
    const b = document.createElement('button'); b.type = 'button'; b.className = 'ghost'; b.textContent = 'Ride';
    b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', `Ride the ${l.name}`);
    b.addEventListener('click', () => { if (aboard) transit.leave(); board(() => transit.boardLine('kmono:' + l.id)); });
    rideBtns.push(b); item.append(name, b, stops); railRow.appendChild(item);
  });
  function syncAboard() {
    const on = aboard && transit.getRide(), id = on ? on.line : null;
    rideBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(id === 'kmono:' + mini.lines[i].id)));
    offBtn.hidden = !aboard; aboardHint.hidden = !aboard;
  }
  box.append(allRow, viewRow, railRow, list);
  body.insertBefore(box, body.querySelector('.clock'));
  // fold the panel down to its title (folded to start with on small screens)
  { const hud = document.querySelector('.hud .card'), btn = document.getElementById('fold');
    const fold = on => {
      body.hidden = on; hud.classList.toggle('folded', on); btn.setAttribute('aria-expanded', String(!on));
      const t = on ? 'Expand the panel' : 'Collapse the panel'; btn.setAttribute('aria-label', t); btn.title = t;
    };
    fold(window.innerWidth < 640);
    btn.addEventListener('click', () => fold(!body.hidden));
  }
  function syncList() { for (const [o, b] of listBtns) b.setAttribute('aria-pressed', String(!!o.goal)); }

  const card = document.createElement('aside'); card.className = 'kinfo'; card.hidden = true; card.setAttribute('aria-live', 'polite');
  document.getElementById('city-view').appendChild(card);
  function show(o) {
    selected = o; card.hidden = !o; if (!o) return;
    card.innerHTML = '';
    const h = document.createElement('h2'), code = document.createElement('span'); code.className = 'kcode'; code.textContent = o.code === 'R' ? 'Range' : o.code === 'S' ? 'Under D6' : o.code;
    h.append(code, ' ', o.name);
    const where = document.createElement('p'); where.className = 'kwhere'; where.textContent = `${o.where} · ${o.size}`;
    const ul = document.createElement('ul'); for (const it of o.items) { const li = document.createElement('li'); li.textContent = it; ul.appendChild(li); }
    const why = document.createElement('p'); why.className = 'kwhy'; why.textContent = o.why;
    const x = document.createElement('button'); x.type = 'button'; x.className = 'ghost kclose'; x.textContent = 'Close it';
    x.addEventListener('click', () => { toggle(o, false); show(null); });
    card.append(h, where, ul, why, x);
  }

  // ---- the loop
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w < 600 ? 64 : 50; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();
  const [p0, t0] = [VIEWS[0][1], VIEWS[0][2]];
  camera.position.set(...p0); controls.target.set(...t0); controls.update();

  let last = performance.now();
  const ease = t => t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    for (const o of openables) {
      if (o.t === o.goal) continue;
      o.t = o.goal > o.t ? Math.min(o.goal, o.t + dt * 2.2) : Math.max(o.goal, o.t - dt * 2.2);
      o.set(ease(o.t));
    }
    mini.update(dt, aboard ? null : camera);   // (outside, a chef waves when you look at him)
    transit.update(dt, aboard ? camera : null);   // the cars' slots follow them; aboard, the camera rides in the cabin
    ridebar.update(now);
    if (flight) {
      const k = Math.min(1, (now - flight.start) / flight.ms), e = ease(k);
      camera.position.lerpVectors(flight.p0, flight.p1, e); controls.target.lerpVectors(flight.t0, flight.t1, e);
      if (k >= 1) flight = null;
    }
    if (!aboard) controls.update();
    // a wall seen from outside disappears (it faces inward), so hide its trim, door and window too
    for (const w of WALLS) w.visible = w.worldToLocal(_v.copy(camera.position)).z > -1;
    renderer.render(scene, camera);
  }
  return {
    scene, camera, controls, openables, byCode, mini, transit,
    open(code, on = true) { const o = byCode[code]; toggle(o, on); show(on ? o : null); if (on) lookAt(o); },
    start() {
      return new Promise(resolve => {
        let first = true;
        renderer.setAnimationLoop(now => { frame(now); if (first) { first = false; resolve(); } });
      });
    },
  };
}

// ---- small helpers shared by the builders above
function at(o, x, y, z, ry = 0) { o.position.set(x, y, z); o.rotation.y = ry; return o; }
function rod(r, len, m, x, y, z) { const o = mesh(new THREE.CylinderGeometry(r, r, len, 12), m, x, y, z); o.rotation.z = PI / 2; return o; }
function G2(...kids) { const g = new THREE.Group(); for (const k of kids) g.add(k); return g; }
