// Rail transit for any city (data/<city>/transit.json): tracks, tunnels, Els, platforms and stations,
// trains looping along each route, walkable cabins, and the cut-away sections that slice the city
// along a vertical plane (Philadelphia's under Market Street, New York's under Times Square).
//
// How a cut works: every material in the scene (except the ones marked userData.noClip here)
// is clipped by one shared THREE.Plane. With no cut active the plane sits far away and clips
// nothing. A section removes everything on the camera side of its plane; an earth face is drawn
// on the plane, and the tunnels in a band just behind it are opened up as one "gallery" so the
// tracks, platforms and trains inside are visible. Tunnels outside the band are drawn see-through.
import * as THREE from 'three';
import { litMats } from './materials.js';
import { Builder } from './geometry.js';
import { CITY } from '../cities.js';
import { terrain, surface, water } from './terrain.js';
export const SPEC = {
  // hw/h: tunnel half-width and height above the rail; car: length, width, height; cars per train;
  // km: route length per train; speed m/s
  // Philadelphia: the L (metro) and the trolleys
  metro:   { hw: 2.4, h: 5.2, car: 16.4, w: 2.8, ch: 3.6, cars: 6, km: 1.6, speed: 13, body: '#c9ced3', top: 1.0 },
  trolley: { hw: 2.3, h: 4.8, car: 15.2, w: 2.6, ch: 3.3, cars: 1, km: 2.5, speed: 8, body: '#ece7da', top: 0.3 },
  // Philadelphia's citywide network (data/phl/metro.json.gz): Broad Street Line B-IV cars, PATCO, Regional Rail
  // Silverliners (also used for NJ Transit's Atlantic City Line), and PCC cars on the G1
  broad:    { hw: 2.6, h: 5.6, car: 20.4, w: 3.1, ch: 3.7, cars: 6, km: 2.2, speed: 15, body: '#cfd4d8', top: 1.05 },
  patco:    { hw: 2.6, h: 5.6, car: 20.7, w: 3.1, ch: 3.7, cars: 4, km: 3.0, speed: 17, body: '#dfe2e4', top: 1.05 },
  regional: { hw: 3.0, h: 6.6, car: 25.9, w: 3.2, ch: 4.2, cars: 4, km: 7.0, speed: 24, body: '#c6ccd2', top: 1.15 },
  pcc:      { hw: 2.3, h: 4.8, car: 14.2, w: 2.7, ch: 3.2, cars: 1, km: 2.5, speed: 8, body: '#f0e7c9', top: 0.3 },
  // New York: MTA subway cars (data/nyc/transit.json)
  nycsub:   { hw: 2.4, h: 5.2, car: 16.4, w: 2.8, ch: 3.6, cars: 6, km: 1.6, speed: 13, body: '#c9ced3', top: 1.0 },
};
const GAUGE = 1.588;     // Pennsylvania trolley gauge (5 ft 2.5 in): both the L and the trolleys use it
const COL = 2;           // cut-face column width (m)
const TOP = .15;         // the cut face's top edge (city plate height)

const noClip = m => { m.userData.noClip = true; return m; };
const mat = (color, o = {}) => noClip(new THREE.MeshStandardMaterial(Object.assign({ color, roughness: .9, side: THREE.DoubleSide }, o)));

/** flat [x, z, y] decimetres -> [Vector3] metres. Each point also gets h, its height above the
 *  ground: g is how far index.js lifted each point onto the terrain (dm; none on flat ground).
 *  Street, El and tunnel are told apart by h, never by y. */
function pts3(f, g) {
  const o = [];
  for (let i = 0; i < f.length; i += 3) { const v = new THREE.Vector3(f[i] / 10, f[i + 2] / 10, f[i + 1] / 10); v.h = v.y - (g ? g[i / 3] / 10 : 0); o.push(v); }
  return o;
}
/** unit left-of-travel normals (x, z) per point */
function normals(P) {
  return P.map((_, i) => {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1;
    return [-dz / L, dx / L];
  });
}
/** quad A-B-C-D (each [x, y, z]) facing n */
function quad(b, A, B, C, D, n, uv = null) {
  const s = b.count;
  [A, B, C, D].forEach((p, i) => b.v(p[0], p[1], p[2], n[0], n[1], n[2], uv ? uv[i][0] : 0, uv ? uv[i][1] : 0));
  const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
  const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
  if (cx * n[0] + cy * n[1] + cz * n[2] >= 0) { b.tri(s, s + 1, s + 2); b.tri(s, s + 2, s + 3); }
  else { b.tri(s, s + 2, s + 1); b.tri(s, s + 3, s + 2); }
}
/** flat band following the 3D polyline P[i0..i1], lateral offset a (left +), width w, lifted dy */
function band(b, P, N, i0, i1, a, w, dy) {
  for (let i = i0; i < i1; i++) {
    const p = P[i], q = P[i + 1], m = N[i], k = N[i + 1], l = a + w / 2, r = a - w / 2;
    quad(b, [p.x + m[0] * l, p.y + dy, p.z + m[1] * l], [p.x + m[0] * r, p.y + dy, p.z + m[1] * r],
         [q.x + k[0] * r, q.y + dy, q.z + k[1] * r], [q.x + k[0] * l, q.y + dy, q.z + k[1] * l], [0, 1, 0]);
  }
}
/** box-section tunnel tube (floor, walls, roof) along P[i0..i1] */
function tube(b, P, N, i0, i1, hw, h) {
  for (let i = i0; i < i1; i++) {
    const p = P[i], q = P[i + 1], m = N[i], k = N[i + 1];
    const c = (o, y, s, nn) => [s.x + nn[0] * o, s.y + y, s.z + nn[1] * o];
    quad(b, c(hw, -.5, p, m), c(-hw, -.5, p, m), c(-hw, -.5, q, k), c(hw, -.5, q, k), [0, 1, 0]);
    quad(b, c(hw, h, p, m), c(-hw, h, p, m), c(-hw, h, q, k), c(hw, h, q, k), [0, -1, 0]);
    quad(b, c(hw, -.5, p, m), c(hw, h, p, m), c(hw, h, q, k), c(hw, -.5, q, k), [-m[0], 0, -m[1]]);
    quad(b, c(-hw, -.5, p, m), c(-hw, h, p, m), c(-hw, h, q, k), c(-hw, -.5, q, k), [m[0], 0, m[1]]);
  }
}

