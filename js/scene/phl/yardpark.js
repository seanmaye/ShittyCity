// Proposal: a deck over the 30th Street rail yard with a park and a concert bowl on top.
// Outline, paths, trees and the bowl's site come from data/yardpark.json (tools/cap.py).
import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pairs } from '../../data.js';
import { M, litMats } from '../materials.js';
import { Builder, addPolygon, addRibbon } from '../geometry.js';
import { buildTrees } from '../nature.js';
const merge = geos => BufferGeometryUtils.mergeBufferGeometries(geos.map(g => (g.index ? g.toNonIndexed() : g)));

function deck(scene, data) {
  const h = data.h, rings = data.rings.map(pairs);
  // retaining walls round the outline (and round any building that stands up through it)
  const wb = new Builder();
  for (const r of rings) {
    for (let i = 0; i < r.length; i++) {
      const [ax, az] = r[i], [bx, bz] = r[(i + 1) % r.length];
      const ex = bx - ax, ez = bz - az, L = Math.hypot(ex, ez); if (L < .05) continue;
      const nx = ez / L, nz = -ex / L, s = wb.count;
      wb.v(ax, 0, az, nx, 0, nz); wb.v(bx, 0, bz, nx, 0, nz); wb.v(bx, h, bz, nx, 0, nz); wb.v(ax, h, az, nx, 0, nz);
      wb.tri(s, s + 2, s + 1); wb.tri(s, s + 3, s + 2);
    }
  }
  const walls = new THREE.Mesh(wb.geometry(), new THREE.MeshStandardMaterial({ color: '#b9b1a2', roughness: .95 }));
  walls.castShadow = walls.receiveShadow = true; scene.add(walls);
  // glass balustrade
  const pb = new Builder();
  for (const r of rings) {
    for (let i = 0; i < r.length; i++) {
      const [ax, az] = r[i], [bx, bz] = r[(i + 1) % r.length], s = pb.count;
      pb.v(ax, h, az, 0, 0, 1); pb.v(bx, h, bz, 0, 0, 1); pb.v(bx, h + 1.1, bz, 0, 0, 1); pb.v(ax, h + 1.1, az, 0, 0, 1);
      pb.tri(s, s + 1, s + 2); pb.tri(s, s + 2, s + 3);
    }
  }
  scene.add(new THREE.Mesh(pb.geometry(), new THREE.MeshStandardMaterial({ color: '#cfe3e8', transparent: true, opacity: .35, side: THREE.DoubleSide, depthWrite: false })));
  // lawn
  const lb = new Builder(); addPolygon(lb, rings, 0);
  const lawn = new THREE.Mesh(lb.geometry(), M('#6fa257', { side: THREE.FrontSide })); lawn.position.y = h; lawn.receiveShadow = true; scene.add(lawn);
  // promenade and spokes
  const rb = new Builder();
  for (const p of data.paths) { const pts = pairs(p.p); addRibbon(rb, p.ring ? [...pts, pts[0]] : pts, 4, 0); }
  const paths = new THREE.Mesh(rb.geometry(), M('#e2cfa4', { side: THREE.FrontSide })); paths.position.y = h + .06; paths.receiveShadow = true; scene.add(paths);
}

