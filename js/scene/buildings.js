// Real building footprints (each city's footprints and heights: data/<city>/buildings.json),
// extruded and merged into tiled meshes with lit-window facades.
import * as THREE from 'three';
import { pairs } from '../data.js';
import { worldWinMat, WIN_W, WIN_H, roofColor, M, addDisplay } from './materials.js';
import { Builder, addPrism, addLoft, colorOf } from './geometry.js';

// Facade colours by style, weighted toward what Philadelphia (where they were tuned) is made of: red brick
// rowhouses (some painted, stuccoed or Formstone), brick and limestone commercial blocks,
// concrete and precast mid-rises, and blue-grey or green-grey glass towers.
export const PALETTE = {
  row: ['#8e4b3b', '#9a5541', '#7d4436', '#a4604a', '#874f40', '#6e3d31', '#93594a', '#b06f55', '#d5ccbc', '#b9b3a8', '#8f8d88', '#c9b597'],
  row2: ['#8a4838', '#9c5844', '#7a4234', '#a8664e', '#6c3c30', '#8f5e4c', '#e0d8c8', '#a49c90'],
  office: ['#c7bfae', '#b5a993', '#a2978a', '#d4cdc0', '#9b8c7c', '#8a5a48', '#a5664f', '#bdb3a3'],
  office2: ['#bfc2c3', '#a8aeb3', '#d3d0c8', '#90979c', '#c4bcae', '#aab0a8'],
  glass: ['#8ea3b3', '#7c92a4', '#9aabb6', '#6e8596', '#a6b4bc', '#5d7486', '#86a0a5', '#7f8f9a'],
  stone: ['#d2c7b2', '#c3b49b', '#b8ab97', '#a59882', '#dcd4c2', '#b59f8a'],
};
const TILE = 700; // metres; tiling lets the camera cull off-screen blocks

export const hash = i => { let x = (i + 1) * 2654435761 >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822507) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; };

/** Facade style for a generic building: rowhouses get one of two terrace patterns; taller
 *  buildings are more often glass or ribbon-windowed, older low ones punched masonry. */
export function facadeKind(row, h, r) {
  if (row) return r < .55 ? 'row' : 'row2';
  if (h > 55) return r < .5 ? 'glass' : r < .78 ? 'office2' : 'stone';
  if (h > 20) return r < .45 ? 'office' : r < .72 ? 'office2' : r < .87 ? 'stone' : 'glass';
  return r < .65 ? 'office' : 'office2';
}
export const facadeColor = (kind, r) => { const p = PALETTE[kind]; return p[Math.floor(r * p.length)]; };

function ringArea(r) { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }

/**
 * Rooftop plant on a tall building: a penthouse (and a second, smaller one on towers) inset
 * from the footprint, plus where its aviation light goes. Adds to b (plain, vertex-coloured).
 */
export function addRooftop(b, ring, h, wall, r, lights) {
  const c = ring.reduce((s, p) => [s[0] + p[0] / ring.length, s[1] + p[1] / ring.length], [0, 0]);
  const inset = f => ring.map(([x, z]) => [c[0] + (x - c[0]) * f, c[1] + (z - c[1]) * f]);
  const col = new THREE.Color(wall).multiplyScalar(.82), roof = new THREE.Color(roofColor(r));
  const h1 = h + 3 + Math.min(6, h * .025);
  addPrism(b, [inset(.58 + r * .1)], h, h1, 0, 1, 1, col, roof);
  let top = h1;
  if (h > 110) { top = h1 + 4; addPrism(b, [inset(.3)], h1, top, 0, 1, 1, col, roof); }
  if (h > 90 && lights) lights.push(c[0], top + 1.5, c[1]);
}

/** Red aviation lights on the tallest roofs (shown at night). */
export function aviationLights(flat) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(flat, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ff2a1a', size: 3.5, sizeAttenuation: false, fog: false }));
  p.visible = false; p.frustumCulled = false; return p;
}

/** LED pixels: a soft dot grid, 1 tile = 4 x 4 m */
let ledTex = null;
function led() {
  if (ledTex) return ledTex;
  const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d');
  const gr = g.createRadialGradient(16, 16, 1, 16, 16, 9); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.5, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  ledTex = new THREE.CanvasTexture(c); ledTex.wrapS = ledTex.wrapT = THREE.RepeatWrapping; return ledTex;
}
/**
 * Display lighting on a styled tower, shown at night in the skyline colour scheme: the Cira
 * Centre's LED facade (its whole glass skin) and the FMC Tower's lit crown above the roof.
 */
function displayShell(ring, y0, y1) {
  const c = ring.reduce((a, p) => [a[0] + p[0] / ring.length, a[1] + p[1] / ring.length], [0, 0]);
  const r = ring.map(([x, z]) => [c[0] + (x - c[0]) * 1.006, c[1] + (z - c[1]) * 1.006]);
  const b = new Builder({ uv: true }); addLoft(b, r, y0, y1, 1, 1, 4, 4, null, false);
  const m = new THREE.MeshBasicMaterial({ color: '#f4f8ff', map: led(), transparent: true, opacity: .9, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  addDisplay(hex => m.color.set(hex));
  const mesh = new THREE.Mesh(b.geometry(), m); mesh.visible = false; mesh.renderOrder = 2; return mesh;
}

export function buildBuildings(scene, data) {
  const styles = data.styles;
  // sort footprints into tiles first so each tile's buffers can be built and released in turn
  const tiles = new Map(), top = new Builder({ color: true }), lights = [], shells = [];
  for (let i = 0; i < data.b.length; i++) {
    const [hdm, style, outerFlat] = data.b[i];
    const h = hdm / 10, outer = pairs(outerFlat);
    let kind, color;
    if (style) {
      kind = styles[style].kind; color = styles[style].color;
      const id = styles[style].id;
      if (id === 'cira') shells.push(displayShell(outer, 8, h));
      if (id === 'fmc') shells.push(displayShell(outer, h - 14, h + 7));
    }
    else {
      const rowhouse = h < 16 && Math.abs(ringArea(outer)) < 320;
      kind = facadeKind(rowhouse, h, hash(i + 11)); color = facadeColor(kind, hash(i));
      if (!rowhouse && h > 40) addRooftop(top, outer, h, color, hash(i + 5), lights);
    }
    const [cx, cz] = outer[0];
    const key = Math.floor(cx / TILE) + ',' + Math.floor(cz / TILE) + ',' + kind;
    let t = tiles.get(key); if (!t) { t = { kind, items: [] }; tiles.set(key, t); }
    t.items.push([i, color]);
  }
  const meshes = [];
  tiles.forEach(t => {
    const b = new Builder({ uv: true, color: true });
    for (const [i, color] of t.items) {
      const [hdm, , ...flat] = data.b[i];
      addPrism(b, flat.map(pairs), 0, hdm / 10, hash(i + 7) * 4, WIN_W, WIN_H, colorOf(color), colorOf(roofColor(hash(i + 3))));
    }
    const m = new THREE.Mesh(b.geometry(), worldWinMat(t.kind));
    m.castShadow = m.receiveShadow = true; scene.add(m); meshes.push(m);
  });
  const roofs = new THREE.Mesh(top.geometry(), M('#ffffff', { vertexColors: true, roughness: .85 }));
  roofs.castShadow = roofs.receiveShadow = true; scene.add(roofs);
  const beacons = aviationLights(lights); scene.add(beacons);
  shells.forEach(m => scene.add(m));
  return { meshes, count: data.b.length, nightOnly: [beacons, ...shells] };
}
