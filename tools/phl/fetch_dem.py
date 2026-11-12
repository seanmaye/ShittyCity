"""Download Philadelphia's bare-earth elevation from the USGS 3D Elevation Program (3DEP).

  python -I tools/phl/fetch_dem.py [raw_dir]

Asks the 3DEP Bare Earth DEM service (elevation.nationalmap.gov, built from lidar at 1 m where
it exists) for float32 GeoTIFFs at about 10 m spacing over the city's bounding box (from
data/phl/city.json.gz) plus a 600 m margin, in four quadrants, in plain latitude/longitude
(EPSG:4326). Writes raw_dir/dem/dem_<i>.tif and dem.json (each file's lat/lon box and size).
Heights are metres above NAVD88; the big rivers are hydro-flattened (a level water surface).
About 33 MB. tools/phl/build_terrain.py turns them into data/phl/terrain.bin.gz.
"""
import gzip, json, math, os, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
RAW = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "raw")
OUT = os.path.join(RAW, "dem")
os.makedirs(OUT, exist_ok=True)
LAT0, LON0, MX, MZ = 39.9560, -75.1760, 85390.0, 111000.0
SERVICE = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage"
STEP = 10.0     # metres between samples
MARGIN = 600.0  # metres around the city's box

bbox = [v / 10 for v in json.load(gzip.open(os.path.join(ROOT, "data", "phl", "city.json.gz"), "rt", encoding="utf-8"))["bbox"]]
x0, z0, x1, z1 = bbox[0] - MARGIN, bbox[1] - MARGIN, bbox[2] + MARGIN, bbox[3] + MARGIN
lon = lambda x: LON0 + x / MX  # noqa: E731
lat = lambda z: LAT0 - z / MZ  # noqa: E731
tiles = []
xm, zm = (x0 + x1) / 2, (z0 + z1) / 2
for i, (ax, bx) in enumerate([(x0, xm), (xm, x1)]):
    for j, (az, bz) in enumerate([(z0, zm), (zm, z1)]):
        w, h = math.ceil((bx - ax) / STEP), math.ceil((bz - az) / STEP)
        box = [lon(ax), lat(bz), lon(bx), lat(az)]   # west, south, east, north
        tiles.append({"file": f"dem_{i}{j}.tif", "box": box, "size": [w, h]})
for t in tiles:
    path = os.path.join(OUT, t["file"])
    if os.path.exists(path) and os.path.getsize(path) > t["size"][0] * t["size"][1] * 4:
        print(f"  {t['file']}: already here"); continue
    q = {"bbox": ",".join(f"{v:.6f}" for v in t["box"]), "bboxSR": 4326, "imageSR": 4326, "size": f"{t['size'][0]},{t['size'][1]}",
         "format": "tiff", "pixelType": "F32", "noData": -9999, "noDataInterpretation": "esriNoDataMatchAny",
         "interpolation": "RSP_BilinearInterpolation", "compression": "None", "f": "image"}
    url = SERVICE + "?" + urllib.parse.urlencode(q)
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "city-models terrain build"})
            with urllib.request.urlopen(req, timeout=300) as r, open(path + ".part", "wb") as f:
                f.write(r.read())
            os.replace(path + ".part", path); break
        except Exception as e:  # the service is sometimes slow: try again
            print(f"  {t['file']}: {e}; retrying"); time.sleep(5 * (attempt + 1))
    else:
        raise SystemExit(f"could not download {t['file']}")
    print(f"  {t['file']}: {t['size'][0]} x {t['size'][1]}, {os.path.getsize(path) / 1e6:.1f} MB")
json.dump({"step": STEP, "tiles": tiles}, open(os.path.join(OUT, "dem.json"), "w"))
print("  wrote dem.json")
