// The last corn standing in the valley, and the combine taking it off.
//
// Every other corn field is cut on its group's day (farms.js stage()): one day standing, the next
// stubble. This one field, picked because all of it can be seen from the overlook on Bald Eagle
// Mountain (overlook.js), is left until late and comes off slowly, between HARVEST[0] and
// HARVEST[1] (days of the year), so there is something to watch through the binoculars up there.
//
// A combine with an eight-row corn head works it from HOURS[0] to HOURS[1] (lights on after
// dark), up one swath and back down the next, turning on the headland. How far it has got
// follows the date (nothing cut on the first day, the last swath on the last), and from there
// it carries on in real time. Behind it the field is stubble.
//
// The field is drawn here instead of in farms.js: its ground and its canopy slab, both with a
// shader hook that knows what has been cut (CUT: the current swath and how far along it the
// head is). The slab also has a wall along every swath edge, shown only where one side is cut
// and the other still stands. Near the camera the slab gives way to real plants like any corn
// field (cornlod.js), which asks cut(x, z) for each plant of this field.
import * as THREE from 'three';
import { pairs } from '../../data.js';
import { M } from '../materials.js';
import { Builder, addPolygon } from '../geometry.js';
import { onSeason } from '../season.js';
import { groundAt } from './terrain.js';
import { stage, rows, cutHole, CORN_HOLE } from './farms.js';

export const HARVEST = [286, 334];   // October 14 to December 1
const HOURS = [7, 21.5];             // the combine's working day
const HEAD = 8 * .76, REACH = 4.7;   // width of the corn head (eight rows); how far ahead of the axles it cuts (m)
const SPEED = 1.8, TURN = 9;         // working speed (m/s); how far a headland turn swings out (m)

/** The corn field to leave standing: of the corn fields of 3 ha or more whose whole outline is in
 *  sight of `eye` (a Vector3) over the terrain, and that aren't the seed-corn field, the nearest
 *  one with little standing in front of it. blockers: [[x, z, radius], ...], what stands on the
 *  ground and could hide a combine from up there (buildings, barns, silos, trees). Returns the
 *  field's index in farms.fields, or -1. */
export function pickLateField(farms, eye, blockers = []) {
  const sees = (x, z) => {
    const y = groundAt(x, z) + 1.5, n = Math.max(2, Math.ceil(Math.hypot(x - eye.x, z - eye.z) / 20));
    for (let i = 1; i < n; i++) { const t = i / n; if (groundAt(eye.x + (x - eye.x) * t, eye.z + (z - eye.z) * t) > eye.y + (y - eye.y) * t) return false; }
    return true;
  };
  const inside = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
  const SHADOW = 130;   // how far behind something 10 m tall a combine is out of sight, looking down at about 4 degrees
  const found = [];
  farms.fields.forEach((f, i) => {
    if (f.k !== 'corn') return;
    const r = pairs(f.p[0]); let a = 0, cx = 0, cz = 0, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    r.forEach(([x, z], j) => { const [xn, zn] = r[(j + 1) % r.length], c = x * zn - xn * z; a += c; cx += (x + xn) * c; cz += (z + zn) * c; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); });
    if (Math.abs(a) / 2 < 3e4 || (farms.seed && inside(farms.seed.x, farms.seed.z, r)) || !r.every(([x, z]) => sees(x, z))) return;
    // how much of the field has nothing between it and the eye: a grid of points, each clear
    // unless something stands within its own radius of the sight line, up to SHADOW m in front
    const near = blockers.filter(b => b[0] > x0 - SHADOW && b[0] < x1 + SHADOW && b[1] > z0 - SHADOW && b[1] < z1 + SHADOW), step = Math.max(10, Math.sqrt(Math.abs(a) / 2) / 12);
    let n = 0, clear = 0;
    for (let x = x0; x <= x1; x += step) for (let z = z0; z <= z1; z += step) {
      if (!inside(x, z, r)) continue;
      const d = Math.hypot(eye.x - x, eye.z - z), ux = (eye.x - x) / d, uz = (eye.z - z) / d;
      n++; if (!near.some(b => { const t = (b[0] - x) * ux + (b[1] - z) * uz; return t > 2 && t < SHADOW && Math.abs((b[0] - x) * uz - (b[1] - z) * ux) < b[2]; })) clear++;
    }
    found.push({ i, clear: n ? clear / n : 0, d: Math.hypot(cx / (3 * a) - eye.x, cz / (3 * a) - eye.z) });
  });
  const open = found.filter(f => f.clear >= .9);
  const best = (open.length ? open.sort((p, q) => p.d - q.d) : found.sort((p, q) => q.clear - p.clear))[0];
  return best ? best.i : -1;
}

