// The overlook on Bald Eagle Mountain ("Go to: Bald Eagle Vista w/ Mr. Kepner").
//
// On the flat top of the mountain, facing town across the valley, a deer hunter sits in a
// folding chair: camo jacket, trousers and cap, a blaze-orange vest, a cigarette in his right
// hand that he puffs on now and then, and a can of beer in the chair's cup holder. Beside him
// are a 40-pack of the beer, the empties, a stump with his binoculars on it and his rifle
// leaning against it. His pickup is parked off to his right, nose to the valley and angled a
// little toward him, tailgate down, a buck in the bed: in frame with him from the "Go to" spot.
//
// The "Go to" button flies the camera to a spot just behind him and leaves you standing there
// (stand(); on an upright screen a step further back, so he is in frame: fit()): drag to look
// around, as a visitor. Click him, or "See through his eyes", to see through his eyes (inhabit()),
// with a card about him like the people on Walnut St and the detasseling crew, and three things
// to do (act()): take a drag, drink beer, or check out the view through the binoculars, which
// come up and pan to whatever opts.spot() says is worth watching (the combine in harvest.js,
// or the bridge in town), zoomed right in. Leaving him puts you back behind the chair; leaving
// again hands the camera back.
//
// js/scene/index.js treats this like a seat or a person you are inside (getState() is the
// "car" you are aboard); js/ui.js draws the buttons and the binocular mask from that state.
import * as THREE from 'three';
import { geo } from '../phl/people.js';
import { groundAt } from './terrain.js';
import { buildTrees } from '../nature.js';
import { LIGHT, makeRenderer } from '../../three-setup.js';

const CANS = 40, EMPTY = 6;          // cans in the case when he got here; how many he is through already
const SEAT = .43, EYE = 1.72;        // the chair's seat and the visitor's eye, above the ground (m)
const GLASS = { up: 9, min: .3, max: 12 };   // binoculars: field of view as they come up, and the zoom's limits (degrees)
const WRIST = [3.5, .15];            // the cigarette across his fingers: turned ember up at rest, filter to his mouth for a drag
// Everyone here is fictional (as in crewprofiles.js).
const WHO = { name: 'Duane Kepner', sex: 'Male', age: 57, height: 178, kg: 97, lb: 214,
  bio: 'From Antes Fort, at the foot of this mountain. He put in thirty-one years at the paper mill and retired in the spring, and has been up here most days since. He took the eight-point at first light a quarter mile down the ridge, had it dragged to the truck by nine, and has been celebrating ever since. The 40-pack was full this morning. He has told his wife he only smokes when he hunts, and he hunts a lot.' };

const Y = new THREE.Vector3(0, 1, 0);
const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .85, ...o });
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
function box(parent, m, w, h, d, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); parent.add(o); return o; }
/** a tube from a to b ([x, y, z]), radius r0 at a and r1 at b */
function tube(parent, m, a, b, r0, r1 = r0, seg = 6) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, A.distanceTo(B), seg), m);
  o.position.copy(A).add(B).multiplyScalar(.5); o.quaternion.setFromUnitVectors(Y, B.sub(A).normalize()); parent.add(o); return o;
}
function ball(parent, m, r, x, y, z, sx = 1, sy = 1, sz = 1) { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); parent.add(o); return o; }
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return new THREE.CanvasTexture(c); }
/** a soft round spot: white in the middle, clear at the edge */
const spotTex = () => canvasTex(64, 64, g => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.55, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });

function textures() {
  let s = 7; const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const camo = canvasTex(128, 128, g => {
    g.fillStyle = '#5b6339'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 110; i++) { g.fillStyle = ['#2c3320', '#3f4a28', '#7a6e49', '#4a3c2a'][i % 4]; g.beginPath(); g.ellipse(r() * 128, r() * 128, 5 + r() * 12, 3 + r() * 7, r() * 3.14, 0, 6.3); g.fill(); }
  });
  camo.wrapS = camo.wrapT = THREE.RepeatWrapping;
  // the turnout: bare dirt and leaf litter, ragged at the edge
  const dirt = canvasTex(256, 256, g => {
    for (let i = 0; i < 260; i++) { const a = r() * 6.28, d = r() ** .8 * 92, rad = 10 + r() * 22; g.fillStyle = `rgba(${108 + r() * 26 | 0},${92 + r() * 20 | 0},${68 + r() * 16 | 0},.22)`; g.beginPath(); g.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, rad, 0, 6.3); g.fill(); }
    for (let i = 0; i < 500; i++) { const a = r() * 6.28, d = r() * 100; g.fillStyle = ['rgba(70,56,40,.5)', 'rgba(150,120,70,.45)', 'rgba(120,80,45,.45)'][i % 3]; g.fillRect(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 1 + r() * 2, 1 + r() * 2); }
  });
  // the beer: "Old Nippenose" is made up, like the hunter
  const label = (w, h, big) => canvasTex(w, h, g => {
    g.fillStyle = '#16335c'; g.fillRect(0, 0, w, h); g.fillStyle = '#c9252c'; g.fillRect(0, h * .72, w, h * .28); g.fillStyle = '#f2ead8'; g.fillRect(0, h * .68, w, h * .05);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f2ead8';
    if (big) { g.font = `bold ${h * .62}px Arial, sans-serif`; g.fillText('40', w / 2, h * .36); }
    else { g.font = `bold ${h * .28}px Georgia, serif`; g.fillText('OLD NIPPENOSE LAGER', w / 2, h * .26, w * .92); g.font = `bold ${h * .2}px Arial, sans-serif`; g.fillText('40 PACK · 12 OZ CANS', w / 2, h * .53, w * .92); }
  });
  // the case from above: torn open, eight by five, the ones he has had gone from one end
  const top = canvasTex(256, 160, (g, w, h) => {
    g.fillStyle = '#16335c'; g.fillRect(0, 0, w, h); g.fillStyle = '#0c0e11'; g.fillRect(14, 14, w - 28, h - 28);
    for (let i = 0; i < 40; i++) { if (i < EMPTY + 1) continue; const x = 14 + ((i % 8) + .5) * (w - 28) / 8, y = 14 + (Math.floor(i / 8) + .5) * (h - 28) / 5; g.fillStyle = '#c3c8cb'; g.beginPath(); g.arc(x, y, 12, 0, 6.3); g.fill(); g.fillStyle = '#8f969a'; g.beginPath(); g.arc(x, y, 8, 0, 6.3); g.fill(); }
  });
  const can = canvasTex(64, 64, g => { g.fillStyle = '#16335c'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#c9252c'; g.fillRect(0, 40, 64, 14); g.fillStyle = '#f2ead8'; g.fillRect(0, 36, 64, 4); g.fillRect(0, 54, 64, 3); g.fillStyle = '#c3c8cb'; g.fillRect(0, 0, 64, 5); g.fillRect(0, 60, 64, 4); });
  return { camo, dirt, side: label(512, 128, false), end: label(256, 128, true), top, can, spot: spotTex() };
}

// ---- the folding chair, facing +z, with a cup holder in its left arm (+x is the sitter's left)
const HOLDER = [.29, .625, .14];   // where the can's middle is when it stands in the holder
function chair() {
  const g = new THREE.Group(), fab = mat('#2d4a66', { roughness: .95, side: THREE.DoubleSide }), fr = mat('#3a3d40', { roughness: .5, metalness: .6 });
  box(g, fab, .54, .02, .48, 0, SEAT, 0);
  box(g, fab, .54, .5, .02, 0, SEAT + .29, -.28).rotation.x = -.14;
  for (const sx of [1, -1]) {
    tube(g, fr, [sx * .27, 0, .26], [sx * .29, .64, .2], .011); tube(g, fr, [sx * .27, 0, -.22], [sx * .28, .98, -.34], .011);            // front leg to the arm, back leg to the top
    tube(g, fr, [sx * .27, .04, .26], [sx * .27, SEAT, -.2], .009); tube(g, fr, [sx * .27, .04, -.22], [sx * .27, SEAT, .22], .009);     // the cross at each side
    box(g, fab, .065, .015, sx > 0 ? .34 : .5, sx * .29, .645, sx > 0 ? -.11 : -.03);                                                    // arms: the left one stops at the holder
  }
  tube(g, fr, [.27, .04, .26], [-.27, SEAT, .24], .009); tube(g, fr, [-.27, .04, .26], [.27, SEAT, .24], .009);
  tube(g, fr, [.27, .04, -.22], [-.27, SEAT, -.22], .009); tube(g, fr, [-.27, .04, -.22], [.27, SEAT, -.22], .009);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(.042, .038, .1, 12, 1, true), mat('#1c2630', { side: THREE.DoubleSide })); cup.position.set(HOLDER[0], .6, HOLDER[2]); g.add(cup);
  return g;
}

