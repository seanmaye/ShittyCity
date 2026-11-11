// Shared materials, including the lit-window facades that glow at night.
import * as THREE from 'three';
/** Materials whose emissive windows switch on at dusk; each has userData.lit (intensity). */
export const litMats = [];

export const M = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .9, side: THREE.DoubleSide }, o));

// ---- facade textures
// One texture tile covers 32 window bays x 64 floors (112 m x 232 m) at 16 px per bay and
// floor, so a pattern only repeats every couple of blocks. Each facade style has two maps:
//  day   multiplied by the building colour: wall near white, glass, frames, doors and shops darker
//  night the lit windows; alpha holds when each light goes off late at night (see setWindowHour)
// Row 0 is the ground floor (doors, marble steps, shopfronts). The top-left 4 x 4 bays are left
// blank: roofs and other plain faces point their UVs there (ROOF_UV).
const CELL = 16, COLS = 32, FLOORS = 64, TW = COLS * CELL, TH = FLOORS * CELL;
export const WIN_W = COLS * 3.5, WIN_H = FLOORS * 3.625;   // metres per texture tile
export const ROOF_UV = [32 / TW, 1 - 32 / TH];
const BLANK = (x, y) => x < 64 && y >= TH - 64;

let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = a => a[Math.floor(rnd() * a.length)];
const WARM = [[255, 206, 140], [255, 196, 122], [255, 222, 168], [248, 184, 110], [255, 232, 196], [255, 214, 156]];
const COOL = [[222, 236, 255], [238, 245, 255], [206, 224, 250], [255, 250, 236], [232, 240, 232]];
const TV = [[118, 150, 255], [150, 176, 255], [170, 140, 255]];

