"""Download the raw sources for New Orleans into tools/nola/src/ (build_nola.py reads them).

  src/osm.json        OpenStreetMap: streets, rail and streetcar lines, water, parks, place names,
                      streetcar stops (Overpass API)
  src/buildings.csv   Overture Maps building footprints (Microsoft ML footprints and OSM) with
                      their heights, read straight from Overture's public S3 release with DuckDB

    python -m pip install duckdb          # only for the buildings step
    python -I tools/nola/fetch_nola.py [osm] [buildings]      # default: both

The extent is MODEL (the mapped area) in extent.py.
"""
import json, math, os, sys, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from extent import MODEL, OVERTURE_RELEASE  # noqa: E402

SRC = os.path.join(HERE, 'src')
UA = {'User-Agent': 'city-models-builder/1.0'}


OVERPASS = 'https://overpass-api.de/api/interpreter'


def fetch_osm():
    # the system Python's TLS is rejected by overpass-api.de, so the query goes through curl
    import subprocess
    W, S, E, N = MODEL
    b = f'{S},{W},{N},{E}'
    q = f"""[out:json][timeout:540];(
 way[highway]({b}); way[railway]({b});
 way[natural=water]({b}); relation[natural=water]({b}); way[waterway]({b});
 relation[waterway=riverbank]({b}); way[waterway=riverbank]({b});
 way[leisure~"park|pitch|playground|golf_course|sports_centre|track|stadium"]({b});
 way[landuse~"grass|cemetery|forest|meadow|recreation_ground|farmland|farmyard|orchard"]({b});
 relation[landuse~"forest|cemetery|meadow"]({b}); way[natural~"wood|scrub|grassland"]({b});
 relation[natural~"wood|water"]({b}); way[amenity=grave_yard]({b});
 node[place~"suburb|quarter|neighbourhood|hamlet|city|town|village"]({b});
 node[amenity~"school|townhall|library|place_of_worship|stadium|theatre|museum"]({b});
 way[amenity~"school|townhall|library|place_of_worship|stadium|theatre|museum"]({b}); way[man_made]({b});
 node[natural=tree]({b});
 node[railway~"tram_stop|station|stop"]({b}); node[public_transport=platform]({b});
 relation[route~"tram|light_rail"]({b});
 );out geom;"""
    r = subprocess.run(['curl', '-s', '--max-time', '600', '-X', 'POST',
                        '-H', f'User-Agent: {UA["User-Agent"]}',
                        '--data-urlencode', f'data={q}', OVERPASS],
                       capture_output=True)
    if r.returncode != 0 or not r.stdout:
        raise SystemExit(f'overpass failed: {r.stderr.decode()[:300]}')
    d = json.loads(r.stdout)
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


if __name__ == '__main__':
    os.makedirs(SRC, exist_ok=True)
    steps = sys.argv[1:] or ['osm', 'buildings']
    for s in steps:
        {'osm': fetch_osm, 'buildings': fetch_buildings}[s]()
