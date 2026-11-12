// Geometry builders for map data: flat polygons, street ribbons and extruded footprints.
import * as THREE from 'three';
/** Growable typed-array buffers for one merged BufferGeometry. */
export class Builder {
  constructor(opts = {}) {
    this.n = 0; this.cap = 256;   // vertices used, and room for
    this.pos = new Float32Array(this.cap * 3); this.nrm = new Float32Array(this.cap * 3);
    this.uv = opts.uv ? new Float32Array(this.cap * 2) : null; this.col = opts.color ? new Float32Array(this.cap * 3) : null;
    this.idx = [];
  }
  get count() { return this.n; }
  grow() {
    const cap = this.cap * 2, more = (a, k) => { const b = new Float32Array(cap * k); b.set(a); return b; };
    this.pos = more(this.pos, 3); this.nrm = more(this.nrm, 3);
    if (this.uv) this.uv = more(this.uv, 2);
    if (this.col) this.col = more(this.col, 3);
    this.cap = cap;
  }
  v(x, y, z, nx, ny, nz, u, w, c) {
    if (this.n === this.cap) this.grow();
    const i = this.n++, j = i * 3, p = this.pos, q = this.nrm;
    p[j] = x; p[j + 1] = y; p[j + 2] = z; q[j] = nx; q[j + 1] = ny; q[j + 2] = nz;
    if (this.uv) { this.uv[i * 2] = u; this.uv[i * 2 + 1] = w; }
    if (this.col) { const k = this.col; k[j] = c.r; k[j + 1] = c.g; k[j + 2] = c.b; }
    return i;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  geometry() {
    const g = new THREE.BufferGeometry(), attr = (a, k) => new THREE.BufferAttribute(a.slice(0, this.n * k), k);   // exact-size copies
    g.setAttribute('position', attr(this.pos, 3));
    g.setAttribute('normal', attr(this.nrm, 3));
    if (this.uv) g.setAttribute('uv', attr(this.uv, 2));
    if (this.col) g.setAttribute('color', attr(this.col, 3));
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

/** Extrude a footprint (outer ring CCW-positive-area + holes) from y0 to y1 with window UVs.
 *  The roof gets roofColor and UV (-1, -1), which facade materials map to a blank patch. */
export function addPrism(b, rings, y0, y1, uOff, tileW, tileH, color, roofColor = color, vBase = 0) {   // vBase: where window rows count from (the ground)
  for (const r of rings) {
    let u = uOff;
    for (let i = 0; i < r.length; i++) {
      const [ax, az] = r[i], [bx, bz] = r[(i + 1) % r.length];
      const ex = bx - ax, ez = bz - az, L = Math.hypot(ex, ez); if (L < .05) continue;
      const nx = ez / L, nz = -ex / L; // outward for positive-area rings, inward-facing courtyards for holes
      const u1 = u + L / tileW;
      const v0 = (y0 - vBase) / tileH, v1 = (y1 - vBase) / tileH;
      const a0 = b.v(ax, y0, az, nx, 0, nz, u, v0, color), b0 = b.v(bx, y0, bz, nx, 0, nz, u1, v0, color);
      const b1 = b.v(bx, y1, bz, nx, 0, nz, u1, v1, color), a1 = b.v(ax, y1, az, nx, 0, nz, u, v1, color);
      b.tri(a0, b1, b0); b.tri(a0, a1, b1);
      u = u1;
    }
  }
  b.c = roofColor;
  addPolygon(b, rings, y1, () => [-1, -1]);
}

/**
 * A tower section: walls between a ring scaled by s0 at y0 and by s1 at y1 (scaled about the
 * local origin, so it can taper), with window UVs in texture-tile units, and a flat top
 * (roof UV) unless cap is false. ring: [[x, z], ...] with positive area, like addPrism.
 */
export function addLoft(b, ring, y0, y1, s0, s1, tileW, tileH, color, cap = true, uOff = 0) {
  const n = ring.length; let u = uOff;
  const e = new THREE.Vector3(), up = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % n];
    const L = Math.hypot(bx - ax, bz - az) * s0; if (L < .05) continue;
    // face normal from the bottom edge and the slanted side
    e.set((bx - ax) * s0, 0, (bz - az) * s0); up.set(ax * (s1 - s0), y1 - y0, az * (s1 - s0));
    nn.crossVectors(up, e).normalize();
    const u1 = u + L / tileW;
    const a0 = b.v(ax * s0, y0, az * s0, nn.x, nn.y, nn.z, u, y0 / tileH, color), b0 = b.v(bx * s0, y0, bz * s0, nn.x, nn.y, nn.z, u1, y0 / tileH, color);
    const b1 = b.v(bx * s1, y1, bz * s1, nn.x, nn.y, nn.z, u1, y1 / tileH, color), a1 = b.v(ax * s1, y1, az * s1, nn.x, nn.y, nn.z, u, y1 / tileH, color);
    b.tri(a0, b1, b0); b.tri(a0, a1, b1);
    u = u1;
  }
  if (cap && s1 > 0) { b.c = color; addPolygon(b, [ring.map(([x, z]) => [x * s1, z * s1])], y1, () => [-1, -1]); }
}

/**
 * A geometry that shares g's buffers but has its own bounding sphere. An
 * InstancedMesh is culled by its geometry's sphere, which knows nothing of where the instances
 * are; with the sphere of its instances it can be frustum-culled like any mesh, in the main pass
 * and, by the sun's shadow box, in the shadow pass. Mark the mesh userData.bounded.
 */
export function withBounds(g, center, radius) {
  const out = new THREE.BufferGeometry();
  for (const k in g.attributes) out.setAttribute(k, g.attributes[k]);
  out.setIndex(g.index); out.boundingSphere = new THREE.Sphere(center, radius);
  return out;
}

/** One shared THREE.Color per colour string (palette entries), not one per building. Don't modify it. */
const colorCache = new Map();
export function colorOf(c) { let o = colorCache.get(c); if (!o) colorCache.set(c, o = new THREE.Color(c)); return o; }
