# New York

Manhattan, Brooklyn and Queens, with the four East River bridges, 11 subway lines, a Times Square cut-away and our proposal: a monorail loop along both East River waterfronts. The buildings, shorelines, parks, streets and transit all come from real map data.

- City id: `nyc`. Open it with `?city=nyc`.
- Data: `data/nyc/`.
- Hand-built scene parts: `js/scene/nyc/`.
- Data tools: `tools/nyc/`.

## What's in it

- **Manhattan up to Central Park** is the detailed core: about 49k building footprints with their real heights.
- **Brooklyn and Queens** surround it. Seven detail windows hold about 200k more buildings:
  - Downtown Brooklyn and DUMBO
  - Park Slope and Prospect Park
  - Williamsburg and Greenpoint
  - Coney Island
  - Long Island City and Astoria
  - Flushing and Flushing Meadows
  - Jamaica
- **The rest of both boroughs** has major roads, parks, shorelines and water, out to the Rockaways and the airports. Everything off the land is water: the rivers, the harbour and the ocean.
- **The East River bridges** are hand-built:
  - the Brooklyn Bridge, with stone towers, cables and suspenders
  - the Manhattan and Williamsburg bridges, with steel towers (plus the Williamsburg's stiffening truss)
  - the Queensboro cantilever
- **Landmarks:**
  - the Empire State, Chrysler, One World Trade Center, Flatiron and Woolworth buildings
  - St Patrick's Cathedral and Rockefeller Center
  - the Wonder Wheel, the Unisphere and Citi Field
  - Grand Central, the UN Secretariat, Madison Square Garden, and the Met, Natural History and Guggenheim museums, shown as simpler shapes
- **Subway.** The 1, 6, 7, A, E, F, G, J, L, N and Q follow their real routes and stops from MTA GTFS. They run underground, and the 7 also runs elevated across Queens. You can ride any of them inside an NYC subway car. "Show transit lines" highlights them all.
- **The Times Square cut-away** opens the ground along the 1 train corridor beneath Times Square.
- **Spider-Man vs. Electro** recreates the Times Square confrontation from *The Amazing Spider-Man 2* above ground. In **Go to**, choose **Spider-Man vs. Electro** for a close-up or **Times Square plaza** for the red steps and billboards. Both views set the clock to 10 p.m. The scene stages the characters, cars and street furniture within the real Midtown street grid.
- **Skyline lights** colour the Empire State and Chrysler crowns: classic white, the holidays, Pride, or your own colour.

## Proposal: the East River Loop

A straddle monorail runs on an elevated guideway along both East River waterfronts, crossing the river twice. It has 14 stations, including Pier 17 / Seaport, DUMBO Ferry, the Brooklyn Navy Yard, Domino Park, Long Island City and Corlears Hook. The trains run in the proposal's red livery. You can ride the loop from the "Proposed monorails" group under **Ride a line**, or click any car. Station positions are illustrative. If you edit the route, check nearby structures.

## How the real data is used

- **Buildings.**
  - Footprints and roof heights come from NYC Open Data.
  - Low-rise rectangles in the detail windows become instanced boxes. Every other footprint keeps its outline.
  - Footprints that a modelled landmark replaces are left out.
- **Ground.**
  - The land outlines are the borough shorelines plus the New Jersey waterfront.
  - Parks are coloured by their OSM tags: park, grass, pitch, wood or cemetery.
  - The OSM decks of the four modelled bridges are left out of the streets, so they aren't drawn twice.
- **Subway.**
  - Each line follows its most-scheduled GTFS shape. Stops that serve several lines share one station tag.
  - Tunnels sit 9 m down. The 7's Queens elevated has an illustrative height profile.
  - Tunnel interiors, platforms and rolling stock are illustrative.

## Rebuilding the data

New York's data was first assembled in a separate project, the **NYC City Model** (`\\192.168.168.72\tsptemp\sean\nyc-city-model`). This repository took that project's data at commit `676aee9`, and that project's own tools still fetch it. Its code was not merged: the hand-built parts were ported to `js/scene/nyc/`.

`tools/nyc/import_nyc.py` converts that project's data into `data/nyc/`, in the formats every city here uses. It also checks that every subway ride path is a closed loop.

To refresh:

1. Update the data in the NYC City Model checkout with its own tools. Its `docs/DATA.md` covers the map, landmarks and GTFS subway steps.
2. Import the data:

   ```bash
   python -I tools/nyc/import_nyc.py //192.168.168.72/tsptemp/sean/nyc-city-model
   ```

3. Serve the folder and open `http://localhost:8765/?city=nyc`. Check it, then commit `data/nyc/`. Name the NYC commit you imported in the commit message.

## Sources

| What | Source |
| --- | --- |
| Building footprints and roof heights | [NYC Open Data BUILDING_P](https://data.cityofnewyork.us/City-Government/BUILDING_P/u9wf-3gbt) |
| Roads, parks, paths, water, trees | [OpenStreetMap contributors, ODbL](https://www.openstreetmap.org/copyright) |
| Shorelines | [NYC Open Data Borough Boundaries](https://data.cityofnewyork.us/City-Government/Borough-Boundaries/gthc-hcne) and [NJDEP Municipalities Clipped to Coast](https://mapsdep.nj.gov/arcgis/rest/services/Features/Government/MapServer/19) |
| Subway routes and stops | [MTA static GTFS](https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip); track depths, the 7's elevated profile, platforms and rolling stock are illustrative |
| Landmark references | [NYC Parks Unisphere](https://nycgovparks.org/parks/flushing-meadows-corona-park/highlights/12761), [Deno's Wonder Wheel](https://www.denoswonderwheel.com/history), [NYC DOT bridge information](https://www.nyc.gov/html/dot/html/infrastructure/bridges.shtml) |

The East River Loop is a proposal, not an MTA service.