/** Build the day and night maps for one facade style. */
function facade(style) {
  const day = new Uint8Array(TW * TH * 4), night = new Uint8Array(TW * TH * 4);
  const put = (buf, x0, y0, w, h, r, g, b, a = 255) => {
    for (let y = Math.max(0, y0); y < Math.min(TH, y0 + h); y++) for (let x = x0; x < x0 + w; x++) {
      const xx = ((x % TW) + TW) % TW; if (BLANK(xx, y)) continue;
      const i = (y * TW + xx) * 4; buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
    }
  };
  // wall: near white with a fine grain, so the building colour shows through
  for (let i = 0; i < TW * TH; i++) {
    const v = 226 + Math.floor(rnd() * 18); day[i * 4] = day[i * 4 + 1] = day[i * 4 + 2] = v; day[i * 4 + 3] = 255;
    night[i * 4 + 3] = 255;
  }
  const A = v => Math.max(1, Math.min(255, Math.round(v * 255)));
  /** a lit room behind a window: ceiling light at the top, optional blinds, alpha = switch-off */
  function room(x, y, w, h, col, br, off, blinds = 0) {
    for (let j = 0; j < h; j++) {
      const k = br * (.72 + .28 * j / Math.max(1, h - 1)) * (j >= h * (1 - blinds) ? .3 : 1);
      put(night, x, y + j, w, 1, col[0] * k | 0, col[1] * k | 0, col[2] * k | 0, A(off));
    }
  }
  // when a home's light goes off: some by 11 pm, most by 3 am, a few all night
  const homeOff = () => (rnd() < .12 ? 1 : .08 + rnd() * .8);
  // offices empty early; a few floors are lit all night (cleaners, trading floors, security)
  const officeOff = () => { const r = rnd(); return r < .55 ? .02 + rnd() * .25 : r < .9 ? .25 + rnd() * .55 : 1; };
  const shopOff = () => (rnd() < .1 ? 1 : .12 + rnd() * .25);
  const glassCol = () => { const g = 42 + rnd() * 30; return [g, g + 6 + rnd() * 6, g + 14 + rnd() * 10]; };

  if (style === 'row' || style === 'row2') {
    // rowhouses: each house 2 (row) or 3 (row2) bays wide with its own brick tone, door and stoop
    const hw = style === 'row' ? 2 : 3;
    for (let hx = 0; hx < COLS; hx += hw) {
      const tone = .84 + rnd() * .16, tint = [tone * (1 + (rnd() - .5) * .06), tone, tone * (1 - rnd() * .05)];
      for (let y = 0; y < TH; y++) for (let x = hx * CELL; x < (hx + hw) * CELL; x++) {
        const i = (y * TW + x) * 4; for (let c = 0; c < 3; c++) day[i + c] = Math.min(255, day[i + c] * tint[c]);
      }
      const home = .12 + rnd() * .5, trim = rnd() < .5 ? [250, 248, 240] : [70, 62, 58], doorBay = rnd() < .5 ? 0 : hw - 1;
      const shop = style === 'row2' && rnd() < .3;   // corner stores and ground-floor shops
      for (let f = 0; f < FLOORS; f++) for (let b = 0; b < hw; b++) {
        const X = (hx + b) * CELL, Y = f * CELL;
        if (f === 0 && shop) {
          put(day, X + 1, Y + 1, 14, 11, ...glassCol().map(v => v + 30)); put(day, X, Y + 12, 16, 2, 60, 70, 64);
          if (rnd() < .8) room(X + 1, Y + 1, 14, 11, pick(WARM), .9, shopOff());
          continue;
        }
        if (f === 0 && b === doorBay) {
          put(day, X + 5, Y + 2, 6, 10, 74, 48, 36); put(day, X + 5, Y + 12, 6, 2, 110, 120, 128);   // door, transom
          put(day, X + 3, Y, 10, 1, 250, 250, 246); put(day, X + 4, Y + 1, 8, 1, 236, 236, 232);   // marble steps
          if (rnd() < .45) put(night, X + 12, Y + 9, 2, 2, 255, 214, 150, A(rnd() < .6 ? 1 : homeOff()));   // porch light
          continue;
        }
        const wy = f === 0 ? 3 : 4, wh = f === 0 ? 8 : 9, wx = hw === 2 ? 5 : 4, ww = hw === 2 ? 6 : 8;
        // glass: dark, sometimes with lace curtains or white blinds showing
        const r = rnd(), g = r < .65 ? glassCol() : r < .85 ? [150, 140, 122] : [200, 198, 190];
        put(day, X + wx, Y + wy, ww, wh, ...g);
        put(day, X + wx - 1, Y + wy + wh, ww + 2, 1, ...trim); put(day, X + wx - 1, Y + wy - 1, ww + 2, 1, ...trim);
        if (rnd() < home) {
          const t = rnd();
          if (t < .07) room(X + wx, Y + wy, ww, wh, pick(TV), .55 + rnd() * .3, homeOff());
          else room(X + wx, Y + wy, ww, wh, pick(WARM), .5 + rnd() * .5, homeOff(), t < .35 ? .3 + rnd() * .5 : 0);
        }
      }
    }
  } else {
    // offices, modern ribbon windows, curtain walls and masonry: the texture is cut into building
    // widths of 6-14 bays, each with its own share of lit floors and light colour
    const ribbon = style === 'office2', glass = style === 'glass', stone = style === 'stone';
    for (let x0 = 0; x0 < COLS;) {
      const wB = Math.min(COLS - x0, 6 + Math.floor(rnd() * 9));
      const busy = .15 + rnd() * .5, cool = rnd() < .75, tone = .9 + rnd() * .1;
      const mech = new Set([Math.floor(10 + rnd() * 20), Math.floor(30 + rnd() * 25)]);
      const panel = glass ? [150 + rnd() * 30, 165 + rnd() * 30, 180 + rnd() * 30] : null;
      for (let y = 0; y < TH; y++) for (let x = x0 * CELL; x < (x0 + wB) * CELL; x++) {
        const i = (y * TW + x) * 4; for (let c = 0; c < 3; c++) day[i + c] *= tone;
      }
      for (let f = 0; f < FLOORS; f++) {
        const Y = f * CELL, floorBusy = busy * (.4 + rnd() * 1.2);
        // lit zones along the floor: runs of 2-8 bays share one light
        const zones = []; for (let b = 0; b < wB;) { const n = Math.min(wB - b, 2 + Math.floor(rnd() * 7)); zones.push([b, n, rnd() < floorBusy, pick(cool ? COOL : WARM), .55 + rnd() * .45, officeOff()]); b += n; }
        for (const [zb, zn, lit, col, br, off] of zones) for (let b = zb; b < zb + zn; b++) {
          const X = (x0 + b) * CELL;
          if (f === 0) {   // lobby and shopfronts
            put(day, X + 1, Y + 1, 14, 13, ...glassCol().map(v => v + 35)); put(day, X, Y + 14, 16, 2, 70, 74, 78);
            if (rnd() < .75) room(X + 1, Y + 1, 14, 13, pick(rnd() < .6 ? WARM : COOL), .8 + rnd() * .2, shopOff());
            continue;
          }
          if (mech.has(f)) {   // mechanical floors: louvres, never lit
            for (let j = 2; j < 14; j += 2) put(day, X, Y + j, 16, 1, 120, 122, 124);
            continue;
          }
          let wx, wy, ww, wh;
          if (glass) {
            wx = 0; wy = 2; ww = 16; wh = 14;
            const p = panel.map(v => v * (.94 + rnd() * .08) * (rnd() < .04 ? 1.12 : 1));
            for (let j = 0; j < wh; j++) put(day, X, Y + wy + j, 16, 1, ...p.map(v => Math.min(255, v * (.92 + .1 * j / wh))));
            put(day, X, Y, 16, 2, 112, 120, 130); put(day, X, Y + 2, 1, 14, 210, 214, 218); put(day, X + 8, Y + 2, 1, 14, 190, 196, 202);
          } else if (ribbon) {
            wx = 0; wy = 4; ww = 16; wh = 9;
            put(day, X, Y + wy, 16, wh, ...glassCol()); put(day, X, Y + wy, 1, wh, 150, 154, 158); put(day, X + 8, Y + wy, 1, wh, 150, 154, 158);
          } else {
            wx = stone ? 5 : 3; ww = stone ? 6 : 10; wy = stone ? 2 : 3; wh = stone ? 11 : 9;
            put(day, X + wx, Y + wy, ww, wh, ...glassCol());
            put(day, X + wx - 1, Y + wy - 1, ww + 2, 1, 255, 255, 250);
            if (stone) put(day, X + wx, Y + wy + 6, ww, 1, 200, 196, 186);   // transom bar
          }
          if (lit) {
            const r = rnd();
            if (r > .06) room(X + wx + (glass || ribbon ? 1 : 0), Y + wy, ww - (glass || ribbon ? 1 : 0), wh, col, br * (.85 + rnd() * .15), off, r < .2 ? .3 + rnd() * .4 : 0);
          } else if (rnd() < .03) room(X + wx, Y + wy, ww, wh, pick(WARM), .5, homeOff());   // a desk lamp left on
        }
      }
      x0 += wB;
    }
  }
  const mk = data => {
    const t = new THREE.DataTexture(data, TW, TH, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true; return t;
  };
  return { day: mk(day), night: mk(night) };
}

const STYLES = ['row', 'row2', 'office', 'office2', 'glass', 'stone'];
const TEX = {};
const styleOf = kind => (STYLES.includes(kind) ? kind : 'office');
const texFor = s => TEX[s] || (TEX[s] = facade(s));

/** Share of lit windows already switched off: none in the evening, most by the small hours. */
export const WIN_CUT = { value: 0 };
const CUT = [[0, .5], [1.5, .62], [3.5, .75], [5.5, .7], [7, .5], [9, .3], [12, .2], [17, 0], [20, .08], [22, .25], [24, .5]];
export function setWindowHour(h) {
  h = ((h % 24) + 24) % 24;
  const k = CUT.findIndex(c => c[0] > h), [a, va] = CUT[k - 1], [b, vb] = CUT[k];
  WIN_CUT.value = va + (vb - va) * (h - a) / (b - a);
}

// roof coverings: silver coating and black tar on rowhouses, white and grey membranes, gravel
export const ROOFS = [[.42, '#a9aaa7'], [.6, '#424244'], [.74, '#77787a'], [.87, '#cfcfca'], [.95, '#8c867c'], [1, '#58595c']];
export const roofColor = r => ROOFS.find(([p]) => r < p)[1];
const glslRoof = (() => {
  const c = new THREE.Color();
  return ROOFS.map(([p, hex], i) => { c.set(hex); const v = `vec3(${c.r.toFixed(3)}, ${c.g.toFixed(3)}, ${c.b.toFixed(3)})`; return i < ROOFS.length - 1 ? `rh < ${p.toFixed(2)} ? ${v} : ` : v; }).join('');
})();

/**
 * Hook a facade material's shaders: roofs (UV x < -0.5) use the blank patch, UVs scale by
 * uRep and shift by uOff, and lit windows switch off by the hour (alpha vs uWinCut).
 * inst: the material draws unit boxes (InstancedMesh): window UVs come from each instance's
 * size, and roof faces take a roof colour picked from the instance's position.
 */
function hook(m, rep = [1, 1], off = [0, 0], inst = false) {
  const R = `vec2(${ROOF_UV[0].toFixed(5)}, ${ROOF_UV[1].toFixed(5)})`;
  m.onBeforeCompile = sh => {
    sh.uniforms.uWinCut = WIN_CUT;
    sh.uniforms.uRep = { value: new THREE.Vector2(...rep) }; sh.uniforms.uOff = { value: new THREE.Vector2(...off) };
    sh.vertexShader = 'uniform vec2 uRep, uOff;\n' + sh.vertexShader.replace('#include <uv_vertex>', inst ? `
#ifdef USE_UV
  vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  float along = abs(normal.x) > .5 ? (position.z + .5) * sc.z : (position.x + .5) * sc.x;
  float jit = fract(instanceMatrix[3].x * .0131 + instanceMatrix[3].z * .0173);
  vUv = abs(normal.y) > .5 ? ${R} : vec2(along / ${WIN_W.toFixed(1)} + jit, position.y * sc.y / ${WIN_H.toFixed(2)});
#endif` : `
#ifdef USE_UV
  vUv = uv.x < -.5 ? ${R} : uv * uRep + uOff;
#endif`);
    if (inst) sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', `#include <color_vertex>
#ifdef USE_INSTANCING_COLOR
  if (abs(normal.y) > .5) { float rh = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453); vColor = ${glslRoof}; }
#endif`);
    sh.fragmentShader = 'uniform float uWinCut;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `
#ifdef USE_EMISSIVEMAP
  vec4 emissiveColor = texture2D(emissiveMap, vUv);
  emissiveColor.rgb = emissiveMapTexelToLinear(emissiveColor).rgb;
  totalEmissiveRadiance *= emissiveColor.rgb * step(uWinCut, emissiveColor.a) * (1.0 - .3 * uWinCut);
#endif`);
  };
  m.customProgramCacheKey = () => (inst ? 'facadeInst' : 'facade');
  return m;
}

