"""Scenarios for tools/perf/perf.py: camera positions and app states to measure.

Each scenario's `setup` is the body of an async JS function run in the page with
`api` (window.__schuylkill, the object buildScene returns in js/scene/index.js) and
`P` (window.__perf, tools/perf/probe.js) in scope. RESET runs before every setup.
The harness then waits `settle` ms (camera flights take 2.2 s; first views of new
materials compile shaders) before it measures.

To add one, append a dict here; keep names short and kebab-case. QUICK is the subset
`perf.py run --quick` uses.
"""

RESET = """
  api.leaveCar(true); api.setRiding(false, true); api.setFly(0, 0, 0);
  if (api.getCut()) api.setCut(false);
  if (api.getTransitMap()) api.setTransitMap(false);
  api.controls.autoRotate = false;
"""

# a low flight east along Market Street, from University City over the Schuylkill into
# Center City: free flight moves at ~0.9x the camera-to-target distance per second
FLY_MARKET = """
  api.camera.position.set(-2900, 120, 380); api.controls.target.set(-2600, 30, 380); api.controls.update();
  api.setTime(api.sunset - .35); api.setFly(1, 0, 0);
"""

SCENARIOS = [
    {"name": "overview-dusk", "desc": "the opening view at dusk (lit windows, long shadows)",
     "setup": "api.flyTo('home'); api.setTime(api.sunset - .35);"},
    {"name": "overview-noon", "desc": "the opening view at noon (no night lights)",
     "setup": "api.flyTo('home'); api.setTime(12.5);"},
    {"name": "overview-night", "desc": "the opening view at 10 PM (stars, every night light on)",
     "setup": "api.flyTo('home'); api.setTime(22);"},
    {"name": "orbit", "desc": "the opening view, camera orbiting (what dragging around costs)",
     "setup": "api.flyTo('home'); api.setTime(api.sunset - .35); await P.sleep(2400); api.controls.autoRotate = true; api.controls.autoRotateSpeed = 6;"},
    {"name": "whole-city", "desc": "'Whole city' view from 26 km up: every tile in view, roofs only",
     "setup": "api.flyTo('city'); api.setTime(api.sunset - .35);"},
    {"name": "transit-map", "desc": "'Whole city' with 'Show transit lines' on",
     "setup": "api.flyTo('city'); api.setTime(api.sunset - .35); api.setTransitMap(true);"},
    {"name": "market-cut", "desc": "the Market Street subway cut-away",
     "setup": "api.flyTo(api.views.find(v => v.cut).id); api.setTime(api.sunset - .35);"},
    {"name": "street-level", "desc": "the low Independence Hall view (near tiles: full boxes and windows)",
     "setup": "api.flyTo('indhall'); api.setTime(api.sunset - .35);"},
    {"name": "fly-market", "desc": "flying low along Market St into Center City (tiles switching as you go)",
     "setup": FLY_MARKET, "settle": 1500, "moving": True},
    {"name": "ride-L", "desc": "riding the L, first person inside an M-4 car",
     "setup": "api.setTime(api.sunset - .35); api.boardLine('m:L');", "moving": True},
    {"name": "ride-regional", "desc": "riding the Paoli/Thorndale Regional Rail line, first person",
     "setup": "api.setTime(12.5); api.boardLine('m:PAO');", "moving": True},
    {"name": "ride-monorail", "desc": "riding the riverfront loop monorail, first person",
     "setup": "api.setTime(api.sunset - .35); api.boardLine('loop');", "moving": True},
]

QUICK = ["overview-dusk", "whole-city", "fly-market", "ride-L"]
