// PROPOSAL: Walnut Street from 22nd Street to Front Street as a car-free European shopping
// street. The asphalt goes (drawLines skips every road piece that lies on WALNUT) and the street
// is paved wall to wall in herringbone brick with two granite gutters, then furnished: lamp posts,
// benches, planted trees, cafe tables with umbrellas, and an awning and a lit shop window for each
// storefront bay on the facades that face the street. The 1953 streetcar track still runs down
// the middle, so the centre stays clear.
import * as THREE from 'three';
import { litMats } from '../materials.js';
import { terrain, surface, drape } from '../terrain.js';

/** Walnut Street centreline, 22nd St -> Front St (metres; the OSM road vertices). */
export const WALNUT = [[-112.4, 556.4], [-44.7, 567], [21.6, 578.5], [179, 603.7], [201.6, 607.8], [277.8, 619.7], [320.6, 626.8],
  [454.5, 647.8], [613.1, 673.9], [717.7, 690.4], [790.5, 702.9], [996.3, 736.5], [1008.5, 739.2], [1184.8, 767.3], [1589.1, 833.1],
  [1723.5, 854.9], [1856.9, 876.1], [1949.1, 890.9], [1981.8, 896.4], [1992, 897.6], [2049.4, 906.9], [2126.3, 918.9], [2138.2, 920.1],
  [2261.5, 939.4], [2397.6, 960.8], [2531.7, 984.7], [2619.1, 999.4], [2697.6, 1013.7], [2834.4, 1038.8]];
const HALF = 9;          // paving half-width: OSM puts the facades 7-9 m either side of the centreline
const PAVE_Y = .86;      // above the streets (.8), below the trolley track bed (1.0)
const CLEAR = 3.2;       // the middle stays clear for the streetcar track
const KERB = 4.4;        // lamps, benches and planters stand on this line, each side

// ---- the polyline: arc length, nearest point, point at (s, offset)
const SEG = [];
{ let s = 0; for (let i = 0; i < WALNUT.length - 1; i++) {
  const [ax, az] = WALNUT[i], [bx, bz] = WALNUT[i + 1], L = Math.hypot(bx - ax, bz - az);
  SEG.push({ ax, az, tx: (bx - ax) / L, tz: (bz - az) / L, L, s }); s += L;
} }
export const WALNUT_LENGTH = SEG.reduce((s, g) => s + g.L, 0);
const BOX = [Math.min(...WALNUT.map(p => p[0])) - 20, Math.min(...WALNUT.map(p => p[1])) - 20, Math.max(...WALNUT.map(p => p[0])) + 20, Math.max(...WALNUT.map(p => p[1])) + 20];
const inBox = (x, z) => x > BOX[0] && x < BOX[2] && z > BOX[1] && z < BOX[3];

/** nearest point on the street: s along it, o signed offset (+ = left of travel towards Front St), t tangent */
function project(x, z) {
  let best = null;
  for (const g of SEG) {
    const s = Math.max(0, Math.min(g.L, (x - g.ax) * g.tx + (z - g.az) * g.tz));
    const px = g.ax + g.tx * s, pz = g.az + g.tz * s, d = Math.hypot(x - px, z - pz);
    if (!best || d < best.d) best = { d, s: g.s + s, o: -(x - g.ax) * g.tz + (z - g.az) * g.tx, tx: g.tx, tz: g.tz };
  }
  return best;
}
/** world point at arc length s, offset o; plus the tangent there */
function at(s, o = 0) {
  let g = SEG[SEG.length - 1];
  for (const q of SEG) if (s <= q.s + q.L) { g = q; break; }
  const l = s - g.s;
  return { x: g.ax + g.tx * l - g.tz * o, z: g.az + g.tz * l + g.tx * o, tx: g.tx, tz: g.tz };
}

/** is (x, z) on the paved promenade (between the facades, 22nd to Front)? */
export function onWalnut(x, z) {
  if (!inBox(x, z)) return false;
  const p = project(x, z); return p.d < HALF && p.s > 0 && p.s < WALNUT_LENGTH;
}

