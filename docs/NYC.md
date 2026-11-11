# New York

The New York model covers Manhattan, Brooklyn and Queens. It includes the four East River bridges, 11 subway lines, a Times Square cut-away and a proposed East River monorail loop. It was built as a separate project, the **NYC City Model**:

```
\\192.168.168.72\tsptemp\sean\nyc-city-model
```

It now runs on this repository's engine. The import took that repository's data at commit `676aee9`. Its code was not merged: the parts that are hand-built rather than data were ported to `js/scene/nyc/`.

## What comes from where

| Here | From the NYC City Model |
| --- | --- |
| `data/nyc/*` | `data/map.json.gz`, `transit.json`, `landmarks.json`, `monorail.json`, converted by `tools/import_nyc.py` |
| `js/scene/nyc/landmarks.js` | `js/scene/landmarks.js` (the Empire State and Chrysler crowns now take the skyline lights) |
| `js/scene/nyc/bridges.js` | `js/scene/bridges.js` |
| `js/scene/nyc/boroughmarks.js` | `js/scene/boroughmarks.js` |
| `js/scene/nyc/monorail.js` | `js/scene/monorail.js` (its cars board through `subway.registerFleet`) |
| `js/cities.js` (`CITIES.nyc`) | `config.json`: frame, HUD text and credits |

Everything else is this repository's engine: buildings, facades and night lights, ground, sky and the 24-hour clock, subway rides and the cut-away, the minimap, the ride bar and creative-mode flight.

## How the importer maps the data

- **Buildings.**
  - Manhattan's footprints, the ones outside the outer-borough detail windows, become `buildings.json.gz`. Its schema is the same as `data/buildings.json`.
  - The detail windows become `city_buildings.bin.gz`. These are Downtown Brooklyn and DUMBO, Park Slope, Williamsburg and Greenpoint, Coney Island, Long Island City and Astoria, Flushing, and Jamaica.
  - In that file, clean low-rise rectangles become instanced boxes and every other footprint is an outline.
  - Footprints that a modelled landmark replaces are left out.
- **Ground.** `city.json.gz` holds:
  - the land outlines, as `limits`: the borough shorelines and the New Jersey waterfront
  - parks, coloured by their OSM tags (park, grass, pitch, wood, cemetery)
  - streets and paths, water and trees
  - The city's `sea` flag (`js/cities.js`) makes everything outside the land outlines water.
  - The OSM decks of the four modelled bridges are left out, so they aren't drawn twice.
- **Transit.**
  - The 11 MTA lines become kind `nycsub`, with a car spec and cabin in `subway.js`.
  - Stops that serve several lines are merged into one station tag.
  - The importer checks that every ride path is a closed loop of finite points.

## Refreshing New York's data

1. Update the data in the NYC City Model checkout with its own tools. Its `docs/DATA.md` covers the map, landmarks and GTFS subway steps.
2. Re-import into this repository:

   ```bash
   python -I tools/import_nyc.py //192.168.168.72/tsptemp/sean/nyc-city-model
   ```

3. Rebuild the single file:

   ```bash
   python -I tools/bundle.py
   ```

4. Serve the folder, open `http://localhost:8765/?city=nyc`, check it, and commit `data/nyc/` with the rebuilt HTML. Name the NYC commit you imported in the commit message.

## Sources

- **Building footprints and roof heights.** [NYC Open Data BUILDING_P](https://data.cityofnewyork.us/City-Government/BUILDING_P/u9wf-3gbt).
- **Roads, parks, paths, water and trees.** [OpenStreetMap contributors, ODbL](https://www.openstreetmap.org/copyright).
- **Shorelines.** [NYC Open Data Borough Boundaries](https://data.cityofnewyork.us/City-Government/Borough-Boundaries/gthc-hcne) and [NJDEP Municipalities Clipped to Coast](https://mapsdep.nj.gov/arcgis/rest/services/Features/Government/MapServer/19).
- **Subway routes and stops.** [MTA static GTFS](https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip). Track depths, the Queens elevated profile of the 7, platforms and rolling stock are illustrative.
- **The East River Loop** is a proposal, not an MTA service.
