# Layer 7: Quality tooling

Research date: 2026-11-13. Nothing here has been executed; see [SUMMARY.md](SUMMARY.md).

## The need

**What exists today.**

- No linter, formatter, type checker or unit test for the JavaScript or the Python. No
  `.github/` directory, so no CI. The only automated check on a commit is that Cloudflare's
  deploy succeeds (GitHub check run "Workers Builds: shittycity").
- Three browser harnesses, all Python driving Playwright's Chromium with the real GPU:
  - [tools/perf/perf.py](../../tools/perf/perf.py) (1,109 lines): frame, JS, GPU and load
    timings, CPU and allocation profiles, draw-call census, ablation, and `ab`, a paired A/B
    against a commit. 14 scenarios in [scenarios.py](../../tools/perf/scenarios.py); `--quick`
    runs four. Scenes are deterministic (seeded `Math.random`, pinned date), and `ab --shots`
    saves a screenshot of every scenario for both sides.
  - [tools/ux/ux.py](../../tools/ux/ux.py) (549 lines) with [audit.js](../../tools/ux/audit.js):
    drives each UI state on five device sizes, measures overlap, off-screen and small targets,
    truncation, and saves plain and annotated screenshots; `compare` diffs two runs' findings.
  - [tools/loading/capture.py](../../tools/loading/capture.py): renders the loading-screen
    backgrounds.
- The code style is dense on purpose: 2,167 of 15,000 lines exceed 120 characters, 262 exceed
  200, the longest is 885 (`awk 'length>N'` over `git ls-files 'js/*'`).

**Code that can be unit-tested without a browser or GPU** (pure functions today):

| Module | Functions |
| --- | --- |
| [js/data.js](../../js/data.js) | `pairs`, `G`, `latOf`, `gunzip` |
| [js/scene/city.js:22-59](../../js/scene/city.js) | `decode` (PHB1), `rectInRing` |
| [js/scene/terrain.js](../../js/scene/terrain.js), [js/scene/jsh/terrain.js](../../js/scene/jsh/terrain.js) | Grid readers and height lookups |
| [js/scene/season.js](../../js/scene/season.js) | `dayOfYear`, `dateOfDay`, `formatDay` |
| [js/scene/sky.js](../../js/scene/sky.js) | Sun position for a date and latitude |
| [js/scene/geometry.js](../../js/scene/geometry.js) | `Builder`, polygon and ribbon builders (need `three`, no GPU) |
| [js/cities.js:8-15](../../js/cities.js) | `septaLines` |
| [tools/phl/geom.py](../../tools/phl/geom.py), [tools/phl/citylimits.py](../../tools/phl/citylimits.py) | Geometry helpers, point-in-boundary |

The highest-value test is a **cross-language round trip**: the Python writers of `PHB1` and the
terrain grids (`tools/phl/build_city.py`, `build_terrain.py`, `tools/nyc/import_nyc.py`) against
the JavaScript readers. Today the two sides agree only by convention and
[docs/EDITING.md](../EDITING.md).

**What we would gain.** Mistakes caught before deploy; safe refactoring during the migration
phases; a visual-regression gate that doesn't depend on someone eyeballing screenshots.

**What rules an option out.** A formatter that can't be configured to leave the dense style
alone (or a decision to accept the reformat); tools that can't run on Node 24 in the build
image; anything that claims GPU performance numbers from a machine without a GPU.

## Candidates

Same sources as [layer 1](01-3d-engine.md); Python rows as in [layer 5](05-data-pipeline-python.md).

**Lint and format (JavaScript/TypeScript)**