/** true if every vertex of this street piece lies on Walnut: drawLines leaves it out */
export function onPromenade(pts) {
  for (const [x, z] of pts) if (!inBox(x, z) || project(x, z).d > 1.5) return false;
  return true;
}

// ---- herringbone brick: 20 x 10 cm pavers, 90-degree herringbone, aligned with the street
const TEX_M = 1.6;   // metres per texture repeat (16 brick-widths)
function brickTexture() {
  const N = 512, u = N / 16, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d');
  g.fillStyle = '#b4a593'; g.fillRect(0, 0, N, N);   // mortar / sand joints
  const pal = ['#9a4a35', '#a85a40', '#8a4433', '#b2664a', '#7e3f30', '#a0533c', '#b87558', '#6e3a2e'];
  const hash = (a, b) => { let h = Math.imul(a * 73856093 ^ b * 19349663, 2654435761) >>> 0; h ^= h >>> 13; return (Math.imul(h, 1274126177) >>> 0) / 4294967296; };
  const brick = (x, y, w, h) => {
    const k = hash(((x % 16) + 16) % 16, ((y % 16) + 16) % 16);   // periodic colours so the texture tiles
    g.fillStyle = pal[Math.floor(k * pal.length)];
    for (const ox of [-16, 0, 16]) for (const oy of [-16, 0, 16]) g.fillRect((x + ox) * u + 1.5, (y + oy) * u + 1.5, w * u - 3, h * u - 3);
  };
  // H_i spans [i, i+2] x [i, i+1], V_i spans [i, i+1] x [i+1, i+3]; the staircase repeats every 4 along x
  for (let i = -4; i < 20; i++) for (let j = -6; j < 6; j++) { brick(i + 4 * j, i, 2, 1); brick(i + 4 * j, i + 1, 1, 2); }
  // a little grime so the repeat doesn't read from above
  const img = g.getImageData(0, 0, N, N), d = img.data;
  for (let p = 0; p < d.length; p += 4) { const n = (Math.random() - .5) * 18; d[p] += n; d[p + 1] += n; d[p + 2] += n; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16;
  return t;
}

/** flat strip between offsets o0 and o1 along the whole street, UVs from world position (texture runs along the street) */
function strip(o0, o1, y, uvScale) {
  const pos = [], uv = [], idx = [];
  const a = Math.atan2(SEG[0].tz + SEG[SEG.length - 1].tz, SEG[0].tx + SEG[SEG.length - 1].tx), ca = Math.cos(a), sa = Math.sin(a);
  for (let i = 0; i < WALNUT.length; i++) {
    // mitred joint: average the neighbouring segments' normals
    const p = SEG[Math.max(0, i - 1)], q = SEG[Math.min(SEG.length - 1, i)];
    let nx = -(p.tz + q.tz), nz = p.tx + q.tx; const nl = Math.hypot(nx, nz); nx /= nl; nz /= nl;
    const k = 1 / Math.max(.5, nx * -q.tz + nz * q.tx);
    for (const o of [o0, o1]) {
      const x = WALNUT[i][0] + nx * o * k, z = WALNUT[i][1] + nz * o * k;
      pos.push(x, y, z); uv.push((x * ca + z * sa) / uvScale, (-x * sa + z * ca) / uvScale);
    }
    if (i) { const v = (i - 1) * 2; idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  // (the winding faces up, as in addRibbon: right edge first, then left)
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

/**
 * buildings: data.buildings (Center City footprints); cityB: decoded city boxes (east of the core);
 * roads: line lists whose crossing streets keep the furniture back; trees: flat dm street trees.
 */
export function buildPromenade(scene, { buildings, cityB, roads, trees }) {
  const group = new THREE.Group(); group.name = 'walnut-promenade'; scene.add(group);
  const std = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: .85 }, o));

  // ---- paving
  const brickMat = std('#ffffff', { map: brickTexture(), roughness: .95 });
  const pave = new THREE.Mesh(strip(-HALF, HALF, PAVE_Y, TEX_M), brickMat); pave.receiveShadow = true; group.add(pave);
  const granite = std('#8e8b84', { roughness: .8 });
  for (const [o0, o1] of [[-CLEAR - .7, -CLEAR - .1], [CLEAR + .1, CLEAR + .7]]) { const m = new THREE.Mesh(strip(o0, o1, PAVE_Y + .02, 1), granite); m.receiveShadow = true; group.add(m); }

  // ---- what to keep clear of: cross streets and the existing street trees
  const cross = [];
  for (const lines of roads) for (const l of lines) {
    if (l.k !== 0 || l.b) continue;
    const p = l.p; let near = false;
    for (let j = 0; j < p.length; j += 2) if (inBox(p[j] / 10, p[j + 1] / 10)) { near = true; break; }
    if (!near) continue;
    const pts = []; for (let j = 0; j < p.length; j += 2) pts.push([p[j] / 10, p[j + 1] / 10]);
    if (onPromenade(pts)) continue;
    for (let j = 0; j < pts.length - 1; j++) cross.push([...pts[j], ...pts[j + 1], l.w / 2]);
  }
  const segDist = (x, z, [ax, az, bx, bz]) => { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz; const t = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)) : 0; return Math.hypot(x - ax - dx * t, z - az - dz * t); };
  const inCross = (x, z, pad) => cross.some(c => segDist(x, z, c) < c[4] + pad);
  const treePts = []; for (let i = 0; i < trees.length; i += 2) { const x = trees[i] / 10, z = trees[i + 1] / 10; if (inBox(x, z)) treePts.push([x, z]); }
  const nearTree = (x, z, r) => treePts.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < r);

  // ---- instanced furniture: each kind collects matrices (and colours) first
  const kinds = new Map();
  const put = (name, x, y, z, ry, sx = 1, sy = 1, sz = 1, color) => {
    let k = kinds.get(name); if (!k) kinds.set(name, k = { m: [], c: [] });
    const o = new THREE.Object3D(); o.position.set(x, y, z); o.rotation.y = ry; o.scale.set(sx, sy, sz); o.updateMatrix();
    k.m.push(o.matrix.clone()); k.c.push(color);
  };
  const yaw = (tx, tz) => Math.atan2(tx, tz);   // rotation that turns local +z to (tx, tz)

  // lamps, benches and planter trees along both kerb lines; a 24 m rhythm
  const kerbPts = [];
  const seats = [];   // every chair and bench: {x, z, ry (the way the sitter faces: local +z), kind, ax, az (where to walk up from)}
  const doors = [];   // a door per shop: {x, z (on the facade), nx, nz (outward)}
  const obst = [];    // things on the paving to walk around: [x, z, radius]
  treePts.forEach(([x, z]) => obst.push([x, z, .7]));
  for (let s0 = 6; s0 < WALNUT_LENGTH - 4; s0 += 24) {
    for (const sd of [-1, 1]) {
      const items = [[0, 'lamp'], [7, 'bench'], [12, 'planter'], [17, 'bench']];
      for (const [ds, what] of items) {
        const s = s0 + ds; if (s > WALNUT_LENGTH - 4) continue;
        const p = at(s, sd * KERB);
        if (inCross(p.x, p.z, 2.5) || nearTree(p.x, p.z, 2)) continue;
        const ry = yaw(p.tx, p.tz); kerbPts.push([p.x, p.z]); obst.push([p.x, p.z, what === 'lamp' ? .3 : what === 'bench' ? 1 : .95]);
        if (what === 'lamp') { put('pole', p.x, PAVE_Y, p.z, ry); put('lantern', p.x, PAVE_Y, p.z, ry); put('cap', p.x, PAVE_Y, p.z, ry); }
        else if (what === 'bench') {   // faces the middle of the street; people walk up to it from the front
          const r = ry + (sd > 0 ? Math.PI / 2 : -Math.PI / 2); put('bench', p.x, PAVE_Y, p.z, r);
          seats.push({ x: p.x, z: p.z, ry: r, kind: 'bench', ax: p.x + Math.sin(r) * .8, az: p.z + Math.cos(r) * .8 });
        }
        else { put('planter', p.x, PAVE_Y, p.z, ry); put('trunk', p.x, PAVE_Y, p.z, 0); put('crown', p.x, PAVE_Y, p.z, s, 1, 1, 1, new THREE.Color(['#5d8c4c', '#4f7d45', '#6b9a4e'][Math.floor(s) % 3])); }
      }
    }
  }
  // bollards across both ends: no cars in
  for (const s of [1, WALNUT_LENGTH - 1]) for (let o = -HALF + 1; o <= HALF - 1; o += 1.8) { const p = at(s, o); put('bollard', p.x, PAVE_Y, p.z, 0); }

  // ---- storefronts: facades that face the street get an awning and a shop window per bay
  const AWN = ['#2f5d4a', '#8c1c2b', '#1f3a5f', '#c9a227', '#5a2a3a', '#b5502e', '#26323a', '#3d6b6b', '#e8e1d0'];
  const UMB = ['#f1ece0', '#f1ece0', '#c23a2b', '#2f5d4a', '#1f3a5f', '#e0b53a'];
  let bay = 0;
  const facade = (ax, az, bx, bz, cx, cz, h, maxO = 12.5) => {
    const ex = bx - ax, ez = bz - az, L = Math.hypot(ex, ez); if (L < 4 || h < 5) return;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2; if (!inBox(mx, mz)) return;
    const pr = project(mx, mz);
    if (pr.s < 2 || pr.s > WALNUT_LENGTH - 2) return;
    const ao = Math.abs(pr.o); if (ao < 6.2 || ao > maxO) return;   // nearer facades would put the awning over the lamps
    const ux = ex / L, uz = ez / L; if (Math.abs(ux * pr.tx + uz * pr.tz) < .96) return;   // parallel to the street
    let nx = uz, nz = -ux; if (nx * (mx - cx) + nz * (mz - cz) < 0) { nx = -nx; nz = -nz; }   // outward
    const toStreet = -Math.sign(pr.o); if ((nx * -pr.tz + nz * pr.tx) * toStreet < .9) return;   // faces Walnut
    const n = Math.max(1, Math.round(L / 6.5)), bw = L / n, ry = Math.atan2(nx, nz);
    for (let i = 0; i < n; i++, bay++) {
      const f = (i + .5) / n, x = ax + ex * f, z = az + ez * f;
      if (inCross(x + nx * 2, z + nz * 2, 1)) continue;
      const hsh = Math.sin(bay * 12.9898 + x * .1) * 43758.5453, r = hsh - Math.floor(hsh);
      put('window', x + nx * .06, PAVE_Y, z + nz * .06, ry, bw - .9, 1, 1);
      put('awning', x + nx * .02, PAVE_Y, z + nz * .02, ry, bw - .5, 1, 1, new THREE.Color(AWN[Math.floor(r * AWN.length)]));
      // cafe tables in front of about half the shops, where the pavement is wide enough
      const placed = [];
      if (r < .5 && ao > 7.4) {
        const tables = bw > 5 ? [-.24, .24] : [0];
        for (const t of tables) {
          const tx = x + ux * t * bw + nx * 2, tz = z + uz * t * bw + nz * 2;
          if (nearTree(tx, tz, 2) || inCross(tx, tz, 1.5) || kerbPts.some(([kx, kz]) => Math.hypot(kx - tx, kz - tz) < 2.2)) continue;
          // and both chairs clear of the lamps, benches and planters (someone sits in them)
          if ([1, -1].some(sd => kerbPts.some(([kx, kz]) => Math.hypot(kx - tx - ux * .75 * sd, kz - tz - uz * .75 * sd) < 1.8))) continue;
          put('table', tx, PAVE_Y, tz, 0); placed.push(t); obst.push([tx, tz, .5]);
          for (const sd of [1, -1]) {   // one chair either side of the table, facing it
            const cx = tx + ux * .75 * sd, cz = tz + uz * .75 * sd, r = Math.atan2(-ux * sd, -uz * sd);
            // sit down looking past the umbrella pole, half towards the street
            const lx = -ux * sd + nx * 1.2, lz = -uz * sd + nz * 1.2;
            put('chair', cx, PAVE_Y, cz, r); obst.push([cx, cz, .3]);
            seats.push({ x: cx, z: cz, ry: r, kind: 'cafe', yaw0: Math.atan2(lx, lz) - r, ax: cx + ux * sd * .75, az: cz + uz * sd * .75 });   // walk up from the side away from the table
          }
          put('umbrella', tx, PAVE_Y, tz, 0, 1, 1, 1, new THREE.Color(UMB[Math.floor(r * 2 * UMB.length) % UMB.length]));
        }
      }
      // the shop door: in the middle of the bay, or beside a single cafe table
      const dOff = placed.length === 1 ? (bw > 3.4 ? .3 * bw : 0) : 0;
      if (placed.length !== 1 || dOff) {
        const dx = x + ux * dOff, dz = z + uz * dOff;
        put('door', dx + nx * .09, PAVE_Y, dz + nz * .09, ry);   // the frame; the door itself swings open (pedestrians.js)
        doors.push({ x: dx, z: dz, nx, nz, ry });
      }
    }
  };
  // Center City footprints (flat dm rings; the first ring is the outline)
  for (const rec of buildings.b) {
    const ring = rec[2]; let near = false;
    for (let j = 0; j < ring.length; j += 2) if (inBox(ring[j] / 10, ring[j + 1] / 10)) { near = true; break; }
    if (!near) continue;
    const pts = []; for (let j = 0; j < ring.length; j += 2) pts.push([ring[j] / 10, ring[j + 1] / 10]);
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    for (let j = 0; j < pts.length; j++) { const a = pts[j], b = pts[(j + 1) % pts.length]; facade(a[0], a[1], b[0], b[1], cx, cz, rec[0] / 10); }
  }
  // the rest of the city: oriented boxes (see city.js for the instance matrix)
  if (cityB) for (let i = 0; i < cityB.nB; i++) {
    const cx = cityB.bx[i] / 10, cz = cityB.bz[i] / 10; if (!inBox(cx, cz)) continue;
    const a = cityB.br[i] / 65535 * Math.PI, c = Math.cos(a), s = Math.sin(a), w = cityB.bw[i] / 20, d = cityB.bd[i] / 20;
    const C = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i1, j1]) => [cx + c * w * i1 + s * d * j1, cz - s * w * i1 + c * d * j1]);
    for (let j = 0; j < 4; j++) facade(C[j][0], C[j][1], C[(j + 1) % 4][0], C[(j + 1) % 4][1], cx, cz, cityB.bh[i] / 10, 20);   // east of 6th the buildings stand further back
  }

  // ---- geometry for each kind (local +z = forward, y up from the paving)
  const G = {};
  const cyl = (r0, r1, h, y, seg = 8) => { const g = new THREE.CylinderGeometry(r0, r1, h, seg); g.translate(0, y + h / 2, 0); return g; };
  const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + h / 2, z); return g; };
  G.pole = cyl(.07, .12, 4.1, 0); G.lantern = cyl(.26, .18, .62, 4.1, 6); G.cap = (() => { const g = new THREE.ConeGeometry(.34, .3, 6); g.translate(0, 4.87, 0); return g; })();
  G.bench = merge([box(1.8, .08, .5, 0, .45, 0), box(1.8, .45, .07, 0, .5, -.23), box(.08, .45, .45, -.8, 0, 0), box(.08, .45, .45, .8, 0, 0)]);
  G.planter = box(1.5, .7, 1.5, 0, 0, 0); G.trunk = cyl(.12, .16, 2.2, .7, 6);
  G.crown = (() => { const g = new THREE.IcosahedronGeometry(1.5, 0); g.translate(0, 3.6, 0); return g; })();
  G.bollard = cyl(.12, .14, .9, 0, 8);
  G.window = (() => { const g = new THREE.PlaneGeometry(1, 2.5); g.translate(0, 1.55, 0); return g; })();   // width scaled per bay
  G.awning = (() => {   // sloping canvas, 1.5 m deep, from 3.9 m at the wall to 3.35 m, with a valance
    const g = new THREE.BoxGeometry(1, .05, 1.55); g.rotateX(.36); g.translate(0, 3.62, .72);
    const v = new THREE.BoxGeometry(1, .32, .04); v.translate(0, 3.2, 1.46);
    return merge([g, v]);
  })();
  G.door = merge([box(.12, 2.4, .16, -.54, 0, 0), box(.12, 2.4, .16, .54, 0, 0), box(1.2, .12, .16, 0, 2.28, 0)]);   // jambs and head
  G.table = merge([cyl(.4, .4, .04, .72, 12), cyl(.04, .04, .72, 0, 6), cyl(.25, .25, .03, 0, 8)]);
  G.chair = merge([box(.42, .04, .42, 0, .44, 0), box(.42, .45, .04, 0, .46, -.2), box(.04, .44, .04, -.18, 0, .18), box(.04, .44, .04, .18, 0, .18), box(.04, .44, .04, -.18, 0, -.18), box(.04, .44, .04, .18, 0, -.18)]);
  G.umbrella = merge([cyl(.03, .03, 2.35, 0, 5), (() => { const g = new THREE.ConeGeometry(1.35, .45, 8, 1, true); g.translate(0, 2.55, 0); return g; })()]);

  const lanternMat = std('#fff3d6', { emissive: '#ffd08a', emissiveIntensity: 0, roughness: .3 }); lanternMat.userData.lit = 1.6; litMats.push(lanternMat);
  const shopMat = std('#3a4752', { emissive: '#ffd49a', emissiveIntensity: 0, roughness: .25, metalness: .3 }); shopMat.userData.lit = 1.5; litMats.push(shopMat);
  const iron = std('#23272b', { roughness: .6, metalness: .4 }), wood = std('#8a6440'), stone = std('#a9a398'), white = std('#ffffff', { side: THREE.DoubleSide, roughness: .95 });
  const MAT = { pole: iron, lantern: lanternMat, cap: iron, bench: wood, planter: stone, trunk: std('#6b5444', { roughness: 1 }), crown: std('#ffffff', { flatShading: true, roughness: .95 }),
    bollard: iron, window: shopMat, door: std('#2a2019', { roughness: .7 }), awning: white, table: iron, chair: iron, umbrella: white };
  for (const [name, k] of kinds) {
    const im = new THREE.InstancedMesh(G[name], MAT[name], k.m.length);
    k.m.forEach((m, i) => { im.setMatrixAt(i, m); if (k.c[i]) im.setColorAt(i, k.c[i]); });
    im.castShadow = name !== 'window'; im.receiveShadow = true; im.frustumCulled = false; group.add(im);
  }

  // on terrain: the paving drapes over the street's real slope, every fixture stands on it
  if (terrain.on) {
    group.updateMatrixWorld(true);
    for (const o of [...group.children]) {
      if (o.isInstancedMesh) { const a = o.instanceMatrix.array; for (let i = 0; i < o.count; i++) a[i * 16 + 13] += surface(a[i * 16 + 12], a[i * 16 + 14]); o.instanceMatrix.needsUpdate = true; }
      else if (o.isMesh) drape(o, surface, 10);
    }
    for (const st of seats) st.g = surface(st.x, st.z);
  }
  group.userData.terrain = 'done';
  // a view east down the shops from above the street at the corner of Rittenhouse Square
  const a = at(600, 0), b = at(860, 0);
  const view = { id: 'walnut', name: 'Walnut St promenade', pos: new THREE.Vector3(a.x, 26, a.z), target: new THREE.Vector3(b.x, 1, b.z) };
  // what the people on the street (pedestrians.js) need to find their way
  const nav = { at, project, length: WALNUT_LENGTH, seats, doors, obst, pave: PAVE_Y, ground: surface, clear: CLEAR, kerb: KERB, shopMat };
  return { group, view, nav, count: Object.fromEntries([...kinds].map(([n, k]) => [n, k.m.length])), ...seating(seats) };
}

