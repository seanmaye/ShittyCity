// The things that live in the 1938 Pine St kitchen: plates, pots, knives, spice jars and the
// rest, modelled roughly to size in inches. Every builder returns a THREE.Group whose origin is
// the bottom centre of the item, so it can be stood on a shelf or laid in a drawer.
import * as THREE from 'three';

const mats = new Map();
/** a shared MeshStandardMaterial: o.r roughness, o.m metalness, o.op opacity, o.map texture */
export function mat(color, o = {}) {
  const key = [color, o.r, o.m, o.op, o.map && o.map.uuid, o.side, o.e].join('|');
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, roughness: o.r ?? .6, metalness: o.m ?? 0, map: o.map || null,
      transparent: o.op != null, opacity: o.op ?? 1, depthWrite: o.op == null,
      side: o.side ?? THREE.FrontSide, emissive: o.e || '#000000',
    });
    mats.set(key, m);
  }
  return m;
}
export const M = {
  steel: () => mat('#c9ccd0', { m: .55, r: .3 }),
  darkSteel: () => mat('#4a4d52', { m: .7, r: .4 }),
  black: () => mat('#1d1e21', { r: .45 }),
  white: () => mat('#f2f0ea', { r: .5 }),
  glass: () => mat('#e4f1f3', { r: .06, op: .3, side: THREE.DoubleSide }),
  wood: () => mat('#b98a55', { r: .7 }),
  bamboo: () => mat('#d8b27a', { r: .65 }),
  copper: () => mat('#c47a4a', { m: .8, r: .35 }),
};

export function mesh(geo, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o;
}
/** box with its bottom at y */
export const B = (w, h, d, m, x = 0, y = 0, z = 0) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y + h / 2, z);
/** cylinder with its bottom at y */
export const C = (rt, rb, h, m, x = 0, y = 0, z = 0, seg = 20, open = false) =>
  mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), m, x, y + h / 2, z);
const G = (...kids) => { const g = new THREE.Group(); for (const k of kids) if (k) g.add(k); return g; };
const at = (o, x, y, z, ry = 0) => { o.position.set(x, y, z); o.rotation.y = ry; return o; };
/** lay an item on its side (along z), e.g. a utensil in a drawer */
export const lay = (o, x, y, z, ry = 0) => { const g = G(o); o.rotation.x = -Math.PI / 2; g.position.set(x, y, z); g.rotation.y = ry; return g; };

// ---- dishes and glassware
function lathe(profile, m, seg = 28) {
  return mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg), m);
}
export function bowl(r, h, color, o = {}) {
  const m = o.m || mat(color, { r: .35, side: THREE.DoubleSide });
  return G(lathe([[0, 0], [r * .45, 0], [r * .5, .15], [r * .85, h * .45], [r, h], [r * .97, h]], m));
}
export function bowls(n, r, h, color) {
  const g = G(); for (let i = 0; i < n; i++) g.add(at(bowl(r, h, color), 0, i * h * .28, 0)); return g;
}
export function plates(n, r, color, rim = '#ffffff') {
  const g = G(), m = mat(color, { r: .3 });
  for (let i = 0; i < n; i++) g.add(lathe([[0, 0], [r * .7, 0], [r * .72, .25], [r, .55], [r * .98, .62], [r * .7, .3], [0, .3]], m).translateY(i * .42));
  return g;
}
export function glass(r, h, tint = '#e4f1f3', taper = .85) {
  const m = mat(tint, { r: .06, op: .35, side: THREE.DoubleSide });
  return G(C(r, r * taper, h, m, 0, 0, 0, 18, true), C(r * taper, r * taper, .35, m));
}
export function mug(r, h, color) {
  const m = mat(color, { r: .4 });
  const handle = mesh(new THREE.TorusGeometry(h * .28, r * .14, 8, 16, Math.PI), m, r * .95, h * .5, 0);
  handle.rotation.z = -Math.PI / 2;
  return G(C(r, r, h, m, 0, 0, 0, 20, true), C(r, r, .25, m), handle);
}
export function stemGlass(kind = 'martini') {
  const m = M.glass(), g = G(C(1.4, 1.5, .15, m), C(.12, .12, 3.3, m, 0, .15));
  if (kind === 'martini') g.add(C(2.3, .1, 2.2, m, 0, 3.4, 0, 20, true));
  else g.add(lathe([[0, 0], [1.2, .6], [1.5, 2], [1.3, 3.4]], m).translateY(3.4));
  return g;
}
export function pyrexCup(r, h) {
  const m = M.glass(), red = mat('#c8312b', { r: .5 });
  const handle = mesh(new THREE.TorusGeometry(h * .32, .25, 6, 12, Math.PI), m, r + .2, h * .5, 0); handle.rotation.z = -Math.PI / 2;
  const g = G(C(r, r * .95, h, m, 0, 0, 0, 20, true), C(r * .95, r * .95, .3, m), handle);
  for (let i = 1; i < 4; i++) g.add(B(.08, .08, r * .5, red, -r * .99, h * i / 4.5, 0));
  return g;
}
export function bakingDish(w, d, h) {
  const m = M.glass();
  const g = G(B(w, .3, d, m));
  g.add(B(w, h, .25, m, 0, 0, d / 2), B(w, h, .25, m, 0, 0, -d / 2), B(.25, h, d, m, w / 2), B(.25, h, d, m, -w / 2));
  return g;
}
export function ramekin(r, color = '#f4f1ea') { return G(C(r, r * .92, r * .9, mat(color, { r: .35 }), 0, 0, 0, 18, true), C(r * .92, r * .92, .2, mat(color))); }

