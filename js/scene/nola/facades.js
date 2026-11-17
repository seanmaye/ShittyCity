// PROPOSAL: the French Quarter's buildings, made true to life. The generic building pass gives
// every New Orleans footprint the same Philadelphia palette (red brick, office, glass). The
// Quarter is famous for something else: pastel-painted facades, tall French windows, a cornice
// at the roofline, and a wrought-iron balcony on every upper floor. This module rebuilds the
// Quarter's buildings with that character.
//
// It works with the same data and helpers as buildBuildings (buildings.js): the footprints in
// data/nola/buildings.json (decimetres, converted to metres by pairs()), the same terrain base
// (footprint()), the same window material (worldWinMat) and the same prism builder (addPrism).
// The Quarter's buildings are skipped in buildBuildings (see index.js) and drawn here instead,
// so there is no overlap.
import * as THREE from 'three';
import { pairs } from '../../data.js';
import { Builder, addPrism, colorOf } from '../geometry.js';
import { worldWinMat, WIN_W, WIN_H, M } from '../materials.js';
import { footprint } from '../terrain.js';
import { hash } from '../buildings.js';

// the French Quarter in the model's metres (the origin is Canal & Royal; x is east, z is south).
// This box covers the blocks around Bourbon Street — the heart of the Quarter.
export const FQ_BOX = { x0: -360, x1: -175, z0: -20, z1: 210 };

// the Quarter's pastel palette: mints and sages, pinks and salmons, butters and creams,
// lavenders, peaches, powder blues, off-whites — and a few brick and brown for variety
const PASTELS = [
  '#cfe3d0', '#b8d4c0', '#a8c8b0', '#c2d8c8',   // mints and sages
  '#f2c9c4', '#f0b8b0', '#e8a8a0', '#f0c0c8',   // pinks and salmons
  '#f5e6b8', '#f0dca0', '#e8d498', '#f2e0c0',   // butters and creams
  '#d8c8e0', '#c8b8d8', '#b8a8d0',              // lavenders
  '#f5d0b0', '#f0c8a8', '#e8c0a0',              // peaches
  '#c0d8e8', '#b0c8d8', '#a8c0d0',              // powder blues
  '#f0ece0', '#e8e0d0', '#ece4d4',              // off-whites
  '#b06050', '#9a5545', '#8a6a50', '#a05848',   // brick and brown (a few)
];
const ROOFS = ['#8a8a80', '#9a9a90', '#7a7a72', '#a8a898', '#888878'];   // grey-green roofs
const IRON = '#26262b';   // wrought iron

/**
 * The Quarter's buildings: each with its index, height (m), rings (metres), terrain base and
 * centroid. Returns { indices: a Set to skip in buildBuildings, list: the buildings to rebuild }.
 */
export function fqBuildings(data) {
  const list = [];
  for (let i = 0; i < data.b.length; i++) {
    const [hdm, , ...rings] = data.b[i];
    const ringsM = rings.map(pairs);   // metres
    const outer = ringsM[0];
    const cx = outer.reduce((s, p) => s + p[0], 0) / outer.length;
    const cz = outer.reduce((s, p) => s + p[1], 0) / outer.length;
    if (cx < FQ_BOX.x0 || cx > FQ_BOX.x1 || cz < FQ_BOX.z0 || cz > FQ_BOX.z1) continue;
    list.push({ i, h: hdm / 10, rings: ringsM, f: footprint(outer, hdm / 10), cx, cz });
  }
  return { indices: new Set(list.map(b => b.i)), list };
}

/** scale a ring about its centre (for the cornice, which projects a little past the wall) */
function scaleRing(ring, cx, cz, s) {
  return ring.map(([x, z]) => [cx + (x - cx) * s, cz + (z - cz) * s]);
}

/**
 * Add an axis-free box to a Builder. (cx,cy,cz) is the centre; (dx,dz) the unit vector along the
 * wall, (nx,nz) the unit outward normal; w/h/d the size along the wall / up / out.
 */
