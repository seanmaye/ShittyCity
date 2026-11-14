# Layer 3: Build and dev server

Research date: 2026-11-13. Nothing here has been executed; see [SUMMARY.md](SUMMARY.md).

## The need

**What the code does today.** There is no build. [index.html:12-15](../../index.html) maps
`three` and `three/examples/` to jsDelivr at 0.186.1, and line 78 does
`import('./js/main.js')`. The browser then fetches every module separately.

Measured on the working tree:

| What | Number | How measured |
| --- | --- | --- |
| App module requests per page load | 56 | `git ls-files 'js/*' \| wc -l` (every city imports every module: [js/scene/index.js:8-44](../../js/scene/index.js) imports `phl/`, `nyc/` and `jsh/` statically, and [js/main.js:8](../../js/main.js) imports the kitchen) |
| App JS, raw / gzip -9 | 1,045,431 B / 344,596 B | `cat js/** \| wc -c`, `\| gzip -9 \| wc -c` |
| Of which only one city needs | `phl/` 276,757 B, `jsh/` 215,777 B, `pine/` 102,079 B, `nyc/` 24,621 B raw | `cat js/scene/<city>/*.js \| wc -c` |
| three.js core from jsDelivr (brotli) | 398,757 B in 2 requests | `curl -H 'Accept-Encoding: br'` on `build/three.module.js` and `build/three.core.js` |
| three.js addons from jsDelivr (brotli) | 33,425 B in 9 requests | same, for the 9 addon files |
| Archivo from Google Fonts | 1 CSS request (2,683 B) plus up to 2 `woff2` for Latin: 90,096 B upright, 101,888 B italic | `curl` with a Chrome user agent on the URL at [index.html:10](../../index.html) |
| CSS | 49,458 B raw / 11,857 B gzip | [css/style.css](../../css/style.css) |
| Third-party origins at load | 3 (`cdn.jsdelivr.net`, `fonts.googleapis.com`, `fonts.gstatic.com`) | [index.html:8-15](../../index.html) |

Other facts that shape this layer:

- **Dev server.** [tools/serve.py](../../tools/serve.py) is a 52-line no-cache static server.
  It exists because a stale module mixed with a fresh one breaks the page (README, "Run it").
- **Single-file build.** [tools/bundle.py](../../tools/bundle.py) concatenates modules by
  rewriting `import`/`export` with regular expressions and inlines all data as `<script>`
  blocks. This imposes rules on the sources: `CITY` must never be read at module top level
  "because the bundle evaluates every module before main runs" ([js/cities.js:3-5](../../js/cities.js)),
  and [js/data.js:31-41](../../js/data.js) and [js/loading.js:204-207](../../js/loading.js)
  carry a second code path for embedded data.
- **The bundle is committed.** `city-models.html` is 41,053,765 B. It has 38 versions in git
  history totalling 521.0 MB on disk, out of a 660 MB `.git`
  (`git rev-list --objects --all | git cat-file --batch-check`, `du -sh .git`). The repository
  is 65 commits and 4 days old.
- **The QA harnesses serve raw sources.** [tools/perf/perf.py:100-103](../../tools/perf/perf.py)
  starts its own static server on the repo root; `ab` checks the base commit out into a git
  worktree and serves that folder; `snap` copies `index.html`, `css/` and `js/`
  ([perf.py:946-950](../../tools/perf/perf.py)). It intercepts the three CDN hosts with a regex
  ([perf.py:36](../../tools/perf/perf.py)), caches them, and patches `generateUUID` inside the
  cached three.js build ([perf.py:129-133](../../tools/perf/perf.py)).
  [tools/ux/ux.py:29](../../tools/ux/ux.py) imports all of that from `perf`.

**What we would gain.** A pinned, locked three.js installed from npm (and available offline);
one origin; per-city code splitting; tree-shaking; content-hashed file names for caching
([layer 8](08-hosting-delivery.md)); a place for TypeScript, lint and tests to plug in.

**What rules an option out.** Not running on Node 24 / Ubuntu 24.04 x86_64 with 2 vCPU and 8 GB
([build image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/),
[limits](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)); needing
heavy configuration for a plain static app; breaking the perf and UX harnesses with no path to
adapt them.

## What Cloudflare's build environment provides

All from Cloudflare's docs, read 2026-11-13.

