// Philadelphia's Chinatown (Vine to Arch, 9th to 11th), dressed in detail:
//  - the Friendship Gate over 10th Street at Arch: red pillars, painted beams, the 費城華埠
//    ("Philadelphia Chinatown") plaque and tiled roofs with upturned eaves, stone lions at its feet
//  - shop signs on the facades of Race, 10th, 9th, 11th and Arch: lit boards over the shopfronts,
//    vertical blade signs and coloured awnings (made-up shops; the signs glow after dark)
//  - strings of red lanterns across Race, 10th and 9th, and pagoda-topped street lamps
//  - a dragon dance winding up and down Race Street, its dancers holding the dragon up on poles
//  - OUR ADDITION: a night market on the open lot on 10th Street between Race and Cherry, with
//    food stalls, tables, string lights and a pavilion, and "Lucky Arcade", a street stall whose
//    arcade games you can play: click it (pickStall) and ui.js opens js/arcade.js.
// Street lines are OpenStreetMap centrelines in scene metres (tools/phl/osm/streets_cc.json).
import * as THREE from 'three';
import { litMats } from '../materials.js';
import { makeFigure, pose } from './people.js';
import { terrain, surface, drape } from '../terrain.js';

// ---- streets (OSM centrelines, metres) and the crossings that keep furniture back
const RACE = [[1581.7, 44.7], [1851.9, 87.1]];           // 11th -> 9th
const TENTH = [[1743.3, -87.6], [1684, 271]];            // Vine -> Arch
const NINTH = [[1882.1, -65.4], [1851.9, 87.1], [1817.5, 292.9]];
const ELEVENTH = [[1608, -110.6], [1548.2, 249]];
const ARCH = [[1548.2, 249], [1817.5, 292.9]];
const CROSSINGS = [[1581.7, 44.7], [1718, 66.2], [1851.9, 87.1], [1743.3, -87.6], [1882.1, -65.4], [1608, -110.6], [1684, 271], [1817.5, 292.9],
  [1548.2, 249], [1700.6, 170], [1834.7, 192.1], [1565.2, 146.9], [1728.9, -.5], [1863, 19.4], [1593, -22.7]];
const nearCrossing = (x, z, r) => CROSSINGS.some(([cx, cz]) => Math.hypot(cx - x, cz - z) < r);
const GATE_S = 347;           // along 10th from Vine: just north of Arch
const LOT_S = [187, 199.4];   // 10th St frontage of the night-market lot (its frame sits at the middle)
const LOT_Y = .32;            // the market's paving (the paved city is at .15, streets at .8)

/** a street polyline: arc length, point at (s, offset), nearest point; +offset = left of travel */
function street(pts) {
  const seg = []; let s = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az);
    seg.push({ ax, az, tx: (bx - ax) / L, tz: (bz - az) / L, L, s }); s += L;
  }
  const at = (s, o = 0) => {
    let g = seg[seg.length - 1]; for (const q of seg) if (s <= q.s + q.L) { g = q; break; }
    const l = s - g.s; return { x: g.ax + g.tx * l - g.tz * o, z: g.az + g.tz * l + g.tx * o, tx: g.tx, tz: g.tz };
  };
  const project = (x, z) => {
    let best = null;
    for (const g of seg) {
      const l = Math.max(0, Math.min(g.L, (x - g.ax) * g.tx + (z - g.az) * g.tz)), d = Math.hypot(x - g.ax - g.tx * l, z - g.az - g.tz * l);
      if (!best || d < best.d) best = { d, s: g.s + l, o: -(x - g.ax) * g.tz + (z - g.az) * g.tx, tx: g.tx, tz: g.tz };
    }
    return best;
  };
  const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
  return { at, project, length: s, box: [Math.min(...xs) - 30, Math.min(...zs) - 30, Math.max(...xs) + 30, Math.max(...zs) + 30] };
}

// ---- geometry helpers (base at y = 0 unless said otherwise)
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const yaw = (tx, tz) => Math.atan2(tx, tz);   // rotation.y that turns local +z to (tx, tz)
const cyl = (r0, r1, h, seg = 8) => { const g = new THREE.CylinderGeometry(r0, r1, h, seg); g.translate(0, h / 2, 0); return g; };
const box = (w, h, d) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0); return g; };
const sph = (r, a = 10, b = 8) => new THREE.SphereGeometry(r, a, b);
const EUL = new THREE.Euler(), QU = new THREE.Quaternion();
/** local transform: position, yaw, scale, then pitch/roll */
const M = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) =>
  new THREE.Matrix4().compose(V(x, y, z), QU.setFromEuler(EUL.set(rx, ry, rz, 'YXZ')).clone(), V(sx, sy, sz));

