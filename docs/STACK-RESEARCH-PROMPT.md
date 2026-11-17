# Stack research prompt: refactoring shittycity

Research only. Gather the specs for refactoring shittycity and the stack it runs on, so
future work is easier and faster. Do not change code, install packages or open PRs. The
output is a written spec we decide from before anything is executed.

## 0. What we have today (confirm each point in the repo before relying on it)

- **App:** interactive three.js models of whole cities (Philadelphia, New York, Jersey Shore PA,
  one kitchen). About 15,000 lines of plain JavaScript ES modules in `js/`, no TypeScript, no
  `package.json`, no npm, no bundler, no tests for the JS.
- **Runtime deps:** three.js 0.186.1 loaded from jsDelivr through an import map in
  `index.html`, plus addons from `three/examples/jsm` (OrbitControls, Line2/LineMaterial/
  LineGeometry/LineSegments2, BufferGeometryUtils, RoomEnvironment, OutlineEffect).
  `js/three-setup.js` holds settings that keep an r128-tuned look. Archivo font from Google
  Fonts. Everything else is hand-written.
- **Data:** about 31 MB in `data/` (JSON, `.json.gz`, `.bin.gz`, `.webp`), loaded with `fetch`.
- **Data pipeline:** Python in `tools/<city>/` (shapely, osmium, pyproj, numpy, Pillow) that
  fetches OSM, USGS 3DEP and other sources and writes `data/`. No lockfile or requirements
  file was found; check.
- **Hosting and deploy:** Cloudflare (`wrangler.jsonc`, `.assetsignore`). Every commit
  triggers a Cloudflare build in a Node environment that runs our deploy command (a
  `npx wrangler ...` command; find out which, and where it is configured). Today the repo
  root is served as static assets with no build step.
- **Legacy:** `tools/bundle.py` and `tools/unbundle.py` produce and unpack a single-file
  `city-models.html`. This is not a requirement going forward; the spec may recommend
  keeping, changing or retiring it.
- **Dev and QA:** `tools/serve.py` (no-cache local server), `tools/perf` (Playwright in
  GPU-enabled Chromium: frame time, GPU time, draw calls, load time), `tools/ux` (Playwright
  audit), `tools/loading/capture.py`.

## 1. What this opens up

Because Cloudflare builds in a Node environment on every commit, a real JS toolchain is on the
table: `package.json`, npm dependencies, a bundler, TypeScript, and a build step that runs
before `wrangler` deploys the output. Research what Cloudflare's build environment provides
(Node version, build command and output directory settings, build time and size limits, caching
between builds, preview deployments per branch) and cite the docs pages.

## 2. Layers to research

For each layer, frame the need first: what the code does today (with file references), what
we would gain, and what would rule an option out. Then cast wide, cut down, vet, and fit-check
as in sections 3–5.

1. **3D engine.** Stay on three.js and upgrade within it (WebGLRenderer vs WebGPURenderer and
   TSL, the r128-look settings, addon changes and deprecations up to the latest release),
   versus alternatives worth a look (for example Babylon.js, PlayCanvas, deck.gl, CesiumJS or
   3D Tiles-based approaches, MapLibre with a three.js layer). Expect "stay on three.js" to be
   the default; show what it would take to beat it.
2. **Language and type safety.** Plain JS, JS with JSDoc plus `tsc --checkJs`, or TypeScript.
   Include `@types/three` and how closely it tracks three.js releases.
3. **Build and dev server.** Vite, esbuild, Rollup or Rolldown versus staying with import maps
   and no build. Cover the dev server (HMR replacing `tools/serve.py`), installing three.js
   from npm instead of the CDN, self-hosting the font, tree-shaking three.js against our addon
   usage, code-splitting per city, and how the build output plugs into `wrangler` deploy.
4. **Data formats and loading.** Our JSON, `.json.gz` and `.bin.gz` versus binary or tiled
   formats (glTF with meshopt or Draco, FlatBuffers, PMTiles, 3D Tiles), the native
   `DecompressionStream`, Web Workers or OffscreenCanvas for parsing and building geometry,
   and what each does to download size and first-frame time.
