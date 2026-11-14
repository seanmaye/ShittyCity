# Refactor status

Kept by the orchestrator of [REFACTOR-PLAN.md](REFACTOR-PLAN.md). Only the orchestrator edits
this file. It is how the work is picked up again after a context summary or in a new session.

Last updated: 2026-11-14, by the P6 session. **P0 to P4c are all merged and live** (#3, #4, #8,
#7, #9, #10, #12, #13, #14; `main` at `f718a5b`), and the cutover and cache checks passed on
production. P5 is closed as no-go. **P6 (a and b) is built and gated as one pull request** at Micah's
go-ahead (2026-11-14: "implement P6 ... as one PR"); see "P6" below. See "Merge log" at the end;
the sections above it are the record of how each phase was built and gated.

## Standing facts

**Opening decisions (asked 2026-11-13, answered by Micah):**

1. Dashboard: Sean owns the Cloudflare account; Micah has admin access and offered to sign in
   to the dashboard in a browser for readouts. Dashboard:
   `https://dash.cloudflare.com/1af14c0b141e374a8e01a11bba70b7d0/workers/services/view/shittycity/production`.
   Production site URL: `https://ashitty.city` (also `shittycity.smtheman1234.workers.dev`).
2. A failing check blocks the deploy: **yes, from P3** (`cf:build` = `npm run check && npm run build`).
3. TypeScript: **typed contracts and opt-in checking now (P4c); `.ts` renames later (P6a)** with
   their own go-ahead.
4. Preview builds: **no**. Consequence: P4b's live caching checks, and P3's "deliberate type
   error fails its build", run without a preview URL (P3: show the failing CI job instead; P4b:
   `curl` against production after merge).
5. GitHub Actions workflow on `seanmaye/ShittyCity`: **yes** (minimal in P2, full in P3).
6. Messages to contributors: **orchestrator drafts, Micah sends.** Two are due: before P1b
   merges and before P2 merges.

**Reference machine:** this Mac (Apple M5 Pro), on AC power. Every timing gate runs here, both
sides in one `perf.py ab` run. Report GPU line: `ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Pro,
Unspecified Version) (WebGL2, GPU timer on)`; Chromium 158.0.8127.18 (Playwright), headless,
1600x900 @ dpr 1.

**Orchestrator's working copy:** the main checkout stays on `main`. The orchestrator commits its
own docs branches from a separate worktree (`git worktree list` shows it), so it never switches
the main checkout's branch.

**Pixel-diff tolerances** (P1c calibration, 2026-11-13; tolerance = 2× the largest same-commit
floor seen, with a minimum of 0.001%; a share above it means "screenshots differ"):

| check | view | floor seen | tolerance |
| --- | --- | ---: | ---: |
| smoke | phl | 0.0061% | 0.0122% |
| smoke | nyc | 0.0001% | 0.001% |
| smoke | jsh | 0.0000% | 0.001% |
| smoke | nola | 0.0007% | 0.0014% |
| smoke | pine | 0.0124% | 0.0248% |
| `ab --shots` (phl) | overview-dusk | 0.0114% | 0.0228% |
| `ab --shots` (phl) | overview-noon | 0.0059% | 0.0118% |
| `ab --shots` (phl) | overview-night | 0.0095% | 0.019% |
| `ab --shots` (phl) | whole-city | 0.0016% | 0.0032% |
| `ab --shots` (phl) | transit-map | 0.0002% | 0.001% |
| `ab --shots` (phl) | market-cut | 0.1201% | 0.24% |
| `ab --shots` (phl) | street-level | 0.0230% | 0.046% |
| `ab --shots` (phl) | ride-L | 1.4931% | 2.99% |
| `ab --shots` (phl) | ride-regional | 5.3001% | 10.6% |
| `ab --shots` (phl) | ride-monorail | 4.3108% | 8.62% |
| `ab --shots` (phl) | orbit, fly-market | 28–45% | not comparable by pixels (moving camera): look at it |
| `ab --shots` (nyc) | overview-dusk/noon/night, transit-map | ≤ 0.0002% | 0.001% |
| `ab --shots` (nyc) | whole-city | 0.0013% | 0.0026% |
| `ab --shots` (nola) | overview-dusk | 0.0006% | 0.0012% |
| `ab --shots` (nola) | overview-noon/night, whole-city, transit-map | ≤ 0.0003% | 0.001% |
| `ab --shots` (jsh) | overview-dusk, overview-night, whole-city, transit-map | ≤ 0.0002% | 0.001% |
| `ab --shots` (jsh) | overview-noon | 0.0006% | 0.0012% |
| `ab --shots` (jsh) | overlook-stand | 0.0044% | 0.0088% |
| `ab --shots` (jsh) | overlook-bino | 0.1644% | 0.33% |
| `ab --shots` (nyc, nola, jsh) | orbit | 35–64% | moving camera: look at it |

phl and pine smoke were raised after P1b's smoke (a third sample, diff images showing only moving
trains and the kitchen's monorail), and again from P2's perf-build same-commit smoke (nola, pine). A
deliberate change (the `--accent` colour) came out 0.11–0.20% in smoke, about 40× the floor.
The `ab --shots` floors are from P2's same-build runs (2026-11-14, both sides the same perf
build; `tools/perf/out/20261114-*-ab-p2-bvb*`), max over runs. **They hold only when both sides
load in the same time:** a change that moves load time shifts time-driven motion (trains, the jsh
hunter's smoke, the binoculars' sway) at the moment of the shot. P2's build loaded sooner and came
out above the floor on four jsh views: overview-noon 0.0020%, overview-night 0.0015%,
overlook-stand 0.0269%, overlook-bino 18.1%. The diff images showed only moving things. When a
share is above tolerance, open the diff image before calling it a change.

**How to read `ab` (decided 2026-11-13):** a `worse` row (99%) fails a gate. A lone
`likely worse` (95%) row means rerun that scenario with `--rounds 8`; with ~40 metrics per run,
one or two 95% verdicts appear by chance (the fixed harness, same commit on both sides, gave
one: `overview-dusk.frameP95` +3.1%). `heapMB` rows swing ±30% with GC timing; ignore them
unless a load or frame row moves with them.
Seen in P2 (same build on both sides, byte-identical pages): one 99% load row (nola river phase,
0.8 ms) and one 99% scenario (nola `transit-map`, fps −3.5%) each vanished on rerun with more
rounds (8, then 16 rounds of that scenario alone). So a lone `worse` can be chance too. Before
failing a gate on one, rerun that scenario alone with `--rounds 16`; report both runs. Some frame
metrics are bimodal per browser launch: phl `whole-city` (about 10 or 14 ms), and nola/jsh
`transit-map` main-thread time (about ±0.2 ms).

