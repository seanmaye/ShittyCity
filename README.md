# City models

Interactive three.js models of whole cities, built from real map data, with proposals of our own. There are two cities so far: Philadelphia and New York. They run on one shared engine and are delivered as one shareable HTML file. The page opens on a menu where you pick a city. "Change city" returns to that menu, and `?city=phl` or `?city=nyc` links straight to a city.

| City | What's in it | More |
| --- | --- | --- |
| **Philadelphia** (`phl`) | Philadelphia out to the city limits; every rail transit line (SEPTA Metro, Regional Rail, PATCO, NJ Transit); the 1953 streetcars; stadiums, Independence Hall and the Delaware bridges. Proposals: a Schuylkill riverfront monorail loop, expressway sports parks, a rail yard park and a bowl, and Walnut Street as a brick promenade busy with people you can see through the eyes of, and a Chinatown night market whose arcade stall has games you can play. Chinatown is modelled in detail, Friendship Gate and all. Cut-away: under Market Street. | [docs/PHL.md](docs/PHL.md) |
| **New York** (`nyc`) | Manhattan, Brooklyn and Queens; the four East River bridges; Manhattan's towers, the Wonder Wheel, the Unisphere and Citi Field; 11 subway lines. Proposal: an East River monorail loop. Cut-away: under Times Square. | [docs/NYC.md](docs/NYC.md) |

## In every city

- **Ride inside any train.** Pick a line under "Ride a line", or click any train car (or monorail car) to board it. Every car has a walkable cabin. Drag to look around, use W A S D to walk, and press Esc to get off. While you ride, a line diagram shows every stop, the next one and where the train is.
- **Fly around.**
  - Drag to orbit and scroll to zoom.
  - W A S D (or the arrow keys) fly, Space rises and Shift sinks.
  - Right-click the view for creative-mode flight: the mouse looks around and scroll sets the speed.
- **Cut away the ground** along a subway line to see the tunnels, platforms and trains underneath.
- **Show transit lines** highlights every line in its colour, with a legend.
- **Buildings** have day and night facades in six styles: rowhouse terraces, offices, ribbon windows, glass and stone. Roofs use real roofing colours. Rooftop plant and aviation lights sit on tall buildings, and office lights go off through the night.
- **A 24-hour time slider** sets the sun to its real position over the city for today's date, from noon sun to starlit night.
- **A speed slider** lets the day run by itself: frozen at the left end, real time near the start, up to a whole day in 4 seconds at the right.
- **A time-of-year slider** changes the season: snow on the ground and roofs in winter (streets ploughed), blossom and flower beds in spring, summer green, autumn colour and then bare branches. The sun's path follows the date.
- **Skyline lights** colour the cities' crowns and bridges with preset schemes or any colour you pick.
- **A minimap** in the top right shows where you are. Click it to fly there.
- **Labels and "Go to" views** name the landmarks, stations and neighbourhoods.
- **The panel folds** down to its title with the arrow in its corner.

## Run it

The source page loads its data with `fetch`, so it needs a local web server. Opening `index.html` directly from disk won't work.

```bash
python -m http.server 8765
```

Then open <http://localhost:8765>.

To measure how fast it loads and renders (frame and GPU time per scenario, hot code paths,
draw calls by source line, before/after comparisons), see [tools/perf/README.md](tools/perf/README.md):

```bash
python -I tools/perf/perf.py run --quick
```

## Sharing as one file

```bash
python -I tools/bundle.py
```

This rebuilds `city-models.html` at the repo root (about 28 MB), the file you send people. It has the CSS, every script and every city's data inline, so it opens with a double-click and needs no server. three.js and the font still load from their CDNs, so viewers need an internet connection.

**Workflow.** Edit the sources (`js/`, `css/`, `data/`, `index.html`) and check them with the local server. Then run the bundler and commit the sources and the rebuilt HTML together.

