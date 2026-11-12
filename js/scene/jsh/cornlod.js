// Real corn plants in Jersey Shore's corn fields, near the camera (level of detail).
//
// A field holds millions of plants, so they are only made where you can tell them apart: within
// FAR metres of the camera (fewer as it rises, none once it is about 95 m above the ground), and
// only in the view. Within NEAR they are the full plants of the seed-corn block (detassel.js:
// stalk, seven leaves, an ear and, in season, a tassel); further out a cheap plant with three
// leaves and no shadow. Beyond that the canopy slab of farms.js stands as before; it has a hole
// (CORN_HOLE, colour and shadow) exactly where the plants are.
//
// Plants sit on each field's own rows (0.76 m apart, a plant every 0.3 m, across the field's
// row direction), made a 16 m square at a time the first time a square is needed and kept (the
// last CACHE squares). Every frame the camera has moved, the plants in range are copied into
// two instanced meshes, each plant scaled to its field's planting group's height and coloured
// by its stage (farms.js stage()), so they grow, turn and are harvested with the slab.
import * as THREE from 'three';
import { pairs } from '../../data.js';
import { groundAt } from '../terrain.js';
import { onSeason } from '../season.js';
import { stage, CORN_HOLE } from './farms.js';
import { plantGeometry, tasselGeometry } from './detassel.js';

const CHUNK = 16, ROW = .76, STEP = .3, NEAR = 30, FAR = 90, CACHE = 500;
const NEAR_MAX = 12000, MID_MAX = 36000, BUDGET = 3;   // instances; ms a frame for making new squares
const THIN = 50;   // past this, every other cheap plant
const MOVE = 2, TURN = .998, MARGIN = 12;   // rebuild after moving 2 m or turning ~3.6 deg; squares this far outside the view are filled too