/** Earth texture for the cut face, surface (top) to `depth` metres (bottom). */
function strata(depth) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 512;
  const g = c.getContext('2d'), Y = m => m / depth * 512;
  [[0, 1.2, '#3a312a'], [1.2, 6, '#6b4f37'], [6, 13, '#866d4d'], [13, depth, '#4d4a46']] // paving and topsoil, fill and clay, sand and gravel, schist bedrock
    .forEach(([a, b, col]) => { g.fillStyle = col; g.fillRect(0, Y(a), 256, Y(b) - Y(a) + 1); });
  for (let i = 0; i < 7000; i++) {
    const y = Math.random() * 512, l = Math.random() < .5;
    g.fillStyle = l ? 'rgba(255,240,215,.13)' : 'rgba(20,14,8,.16)'; g.fillRect(Math.random() * 256, y, 2 + Math.random() * 3, 2);
  }
  g.strokeStyle = 'rgba(210,205,195,.18)'; g.lineWidth = 1.5;                // foliation in the schist
  for (let i = 0; i < 40; i++) { const y = Y(13) + Math.random() * (512 - Y(13)); g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(80, y - 9, 170, y + 9, 256, y - 4); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** A looping path: arc length table + position lookup (wraps). */
function runner(P) {
  const S = [0]; for (let i = 1; i < P.length; i++) S.push(S[i - 1] + P[i].distanceTo(P[i - 1]));
  const L = S[S.length - 1];
  function at(s, out) {
    s = ((s % L) + L) % L; let lo = 0, hi = S.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
    const u = (s - S[lo]) / ((S[hi] - S[lo]) || 1); out.lerpVectors(P[lo], P[hi], u);
    out.h = P[lo].h + (P[hi].h - P[lo].h) * u; return out;
  }
  return { L, at, P, S };
}

export function buildSubway(scene, data, river) {
  const LINES = Object.fromEntries(data.lines.map(l => [l.id, l]));
  const tracks = data.tracks.map(t => { const P = pts3(t.p, t.g); return { k: t.k, P, N: normals(P) }; });
  const under = (P, i) => P[i].h < -1 && P[i + 1].h < -1;

  // --- rails and track beds. Underground ones are never clipped (they stay visible in front of a
  // cut); street-running track belongs to the city and is clipped with it.
  // Track that is below ground at both ends (nearly all of the underground track) is kept apart:
  // the ground hides it from any camera above it unless a cut is open, so it is only drawn then.
  const bedD = new Builder(), railD = new Builder(), bedU = new Builder(), railU = new Builder(), bedS = new Builder(), railS = new Builder();
  for (const { P, N } of tracks) for (let i = 0; i < P.length - 1; i++) {
    const d = under(P, i), u = P[i].h < .3 || P[i + 1].h < .3, bd = d ? bedD : u ? bedU : bedS, rl = d ? railD : u ? railU : railS;
    band(bd, P, N, i, i + 1, 0, 2.8, .02);
    band(rl, P, N, i, i + 1, GAUGE / 2, .14, .17); band(rl, P, N, i, i + 1, -GAUGE / 2, .14, .17);
  }
  const bedMat = mat('#3c3935'), railMat = mat('#a9aeb3', { roughness: .4, metalness: .6 });
  const deepTrack = new THREE.Group(); scene.add(deepTrack);
  if (bedD.count) deepTrack.add(new THREE.Mesh(bedD.geometry(), bedMat), new THREE.Mesh(railD.geometry(), railMat));
  if (bedU.count) scene.add(new THREE.Mesh(bedU.geometry(), bedMat), new THREE.Mesh(railU.geometry(), railMat));
  if (bedS.count) {
    const sb = new THREE.Mesh(bedS.geometry(), new THREE.MeshStandardMaterial({ color: '#55524e', roughness: .9 })); sb.position.y = .01;
    const sr = new THREE.Mesh(railS.geometry(), new THREE.MeshStandardMaterial({ color: '#a9aeb3', roughness: .4, metalness: .6 }));
    sb.receiveShadow = sr.receiveShadow = true; scene.add(sb, sr);
  }

  // --- Els and viaducts (the L in West Philadelphia and Frankford, PATCO onto the bridge): a deck
  // with side girders under every elevated stretch, and the columns listed in the data
  {
    const deck = new Builder();
    for (const { k, P, N } of tracks) {
      if (!['metro', 'broad', 'patco', 'nycsub'].includes(k)) continue;
      for (let i = 0; i < P.length - 1; i++) {
        if (P[i].h < 2.5 || P[i + 1].h < 2.5) continue;
        band(deck, P, N, i, i + 1, 0, 4.6, -.22);
        const p = P[i], q = P[i + 1], m = N[i], n = N[i + 1];
        for (const s of [1, -1]) {
          const A = [p.x + m[0] * 2.3 * s, p.y - .22, p.z + m[1] * 2.3 * s], B = [q.x + n[0] * 2.3 * s, q.y - .22, q.z + n[1] * 2.3 * s];
          quad(deck, A, B, [B[0], B[1] - 1.3, B[2]], [A[0], A[1] - 1.3, A[2]], [m[0] * s, 0, m[1] * s]);
        }
        quad(deck, [p.x + m[0] * 2.3, p.y - 1.52, p.z + m[1] * 2.3], [p.x - m[0] * 2.3, p.y - 1.52, p.z - m[1] * 2.3],
             [q.x - n[0] * 2.3, q.y - 1.52, q.z - n[1] * 2.3], [q.x + n[0] * 2.3, q.y - 1.52, q.z + n[1] * 2.3], [0, -1, 0]);
      }
    }
    const steel = new THREE.MeshStandardMaterial({ color: '#5b6166', roughness: .6, metalness: .35 });
    if (deck.count) { const dm = new THREE.Mesh(deck.geometry(), steel); dm.castShadow = dm.receiveShadow = true; scene.add(dm); }
    const C = data.columns || [];
    if (C.length) {
      const g = new THREE.BoxGeometry(.9, 1, .9); g.translate(0, .5, 0);
      const im = new THREE.InstancedMesh(g, steel, C.length / 3), o = new THREE.Object3D();
      for (let i = 0; i < C.length; i += 3) { o.position.set(C[i] / 10, 0, C[i + 1] / 10); o.scale.set(1, C[i + 2] / 10, 1); o.updateMatrix(); im.setMatrixAt(i / 3, o.matrix); }
      im.castShadow = true; im.frustumCulled = false; im.userData.terrain = 'instances'; scene.add(im);   // stood on the ground in index.js's seat()
    }
  }

  // --- platforms (top at data y; metro platforms are high-level, trolley platforms low)
  const platMat = mat('#4b4943', { emissive: '#d6cfbf', emissiveIntensity: .6 }), edgeMat = mat('#e8c53a', { emissive: '#e8c53a', emissiveIntensity: .25 });
  const pb = new Builder(), eb = new Builder();
  const boxInto = (b, cx, cy, cz, w, h, l, ry) => {
    const g = new THREE.BoxGeometry(w, h, l); g.rotateY(ry); g.translate(cx, cy, cz);
    const p = g.attributes.position, n = g.attributes.normal, s = b.count;
    for (let i = 0; i < p.count; i++) b.v(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i), 0, 0);
    const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) b.tri(s + ix[i], s + ix[i + 1], s + ix[i + 2]);
  };
  for (const p of data.platforms) {
    const th = SPEC[p.k].top + .3;
    boxInto(pb, p.x, p.y - th / 2, p.z, p.w, th, p.l, p.ry);
    // safety strips along both long edges
    const c = Math.cos(p.ry), s = Math.sin(p.ry);
    for (const e of [-1, 1]) boxInto(eb, p.x + c * e * (p.w / 2 - .3), p.y + .01, p.z - s * e * (p.w / 2 - .3), .6, .03, p.l, p.ry);
  }
  scene.add(new THREE.Mesh(pb.geometry(), platMat), new THREE.Mesh(eb.geometry(), edgeMat));

  // --- shared clipping plane; sections
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e6);
  const earthTex = strata(40);
  const earthMat = mat('#ffffff', { map: earthTex, roughness: 1 });
  const waterCut = mat('#3f6f92', { transparent: true, opacity: .82, roughness: .3 });
  const galMat = mat('#ffffff', { vertexColors: true, emissive: '#3d3b36', emissiveIntensity: 1 }); // lit tunnel interior
  const liningMat = mat('#a39d92', { emissive: '#3b3934', emissiveIntensity: 1 });
  const ghostMat = mat('#e6dccb', { transparent: true, opacity: .2, depthWrite: false });
  const floorMat = mat('#3d332b', { roughness: 1 });
  const sections = data.sections.map(sec => buildSection(sec));

  function buildSection(sec) {
    const [px, pz] = sec.p, d = { x: sec.d[0], z: sec.d[1] }, n = { x: d.z, z: -d.x }; // n: the kept side
    const DEPTH = sec.depth, BAND = sec.band;
    const O = (x, z) => (x - px) * n.x + (z - pz) * n.z, U = (x, z) => (x - px) * d.x + (z - pz) * d.z;
    const W = (u, o, y) => [px + d.x * u + n.x * o, y, pz + d.z * u + n.z * o];
    const inBand = (p) => { const o = O(p.x, p.z); return o >= -.5 && o <= BAND; };

    // gallery columns: floor, roof and back (distance from the plane) of every tunnel in the band
    const cols = new Map();
    const touch = (u, o, f, r) => {
      const i = Math.round(u / COL); const c = cols.get(i);
      if (c) { c.f = Math.min(c.f, f); c.r = Math.max(c.r, r); c.b = Math.max(c.b, o); } else cols.set(i, { f, r, b: o });
    };
    const ghost = new Builder();
    for (const t of tracks) {
      const sp = SPEC[t.k], P = t.P;
      let g0 = -1;
      for (let i = 0; i < P.length - 1; i++) {
        const isU = under(P, i), band_ = isU && inBand(P[i]) && inBand(P[i + 1]);
        if (band_) {
          const L = P[i].distanceTo(P[i + 1]), n_ = Math.max(1, Math.ceil(L));
          for (let k = 0; k <= n_; k++) {
            const q = P[i].clone().lerp(P[i + 1], k / n_);
            touch(U(q.x, q.z), O(q.x, q.z) + sp.hw, q.y - .5, q.y + sp.h);
          }
        }
        const isG = isU && !band_;
        if (isG && g0 < 0) g0 = i;
        if ((!isG || i === P.length - 2) && g0 >= 0) { tube(ghost, P, t.N, g0, isG ? i + 1 : i, sp.hw, sp.h); g0 = -1; }
      }
    }
    for (const p of data.platforms) {
      if (!inBand({ x: p.x, z: p.z })) continue;
      const c = Math.cos(p.ry), s = Math.sin(p.ry);
      for (const e of [-1, 1]) for (const a of [-1, 1]) {
        const x = p.x + c * e * p.w / 2 + s * a * p.l / 2, z = p.z - s * e * p.w / 2 + c * a * p.l / 2;
        const i = Math.round(U(x, z) / COL), cl = cols.get(i);
        if (cl) cl.b = Math.max(cl.b, O(x, z) + .6);
      }
    }
    // close small gaps between columns
    const idx = [...cols.keys()].sort((a, b) => a - b);
    for (let j = 0; j < idx.length - 1; j++) {
      const a = idx[j], b = idx[j + 1];
      if (b - a > 1 && b - a <= 4) for (let i = a + 1; i < b; i++) {
        const A = cols.get(a), B = cols.get(b), t = (i - a) / (b - a);
        cols.set(i, { f: A.f + (B.f - A.f) * t, r: A.r + (B.r - A.r) * t, b: Math.max(A.b, B.b) });
      }
    }
    const keys = [...cols.keys()].sort((a, b) => a - b);

    // gallery: floor, roof, back wall and end walls of each run of columns
    const gb = new Builder({ color: true });
    const cFloor = new THREE.Color('#55524d'), cRoof = new THREE.Color('#cfcac0'), cWall = new THREE.Color('#9ea7a8'), cEnd = new THREE.Color('#8d877d'), cTop = new THREE.Color('#4a453f'); // tiled walls, lit ceiling, slab top
    // quad() calls Builder.v without a colour, so gq() sets the colour Builder.v reads (b.c) first
    const gq = (A, B, C, D, nn, col) => { gb.c = col; quad(gb, A, B, C, D, nn); };
    gb.v = function (x, y, z, nx, ny, nz, u, w) { return Builder.prototype.v.call(this, x, y, z, nx, ny, nz, u, w, this.c); };
    const toward = [-n.x, 0, -n.z];
    for (let j = 0; j < keys.length; j++) {
      const i = keys[j], c = cols.get(i), u = i * COL, nx_ = cols.get(i + 1), prev = cols.get(i - 1);
      if (nx_) {
        const u1 = u + COL;
        gq(W(u, 0, c.f), W(u, c.b, c.f), W(u1, nx_.b, nx_.f), W(u1, 0, nx_.f), [0, 1, 0], cFloor);
        gq(W(u, 0, c.r), W(u, c.b, c.r), W(u1, nx_.b, nx_.r), W(u1, 0, nx_.r), [0, -1, 0], cRoof);
        // top of the roof slab (seen when looking down into the cut from street level)
        gq(W(u, 0, c.r + .7), W(u, c.b + .7, c.r + .7), W(u1, nx_.b + .7, nx_.r + .7), W(u1, 0, nx_.r + .7), [0, 1, 0], cTop);
        gq(W(u, c.b, c.f), W(u, c.b, c.r), W(u1, nx_.b, nx_.r), W(u1, nx_.b, nx_.f), toward, cWall);
      }
      if (!prev && nx_) gq(W(u, 0, c.f), W(u, c.b, c.f), W(u, c.b, c.r), W(u, 0, c.r), [d.x, 0, d.z], cEnd);
      if (prev && !nx_) gq(W(u, 0, c.f), W(u, c.b, c.f), W(u, c.b, c.r), W(u, 0, c.r), [-d.x, 0, -d.z], cEnd);
    }

    // cut face: earth from the surface (or the river bed) down to DEPTH, with the gallery's holes
    const fb = new Builder({ uv: true }), wb = new Builder(), lb = new Builder(), LINE = .7;
    const samples = [];
    const i0 = (keys[0] ?? 0) - 150, i1 = (keys[keys.length - 1] ?? 0) + 150;
    samples.push(-15000);
    for (let i = i0; i <= i1; i++) samples.push(i * COL);
    samples.push(15000);
    const info = samples.map(u => {
      const [x, , z] = W(u, 0, 0);
      const ri = Math.abs(u) < 15000 ? river.riverInfo(x, z) : null;
      const wet = ri && Math.abs(ri.d) < ri.w / 2;
      // the ground (or the river bed under the water surface) along the cut
      const lvl = terrain.on ? water(x, z) : .6;
      const top = wet ? lvl - 2.1 - 4 * (1 - (2 * ri.d / ri.w) ** 2) : TOP + surface(x, z);
      const c = Number.isInteger(u / COL) ? cols.get(u / COL) : undefined;
      return { u, top, wet, c };
    });
    const face = (u0, u1, a0, a1, b0, b1) => {   // vertical strip between heights a (bottom) and b (top)
      if (b0 - a0 < .01 && b1 - a1 < .01) return;
      const uv = (u, y) => [u / 60, 1 + y / DEPTH];
      quad(fb, W(u0, 0, a0), W(u1, 0, a1), W(u1, 0, b1), W(u0, 0, b0), toward, [uv(u0, a0), uv(u1, a1), uv(u1, b1), uv(u0, b0)]);
    };
    for (let j = 0; j < info.length - 1; j++) {
      const A = info[j], B = info[j + 1];
      if (A.c && B.c) {
        // concrete box structure (LINE thick) around the opening, earth beyond it
        const fA = Math.min(A.c.f, A.top), fB = Math.min(B.c.f, B.top), rA = Math.min(A.c.r, A.top), rB = Math.min(B.c.r, B.top);
        const lA = Math.min(rA + LINE, A.top), lB = Math.min(rB + LINE, B.top);
        face(A.u, B.u, -DEPTH, -DEPTH, fA - LINE, fB - LINE);
        quad(lb, W(A.u, 0, fA - LINE), W(B.u, 0, fB - LINE), W(B.u, 0, fB), W(A.u, 0, fA), toward);
        quad(lb, W(A.u, 0, rA), W(B.u, 0, rB), W(B.u, 0, lB), W(A.u, 0, lA), toward);
        face(A.u, B.u, lA, lB, A.top, B.top);
      } else {
        face(A.u, B.u, -DEPTH, -DEPTH, A.top, B.top);
        // end walls of the box, where an opening starts or stops
        const E = A.c ? A : B.c ? B : null;
        if (E) {
          const u = E.u, s = E === A ? 1 : -1, f = Math.min(E.c.f, E.top) - LINE, r = Math.min(E.c.r + LINE, E.top);
          quad(lb, W(u, 0, f), W(u + s * LINE, 0, f), W(u + s * LINE, 0, r), W(u, 0, r), toward);
        }
      }
      if (A.wet && B.wet) { const la = terrain.on ? water(...[W(A.u, 0, 0)].map(p => [p[0], p[2]])[0]) + .15 : .6, lb_ = terrain.on ? water(...[W(B.u, 0, 0)].map(p => [p[0], p[2]])[0]) + .15 : .6; quad(wb, W(A.u, 0, A.top), W(B.u, 0, B.top), W(B.u, 0, lb_), W(A.u, 0, la), toward); }
    }

    const group = new THREE.Group(); group.visible = false; scene.add(group);
    group.add(new THREE.Mesh(gb.geometry(), galMat), new THREE.Mesh(fb.geometry(), earthMat));
    if (wb.count) group.add(new THREE.Mesh(wb.geometry(), waterCut));
    if (lb.count) { const lm = new THREE.Mesh(lb.geometry(), liningMat); lm.position.addScaledVector(new THREE.Vector3(-n.x, 0, -n.z), .02); group.add(lm); }
    if (ghost.count) { const gm = new THREE.Mesh(ghost.geometry(), ghostMat); gm.renderOrder = 2; group.add(gm); }
    // bedrock floor under the removed half, so the cut reads as a solid block
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(30000, 15000), floorMat);
    fl.rotation.x = -Math.PI / 2; const fg = new THREE.Group(); fg.add(fl);
    fg.rotation.y = Math.atan2(-d.z, d.x); fg.position.set(px - n.x * 7500, -DEPTH, pz - n.z * 7500); group.add(fg);

    // camera preset: close in on the south side, looking into 30th Street station at an angle
    const tgt = W(-395, 6, -8), pos = W(-440, -38, -5.5);
    return {
      id: sec.id, name: sec.name, group, n, c: -(n.x * px + n.z * pz), O, band: BAND,
      view: { id: 'cut-' + sec.id, name: 'Under ' + sec.name, cut: sec.id, pos: new THREE.Vector3(...pos), target: new THREE.Vector3(...tgt) },
      labelAt: (x, z, y) => { const u = U(x, z), p = W(u, 0, y); return new THREE.Vector3(p[0], y + surface(p[0], p[2]), p[2]); },
    };
  }

  let active = null;
  function setCut(id) {
    active = sections.find(s => s.id === id) || null;
    if (active) { plane.normal.set(active.n.x, 0, active.n.z); plane.constant = active.c; }
    else { plane.normal.set(0, 1, 0); plane.constant = 1e6; }
    sections.forEach(s => { s.group.visible = s === active; });
    return active ? active.id : false;
  }

  // --- station labels. Every station and stop gets a small street-level tag that shows when the
  // camera is within STN_FAR m; underground stations near a section also get a tag on the cut
  // face (shown only while that cut is open, replacing the street tag).
  const STN_FAR = 1600;
  const range = refs => {
    const n = refs.map(r => +r.slice(1)).sort((a, b) => a - b);
    return n.length > 2 && n[n.length - 1] - n[0] === n.length - 1 ? `T${n[0]}–T${n[n.length - 1]}` : n.map(v => 'T' + v).join(', ');
  };
  const labels = [];
  for (const s of data.stations) {
    let text;
    if (s.lines) text = `${s.t} · ${CITY.stationLines(s, LINES)}`;   // how a tag reads its lines is per city (js/cities.js)
    else { const parts = []; if (s.k.includes('metro')) parts.push('L'); if (s.k.includes('trolley')) parts.push(range(s.T || [])); text = `${s.t} · ${parts.join(' · ')}`; }
    const under = (s.u || []).length > 0;
    const secs = under ? sections.filter(sec => Math.abs(sec.O(s.x, s.z)) <= 200) : [];
    for (const sec of secs) labels.push({ text, pos: sec.labelAt(s.x, s.z, 3), section: sec.id, abs: true });
    // tag colour: the first rapid-transit kind here; street stops (trolleys at grade) are 'stop'
    const k = ['metro', 'broad', 'patco', 'regional', 'nycsub'].find(q => s.k.includes(q));
    const stn = under || k ? (k || (s.k.includes('pcc') ? 'pcc' : 'trolley')) : 'stop';
    const y = Math.max(7 + surface(s.x, s.z), ...(data.platforms.filter(p => Math.abs(p.x - s.x) < 120 && Math.abs(p.z - s.z) < 120).map(p => p.y + 5)));
    labels.push({ text, pos: new THREE.Vector3(s.x, y, s.z), stn, far: STN_FAR, cutHide: secs.map(sec => sec.id), abs: true });
  }

  // --- street markers: a sign post at every station and stop (blue square for the L, green for
  // trolleys), and a stair opening with a post at each OSM subway entrance. Part of the city, so
  // they are clipped by a cut like the buildings.
  {
    const GRID = -1.7326;   // street grid direction (the L under Market St)
    const postB = new Builder(), signB = { metro: new Builder(), trolley: new Builder() }, stairB = new Builder();
    const post = (x, z, k, ry = GRID, h = 3.6) => {
      boxInto(postB, x, h / 2, z, .12, h, .12, ry);
      boxInto(signB[k], x, h + .35, z, .9, .9, .12, ry);
    };
    // surface stop: a post 3 m beside the nearest street track, on the side away from other track
    // street-level track, hashed in 50 m cells (the network is citywide)
    const SG = new Map(), sk = (x, z) => Math.floor(x / 50) + ',' + Math.floor(z / 50);
    for (const t of tracks) for (let i = 0; i < t.P.length - 1; i++) {
      const a = t.P[i]; if (a.h < -.5 || a.h > 2) continue;
      const k = sk(a.x, a.z); (SG.get(k) || SG.set(k, []).get(k)).push([t, i]);
    }
    const nearSeg = (x, z) => { const o = []; const cx = Math.floor(x / 50), cz = Math.floor(z / 50); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = SG.get((cx + a) + ',' + (cz + b)); if (l) o.push(...l); } return o; };
    for (const s of data.stations) {
      if ((s.u || []).length || !(s.k.includes('trolley') || s.k.includes('pcc'))) continue;   // street stops only
      let best = null;
      const surf = nearSeg(s.x, s.z).map(([t, i]) => t.P[i]);
      for (const [t, i] of nearSeg(s.x, s.z)) {
        const a = t.P[i], b = t.P[i + 1]; if (a.h < -.5) continue;
        const ex = b.x - a.x, ez = b.z - a.z, L2 = ex * ex + ez * ez; if (L2 < 1e-6) continue;
        const u = Math.max(0, Math.min(1, ((s.x - a.x) * ex + (s.z - a.z) * ez) / L2)), px = a.x + ex * u, pz = a.z + ez * u;
        const d = Math.hypot(s.x - px, s.z - pz);
        if (!best || d < best.d) { const L = Math.sqrt(L2); best = { d, px, pz, tx: ex / L, tz: ez / L }; }
      }
      if (!best) continue;
      const clear = (x, z) => Math.min(...surf.map(p => Math.hypot(p.x - x, p.z - z)));
      const c = [1, -1].map(sd => [best.px - best.tz * 3 * sd, best.pz + best.tx * 3 * sd]).sort((A, B) => clear(...B) - clear(...A))[0];
      post(c[0], c[1], 'trolley', Math.atan2(best.tx, best.tz) + Math.PI / 2);
    }
    for (const e of data.entrances || []) {
      boxInto(stairB, e.x, .06, e.z, 1.9, .12, 4.6, GRID);       // stairwell opening
      for (const sd of [-1, 1]) boxInto(postB, e.x + Math.cos(GRID) * sd * .95, .55, e.z - Math.sin(GRID) * sd * .95, .06, 1.0, 4.6, GRID); // railings
      post(e.x + Math.sin(GRID) * 2.6, e.z + Math.cos(GRID) * 2.6, e.k);
    }
    const postMat = new THREE.MeshStandardMaterial({ color: '#4a4d50', roughness: .6, metalness: .4 });
    const onGround = m => { m.userData.terrain = 'drape'; return m; };   // posts, signs and stairs stand on the street
    scene.add(onGround(new THREE.Mesh(postB.geometry(), postMat)));
    if (stairB.count) scene.add(onGround(new THREE.Mesh(stairB.geometry(), new THREE.MeshStandardMaterial({ color: '#1d1c1a', roughness: 1 }))));
    for (const k of Object.keys(signB)) if (signB[k].count) {
      const c = data.lines.find(l => l.kind === k).color;
      scene.add(onGround(new THREE.Mesh(signB[k].geometry(), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: .45, roughness: .5 }))));
    }
  }

  // ===================== riding inside a car (first person) =====================
  // Click a visible car (pick) -> board(): a detailed interior is placed on that car every frame,
  // the car's own instance is hidden, and while underground a lit tunnel is drawn around the
  // track. Interiors follow the real cars' layouts: the L's M-4 cars (Adtranz, 1997-99) and the
  // trolleys' Kawasaki LRVs (1981). Colours are approximations.
  const V3 = THREE.Vector3;
  const geoInto = (b, g) => {
    const p = g.attributes.position, n = g.attributes.normal, s = b.count;
    for (let i = 0; i < p.count; i++) b.v(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i), 0, 0);
    const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) b.tri(s + ix[i], s + ix[i + 1], s + ix[i + 2]);
  };
  const bx = (b, x, y, z, w, h, l, rx = 0) => { const g = new THREE.BoxGeometry(w, h, l); if (rx) g.rotateX(rx); g.translate(x, y, z); geoInto(b, g); };
  const rod = (b, a, c, r = .019) => {
    const A = new V3(...a), C = new V3(...c), g = new THREE.CylinderGeometry(r, r, A.distanceTo(C), 8, 1, true);
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), C.clone().sub(A).normalize())));
    g.translate((A.x + C.x) / 2, (A.y + C.y) / 2, (A.z + C.z) / 2); geoInto(b, g);
  };
  // car-local frame: x left, y up from the rail head, z forward. F floor, sill/wt window bottom/top
  // and c ceiling above the floor; hw inner half width; doors: centres (z), width, which sides.
  const CAR_IN = {
    metro: { model: 'M-4 car', F: 1.0, sill: .85, wt: 1.8, c: 2.15, hw: 1.33, z0: -8.05, z1: 8.05, cab: 6.7,
      doorZ: [-4.7, 0, 4.7], doorW: 1.3, sides: [1, -1],
      col: { wall: '#dcd9d2', ceil: '#eeede8', floor: '#4a4b4e', seat: '#3d5d86', steel: '#c3c8cd', door: '#aeb4ba', cab: '#cfccc4', dark: '#2a2c2f' } },
    trolley: { model: 'Kawasaki LRV', F: .95, sill: .8, wt: 1.75, c: 2.1, hw: 1.23, z0: -7.45, z1: 7.45,
      doorZ: [-1.0, 6.2], doorW: 1.25, sides: [-1],   // single-ended: doors on the right (-x) only
      col: { wall: '#e2d6bb', ceil: '#efe9d8', floor: '#5b4f45', seat: '#b4592f', steel: '#b9bec3', door: '#a9a59c', cab: '#d4c9b0', dark: '#2b2824' } },
    // the citywide fleet. layout 'heavy': rows of transverse seats between the doors (seats: [left,
    // right] bench widths), a cab at the front, an end door at the back; 'trolley': single-ended.
    broad: { model: 'Kawasaki B-IV car', layout: 'heavy', F: 1.05, sill: .85, wt: 1.85, c: 2.2, hw: 1.42, z0: -10.0, z1: 10.0, cab: 8.6,
      doorZ: [-5.6, 0, 5.6], doorW: 1.3, sides: [1, -1], seats: [.92, .92],
      col: { wall: '#d8d5ce', ceil: '#efeee9', floor: '#545350', seat: '#d47a2c', steel: '#c3c8cd', door: '#b0b6bc', cab: '#cfccc4', dark: '#2a2c2f' } },
    patco: { model: 'PATCO car', layout: 'heavy', F: 1.05, sill: .85, wt: 1.85, c: 2.2, hw: 1.42, z0: -10.15, z1: 10.15, cab: 8.8,
      doorZ: [-4.6, 4.6], doorW: 1.4, sides: [1, -1], seats: [.92, .92],
      col: { wall: '#e4e1da', ceil: '#f2f1ec', floor: '#4d4a48', seat: '#8c2f3c', steel: '#c3c8cd', door: '#b4b8bd', cab: '#d2cfc8', dark: '#28292b' } },
    regional: { model: 'Silverliner IV', layout: 'heavy', F: 1.25, sill: .75, wt: 1.75, c: 2.25, hw: 1.5, z0: -12.75, z1: 12.75, cab: 11.3,
      doorZ: [-11.6, 10.5], doorW: 1.0, sides: [1, -1], seats: [1.4, .92],   // 3 + 2 seating
      col: { wall: '#d7d3c8', ceil: '#ecebe5', floor: '#5a5650', seat: '#2f4f78', steel: '#bfc4c9', door: '#a9adb1', cab: '#cbc7bd', dark: '#2a2b2d' } },
    pcc: { model: 'PCC car', layout: 'trolley', F: .85, sill: .8, wt: 1.7, c: 2.05, hw: 1.25, z0: -7.0, z1: 7.0,
      doorZ: [-1.0, 5.75], doorW: 1.2, sides: [-1],
      col: { wall: '#e6dcc2', ceil: '#f1ecdc', floor: '#5d5146', seat: '#7b4a2a', steel: '#b9bec3', door: '#a9a59c', cab: '#d6cbb0', dark: '#2b2824' } },
    monorail: { model: 'monorail car (proposed)', layout: 'heavy', F: .25, sill: .7, wt: 2.0, c: 2.45, hw: 1.45, z0: -6.8, z1: 6.8, cab: 5.4,
      doorZ: [-3.2, 2.2], doorW: 1.3, sides: [1, -1], seats: [.92, .92],
      col: { wall: '#eef0f2', ceil: '#f7f8f9', floor: '#3f4447', seat: '#c8432f', steel: '#c9ced2', door: '#d0d4d8', cab: '#e3e6e9', dark: '#26292c' } },
  };
  CAR_IN.pcc53 = { ...CAR_IN.pcc, model: 'PCC car' };   // the 1953 streetcars (oldtrolley.js)
  // the river boats (boats.js): a wide cabin of 2 + 2 rows, the helm forward, gates aft
  CAR_IN.boat = { model: 'river boat', layout: 'heavy', F: 1.05, sill: .95, wt: 2.05, c: 2.4, hw: 2.6, z0: -7.4, z1: 5.4, cab: 3.6,
    doorZ: [-6.3], doorW: 1.4, sides: [1, -1], seats: [1.4, 1.4], spawnZ: -2.8,
    deck: { z0: -10.6, hw: 2.8 },   // the open stern deck behind the cabin (boats.js), walkable
    col: { wall: '#eef0ec', ceil: '#f6f5f0', floor: '#6b5a48', seat: '#2f6a8a', steel: '#c3c8cd', door: '#d2d6d9', cab: '#e2e4df', dark: '#2a2c2f' } };
  CAR_IN.nycsub = { ...CAR_IN.metro, model: 'NYC subway car' };   // New York: the same longitudinal-bench layout
  for (const [k, v] of Object.entries(CAR_IN)) v.layout = v.layout || k;   // metro | trolley | heavy
  const glow = (c, k = .45, o = {}) => mat(new THREE.Color(c).multiplyScalar(.35), Object.assign({ emissive: c, emissiveIntensity: .45 + k * .5, roughness: .8 }, o));
  const flat = c => mat('#000000', { emissive: c, emissiveIntensity: 1 });

  function adTexture() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 96; const g = c.getContext('2d');
    const P = [['#1f5f8b', '#f2f2ee'], ['#e8e3d5', '#b23a2e'], ['#2e7d4f', '#f7f3e8'], ['#f0b429', '#2b2b2b'], ['#6a4c93', '#ffffff'], ['#d9d4c7', '#1e4d7a']];
    g.fillStyle = '#8b8f93'; g.fillRect(0, 0, 512, 96);
    for (let k = 0; k < 4; k++) {
      const [bg, fg] = P[(k * 5 + 1) % P.length], x0 = k * 128 + 3;
      g.fillStyle = bg; g.fillRect(x0, 4, 122, 88); g.fillStyle = fg;
      g.fillRect(x0 + 10, 16, 64, 11); g.fillRect(x0 + 10, 36, 96, 6); g.fillRect(x0 + 10, 48, 78, 6);
      g.beginPath(); g.arc(x0 + 98, 72, 13, 0, 7); g.fill();
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; return t;
  }
  function mapTexture(kind, lineId, run, title, colour) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 112; const g = c.getContext('2d');
    const col = colour || (LINES[lineId] && LINES[lineId].color) || '#d6452f';
    g.fillStyle = '#f7f6f2'; g.fillRect(0, 0, 1024, 112);
    g.fillStyle = '#333'; g.font = '600 13px sans-serif'; g.textAlign = 'left';
    g.fillText(title || (LINES[lineId] && LINES[lineId].name) || lineId, 12, 18);
    // the stations along the outbound half of the line's loop, in order
    let st = [];
    if (run) {
      if (!run.stops) run.stops = stopsOn(run, lineId, kind);
      const half = run.strip && !run.strip.back ? run.stops : run.stops.filter(o => o.s < run.L / 2), seen = new Set();   // a loop (the monorails): every station
      for (const o of (half.length > 1 ? half : run.stops)) if (!seen.has(o.t)) { seen.add(o.t); st.push({ t: o.t }); }
    }
    const ends = st.length > 1 ? [st[0].t, st[st.length - 1].t].map(t => t.length > 16 ? t.slice(0, 15) + '…' : t) : ['', ''];
    if (st.length > 2) st = st.slice(1, -1);
    if (st.length > 18) g.font = '600 11px sans-serif';
    const x0 = 120, x1 = 904, Y = 64;
    g.strokeStyle = col; g.lineWidth = 8; g.beginPath(); g.moveTo(x0, Y); g.lineTo(x1, Y); g.stroke();
    g.setLineDash([8, 7]); g.beginPath(); g.moveTo(30, Y); g.lineTo(x0, Y); g.moveTo(x1, Y); g.lineTo(994, Y); g.stroke(); g.setLineDash([]);
    const small = st.length > 18;
    g.font = '600 14px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#222';
    g.fillText(ends[0], 62, Y + 30); g.fillText(ends[1], 962, Y + 30);
    if (small) g.font = '600 10px sans-serif';
    st.forEach((s, i) => {
      const x = st.length > 1 ? x0 + (x1 - x0) * i / (st.length - 1) : (x0 + x1) / 2;
      g.fillStyle = '#fff'; g.strokeStyle = '#222'; g.lineWidth = 2.5; g.beginPath(); g.arc(x, Y, 7, 0, 7); g.fill(); g.stroke();
      g.fillStyle = '#222'; g.fillText(s.t.replace(' St Portal', ' Portal'), x, i % 2 ? Y - 16 : Y + 30);
    });
    return new THREE.CanvasTexture(c);
  }

  // a simple seated passenger (by Sean Maye), facing forward in the aisle seat just behind where
  // the rider starts (buildInterior picks it). It turns its head and waves when the camera looks
  // at it (see wave() in rideFrame).
  function makePerson(kind, at) {
    const shirt = kind === 'metro' ? '#8a3f3a' : kind === 'monorail' ? '#4f7a3a' : '#2f6a8a';
    const M = { skin: glow('#c99370', .45, { roughness: .7 }), shirt: glow(shirt, .45), pants: glow('#2e3542', .4), shoe: glow('#1c1c1c', .3), hair: glow('#3a2a20', .35), eye: glow('#111111', .2) };
    const box = (m, w, h, l, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), m); o.position.set(x, y, z); return o; };
    const root = new THREE.Group();
    root.position.copy(at);
    for (const e of [-1, 1]) {                                   // legs: thighs forward, shins down, shoes
      root.add(box(M.pants, .15, .14, .46, e * .1, .07, .2));
      root.add(box(M.pants, .13, .47, .13, e * .1, -.2, .42));
      root.add(box(M.shoe, .11, .08, .26, e * .1, -.45, .48));
    }
    const torso = new THREE.Group(); torso.position.set(0, .05, -.1); torso.rotation.x = -.1; root.add(torso);
    torso.add(box(M.shirt, .38, .56, .22, 0, .3, 0));
    torso.add(box(M.skin, .09, .08, .09, 0, .62, 0));              // neck
    const head = new THREE.Group(); head.position.set(0, .76, 0); torso.add(head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(.11, 16, 12), M.skin); skull.scale.set(1, 1.15, 1); head.add(skull);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(.115, 16, 8, 0, Math.PI * 2, 0, Math.PI * .55), M.hair); hair.position.y = .02; hair.rotation.x = -.35; head.add(hair);
    for (const e of [-1, 1]) head.add(box(M.eye, .025, .025, .02, e * .04, .02, .1));
    head.add(box(M.eye, .05, .012, .02, 0, -.05, .1));             // mouth
    // arms: shoulder -> upper arm group -> elbow -> forearm group -> hand. The right arm
    // (the person's right is -x, as they face +z) is the one that waves.
    const arm = sx => {
      const up = new THREE.Group(); up.position.set(sx * .24, .54, 0); torso.add(up);
      up.add(box(M.shirt, .1, .3, .1, 0, -.14, 0));
      const fore = new THREE.Group(); fore.position.set(0, -.28, 0); up.add(fore);
      fore.add(box(M.skin, .08, .26, .08, 0, -.13, 0));
      const hand = new THREE.Mesh(new THREE.SphereGeometry(.05, 10, 8), M.skin); hand.position.y = -.29; fore.add(hand);
      up.rotation.x = -.35; fore.rotation.x = -1.25;               // resting: forearm across the lap
      return { up, fore };
    };
    arm(1);
    const right = arm(-1);
    root.traverse(o => { o.frustumCulled = false; });
    return { root, head, right, w: 0, t: 0 };
  }
  const _hp = new THREE.Vector3(), _cd = new THREE.Vector3(), _cl = new THREE.Vector3();
  /** wave when the camera looks at the passenger's head (within ~30 degrees, closer than 9 m) */
  function wave(P, dt, camera) {
    P.t += dt;
    P.head.getWorldPosition(_hp); camera.getWorldDirection(_cd);
    const to = _hp.sub(camera.position), d = to.length();
    const seen = d < 9 && to.dot(_cd) / d > Math.cos(30 * Math.PI / 180);
    P.w += ((seen ? 1 : 0) - P.w) * Math.min(1, dt * (seen ? 5 : 2.5));
    const w = P.w * P.w * (3 - 2 * P.w);                           // smoothstep
    const { up, fore } = P.right;
    up.rotation.set(-.35 * (1 - w), 0, -1.9 * w);                  // upper arm out to the side, elbow at shoulder height
    fore.rotation.set(-1.25 * (1 - w), 0, w * (-1.15 + .4 * Math.sin(P.t * 9)));   // forearm up, hand swinging side to side
    // turn the head toward the camera while waving
    _cl.copy(camera.position); P.root.worldToLocal(_cl);
    const yaw = Math.max(-1, Math.min(1, Math.atan2(_cl.x, _cl.z + .1)));
    P.head.rotation.y = yaw * w;
  }

  function buildInterior(kind, lineId, run, title, colour) {
    const S = CAR_IN[kind], C = S.col, F = S.F, HW = S.hw, Y = F + S.c, SL = F + S.sill, WT = F + S.wt, T = .05, LAY = S.layout;
    const K = {}; ['wall', 'ceil', 'floor', 'seat', 'steel', 'door', 'cab', 'dark', 'yellow', 'light', 'glass'].forEach(k => { K[k] = new Builder(); });
    const ads = new Builder({ uv: true }), maps = new Builder({ uv: true });
    const mid = (S.z0 + S.z1) / 2, len = S.z1 - S.z0, front = LAY === 'trolley' ? S.z1 - 1.9 : S.cab;

    // floor (the trolley has stepwells at its doors: two steps down to a low platform)
    const well = LAY === 'trolley' ? .8 : 0;
    bx(K.floor, well / 2, F - .05, mid, 2 * HW - well, .1, len);
    if (well) {
      const cuts = [S.z0]; S.doorZ.forEach(z => cuts.push(z - S.doorW / 2, z + S.doorW / 2)); cuts.push(S.z1);
      for (let i = 0; i < cuts.length; i += 2) bx(K.floor, -HW + well / 2, F - .05, (cuts[i] + cuts[i + 1]) / 2, well, .1, cuts[i + 1] - cuts[i]);
      for (const z of S.doorZ) {
        bx(K.dark, -HW + .6, F - .38, z, .4, .06, S.doorW); bx(K.dark, -HW + .2, F - .71, z, .4, .06, S.doorW);
        bx(K.dark, -HW + .8, F - .2, z, .02, .4, S.doorW); bx(K.dark, -HW + .4, F - .53, z, .02, .33, S.doorW);
        bx(K.yellow, -HW + .77, F + .003, z, .06, .01, S.doorW); bx(K.yellow, -HW + .43, F - .347, z, .06, .01, S.doorW);
      }
    } else for (const z of S.doorZ) for (const sx of S.sides) bx(K.yellow, sx * (HW - .1), F + .003, z, .2, .01, S.doorW);

    // side walls: windows with posts between doors; doors are two leaves with tall windows
    for (const sx of [1, -1]) {
      const x = sx * (HW + T / 2), doors = S.sides.includes(sx) ? S.doorZ : [];
      const cuts = [S.z0]; doors.forEach(z => cuts.push(z - S.doorW / 2, z + S.doorW / 2)); cuts.push(S.z1);
      for (let i = 0; i < cuts.length; i += 2) {
        const a = cuts[i], b = cuts[i + 1], m = (a + b) / 2, L = b - a; if (L < .05) continue;
        bx(K.wall, x, (F + SL) / 2, m, T, SL - F, L); bx(K.wall, x, (WT + Y) / 2, m, T, Y - WT, L);
        bx(K.glass, x, (SL + WT) / 2, m, .01, WT - SL, L);
        bx(K.wall, x - sx * .05, SL - .01, m, .12, .03, L);                       // window ledge
        const n = Math.max(1, Math.round(L / 1.9));
        for (let k = 0; k <= n; k++) bx(K.wall, x - sx * .01, (SL + WT) / 2, a + L * k / n, T + .03, WT - SL, .16);
        // advertising cards above the windows, with a strip map in the longer bays
        const strip = (B, za, zb, u0, uw) => {
          if (zb - za < .05) return; const xi = sx * (HW - .005), y0 = WT + .05, y1 = Y - .04;
          const u = z => u0 + (sx > 0 ? z - za : zb - z) / uw;
          quad(B, [xi, y0, za], [xi, y0, zb], [xi, y1, zb], [xi, y1, za], [-sx, 0, 0], [[u(za), 0], [u(zb), 0], [u(zb), 1], [u(za), 1]]);
        };
        const segA = Math.max(a, S.z0 + .1), segB = Math.min(b, front - .05);
        if (segB - segA > 3) { const c0 = (segA + segB) / 2; strip(ads, segA, c0 - 1.3, 0, 2.4); strip(maps, c0 - 1.3, c0 + 1.3, 0, 2.6); strip(ads, c0 + 1.3, segB, .37, 2.4); }
        else strip(ads, segA, segB, i * .29, 2.4);
      }
      for (const z of doors) {
        const w = S.doorW, DH = F + 1.95;
        for (const e of [-1, 1]) {
          const lz = z + e * w / 4, lw = w / 2 - .02;
          bx(K.door, x, F + .55, lz, T, 1.1, lw); bx(K.door, x, (F + 1.85 + DH) / 2, lz, T, DH - F - 1.85, lw);
          bx(K.glass, x, F + 1.475, lz, .01, .75, lw);
          bx(K.door, x, F + 1.475, z + e * (w / 2 - .05), T, .75, .08); bx(K.door, x, F + 1.475, z + e * .05, T, .75, .08);
        }
        bx(K.dark, x - sx * .01, (F + DH) / 2, z, T + .01, DH - F, .035);
        bx(K.wall, x, (DH + Y) / 2, z, T, Y - DH, w);
        for (const e of [-1, 1]) rod(K.steel, [sx * (HW - .3), F, z + e * (w / 2 + .14)], [sx * (HW - .3), Y, z + e * (w / 2 + .14)]);
      }
    }
    // ceiling, light strips, grab rails
    bx(K.ceil, 0, Y + .03, mid, 2 * HW + .1, .06, len);
    for (const e of [-1, 1]) {
      bx(K.light, e * .6, Y - .015, (S.z0 + front) / 2, .2, .03, front - S.z0 - .5);
      rod(K.steel, [e * .52, Y - .3, S.z0 + .4], [e * .52, Y - .3, front - .3]);
      for (let z = S.z0 + .6; z < front - .3; z += 2) rod(K.steel, [e * .52, Y - .3, z], [e * .52, Y, z], .012);
    }

    // seats
    const seatList = [];                         // [cx, z, fz, w] of every transverse bench (for the passenger)
    const seat = (cx, z, fz, w = .92) => {      // transverse 2-seat bench facing fz (+1 forward / -1 back)
      seatList.push([cx, z, fz, w]);
      for (const e of [-1, 1]) {
        bx(K.seat, cx + e * w / 4, F + .44, z, w / 2 - .03, .09, .44);
        bx(K.seat, cx + e * w / 4, F + .78, z - fz * .25, w / 2 - .03, .62, .07, -fz * .14);
      }
      bx(K.steel, cx, F + .2, z, .08, .4, .28);
      const ax = cx - Math.sign(cx) * (w / 2 - .04);   // grab handle on the aisle corner of the back
      rod(K.steel, [ax, F + 1.05, z - fz * .3], [ax, F + 1.2, z - fz * .3], .016);
    };
    const bench = (sx, za, zb) => {             // longitudinal bench against the wall
      const m = (za + zb) / 2, L = zb - za;
      bx(K.seat, sx * (HW - .25), F + .44, m, .44, .09, L); bx(K.seat, sx * (HW - .06), F + .8, m, .07, .62, L);
      bx(K.dark, sx * (HW - .28), F + .2, m, .38, .4, L - .1);
    };
    if (LAY === 'metro') {
      const bays = [[-4.7 + .65, -.65], [.65, 4.7 - .65]];
      for (const [a] of bays) for (const sx of [1, -1]) {
        const cx = sx * (HW - .5);
        seat(cx, a + .38, 1); seat(cx, a + 1.48, -1); seat(cx, a + 1.98, 1); seat(cx, a + 3.08, -1);
      }
      for (const sx of [1, -1]) bench(sx, S.z0 + .15, -4.7 - .8);
      bench(1, 4.7 + .8, S.cab - .1);
      // draft screens beside the doors
      for (const z of S.doorZ) for (const sx of [1, -1]) for (const e of [-1, 1]) {
        const ze = z + e * (S.doorW / 2 + .1);
        if ((z === 4.7 && e > 0 && sx < 0) || (z === -4.7 && e < 0)) continue;
        bx(K.glass, sx * (HW - .3), F + .95, ze, .56, 1.1, .01);
        rod(K.steel, [sx * HW, F + 1.5, ze], [sx * (HW - .58), F + 1.5, ze]);
      }
      cabAndEnd();
    } else if (LAY === 'heavy') {
      // rows of transverse seats between the doors (left and right bench widths from the spec)
      const [wl, wr] = S.seats || [.92, .92];
      const edges = [S.z0 + .25];
      S.doorZ.forEach(z => edges.push(z - S.doorW / 2 - .45, z + S.doorW / 2 + .45));
      edges.push(S.cab - .25);
      for (let i = 0; i < edges.length - 1; i += 2) {
        const a = edges[i], b = edges[i + 1];
        for (let z = a + .35; z <= b - .3; z += .85) { seat(HW - wr / 2 - .04, z, 1, wr); seat(-(HW - wl / 2 - .04), z, 1, wl); }
      }
      for (const z of S.doorZ) rod(K.steel, [0, F, z], [0, Y, z], .025);   // centre pole at each door
      cabAndEnd();
    } else {
      const zf = S.z1 - 1.9;   // the operator's cab partition (5.55 m on the Kawasaki)
      // forward-facing 2+2 rows; the right side skips the door and the front fare-box area
      for (let z = S.z0 + 1.3; z <= S.z1 - 2.3 + 1e-6; z += .78) {
        seat(HW - .5, z, 1);
        if (Math.abs(z - S.doorZ[0]) > S.doorW / 2 + .35 && z < S.z1 - 2.9) seat(-(HW - .5), z, 1);
      }
      bx(K.seat, 0, F + .44, S.z0 + .33, 2 * HW - .1, .09, .44); bx(K.seat, 0, F + .8, S.z0 + .08, 2 * HW - .1, .62, .07, -.14); // rear bench
      for (const e of [-1, 1]) rod(K.steel, [e * .35, F, S.doorZ[0] + .8], [e * .35, Y, S.doorZ[0] + .8]);
      // rear window
      bx(K.wall, 0, (F + SL) / 2, S.z0, 2 * HW, SL - F, .05); bx(K.glass, 0, (SL + WT) / 2, S.z0, 2 * HW, WT - SL, .01); bx(K.wall, 0, (WT + Y) / 2, S.z0, 2 * HW, Y - WT, .05);
      // operator's cab on the left: partition, seat, console; fare box by the front door
      bx(K.cab, (HW + .05) / 2, F + .58, zf, HW - .05, 1.15, .05); bx(K.glass, (HW + .05) / 2, F + 1.5, zf, HW - .05, .7, .01);
      rod(K.steel, [.05, F, zf], [.05, Y, zf], .025);
      bx(K.seat, .62, F + .5, S.z1 - 1.0, .5, .1, .5); bx(K.seat, .62, F + .88, S.z1 - 1.25, .5, .62, .08, -.12);
      bx(K.dark, .6, F + .5, S.z1 - .33, 1.15, 1.0, .5); bx(K.dark, .6, F + 1.02, S.z1 - .5, 1.1, .05, .6, -.4);
      bx(K.dark, -.25, F + .55, S.z1 - 2.5, .32, 1.1, .3); bx(K.steel, -.25, F + 1.14, S.z1 - 2.5, .34, .08, .32);
      // windscreen
      bx(K.cab, 0, F + .5, S.z1, 2 * HW, 1.0, .05); bx(K.glass, 0, F + 1.45, S.z1, 2 * HW, .9, .01); bx(K.cab, 0, (F + 1.9 + Y) / 2, S.z1, 2 * HW, Y - F - 1.9, .05);
    }
    function cabAndEnd() {
      // cab partition (with the cab door window) and the cab: console, seat, windscreen
      const z = S.cab;
      bx(K.cab, (-HW - .95) / 2, (F + Y) / 2, z, HW - .95, Y - F, .05);
      bx(K.cab, (HW - .2) / 2, (F + Y) / 2, z, HW + .2, Y - F, .05);
      bx(K.cab, -.575, (F + F + 1.15) / 2, z, .75, 1.15, .05); bx(K.cab, -.575, (F + 1.85 + Y) / 2, z, .75, Y - F - 1.85, .05);
      bx(K.glass, -.575, F + 1.5, z, .75, .7, .01); bx(K.dark, -.95, (F + Y) / 2, z - .03, .03, Y - F, .02); bx(K.dark, -.2, (F + Y) / 2, z - .03, .03, Y - F, .02);
      bx(K.dark, 0, F + .5, S.z1 - .35, 2 * HW - .1, 1.0, .45); bx(K.seat, -.55, F + .5, S.z1 - 1.05, .5, .1, .5); bx(K.seat, -.55, F + .85, S.z1 - 1.3, .5, .6, .08);
      bx(K.cab, 0, (F + F + 1.05) / 2, S.z1, 2 * HW, 1.05, .05); bx(K.glass, 0, F + 1.48, S.z1, 2 * HW, .85, .01); bx(K.cab, 0, (F + 1.9 + Y) / 2, S.z1, 2 * HW, Y - F - 1.9, .05);
      bx(K.cab, 0, F + 1.48, S.z1, .12, .85, .06);
      // rear end: end door with a window, into the next car; on a boat an open doorway out to
      // the stern deck (S.deck), with a lintel above
      const dw = S.deck ? 1.1 : .84;
      bx(K.wall, (-HW - dw / 2) / 2, (F + Y) / 2, S.z0, HW - dw / 2, Y - F, .05); bx(K.wall, (HW + dw / 2) / 2, (F + Y) / 2, S.z0, HW - dw / 2, Y - F, .05);
      if (S.deck) { bx(K.wall, 0, (F + 2.05 + Y) / 2, S.z0, dw, Y - F - 2.05, .05); bx(K.yellow, 0, F + .003, S.z0, dw, .01, .2); }
      else { bx(K.door, 0, (F + F + 1.05) / 2, S.z0, .84, 1.05, .05); bx(K.glass, 0, F + 1.45, S.z0, .84, .8, .01); bx(K.door, 0, (F + 1.85 + Y) / 2, S.z0, .84, Y - F - 1.85, .05); }
    }

    const group = new THREE.Group(); group.visible = false;
    const M = {
      wall: glow(C.wall), ceil: glow(C.ceil, .55), floor: glow(C.floor, .3), seat: glow(C.seat, .4, { roughness: .5 }), steel: glow(C.steel, .35, { roughness: .35, metalness: .3 }),
      door: glow(C.door, .4), cab: glow(C.cab, .4), dark: glow(C.dark, .25), yellow: glow('#e2c032', .5), light: glow('#fffaf0', 1.1),
      glass: mat('#a7c0cf', { transparent: true, opacity: .13, depthWrite: false, roughness: .1 }),
    };
    for (const k of Object.keys(K)) if (K[k].count) { const m = new THREE.Mesh(K[k].geometry(), M[k]); if (k === 'glass') m.renderOrder = 3; group.add(m); }
    group.add(new THREE.Mesh(ads.geometry(), glow('#ffffff', .5, { map: adTexture() })));
    if (maps.count) group.add(new THREE.Mesh(maps.geometry(), glow('#ffffff', .55, { map: mapTexture(kind, lineId, run, title, colour) })));
    // LED next-stop sign hung from the ceiling at the front, facing the passengers
    const led = document.createElement('canvas'); led.width = 512; led.height = 64;
    const ledTex = new THREE.CanvasTexture(led), ledMat = noClip(new THREE.MeshBasicMaterial({ map: ledTex, side: THREE.DoubleSide }));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(.9, .113), ledMat);
    sign.position.set(LAY === 'trolley' ? -.3 : .45, Y - .12, front - .06); sign.rotation.y = Math.PI; group.add(sign);
    const setLED = text => {
      const g = led.getContext('2d'); g.fillStyle = '#140b04'; g.fillRect(0, 0, 512, 64);
      g.fillStyle = '#ffae2b'; g.font = 'bold 30px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 34, 496);
      ledTex.needsUpdate = true;
    };
    group.traverse(o => { o.frustumCulled = false; });
    scene.add(group);
    const eyeY = F + 1.62;
    const spawn = LAY === 'trolley' ? new V3(-.1, eyeY, 2.6) : LAY === 'metro' ? new V3(-.1, eyeY, 2.2) : new V3(-.1, eyeY, S.spawnZ ?? Math.min(2.2, S.cab - 1.5));
    // keep the rider inside the passenger area (the trolley's front door area is open to the windscreen on the right)
    const clampEye = e => {
      if (S.deck && e.z < S.z0 + .4) {
        // a boat: through the rear doorway (keep within it) and out on the open stern deck
        if (Math.abs(e.x) > .3) e.z = Math.min(e.z, S.z0 - .35);   // beside the doorway: the cabin's back wall
        const xm = e.z > S.z0 - .35 ? .3 : S.deck.hw - .3;
        e.x = Math.max(-xm, Math.min(xm, e.x)); e.z = Math.max(S.deck.z0 + .3, e.z);
        return;
      }
      e.x = Math.max(-HW + .3, Math.min(HW - .3, e.x));
      const zMax = LAY === 'trolley' ? (e.x < -.1 ? S.z1 - .35 : S.z1 - 2.15) : S.cab - .3;
      // in line with a boat's rear doorway you can keep walking back, out onto the deck
      e.z = Math.max(S.deck && Math.abs(e.x) < .3 ? S.deck.z0 + .3 : S.z0 + .45, Math.min(zMax, e.z));
    };
    // the passenger: aisle-side place of the forward-facing bench nearest 1.2 m behind the spawn
    // point, preferring the right-hand side (the L's and the trolley's original seats)
    const fwd = seatList.filter(q => q[2] > 0);
    const best = fwd.reduce((b, q) => { const sc = Math.abs(q[1] - (spawn.z - 1.2)) + (q[0] > 0 ? 0 : .3); return !b || sc < b[0] ? [sc, q] : b; }, null);
    let person = null;
    if (best) { const [cx, z, , w] = best[1]; person = makePerson(kind, new V3(cx - Math.sign(cx) * w / 4, F + .49, z)); group.add(person.root); }
    return { group, setLED, spawn, clampEye, person };
  }

  // a lit tunnel around every underground track, shown only while riding
  function buildRideTunnel() {
    const H = new Map(), key = (x, z) => Math.floor(x / 10) + ',' + Math.floor(z / 10);
    tracks.forEach((t, ti) => t.P.forEach((p, i) => { if (p.h < -1) { const k = key(p.x, p.z); if (!H.has(k)) H.set(k, []); H.get(k).push({ p, ti, i }); } }));
    const near = (x, z) => { const o = [], cx = Math.floor(x / 10), cz = Math.floor(z / 10); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = H.get((cx + a) + ',' + (cz + b)); if (l) o.push(...l); } return o; };
    const conc = new Builder(), wall = new Builder(), tile = new Builder(), roof = new Builder(), lamp = new Builder(), cols = new Builder();
    tracks.forEach((t, ti) => {
      const sp = SPEC[t.k], P = t.P, N = t.N;
      const ext = P.map((p, i) => [1, -1].map(sd => {
        const tx = N[i][1], tz = -N[i][0];
        let oth = Infinity, plat = 0;
        for (const o of near(p.x, p.z)) {
          if ((o.ti === ti && Math.abs(o.i - i) < 6) || Math.abs(o.p.y - p.y) > 3) continue;
          const dx = o.p.x - p.x, dz = o.p.z - p.z, lat = (dx * N[i][0] + dz * N[i][1]) * sd;
          if (lat > .5 && Math.abs(dx * tx + dz * tz) < 6 && lat < oth) oth = lat;
        }
        for (const pl of data.platforms) {
          if (Math.abs(pl.y - SPEC[pl.k].top - p.y) > 1.5) continue;
          const dx = pl.x - p.x, dz = pl.z - p.z; if (dx * dx + dz * dz > (pl.l / 2 + 10) ** 2) continue;
          const lat = (dx * N[i][0] + dz * N[i][1]) * sd, al = Math.abs(dx * Math.sin(pl.ry) + dz * Math.cos(pl.ry));
          if (al < pl.l / 2 && lat - pl.w / 2 > .8 && lat - pl.w / 2 < 2.6) plat = Math.max(plat, lat + pl.w / 2);
        }
        if (oth < 2 * sp.hw + 3.2) return { e: oth / 2 + .02, wall: false, col: !plat, oth };
        if (plat) return { e: plat + .15, wall: true, tile: true };
        return { e: sp.hw, wall: true, tile: false };
      }));
      for (let i = 0; i < P.length - 1; i++) {
        const p = P[i], q = P[i + 1]; if (p.h > -.6 || q.h > -.6) continue;
        const m = N[i], k = N[i + 1], [La, Ra] = ext[i], [Lb, Rb] = ext[i + 1];
        const c = (s, o, y, nn) => [s.x + nn[0] * o, s.y + y, s.z + nn[1] * o];
        // near a portal the track is too shallow for a roof: an open trench with walls up to the street
        const covered = p.h + sp.h < -.3 && q.h + sp.h < -.3, hp = Math.min(sp.h, -p.h + .05), hq = Math.min(sp.h, -q.h + .05);
        quad(conc, c(p, La.e, -.35, m), c(p, -Ra.e, -.35, m), c(q, -Rb.e, -.35, k), c(q, Lb.e, -.35, k), [0, 1, 0]);
        if (covered) quad(roof, c(p, La.e, sp.h, m), c(p, -Ra.e, sp.h, m), c(q, -Rb.e, sp.h, k), c(q, Lb.e, sp.h, k), [0, -1, 0]);
        for (const [A, B, s] of [[La, Lb, 1], [Ra, Rb, -1]]) {
          if (!A.wall || !B.wall) continue;
          quad(A.tile && B.tile ? tile : wall, c(p, s * A.e, -.35, m), c(p, s * A.e, hp, m), c(q, s * B.e, hq, k), c(q, s * B.e, -.35, k), [-s * m[0], 0, -s * m[1]]);
        }
        const ry = Math.atan2(q.x - p.x, q.z - p.z);
        if (covered && i % 3 === 0) { const off = La.wall ? La.e - .12 : 0; boxInto(lamp, p.x + m[0] * off, p.y + sp.h - .3, p.z + m[1] * off, .14, .08, 1.2, ry); }
        if (i % 2 === 0) for (const [A, s] of [[La, 1], [Ra, -1]]) if (!A.wall && A.col && A.oth < 20)
          boxInto(cols, p.x + m[0] * s * A.e, p.y + sp.h / 2 - .2, p.z + m[1] * s * A.e, .3, sp.h + .3, .3, ry);
      }
    });
    // dark end caps where underground track runs off the edge of the map
    const capB = new Builder();
    for (const t of tracks) {
      const sp = SPEC[t.k], P = t.P, N = t.N;
      for (const i of [0, P.length - 1]) {
        const p = P[i], m = N[i]; if (p.h > -1) continue;
        const near = t.P.length > 1 && tracks.some(o => o !== t && o.P.some(q => q.distanceTo(p) < 3));
        if (near) continue;   // joins another piece of track, not a map edge
        const w = 9;
        quad(capB, [p.x + m[0] * w, p.y - .35, p.z + m[1] * w], [p.x - m[0] * w, p.y - .35, p.z - m[1] * w],
             [p.x - m[0] * w, p.y + sp.h, p.z - m[1] * w], [p.x + m[0] * w, p.y + sp.h, p.z + m[1] * w], [m[1], 0, -m[0]]);
      }
    }
    const g = new THREE.Group(); g.visible = false;
    [[capB, flat('#141312')], [conc, flat('#2f2d2a')], [wall, flat('#4f4c46')], [tile, flat('#b9b29e')], [roof, flat('#23211e')], [lamp, flat('#fff4dc')], [cols, flat('#5e5a53')]]
      .forEach(([b, m]) => { if (b.count) g.add(new THREE.Mesh(b.geometry(), m)); });
    scene.add(g);
    return g;
  }

  // stops along each run (arc length), for the next-stop sign
  function stopsOn(run, lineId, kind) {
    const out = [];
    for (const s of data.stations) {
      if (s.lines ? !s.lines.includes(lineId) : (!s.k.includes(kind) || (kind === 'trolley' && !(s.T || []).includes(lineId)))) continue;
      let best = 1e9, bs = 0;
      for (let i = 0; i < run.P.length - 1; i++) {
        const a = run.P[i], b = run.P[i + 1], ex = b.x - a.x, ez = b.z - a.z, L2 = ex * ex + ez * ez; if (L2 < 1e-6) continue;
        const u = Math.max(0, Math.min(1, ((s.x - a.x) * ex + (s.z - a.z) * ez) / L2)), d = Math.hypot(s.x - a.x - ex * u, s.z - a.z - ez * u);
        if (d < best) { best = d; bs = run.S[i] + Math.sqrt(L2) * u; }
      }
      if (best < 45) out.push({ s: bs, t: s.t });
    }
    return out.sort((a, b) => a.s - b.s);
  }

  let ride = null, rideEnv = null; const interiors = {};
  const tmpA = new V3(), tmpB = new V3(), look = new V3();
  function pick(camera, x, y, w, h) {
    let best = null; const f = h / (2 * Math.tan(camera.fov * Math.PI / 360));
    for (const [kind, fl] of Object.entries(fleets)) if (CAR_IN[kind]) fl.slots.forEach((sl, i) => {   // only cars with an interior can be boarded
      if (sl.hidden || (ride && ride.sl === sl) || !sl.pos) return;
      const p = sl.pos;
      if (!((sl.h ?? p.y) > -1 || (active && active.O(p.x, p.z) <= active.band + 3))) return;   // underground: only inside an open cut
      const half = fl.sp.car / 2;
      const py = fl.sp.pickY ?? 2.2;   // how far above a slot's position its car's body is (the kitchen's toy cars are small)
      tmpA.copy(p).addScaledVector(sl.dir, half).y += py; tmpB.copy(p).addScaledVector(sl.dir, -half).y += py;
      tmpA.project(camera); tmpB.project(camera);
      if (tmpA.z > 1 && tmpB.z > 1) return;
      const ax = (tmpA.x + 1) / 2 * w, ay = (1 - tmpA.y) / 2 * h, bx_ = (tmpB.x + 1) / 2 * w, by = (1 - tmpB.y) / 2 * h;
      const ex = bx_ - ax, ey = by - ay, L2 = ex * ex + ey * ey, u = L2 ? Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / L2)) : 0;
      const d = Math.hypot(x - ax - ex * u, y - ay - ey * u), tol = Math.max(14, f * 1.7 / camera.position.distanceTo(p));
      if (d < tol && (!best || d / tol < best.r)) best = { kind, i, r: d / tol };
    });
    return best && { kind: best.kind, i: best.i };
  }
  function board(h) {
    const fl = fleets[h.kind], sl = fl && fl.slots[h.i]; if (!sl) return null;
    const key = h.kind + ':' + sl.line;
    if (!interiors[key]) interiors[key] = buildInterior(h.kind, sl.line, sl.run, sl.lineName, sl.color);
    if (!rideEnv) rideEnv = buildRideTunnel();
    if (ride) { ride.int.group.visible = false; if (ride.sl.onBoard) ride.sl.onBoard(false); }
    if (sl.onBoard) sl.onBoard(true);
    const int = interiors[key];
    // a fleet may shrink its cabin (the kitchen's toy monorails, sp.scale) and dress its passenger (sp.dress)
    if (fl.sp.scale) int.group.scale.setScalar(fl.sp.scale);
    if (fl.sp.dress && int.person && !int.dressed) { fl.sp.dress(int.person); int.dressed = true; }
    ride = { sl, kind: h.kind, int, eye: int.spawn.clone(), yaw: 0, pitch: -.04, mf: 0, ms: 0, q: new THREE.Quaternion(), first: true, next: null, tNext: 0 };
    int.group.visible = true; rideEnv.visible = true;
    return getRide();
  }
  function leave() {
    if (!ride) return null;
    const out = { p: ride.sl.pos.clone(), dir: ride.sl.dir.clone() };
    if (ride.sl.onBoard) ride.sl.onBoard(false);
    ride.int.group.visible = false; rideEnv.visible = false; ride = null;
    return out;
  }
  function getRide() {
    if (!ride) return null;
    const l = LINES[ride.sl.line];
    return { line: ride.sl.line, lineName: ride.sl.lineName || (l && l.name) || ride.sl.line, kind: ride.kind, model: CAR_IN[ride.kind].model, next: ride.next, under: (ride.sl.h ?? ride.sl.pos.y) < -1 };
  }
  /**
   * Where the ride is along its line, for the line diagram: { name, color, x, z, dx, dz,
   * stops: [{t, f}] | null, f (0..1 along the line), dir (1 out, -1 back), loop, next }.
   * Runs are out-and-back loops (A -> B -> A): stops come from the outbound half.
   */
  const _a = new V3(), _b = new V3();
  function rideStrip() {
    if (!ride) return null;
    const sl = ride.sl, l = LINES[sl.line], run = sl.run || sl.path;
    const out = { name: sl.lineName || (l && l.name) || sl.line, color: sl.color || (l && l.color) || '#8a96a0',
      x: sl.pos.x, z: sl.pos.z, dx: sl.dir.x, dz: sl.dir.z, stops: null, f: null, dir: 1, loop: true, next: ride.next };
    if (!run || !run.L || typeof sl.s !== 'number' || !run.at) return out;
    if (!run.strip) {
      if (sl.run && !run.stops) run.stops = stopsOn(run, sl.line, ride.kind);
      // every run goes out to one terminus and back (some Regional Rail lines take other tracks
      // on the way back). A run needn't start at a terminus: the farthest point from anywhere
      // on it is one terminus (B), the farthest from B the other (A); A -> B is the way out.
      const far = from => { run.at(from, _a); let best = 0, at = 0; for (let k = 0; k < 400; k++) { const s = run.L * k / 400, d = run.at(s, _b).distanceTo(_a); if (d > best) { best = d; at = s; } } return [at, best]; };
      const [sB] = far(0), [sA, len] = far(sB), out_ = ((sB - sA) % run.L + run.L) % run.L;
      const u = s => ((s - sA) % run.L + run.L) % run.L;   // distance along the run from A
      const back = len > 300 && out_ > 1 && out_ < run.L - 1, seen = new Set(), stops = [];
      const fold = s => (back ? (u(s) <= out_ ? u(s) / out_ : (run.L - u(s)) / (run.L - out_)) : s / run.L);
      // a stop matched on the way back folds onto the way out
      for (const o of run.stops || []) { if (seen.has(o.t)) continue; seen.add(o.t); stops.push({ t: o.t, f: Math.min(1, fold(o.s)) }); }
      stops.sort((p, q) => p.f - q.f);
      run.strip = { back, out: out_, fold, u, stops };
    }
    const st = run.strip, s = ((sl.s % run.L) + run.L) % run.L, outb = !st.back || st.u(s) <= st.out;
    return Object.assign(out, { stops: st.stops, loop: !st.back, dir: outb ? 1 : -1, f: st.fold(s) });
  }
  const look_ = (dx, dy) => { if (!ride) return; ride.yaw -= dx * .0045; ride.pitch = Math.max(-1.2, Math.min(1.2, ride.pitch - dy * .0045)); };
  const move = (f, s) => { if (ride) { ride.mf = f; ride.ms = s; } };
  function rideFrame(dt, camera) {
    const r = ride, g = r.int.group;
    g.position.copy(r.sl.pos);
    if (r.first) g.quaternion.copy(r.q); else g.quaternion.slerp(r.q, 1 - Math.exp(-dt * 8));
    g.updateMatrixWorld(true);
    if (r.mf || r.ms) {
      const sp = 1.6 * dt, cy = Math.cos(r.yaw), sy = Math.sin(r.yaw);
      r.eye.x += (sy * r.mf - cy * r.ms) * sp; r.eye.z += (cy * r.mf + sy * r.ms) * sp;
    }
    r.int.clampEye(r.eye);
    camera.position.copy(r.eye).applyMatrix4(g.matrixWorld);
    const cp = Math.cos(r.pitch);
    look.set(r.eye.x + Math.sin(r.yaw) * cp, r.eye.y + Math.sin(r.pitch), r.eye.z + Math.cos(r.yaw) * cp).applyMatrix4(g.matrixWorld);
    camera.up.set(0, 1, 0); camera.lookAt(look);
    if (r.int.person) wave(r.int.person, dt, camera);
    // next-stop sign
    r.tNext -= dt;
    if (r.first || r.tNext <= 0) {
      r.tNext = .5; const run = r.sl.run;
      if (!run) { if (r.first) r.int.setLED(`${r.sl.lineName || r.sl.line}  ·  ${CAR_IN[r.kind].model}`); r.first = false; return; }
      if (!run.stops) run.stops = stopsOn(run, r.sl.line, r.kind);
      const s = ((r.sl.s % run.L) + run.L) % run.L, nx = run.stops.find(o => o.s > s + 15) || run.stops[0];
      const next = nx ? nx.t : null;
      if (r.first || next !== r.next) { r.next = next; r.int.setLED(`${r.sl.led || r.sl.line}  ·  ${next ? 'Next stop: ' + next : CAR_IN[r.kind].model}`); }
    }
    r.first = false;
  }

  // --- trains: instanced per kind; every car is one instance of each part
  const fleets = {};
  for (const kind of Object.keys(SPEC)) {
    const sp = SPEC[kind], slots = [];
    data.runs.forEach((r, ri) => {
      const line = LINES[r.line]; if (line.kind !== kind) return;
      const run = runner(pts3(r.p, r.g)); if (run.L < 300) return;
      const nT = Math.max(1, Math.round(run.L / (sp.km * 1000))), s0 = (ri * 977) % run.L;
      for (let k = 0; k < nT; k++) for (let c = 0; c < sp.cars; c++) slots.push({ run, k, c, s: s0 + k * run.L / nT - c * (sp.car + .9), line: r.line, pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1) });
    });
    if (!slots.length) continue;
    const stripe = data.lines.find(l => l.kind === kind).color;
    const win = noClip(new THREE.MeshStandardMaterial({ color: '#1e2c3a', roughness: .25, metalness: .3, emissive: '#ffe6b8', emissiveIntensity: .8 }));
    win.userData.lit = .8; litMats.push(win);
    const geo = (w, h, l, y) => { const g = new THREE.BoxGeometry(w, h, l); g.translate(0, y, 0); return g; };
    const parts = [
      [geo(sp.w, sp.ch, sp.car, .9 + sp.ch / 2), mat(sp.body, { roughness: .45, metalness: .35, side: THREE.FrontSide })],
      [geo(sp.w + .04, .4, sp.car - .3, 1.45), mat(stripe, { roughness: .5, side: THREE.FrontSide })],
      [geo(sp.w + .06, 1.0, sp.car - 1.8, .9 + sp.ch * .62), win],
      [geo(sp.w * .72, .8, sp.car * .82, .45), mat('#2b2b2b', { side: THREE.FrontSide })],
    ].map(([g, m]) => { const im = new THREE.InstancedMesh(g, m, slots.length); im.frustumCulled = false; scene.add(im); return im; });
    fleets[kind] = { sp, slots, parts };
  }
  const p = new THREE.Vector3(), q = new THREE.Vector3(), dummy = new THREE.Object3D();
  function update(dt, camera) {
    for (const { sp, slots, parts, external } of Object.values(fleets)) {
      if (external) {   // positioned by their own module (the monorails): just follow them
        slots.forEach(sl => sl.sync());
        if (ride && slots.includes(ride.sl)) ride.q.copy(ride.sl.q);
        continue;
      }
      slots.forEach((sl, i) => {
        sl.s += sp.speed * dt;
        // the car body sits on its two bogies, so it follows curves smoothly
        // (bogies are clamped to the run, so a car never straddles the loop's wrap-around)
        const L = sl.run.L, sm = ((sl.s % L) + L) % L, o = sp.car * .35;
        sl.run.at(Math.min(sm + o, L - .01), p); sl.run.at(Math.max(sm - o, 0), q);
        sl.pos.addVectors(p, q).multiplyScalar(.5); sl.h = (p.h + q.h) / 2; sl.dir.subVectors(p, q);
        if (sl.dir.lengthSq() < 1e-6) sl.dir.set(0, 0, 1); sl.dir.normalize();
        dummy.position.copy(sl.pos); dummy.lookAt(sl.pos.x + sl.dir.x, sl.pos.y + sl.dir.y, sl.pos.z + sl.dir.z);
        // street-running cars on the removed side of a cut would float in mid-air: hide them
        sl.hidden = !!(active && sl.h > -1 && active.O(sl.pos.x, sl.pos.z) < 0);
        const mine = ride && ride.sl === sl; if (mine) ride.q.copy(dummy.quaternion);
        dummy.scale.setScalar(sl.hidden || mine ? 0 : 1); dummy.updateMatrix();
        parts.forEach(m => m.setMatrixAt(i, dummy.matrix));
      });
      parts.forEach(m => { m.instanceMatrix.needsUpdate = true; });
    }
    if (ride && camera) rideFrame(dt, camera);
    // deep track shows through an open cut, or to a camera that is itself below the street
    if (camera) deepTrack.visible = !!active || camera.position.y < surface(camera.position.x, camera.position.z) + 1;
  }

  // "Ride a line": board the lead car of the line's first train (same as clicking it)
  function boardLine(id) {
    for (const [kind, fl] of Object.entries(fleets)) {
      if (!CAR_IN[kind]) continue;
      const i = fl.slots.findIndex(sl => sl.line === id && (sl.k || 0) === 0 && (sl.c || 0) === 0);
      if (i >= 0) return board({ kind, i });
    }
    return null;
  }
  /** add cars positioned by another module (the monorails): slots {line, lineName, color, pos, dir, q, sync(), onBoard(on)},
   *  optionally run {L, at(s, out), stops: [{s, t}], strip} and s (distance along it) for the next-stop sign and line diagram.
   *  sp: {car (length, world units), scale? (the cabin's, for cars smaller than life), dress?(person) (passenger's clothes)} */
  function registerFleet(kind, sp, slots) { fleets[kind] = { sp, slots, parts: [], external: true }; }
  /** every line's route (its out-and-back loop), for the highlight overlay */
  const routes = data.runs.map(r => ({ id: r.line, color: (LINES[r.line] || {}).color || '#ffffff', kind: (LINES[r.line] || {}).kind, P: pts3(r.p, r.g) }));
  update(0);

  return { planes: [plane], setCut, getCut: () => (active ? active.id : false), update, labels, views: sections.map(s => s.view),
           pick, board, leave, getRide, rideStrip, look: look_, move,
           boardLine, registerFleet, routes, lines: data.lines };
}
