// @ts-check
// Data loading and the local map projection shared by every scene module.
// Each city's generated files live in data/<city>/ (tools/<city>/ makes them); coordinates there
// are integer decimetres in that city's frame (js/cities.js).
import * as THREE from 'three';
import { CITY } from './cities.js';
/** @import { CityData, Pair } from './types/data' */

/** lat/lon -> scene position (x metres east, z metres south of the city's origin) */
/** @param {number} lat @param {number} lon */
export const G = (lat, lon) => { const f = CITY.frame; return new THREE.Vector3((lon - f.LON0) * f.MX, 0, -(lat - f.LAT0) * f.MZ); };
/** @param {number} z */
export const latOf = z => CITY.frame.LAT0 - z / CITY.frame.MZ;

/** flat [x,z,x,z...] decimetres -> [[x,z],...] metres */
/** @param {ArrayLike<number>} flat @returns {Pair[]} */
export function pairs(flat) {
  const out = new Array(flat.length / 2);
  for (let i = 0; i < flat.length; i += 2) out[i / 2] = [flat[i] / 10, flat[i + 1] / 10];
  return out;
}

/** a .gz file's body, gunzipped as it streams in (its first bytes, read from a tee of it, say whether it is gzip at all) */
async function gunzip(body) {
  const [peek, all] = body.tee(), reader = peek.getReader(), head = [];
  for (let c; head.length < 2 && !(c = await reader.read()).done;) head.push(...c.value.subarray(0, 2 - head.length));
  reader.cancel();
  return new Response(head[0] === 0x1f && head[1] === 0x8b ? all.pipeThrough(new DecompressionStream('gzip')) : all).arrayBuffer();   // else already decoded by the server
}

/** load the active city's files (CITY.files, from CITY.dir) */
/** @param {(done: number, key: string) => void} [onProgress] @returns {Promise<CityData>} */
export async function loadData(onProgress = () => {}) {
  const FILES = CITY.files;
  let done = 0;
  const parts = await Promise.all(FILES.map(async ([key, file]) => {
    if (!CITY.urls[file]) throw new Error(`${CITY.dir}/${file}: not in the build's URL map (js/main.js URLS)`);
    const r = await fetch(CITY.urls[file]);   // its URL in the build (CITY.urls, set by main.js)
    if (!r.ok) throw new Error(`${CITY.dir}/${file}: HTTP ${r.status}`);
    let out;
    if (file.endsWith('.json')) out = JSON.parse(new TextDecoder().decode(await r.arrayBuffer()));
    else {
      const buf = await gunzip(r.body);
      out = file.endsWith('.json.gz') ? JSON.parse(new TextDecoder().decode(buf)) : buf;
    }
    onProgress(++done / FILES.length, key);
    return out;
  }));
  return /** @type {CityData} */ (Object.fromEntries(FILES.map(([k], i) => [k, parts[i]])));
}
