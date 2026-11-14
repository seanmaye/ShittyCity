# New Orleans

The French Quarter, the Central Business District, the Marigny, the Bywater and the Garden District, out to Uptown, City Park, the Lakefront and the Lower Ninth Ward, with the Mississippi River on the east and Lake Pontchartrain to the north. The six RTA streetcar lines run on their real alignments, and a proposed elevated monorail loops the riverfront.

- City id: `nola`. Open it with `?city=nola`.
- Data: `data/nola/`.
- Hand-built scene parts: none — New Orleans uses the shared engine (buildings, city, transit, the proposed monorail and the labels/views in `places.json`).
- Data tools: `tools/nola/`.

## What's in it

- **About 106,000 buildings**: every Overture footprint in the mapped area (Microsoft ML footprints and OpenStreetMap). The core (the French Quarter, the CBD, the Marigny, the Bywater and the Garden District) is in `buildings.json` with estimated heights; the rest are in `city_buildings.bin.gz` (PHB1), clean low-rise rectangles as boxes and everything else as outlines.
- **The water**: the Mississippi River and Lake Pontchartrain, plus the canals and ponds. Everything that is not mapped land is water (`sea: true`), so the river and the lake read as open water.
- **Streets and rail**: every street, footpath and trail, along with the streetcar tracks and the freight rail.
- **The RTA streetcars** (kind `trolley`), on their real OpenStreetMap alignments:
  - **A · Arts** (red), **B · Broad** (green), **C · Cleveland** (blue), **D · DC Street** (purple), **E · Esplanade** (orange) and **Canal Street** (yellow).
  - Each line is an out-and-back ride loop; pick one under **Ride a line** or click a car to board.
- **About 8,100 trees**: the mapped street trees plus trees scattered through the parks.
- **The proposed Mississippi Riverfront Monorail**: an illustrative elevated loop from the CBD, up the riverfront to the Lakefront and back.

## Rebuilding the data

```bash
uv sync --group data --group fetch
uv run python -I tools/nola/fetch_nola.py      # downloads the sources into tools/nola/src/
uv run python -I tools/nola/build_nola.py      # writes data/nola/
```

`fetch_nola.py` only needs re-running to refresh the sources. The Overpass query goes through `curl` (the system Python's TLS is rejected by overpass-api.de); the Overture footprints are read from Overture's public S3 release with DuckDB. `tools/nola/extent.py` holds the frame and the extents: the origin is Canal & Royal, `MODEL` is the mapped area and `CORE` is the detailed centre. If you change the frame there, change `CITIES.nola.frame` in `js/cities.js` to match.

**Building heights are estimates.** Where Overture gives a storey count it is used directly; the machine-learned heights are scaled up a little (they run low on houses) and tall buildings are trusted as given. The CBD blocks are given a downtown treatment.

## Sources

| What | Source |
| --- | --- |
| Building footprints | [Overture Maps](https://overturemaps.org/) buildings, release `2026-10-21.0`: Microsoft ML Buildings and OpenStreetMap |
| Streets, rail, water, parks, place names, streetcar lines and stops | [OpenStreetMap contributors, ODbL](https://www.openstreetmap.org/copyright) |