// ---- cookware
export function pot(r, h, o = {}) {
  const s = o.m || M.steel(), g = G(C(r, r, h, s, 0, 0, 0, 24, true), C(r, r, .2, s));
  for (const sx of [-1, 1]) g.add(B(1.2, .4, 1, s, sx * (r + .5), h - 1.2));
  if (o.long) g.add(B(o.long, .5, 1, s, r + o.long / 2, h - .8));
  if (o.lid !== false) {
    const lid = o.glassLid ? M.glass() : s;
    g.add(lathe([[0, h + 1.1], [r * .3, h + 1], [r * .9, h + .3], [r + .1, h]], lid), C(.5, .4, .7, M.black(), 0, h + 1));
  }
  return g;
}
export function pan(r, color = '#2a2b2e', handle = 8) {
  const g = G(lathe([[0, 0], [r * .8, 0], [r, 1.8], [r + .15, 1.8]], mat(color, { r: .4, m: .3, side: THREE.DoubleSide })));
  g.add(B(handle, .5, 1, M.steel(), r + handle / 2, 1.2));
  return g;
}
export function lid(r, glassy = true) {
  return G(lathe([[0, .8], [r * .3, .75], [r, 0]], glassy ? M.glass() : M.steel()), C(.5, .4, .6, M.black(), 0, .7));
}
export function mixingBowl(r, h, color) { return bowl(r, h, color, { m: color ? undefined : mat('#cfd3d6', { m: .85, r: .25, side: THREE.DoubleSide }) }); }
export function slowCooker() {
  const g = G(C(6.5, 6, 8, M.steel()), C(6.6, 6.6, 1, M.black(), 0, 0));
  g.scale.set(1.3, 1, 1);
  g.add(lathe([[0, 10.2], [3, 10], [6, 8.6], [6.4, 8]], M.glass()), C(.8, .6, .9, M.black(), 0, 10));
  for (const sx of [-1, 1]) g.add(B(1.3, 1, 3, M.black(), sx * 6.9, 6.5));
  return g;
}
export function riceCooker() {
  const g = G(C(5.2, 5, 7, M.white()), lathe([[0, 9.3], [3, 9.1], [5, 8], [5.2, 7]], M.white()));
  g.add(B(2.4, 1.6, .4, M.black(), 0, 3, 5.1), B(3, .7, 1.5, M.darkSteel(), 0, 9, 0));
  return g;
}
export function multiCooker() {
  const g = G(C(6, 6, 9, M.steel()), C(6.1, 6.1, 1.2, M.black(), 0, 0), lathe([[0, 11.5], [3, 11.2], [6, 9.6], [6.2, 9]], M.steel()));
  g.add(B(3.5, 2, .6, M.black(), 0, 3.5, 6), C(.9, .9, 1, M.black(), 0, 11.2));
  return g;
}
export function blender(baseColor = '#1d1e21', jar = 8) {
  return G(B(6, 5, 6, mat(baseColor, { r: .35 })), C(3, 2.3, jar, M.glass(), 0, 5), C(3.1, 3.1, 1, M.black(), 0, 5 + jar));
}
export function blenderJar(h = 8) { return G(C(2.8, 2.2, h, M.glass()), C(2.9, 2.9, .8, M.black(), 0, h)); }
export function foodProcessor() {
  return G(B(7, 5, 8, M.white()), C(3.6, 3.6, 6, M.glass(), 0, 5), C(3.7, 3.7, .6, M.glass(), 0, 11), C(.9, .9, 3, M.white(), 2, 11.5));
}
export function immersionBlender() {
  const g = G(C(1, 1.1, 8, M.white()), C(.4, .4, 6, M.steel(), 0, -6), C(1.2, 1, 1.4, M.steel(), 0, -7.2));
  return lay(g, 0, 1.1, 0);
}
export function bakingSheet(w, d, color = '#9da2a6') {
  const m = mat(color, { m: .6, r: .45 });
  return G(B(w, .15, d, m), B(w, .6, .2, m, 0, 0, d / 2), B(w, .6, .2, m, 0, 0, -d / 2), B(.2, .6, d, m, w / 2), B(.2, .6, d, m, -w / 2));
}
export function muffinTin(w = 10.5, d = 14) {
  const m = mat('#3c3e42', { m: .5, r: .45 }), g = G(B(w, .3, d, m, 0, 1));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) g.add(C(1.4, 1.1, 1.2, m, -3.3 + i * 3.3, 0, -4.9 + j * 3.3, 12, true));
  return g;
}
export function coolingRack(w = 10, d = 15) {
  const m = mat('#9fa3a7', { m: .7, r: .4 }), g = G();
  for (let i = 0; i <= 8; i++) g.add(B(.12, .12, d, m, -w / 2 + i * w / 8, .5));
  for (let j = 0; j <= 10; j++) g.add(B(w, .12, .12, m, 0, .62, -d / 2 + j * d / 10));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(B(.2, .5, .2, m, sx * (w / 2 - .5), 0, sz * (d / 2 - .5)));
  return g;
}
export function loafPan() { return bakingDishMetal(5, 9, 2.6); }
function bakingDishMetal(w, d, h) { const m = mat('#3c3e42', { m: .5, r: .45 }); return G(B(w, .2, d, m), B(w, h, .2, m, 0, 0, d / 2), B(w, h, .2, m, 0, 0, -d / 2), B(.2, h, d, m, w / 2), B(.2, h, d, m, -w / 2)); }
export function cakePan(r = 4.5, color = '#3c3e42') { return G(C(r, r, 2, mat(color, { m: .5, r: .45, side: THREE.DoubleSide }), 0, 0, 0, 24, true), C(r, r, .15, mat(color, { m: .5 }))); }
export function pizzaStone(w = 14, d = 16) { return G(B(w, .6, d, mat('#d9cdb6', { r: .9 }))); }
export function rollingPin() { return lay(G(C(1.1, 1.1, 12, M.wood()), C(.5, .5, 3, M.wood(), 0, 12), C(.5, .5, 3, M.wood(), 0, -3)), 0, 1.1, 0); }
export function siliconeMold(color = '#e8642f') {
  const m = mat(color, { r: .8 }), g = G(B(8, .3, 5, m));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) g.add(C(.9, .9, 1, m, -2.6 + i * 2.6, 0, -1.2 + j * 2.4, 6));
  return g;
}
export function panRack(n, w, d) {
  const m = mat('#2a2b2e', { m: .6, r: .4 }), g = G(B(w, .3, d, m));
  for (let i = 0; i <= n; i++) g.add(B(.25, 8, .25, m, -w / 2 + i * w / n, .3, -d / 2 + 1), B(.25, 8, .25, m, -w / 2 + i * w / n, .3, d / 2 - 1));
  return g;
}
export function panOnEdge(r, color) {
  const p = pan(r, color, 7); p.rotation.z = Math.PI / 2; p.rotation.y = 0; const g = G(p);
  p.position.set(.9, r + .3, 0); g.rotation.y = Math.PI / 2; return g;
}
export function colander() {
  const m = mat('#c9372f', { r: .45, side: THREE.DoubleSide });
  return G(lathe([[0, .8], [2.5, .8], [4, 1.5], [5, 4.2], [5.3, 4.4]], m), C(2.2, 2.6, .8, m, 0, 0, 0, 16, true));
}
export function saladSpinner() { return G(C(5, 4.5, 5, mat('#e7f0ea', { r: .3, op: .75 })), C(5.1, 5.1, .7, mat('#7dbb57', { r: .4 }), 0, 5), C(.7, .7, 1.2, M.white(), 0, 5.7)); }

