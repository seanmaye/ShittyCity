// Trees (placed offline inside real parks and along streets) and rowing shells on the river.
// Trees follow the time of year (season.js): deciduous crowns go from the light green of new
// leaves through summer green to red, orange and yellow, then drop, leaving bare branches; in
// April some blossom pink and white and flower beds bloom beneath them. Conifers stay green.
import * as THREE from 'three';
import { onSeason } from './season.js';
import { withBounds } from './geometry.js';
import { groundAt } from './terrain.js';

const C = h => new THREE.Color(h);
const SUMMER = ['#4f7d45', '#5d8c4c', '#3f6b3c', '#6b9a4e', '#628f4a'].map(C), FRESH = C('#93c45a');
const AUTUMN = ['#b8342a', '#cf5a26', '#d9802b', '#e0ad35', '#c99a3a', '#9a6b3a', '#a8442e'].map(C);
const BLOSSOM = ['#f3b8cb', '#f7f0f2', '#efc7d6', '#c46fae', '#fbe8ee'].map(C);   // cherry, dogwood, redbud
const FLOWERS = ['#f2c12e', '#e8452e', '#d43a6a', '#8a52c4', '#f7f3ea', '#f08a24'].map(C);   // daffodils, tulips

let twigTex = null, twigGeo = null;
/** bare branches: a canvas of forking twigs on two crossed planes */
function twigs() {
  if (!twigTex) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d');
    g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
    const branch = (x, y, a, len, w) => {
      if (len < 4 || w < .6) return;
      const x2 = x + Math.sin(a) * len, y2 = y - Math.cos(a) * len;
      g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
      branch(x2, y2, a - .45 - Math.random() * .2, len * .74, w * .72); branch(x2, y2, a + .4 + Math.random() * .2, len * .72, w * .72);
    };
    branch(32, 128, 0, 36, 9);
    twigTex = new THREE.CanvasTexture(c);
  }
  if (twigGeo) return twigGeo;
  const g1 = new THREE.PlaneGeometry(10, 12), g2 = g1.clone().rotateY(Math.PI / 2);
  const pos = [...g1.attributes.position.array, ...g2.attributes.position.array], uv = [...g1.attributes.uv.array, ...g2.attributes.uv.array];
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex([0, 2, 1, 2, 3, 1, 4, 6, 5, 6, 7, 5]); g.computeVertexNormals(); g.translate(0, 11, 0);   // trunk top to crown top
  return twigGeo = g;
}

// One set of tree geometry for every call (the centre, the rail-yard park, each city tile). The
// canopy meshes keep a material each: three compiles a material for the first mesh that uses it,
// and a canopy mesh with no trees in it has no instance colours. Don't merge the canopies'
// vertices, flat-shaded as they are: the shadow lookup is offset along the vertex normal, and
// with shared vertices the trees come out visibly lighter.
let treeKit = null;
function treeParts() {
  if (treeKit) return treeKit;
  const trunk = new THREE.CylinderGeometry(.5, .8, 6, 6); trunk.translate(0, 3, 0);
  const round = new THREE.IcosahedronGeometry(5, 0); round.translate(0, 10, 0);
  const cone = new THREE.ConeGeometry(4, 12, 7); cone.translate(0, 11, 0);
  // a flower bed: a clump of three overlapping round patches
  const parts = [[0, 0, 2], [1.9, .8, 1.5], [-.9, 1.9, 1.4]].map(([x, z, r]) => { const c = new THREE.CircleGeometry(r, 9); c.rotateX(-Math.PI / 2); c.translate(x, 0, z); return c.toNonIndexed(); });
  const bed = new THREE.BufferGeometry(), cat = k => new THREE.Float32BufferAttribute(parts.flatMap(p => [...p.attributes[k].array]), k === 'uv' ? 2 : 3);
  ['position', 'normal', 'uv'].forEach(k => bed.setAttribute(k, cat(k)));
  return treeKit = { trunk, round, cone, bed, twig: twigs(), bark: new THREE.MeshStandardMaterial({ color: '#6b5444', roughness: 1 }) };
}

