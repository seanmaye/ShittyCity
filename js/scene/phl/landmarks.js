// Hand-styled landmarks (tower crowns, City Hall, 30th Street, the Art Museum, Eastern
// State, Boathouse Row), each placed, sized and rotated from its real footprint.
import * as THREE from 'three';
import { M, winMat, worldWinMat, bx, reps, litMats, WIN_W, WIN_H, addDisplay, DISPLAY_PRESETS } from '../materials.js';
import { Builder, addLoft } from '../geometry.js';
import { aviationLights } from '../buildings.js';
/** Bring a box rotation into (-45deg, 45deg], swapping its sides to match. */
function norm(b) {
  let { w, d, ry } = b;
  while (ry > Math.PI / 4) { ry -= Math.PI / 2; [w, d] = [d, w]; }
  while (ry <= -Math.PI / 4) { ry += Math.PI / 2; [w, d] = [d, w]; }
  return { ...b, w, d, ry };
}

function group(scene, x, z, ry) { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g); return g; }
function part(g, geo, mat, x, y, z, cast = true) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; g.add(m); return m; }

// ---- signature towers, each built from its real footprint and height, with the shapes and
// cladding of the real building: setbacks, notched or chamfered corners, crowns that light up
// at night, and an aviation light on top
const rect = (w, d) => [[w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2], [-w / 2, -d / 2]];
const notched = (w, d, n) => [[w / 2, -d / 2 + n], [w / 2, d / 2 - n], [w / 2 - n, d / 2 - n], [w / 2 - n, d / 2], [-w / 2 + n, d / 2], [-w / 2 + n, d / 2 - n],
  [-w / 2, d / 2 - n], [-w / 2, -d / 2 + n], [-w / 2 + n, -d / 2 + n], [-w / 2 + n, -d / 2], [w / 2 - n, -d / 2], [w / 2 - n, -d / 2 + n]];
const chamfer = (w, d, c) => [[w / 2, -d / 2 + c], [w / 2, d / 2 - c], [w / 2 - c, d / 2], [-w / 2 + c, d / 2], [-w / 2, d / 2 - c], [-w / 2, -d / 2 + c], [-w / 2 + c, -d / 2], [w / 2 - c, -d / 2]];
// cladding as built (the data file keeps the original colours; these follow the real towers)
const LOOK = {
  ctc: { color: '#a9bccb', trim: '#c9d3da' },        // clear low-iron glass
  comcast: { color: '#8ea5b6', trim: '#b7c4cc' },    // pale blue-grey glass
  lib1: { color: '#4f7194', trim: '#a9b3bb' },       // blue glass, silver-grey granite and steel crown
  lib2: { color: '#557797', trim: '#a9b3bb' },
  mellon: { color: '#b49c86', trim: '#9b8b7c' },     // rose-beige granite
  logan3: { color: '#8a594c', trim: '#6c4a40' },     // red granite
  comm1: { color: '#c9bca6', trim: '#a99c88' },      // buff granite
  comm2: { color: '#c9bca6', trim: '#a99c88' },
  psfs: { color: '#a3a4a1', trim: '#2c2f33', kind: 'office2' },   // grey limestone ribbons, black granite
};
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
/** A flat face (3 or 4 points) into a vertex-coloured builder, wound to face away from `inside`. */
function face(b, P, col, inside) {
  const n = new THREE.Vector3().subVectors(P[1], P[0]).cross(new THREE.Vector3().subVectors(P[2], P[0])).normalize();
  const c = P.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(P.length);
  if (n.dot(c.sub(inside)) < 0) { P = P.slice().reverse(); n.negate(); }
  const i = P.map(p => b.v(p.x, p.y, p.z, n.x, n.y, n.z, 0, 0, col));
  b.tri(i[0], i[1], i[2]); if (i.length === 4) b.tri(i[0], i[2], i[3]);
}

