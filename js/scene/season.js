// Time of year: one day of the year (0 = 1 January) drives everything seasonal.
//  snow     ground, roofs, parks and conifers white in deep winter (roads ploughed)
//  bare     deciduous trees drop their leaves in late November and leaf out in April
//  fall     autumn colour, peaking late October into November
//  bloom    cherry, dogwood and redbud blossom in early April
//  flowers  tulip and daffodil beds in the parks, April to June
//  fresh    the light green of new leaves in late spring
//  dormant  grass browning over winter
// Each is a curve over the year (piecewise linear, wrapping at New Year). Modules register
// what they change with onSeason(fn); setSeason(day) calls them all.
import * as THREE from 'three';

const CURVES = {
  snow: [[0, 1], [50, 1], [64, 0], [339, 0], [354, 1], [365, 1]],
  bare: [[0, 1], [90, 1], [112, 0], [318, 0], [336, 1], [365, 1]],
  fall: [[0, 0], [262, 0], [298, 1], [338, 1], [345, 0], [365, 0]],
  bloom: [[0, 0], [80, 0], [95, 1], [110, 1], [125, 0], [365, 0]],
  flowers: [[0, 0], [85, 0], [100, 1], [150, 1], [175, 0], [365, 0]],
  fresh: [[0, 0], [105, 0], [115, 1], [140, 1], [165, 0], [365, 0]],
  dormant: [[0, 1], [75, 1], [105, 0], [290, 0], [330, .7], [365, 1]],
};
const at = (keys, d) => { const k = keys.findIndex(p => p[0] > d); if (k <= 0) return keys[keys.length - 1][1]; const [a, va] = keys[k - 1], [b, vb] = keys[k]; return va + (vb - va) * (d - a) / (b - a); };

export const SNOW = { value: 0 };   // shared shader uniform
const listeners = [];
let state = null;

/** Day of the year for a local date, and back. Use UTC for the difference across DST. */
export const dayOfYear = d => (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 1)) / 864e5;
export const dateOfDay = (day, year = new Date().getFullYear()) => new Date(year, 0, 1 + day, 12);
const daysInYear = year => dayOfYear(new Date(year, 11, 31)) + 1;

// The curves use a 365-day calendar. Interpolate Feb 29 and keep March through
// December aligned to the same dates in leap years.
const curveDay = (day, days) => {
  if (days !== 366 || day < 59) return day;
  return day === 59 ? 58.5 : day - 1;
};

/** fn(state) now and on every change; state = { day, snow, bare, fall, bloom, flowers, fresh, dormant } */
export function onSeason(fn) { listeners.push(fn); if (state) fn(state); }
export function setSeason(day, year = new Date().getFullYear()) {
  const days = daysInYear(year);
  day = ((Math.round(day) % days) + days) % days;
  state = { day };
  const d = curveDay(day, days);
  for (const [k, keys] of Object.entries(CURVES)) state[k] = at(keys, d);
  SNOW.value = state.snow;
  listeners.forEach(fn => fn(state));
  return state;
}
export const getSeason = () => state;

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Nov 11 · fall" (astronomical seasons) */
export function formatDay(day, year = new Date().getFullYear()) {
  const d = dateOfDay(day, year), seasonDay = curveDay(day, daysInYear(year));
  const name = seasonDay < 78 || seasonDay >= 354 ? 'winter' : seasonDay < 171 ? 'spring' : seasonDay < 264 ? 'summer' : 'fall';
  return `${MON[d.getMonth()]} ${d.getDate()} · ${name}`;
}

/** Grass and other planted ground: dormant tan over winter, a brighter green in spring. */
const DORMANT = new THREE.Color('#9d956b'), SPRING = new THREE.Color('#7fbf52');
export function seasonalGrass(mat) {
  const base = mat.color.clone();
  onSeason(s => mat.color.copy(base).lerp(DORMANT, s.dormant * .65).lerp(SPRING, s.fresh * .25));
  return mat;
}

/**
 * Snow on everything that faces up, in winter: hooks a material's fragment shader so its colour
 * fades to snow where the surface normal points to the sky. amount = how much snow lies (roads
 * are ploughed: about a third). Chains any shader hook the material already has.
 */
const SNOW_COL = 'vec3(.93, .95, .98)';
export function addSnow(m, amount = 1) {
  if (m.userData.snowHooked || m.userData.noSnow || !(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)) return;
  m.userData.snowHooked = true;
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? m.customProgramCacheKey.bind(m) : null;
  const hasPrev = prev !== THREE.Material.prototype.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (hasPrev) prev.call(m, sh, r);
    sh.uniforms.uSnow = SNOW; sh.uniforms.uSnowAmt = { value: amount };
    sh.fragmentShader = 'uniform float uSnow, uSnowAmt;\n' + sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    float up = dot(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));
    diffuseColor.rgb = mix(diffuseColor.rgb, ${SNOW_COL}, uSnow * uSnowAmt * smoothstep(.5, .85, up));
  }`);
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey() : hasPrev ? prev.toString() : '') + '|snow';
  m.needsUpdate = true;
}