5. **Data pipeline (Python).** Versions and maintenance of shapely, osmium (pyosmium),
   pyproj, numpy and Pillow; reproducible environments (uv, pip-tools, a lockfile); whether
   alternatives (GeoPandas, DuckDB spatial, osmium-tool or ogr2ogr from the command line) would
   simplify `tools/<city>/`; and whether data generation should stay committed or run in the
   build.
6. **UI layer.** The HUD, panel, minimap, ride bar and loading screens are hand-written DOM.
   Compare staying vanilla against small libraries (for example Lit, Preact, Solid, or a
   signals library alone) on size and how much code it removes.
7. **Quality tooling.** Lint and format (ESLint, Biome, Ruff for Python), unit tests (Vitest,
   pytest), and visual-regression and perf checks built on the existing Playwright harnesses,
   including whether any of it can run in the Cloudflare build or needs separate CI.
8. **Hosting and delivery.** Cloudflare as used now: Workers static assets vs Pages, per-file
   and total asset limits against our largest data files, caching headers, compression, and
   whether city data belongs in static assets or in R2.

## 3. Cast wide (per layer, aim for 5–10 candidates where the layer has real alternatives)

- npmjs.com search, plain and with `keywords:<term>`. Ignore the result order; read every
  row's version, publish age, dependents and license.
- GitHub repo search: `topic:<term> stars:>300 pushed:>(today − 6 months) archived:false`,
  sorted by stars; github.com/topics/<term>; bestofjs.org; the matching awesome list
  (awesome-threejs, awesome-webgpu, awesome-geospatial and so on).
- PyPI and the project's own docs for the Python tools.
- Check what three.js and its addons already provide, and whether a native browser API covers
  the need, before adding anything.

## 4. Cut to 2–4 finalists per layer

Disqualify: archived or "no longer maintained"; no release in 18+ months while tied to a
fast-moving dependency like three.js; incompatible with three.js 0.186+ or current browsers;
a copyleft license; doesn't run in Cloudflare's build environment; high downloads but few
dependents (traffic from transitive installs).

## 5. Vet each finalist

- npm or PyPI page: built-in types, dependency count, release cadence, provenance, README
  notes (renames, deprecations, migration guides).
- bundlephobia.com (or pkg-size.dev): min+gzip size, tree-shakable or not, which dependencies
  make up the size.
- socket.dev: install scripts, network or filesystem access, maintainer count, alerts.
- GitHub: last release and last commit, open vs closed issues and how fast maintainers reply,
  contributor spread (bus factor), recent issues about our three.js version, "Used by" count.
- npmtrends.com or pypistats.org: downloads rising or falling against alternatives.
- Stars alone mean nothing. Check them against forks, contributors and dependents.

## 6. Fit check against our code

For each finalist: the files and call sites it touches (grep and cite them), API shape vs our
current usage, migration effort in rough days, and what it changes in the deploy (build
command, output directory, build time). For performance claims, name the `tools/perf`
scenario that would prove or disprove them; do not run migrations to find out.

## 7. Output

Write the result to `docs/stack-research/` (one file per layer plus `SUMMARY.md`):

- **Current state:** the inventory from section 0, corrected where the repo or the Cloudflare
  settings say otherwise, with versions and file references.
- **Per layer:** a comparison table (name, version, last release, dependents, weekly
  downloads, gzip size, deps, types, license, maintenance signal, fit notes), a
  recommendation with the runner-up, the risks, and the migration steps.
- **Target stack:** one table of the recommended choice per layer, which layers should stay as
  they are, and the resulting build and deploy commands.
- **Refactor plan:** ordered phases, each small enough to land and verify on its own, with
  dependencies between phases and the perf checks that gate each one.
- **Open questions** that need our decision before execution.

Cite the URL behind every number; don't estimate. Mark anything you could not verify as
unverified rather than leaving it out.
