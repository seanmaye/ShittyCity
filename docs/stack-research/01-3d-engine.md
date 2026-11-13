# Layer 1: 3D engine

Research date: 2026-11-13. Nothing here has been executed; see [SUMMARY.md](SUMMARY.md).

## The need

**What the code does today.** All rendering is three.js through one `WebGLRenderer`
([js/three-setup.js:45](../../js/three-setup.js), [js/scene/core.js:8](../../js/scene/core.js)),
plus two small extra renderers (the kitchen, [js/scene/pine/kitchen.js:97](../../js/scene/pine/kitchen.js),
and the loading-screen figures, [js/loading.js:183](../../js/loading.js)). 48 of the 56 modules
import `three`. The scene is built procedurally in JavaScript, not loaded from model files:
227 `new THREE.Mesh`, 174 `BoxGeometry`, 163 `MeshStandardMaterial`, 32 `InstancedMesh`,
30 `CanvasTexture` (counted with `grep -rhoE "THREE\.[A-Za-z0-9_]+" js`).

Things the engine must keep doing, each tied to code:

| Requirement | Where |
| --- | --- |
| Logarithmic depth buffer (2 m to 30 km in one view) | [js/scene/core.js:8](../../js/scene/core.js) |
| One 4096² PCF shadow map, updated on demand | [js/scene/core.js:10](../../js/scene/core.js), [js/scene/index.js:550](../../js/scene/index.js) |
| Shader patches on built-in materials (`onBeforeCompile`) | [js/scene/materials.js:293](../../js/scene/materials.js), [js/scene/season.js:81](../../js/scene/season.js), [js/scene/jsh/farms.js:24](../../js/scene/jsh/farms.js), [js/scene/jsh/harvest.js:150](../../js/scene/jsh/harvest.js) |
| Custom depth materials for alpha-cut shadows | [js/scene/nature.js:129](../../js/scene/nature.js), [js/scene/jsh/farms.js:130](../../js/scene/jsh/farms.js), [js/scene/jsh/detassel.js:149](../../js/scene/jsh/detassel.js), [js/scene/jsh/harvest.js:188](../../js/scene/jsh/harvest.js) |
| The r128 look: colour management off, lights ×π, single-pass transparent double-sided materials, anisotropy on nearest-magnified textures | [js/three-setup.js](../../js/three-setup.js) |
| Direct WebGL access (`renderer.state`, `renderer.properties`, `gl.texParameterf`) | [js/three-setup.js:26-42](../../js/three-setup.js) |
| Fat lines, outline effect, orbit controls, geometry merging, room environment | 17 addon imports, listed below |
| `tools/perf` probe wraps `renderer.render`, reads `renderer.info`, patches `Object3D.add` and three's `generateUUID` | [tools/perf/perf.py:129](../../tools/perf/perf.py), [tools/perf/probe.js](../../tools/perf/probe.js) |

Addon imports today (all still present in r187's tree, checked against
`https://api.github.com/repos/mrdoob/three.js/git/trees/r187?recursive=1`):
`controls/OrbitControls.js` (2 files), `lines/Line2.js`, `LineMaterial.js`, `LineGeometry.js`,
`LineSegments2.js`, `LineSegmentsGeometry.js` (3 files), `utils/BufferGeometryUtils.js` (4 files),
`environments/RoomEnvironment.js` (1), `effects/OutlineEffect.js` (1).

**What we would gain from a change.** Honestly, little from a different engine. The
performance work so far (see [tools/perf/README.md](../../tools/perf/README.md)) is about draw
calls, the shadow pass and overdraw, which any engine has. The realistic gains are inside
three.js: staying current, getting types, tree-shaking, and keeping a path open to WebGPU.

**What rules an option out.** A rewrite of `js/scene/` (about 12,500 of the 15,000 lines); no
way to patch built-in material shaders; a map-first camera model that can't do train cabins and
cut-aways; a bundle several times larger than three's; the section 4 disqualifiers.

