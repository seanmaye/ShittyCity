# Refactor plan: orchestrator handoff

Written 2026-11-13 against `origin/main` at `9c38eae`. This is both the plan and the prompt.
To start, open a fresh session in this repository and say:

> Read `docs/REFACTOR-PLAN.md` and carry it out as the orchestrator.

Everything below is addressed to that orchestrator.

## 1. Your job

Move this project onto the stack recommended in
[docs/stack-research/SUMMARY.md](stack-research/SUMMARY.md), in small phases that each land on
their own, without changing how any city looks or making it slower.

You do not write most of the code yourself. You run the phases: brief a subagent to implement
each one in its own git worktree, run the gates yourself, have the risky ones reviewed, open a
pull request, and keep the status file current. You stop for Micah at the points listed in
section 5 and nowhere else.

**In scope:** a Vite build with three.js and the font installed from npm, a pinned wrangler,
lint, type checking and unit tests in the build, a locked Python environment, retiring the
single-file bundle, three.js 0.187, per-city code splitting, hashed file names with long-lived
caching, and data decoding in a worker.

**Out of scope, whatever you find along the way:** changing the 3D engine, the data formats'
kind, the UI approach or the hosting product; a code formatter; rewriting git history;
re-fetching any city's source data; R2; a `WebGPURenderer` or signals spike. If one of these
starts to look necessary, write down why in the status file and ask.

## 2. Read these first

1. [docs/stack-research/SUMMARY.md](stack-research/SUMMARY.md): the target stack, the current
   state, the open questions. Read it whole.
2. The layer file for a phase, when you brief that phase (each ends with risks and migration
   steps): [build](stack-research/03-build-dev-server.md),
   [quality](stack-research/07-quality-tooling.md),
   [hosting](stack-research/08-hosting-delivery.md),
   [types](stack-research/02-language-types.md),
   [engine](stack-research/01-3d-engine.md),
   [data](stack-research/04-data-formats-loading.md),
   [pipeline](stack-research/05-data-pipeline-python.md).
3. [tools/perf/README.md](../tools/perf/README.md) and
   [.claude/skills/perf/SKILL.md](../.claude/skills/perf/SKILL.md): how the performance gate
   works and what makes its numbers meaningless.
4. [README.md](../README.md) for the layout.

Where this plan and the research disagree, this plan wins. Section 3 lists the differences.

### The research is already out of date

It describes commit `79bdd51`. Within hours, `main` gained 7 commits and 5,633 lines in 36
files: a fifth entry, New Orleans (`nola`, with `data/nola`, `tools/nola`, `docs/NOLA.md`),
a cinematic mode (`js/cinema.js`, `js/scene/cinematic.js`), and large new modules under
`js/scene/phl` and `js/scene/nyc`. Four or more people, some driving other AI agents, push
feature work to `main` about 16 times a day.

So: never rely on the research's counts, file lists or line numbers. Re-list before each phase.
Treat every "all cities" below as "every entry in `CITIES` in `js/cities.js` on the day".

## 3. Where this plan departs from the research, and why