// ---- the hunter: Kyle's limbs and joints (phl/people.js geo()), a little heavier, in camo with a
// blaze-orange vest and a camo cap, a grey moustache, and a cigarette between his right fingers
function hunter(T) {
  const b = 1.12, g = geo(b), F = { root: new THREE.Group(), mats: [] };
  const mk = (c, o) => { const m = mat(c, o); m.userData.noSnow = true; F.mats.push(m); return m; };
  const camo = mk('#ffffff', { map: T.camo, roughness: .95 }), orange = mk('#ff6410', { emissive: '#ff4a00', emissiveIntensity: .22, roughness: .8 });
  const skin = mk('#d2a37f'), boot = mk('#4a3626'), hair = mk('#a9a8a2'), eye = mk('#1b1b1b'), lip = mk('#8a4a44'), paper = mk('#f3f1ea'), filt = mk('#c98a4a');
  const mesh = (gg, mm, x, y, z, parent) => { const o = new THREE.Mesh(gg, mm); o.position.set(x, y, z); parent.add(o); return o; };
  const grp = (parent, x, y, z) => { const o = new THREE.Group(); o.position.set(x, y, z); parent.add(o); return o; };
  F.pelvis = grp(F.root, 0, .92, 0);
  mesh(g.torso, camo, 0, 0, 0, F.pelvis); mesh(g.shorts, camo, 0, 0, 0, F.pelvis);
  const vest = new THREE.CylinderGeometry(.19 * b + .014, .15 * b + .02, .5, 14); vest.translate(0, .3, 0); mesh(vest, orange, 0, 0, 0, F.pelvis);
  mesh(new THREE.SphereGeometry(.19, 12, 8), orange, 0, .2, .07, F.pelvis).scale.set(1.02, .95, .85);   // his belly, under the vest
  F.chest = grp(F.pelvis, 0, .56, 0);
  mesh(g.neck, skin, 0, .08, 0, F.chest);
  F.head = mesh(g.head, skin, 0, .17, 0, F.chest);
  const hr = g.hair.clone(); hr.rotateX(-.75); mesh(hr, hair, 0, 0, -.012, F.head);
  mesh(new THREE.SphereGeometry(.118, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.1), camo, 0, .02, -.005, F.head); mesh(new THREE.BoxGeometry(.17, .012, .12), camo, 0, .035, .14, F.head);   // cap
  for (const sx of [1, -1]) { mesh(new THREE.SphereGeometry(.016, 8, 6), eye, sx * .038, .018, .098, F.head).scale.y = .6; mesh(new THREE.BoxGeometry(.05, .016, .016), hair, sx * .036, .046, .1, F.head); }
  mesh(new THREE.SphereGeometry(.021, 8, 6), skin, 0, -.008, .106, F.head);
  mesh(new THREE.BoxGeometry(.075, .022, .02), hair, 0, -.036, .1, F.head);   // moustache
  mesh(new THREE.BoxGeometry(.04, .01, .012), lip, 0, -.056, .096, F.head);
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    const hip = F['hip' + s] = grp(F.pelvis, sx * .1, 0, 0); mesh(g.thigh, camo, 0, 0, 0, hip);
    const knee = F['knee' + s] = grp(hip, 0, -.45, 0); mesh(g.shin, camo, 0, 0, 0, knee); mesh(g.foot, boot, 0, -.45, 0, knee).scale.set(1.1, 1.3, 1.1);
    const sh = F['sh' + s] = grp(F.chest, sx * (.23 + (b - 1) * .14), -.04, 0); mesh(g.upper, camo, 0, 0, 0, sh);
    const el = F['el' + s] = grp(sh, 0, -.3, 0); mesh(g.fore, camo, 0, 0, 0, el);
    F['hand' + s] = mesh(g.hand, skin, 0, -.29, 0, el);
  }
  // the cigarette, held at his fingertips across the hand: along the wrist group's z, filter at +z, ember at -z
  F.wrist = grp(F.elR, 0, -.352, 0); F.wrist.rotation.x = WRIST[0];
  const pg = new THREE.CylinderGeometry(.006, .006, .07, 6); pg.rotateX(Math.PI / 2); pg.translate(0, 0, -.035); mesh(pg, paper, 0, 0, 0, F.wrist);
  const fg = new THREE.CylinderGeometry(.0062, .0062, .03, 6); fg.rotateX(Math.PI / 2); fg.translate(0, 0, .015); mesh(fg, filt, 0, 0, 0, F.wrist);
  F.ember = mesh(new THREE.SphereGeometry(.0075, 6, 5), new THREE.MeshBasicMaterial({ color: '#c2481c' }), 0, 0, -.072, F.wrist);
  F.tip = grp(F.wrist, 0, 0, .032);     // the filter's end: what goes to his mouth
  F.grip = grp(F.elL, 0, -.33, 0);      // where his left hand closes round the can
  return F;
}
/** sitting in the chair: thighs out along the seat, knees a little apart, shins down, leaning back */
function sit(F) {
  F.pelvis.position.y = SEAT + .1; F.pelvis.rotation.x = -.16; F.chest.rotation.x = .1;
  for (const [s, sx] of [['L', 1], ['R', -1]]) { F['hip' + s].rotation.set(-1.36, 0, sx * .16); F['knee' + s].rotation.x = 1.42; }
}
/** Bend an arm (shoulder sh: x and z, elbow el: x) so that `eff`, something the forearm carries,
 *  comes as near as it can to `target` (world). A search from coarse to fine; returns the angles. */
