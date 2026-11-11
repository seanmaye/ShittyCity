// Hand-styled landmarks (tower crowns, City Hall, 30th Street, the Art Museum, Eastern
// State, Boathouse Row), each placed, sized and rotated from its real footprint.
import * as THREE from 'three';
import { M, winMat, bx, reps, litMats } from './materials.js';
/** Bring a box rotation into (-45deg, 45deg], swapping its sides to match. */
function norm(b) {
  let { w, d, ry } = b;
  while (ry > Math.PI / 4) { ry -= Math.PI / 2; [w, d] = [d, w]; }
  while (ry <= -Math.PI / 4) { ry += Math.PI / 2; [w, d] = [d, w]; }
  return { ...b, w, d, ry };
}

function group(scene, x, z, ry) { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g); return g; }
function part(g, geo, mat, x, y, z, cast = true) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; g.add(m); return m; }

function tower(scene, t) {
  const { w, d, h, color, cap, kind } = t;
  const g = group(scene, t.x, t.z, t.ry);
  const plain = new THREE.MeshStandardMaterial({ color, roughness: kind === 'glass' ? .3 : .8, metalness: kind === 'glass' ? .4 : .05 });
  const seg = (sw, sd, y0, y1) => { const hh = y1 - y0; const r = reps(sw, hh); part(g, bx(sw, hh, sd), winMat(color, r[0], r[1], Math.floor(Math.random() * 3), kind), 0, y0 + hh / 2, 0); };
  const pyr = (side, y0, y1) => { const geo = new THREE.ConeGeometry(side / Math.SQRT2, y1 - y0, 4); geo.rotateY(Math.PI / 4); part(g, geo, plain, 0, (y0 + y1) / 2, 0); };
  if (cap === 'liberty') { seg(w, d, 0, .70 * h); seg(.82 * w, .82 * d, .70 * h, .80 * h); seg(.64 * w, .64 * d, .80 * h, .87 * h); pyr(.5 * Math.min(w, d), .87 * h, .965 * h); part(g, new THREE.CylinderGeometry(.25, .9, .035 * h, 6), plain, 0, .9825 * h, 0); }
  else if (cap === 'taper') { const s = Math.min(w, d); const geo = new THREE.CylinderGeometry(s * .86 / Math.SQRT2, s / Math.SQRT2, h, 4, 1); geo.rotateY(Math.PI / 4); const r = reps(s * 4, h); part(g, geo, winMat(color, r[0], r[1], 0, kind), 0, h / 2, 0); }
  else if (cap === 'ctc') {
    seg(w, d, 0, .93 * h); const fh = .07 * h;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => part(g, new THREE.BoxGeometry(3, fh, 3), plain, a * (w / 2 - 1.5), .93 * h + fh / 2, b * (d / 2 - 1.5)));
    [-1, 1].forEach(b => part(g, new THREE.BoxGeometry(w, 2, 2), plain, 0, h - 1, b * (d / 2 - 1)));
  }
  else if (cap === 'pyramid') { seg(w, d, 0, .86 * h); pyr(.95 * Math.min(w, d), .86 * h, h); }
  else if (cap === 'stepped') { seg(w, d, 0, .86 * h); seg(.78 * w, .78 * d, .86 * h, .93 * h); seg(.52 * w, .52 * d, .93 * h, .98 * h); pyr(.42 * Math.min(w, d), .98 * h, h); }
  else if (cap === 'psfs') {
    seg(w, d, 0, .9 * h);
    const sm = new THREE.MeshStandardMaterial({ color: '#b8322a', emissive: '#ff3b2f', emissiveIntensity: 0 }); sm.userData.lit = 1; litMats.push(sm);
    part(g, new THREE.BoxGeometry(w * .8, .08 * h, 2), sm, 0, .95 * h, d / 2 + 1); part(g, new THREE.BoxGeometry(2, .08 * h, d * .8), sm, w / 2 + 1, .95 * h, 0);
  }
  else seg(w, d, 0, h);
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
  const roofM = new THREE.MeshStandardMaterial({ color: '#3c4a52', roughness: .8 }), lineMat = new THREE.LineBasicMaterial({ color: '#fff1c8' });
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
    const l1 = new THREE.LineSegments(new THREE.EdgesGeometry(bg), lineMat); l1.position.y = wallH / 2;
    const l2 = new THREE.LineSegments(new THREE.EdgesGeometry(rg), lineMat); l2.position.y = wallH;
    g.add(l1, l2); lines.push(l1, l2); body.castShadow = true;
  });
  return lines;
}

export function buildLandmarks(scene, lm, river) {
  lm.towers.forEach(t => tower(scene, norm(t)));
  const cityhall = cityHall(scene, norm(lm.cityhall));
  const st = station(scene, lm.station);
  const mus = museum(scene, new THREE.Vector3(lm.museum.x, 0, lm.museum.z), cityhall);
  const esp = easternState(scene, lm.esp);
  const boatLines = boathouses(scene, lm.boathouses, river);
  return { cityhall, station: st, museum: mus, esp, boatLines };
}
