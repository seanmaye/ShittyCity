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

/** load the active city's files (CITY.files, from CITY.dir): the data worker (js/load-worker.js) fetches, gunzips and decodes
 *  them, parses the JSON, and hands over each as it is done (typed arrays transferred, JSON as a copy) */
/** @param {(done: number, key: string) => void} [onProgress] @returns {Promise<CityData>} */
export async function loadData(onProgress = () => {}) {
  const FILES = CITY.files, parts = [];
  for (const [, file] of FILES) if (!CITY.urls[file]) throw new Error(`${CITY.dir}/${file}: not in the build's URL map (js/main.js URLS)`);
  const worker = new Worker(new URL('./load-worker.js', import.meta.url), { type: 'module' });
  let done = 0;
  try {
    await new Promise((resolve, reject) => {
      worker.onmessage = ({ data: { i, out, rt, status, error } }) => {
        try {
          const [key, file] = FILES[i];
          if (status) throw new Error(`${CITY.dir}/${file}: HTTP ${status}`);
          if (error != null) throw new Error(error);
          // the worker's fetch on the page's timeline (tools/perf reads it as the file's Resource Timing)
          if (rt) performance.measure(rt.name, { start: rt.startTime, end: rt.responseEnd, detail: { encodedBodySize: rt.encodedBodySize } });
          parts[i] = out;
          onProgress(++done / FILES.length, key);
          if (done === FILES.length) resolve(parts);
        } catch (e) { reject(e); }
      };
      // a worker that does not start, or fails outside a file, is a load error too, not a load that never ends
      worker.onerror = e => reject(new Error(`${CITY.dir}: the data worker failed${e.message ? `: ${e.message}` : ''}`));
      worker.onmessageerror = () => reject(new Error(`${CITY.dir}: a message from the data worker could not be read`));
      // each file's URL in the build (CITY.urls, set by main.js)
      worker.postMessage({ files: FILES.map(([key, file]) => [key, file, CITY.urls[file]]), origin: performance.timeOrigin });
      if (!FILES.length) resolve(parts);
    });
    return /** @type {CityData} */ (Object.fromEntries(FILES.map(([k], i) => [k, parts[i]])));
  } finally {
    worker.terminate();
  }
}
