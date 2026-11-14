# tools/phl: Philadelphia's data tools

The page does not need anything in this folder to run. [docs/PHL.md](../../docs/PHL.md) covers
rebuilding all of Philadelphia's data; this file covers the two builders that work differently:
the Center City subway and the 1953 streetcars.

## The subway (L and T1–T5)

These files regenerate the underground transit data (the `data-phl-transit` block inside
`city-models.html`, from `data/phl/transit.json`).
Use them to add a line (the B, Regional Rail), refresh from OpenStreetMap, or change the depth
and platform rules.

| File | What it is |
|---|---|
| `build_transit.py` | Builds the `data-phl-transit` block from the OSM files and writes it into the page |
| `osm/transit.json` | OSM download: tracks, stations, stops and subway entrances in the model area |
| `osm/routes.json` | OSM download: the route relations (L and T1–T5, both directions) |
| `fetch_osm.sh` | Re-downloads the OSM files (Overpass API) |
| `build_trolley1953.py` | Builds `data/phl/trolley1953.json` (the "1953 streetcars" layer) |
| `osm/streets_cc.json` | OSM download: named Center City streets (for tracing the 1953 map) |
| `osm/oldtram.json` | OSM download: disused and removed tram track in the model area |

Data © OpenStreetMap contributors, ODbL. The page credits it.

### Run it

You need Python 3 (no extra packages). From the repository folder:

```
python tools/phl/build_transit.py tools/phl/osm/transit.json tools/phl/osm/routes.json city-models.html
```

That is a dry run. It prints what it would build: tracks, platforms, stations, entrances and the
Market St section plane. Add `--write` at the end to replace the `data-phl-transit` block in the page.
Then open the page and check the subway (the "Cut away Market St" button) before you commit.

The repository also keeps the page as source files (see the main README). After `--write`, run
`python -I tools/unbundle.py` so `data/phl/transit.json` and the sources match the page.

### What it does

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

### Adding a line (e.g. the B)

1. Find the line's route relation ids (one per direction) on openstreetmap.org, and add them to
   the `rel(id:...)` list in `fetch_osm.sh` and to `ROUTE_IDS` in `build_transit.py`. Note that
   `KIND` in `build_transit.py` treats everything except the L as a trolley, so give the new line
   its own kind.
2. Run `fetch_osm.sh` (Git Bash) to download fresh data, then run the build.
3. In the page, give the new kind car sizes and speed in `SPEC` (subway.js chunk), and, for a
   north–south line, add a section (see "Add another underground line" in the EDITING GUIDE at the
   top of the HTML file).

## The 1953 streetcar layer

`build_trolley1953.py` traces the streetcar (blue) lines on the Center City panel of the
Philadelphia Transportation Company map of January 1953 onto the OSM streets, labels each
street with the routes printed beside it, and colours it by the year those routes were
abandoned (the route table from Harold E. Cox, *Surface Cars of Philadelphia 1911-1965*). It
also adds tram track still mapped in OSM (the old Route 23 on 11th and 12th Streets).

The map image is not in the repository. Download it from
http://www.phillytrolley.org/ptc-map.html (`IMAGES/PTC_MAP3.GIF`), then, from the repository folder:

```
uv sync --group data
uv run python tools/phl/build_trolley1953.py PTC_MAP3.GIF tools/phl/osm/streets_cc.json tools/phl/osm/oldtram.json data/phl/trolley1953.json --overlay check.png
```

Look at `check.png` (the traced streets drawn in magenta over the map), then add `--write`
to write `data/phl/trolley1953.json`, and run `python -I tools/bundle.py` to refresh the page.
The map only covers Vine to South Street, Schuylkill to the Delaware. Bus lines (red) and
Route 61 on Ridge Ave (an electric trolleybus in 1953) are left out.