function reach(sh, el, eff, target) {
  const p = new THREE.Vector3(); let best = [0, 0, -.4], bd = Infinity;
  const cost = (rx, rz, ex) => { sh.rotation.set(rx, 0, rz); el.rotation.x = ex; return eff.getWorldPosition(p).distanceTo(target) + .012 * Math.abs(rz); };
  for (let rx = -2.8; rx <= .81; rx += .2) for (let rz = -1.2; rz <= 1.21; rz += .2) for (let ex = -2.7; ex <= .01; ex += .2) { const d = cost(rx, rz, ex); if (d < bd) { bd = d; best = [rx, rz, ex]; } }
  for (const step of [.06, .018]) {
    const [cx, cz, ce] = best;
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) for (let k = -3; k <= 3; k++) {
      const rx = cx + i * step, rz = cz + j * step, ex = Math.min(0, ce + k * step), d = cost(rx, rz, ex);
      if (d < bd) { bd = d; best = [rx, rz, ex]; }
    }
  }
  return best;
}

// ---- the pickup: forward is +z, the origin on the ground under its middle
function truck() {
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const body = mat('#7d2a22', { roughness: .45, metalness: .25 }), dark = mat('#1d1f22'), chrome = mat('#b9bfc4', { roughness: .3, metalness: .8 });
  const glass = mat('#18232c', { roughness: .1, metalness: .7 }), tyre = mat('#141516', { roughness: .95 }), liner = mat('#2a2c2e', { roughness: .9 }), red = mat('#8c1512'), lens = mat('#e9e6d8', { roughness: .3 });
  // cab and hood: the side profile (z, y), pushed across the truck's width
  const prof = new THREE.Shape([[-.5, .42], [2.62, .42], [2.74, .55], [2.74, 1], [2.6, 1.2], [1.2, 1.28], [.58, 1.86], [-.44, 1.86], [-.5, 1.8]].map(p => new THREE.Vector2(p[0], p[1])));
  const cg = new THREE.ExtrudeGeometry(prof, { depth: 1.9, bevelEnabled: false }); cg.rotateY(-Math.PI / 2); cg.translate(.95, 0, 0);
  const cab = new THREE.Mesh(cg, body); cab.castShadow = true; g.add(cab);
  box(g, glass, 1.66, .7, .02, 0, 1.58, .9).rotation.x = -.818;   // windscreen
  box(g, glass, 1.5, .4, .02, 0, 1.6, -.505);                    // back window
  for (const sx of [1, -1]) { box(g, glass, .02, .4, .8, sx * .955, 1.56, 0); box(g, chrome, .012, .03, .12, sx * .957, 1.15, -.25); box(g, dark, .1, .1, .14, sx * 1.02, 1.36, .52); }
  // the bed: floor, sides and front, and the tailgate dropped open on its cables
  box(g, body, 1.9, .36, 2.25, 0, .6, -1.62).castShadow = true;
  box(g, liner, 1.76, .04, 2.2, 0, .8, -1.6);
  for (const sx of [1, -1]) { box(g, body, .08, .5, 2.25, sx * .91, 1.03, -1.62).castShadow = true; tube(g, dark, [sx * .87, 1.26, -2.72], [sx * .85, .83, -3.2], .006); }
  box(g, body, 1.74, .5, .06, 0, 1.03, -.53);
  box(g, body, 1.74, .06, .52, 0, .8, -3); box(g, liner, 1.6, .012, .44, 0, .835, -3);
  // wheels in their arches
  for (const [x, z] of [[.84, 1.75], [-.84, 1.75], [.84, -1.6], [-.84, -1.6]]) {
    const t = new THREE.CylinderGeometry(.39, .39, .26, 16); t.rotateZ(Math.PI / 2); const w = new THREE.Mesh(t, tyre); w.position.set(x, .39, z); g.add(w);
    const hb = new THREE.CylinderGeometry(.2, .2, .27, 10); hb.rotateZ(Math.PI / 2); const hm = new THREE.Mesh(hb, chrome); hm.position.copy(w.position); g.add(hm);
    const arch = new THREE.Mesh(new THREE.CircleGeometry(.47, 12, 0, Math.PI), dark); arch.position.set(Math.sign(x) * .953, .4, z); arch.rotation.y = Math.sign(x) * Math.PI / 2; g.add(arch);
  }
  // grille, lamps, bumpers, the plate
  box(g, dark, 1.3, .3, .03, 0, .82, 2.745);
  for (const sx of [1, -1]) { box(g, lens, .3, .16, .03, sx * .74, .86, 2.745); box(g, red, .1, .3, .03, sx * .9, 1.08, -2.755); }
  box(g, chrome, 1.96, .17, .16, 0, .5, 2.78); box(g, chrome, 1.96, .15, .14, 0, .5, -2.8); box(g, lens, .3, .15, .01, 0, .5, -2.875);
  return g;
}