function tower(scene, t, beacons) {
  const { w, d, h } = t, g = group(scene, t.x, t.z, t.ry), L = LOOK[t.id] || {};
  const color = new THREE.Color(L.color || t.color), trim = new THREE.Color(L.trim || '#9aa3ab'), kind = L.kind || t.kind;
  const fac = new Builder({ uv: true, color: true }), plain = new Builder({ color: true }), glow = new Builder({ color: true });
  const lines = [], white = new THREE.Color('#e9eef2');
  const sec = (ring, y0, y1, s0 = 1, s1 = 1) => addLoft(fac, ring, y0, y1, s0, s1, WIN_W, WIN_H, color, true, (t.x * .0131) % 1);
  const solid = (ring, y0, y1, s0 = 1, s1 = 1, col = trim, b = plain, cap = true) => addLoft(b, ring, y0, y1, s0, s1, 1, 1, col, cap);
  // a gable on the face of a crown: front triangle at distance r out along n, roofs running back
  const gable = (nx, nz, r, y0, gw, gh, depth) => {
    const tx = -nz, tz = nx, f = v3(nx * r, y0, nz * r), inside = v3(0, y0, 0);
    const Lp = f.clone().add(v3(tx * gw / 2, 0, tz * gw / 2)), Rp = f.clone().add(v3(-tx * gw / 2, 0, -tz * gw / 2)), T = f.clone().setY(y0 + gh);
    const back = p => p.clone().add(v3(-nx * depth, 0, -nz * depth));
    face(plain, [Lp, Rp, T], trim, inside); face(plain, [Lp, T, back(T), back(Lp)], trim, inside); face(plain, [T, Rp, back(Rp), back(T)], trim, inside);
    lines.push(Lp, T, T, Rp);
  };
  const hips = (half, y0, y1, top = 0) => { for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) lines.push(v3(a * half, y0, b * half), v3(a * top, y1, b * top)); };
  let peak = h;
  switch (t.cap) {
    case 'ctc': {   // a slim glass shaft with a folded face; the top floors open into a lit glass lantern
      const fold = [[w / 2, -d / 2], [w / 2, d / 2], [0, d / 2 - 1.8], [-w / 2, d / 2], [-w / 2, -d / 2], [0, -d / 2 + 1.8]];
      sec(fold, 0, .89 * h);
      solid(fold, .89 * h, h, 1, 1, white, glow, false);
      solid(rect(w * .5, d * .45), .89 * h, .975 * h, 1, 1, new THREE.Color('#4b5258'));
      break;
    }
    case 'taper': {   // Comcast Center: a tapering glass obelisk with notched corners and a glowing top
      const s = Math.min(w, d), ring = notched(s, s, s * .06);
      sec(ring, 0, .93 * h, 1, .9);
      solid(ring, .93 * h, h, .9, .8, white, glow);
      break;
    }
    case 'liberty': {   // One and Two Liberty Place: setbacks up to a gabled crown (One has the spire)
      const one = t.id === 'lib1', s = Math.min(w, d);
      sec(notched(w, d, .1 * s), 0, .68 * h);
      sec(notched(.86 * w, .86 * d, .085 * s), .68 * h, .76 * h);
      sec(notched(.72 * w, .72 * d, .07 * s), .76 * h, .82 * h);
      const c = .6 * s, y0 = .85 * h, y1 = one ? .95 * h : .935 * h, sTop = one ? 0 : .3;
      solid(rect(c, c), .82 * h, y0);
      solid(rect(c, c), y0, y1, 1, sTop);
      const half = y => c / 2 * (1 - (1 - sTop) * (y - y0) / (y1 - y0));
      for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        gable(nx, nz, c / 2 + .3, y0, c * .78, .075 * h, c * .3);
        const y2 = y0 + .045 * h; gable(nx, nz, half(y2) + .3, y2, half(y2) * 1.5, .055 * h, c * .2);
      }
      hips(c / 2, y0, y1, c / 2 * sTop);
      if (one) { solid(rect(2.6, 2.6), y1, h, 1, 0); lines.push(v3(0, y1, 0), v3(0, h, 0)); }
      else { peak = y1 + 9; solid(rect(1, 1), y1, peak, 1, .5); }
      break;
    }
    case 'pyramid':
      if (t.id === 'mellon') {   // BNY Mellon Center: notched granite shaft, stepped base to a lit glass pyramid
        const s = Math.min(w, d);
        sec(notched(w, d, .12 * s), 0, .85 * h);
        sec(notched(.84 * w, .84 * d, .1 * s), .85 * h, .89 * h);
        solid(rect(.74 * s, .74 * s), .89 * h, .985 * h, 1, .1, new THREE.Color('#c8d4dc'), glow);
        hips(.37 * s, .89 * h, .985 * h, .037 * s);
        solid(rect(1.2, 1.2), .985 * h, h, 1, .3);
      } else {   // Commerce Square: chamfered granite towers, stepped octagonal crowns and a lantern
        const s = Math.min(w, d);
        sec(chamfer(w, d, .2 * s), 0, .84 * h);
        sec(chamfer(.84 * w, .84 * d, .17 * s), .84 * h, .89 * h);
        solid(chamfer(.66 * s, .66 * s, .13 * s), .89 * h, .93 * h);
        solid(chamfer(.66 * s, .66 * s, .13 * s), .93 * h, .975 * h, 1, .25, new THREE.Color('#7f8f86'));
        solid(chamfer(.16 * s, .16 * s, .04 * s), .975 * h, .995 * h, 1, .6, new THREE.Color('#fff4d8'), glow);
        lines.push(v3(0, .995 * h, 0), v3(0, h + 4, 0)); peak = h + 4;
      }
      break;
    case 'stepped': {   // Three Logan Square: red granite, three setbacks and a pyramid roof
      sec(notched(w, d, .08 * Math.min(w, d)), 0, .78 * h);
      sec(notched(.86 * w, .86 * d, .07 * Math.min(w, d)), .78 * h, .86 * h);
      sec(rect(.7 * w, .7 * d), .86 * h, .91 * h);
      solid(rect(.7 * w, .7 * d), .91 * h, h, 1, 0, new THREE.Color('#5a4741'));
      hips(.35 * Math.min(w, d), .91 * h, h);
      break;
    }
    case 'psfs': {   // PSFS: grey limestone office slab with ribbon windows, black granite spine and base, the red sign
      sec([[w / 2, -d / 2], [w / 2, d * .3], [-w / 2, d * .3], [-w / 2, -d / 2]], 10, .9 * h);
      solid([[w * .2, d * .3], [w * .2, d / 2 + 2], [-w * .2, d / 2 + 2], [-w * .2, d * .3]], 0, .93 * h);
      solid(rect(w + 2, d + 2), 0, 10);
      solid(rect(w * .5, d * .4), .9 * h, .93 * h);
      peak = h + 6; psfsSign(g, w, d, .93 * h, peak - .93 * h);
      break;
    }
    default: sec(rect(w, d), 0, h);
  }
  part(g, fac.geometry(), worldWinMat(kind), 0, 0, 0);
  part(g, plain.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .55, metalness: .25, side: THREE.DoubleSide }), 0, 0, 0);
  // the crown's display lights (glowing glass and lit outlines) take the skyline colour scheme
  let gm = null, lm = null;
  if (glow.count) {
    gm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .35, metalness: .3, emissive: '#eef4ff', emissiveIntensity: 0, side: THREE.DoubleSide });
    gm.userData.lit = .55; litMats.push(gm); part(g, glow.geometry(), gm, 0, 0, 0);
  }
  g.updateMatrixWorld();
  beacons.push(v3(0, peak + 1, 0).applyMatrix4(g.matrixWorld));
  let ls = null;
  if (lines.length) {
    lm = new THREE.LineBasicMaterial({ color: '#f4f8ff' });
    ls = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines), lm); ls.visible = false; g.add(ls);
  }
  if (gm || lm) addDisplay(hex => { if (gm) gm.emissive.set(hex); if (lm) lm.color.set(hex); });
  return ls;
}