| Name | Version | Last release | Dependents (repos / pkgs) | Weekly downloads | YoY (28-day) | Deps | Types | License | Maintenance signal | Fit notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [@biomejs/biome](https://www.npmjs.com/package/@biomejs/biome) | 2.6.7 | 2026-11-11 | 133,926 / 34,515 | 26,601,698 | +532% | 0 (platform binary as optional dep) | n/a (CLI) | MIT OR Apache-2.0 | 51 releases in 12 months; provenance; top contributor 22% | Linter and formatter in one binary, one config file. Formatter can be switched off per project |
| [eslint](https://www.npmjs.com/package/eslint) | 10.14.0 | 2026-10-30 | 27,680,990 / 920,672 | 203,024,691 | +170% | 30 | yes | MIT | 26 releases in 12 months; 159 open issues | Largest rule ecosystem. Node `^20.19.0 \|\| ^22.13.0 \|\| >=24` |
| [typescript-eslint](https://www.npmjs.com/package/typescript-eslint) | 8.72.2 | 2026-11-09 | 18,535,537 / 278,853 | 115,503,884 | not pulled | 4 | yes | MIT | 46 releases in 12 months | Type-aware rules for ESLint. Unverified: its support status for TypeScript 7 |
| [oxlint](https://www.npmjs.com/package/oxlint) | 1.93.0 | 2026-11-09 | 46,694 / 16,850 † | 46,547,247 | +5,835% | 0 | yes | MIT | 65 releases in 12 months; provenance; 1 npm maintainer | Fastest linter. Formatter is a separate package |
| [oxfmt](https://www.npmjs.com/package/oxfmt) | 0.78.0 | 2026-11-09 | (same repo) | 29,154,825 | not pulled | 1 | yes | MIT | 64 releases in 12 months; still 0.x | Formatter from the same project |
| [prettier](https://www.npmjs.com/package/prettier) | 3.10.1 | 2026-11-12 | 10,182,053 / 492,080 | 181,019,260 | +167% | 0 | yes | MIT | 24 releases in 12 months | Formatter only; deliberately few options |
| [dprint](https://www.npmjs.com/package/dprint) | 0.64.3 | 2026-10-23 | 5,095 / 1,056 | 448,291 | not pulled | 0 | no | MIT | 29 releases in 12 months; `postinstall` script | Formatter with plugins |

**Tests and visual comparison**

| Name | Version | Last release | Dependents (repos / pkgs) | Weekly downloads | YoY (28-day) | Deps | Types | License | Maintenance signal | Fit notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [vitest](https://www.npmjs.com/package/vitest) | 5.1.0 | 2026-11-02 | 728,434 / 306,098 | 180,442,165 | +738% | 13 | yes | MIT | 33 releases in 12 months; provenance; top contributor 37% | Uses the Vite config and transforms. Peer `vite ^6.4.0 \|\| ^7 \|\| ^8`; Node `^22.12.0 \|\| ^24.0.0 \|\| >=26` |
| `node:test` (built into Node 24) | n/a | n/a | n/a | n/a | n/a | 0 | via `@types/node` | n/a | Ships with Node | No install. Runs plain ES modules; `three` resolves from `node_modules` |
| [jest](https://www.npmjs.com/package/jest) | 30.5.2 | 2026-09-18 | 15,532,081 / 438,155 | 59,525,336 | +55% | 4 | yes | MIT | 7 releases in 12 months; weakest trend of the runners | Needs configuration for native ES modules |
| [@playwright/test](https://www.npmjs.com/package/@playwright/test) | 1.65.0 | 2026-11-05 | 555,308 / 4,756 | 129,633,435 | +647% | 1 | yes | Apache-2.0 | 15 releases in 12 months; 30 open issues | JS test runner with built-in screenshot assertions. Our harnesses are Python |
| [pixelmatch](https://www.npmjs.com/package/pixelmatch) | 8.0.0 | 2026-10-06 | 511,271 / 2,910 | 15,527,523 | +229% | 1 | yes | ISC | 3 releases in 12 months | Pixel diff in JS |
| [odiff-bin](https://www.npmjs.com/package/odiff-bin) | 4.5.0 | 2026-07-23 | 20 / 0 | 226,415 | +398% | 0 | yes | MIT | 13 releases in 12 months | Native pixel diff |
| [looks-same](https://www.npmjs.com/package/looks-same) | 10.0.1 | 2025-08-18 | 5,086 / 188 | 122,745 | not pulled | 5 | yes | MIT | 0 releases in 12 months | Perceptual diff |
| Pillow `ImageChops` | 13.0.0 | 2026-10-16 | n/a | 172,604,372 | n/a | 0 | n/a | MIT-CMU | Already a pipeline dependency | Pixel diff inside the existing Python harness, no new package |
| [pytest](https://pypi.org/project/pytest/) | 9.2.0 | 2026-10-27 | n/a | 233,217,035 | n/a | 7 | n/a | MIT | 5 releases in 12 months | Python tests |
| [pytest-playwright](https://pypi.org/project/pytest-playwright/) | 0.10.0 | 2026-10-08 | n/a | 2,931,249 | n/a | 3 | n/a | Apache-2.0 | 4 releases in 12 months | Fixtures for Playwright in pytest. Our harnesses are CLIs with their own reports |

**Python lint, format, types**

| Name | Version | Last release | Weekly downloads | Runtime deps | License | Maintenance signal | Fit notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [ruff](https://pypi.org/project/ruff/) | 0.17.5 | 2026-11-12 | 100,301,526 | 0 | MIT | 50 releases in 12 months; ★51,230 | Lint and format in one binary; same vendor as uv |
| [black](https://pypi.org/project/black/) | 26.10.1 | 2026-10-10 | 25,467,752 | 8 | MIT | 8 releases in 12 months | Formatter only |
| [mypy](https://pypi.org/project/mypy/) | 2.4.1 | 2026-10-28 | 47,887,793 | 7 | MIT | 12 releases in 12 months | Type checker |
| [pyright](https://pypi.org/project/pyright/) | 1.1.414 | 2026-09-10 | 13,718,324 | 2 | MIT | 7 releases in 12 months | Type checker (Node-based) |
| [ty](https://pypi.org/project/ty/) | 0.0.103 | 2026-11-13 | 12,132,240 | 0 | unverified (PyPI field empty) | 103 releases in 12 months; version 0.0.x | Type checker, pre-release |

**Other**

| Name | Version | Last release | Weekly downloads | Notes |
| --- | --- | --- | --- | --- |
| [knip](https://www.npmjs.com/package/knip) | 6.45.1 | 2026-11-11 | 30,130,269 | Finds unused exports and files. Useful once, after the per-city split |
| [size-limit](https://www.npmjs.com/package/size-limit) | 14.3.0 | 2026-10-22 | 2,085,608 | Fails a build when a chunk exceeds a budget |
| [lefthook](https://www.npmjs.com/package/lefthook) / [husky](https://www.npmjs.com/package/husky) | 2.2.2 / 9.1.7 | 2026-10-13 / 2024-11-18 | 9,648,112 / 48,778,015 | Git hooks. husky has had no release in 24 months; lefthook has a `postinstall` script |

## Cut

- **jest**: needs ES-module configuration that Vitest and `node:test` don't, and has the weakest
  trend.
- **dprint, oxfmt**: 0.x formatters; the formatter question is whether to format at all (below).
- **looks-same**: no release in 15 months.
- **husky**: no release in 24 months. Hooks are optional anyway; the build is the gate.
- **black**: Ruff's formatter covers it.
- **ty**: 0.0.x. **mypy / pyright**: the pipeline scripts have no annotations; type-checking them
  is a separate project with little return while the data stays committed.
- **@playwright/test, pytest-playwright**: adopting either means rewriting 1,650+ lines of
  working Python harness to get a screenshot assertion that 20 lines of Pillow provide.
- **pixelmatch, odiff-bin**: fine tools, but the harness is Python and Pillow is already there.

Finalists: lint/format **Biome**, **ESLint + typescript-eslint**, **oxlint**; unit tests
**Vitest**, **`node:test`**; Python **Ruff + pytest**; visual regression **Pillow in the existing
harness**.

## Vetting

- **Biome 2.6.7**: [socket.dev](https://socket.dev/npm/package/@biomejs/biome) 100 / 100 / 100 /
  99 / 100. No install script; the binary arrives as a platform-specific optional dependency.
  532 open issues. Lint and format are independently switchable in `biome.json`.
- **ESLint 10.14.0**: [socket.dev](https://socket.dev/npm/package/eslint) 97 / 100 / 100 / 95 /
  100. 30 direct dependencies. With `typescript-eslint` it is the only finalist with mature
  type-aware rules (for example, floating promises), at the cost of running the type checker
  inside the linter.
- **oxlint 1.93.0**: [socket.dev](https://socket.dev/npm/package/oxlint) 99 / 100 / 91 / 96 /
  100. Fastest growth in the table. Unverified: the maturity of its type-aware mode.
- **Vitest 5.1.0**: [socket.dev](https://socket.dev/npm/package/vitest) 98 / 100 / 79 / 98 /
  100. 13 dependencies. Shares Vite's resolution, so tests import the same `.ts` sources with no
  extra config. Has a browser mode through Playwright if we later want tests that need WebGL.
- **`node:test`**: nothing to vet or install. Node 24 runs erasable TypeScript directly. No
  watch UI, coverage is basic.
- **Ruff 0.17.5**: 50 releases in 12 months, no dependencies, 0.x versioning with frequent rule
  additions; pin it.
- **pytest 9.2.0**: the default; 7 small dependencies.

## The formatter question

A formatter with a normal line width (80 to 120) would rewrite at least the 2,167 long lines,
and in practice most of the 15,000, in one commit. That makes `git blame` and any open branch
harder to work with, and it changes the look of code that was written densely on purpose.

Options: (a) lint only, no formatter; (b) formatter on with a very wide line width, which
normalises spacing and quotes but still splits the multi-statement lines; (c) accept the
reformat in a single dedicated commit listed in `.git-blame-ignore-revs`.

This is a style decision for the people who write the code. See Open questions in
[SUMMARY.md](SUMMARY.md). Ruff's formatter on the Python has the same trade-off at a smaller
scale.

## Where each check can run

| Check | Cloudflare build (2 vCPU, 8 GB, 20 min, no GPU) | GitHub Actions hosted runner (no GPU) | Developer machine (GPU) |
| --- | --- | --- | --- |
| Lint, `tsc --noEmit`, unit tests | Yes: put them before the build in the build command. A failure blocks the deploy | Yes | Yes |
| Ruff, pytest | Yes technically (Python 3.14.8 and uv 0.13.4 are in the [image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)), but it adds a Python install to every deploy | Yes, the better place | Yes |
| Committed-data validation (headers, counts) | Yes, as a Node unit test | Yes | Yes |
| `tools/ux` audit and screenshots | No. The image's package list has no browser, and there is no GPU | Unverified. Chromium would fall back to software GL; the perf README says of that case "the numbers are meaningless", and loading Philadelphia that way may be too slow. Jersey Shore (0.87 MB) is the candidate to try | Yes |
| `tools/perf` timings and `ab` | No | No: no GPU, so the numbers mean nothing | Yes, and only here. Results depend on the machine (README, "Noise and pitfalls") |
| Visual regression | No | Unverified, same caveat as the UX audit | Yes |

Workers Builds reports a check on each commit and pull request
([GitHub integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)).
The repository is public (`gh api repos/seanmaye/ShittyCity`, `private: false`).

## Fit check

| Finalist | Files touched | Effort (rough days) | Deploy change |
| --- | --- | --- | --- |
| Biome, lint only | New `biome.json`; fixes or per-rule opt-outs across `js/` | 0.5 to set up with recommended rules; the first run's findings are unverified | Build command gains `biome lint` |
| ESLint + typescript-eslint | `eslint.config.js`; same fixes | 1 | Same, slower |
| oxlint | `.oxlintrc.json` | 0.5 | Same |
| Vitest | `test/*.test.js`; small exports where a pure function is currently module-private (`decode` and `rectInRing` in `city.js` are not exported) | 2 for the modules in the table above | Build command gains `vitest run` |
| `node:test` | The same tests | 2 | Build command gains `node --test` |
| Ruff + pytest | `pyproject.toml` sections; `tools/tests/`; lint fixes | 1 | None (run in CI or locally) |
| Round-trip test | A pytest that writes a tiny PHB1 and terrain file with the real writer functions; a JS test that reads committed fixtures. The Python writers are script bodies today and need the writing step factored into a function | 1 to 2 | None |
| Screenshot diff in `perf.py` and `ux.py` | `perf.py` (`ab --shots` already pairs `A-*.png` with `B-*.png`), `ux.py compare` | 1 | None |
| GitHub Actions workflow | New `.github/workflows/ci.yml` | 0.5 | None |

Performance claims do not apply to this layer. Its job is to make the gates in the refactor plan
cheap to run: `perf.py ab --quick --shots` plus an automatic pixel comparison gives a pass/fail
for "nothing changed visually and nothing got slower" instead of a manual look.

## Recommendation

| Area | Choice | Runner-up |
| --- | --- | --- |
| JS/TS lint | **Biome, linter only** to start | ESLint 10 + typescript-eslint, if we want type-aware rules once the code is TypeScript |
| JS/TS format | **Not yet**: decide the formatter question first | Biome's formatter (same tool, one switch) |
| Type check | `tsc --noEmit` ([layer 2](02-language-types.md)) | |
| Unit tests | **Vitest** | `node:test`, if we stay without a build |
| Python | **Ruff** (lint; format under the same decision) and **pytest** | |
| Visual regression | **Pixel diff with Pillow inside `perf.py ab --shots` and `ux.py compare`** | pixelmatch from a Node script |
| Perf | **Keep `tools/perf` as is, run locally** as the gate for each phase | |
| Where | Lint, types and unit tests in the **Cloudflare build command**; the same plus Ruff and pytest in **GitHub Actions** on pull requests; browser harnesses **local** | |

## Risks

- **A failing check now blocks deploys.** That is the point, but it changes the workflow of
  "every commit deploys". Start with a rule set that passes on day one and tighten it.
- **Build minutes.** Lint, type check and tests add time to roughly 16 builds a day. Unverified
  how much; measure the first builds and keep heavy checks in GitHub Actions if needed.
- **Screenshot diffs are GPU-dependent.** Anti-aliasing and shadow filtering differ between GPUs
  and drivers. Baselines are valid only against the same machine; use a tolerance and compare A
  and B from one `ab` run, never against stored images from another machine.
- **Lint noise on first run** in code written without a linter. Use the per-rule opt-outs
  rather than mass rewrites during the migration.

## Migration steps

1. Add `biome.json` (formatter disabled, recommended lint rules). Fix or disable until
   `biome lint` passes.
2. Add Vitest and the first tests: `pairs`, `decode` on the committed
   `data/jsh/city_buildings.bin.gz` (45 bytes) and on `data/phl`'s header,
   `dayOfYear`/`dateOfDay`, `septaLines`, `rectInRing`.
3. `npm run check` = `biome lint && tsc --noEmit && vitest run`. Make the Cloudflare build
   command `npm run check && npm run build`.
4. Ruff and pytest sections in `pyproject.toml`; tests for `geom.py` and `citylimits.py`; the
   round-trip test.
5. `.github/workflows/ci.yml`: `npm ci && npm run check`, `uv sync --group dev && uv run ruff check && uv run pytest`.
6. Add the Pillow pixel diff to `perf.py ab --shots` (report the changed-pixel share per
   scenario, masking nothing at first; trains move, so expect a small non-zero floor) and to
   `ux.py compare`.
7. Decide the formatter question; if yes, one commit, recorded in `.git-blame-ignore-revs`.