// ---- boxes, bottles, jars
/** a carton with a coloured band near the top, e.g. foil or zip bags */
export function carton(w, h, d, color, band = '#ffffff') {
  return G(B(w, h, d, mat(color, { r: .7 })), B(w + .02, h * .22, d + .02, mat(band, { r: .7 }), 0, h * .6));
}
export function wrapBox(len, color, band) {   // foil / parchment / plastic wrap, lying down
  return G(B(len, 2, 2, mat(color, { r: .65 })), B(len + .02, .5, 2.02, mat(band, { r: .6 }), 0, 1.2));
}
export function roll(r, len, color = '#fbfbf8') { return lay(G(C(r, r, len, mat(color, { r: .85 }), 0, -len / 2)), 0, r, 0); }
export function paperTowels() { return G(C(2.8, 2.8, 11, mat('#fbfbf8', { r: .9 })), C(.8, .8, 11.1, mat('#b49a74'))); }
export function bottle(r, h, color, o = {}) {
  const m = o.glassy ? mat(color, { r: .1, op: .7 }) : mat(color, { r: .35 });
  return G(C(r, r, h * .7, m), C(r * .35, r, h * .18, m, 0, h * .7), C(r * .32, r * .32, h * .12, mat(o.cap || '#1d1e21'), 0, h * .88));
}
export function jar(r, h, body, cap) {
  return G(C(r, r, h, mat(body, { r: .5 })), C(r * 1.02, r * 1.02, h * .22, mat(cap, { r: .4 }), 0, h));
}
const SPICE = [['#9b3b23', '#c8312b'], ['#c8892a', '#2f8a47'], ['#6b5a2a', '#1d1e21'], ['#d9b44a', '#c8312b'], ['#4c6b2d', '#2f8a47'], ['#b8411f', '#f2f0ea'], ['#7a5532', '#c8312b'], ['#e4d6a8', '#1d1e21']];
export function spiceRow(n, gap = 2) {
  const g = G();
  for (let i = 0; i < n; i++) { const [b, c] = SPICE[i % SPICE.length]; g.add(at(jar(.9, 3.2 + (i % 3) * .4, b, c), (i - (n - 1) / 2) * gap, 0, 0)); }
  return g;
}
export function tieredRiser(w, d, rows = 3) {
  const m = mat('#e9e6df', { r: .5 }), g = G(), step = d / rows;
  for (let i = 0; i < rows; i++) {
    g.add(B(w, .3 + i * 1.6, step, m, 0, 0, d / 2 - step / 2 - i * step));
    g.add(at(spiceRow(Math.floor(w / 2.1)), 0, .3 + i * 1.6, d / 2 - step / 2 - i * step));
  }
  return g;
}
export function container(w, h, d, lidColor) {
  return G(B(w, h, d, mat('#eef6f8', { r: .2, op: .45 })), B(w + .2, .4, d + .2, mat(lidColor, { r: .4 }), 0, h));
}
export function containerStack(n, w, h, d, lidColor) {
  const g = G(); for (let i = 0; i < n; i++) g.add(at(container(w - i * .4, h, d - i * .4, lidColor), 0, i * (h + .45), 0)); return g;
}
export function waterBottle(color) { return G(C(1.6, 1.6, 9.5, mat(color, { r: .4, m: .3 })), C(1.1, 1.1, 1.5, M.black(), 0, 9.5)); }
export function travelMug(color) { return G(C(1.7, 1.4, 7, mat(color, { r: .4, m: .3 })), C(1.75, 1.75, 1.2, M.black(), 0, 7)); }

