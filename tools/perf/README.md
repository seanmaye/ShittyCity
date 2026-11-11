# Performance harness

`perf.py` drives the real app in Chromium with the GPU on, puts it in a set of scenarios
(camera views, rides, time of day), and measures them. For each scenario you get:

- frame time, frame rate and hitches;
- JS time per frame, split into `renderer.render()` and everything else;
- GPU time per frame (WebGL timer queries);
- draw calls and triangles;
- main-thread style and layout time;
- a CPU profile (hot functions and a top-down hot path, mapped to `file:line`);
- an allocation profile (who creates garbage each frame);
- a screenshot.

The load is broken down by build step, plus the first frame (shader compiles). Optional modes
attribute every draw call to the code that added the object (`--census`) and measure what each
part of the scene costs by switching it off (`--ablate`). `ab` compares your working tree
against a commit in interleaved runs, so you can tell a real improvement from noise.

## Setup

Python 3.10+ and Playwright (no project-level installs; the app itself has no build step):

```bash
pip install playwright
```

```bash
python -m playwright install chromium
```

three.js and the font are fetched from their CDNs on the first run and cached in
`tools/perf/.cache/`, so later runs need no network and CDN latency stays out of the
load numbers. Output goes to `tools/perf/out/` (git-ignored).

## Commands

```bash
python -I tools/perf/perf.py list
```

```bash
python -I tools/perf/perf.py run --quick
```

```bash
python -I tools/perf/perf.py run -s overview-dusk,whole-city --census --ablate
```

```bash
python -I tools/perf/perf.py ab --quick --rounds 3
```

```bash
python -I tools/perf/perf.py hot tools/perf/out/<run>/overview-dusk.cpuprofile --focus frame
```

```bash
python -I tools/perf/perf.py compare tools/perf/out/<a> tools/perf/out/<b>
```

| command | what it does | time |
|---|---|---|
| `run` | load + every scenario (or `-s a,b` / `--quick`): timings, CPU and allocation profiles, screenshots | ~15 s per scenario + ~10 s load |
| `run --census` | adds a one-frame draw-call census per scenario, grouped by the code that added each object | + a few s |
| `run --ablate` | adds the cost of each part: shadow pass, half resolution, labels, and each big builder hidden | + ~50 s per scenario |
| `ab` | A/B: `--base` commit (default HEAD) vs your working tree, alternating fresh browsers, paired t-test per metric; timings only | (~8 s + 8 s per scenario) × (2 × rounds + 1); `-s overview-dusk` at 5 rounds ≈ 3 min |
| `ab --shots` | also saves a screenshot of every scenario for both sides (`A-<name>.png`, `B-<name>.png`) in the last round, to diff for visual changes | + a moment |
| `snap NAME` | copies the sources as they are now (`index.html`, `css/`, `js/`) to `out/.snap/NAME`; `--ref REF` copies a commit instead. `ab --a-snap X --b-snap Y` then compares two snapshots, so stacked changes can be measured one at a time without committing, while you keep editing | instant |
| `hot` | re-analyses a saved `.cpuprofile` / `.heapprofile`; `--focus fn` limits it to one function's subtree, `--total` ranks by inclusive time | instant |
| `compare` | diffs two `report.json` files from separate `run`s (ideally `--repeat 3` each); weaker than `ab` because of drift between runs | instant |

