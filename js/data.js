// Data loading and the local map projection shared by every scene module.
// Generated files live in data/ (see tools/build_data.py) and data/<city>/; coordinates there
// are integer decimetres in the active city's frame (js/cities.js).
import * as THREE from 'three';
import { CITY } from './cities.js';

/** lat/lon -> scene position (x metres east, z metres south of the city's origin) */
export const G = (lat, lon) => { const f = CITY.frame; return new THREE.Vector3((lon - f.LON0) * f.MX, 0, -(lat - f.LAT0) * f.MZ); };
export const latOf = z => CITY.frame.LAT0 - z / CITY.frame.MZ;

/** flat [x,z,x,z...] decimetres -> [[x,z],...] metres */
export function pairs(flat) {
  const out = new Array(flat.length / 2);
  for (let i = 0; i < flat.length; i += 2) out[i / 2] = [flat[i] / 10, flat[i + 1] / 10];
  return out;
}

const stem = f => f.replace(/\.(json|bin)(\.gz)?$/, '');

async function gunzip(bytes) {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); // already decoded by the server
  const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(s).arrayBuffer();
}

/** load the active city's files (CITY.files, from CITY.dir) */
export async function loadData(onProgress = () => {}) {
  const FILES = CITY.files;
  let done = 0;
  const parts = await Promise.all(FILES.map(async ([key, file]) => {
    // the single-file build (tools/bundle.py) embeds each file as a <script> block:
    // application/json as text, .gz files as base64 (application/gzip-base64)
    const embedded = document.getElementById(`data-${CITY.prefix}${stem(file)}`);
    let out;
    if (embedded && embedded.type === 'application/json') out = JSON.parse(embedded.textContent);
    else {
      let bytes;
      if (embedded) bytes = Uint8Array.from(atob(embedded.textContent.trim()), c => c.charCodeAt(0));
      else {
        const r = await fetch(`${CITY.dir}/${file}`);
        if (!r.ok) throw new Error(`${CITY.dir}/${file}: HTTP ${r.status}`);
        bytes = new Uint8Array(await r.arrayBuffer());
      }
      if (file.endsWith('.json')) out = JSON.parse(new TextDecoder().decode(bytes));
      else {
        const buf = await gunzip(bytes);
        out = file.endsWith('.json.gz') ? JSON.parse(new TextDecoder().decode(buf)) : buf;
      }
    }
    onProgress(++done / FILES.length, key);
    return out;
  }));
  return Object.fromEntries(FILES.map(([k], i) => [k, parts[i]]));
}
