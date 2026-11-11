// Data loading and the local map projection shared by every scene module.
// Generated files live in data/ (see tools/build_data.py); coordinates there are
// integer decimetres in this same frame.
import * as THREE from 'three';
export const LAT0 = 39.9560, LON0 = -75.1760, MX = 85390, MZ = 111000;

/** lat/lon -> scene position (x metres east, z metres south of the origin) */
export const G = (lat, lon) => new THREE.Vector3((lon - LON0) * MX, 0, -(lat - LAT0) * MZ);
export const latOf = z => LAT0 - z / MZ;

/** flat [x,z,x,z...] decimetres -> [[x,z],...] metres */
export function pairs(flat) {
  const out = new Array(flat.length / 2);
  for (let i = 0; i < flat.length; i += 2) out[i / 2] = [flat[i] / 10, flat[i + 1] / 10];
  return out;
}

// [key in the loaded object, file in data/]; .gz files are gzip (JSON or binary)
const FILES = [
  ['buildings', 'buildings.json'], ['river', 'river.json'], ['ground', 'ground.json'], ['trees', 'trees.json'],
  ['landmarks', 'landmarks.json'], ['sports', 'sports.json'], ['yardpark', 'yardpark.json'], ['transit', 'transit.json'],
  ['trolley1953', 'trolley1953.json'], ['city', 'city.json.gz'], ['cityBuildings', 'city_buildings.bin.gz'], ['metro', 'metro.json.gz'], ['cityMarks', 'city_landmarks.json'],
];
const stem = f => f.replace(/\.(json|bin)(\.gz)?$/, '');

async function gunzip(bytes) {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); // already decoded by the server
  const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(s).arrayBuffer();
}

export async function loadData(onProgress = () => {}) {
  let done = 0;
  const parts = await Promise.all(FILES.map(async ([key, file]) => {
    // the single-file build (tools/bundle.py) embeds each file as a <script> block:
    // application/json as text, .gz files as base64 (application/gzip-base64)
    const embedded = document.getElementById(`data-${stem(file)}`);
    let out;
    if (embedded && embedded.type === 'application/json') out = JSON.parse(embedded.textContent);
    else {
      let bytes;
      if (embedded) bytes = Uint8Array.from(atob(embedded.textContent.trim()), c => c.charCodeAt(0));
      else {
        const r = await fetch(`data/${file}`);
        if (!r.ok) throw new Error(`data/${file}: HTTP ${r.status}`);
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