**If someone edited the HTML directly** (as the guide inside it allows), bring their changes back into the sources before editing anything else:

```bash
python -I tools/unbundle.py --check
```

```bash
python -I tools/unbundle.py
```

`--check` unpacks into a temporary folder, rebuilds the bundle, and confirms nothing would be lost. The data blocks may come out in a different order, but their contents must match. The second command then overwrites the sources from the HTML.

The bundle starts with an editing guide ([docs/EDITING.md](docs/EDITING.md)) as an HTML comment. It lets someone, or another Claude, change a city with only the HTML file. It covers:
- the file layout
- each city's coordinates
- every data schema
- a Python helper for editing the embedded data
- recipes

## Layout

Shared code sits at the top level. Each city has a folder of the same name in `data/`, `js/scene/` and `tools/`.

```
city-models.html      the shareable single-file build (generated: run tools/bundle.py)
index.html            page shell, start menu, HUD markup, import map for three.js 0.128
css/style.css         HUD, menu and label styles
js/main.js            entry point: city menu -> load data -> build scene -> start UI
js/cities.js          every city's settings (projection, data files, home view, sun, page text)
js/data.js            data loader + lat/lon -> scene projection
js/ui.js              buttons, hint text, floating labels, panel fold, skyline lights
js/minimap.js         the top-right map
js/ridebar.js         the line diagram shown while riding
js/scene/
  index.js            assembles the scene: each city's parts, time of day, rides, views
  core.js             renderer, camera, orbit controls, lights
  sky.js              the 24-hour clock: real sun position, sky colours, stars, night lights
  buildings.js        the core's footprints, extruded and tiled
  city.js             the rest of the city: tiled instanced buildings, streets, parks, water
  ground.js           the core's ground, parks, streets, trails, rail, bridges
  river.js            water polygons, bulkheads, dams, an optional river centreline
  nature.js           trees (seasonal), rowing shells
  season.js           time of year: snow, foliage, blossom, flower beds, grass
  subway.js           every rail line: tracks, tunnels, Els, platforms, trains, rides,
                      cut-aways and the walkable cabins of every car
  transitmap.js       "Show transit lines" highlight
  materials.js        shared materials, lit-window textures, skyline lights
  geometry.js         polygon / ribbon / footprint-extrusion builders
  phl/                Philadelphia's hand-built parts: landmarks, citymarks (stadiums, halls,
                      bridges), people and frisbee, the riverfront monorail, the river boats,
                      the sports parks,
                      the rail yard park, the Walnut St promenade with its pedestrians and their
                      profiles, the 1953 streetcars
  nyc/                New York's hand-built parts: landmarks (Manhattan towers), bridges (East
                      River), boroughmarks (Wonder Wheel, Unisphere, Citi Field), the monorail
data/
  phl/                Philadelphia's data (generated by tools/phl/; don't edit by hand)
  nyc/                New York's data (generated by tools/nyc/; don't edit by hand)
tools/
  bundle.py           packs everything into city-models.html
  unbundle.py         the reverse: unpacks city-models.html into the sources
  phl/                Philadelphia's data tools (see docs/PHL.md and tools/phl/README.md)
  nyc/                New York's data tools (see docs/NYC.md)
  perf/               runtime performance harness: frame/GPU/load timings, profiles,
                      draw-call attribution, A/B checks (see tools/perf/README.md)
```

All cities share one set of data formats, which [docs/EDITING.md](docs/EDITING.md) documents. Each city's own document says where its data comes from and how to rebuild it.

## Adding a city

1. Make its data in `data/<id>/` in the shared formats, with the tools that make it in `tools/<id>/`.
2. Add its entry to `CITIES` in `js/cities.js`. The menu shows it automatically.
3. Put anything hand-built in `js/scene/<id>/`, and call it from `js/scene/index.js` when that city's data is loaded.
4. Write `docs/<ID>.md`, and run `python -I tools/bundle.py`.
