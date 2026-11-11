"""Download raw data for the citywide build-out (resumable: finished pieces are skipped).

  python -I tools/phl/fetch_city.py [raw_dir] [buildings|boundary|osm|transit ...]

Default: buildings and boundary. The rest of the OpenStreetMap data normally comes from the
Geofabrik Pennsylvania extract via tools/phl/extract_osm.py (fast, no Overpass load); `osm` and
`transit` fetch the same data from Overpass instead, tile by tile, which can take hours when
the public servers are busy.

Writes into raw_dir (default tools/phl/raw/city):
  buildings/page_NNNNN.geojson   City of Philadelphia LI building footprints, 2000 per page
  boundary.json                  OSM relation 188022 (Philadelphia city limits)
  tiles/tile_R_C.json            OSM streets, rail, waterways and land use, 6 x 6 tiles
  areas.json                     OSM multipolygon relations (parks, water, woods) for the city
  transit.json                   OSM rail transit route relations + their member ways and stops
"""
import json, os, sys, time, urllib.parse, urllib.request

S, W, N, E = 39.8660, -75.2810, 40.1390, -74.9550   # city limits bbox, slightly padded
UA = {"User-Agent": "city-models/1.0 (data prep script)"}
PHL = ("https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/"
       "LI_BUILDING_FOOTPRINTS/FeatureServer/0/query")
OVERPASS = ["https://overpass-api.de/api/interpreter",
            "https://overpass.kumi.systems/api/interpreter",
            "https://overpass.private.coffee/api/interpreter"]


def get(url, data=None, timeout=300):
    req = urllib.request.Request(url, data=data, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def save(path, raw):
    tmp = path + ".part"
    with open(tmp, "wb") as f:
        f.write(raw)
    os.replace(tmp, path)


def fetch_buildings(raw):
    d = os.path.join(raw, "buildings")
    os.makedirs(d, exist_ok=True)
    total = json.loads(get(PHL + "?where=1%3D1&returnCountOnly=true&f=json"))["count"]
    for offset in range(0, total, 2000):
        out = os.path.join(d, f"page_{offset // 2000:05d}.geojson")
        if os.path.exists(out):
            continue
        q = {"where": "1=1", "outFields": "objectid,approx_hgt,max_hgt", "outSR": 4326,
             "geometryPrecision": 6, "orderByFields": "objectid",
             "resultOffset": offset, "resultRecordCount": 2000, "f": "geojson"}
        for attempt in range(6):
            try:
                raw_page = get(PHL + "?" + urllib.parse.urlencode(q))
                json.loads(raw_page)
                save(out, raw_page)
                break
            except Exception as ex:  # noqa: BLE001
                print("  retry", offset, attempt, str(ex)[:100], flush=True)
                time.sleep(2 ** attempt)
        else:
            raise SystemExit(f"buildings page at {offset} failed")
        print(f"  buildings {min(offset + 2000, total)}/{total}", flush=True)


def overpass(query, out, tries=10):
    if os.path.exists(out):
        return
    data = urllib.parse.urlencode({"data": query}).encode()
    for attempt in range(tries):
        url = OVERPASS[attempt % len(OVERPASS)]
        try:
            raw = get(url, data, timeout=400)
            json.loads(raw)
            save(out, raw)
            print(f"  {os.path.basename(out)}: {len(raw) // 1024} KB from {url}", flush=True)
            return
        except Exception as ex:  # noqa: BLE001
            print("  retry", os.path.basename(out), attempt, url, str(ex)[:100], flush=True)
            time.sleep(min(90, 10 * 2 ** attempt))
    raise SystemExit(f"Overpass failed for {out}")


def fetch_boundary(raw):
    overpass("[out:json][timeout:300];rel(188022);out geom;", os.path.join(raw, "boundary.json"))


def fetch_osm(raw):
    fetch_boundary(raw)
    d = os.path.join(raw, "tiles")
    os.makedirs(d, exist_ok=True)
    R = C = 6
    for r in range(R):
        for c in range(C):
            s, n = S + (N - S) * r / R, S + (N - S) * (r + 1) / R
            w, e = W + (E - W) * c / C, W + (E - W) * (c + 1) / C
            bb = f"{s},{w},{n},{e}"
            q = f"""[out:json][timeout:300];
(
  way["highway"]({bb});
  way["railway"~"^(rail|light_rail|subway|tram)$"]({bb});
  way["waterway"~"^(river|stream|canal|dam|weir)$"]({bb});
  way["natural"~"^(water|wood|scrub|grassland)$"]({bb});
  way["waterway"="riverbank"]({bb});
  way["leisure"~"^(park|garden|pitch|playground|golf_course|nature_reserve)$"]({bb});
  way["landuse"~"^(grass|recreation_ground|cemetery|forest|meadow)$"]({bb});
);
out geom;"""
            overpass(q, os.path.join(d, f"tile_{r}_{c}.json"))
    bb = f"{S},{W},{N},{E}"
    q = f"""[out:json][timeout:600];
(
  relation["natural"="water"]({bb}); relation["waterway"="riverbank"]({bb});
  relation["leisure"~"^(park|garden|golf_course|nature_reserve)$"]({bb});
  relation["landuse"~"^(grass|recreation_ground|cemetery|forest|meadow)$"]({bb});
  relation["natural"~"^(wood|scrub)$"]({bb});
);
out geom;"""
    overpass(q, os.path.join(raw, "areas.json"))


def fetch_transit(raw):
    bb = f"{S},{W},{N},{E}"
    q = f"""[out:json][timeout:600];
rel["type"="route"]["route"~"^(subway|light_rail|tram|train)$"]({bb})->.r;
(.r; rel(br.r)["type"="route_master"];)->.rr;
.rr out body;
way(r.r)->.w;
.w out tags geom;
node(r.r)->.n;
.n out;
(node(around.w:40)["railway"~"^(station|halt|subway_entrance)$"];
 node(around.w:40)["public_transport"="station"];
 way(around.w:40)["railway"="platform"];
 way(around.w:40)["public_transport"="platform"]["train"="yes"];);
out tags geom;"""
    overpass(q, os.path.join(raw, "transit.json"))


if __name__ == "__main__":
    args = [a for a in sys.argv[1:]]
    raw = args.pop(0) if args and not args[0] in ("buildings", "boundary", "osm", "transit") else os.path.join(os.path.dirname(__file__), "raw", "city")
    os.makedirs(raw, exist_ok=True)
    which = args or ["buildings", "boundary"]
    if "buildings" in which:
        print("City of Philadelphia building footprints", flush=True)
        fetch_buildings(raw)
    if "boundary" in which:
        print("OpenStreetMap: city limits", flush=True)
        fetch_boundary(raw)
    if "osm" in which:
        print("OpenStreetMap: boundary, tiles, areas", flush=True)
        fetch_osm(raw)
    if "transit" in which:
        print("OpenStreetMap: rail transit routes", flush=True)
        fetch_transit(raw)
    print("done", flush=True)