/** The PSFS sign: red letters on a steel frame, both street faces, neon at night. */
function psfsSign(g, w, d, y, hh) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 160;
  const x = c.getContext('2d'); x.fillStyle = '#d42a1e'; x.font = 'bold 150px Arial, Helvetica, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('PSFS', 256, 86);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.MeshStandardMaterial({ map: tex, emissive: '#ff3322', emissiveMap: tex, emissiveIntensity: 0, transparent: true, alphaTest: .3, side: THREE.DoubleSide });
  m.userData.lit = 1.4; litMats.push(m);
  const frame = new THREE.MeshStandardMaterial({ color: '#3b3f44', roughness: .6, metalness: .5 });
  const W = w * .8;
  part(g, new THREE.PlaneGeometry(W, hh), m, 0, y + hh / 2, -d * .2 - 1).rotation.y = Math.PI;
  const side = part(g, new THREE.PlaneGeometry(d * .8, hh), m, w * .25 + 1, y + hh / 2, 0); side.rotation.y = Math.PI / 2;
  part(g, new THREE.BoxGeometry(W, .6, .6), frame, 0, y + .3, -d * .2);
}

function cityHall(scene, b) {
  const W = (b.w + b.d) / 2, T = 32, Hh = 40, col = '#d9cfbd';
  const g = group(scene, b.x, b.z, b.ry);
  const r = reps(W, Hh), m = winMat(col, r[0], r[1], 1, 'stone');
  [[0, -(W - T) / 2, W, T], [0, (W - T) / 2, W, T], [-(W - T) / 2, 0, T, W - 2 * T], [(W - T) / 2, 0, T, W - 2 * T]].forEach(([dx, dz, ww, dd]) => part(g, bx(ww, Hh, dd), m, dx, Hh / 2, dz));
  const pav = winMat(col, 2, 2, 2, 'stone'), po = W / 2 - 17;
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, c]) => part(g, bx(34, 50, 34), pav, a * po, 25, c * po));
  const st = new THREE.MeshStandardMaterial({ color: col, roughness: .8 }), dm = new THREE.MeshStandardMaterial({ color: '#8a8068', roughness: .6, metalness: .2 });
  const tz = -(W - T) / 2; // the tower stands on the north side
  part(g, new THREE.BoxGeometry(30, 95, 30), st, 0, 47.5, tz); part(g, new THREE.BoxGeometry(24, 22, 24), st, 0, 106, tz);
  part(g, new THREE.CylinderGeometry(11, 12, 18, 8), dm, 0, 126, tz); part(g, new THREE.ConeGeometry(11, 20, 8), dm, 0, 145, tz);
  part(g, new THREE.CylinderGeometry(2.5, 3, 6, 8), dm, 0, 158, tz); part(g, new THREE.CylinderGeometry(1, 1.4, 7, 8), dm, 0, 164.5, tz);
  g.updateMatrixWorld(); return new THREE.Vector3(0, 0, tz).applyMatrix4(g.matrixWorld);
}