**Harness commands until P1a merges:** `uv run --no-project --with playwright==1.65.1 --with
pillow==13.0.0 python -I tools/perf/perf.py …` (zsh: wrap in a function or script; a command in a
variable is not word-split).

**Branch builds fail (pre-existing):** the "Workers Builds: shittycity" check fails on every
non-`main` branch, including contributors' PRs (#1 `nola`, #5 `extra-stool`); `main` succeeds.
Logs are only in the dashboard. So a branch's Cloudflare check gives no signal until someone
reads a log; P2's GitHub Actions job is the pre-merge Linux build check.

**Contributors:** `main` moves about 16 commits a day from several people and their agents.
Re-list files before every phase.

## Gate matrix

`CITIES` in `js/cities.js` on 2026-11-13: `phl`, `nyc`, `jsh`, `nola`, `pine` (the kitchen).

A scenario whose view or line a city lacks does **not** fail: `flyTo`/`boardLine` silently do
nothing and the scenario measures whatever view the previous one left (confirmed by probe runs:
`ride-monorail` and `overlook-*` on `nyc`/`nola` repeat `whole-city`'s numbers; on `jsh`,
`ride-monorail` shows the ridge view). So the matrix lists only scenarios that put each city in
the intended view.

| city | `perf.py` scenarios that count | `ux.py` | smoke |
| --- | --- | --- | --- |
| `phl` | all phl scenarios: `overview-dusk`, `overview-noon`, `overview-night`, `orbit`, `whole-city`, `transit-map`, `market-cut`, `street-level`, `fly-market`, `ride-L`, `ride-regional`, `ride-monorail` (`--quick` = `overview-dusk,whole-city,fly-market,ride-L`) | `common.py` + `phl.py` states | yes |
| `nyc` | `overview-dusk`, `overview-noon`, `overview-night`, `orbit`, `whole-city`, `transit-map` (`--city nyc`) | `common.py` + `nyc.py` | yes |
| `jsh` | the `nyc` six + `overlook-stand`, `overlook-bino` (`--city jsh`) | `common.py` + `jsh.py` | yes |
| `nola` | the `nyc` six (`--city nola`) | `common.py` only (`-c nola`: not in `ux.py`'s default `CITIES`) | yes |
| `pine` | none (exposes `window.__kitchen`, not `window.__city`) | none: `ux.py run -c pine` times out waiting for the scene | yes (P1c must handle it); P4a adds Micah's eye check |

`ux.py`'s default city list is hard-coded (`['phl', 'nyc', 'jsh']`), so every UX gate passes
`-c phl,nyc,jsh,nola`.

**Inventory (2026-11-13, `9c38eae`):** 63 JS modules, 17,180 lines, 1,196,883 B (395,097 B gzip -9).
City-only code: `js/scene/phl` 351,673 B (17 files), `jsh` 215,777 B (10), `pine` 102,079 B (3),
`nyc` 55,889 B (6); New Orleans has no folder of its own (shared modules plus `data.places`).
Data on disk: `phl` 20 MB (22 files), `nyc` 9.0 MB (14), `nola` 4.0 MB (9), `jsh` 1.8 MB (16).
`city-models.html` is 46,508,717 B; `.git` is 821 MB.

## Phases

### P0. Baseline and inventory

- State: **merged** (#3, 2026-11-14). Dashboard readout: see "Merge log".
- Branch / PR: `refactor/p0-docs`, https://github.com/seanmaye/ShittyCity/pull/3.
- Main checkout fast-forwarded to `origin/main` at `9c38eae` on 2026-11-13.
- **perf baseline** (`perf.py run --repeat 3`, medians, commit `9c38eae`; output folders kept in
  the main checkout's `tools/perf/out/`): `20261113-170449-p0-base-phl`, `…171207-p0-base-nyc`,
  `…171513-p0-base-nola`, `…171817-p0-base-jsh`.

  | city | scene ready ms | first frame ms | data fetched ms | heap MB | geometry MB |
  | --- | ---: | ---: | ---: | ---: | ---: |
  | phl | 4441 (3846–4471) | 4798 | 275 | 307.3 | 505 |
  | nyc | 1360 (1360–1432) | 1540 | 224 | 91.2 | 318.3 |
  | jsh | 1174 (1141–1186) | 1335 | 219 | 52.0 | 90.9 |
  | nola | 682 (661–693) | 833 | 94 | 45.2 | 169.2 |

  Frame p50 ms (GPU ms): phl `overview-dusk` 7.5 (5.3), `whole-city` 14.9 (7.1), `ride-L` 12.5
  (6.7), `street-level` 5.7 (4.8); nyc `overview-dusk` 2.4 (2.6), `whole-city` 7.1 (5.1); jsh
  `overview-dusk` 2.5 (2.5), `overlook-stand` 2.6 (2.1); nola `overview-dusk` 2.9 (3.0),
  `whole-city` 4.0 (3.3). Frames on this machine are short (2 to 15 ms), so the sensitivity
  numbers in `tools/perf/README.md` (measured on an Intel iGPU) do not carry over; P1c's
  same-commit run gives this machine's noise floor.
- **ux baseline** (`ux.py run -c phl,nyc,jsh,nola,pine`, default devices): output
  `tools/ux/out/20261113-172231-p0-base`. 531 screens over phl, nyc, jsh, nola: 16 errors (all
  `missing`), 345 warnings (188 small-target, 96 coverage, 42 small-text, 14 desktop-copy, 5
  truncated). `pine` crashed the run at its first device (timeout waiting for `__city`); the
  report for the other four was complete.
- **Production:** URL not yet known; `curl -sI` of `/`, a module, a `.json` and a `.bin.gz`
  outstanding.
- **Dashboard readout:** skipped for now; Micah could not sign in on 2026-11-13. Needed before
  P2's cutover (build command change), not before P1.

### P1a. Locked Python environment

- State: **merged** (2026-11-14). Branch `refactor/p1a-uv`, https://github.com/seanmaye/ShittyCity/pull/4.
- Gate (rebased on `9c38eae`): Jersey Shore rebuilt with the lock, `git diff --stat data/jsh`
  empty; `perf.py list` and `ux.py list` start under `uv run`.
- Decision: **shapely pinned `>=2.0.7,<2.1`** (GEOS 3.11). Shapely 2.1+/GEOS 3.13+ changes
  `simplify()` and `minimum_rotated_rectangle`: 570 jsh house angles (560 by half a turn), 21 of
  222 barns, one farm field. Upgrading it is a separate change that regenerates `data/jsh`.
- pyproj is in `data` too (`build_jsh.py` imports it at top level). uv 0.13.4, CPython 3.12.15.
- Unverified: New Orleans rebuild (sources git-ignored). Script docstrings still say `pip install`.
- Rebased onto `7fe4426` (now `41ed31a`); no overlap with #5, gate not rerun.
- After merge, worktrees use `uv sync --group qa` (and `data`/`fetch` as needed).

### P1b. Retire the single-file bundle

- State: **merged** (2026-11-14). Branch `refactor/p1b-retire-bundle` (stacked on P1a),
  https://github.com/seanmaye/ShittyCity/pull/8.
- Gate: bundle grep empty; smoke all 5 cities ok (phl 0.0061%, pine 0.0108%: motion only);
  `ab --quick --shots` on phl: only `whole-city` rows `likely worse`, rerun with 8 rounds: no
  significant difference.
- Also changed `tools/phl/build_transit.py` (it edited the bundle in place): now reads/writes
  `data/phl/`, output identical. `COLLABORATING.md`: minimal edits; full rewrite drafted in the PR
  for Micah.
- Rebased onto `7fe4426` (#5 touched `city-models.html` and the kitchen; conflict resolved by
  deleting the file); smoke rerun: all ok, within tolerance (phl 0.0075%, pine 0.0069%).
- **Blocks merge:** contributor message (in the PR) sent by Micah — not yet.

### P1c. Smoke check and pixel diff

- State: **merged** (2026-11-14). Branch `refactor/p1c-smoke`, https://github.com/seanmaye/ShittyCity/pull/7.
- Adds `perf.py smoke` (every city in `CITIES`, kitchen included) and pixel diffs in
  `ab --shots`, `smoke --against`, `ux.py compare`.
- **Found and fixed an A/B bias** (orchestrator's commit `e3ef143`): with the same commit on both
  sides, the working-tree side (plain handler) raised buildings 4–6% slower in 10/10 rounds, and
  the side that ran the discarded warm-up (always B) got `whole-city` frame time ~18% better
  (bimodal ~10/~14 ms). Now both sides share a handler and both warm up. After the fix: no 99%
  verdict; one 95% (`overview-dusk.frameP95` +3.1%).
- Gate: smoke same-commit floors ≤ 0.0027%; deliberate colour change caught (0.11–0.20%).
- Before-fix bias means **P0's baselines are fine** (single-side `run`s) but any `ab` run before
  `e3ef143` should not be trusted for `whole-city` or the building load phase.

### P2. The build

- State: **merged** (2026-11-14, `927dd0f`). https://github.com/seanmaye/ShittyCity/pull/9
  is ready for review, with every gate's output in its description.
- Branch `refactor/p2-build` (pushed): P1a + P1b with P1c's two commits cherry-picked
  (`5ac3781`, `2ac1357`) on `7fe4426`. Rebase onto `main` once #4, #7 and #8 merge; the P1
  commits then drop out.
- Build done (`1161e44`, `aa7f9da`, `b272a50`; diff read by the orchestrator): vite 8.3.8
  (rolldown 1.2.19), three 0.186.1, wrangler 4.162.0, @fontsource-variable/archivo 5.3.0,
  npm 11.19.1, `.nvmrc` 24. Own `@font-face` "Archivo" (vietnamese, latin-ext, latin; upright
  and italic; both axes): text widths identical to Google's in 7 style/weight/stretch cases.
  `target: 'esnext'` keeps top-level await; `appType: 'mpa'` so a missing file is a 404; a
  `raw-gz` middleware stops dev/preview sending `Content-Encoding: gzip` for data/*.gz. Linux
  binaries in the lockfile (simulated `npm ci --os=linux`); CI job not run yet (nothing pushed).
  Dev and preview: all 5 cities load, 0 errors, 0 failed requests, every request to localhost;
  `#err` shows when the main chunk fails. Smoke on dist: all pass; pixel shares vs 2ac1357 3.1%
  phl, 11.0% jsh (trees: three's UUID patch can't apply to the bundle), text identical.
- Harness done (`3e009ea`, `5e08f8f`; diff read): `prepare_side()` for run/ab/snap/smoke/ux;
  built sides staged from their exact inputs, cached by input hash
  (`tools/perf/.cache/build/`), node_modules by lockfile (`.cache/npm-*`), served strictly
  (marker `.perf-build.json`). `tools/perf/build.mjs` loads each side's vite.config.js and adds
  the harness overrides (unminified, fixed names, source maps) and the patch plugin; patch text
  only in perf.py. Census stacks and saved profiles resolved through source maps (own VLQ
  decoder). `capture.py` → `npm run dev` (5173). Implementer's checks: perf-build smoke vs
  2ac1357 within tolerance (phl 0.0033%, nola 0.0006%, pine 0.0122%, others 0); new same-commit
  floor phl 0.0052%, nola 0.0007%, pine 0.0124%; census rows identical old-vs-build on phl and
  jsh; `smoke --prod` and `--url` (local preview) pass. Found: `run --ablate` likely broken
  before P2 (`WebGLMultisampleRenderTarget` gone in r186) — not fixed, out of scope.
- Review (xhigh, fresh) of `2ac1357..refactor/p2-build`: **1 blocker** (confirmed by the
  orchestrator): Vite 8's default CSS minifier (Lightning CSS) drops all 13 unprefixed
  `backdrop-filter` (no panel blur in Chromium/Firefox), merges `.ls-poi b`'s
  `font-stretch: 68%` into an invalid `font` shorthand (loading headline falls back to 16px
  upright), and rewrites media queries to range syntax. Fix: `build.cssMinify: false`.
  **Should fix:** perf builds didn't minify CSS, so no gate saw shipped CSS → build.mjs keeps
  production's CSS minification. Minor fixes asked: missing-npm message, cache temp cleanup,
  ab cleanup on failure, keep three's native `$1` names in profiles, tag before ablation hides,
  harness hash in build snapshots. Left as known limits: `city_ids` tokenizer edge cases,
  staging re-read race, `.env*` not staged (none exist). Found sound: lockfile (linux/win
  binaries), wrangler dry-run, dist/data identical, `#err`, TLA, font, CI actions, VLQ decoder
  (0 mismatches in 747k lookups), census parity, patch symmetry, serving symmetry.
- Fixes done (`bdf7e82` `cssMinify: false`; `c7193fd` perf builds keep production's CSS
  minification + the six minor fixes). Shipped CSS = sources concatenated, font url()s
  rewritten (13 kB gzip). `run --ablate` confirmed broken before P2 on every side (MSAA toggle).
- Pushed; draft PR https://github.com/seanmaye/ShittyCity/pull/9 (stacked on #4/#8/#7).
  `origin/main` still `7fe4426`, so no rebase needed.
- Gate 1 (Linux CI): **green** — Ubuntu 24.04.5, node v24.22.2, npm 11.19.1, `npm ci` 51
  packages, build passed in 20 s.
- Gates 2–6: **passed** (orchestrator, one at a time, on AC power, no subagents, 02:32–06:15).
  A = `2ac1357` (sources), B = `c7193fd` (perf build). Outputs:
  `tools/perf/out/20261114-*-p2-*` and `tools/ux/out/20261114-035623-p2-build` in the main
  checkout; scripts and logs in `tools/perf/out/20261114-p2-gate-logs/`.
  - Smoke vs 2ac1357: all 5 ok, within tolerance (phl 0.0035%, nola 0.0002%, pine 0.0118%,
    nyc/jsh 0). `smoke --prod`: all 5 ok, no errors or failed requests.
  - `ab --rounds 5 --shots` vs 2ac1357, phl/nyc/nola/jsh: **no `worse`**. Data fetch + decode
    faster on every city (phl −7.0%, nyc −8.6%, jsh −13.2%, nola −26.7%, all 99%). One
    `likely worse` heap row (nola `overview-night.heapMB` +21.3%), ignored by the rule. Shots: all
    phl views within tolerance. nyc and nola: every view within. jsh: 4 views above the
    same-build floor, motion only (see the tolerance note above).
  - Same build on both sides (phl 8 rounds all scenarios; jsh, nyc, nola 5 rounds; nola 8; nola
    and jsh `transit-map` alone at 16): no frame or load row significant in the final runs, so
    the harness adds no bias. The 99% rows seen on the way vanished with more rounds (see "How to
    read `ab`").
  - Census parity vs no-build 2ac1357: totals (1,879 calls, 5,423,923 tris), 20 builder rows, 25
    site rows and the load inventory all identical. `hot` names the same functions at the same
    file:line on both.
  - `ux.py compare` vs P0: 531 screens, 16 errors, 345 warnings on both; +0/+0. The `loading`
    state fails to capture on every city/device in P0 too (`ux.py` bug, not P2). Large pixel
    shares only in moving or random states. `load-error`: same text and font.
- Contributor message drafted in #9 (Micah sends). Note for #8: its proposed `COLLABORATING.md`
  rewrite says three.js and the font load from CDNs; after P2 that line should say Node 24 and
  `npm ci`.
- Local follow-up at merge: `.claude/launch.json` (untracked) still starts `tools/serve.py` and
  has a `p2-preview` entry pointing at a scratchpad folder. Replace with one `npm run dev`
  entry on port 5173.
- **Blocks merge:** P1a/P1b/P1c merged, then rebase #9 on `main`; the dashboard readout and the
  Build-command change (human step) before the cutover; the contributor message sent.

### P3. Checks in the build

- State: **merged** (2026-11-14, `9eaca95`). https://github.com/seanmaye/ShittyCity/pull/10,
  base `refactor/p2-build` (retarget to `main` after #9 merges). Contributor message drafted in #10
  (Micah sends when it merges).
- Branch `refactor/p3-checks` = two parallel implementers stacked: P3a (JS, `5d8d57a`) then P3b
  (Python/CI/harness, cherry-picked: `118da21`, `7632c98`, `9877a18`). One conflict, expected:
  P3a's one-line edit to `build.yml`, which P3b replaces with `ci.yml`. Both diffs read.
- JS: Biome 2.6.7 (`biome.jsonc`, lint only; rules firing on today's code off with hit counts),
  TypeScript 7.0.2 (`tsc` binary works as 5.x did; `checkJs: false`, `skipLibCheck` for Vite's
  types), Vitest 5.1.0 (25 tests). `npm run check` 1.9 s wall; `cf:build` = check && build.
  App code: `export` on `septaLines`, `rectInRing`, `decode`; bundle byte-identical.
- Python: Ruff 0.17.5 `select = E4,E7,E9,F`, dense-style rules off, per-file ignores for
  leftovers; pytest 41 tests. `tools/phl/formats.py` holds `pack_phb1`/`pack_ter1`; re-encoding
  the committed phl buildings (9,427,736 B) and terrain (34,283,928 B) gives identical bytes.
  `data/jsh/terrain.bin.gz` is a different TER1 layout (jsh's own reader): not covered.
- CI: `ci.yml`, jobs `web` (`npm run cf:build`) and `python` (uv 0.13.4, `--group dev`). Check
  names change from "Build / build" to "CI / web", "CI / python".
- Harness: no-build path gone (CDN route and cache, `sources` kind, temp worktrees). A side
  without a package.json exits with one sentence; `smoke --root dist` still serves built output.
  `harness_version()` changed (build.mjs comment): perf builds rebuild once, old snaps warn.
- Gates: **passed.** check, cf:build, Ruff, pytest pass locally; CI `web` and `python` green on
  Linux (run 43591164282). Type error: #11 (`js/ts-check-demo.js`, `// @ts-check`, string to
  number) failed CI `web` on `npm run cf:build` with TS2322 (run 43591190611), `python` passed;
  #11 closed and its branch deleted. Smoke all 5 ok, pixels vs P2's smoke phl 0.0035%, nyc 0,
  jsh 0, nola 0.0001%, pine 0.0052% (`tools/perf/out/20261114-063931-smoke-p3-vs-p2` in the P3
  worktree); `smoke --ref 2ac1357` refused with the sentence.
- **Blocks merge:** #9 merged first (with the dashboard's Build command running `cf:build`), then
  retarget #10 to `main`. The "CI / web" and "CI / python" names replace "Build / build" in any
  branch rule.
- Implementer worktrees: `.claude/worktrees/agent-a84c73ea64461a06e` (P3a),
  `agent-af7c81b2f5d7f758d` (P3b); P3 worktree `scratchpad/p3` of the orchestrator session.

### P4a. three.js 0.187.0

- State: **merged** (2026-11-14, `057cdc6`; Micah was shown the kitchen before/after and said to proceed).
  https://github.com/seanmaye/ShittyCity/pull/12, base `refactor/p3-checks`.
- Branch `refactor/p4a-three-187`: `d8b308e` bump (three + @types/three 0.187.0, lockfile 4
  entries), `a3a24a9` kitchen `PCFShadowMap` (three already substituted it: no pixel change, the
  warning goes), `2823e17` 19 import lines in 12 files to `three/addons/` (bundle byte-identical).
  `js/three-setup.js` untouched: `restoreAnisotropy` still reads anisotropy 8 back on every
  nearest-magnified texture (phl/nyc/nola 12/12, jsh 14/14); harness patch `"patched": 1`.
  Main chunk 1,290.50 → 1,295.60 kB (gzip +0.43 kB).
- Gates (A = `9877a18`, B = `2823e17`; scripts `gate-p4a.sh` in the orchestrator scratchpad):
  - phl `ab --rounds 5 --shots` (quick set + street-level): no significant difference. Shots:
    overview-dusk 0.0022%, whole-city 0.0011%, ride-L 1.08%, street-level 0.0194%, fly-market
    8.2% (moving camera). `tools/perf/out/20261114-065446-ab-p4a-phl` (gate worktree).
  - jsh overlook-stand, 5 rounds: one `worse` load phase (parks and streets +3.3%, 0.9 ms) and
    three `likely worse` load rows; 16 rounds: no significant difference (that phase +0.4%).
    First frame (shader compile) leans +2.7–3.3% in both, under the threshold. Shot 0.0001%.
  - Smoke vs `9877a18`: all 5 ok; pine 13.4% (r187 PMREM), others ≤ 0.0044%.
- Kitchen before/after for Micah: `tools/perf/out/20261114-p4a-kitchen/` in the main checkout
  (side by side, changed pixels). Floor and island top +3 to +8 per channel, cabinets a touch less
  yellow. Fix drift in `js/three-setup.js` only, if Micah wants it.
- Gate worktree `scratchpad/gate-p4a` (detached at `2823e17`); implementer worktree
  `.claude/worktrees/agent-ac2c045edff12d217`.

### P4b. Per-city code splitting, hashed data, long-lived caching

- State: **merged** (2026-11-14, `1a72a95`); live checks passed, see "Merge log".
  https://github.com/seanmaye/ShittyCity/pull/13, base `refactor/p4a-three-187`. Contributor
  message drafted in #13 (Micah sends when it merges).
- Branch `refactor/p4b-split-cache`: `5f2d648` city code chunks (`js/scene/<city>/<city>.js`,
  `CODE` in main.js, `own` into buildScene/createUI; `onPromenade` as an option), `ae83172` hashed
  data (`data-<city>-<file>-<hash>`; byte-identical files across cities built once, named for all),
  `2104567` `public/_headers`, `825ead6` smoke name check; after review `9c9b727` URL map in main
  (one glob over data/*/*), `dd38073` missing-file error, `1faaa55` three.js chunks (`three-core`,
  `three`, `three-addons`), `1d6353d` normalizePath (Windows), `b459fc6` reload once on
  `vite:preloadError`, `401ab31` smoke checks source maps (`SHARED_CITY_FILES`: phl/people.js,
  jsh/terrain.js, jsh/places.js), `8a40f33` README/EDITING.md.
- **Departures from the plan:** the URL map is in main, not a chunk per city (main held those
  chunks' names, so no caching gain, and it cost the loading screen a round trip). Not fixed from
  review: a byte-identical file shared by cities renames when one city's copy changes (rare, one
  re-download); source maps take their JS file's hash (devtools only).
- JS per city, kB raw / gzip (before: every city 1,298.03 / 419.11): phl 1,110.88 / 349.38
  (−16.6% gzip), nyc 902.93 / 266.31 (−36.5%), jsh 977.41 / 296.66 (−29.2%), nola 871.13 /
  252.94 (−39.6%, shared only), pine 933.31 / 277.88 (−33.7%). Shared 12 files 871.13 / 252.94.
- Gates (A = `2823e17`, B = `8a40f33`; `gate-p4b*.sh` in the orchestrator scratchpad, outputs in
  its `gate-p4b` worktree):
  - 5 rounds, matrix with shots: no `worse`. phl: 4 `likely worse` (overview-dusk frameP95 +5.1%,
    market-cut/ride-regional style +3.6/+4.3%, a build phase +3.0%) → 8 rounds of those 3: none.
    nyc: buildings phase `likely worse` +3.4% → 8 rounds `worse` +4.5% (15 ms, 0/8) → 16 rounds
    +2.0% not significant, ready −2.0% (14/16). nola `better` (ready −3.9%, data −39.8%); jsh
    data −12.1%. Data fetched 9–12% sooner everywhere. Build phases after the data lean 2–3%
    slower (phl, nyc), under threshold; phl ready +1.0–1.2%.
  - Shots: every fixed view within tolerance; moving views looked at. phl overlook-* (jsh-only
    scenarios run by "all") show ride-monorail's leftover camera: ignore.
  - Smoke and `smoke --prod` at `8a40f33`: all 5 ok, no other city's file or code, all /assets/
    hashed (`20261114-095118-smoke-p4b-final`, `-095151-smoke-p4b-final-prod`).
- **Live after merge (production):** `curl -sI` of `/`, a chunk and a data file (one
  Cache-Control, immutable on /assets/, default on `/`); a second load transfers only index.html;
  Micah in Safari.
- Reviewer (fresh agent, diff + phase goal): no city-breaking defect; 8 findings, 6 fixed (above).
- Implementer worktree `.claude/worktrees/agent-a2a84bddf363d95ae`; gate worktree
  `scratchpad/gate-p4b` (detached at `8a40f33`).

### P4c. Typed contracts, opt-in checking

- State: **merged** (2026-11-14, `f718a5b`). https://github.com/seanmaye/ShittyCity/pull/14,
  base `refactor/p4b-split-cache`.
- Branch `refactor/p4c-types`: `943bd63` js/types/ (data.d.ts, city.d.ts, scene.d.ts; index.js one
  `@returns` line), `288a664` `// @ts-check` on data.js, cities.js, geometry.js, season.js and
  `"strict": false` (TypeScript 7 defaults strict on: 108 errors strict, 1 non-strict), `83ec748`
  core.js, river.js, buildings.js, `2327970` (orchestrator) cities.js unchecked: 8 of its 24 commits
  on main added an entry field, each a TS2353 that would stop the deploy; its JSDoc types stay, so
  checked files still see CITY typed. **Departure from the plan** (it names cities.js); one line to
  turn back on. Left unchecked: terrain.js, sky.js (runtime change), nature.js, monorail.js (cast in
  a dense line), ground.js, city.js, subway.js, fishing.js. No real bug found.
- Gates: check passes (a deliberate TS2345 fails it); production JS byte-identical to `8a40f33`;
  smoke all 5 ok (phl 0.0006%, pine 0.0102%); `ab --quick --shots` phl vs `8a40f33`: no
  significant difference, shots within tolerance (`20261114-101830-ab-p4c-phl`, gate worktree).
- Known gaps: `skipLibCheck` hides errors inside js/types/; scene.d.ts unchecked against the
  harnesses' Python strings.
- Implementer worktree `.claude/worktrees/agent-a3ca99e35c3917330`.

### P5. Data decoding in a worker (go or no-go)

- State: **no-go, closed** (2026-11-14). https://github.com/seanmaye/ShittyCity/pull/15 (closed,
  numbers in its description); branch `refactor/p5-worker` kept on origin for a later attempt.
- Built (implementer worktree `.claude/worktrees/agent-a0a8745f285892c82`): `bf40d79` harness
  (the worker's Resource Timing replayed on the page with `performance.measure`; probe.js
  `P.resources()`), `98d5d89` streamed gunzip, `f736b55` module worker `js/load-worker.js` with
  the readers moved unchanged to `js/formats.js` (all typed arrays transferred), `564cb5b` JSON
  parsed in the worker. check, build, smoke (same data files and bytes), dev, preview all pass.
- Per step, `ab --rounds 8`, one scenario (`gate-p5-steps.sh`): stream neutral (ready +0.0% phl,
  +0.2% nyc); worker: phl ready **worse** +4.0%, fetch + decode **worse** in both (+5.3%, +6.9%);
  JSON in worker: fetch + decode **worse** +20–21%, nyc ready **worse** +7.7%.
- Plan's gate on the worker step vs `2327970` (`ab --rounds 5 --shots`, phl 12, nyc 6): ready
  phl +1.5%, nyc −4.8% (both not significant); nyc fetch + decode `likely worse` +3.9% (5/5);
  nyc buildings phase `better` −13.9%; shots within tolerance (phl overview-noon 0.0126%:
  moving things only).
- Profile (phl, `run` on steps 1 and 2, twice): decode functions gone from the main thread, busy
  −57 to −116 ms, idle +98 to +108 ms; scene ready unchanged. `load.dataFetchedMs` excluded:
  with streaming it includes decompression.
- Why no-go: nothing finishes sooner, and the worker's start delays the first data request (the
  consistently worse row). A later attempt would start the worker before loadData and keep
  JSON on the main thread.

### P6. `.ts` renames (P6a) and smaller data (P6b), one pull request

- State: **in review**. Branch `refactor/p6`, rebased on `a926cc2` (Micah's Jersey Shore extension,
  pushed while the gates ran); PR: PR-LINK. Micah asked for P6a and P6b together in one pull request,
  not one per folder and one per format as the plan has it; the commits keep the plan's structure
  (per folder a pure rename, then its typing; P6b after).
- Built by a P6 session: the orchestrator wrote the prep, the renames (`rename_ts.py`: `git mv`,
  import paths and path mentions, nothing else) and P6b; one agent per folder typed it in its own
  worktree (phl; jsh; nyc + pine; js/scene; js), each gated on its own before its commit was taken.

**P6a.** Prep commit: tsconfig `allowImportingTsExtensions` (imports say `./x.ts`),
`erasableSyntaxOnly`, `verbatimModuleSyntax` (no import elided: main's `three-setup` import must
stay), `types: ["vite/client"]`; Biome lints `js/**/*.ts`; perf.py reads `js/cities.ts` or `.js`,
whichever a side has (a base from before the renames still works), allows a type on `CITIES`, and
compares `SHARED_CITY_FILES` without the extension. Then rename and typing for `js/scene/phl`,
`nyc`, `jsh`, `pine`, `js/scene` and `js`. 70 `.ts` files, no `.js` left in `js/`; `test/` and
`vite.config.js` stay JS. The rebase onto `a926cc2` carried its edits to city.js and
jsh/terrain.js into the `.ts` files (conflicts only in lines of docs/JSH.md and a comment that name
files).
- Typing: types only. Local interfaces for objects that grow after creation, optional trailing
  parameters, tuple casts, DOM element casts, `declare` class fields (`Builder`, church's `Shell`:
  a typed field without `declare` would be emitted), the P4c JSDoc types turned into TypeScript.
  phl's `people.ts` exports `Figure`, `Joints`, `Outfit`; `buildScene` returns `Promise<SceneApi>`.
  Three `Record<string, any>` (Biome warnings): index.ts's `Feature` and `own`, monorail's
  `proposal.routes`. `strict` stays off.
- `CITIES` is `Record<string, CityEntry & Record<string, unknown>>`: a new field on a city entry
  passes the check (the reason P4c left cities.js unchecked), a wrong type on a known one fails.
  A new field inside a loading screen or other sub-object is still strict.
- Gates: check passes (tsc 0 errors, Biome 0 errors, tests 58). Built JS byte-identical at every
  typing commit to the rename before it (per file, hashes and the sourceMappingURL line set aside);
  the P6a tip against `a926cc2`: the only change is one string, data.ts's error message naming
  `js/main.ts` (and CSS comments that name files). **Departure:** the plan's per-folder
  `ab --quick --shots` was not run per folder; the byte-identical builds stand in for it, and the
  whole branch went through `ab` (below).

**P6b.** Measured first (offline, on the committed files; production wire bytes per file by
`curl`, every hashed name found). Each change alone, as a share of a city's first-load transfer:
JSON columns 19.3% phl, 27.4% nyc, 10.2% jsh, 16.0% nola; planar terrain 10.6% phl, 9.5% jsh;
PHB2 4.3% phl, 7.3% nyc, 15.2% nola. Recompressing the same bytes better (zopfli or libdeflate)
would add 4 to 8 points but needs a dependency; not done. Every candidate decoded identically.
- **Departure from the plan:** the plan puts the new formats in the pipeline (writers in tools/,
  a transcoder for the committed files). Here the build encodes instead: `data/` stays as the
  pipeline writes it (readable JSON, PHB1, TER1), and `vite.config.js` `dataCodec` ships each
  large file encoded. Why: the raw sources the writers need are not in the repository
  (`tools/phl/raw/`, `tools/nola/src/` are git-ignored and not on this machine), so changed
  writers could not be run; about 15 writers and 8 readers in tools/ would change at once; the
  committed data would become binary and grow the repository by about 17 MB. The page reads
  both forms (the dev server serves `data/` as is).
- js/formats.ts: JCOL (JSON with every integer array moved into one column of zigzag deltas in
  byte planes), TER2 (planar-predicted terrain, a byte per residual), PHB2 (PHB1's columns in byte
  planes, outlines chained); the PHB1 and TER1 readers moved there unchanged. `dataCodec` keeps an
  encoding only if the page's readers decode it to exactly what they read from the committed file
  (numbers by `Object.is`, typed arrays byte for byte) and it is smaller. JSON under 32 kB stays
  JSON. Build time 0.2 s -> about 9 s. JS each city loads: +2.5 kB (the readers).
- Fixed on the way, from the gates: JCOL's arrays first came out of `push` with spare capacity
  (phl heap +25 MB; nola one load phase worse at 99%): now exactly their length. The first TER2
  reader took 36 ms on phl (TER1 10 ms): now 17 ms, with phl's JCOL 22 ms against JSON.parse's 26
  (Node).
- Gates (final, `3d8ef47` vs `a926cc2`): test/formats.test.js reads every encoded committed file
  both ways through the page's own readers (`setTerrain`, `loadTerrain`, `decode`, JSON) and finds
  them identical; check passes. smoke `--prod`: all 5 ok, no error, no failed request, pixel diff
  within tolerance (phl 0.0008%, nyc 0.0001%, jsh 0.0001%, nola 0.0002%, pine 0.0162%;
  `20261114-155134-smoke-final`). ab, 8 rounds: phl `--quick --shots` no load or frame row; nyc
  data load `better` -5.6%; nola data fetched `better` -17.8%, ready -4.0% (not significant), and
  `whole-city.frameP95` `likely worse` +4.6%, which the 8-round rerun cleared (-3.6%, not
  significant; `20261114-162213-ab-final-nola-rerun`); jsh no significant difference. Shots within tolerance (fly-market 35.6%: moving camera). (`20261114-155215-ab-final-phl`,
  `-160321-…-nyc`, `-160851-…-nola`, `-161413-…-jsh`.)
- **phl `heapMB` rows `worse` (+120 to 160 MB), and why they do not count:** the harness reads
  `JSHeapUsedSize` after 10 frames, which includes garbage not yet collected (about 8 GB is
  allocated during phl's load). Loaded the harness's way (same perf builds, probe, seed, date)
  and then garbage-collected, both sides hold 122.8 MB, every time (3 loads each); before the
  collection both swing between about 145 and 340 MB (the base read 340.7 MB once). Allocation
  during the load is the same (8,091 vs 8,116 MB sampled). The branch reads high more often,
  most likely because its smaller ArrayBuffers put less external-memory pressure on V8, so its
  major collection comes later. No load or frame row moves with it.
- **Open: nola's "Placing landmarks and the monorail…" phase `worse`, +1.3 ms (+3.7%, 0/8)** in the
  rerun, as in one earlier run (+1.7 ms; another had +1.35 ms, not significant). Its code is the same
  on both sides, and for nola it builds trees from a 16,244-number array (no measurable cost
  either way). Not proven, but most likely the same GC timing as phl's heap rows: the branch's
  major collection lands later in the load. P2 saw a 99% nola phase (0.8 ms) on byte-identical
  builds. Micah to decide whether it holds the merge.
- Earlier phl runs on the old base showed `readyMs` +4.2%, -3.2% and +6.8% (one `likely worse`);
  timed directly, 8 alternating production loads each: main 5032 ms, branch 5076 ms (median), the
  last four rounds within 30 ms of each other. A variant with packed arrays (as JSON.parse makes)
  loaded no faster.
- Transfer, estimated (production's bytes for unchanged files, this build's for the encoded ones;
  not counting the two font files): phl data 16.0 -> 10.0 MB, first load 17.1 -> 11.2 MB (-34.7%);
  nyc 9.35 -> 6.05 MB (-35.3%); jsh (`a926cc2`'s data, production bytes re-measured) data 2.33 ->
  1.10 MB, first load 3.40 -> 2.17 MB (-36.3%); nola 3.67 -> 2.47 MB (-32.9%). The perf harness
  cannot see transfer (it serves from localhost). To confirm after the deploy:
  `smoke --url https://ashitty.city` lists bytes per city.
- Not tried: pre-compressed Brotli (needs a preview deployment; there is none).
- Unverified: transfer on production (after merge), Safari, decode time on a slow device.

**Found while typing, not changed (would change runtime):** js/scene/index.ts passes
`createCinematic` a `ground:` option that sits inside a `//` comment on the line before, so
cinematic shots use a flat ground (probably a bug); church.ts calls `inside.update(dt, t, camera)`
and concert.ts `effects(dt)` with an argument the function does not take.

**Before merge:** a message to the contributors (every file in js/ is renamed; branches made
before need a rebase, which carries edits across the renames; drafted in the PR).

## Closing report (2026-11-14, P3–P5 orchestrator)

P0 to P4c are built, gated and in review; **nothing is merged yet** (every merge is Micah's yes).
P5 is closed as no-go with its numbers. P6a and P6b wait for Micah's go-ahead.

**Load, P0 → end state** (`perf.py run --repeat 3`, P0's settings, medians; P0 on `9c38eae`
unbuilt, end state `2327970` = #14's tip, perf build; unpaired runs a day apart; outputs
`tools/perf/out/20261114-1152*-final-*` in the gate worktree):

| city | scene ready ms | first frame ms | data fetched ms | JS heap MB |
| --- | ---: | ---: | ---: | ---: |
| phl | 4441 → 3974 (−10.5%) | 4798 → 4279 (−10.8%) | 275 → 238 | 275 → 155 |
| nyc | 1360 → 1267 (−6.8%) | 1540 → 1439 (−6.6%) | 224 → 172 | 92 → 81 |
| jsh | 1174 → 1080 (−8.0%) | 1335 → 1241 (−7.0%) | 219 → 174 | 52 → 38 |
| nola | 682 → 623 (−8.6%) | 833 → 776 (−6.9%) | 94 → 46 | 44 → 44 |

Geometry identical in every city. The ranges do not overlap for nyc, jsh and nola; phl's do.
Frame times unchanged: phl overview-dusk 7.5 → 7.3 ms, whole-city 14.9 → 14.7, ride-L
12.5 → 12.6, street-level 5.7 → 5.6; jsh and nola within 0.2 ms. nyc overview GPU looked +0.9 ms
unpaired; paired across the three.js bump (`ab --base 9877a18 --rounds 8 --city nyc`, overviews):
GPU 2.50 → 2.52 ms, no change (one `likely worse` row, JS p50 +0.07 ms).

**JS each city downloads** (gzip): P4b's split. Before, every city 419 kB; after phl 349, nyc
266, jsh 297, nola 253, kitchen 278.

**Repeat visits** (P4b): everything under /assets/ is content-hashed and cached a year, so a
second visit should fetch only index.html. Not yet verified: it needs production (after #13).

**Skipped or departed from the plan, with reasons:** P4b's URL map in main, not a chunk per city
(no caching gain, cost a round trip); P4b review findings 5 and 7 (shared-file renaming,
source-map names); P4c `strict: false` and js/cities.js unchecked (new entry fields would stop
deploys); P5 no-go. `perf.py run --ablate` crashes (r186), not fixed.

**Unverified:** anything live: #9's cutover checks (Workers Builds run on the merge commit,
`smoke --url <prod>`, `curl -sI`), #13's live cache checks, Safari after P2 and P4b. New
Orleans' pipeline under the uv lock (sources git-ignored). Windows builds (P4b's path fix is by
reading). The Workers Builds check failing on non-main branches (cause in the dashboard). ux.py's
`loading` state. jsh's TER1 variant has no round-trip test.

**Merge order:** #3; #4, #8, #7; rebase #9 on main, then #9 (after the dashboard's Build command
is `if [ -f package.json ]; then npm run cf:build; fi` with build cache on, its contributor
message sent, the dashboard readout); then #10, #12 (after Micah's kitchen look), #13 (its
contributor message), #14, each retargeted to main as the one below merges.

**Not ours to settle:** the history rewrite, New York's data source, P6 (a: `.ts` renames per
folder; b: smaller data formats).