// ---- the buck, lying on its side in the bed: built standing (head toward +z), then laid over,
// with its head rolled back up so the rack stands above the tailgate
function buck() {
  const out = new THREE.Group(), g = new THREE.Group(); out.add(g);
  const hide = mat('#8a6a48', { roughness: 1 }), pale = mat('#d9cdb8', { roughness: 1 }), bone = mat('#d9cba6', { roughness: .7 }), dark = mat('#2a2018'), tag = mat('#ff6410');
  [hide, pale, bone, dark, tag].forEach(m => { m.userData.noSnow = true; });
  ball(g, hide, .5, 0, 0, 0, .4, .46, 1.22); ball(g, pale, .5, 0, -.1, -.02, .33, .3, 1.05);   // body, belly
  tube(g, hide, [0, .04, .48], [0, .08, .97], .12, .075, 8);                                    // neck, stretched out
  ball(g, pale, .06, 0, .1, -.62, .9, 1.4, .6);                                                // tail
  for (const sx of [1, -1]) for (const z of [.4, -.42]) {   // legs, stiff
    const k = [sx * .11, -.5, z + (z > 0 ? .1 : -.08)], f = [sx * .11, -.84, z + (z > 0 ? .18 : -.02)];
    tube(g, hide, [sx * .1, -.12, z], k, .05, .03); tube(g, hide, k, f, .028, .02); box(g, dark, .04, .05, .05, f[0], f[1] - .02, f[2]);
  }
  const hd = new THREE.Group(); hd.position.set(0, .08, .95); hd.rotation.z = -1.15; g.add(hd);
  ball(hd, hide, .5, 0, .03, .15, .17, .19, .32); ball(hd, dark, .03, 0, 0, .31); ball(hd, pale, .03, 0, -.05, .24, 1.6, 1, 1.4);
  for (const sx of [1, -1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(.04, .13, 6), hide); ear.position.set(sx * .1, .12, .05); ear.rotation.z = -sx; ear.scale.z = .4; hd.add(ear);
    ball(hd, dark, .014, sx * .075, .06, .2);
    // antlers, four points a side: a main beam sweeping out, up and forward, a brow tine and two more
    const p = [[sx * .04, .12, .08], [sx * .15, .32, .05], [sx * .23, .45, .17], [sx * .2, .49, .35]];
    for (let i = 0; i < 3; i++) tube(hd, bone, p[i], p[i + 1], .016 - i * .003, .013 - i * .003);
    tube(hd, bone, [sx * .06, .16, .09], [sx * .05, .26, .17], .01, .004); tube(hd, bone, p[1], [sx * .16, .5, .03], .011, .004); tube(hd, bone, p[2], [sx * .25, .62, .19], .01, .004);
  }
  box(hd, tag, .05, .035, .004, .11, .16, .05);   // the harvest tag on its ear
  g.rotation.z = Math.PI / 2; g.position.y = .21;
  return out;
}

/** bolt-action rifle with a scope: butt at the origin, muzzle up +y */
function rifle() {
  const g = new THREE.Group(), wood = mat('#5a3a22', { roughness: .6 }), steel = mat('#1e2124', { roughness: .4, metalness: .7 });
  box(g, wood, .042, .34, .11, 0, .17, -.01).rotation.x = .08; box(g, wood, .04, .46, .05, 0, .56, .012); box(g, steel, .034, .2, .04, 0, .47, .045);
  tube(g, steel, [0, .4, .05], [0, 1.12, .05], .011, .009, 8);
  tube(g, steel, [0, .38, .1], [0, .68, .1], .016, .016, 8); tube(g, steel, [0, .62, .1], [0, .7, .1], .016, .023, 8); tube(g, steel, [0, .36, .1], [0, .41, .1], .021, .016, 8);
  ball(g, steel, .012, .04, .46, .05);
  return g;
}
function binoculars() {
  const g = new THREE.Group(), m = mat('#17191a', { roughness: .6 }), lens = mat('#3b5566', { roughness: .1, metalness: .8 });
  for (const sx of [1, -1]) { tube(g, m, [sx * .034, 0, -.06], [sx * .034, 0, 0], .02, .024, 10); tube(g, m, [sx * .034, 0, 0], [sx * .034, 0, .075], .027, .03, 10); const l = new THREE.Mesh(new THREE.CircleGeometry(.027, 10), lens); l.position.set(sx * .034, 0, .0755); g.add(l); }
  box(g, m, .05, .02, .05, 0, .005, 0);
  return g;
}

/** Where the overlook is: a few steps off the summit (the "Bald Eagle Mountain" label in
 *  places.json) toward town, which is where the hunter faces. Null without that label. */
export function overlookSite(places) {
  const top = places.labels.find(l => l.t === 'Bald Eagle Mountain'); if (!top) return null;
  const d = Math.hypot(top.x, top.z), x = top.x - top.x / d * 24, z = top.z - top.z / d * 24, y = groundAt(x, z);
  return { x, z, y, h: Math.atan2(-x, -z), eye: new THREE.Vector3(x, y + 1.2, z) };   // h: heading to Allegheny & Main, the model's origin
}