/** hip roof w x d, ridge h above the eaves, corners turned up by `up` (w == d: a pyramid) */
function hipRoof(w, d, h, up, frontPrint = false) {
  const r = Math.max(0, (w - d) / 2), W = w / 2, D = d / 2;
  const cFL = [-W, up, D], cFR = [W, up, D], cBL = [-W, up, -D], cBR = [W, up, -D];
  const mF = [0, 0, D], mB = [0, 0, -D], mL = [-W, 0, 0], mR = [W, 0, 0], rL = [-r, h, 0], rR = [r, h, 0];
  const front = [[cFL, mF, rL], [mF, cFR, rR]];
  const rest = [[rL, mB, cBL], [rR, cBR, mB], [cFR, mR, rR], [mR, cBR, rR], [rL, mL, cFL], [rL, cBL, mL]];
  if (r > 0) { front.push([mF, rR, rL]); rest.push([rL, rR, mB]); }
  const pos = [], uv = [];
  for (const faces of [front, rest]) for (const p of faces.flat()) {
    pos.push(...p);
    if (frontPrint) uv.push(...(faces === front ? [p[0] / w + .5, 1 - p[2] / D] : [0, 0]));
    else uv.push((p[0] + p[2]) * 2.2, p[1] * 4.5);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals(); return g;
}

/** merge [{g, m, c}] (geometry, optional Matrix4, optional colour) into one indexed geometry */
function mergeGeos(list) {
  const parts = []; let nV = 0, nI = 0;
  for (const { g, m, c } of list) {
    const q = m ? g.clone().applyMatrix4(m) : g;
    if (!q.attributes.normal) q.computeVertexNormals();
    parts.push([q, c]); nV += q.attributes.position.count; nI += q.index ? q.index.count : q.attributes.position.count;
  }
  const pos = new Float32Array(nV * 3), nrm = new Float32Array(nV * 3), uv = new Float32Array(nV * 2);
  const col = list.some(p => p.c) ? new Float32Array(nV * 3) : null, idx = nV > 65535 ? new Uint32Array(nI) : new Uint16Array(nI);
  let v = 0, k = 0;
  for (const [q, c] of parts) {
    const P = q.attributes.position, n = P.count;
    pos.set(P.array, v * 3); nrm.set(q.attributes.normal.array, v * 3);
    if (q.attributes.uv) uv.set(q.attributes.uv.array, v * 2);
    if (col) for (let i = 0; i < n; i++) { col[(v + i) * 3] = c ? c.r : 1; col[(v + i) * 3 + 1] = c ? c.g : 1; col[(v + i) * 3 + 2] = c ? c.b : 1; }
    if (q.index) for (let i = 0; i < q.index.count; i++) idx[k++] = v + q.index.array[i];
    else for (let i = 0; i < n; i++) idx[k++] = v + i;
    v += n;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}
/** collects geometry per material, then draws each material's pieces as one mesh */
function batch() {
  const sets = new Map();
  return {
    add(mat, g, m, c) { let s = sets.get(mat); if (!s) sets.set(mat, s = []); s.push({ g, m, c }); },
    build(group) {
      for (const [mat, list] of sets) {
        const mesh = new THREE.Mesh(mergeGeos(list), mat);
        mesh.castShadow = !mat.userData.noCast; mesh.receiveShadow = true; group.add(mesh);
      }
    },
  };
}

// ---- textures: one atlas for every sign (boards 512x128, blades 128x512, the gate's plaque)
const CJK = '"Noto Sans SC","Noto Sans TC","Microsoft YaHei","Microsoft JhengHei","PingFang SC","Hiragino Sans GB","SimHei",sans-serif';
const LAT = 'Archivo,"Segoe UI",Arial,sans-serif';
// [Chinese, English, background, ink]; 0-7 and 17-19 hang on the streets, 8-16 in the night market
const BOARDS = [
  ['金龍酒家', 'GOLDEN DRAGON', '#a8221b', '#f4c542'], ['點心', 'DIM SUM', '#f2c13a', '#9a1c14'], ['茶館', 'TEA HOUSE', '#1f5b3f', '#f2e6c8'],
  ['麵家', 'NOODLE HOUSE', '#151515', '#f4c542'], ['燒臘', 'ROAST DUCK · BBQ', '#a8221b', '#ffffff'], ['餅家', 'BAKERY', '#fff1d6', '#a8221b'],
  ['東方超市', 'ASIAN MARKET', '#1e4d8c', '#ffffff'], ['藥材行', 'HERBS & TEA', '#5a1a1a', '#e8c766'],
  ['街機', 'LUCKY ARCADE', '#120a1e', '#ff4fd8'], ['餃子', 'DUMPLINGS', '#a8221b', '#ffe08a'], ['奶茶', 'BUBBLE TEA', '#f7d9e6', '#6a2a8c'],
  ['串燒', 'SKEWERS', '#151515', '#ff8a3a'], ['水果', 'FRESH FRUIT', '#2f7d3a', '#fff6c8'], ['燈籠', 'LANTERNS · GIFTS', '#c8261c', '#ffd75a'],
  ['麵', 'HAND-PULLED NOODLES', '#f4efe4', '#a8221b'], ['包子', 'STEAMED BAO', '#e9c36a', '#5a2a10'], ['夜市', 'NIGHT MARKET', '#a8221b', '#ffd75a'],
  ['書店', 'BOOKS', '#2b2b5a', '#f2e6c8'], ['珠寶', 'JEWELRY', '#151515', '#e8c766'], ['花店', 'FLOWERS', '#f6e3ea', '#b0284a'],
];
const STREET_BOARDS = [0, 1, 2, 3, 4, 5, 6, 7, 17, 18, 19];
const BLADES = [['火鍋', '#a8221b', '#f4c542'], ['粥麵', '#f2c13a', '#8a1a12'], ['奶茶', '#1f5b3f', '#ffffff'], ['餃子', '#151515', '#ff6a4a'],
  ['海鮮', '#1e4d8c', '#f4c542'], ['拉麵', '#a8221b', '#ffffff'], ['福', '#d4241c', '#f4c542'], ['旅行社', '#3a2a6a', '#ffd27a']];
const AW = 2048, AH = 1024;
const boardCell = i => (i < 16 ? [(i % 2) * 512, Math.floor(i / 2) * 128, 512, 128] : [1024 + ((i - 16) % 2) * 512, 512 + Math.floor((i - 16) / 2) * 128, 512, 128]);
const bladeCell = i => [1024 + i * 128, 0, 128, 512];
const PLAQUE = [1024, 768, 512, 256];
function signAtlas() {
  const c = document.createElement('canvas'); c.width = AW; c.height = AH; const g = c.getContext('2d');
  g.fillStyle = '#222'; g.fillRect(0, 0, AW, AH);
  const frame = (x, y, w, h, bg, ink) => {
    g.fillStyle = bg; g.fillRect(x, y, w, h);
    g.strokeStyle = ink; g.lineWidth = 5; g.strokeRect(x + 9, y + 9, w - 18, h - 18);
    g.lineWidth = 2; g.strokeRect(x + 17, y + 17, w - 34, h - 34);
  };
  g.textBaseline = 'middle'; g.textAlign = 'center';
  BOARDS.forEach(([zh, en, bg, ink], i) => {
    const [x, y, w, h] = boardCell(i); frame(x, y, w, h, bg, ink);
    if (i === 8) { g.shadowColor = ink; g.shadowBlur = 18; }   // the arcade's neon
    g.fillStyle = ink; g.font = `bold ${zh.length > 3 ? 56 : 64}px ${CJK}`;
    g.fillText(zh, x + w / 2, y + 50, w - 50);
    g.font = `600 ${en.length > 15 ? 22 : 26}px ${LAT}`; g.fillText(en, x + w / 2, y + 98, w - 60);
    g.shadowBlur = 0;
  });
  BLADES.forEach(([zh, bg, ink], i) => {
    const [x, y, w, h] = bladeCell(i); frame(x, y, w, h, bg, ink);
    g.fillStyle = ink; const n = zh.length, fs = n === 1 ? 92 : n === 3 ? 84 : 92;
    g.font = `bold ${fs}px ${CJK}`;
    [...zh].forEach((ch, k) => g.fillText(ch, x + w / 2, y + h / 2 + (k - (n - 1) / 2) * (fs + 22)));
  });
  { // the Friendship Gate's plaque: gold on blue, 費城華埠 ("Philadelphia Chinatown")
    const [x, y, w, h] = PLAQUE;
    g.fillStyle = '#c99a2e'; g.fillRect(x, y, w, h); g.fillStyle = '#1b3474'; g.fillRect(x + 16, y + 16, w - 32, h - 32);
    g.strokeStyle = '#f1cf6a'; g.lineWidth = 4; g.strokeRect(x + 28, y + 28, w - 56, h - 56);
    g.fillStyle = '#f4d167'; g.font = `bold 108px ${CJK}`; g.fillText('費城華埠', x + w / 2, y + h / 2 + 4, w - 70);
  }
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8; return t;
}
const UVC = cell => { const [x, y, w, h] = cell; return [x / AW, 1 - (y + h) / AH, (x + w) / AW, 1 - y / AH]; };   // u0, v0 (bottom), u1, v1
/** flat quads facing cross(r, u), sampling one atlas cell each */
function quads() {
  const pos = [], nrm = [], uv = [], idx = [];
  return {
    quad(c, r, u, cell) {
      const [u0, v0, u1, v1] = UVC(cell), n = r.clone().cross(u).normalize(), b = pos.length / 3;
      for (const [sr, su, uu, vv] of [[-1, -1, u0, v0], [1, -1, u1, v0], [1, 1, u1, v1], [-1, 1, u0, v1]]) {
        pos.push(c.x + r.x * sr + u.x * su, c.y + r.y * sr + u.y * su, c.z + r.z * sr + u.z * su); nrm.push(n.x, n.y, n.z); uv.push(uu, vv);
      }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    },
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
    },
    get count() { return idx.length / 6; },
  };
}
/** a small repeating canvas texture */
function tex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4; return t;
}