/** the cheap plant: a flat stalk and three leaves (4 triangles), unit height */
function midGeometry() {
  const pos = [-.015, 0, 0, .015, 0, 0, 0, 1, 0], idx = [0, 1, 2];
  for (let k = 0; k < 3; k++) {
    const y = .3 + k * .2, s = k % 2 ? 1 : -1, o = pos.length / 3;
    pos.push(0, y, -.09, 0, y, .09, s * .5, y + .06, 0); idx.push(o, o + 2, o + 1);   // one blade
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** seed: the seed-corn block (detassel.js draws its plants), left out here with its 8 m headlands.
 *  late: the field still standing while a combine takes it off (harvest.js): its own stage(day),
 *  cut(x, z) for what the combine has taken, and rev, which changes as the cut moves on. */
export function buildCornLOD(scene, fields, seed = null, late = null) {
  // the corn fields: outline, row direction, planting group (as farms.js groups them; 3: the late field), bounds
  const corn = fields.map((f, i) => [f, i]).filter(([f]) => f.k === 'corn').map(([f, i]) => {
    const rings = f.p.map(pairs), xs = rings[0].map(p => p[0]), zs = rings[0].map(p => p[1]);
    return { rings, a: f.a, c: late && i === late.index ? 3 : Math.min(2, Math.floor(f.s * 3)), x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
  });
  const inRings = (x, z, rings) => { let c = false; for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
  const hash = (a, b) => { let h = Math.imul(a, 374761393) + Math.imul(b, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

  const skip = seed ? (() => {
    const ux = Math.cos(seed.a), uz = Math.sin(seed.a), hu = seed.len / 2 + 8, hv = seed.sets * 5 * seed.row / 2 + 1.2;
    return (x, z) => { const dx = x - seed.x, dz = z - seed.z; return Math.abs(dx * ux + dz * uz) < hu && Math.abs(-dx * uz + dz * ux) < hv; };
  })() : () => false;
  // which fields reach into each square
  const reach = new Map();
  corn.forEach((F, fi) => {
    for (let i = Math.floor(F.x0 / CHUNK); i <= Math.floor(F.x1 / CHUNK); i++)
      for (let j = Math.floor(F.z0 / CHUNK); j <= Math.floor(F.z1 / CHUNK); j++) { const k = i + ',' + j; (reach.get(k) || reach.set(k, []).get(k)).push(fi); }
  });
  // a square's plants: [x, y, z, cos(rotation) * size, sin(rotation) * size, size, planting group] each
  const cache = new Map();
  function makeChunk(i, j) {
    const out = [], X0 = i * CHUNK, Z0 = j * CHUNK;
    for (const fi of reach.get(i + ',' + j) || []) {
      const F = corn[fi], ux = Math.cos(F.a), uz = Math.sin(F.a), vx = -uz, vz = ux;
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (const [x, z] of [[X0, Z0], [X0 + CHUNK, Z0], [X0, Z0 + CHUNK], [X0 + CHUNK, Z0 + CHUNK]]) {
        const u = x * ux + z * uz, v = x * vx + z * vz; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
      }
      for (let r = Math.ceil(v0 / ROW); r <= Math.floor(v1 / ROW); r++) for (let m = Math.ceil(u0 / STEP); m <= Math.floor(u1 / STEP); m++) {
        const h1 = hash(r, m), h2 = hash(m + 7, r - 3), u = m * STEP + (h1 - .5) * .08, v = r * ROW + (h2 - .5) * .06;
        const x = u * ux + v * vx, z = u * uz + v * vz;
        if (x < X0 || x >= X0 + CHUNK || z < Z0 || z >= Z0 + CHUNK || skip(x, z) || !inRings(x, z, F.rings)) continue;
        const ry = F.a + Math.PI / 2 + (h1 - .5) * .9, j = .92 + h2 * .14;
        out.push(x, groundAt(x, z), z, Math.cos(ry) * j, Math.sin(ry) * j, j, F.c);
      }
    }
    return new Float32Array(out);
  }
  function chunk(i, j, allowMake) {
    const k = i + ',' + j; let c = cache.get(k);
    if (c) { cache.delete(k); cache.set(k, c); return c; }   // most recently used last
    if (!allowMake) return null;
    c = makeChunk(i, j); cache.set(k, c);
    if (cache.size > CACHE) cache.delete(cache.keys().next().value);
    return c;
  }

  // ---- meshes: full plants near, cheap ones further, tassels on the near ones
  const leafMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .9, side: THREE.DoubleSide });
  const midMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .95, side: THREE.DoubleSide });
  const tasMat = new THREE.MeshStandardMaterial({ color: '#d2b866', roughness: .9, side: THREE.DoubleSide });
  const mk = (geo, mat, n, shadow) => {
    const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.castShadow = shadow; m.receiveShadow = true; m.userData.grounded = true;
    scene.add(m); return m;
  };
  const near = mk(plantGeometry(true), leafMat, NEAR_MAX, true), mid = mk(midGeometry(), midMat, MID_MAX, false), tas = mk(tasselGeometry(), tasMat, NEAR_MAX, true);
  near.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NEAR_MAX * 3), 3).setUsage(THREE.DynamicDrawUsage);
  mid.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MID_MAX * 3), 3).setUsage(THREE.DynamicDrawUsage);

  // ---- the season: each planting group's height and colour, and whether the tassels are out
  const H = [0, 0, 0, 0], COL = [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()];
  let tassels = false, dirty = true, lateRev = -1;
  onSeason(st => {
    for (let c = 0; c < 4; c++) {
      if (c === 3 && !late) break;
      const s = c === 3 ? late.stage(st.day) : stage('corn', st.day, c * 8); H[c] = s.canopy > .05 ? s.canopy : 0; if (s.top) COL[c].copy(s.top);
    }
    tassels = st.day >= 185; tasMat.color.set(st.day > 225 ? '#9c8358' : '#d2b866');
    dirty = true;
  });

  // ---- each frame: what is in range, copied into the instance buffers when the view has changed
  const frustum = new THREE.Frustum(), pm = new THREE.Matrix4(), box = new THREE.Box3(), lastPos = new THREE.Vector3(1e9, 0, 0), lastDir = new THREE.Vector3(), dir = new THREE.Vector3();
  let pending = false, nN = 0, nM = 0, lastD = -1;
  function update(camera) {
    const cp = camera.position, above = cp.y - groundAt(cp.x, cp.z);
    const D = Math.max(0, Math.min(FAR, FAR * (1 - (above - 15) / 80))), DN = Math.min(NEAR, D);
    camera.getWorldDirection(dir);
    // the combine has moved on: the plants it took go, if any of that field's are in range
    if (late && late.rev !== lateRev) { lateRev = late.rev; if (D > 0 && cp.x > late.x0 - D && cp.x < late.x1 + D && cp.z > late.z0 - D && cp.z < late.z1 + D) dirty = true; }
    if (!dirty && !pending && cp.distanceToSquared(lastPos) < MOVE * MOVE && dir.dot(lastDir) > TURN && Math.abs(D - lastD) < 3) return;
    // the hole goes where the plants are made, so the two always match between rebuilds
    lastPos.copy(cp); lastDir.copy(dir); lastD = D; dirty = false; pending = false;
    CORN_HOLE.value.set(cp.x, cp.z, D);
    nN = nM = 0;
    if (D > 0) {
      camera.updateMatrixWorld();   // it may have moved since the last render
      pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pm);
      // plants reach a few metres past the hole, so they hide the slab's cut edge
      const t0 = performance.now(), D2 = (D + 4) ** 2, N2 = DN * DN, T2 = THIN * THIN;
      const nm = near.instanceMatrix.array, mm = mid.instanceMatrix.array, tm = tas.instanceMatrix.array, nc = near.instanceColor.array, mc = mid.instanceColor.array;
      // squares nearest first, so the budget for making new ones goes to what is closest
      const list = [];
      for (let i = Math.floor((cp.x - D - 4) / CHUNK); i <= Math.floor((cp.x + D + 4) / CHUNK); i++) for (let j = Math.floor((cp.z - D - 4) / CHUNK); j <= Math.floor((cp.z + D + 4) / CHUNK); j++) {
        if (!reach.has(i + ',' + j)) continue;
        const dx = Math.max(i * CHUNK - cp.x, 0, cp.x - (i + 1) * CHUNK), dz = Math.max(j * CHUNK - cp.z, 0, cp.z - (j + 1) * CHUNK);
        if (dx * dx + dz * dz < D2) list.push([dx * dx + dz * dz, i, j]);
      }
      list.sort((a, b) => a[0] - b[0]);
      for (const [, i, j] of list) {
        const gy = groundAt((i + .5) * CHUNK, (j + .5) * CHUNK);
        box.min.set(i * CHUNK - MARGIN, gy - 2, j * CHUNK - MARGIN); box.max.set((i + 1) * CHUNK + MARGIN, gy + 5, (j + 1) * CHUNK + MARGIN);
        if (!frustum.intersectsBox(box)) continue;
        const c = chunk(i, j, performance.now() - t0 < BUDGET);
        if (!c) { pending = true; continue; }   // made on a later frame
        // the square's farthest corner: wholly inside the radius means no test per plant
        const fx = Math.max(Math.abs(i * CHUNK - cp.x), Math.abs((i + 1) * CHUNK - cp.x)), fz = Math.max(Math.abs(j * CHUNK - cp.z), Math.abs((j + 1) * CHUNK - cp.z)), inside = fx * fx + fz * fz < D2;
        for (let p = 0, q = 0; p < c.length; p += 7, q++) {
          const g = c[p + 6], h = H[g]; if (!h) continue;
          const x = c[p], z = c[p + 2], d2 = (x - cp.x) ** 2 + (z - cp.z) ** 2;
          if ((!inside && d2 >= D2) || (d2 > T2 && q & 1) || (g === 3 && late.cut(x, z))) continue;
          const y = c[p + 1], cs = c[p + 3], sn = c[p + 4], j_ = c[p + 5], col = COL[g];
          const isNear = d2 < N2 && nN < NEAR_MAX;
          if (!isNear && nM >= MID_MAX) continue;
          const A = isNear ? nm : mm, o = (isNear ? nN : nM) * 16;
          A[o] = cs; A[o + 1] = 0; A[o + 2] = -sn; A[o + 3] = 0; A[o + 4] = 0; A[o + 5] = h * j_; A[o + 6] = 0; A[o + 7] = 0;
          A[o + 8] = sn; A[o + 9] = 0; A[o + 10] = cs; A[o + 11] = 0; A[o + 12] = x; A[o + 13] = y; A[o + 14] = z; A[o + 15] = 1;
          const k = (isNear ? nN : nM) * 3, C = isNear ? nc : mc, shade = .9 + (j_ - .92) * .7;
          C[k] = col.r * shade; C[k + 1] = col.g * shade; C[k + 2] = col.b * shade;
          if (isNear) {
            const ts = tassels && h > 2 ? .9 + j_ * .3 : 0, tc = cs / j_ * ts, tsn = sn / j_ * ts;
            tm[o] = tc; tm[o + 1] = 0; tm[o + 2] = -tsn; tm[o + 3] = 0; tm[o + 4] = 0; tm[o + 5] = ts; tm[o + 6] = 0; tm[o + 7] = 0;
            tm[o + 8] = tsn; tm[o + 9] = 0; tm[o + 10] = tc; tm[o + 11] = 0; tm[o + 12] = x; tm[o + 13] = y + h * j_ - .05; tm[o + 14] = z; tm[o + 15] = 1;
            nN++;
          } else nM++;
        }
      }
    }
    // only the part of each buffer in use goes to the GPU
    near.count = tas.count = nN; mid.count = nM;
    for (const [m, n] of [[near, nN], [tas, nN], [mid, nM]]) {
      m.instanceMatrix.updateRange.count = n * 16; m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor && m !== tas) { m.instanceColor.updateRange.count = n * 3; m.instanceColor.needsUpdate = true; }
    }
  }
  const stats = () => ({ near: nN, mid: nM, squares: cache.size, hole: CORN_HOLE.value.z });
  return { update, stats };
}
