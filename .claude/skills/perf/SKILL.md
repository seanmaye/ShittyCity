---
name: perf
description: Measure, find and prove runtime performance gains in the three.js city model (load time, frame time, GPU cost, draw calls, shadow pass, hot JS paths, per-frame allocations) with the tools/perf harness, which drives the real app in GPU-enabled Chromium. Use when asked to profile, speed up or optimize the app, find why it's slow or janky, reduce load time, or check that a change didn't make it slower.
---

# Performance work on the Schuylkill model

The harness is `tools/perf/perf.py` (setup: `uv sync --group qa`). Read `tools/perf/README.md` before your first run; it
explains every metric and pitfall. The loop:

1. **Baseline.** Run this and read the printed summary (also saved as `summary.md` in the
   output folder):

   ```bash
   uv run python -I tools/perf/perf.py run --quick
   ```

   Run every scenario when the task is broad; `perf.py list` names them. Note each
   scenario's **bound** (GPU / CPU / other) before deciding what to optimize.
2. **Attribute.** For the slow scenarios:

   ```bash
   uv run python -I tools/perf/perf.py run -s <scenarios> --census --ablate
   ```

   The ablation table ranks what costs the frame (each builder hidden, the shadow pass,
   resolution, labels). The census turns the biggest rows into `file:line` add() sites with
   draw and triangle counts. For CPU-bound scenarios, read the hot path, then
   `perf.py hot <out>/<scenario>.cpuprofile --focus <function>`.
3. **Change the code** in `js/` (the sources, not `schuylkill-monorail.html`). Keep the look:
   view the scenario screenshots (`<out>/<scenario>.png`) before and after.
4. **Prove it** with A/B against the last commit (leave your change uncommitted). Two
   separate runs drift by 20–50% on this kind of laptop GPU, so don't compare them:

   ```bash
   uv run python -I tools/perf/perf.py ab -s <scenarios>
   ```

   Claim only rows marked `better` (paired t-test, 99%) or `likely better` (95%), and say
   which. `not significant` means noise. Then run `ab --quick` to check nothing else got
   worse. Never measure while another copy of the app is open (the browser pane, a second
   tab): the second copy renders 12–50% slower.
   For several changes stacked in one working tree, freeze each stage with
   `perf.py snap <name>` (and the starting point with `perf.py snap head --ref HEAD`), then
   `perf.py ab --a-snap <before> --b-snap <after>` measures one change at a time, and can run
   while you keep editing. Add `--shots` to save both sides' screenshots (`A-<scenario>.png`,
   `B-<scenario>.png`): they should differ only where trains moved.
5. Report the numbers with the scenario names and the GPU from the report header.

Rules of thumb for this codebase:

- **GPU-bound frames inflate main-thread time.** Large native self time in
  `uniformMatrix4fv` / `drawElements` / `bindVertexArray` is the main thread waiting on the
  GPU process. Reduce GPU work (triangles, draws, the shadow pass), not those calls.
- The renderer uses a 4096² PCF soft shadow map that re-renders every frame, a logarithmic
  depth buffer, MSAA, and clipping planes on every material (the Market St cut-away).
  Weigh changes to those against how the scene looks.
- `js/scene/city.js` already tiles and LODs the outer city (1 km tiles; full boxes within
  5 km, roofs farther out, hidden past the fog). Measure before reworking it.
- A change that only helps the load (data format, builders, shader count) shows up in the
  `load.*` rows and the first frame, not in frame time.
- Don't commit unless asked. Never commit `tools/perf/out/`.