function addBox(b, cx, cy, cz, dx, dz, nx, nz, w, h, d, c) {
  const hw = w / 2, hh = h / 2, hd = d / 2;
  const P = (sx, sy, sz) => [cx + dx * sx + nx * sz, cy + sy, cz + dz * sx + nz * sz];
  const p000 = P(-hw, -hh, -hd), p100 = P(hw, -hh, -hd), p110 = P(hw, hh, -hd), p010 = P(-hw, hh, -hd);
  const p001 = P(-hw, -hh, hd), p101 = P(hw, -hh, hd), p111 = P(hw, hh, hd), p011 = P(-hw, hh, hd);
  const v = (p, n) => b.v(p[0], p[1], p[2], n[0], n[1], n[2], 0, 0, c);
  const face = (a, bb, cc, d, n) => { b.tri(v(a, n), v(bb, n), v(cc, n)); b.tri(v(a, n), v(cc, n), v(d, n)); };
  face(p001, p101, p111, p011, [nx, 0, nz]);   // front (out)
  face(p010, p110, p100, p000, [-nx, 0, -nz]); // back
  face(p010, p110, p111, p011, [0, 1, 0]);     // top
  face(p000, p100, p101, p001, [0, -1, 0]);    // bottom
  face(p000, p010, p011, p001, [-dx, 0, -dz]); // left
  face(p100, p110, p111, p101, [dx, 0, dz]);   // right
}

/**
 * A wrought-iron balcony on a wall: a base slab, a top rail and two bars, projecting out.
 * (px,pz) a point on the wall, (ex,ez) the unit vector along the wall, (nx,nz) the outward
 * normal, y the floor height.
 */
function addBalcony(b, px, pz, ex, ez, nx, nz, y, c) {
  const W = 1.7, D = .55, RH = 1.0;   // width along the wall, depth out, rail height
  const cx = px + nx * D / 2, cz = pz + nz * D / 2;
  addBox(b, cx, y, cz, ex, ez, nx, nz, W, .07, D, c);          // the base slab
  addBox(b, cx, y + RH, cz, ex, ez, nx, nz, W, .06, D, c);     // the top rail
  for (const s of [-W / 2 + .15, W / 2 - .15]) {               // two side bars
    addBox(b, px + nx * D / 2 + ex * s, y + RH / 2, pz + nz * D / 2 + ez * s, ex, ez, nx, nz, .05, RH, .05, c);
  }
}

/** Balconies on every upper floor of a building, along each wall of its footprint. */
function addBalconies(b, bld, c) {
  const ring = bld.rings[0], base = bld.f.y0, top = bld.f.top;
  for (const fy of [4, 8, 12]) {   // the second, third and fourth floors
    const y = base + fy; if (y > top - 1.5) continue;
    for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
      const ex = bx - ax, ez = bz - az, L = Math.hypot(ex, ez); if (L < 4) continue;
      const ux = ex / L, uz = ez / L, nx = uz, nz = -ux;   // outward normal
      const n = Math.max(1, Math.round(L / 8));            // one balcony per ~8 m of wall
      for (let k = 0; k < n; k++) {
        const t = (k + .5) / n;
        addBalcony(b, ax + ex * t, az + ez * t, ux, uz, nx, nz, y, c);
      }
    }
  }
}

/**
 * Rebuild the Quarter's buildings (fq = fqBuildings(data)): pastel facades with tall French
 * windows, a cornice at the roofline and a wrought-iron balcony on each upper floor. Returns the
 * meshes added to the scene.
 */
export function buildFqFacades(scene, data, fq) {
  const bWin = new Builder({ uv: true, color: true });   // the pastel prisms, with lit windows
  const bIron = new Builder({ color: true });            // the cornices and balconies (wrought iron)
  const iron = colorOf(IRON);
  const pick = a => a[Math.floor(hash(a.length * 7919) * a.length)];
  for (const bld of fq.list) {
    const color = colorOf(pick(PASTELS));
    // the facade: a pastel prism with the tall-window ('stone') pattern and a grey-green roof
    addPrism(bWin, bld.rings, bld.f.y0, bld.f.top, hash(bld.i + 7) * 4, WIN_W, WIN_H, color, colorOf(pick(ROOFS)), bld.f.mid);
    // the cornice: a thin band a little larger than the wall, at the roofline
    if (bld.h >= 6) {
      const cap = scaleRing(bld.rings[0], bld.cx, bld.cz, 1.04);
      addPrism(bIron, [cap], bld.f.top - .25, bld.f.top + .55, 0, WIN_W, WIN_H, iron, iron, bld.f.mid);
    }
    // the balconies, on every upper floor
    if (bld.h >= 8) addBalconies(bIron, bld, iron);
  }
  const mWin = new THREE.Mesh(bWin.geometry(), worldWinMat('stone'));
  mWin.castShadow = mWin.receiveShadow = true; mWin.userData.terrain = 'done'; mWin.userData.draped = true;
  scene.add(mWin);
  const mIron = new THREE.Mesh(bIron.geometry(), M(IRON, { roughness: .55, metalness: .45 }));
  mIron.castShadow = true; mIron.userData.terrain = 'done'; mIron.userData.draped = true;
  scene.add(mIron);
  return { meshes: [mWin, mIron], count: fq.list.length };
}
