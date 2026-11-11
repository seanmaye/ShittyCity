// Trees (placed offline inside real parks and along streets) and rowing shells on the river.
import * as THREE from 'three';
import { withBounds } from './geometry.js';
const GREENS = ['#4f7d45', '#5d8c4c', '#3f6b3c', '#6b9a4e', '#7aa65a', '#c08a4a', '#b5653c'].map(c => new THREE.Color(c));

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
  return treeKit = { trunk, round, cone, bark: new THREE.MeshStandardMaterial({ color: '#6b5444', roughness: 1 }) };
}

export function buildTrees(scene, flat, y = 0) {
  const n = flat.length / 2, dm = new THREE.Object3D();
  const { trunk, round, cone, bark } = treeParts();
  const kinds = Array.from({ length: n }, () => Math.random() < .78 ? 0 : 1);
  const nR = kinds.filter(k => k === 0).length, nC = n - nR;
  const wm = () => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .95, flatShading: true });
  // the sphere around all of these trees (a tree reaches 24 m up and 7 m out at the largest scale)
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < n; i++) { const x = flat[i * 2] / 10, z = flat[i * 2 + 1] / 10; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const centre = n ? new THREE.Vector3((x0 + x1) / 2, y + 12, (z0 + z1) / 2) : new THREE.Vector3(0, y, 0), reach = n ? Math.hypot(x1 - x0, z1 - z0) / 2 + 25 : 0;
  const mesh = (g, m, count) => { const im = new THREE.InstancedMesh(withBounds(g, centre, reach), m, count); im.userData.bounded = true; return im; };
  const it = mesh(trunk, bark, n), ir = mesh(round, wm(), nR), icn = mesh(cone, wm(), nC);
  const greens = GREENS;
  let a = 0, b = 0;
  for (let i = 0; i < n; i++) {
    const sc = .8 + Math.random() * .6;
    dm.position.set(flat[i * 2] / 10, y, flat[i * 2 + 1] / 10); dm.rotation.set(0, Math.random() * 6.28, 0); dm.scale.set(sc, sc, sc); dm.updateMatrix();
    it.setMatrixAt(i, dm.matrix);
    const col = greens[Math.random() < .14 ? 5 + Math.floor(Math.random() * 2) : Math.floor(Math.random() * 5)];
    if (kinds[i] === 0) { ir.setMatrixAt(a, dm.matrix); ir.setColorAt(a, col); a++; } else { icn.setMatrixAt(b, dm.matrix); icn.setColorAt(b, col); b++; }
  }
  [it, ir, icn].forEach(m => { m.castShadow = true; m.receiveShadow = true; scene.add(m); });
  return [it, ir, icn];
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
