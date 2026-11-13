# Stack research: summary

Research date: 2026-11-13, against commit `79bdd51`. This answers
[docs/STACK-RESEARCH-PROMPT.md](../STACK-RESEARCH-PROMPT.md). **Research only: no code, config or
dependency was changed, and no migration was run.** The only files written are in this folder.

**The short version.** Keep three.js, keep our data formats, keep Cloudflare Workers static
assets, keep the hand-written UI, keep the Python libraries and the committed data. Add the
things that are missing around them: a Vite build with dependencies installed from npm,
TypeScript checking, lint and unit tests in the build, a locked Python environment, hashed file
names with long-lived caching, and a worker for data decoding. Stop committing the 41 MB
single-file bundle, which is 521 MB of the 660 MB repository.

Layer files:
[1 engine](01-3d-engine.md) ·
[2 language](02-language-types.md) ·
[3 build](03-build-dev-server.md) ·
[4 data formats](04-data-formats-loading.md) ·
[5 pipeline](05-data-pipeline-python.md) ·
[6 UI](06-ui-layer.md) ·
[7 quality](07-quality-tooling.md) ·
[8 hosting](08-hosting-delivery.md)

## How the numbers were gathered

| Number | Source |
| --- | --- |
| npm version, publish date, license, dependencies, types, install scripts, provenance | `https://registry.npmjs.org/<name>` |
| Weekly downloads (2026-11-06 to 11-12) and year-on-year trend | `https://api.npmjs.org/downloads/point/last-week/<name>`, `/downloads/range/last-year/<name>` |
| Min+gzip size | `https://bundlephobia.com/api/size?package=<name>@<version>` |
| Stars, last push, open issues, contributor share | `https://api.github.com/repos/<repo>`, `/contributors?per_page=100` |
| Dependents (repositories / packages) | `https://github.com/<repo>/network/dependents` |
| Supply-chain scores | `https://socket.dev/npm/package/<name>` |
| PyPI version, wheels, downloads | `https://pypi.org/pypi/<name>/json`, `https://pypistats.org/api/packages/<name>/recent` |
| Browser support | `https://unpkg.com/web-features/data.json` |
| Cloudflare limits and behaviour | `developers.cloudflare.com` pages, linked where used |
| Everything about our code and data | Commands run on the working tree, quoted where used |

Caveats that apply throughout:

- npmjs.com's own "dependents" count could not be read (the site blocks scripted access), and
  two aggregators rate-limited part-way. GitHub's dependency graph was used instead; for
  repositories that publish several packages it shows only the default one (marked †).
- npm download counts rose across the board this year (typescript's 28-day total is +245% year
  on year), so trends are only meaningful relative to each other.
- Bundlephobia sizes are for a package's whole entry point, not for what we would import.
- Effort figures are rough estimates. Nothing was ported to check them.

## Current state

The section 0 inventory, corrected. Changes from the brief are marked **(corrected)**.

**App**
- 56 plain JavaScript ES modules in `js/`, 15,000 lines, 1,045,431 B (344,596 B gzip). No
  TypeScript, no `package.json`, no bundler, no tests, no linter, no CI.
- Four entries in [js/cities.js](../../js/cities.js): `phl`, `nyc`, `jsh` and `pine` (the
  kitchen). **(corrected)** Every page load fetches every city's code: `js/scene/index.js`
  imports all three cities' modules statically and `js/main.js` imports the kitchen. City-only
  code is 276,757 B (`phl/`), 215,777 B (`jsh/`), 102,079 B (`pine/`), 24,621 B (`nyc/`).
- The code is dense by design: 2,167 lines over 120 characters, longest 885. 262 doc comments,
  none with typed tags.

**Runtime dependencies**
- three.js **0.186.1** from jsDelivr through the import map at [index.html:12-15](../../index.html).
  **(corrected)** The current release is **0.187.0** (2026-10-30), so we are one release behind.
- Addons: `OrbitControls`, `Line2`, `LineMaterial`, `LineGeometry`, `LineSegments2`,
  `LineSegmentsGeometry`, `BufferGeometryUtils`, `RoomEnvironment`, `OutlineEffect`: 17 import
  lines in 10 files. All still exist in r187.