## Merge log (2026-11-14, merge session)

Micah's instruction: get the refactor into `main`, following the closing report's merge order.

**Merged**, as merge commits, `origin/main` unchanged at `7fe4426` beforehand: #3 (`9c9d9cf`), #4
(`c7bb7fe`), #8 (`c9bca34`), #7 (`f6962c7`). `main`'s tree at `f6962c7` is `2ac1357` (the gates' A
side) plus the docs from #3. Workers Builds deployed `f6962c7`: success. The contributor message
for #8 had not been sent when it merged.

**Rebased** onto `f6962c7` (the P1 commits dropped out; each new tip differs from its gated tip
only by #3's 12 docs files), force-pushed with a lease on the old tip:

| PR | branch | gated tip | rebased tip |
| --- | --- | --- | --- |
| #9 | `refactor/p2-build` | `c7193fd` | `86f9abe` |
| #10 | `refactor/p3-checks` | `9877a18` | `2e0108d` |
| #12 | `refactor/p4a-three-187` | `2823e17` | `ef27fde` |
| #13 | `refactor/p4b-split-cache` | `8a40f33` | `9249aeb` |
| #14 | `refactor/p4c-types` | `2327970` | `4a66b4e` |

On `4a66b4e`: `npm ci`, `npm run cf:build`, Ruff, pytest (41) pass locally; `smoke --prod`: all 5
cities pass. CI green on all five PRs. Local branches of the same names in the implementers'
worktrees still point at the gated tips.

**Dashboard.** Micah's Cloudflare member on Sean's account has the role "Individual Workers
Admin". Every Workers Builds endpoint answers 403 for it, the worker's Settings page shows no
Build section, and build logs say "Build not found … Forbidden". So this session could neither
read nor change the Build command, and the cause of the failing branch builds is still unknown.
**Sean set the Build command himself** (`if [ -f package.json ]; then npm run cf:build; fi`, as
Micah reported); the build-cache setting was not confirmed. What the login can see: production
deploys come from Workers Builds through Wrangler, custom domain `ashitty.city`, each branch has
an empty preview ("No deployments yet").

**Merged after that**, each retargeted to `main` first, merge commits:

| PR | merge commit | Workers Builds on it |
| --- | --- | --- |
| #9 | `927dd0f` | success |
| #10 | `9eaca95` | success (the first deploy that runs `npm run check`) |
| #12 | `057cdc6` | success |
| #13 | `1a72a95` | success |
| #14 | `f718a5b` | success |

**Cutover checks after #9** (production, `https://ashitty.city`): the page no longer references
jsDelivr or Google Fonts; `/js/main.js` and `/tools/serve.py` are 404; `data/*.gz` is served as
`application/gzip` with no `Content-Encoding`; `smoke --url`: all 5 cities pass.

**Cache checks after #13:** `/` is `public, max-age=0, must-revalidate`; every `/assets/`
response (chunks, fonts, data) is `public, max-age=31536000, immutable`, one Cache-Control each.
Two loads in one Chromium profile: phl 41 responses and 17.3 MB the first time, the second time
only the page (4.4 kB) and Cloudflare's own `/cdn-cgi/rum` beacon went over the network; nola the
same (27 responses, 3.9 MB, then the page and the beacon).

**After #14:** `smoke --url`: all 5 cities pass; no file or code of another city; the chunk names
equal those of a local build of `f718a5b`.

**Found:** `smoke --url` reads source maps with urllib's default User-Agent, which Cloudflare
answers with 403, so on the live site every JS file counted as "without a source map" and the
other-city-code check fell back to names. Fixed after the merges: `chunk_sources` sends a named
User-Agent, the maps load, and the check passes on production (one file per city has no map, as
in a local `smoke --prod`).

**Not done:** the three contributor messages (in #8, #9, #13) were not sent by this session:
Micah sends them. Safari was not checked. The failing branch builds are not explained. Local
branches of the same names in the implementers' worktrees still point at the gated tips.