## Candidates

Numbers pulled 2026-11-13. Sources: version, publish date, license, dependency count and types
from `https://registry.npmjs.org/<name>`; weekly downloads (2026-11-06 to 11-12) from
`https://api.npmjs.org/downloads/point/last-week/<name>`; min+gzip of the whole package entry
from `https://bundlephobia.com/api/size?package=<name>@<version>`; stars, last push, open
issues from `https://api.github.com/repos/<repo>`; dependents from
`https://github.com/<repo>/network/dependents` (repositories / packages; † = the repo publishes
several packages and GitHub shows only its default one, so the figure is not comparable).

| Name | Version | Last release | Dependents (repos / pkgs) | Weekly downloads | Gzip (whole pkg) | Deps | Types | License | Maintenance signal | Fit notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [three](https://www.npmjs.com/package/three) | 0.187.0 | 2026-10-30 | 587,087 / 11,319 | 35,737,617 | 185,679 | 0 | via `@types/three` 0.187.0 | MIT | 11 releases in 12 months; pushed 2026-11-13; 406 open issues; ★118,312 | What we run (0.186.1). Zero rewrite. |
| [@babylonjs/core](https://www.npmjs.com/package/@babylonjs/core) | 9.36.0 | 2026-11-12 | 8,428 / 485 | 371,598 | 1,848,923 | 0 | built in | Apache-2.0 | 139 releases in 12 months; 23 open issues; ★26,341 | Full rewrite of `js/scene/`. Largest package here. |
| [playcanvas](https://www.npmjs.com/package/playcanvas) | 2.24.1 | 2026-11-12 | † | 194,382 | 729,878 | 2 | built in | MIT | 57 releases in 12 months; ★17,288 | Full rewrite. Editor-centred workflow we don't use. |
| [@deck.gl/core](https://www.npmjs.com/package/@deck.gl/core) | 9.4.1 | 2026-10-28 | 9,439 / 294 † | 1,421,099 | 217,973 | 17 | built in | MIT | 24 releases in 12 months; ★14,757 | Data-layer renderer over a map. No scene graph for cabins, people, cut-aways. |
| [cesium](https://www.npmjs.com/package/cesium) | 1.147.0 | 2026-11-02 | 8,570 / 1,106 | 432,634 | 1,353,211 | 5 | built in | Apache-2.0 | 13 releases in 12 months; 1,679 open issues; ★15,949 | Globe engine. Full rewrite, and our data would need 3D Tiles. |
| [maplibre-gl](https://www.npmjs.com/package/maplibre-gl) | 6.18.0 | 2026-11-11 | 39,692 / 1,416 | 10,308,235 | 297,616 | 18 | built in | BSD-3-Clause | 39 releases in 12 months; ★12,085 | 2.5D map. three.js would still draw everything in a custom layer, sharing its depth buffer and camera. |
| [3d-tiles-renderer](https://www.npmjs.com/package/3d-tiles-renderer) | 0.5.4 | 2026-11-03 | 348 / 94 | 324,477 | 30,098 | 3 | built in | Apache-2.0 | 16 releases in 12 months; ★2,526; top contributor 88% of commits | Not an engine: a three.js add-on. Peer `three >=0.167.0`. See layer 4. |
| [itowns](https://www.npmjs.com/package/itowns) | 2.46.0 | 2025-10-03 | 192 / 17 | 2,932 | 245,223 | 14 | built in | CECILL-B OR MIT | 0 stable releases in 12 months (repo pushed 2026-11-10) | Geospatial framework on three. |
| [@giro3d/giro3d](https://www.npmjs.com/package/@giro3d/giro3d) | 2.0.7 | 2026-11-10 | unverified (GitLab-hosted) | 12,416 | unverified (bundlephobia returned 422) | 8 | no `types` field in package.json | MIT | 10 releases in 12 months | Geospatial framework on three. |
| [ogl](https://www.npmjs.com/package/ogl) | 1.0.11 | 2025-01-27 | 9,659 / 170 | 1,068,695 | 34,177 | 0 | built in | Unlicense | 0 releases in 12 months; last push 2025-04-13 | Minimal WebGL library. |
| [regl](https://www.npmjs.com/package/regl) | 2.1.1 | 2024-11-12 | 35,778 / 342 | 1,302,938 | 37,658 | 0 | built in | MIT | 0 releases in 12 months | Functional WebGL wrapper, no scene graph. |
| [@galacean/engine](https://www.npmjs.com/package/@galacean/engine) | 1.6.13 | 2025-12-29 | 60 / 28 | 1,500 | 290,286 | 4 | built in | MIT | 6 releases in 12 months | Full rewrite. |
| [@orillusion/core](https://www.npmjs.com/package/@orillusion/core) | 0.9.5 | 2026-11-06 | 0 / 0 | 594 | 485,707 | 0 | built in | MIT | 4 releases in 12 months; 1 npm maintainer | WebGPU only. |

Add-ons looked at and not needed now: `camera-controls` 3.1.2 (10,340 B gzip, peer
`three >=0.126.1`; we use `OrbitControls` plus our own fly and ride cameras),
`three-mesh-bvh` 0.9.18 (28,672 B gzip; faster picking, only relevant if `pickCar` raycasts
show up in a CPU profile), `three-stdlib` 2.36.1 (last release 2025-11-10; duplicates addons
three already ships).

## Cut

Disqualified:

- **ogl, regl**: no release in 18+ months (2025-01-27 and 2024-11-12).
- **itowns**: no stable release in 13 months and 2,932 weekly downloads; also a framework layer
  we would only use a fraction of.
- **@orillusion/core**: WebGPU only, and WebGPU is not Baseline (Chrome/Edge 144, Safari 26,
  no Firefox entry; `status.baseline: false` in
  [web-features data](https://unpkg.com/web-features/data.json), feature `webgpu`).
- **@galacean/engine, @giro3d/giro3d**: low adoption (1,500 and 12,416 weekly downloads), and a
  rewrite for no stated gain.
- **playcanvas**: rewrite, and its strengths (editor, asset pipeline) don't apply to a
  procedurally built scene.

Finalists: **three.js (stay, `WebGLRenderer`)**, **three.js `WebGPURenderer`**,
**Babylon.js**, **MapLibre or deck.gl with a three.js layer**.

## Vetting the finalists

**three.js 0.187.0**
- [socket.dev/npm/package/three](https://socket.dev/npm/package/three): supply chain 98,
  vulnerability 100, quality 98, maintenance 92, license 100. No install scripts
  (registry `scripts`), 2 npm maintainers, no provenance attestation on the tarball.
- Contributors: 100+ listed, the top one has 45% of commits
  (`https://api.github.com/repos/mrdoob/three.js/contributors?per_page=100`).
- 28-day downloads year on year: +877%
  (`https://api.npmjs.org/downloads/range/last-year/three`). npm-wide counts rose sharply over
  the same period (typescript +245%), so read trends relative to each other: Babylon +149%,
  cesium +345%, maplibre-gl +765%.
- Package exports: `three`, `three/webgpu`, `three/tsl`, `three/addons/*` and the older
  `three/examples/jsm/*` all resolve (`https://registry.npmjs.org/three/0.187.0`, `exports`).
  `sideEffects` is limited to `./src/nodes/**/*`, so a bundler can tree-shake the rest.
- What we download today from jsDelivr at 0.186.1, measured with `curl -H 'Accept-Encoding: br'`:
  `build/three.module.js` 132,469 B + `build/three.core.js` 266,288 B = 398,757 B brotli, plus
  the nine addon files we import, totalling 33,425 B brotli. That is the whole library regardless of what we use.

**Migration guide entries that touch our code**
([wiki Migration Guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)):

| Release | Change | Our call site |
| --- | --- | --- |
| 186 → 187 | PMREMs are now built from cube render targets; "materials will look slightly different" | [js/scene/pine/kitchen.js:100-101](../../js/scene/pine/kitchen.js) (`PMREMGenerator` + `RoomEnvironment`) |
| 186 → 187 | Renderers use `WeakRef` and `FinalizationRegistry` internally | [js/three-setup.js:37](../../js/three-setup.js) reads `renderer.properties.get(t).__webglTexture`; re-test `restoreAnisotropy` |
| 186 → 187 | `setViewport()`/`setScissor()` no longer scale by pixel ratio with a render target bound | no call sites (grep) |
| 181 → 182 | `PCFSoftShadowMap` with `WebGLRenderer` is deprecated; `PCFShadowMap` is now soft | [js/scene/pine/kitchen.js:97](../../js/scene/pine/kitchen.js) |
| 182 → 183 | `Clock` deprecated in favour of `Timer` | already on `Timer` ([js/scene/index.js:544](../../js/scene/index.js)) |
| 187 → 188 (unreleased) | `Float16BufferAttribute` relies on `Float16Array` | no call sites |

Nothing in the guide removes `ColorManagement.enabled`, `LinearSRGBColorSpace` output or
`Material.forceSinglePass`, so [js/three-setup.js](../../js/three-setup.js) carries over as is.

**three.js `WebGPURenderer`**
- The r187 manual ([manual/pages/webgpurenderer.html](https://github.com/mrdoob/three.js/blob/r187/manual/pages/webgpurenderer.html))
  says "The renderer itself is still in an experimental state", and that `onBeforeCompile()`
  modifications "are not supported in `WebGPURenderer`" and "must be ported to node materials
  and TSL". It also says `WebGLRenderer` "is still maintained and the recommended choice for
  pure WebGL 2 applications", with no larger new features planned.
- It has a WebGL 2 fallback (`forceWebGL`), and accepts `logarithmicDepthBuffer`
  ([docs/pages/WebGPURenderer.html.md](https://github.com/mrdoob/three.js/blob/r187/docs/pages/WebGPURenderer.html.md)).
- Fat lines have a WebGPU variant (`examples/jsm/lines/webgpu/Line2.js`, `LineSegments2.js` in the r187 tree).
- Unverified: whether `OutlineEffect` and `Material.forceSinglePass` behave the same under
  `WebGPURenderer`, and whether `customDepthMaterial` with `RGBADepthPacking` is honoured.

**Babylon.js 9.36.0**
- 139 releases in 12 months, 23 open issues (fast triage), Apache-2.0, 6 npm maintainers,
  top contributor 30% of commits.
- Bundlephobia reports 1,848,923 B gzip for the package entry (it is tree-shakable through deep
  imports; our real size is unverified).
- Offers a logarithmic depth buffer, instancing, cascaded shadows, and a WebGPU engine. All of
  this would be a different API for every one of the call sites above.

**MapLibre GL JS 6.18.0 / deck.gl 9.4.1**
- Both healthy (39 and 24 releases in 12 months). MapLibre is BSD-3-Clause, deck.gl MIT.
- Both render maps and data layers. We would still draw buildings, trains, terrain, people and
  interiors with three.js inside a custom layer, and give up our own camera (orbit to 7 km,
  fly mode, first-person rides, binoculars), sun, shadows and fog to the map's.

## Fit check

| Finalist | Files touched | API vs our usage | Effort (rough days) | Deploy change |
| --- | --- | --- | --- | --- |
| three 0.187.0, `WebGLRenderer` | `index.html` import map (2 URLs) or `package.json`; `kitchen.js:97` | Identical | 0.5 to 1, mostly comparing screenshots | None by itself (see layer 3 for npm install) |
| three `WebGPURenderer` | `three-setup.js` (whole file), `core.js`, `kitchen.js`, `loading.js`, the 4 `onBeforeCompile` files, the 4 `customDepthMaterial` files, 3 fat-line files, `tools/perf/probe.js` (GPU timer queries, `renderer.info`) | Renderer async init; shader patches rewritten in TSL | 10 to 20, unverified, with a real risk the r128 look can't be matched exactly | Import `three/webgpu` (a separate, larger build) |
| Babylon.js | All 46 files in `js/scene/`, plus `ui.js`, `minimap.js`, `loading.js`, `tools/perf/probe.js` | Different everywhere | 60+ | New dependency |
| MapLibre/deck.gl + three | `core.js`, `index.js`, `terrain.js`, `ui.js`, `minimap.js`, all camera code | Camera, depth and lighting handed to the map | 30+, and some features (cut-aways, cabins) may not survive | New dependency, map tiles to host |

Perf checks that would prove or disprove a claim:

- three upgrade: `python -I tools/perf/perf.py ab --quick --shots --rounds 5` against the commit
  before the bump, for `phl`, then `--city jsh` with `overlook-stand`. Compare the `A-*.png` and
  `B-*.png` shots. The kitchen has no perf scenario; check `?city=pine` by eye (its lighting
  is the part the PMREM change touches).
- WebGPU spike: the same `ab`, reading `gpu`, `frame`, `calls` and `load.first-frame` for
  `overview-dusk`, `whole-city`, `fly-market`, `ride-L`. `probe.js` measures GPU time with WebGL
  timer queries, so it needs a WebGPU path before the numbers mean anything.

## Recommendation

**Stay on three.js with `WebGLRenderer`, and move from 0.186.1 to 0.187.0.**
Keep [js/three-setup.js](../../js/three-setup.js) as the one place that holds the r128 look.

**Runner-up:** three.js `WebGPURenderer` with its WebGL 2 fallback, as a time-boxed spike after
the rest of the refactor, not as part of it.

Reasons: the app is a three.js scene graph built in code, and every alternative is a rewrite
with no measured benefit. The upstream project still recommends `WebGLRenderer` for WebGL 2
apps and calls the new renderer experimental. We have four `onBeforeCompile` patches and a
block of direct WebGL calls that `WebGPURenderer` cannot run.

## Risks

- **Upstream focus has moved.** No larger features will land in `WebGLRenderer`. Each
  `onBeforeCompile` patch and each use of renderer internals is a future migration cost.
  Mitigation: keep them in few places (they are already in 5 files) and add no new ones without
  a note.
- **Look drift on upgrade.** r187 changes PMREM output, which affects the kitchen. Mitigation:
  screenshot comparison before and after.
- **`restoreAnisotropy` reads private renderer state.** It can break silently on any release.
  Mitigation: a visual check of slanted window facades (`street-level` scenario screenshot) on
  every three bump.
- **Deprecation window.** The guide says warnings last 10 releases and recommends upgrading in
  steps of 10. We are current, so staying within a release or two keeps this cheap.

## Migration steps

1. Record a baseline: `perf.py run --quick --repeat 3` and the `tools/ux` screenshots for all
   three cities at 0.186.1.
2. Bump to 0.187.0 (import map today, or `package.json` once layer 3 lands). Change nothing else
   in the same commit.
3. Replace `PCFSoftShadowMap` with `PCFShadowMap` in `kitchen.js:97` and check the kitchen.
4. Run the perf and screenshot checks above. Fix any look drift in `three-setup.js` only.
5. When layer 3 lands, switch `three/examples/jsm/...` imports to `three/addons/...` (17 import
   lines) so the paths match the documented form.
6. Later, optional: a `WebGPURenderer` spike with `forceWebGL: true` on Jersey Shore (the
   smallest city) to size the TSL port of the four shader patches.
