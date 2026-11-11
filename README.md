# Schuylkill riverfront and monorail

A three.js model of Philadelphia out to the city limits, with every rail transit line and a
proposed monorail loop along both banks of the Schuylkill. Buildings, rivers, parks, streets
and transit come from real map data.

- **Center City, University City and Fairmount** are the original detailed area, with the
  hand-made proposals: styled landmarks, the monorail loop, the expressway sports parks, the
  rail yard park and the Market Street subway cut-away.
- **The rest of the city** (about 500k more buildings, streets, parks, creeks and park trees)
  is drawn around it without changing anything in the original area.
- **Every rail transit line** is modelled: the L, the B1-B3 Broad Street Line, the G1 and
  T1-T5 trolleys, all 13 Regional Rail lines, PATCO and NJ Transit's Atlantic City Line.
  "Show transit lines" highlights them all.
- **Ride inside any train.** Pick a line under "Ride a line", or click any train car (or
  monorail car) to board it. Every car has a walkable cabin (M-4, B-IV, Kawasaki LRV, PCC,
  Silverliner IV, PATCO, monorail): drag to look, W A S D to walk, Esc to get off.
- **Fly around** with W A S D (or the arrow keys), Space to rise and Shift to sink.
- **Citywide landmarks** are modelled on their real outlines: Lincoln Financial Field,
  Citizens Bank Park, Xfinity Mobile Arena, Independence Hall, Memorial Hall, and the Ben
  Franklin and Walt Whitman bridges.
- **A 24-hour time slider** sets the sun to its real position over Philadelphia for today's
  date, from noon sun to starlit night.

## Run it

