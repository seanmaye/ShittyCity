# Refactor status

Kept by the orchestrator of [REFACTOR-PLAN.md](REFACTOR-PLAN.md). Only the orchestrator edits
this file. It is how the work is picked up again after a context summary or in a new session.

Last updated: 2026-11-13 (P1a, P1b, P1c in review; P2 waits on merges and an effort switch).

## Standing facts

**Opening decisions (asked 2026-11-13, answered by Micah):**

1. Dashboard: Sean owns the Cloudflare account; Micah has admin access and offered to sign in
   to the dashboard in a browser for readouts. Dashboard:
   `https://dash.cloudflare.com/1af14c0b141e374a8e01a11bba70b7d0/workers/services/view/shittycity/production`.
   Production site URL: _not yet recorded_ (P0 dashboard readout).
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
| smoke | nola | 0.0006% | 0.0012% |
| smoke | pine | 0.0108% | 0.0216% |
| `ab --shots` (phl) | overview-dusk | 0.0102% | 0.02% |
| `ab --shots` (phl) | whole-city | 0.0009% | 0.002% |
| `ab --shots` (phl) | ride-L | 0.8766% | 1.75% |
| `ab --shots` (phl) | fly-market | 28.0% | not comparable by pixels (moving camera): look at it |

phl and pine were raised after P1b's smoke (a third sample, diff images showing only moving
trains and the kitchen's monorail). Scenarios not listed get their floor from the first same-commit run that includes them. A
deliberate change (the `--accent` colour) came out 0.11–0.20% in smoke, about 40× the floor.

**How to read `ab` (decided 2026-11-13):** a `worse` row (99%) fails a gate. A lone
`likely worse` (95%) row means rerun that scenario with `--rounds 8`; with ~40 metrics per run,
one or two 95% verdicts appear by chance (the fixed harness, same commit on both sides, gave
one: `overview-dusk.frameP95` +3.1%). `heapMB` rows swing ±30% with GC timing; ignore them
unless a load or frame row moves with them.

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

- State: in review (baseline done; production headers and dashboard readout outstanding).
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

- State: in review. Branch `refactor/p1a-uv`, https://github.com/seanmaye/ShittyCity/pull/4.
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

- State: in review. Branch `refactor/p1b-retire-bundle` (stacked on P1a),
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

- State: in review. Branch `refactor/p1c-smoke`, https://github.com/seanmaye/ShittyCity/pull/7.
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

- State: not started. Waiting on: P1b and P1c merged (P2 builds on both); Micah switching the
  orchestrator to xhigh (it cannot change its own effort); the dashboard readout before cutover.

### P3. Checks in the build

- State: not started.

### P4a. three.js 0.187.0

- State: not started.

### P4b. Per-city code splitting, hashed data, long-lived caching

- State: not started.

### P4c. Typed contracts, opt-in checking

- State: not started.

### P5. Data decoding in a worker (go or no-go)

- State: not started.