const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .7, ...o });
let glowTex = null;
/** a soft round spot, white fading to clear (dust, and the pool of light ahead of the combine) */
function glow() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.5, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return glowTex = new THREE.CanvasTexture(c);
}

// ---- the combine: forward is +z, the origin on the ground between the axles
function buildCombine() {
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const red = mat('#b3261e', { roughness: .5, metalness: .2 }), dark = mat('#23272b', { roughness: .8 }), steel = mat('#9aa1a6', { roughness: .45, metalness: .5 });
  const glass = mat('#1b2a36', { roughness: .12, metalness: .7, emissive: '#ffcf8a', emissiveIntensity: 0 }), tyre = mat('#16171a', { roughness: .95 }), white = mat('#e9e6df');
  const lamp = new THREE.MeshStandardMaterial({ color: '#fff4d6', emissive: '#fff0c4', emissiveIntensity: 0, roughness: .4 });
  const tail = new THREE.MeshStandardMaterial({ color: '#7a1512', emissive: '#ff2a1a', emissiveIntensity: 0, roughness: .4 });
  const amber = new THREE.MeshStandardMaterial({ color: '#c77d12', emissive: '#ffa51f', emissiveIntensity: 0, roughness: .4 });
  const box = (w, h, d, m, x, y, z, parent = g) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  box(3, 2.1, 4.8, red, 0, 2.45, -1.1);            // threshing body and grain tank
  box(3.2, .45, 3.2, dark, 0, 3.72, -1.2);         // the tank's extensions
  box(2.5, 1.1, 1.5, red, 0, 1.95, -4.1);          // straw hood
  box(2.7, .12, 1.7, dark, 0, 2.02, 2.1);          // cab platform
  box(1.9, 1.7, 1.5, glass, 0, 2.93, 2.1); box(2.1, .16, 1.8, white, 0, 3.86, 2.1);   // cab and its roof
  const lad = box(.5, 1.7, .08, steel, 1.5, 1.2, 2.2); lad.rotation.z = -.25;          // ladder
  const feeder = box(1.3, .8, 2.6, red, 0, 1.3, 3.3); feeder.rotation.x = .36;
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, 1, 8), dark); stack.position.set(-1.05, 4.3, -.3); g.add(stack);
  // the unloading auger, folded back along the left side
  const aug = new THREE.Mesh(new THREE.CylinderGeometry(.19, .19, 5.8, 10), steel); aug.rotation.x = Math.PI / 2 - .05; aug.position.set(1.62, 3.75, -1.9); aug.castShadow = true; g.add(aug);
  // wheels: big drive wheels in front, small steering wheels behind (each turns about x)
  const wheels = [];
  for (const [r, w, x, z] of [[.95, .75, 1.78, 1.3], [.95, .75, -1.78, 1.3], [.6, .45, 1.45, -3.1], [.6, .45, -1.45, -3.1]]) {
    const wg = new THREE.Group(); wg.position.set(x, r, z); g.add(wg);
    const t = new THREE.CylinderGeometry(r, r, w, 18); t.rotateZ(Math.PI / 2); const tm = new THREE.Mesh(t, tyre); tm.castShadow = true; wg.add(tm);
    const h = new THREE.CylinderGeometry(r * .55, r * .55, w + .04, 12); h.rotateZ(Math.PI / 2); wg.add(new THREE.Mesh(h, steel));
    box(w + .08, r * .9, .12, dark, 0, 0, 0, wg);   // a bar across the hub, so the turning shows
    wheels.push({ wg, r });
  }
  // the corn head: a frame the width of eight rows, and nine pointed snouts that run between them
  const head = new THREE.Group(); head.position.set(0, 0, 4.7); g.add(head);
  box(HEAD + .3, .6, .9, red, 0, .78, 0, head); box(HEAD + .1, .35, .5, dark, 0, .55, -.5, head);
  const snout = new THREE.ConeGeometry(.3, 1.8, 8); snout.rotateX(Math.PI / 2); snout.translate(0, 0, .9);
  for (let i = 0; i < 9; i++) { const s = new THREE.Mesh(snout, red); s.position.set((i - 4) * .76, .5, .35); s.rotation.x = .16; s.castShadow = true; head.add(s); }
  // lights: six work lamps on the cab roof, tail lamps, a beacon; and the pool of light ahead
  for (let i = 0; i < 6; i++) box(.17, .11, .06, lamp, (i - 2.5) * .34, 3.72, 3.0);
  for (const sx of [1, -1]) box(.14, .2, .06, tail, sx * 1.1, 2.1, -4.86);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(.1, 10, 8), amber); beacon.position.set(.7, 4.03, 1.7); g.add(beacon);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(16, 22), new THREE.MeshBasicMaterial({ map: glow(), color: '#ffe9b0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  pool.rotation.x = -Math.PI / 2; pool.position.set(0, .5, 13); pool.renderOrder = 1; g.add(pool);
  // the glare of the work lamps, which is what shows from across the valley after dark
  const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: '#fff0c4', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  flare.position.set(0, 3.75, 3.1); flare.scale.setScalar(3); flare.visible = false; g.add(flare);
  g.traverse(o => { o.userData.grounded = true; });   // it stands on the terrain itself: drape() leaves it
  return { g, wheels, head, lamp, tail, amber, pool, flare, glass };
}

/** f: the field (farms.fields[index]); opts.hour(): the clock, opts.night(): 0 day .. 1 night */
export function buildHarvest(scene, f, index, { hour = () => 12, night = () => 0 } = {}) {
  const rings = f.p.map(pairs), ca = Math.cos(f.a), sa = Math.sin(f.a), tex = rows();
  // the field's own frame: u along the rows, v across them
  const U = (x, z) => x * ca + z * sa, V = (x, z) => -x * sa + z * ca, XZ = (u, v) => [u * ca - v * sa, u * sa + v * ca];
  let v0 = Infinity, v1 = -Infinity, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of rings[0]) { const v = V(x, z); v0 = Math.min(v0, v); v1 = Math.max(v1, v); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const K = Math.ceil((v1 - v0) / HEAD);   // swaths, numbered across the field
  /** where the line across the rows at v meets the outline: u, sorted (in, out, in, out ...) */
  const crossings = v => {
    const out = [];
    for (const r of rings) for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length], va = V(a[0], a[1]) - v, vb = V(b[0], b[1]) - v;
      if ((va > 0) !== (vb > 0)) { const ua = U(a[0], a[1]); out.push(ua + (U(b[0], b[1]) - ua) * va / (va - vb)); }
    }
    return out.sort((p, q) => p - q);
  };

  // ---- what has been cut: shared by the ground, the canopy and its shadow
  const CUT = { f: { value: new THREE.Vector4(ca, sa, v0, HEAD) }, p: { value: new THREE.Vector2(-1, 0) }, a: { value: new THREE.Color() }, b: { value: new THREE.Color() } };
  const GLSL = `uniform vec4 uCutF; uniform vec2 uCutP; uniform vec3 uCutA, uCutB; varying vec3 vCut;
bool cutSw(float s, float u) { return s < uCutP.x || (s == uCutP.x && (mod(s, 2.0) < .5 ? u < uCutP.y : u > uCutP.y)); }
bool cutAt(vec2 p) { return cutSw(floor((p.y * uCutF.x - p.x * uCutF.y - uCutF.z) / uCutF.w), p.x * uCutF.x + p.y * uCutF.y); }
`;
  /** ground: stubble where cut; otherwise the cut part isn't drawn (a wall: only between cut and standing) */
  function cutHook(m, ground, key) {
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      prev.call(m, sh, r);   // the hole for the plants near the camera, where the material has one
      Object.assign(sh.uniforms, { uCutF: CUT.f, uCutP: CUT.p, uCutA: CUT.a, uCutB: CUT.b });
      // vCut: world x, z, and the wall's swath edge (uv.x from 1000 up; see the walls below)
      sh.vertexShader = 'varying vec3 vCut;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  vCut = vec3((modelMatrix * vec4(transformed, 1.0)).xz, uv.x);`);
      sh.fragmentShader = GLSL + (ground
        ? sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb *= cutAt(vCut.xy) ? uCutB : uCutA;')
        : sh.fragmentShader.replace('void main() {', `void main() {
  if (vCut.z > 999.5) { float k = floor(vCut.z - 999.5), u = vCut.x * uCutF.x + vCut.y * uCutF.y; if (cutSw(k - 1.0, u) == cutSw(k, u)) discard; }
  else if (cutAt(vCut.xy)) discard;`));
    };
    m.customProgramCacheKey = () => key;
    return m;
  }

  // ---- the field: ground, and the canopy slab with its outer walls (as farms.js) and swath walls
  const uv = (x, z) => [U(x, z) / 40, V(x, z) / 3.05];
  const gb = new Builder({ uv: true }), cb = new Builder({ uv: true });
  addPolygon(gb, rings, 0, uv); addPolygon(cb, rings, 0, uv);
  for (const r of rings) for (let i = 0; i < r.length; i++) {
    const [ax, az] = r[i], [bx, bz] = r[(i + 1) % r.length], L = Math.hypot(bx - ax, bz - az); if (L < .01) continue;
    const nx = (bz - az) / L, nz = -(bx - ax) / L, s = cb.count;
    cb.v(ax, 0, az, nx, 0, nz, 0, 0); cb.v(bx, 0, bz, nx, 0, nz, 0, L / 1.5); cb.v(ax, -4, az, nx, 0, nz, 1, 0); cb.v(bx, -4, bz, nx, 0, nz, 1, L / 1.5);
    cb.tri(s, s + 1, s + 2); cb.tri(s + 1, s + 3, s + 2);
  }
  for (let k = 1; k < K; k++) {   // the wall between swaths k - 1 and k: uv.x = 1000 + k tells the shader which
    const v = v0 + k * HEAD, c = crossings(v);
    for (let i = 0; i + 1 < c.length; i += 2) {
      const [ax, az] = XZ(c[i], v), [bx, bz] = XZ(c[i + 1], v), L = c[i + 1] - c[i], s = cb.count;
      cb.v(ax, 0, az, -sa, 0, ca, 1000 + k, 0); cb.v(bx, 0, bz, -sa, 0, ca, 1000 + k, L / 1.5); cb.v(ax, -4, az, -sa, 0, ca, 1000 + k, 0); cb.v(bx, -4, bz, -sa, 0, ca, 1000 + k, L / 1.5);
      cb.tri(s, s + 1, s + 2); cb.tri(s + 1, s + 3, s + 2);
    }
  }
  const gm = cutHook(M('#ffffff', { map: tex, roughness: 1, side: THREE.FrontSide }), true, 'late-ground');
  const ground = new THREE.Mesh(gb.geometry(), gm); ground.position.y = .45; ground.receiveShadow = true; scene.add(ground);
  const cm = cutHook(cutHole(M('#ffffff', { map: tex, roughness: .95 })), false, 'late-canopy');
  const canopy = new THREE.Mesh(cb.geometry(), cm); canopy.castShadow = canopy.receiveShadow = true;
  canopy.customDepthMaterial = cutHook(cutHole(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })), false, 'late-depth');
  scene.add(canopy);

  // ---- the combine's route: each swath in turn (out on the even ones, back on the odd), with a
  // turn on the headland between them. A swath's run is where its centre line crosses the field.
  const legs = [];
  let last = null;
  for (let k = 0; k < K; k++) {
    const v = v0 + (k + .5) * HEAD, c = crossings(v); if (c.length < 2) continue;   // a sliver the centre line misses
    const dir = k % 2 ? -1 : 1, a = dir > 0 ? c[0] : c[c.length - 1], b = dir > 0 ? c[c.length - 1] : c[0];
    const row = { k, dir, v, u0: a - dir * REACH, len: Math.abs(b - a) + REACH + 1 };   // from the head at the edge to the axle past the far one
    if (last) {
      const p0 = [last.u0 + last.dir * last.len, last.v], p3 = [row.u0, v], p1 = [p0[0] + last.dir * TURN, p0[1]], p2 = [p3[0] + last.dir * TURN, p3[1]];
      const at = t => { const s = 1 - t, a0 = s * s * s, a1 = 3 * s * s * t, a2 = 3 * s * t * t, a3 = t * t * t; return [a0 * p0[0] + a1 * p1[0] + a2 * p2[0] + a3 * p3[0], a0 * p0[1] + a1 * p1[1] + a2 * p2[1] + a3 * p3[1]]; };
      let len = 0, q = p0; for (let i = 1; i <= 16; i++) { const p = at(i / 16); len += Math.hypot(p[0] - q[0], p[1] - q[1]); q = p; }
      legs.push({ turn: true, at, len, k, dir });   // k, dir: the swath it leads to
    }
    legs.push(row); last = row;
  }
  const LOOP = legs.reduce((s, l) => s + l.len, 0);

  const C = buildCombine(); scene.add(C.g);
  // chaff and dust blowing out behind, left in the air as it moves on
  const dustMat = () => new THREE.SpriteMaterial({ map: glow(), color: '#cdbb8a', transparent: true, opacity: 0, depthWrite: false });
  const dust = Array.from({ length: 12 }, () => { const s = new THREE.Sprite(dustMat()); s.visible = false; s.userData.grounded = true; scene.add(s); return { s, life: 0, v: new THREE.Vector3() }; });
  // the standing corn straight ahead of the head, where the slab would otherwise show its hollow end
  const face = new THREE.Mesh(new THREE.PlaneGeometry(HEAD, 1), M('#ffffff', { roughness: .95 })); face.geometry.translate(0, .5, 0); face.userData.grounded = true; scene.add(face);

  let day = 0, run = 0, inWindow = false, height = 0, cur = -1, uc = 0, where = 0, working = false, seasons = 0, clock = 0, dustT = 0;
  const pos = new THREE.Vector3(), fwd = new THREE.Vector3(), STUBBLE = stage('corn', 300, 0).ground.clone();
  const st = d => stage('corn', d, 0, HARVEST[1]);
  /** put the combine `where` metres along its route, and mark what is cut behind it */
  function place() {
    let d = where, leg = legs[0];
    for (const l of legs) { leg = l; if (d < l.len) break; d -= l.len; }
    let u, v, du, dv;
    if (leg.turn) {
      const t = Math.min(1, d / leg.len), a = leg.at(Math.max(0, t - .02)), b = leg.at(Math.min(1, t + .02)), L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      [u, v] = leg.at(t); du = (b[0] - a[0]) / L; dv = (b[1] - a[1]) / L;
      cur = leg.k; uc = leg.dir > 0 ? -1e9 : 1e9;   // nothing of the next swath yet
    } else { u = leg.u0 + leg.dir * d; v = leg.v; du = leg.dir; dv = 0; cur = leg.k; uc = u + leg.dir * REACH; }
    CUT.p.value.set(cur, uc);
    const [x, z] = XZ(u, v); fwd.set(du * ca - dv * sa, 0, du * sa + dv * ca);
    pos.set(x, groundAt(x, z), z); C.g.position.copy(pos);
    C.g.rotation.set(-Math.atan2(groundAt(x + fwd.x * 3, z + fwd.z * 3) - groundAt(x - fwd.x * 3, z - fwd.z * 3), 6), Math.atan2(fwd.x, fwd.z), 0);
    C.head.position.y += ((leg.turn ? .55 : 0) - C.head.position.y) * .1;   // lifted for the turn
    // the face of standing corn the head is about to take (not where the real plants are)
    const hole = CORN_HOLE.value, [fx, fz] = XZ(leg.turn ? u : uc, leg.v ?? v);
    face.visible = !leg.turn && height > .05 && !(hole.z > 0 && Math.hypot(fx - hole.x, fz - hole.y) < hole.z + 6);
    face.position.set(fx, groundAt(fx, fz) + .45, fz); face.rotation.y = Math.atan2(fwd.x, fwd.z); face.scale.y = height;
    return leg;
  }
  onSeason(s => {
    day = s.day; run = 0; seasons++;
    const g = st(day);
    height = g.canopy; canopy.visible = g.canopy > .05; canopy.position.y = .45 + g.canopy;
    if (g.top) { cm.color.copy(g.top).multiplyScalar(.8); face.material.color.copy(cm.color).multiplyScalar(.8); }
    CUT.a.value.copy(g.ground); CUT.b.value.copy(STUBBLE);
    inWindow = canopy.visible && day >= HARVEST[0];
    C.g.visible = inWindow; face.visible = false;
    if (!inWindow) { cur = -1; CUT.p.value.set(-1, 0); dust.forEach(p => { p.s.visible = false; p.life = 0; }); }
    else { where = Math.min(.999, (day - HARVEST[0]) / (HARVEST[1] - HARVEST[0])) * LOOP; place(); }
  });

  function update(dt) {
    if (!inWindow) return;
    clock += dt;
    const h = hour(), n = night(), lit = n > .3;
    working = h >= HOURS[0] && h < HOURS[1];
    if (working) { run += SPEED * dt; where = (Math.min(.999, (day - HARVEST[0]) / (HARVEST[1] - HARVEST[0])) * LOOP + run) % LOOP; }
    const leg = place();
    if (working) C.wheels.forEach(w => { w.wg.rotation.x += SPEED * dt / w.r; });
    C.lamp.emissiveIntensity = working && lit ? 1.6 : 0; C.tail.emissiveIntensity = working && lit ? 1 : 0;
    C.amber.emissiveIntensity = working && Math.sin(clock * 7) > .2 ? 1.5 : 0;
    C.pool.material.opacity = working && lit ? .16 * n : 0; C.glass.emissiveIntensity = working && lit ? .4 : 0;
    C.flare.visible = working && lit; C.flare.material.opacity = .9 * n;
    // dust: a puff every quarter second from the back, drifting up and thinning out
    dustT -= dt;
    if (working && !leg.turn && dustT <= 0) {
      dustT = .25; const p = dust.find(q => q.life <= 0);
      if (p) { p.life = p.max = 2.6 + Math.random(); p.s.position.copy(pos).addScaledVector(fwd, -5.2); p.s.position.y += 1.6; p.v.set((Math.random() - .5) * .8, .5 + Math.random() * .5, (Math.random() - .5) * .8).addScaledVector(fwd, -.6); p.s.visible = true; }
    }
    const shade = 1 - .8 * n;
    for (const p of dust) {
      if (p.life <= 0) continue;
      p.life -= dt; if (p.life <= 0) { p.s.visible = false; continue; }
      const k = 1 - p.life / p.max; p.s.position.addScaledVector(p.v, dt); p.s.scale.setScalar(1.5 + k * 6);
      p.s.material.opacity = .32 * (1 - k) * Math.min(1, k * 6); p.s.material.color.setRGB(.8 * shade, .73 * shade, .54 * shade);
    }
  }
  /** what to look at through the binoculars: the combine, while it is in the field */
  const spot = () => (inWindow ? { p: pos, up: 2, frame: 55, text: working ? 'Glassing the valley: a combine is taking off the last standing corn' : 'Glassing the valley: a combine is parked in the last standing corn' } : null);
  const cut = (x, z) => { if (cur < 0) return false; const s = Math.floor((V(x, z) - v0) / HEAD); return s !== cur ? s < cur : s % 2 ? U(x, z) > uc : U(x, z) < uc; };
  return { index, x0, x1, z0, z1, cut, stage: st, get rev() { return seasons * 1e6 + Math.floor(where / 1.5); }, update, spot, combine: C.g, swaths: K, loop: LOOP };
}
