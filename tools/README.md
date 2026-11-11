# tools: rebuilding the subway data

The page does not need anything in this folder to run. These files are only for regenerating
the underground transit data (the `data-transit` block inside `schuylkill-monorail.html`).
Use them to add a line (the B, Regional Rail), refresh from OpenStreetMap, or change the depth
and platform rules.

| File | What it is |
|---|---|
| `build_transit.py` | Builds the `data-transit` block from the OSM files and writes it into the page |
| `osm/transit.json` | OSM download: tracks, stations, stops and subway entrances in the model area |
| `osm/routes.json` | OSM download: the route relations (L and T1–T5, both directions) |
| `fetch_osm.sh` | Re-downloads the two OSM files (Overpass API) |

Data © OpenStreetMap contributors, ODbL. The page credits it.

## Run it

You need Python 3 (no extra packages). From the repository folder:

```
python tools/build_transit.py tools/osm/transit.json tools/osm/routes.json schuylkill-monorail.html
```

That is a dry run. It prints what it would build: tracks, platforms, stations, entrances and the
Market St section plane. Add `--write` at the end to replace the `data-transit` block in the page.
Then open the page and check the subway (the "Cut away Market St" button) before you commit.

The repository also keeps the page as source files (see the main README). After `--write`, run
`python -I tools/unbundle.py` so `data/transit.json` and the sources match the page.

## What it does

1. Takes the ways of the routes listed in `ROUTE_IDS` and splits them into points every 5 m.
2. **Estimates depths.** OSM only says which tunnel is above which (`layer`), not how deep.
   The model: layer -2 → rail 9 m below the street, layer -3 → 13 m, under the Schuylkill →
   17.5 m. Grades are limited to 3.5 % (L) and 5 % (trolleys), and the track ramps up to the
   street at the portals.
3. Builds the **stations** from every stop in the route relations, with platforms at the
   underground ones: an island if the two tracks are far enough apart, otherwise side
   platforms. Track is levelled through each platform.
4. Picks **subway entrances** near the underground stations.
5. Fits the **Market St cut-away plane** to the L's straight run through Center City.

## Adding a line (e.g. the B)

1. Find the line's route relation ids (one per direction) on openstreetmap.org, and add them to
   the `rel(id:...)` list in `fetch_osm.sh` and to `ROUTE_IDS` in `build_transit.py`. Note that
   `KIND` in `build_transit.py` treats everything except the L as a trolley, so give the new line
   its own kind.
2. Run `fetch_osm.sh` (Git Bash) to download fresh data, then run the build.
3. In the page, give the new kind car sizes and speed in `SPEC` (subway.js chunk), and, for a
   north–south line, add a section (see "Add another underground line" in the EDITING GUIDE at the
   top of the HTML file).
