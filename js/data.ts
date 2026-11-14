// Data loading and the local map projection shared by every scene module.
// Each city's generated files live in data/<city>/ (tools/<city>/ makes them); coordinates there
// are integer decimetres in that city's frame (js/cities.ts).
import * as THREE from 'three';
import { CITY } from './cities.ts';
import { decodeJcol, formatOf } from './formats.ts';
import type { CityData, Pair } from './types/data.ts';

/** lat/lon -> scene position (x metres east, z metres south of the city's origin) */
export const G = (lat: number, lon: number) => { const f = CITY.frame; return new THREE.Vector3((lon - f.LON0) * f.MX, 0, -(lat - f.LAT0) * f.MZ); };
export const latOf = (z: number) => CITY.frame.LAT0 - z / CITY.frame.MZ;

/** flat [x,z,x,z...] decimetres -> [[x,z],...] metres */
export function pairs(flat: ArrayLike<number>): Pair[] {
  const out = new Array(flat.length / 2);
  for (let i = 0; i < flat.length; i += 2) out[i / 2] = [flat[i] / 10, flat[i + 1] / 10];
  return out;
}

async function gunzip(bytes: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> {
  const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(s).arrayBuffer();
}

/** load the active city's files (CITY.files, from CITY.dir) */
export async function loadData(onProgress: (done: number, key: string) => void = () => {}): Promise<CityData> {
  const FILES = CITY.files;
  let done = 0;
  const parts = await Promise.all(FILES.map(async ([key, file]) => {
    if (!CITY.urls[file]) throw new Error(`${CITY.dir}/${file}: not in the build's URL map (js/main.ts URLS)`);
    const r = await fetch(CITY.urls[file]);   // its URL in the build (CITY.urls, set by main.ts)
    if (!r.ok) throw new Error(`${CITY.dir}/${file}: HTTP ${r.status}`);
    // the file as committed (the dev server) or the build's encoding of it (js/formats.ts: JCOL for JSON, gzipped; TER2 and
    // PHB2 are read where they are used): gzip by its first bytes, whatever the name (a server may have decoded it already)
    const got = new Uint8Array(await r.arrayBuffer()), bytes = got[0] === 0x1f && got[1] === 0x8b ? new Uint8Array(await gunzip(got)) : got;
    let out: unknown;
    if (formatOf(bytes) === 'JCOL') out = decodeJcol(bytes);
    else if (/\.json(\.gz)?$/.test(file)) out = JSON.parse(new TextDecoder().decode(bytes));
    else out = bytes.buffer;
    onProgress(++done / FILES.length, key);
    return out;
  }));
  return Object.fromEntries(FILES.map(([k], i) => [k, parts[i]])) as unknown as CityData;   // (each file's parsed JSON or bytes, by key)
}
