"""Download the raw sources for Jersey Shore, PA into tools/jsh/src/ (build_jsh.py reads them).

  src/osm.json        OpenStreetMap: streets, rail, water, parks, woods, the borough boundary,
                      place names (Overpass API)
  src/buildings.csv   Overture Maps building footprints (Microsoft ML footprints and OSM) with
                      their heights, read straight from Overture's public S3 release with DuckDB
  src/dem/*.png       AWS Terrain Tiles (Terrarium PNG, zoom 12, about 29 m a pixel here)
  src/cdl.png, cdl.json   USDA NASS Cropland Data Layer (30 m crop classes; from the Microsoft
                      Planetary Computer, whose newest year is 2021): a PNG of class codes in
                      EPSG:5070 and its affine transform

    python -m pip install duckdb          # only for the buildings step
    python -m pip install rasterio pyproj # only for the cdl step
    python -I tools/jsh/fetch_jsh.py [osm] [buildings] [dem] [cdl]      # default: all four

The extent is MODEL (the mapped area) and TERRAIN (the elevation grid) in extent.py.
"""
import json, math, os, sys, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from extent import MODEL, TERRAIN, OVERTURE_RELEASE  # noqa: E402

SRC = os.path.join(HERE, 'src')
UA = {'User-Agent': 'city-models-builder/1.0'}


def fetch_osm():
    W, S, E, N = MODEL
    b = f'{S},{W},{N},{E}'
    q = f"""[out:json][timeout:240];(
way[highway]({b}); way[railway]({b});
way[natural=water]({b}); relation[natural=water]({b}); way[waterway]({b});
relation[waterway=riverbank]({b}); way[waterway=riverbank]({b});
way[leisure~"park|pitch|playground|golf_course|sports_centre|track|stadium"]({b});
way[landuse~"grass|cemetery|forest|meadow|recreation_ground|farmland|farmyard|orchard"]({b});
relation[landuse~"forest|cemetery|meadow"]({b}); way[natural~"wood|scrub|grassland"]({b});
relation[natural~"wood|water"]({b}); way[amenity=grave_yard]({b});
relation(188746);
node[place]({b}); node[amenity~"school|townhall|library|place_of_worship"]({b});
way[amenity~"school|townhall|library|place_of_worship"]({b}); way[man_made]({b}); node[natural=tree]({b});
);out geom;"""
    req = urllib.request.Request('https://overpass-api.de/api/interpreter',
                                 data=urllib.parse.urlencode({'data': q}).encode(), headers=UA)
    with urllib.request.urlopen(req, timeout=300) as r:
        d = json.load(r)
    json.dump(d, open(os.path.join(SRC, 'osm.json'), 'w'))
    print('osm.json:', len(d['elements']), 'elements')


def fetch_buildings():
    import duckdb
    W, S, E, N = MODEL
    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial; INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
    out = os.path.join(SRC, 'buildings.csv').replace('\\', '/')
    con.execute(f"""
COPY (
 SELECT id, height, num_floors, class, subtype, roof_shape, roof_color, facade_color,
        names.primary AS name, sources[1].dataset AS src, ST_AsText(geometry) AS wkt
 FROM read_parquet('s3://overturemaps-us-west-2/release/{OVERTURE_RELEASE}/theme=buildings/type=building/*', hive_partitioning=1)
 WHERE bbox.xmin > {W} AND bbox.xmax < {E} AND bbox.ymin > {S} AND bbox.ymax < {N}
) TO '{out}' (HEADER, DELIMITER ',');""")
    print('buildings.csv:', con.execute(f"select count(*) from read_csv_auto('{out}')").fetchone()[0], 'footprints')


def fetch_dem(z=12):
    W, S, E, N = TERRAIN
    n = 2 ** z
    tx = lambda lon: int((lon + 180) / 360 * n)
    ty = lambda lat: int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    os.makedirs(os.path.join(SRC, 'dem'), exist_ok=True)
    for x in range(tx(W), tx(E) + 1):
        for y in range(ty(N), ty(S) + 1):
            url = f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                open(os.path.join(SRC, 'dem', f'{z}_{x}_{y}.png'), 'wb').write(r.read())
    print('dem tiles:', len(os.listdir(os.path.join(SRC, 'dem'))))


def fetch_cdl(year=2021):
    import numpy as np, rasterio
    from PIL import Image
    from pyproj import Transformer
    from rasterio.merge import merge
    W, S, E, N = TERRAIN
    t = Transformer.from_crs('EPSG:4326', 'EPSG:5070', always_xy=True)
    xs, ys = zip(*[t.transform(x, y) for x in (W, E) for y in (S, N)])
    q = json.dumps({'collections': ['usda-cdl'], 'bbox': [W, S, E, N], 'limit': 20,
                    'query': {'usda_cdl:type': {'eq': 'cropland'}}, 'datetime': f'{year}-01-01/{year}-12-31'}).encode()
    api = 'https://planetarycomputer.microsoft.com/api'
    d = json.load(urllib.request.urlopen(urllib.request.Request(api + '/stac/v1/search', q, {'Content-Type': 'application/json', **UA})))
    tok = json.load(urllib.request.urlopen(urllib.request.Request(api + '/sas/v1/token/usda-cdl', headers=UA)))['token']
    srcs = [rasterio.open(f['assets']['cropland']['href'] + '?' + tok) for f in d['features']]
    arr, tr = merge(srcs, bounds=(min(xs), min(ys), max(xs), max(ys)))
    Image.fromarray(arr[0].astype(np.uint8)).save(os.path.join(SRC, 'cdl.png'))
    json.dump({'year': year, 'crs': 'EPSG:5070', 'transform': list(tr)[:6]}, open(os.path.join(SRC, 'cdl.json'), 'w'))
    print('cdl:', arr.shape[1:], 'pixels from', len(srcs), 'tiles')


if __name__ == '__main__':
    os.makedirs(SRC, exist_ok=True)
    steps = sys.argv[1:] or ['osm', 'buildings', 'dem', 'cdl']
    for s in steps:
        {'osm': fetch_osm, 'buildings': fetch_buildings, 'dem': fetch_dem, 'cdl': fetch_cdl}[s]()