/** where the camera goes when you get up (or step out of someone): 40 m back along the street the
 *  way you were facing, 24 m above its middle, so it never lands inside a building */
export function pullBack(x, z, heading) {
  const p = project(x, z), dir = Math.sign(Math.sin(heading) * p.tx + Math.cos(heading) * p.tz) || 1;
  const q = at(Math.max(0, Math.min(WALNUT_LENGTH, p.s - dir * 40)), 0);
  return new THREE.Vector3(q.x, 24, q.z);
}

// ---- sitting down: click a cafe chair or a bench, drag to look around, Space or Esc to stand up
const SEAT_Y = .45, EYE = 1.2;   // seat height; eye height above the paving when seated
function seating(seats) {
  let seat = null;   // { i, yaw, pitch } while sitting
  const v = new THREE.Vector3(), look = new THREE.Vector3();
  /** the chair or bench under screen point (x, y), within 250 m of the camera */
  function pickSeat(camera, x, y, w, h) {
    const f = h / (2 * Math.tan(camera.fov * Math.PI / 360)), cp = camera.position;
    let best = null;
    seats.forEach((st, i) => {
      if (seat && seat.i === i) return;
      const gy = st.g || 0, dist = Math.hypot(st.x - cp.x, gy + PAVE_Y + SEAT_Y - cp.y, st.z - cp.z); if (dist > 250) return;
      v.set(st.x, gy + PAVE_Y + SEAT_Y + .1, st.z).project(camera); if (v.z > 1) return;
      const d = Math.hypot((v.x + 1) / 2 * w - x, (1 - v.y) / 2 * h - y), tol = Math.max(10, f * .6 / dist);
      if (d < tol && (!best || d / tol < best.r)) best = { seat: i, r: d / tol };
    });
    return best && { seat: best.seat };
  }
  const sit = i => {
    if (!seats[i]) return null; const y0 = seats[i].yaw0 || 0;
    if (seat) seats[seat.i].user = false;
    // pedestrians.js finds a free place on the seat (moving someone on if it has to): offset along the seat
    seats[i].user = true; const off = seats.onUserSit ? seats.onUserSit(i) || 0 : 0;
    seat = { i, off, yaw: Math.atan2(Math.sin(y0), Math.cos(y0)), pitch: -.12 }; return getSeat();
  };
  /** stand up: where the seat was and the way it faced (for the camera to pull back from) */
  function stand() {
    if (!seat) return null;
    const st = seats[seat.i]; st.user = false; if (seats.onUserStand) seats.onUserStand(seat.i); seat = null;
    return { p: new THREE.Vector3(st.x, (st.g || 0) + PAVE_Y, st.z), dir: new THREE.Vector3(Math.sin(st.ry), 0, Math.cos(st.ry)), cam: pullBack(st.x, st.z, st.ry) };
  }
  const getSeat = () => seat && { kind: 'seat', seat: seats[seat.i].kind };
  const lookSeat = (dx, dy) => { if (!seat) return; seat.yaw = Math.max(-2.6, Math.min(2.6, seat.yaw - dx * .0045)); seat.pitch = Math.max(-1.2, Math.min(1.2, seat.pitch - dy * .0045)); };
  function seatFrame(camera) {
    if (!seat) return;
    const st = seats[seat.i], a = st.ry + seat.yaw, cp = Math.cos(seat.pitch);
    const ox = Math.cos(st.ry) * seat.off, oz = -Math.sin(st.ry) * seat.off;   // along the seat (a bench has two places)
    camera.position.set(st.x + ox - Math.sin(st.ry) * .05, (st.g || 0) + PAVE_Y + EYE, st.z + oz - Math.cos(st.ry) * .05);
    look.set(camera.position.x + Math.sin(a) * cp, camera.position.y + Math.sin(seat.pitch), camera.position.z + Math.cos(a) * cp);
    camera.up.set(0, 1, 0); camera.lookAt(look);
  }
  return { pickSeat, sit, stand, getSeat, lookSeat, seatFrame, seatCount: seats.length };
}

/** merge non-indexed-compatible geometries (all from three's primitives) into one */
function merge(gs) {
  const pos = [], nrm = [], idx = []; let base = 0;
  for (const g of gs) {
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nrm.push(n.getX(i), n.getY(i), n.getZ(i)); }
    if (g.index) for (const i of g.index.array) idx.push(base + i); else for (let i = 0; i < p.count; i++) idx.push(base + i);
    base += p.count;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); m.setIndex(idx);
  return m;
}
