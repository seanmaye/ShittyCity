# Layer 4: Data formats and loading

Research date: 2026-11-13. Nothing here has been executed; see [SUMMARY.md](SUMMARY.md).

## The need

**What the code does today.** [js/data.js:24-53](../../js/data.js) fetches every file in
`CITY.files` in parallel, reads each fully into memory, gunzips `.gz` files with the native
`DecompressionStream` ([data.js:17-21](../../js/data.js)), and `JSON.parse`s or returns the
`ArrayBuffer`. Everything then runs on the main thread: decoding the binary layouts
([js/scene/city.js:22-36](../../js/scene/city.js), [js/scene/terrain.js:19-27](../../js/scene/terrain.js),
[js/scene/jsh/terrain.js:21-26](../../js/scene/jsh/terrain.js)) and building all geometry in
12 steps separated by `await nextFrame()` ([js/scene/index.js:108-253](../../js/scene/index.js)).

The formats are our own and documented in [docs/EDITING.md](../EDITING.md): JSON with
coordinates as flat integer-decimetre arrays, a column-oriented binary for the citywide
buildings (`PHB1`, delta-encoded positions), and Int16 grids for terrain.

**Measured on the committed data** (Node 24 on this machine; `.gz` sizes are the files as
shipped, plain `.json` is shown at Brotli quality 5 as a stand-in for edge compression, since
Cloudflare compresses `application/json` responses but not `application/gzip` or
`application/octet-stream`:
[content compression](https://developers.cloudflare.com/speed/optimization/content/compression/)):

| City | Files | Transfer | Decoded | gunzip (Node) | `JSON.parse` (Node) | Same data at Brotli 11 |
| --- | --- | --- | --- | --- | --- | --- |
| `phl` | 16 | 15.83 MB | 60.8 MB | 49 ms | 36 ms | 11.80 MB |
| `nyc` | 9 | 8.31 MB | 21.4 MB | 26 ms | 28 ms | 5.93 MB |
| `jsh` | 11 | 0.87 MB | 2.0 MB | 2 ms | 2 ms | 0.65 MB |

Largest files:

| File | As shipped | Decoded | Brotli 11 of the decoded bytes |
| --- | --- | --- | --- |
| `data/phl/terrain.bin.gz` | 5,760,004 B | 34,283,928 B | 4,666,407 B |
| `data/phl/buildings.json` (not gzipped in the repo) | 4,607,464 B raw; 1,752,339 B at Brotli 5 | 4.61 MB | 1,190,693 B |
| `data/phl/city_buildings.bin.gz` | 4,179,982 B | 9,427,736 B | 3,540,988 B |
| `data/nyc/city_buildings.bin.gz` | 3,199,929 B | 7.73 MB | 2,657 KB |
| `data/nyc/city.json.gz` | 2,931,591 B | 8.35 MB | 1,835 KB |
| `data/phl/city.json.gz` | 2,658,578 B | 8,126,790 B | 1,798,571 B |
| `data/nyc/buildings.json.gz` | 2,118,543 B | 4.96 MB | 1,405 KB |
| `data/phl/metro.json.gz` | 1,033,283 B | 2.84 MB | 290 KB |

Two things follow from these numbers:

1. **Parsing is not the bottleneck.** Decompressing and parsing all of Philadelphia takes about
   85 ms in Node. A format that parses faster (FlatBuffers, Arrow, glTF) has at most that much
   to win, before counting the code it adds. Browser timings will differ; the place to read
   them is `load.cpuprofile` from `tools/perf`.
2. **Transfer and geometry building are.** Philadelphia is 15.8 MB on the wire, and the load is
   dominated by the builders (perf README, "Load": steps come from the `#status` messages, and
   "First frame" is shader compile plus buffer upload).

The loading-screen images are 15 `.webp` files, 2.0 MB in total, fetched as slides.

**What we would gain.** Smaller downloads (compression and encoding), a responsive loading
screen (work off the main thread), and repeat visits that download nothing
([layer 8](08-hosting-delivery.md), caching).

**What rules an option out.** HTTP range requests (not available, below); a format that needs
a tileset authoring pipeline we don't have; a decoder bigger than the bytes it saves; anything
that breaks the documented schemas without a matching change in `tools/<city>/` and
`docs/EDITING.md`.

**Platform constraint.** Workers static assets answer a `Range` request with `200 OK` and the
whole file, "instead of `206 Partial Content`"
([billing and limitations](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)).
Formats that work by range-reading one large archive cannot be served from static assets.

## Candidates

Same sources as [layer 1](01-3d-engine.md). Native APIs are listed first because section 3 of
the brief says to check them before adding anything.

**Native browser APIs**

| API | Baseline status | Use |
| --- | --- | --- |
| `DecompressionStream('gzip')` | "high" since 2025-11-09; Chrome 80, Firefox 113, Safari 16.4 | Already used. Can stream straight from `fetch().body` instead of buffering first |
| Module workers | "high" since 2025-12-06; Chrome 80, Firefox 114, Safari 15 | Fetch, decompress, parse and build typed arrays off the main thread; transfer `ArrayBuffer`s back |
| `OffscreenCanvas` | "high" since 2025-09-27; Chrome 69, Firefox 105, Safari 16.4 | Render in a worker. See fit check |
| Zstandard content encoding | "low" since 2026-02-11; Safari 26.3 | Needs a Cloudflare Compression Rule |
| Compression dictionaries | Not Baseline (Chromium only) | Skip |

Source for all rows: [web-features data](https://unpkg.com/web-features/data.json), features
`compression-streams`, `js-modules-workers`, `offscreen-canvas`, `zstd`,
`compression-dictionary-transport`.

**Packages**

| Name | Version | Last release | Dependents (repos / pkgs) | Weekly downloads | Gzip | Deps | Types | License | Maintenance signal | Fit notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [@gltf-transform/core](https://www.npmjs.com/package/@gltf-transform/core) | 4.5.1 | 2026-09-28 | unverified (repo field not on GitHub form) | 1,408,013 | 21,067 | 1 | yes | MIT | 6 releases in 12 months; repo ★2,076; top contributor 71% | Build-time tool to write glTF from our data. three's `GLTFLoader` reads it |
| [meshoptimizer](https://www.npmjs.com/package/meshoptimizer) | 1.3.0 | 2026-09-25 | 217,172 / 323 | 24,478,127 | 52,013 | 0 | yes | MIT | 6 releases in 12 months; 6 open issues; top contributor 98% | Vertex and index codec; three ships a decoder in `examples/jsm/libs` |
| [draco3d](https://www.npmjs.com/package/draco3d) | 1.5.9 | 2026-10-16 | 231,011 / 165 | 7,464,811 | 23,098 (JS glue; the WASM decoder is separate) | 0 | no | Apache-2.0 | 2 releases in 12 months | Mesh compression; slower to decode than meshopt |
| [flatbuffers](https://www.npmjs.com/package/flatbuffers) | 25.9.23 | 2025-09-24 | 208,786 / 645 | 17,293,014 | 2,645 | 0 | yes | Apache-2.0 | 0 npm releases in 12 months (repo active) | Zero-copy tables. Needs `flatc` schemas and codegen in both Python and JS |
| [pmtiles](https://www.npmjs.com/package/pmtiles) | 4.5.0 | 2026-08-10 | unverified | 2,251,900 | 7,681 | 1 | yes | BSD-3-Clause | 5 releases in 12 months; repo ★3,109; top contributor 85% | One archive read by HTTP range requests |
| [3d-tiles-renderer](https://www.npmjs.com/package/3d-tiles-renderer) | 0.5.4 | 2026-11-03 | 348 / 94 | 324,477 | 30,098 | 3 | yes | Apache-2.0 | 16 releases in 12 months; top contributor 88% | Streams OGC 3D Tiles into three (peer `three >=0.167.0`). Needs a tileset |
| [flatgeobuf](https://www.npmjs.com/package/flatgeobuf) | 4.6.1 | 2026-10-21 | 9 / unverified | 151,935 | 28,045 | 4 | yes | BSD-3-Clause | 6 releases in 12 months | GIS features with a spatial index, read by range requests |
| [geobuf](https://www.npmjs.com/package/geobuf) + [pbf](https://www.npmjs.com/package/pbf) | 4.0.0 / 5.1.2 | 2026-04-28 / 2026-07-09 | 1,924 / 62 and 261,504 / 849 | 793,135 / 18,772,853 | 1,982 / 2,622 | 2 / 1 | no / yes | ISC / BSD-3-Clause | 1 and 5 releases in 12 months | Compact GeoJSON. Our JSON is not GeoJSON |
| [protobufjs](https://www.npmjs.com/package/protobufjs) / [@bufbuild/protobuf](https://www.npmjs.com/package/@bufbuild/protobuf) | 8.8.1 / 2.17.0 | 2026-10-11 / 2026-11-05 | 2,317,336 / 7,722 and 118,865 / 2,420 | 121,908,655 / 41,264,506 | 32,570 / 27,933 | 1 / 0 | yes | BSD-3-Clause / Apache-2.0 AND BSD-3-Clause | 37 and 10 releases in 12 months | General schema'd binary. Decoder is larger than our hand-written one |
| [msgpackr](https://www.npmjs.com/package/msgpackr) / [cbor-x](https://www.npmjs.com/package/cbor-x) | 2.1.4 / 1.6.9 | 2026-11-02 | 749,725 / 720 and 7,976 / 532 | 58,994,070 / 4,996,401 | 14,735 / 13,639 | 0 | yes | MIT | 23 and 7 releases in 12 months | Binary JSON. Saves parse time we don't spend |
| [apache-arrow](https://www.npmjs.com/package/apache-arrow) / [hyparquet](https://www.npmjs.com/package/hyparquet) | 21.2.0 / 1.33.0 | 2026-07-21 / 2026-11-08 | † and 634 / 227 | 10,236,085 / 3,264,698 | 53,008 / 20,133 | 4 / 0 | yes | Apache-2.0 / MIT | 1 and 41 releases in 12 months | Columnar tables. Our big tables are already columnar typed arrays |
| [fflate](https://www.npmjs.com/package/fflate) / [pako](https://www.npmjs.com/package/pako) | 0.8.3 / 3.0.3 | 2026-05-16 / 2026-10-26 | 758,296 / 5,861 and 13,119,400 / 5,922 | 157,310,495 / 186,352,709 | 12,146 / 13,637 | 0 | yes | MIT / MIT AND Zlib | 5 releases each in 12 months | JS gzip. `DecompressionStream` already covers it |
| [comlink](https://www.npmjs.com/package/comlink) | 4.4.2 | 2024-11-07 | 24,412 / 1,058 | 4,088,218 | 1,942 | 0 | yes | Apache-2.0 | 0 releases in 24 months | RPC over `postMessage` |
| [@loaders.gl/core](https://www.npmjs.com/package/@loaders.gl/core) | 4.5.4 | 2026-10-10 | 10,944 / 276 † | 1,820,166 | 15,656 (core only; each format is another package) | 5 | yes | MIT | 10 releases in 12 months | Loader framework for standard formats. Ours aren't |
| [earcut](https://www.npmjs.com/package/earcut) | 3.2.4 | 2026-09-28 | 249,004 / 965 | 20,935,188 | 4,153 | 0 | yes | ISC | 7 releases in 12 months | Triangulation. three bundles its own (`ShapeUtils`, used at [js/scene/geometry.js](../../js/scene/geometry.js)) |
| [@mapbox/martini](https://www.npmjs.com/package/@mapbox/martini) | 0.2.0 | 2020-01-31 | unverified | 798,872 | 1,065 | 0 | no | ISC | No release since 2020 | Terrain mesh simplification |
| [geotiff](https://www.npmjs.com/package/geotiff) | 3.0.5 | 2026-03-11 | † | 1,915,507 | 112,999 | 8 | yes | MIT | 6 releases in 12 months | Read GeoTIFF in the browser. The pipeline already converts DEMs |

## Cut

- **pmtiles, flatgeobuf**: built on HTTP range requests, which Workers static assets don't
  serve. Usable only with R2 or a Worker in front; not justified for 31 MB of data.
- **comlink**: no release in 24 months. A typed `postMessage` wrapper for two or three message
  kinds is a few lines.
- **@mapbox/martini**: no release since 2020, no types.
- **flatbuffers (npm)**: no npm release in 12 months, and codegen in two languages for tables we
  already read with 15 lines of `DataView`.
- **protobuf, msgpack, CBOR, Arrow, Parquet, geobuf**: they optimise parse time or generality.
  We measured parse time at tens of milliseconds, and the large tables are already typed arrays.
- **fflate, pako**: duplicated by the native `DecompressionStream`.
- **draco3d**: only matters with glTF, where meshopt is the lighter decoder.
- **@loaders.gl, geotiff, earcut**: covered by what we or three already have.

Finalists: **keep our formats and improve delivery and threading (native APIs only)**,
**glTF with meshopt, built in the pipeline**, **3D Tiles through `3d-tiles-renderer`**.

## Vetting

**Keep our formats; native APIs**
- No new dependency. All three APIs are Baseline "high" (table above).
- Compression headroom is measured: Brotli 11 on the decoded bytes is 25% smaller than what we
  ship for `phl` (11.80 vs 15.83 MB), 29% for `nyc`, 25% for `jsh`.
- Unverified: how to get Brotli-11 bytes to the browser from Workers static assets. Cloudflare
  compresses listed content types at the edge at a level it chooses, and
  `application/octet-stream` is not on the list. Whether a pre-compressed file with a
  `Content-Encoding: br` header set in `_headers` is passed through untouched needs a test on a
  preview deployment. `DecompressionStream` has no Brotli format in the Baseline feature above.

**glTF + meshopt**
- [socket.dev/npm/package/@gltf-transform/core](https://socket.dev/npm/package/@gltf-transform/core):
  100 / 100 / 80 / 88 / 100. [meshoptimizer](https://socket.dev/npm/package/meshoptimizer):
  100 / 100 / 100 / 84 / 100. Both are effectively one-maintainer projects (71% and 98% of
  commits), both released within two months.
- It would move geometry building from page load to the pipeline: the browser would receive
  ready vertex buffers.
- Cost: the builders are where the product lives. Buildings get per-instance facade styles and
  night windows ([js/scene/city.js](../../js/scene/city.js), [js/scene/materials.js](../../js/scene/materials.js)),
  seasons recolour and re-shade them ([js/scene/season.js](../../js/scene/season.js)), terrain
  drapes everything ([js/scene/terrain.js](../../js/scene/terrain.js)). Baking meshes means
  either baking those too or keeping the builders and gaining little. Pre-built vertex data is
  also larger than the footprints it is generated from, so transfer would go up, not down
  (unverified; no conversion was run).

**3D Tiles**
- [socket.dev/npm/package/3d-tiles-renderer](https://socket.dev/npm/package/3d-tiles-renderer):
  99 / 100 / 100 / 90 / 100. Active (16 releases in 12 months), one main author (88%).
- It solves streaming level of detail for scenes too big to load at once. Ours loads whole and
  already culls 1 km tiles itself ([js/scene/city.js:19](../../js/scene/city.js), `TILE = 1000`).
- Needs a tileset generator. `py3dtiles` 12.1.1 is at 3,736 weekly downloads
  (`https://pypistats.org/api/packages/py3dtiles/recent`) and pulls in `numba`, `pyzmq`, `lz4`.
- Tile content is glTF, so every cost in the glTF row applies as well.

## Fit check

| Finalist | Files touched | Effort (rough days) | Deploy change |
| --- | --- | --- | --- |
| Native: stream decode | [js/data.js:17-21,42-47](../../js/data.js) | 0.5 | None |
| Native: decode in a worker | New `js/data.worker.js`; `js/data.js`; move `decode()` from `js/scene/city.js:22-36`, the readers from `js/scene/terrain.js:19-27` and `js/scene/jsh/terrain.js:21-26`, and `pairs()` | 2 to 3 | A worker chunk in the build (Vite handles `new Worker(new URL(...), { type: 'module' })`) |
| Native: build geometry in a worker | `js/scene/geometry.js` (`Builder`), and the builders that only produce buffers: `buildings.js`, `ground.js`, `city.js`, `terrain.js` | 8 to 15, unverified | Same |
| Better encoding in the pipeline | `tools/phl/build_terrain.py`, `tools/phl/build_data.py`, `tools/nyc/import_nyc.py`, the matching JS readers, `docs/EDITING.md` | 1 to 2 per file format | None |
| Pre-compressed Brotli | A build step; `_headers`; `js/data.js` if we decode ourselves | 1, after the delivery test | Build step |
| `OffscreenCanvas` (render in a worker) | `core.js`, every pointer and keyboard handler in `ui.js` (46 listeners), `OrbitControls`, label placement (`ui.placeTags` reads the camera every frame), `minimap.js`, `tools/perf/probe.js`, `tools/ux/audit.js` (both reach `window.__city.renderer`) | 15+, unverified | None |
| glTF + meshopt | A new exporter per city in `tools/`; most of `js/scene/` | 30+ | Decoder WASM asset |
| 3D Tiles | The same, plus a tiler | 40+ | Many small tile files |

Perf scenarios that prove or disprove each claim:

| Claim | Check |
| --- | --- |
| Worker decoding keeps the loading screen animating and shortens the load | `perf.py ab` on `phl` and `nyc`: the load step rows and `load.total`; in `load.cpuprofile`, main-thread time under `loadData`, `decode`, `pairs`, `JSON.parse`. Load metrics are noisy (±10 to 17% per the README), so use `--rounds 5` or more |
| Worker geometry building shortens time to first frame | Same rows, plus the "builder" table of `load.cpuprofile` |
| Smaller files load faster | Not visible to `tools/perf` (it serves from localhost). Needs a throttled Playwright context or a preview URL; unverified until then |
| A new terrain encoding is smaller | File sizes from the pipeline run, then `load.*` for decode cost |
| Nothing regressed at runtime | `perf.py ab --quick`: frame, GPU, calls "not significant"; `--shots` identical |

## Recommendation

**Keep our own formats. Change how they are delivered and where they are decoded, with native
APIs only, in this order:**

1. Cache them properly and hash the file names ([layer 8](08-hosting-delivery.md)). This makes
   repeat visits free and is independent of everything else.
2. Fetch, decompress and decode in a module worker, transferring typed arrays to the main thread.
3. Tighten the two largest encodings in the pipeline: `terrain.bin` (34.3 MB of Int16 samples;
   try row-delta before gzip) and the remaining large JSON (`buildings.json`,
   `city.json`), which can use the `PHB1` column layout that `city_buildings.bin` already has.
4. Test whether Brotli-11 pre-compressed files can be served from static assets; adopt if so.

**Runner-up:** glTF with meshopt for the static, never-restyled parts only (terrain mesh,
hand-built landmarks), if profiling after step 2 shows their builders still dominate the load.

Not recommended: 3D Tiles, PMTiles, `OffscreenCanvas`, or any general serialisation library.

## Risks

- **Two code paths for data.** The single-file build embeds data in `<script>` blocks
  ([js/data.js:31-41](../../js/data.js)). A worker cannot read the DOM, so that path would stay
  on the main thread or go away with the bundle decision in [layer 3](03-build-dev-server.md).
- **Format changes need both sides.** Python writers and JS readers must change together, along
  with `docs/EDITING.md`. A round-trip test in [layer 7](07-quality-tooling.md) guards this.
- **Transfer cost of large arrays.** Use transferable `ArrayBuffer`s, not structured clone, or
  the worker saves nothing.
- **Safari worker behaviour** is not covered by the Chromium-only harnesses. Check by hand.

## Migration steps

1. Baseline: `perf.py run --repeat 3` per city; keep `report.json` and `load.cpuprofile`.
2. `js/data.js`: stream `fetch().body` through `DecompressionStream` instead of buffering.
3. Add the worker: it takes `CITY.dir` and `CITY.files`, returns parsed JSON and typed arrays
   (transfer list). Move `decode()` and the terrain readers into it. Gate with `ab` on load.
4. Pipeline encodings, one file format per change, each with updated docs and a size table.
5. Preview-deployment test for pre-compressed Brotli; record the response headers.
6. Re-profile. Only then decide on worker-side geometry building or the glTF runner-up.