export function buildTrees(scene, flat, y = 0) {
  const n = flat.length / 2, dm = new THREE.Object3D();
  const { trunk, round, cone, bed, twig, bark } = treeParts();
  const kinds = Array.from({ length: n }, () => Math.random() < .78 ? 0 : 1);
  const nR = kinds.filter(k => k === 0).length, nC = n - nR;
  const wm = () => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .95, flatShading: true });
  // the sphere around all of these trees and their flower beds (a tree reaches 24 m up and 7 m
  // out at the largest scale, a bed sits up to 8 m from its tree)
  // each tree stands on the terrain where the city has one (terrain.js; 0 elsewhere)
  const gy = new Float32Array(n);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, g0 = Infinity, g1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = flat[i * 2] / 10, z = flat[i * 2 + 1] / 10; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    gy[i] = groundAt(x, z); g0 = Math.min(g0, gy[i]); g1 = Math.max(g1, gy[i]);
  }
  const centre = n ? new THREE.Vector3((x0 + x1) / 2, y + 12 + (g0 + g1) / 2, (z0 + z1) / 2) : new THREE.Vector3(0, y, 0), reach = n ? Math.hypot(x1 - x0, z1 - z0, g1 - g0) / 2 + 30 : 0;
  const mesh = (g, m, count) => { const im = new THREE.InstancedMesh(withBounds(g, centre, reach), m, count); im.userData.bounded = true; return im; };
  const it = mesh(trunk, bark, n), ir = mesh(round, wm(), nR), icn = mesh(cone, wm(), nC);
  const twigMat = new THREE.MeshStandardMaterial({ color: '#9c8774', map: twigTex, alphaTest: .4, side: THREE.DoubleSide, roughness: 1 });
  const ib = mesh(twig, twigMat, nR); twigMat.userData.noSnow = true;
  const col = new THREE.Color();
  // per deciduous tree: its summer green, autumn colour, when it turns and drops, blossom or not
  const rnd = new Float32Array(nR * 4), mats = new Float32Array(nR * 16);
  const beds = [];
  let a = 0, b = 0;
  for (let i = 0; i < n; i++) {
    const sc = .8 + Math.random() * .6;
    dm.position.set(flat[i * 2] / 10, y + gy[i], flat[i * 2 + 1] / 10); dm.rotation.set(0, Math.random() * 6.28, 0); dm.scale.set(sc, sc, sc); dm.updateMatrix();
    it.setMatrixAt(i, dm.matrix);
    if (kinds[i] === 0) {
      ir.setMatrixAt(a, dm.matrix); ib.setMatrixAt(a, dm.matrix); dm.matrix.toArray(mats, a * 16);
      rnd.set([Math.random(), Math.random(), Math.random(), Math.random()], a * 4); a++;
    } else { icn.setMatrixAt(b, dm.matrix); icn.setColorAt(b, col.copy(SUMMER[Math.floor(Math.random() * 5)]).multiplyScalar(.85)); b++; }
    // a flower bed near about one tree in six
    if (Math.random() < .17) { const ang = Math.random() * 6.28, r = 4 + Math.random() * 4, bx = flat[i * 2] / 10 + Math.cos(ang) * r, bz = flat[i * 2 + 1] / 10 + Math.sin(ang) * r; beds.push(bx, bz, groundAt(bx, bz)); }
  }
  ir.setColorAt(0, col); ib.setColorAt(0, col);   // allocate instance colours
  const fb = mesh(bed, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .9 }), Math.max(1, beds.length / 3));
  if (!beds.length) fb.setMatrixAt(0, new THREE.Matrix4().makeScale(0, 0, 0));
  for (let k = 0; k < beds.length / 3; k++) {
    dm.position.set(beds[k * 3], y + .5 + beds[k * 3 + 2], beds[k * 3 + 1]); dm.rotation.set(0, Math.random() * 6.28, 0); dm.scale.setScalar(.7 + Math.random() * .7); dm.updateMatrix();
    fb.setMatrixAt(k, dm.matrix); fb.setColorAt(k, FLOWERS[Math.floor(Math.random() * FLOWERS.length)]);
  }
  fb.material.userData.noSnow = true;
  ib.userData.season = false; fb.userData.season = false;
  const zero = new Float32Array(16);
  onSeason(s => {
    const ca = ir.instanceColor.array, ma = ir.instanceMatrix.array, ba = ib.instanceMatrix.array;
    for (let k = 0; k < nR; k++) {
      const [r0, r1, r2, r3] = rnd.subarray(k * 4, k * 4 + 4);
      const flowering = r1 > .72, leafless = s.bare > r2 * .9 + .05 && !(flowering && s.bloom > .15);   // blossom comes before the leaves
      ma.set(leafless ? zero : mats.subarray(k * 16, k * 16 + 16), k * 16);
      ba.set(leafless ? mats.subarray(k * 16, k * 16 + 16) : zero, k * 16);
      col.copy(SUMMER[Math.floor(r0 * 5)]).lerp(FRESH, s.fresh * .6);
      const turn = Math.max(0, Math.min(1, (s.fall - r2 * .45) / .55));   // early trees turn first
      if (r1 > .12) col.lerp(AUTUMN[Math.floor(r3 * AUTUMN.length)], turn); else col.lerp(AUTUMN[6], turn * .3);
      if (flowering) col.lerp(BLOSSOM[Math.floor(r3 * BLOSSOM.length)], s.bloom);   // cherry, dogwood, redbud
      col.toArray(ca, k * 3);
    }
    ir.instanceColor.needsUpdate = ir.instanceMatrix.needsUpdate = ib.instanceMatrix.needsUpdate = true;
    ib.userData.season = s.bare > .05; fb.userData.season = s.flowers > .05;
    ib.visible = ib.userData.season; fb.visible = fb.userData.season;
  });
  [it, ir, icn, ib, fb].forEach(m => { m.userData.grounded = true; });   // already on the terrain: drape() leaves them
  [it, ir, icn].forEach(m => { m.castShadow = true; m.receiveShadow = true; scene.add(m); });
  // the branch planes cast their shadows through the twig cut-outs, not as solid rectangles
  ib.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: twigTex, alphaTest: .4 });
  ib.castShadow = true; scene.add(ib);
  fb.receiveShadow = true; scene.add(fb);
  return [it, ir, icn, ib, fb];
}