// ---- utensils and tools (lying in drawers, length along z, origin at their middle)
const H = (len, color, w = .9, t = .5) => B(w, t, len, mat(color, { r: .5 }));
export function turner(color = '#1d1e21') { return G(at(H(7, color), 0, 0, 2), B(3, .2, 4, mat(color, { r: .5 }), 0, 0, -3.5)); }
export function spatula(color = '#c8312b') { return G(at(H(8, '#f2f0ea'), 0, 0, 1.5), B(2.4, .25, 3.2, mat(color, { r: .6 }), 0, 0, -4)); }
export function tongs() { const s = M.steel(); return G(B(1, .5, 11, s, -.5), B(1, .5, 11, s, .5, .5)); }
export function ladle(color = '#1d1e21') { return G(at(H(9, color), 0, 1, 2), mesh(new THREE.SphereGeometry(1.3, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(color, { r: .5, side: THREE.DoubleSide }), 0, 1.35, -4.2)); }
export function whisk() {
  const s = M.steel(), g = G(at(C(.45, .45, 5, s), 0, .45, 3.5));
  g.children[0].rotation.x = Math.PI / 2; g.children[0].position.set(0, .45, 3.5);
  for (let i = 0; i < 4; i++) {
    const loop = mesh(new THREE.TorusGeometry(1.1, .05, 4, 16), s, 0, .9, -1.5); loop.scale.set(1, 1, 3); loop.rotation.set(0, 0, i * Math.PI / 4); g.add(loop);
  }
  return g;
}
export function spoonWood() { const h = mesh(new THREE.SphereGeometry(1, 12, 8), M.wood(), 0, .15, -4); h.scale.set(1, .3, 1.5); return G(at(H(9, '#b98a55', .6, .35), 0, 0, 1.5), h); }
export function knife(len = 12, handle = '#1d1e21') {
  const blade = new THREE.Shape(); blade.moveTo(0, 0); blade.lineTo(1.6, 0); blade.lineTo(.1, len * .62); blade.lineTo(0, len * .62);
  const b = mesh(new THREE.ExtrudeGeometry(blade, { depth: .08, bevelEnabled: false }), mat('#d4d8db', { m: .9, r: .25 }));
  b.rotation.x = -Math.PI / 2; b.position.set(-.8, .3, -len * .2);
  return G(at(B(.9, .7, len * .38, mat(handle, { r: .45 })), 0, 0, len * .3), b);
}
export function shears() {
  const h = mat('#c8312b', { r: .5 }), s = M.steel();
  const r1 = mesh(new THREE.TorusGeometry(.9, .25, 6, 14), h, -.8, .25, 2.6), r2 = mesh(new THREE.TorusGeometry(.9, .25, 6, 14), h, .8, .25, 2.6);
  r1.rotation.x = r2.rotation.x = Math.PI / 2;
  return G(r1, r2, B(.5, .2, 5, s, -.2, .1, -1.5), B(.5, .2, 5, s, .2, .3, -1.5));
}
export function peeler() { return G(at(H(4, '#2f8a47', .9, .6), 0, 0, 1.5), B(1.6, .2, 2, M.steel(), 0, .1, -1.8)); }
export function canOpener() {
  const r = mat('#1d1e21', { r: .5 });
  return G(B(.8, .5, 6, r, -.6, 0, 1), B(.8, .5, 6, r, .6, 0, 1), C(1, 1, .6, M.steel(), 0, 0, -2.6));
}
export function garlicPress() { const s = M.steel(); return G(B(.8, .6, 6, s, -.5), B(.8, .6, 6, s, .5, .6), C(1, 1, 1.2, s, 0, 0, -3.5)); }
export function zester() { return G(at(H(4.5, '#1d1e21'), 0, 0, 3.5), B(1, .15, 7, M.steel(), 0, .2, -2.2)); }
export function thermometer() { return G(B(1.6, .7, 3, mat('#f2c230', { r: .4 })), at(C(.08, .08, 5, M.steel()), 0, .35, -4).rotateX(Math.PI / 2)); }
export function measuringCups(color = '#c3c7cb') {
  const g = G(), m = color === '#c3c7cb' ? M.steel() : mat(color, { r: .4 });
  [1.9, 1.6, 1.3, 1.05].forEach((r, i) => g.add(C(r, r * .9, 1.8, m, 0, i * .25, 0, 18, true), B(.8, .2, 3.5, m, 0, 1.6 + i * .25, -r - 1.6)));
  return g;
}
export function measuringSpoons() {
  const s = M.steel(), g = G();
  [.75, .6, .5, .4].forEach((r, i) => g.add(mesh(new THREE.SphereGeometry(r, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat('#c3c7cb', { m: .85, r: .3, side: THREE.DoubleSide }), i * .4, r, -2 - i * .3), B(.4, .12, 3.5, s, i * .4, r - .1, 0)));
  return g;
}
export function rollOnSide(len, color, band) { return wrapBox(len, color, band); }
export function zipBags(color = '#3a6fc0') { return carton(5.5, 3.6, 8, color, '#ffffff'); }

// silverware: knives, forks and spoons lying in a bamboo tray
function fork(m) { const g = G(B(.5, .15, 4.5, m, 0, 0, 1.8)); for (let i = 0; i < 4; i++) g.add(B(.1, .15, 2, m, -.3 + i * .2, 0, -1.4)); g.add(B(.85, .15, .5, m, 0, 0, -.3)); return g; }
function spoon(m, big = 1) { const b = mesh(new THREE.SphereGeometry(.7 * big, 10, 6), m, 0, .1, -1.6); b.scale.set(1, .25, 1.5); return G(B(.45, .15, 4.8, m, 0, 0, 1.6), b); }
function tableKnife(m) { return G(B(.5, .2, 4, m, 0, 0, 2), B(.7, .1, 4, m, 0, 0, -2)); }
export function silverwareTray(w, d, h = 2.5) {
  const m = M.bamboo(), s = mat('#d0d4d8', { m: .9, r: .25 }), g = G(B(w, .3, d, m));
  const slots = [[-1, 'knife'], [0, 'fork'], [1, 'spoon'], [2, 'bigspoon']];
  // outside frame, a row of long slots and a cross slot at the back
  g.add(B(w, h, .4, m, 0, 0, d / 2 - .2), B(w, h, .4, m, 0, 0, -d / 2 + .2), B(.4, h, d, m, w / 2 - .2), B(.4, h, d, m, -w / 2 + .2));
  const n = 6, sw = (w - .4) / n;
  for (let i = 1; i < n; i++) g.add(B(.3, h * .9, d * .7, m, -w / 2 + .2 + i * sw, 0, d * .15 - .2));
  g.add(B(w - .8, h * .9, .3, m, 0, 0, -d * .2));
  const fill = ['knife', 'fork', 'fork', 'spoon', 'bigspoon', 'knife'];
  fill.forEach((k, i) => {
    for (let j = 0; j < 4; j++) {
      const x = -w / 2 + .2 + sw * (i + .5) + (j - 1.5) * .25, o = k === 'fork' ? fork(s) : k === 'knife' ? tableKnife(s) : spoon(s, k === 'bigspoon' ? 1.3 : 1);
      g.add(at(o, x, .35 + j * .15, d * .15 - .2));
    }
  });
  return g;
}

// ---- linens and odds and ends
function stripes(base, line) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, 64, 64); x.fillStyle = line;
  for (let i = 0; i < 64; i += 16) { x.fillRect(i, 0, 5, 64); x.fillRect(0, i, 64, 3); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const towelTex = {};
export function towel(base, line, w = 6, d = 8, h = .9) {
  const t = towelTex[base + line] || (towelTex[base + line] = stripes(base, line));
  return G(B(w, h, d, mat('#ffffff', { r: .95, map: t })));
}
export function clothMat(base, line) { const k = base + line; return mat('#ffffff', { map: towelTex[k] || (towelTex[k] = stripes(base, line)), r: .95 }); }
export function potholder(color) { return G(B(7, .5, 7, mat(color, { r: .95 })), mesh(new THREE.TorusGeometry(.6, .12, 6, 12), mat(color), 0, .5, -3.6).rotateX(Math.PI / 2)); }
export function trivet() { return G(C(3.5, 3.5, .4, mat('#b98a5a', { r: .95 }), 0, 0, 0, 24)); }
export function chipClips(n = 4) { const g = G(), cs = ['#c8312b', '#3a6fc0', '#2f8a47', '#f2c230']; for (let i = 0; i < n; i++) g.add(B(2.5, .6, .9, mat(cs[i % 4], { r: .4 }), 0, 0, i * 1.1)); return g; }
export function reusableBag(color) { return G(B(6, .35, 7, mat(color, { r: .6, op: .8 }))); }
export function corkscrew() {
  const g = G(at(C(.45, .45, 5, M.wood()).rotateZ(Math.PI / 2), 0, .45, 0));
  const pts = []; for (let i = 0; i <= 40; i++) { const a = i / 40 * Math.PI * 9; pts.push(new THREE.Vector3(Math.cos(a) * .3, .45 + Math.sin(a) * .3, -i / 40 * 2.4)); }
  g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, .06, 5), M.steel()));
  return g;
}
export function bottleOpener() { return G(B(1.2, .2, 4, M.steel()), mesh(new THREE.TorusGeometry(.5, .14, 6, 12), M.steel(), 0, .1, -2).rotateX(Math.PI / 2)); }
export function jigger() { const s = M.steel(); return lay(G(C(.9, .3, 1.5, s, 0, -1.5, 0, 14, true), C(.3, .8, 1.5, s, 0, 0, 0, 14, true)), 0, .9, 0); }
export function stopper(color) { return G(C(.55, .45, 1.1, mat('#d8c7a0', { r: .8 })), C(.8, .8, .9, mat(color, { m: .5, r: .35 }), 0, 1.1)); }
export function straws(n = 10) { const g = G(); for (let i = 0; i < n; i++) g.add(lay(G(C(.13, .13, 8, mat(['#c8312b', '#f2f0ea', '#3a6fc0'][i % 3], { r: .4 }), 0, -4)), i * .3 - n * .15, .13, 0)); return g; }
export function scissors() {
  const h = mat('#2f6cc8', { r: .45 });
  const r1 = mesh(new THREE.TorusGeometry(.75, .22, 6, 14), h, -.7, .22, 2.2), r2 = mesh(new THREE.TorusGeometry(.75, .22, 6, 14), h, .7, .22, 2.2);
  r1.rotation.x = r2.rotation.x = Math.PI / 2;
  return G(r1, r2, B(.4, .15, 4.5, M.steel(), -.15, .05, -1.2), B(.4, .15, 4.5, M.steel(), .15, .22, -1.2));
}
export function tape() { const t = mesh(new THREE.TorusGeometry(1.1, .45, 8, 20), mat('#e8e0c8', { r: .6 })); t.rotation.x = Math.PI / 2; t.position.y = .4; return G(t); }
export function pen(color) { return lay(G(C(.18, .18, 5.5, mat(color, { r: .4 }), 0, -2.75)), 0, .18, 0); }
export function batteries(n = 6) { const g = G(); for (let i = 0; i < n; i++) g.add(lay(G(C(.28, .28, 2, mat(i % 2 ? '#2a2b2e' : '#c8892a', { r: .35, m: .4 }), 0, -1)), i * .6, .28, 0)); return g; }
export function lighter() { return G(B(1.6, .5, 9, mat('#c8312b', { r: .4 }), 0, 0, 1), B(.5, .4, 2.5, M.steel(), 0, .05, -4.6)); }
export function trashBags() { return carton(5, 4.5, 10, '#1f5aa8', '#f2c230'); }
export function podTub() { return G(C(3, 3, 6, mat('#f2f0ea', { r: .5 })), C(3.1, 3.1, 1.2, mat('#2a7ab8', { r: .4 }), 0, 6)); }
export function britaBox() { return carton(5, 7, 3, '#2c7fc0', '#ffffff'); }
export function saltBox() { return carton(5, 8, 3, '#c22a22', '#ffffff'); }
export function oilBottle(color = '#7b8a2a') { return bottle(1.5, 11, color, { glassy: true }); }
export function fruitBowl() { const g = bowl(5, 2.5, '#2a2b2e'); for (const [x, z, c] of [[-1.5, 0, '#f2c230'], [1.5, .5, '#c8312b'], [0, -1.6, '#e8842a']]) g.add(mesh(new THREE.SphereGeometry(1.4, 12, 8), mat(c, { r: .5 }), x, 2, z)); return g; }
export function cuttingBoard(w = 11, d = 15) { return G(B(w, .75, d, mat('#c79c66', { r: .75 }))); }
export function toaster() { return G(B(11, 7.5, 6.5, M.black()), B(4, .2, 1.4, mat('#000000'), -2.2, 7.5, 0), B(4, .2, 1.4, mat('#000000'), 2.2, 7.5, 0), B(1, .8, .4, M.steel(), 4.5, 5, 3.3)); }
export function toasterOven() {
  return G(B(16, 9.5, 11, M.steel()), B(11, 6, .2, mat('#14161a', { r: .15 }), -2, 1.8, 5.55), B(10, .5, .6, M.steel(), -2, 7.8, 5.9), B(3.4, 8, .2, M.black(), 6, .7, 5.55));
}
export function kettle() {
  const g = G(lathe([[0, 0], [3.2, 0], [3.6, 2.5], [2.6, 5.5], [1, 6.2], [0, 6.2]], mat('#1d1e21', { r: .35, m: .2 })));
  const h = mesh(new THREE.TorusGeometry(2, .25, 6, 16, Math.PI), M.black(), 0, 6.2, 0); g.add(h);
  g.add(at(C(.35, .6, 3.5, M.black()), 3.6, 2, 0).rotateZ(-.9));
  return g;
}
export function crock() {
  const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d');
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#f6f3ec' : '#8fb2e0'; x.fillRect(i * 8, j * 8, 8, 8); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2);
  const g = G(C(2, 2, 6, mat('#ffffff', { map: t, r: .4 })));
  const cs = ['#1d1e21', '#c8312b', '#1d1e21', '#2f8a47', '#b98a55'];
  cs.forEach((col, i) => { const u = B(.5, 9, .3, mat(col, { r: .5 }), (i - 2) * .6, 3, (i % 2) - .5); u.rotation.z = (i - 2) * .08; g.add(u); });
  return g;
}
export function mitt(color = '#2f4f9a') {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#f2f0ea'; x.fillRect(0, 0, 64, 64); x.fillStyle = color;
  for (let i = 0; i < 18; i++) { x.beginPath(); x.ellipse((i * 23) % 64, (i * 37) % 64, 6, 3, i, 0, 7); x.fill(); }
  const t = new THREE.CanvasTexture(c);
  const m = mat('#ffffff', { map: t, r: .95 });
  return G(B(5, 11, 1.4, m, 0, -11), B(2, 4, 1.4, m, 3.2, -7));
}
export function wireBasketTiers() {
  const m = mat('#1d1e21', { m: .5, r: .45 }), g = G(C(.25, .25, 16, m), C(3, 3, .3, m));
  for (const [y, r] of [[3, 5], [12, 4]]) g.add(mesh(new THREE.TorusGeometry(r, .12, 4, 24), m, 0, y, 0).rotateX(Math.PI / 2), C(r * .8, r * .6, 2.5, m, 0, y - 2.5, 0, 12, true));
  for (const [x, z, c] of [[-1.5, 0, '#f2c230'], [1.6, .6, '#f2c230'], [0, -1.4, '#9b6b2f']]) g.add(mesh(new THREE.SphereGeometry(1.3, 10, 8), mat(c, { r: .5 }), x, 4, z));
  return g;
}
export function dishRack() {
  const m = mat('#d7b07a', { r: .7 }), g = G(B(10, .5, 8, m));
  for (let i = 0; i < 6; i++) g.add(B(.3, 5, .3, m, -4 + i * 1.6, .5, -3), B(.3, 5, .3, m, -4 + i * 1.6, .5, 3));
  for (let i = 0; i < 3; i++) { const p = plates(1, 4.5, '#f4f1ea'); p.rotation.x = Math.PI / 2 - .2; p.position.set(-3 + i * 1.6, 4.6, 0); g.add(p); }
  return g;
}
export function lunchBag(color) { return G(B(10, 7, 6, mat(color, { r: .85 })), B(8, .6, 1, mat('#1d1e21'), 0, 7)); }
