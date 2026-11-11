"""Download raw source data for the Schuylkill model.

  python tools/phl/fetch_data.py [raw_dir]

Writes into raw_dir (default: tools/phl/raw):
  philly_buildings.geojson  City of Philadelphia LI building footprints (LiDAR heights, feet)
  osm.json                  OpenStreetMap water, waterways, parks, streets, rail, bridges

Then run tools/phl/build_data.py to turn these into the compact files in data/phl/.
"""
import json, os, sys, time, urllib.parse, urllib.request

BBOX = (39.936, -75.208, 39.982, -75.152)  # S, W, N, E
UA = {"User-Agent": "schuylkill-monorail-model/1.0 (data prep script)"}

PHL = ("https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/"
       "LI_BUILDING_FOOTPRINTS/FeatureServer/0/query")

OVERPASS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]


def get(url, data=None, timeout=180):
    req = urllib.request.Request(url, data=data, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def fetch_philly(out):
    s, w, n, e = BBOX
    feats, offset = [], 0
    while True:
        q = {
            "where": "1=1", "geometry": f"{w},{s},{e},{n}",
            "geometryType": "esriGeometryEnvelope", "inSR": 4326,
            "spatialRel": "esriSpatialRelIntersects", "outSR": 4326,
            "outFields": "objectid,approx_hgt,max_hgt,building_name,address",
            "resultOffset": offset, "resultRecordCount": 2000, "f": "geojson",
        }
        for attempt in range(5):
            try:
                d = json.loads(get(PHL + "?" + urllib.parse.urlencode(q)))
                break
            except Exception as ex:  # noqa: BLE001
                print("  retry", attempt, ex)
                time.sleep(2 ** attempt)
        else:
            raise SystemExit("Philadelphia footprint service unavailable")
        page = d.get("features", [])
        feats += page
        print(f"  buildings: {len(feats)}")
        if len(page) < 2000:
            break
        offset += 2000
    with open(out, "w") as f:
        json.dump({"type": "FeatureCollection", "features": feats}, f)


def fetch_osm(out):
    s, w, n, e = BBOX
    bb = f"{s},{w},{n},{e}"
    q = f"""[out:json][timeout:180];
(
  way["natural"="water"]({bb}); relation["natural"="water"]({bb});
  way["waterway"="riverbank"]({bb}); relation["waterway"="riverbank"]({bb});
  way["waterway"="river"]({bb});
  way["waterway"~"^(dam|weir)$"]({bb});
  way["building"]["name"~"^(William H. Gray III 30th Street Station|The Murano)$"]({bb});
  way["leisure"~"^(park|garden|pitch|playground)$"]({bb}); relation["leisure"="park"]({bb});
  way["landuse"~"^(grass|recreation_ground|cemetery|forest|meadow)$"]({bb});
  way["natural"~"^(wood|scrub|grassland)$"]({bb});
  way["highway"]({bb});
  way["railway"~"^(rail|light_rail|subway)$"]({bb});
);
out geom;"""
    data = urllib.parse.urlencode({"data": q}).encode()
    for attempt in range(8):
        url = OVERPASS[attempt % len(OVERPASS)]
        try:
            raw = get(url, data, timeout=240)
            json.loads(raw)
            with open(out, "wb") as f:
                f.write(raw)
            print(f"  osm: {len(raw)//1024} KB from {url}")
            return
        except Exception as ex:  # noqa: BLE001
            print("  retry", attempt, url, str(ex)[:120])
            time.sleep(min(60, 5 * 2 ** attempt))
    raise SystemExit("Overpass unavailable; try again later")


if __name__ == "__main__":
    raw = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "raw")
    os.makedirs(raw, exist_ok=True)
    which = sys.argv[2:] or ["philly", "osm"]
    if "philly" in which:
        print("Philadelphia building footprints")
        fetch_philly(os.path.join(raw, "philly_buildings.geojson"))
    if "osm" in which:
        print("OpenStreetMap features")
        fetch_osm(os.path.join(raw, "osm.json"))