function facadeMat(kind, color, vertexColors) {
  const s = styleOf(kind), t = texFor(s), glass = s === 'glass', row = s.startsWith('row');
  const m = new THREE.MeshStandardMaterial({ color, vertexColors, map: t.day, emissive: '#ffffff', emissiveMap: t.night, emissiveIntensity: 0,
    roughness: glass ? .35 : row ? .92 : .8, metalness: glass ? .18 : .04 });
  m.userData.lit = row ? .6 : .95; litMats.push(m);
  return m;
}

const cache = new Map();
/** Facade material for boxes with 0..1 UVs (hand-modelled landmarks): rx, ry = how many blocks
 *  of 4 bays x 8 floors (14 m x 29 m) fit across and up the face; v shifts the pattern. */
export function winMat(color, rx, ry, v, kind) {
  const key = color + '|' + rx + '|' + ry + '|' + v + '|' + kind;
  let m = cache.get(key); if (m) return m;
  m = hook(facadeMat(kind, color, false), [rx * 4 / COLS, ry * 8 / FLOORS], [(v * .37) % 1, 0]);
  cache.set(key, m); return m;
}

/** Facade material for extruded footprints whose UVs are already in texture-tile units
 *  (WIN_W x WIN_H metres). Colour comes from vertex colours so one material serves a palette. */
