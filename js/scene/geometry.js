// Geometry builders for map data: flat polygons, street ribbons and extruded footprints.
import * as THREE from 'three';
/** Growable typed-array buffers for one merged BufferGeometry. */
export class Builder {
  constructor(opts = {}) { this.pos = []; this.nrm = []; this.uv = opts.uv ? [] : null; this.col = opts.color ? [] : null; this.idx = []; }
  get count() { return this.pos.length / 3; }
  v(x, y, z, nx, ny, nz, u, w, c) {
    this.pos.push(x, y, z); this.nrm.push(nx, ny, nz);
    if (this.uv) this.uv.push(u, w);
    if (this.col) this.col.push(c.r, c.g, c.b);
    return this.count - 1;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    if (this.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.col) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

const V2 = r => r.map(p => new THREE.Vector2(p[0], p[1]));

/** Triangulate a polygon (outer ring + holes, [[x,z],...]) into b at height y, facing up. */
export function addPolygon(b, rings, y, uvFn) {
  const contour = V2(rings[0]), holes = rings.slice(1).map(V2);
  let faces;
  try { faces = THREE.ShapeUtils.triangulateShape(contour, holes); } catch (e) { return; }
  const all = [contour, ...holes].flat();
  const base = b.count;
  for (const p of all) {
    const uv = uvFn ? uvFn(p.x, p.y) : [0, 0];
    b.v(p.x, y, p.y, 0, 1, 0, uv[0], uv[1], b.col ? b.c : null);
  }
  for (const [i, j, k] of faces) {
    const A = all[i], B = all[j], C = all[k];
    // three.js front faces are CCW seen from the normal side: for +y that means (B-A)x(C-A) has y>0
    const cy = (B.y - A.y) * (C.x - A.x) - (B.x - A.x) * (C.y - A.y);
    if (cy >= 0) b.tri(base + i, base + j, base + k); else b.tri(base + i, base + k, base + j);
  }
}

/** Flat ribbon along a polyline ([[x,z],...]) of width w at height y. Segments overlap at joints. */
export function addRibbon(b, pts, w, y) {
  const h = w / 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    let dx = bx - ax, dz = bz - az; const L = Math.hypot(dx, dz); if (L < .01) continue;
    dx /= L; dz /= L;
    const nx = -dz * h, nz = dx * h, ex = dx * h * .9, ez = dz * h * .9;
    const s = b.count;
    b.v(ax - ex + nx, y, az - ez + nz, 0, 1, 0, 0, 0);
    b.v(ax - ex - nx, y, az - ez - nz, 0, 1, 0, 0, 0);
    b.v(bx + ex + nx, y, bz + ez + nz, 0, 1, 0, 0, 0);
    b.v(bx + ex - nx, y, bz + ez - nz, 0, 1, 0, 0, 0);
    // with n = left of travel, this winding faces +y
    b.tri(s, s + 2, s + 1); b.tri(s + 1, s + 2, s + 3);
  }
}

/** Extrude a footprint (outer ring CCW-positive-area + holes) from y0 to y1 with window UVs. */
export function addPrism(b, rings, y0, y1, uOff, tileW, tileH, color) {
  for (const r of rings) {
    let u = uOff;
    for (let i = 0; i < r.length; i++) {
      const [ax, az] = r[i], [bx, bz] = r[(i + 1) % r.length];
      const ex = bx - ax, ez = bz - az, L = Math.hypot(ex, ez); if (L < .05) continue;
      const nx = ez / L, nz = -ex / L; // outward for positive-area rings, inward-facing courtyards for holes
      const u1 = u + L / tileW;
      const a0 = b.v(ax, y0, az, nx, 0, nz, u, y0 / tileH, color), b0 = b.v(bx, y0, bz, nx, 0, nz, u1, y0 / tileH, color);
      const b1 = b.v(bx, y1, bz, nx, 0, nz, u1, y1 / tileH, color), a1 = b.v(ax, y1, az, nx, 0, nz, u, y1 / tileH, color);
      b.tri(a0, b1, b0); b.tri(a0, a1, b1);
      u = u1;
    }
  }
  b.c = color;
  addPolygon(b, rings, y1, () => [.01, .01]);
}
