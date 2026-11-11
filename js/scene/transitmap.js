// "Show transit lines": every rail line drawn as a bright line in its own colour, on top of
// everything (underground lines are shown at street level), plus the proposed monorails.
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';

/** routes: [{ id, color, P: [Vector3] }] */
export function buildTransitMap(scene, renderer, routes) {
  const group = new THREE.Group(); group.visible = false; scene.add(group);
  const mats = [];
  const size = new THREE.Vector2();
  for (const r of routes) {
    if (r.P.length < 2) continue;
    const pos = [];
    // thin the points to ~20 m; lift above the street (or above the El / guideway)
    let last = null;
    for (const p of r.P) {
      if (last && last.distanceToSquared(p) < 400) continue;
      pos.push(p.x, Math.max(p.y, 0) + 5, p.z); last = p;
    }
    const q = r.P[r.P.length - 1]; pos.push(q.x, Math.max(q.y, 0) + 5, q.z);
    const g = new LineGeometry(); g.setPositions(pos);
    const m = new LineMaterial({ color: new THREE.Color(r.color).getHex(), linewidth: r.width || 3.5, transparent: true, opacity: .95, depthTest: false });
    m.userData.noClip = true; mats.push(m);
    const line = new Line2(g, m); line.computeLineDistances(); line.renderOrder = 20; line.frustumCulled = false;
    group.add(line);
  }
  function resize() { renderer.getSize(size); mats.forEach(m => m.resolution.set(size.x, size.y)); }
  window.addEventListener('resize', resize); resize();
  return { set: on => { group.visible = !!on; return group.visible; }, get: () => group.visible };
}