export function buildShells(scene, river) {
  const { RS, NS } = river;
  const i0 = Math.max(0, RS.findIndex(s => s.lat > 39.9672));
  let i1 = RS.findIndex(s => s.lat > 39.9800); if (i1 < 0) i1 = NS - 2;
  const sampSp = RS[1].p.distanceTo(RS[0].p);
  const hull = new THREE.BoxGeometry(.6, .35, 17), rw = new THREE.BoxGeometry(.55, 1, .55), hm = new THREE.MeshStandardMaterial({ color: '#f6f1e6' }), rm = new THREE.MeshStandardMaterial({ color: '#2d3a46' });
  const shells = [[-25, .1, 1.6], [18, .35, 1.2], [-5, .6, 1.4], [30, .85, 1.0]].map(([off, f, sp]) => {
    const g = new THREE.Group(); g.add(new THREE.Mesh(hull, hm));
    for (let k = 0; k < 8; k++) { const r = new THREE.Mesh(rw, rm); r.position.set(0, .65, -7 + k * 1.9); g.add(r); }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; }); scene.add(g);
    return { g, off, f: i0 + f * (i1 - i0), sp };
  });
  function rsAt(f) { const i = Math.max(0, Math.min(NS - 2, Math.floor(f))), fr = f - i; return { p: RS[i].p.clone().lerp(RS[i + 1].p, fr), n: RS[i].n, t: RS[i].t, w: RS[i].w }; }
  return function update(dt) {
    shells.forEach(s => {
      s.f += s.sp * dt * 4 / sampSp; if (s.f > i1) s.f = i0;
      const r = rsAt(s.f), off = Math.max(-r.w / 2 + 12, Math.min(r.w / 2 - 12, s.off));
      s.g.position.set(r.p.x + r.n.x * off, .8, r.p.z + r.n.z * off); s.g.lookAt(s.g.position.x + r.t.x, .8, s.g.position.z + r.t.z);
    });
  };
}
