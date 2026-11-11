// Real building footprints (City of Philadelphia LI footprints, LiDAR heights),
// extruded and merged into tiled meshes with lit-window facades.
import * as THREE from 'three';
import { pairs } from '../data.js';
import { worldWinMat, WIN_W, WIN_H } from './materials.js';
import { Builder, addPrism } from './geometry.js';
export const OFFICE = ['#c8ccd0', '#a9b1b8', '#8e979f', '#d6d0c4', '#b9ab9b', '#9b9184', '#b3a28e'];
export const BRICK = ['#a2553f', '#8f4b3a', '#b06a4f', '#c9b9a3', '#7d4a3c', '#94604a'];
const TILE = 700; // metres; tiling lets the camera cull off-screen blocks

const hash = i => { let x = (i + 1) * 2654435761 >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822507) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; };

function ringArea(r) { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }

export function buildBuildings(scene, data) {
  const styles = data.styles;
  // sort footprints into tiles first so each tile's buffers can be built and released in turn
  const tiles = new Map();
  for (let i = 0; i < data.b.length; i++) {
    const [hdm, style, outerFlat] = data.b[i];
    const h = hdm / 10, outer = pairs(outerFlat);
    let kind, color;
    if (style) { kind = styles[style].kind; color = styles[style].color; }
    else {
      const rowhouse = h < 16 && Math.abs(ringArea(outer)) < 320;
      kind = rowhouse ? 'row' : 'office';
      const pal = rowhouse ? BRICK : OFFICE; color = pal[Math.floor(hash(i) * pal.length)];
    }
    const [cx, cz] = outer[0];
    const key = Math.floor(cx / TILE) + ',' + Math.floor(cz / TILE) + ',' + kind;
    let t = tiles.get(key); if (!t) { t = { kind, items: [] }; tiles.set(key, t); }
    t.items.push([i, color]);
  }
  const meshes = [], colors = new Map();   // one Color per palette entry, not one per building
  const colorOf = c => { let o = colors.get(c); if (!o) colors.set(c, o = new THREE.Color(c)); return o; };
  tiles.forEach(t => {
    const b = new Builder({ uv: true, color: true });
    for (const [i, color] of t.items) {
      const [hdm, , ...flat] = data.b[i];
      addPrism(b, flat.map(pairs), 0, hdm / 10, hash(i + 7) * 4, WIN_W, WIN_H, colorOf(color));
    }
    const m = new THREE.Mesh(b.geometry(), worldWinMat(t.kind));
    m.castShadow = m.receiveShadow = true; scene.add(m); meshes.push(m);
  });
  return { meshes, count: data.b.length };
}