The page loads its data with `fetch`, so it needs a local web server (opening
`index.html` directly from disk won't work):

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

This rebuilds `schuylkill-monorail.html` at the repo root (about 16 MB), the file you send
people. It has the CSS, every script and all the map data inline, so it opens with a
double-click; no server needed. three.js and the font still load from their CDNs, so
viewers need an internet connection.

**Workflow.** Edit the sources (`js/`, `css/`, `data/`, `index.html`), check them with the
local server, then run the bundler and commit the sources and the rebuilt HTML together.

**If someone edited the HTML directly** (as the guide inside it allows), bring their
changes back into the sources before editing anything else:

```bash
python -I tools/unbundle.py --check
```

```bash
python -I tools/unbundle.py
```

`--check` unpacks into a temporary folder, re-bundles, and confirms nothing would be
lost. The order of the data blocks may differ; their contents may not. The second
command then overwrites the sources from the HTML.

The bundle starts with an editing guide ([docs/EDITING.md](docs/EDITING.md)) as an HTML comment.
It lets someone, or another Claude, change the city with only the HTML file: it covers
the file layout, coordinates, every data schema, a Python helper for editing the
embedded data, and recipes.

## Layout

```
schuylkill-monorail.html  the shareable single-file build (generated: run tools/bundle.py)
index.html            page shell, HUD markup, import map for three.js 0.128
css/style.css         HUD and label styles
js/main.js            entry point: load data -> build scene -> start UI
js/data.js            data loader + lat/lon -> scene projection
js/ui.js              buttons, hint text, floating labels
js/scene/
  index.js            assembles the scene; time of day, ride mode, transit merge, views
  core.js             renderer, camera, orbit controls, lights
  sky.js              the 24-hour clock: real sun position, sky colours, stars, night lights
  city.js             the rest of the city: tiled instanced buildings, streets, parks, water
  transitmap.js       "Show transit lines" highlight
  materials.js        shared materials, lit-window textures
  geometry.js         polygon / ribbon / footprint-extrusion builders
  river.js            water polygons, bulkheads, dam, river centreline
  ground.js           paved extent, parks, streets, trails, rail, bridges
  buildings.js        45k real footprints, extruded and tiled
  landmarks.js        styled towers, City Hall, 30th St, Art Museum, ESP, Boathouse Row
  citymarks.js        citywide landmarks: stadiums, Independence Hall, Memorial Hall, bridges
  monorail.js         guideway, piers, stations, train
  nature.js           trees, rowing shells
  sports.js           proposal: expressway sports parks + shuttle monorails
  yardpark.js         proposal: rail yard deck, park and the Railyard Bowl
  subway.js           every rail line: tracks, tunnels, Els, platforms, trains, line rides,
                      the Market St cut-away and the walkable cabins of every car
data/                 generated (don't edit by hand):
                      *.json by tools/build_data.py, except transit.json (the L and T1-T5,
                      by tools/build_transit.py: see tools/README.md); city.json.gz and city_buildings.bin.gz by
                      tools/build_city.py; metro.json.gz by tools/build_metro.py;
                      city_landmarks.json by tools/build_landmarks.py
tools/
  fetch_data.py       downloads the raw sources
  build_data.py       turns them into data/*.json
  geom.py             small geometry helpers (no dependencies)
  proposal.py         lays out the expressway sports parks (writes data/sports.json)
  cap.py              shapes the rail yard deck and sites the bowl (writes data/yardpark.json)
  fetch_city.py       downloads the citywide building footprints and the city boundary
  extract_osm.py      cuts the city's OSM data out of the Geofabrik Pennsylvania extract
  citylimits.py       the city boundary and a fast point-inside test
  build_city.py       the rest of the city (writes data/city*.gz)
  build_metro.py      the citywide rail network (writes data/metro.json.gz)
  build_transit.py    the original L and trolley data (data-transit; see tools/README.md)
  extract_landmarks.py  stadium, hall and pitch outlines from the Pennsylvania extract
  extract_bridges.py  the Delaware bridge decks and Memorial Hall (merged into the same file)
  build_landmarks.py  fits the landmark models (writes data/city_landmarks.json)
  bundle.py           packs everything into schuylkill-monorail.html
  unbundle.py         the reverse: unpacks schuylkill-monorail.html into the sources
  perf/               runtime performance harness: frame/GPU/load timings, profiles,
                      draw-call attribution, A/B checks (see tools/perf/README.md)
```

## Data sources

| What | Source |
| --- | --- |
| Building footprints and heights | City of Philadelphia, *LI Building Footprints* (OpenDataPhilly). Heights are the LiDAR `approx_hgt` field. |
| 30th Street Station, the Murano | OpenStreetMap outlines (both are missing from the city layer) |
| River, shoreline, Fairmount Dam | OpenStreetMap water polygons and `waterway` lines |
| Parks, grass, woods | OpenStreetMap `leisure` / `landuse` / `natural` areas |
| Streets, trails, rail, bridges | OpenStreetMap `highway` / `railway` ways |
| Rail transit: tracks, stations, platforms, entrances | OpenStreetMap route relations; tunnel depths and El heights are estimates |
| City limits | OpenStreetMap relation 188022 |

Map data © OpenStreetMap contributors, ODbL. Building data © City of Philadelphia.

## Rebuilding the data

```bash
python tools/fetch_data.py tools/raw
python -I tools/build_data.py tools/raw data
```

`fetch_data.py` retries across Overpass mirrors because the public servers are often busy.
The raw downloads are about 45 MB (kept out of git); the built `data/` folder is about 5.5 MB.
`build_data.py` does not touch `data/transit.json` or the citywide files.

### The rest of the city and the transit network

The OpenStreetMap data comes from Geofabrik's Pennsylvania extract (about 350 MB), read with
pyosmium in a local virtual environment. That's much faster and more reliable than querying
Overpass for an area this size.

```bash
python -I tools/fetch_city.py
```

```bash
curl -L -o tools/raw/osm/pennsylvania.osm.pbf https://download.geofabrik.de/north-america/us/pennsylvania-latest.osm.pbf
```

```bash
python -m venv tools/.venv && tools/.venv/Scripts/pip install osmium
```

```bash
tools/.venv/Scripts/python -I tools/extract_osm.py
```

```bash
tools/.venv/Scripts/python -I tools/extract_landmarks.py
```

```bash
tools/.venv/Scripts/python -I tools/extract_bridges.py
```

```bash
python -I tools/build_landmarks.py
```

```bash
python -I tools/build_city.py
```

```bash
python -I tools/build_metro.py
```

`fetch_city.py` downloads the 546k building footprints (about 210 MB, resumable) and the city
boundary. `build_city.py` keeps everything outside the original extent and inside the city
limits, so the original area's data is never touched; it takes about 5 minutes. Run
`build_landmarks.py` first: `build_city.py` leaves out the footprints inside the landmark
outlines and the bridge decks, and `build_metro.py` lays PATCO on the Ben Franklin deck.
`build_metro.py` builds every line's track, stations and out-and-back route. It reuses the
original Center City L and trolley geometry exactly, and blends the new track into it at the
edge of the original area.

## How the real data is used

- **Buildings.** Every footprint in the area is extruded to its LiDAR height. Signature
  towers keep their hand-modelled crowns (Liberty Place spires, Comcast Center taper, BNY
  Mellon and Commerce Square pyramids, Three Logan's steps, PSFS sign). Each crown is centred
  on the real footprint, rotated to it, and sized to the tower's floor plate. The rest of
  that lot stays as a low base. Flat-topped towers (FMC, Cira, IBX, the Laurel and others)
  use their real footprint and height in their original colours.
- **River.** The water is the OSM polygon. A 700-point centreline is the shortest path
  through OSM's river-line network (OSM splits the river around the dam and the Water
  Works). It is re-centred between the real banks, with the bank-to-bank width measured at
  each point. The monorail, stations and rowing shells follow this centreline.
- **Monorail.** The guideway is set back 58 m (east) and 65 m (west) from the water. Where a
  real building over 15 m tall is in the way, it moves toward the water, up to a short
  cantilever over the bulkhead. It is then checked against every footprint until it clears.
- **Landmark details.** The Eastern State cell blocks and the Art Museum are still stylised.
  The city layer stores Eastern State as one 185 m block, so the model is fitted to that site
  and turned −9.3° to match Philadelphia's street grid.
- **Citywide landmarks.** The stadiums use their OSM outlines and pitches with LiDAR heights:
  the stands rise from the pitch edge to the outline. The football markings are the real
  109.7 × 48.8 m inside OSM's pitch, which includes the apron. Citizens Bank Park's home
  plate is the pitch corner whose foul corners sit about 110 m away at a right angle. Its
  outfield faces north-northeast, toward the skyline, as in the real park. The bridges
  follow the OSM deck ways, with their real main spans (533 m and 610 m) centred on the river
  crossing.

## Proposal: expressways to sports parks

I-76 (Schuylkill Expressway) and I-676 (Vine Street Expressway), with all their ramps, are
taken out of the street layer:

- Carriageways become a green corridor. Ramps become greenway trails. Elevated sections
  become park bridges.
- `tools/proposal.py` finds each expressway's centreline, midway between its two
  carriageways. It then lays courts end to end wherever they fit: tennis, basketball,
  five-a-side soccer and volleyball. No pickleball. Courts stay off bridges, the
  Logan Square tunnel, buildings, water, rail and remaining streets, and switch to a
  narrower court type where the corridor tightens. Currently 134 courts.
- A shuttle monorail (teal livery) runs at 26 m above each corridor. That is above the
  18 m riverfront loop so the two can cross. Piers stand between courts, and trains
  run end to end and back.
- Each corridor also gets a promenade path along one edge, and the courts have
  floodlights that switch on at dusk.
- **Ride a monorail** opens a picker for all three lines: the riverfront loop, the
  Schuylkill line and the Vine Street line. On the shuttle lines the camera turns
  around at each terminus while the train waits.

Full-size soccer pitches (68 x 44 m) are supported but never fit the corridor's width.

## Proposal: Rail Yard Park and the Railyard Bowl

The rail yard north of 30th Street Station is covered by a deck at 10.5 m, just above the
street bridges that already cross it. On top is a 33 ha park.

- **Outline.** `tools/cap.py` draws the outline from the yard itself. It builds a raster
  mask around the tracks, closes the gaps between them, and fills in the yard's interior.
  It then trims the deck to stay off the station, the I-76 sports park, through streets,
  the river, and any building taller than the deck. That building stands up through a
  cut-out in the park.
- **The park.** A promenade runs just inside the edge, with paths leading out from the
  bowl, scattered trees and open lawns. Trees keep clear of the monorail guideways. Street
  bridges over the yard now meet the deck instead of crossing above it. The real rail
  viaducts are kept.
- **The Railyard Bowl.** The site search picks the largest fan-shaped lawn that fits
  (125 m radius). The stage faces the audience so they look past it toward the Center City
  skyline, and it sits at least 80 m from the monorail corridors so the shell stays clear
  of the guideways. The bowl has:
  - red fixed seats in front, with grass terraces stepping up behind;
  - a bandshell of nested arches whose steps glow at dusk;
  - a stage with an apron and a backstage building;
  - video screens, speaker towers and delay towers;
  - a ring of light poles, and moving light beams at dusk.
