// Trees (placed offline inside real parks and along streets) and rowing shells on the river.
import * as THREE from 'three';
export function buildTrees(scene, flat, y = 0) {
  const n = flat.length / 2, dm = new THREE.Object3D();
  const trunk = new THREE.CylinderGeometry(.5, .8, 6, 6); trunk.translate(0, 3, 0);
  const round = new THREE.IcosahedronGeometry(5, 0); round.translate(0, 10, 0);
  const cone = new THREE.ConeGeometry(4, 12, 7); cone.translate(0, 11, 0);
  const kinds = Array.from({ length: n }, () => Math.random() < .78 ? 0 : 1);
  const nR = kinds.filter(k => k === 0).length, nC = n - nR;
  const wm = () => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .95, flatShading: true });
  const it = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: '#6b5444', roughness: 1 }), n), ir = new THREE.InstancedMesh(round, wm(), nR), icn = new THREE.InstancedMesh(cone, wm(), nC);
  const greens = ['#4f7d45', '#5d8c4c', '#3f6b3c', '#6b9a4e', '#7aa65a', '#c08a4a', '#b5653c'], col = new THREE.Color();
  let a = 0, b = 0;
  for (let i = 0; i < n; i++) {
    const sc = .8 + Math.random() * .6;
    dm.position.set(flat[i * 2] / 10, y, flat[i * 2 + 1] / 10); dm.rotation.set(0, Math.random() * 6.28, 0); dm.scale.set(sc, sc, sc); dm.updateMatrix();
    it.setMatrixAt(i, dm.matrix);
    col.set(greens[Math.random() < .14 ? 5 + Math.floor(Math.random() * 2) : Math.floor(Math.random() * 5)]);
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
