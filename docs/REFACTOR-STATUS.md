# Refactor status

Kept by the orchestrator of [REFACTOR-PLAN.md](REFACTOR-PLAN.md). Only the orchestrator edits
this file. It is how the work is picked up again after a context summary or in a new session.

Last updated: 2026-11-13 (P0 baseline recorded; P1a and P1c implementers started).

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

**Pixel-diff tolerances:** _from P1c calibration_.

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

- State: in progress (implementer started 2026-11-13). Branch `refactor/p1a-uv`.

### P1b. Retire the single-file bundle

- State: not started. Starts after P1a (they edit the same docs). Contributor message to be
  drafted for Micah before it merges.

### P1c. Smoke check and pixel diff

- State: in progress (implementer started 2026-11-13, in parallel with P1a). Branch
  `refactor/p1c-smoke`.

### P2. The build

- State: not started.

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