| Research said | This plan | Reason |
| --- | --- | --- |
| Retire the bundle in phase 5, after the build | Retire it first (P1b) | It needs no build. The build breaks `tools/bundle.py` anyway (it depends on the import map and parses imports with regular expressions), and each rebuilt bundle adds about 14 MB to git. Removing it first also removes the second data-loading path before the build and the worker touch that code |
| Pixel diff added in phase 3 | Added first (P1c), with a check that loads every city | Every later gate uses it. Today the kitchen and New Orleans have no automated coverage at all, and the build cutover would otherwise be checked on three cities out of five |
| Drop the harness's CDN handling when the build lands | Keep the no-build path in `perf.py` until P2 has merged | P2's own gate compares against the last no-build commit, which only loads through that path |
| CI workflow in phase 3 | A minimal one in P2 | The lockfile is written on macOS arm64 and installed on Linux x64. A Linux `npm ci && npm run build` has to pass before production depends on it |
| Build command set in the dashboard to `npm run build`, later changed to add checks | Dashboard set once to run one npm script, `cf:build`, whose contents live in git | Workers Builds reads its build command only from the dashboard ([configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/): it "does not honor the configurations set in Custom Builds"). One dashboard change, then every later change is a commit |
| `data/` copied through Vite's `publicDir` | `data/` stays where it is | `publicDir` copies a folder's contents to the output root, so it would mean moving `data/` under `public/` and changing every pipeline script and doc. Copy it in a small build step instead |
| Hand-written data manifest for hashed names | Try `import.meta.glob('…', { query: '?url' })` first | Vite then hashes and emits the data files itself, and the manifest is the glob result. Fall back to a manifest script if it does not work out |
| "Tighten encodings in the pipeline" (phase 9) | Transcode the committed files | Philadelphia's raw inputs are not on this machine (`tools/phl/raw/` is absent, about 650 MB plus two hand-fetched files) and New York cannot be rebuilt from this repository. The pipeline cannot be re-run, so a format change has to convert the existing files and prove the decoded values identical |
| Worker decoding as a phase that lands | A measured go or no-go | The research's own measurement is that decoding all of Philadelphia takes about 85 ms. The likely gain is a smoother loading screen, not a shorter load. If `ab` shows neither, it does not merge |
| Global `checkJs: true` at the end of the types phase | Type checking stays opt-in per file; `allowJs` stays on for good | Other people's agents add plain-JS modules daily. A global switch would make their pushes fail the deploy |

## 4. Rules that hold for the whole run

**The repository is shared and `main` is production.**
- Every push to `main` deploys to the live site (Workers Builds). Never push to `main`. Every
  phase is a branch and a pull request against `seanmaye/ShittyCity`.
- Do not merge a pull request without Micah's yes for that pull request. Do not force-push
  anything but your own phase branches. Never rewrite history on `main`.
- Rebase each phase branch on `origin/main` immediately before its gate, and run the gate on
  the rebased tip. If `main` moves again before merge and touches the same files, rebase and
  rerun the cheap gates (check and smoke).
- Keep pull requests small and get them merged the day they open. A branch that waits a day
  will conflict.
- Keep diffs minimal. The code is dense on purpose. Do not reformat, reflow, rename or tidy
  anything a phase does not need. A lint rule that would require mass edits gets switched off,
  not obeyed.
- Follow the repository's commit style: `Area: what changed` (`git log --oneline` shows it).
- You cannot change the Cloudflare dashboard, and you should not try. Those are human steps.

**Performance numbers come from one machine, one run at a time.**
- All timing gates run on this Mac, both sides in the same `perf.py ab` run. Never compare
  two separate runs, and never compare against numbers from another machine.
- Only you run timing gates. Subagents must not run `perf.py run` or `perf.py ab`.
- Before a timing gate: no subagent is running, the Browser pane and any dev-server tab showing
  the app are closed, and the laptop is on power. A concurrent build or a second copy of the
  app skews results by 12 to 50%.
- Claim only rows marked `better` or `likely better`. "Not significant" means no change.
- Never commit `tools/perf/out/` or `tools/ux/out/`.

**Report what happened.** Each gate result goes into the pull request description as the
command and its real output table. If a gate could not be run, say so there; do not describe
it as passed.

## 5. Where you stop for Micah

Ask the opening decisions in one batch before starting P1. After that, keep working on
whatever does not depend on an answer.

**Opening decisions (recommended answer first):**

1. Who has Cloudflare dashboard access for the `shittycity` Worker, and what is the production
   URL? P0 and P2 need that person once each. Nothing substitutes for this.
2. Should a failing check block the deploy? Recommended: yes, from P3, with a rule set that
   passes on the day it lands. This affects everyone who pushes.
3. How far to take TypeScript? Recommended: typed contracts and opt-in checking now (P4c);
   renaming files to `.ts` last (P6a), one folder at a time, only after P4c has been in use.
4. Preview builds for pull requests? Recommended: yes. It gives every phase a real URL before
   merge. The switch on an existing Worker cannot be reversed, so it is Micah's or the
   dashboard owner's call. Without it, P4b's caching checks run against production after merge.