export function worldWinMat(kind) {
  const key = 'world|' + kind;
  let m = cache.get(key); if (m) return m;
  m = hook(facadeMat(kind, '#ffffff', true)); cache.set(key, m); return m;
}

/** Facade material for instanced unit boxes (city.js): window UVs are worked out on the GPU
 *  from each instance's size; roofs take a roof colour. Instance colours give the walls. */
export function instancedWinMat(kind) {
  const key = 'inst|' + kind;
  let m = cache.get(key); if (m) return m;
  m = hook(facadeMat(kind, '#ffffff', false), [1, 1], [0, 0], true); cache.set(key, m); return m;
}

/** Point a box's top and bottom faces at the roof patch. */
export function fixBoxUV(g) { const uv = g.attributes.uv; for (let i = 8; i < 16; i++) uv.setXY(i, -1, -1); uv.needsUpdate = true; return g; }
export const bx = (w, h, d) => fixBoxUV(new THREE.BoxGeometry(w, h, d));
/** How many 14 m x 29 m window blocks fit a face w wide and h tall (for winMat). */
export const reps = (w, h) => [Math.max(1, Math.round(w / 14)), Math.max(1, Math.round(h / 29))];

// ---- display lights: the coloured lighting on the skyline (crowns, Liberty Place's gables,
// the Cira Centre's LED facade, the FMC Tower's crown, Boathouse Row), which Philadelphia
// changes for teams, holidays and causes. Each piece registers a setter; a scheme's colours
// are dealt out to the pieces in turn, so a two-colour scheme alternates tower by tower.
export const DISPLAY_PRESETS = [
  { id: 'white', name: 'Classic white', colors: ['#f4f8ff'] },
  { id: 'birds', name: 'Go Birds', colors: ['#0b8f7a', '#c4ccd0'] },
  { id: 'phillies', name: 'Phillies red', colors: ['#e81828', '#ffffff'] },
  { id: 'sixers', name: 'Sixers', colors: ['#1d6fd1', '#ed174c'] },
  { id: 'flyers', name: 'Flyers orange', colors: ['#f74902', '#ffffff'] },
  { id: 'union', name: 'Union', colors: ['#2a5fc7', '#e3c25a'] },
  { id: 'holiday', name: 'Holidays', colors: ['#e3262f', '#1f9a4a'] },
  { id: 'pride', name: 'Pride', colors: ['#e40303', '#ff8c00', '#ffed00', '#008026', '#1f5cff', '#8b1fae'] },
];
const displays = [];
let displayColors = DISPLAY_PRESETS[0].colors;
/** register one display piece: apply(hex) sets its colour; returns its slot */
export function addDisplay(apply) { const i = displays.length; displays.push(apply); apply(displayColors[i % displayColors.length]); return i; }
export function setDisplayColors(colors) { displayColors = colors.length ? colors : DISPLAY_PRESETS[0].colors; displays.forEach((f, i) => f(displayColors[i % displayColors.length])); }