| Item | Value | Source |
| --- | --- | --- |
| Product in use | Workers Builds (GitHub check run named "Workers Builds: shittycity", app `cloudflare-workers-and-pages`) | `gh api repos/seanmaye/ShittyCity/commits/<sha>/check-runs` |
| Build steps | Optional **build command**, then **deploy command** (default `npx wrangler deploy`); non-production branches run the **preview command** (default `npx wrangler preview`) | [configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) |
| Where they are set | Dashboard: Worker → Settings → Build. Not in `wrangler.jsonc`: "Workers Builds does not honor the configurations set in Custom Builds within your Wrangler configuration file" | same page |
| Wrangler version | "Workers Builds will use the Wrangler version set in your `package.json`". We have no `package.json`, so `npx` resolves whatever is current (4.162.0 on 2026-11-13) | same page; `https://registry.npmjs.org/wrangler` |
| OS / arch | Ubuntu 24.04, x86_64 | [build image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/) |
| Node.js | 24.22.1 default (22.23.4 also preinstalled); override with `NODE_VERSION`, `.nvmrc` or `.node-version` | same page |
| Package managers | npm 10.9.2, pnpm 9.10.0, yarn 4.18.1, Bun 1.4.4; version set by `packageManager` in `package.json` | same page |
| Python | 3.14.8 default, pip 26.2.2, uv 0.13.4, poetry 2.4.3 | same page |
| Dependency install | Automatic; skip with `SKIP_DEPENDENCY_INSTALL=1` | same page |
| CPU / memory / disk | 2 vCPU (4 on paid), 8 GB, 20 GB | [limits](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/) |
| Build timeout | 20 minutes | same page |
| Build minutes | 3,000 per month free, 6,000 paid then $0.005 per minute | same page |
| Concurrent builds | 1 free, 6 paid | same page |
| Build cache | Opt-in (Settings → Build → Build cache). Caches the package manager's global cache (`.npm` for npm). 10 GB per project, purged 7 days after last read. Vite is not in the list of frameworks with build-output caching | [build caching](https://developers.cloudflare.com/workers/ci-cd/builds/build-caching/) |
| Branch previews | "Enable Preview Builds" under Branch control; each non-production push builds and runs the preview command; PR comments for GitHub. Workers connected before Worker Previews need a one-time, irreversible switch | [build branches](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/) |
| Injected variables | `CI=true`, `WORKERS_CI=1`, `WORKERS_CI_COMMIT_SHA`, `WORKERS_CI_BRANCH`, `WORKERS_CI_BUILD_UUID` | [configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) |