5. A GitHub Actions workflow on Sean's repository? Recommended: yes (public repository, free).
6. May you tell the other contributors about workflow changes, or will Micah? Recommended:
   you draft, Micah sends. Two messages are needed: before P1b ("stop running
   `tools/bundle.py`; share the URL") and before P2 ("`npm ci` and `npm run dev` replace
   `tools/serve.py`").

**Standing human steps:**

| When | What |
| --- | --- |
| Every pull request | Micah approves the merge. While waiting, stack the next phase on the unmerged branch |
| P0 | Dashboard owner reads out the current build, deploy and preview commands, the plan, and whether build cache and previews are on |
| Before P2 merges | Dashboard owner sets the build command (P2, "Cutover") |
| P4a | Micah looks at the kitchen before and after (three.js 0.187 changes its lighting) |
| After P2, P4b and P5 | Someone opens every city once in Safari. The harnesses are Chromium only |

## 6. How to run it

### Roles

- **You (orchestrator):** hold the plan and the status file, write briefs, run every gate,
  open pull requests, talk to Micah. Stay in the main checkout.
- **Implementer subagents:** one per phase or sub-phase, each in its own worktree
  (`isolation: "worktree"`). They may run builds, `npm run check`, unit tests and the smoke
  check. They do not run timing gates, push, or open pull requests.
- **Reviewer subagents:** fresh agents given the diff and the phase's goal, not your opinion
  of it. Use one for P2, P4b and P5. The mechanical phases do not need one.

Subagents through the Agent tool are the right mechanism here: the phases differ too much
from each other for a scripted workflow, and each ends at a human approval. The one place a
workflow script would fit is P6a's per-folder fan-out; use one there only if Micah asks.

Run at most three implementers at once. More than that produces conflicts faster than work.

### Model and effort

Run as Opus at high effort. P2 is the exception: raise your own effort to xhigh when P2 starts
and return to high once it has merged. If you cannot change it yourself, ask Micah to switch
it, and do not start P2's harness work until it is switched. Brief P2's implementers and its
reviewer at xhigh as well. Every other subagent inherits yours.

### Things a worktree does not have

- Untracked files. The research, this plan and the status file are untracked today, so P0
  commits them first. Until that merges, give subagents absolute paths into the main checkout.
- The Python environment (`tools/.venv` is git-ignored). Before P1a, call the main checkout's
  `tools/.venv/bin/python` by absolute path. After P1a, `uv sync` in the worktree.
- `node_modules`. Each worktree runs `npm ci`.

### The loop for each phase

1. Fetch. Re-list what the phase touches on today's `origin/main`.
2. Brief the implementer (template in section 9).
3. When it reports, read the diff yourself. Its report says what it meant to do.
4. Rebase on `origin/main`. Run the phase's gates in order, cheapest first.
5. Review, for the phases that call for it. Fix what the review confirms.
6. Open the pull request with the gate evidence. Update the status file in the same branch.
7. Tell Micah it is ready. Start the next phase without waiting.

If a gate fails twice for reasons the implementer cannot explain, stop that phase, record what
you saw, and ask. Do not loosen a gate to get through it.

### The status file

Keep `docs/REFACTOR-STATUS.md`. Only you edit it. It is how a later session, or you after your
context is summarized, picks the work back up. One section per phase: state (not started, in
progress, in review, merged, skipped and why), branch and pull request, gate results in one
or two lines each, decisions taken, and anything left unverified. At the top: the answers to
section 5, the reference machine and GPU line from the baseline report, the pixel-diff
tolerances, and the production URL.

### The gates

| Gate | What it is | Exists from |
| --- | --- | --- |
| **check** | `npm run check` (lint, `tsc --noEmit`, unit tests) | P3 |
| **smoke** | Every city loads from the same output production serves, with no console error and no failed request; one deterministic screenshot per city; pixel diff against the base side | P1c |
| **ab** | `perf.py ab … --shots` for the cities and scenarios the phase names: no metric `worse`, pixel diff within tolerance | Today; build-aware from P2 |
| **ux** | `ux.py run` then `ux.py compare` against the base: no new findings | Today |
| **live** | `curl -sI` and a two-load request count against a preview or production URL | P2 |

## 7. The phases

Order and what can overlap:

```
P0 ─► P1a ─► P1b ┐
          └► P1c ┴─► P2 ─► P3 ─► P4a ┐
                                 P4b ┼─► P4c ─► P5 ─► P6a, P6b (each needs a go-ahead)
```

P1b and P1c run in parallel. P4a and P4b run in parallel and merge in that order. P4c's type
files can be written alongside them, but it touches `data.js` and `cities.js` after P4b does.

### P0. Baseline and inventory

No app code changes.

1. Fast-forward the main checkout to `origin/main`.
2. Commit the research, this plan and a first status file on a branch; open the docs pull
   request. This is what makes them visible to worktrees.
3. Inventory: the entries in `CITIES`; module, line and byte counts; which `perf` scenarios
   work for which city (`--city` exists, but the scenarios were written for `phl`, and two are
   for `jsh`); which cities have `tools/ux/states` files. Write the result into the status file
   as the **gate matrix**: for each city, the scenarios and checks that count as its gate.
4. Baseline: `perf.py run --repeat 3` for each city that has scenarios, and `ux.py run` for
   every city and device. Keep the output folders; record the headline numbers and the GPU line.
5. Production: record the URL, and `curl -sI` for `/`, a module, a `.json` and a `.bin.gz`.
6. **Human step:** the dashboard readout (section 5).

Done when the status file holds the gate matrix, the baseline and the opening decisions.

### P1a. Locked Python environment

Per [layer 5](stack-research/05-data-pipeline-python.md): `pyproject.toml` with dependency
groups (`data`, `fetch`, `qa`, `dev`), `uv.lock`, `.python-version` at 3.12. No script changes.
Put Pillow in `qa` as well as `data`: the pixel diff needs it.

Watch for:
- The venv moves from `tools/.venv` to `.venv` at the root. Update `.gitignore`.
- Until P2, the repository root is what Cloudflare serves. Every new root file needs a line in
  `.assetsignore` (`pyproject.toml`, `uv.lock`, `.python-version`, `.venv`).
- The local venv today holds only Playwright. None of the pipeline libraries has been installed
  on this machine, so the rebuild below is their first run here.
- Docs and the perf skill give Windows paths and `pip install`. Change them to `uv sync
  --group <name>` and `uv run python -I …`.

Gate: rebuild Jersey Shore with the locked environment and get an empty `git diff --stat
data/jsh`, or explain each difference in the pull request. Do the same for New Orleans if its
sources are committed. `perf.py list` and `ux.py` still start.

### P1b. Retire the single-file bundle

Decided 2026-11-13 (SUMMARY, open question 1). Remove `city-models.html`, `tools/bundle.py`,
`tools/unbundle.py`, and the embedded-data branches in `js/data.js`, `js/loading.js` and the
`file:` message in `js/main.js`. Then follow every reference: `README.md`, `.assetsignore`,
`docs/EDITING.md`, each city's doc, `tools/loading/capture.py`, `tools/ux/README.md`, the perf
skill, and the comments in `js/cities.js`.

Watch for:
- `docs/EDITING.md` is 70 KB, doubles as the guide embedded in the bundle, and other people
  edit it daily. Cut the parts about editing the single file. Do not restructure the rest.
- `COLLABORATING.md` describes a workflow on an office file share that no longer matches the
  repository. Rewriting it speaks for the team. Draft the replacement in the pull request and
  flag it for Micah.
- Leave the "never read `CITY` at module top level" habit in the code alone. Remove only the
  sentences that give the bundle as its reason.
- Do not touch history. The 521 MB stays in `.git` until the team decides otherwise.
- **Human step first:** the message to contributors goes out before this merges. A branch
  that rebuilt the bundle will conflict; the resolution is to delete the file.

Gate: smoke for every city; `ab --quick` on `phl` (the load path changed); `git grep` finds
no reference to the bundle outside the research folder.

### P1c. Smoke check and pixel diff

Build the check every later gate leans on, on today's no-build layout.

1. **Smoke:** for a given served root, load `?city=<id>` for every entry in `CITIES` with the
   harness's determinism (seeded `Math.random`, pinned date, the UUID patch), wait for the
   loading screen to close, fail on any console error or failed request, and save a
   screenshot. It must handle the kitchen, which exposes `window.__kitchen` and not
   `window.__city`. Reuse `perf.py`'s serving and browser setup; do not write a second harness.
2. **Pixel diff:** in `perf.py ab --shots` and `ux.py compare`, report the share of changed
   pixels per image pair with Pillow. No masking at first.
3. **Calibrate:** run the smoke and `ab --quick --shots` with both sides the same commit.
   Trains and people move, so the floor is not zero. Record the floor per scenario and city in
   the status file and set each tolerance to twice its floor. Every later "screenshots match"
   means "within that tolerance".

Gate: the same-commit run reports every timing metric `not significant`; a deliberate one-line
visual change (a colour, reverted afterwards) is caught by the diff.

### P2. The build

The hinge, and the riskiest phase: it changes the harness that gates everything after it. One
branch, one pull request, so `main` never holds a build with a broken harness. Use one
implementer for the build, then one for the harness on the same branch. Have it reviewed.

**The build** (per [layer 3](stack-research/03-build-dev-server.md), migration steps 1 to 6):
`package.json` with exact versions (`three@0.186.1`, not 0.187: that is P4a), Vite 8, pinned
`wrangler`, `.nvmrc`, a committed lockfile; `vite.config.js`; the import map and the Google
Fonts tags removed from `index.html`; `wrangler.jsonc` pointing at `./dist`; `.assetsignore`
deleted; `tools/serve.py` deleted so the old way fails loudly; `README.md` and
`.claude/launch.json` updated.

Decisions already made for you:
- `data/` stays at the repository root. The dev server serves it from there as is. For the
  build, copy it to `dist/data/` in a small inline plugin. P4b replaces the copy.
- Scripts: `dev`, `build` (`vite build`), `preview`, `deploy`, and `cf:build`, which for now
  just runs `build`. The dashboard will call `cf:build` and nothing else.
- `build.target` must leave top-level `await` alone (`js/main.js` uses it).
- Source maps on.

Watch for:
- **The font's name.** `@fontsource-variable/archivo` registers the family as "Archivo
  Variable". The stylesheet asks for `Archivo` and falls back to `system-ui`, so a wrong name
  fails silently and only shows up as shifted text. Write our own `@font-face` rules named
  `Archivo` that point at the package's `woff2` files, with both axes and both styles (the
  current link asks for width 62 to 125, weight 400 to 900, upright and italic; the loading
  screens use `font-stretch: 68%`). Check `document.fonts.check('italic 900 16px Archivo')` in
  the built page and that nothing is requested from Google or jsDelivr.