function station(scene, b) {
  const { w, d } = b, col = '#d6cbb5';
  const g = group(scene, b.x, b.z, b.ry);
  const r = reps(w, 32);
  part(g, bx(w * .95, 32, d * .975), winMat(col, r[0], 1, 0, 'stone'), 0, 16, 0);
  part(g, new THREE.BoxGeometry(w * .95 + 4, 3, d * .975 + 4), new THREE.MeshStandardMaterial({ color: '#7b7468' }), 0, 33.5, 0);
  const cm = new THREE.MeshStandardMaterial({ color: '#e3dbc8' });
  for (let i = 0; i < 8; i++) [-1, 1].forEach(s => part(g, new THREE.CylinderGeometry(1.8, 1.8, 26, 10), cm, s * (w * .95 / 2 + 2), 13, -35 + i * 10));
  return new THREE.Vector3(b.x, 0, b.z);
}

function museum(scene, c, toward) {
  const dir = toward.clone().sub(c).setY(0).normalize(); const ry = Math.atan2(dir.x, dir.z);
  const g = new THREE.Group(); g.position.copy(c); g.rotation.y = ry; scene.add(g);
  const sand = new THREE.MeshStandardMaterial({ color: '#d8b98a', roughness: .85 }), roof = new THREE.MeshStandardMaterial({ color: '#3f6f86', roughness: .6 }), terr = new THREE.MeshStandardMaterial({ color: '#cdbf9f', roughness: .9 });
  const add = (geo, mat, x, y, z) => part(g, geo, mat, x, y, z);
  add(new THREE.BoxGeometry(240, 12, 230), terr, 0, 6, -5);
  for (let i = 0; i < 8; i++) add(new THREE.BoxGeometry(70, 12 - i * 1.5, 6), terr, 0, (12 - i * 1.5) / 2, 113 + i * 6);
  add(new THREE.BoxGeometry(100, 30, 45), sand, 0, 27, -55); add(new THREE.BoxGeometry(104, 3, 49), roof, 0, 43.5, -55);
  [-1, 1].forEach(s => { add(new THREE.BoxGeometry(40, 28, 115), sand, s * 72, 26, 0); add(new THREE.BoxGeometry(44, 3, 119), roof, s * 72, 41.5, 0); });
  for (let i = 0; i < 8; i++) add(new THREE.CylinderGeometry(1.6, 1.7, 22, 10), sand, -28 + i * 8, 23, -30);
  const tri = (wd, ht, dp) => { const s = new THREE.Shape(); s.moveTo(-wd / 2, 0); s.lineTo(wd / 2, 0); s.lineTo(0, ht); s.lineTo(-wd / 2, 0); const pg = new THREE.ExtrudeGeometry(s, { depth: dp, bevelEnabled: false }); pg.translate(0, 0, -dp / 2); return pg; };
  add(tri(68, 10, 8), roof, 0, 34, -30); [-1, 1].forEach(s => add(tri(42, 8, 6), roof, s * 72, 40, 57));
  return { pos: c.clone(), dir };
}

