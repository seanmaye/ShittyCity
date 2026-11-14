// @ts-check
// The data worker: a module worker that js/data.js loadData starts for one load. It fetches the city's data files, gunzips
// the .gz ones as they stream in, decodes the binary ones (js/formats.js) and posts each file back as soon as it is done,
// its buffers transferred, not copied. JSON comes back as its bytes, for the page to parse. It never reads CITY: the page
// sends { files: [[key, file, url], ...], origin: the page's performance.timeOrigin }.
import { decode, readGrid, readTerrain } from './formats.js';

// the binary files decoded here, by their key in CITY.files (js/cities.js; phl's terrain and jsh's grid are both terrain.bin.gz)
const READ = { cityBuildings: decode, terrain: readTerrain, grid: readGrid };
// this worker's global scope (tsconfig has a page's types, whose postMessage takes a target origin)
const scope = /** @type {{ postMessage(message: unknown, transfer?: Transferable[]): void }} */ (/** @type {unknown} */ (globalThis));

/** a .gz file's body, gunzipped as it streams in (its first bytes, read from a tee of it, say whether it is gzip at all) */
async function gunzip(body) {
  const [peek, all] = body.tee(), reader = peek.getReader(), head = [];
  for (let c; head.length < 2 && !(c = await reader.read()).done;) head.push(...c.value.subarray(0, 2 - head.length));
  reader.cancel();
  return new Response(head[0] === 0x1f && head[1] === 0x8b ? all.pipeThrough(new DecompressionStream('gzip')) : all).arrayBuffer();   // else already decoded by the server
}

/** each buffer under a result (bytes, or an object of typed arrays, some of them views into one buffer) once, to transfer */
const buffers = out => [...new Set(out instanceof ArrayBuffer ? [out] : Object.values(out).filter(v => ArrayBuffer.isView(v)).map(v => v.buffer))];

addEventListener('message', ({ data: { files, origin } }) => {
  const shift = performance.timeOrigin - origin;   // this worker's clock -> the page's
  files.forEach(async ([key, file, url], i) => {
    try {
      const r = await fetch(url);
      if (!r.ok) return scope.postMessage({ i, status: r.status });
      const buf = file.endsWith('.json') ? await r.arrayBuffer() : await gunzip(r.body), out = READ[key] ? READ[key](buf) : buf;
      // the fetch's Resource Timing, which only this worker's timeline has, in the page's time (js/data.js puts it on the page's)
      const e = /** @type {PerformanceResourceTiming | undefined} */ (performance.getEntriesByName(r.url, 'resource').at(-1));
      const rt = e && { name: e.name, startTime: e.startTime + shift, responseEnd: e.responseEnd + shift, encodedBodySize: e.encodedBodySize };
      scope.postMessage({ i, out, rt }, buffers(out));
    } catch (err) {
      scope.postMessage({ i, error: String(err?.message ?? err) });
    }
  });
});