/** The Railyard Bowl: raked lawn and seats, a nested-arch bandshell, screens and light towers. */
function bowl(scene, v, h) {
  const g = new THREE.Group(); g.position.set(v.x, h, v.z); g.rotation.y = Math.atan2(v.dir[0], v.dir[1]); scene.add(g); // local +z = toward the audience
  const R = v.r, HALF = 1.0, R0 = 30, duskOnly = [];
  const fan = (r0, r1, y) => { const q = new THREE.RingGeometry(r0, r1, 64, 1, -Math.PI / 2 - HALF, 2 * HALF); q.rotateX(-Math.PI / 2); q.translate(0, y, 0); return q; };
  const riser = (r, y0, y1) => { const c = new THREE.CylinderGeometry(r, r, y1 - y0, 64, 1, true, -HALF, 2 * HALF); c.translate(0, (y0 + y1) / 2, 0); return c; };

  // raked seating: fixed seats up front, then grass terraces climbing to the back
  const seatR1 = 62, tiers = 9, rise = .55;
  const seats = [], aisles = [], lawnA = [], lawnB = [], risers = [];
  for (let r = R0; r < seatR1; r += 1.1) { const y = .15 + (r - R0) * .045; seats.push(fan(r, r + .6, y + .35)); aisles.push(fan(r, r + 1.1, y)); }
  const step = (R - seatR1) / tiers;
  for (let k = 0; k < tiers; k++) {
    const r0 = seatR1 + k * step, y = .15 + (seatR1 - R0) * .045 + (k + 1) * rise;
    (k % 2 ? lawnA : lawnB).push(fan(r0, r0 + step, y));
    risers.push(riser(r0, y - rise, y));
  }
  risers.push(riser(R, 0, .15 + (seatR1 - R0) * .045 + tiers * rise));
  const mesh = (geos, mat, cast = false) => { const m = new THREE.Mesh(merge(geos), mat); m.receiveShadow = true; m.castShadow = cast; g.add(m); return m; };
  mesh(seats, M('#9a3431', { roughness: .7 }));
  mesh(aisles, M('#7c7468', { side: THREE.FrontSide }));
  mesh(lawnA, M('#74a85a', { side: THREE.FrontSide })); mesh(lawnB, M('#69a052', { side: THREE.FrontSide }));
  mesh(risers, M('#a79f90'));
  // a fan of light poles round the back of the lawn
  const lamp = new THREE.MeshStandardMaterial({ color: '#e9e4d2', emissive: '#fff1cf', emissiveIntensity: 0 }); lamp.userData.lit = 1.3; litMats.push(lamp);
  const poles = [], heads = [];
  for (let a = -HALF; a <= HALF + 1e-6; a += HALF / 5) {
    const x = Math.sin(a) * (R + 3), z = Math.cos(a) * (R + 3);
    const p = new THREE.CylinderGeometry(.18, .22, 9, 6); p.translate(x, 4.5, z); poles.push(p);
    const hd = new THREE.BoxGeometry(1.2, .5, .8); hd.translate(x, 9.1, z); heads.push(hd);
  }
  const steel = new THREE.MeshStandardMaterial({ color: '#5c646b', roughness: .5, metalness: .5 });
  mesh(poles, steel, true); mesh(heads, lamp);

  // stage and backstage
  const stageY = 1.6;
  const deckM = new THREE.MeshStandardMaterial({ color: '#3a2f28', roughness: .8 });
  const st = new THREE.Mesh(new THREE.BoxGeometry(48, stageY, 26), deckM); st.position.set(0, stageY / 2, -2); st.castShadow = st.receiveShadow = true; g.add(st);
  const apron = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, stageY, 40, 1, false, -Math.PI / 2, Math.PI), deckM); apron.position.set(0, stageY / 2, 11); apron.receiveShadow = true; g.add(apron);
  const back = new THREE.Mesh(new THREE.BoxGeometry(56, 14, 22), new THREE.MeshStandardMaterial({ color: '#8d8a84', roughness: .9 })); back.position.set(0, 7, -36); back.castShadow = back.receiveShadow = true; g.add(back);

  // bandshell: nested arches stepping out toward the audience
  const shellM = new THREE.MeshStandardMaterial({ color: '#f3f1ea', roughness: .45, side: THREE.DoubleSide, emissive: '#ffd7a8', emissiveIntensity: 0 }); shellM.userData.lit = .28; litMats.push(shellM);
  const glowM = new THREE.MeshStandardMaterial({ color: '#f8f4ea', emissive: '#ffcf9a', emissiveIntensity: 0, side: THREE.DoubleSide }); glowM.userData.lit = 1.6; litMats.push(glowM);
  const arches = [], faces = [], N = 7, depth = 3.4, zBack = -24;
  const rad = k => 12 + k * 2.4;
  for (let k = 0; k < N; k++) {
    const r = rad(k), z = zBack + k * depth;
    const c = new THREE.CylinderGeometry(r, r, depth, 48, 1, true, Math.PI / 2, Math.PI); c.rotateX(Math.PI / 2); c.translate(0, stageY, z + depth / 2); arches.push(c);
    const f = new THREE.RingGeometry(k ? rad(k - 1) : 0.01, r, 48, 1, 0, Math.PI); f.translate(0, stageY, z); (k ? faces : arches).push(f);
    const lip = new THREE.TorusGeometry(r, .35, 6, 48, Math.PI); lip.translate(0, stageY, z + depth); faces.push(lip);
  }
  mesh(arches, shellM, true); mesh(faces, glowM);

  // video screens and speaker/light towers either side of the stage
  const screenM = new THREE.MeshStandardMaterial({ color: '#1d2329', emissive: '#7fb8ff', emissiveIntensity: 0, roughness: .3 }); screenM.userData.lit = 1.1; litMats.push(screenM);
  for (const s of [-1, 1]) {
    const scr = new THREE.Mesh(new THREE.BoxGeometry(14, 8, .5), screenM); scr.position.set(s * 36, 15, 4); scr.rotation.y = -s * .35; scr.castShadow = true; g.add(scr);
    const post = new THREE.Mesh(new THREE.BoxGeometry(1.2, 11, 1.2), steel); post.position.set(s * 36, 5.5, 4); g.add(post);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(2.4, 26, 2.4), steel); tower.position.set(s * 27.5, 13, 9); tower.castShadow = true; g.add(tower);
    const spk = new THREE.Mesh(new THREE.BoxGeometry(2, 9, 2), new THREE.MeshStandardMaterial({ color: '#202428' })); spk.position.set(s * 27.5, 19, 11); g.add(spk);
    // delay towers out in the lawn
    const dt = new THREE.Mesh(new THREE.BoxGeometry(1.2, 15, 1.2), steel); dt.position.set(Math.sin(s * .42) * 82, 7.5 + 4, Math.cos(s * .42) * 82); dt.castShadow = true; g.add(dt);
  }

  // stage lighting beams, on at dusk
  const beamM = new THREE.MeshBasicMaterial({ color: '#cdb6ff', transparent: true, opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beams = [];
  for (let i = 0; i < 6; i++) {
    const cone = new THREE.ConeGeometry(6, 70, 20, 1, true); cone.rotateX(Math.PI); cone.translate(0, 35, 0); // narrow end at the fixture
    const b = new THREE.Mesh(cone, i % 2 ? beamM : beamM.clone()); if (i % 2 === 0) b.material.color.set('#9fd8ff');
    b.position.set(-20 + i * 8, 26, -6); g.add(b); beams.push(b); duskOnly.push(b);
  }
  let t = 0;
  const update = dt => { t += dt; beams.forEach((b, i) => { b.rotation.z = Math.sin(t * .6 + i) * .45; b.rotation.x = -.25 + Math.cos(t * .45 + i * 1.7) * .25; }); };
  g.updateMatrixWorld();
  return { duskOnly, update, stage: new THREE.Vector3(0, 0, -8).applyMatrix4(g.matrixWorld) };
}

function segDist2(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L)) : 0;
  const ex = ax + t * dx - px, ez = az + t * dz - pz; return ex * ex + ez * ez;
}

/** guideways: CatmullRom curves of the monorails, so trees on the deck stay out from under them */
export function buildYardPark(scene, data, guideways) {
  deck(scene, data);
  const b = bowl(scene, data.venue, data.h);
  const near = [];
  for (const c of guideways) { const pts = c.getSpacedPoints(Math.round(c.getLength() / 6)); for (let i = 0; i < pts.length - 1; i++) near.push([pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z]); }
  const [lx, lz] = data.label;
  const local = near.filter(s => Math.abs(s[0] - lx) < 900 && Math.abs(s[1] - lz) < 900);
  const trees = [];
  for (let i = 0; i < data.trees.length; i += 2) {
    const x = data.trees[i] / 10, z = data.trees[i + 1] / 10;
    if (!local.some(s => segDist2(x, z, s[0], s[1], s[2], s[3]) < 12 * 12)) trees.push(data.trees[i], data.trees[i + 1]);
  }
  buildTrees(scene, trees, data.h);
  return {
    duskOnly: b.duskOnly, update: b.update,
    labels: [
      { text: 'Rail Yard Park', pos: new THREE.Vector3(lx, data.h + 16, lz) },
      { text: 'Railyard Bowl', pos: b.stage.setY(data.h + 44) },
    ],
  };
}