Useful `run` options: `--repeat N` (fresh browser per run; the report keeps medians and
ranges), `--no-profile` (timings only), `--seconds`, `--settle`, `--size 1920x1080`,
`--dpr 2` (a retina screen: the app caps the pixel ratio at 2), `--headed` (watch it),
`--channel chrome` (an installed browser instead of Playwright's Chromium).

## Output (`tools/perf/out/<time>[-label]/`)

| file | what | open it with |
|---|---|---|
| `summary.md` | the readable report (also printed) | any editor |
| `report.json` | every number, `metrics` (flat, median/min/max over runs) is what `compare` uses | |
| `load.cpuprofile`, `<scenario>.cpuprofile` | sampled CPU profiles | Chrome DevTools → Performance → Load profile, or https://www.speedscope.app, or `perf.py hot` |
| `<scenario>.heapprofile` | sampled allocations, including objects already collected | DevTools → Memory → Load, or `perf.py hot` |
| `<scenario>.frames.json` | per-frame `dt`, `work`, `render`, `gpu`, `calls`, `tris` | for your own plots |
| `<scenario>.census.json` | every draw-call group of one frame (`--census`) | |
| `<scenario>.png` | what the scenario looked like: check it still looks right after an optimization | |

## Reading a report

The scenario table's **bound** column says what limits the frame rate. That decides where to
look:

- **GPU**: the GPU's time per frame (timer queries around `render()`) is at least 75% of
  the frame interval. On this kind of scene the usual causes are triangles, draw calls,
  the shadow pass and overdraw. **Main-thread time also goes up when the GPU is the
  limit.** WebGL calls block once the command buffer to the GPU process is full, so the CPU
  profile shows large *self* time in native calls like `uniformMatrix4fv`, `drawElements` or
  `bindVertexArray`. That time is waiting, not JS work: fix the GPU load, not those calls.
  Use the ablation table to see which part of the scene costs the GPU time, and the census
  to see where that part's draws and triangles come from (`file:line`).
- **CPU**: main-thread work per frame is at least 75% of the frame interval and the GPU
  isn't. Look at the hot path and the self-time table: JS in `frame()` (`js/scene/index.js`)
  and the per-module `update()` functions, three.js scene traversal (`projectObject`,
  `updateMatrixWorld`), or style and layout from the floating labels (`js/ui.js` placeTags;
  see the style/layout ms per second).
- **other**: neither is saturated. Possibly the GPU process, the compositor, or a frame cap.
  Try `--headed`, and check the GPU line at the top of the report.

Other columns: **JS** = all requestAnimationFrame callbacks; **render CPU** = time inside
`renderer.render()`; **other JS** = JS minus render (scene updates, `city.update`'s tile
culling, labels); **main** = every main-thread task per frame (JS + style + layout + GC);
**hitches** = frames over 50 ms or 2.5× the median; **alloc MB/s** = garbage created
per second (steady allocation in the frame loop means GC pauses; aim for ~0 in `frame()`).

**Census.** Every draw call of one frame, main pass and shadow pass, grouped by
**builder** (the outermost `build*` / `create*` function under `buildScene`, so one per
scene module) and by **add() site** (the app `file:line` that added the object). Rows
with many draws and few triangles are candidates for merging geometry or instancing. Rows
with more shadow than main triangles are objects outside the view that still cast
shadows. The sun's shadow camera covers 5.8 km × 5.8 km around the focus.

**Ablation.** Each row switches one thing off for ~2.5 s and gives the change in frame,
JS, render and GPU time. Builders are hidden through render layers, so the app's own
per-frame visibility toggles can't undo it, and lights stay on so no shader recompiles.
`no shadow pass` stops re-rendering the shadow map (shadows freeze but stay drawn).
`half resolution` halves the pixel ratio: a big GPU drop means fragment-bound (shading,
overdraw, MSAA), little drop means vertex- or draw-bound. Ablation doesn't tell you how
to make a part cheaper, only which part to work on. The baseline is measured before and
after; its drift is printed, so treat smaller deltas as noise.

Rows starting `diag:` are diagnostics, not candidates: they change the picture, and only say
where the GPU time goes. `1-pixel scissor` leaves the geometry cost (every vertex and draw
still runs, almost no pixels are shaded); `no shadow lookups` is the cost of the soft-shadow
filter in the main pass; `off-screen, MSAA x4` against `off-screen, no MSAA` is roughly what
multisampling costs; `no log depth` swaps the logarithmic depth buffer for a plain one. They
recompile shaders, so a builder row measured right after one can be off: rerun if it matters.

**Load.** Steps come from the `#status` messages (`js/scene/index.js`), so a step can cover
several builders; the load CPU profile's builder table gives each one's inclusive CPU time.
"First frame" is the first `render()`: three.js compiles every shader program and uploads
every buffer then. In the top self-time list, `WebGLProgram` is shader compile and link.

## Workflow: finding and proving a gain

1. Baseline: `run --quick` (or the scenarios you care about). Read `summary.md`: which
   scenarios are slow, and are they GPU- or CPU-bound?
2. Attribute: `run -s <slow scenario> --census --ablate`. Pick the biggest ablation delta,
   then its census rows (`file:line`). For CPU-bound scenarios, use the hot path and
   `perf.py hot <profile> --focus <fn>`.
3. Change the code. Keep the look: compare the scenario screenshots before and after.
4. Prove it: `ab -s <scenarios>`. It checks out `--base` (default HEAD, so leave your change
   uncommitted) into a temporary git worktree and serves it next to your working tree. Each
   round loads A and B in fresh browsers, in alternating order, after one discarded warm-up
   load, and runs every scenario. Verdicts: `better` / `worse` = paired t-test at 99% and at
   least `--threshold` (3%); `likely` = 95%; `not significant` = it moved, but no more than
   the noise. Then check nothing else got worse: `ab --quick`.
5. If the change affects load (data, builders, materials), read the `load.*` rows too. They
   are noisier (±10–17% between loads), so a load gain needs to be big or need more rounds.

How sensitive `ab` is (measured on the Intel iGPU this was built on, 5 rounds,
`overview-dusk`): with identical code on both sides, frame metrics moved ±3–9% and load
metrics ±10–17%, and every verdict came out "not significant". A real change, the shadow
map at 2048² instead of 4096², came out "better": GPU time −4.6% (−1.06 ms, t = −8.3, B
better in 5/5 rounds). Frame time was −6.5% (5/5) at t = −3.3, which is "likely better".
Gains of about 1 ms are detectable; for smaller ones, raise `--rounds`.

## Noise and pitfalls

- **Numbers drift between runs** on laptops: GPU clocks, heat, power plans and other apps.
  On the integrated GPU this was built on, the same view measured 42.6, 34.2 and 27.2 ms
  per frame in three runs a few minutes apart. Use `ab` (alternating, paired) for decisions,
  not two separate `run`s. Plug in, and close other GPU-heavy windows.
- **Never measure with two copies of the app open**, including the app in the browser pane
  or another tab. On this GPU the copy loaded second renders 12% slower in the same browser
  and ~50% slower in a second browser, even when idle copies are paused. Probably GPU memory
  pressure: each copy holds ~230 MB of geometry plus a 4096² shadow map. That's why `ab`
  never runs A and B at the same time.
- **Frames are uncapped** (`--disable-gpu-vsync --disable-frame-rate-limit`), so frame
  time is the real cost, not a multiple of 16.7 ms. Real users get vsync, so 10 ms and 15 ms
  both look like 60 fps to them.
- **Headless uses the real GPU** (`--use-angle=d3d11` on Windows, `metal` on macOS,
  `vulkan` on Linux; see `gpu_args()`). The report prints the GPU; if it says SwiftShader
  or llvmpipe, the numbers are meaningless.
- **Deterministic scenes**: `probe.js` seeds `Math.random` and pins the calendar date
  (the sun's path depends on it), so trees, train start positions and lighting are the same
  every run. The clock still runs: trains move. three.js draws four random numbers for each
  object's uuid; `perf.py` gives those their own stream, so a change that creates one object
  more or fewer doesn't reshuffle the trees, and screenshots stay comparable across code
  changes (two `ab --shots` images of the same view should differ only where trains moved).
- **A frame loop that dies shows up as a timeout**, not an error: an exception inside
  `frame()` stops the `requestAnimationFrame` chain, and `perf.py` then waits for frames that
  never come. If a run hangs after a code change, load the page by hand and read the console.
- **`--census` / `--ablate` patch three.js** (a hook on `Object3D.add` that captures a
  stack per call), which slows the load. Don't use load times from those runs.
- **Moving scenarios** (`fly-market`, the rides) restart before each ablation measurement
  so every measurement sees the same stretch.
- The probe wraps `requestAnimationFrame` and `renderer.render`; its frames show as
  `perf-probe.js` in profiles. The overhead is negligible.

## Driving it by hand

- **Chrome DevTools**: open the saved `.cpuprofile` in the Performance panel for a flame
  chart, or `.heapprofile` in the Memory panel. For a live look, run
  `python -m http.server 8765`, open http://localhost:8765, then use the Performance
  panel's record button. Turn on "Enable advanced rendering instrumentation" for GPU detail.
- **The probe on any page**: paste `tools/perf/probe.js` into the console of a running
  page (the browser pane, Chrome DevTools MCP's `evaluate_script`, …), then
  `__perf.attach(window.__city)`, `await __perf.record(3000)`,
  `await __perf.census()` or `__perf.inventory()`. Without the init-script route,
  attribution and load timings aren't available.
- **Chrome DevTools MCP** (if your agent has it): `performance_start_trace` /
  `performance_analyze_insight` for a full trace with Chrome's own insights, and
  `take_heapsnapshot` for retained memory. Its browser runs with vsync and default flags,
  so use it for exploring, and `perf.py` for numbers.
- **`window.__city`** (the object `buildScene` returns in `js/scene/index.js`) drives
  the app: `flyTo(id)`, `boardLine(id)`, `setTime(h)`, `setTransitMap(on)`, `setCut(id)`,
  `setFly(f, s, u)`, plus `renderer`, `scene`, `camera`, `controls`.

## Extending

- **A scenario**: add a dict to `SCENARIOS` in `scenarios.py`. `setup` is JS with `api` and
  `P` in scope. Mark it `"moving": True` if the camera or view keeps changing.
- **An ablation toggle**: add an entry to `TOGGLES` in `probe.js`: a function that switches
  something off and returns a function that switches it back on.
- **A metric in `compare` / `ab`**: add it in `key_metrics()` in `perf.py`.
