// djour's starred food spots in Philadelphia (data/phl/restaurants.json, built by
// tools/phl/build_restaurants.py from djour's map, https://www.djourformore.com/):
//  - a storefront on each one's building, on the wall that faces its street: a painted frame,
//    shop windows that glow warm after dark, a door, an awning in the place's colours and a sign
//    board with its name and stars (lit at night); bars get a lit sign and lanterns instead of an
//    awning, cafés and bakeries a bistro table or two outside, three-star places a blade sign,
//    breweries a roll-up tap-room door and picnic tables;
//  - food trucks parked at the kerb, serving hatch to the pavement; farmers markets as rows of tents;
//  - places with no wall to stand on get a lit menu board on a post;
//  - a label for each and a camera view (ui.js lists them under "Restaurants" and shows djour's note).
// Every part is merged into one mesh per material: the whole set costs a handful of draw calls.
import * as THREE from 'three';
import { litMats } from '../materials.js';
import { terrain, surface } from '../terrain.js';

const LAT = 'Archivo,"Segoe UI",Arial,sans-serif';
// per kind: storefront width cap (m), sign colours [board, ink], awning colours
const KIND = {
  restaurant: { w: 7.5, sign: [['#1d2b2a', '#f1e3c2'], ['#5a1f1f', '#f6dca0'], ['#f3ead8', '#2a2a2a'], ['#203a5c', '#f2efe6']], awn: ['#7a1f24', '#1f4a3a', '#22324f', '#3b2a22', '#b0472b', '#6b5b2e'] },
  bar: { w: 6, sign: [['#121212', '#ffb347'], ['#14202e', '#7fe3ff'], ['#1c0f1a', '#ff6fb5']], awn: [] },
  cafe: { w: 5.5, sign: [['#f6efe2', '#3a2a1f'], ['#2f4a3c', '#f4ead2'], ['#c9643a', '#fff4e0']], awn: ['#2f4a3c', '#c9643a', '#55331f', '#d7a43b'] },
  bakery: { w: 5.5, sign: [['#fff3e6', '#8a2f3a'], ['#f2c9cf', '#5a2230'], ['#3d2a1e', '#f6d9a6']], awn: ['#e7a7b3', '#8a2f3a', '#e8c37a', '#6e8f6a'] },
  brewery: { w: 9, sign: [['#1b1b1b', '#e8b04a'], ['#2b3a2a', '#f1e6c8']], awn: [] },
  truck: { sign: [['#ffd23f', '#1b1b1b'], ['#e2412f', '#ffffff'], ['#2d7dd2', '#ffffff'], ['#3bb273', '#ffffff']] },
  market: { sign: [['#2f6b3a', '#ffffff']] },
};
const FRAME = ['#2b2f33', '#3d2b22', '#1f3b33', '#4a1f22', '#e8e1d2', '#20304a', '#5b5f63'];
const hash = (s, k = 0) => { let h = 2166136261 ^ k; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return ((h >>> 0) % 10000) / 10000; };
const pick = (arr, s, k) => arr[Math.floor(hash(s, k) * arr.length) % arr.length];
const stars = n => '★'.repeat(n);

// ---- geometry: base at y = 0, then placed by a matrix
const box = (w, h, d) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0); return g; };
const cyl = (r0, r1, h, seg = 10) => { const g = new THREE.CylinderGeometry(r0, r1, h, seg); g.translate(0, h / 2, 0); return g; };
/** a w x h panel facing +z, its bottom edge at y = 0, with uv [u0, v0, u1, v1] */
function panel(w, h, uv = [0, 0, 1, 1]) {
  const g = new THREE.PlaneGeometry(w, h); g.translate(0, h / 2, 0);
  const a = g.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) ? uv[2] : uv[0], a.getY(i) ? uv[3] : uv[1]);
  return g;
}
const M = (x, y, z, ry = 0, rx = 0) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, 0, 'YXZ')).setPosition(x, y, z);