/** buildings: data.buildings (the core's footprints) */
export function buildChinatown(scene, { buildings }) {
  const group = new THREE.Group(); group.name = 'chinatown'; scene.add(group);
  const B = batch();
  const std = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: .8 }, o));
  const lit = (m, k) => { m.userData.lit = k; litMats.push(m); return m; };
  const atlas = signAtlas();
  const MAT = {
    red: std('#b3261e', { roughness: .55 }), dred: std('#6e1612', { roughness: .7 }), gold: std('#d4a72c', { roughness: .35, metalness: .55 }),
    green: std('#2f7d5b'), blue: std('#2b5d9b'), stone: std('#a19c92', { roughness: .95 }), dstone: std('#7d786f', { roughness: .95 }),
    wood: std('#6b4a30'), dark: std('#1c1c22', { roughness: .5 }), steel: std('#b9bcc0', { roughness: .3, metalness: .7 }),
    white: std('#f2efe8'), tan: std('#c9a66b', { roughness: .9 }), pave: std('#8c8780', { roughness: 1 }), black: std('#141414', { roughness: .6 }),
    tile: std('#ffffff', { roughness: .6, side: THREE.DoubleSide, map: tex(64, 64, (g, w, h) => {
      g.fillStyle = '#c8642a'; g.fillRect(0, 0, w, h); g.fillStyle = '#9c4418'; g.fillRect(0, h * .78, w, h * .22);
      g.fillStyle = 'rgba(255,220,170,.25)'; g.fillRect(0, 0, w, h * .18); g.fillStyle = 'rgba(80,30,10,.35)'; g.fillRect(w * .48, 0, 3, h);
    }) }),
    gtile: std('#ffffff', { roughness: .55, side: THREE.DoubleSide, map: tex(64, 64, (g, w, h) => {
      g.fillStyle = '#2e7a55'; g.fillRect(0, 0, w, h); g.fillStyle = '#1d5a3c'; g.fillRect(0, h * .78, w, h * .22);
      g.fillStyle = 'rgba(200,255,220,.2)'; g.fillRect(0, 0, w, h * .18); g.fillStyle = 'rgba(10,40,20,.4)'; g.fillRect(w * .48, 0, 3, h);
    }) }),
    beam: std('#ffffff', { roughness: .6, map: tex(256, 64, (g, w, h) => {
      g.fillStyle = '#1f6d6a'; g.fillRect(0, 0, w, h); g.fillStyle = '#2b5d9b'; g.fillRect(0, 10, w, h - 20);
      g.fillStyle = '#d4a72c'; g.fillRect(0, 6, w, 4); g.fillRect(0, h - 10, w, 4);
      for (let x = 24; x < w; x += 64) {
        g.beginPath(); g.ellipse(x, h / 2, 16, 14, 0, 0, 7); g.fillStyle = '#f2efe8'; g.fill();
        g.beginPath(); g.ellipse(x, h / 2, 9, 8, 0, 0, 7); g.fillStyle = '#c8261c'; g.fill();
        g.fillStyle = '#d4a72c'; g.beginPath(); g.moveTo(x + 32, 14); g.lineTo(x + 42, h / 2); g.lineTo(x + 32, h - 14); g.lineTo(x + 22, h / 2); g.fill();
      }
    }) }),
    sign: lit(std('#ffffff', { map: atlas, emissiveMap: atlas, emissive: '#ffffff', emissiveIntensity: 0, roughness: .6 }), .85),
    lantern: lit(std('#c8201a', { emissive: '#ff3a1a', emissiveIntensity: 0, roughness: .6 }), 1.2),
    warm: lit(std('#fff3cf', { emissive: '#ffcf6a', emissiveIntensity: 0, roughness: .3 }), 1.8),
    bulb: lit(std('#fff3cf', { emissive: '#ffd27a', emissiveIntensity: 0, roughness: .3 }), 2.4),
    neonP: new THREE.MeshBasicMaterial({ color: '#ff4fd8' }), neonC: new THREE.MeshBasicMaterial({ color: '#4ff3ff' }),
    coal: new THREE.MeshBasicMaterial({ color: '#ff6a1a' }),
    people: std('#ffffff', { vertexColors: true }),
    fruit: std('#ffffff', { vertexColors: true, roughness: .5 }),
  };
  MAT.sign.userData.noCast = true; MAT.bulb.userData.noCast = true;
  const SIGNS = quads();
  const AWN = ['#b3261e', '#e0a92a', '#2f7d5b', '#1e4d8c', '#c8501c', '#6a2a8c', '#151515'].map(c => new THREE.Color(c));
  const awnMat = std('#ffffff', { vertexColors: true, roughness: .9, side: THREE.DoubleSide });
  const awnGeo = (() => { const a = new THREE.BoxGeometry(1, .05, 1.25); a.rotateX(.42); a.translate(0, 3.05, .6); const v = new THREE.BoxGeometry(1, .28, .04); v.translate(0, 2.68, 1.16); return mergeGeos([{ g: a }, { g: v }]); })();
  const hash = (a, b = 0) => { const h = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return h - Math.floor(h); };

  const streets = { race: street(RACE), tenth: street(TENTH), ninth: street(NINTH), eleventh: street(ELEVENTH), arch: street(ARCH) };

  // ---- the facades that face each street (core footprints, 5-26 m tall: shops, not the towers)
  function facades(st) {
    const out = [], [x0, z0, x1, z1] = st.box;
    for (const rec of buildings.b) {
      const h = rec[0] / 10; if (h < 5 || h > 26) continue;
      const ring = rec[2]; let near = false;
      for (let j = 0; j < ring.length; j += 2) { const x = ring[j] / 10, z = ring[j + 1] / 10; if (x > x0 && x < x1 && z > z0 && z < z1) { near = true; break; } }
      if (!near) continue;
      const pts = []; for (let j = 0; j < ring.length; j += 2) pts.push([ring[j] / 10, ring[j + 1] / 10]);
      const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
      for (let j = 0; j < pts.length; j++) {
        const [ax, az] = pts[j], [bx, bz] = pts[(j + 1) % pts.length], ex = bx - ax, ez = bz - az, L = Math.hypot(ex, ez);
        if (L < 3) continue;
        const mx = (ax + bx) / 2, mz = (az + bz) / 2, p = st.project(mx, mz);
        if (p.s < 3 || p.s > st.length - 3 || Math.abs(p.o) < 2.5 || Math.abs(p.o) > 16) continue;
        const ux = ex / L, uz = ez / L; if (Math.abs(ux * p.tx + uz * p.tz) < .96) continue;
        let nx = uz, nz = -ux; if (nx * (mx - cx) + nz * (mz - cz) < 0) { nx = -nx; nz = -nz; }
        if ((nx * -p.tz + nz * p.tx) * -Math.sign(p.o) < .9) continue;   // faces the street
        out.push({ ax, az, ux, uz, nx, nz, L, h, o: p.o, s: p.s });
      }
    }
    return out;
  }
  // each side's facade line (median offset), for lamps and lantern strings
  const sides = st => {
    const f = st.fac, med = a => (a.length ? a.sort((p, q) => p - q)[a.length >> 1] : null);
    return [med(f.filter(q => q.o < 0).map(q => q.o)) ?? -7, med(f.filter(q => q.o > 0).map(q => q.o)) ?? 7];
  };
  for (const st of Object.values(streets)) { st.fac = facades(st); st.side = sides(st); }

  // ---- shop signs: a lit board over the shopfront, a blade sign sticking out, an awning
  let nAwn = 0; const awnings = [];
  for (const [name, st] of Object.entries(streets)) {
    for (const f of st.fac) {
      const n = Math.max(1, Math.round(f.L / 6)), bw = f.L / n;
      for (let i = 0; i < n; i++) {
        const x = f.ax + f.ux * bw * (i + .5), z = f.az + f.uz * bw * (i + .5);
        if (nearCrossing(x, z, 5) || (name === 'tenth' && Math.abs(st.project(x, z).s - GATE_S) < 6)) continue;
        const r = hash(x, z), r2 = hash(z, x), right = V(f.nz, 0, -f.nx);
        if (r < .62 && bw > 2.4) {
          const w = Math.min(bw - .7, 5.6), cell = boardCell(STREET_BOARDS[Math.floor(r2 * STREET_BOARDS.length)]);
          SIGNS.quad(V(x + f.nx * .07, 3.95, z + f.nz * .07), right.clone().multiplyScalar(w / 2), V(0, .5, 0), cell);
        }
        if (r > .5 && f.h >= 7 && i % 2 === 0) {   // the blade at the bay's edge, seen from along the street (both faces)
          const ex = f.ax + f.ux * bw * i + f.ux * .6, ez = f.az + f.uz * bw * i + f.uz * .6, cell = bladeCell(Math.floor(r2 * 7.99));
          const c = V(ex + f.nx * .6, 5.25, ez + f.nz * .6), along = V(f.nx * .42, 0, f.nz * .42), up = V(0, 1.55, 0);
          SIGNS.quad(c.clone().addScaledVector(V(f.ux, 0, f.uz), .02), along, up, cell);
          SIGNS.quad(c.clone().addScaledVector(V(f.ux, 0, f.uz), -.02), along.clone().negate(), up, cell);
          B.add(MAT.dark, box(.06, .06, .9), M(ex + f.nx * .45, 6.85, ez + f.nz * .45, yaw(f.nx, f.nz)));
        }
        if (r2 < .55 && bw > 2.2) { awnings.push(M(x + f.nx * .03, 0, z + f.nz * .03, yaw(f.nx, f.nz), bw - .5, 1, 1)); B.add(awnMat, awnGeo, awnings[awnings.length - 1], AWN[Math.floor(hash(r, r2) * AWN.length)]); nAwn++; }
      }
    }
  }

  // ---- lantern strings across Race, 10th and 9th; pagoda-topped lamps along their kerbs
  const wire = [];
  const lanternAt = (x, y, z, s = 1) => {
    B.add(MAT.lantern, sph(.3, 12, 8), M(x, y, z, 0, s, s * .82, s));
    B.add(MAT.gold, cyl(.13, .13, .07, 8), M(x, y + .22 * s, z, 0, s, s, s)); B.add(MAT.gold, cyl(.13, .13, .07, 8), M(x, y - .29 * s, z, 0, s, s, s));
    B.add(MAT.lantern, cyl(.015, .05, .32, 5), M(x, y - .62 * s, z, 0, s, s, s));
  };
  const strings = (st, step, from, sag = 1.1) => {
    const [oA, oB] = st.side, wdt = oB - oA, nL = Math.max(3, Math.round(wdt / 2.3));
    for (let s = from; s < st.length - 4; s += step) {
      const a = st.at(s, oA + .3), b = st.at(s + 2, oB - .3);
      if (nearCrossing(a.x, a.z, 9) || nearCrossing(b.x, b.z, 9)) continue;
      if (st === streets.tenth && (Math.abs(s - GATE_S) < 8 || (s > LOT_S[0] - 2 && s < LOT_S[1] + 2))) continue;
      const Y = t => 6.6 - 4 * sag * t * (1 - t), P = t => V(a.x + (b.x - a.x) * t, Y(t), a.z + (b.z - a.z) * t);
      for (let k = 0; k < 14; k++) wire.push(P(k / 14), P((k + 1) / 14));
      for (let k = 0; k < nL; k++) { const p = P((k + .5) / nL); wire.push(p, p.clone().setY(p.y - .28)); lanternAt(p.x, p.y - .55, p.z, .9 + .2 * hash(p.x, k)); }
    }
  };
  strings(streets.race, 13, 6); strings(streets.tenth, 14, 8); strings(streets.ninth, 15, 9, 1);
  // lamps: red pole, gold collar, a lantern under a little green-tiled pagoda roof
  const lampGeo = { pole: cyl(.07, .1, 4.3, 8), collar: cyl(.12, .12, .14, 8), house: box(.42, .58, .42), roof: (() => { const g = hipRoof(.9, .9, .34, .1); return g; })(), tip: sph(.06, 6, 5) };
  const lamps = (st, step) => {
    for (const [k, o] of st.side.entries()) {
      const oo = o - Math.sign(o) * 1.1;
      for (let s = 10 + k * step / 2; s < st.length - 5; s += step) {
        const p = st.at(s, oo); if (nearCrossing(p.x, p.z, 7)) continue;
        if (st === streets.tenth && (Math.abs(s - GATE_S) < 6 || (o < 0 && s > LOT_S[0] && s < LOT_S[1]))) continue;
        B.add(MAT.red, lampGeo.pole, M(p.x, 0, p.z)); B.add(MAT.gold, lampGeo.collar, M(p.x, 2.6, p.z)); B.add(MAT.gold, lampGeo.collar, M(p.x, 4.25, p.z));
        B.add(MAT.warm, lampGeo.house, M(p.x, 4.3, p.z)); B.add(MAT.gtile, lampGeo.roof, M(p.x, 4.86, p.z, yaw(p.tx, p.tz)));
        B.add(MAT.gold, lampGeo.tip, M(p.x, 5.22, p.z));
      }
    }
  };
  lamps(streets.race, 24); lamps(streets.tenth, 24); lamps(streets.ninth, 26);

  // ---- the Friendship Gate on 10th Street (local x across the street to the east, z to the south)
  const T10 = streets.tenth, g0 = T10.at(GATE_S, .5), gateYaw = yaw(g0.tx, g0.tz);
  const gateM = M(g0.x, 0, g0.z, gateYaw), GM = (...a) => gateM.clone().multiply(M(...a));
  {
    const MAIN = 4.4, SIDE = 6.5;   // pillar positions either side of the middle
    for (const sx of [-1, 1]) {
      B.add(MAT.dstone, box(1.1, .5, 1.1), GM(sx * MAIN, 0, 0)); B.add(MAT.red, cyl(.33, .33, 8.6, 14), GM(sx * MAIN, .5, 0));
      B.add(MAT.gold, cyl(.38, .38, .18, 14), GM(sx * MAIN, 7.2, 0)); B.add(MAT.gold, cyl(.38, .38, .18, 14), GM(sx * MAIN, .5, 0));
      B.add(MAT.dstone, box(.8, .4, .8), GM(sx * SIDE, 0, 0)); B.add(MAT.red, cyl(.24, .24, 6.0, 12), GM(sx * SIDE, .4, 0));
      // side span: beam, brackets, little roof
      const mid = sx * (MAIN + SIDE) / 2, span = SIDE - MAIN;
      B.add(MAT.beam, box(span, .42, .5), GM(mid, 5.0, 0)); B.add(MAT.green, box(span + .3, .3, .8), GM(mid, 5.9, 0));
      B.add(MAT.red, box(span, .45, .35), GM(mid, 5.45, 0));
      B.add(MAT.tile, hipRoof(span + 2.2, 2.6, 1.15, .42), GM(mid, 6.2, 0)); B.add(MAT.gold, box(span + .6, .16, .16), GM(mid, 7.35, 0));
      // the stone lions guarding each side, facing south toward Arch Street
      const lx = sx * (SIDE - .2), lz = 1.3;
      B.add(MAT.stone, box(.8, .9, 1.0), GM(lx, 0, lz)); B.add(MAT.stone, sph(.36, 10, 8), GM(lx, 1.35, lz - .05, 0, 1, .95, 1.2));
      B.add(MAT.stone, sph(.3, 10, 8), GM(lx, 1.85, lz + .25)); B.add(MAT.dstone, sph(.2, 8, 6), GM(lx, 1.92, lz + .33, 0, 1.15, .9, .6));
      B.add(MAT.stone, sph(.14, 8, 6), GM(lx + sx * -.18, 1.12, lz + .38));
      // the ends of the main roof's ridge curl up
    }
    // main span: beams, the plaque, the bracket band and the big roof
    B.add(MAT.beam, box(2 * MAIN + .9, .55, .6), GM(0, 6.9, 0)); B.add(MAT.red, box(2 * MAIN + .7, .4, .45), GM(0, 7.45, 0));
    B.add(MAT.beam, box(2 * MAIN + .9, .5, .6), GM(0, 9.35, 0)); B.add(MAT.green, box(2 * MAIN + 1.4, .45, 1.1), GM(0, 9.85, 0));
    B.add(MAT.gold, box(2 * MAIN + 1.5, .12, 1.2), GM(0, 10.3, 0));
    B.add(MAT.red, box(3.6, 1.6, .3), GM(0, 7.8, 0));
    for (const sz of [1, -1]) SIGNS.quad(V(0, 8.6, sz * .17).applyMatrix4(gateM), V(sz * 1.6, 0, 0).transformDirection(gateM).multiplyScalar(1.6), V(0, .7, 0), PLAQUE);
    B.add(MAT.tile, hipRoof(2 * MAIN + 4.4, 4.0, 2.1, .7), GM(0, 10.4, 0));
    B.add(MAT.gold, box(2 * MAIN - 1, .3, .3), GM(0, 12.4, 0));
    for (const sx of [-1, 1]) { B.add(MAT.gold, box(.3, .9, .3), GM(sx * (MAIN - .4), 12.4, 0, 0, 1, 1, 1, 0, sx * .5)); }
    B.add(MAT.gold, sph(.32, 12, 10), GM(0, 12.95, 0)); B.add(MAT.red, sph(.2, 10, 8), GM(0, 13.35, 0));
    // two big lanterns hang under the main beam
    for (const sx of [-1.9, 1.9]) { B.add(MAT.dark, cyl(.015, .015, .9), GM(sx, 5.95, 0)); lanternAt(...V(sx, 5.45, 0).applyMatrix4(gateM).toArray(), 1.5); }
  }

  // ---- the night market on the open lot east of 10th St between Race and Cherry (our addition)
  // lot frame: x east from 10th's centreline (u), z south along 10th (v). Between the footprints the
  // lot is open for u 8..46.5 and v -8.2..3.7, and behind the south row for u 26..46.5 as far as v 20
  const l0 = T10.at((LOT_S[0] + LOT_S[1]) / 2, 0), lotYaw = yaw(l0.tx, l0.tz), lotM = M(l0.x, LOT_Y, l0.z, lotYaw);
  const LM = (...a) => lotM.clone().multiply(M(...a)), LP = (x, y, z) => V(x, y, z).applyMatrix4(lotM);
  B.add(MAT.pave, box(39, LOT_Y - .02, 12), M(...V(27.3, -LOT_Y, -2.6).applyMatrix4(lotM).toArray(), lotYaw));
  B.add(MAT.pave, box(20.5, LOT_Y - .02, 17.1), M(...V(36.25, -LOT_Y, 11.95).applyMatrix4(lotM).toArray(), lotYaw));
  const NORTH = -6.6, SOUTH = 2.0, TABLES = -2.2;   // the two rows of stalls and the tables in the aisle
  const lotQuad = (c, r, u, cell) => SIGNS.quad(c.clone().applyMatrix4(lotM), r.clone().transformDirection(lotM).multiplyScalar(r.length()), u, cell);
  // the entrance: two red posts and a lit "夜市 NIGHT MARKET" board facing 10th Street
  for (const z of [-8, 2.6]) { B.add(MAT.red, cyl(.12, .14, 4.4, 10), LM(8.2, 0, z)); B.add(MAT.gold, sph(.16, 8, 6), LM(8.2, 4.5, z)); }
  B.add(MAT.red, box(.3, .35, 11), LM(8.2, 4.0, -2.7)); B.add(MAT.gtile, hipRoof(11.8, 1.2, .5, .3), LM(8.2, 4.35, -2.7, Math.PI / 2));
  lotQuad(V(8.0, 3.35, -2.7), V(0, 0, -2.4), V(0, .6, 0), boardCell(16)); lotQuad(V(8.4, 3.35, -2.7), V(0, 0, 2.4), V(0, .6, 0), boardCell(16));
  for (const z of [-6.2, .8]) { lanternAt(...LP(8.2, 3.0, z).toArray(), 1); }

  /** a market stall at (x, z) in the lot, facing +z (dir 1) or -z (dir -1) */
  const STALL_COLORS = ['#c22a1f', '#e0a92a', '#2f7d5b', '#1e4d8c', '#d0601c', '#7a2a8c'].map(c => std(c, { roughness: .85, side: THREE.DoubleSide }));
  // Print across the slope so the name is visible above the arcade cabinets and from overhead.
  const arcadePrint = tex(512, 128, (g, w, h) => {
    g.fillStyle = '#c22a1f'; g.fillRect(0, 0, w, h);
    g.font = `900 66px ${LAT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.strokeStyle = '#4c1319'; g.lineWidth = 8; g.lineJoin = 'round';
    g.strokeText('LUCKY ARCADE', w / 2, h * .72, w * .66);
    g.fillStyle = '#fff3cf'; g.fillText('LUCKY ARCADE', w / 2, h * .72, w * .66);
  });
  const arcadeCanopy = std('#ffffff', { roughness: .85, side: THREE.DoubleSide, map: arcadePrint,
    emissive: '#ffffff', emissiveMap: arcadePrint, emissiveIntensity: .28 });
  const stalls = [];
  function stall(x, z, dir, kind, board, w = 3.6, color = 0) {
    const ry = dir > 0 ? 0 : Math.PI, SM = (...a) => LM(x, 0, z).multiply(M(0, 0, 0, ry)).multiply(M(...a));
    const D = 2.2, cm = STALL_COLORS[color % STALL_COLORS.length];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.add(MAT.red, cyl(.05, .05, 2.6, 6), SM(sx * (w / 2 - .1), 0, sz * (D / 2 - .1)));
    B.add(cm, box(w, 2.2, .05), SM(0, 0, -D / 2 + .05));                                    // back cloth
    B.add(MAT.wood, box(w - .3, .95, .5), SM(0, 0, D / 2 - .45));                            // counter
    B.add(MAT.tan, box(w - .2, .05, .6), SM(0, .95, D / 2 - .45));
    const isArcade = kind === 'arcade';
    B.add(isArcade ? arcadeCanopy : cm, hipRoof(w + .8, D + .7, .7, .22, isArcade), SM(0, 2.6, 0)); // canopy
    B.add(cm, box(w + .5, .3, .03), SM(0, 2.3, D / 2 + .32));                                 // valance
    const c = V(0, 2.0, D / 2 - .02).applyMatrix4(M(x, 0, z, ry)), r = V(Math.min(1.5, w / 2 - .25), 0, 0).applyAxisAngle(V(0, 1, 0), ry);
    lotQuad(c, r, V(0, .37, 0), boardCell(board));
    const top = (gx, gz) => SM(gx, 1.0, D / 2 - .45 + gz);   // on the counter
    if (kind === 'dumpling') for (const gx of [-1, 0, 1]) for (let k = 0; k < 3; k++) { B.add(MAT.tan, cyl(.22, .22, .11, 12), top(gx * .55, 0).multiply(M(0, k * .12, 0))); }
    if (kind === 'bao') for (const gx of [-.8, .8]) { B.add(MAT.tan, cyl(.34, .34, .03, 14), top(gx, 0)); for (let k = 0; k < 6; k++) B.add(MAT.white, sph(.075, 8, 5), top(gx + .17 * Math.cos(k * 1.05), .17 * Math.sin(k * 1.05)).multiply(M(0, .05, 0, 0, 1, .7, 1))); }
    if (kind === 'tea') { const tc = ['#b79ad8', '#a0714a', '#8fc27a', '#f2a7c3', '#e8d6a8']; for (let k = 0; k < 9; k++) B.add(MAT.fruit, cyl(.045, .04, .17, 8), top(-1.2 + k * .3, (k % 2) * .12 - .06), new THREE.Color(tc[k % tc.length])); }
    if (kind === 'skewer') { B.add(MAT.black, box(1.6, .2, .45), top(0, 0)); B.add(MAT.coal, box(1.5, .02, .38), top(0, 0).multiply(M(0, .2, 0))); for (let k = 0; k < 9; k++) B.add(MAT.wood, cyl(.008, .008, .5, 4), top(-.7 + k * .17, 0).multiply(M(0, .25, 0, 0, 1, 1, 1, Math.PI / 2))); }
    if (kind === 'noodle') { B.add(MAT.steel, cyl(.32, .3, .45, 14), top(-.9, 0)); for (let k = 0; k < 5; k++) B.add(MAT.white, cyl(.13, .08, .09, 10), top(-.2 + k * .33, (k % 2) * .1)); }
    if (kind === 'fruit') {
      const fc = ['#f28c1c', '#d62b1f', '#f2d23a', '#7dbb3a', '#e0457b', '#5a2a6a'];
      for (let k = 0; k < 4; k++) {
        const cx = -1.2 + k * .8; B.add(MAT.wood, box(.7, .22, .45), top(cx, 0).multiply(M(0, 0, 0, 0, 1, 1, 1, -.2)));
        for (let j = 0; j < 14; j++) B.add(MAT.fruit, sph(.065, 7, 5), top(cx - .25 + (j % 5) * .125, -.12 + Math.floor(j / 5) * .12).multiply(M(0, .22 + Math.floor(j / 5) * .03, 0)), new THREE.Color(fc[k + (j % 3 === 0 ? 1 : 0)]));
      }
    }
    if (kind === 'lantern') {
      const lc = ['#d62b1f', '#f2c13a', '#e0457b', '#d62b1f', '#2b5d9b', '#d62b1f'];
      for (let k = 0; k < 6; k++) { B.add(MAT.dark, cyl(.008, .008, .4, 4), SM(-1.4 + k * .56, 2.05, D / 2 - .05)); B.add(MAT.fruit, sph(.17, 10, 7), SM(-1.4 + k * .56, 1.88, D / 2 - .05).multiply(M(0, 0, 0, 0, 1, .8, 1)), new THREE.Color(lc[k])); }
      for (let k = 0; k < 6; k++) B.add(MAT.fruit, box(.18, .12, .12), top(-1.2 + k * .48, 0), new THREE.Color(['#f2c13a', '#c8261c'][k % 2]));
    }
    stalls.push({ x, z, dir, kind });
    return SM;
  }
  // north row faces south into the aisle, south row faces north
  const SM_ARC = stall(12.4, NORTH, 1, 'arcade', 8, 4.2, 0);
  [[18.4, 'dumpling', 9], [23.4, 'tea', 10], [28.4, 'skewer', 11], [33.4, 'fruit', 12], [38.4, 'lantern', 13], [43.4, 'noodle', 14]].forEach(([x, k, b], i) => stall(x, NORTH, 1, k, b, 3.6, i + 1));
  [[15.5, 'bao', 15], [21, 'skewer', 11], [29.5, 'dumpling', 9], [35.5, 'noodle', 14], [41.5, 'tea', 10]].forEach(([x, k, b], i) => stall(x, SOUTH, -1, k, b, 3.6, i + 3));

  // Lucky Arcade: two cabinets out front, a TV on the counter, prizes on the back wall, neon
  const screen = document.createElement('canvas'); screen.width = 160; screen.height = 120;
  const scr = screen.getContext('2d'), scrTex = new THREE.CanvasTexture(screen);
  const scrMat = new THREE.MeshBasicMaterial({ map: scrTex });
  let attract = 0;
  const drawScreen = t => {   // the attract loop: a rally, then the names of the games
    scr.fillStyle = '#05040c'; scr.fillRect(0, 0, 160, 120);
    const k = Math.floor(t / 4) % 3;
    if (k === 0) {
      scr.fillStyle = '#1d6b4a'; scr.fillRect(8, 14, 144, 92); scr.fillStyle = '#fff'; scr.fillRect(79, 14, 2, 92);
      const bx = 20 + Math.abs(((t * 70) % 240) - 120), by = 24 + Math.abs(((t * 47) % 144) - 72);
      scr.fillStyle = '#ff4f3a'; scr.fillRect(10, by - 10, 4, 20); scr.fillStyle = '#4fd8ff'; scr.fillRect(146, by - 8, 4, 20);
      scr.fillStyle = '#fff6c8'; scr.fillRect(bx, by, 4, 4);
    } else {
      scr.fillStyle = k === 1 ? '#ff4fd8' : '#4ff3ff'; scr.font = 'bold 18px monospace'; scr.textAlign = 'center';
      scr.fillText(k === 1 ? 'SKY SWARM' : 'DUMPLING', 80, 50); if (k === 2) scr.fillText('DASH', 80, 70);
      if (Math.floor(t * 2) % 2) { scr.fillStyle = '#fff'; scr.font = '11px monospace'; scr.fillText('PRESS START', 80, 100); }
    }
    scrTex.needsUpdate = true;
  };
  drawScreen(0);
  for (const sx of [-1, 1]) {
    const CM = (...a) => SM_ARC(sx * 1.55, 0, 1.75).multiply(M(...a));
    B.add(MAT.dark, box(.78, 1.8, .72), CM(0, 0, 0)); B.add(sx < 0 ? MAT.red : MAT.blue, box(.8, 1.5, .6), CM(0, .1, -.02));
    B.add(MAT.dark, box(.82, .2, .4), CM(0, .95, .3, 0, 1, 1, 1, .35));
    B.add(MAT.gold, sph(.04, 6, 5), CM(-.15, 1.1, .38)); B.add(MAT.neonP, sph(.035, 6, 5), CM(.05, 1.08, .4)); B.add(MAT.neonC, sph(.035, 6, 5), CM(.17, 1.08, .4));
    B.add(scrMat, new THREE.PlaneGeometry(.6, .45), CM(0, 1.45, .37, 0, 1, 1, 1, -.12));
    B.add(sx < 0 ? MAT.neonP : MAT.neonC, box(.8, .22, .25), CM(0, 1.8, .2));
  }
  B.add(MAT.dark, box(.6, .45, .45), SM_ARC(0, 1.0, .65)); B.add(scrMat, new THREE.PlaneGeometry(.48, .34), SM_ARC(0, 1.23, .88));
  for (const y of [.8, 1.45]) {   // prize shelves
    B.add(MAT.wood, box(3.6, .05, .35), SM_ARC(0, y, -.82));
    for (let k = 0; k < 7; k++) {
      const px = -1.5 + k * .5, panda = k % 3 === 1;
      B.add(MAT.fruit, sph(.15, 9, 7), SM_ARC(px, y + .2, -.82), new THREE.Color(panda ? '#f4f4f0' : ['#f2a7c3', '#f2c13a', '#7ec8e3', '#b79ad8'][k % 4]));
      B.add(MAT.fruit, sph(.12, 9, 7), SM_ARC(px, y + .42, -.8), new THREE.Color(panda ? '#f4f4f0' : ['#f2a7c3', '#f2c13a', '#7ec8e3', '#b79ad8'][k % 4]));
      if (panda) for (const ex of [-.08, .08]) B.add(MAT.fruit, sph(.045, 6, 5), SM_ARC(px + ex, y + .52, -.8), new THREE.Color('#151515'));
    }
  }
  for (const [x0, x1, y] of [[-2.05, 2.05, 2.38], [-2.05, 2.05, 1.62]]) B.add(y > 2 ? MAT.neonP : MAT.neonC, box(x1 - x0, .04, .04), SM_ARC(0, y, 1.13));
  for (const sx of [-1, 1]) B.add(MAT.neonC, box(.04, .8, .04), SM_ARC(sx * 2.05, 1.6, 1.13));
  { // a blade sign on the stall's street-side post, read from 10th Street and from inside the market
    const c = V(-2.35, 3.2, .9).applyMatrix4(M(12.4, 0, NORTH, 0)), along = V(0, 0, .32), up = V(0, 1.15, 0);
    lotQuad(c.clone().add(V(-.02, 0, 0)), along, up, bladeCell(6)); lotQuad(c.clone().add(V(.02, 0, 0)), along.clone().negate(), up, bladeCell(6));
  }

  // tables and stools in the aisle, and the pavilion out back
  for (const x of [19.5, 30.5, 41]) {
    B.add(MAT.red, cyl(.55, .55, .05, 14), LM(x, .72, TABLES)); B.add(MAT.dark, cyl(.04, .04, .72, 6), LM(x, 0, TABLES));
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + .4; B.add(MAT.blue, cyl(.17, .15, .45, 10), LM(x + Math.cos(a) * .9, 0, TABLES + Math.sin(a) * .9)); }
  }
  {
    const px = 40, pz = 12.2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { B.add(MAT.red, cyl(.16, .16, 3.0, 10), LM(px + sx * 2.4, .25, pz + sz * 2.4)); B.add(MAT.gold, cyl(.2, .2, .1, 10), LM(px + sx * 2.4, 3.2, pz + sz * 2.4)); }
    B.add(MAT.stone, box(6.2, .25, 6.2), LM(px, 0, pz)); B.add(MAT.beam, box(5.3, .35, 5.3), LM(px, 3.15, pz));
    B.add(MAT.gtile, hipRoof(7.4, 7.4, 1.8, .55), LM(px, 3.5, pz)); B.add(MAT.red, box(1.4, 1, 1.4), LM(px, 4.9, pz));
    B.add(MAT.gtile, hipRoof(3.4, 3.4, 1.3, .35), LM(px, 5.8, pz)); B.add(MAT.gold, sph(.22, 10, 8), LM(px, 7.15, pz)); B.add(MAT.gold, cyl(.05, .02, .7, 6), LM(px, 7.3, pz));
    for (const [sx, sz, r] of [[0, -1.6, 0], [0, 1.6, 0], [-1.6, 0, Math.PI / 2], [1.6, 0, Math.PI / 2]]) B.add(MAT.wood, box(2.4, .1, .4), LM(px + sx, .65, pz + sz, r));
    lanternAt(...LP(px, 2.6, pz).toArray(), 1.2);
  }
  // string lights over the aisle: zigzags from the north canopies to the south ones
  const bulbs = [];
  for (let x = 10; x < 42; x += 4.5) {
    const a = LP(x, 3.15, NORTH + 1.2), b = LP(x + 2.2, 3.15, SOUTH - 1.2);
    for (let k = 0; k <= 12; k++) {
      const t = k / 12, p = a.clone().lerp(b, t); p.y -= .45 * 4 * t * (1 - t);
      if (k) wire.push(bulbs.length ? bulbs[bulbs.length - 1].clone() : p, p);
      bulbs.push(p);
    }
    bulbs.push(null);
  }
  for (const p of bulbs) if (p) B.add(MAT.bulb, sph(.055, 6, 5), M(p.x, p.y - .06, p.z));

  // ---- people in the market (still, so baked into one mesh): stallholders, diners, two players
  const SKIN = ['#e8c39e', '#d9a877', '#c08a5a', '#f0cfac', '#8d5a3c'], HAIR = ['#141010', '#1d1410', '#2a1d16', '#5a5a58', '#3a2a20'];
  const SHIRT = ['#f4f1ea', '#c8261c', '#2b5d9b', '#3d6b4a', '#e0a92a', '#6a2a8c', '#333a44', '#e07b39'];
  const holder = new THREE.Group();
  function bake(F, m) {
    holder.add(F.root); F.root.matrixAutoUpdate = false; F.root.matrix.copy(m); holder.updateMatrixWorld(true);
    F.root.traverse(o => { if (o.isMesh) B.add(MAT.people, o.geometry, o.matrixWorld.clone(), o.material.color); });
    holder.remove(F.root);
  }
  const person = (i, m, how) => {
    const F = makeFigure({ shirt: SHIRT[i % SHIRT.length], skin: SKIN[(i * 3) % SKIN.length], hair: HAIR[(i * 7) % HAIR.length], shorts: ['#26303a', '#3a3f4a', '#1d1d24'][i % 3] });
    if (how === 'sit') { F.pelvis.position.y = .5; F.hipL.rotation.x = F.hipR.rotation.x = -1.45; F.kneeL.rotation.x = F.kneeR.rotation.x = 1.45; F.shL.rotation.x = F.shR.rotation.x = -.6; F.elL.rotation.x = F.elR.rotation.x = -.9; }
    if (how === 'serve') { F.shL.rotation.x = -.5; F.elL.rotation.x = -.8; F.shR.rotation.x = -.2; F.chest.rotation.y = .2 * Math.sin(i); }
    if (how === 'play') { F.shL.rotation.x = F.shR.rotation.x = -.75; F.elL.rotation.x = F.elR.rotation.x = -.55; F.pelvis.rotation.x = .08; }
    bake(F, m);
  };
  let pi = 0;
  for (const s of stalls) if (s.kind === 'arcade' || hash(s.x, 3) < .8) person(pi++, LM(s.x, 0, s.z - s.dir * .35, s.dir > 0 ? 0 : Math.PI), 'serve');
  for (const sx of [-1, 1]) person(pi++, SM_ARC(sx * 1.55, 0, 2.55, Math.PI), 'play');   // at the cabinets, facing them
  for (const [x, a] of [[19.5, .4], [19.5, 3.5], [30.5, 2], [41, .4 + Math.PI / 2]]) person(pi++, LM(x + Math.cos(a) * .9, 0, TABLES + Math.sin(a) * .9, Math.atan2(-Math.cos(a), -Math.sin(a))), 'sit');

  // ---- the dragon dance on Race Street: a loop up one side of the middle and back the other
  const R = streets.race, [rA, rB] = R.side, rc = (rA + rB) / 2, LANE = 2.1, SA = 40, SB = R.length - 40;
  const LSTR = SB - SA, LOOP = 2 * LSTR + 2 * Math.PI * LANE;
  const loopAt = q => {
    q = ((q % LOOP) + LOOP) % LOOP;
    if (q < LSTR) return R.at(SA + q, rc + LANE);
    q -= LSTR; if (q < Math.PI * LANE) { const f = q / LANE; return R.at(SB + LANE * Math.sin(f), rc + LANE * Math.cos(f)); }
    q -= Math.PI * LANE; if (q < LSTR) return R.at(SB - q, rc - LANE);
    q -= LSTR; const f = q / LANE; return R.at(SA - LANE * Math.sin(f), rc - LANE * Math.cos(f));
  };
  const dragon = new THREE.Group(); dragon.name = 'dragon-dance'; group.add(dragon);
  const scales = tex(128, 64, (g, w, h) => {
    g.fillStyle = '#c8201a'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) for (let x = (y / 16 % 2) * 8; x < w + 16; x += 16) { g.beginPath(); g.arc(x, y, 8, 0, Math.PI); g.strokeStyle = '#f2c13a'; g.lineWidth = 2.5; g.stroke(); }
    g.fillStyle = '#f2c13a'; g.fillRect(0, h - 10, w, 10); g.fillStyle = '#2f7d5b'; g.fillRect(0, 0, w, 5);
  }, 3, 1);
  const bodyMat = std('#ffffff', { map: scales, roughness: .7 }), N_SEG = 11, SPACING = 1.05;
  const segGeo = new THREE.CylinderGeometry(.46, .46, 1.0, 14, 1, true); segGeo.rotateX(Math.PI / 2);
  const segs = [];
  for (let i = 1; i < N_SEG; i++) { const m = new THREE.Mesh(segGeo, bodyMat); m.castShadow = true; m.scale.setScalar(1 - Math.max(0, i - 6) * .1); dragon.add(m); segs.push(m); }
  const tail = new THREE.Mesh((() => { const g = new THREE.ConeGeometry(.38, 1.2, 12, 1, true); g.rotateX(-Math.PI / 2); g.translate(0, 0, -.5); return g; })(), bodyMat); dragon.add(tail);
  const head = new THREE.Group(); dragon.add(head);
  { // the head: red snout and brow, gold horns and whiskers, big eyes, an open mouth
    const HB = batch(), hc = (c) => new THREE.Color(c), hm = std('#ffffff', { vertexColors: true, roughness: .55 });
    const add = (g, m, c) => HB.add(hm, g, m, hc(c));
    add(box(.95, .7, 1.1), M(0, -.35, .1), '#c8201a'); add(box(.8, .28, .7), M(0, -.5, .75), '#c8201a'); add(box(.8, .14, .6), M(0, -.72, .7), '#f2c13a');
    add(box(1.05, .3, .5), M(0, .25, .05), '#f2c13a'); add(box(.7, .18, .4), M(0, -.34, .95), '#151515');
    for (const sx of [-1, 1]) {
      add(sph(.17, 10, 8), M(sx * .3, .12, .5), '#ffffff'); add(sph(.08, 8, 6), M(sx * .3, .14, .63), '#151515');
      add(cyl(.07, .02, .75, 6), M(sx * .28, .35, -.2, 0, 1, 1, 1, -.7, sx * .35), '#f2c13a');
      add(cyl(.02, .01, .9, 4), M(sx * .4, -.45, 1.0, 0, 1, 1, 1, 1.9, sx * .9), '#f2c13a');
      add(box(.06, .5, .45), M(sx * .5, -.6, .2), '#2f7d5b');
    }
    add(sph(.14, 8, 6), M(0, -.25, 1.18), '#151515');
    for (let k = 0; k < 6; k++) add(cyl(.04, .01, .5, 4), M(-.4 + k * .16, -.95, .6, 0, 1, 1, 1, Math.PI, 0), '#f4f1ea');   // beard
    HB.build(head);
  }
  const dancers = [], poles = [], poleGeo = cyl(.03, .03, 1, 5);
  for (let k = 0; k < 6; k++) {
    const F = makeFigure({ shirt: '#f2c13a', shorts: '#1d1d24', skin: SKIN[k % SKIN.length], hair: HAIR[k % HAIR.length], shoe: '#c8201a' });
    dragon.add(F.root); dancers.push(F);
    const p = new THREE.Mesh(poleGeo, MAT.dark); dragon.add(p); poles.push(p);
  }
  const posAt = (q, i, t) => { const p = loopAt(q), n = loopAt(q + .5), tx = n.x - p.x, tz = n.z - p.z, l = Math.hypot(tx, tz) || 1, w = .45 * Math.sin(t * 1.7 - i * .55);
    const x = p.x - tz / l * w, z = p.z + tx / l * w, g = surface(x, z);   // g: the street's real height (terrain.js)
    return { x, z, g, y: g + .8 + 2.25 + .42 * Math.sin(t * 2.5 - i * .7), tx: tx / l, tz: tz / l }; };
  let dq = 0, dt0 = 0, walk = 0;
  const DCENTER = V(1718, 0, 66), tmp = V(0, 0, 0);
  function animateDragon(dt) {
    dt0 += dt; dq += dt * 1.35; walk += dt * 1.35 * 1.6 * 2.2;
    const P = []; for (let i = 0; i <= N_SEG + 1; i++) P.push(posAt(dq - i * SPACING, i, dt0));
    head.position.set(P[0].x, P[0].y + .25, P[0].z); head.lookAt(tmp.set(P[0].x + P[0].tx, P[0].y + .25 + .15 * Math.sin(dt0 * 3), P[0].z + P[0].tz));
    head.rotateZ(.12 * Math.sin(dt0 * 2.2));
    segs.forEach((m, k) => { const a = P[k + 1], b = P[k]; m.position.set(a.x, a.y, a.z); m.lookAt(tmp.set(b.x, b.y, b.z)); });
    const tl = P[N_SEG], tb = P[N_SEG - 1]; tail.position.set(tl.x, tl.y, tl.z); tail.lookAt(tmp.set(tb.x, tb.y, tb.z));
    dancers.forEach((F, k) => {
      const a = P[k * 2], r = F.root; r.position.set(a.x, a.g + .8, a.z); r.rotation.y = yaw(a.tx, a.tz);
      pose(F, walk + k * 1.3, 1.6);
      const reach = Math.min(1, Math.max(0, (a.y - a.g - .8 - 1.9) / .9));
      F.shL.rotation.x = F.shR.rotation.x = -2.6 - .4 * reach; F.elL.rotation.x = F.elR.rotation.x = -.15; F.shL.rotation.z = .12; F.shR.rotation.z = -.12;
      const top = a.y - .35, bot = a.g + .8 + 2.05, pl = poles[k]; pl.position.set(a.x, bot, a.z); pl.scale.set(1, Math.max(.1, top - bot), 1);
    });
  }
  animateDragon(0);

  // ---- assemble
  B.build(group);
  const signMesh = new THREE.Mesh(SIGNS.geometry(), MAT.sign); signMesh.receiveShadow = true; group.add(signMesh);
  const wires = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wire), new THREE.LineBasicMaterial({ color: '#2a2a2a' })); group.add(wires);
  // on terrain: each built piece rises by the ground right under it (the dragon dance does so as it moves)
  if (terrain.on) { group.updateMatrixWorld(true); for (const o of [...group.children]) if (o !== dragon && (o.isMesh || o.isLineSegments)) drape(o); }
  group.userData.terrain = 'done';

  // the arcade stall: where to click, and the view the camera flies to
  // (from over 10th St south of the lot: the line of sight passes just north of the corner building)
  const stallPos = LP(12.4, 1.5, NORTH + .5); stallPos.y += surface(stallPos.x, stallPos.z);
  const stallView = { id: 'nightmarket', name: 'Chinatown night market', pos: LP(-3, 26, 22), target: LP(12.4, 1.2, NORTH + 1) };
  const pv = V(0, 0, 0);
  function pickStall(camera, x, y, w, h) {
    const dist = stallPos.distanceTo(camera.position); if (dist > 600) return false;
    pv.copy(stallPos).project(camera); if (pv.z > 1) return false;
    const f = h / (2 * Math.tan(camera.fov * Math.PI / 360)), tol = Math.max(14, f * 2.4 / dist);
    return Math.hypot((pv.x + 1) / 2 * w - x, (1 - pv.y) / 2 * h - y) < tol;
  }

  function update(dt, camera) {
    const d = camera.position.distanceTo(DCENTER);
    if (d < 900) animateDragon(dt);
    if (stallPos.distanceTo(camera.position) < 160) { attract += dt; if (Math.floor(attract * 8) !== Math.floor((attract - dt) * 8)) drawScreen(attract); }
  }

  const gateTop = V(g0.x, 15, g0.z), mid = LP(28, 7, -2.5);
  const labels = [
    { text: 'Chinatown', pos: V(1718, 32, 66), far: 3200 },
    { text: 'Friendship Gate', pos: gateTop, far: 1500 },
    { text: 'Night market & Lucky Arcade', pos: mid, far: 900 },
  ];
  // looking north up 10th Street through the gate, from just south of Arch Street
  const v0 = T10.at(GATE_S + 34, .5), v1 = T10.at(GATE_S - 70, .5);
  const views = [
    { id: 'chinatown', name: 'Chinatown', pos: V(v0.x, 13, v0.z), target: V(v1.x, 6, v1.z) },
    stallView,
  ];
  return { group, update, pickStall, stallView, labels, views, counts: { signs: SIGNS.count, awnings: nAwn, stalls: stalls.length, bulbs: bulbs.filter(Boolean).length } };
}