- **The lockfile on Linux.** Rolldown, Lightning CSS and wrangler ship per-platform binaries
  as optional dependencies. Generate the lockfile from a clean state and confirm it lists the
  `linux-x64` packages. Add a GitHub Actions job (Ubuntu 24.04, Node 24) that runs `npm ci &&
  npm run build`; it must be green before the cutover. Pin npm with `packageManager` and check
  the version in the job log.
- **The inline entry script.** `index.html` starts the app from an inline module script with a
  `catch` that shows the error overlay. Confirm the built page still does both.

**The harness** (`tools/perf`, `tools/ux`, `tools/loading/capture.py`):
- A side of `ab` is now a folder that may need building. If it has a `package.json`: install
  (cache `node_modules` by lockfile hash under `tools/perf/.cache`), build, serve `dist/`. If
  it does not: serve it as today, CDN interception included. That second path is what lets
  this phase's gate run; remove it in P3.
- Measure a **perf-mode build**: the same chunking as production, not minified, with source
  maps, and with the two patches the harness currently applies to three's core file from the
  CDN (the separate random stream for `generateUUID`, and the `Object3D.add` tagging for the
  census) applied by a Vite plugin that only that mode enables.
- Attribution must survive bundling. The census and `perf.py hot` report `js/…:line` and
  builder function names from stack traces. Stacks now point into chunks, so resolve them
  through the source maps in `perf.py`. Bundlers rename colliding top-level functions
  (`buildMonorail` exists in two modules), so map names back too.