function easternState(scene, b) {
  const S = b.size, k = S / 200, g = group(scene, b.x, b.z, b.ry);
  const m = new THREE.MeshStandardMaterial({ color: '#9b9387', roughness: .95 });
  [[0, -S / 2, S, 3], [0, S / 2, S, 3], [-S / 2, 0, 3, S], [S / 2, 0, 3, S]].forEach(([dx, dz, w, d]) => part(g, new THREE.BoxGeometry(w, 10, d), m, dx, 5, dz));
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * .25 + i * (Math.PI * 2 / 7), L = (70 + (i % 2) * 15) * k;
    const blk = part(g, new THREE.BoxGeometry(10, 9, L), m, Math.sin(a) * (L / 2 + 8), 4.5, Math.cos(a) * (L / 2 + 8)); blk.rotation.y = a;
  }
  part(g, new THREE.CylinderGeometry(10, 10, 13, 12), m, 0, 6.5, 0);
  return new THREE.Vector3(b.x, 0, b.z);
}

function boathouses(scene, list, river) {
  const walls = ['#c4583f', '#8e6a4e', '#e3d9c4', '#a7463a', '#d8cdb4', '#6f5a4a', '#b9a37c'];
  const roofM = new THREE.MeshStandardMaterial({ color: '#3c4a52', roughness: .8 });
  const lines = [];
  list.forEach((b, i) => {
    // gable ridge runs away from the water, as on the real Boathouse Row
    const n = river.riverInfo(b.x, b.z).s.n;
    let { w, d, ry } = b;
    if (Math.abs(Math.cos(ry) * n.x - Math.sin(ry) * n.z) < Math.abs(Math.cos(ry + Math.PI / 2) * n.x - Math.sin(ry + Math.PI / 2) * n.z)) { ry += Math.PI / 2; [w, d] = [d, w]; }
    const wallH = Math.max(5, b.h * .62), roofH = Math.max(3, b.h - wallH);
    const g = group(scene, b.x, b.z, ry);
    const bg = new THREE.BoxGeometry(w, wallH, d);
    const tri = new THREE.Shape(); tri.moveTo(-d / 2, 0); tri.lineTo(d / 2, 0); tri.lineTo(0, roofH); tri.lineTo(-d / 2, 0);
    const rg = new THREE.ExtrudeGeometry(tri, { depth: w, bevelEnabled: false }); rg.translate(0, 0, -w / 2); rg.rotateY(Math.PI / 2);
    const body = part(g, bg, new THREE.MeshStandardMaterial({ color: walls[i % walls.length], roughness: .85 }), 0, wallH / 2, 0);
    part(g, rg, roofM, 0, wallH, 0);
    // the outline lights: warm white normally, the skyline colour scheme otherwise (as the real row does)
    const lineMat = new THREE.LineBasicMaterial({ color: '#fff1c8' });
    addDisplay(hex => lineMat.color.set(hex === DISPLAY_PRESETS[0].colors[0] ? '#fff1c8' : hex));
    const l1 = new THREE.LineSegments(new THREE.EdgesGeometry(bg), lineMat); l1.position.y = wallH / 2;
    const l2 = new THREE.LineSegments(new THREE.EdgesGeometry(rg), lineMat); l2.position.y = wallH;
    g.add(l1, l2); lines.push(l1, l2); body.castShadow = true;
  });
  return lines;
}

export function buildLandmarks(scene, lm, river) {
  const beacons = [], crownLights = lm.towers.map(t => tower(scene, norm(t), beacons)).filter(Boolean);
  const av = aviationLights(beacons.flatMap(p => [p.x, p.y, p.z])); scene.add(av);
  const cityhall = cityHall(scene, norm(lm.cityhall));
  const st = station(scene, lm.station);
  const mus = museum(scene, new THREE.Vector3(lm.museum.x, 0, lm.museum.z), cityhall);
  const esp = easternState(scene, lm.esp);
  const boatLines = boathouses(scene, lm.boathouses, river);
  return { cityhall, station: st, museum: mus, esp, boatLines, nightOnly: [...crownLights, av] };
}