Unverified, because they live in the Cloudflare dashboard and were not readable from this
machine: our actual build command (expected: empty), deploy command (expected: the default
`npx wrangler deploy`), whether build cache and preview builds are enabled, and how long our
builds take (GitHub's check run reports identical start and end times).

## Candidates

Same sources as [layer 1](01-3d-engine.md). "YoY" is the change in 28-day downloads between
2025-11 and 2026-11 from `https://api.npmjs.org/downloads/range/last-year/<name>`; npm-wide
counts rose sharply (typescript +245%), so compare the values to each other.

| Name | Version | Last release | Dependents (repos / pkgs) | Weekly downloads | YoY | Deps | Types | License | Maintenance signal | Fit notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [vite](https://www.npmjs.com/package/vite) | 8.3.8 | 2026-11-11 | 10,078,986 / 203,986 | 268,597,806 | +479% | 5 (incl. `rolldown`, `lightningcss`) | built in | MIT | 56 releases in 12 months; provenance; 2 npm maintainers; top contributor 23% | Dev server, HTML entry, CSS, workers, code splitting, with no config for a static app. Node `^20.19.0 \|\| >=22.12.0` |
| [rolldown](https://www.npmjs.com/package/rolldown) | 1.3.2 | 2026-11-11 | 232,173 / 3,545 | 166,416,167 | +6,733% | 2 | built in | MIT | 37 releases in 12 months; provenance | The bundler inside Vite 8. Using it directly means writing the HTML, CSS and dev-server handling ourselves |
| [esbuild](https://www.npmjs.com/package/esbuild) | 0.28.2 | 2026-08-08 | 10,918,937 / 79,974 | 416,314,520 | +382% | 0 | built in | MIT | 9 releases in 12 months; `postinstall` script; top contributor 96% of commits; still 0.x | Fast bundler with a basic serve mode. No HTML entry handling, no HMR |
| [rollup](https://www.npmjs.com/package/rollup) | 4.68.3 | 2026-11-13 | 19,161,103 / 229,041 | 160,659,893 | +173% | 1 | built in | MIT | 58 releases in 12 months; provenance | Bundler only; plugins for HTML, CSS, dev server |
| [webpack](https://www.npmjs.com/package/webpack) | 5.112.2 | 2026-10-23 | 22,485,978 / 307,825 | 72,729,018 | +87% | 17 | built in | MIT | 31 releases in 12 months | Config-heavy for what we need |
| [@rspack/core](https://www.npmjs.com/package/@rspack/core) | 2.3.2 | 2026-11-10 | 28,923 / 1,170 | 11,455,020 | +314% | 1 | built in | MIT | 52 releases in 12 months | webpack-compatible; same configuration burden |
| [parcel](https://www.npmjs.com/package/parcel) | 2.16.4 | 2026-02-02 | 268,639 / 7,836 | 397,839 | +47% | 15 | none | MIT | 3 releases in 12 months; weakest trend in the table | Zero-config, HTML entry |
| [@farmfe/core](https://www.npmjs.com/package/@farmfe/core) | 2.0.0 | 2026-11-12 | 743 / 109 | 10,523 | not pulled | 32 | built in | MIT | 1 stable release in 12 months | Low adoption |
| [bun](https://www.npmjs.com/package/bun) (bundler) | 1.4.4 | 2026-10-22 | 62,935 / 1,530 | 5,800,389 | not pulled | 0 | none in package | MIT | 17 releases in 12 months; `postinstall`; 9,950 open issues | Preinstalled in the build image. A second runtime for the team to install |
| No build (import map, vendored three) | n/a | n/a | n/a | n/a | n/a | 0 | n/a | n/a | Import maps are Baseline "high" since 2025-09-27 ([web-features](https://unpkg.com/web-features/data.json), `import-maps`) | What we have, minus the CDN |

Supporting packages:

| Name | Version | Last release | Weekly downloads | Deps | License | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| [wrangler](https://www.npmjs.com/package/wrangler) | 4.162.0 | 2026-11-13 | 45,060,756 | 9 | MIT OR Apache-2.0 | 148 releases in 12 months; Node `>=22.12.0`; provenance |
| [@cloudflare/vite-plugin](https://www.npmjs.com/package/@cloudflare/vite-plugin) | 1.69.1 | 2026-11-12 | 10,176,581 | 5 | MIT | Peer `vite ^6.1.0 \|\| ^7.0.0 \|\| ^8.0.0`. Runs Worker code in dev. We have no Worker code |
| [vite-plugin-singlefile](https://www.npmjs.com/package/vite-plugin-singlefile) | 2.3.4 | 2026-10-17 | 3,268,683 | 1 | MIT | Peer `vite ^5.4.21 \|\| ^6 \|\| ^7 \|\| ^8`. Inlines JS and CSS into one HTML. 1 npm maintainer; top contributor 66% |
| [@fontsource-variable/archivo](https://www.npmjs.com/package/@fontsource-variable/archivo) | 5.3.0 | 2026-07-19 | 886,110 | 0 | OFL-1.1 | Ships `archivo-latin-wdth-normal.woff2` (90,104 B) and `-italic` (101,676 B) with both the width and weight axes ([unpkg file list](https://unpkg.com/@fontsource-variable/archivo@5.3.0/?meta)) |
| [rollup-plugin-visualizer](https://www.npmjs.com/package/rollup-plugin-visualizer) | 7.1.3 | 2026-11-08 | 10,996,471 | 4 | MIT | Shows what is in each chunk; for the tree-shaking measurement |

## Cut

- **webpack, @rspack/core**: they work, but need loaders and configuration for things Vite does
  by default, with no feature we need in return.
- **parcel**: 3 releases in a year and the weakest download trend; no built-in types.
- **@farmfe/core**: 10,523 weekly downloads.
- **bun**: a second runtime on every contributor's machine for no gain over Node 24, which both
  this machine and the build image already have.
- **rollup**: superseded for our purposes by Rolldown inside Vite 8.

Finalists: **Vite 8**, **esbuild alone**, **Rolldown alone**, **no build with three.js vendored**.

## Vetting

**Vite 8.3.8**
- [socket.dev/npm/package/vite](https://socket.dev/npm/package/vite): supply chain 99,
  vulnerability 100, quality 82, maintenance 98, license 100; the page notes "Dependencies have
  2 high alerts" (not broken down in the page text; review before adopting).
- No install scripts. Dependencies: `rolldown`, `lightningcss`, `postcss`, `picomatch`,
  `tinyglobby`. Rolldown ships platform binaries as optional dependencies (16 listed), so the
  lockfile must be generated with npm's default handling of optional deps for Linux x64 to
  install in the build image.
- 797 open issues against 10 million dependent repositories.

**esbuild 0.28.2**
- Socket: 92 / 100 / 73 / 85 / 100. Has a `postinstall` script (it selects the platform binary).
- One person wrote 96% of the commits, and the last release was 2026-08-08.

**Rolldown 1.3.2**
- Socket: 95 / 100 / 78 / 99 / 100. 1.0.0 was published 2026-05-07, and Vite 8.0.0 (the first
  Vite to bundle with it) on 2026-03-12 (`time` in `https://registry.npmjs.org/rolldown` and
  `/vite`).

**No build**
- Zero tooling risk. It can still drop the CDN by committing a copy of three.js and pointing the
  import map at it. It cannot tree-shake, split per city without hand-written dynamic imports
  (those work natively), or hash file names.

## Fit check

| Finalist | Files touched | API vs our usage | Effort (rough days) | Deploy change |
| --- | --- | --- | --- | --- |
| **Vite 8** | New `package.json`, lockfile, `vite.config.js`, `.nvmrc`. `index.html`: remove the import map (lines 12-15) and the Google Fonts links (8-10); the inline `import('./js/main.js')` stays as is. `wrangler.jsonc`: `assets.directory` → `./dist`. `.assetsignore` no longer needed. `data/` served through Vite's `public` dir or copied. `tools/perf/perf.py`, `tools/ux/ux.py`, `tools/loading/capture.py`: serve the build, drop the CDN interception | Sources already are standard ES modules with relative imports and bare `three` specifiers. No code change needed to bundle | 1 for the build itself; 2 to 3 for the harnesses (below) | Build command `npm run build`; output `dist/`; deploy command unchanged |
| esbuild alone | The same, plus a hand-written HTML step and a dev script | No HTML entry, no CSS url handling, no HMR | 2, plus the same harness work | Same |
| Rolldown alone | The same as esbuild | Same gaps | 2, plus harness | Same |
| No build, vendored three | `index.html` import map; a `vendor/three/` folder (`build/` plus the 9 addon files); `tools/perf/perf.py:36,129` (the CDN regex and the UUID patch now match a local path) | Identical | 0.5 | None |

**What the harnesses need (the main cost of this layer).**

1. `perf.py serve()` and `ab`: today each side is a folder of sources. After the build, each
   side is a folder that must be installed and built first (`npm ci && vite build` in the base
   worktree, then serve its `dist/`). The alternative is to serve each side through
   `vite preview`.
2. The CDN handling: `cdn_handler`'s cache and the regex at `perf.py:36` become unnecessary
   (three and the font are local). The `generateUUID` patch at `perf.py:129-133` matches the
   CDN URL and a function body inside three's build; with a bundle, three is inside our chunk.
   Options: keep the patch as a small Vite plugin enabled by an environment variable, or
   replace it with an init script that swaps `Math.random` around three's UUID calls. Without
   it, screenshots stop being comparable across code changes (perf README, "Deterministic
   scenes").
3. Attribution: the census groups draw calls by the app `file:line` that called `add()`, and
   `perf.py hot` maps CPU profiles to `file:line`. Against minified output these need source
   maps. Simplest: build the perf target with `minify: false` and `sourcemap: true`, and resolve
   positions through the map in `perf.py` (or measure a non-minified build whose module
   boundaries are preserved with `output.preserveModules`). This is unverified work; budget 1 to
   2 days.
4. `perf.py snap` copies `index.html`, `css/`, `js/`: it must snapshot a built `dist/` instead.

**Performance claims and the scenario that tests each** (do not migrate to find out):

| Claim | Check |
| --- | --- |
| Bundling 56 + 11 requests into a few chunks shortens the load | `perf.py ab` load rows (`load.*` metrics in `report.json`) for `phl`; the perf harness serves from localhost, so the gain there is request overhead only. The network effect needs a throttled run or a real deployment; unverified until measured on a preview URL |
| Tree-shaking makes three.js smaller than the 398,757 B brotli we load now | `rollup-plugin-visualizer` output for the three chunk; then the same `load.*` rows |
| Per-city chunks cut JS parsed for `nyc` and `jsh` | Chunk sizes from the build; `load.cpuprofile` "evaluate module" time for `--city jsh` |
| Frame time is unchanged | `perf.py ab --quick --rounds 5`: expect "not significant" on frame, GPU and calls |

**HMR.** Vite's dev server replaces `tools/serve.py`'s reason to exist (it serves modules with
`no-cache` and versioned URLs). True hot replacement will not apply to scene modules: they build
GPU state at load and have no `import.meta.hot` handlers, so an edit triggers a full reload, as
now. CSS edits ([css/style.css](../../css/style.css)) do hot-swap.

**Single-file build.** `vite-plugin-singlefile` can inline JS and CSS, but our file also embeds
about 30 MB of data as base64 and JSON `<script>` blocks with an editing guide on top
([tools/bundle.py](../../tools/bundle.py), [docs/EDITING.md](../EDITING.md)), and three.js and
the font still came from CDNs. Options:

1. **Retire it** and share the URL instead. Removes `tools/bundle.py`, `tools/unbundle.py`
   (327 lines), the embedded-data branches in `data.js` and `loading.js`, the top-level-`CITY`
   rule, and stops adding about 14 MB of git history per rebuild.
2. **Keep it as a build artifact, not committed:** `npm run build:single` =
   `vite build` with `vite-plugin-singlefile`, then a small script that embeds `data/`. three.js
   and the font would then be inside the file, so it would work offline, which it does not
   today.
3. Keep `bundle.py` as is. This blocks TypeScript files and bundler-only features in the
   sources.

## Recommendation

**Vite 8, used plainly:** no framework plugin, no `@cloudflare/vite-plugin` (there is no Worker
code), `three` and `@fontsource-variable/archivo` from npm, `data/` copied through unchanged,
output to `dist/`, `wrangler` pinned as a dev dependency so local and Cloudflare deploys use the
same version.

**Runner-up:** stay without a build but vendor three.js into the repo and self-host the font.
It removes the CDN dependency for half a day's work and keeps every tool working as is. It is
the right first step if we want the gains in order of risk, and it does not conflict with
adopting Vite afterwards.

For the single-file build, option 2 (artifact, not committed) if the offline file is still
wanted, else option 1. This needs a decision (see Open questions in [SUMMARY.md](SUMMARY.md)).

## Risks

- **Harness breakage.** Every later phase is gated on `tools/perf`. Adapt and verify the harness
  in the same phase as the build, and prove old-vs-new with an `ab` whose A side is the last
  no-build commit.
- **Build minutes.** 65 commits in 4 days is about 16 builds a day. At an unverified 1 to 2
  minutes per build that is roughly 500 to 1,000 of the 3,000 free minutes a month. Turn on the
  build cache, and consider building previews only for PR branches.
- **Version skew during deploys.** Hashed chunks exist only in the version that built them
  ([version skew](https://developers.cloudflare.com/workers/versions-and-deployments/version-skew/)).
  A page opened before a deploy that lazy-loads a city chunk after it can get a 404. Our page
  loads its city once at start and "Change city" reloads, so the window is the first seconds of
  a load; the existing `#err` fallback ([index.html:76-78](../../index.html)) covers it.
- **Top-level await.** [js/main.js:54](../../js/main.js) awaits at module top level.
  `web-features` lists it as Baseline "low" from 2026-09-14 with Safari 27
  ([data](https://unpkg.com/web-features/data.json), `top-level-await`), yet it runs in the
  browsers we use today. Whatever the reason for that entry, set Vite's `build.target` so it
  does not try to transform it, and check Safari.
- **Rolldown is young.** It is the default bundler in Vite 8 and at 166 million weekly
  downloads, but 1.0.0 is six months old. Pin exact versions and upgrade deliberately.

## Migration steps

1. `package.json` with exact versions: `three@0.186.1` (the version we run now; bump separately,
   [layer 1](01-3d-engine.md)), dev deps `vite`, `wrangler`, `@fontsource-variable/archivo`.
   Add `"packageManager": "npm@<exact>"` and `.nvmrc` containing `24`. Commit the lockfile.
2. `vite.config.js`: `build.outDir: 'dist'`, `publicDir` set so `data/` is copied as is,
   `build.sourcemap: true`.
3. `index.html`: delete the import map and the three Google Fonts tags; import the font CSS
   from `main.js` or the stylesheet.
4. `wrangler.jsonc`: `"assets": { "directory": "./dist" }`; add
   `"$schema": "./node_modules/wrangler/config-schema.json"`. Delete `.assetsignore`.
5. Scripts: `dev` (`vite`), `build` (`vite build`), `preview` (`vite preview`),
   `deploy` (`wrangler deploy`).
6. Adapt `tools/perf`, `tools/ux`, `tools/loading/capture.py` as described above. Update
   `.claude/launch.json` to start `npm run dev`.
7. In the Cloudflare dashboard set Build command to `npm run build`, enable build cache, and
   decide on preview builds.
8. Prove it: `perf.py ab` with A = last no-build commit, B = the build, for all three cities,
   with `--shots`.
9. Then, as separate changes: dynamic `import()` per city in `js/scene/index.js` and
   `js/main.js`; `three/addons/` import paths; the single-file decision.