- `perf.py snap` snapshots a built `dist/` instead of copying sources.

**Gate:**
1. The Linux CI job is green.
2. Smoke on the built output, every city, diffed against the last no-build commit.
3. `ab --rounds 5 --shots`, A = the last no-build commit, B = the build, for every city in the
   gate matrix: no metric `worse`, shots within tolerance.
4. `ab` with both sides the build: everything `not significant`, pixel floor unchanged from
   P1c. This proves the new harness adds no bias of its own.
5. Attribution parity: `run -s overview-dusk --census` and `hot` on the build name the same
   builders and the same top `add()` sites as the P0 baseline.
6. `ux.py compare` against the P0 run: no new findings.

**Cutover.** The dashboard build command and the merge have to agree, and only a person can
set the first.
1. **Human step:** set Build command to `if [ -f package.json ]; then npm run cf:build; fi`,
   leave Deploy command at `npx wrangler deploy`, turn build cache on. That form works before
   and after the merge. If the dashboard rejects shell syntax, set it to `npm run cf:build`
   immediately before merging instead; a push that lands in between fails its build and
   leaves production on the previous version, which is harmless.
2. Micah merges.
3. Check the "Workers Builds: shittycity" check run on the merge commit
   (`gh api repos/seanmaye/ShittyCity/commits/<sha>/check-runs`), then run smoke against the
   production URL and `curl -sI` the same four paths as in P0. If the build failed, production
   is still the old version: fix forward, do not revert in a hurry.
