// The Schuylkill: real OSM water polygons, plus a centreline (with true bank-to-bank
// width) that the monorail, boathouses and rowing shells follow.
import * as THREE from 'three';
import { latOf, pairs } from '../data.js';
import { M } from './materials.js';
import { Builder, addPolygon, addRibbon } from './geometry.js';
export function buildRiver(scene, data) {
  const c = data.center, NS = c.length / 3, RS = [];
  for (let i = 0; i < NS; i++) RS.push({ p: new THREE.Vector3(c[i * 3] / 10, 0, c[i * 3 + 1] / 10), w: c[i * 3 + 2] / 10 });
  RS.forEach((s, i) => {
    const a = RS[Math.max(0, i - 2)].p, b = RS[Math.min(NS - 1, i + 2)].p;
    s.t = b.clone().sub(a).normalize();
    s.n = new THREE.Vector3(-s.t.z, 0, s.t.x); // points to the east bank
    s.lat = latOf(s.p.z);
  });

  /** signed distance from the centreline (positive = east bank) and local width */
  function riverInfo(x, z) {
    let best = 1e18, bi = 0;
    for (let i = 0; i < NS; i++) { const s = RS[i]; const dx = x - s.p.x, dz = z - s.p.z, dd = dx * dx + dz * dz; if (dd < best) { best = dd; bi = i; } }
    const s = RS[bi]; return { d: (x - s.p.x) * s.n.x + (z - s.p.z) * s.n.z, w: s.w, s };
  }
  function atLat(lat) { let bi = 0, bd = 1e9; RS.forEach((s, i) => { const d = Math.abs(s.lat - lat); if (d < bd) { bd = d; bi = i; } }); return RS[bi]; }

  // water polygons (river, plus fountains and ponds), one merged mesh
  const waterMat = M('#6a90ad', { roughness: .3, metalness: 0 });
  const wb = new Builder();
  const polys = data.water.map(poly => poly.map(pairs));
  polys.forEach(rings => addPolygon(wb, rings, 0));
  const water = new THREE.Mesh(wb.geometry(), waterMat); water.position.y = .6; water.receiveShadow = true; scene.add(water);

  // stone bulkhead along the river banks
  const eb = new Builder();
  data.river.forEach(i => polys[i].forEach(r => {
    // skip the straight cuts where the polygon was clipped to the map extent
    const xs = r.map(p => p[0]), zs = r.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const cut = (a, b) => (a[0] === b[0] && (a[0] === x0 || a[0] === x1)) || (a[1] === b[1] && (a[1] === z0 || a[1] === z1));
    let run = [r[0]];
    for (let k = 1; k <= r.length; k++) {
      const p = r[k % r.length];
      if (cut(run[run.length - 1], p)) { if (run.length > 1) addRibbon(eb, run, 3, 0); run = [p]; } else run.push(p);
    }
    if (run.length > 1) addRibbon(eb, run, 3, 0);
  }));
  const edge = new THREE.Mesh(eb.geometry(), M('#b9b2a3')); edge.position.y = .7; edge.receiveShadow = true; scene.add(edge);

  // Fairmount Dam and other weirs
  const damMat = M('#e8eef0');
  data.dams.forEach(flat => {
    const pts = pairs(flat);
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1]; const L = Math.hypot(bx - ax, bz - az); if (L < .5) continue;
      const d = new THREE.Mesh(new THREE.BoxGeometry(L + 2, 1.4, 6), damMat);
      d.position.set((ax + bx) / 2, .9, (az + bz) / 2); d.rotation.y = Math.atan2(-(bz - az), bx - ax); d.receiveShadow = true; scene.add(d);
    }
  });

  return { RS, NS, riverInfo, atLat, waterMat };
}