/** opts.night(): 0 day .. 1 night; opts.spot(): what the binoculars go to ({ p, up, frame, text }), or null */
export function buildOverlook(scene, site, { night = () => 0, spot = () => null } = {}) {
  const { x: SX, z: SZ, y: SY, h } = site, ch = Math.cos(h), sh = Math.sin(h), T = textures();
  // the site's own frame: z toward town, x to the hunter's left, the chair at the origin
  const W = (lx, lz) => [SX + lx * ch + lz * sh, SZ - lx * sh + lz * ch];
  const gy = (lx, lz) => { const [x, z] = W(lx, lz); return groundAt(x, z) - SY; };
  const group = new THREE.Group(); group.position.set(SX, SY, SZ); group.rotation.y = h; scene.add(group);
  const put = (o, lx, lz, ry = 0, dy = 0) => { o.position.set(lx, gy(lx, lz) + dy, lz); o.rotation.y = ry; group.add(o); return o; };
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  // ---- the ground: a patch of bare dirt, and soft shade under things (the sun's shadow map is too coarse for them)
  const lay = (w, d, lx, lz, ry, seg, lift, m, order) => {
    const g = new THREE.PlaneGeometry(w, d, seg, seg); g.rotateX(-Math.PI / 2); g.rotateY(ry); g.translate(lx, 0, lz);
    const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, gy(p.getX(i), p.getZ(i)) + lift);
    g.computeVertexNormals(); const o = new THREE.Mesh(g, m); o.renderOrder = order; group.add(o); return o;
  };
  lay(28, 28, 1, -3.5, 0, 14, .05, new THREE.MeshStandardMaterial({ map: T.dirt, transparent: true, depthWrite: false, roughness: 1 }), -2);
  const shade = new THREE.MeshBasicMaterial({ map: T.spot, color: '#000000', transparent: true, opacity: .45, depthWrite: false });
  const TRUCK = { x: -4.8, z: 5, ry: -.9 };   // off to his right, nose away to the right, the bed and the buck turned toward him
  lay(3, 7.4, TRUCK.x, TRUCK.z, TRUCK.ry, 4, .08, shade, -1); lay(1.5, 1.5, 0, .05, 0, 2, .08, shade, -1); lay(1, 1, -.82, .14, 0, 2, .08, shade, -1); lay(1.1, .8, .86, .12, .3, 2, .08, shade, -1);

  // ---- the chair and the hunter in it
  put(chair(), 0, 0).traverse(o => { if (o.material) o.material.userData.noSnow = true; });
  const F = hunter(T); sit(F); put(F.root, 0, -.02);
  // ---- to his left: the 40-pack, torn open, and the empties
  const cm = mat('#ffffff', { map: T.side }), em = mat('#ffffff', { map: T.end }), card = mat('#8f7650');
  const pack = new THREE.Mesh(new THREE.BoxGeometry(.56, .135, .35), [em, em, mat('#ffffff', { map: T.top }), card, cm, cm]);
  put(pack, .86, .12, .3, .0675);
  box(pack, card, .5, .006, .17, 0, .12, .21).rotation.x = -1.9;   // its torn flap, standing up on the far side
  const alu = mat('#c3c8cb', { roughness: .35, metalness: .7 }), canMats = [mat('#ffffff', { map: T.can, roughness: .4, metalness: .4 }), alu, alu], canGeo = new THREE.CylinderGeometry(.033, .033, .122, 12);
  [...canMats, cm, em, card].forEach(m => { m.userData.noSnow = true; });
  const empties = [];
  function empty() {   // one more on the ground, on its side, some of them crushed
    const o = new THREE.Mesh(canGeo, canMats), far = empties.length >= EMPTY; let lx, lz;
    do { const a = rnd() * 6.28, r = .2 + rnd() * (far ? 1.5 : .8); lx = 1.2 + Math.cos(a) * r; lz = .75 + Math.sin(a) * r; }
    while ((Math.abs(lx - .86) < .42 && Math.abs(lz - .12) < .32) || (lx < .5 && lz < 1));   // not in the case, nor under his boots
    put(o, lx, lz, rnd() * 6.28, .033); o.rotation.z = Math.PI / 2; if (rnd() < .45) o.scale.y = .45;
    empties.push(o);
  }
  for (let i = 0; i < EMPTY; i++) empty();
  const can = new THREE.Mesh(canGeo, canMats); group.add(can); can.position.set(...HOLDER);
  // ---- to his right: a stump, the binoculars on it, the rifle leaning against it
  const stump = new THREE.Group(); tube(stump, mat('#4f3f30', { roughness: 1 }), [0, -.1, 0], [0, .5, 0], .25, .2, 9);
  const ringTop = new THREE.Mesh(new THREE.CircleGeometry(.2, 9), mat('#b89a6c', { roughness: 1 })); ringTop.rotation.x = -Math.PI / 2; ringTop.position.y = .502; stump.add(ringTop);
  put(stump, -.82, .14);
  const glasses = put(binoculars(), -.84, .12, .5, .535);
  const gun = put(rifle(), -1.1, .34); gun.quaternion.setFromUnitVectors(Y, new THREE.Vector3(.11, .5, -.078).normalize());
  // ---- to his right: the pickup, pulled up to the view with its tailgate down, and the buck in the bed
  const tk = put(truck(), TRUCK.x, TRUCK.z, TRUCK.ry);
  {
    const c = Math.cos(TRUCK.ry), s = Math.sin(TRUCK.ry), at = (x, z) => gy(TRUCK.x + x * c + z * s, TRUCK.z - x * s + z * c);
    tk.rotation.x = -Math.atan2(at(0, 1.75) - at(0, -1.6), 3.35); tk.rotation.z = Math.atan2(at(.84, 0) - at(-.84, 0), 1.68);
    tk.position.y = (at(0, 1.75) + at(0, -1.6)) / 2;
  }
  const deer = buck(); deer.position.set(.36, .82, -1.72); deer.rotation.y = Math.PI + .1; tk.add(deer);
  // ---- a stand of trees round the clearing, open toward the valley
  const flat = [];
  while (flat.length < 2 * 70) {
    const a = rnd() * Math.PI * 2, r = 13 + rnd() ** .7 * 75, off = Math.abs(wrap(a)), lx = Math.sin(a) * r, lz = Math.cos(a) * r;
    if (off < (r < 30 ? 1.3 : 1.15) || Math.hypot(lx - TRUCK.x, lz - TRUCK.z) < 7) continue;
    const [x, z] = W(lx, lz); flat.push(Math.round(x * 10), Math.round(z * 10));
  }
  scene.remove(buildTrees(scene, flat)[4]);   // (its flower beds don't belong on a mountain top)

  // ---- smoke: a wisp off the cigarette, and what he breathes out
  const smoke = Array.from({ length: 40 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.spot, transparent: true, opacity: 0, depthWrite: false })); s.visible = false; group.add(s); return { s, life: 0, max: 1, v: new THREE.Vector3(), s0: 0, s1: 0, a: 0 }; });
  const tmp = new THREE.Vector3();
  function puff(worldPos, vel, life, s0, s1, a) {
    const p = smoke.find(q => q.life <= 0); if (!p) return;
    p.s.position.copy(group.worldToLocal(tmp.copy(worldPos))); p.v.copy(vel); p.life = p.max = life; p.s0 = s0; p.s1 = s1; p.a = a; p.s.visible = true;
  }

  // ---- where things are, and the arm poses: at rest on the chair's arms, the left hand on the
  // can in its holder, and each hand up at his mouth (as seen from outside; from inside, see reachFace)
  group.updateMatrixWorld(true);
  const local = (x, y, z) => group.localToWorld(new THREE.Vector3(x, y, z));
  const chestW = local(0, .95, 0), headW = F.head.getWorldPosition(new THREE.Vector3()), mouthW = F.head.localToWorld(new THREE.Vector3(0, -.055, .125));
  const setArm = (s, a, b = a, k = 0) => { F['sh' + s].rotation.set(a[0] + (b[0] - a[0]) * k, 0, a[1] + (b[1] - a[1]) * k); F['el' + s].rotation.x = a[2] + (b[2] - a[2]) * k; };
  const P = { restR: reach(F.shR, F.elR, F.handR, local(-.33, .705, .12)), restL: reach(F.shL, F.elL, F.handL, local(.32, .705, -.07)), grabL: reach(F.shL, F.elL, F.grip, local(...HOLDER)) };
  // the can keeps the place in his hand it has when he first closes his fingers on it
  setArm('L', P.grabL); group.updateMatrixWorld(true); F.elL.attach(can);
  const canP = can.position.clone(), canQ = can.quaternion.clone();
  F.rim = new THREE.Object3D(); F.rim.position.copy(canP).add(new THREE.Vector3(0, .061, 0).applyQuaternion(canQ)); F.elL.add(F.rim);
  const holdCan = on => { if (on) { F.elL.add(can); can.position.copy(canP); can.quaternion.copy(canQ); } else { group.add(can); can.position.set(...HOLDER); can.quaternion.identity(); } };
  holdCan(false);
  F.wrist.rotation.x = WRIST[1]; P.mouthR = reach(F.shR, F.elR, F.tip, mouthW); F.wrist.rotation.x = WRIST[0];
  P.mouthL = reach(F.shL, F.elL, F.rim, mouthW);
  setArm('R', P.restR); setArm('L', P.restL);

  // ---- "Go to": the visitor's spot, behind him and to his right, looking past him across the valley