4. **Human step:** Safari, every city. The message to contributors about `npm ci` and
   `npm run dev` goes out with the merge.

### P3. Checks in the build

Per [layer 7](stack-research/07-quality-tooling.md). Two implementers in parallel, two pull
requests:

- **JavaScript:** `biome.json` (formatter off, linter on), `tsconfig.json` (`allowJs`,
  `checkJs: false`, `noEmit`, `moduleResolution: "bundler"`), `typescript` and `@types/three`
  at the versions matching `three`, Vitest with the first tests from layer 7's list, `npm run
  check`, and `cf:build` changed to `npm run check && npm run build` if decision 2 was yes.
- **Python and CI:** Ruff (lint only) and pytest in `pyproject.toml`, tests for `geom.py` and
  `citylimits.py`, the Python-to-JavaScript round-trip test for `PHB1` and the terrain grids,
  and the full workflow in `.github/workflows/ci.yml`. Also remove the no-build path from
  `perf.py`.

Watch for:
- The rule set must pass on the day's `main` with almost no edits to app code. Prefer turning
  a rule off to changing fifty files. Record which rules are off and why.
- From here a lint or type error in anyone's push stops the deploy. Keep the blocking set to
  what a new plain-JS module cannot fail by accident.
- The round-trip test needs the Python writers' output step callable as a function. Factor
  out only that step; leave the rest of each script as it is.
- Do not run the browser harnesses in CI. A runner has no GPU and the numbers mean nothing.

Gate: `npm run check` passes locally and in the Cloudflare build; a branch with a deliberate
type error fails its build (preview, if enabled; otherwise show the failing CI job); smoke.

### P4a. three.js 0.187.0

Per [layer 1](stack-research/01-3d-engine.md). Bump `three` and `@types/three` together and
change nothing else in that commit. Then `PCFSoftShadowMap` to `PCFShadowMap` in the kitchen,
and `three/examples/jsm/` to `three/addons/` in the import lines.

Gate: `ab --quick --shots --rounds 5` on `phl`; `--city jsh -s overlook-stand`; the
`street-level` shot compared closely (it shows whether the anisotropy fix in
`js/three-setup.js`, which reads private renderer state, still works); smoke for the rest.
The kitchen is expected to differ: 0.187 builds its environment map differently.
**Human step:** show Micah the kitchen before and after and get a yes. Fix any drift in
`js/three-setup.js` only.

### P4b. Per-city code splitting, hashed data, long-lived caching

Per [layer 3](stack-research/03-build-dev-server.md) step 9 and
[layer 8](stack-research/08-hosting-delivery.md). Have it reviewed.

- **Splitting.** `js/scene/index.js` imports every city's modules statically. Do not redesign
  that file: it is long, dense, and changed by others daily. Give each city folder one module
  that re-exports its builders, load the active city's with a dynamic `import()`, and change
  the call sites to go through it. Do the same for the kitchen in `js/main.js` and for any
  top-level module only one city uses.
- **Hashed data.** Resolve each data file and loading-screen image to a hashed URL at build
  time. Try `import.meta.glob` with `query: '?url'` first, per city so each city's map sits in
  its own chunk; set the inline limit so small files are not turned into data URLs. The
  pipeline, the docs and the harness keep using `data/<city>/<file>` on disk.
- **Headers.** `public/_headers` giving `/assets/*` a one-year immutable policy. The default
  has to be detached first (`! Cache-Control`), or both values are sent. `index.html` keeps the
  default.

Watch for: any file still fetched by a fixed name must not match the immutable rule, or
visitors keep a stale copy for a year.

Gate: a chunk-size table before and after; smoke asserts that loading one city requests no
other city's chunk; `ab --rounds 5` load rows for each city in the gate matrix not worse;
frame metrics not significant; shots within tolerance. Live: `curl -sI` shows one
`Cache-Control` value on a hashed file and the default on `/`; a second load of a city
transfers only `index.html`. Then the Safari check.

### P4c. Typed contracts, opt-in checking

Per [layer 2](stack-research/02-language-types.md), stage A. `.d.ts` files for the data shapes
(from `docs/EDITING.md`), the city config, and the scene API that `window.__city` exposes to
the harnesses. Then `// @ts-check` on the leaf modules (`data.js`, `cities.js`,
`scene/geometry.js`, `scene/season.js`) and outward as far as it stays cheap.

Stop where annotations start costing more lines than they protect. Checking stays opt-in per
file. Do not set `checkJs: true` globally.

Gate: check; `ab --quick --shots` on `phl` not significant with shots within tolerance.

### P5. Data decoding in a worker (go or no-go)

Per [layer 4](stack-research/04-data-formats-loading.md), steps 2 and 3: stream the
decompression, then a module worker that fetches, decompresses and decodes, and transfers
typed arrays (transfer, not copy). The main thread passes it the hashed URLs. Keep the
progress callback and the error message the loading screen shows. Have it reviewed.

Gate: `ab --rounds 5` on `phl` and `nyc`. It merges only if the load rows are `better`, or
they are not significant and `load.cpuprofile` shows main-thread time under the decode
functions clearly down. Frame metrics not significant, shots within tolerance, smoke, Safari.
If it does not clear that bar, close the pull request, record the numbers, and move on.

### P6. Needs a go-ahead each

Report to Micah where things stand after P5 and ask before starting either.

- **P6a. Rename to `.ts`**, one folder per pull request, leaf folders first. Each is two
  commits: a pure rename with import paths fixed and nothing else, then the typing. Merge each
  the day it opens, at a time Micah has told the others that folder is being moved. `allowJs`
  stays on. Gate per folder: check; `ab --quick --shots` not significant.
- **P6b. Smaller data.** Before any format change, measure it offline on the committed file
  (decode, re-encode, compress, compare). Proceed only if it cuts a city's transfer by 10% or
  more. Then: a transcoder for the committed files, the reader, the writer in `tools/`, and
  `docs/EDITING.md`, one format per pull request. Gate: decoded values identical to the old
  file's, byte for byte; round-trip test; `ab` load rows not worse. The pre-compressed Brotli
  idea needs a preview deployment to test whether static assets pass it through.

## 8. Done

The run is finished when P0 to P5 are each merged or closed with a recorded reason, the status
file says so, and you have given Micah a closing report: what landed, the before-and-after
numbers that the gates measured (load, chunk sizes, repeat-visit transfer), what was skipped
and why, what remains unverified, and the open items that were never yours to settle (the
history rewrite, New York's data source, P6).

## 9. Brief template for an implementer

Fill every line. The subagent knows nothing you do not tell it.

```
Goal: <one sentence: what is true when you are done>
Branch: <name>, based on <ref>. You are in your own worktree.
Read first: <this plan's section for the phase; the layer file; the files in play>
In scope: <files and folders>
Not in scope: <what to leave alone, by name>
Decisions already made: <copy the phase's "decisions" and "watch for" items>
Already ruled out: <approaches you or an earlier attempt rejected, and why>

Rules:
- Keep the diff minimal. Do not reformat, rename or tidy. The dense style is intended.
- main moves daily: list files yourself, do not trust counts from the research.
- You may run builds, npm run check, unit tests and the smoke check.
- Do not run perf.py run or perf.py ab. Do not push. Do not open a pull request.
- Commit on your branch in the repository's style: "Area: what changed".

Report back:
- What you changed, by file, and why.
- Each command you ran to check it, with its actual output.
- Anything you skipped, could not verify, or did differently from this brief.
```