/** collect geometry per material, merged at the end (positions, normals, uvs and a colour) */
function batch() {
  const sets = new Map();
  return {
    add(mat, g, m, c) { let s = sets.get(mat); if (!s) sets.set(mat, s = []); s.push({ g, m, c }); },
    build(group) {
      for (const [mat, list] of sets) {
        let nV = 0, nI = 0;
        const parts = list.map(({ g, m, c }) => { const q = g.clone().applyMatrix4(m); nV += q.attributes.position.count; nI += q.index ? q.index.count : q.attributes.position.count; return [q, c]; });
        const pos = new Float32Array(nV * 3), nrm = new Float32Array(nV * 3), uv = new Float32Array(nV * 2), col = new Float32Array(nV * 3), idx = new Uint32Array(nI);
        let v = 0, k = 0;
        for (const [q, c] of parts) {
          const n = q.attributes.position.count;
          pos.set(q.attributes.position.array, v * 3); nrm.set(q.attributes.normal.array, v * 3); uv.set(q.attributes.uv.array, v * 2);
          for (let i = 0; i < n; i++) { col[(v + i) * 3] = c ? c.r : 1; col[(v + i) * 3 + 1] = c ? c.g : 1; col[(v + i) * 3 + 2] = c ? c.b : 1; }
          if (q.index) for (let i = 0; i < q.index.count; i++) idx[k++] = v + q.index.array[i]; else for (let i = 0; i < n; i++) idx[k++] = v + i;
          v += n;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeBoundingSphere();
        const mesh = new THREE.Mesh(g, mat); mesh.name = 'restaurants'; mesh.castShadow = !mat.userData.noCast; mesh.receiveShadow = true; group.add(mesh);
      }
    },
  };
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
}

/** one atlas holding every sign: cells of CW x CH px. An entry is
 *  { text, sub?, bg (null = see-through, for loose letters, neon and lettering on glass), fg,
 *    font?, frame? (an inner rule), glow? (neon: a soft halo round the letters) } */
const CW = 256, CH = 64, COLS = 16;
const FONTS = { sans: LAT, serif: 'Georgia,"Times New Roman",serif', script: '"Brush Script MT","Segoe Script",cursive', slab: '"Rockwell","Roboto Slab",Georgia,serif' };
function signAtlas(entries) {
  const rows = Math.ceil(entries.length / COLS), W = CW * COLS, H = CH * rows;
  const t = canvasTex(W, H, (g) => {
    entries.forEach((e, i) => {
      const x0 = (i % COLS) * CW, y0 = Math.floor(i / COLS) * CH, font = FONTS[e.font] || FONTS.sans;
      g.save(); g.beginPath(); g.rect(x0, y0, CW, CH); g.clip();
      if (e.bg) { g.fillStyle = e.bg; g.fillRect(x0, y0, CW, CH); }
      if (e.frame) { g.strokeStyle = e.fg; g.globalAlpha = .55; g.lineWidth = 2; g.strokeRect(x0 + 4, y0 + 4, CW - 8, CH - 8); g.globalAlpha = 1; }
      g.fillStyle = e.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
      const weight = e.font === 'script' ? 400 : e.font === 'serif' ? 700 : 800;
      let size = e.sub ? 30 : 40;
      const fit = () => { g.font = `${weight} ${size}px ${font}`; };
      fit(); while (size > 11 && g.measureText(e.text).width > CW - 20) { size -= 1; fit(); }
      if (e.glow) { g.shadowColor = e.fg; g.shadowBlur = 10; }
      g.fillText(e.text, x0 + CW / 2, y0 + (e.sub ? 26 : 33), CW - 16);
      g.shadowBlur = 0;
      if (e.sub) { g.fillStyle = '#f2c14e'; g.font = `700 15px ${LAT}`; g.fillText(e.sub, x0 + CW / 2, y0 + 50); }
      g.restore();
    });
  });
  t.colorSpace = THREE.NoColorSpace;
  const uv = i => { const c = i % COLS, r = Math.floor(i / COLS); return [c * CW / W + .5 / W, 1 - (r + 1) * CH / H + .5 / H, (c + 1) * CW / W - .5 / W, 1 - r * CH / H - .5 / H]; };
  return { t, uv };
}

/** wall textures for the researched buildings: brick, stone blocks, plain render; grey, tinted by colour */
function wallTex(kind) {
  const t = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    if (kind === 'brick') {
      g.fillStyle = '#c9c4bc';
      for (let r = 0; r < 16; r++) { g.fillRect(0, r * 16, w, 2); for (let c = 0; c < 5; c++) g.fillRect(((c * 64) + (r % 2) * 32) % w, r * 16, 2, 16); }
      for (let k = 0; k < 400; k++) { g.fillStyle = `rgba(0,0,0,${Math.random() * .08})`; g.fillRect(Math.random() * w, Math.random() * h, 30, 12); }
    } else if (kind === 'stone') {
      g.fillStyle = '#d2cdc4';
      for (let r = 0; r < 4; r++) { g.fillRect(0, r * 64, w, 3); for (let c = 0; c < 3; c++) g.fillRect(((c * 96) + (r % 2) * 48) % w, r * 64, 3, 64); }
    } else {
      for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(0,0,0,${Math.random() * .05})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; return t;
}

/**
 * data: data.restaurants ({places: [{n, x, z, ry, w, h, k, s, hood, c, p?, d?, soon?, club?}]}).
 * Returns { places (with each one's view and label), labels, credit }.
 */
export function buildRestaurants(scene, data) {
  const group = new THREE.Group(); group.name = 'restaurants'; group.userData.terrain = 'done'; scene.add(group);
  const P = (data && data.places) || [];
  const B = batch(), col = new THREE.Color(), C = h => col.set(h).clone();
  const std = (o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: '#ffffff', vertexColors: true, roughness: .8 }, o));

  // signs: one atlas cell per place, plus one cell of gold stars for the blade signs
  const entries = P.map(p => { const [bg, fg] = pick((KIND[p.k] || KIND.restaurant).sign, p.n, 1); return { text: p.n.toUpperCase(), sub: p.soon ? 'COMING SOON' : stars(p.s), bg, fg, frame: true }; });
  const STARS = entries.push({ text: '★★★', bg: '#1b1b1b', fg: '#f2c14e', frame: true }) - 1;
  // the researched places' own signs (look.signs), each its own cell
  const lookSign = new Map();
  P.forEach((p, i) => (p.look && p.look.signs || []).forEach((sg, j) => {
    const see = sg.type === 'letters' || sg.type === 'neon' || sg.type === 'window lettering' || sg.type === 'painted wall' || !sg.bg;
    lookSign.set(i + ':' + j, entries.push({ text: sg.text || p.n, bg: see ? null : sg.bg, fg: sg.fg || '#ffffff', glow: sg.type === 'neon',
      font: sg.type === 'neon' ? 'script' : sg.type === 'window lettering' || (sg.type === 'letters' && p.k === 'restaurant') ? 'serif' : 'sans' }) - 1);
  }));
  const atlas = signAtlas(entries);
  const signMat = new THREE.MeshStandardMaterial({ map: atlas.t, emissive: '#ffffff', emissiveMap: atlas.t, emissiveIntensity: 0, roughness: .6, side: THREE.DoubleSide, alphaTest: .5 });
  signMat.userData.lit = .85; signMat.userData.noSnow = true; litMats.push(signMat);
  const darkSignMat = new THREE.MeshStandardMaterial({ map: atlas.t, roughness: .7, side: THREE.DoubleSide, alphaTest: .5 });   // signs that aren't lit
  darkSignMat.userData.noSnow = true;
  const neonMat = new THREE.MeshStandardMaterial({ map: atlas.t, emissive: '#ffffff', emissiveMap: atlas.t, emissiveIntensity: 0, roughness: .4, side: THREE.DoubleSide, alphaTest: .4 });
  neonMat.userData.lit = 1.9; neonMat.userData.noSnow = true; neonMat.userData.noCast = true; litMats.push(neonMat);
  // shop windows: dark glass by day, a warm room behind it by night
  const room = canvasTex(256, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#5a3418'); gr.addColorStop(.55, '#d98d3e'); gr.addColorStop(1, '#3a210f');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) { const x = 32 + i * 64; g.fillStyle = '#ffe2a8'; g.beginPath(); g.arc(x, 26, 7, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(255,214,150,.35)'; g.beginPath(); g.arc(x, 30, 22, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = 'rgba(30,16,8,.85)'; for (let i = 0; i < 6; i++) { const x = 20 + i * 42; g.fillRect(x, 84, 26, 4); g.fillRect(x + 11, 88, 4, 40); }
  });
  room.wrapS = THREE.RepeatWrapping; room.colorSpace = THREE.NoColorSpace;
  const glassMat = new THREE.MeshStandardMaterial({ color: '#2c3540', roughness: .12, metalness: .35, emissive: '#ffffff', emissiveMap: room, emissiveIntensity: 0 });
  glassMat.userData.lit = .9; glassMat.userData.noSnow = true; litMats.push(glassMat);
  const stripes = canvasTex(32, 4, (g) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, 32, 4); g.fillStyle = '#c9c4ba'; g.fillRect(16, 0, 16, 4); });
  stripes.wrapS = THREE.RepeatWrapping; stripes.colorSpace = THREE.NoColorSpace;
  const awnMat = std({ map: stripes, side: THREE.DoubleSide, roughness: .9 });
  const frameMat = std({ roughness: .7 });
  const metalMat = std({ roughness: .45, metalness: .5 });
  const lampMat = new THREE.MeshStandardMaterial({ color: '#ffe0a0', emissive: '#ffc066', emissiveIntensity: 0, roughness: .5 });
  lampMat.userData.lit = 1.2; lampMat.userData.noSnow = true; lampMat.userData.noCast = true; litMats.push(lampMat);
  const tentMat = std({ side: THREE.DoubleSide, roughness: .95 });
  // for the researched places (p.look): their building's wall, upper windows, glass kinds, plain awnings
  const wallMat = { brick: std({ map: wallTex('brick'), roughness: .9 }), stone: std({ map: wallTex('stone'), roughness: .85 }), plain: std({ map: wallTex('plain'), roughness: .9 }) };
  const upperMat = new THREE.MeshStandardMaterial({ color: '#2a333c', roughness: .15, metalness: .3, emissive: '#ffffff', emissiveMap: room, emissiveIntensity: 0 });
  upperMat.userData.lit = .35; upperMat.userData.noSnow = true; litMats.push(upperMat);
  const darkGlassMat = new THREE.MeshStandardMaterial({ color: '#141a20', roughness: .08, metalness: .5, emissive: '#ffffff', emissiveMap: room, emissiveIntensity: 0 });
  darkGlassMat.userData.lit = .3; darkGlassMat.userData.noSnow = true; litMats.push(darkGlassMat);
  const softGlassMat = new THREE.MeshStandardMaterial({ color: '#d9d4c8', roughness: .6, emissive: '#ffd9a0', emissiveIntensity: 0 });   // frosted or curtained
  softGlassMat.userData.lit = .55; softGlassMat.userData.noSnow = true; litMats.push(softGlassMat);
  const awnPlainMat = std({ side: THREE.DoubleSide, roughness: .9 });

  /**
   * A storefront rebuilt from research (p.look: building, storefront, awning, signs, lights,
   * outdoor; see data-phl-restaurants in docs/EDITING.md). Local frame as the generic one: x along
   * the wall, +z into the street, y = 0 the pavement. Returns the label height.
   */
  function lookFront(p, i, add) {
    const L = p.look, bl = L.building || {}, sf = L.storefront || {}, aw = L.awning || {}, li = L.lights || {}, od = L.outdoor || {};
    if (L.indoor) {
      // no street front of its own (a stall in a market hall, a bar up a tower): leave the
      // building as it is and hang its sign by the entrance, lit, with a lamp either side
      const own = (L.signs || []).slice(0, 1);
      if (!own.length) { add(frameMat, box(2.96, .86, .12), M(0, 2.9, .1), C('#1c1c1c')); add(signMat, panel(2.8, .7, atlas.uv(i)), M(0, 2.98, .17)); }
      own.forEach((sg, j) => {
        const cell = lookSign.get(i + ':' + j); if (cell === undefined) return;
        const len = (sg.text || p.n).length, w = Math.min(Math.max(1.8, len * .3), Math.max(2, p.w - 1)), h = Math.min(.7, w / 4);
        add(frameMat, box(w + .16, h + .16, .12), M(0, 2.9, .1), C('#1c1c1c'));
        add(sg.lit === false ? darkSignMat : signMat, panel(w, h, atlas.uv(cell)), M(0, 2.98, .17));
      });
      for (const s of [-1, 1]) add(lampMat, box(.16, .26, .16), M(s * 1.3, 2.2, .25));
      return Math.max(p.h, 4) + 4;
    }
    const floors = Math.max(1, Math.min(8, bl.floors || 2));
    const W = Math.max(3.4, Math.min(p.w - .6, 16, (sf.width_bays || 2) * 3.1));
    const Hg = Math.max(2.8, Math.min(3.9, p.h > 0 ? p.h / floors * .95 : 3.4));          // ground-floor height
    const frameC = C(sf.frame_color || '#2b2b2b'), wallC = C(bl.color || '#8a5a44');
    // the building's face around the shop: its own wall, with upper-floor windows
    const top = Math.max(Hg + .5, Math.min(p.h || Hg + 3, floors * 3.4 + .4)), SW = Math.min(p.w - .1, Math.max(W + 2, 7));
    const mat = bl.material || '', wm = /brick/.test(mat) ? wallMat.brick : /stone/.test(mat) ? wallMat.stone : wallMat.plain;
    if (top > Hg + .4) {
      add(mat === 'glass' ? darkGlassMat : wm, panel(SW, top - Hg, [0, 0, SW / 1.6, (top - Hg) / 1.6]), M(0, Hg, .07), wallC);
      for (let f = 1; f < floors && Hg + (f - 1) * 3.3 + 2.7 < top; f++) {
        if (mat === 'glass') break;
        const y = Hg + (f - 1) * 3.3 + .9, n = Math.max(1, Math.round(SW / 2.7));
        for (let k = 0; k < n; k++) {
          const x = (k + .5 - n / 2) * SW / n;
          add(upperMat, panel(1.05, 1.6), M(x, y, .1));
          add(frameMat, box(1.25, .1, .14), M(x, y - .1, .1), C('#e9e4da'));              // sill
          add(frameMat, box(1.25, .14, .1), M(x, y + 1.6, .1), /brick/.test(mat) ? C('#b9b2a6') : frameC);
        }
      }
    }
    // the shop front: frame, bulkhead, fascia band
    add(frameMat, box(.34, Hg, .3), M(-W / 2, 0, .12), frameC); add(frameMat, box(.34, Hg, .3), M(W / 2, 0, .12), frameC);
    add(frameMat, box(W + .34, .55, .3), M(0, Hg - .55, .12), frameC);
    add(frameMat, box(W, .45, .26), M(0, 0, .12), frameC);
    const dpos = sf.door && sf.door.position;
    const doorX = dpos === 'left' ? -W / 2 + .85 : dpos === 'center' ? 0 : W / 2 - .85;
    const glassTop = Hg - .6, win = sf.windows || 'large plate glass', tint = sf.window_tint || 'clear';
    const gm = tint === 'dark' ? darkGlassMat : tint === 'frosted' || tint === 'curtained' ? softGlassMat : glassMat;
    // window bays either side of the door
    const spans = [[-W / 2 + .17, doorX - .6], [doorX + .6, W / 2 - .17]].filter(([a, b]) => b - a > .4);
    if (win === 'garage roll-up') {
      const gx = doorX > 0 ? -.6 : .6;
      add(frameMat, box(W - 1.6, glassTop - .2, .08), M(gx, .2, .16), C('#3a3f44'));
      add(gm, panel(W - 2, .6), M(gx, glassTop - .9, .21));
    } else if (win === 'counter window' || win === 'small' || win === 'none') {
      add(mat === 'glass' ? frameMat : wm, panel(W, glassTop - .45, [0, 0, W / 1.6, (glassTop - .45) / 1.6]), M(0, .45, .18), mat === 'glass' ? frameC : wallC);
      if (win !== 'none') for (const [a, b] of spans) {
        const w = Math.min(b - a - .3, win === 'small' ? 1.2 : 2), x = (a + b) / 2, y = win === 'small' ? 1.2 : 1;
        if (w < .5) continue;
        add(gm, panel(w, win === 'small' ? 1.1 : 1.2), M(x, y, .2));
        if (win === 'counter window') add(frameMat, box(w + .3, .07, .45), M(x, y - .07, .3), C('#9a8f80'));
      }
    } else {
      for (const [a, b] of spans) {
        const w = b - a, x = (a + b) / 2;
        add(gm, panel(w, glassTop - .45, [0, 0, w / 3, 1]), M(x, .45, .2));
        if (win === 'multi-pane') {
          const n = Math.max(2, Math.round(w / .6));
          for (let k = 1; k < n; k++) add(frameMat, box(.05, glassTop - .45, .05), M(a + k * w / n, .45, .22), frameC);
          for (let r = 1; r < 3; r++) add(frameMat, box(w, .05, .05), M(x, .45 + r * (glassTop - .45) / 3, .22), frameC);
        }
        if (win === 'arched') {
          // a round head over each window-sized bay, with a mullion between bays
          const n = Math.max(1, Math.round(w / 1.8)), bw = w / n;
          for (let k = 0; k < n; k++) {
            const bx = a + (k + .5) * bw;
            const sh = new THREE.Shape(); sh.moveTo(-bw / 2, 0); sh.lineTo(bw / 2, 0); sh.absarc(0, 0, bw / 2, 0, Math.PI, false);
            add(wm, new THREE.ShapeGeometry(sh, 10), M(bx, glassTop - .02, .21), wallC);
            const r = bw / 2 - .1, in_ = new THREE.Shape(); in_.moveTo(-r, 0); in_.lineTo(r, 0); in_.absarc(0, 0, r, 0, Math.PI, false);
            add(gm, new THREE.ShapeGeometry(in_, 10), M(bx, glassTop - .02, .215));
            if (k) add(frameMat, box(.12, glassTop - .45, .1), M(a + k * bw, .45, .22), frameC);
          }
        }
      }
    }
    // the door
    add(frameMat, box(1.05, 2.35, .08), M(doorX, 0, .24), C((sf.door && sf.door.color) || '#241a14'));
    if (sf.door && sf.door.glass) add(gm, panel(.7, 1.3), M(doorX, .85, .29));
    add(metalMat, box(.05, .3, .05), M(doorX + (doorX > 0 ? -.38 : .38), 1.05, .32), C('#c8b07a'));
    // the awning
    const ac = C(aw.color || '#2b2b2b'), am = aw.stripes ? awnMat : awnPlainMat, at = aw.type || 'none';
    let valance = null;
    if (at === 'shed' || at === 'retractable') {
      const d = at === 'retractable' ? 1.9 : 1.25, drop = at === 'retractable' ? .7 : .55, Lh = Math.hypot(d, drop), a = Math.atan2(drop, d);
      const g = new THREE.PlaneGeometry(W + .2, Lh); g.rotateX(-Math.PI / 2 + a); g.translate(0, Hg - .05 - drop / 2, .2 + d / 2);
      const u = g.attributes.uv; for (let k = 0; k < u.count; k++) u.setX(k, u.getX(k) * (W + .2) / .5);
      add(am, g, new THREE.Matrix4(), ac);
      valance = [Hg - .05 - drop - .3, .2 + d];
      const v = new THREE.PlaneGeometry(W + .2, .3); v.translate(0, valance[0] + .15, valance[1]);
      const vu = v.attributes.uv; for (let k = 0; k < vu.count; k++) vu.setX(k, vu.getX(k) * (W + .2) / .5);
      add(am, v, new THREE.Matrix4(), ac);
    } else if (at === 'flat canopy' || at === 'marquee') {
      const d = at === 'marquee' ? 1.8 : 1.4, t = at === 'marquee' ? .55 : .2;
      add(frameMat, box(W + .4, t, d), M(0, Hg - .1, .15 + d / 2), ac);
      valance = [Hg - .1, .16 + d];
      if (at === 'marquee') for (let k = 0; k < Math.round(W / .5); k++) add(lampMat, box(.08, .08, .08), M(-W / 2 + .25 + k * .5, Hg - .16, .2 + d));
      else for (const s of [-1, 1]) add(metalMat, box(.03, .03, Math.hypot(d, .9)), M(s * W / 2.4, Hg + .35, .15 + d / 2, 0, -Math.atan2(.9, d)), C('#2a2a2a'));
    } else if (at === 'barrel') {
      const g = new THREE.CylinderGeometry(.75, .75, W + .2, 16, 1, true, 0, Math.PI); g.rotateZ(Math.PI / 2); g.translate(0, Hg - .1, .75);
      add(am, g, new THREE.Matrix4(), ac);
      valance = [Hg - .45, 1.52];
    }
    // the signs, most prominent first
    (L.signs || []).forEach((sg, j) => {
      const cell = lookSign.get(i + ':' + j); if (cell === undefined) return;
      const uv = atlas.uv(cell), sm = sg.type === 'neon' ? neonMat : sg.lit === false ? darkSignMat : signMat, where = sg.where || 'above windows';
      const len = (sg.text || p.n).length;
      if (sg.type === 'blade' || where === 'projecting' || where === 'corner') {
        // out over the pavement on a bracket, the words running down it
        const x = (doorX > 0 ? -1 : 1) * (W / 2 + .1), y = Hg + .35;
        add(metalMat, box(.05, .05, 1.25), M(x, y + 1.25, .62), C('#2a2a2a'));
        const g = panel(1.25, .42, uv); g.rotateZ(-Math.PI / 2); g.translate(.21, 1.25, 0);
        add(sm, g, M(x + .02, y - .02, .78, Math.PI / 2)); add(sm, g.clone(), M(x - .02, y - .02, .78, -Math.PI / 2));
      } else if (where === 'on window' || sg.type === 'window lettering') {
        const sp = spans[0] || [-W / 2, W / 2], w = Math.max(1, Math.min(len * .16 + .4, sp[1] - sp[0] - .3));
        add(sm, panel(w, w / 4, uv), M((sp[0] + sp[1]) / 2, 1.45, .23));
      } else if (where === 'on awning' || sg.type === 'awning text') {
        if (!valance) return;
        add(sm, panel(Math.min(W * .7, len * .2 + .6), .28, uv), M(0, valance[0] + .01, valance[1] + .02));
      } else if (sg.type === 'painted wall' || where === 'on wall') {
        if (top < Hg + 1.6) return;
        const w = Math.min(SW * .8, Math.max(2, len * .5)); add(sm, panel(w, w / 4, uv), M(0, Hg + .45, .12));
      } else {
        // over the shop front: on the fascia (boards and lightboxes), or loose letters on the wall above
        const loose = sg.type === 'letters' || sg.type === 'neon';
        const w = Math.min(W - .3, Math.max(1.6, len * (loose ? .42 : .34))), h = Math.min(w / 4, loose ? 1 : .5);
        const y = loose && top > Hg + 1.4 ? Hg + .1 : Hg - .53;
        const x = where === 'above door' ? Math.max(-W / 2 + w / 2, Math.min(W / 2 - w / 2, doorX)) : 0;
        add(sm, panel(w, h, uv), M(x, y, loose ? .14 : .28));
        if (sg.type === 'lightbox') add(frameMat, box(w + .1, h + .1, .2), M(x, y - .05, .17), C('#222222'));
      }
    });
    // lights
    if (li.sconces) for (const s of [-1, 1]) { add(metalMat, box(.08, .08, .25), M(doorX + s * .8, 2.3, .38), C('#1f1f1f')); add(lampMat, box(.16, .26, .16), M(doorX + s * .8, 2.05, .48)); }
    if (li.string_lights) for (let k = 0; k <= 12; k++) { const t = k / 12; add(lampMat, box(.07, .07, .07), M(-W / 2 + t * W, Hg - .2 - Math.sin(Math.PI * t) * .35, .55 + Math.sin(Math.PI * t) * .2)); }
    // outside
    const seats = od.seating || 'none';
    const tables = (n, z) => {
      for (let k = 0; k < n; k++) {
        const x = (k + .5 - n / 2) * Math.min(2.2, W / n);
        add(metalMat, cyl(.33, .33, .03, 12), M(x, .72, z), C('#2f2f2f')); add(metalMat, cyl(.025, .1, .72, 6), M(x, 0, z), C('#2f2f2f'));
        for (const t of [-1, 1]) { add(frameMat, box(.38, .04, .38), M(x + t * .5, .45, z), C('#6b4a2e')); add(frameMat, box(.38, .4, .04), M(x + t * .5, .45, z + t * .17), C('#6b4a2e')); }
      }
    };
    if (seats === 'few tables' || seats === 'patio') tables(Math.max(1, Math.min(3, Math.floor(W / 2.4))), 1.55);
    if (seats === 'bench') add(frameMat, box(1.6, .45, .45), M(doorX > 0 ? -W / 4 : W / 4, 0, .5), C('#5a4330'));
    if (seats === 'streetery' && p.sd > 5) {
      // a wooden platform at the kerb with a low fence, tables and a roof
      const z = Math.min(p.sd - 1.6, 5.2), Wd = Math.min(W + 2, 9);
      add(frameMat, box(Wd, .15, 2.2), M(0, 0, z), C('#7a5a3a'));
      add(frameMat, box(Wd, .9, .06), M(0, .15, z + 1.07), C('#5a4330'));
      for (const s of [-1, 1]) add(frameMat, box(.06, .9, 2.2), M(s * Wd / 2, .15, z), C('#5a4330'));
      tables(Math.max(1, Math.min(4, Math.floor(Wd / 2.2))), z);
      add(tentMat, box(Wd, .05, 2.3), M(0, 2.4, z), ac);
    }
    if (od.planters) for (const s of [-1, 1]) { add(frameMat, box(.6, .55, .6), M(doorX + s * 1.0, 0, .7), C('#4b4f4a')); add(frameMat, box(.5, .35, .5), M(doorX + s * 1.0, .55, .7), C('#3f6b34')); }
    return Math.max(p.h, top, 4) + 4;
  }

  const out = [];
  P.forEach((p, i) => {
    const kind = KIND[p.k] || KIND.restaurant, ground = terrain.on ? surface(p.x, p.z) : 0;
    const base = M(p.x, ground, p.z, p.ry);
    const add = (mat, g, m, c) => B.add(mat, g, base.clone().multiply(m), c);
    const nx = Math.sin(p.ry), nz = Math.cos(p.ry);
    const frameC = C(pick(FRAME, p.n, 2)), awnC = kind.awn && kind.awn.length ? C(pick(kind.awn, p.n, 3)) : null;
    const uv = atlas.uv(i), cozy = p.k === 'cafe' || p.k === 'bakery' || p.c.includes('brunch');
    let labelY = Math.max(p.h, 5) + 4;

    if (p.k === 'truck') {
      // parked along the street (local x), serving hatch to the pavement (-z); lift it off the wheels
      const body = C(pick(['#f4f1ea', '#ffd23f', '#e2412f', '#2d7dd2', '#3bb273', '#f08a24'], p.n, 4));
      add(frameMat, box(5.25, .35, 2.35), M(-.6, 1.1, 0), C('#ffffff'));                       // a stripe round the body
      add(frameMat, box(5.3, .12, 2.4), M(-.6, 2.95, 0), C('#9a9a9a'));                        // roof edge
      add(frameMat, box(5.2, 2.4, 2.3), M(-.6, .55, 0), body);
      add(frameMat, box(1.7, 1.9, 2.25), M(2.85, .55, 0), body);
      add(glassMat, panel(1.5, .8), M(3.71, 1.45, 0, Math.PI / 2));
      for (const [x, z] of [[-2.4, -1.05], [-2.4, 1.05], [2.6, -1.05], [2.6, 1.05]]) add(metalMat, cyl(.42, .42, .3, 12), M(x, .42, z + (z > 0 ? -.15 : .15), 0, Math.PI / 2), C('#1a1a1a'));
      add(glassMat, panel(3, 1.05), M(-.7, 1.55, -1.16, Math.PI));                       // the hatch, lit inside
      add(frameMat, box(3.2, .05, .9), M(-.7, 2.62, -1.55, 0, -.35), C('#d8d2c4'));          // its flap, propped up
      add(frameMat, box(3, .08, .35), M(-.7, 1.48, -1.3), C('#9a9a9a'));                     // counter
      add(signMat, panel(3.4, .85, uv), M(-.7, 2.72, -1.17, Math.PI));
      add(signMat, panel(3.4, .85, uv), M(-.7, 2.72, 1.17));
      labelY = 7;
    } else if (p.k === 'market') {
      // two rows of tents along the street, and a banner
      const tc = [C('#ffffff'), C('#2f6b3a'), C('#f2f2f2'), C('#c43c35'), C('#ffffff'), C('#2d5f9a')];
      for (let r = 0; r < 2; r++) for (let j = 0; j < 4; j++) {
        const x = (j - 1.5) * 3.6, z = -1.8 - r * 5, c = tc[(r * 4 + j) % tc.length];
        const roof = new THREE.ConeGeometry(2.3, .9, 4, 1, true); roof.rotateY(Math.PI / 4); roof.translate(0, .45, 0);
        add(tentMat, roof, M(x, 2.3, z), c);
        for (const [a, b] of [[-1.5, -1.5], [-1.5, 1.5], [1.5, -1.5], [1.5, 1.5]]) add(metalMat, cyl(.03, .03, 2.3, 5), M(x + a, 0, z + b), C('#bbbbbb'));
        add(frameMat, box(2.6, .08, 1), M(x, .8, z + 1.1), C('#e9e2d0'));
        for (let k = 0; k < 4; k++) add(frameMat, box(.35, .2, .3), M(x - .9 + k * .6, .88, z + 1.05), C(['#d9472b', '#e8b33a', '#5a8f3a', '#7a3a7a'][k]));
      }
      add(metalMat, cyl(.05, .05, 3.2, 6), M(-7.6, 0, 0)); add(metalMat, cyl(.05, .05, 3.2, 6), M(-3.8, 0, 0));
      add(signMat, panel(3.6, .9, uv), M(-5.7, 2.3, .03)); add(signMat, panel(3.6, .9, uv), M(-5.7, 2.3, -.03, Math.PI));
      labelY = 8;
    } else if (p.look && p.w) {
      labelY = lookFront(p, i, add);
    } else if (!p.w) {
      // nowhere to stand against: a lit menu board on a post, and a table
      add(metalMat, cyl(.05, .05, 2.6, 6), M(0, 0, 0), C('#2b2b2b'));
      add(signMat, panel(1.8, .45, uv), M(0, 2.15, .04)); add(signMat, panel(1.8, .45, uv), M(0, 2.15, -.04, Math.PI));
      add(lampMat, box(1.6, .05, .05), M(0, 2.65, .1));
      add(metalMat, cyl(.35, .35, .04, 12), M(1.6, .74, 1.4), C('#3a3a3a')); add(metalMat, cyl(.03, .05, .74, 6), M(1.6, 0, 1.4), C('#3a3a3a'));
      labelY = 6;
    } else {
      // a storefront on the wall: local x along the wall, +z out to the street, y = 0 the pavement
      const W = Math.max(3.4, Math.min(p.w - .8, kind.w)), Hg = p.h > 0 ? Math.max(2.3, Math.min(2.9, p.h - 1.6)) : 2.9;
      const hasRoom = p.h === 0 || p.h > Hg + 1.4, door = (hash(p.n, 5) < .5 ? -1 : 1) * (W / 2 - .85);
      add(frameMat, box(.32, Hg + .15, .3), M(-W / 2, 0, .1), frameC); add(frameMat, box(.32, Hg + .15, .3), M(W / 2, 0, .1), frameC);
      add(frameMat, box(W + .32, .4, .3), M(0, Hg, .1), frameC);                         // fascia
      add(frameMat, box(W, .45, .26), M(0, 0, .1), frameC);                               // bulkhead under the glass
      if (p.k === 'brewery') {
        // a roll-up garage door with a row of windows, and picnic tables out front
        add(frameMat, box(W - 1.6, Hg - .1, .08), M(-.5, 0, .14), C('#3a3f44'));
        add(glassMat, panel(W - 2, .6), M(-.5, Hg - .9, .19));
        for (let k = 0; k < 2; k++) {
          const x = (k ? 1 : -1) * W / 4;
          add(frameMat, box(1.8, .06, .75), M(x, .75, 2.2), C('#7a5a3a'));
          for (const s of [-1, 1]) add(frameMat, box(1.8, .05, .28), M(x, .45, 2.2 + s * .6), C('#7a5a3a'));
        }
      } else {
        add(glassMat, panel(W - .4, Hg - .5, [0, 0, (W - .4) / 3, 1]), M(0, .45, .2));     // shop window
        add(frameMat, box(1.05, 2.3, .08), M(door, 0, .24), C('#241a14'));               // door
        add(metalMat, box(.05, .3, .05), M(door + (door > 0 ? -.38 : .38), 1.05, .3), C('#c8b07a'));
      }
      if (awnC && hasRoom) {
        // a shed awning: canvas sloping down and out from just over the window, with a valance
        const d = 1.25, drop = .55, L = Math.hypot(d, drop), a = Math.atan2(drop, d);
        const g = new THREE.PlaneGeometry(W + .2, L); g.rotateX(-Math.PI / 2 + a); g.translate(0, Hg + .45 - drop / 2, .2 + d / 2);
        const u = g.attributes.uv; for (let k = 0; k < u.count; k++) u.setX(k, u.getX(k) * (W + .2) / .5);
        add(awnMat, g, new THREE.Matrix4(), awnC);
        const val = new THREE.PlaneGeometry(W + .2, .28); val.translate(0, Hg + .45 - drop - .14, .2 + d);
        const vu = val.attributes.uv; for (let k = 0; k < vu.count; k++) vu.setX(k, vu.getX(k) * (W + .2) / .5);
        add(awnMat, val, new THREE.Matrix4(), awnC);
      }
      // the sign board over the shopfront (on the fascia when the building is too low for one above)
      const sw = Math.min(W - .2, Math.max(2.6, p.n.length * .26)), sh = sw / 4;
      const sy = hasRoom ? Hg + .55 : Hg - .02;
      add(signMat, panel(sw, Math.min(sh, hasRoom ? .9 : .42), uv), M(0, sy, .27));
      if (p.k === 'bar') {
        // lit lanterns either side of the door instead of an awning
        for (const s of [-1, 1]) { add(metalMat, box(.08, .08, .3), M(door + s * .8, 2.2, .35), C('#222222')); add(lampMat, box(.22, .32, .22), M(door + s * .8, 1.95, .5)); }
      } else if (p.s >= 3 && hasRoom) {
        // a blade sign with three gold stars, out over the pavement
        const blade = atlas.uv(STARS), x = -W / 2 - .05;
        add(metalMat, box(.05, .05, 1.2), M(x, Hg + 1.6, .6), C('#2a2a2a'));
        add(signMat, panel(.9, .45, blade), M(x - .03, Hg + 1.1, .75, -Math.PI / 2)); add(signMat, panel(.9, .45, blade), M(x + .03, Hg + 1.1, .75, Math.PI / 2));
        for (const s of [-1, 1]) add(frameMat, box(.55, .5, .55), M(door + s * .95, 0, .7), C('#4b4f4a'));   // planters
        for (const s of [-1, 1]) add(frameMat, box(.45, .25, .45), M(door + s * .95, .5, .7), C('#3f6b34'));
      }
      if (cozy && p.k !== 'brewery') for (const s of [-1, 1]) {
        const x = s * W / 4 - (door > 0 ? .4 : -.4), z = 1.45;
        add(metalMat, cyl(.32, .32, .03, 12), M(x, .72, z), C('#2f2f2f')); add(metalMat, cyl(.025, .1, .72, 6), M(x, 0, z), C('#2f2f2f'));
        for (const t of [-1, 1]) { add(frameMat, box(.38, .04, .38), M(x + t * .5, .45, z), C('#6b4a2e')); add(frameMat, box(.38, .4, .04), M(x + t * .5, .45, z + t * .17), C('#6b4a2e')); }
      }
      labelY = Math.max(p.h, 4) + 4;
    }

    // the label floats over the storefront; the view stands where the build tool found a clear line
    // of sight from the street (v: [x, z, height above the ground]), looking at the shop front
    const fx = p.x + nx * 1.2, fz = p.z + nz * 1.2, tgt = new THREE.Vector3(fx, ground + 2.6, fz);
    const [cx, cz, ch] = p.v || [p.x + nx * 20, p.z + nz * 20, 12];
    const street = { id: 'eat:' + i, name: p.n, near: 6, target: tgt, pos: new THREE.Vector3(cx, (terrain.on ? surface(cx, cz) : 0) + ch, cz) };
    // straight in front of the shop front at eye height (f: where the build tool found it clear),
    // else the street view
    const view = p.f ? { id: 'eat:' + i, name: p.n, near: 3, target: new THREE.Vector3(p.x + nx * .3, ground + 2.3, p.z + nz * .3),
      pos: new THREE.Vector3(p.f[0], (terrain.on ? surface(p.f[0], p.f[1]) : 0) + 2.1, p.f[1]) } : street;
    const label = { text: p.n, stars: p.s, eat: i, pos: new THREE.Vector3(fx, labelY, fz), far: p.s >= 3 ? 1600 : 800, layer: 'eat' };
    out.push({ ...p, i, view, street, label });
  });
  B.build(group);
  return { places: out, labels: out.map(p => p.label), credit: data && data.credit, stars: (data && data.stars) || {} };
}