// with the truck in frame on the right (VIEW_YAW: from straight toward town, + to the left)
  const [vx, vz] = W(-1.5, -4.6), standPos = new THREE.Vector3(vx, groundAt(vx, vz) + EYE, vz);
  const VIEW_YAW = -.07; let YAW0 = h + VIEW_YAW + Math.PI, PITCH0 = -.09;   // as a camera's rotation.y (it looks down its own -z) and .x
  const view = { id: 'ridge', name: 'Bald Eagle Vista w/ Mr. Kepner', pos: standPos.clone(),
    target: standPos.clone().add(new THREE.Vector3(Math.sin(h + VIEW_YAW) * Math.cos(PITCH0), Math.sin(PITCH0), Math.cos(h + VIEW_YAW) * Math.cos(PITCH0)).multiplyScalar(4000)) };
  // A screen too narrow for all that (a phone or a tablet held upright) would have him off its left
  // edge, and he is who you tap: there the spot steps back (up to 6 m) and turns until at least he
  // and the buck in the truck bed are in frame, as much of the truck as fits, and looks a little
  // higher, which puts him lower on the screen (below a tablet's open panel). The "Go to" flight
  // reads view.pos and .target as it goes, so they are changed in place (from update()).
  const HIM = [.55, 0], BUCK = [-3.6, 4], CAB = [-6.1, 6.05], fitted = { a: 0, fov: 0 };
  function fit(aspect, fov) {
    const half = Math.atan(Math.tan(fov * Math.PI / 360) * aspect) * .9;   // half the view's width, less a margin
    const ang = (b, [lx, lz]) => Math.atan2(lx + 1.5, lz + 4.6 + b);        // seen from b m behind the spot; + to the left
    let b = 0, yaw = VIEW_YAW; PITCH0 = -.09;
    if (ang(0, HIM) - VIEW_YAW > half || VIEW_YAW - ang(0, CAB) > half) {
      PITCH0 = -.02;
      while (b < 6 && ang(b, HIM) - ang(b, BUCK) > 2 * half) b += .5;
      yaw = Math.max(ang(b, HIM) - half, (ang(b, HIM) + ang(b, CAB)) / 2);
    }
    const [x, z] = W(-1.5, -4.6 - b); standPos.set(x, groundAt(x, z) + EYE, z); YAW0 = h + yaw + Math.PI;
    view.pos.copy(standPos); view.target.copy(standPos).add(new THREE.Vector3(Math.sin(h + yaw) * Math.cos(PITCH0), Math.sin(PITCH0), Math.cos(h + yaw) * Math.cos(PITCH0)).multiplyScalar(4000));
  }

  // ---- state
  let mode = null;                     // null: nobody here; 'stand': the visitor behind the chair; 'man': through the hunter's eyes
  let cam = null, act = null, clock = 0, drunk = EMPTY, sips = 0, wispT = 0, breathT = 0, tilt = 0;
  let level = null;   // just arrived: the pitch to settle to (the orbit controls won't fly in looking that high; see fit())
  const look = { yaw: 0, pitch: 0 };   // standing: the camera's own yaw and pitch; as him: from straight ahead
  const idle = { drag: 5, sip: 28 };   // seconds until he next does each by himself
  const bino = { on: false, k: 0, t: 0, fov: 48, goal: 48, base: 48, spot: null, from: { yaw: 0, pitch: 0 }, track: false, zoomed: false, text: '' };
  const TOWN = { p: new THREE.Vector3(40, groundAt(40, -10), -10), up: 12, frame: 420, text: 'Glassing town: the river bridge and Allegheny Street' };
  const eye = new THREE.Vector3(), fwd = new THREE.Vector3(), eul = new THREE.Euler(0, 0, 0, 'YXZ');
  const eyeOf = v => { v.copy(headW); v.y += .04; v.x += sh * .1; v.z += ch * .1; return v; };
  const lookDir = (v, yaw, pitch) => v.set(Math.sin(h + yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(h + yaw) * Math.cos(pitch));
  /** the yaw and pitch (from straight ahead of him) and the field of view that frame a spot */
  function aim(s) {
    eyeOf(eye); const dx = s.p.x - eye.x, dy = s.p.y + s.up - eye.y, dz = s.p.z - eye.z, d = Math.hypot(dx, dz);
    return { yaw: clamp(wrap(Math.atan2(dx, dz) - h), -2.3, 2.3), pitch: Math.atan2(dy, d), fov: clamp(2 * Math.atan(s.frame / 2 / d) * 180 / Math.PI, GLASS.min, GLASS.max) };
  }
  function setGlass(on) {
    if (on === bino.on) return;
    bino.on = on; bino.t = 0;
    if (!on) return;
    if (bino.k === 0 && cam) bino.base = bino.fov = cam.fov;
    bino.goal = GLASS.up; bino.spot = spot() || TOWN; bino.text = bino.spot.text; bino.track = true; bino.zoomed = false;
    bino.from.yaw = look.yaw; bino.from.pitch = look.pitch;
  }
  /** his hand to his face as he sees it: out in front of his eyes, the way he is looking */
  function reachFace(side) {
    lookDir(fwd, clamp(look.yaw, -1, 1), clamp(look.pitch, -.5, .3)); eyeOf(eye).addScaledVector(fwd, side === 'R' ? .3 : .2); eye.y -= side === 'R' ? .03 : .02;
    eye.x += (side === 'R' ? -1 : 1) * ch * .03; eye.z -= (side === 'R' ? -1 : 1) * sh * .03;
    if (side === 'R') F.wrist.rotation.x = WRIST[1];
    return side === 'R' ? reach(F.shR, F.elR, F.tip, eye) : reach(F.shL, F.elL, F.rim, eye);
  }
  function start(id) {
    if (act) return false;
    if (id === 'drink' && drunk >= CANS) return false;
    const mine = mode === 'man';
    act = id === 'drag' ? { id, t: 0, dur: 4.6, pose: mine ? reachFace('R') : P.mouthR } : { id, t: 0, dur: 4.7, pose: mine ? reachFace('L') : P.mouthL, held: false };
    return true;
  }
  /** what the buttons do: 'eyes' (standing behind him: into his chair, as tapping him does), and
   *  as him 'drag', 'drink', 'glass' (the binoculars, up or down) */
  function doAct(id) {
    if (id === 'eyes') { if (mode !== 'stand') return false; inhabit(); return true; }
    if (mode !== 'man') return false;
    if (id === 'glass') { setGlass(!bino.on); return true; }   // even mid-drag or mid-drink: the glasses just come up over it
    if (bino.on) setGlass(false);
    return start(id);
  }

  function update(dt, camera) {
    cam = camera;
    // the screen's shape (and its base field of view: not while the binoculars have it)
    if (mode !== 'man' && bino.k === 0 && (camera.aspect !== fitted.a || camera.fov !== fitted.fov)) {
      const y0 = YAW0; fitted.a = camera.aspect; fitted.fov = camera.fov; fit(camera.aspect, camera.fov);
      if (mode === 'stand' && Math.abs(YAW0 - y0) > .01) { look.yaw = YAW0; look.pitch = PITCH0; }   // turned the phone round while standing here
    }
    if (mode === 'stand' && level !== null) { look.pitch += (level - look.pitch) * (1 - Math.exp(-dt * 5)); if (Math.abs(level - look.pitch) < 1e-3) level = null; }
    // the binoculars coming up or going down: the mask (bino.k), the zoom, and the pan to what's worth seeing
    if (bino.on || bino.k > 0) {
      bino.t += dt; bino.k = clamp(bino.k + (bino.on ? dt : -dt) / .4, 0, 1);
      if (bino.on) {
        if (bino.track) {
          const a = aim(bino.spot), k = smooth((bino.t - .5) / 1.9);
          look.yaw = bino.from.yaw + wrap(a.yaw - bino.from.yaw) * k; look.pitch = bino.from.pitch + (a.pitch - bino.from.pitch) * k;
          if (bino.t > .5 && !bino.zoomed) bino.goal = a.fov;
        }
      } else bino.goal = bino.base;
      bino.fov *= Math.pow(bino.goal / bino.fov, 1 - Math.exp(-dt * (bino.on ? 2.6 : 9)));
      if (!bino.on && bino.k === 0) bino.fov = bino.base;
      if (Math.abs(camera.fov - bino.fov) > 1e-4) { camera.fov = bino.fov; camera.updateProjectionMatrix(); }
    }
    const near = !!mode || camera.position.distanceToSquared(group.position) < 900 * 900;
    group.visible = near; if (!near) return;
    clock += dt;
    const n = night(), mine = mode === 'man';
    shade.opacity = .45 * (1 - .75 * n);
    // by himself he takes a drag every so often, and a drink now and then
    if (!mine && !act) {
      idle.drag -= dt; idle.sip -= dt;
      if (idle.drag <= 0) { start('drag'); idle.drag = 14 + Math.random() * 12; }
      else if (idle.sip <= 0) { start('drink'); idle.sip = 40 + Math.random() * 40; }
    }
    // the arms: kR 0..1 cigarette to his mouth; the left to the can, up to his mouth, and back
    let kR = 0, glowing = 0; tilt = 0;
    setArm('L', P.restL);
    if (act) {
      const t = act.t += dt;
      if (act.id === 'drag') {
        kR = smooth(t) * (1 - smooth(t - 2.3)); glowing = t > .9 && t < 2.3 ? .6 + .4 * Math.sin((t - .9) / 1.4 * Math.PI) : 0;
        // breathing it out
        if (t > 2.9 && t < 3.9 && (breathT -= dt) <= 0) {
          breathT = .05;
          if (mine) lookDir(fwd, look.yaw, look.pitch); else lookDir(fwd, F.head.rotation.y, 0);
          tmp.copy(mouthW); if (mine) eyeOf(tmp).y -= .08;
          puff(tmp, group.worldToLocal(fwd.multiplyScalar(.6 + Math.random() * .4).add(group.position)).add(new THREE.Vector3((Math.random() - .5) * .12, .1 + Math.random() * .08, (Math.random() - .5) * .12)), 1.5 + Math.random() * .6, .05, .5, .2);
        }
      } else {
        if (t < .7) setArm('L', P.restL, P.grabL, smooth(t / .7));
        else if (t < 1.7) setArm('L', P.grabL, act.pose, smooth(t - .7));
        else if (t < 3) { setArm('L', act.pose); tilt = Math.sin((t - 1.7) / 1.3 * Math.PI); }
        else if (t < 4) setArm('L', act.pose, P.grabL, smooth(t - 3));
        else setArm('L', P.grabL, P.restL, smooth((t - 4) / .7));
        const held = t >= .7 && t < 4; if (held !== act.held) { act.held = held; holdCan(held); }
      }
      if (t >= act.dur) {
        if (act.id === 'drink' && ++sips >= 4) { sips = 0; drunk++; empty(); can.visible = drunk < CANS; }   // that one's done: on the ground with the rest, and a fresh one
        act = null;
      }
    }
    setArm('R', P.restR, act && act.id === 'drag' ? act.pose : P.restR, kR); F.wrist.rotation.x = WRIST[0] + (WRIST[1] - WRIST[0]) * kR;
    // his head: looking slowly along the valley; back for a swallow (hidden while you are in it)
    F.head.visible = !mine; F.head.rotation.set(-.3 * tilt, mine ? 0 : Math.sin(clock * .21) * .3 + Math.sin(clock * .07) * .15, 0);
    glasses.visible = !(mine && bino.k > 0);
    // the ember, and the smoke (none in front of the binoculars)
    const pulse = .5 + .12 * Math.sin(clock * 3.1) + .5 * glowing;
    F.ember.material.color.setRGB(.55 + .45 * pulse, .16 + .5 * glowing, .05 + .12 * glowing); F.ember.scale.setScalar(1 + .6 * glowing);
    if ((wispT -= dt) <= 0) { wispT = .28; puff(F.ember.getWorldPosition(tmp), new THREE.Vector3((Math.random() - .5) * .05, .2 + Math.random() * .08, (Math.random() - .5) * .05), 2 + Math.random() * .6, .02, .16, .3); }
    const grey = .25 + .65 * (1 - n), hide = mine && bino.k > .2;
    for (const p of smoke) {
      if (p.life <= 0) continue;
      p.life -= dt; if (p.life <= 0) { p.s.visible = false; continue; }
      const k = 1 - p.life / p.max; p.s.position.addScaledVector(p.v, dt); p.v.multiplyScalar(1 - dt * .9); p.v.y += dt * .12;
      p.s.scale.setScalar(p.s0 + (p.s1 - p.s0) * k); p.s.material.opacity = p.a * (1 - k) * Math.min(1, k * 8); p.s.material.color.setScalar(grey); p.s.visible = !hide;
    }
  }

  /** the camera, while you are here (called every frame after update) */
  function frame(camera) {
    if (mode === 'stand') { camera.position.copy(standPos); camera.rotation.set(look.pitch, look.yaw, 0, 'YXZ'); }
    else if (mode === 'man') {
      // through the binoculars the view sways a little with his hands
      const sway = bino.k * camera.fov * Math.PI / 180 * .012;
      lookDir(fwd, look.yaw + sway * (Math.sin(clock * 1.7) + .6 * Math.sin(clock * 4.1 + 1)), look.pitch + .16 * tilt + sway * (Math.sin(clock * 2.3 + 2) + .5 * Math.sin(clock * 3.7)));
      eyeOf(eye); camera.position.copy(eye); camera.up.set(0, 1, 0); camera.lookAt(eye.x + fwd.x, eye.y + fwd.y, eye.z + fwd.z);
    }
  }
  function lookBy(dx, dy) {
    if (mode === 'stand') { level = null; look.yaw -= dx * .0045; look.pitch = clamp(look.pitch - dy * .0045, -1.3, 1.3); return; }
    if (mode !== 'man') return;
    const k = .0045 * (bino.k > 0 && cam ? cam.fov / bino.base : 1);   // finer through the binoculars
    if (bino.on) bino.track = false;
    look.yaw = clamp(look.yaw - dx * k, -2.3, 2.3); look.pitch = clamp(look.pitch - dy * k, -1.1, 1.1);
  }
  /** the scroll wheel zooms the binoculars; true if it did */
  function zoom(dy) {
    if (mode !== 'man' || !bino.on) return false;
    bino.zoomed = true; bino.goal = clamp(bino.goal * (dy > 0 ? 1.2 : 1 / 1.2), GLASS.min, GLASS.max); return true;
  }

  // ---- arriving, stepping into him, and leaving
  /** stand behind the chair, looking the way the camera already is (the "Go to" flight ends here) */
  function stand(camera) { mode = 'stand'; eul.setFromQuaternion(camera.quaternion, 'YXZ'); look.yaw = eul.y; look.pitch = eul.x; level = PITCH0; return getState(); }
  function inhabit() { mode = 'man'; look.yaw = 0; look.pitch = -.06; F.head.visible = false; return getState(); }
  /** out of the hunter and back behind the chair; from there (or with all = true) away altogether */
  function leave(all = false) {
    if (!mode) return null;
    const was = mode; setGlass(false); F.head.visible = true;
    if (was === 'man' && !all) { mode = 'stand'; look.yaw = YAW0; look.pitch = PITCH0; return { spectate: true }; }
    mode = null;
    if (cam && bino.k > 0) { bino.k = 0; bino.fov = bino.base; cam.fov = bino.base; cam.updateProjectionMatrix(); }
    const dir = new THREE.Vector3(sh, 0, ch);
    return { p: new THREE.Vector3(SX, SY, SZ), dir, cam: standPos.clone().addScaledVector(dir, -16).add(new THREE.Vector3(0, 8, 0)) };
  }
  const pv = new THREE.Vector3();
  /** the hunter under screen point (x, y), to click on */
  function pick(camera, x, y, w, hgt) {
    if (mode === 'man' || !group.visible) return null;
    const dist = camera.position.distanceTo(chestW); if (dist > 300) return null;
    pv.copy(chestW).project(camera); if (pv.z > 1) return null;
    const f = hgt / (2 * Math.tan(camera.fov * Math.PI / 360)), d = Math.hypot((pv.x + 1) / 2 * w - x, (1 - pv.y) / 2 * hgt - y);
    return d < Math.max(12, f * .5 / dist) ? { hunter: true } : null;
  }
  const now = () => (bino.on ? bino.text
    : act && act.id === 'drag' ? 'Taking a drag'
    : act && act.id === 'drink' ? `Drinking beer ${drunk + 1} of ${CANS}`
    : drunk >= CANS ? `Out of beer: all ${CANS} cans are on the ground`
    : `Sitting on the ridge with a cigarette and beer ${drunk + 1} of ${CANS}, a buck in the truck`);
  const ACTS = [{ id: 'drag', label: 'Take a drag', key: '1' }, { id: 'drink', label: 'Drink beer', key: '2' }, { id: 'glass', label: 'Check out the view', key: '3', on: false }];
  // standing behind him, a button as well as tapping him: on a phone the hint saying so is folded away
  const EYES = [{ id: 'eyes', label: 'See through his eyes' }];
  /** what index.js and ui.js need to know while you are here (null when you aren't); hintTouch
   *  leads with what to tap, as a phone shows the first three lines */
  function getState() {
    if (!mode) return null;
    if (mode === 'stand') return { kind: 'vista', id: 'overlook', view: view.id, labels: true, actions: EYES,
      hint: 'On top of Bald Eagle Mountain, behind a hunter who has the best seat in the valley. Drag or click to look around: that’s his truck on the right. Click him to see through his eyes. Esc or “Step away” to leave.',
      hintTouch: 'On top of Bald Eagle Mountain, behind a hunter who has the best seat in the valley. Tap him, or “See through his eyes”, to sit in his chair. Drag to look around: that’s his truck on the right. “Step away” to leave.' };
    ACTS[2].on = bino.on; ACTS[2].label = bino.on ? 'Lower the binoculars' : 'Check out the view';   // (short enough for a phone's bar, on one line)
    return { kind: 'person', id: 'hunter', view: view.id, labels: true, ...WHO, now: now(), portrait, actions: ACTS, bino: smooth(bino.k),
      hint: `Seeing the valley through ${WHO.name}’s eyes, from his chair on Bald Eagle Mountain. Drag or click to look around. Take a drag, drink beer, or check out the view through his binoculars (scroll to zoom). Space, Esc or “Leave” to step back behind him.`,
      hintTouch: `Seeing the valley through ${WHO.name}’s eyes, from his chair on Bald Eagle Mountain. Take a drag, drink beer, or check out the view through his binoculars (spread two fingers to zoom). Drag to look around; “Leave” to step back behind him.` };
  }

  // a head-and-shoulders portrait for his card (as detassel.js): a fresh figure, standing, facing the camera
  let pr = null;
  function portrait(size = 176) {
    if (!pr) {
      const canvas = document.createElement('canvas'), renderer = makeRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setSize(size, size, false);
      const sc = new THREE.Scene(), pc = new THREE.PerspectiveCamera(28, 1, .05, 10), B = hunter(T);
      sc.add(new THREE.HemisphereLight('#fff4e6', '#4a5560', .85 * LIGHT)); const key = new THREE.DirectionalLight('#ffffff', .75 * LIGHT); key.position.set(.6, 1.2, 1.4); sc.add(key);
      sc.add(B.root); B.root.updateMatrixWorld(true);
      const hd = B.head.getWorldPosition(new THREE.Vector3()); pc.position.set(hd.x + .06, hd.y - .02, hd.z + .78); pc.lookAt(hd.x, hd.y - .1, hd.z);
      renderer.render(sc, pc); pr = canvas;
    }
    return pr;
  }
  return { view, update, frame, look: lookBy, zoom, stand, inhabit, leave, pick, act: doAct, getState, on: () => !!mode, group, figure: F };
}