- We download all of three.js regardless of use: 398,757 B brotli for the core plus 33,425 B
  for the addons.
- [js/three-setup.js](../../js/three-setup.js) holds the r128 look: colour management off,
  lights ×π, forced single-pass transparency, and an anisotropy fix that reaches into private
  renderer state.
- Archivo (variable, width and weight axes, upright and italic) from Google Fonts.
- **(corrected)** Renderer-specific code that constrains an engine change: 4 `onBeforeCompile`
  shader patches, 4 `customDepthMaterial` sites, direct WebGL calls in `three-setup.js`, a
  logarithmic depth buffer, and a 4096² shadow map.

**Data**
- `data/` is 30 MB on disk: 25 `.json`, 6 `.json.gz`, 5 `.bin.gz`, 15 `.webp`.
- Per city, as transferred: Philadelphia 15.83 MB in 16 files, New York 8.31 MB in 9, Jersey
  Shore 0.87 MB in 11. Decoded: 60.8, 21.4 and 2.0 MB.
- **(corrected)** Decompression already uses the native `DecompressionStream`
  ([js/data.js:17-21](../../js/data.js)). Decompressing and parsing all of Philadelphia takes
  about 85 ms in Node, so parsing is not the load bottleneck; transfer and geometry building are.
- All fetching, decoding and geometry building runs on the main thread. No workers.

**Data pipeline**
- 24 Python data scripts in `tools/phl`, `tools/jsh`, `tools/nyc`. **(corrected)** Most use only
  the standard library. shapely is imported in 1 file, numpy in 2, Pillow in 3, osmium in 3.
- **(corrected)** Confirmed: no `requirements.txt`, `pyproject.toml` or lockfile exists.
- **(corrected)** Two more packages are used than listed: `rasterio` and `duckdb`
  ([tools/jsh/fetch_jsh.py](../../tools/jsh/fetch_jsh.py)), plus `playwright` for the harnesses.
- **(corrected)** New York's data cannot be rebuilt from this repository. It is imported from a
  separate project on an office file share ([docs/NYC.md:56](../NYC.md)). Philadelphia needs
  about 650 MB of downloads and two inputs fetched by hand.
- The docs' setup commands are Windows paths; the local venv is uv-managed Python 3.12.

**Hosting and deploy**
- **(corrected)** It is **Workers Builds** deploying a **Worker with static assets and no Worker
  script**, not Pages. Each commit gets a "Workers Builds: shittycity" check run.
- [wrangler.jsonc](../../wrangler.jsonc) serves the repository root. [.assetsignore](../../.assetsignore)
  excludes the bundle, tools and docs. 109 files are served; the largest is 5.76 MB against a
  25 MiB limit.
- **(corrected)** The deploy command is not in the repository. It is a dashboard setting
  (Worker → Settings → Build) whose default is `npx wrangler deploy`. With no `package.json`,
  `npx` uses whatever wrangler is current (4.162.0 today), so the deploy tool is unpinned.
- Build image: Ubuntu 24.04 x86_64, Node 24.22.1, npm 10.9.2, Python 3.14.8, uv 0.13.4.
  Limits: 20-minute timeout, 2 vCPU, 8 GB, 3,000 build minutes a month on the free plan, 1
  concurrent build. Build cache and per-branch previews are opt-in.
- Default headers: `Cache-Control: public, max-age=0, must-revalidate` with an `ETag`, so every
  visit revalidates every file. JSON, JS and CSS are compressed at the edge; `.gz` files are not
  touched. Range requests are not supported.

**Legacy single-file build**
- `city-models.html` is 41,053,765 B. **(corrected)** The README says 41 MB, `.assetsignore` says
  37 MB and `COLLABORATING.md` says 28 MB.
- **(corrected)** It is committed, and its 38 versions take 521.0 MB of the 660 MB `.git`
  directory after 65 commits in 4 days.
- `tools/bundle.py` constrains the sources (regex-parsed imports, no top-level use of `CITY`, a
  second data-loading path).
