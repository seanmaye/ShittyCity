// Standing people with jointed limbs (for park games and statues). A figure is about 1.8 m tall,
// stands on y = 0 and faces +z. Joints are groups: rotate .x on hips, knees, shoulders and
// elbows to swing limbs (negative = forward), .x on the pelvis to lean.
import * as THREE from 'three';

const GEO = new Map();
/** shared limb geometry; bulk thickens limbs and torso (an athlete's statue) */
function geo(bulk = 1) {
  if (GEO.has(bulk)) return GEO.get(bulk);
  const b = bulk, seg = b > 1 ? 12 : 7, G = {};
  const cyl = (r0, r1, len) => { const g = new THREE.CylinderGeometry(r0 * b, r1 * b, len, seg); g.translate(0, -len / 2, 0); return g; };
  G.thigh = cyl(.085, .065, .45); G.shin = cyl(.06, .045, .45); G.upper = cyl(.055, .045, .3); G.fore = cyl(.045, .038, .27);
  G.torso = new THREE.CylinderGeometry(.19 * b, .15 * b, .56, seg + 1); G.torso.translate(0, .28, 0);
  G.shorts = new THREE.CylinderGeometry(.165 * b, .17 * b, .2, seg + 1); G.shorts.translate(0, .02, 0);
  G.head = new THREE.SphereGeometry(.11, 12, 10); G.neck = cyl(.05, .05, .08);
  G.hand = new THREE.SphereGeometry(.045 * b, 8, 6); G.foot = new THREE.BoxGeometry(.09 * b, .07, .24); G.foot.translate(0, -.035, .06);
  G.hair = new THREE.SphereGeometry(.115, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  GEO.set(bulk, G); return G;
}

/**
 * colors: { shirt, shorts, skin, shoe, hair } or mat: one material for everything (a statue);
 * bulk > 1 thickens the build.
 * Returns { root, pelvis, chest, head, hipL, hipR, kneeL, kneeR, shL, shR, elL, elR, handL, handR }.
 */
export function makeFigure(colors = {}, mat = null, bulk = 1) {
  const g = geo(bulk);
  const m = k => mat || new THREE.MeshStandardMaterial({ color: colors[k] || { shirt: '#d8d8d8', shorts: '#2e3542', skin: '#c99370', shoe: '#222222', hair: '#2a1d16' }[k], roughness: .8 });
  const M = { shirt: m('shirt'), shorts: m('shorts'), skin: m('skin'), shoe: m('shoe'), hair: m('hair') };
  const mesh = (gg, mm, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(gg, mm); o.position.set(x, y, z); o.castShadow = true; return o; };
  const grp = (parent, x, y, z) => { const o = new THREE.Group(); o.position.set(x, y, z); parent.add(o); return o; };
  const root = new THREE.Group(), F = { root };
  F.pelvis = grp(root, 0, .92, 0);
  F.pelvis.add(mesh(g.torso, M.shirt), mesh(g.shorts, M.shorts));
  F.chest = grp(F.pelvis, 0, .56, 0);
  F.chest.add(mesh(g.neck, M.skin, 0, .08, 0));
  F.head = mesh(g.head, M.skin, 0, .17, 0); F.head.add(mesh(g.hair, M.hair, 0, .01, -.01)); F.chest.add(F.head);
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    const hip = F['hip' + s] = grp(F.pelvis, sx * .1, 0, 0);
    hip.add(mesh(g.thigh, M.shorts));
    const knee = F['knee' + s] = grp(hip, 0, -.45, 0);
    knee.add(mesh(g.shin, M.skin)); knee.add(mesh(g.foot, M.shoe, 0, -.45, 0));
    const sh = F['sh' + s] = grp(F.chest, sx * (.23 + (bulk - 1) * .14), -.04, 0);
    sh.add(mesh(g.upper, M.shirt));
    const el = F['el' + s] = grp(sh, 0, -.3, 0);
    el.add(mesh(g.fore, M.skin));
    F['hand' + s] = mesh(g.hand, M.skin, 0, -.29, 0); el.add(F['hand' + s]);
  }
  return F;
}

/** Running (speed in m/s; 0 stands) at phase p (radians, advance by speed * dt * 1.6). */
export function pose(F, p, speed) {
  const a = Math.min(1, speed / 6), s = Math.sin(p);
  F.hipL.rotation.x = -s * .9 * a; F.hipR.rotation.x = s * .9 * a;
  F.kneeL.rotation.x = (.15 + .9 * Math.max(0, Math.sin(p + 1.2))) * a; F.kneeR.rotation.x = (.15 + .9 * Math.max(0, Math.sin(p + 1.2 + Math.PI))) * a;
  F.shL.rotation.x = s * .8 * a; F.shR.rotation.x = -s * .8 * a; F.shL.rotation.z = F.shR.rotation.z = 0;
  F.elL.rotation.x = F.elR.rotation.x = -.3 - 1.1 * a;
  F.pelvis.rotation.x = .18 * a; F.pelvis.position.y = .92 + Math.abs(s) * .05 * a;
}
