// Shared materials, including the lit-window facades that glow at dusk.
import * as THREE from 'three';
/** Materials whose emissive windows switch on at dusk; each has userData.lit (intensity). */
export const litMats = [];

export const M = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .9, side: THREE.DoubleSide }, o));

let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

// 32x64 tile = 4 window columns x 8 floors; the bottom-left 4x4 px is always dark so
// roofs can point their UVs there.
function winTex() {
  const c = document.createElement('canvas'); c.width = 32; c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 32, 64);
  for (let y = 3; y < 62; y += 8) for (let x = 3; x < 30; x += 7) {
    if (rnd() < .5) { g.fillStyle = rnd() < .5 ? '#ffd59a' : '#fff0cc'; g.fillRect(x, y, 4, 5); }
  }
  g.fillStyle = '#000'; g.fillRect(0, 60, 4, 4);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter;
  return t;
}
const WT = [winTex(), winTex(), winTex()];

/** Window texture tiling: one tile = 14 m wide, 29 m tall. */
export const WIN_W = 14, WIN_H = 29;

const cache = new Map();
/** Facade material for boxes with 0..1 UVs (hand-modelled landmarks). */
export function winMat(color, rx, ry, v, kind) {
  const key = color + '|' + rx + '|' + ry + '|' + v + '|' + kind;
  let m = cache.get(key); if (m) return m;
  const t = WT[v % 3].clone(); t.needsUpdate = true; t.repeat.set(rx, ry);
  m = new THREE.MeshStandardMaterial({ color, roughness: kind === 'glass' ? .32 : .85, metalness: kind === 'glass' ? .35 : .05, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0 });
  m.userData.lit = kind === 'row' ? .5 : .85; cache.set(key, m); litMats.push(m);
  return m;
}

/** Facade material for extruded footprints whose UVs are already in window-tile units.
 *  Colour comes from vertex colours so one material serves a whole palette. */
export function worldWinMat(kind, v = 0) {
  const key = 'world|' + kind + '|' + v;
  let m = cache.get(key); if (m) return m;
  const t = WT[v % 3].clone(); t.needsUpdate = true;
  m = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: kind === 'glass' ? .32 : .85, metalness: kind === 'glass' ? .35 : .05, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0 });
  m.userData.lit = kind === 'row' ? .5 : .85; cache.set(key, m); litMats.push(m);
  return m;
}

export function fixBoxUV(g) { const uv = g.attributes.uv; for (let i = 8; i < 16; i++) uv.setXY(i, .01, .01); uv.needsUpdate = true; return g; }
export const bx = (w, h, d) => fixBoxUV(new THREE.BoxGeometry(w, h, d));
export const reps = (w, h) => [Math.max(1, Math.min(10, Math.round(w / WIN_W))), Math.max(1, Math.min(20, Math.round(h / WIN_H)))];