- **(corrected)** [COLLABORATING.md](../../COLLABORATING.md) describes a different workflow
  (clone from an office share, edit the HTML file directly) that no longer matches the repository
  on GitHub.

**Dev and QA**
- `tools/serve.py` (52 lines), `tools/perf` (1,109-line harness, 14 scenarios, paired A/B),
  `tools/ux` (549 lines plus an in-page audit), `tools/loading/capture.py`.
- **(corrected)** The harnesses are tied to the no-build layout: they serve source folders
  directly, snapshot `index.html`, `css/` and `js/`, intercept the CDN hosts, patch three's
  `generateUUID` in the CDN file, and attribute costs to source `file:line` from stack traces.
  Any build step has to bring them along.
- The kitchen (`pine`) has no perf scenario and no UX state file.

## Target stack

| Layer | Recommendation | Runner-up | Changes? |
| --- | --- | --- | --- |
| 1. 3D engine | three.js `WebGLRenderer`, upgraded 0.186.1 → 0.187.0, installed from npm | `WebGPURenderer` with its WebGL 2 fallback, as a later spike | Stays; version bump |
| 2. Language | TypeScript 7 with `@types/three`: first as a checker over the JS (`checkJs` plus `.d.ts` for data, `CITY`, scene API), then `.ts` files folder by folder | Stop at JS + JSDoc + `checkJs` | New |
| 3. Build and dev | Vite 8 (Rolldown), no framework plugin; `three` and `@fontsource-variable/archivo` from npm; `wrangler` pinned; output `dist/` | No build, but vendor three.js and the font into the repo | New |
| 4. Data formats | Our own formats, unchanged in kind. Decode in a module worker; tighten the terrain and large-JSON encodings in the pipeline; test Brotli pre-compression | glTF + meshopt for static meshes only | Stays; loading changes |
| 5. Pipeline | Same libraries. uv with `pyproject.toml` and `uv.lock`. Data stays committed | pip-tools | Stays; adds a lock |
| 6. UI | Vanilla DOM | `@preact/signals-core` (2,168 B gzip) as a state layer, trialled on one module | Stays |
| 7. Quality | Biome (lint only at first), `tsc --noEmit`, Vitest, Ruff, pytest; pixel diff added to the existing Playwright harnesses with Pillow; `tools/perf` stays the perf gate | ESLint + typescript-eslint; `node:test` | New |
| 8. Hosting | Workers static assets with Workers Builds; hashed file names with immutable caching; one origin; preview builds | R2 on a custom domain for `data/` when a file nears 25 MiB or we need range requests | Stays; headers and config change |

**Layers that stay as they are:** the engine, the data formats, the Python libraries, the UI
approach, the hosting product, and the three QA harnesses.

**Legacy bundle:** retire `city-models.html` and its two tools (decided 2026-11-13: the single
file is no longer needed).

### Resulting commands

```bash
npm ci
```

```bash
npm run dev
```

```bash
npm run check
```

```bash
npm run build
```

```bash
npx wrangler deploy
```

- `dev` is `vite` (replaces `python -I tools/serve.py`).
- `check` is `biome lint && tsc --noEmit && vitest run`.
- `build` is `vite build`, writing `dist/`.
- Cloudflare dashboard, Worker → Settings → Build: **Build command** `npm run check && npm run build`;
  **Deploy command** `npx wrangler deploy` (unchanged; it now runs the pinned version);
  **Preview command** `npx wrangler preview`; build cache on.
- `wrangler.jsonc`: `"assets": { "directory": "./dist" }`.
- Python: `uv sync --group data` then `uv run tools/<city>/<script>.py`; QA:
  `uv run tools/perf/perf.py ab --quick --shots`.

## Refactor plan

Each phase lands and is verified on its own. "Gate" is what must pass before merging it. Perf
gates run locally on the same machine for both sides, because the numbers depend on the GPU.

| # | Phase | Depends on | What changes | Gate |
| --- | --- | --- | --- | --- |
| 0 | **Baseline and decisions** | None | Record `perf.py run --repeat 3` per city and `ux.py run` for all cities and devices. Read the Cloudflare dashboard settings and production headers. Answer the open questions below | None; this produces the reference numbers |
| 1 | **Locked Python environment** | 0 | `pyproject.toml`, `uv.lock`, `.python-version`; docs updated. No script changes | Jersey Shore rebuilt with the locked environment gives an empty `git diff data/jsh`, or the differences are understood and written down |
| 2 | **Build skeleton at the same three.js version** | 0 | `package.json` with `three@0.186.1`, Vite, pinned wrangler, self-hosted font; import map and font links removed; `dist/` deployed; `tools/perf`, `tools/ux` and `capture.py` adapted to the build (serving, UUID patch, source maps) | `perf.py ab --rounds 5 --shots` with A = last no-build commit, B = the build, for `phl`, `nyc`, `jsh`: no metric "worse", screenshots match. `ux.py compare`: no new findings. Preview URL loads all four cities |
| 3 | **Checks in the build** | 2 | Biome (lint only), `tsconfig.json` with `allowJs`, first Vitest tests, Ruff, pytest, the Python-to-JS round-trip test, GitHub Actions workflow, pixel diff in `ab --shots` and `ux.py compare` | `npm run check` passes locally and in the Cloudflare build; a deliberately broken commit on a branch fails its preview build |
| 4 | **three.js 0.187.0** | 2, 3 | Version bump for `three` and `@types/three`; `three/addons/` import paths; `PCFSoftShadowMap` → `PCFShadowMap` in the kitchen | `ab --quick --shots` on `phl`; `--city jsh -s overlook-stand`; pixel diff within tolerance; kitchen checked by eye (PMREM change); `street-level` screenshot for the anisotropy fix |
| 5 | **Retire the committed bundle** | 2, decision | Remove `city-models.html` from the tree; remove or replace `tools/bundle.py` and `tools/unbundle.py`; delete the embedded-data paths in `data.js` and `loading.js`; rewrite `COLLABORATING.md` | `ab --quick`; all cities load from the build; if an artifact build is kept, it opens from disk |
| 6 | **Types** | 3; `.ts` renames also need 5 | `.d.ts` for the data files, `CITY` and the scene API; `// @ts-check` on leaf modules, widening; then `.ts` per folder with `strict` | `tsc --noEmit` clean; `ab --quick --shots` "not significant" and identical shots after each folder |
| 7 | **Per-city code splitting and caching** | 2 | Dynamic `import()` per city in `scene/index.js` and `main.js`; data manifest with hashed names; `_headers` with immutable caching | Chunk sizes from the build (expect `nyc` and `jsh` to stop loading `phl/`'s 277 KB); `load.*` rows in `ab` for each city not worse; on a preview URL, a second load transfers only `index.html`; `curl -sI` shows the intended headers |
| 8 | **Data loading off the main thread** | 2, 7 | Streamed decompression; a module worker that fetches, decompresses and decodes, transferring typed arrays | `ab --rounds 5` on `phl` and `nyc`: `load.total` and the load step rows better or not significant; main-thread time under `loadData`/`decode`/`pairs` in `load.cpuprofile` down; frame metrics unchanged |
| 9 | **Smaller data** | 1, 3 (round-trip test), 8 | Terrain and large-JSON encodings, one format per change, with `docs/EDITING.md`; Brotli pre-compression if the preview test shows static assets pass it through | Size table before and after per file; round-trip test passes; `ab` load rows not worse; `--shots` identical |
| 10 | **Optional spikes** | All above | `@preact/signals-core` on `ridebar.js`; `WebGPURenderer` with `forceWebGL` on Jersey Shore; worker-side geometry building if profiles after phase 8 still point at builders | Each spike reports numbers from `ab` and a go/no-go; none merges without them |

Dependency notes:

- Phase 2 is the hinge. It is also the riskiest, because it has to change the perf and UX
  harnesses that gate every other phase. Proving it with an A/B against the last no-build commit
  is what makes the later gates trustworthy.
- Phases 1 and 2 are independent and can run in parallel. So can 4, 5, 6 and 7 once 3 is in.
- Phase 4 is deliberately separate from phase 2, so a look or speed change can be attributed
  either to bundling or to the three.js upgrade.
- If we choose the runner-up for layer 3 (no build), phases 2, 5 and 7 shrink to: vendor three.js
  and the font, add `_headers`, and hand-write the dynamic imports. Phase 6 stops at JSDoc.

Rough total for phases 0 to 9: 25 to 40 working days, unverified. The spread is mostly phase 6
(types) and phase 2 (harness).

## Open questions

These need a decision before execution.

1. **Decided 2026-11-13: the single-file `city-models.html` is not needed.** Retire it in
   phase 5: remove the file, `tools/bundle.py`, `tools/unbundle.py` and the embedded-data paths
   in `data.js` and `loading.js`. No artifact build. **Still open:** whether to rewrite git
   history to drop its 521 MB, which would change every commit hash and require everyone to
   re-clone.
2. **Decided 2026-11-13: no formatter for now, lint only** (JavaScript and Python). A formatter
   would rewrite most of the 15,000 dense lines in one commit and bury the diffs of every
   refactor phase. Revisit after phase 6, when the code is typed and no phase is in flight.
3. **How far to take TypeScript:** stop at checked JS with `.d.ts` files, or rename to `.ts`?
4. **Does a failing check block the deploy?** Recommended yes (lint, types, unit tests in the
   build command). That ends "every commit deploys" for commits that fail them.
5. **Cloudflare settings we could not read:** the Workers plan (free or paid), the configured
   build, deploy and preview commands, whether build cache and preview builds are on, typical
   build duration, the production URL and any custom domain. Who has dashboard access to record
   them?
6. **Preview builds:** enable for all branches or only pull requests? Enabling Worker Previews
   on an existing Worker is a one-time switch that cannot be reversed.
7. **Browser support floor.** The plan assumes Safari 16.4 or later (import maps, module
   workers, `DecompressionStream` all need it at most). Is that acceptable? Safari is not covered
   by the Chromium-only harnesses and needs a manual check per phase.
8. **New York's data source.** It lives in another repository on an office share. Should its
   tools move here, or stay separate with the import step documented as the contract?
9. **Python version:** pin 3.12 (what the venv has) or go to 3.14 (what Cloudflare's image has)?
10. **Kitchen coverage.** `pine` has no perf scenario or UX states, and it is the part most
    affected by the three.js 0.187 PMREM change. Add a scenario before phase 4, or accept a
    visual check?
11. **Who runs the perf gates, on which machine?** `ab` results are only comparable on one
    machine. If several people land phases, agree on one reference machine or always run both
    sides locally.
12. **Third-party content.** Self-hosting Archivo (OFL-1.1) and three.js (MIT) puts their files
    in our build output. No licence obstacle was found; confirm we are happy to drop the CDNs.

## Not verified

Collected here so nothing is lost; each is also marked in its layer file.

- Cloudflare dashboard settings, plan, build durations and production response headers.
- Tree-shaken size of three.js for our imports (needs a build to measure).
- Whether Workers static assets pass through a pre-compressed Brotli file with
  `Content-Encoding` set in `_headers`.
- Whether the browser harnesses can run usefully on a GPU-less CI runner.
- `OutlineEffect`, `forceSinglePass` and `customDepthMaterial` behaviour under `WebGPURenderer`.
- `typescript-eslint` support for TypeScript 7; maturity of oxlint's type-aware mode.
- The npm "dependents" figure from npmjs.com itself, and dependents for packages whose
  repository GitHub's dependency graph does not cover (`@gltf-transform/core`, `pmtiles`,
  `@giro3d/giro3d`, `@mapbox/martini`).
- Socket's per-alert detail (only the five headline scores were read), including the "2 high
  alerts" in Vite's dependencies.
- DuckDB's and ty's licence strings (PyPI's field is empty for both); osmium-tool's version and
  licence.
- All effort estimates, and how much code a UI library would remove.
- Browser-side decode and parse timings (the 85 ms figure is Node on this machine).
