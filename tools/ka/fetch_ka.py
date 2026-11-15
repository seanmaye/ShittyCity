"""Download the raw sources for the park round Kingda Ka into tools/ka/src/ (build_ka.py reads them).

  src/osm-park-2024.json    OpenStreetMap as it was on extent.OSM_DATE (the ride came down in early
                            2025): everything mapped in MODEL (Overpass API, an attic query)
  src/osm-park-today.json   the fallback when no Overpass instance with attic data answers: today's
                            map of the same box. build_ka.py then patches the 2024 state back in
                            round the ride from src/osm-kingda-ka-2024.json (fetch_track.py's extract)
  src/buildings.csv         Overture Maps building footprints with their heights, read straight
                            from Overture's public S3 release with DuckDB

    python -I tools/ka/fetch_ka.py [osm] [today] [buildings]      # default: osm buildings

"osm" tries every Overpass instance in turn for the attic data, several rounds with a pause between,
and only then falls back to "today". The extent is MODEL in extent.py.
"""
import json, os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from extent import MODEL, OVERTURE_RELEASE, OSM_DATE  # noqa: E402

SRC = os.path.join(HERE, 'src')
UA = 'city-models-builder/1.0'

# instances with attic ("museum") data first; the last has today's map only
OVERPASS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass.openstreetmap.fr/api/interpreter',
]
ROUNDS, PAUSE = 6, 45


def query(date=None):
    W, S, E, N = MODEL
    b = f'{S},{W},{N},{E}'
    head = '[out:json][timeout:170]' + (f'[date:"{date}"]' if date else '')
    # the box is small (3 km by 2.5 km): take every way and relation, and every node that has tags
    return f'{head};(way({b});relation({b});node({b})(if:count_tags()>0););out geom;'


def overpass(url, q, limit=200):
    """the parsed answer, or None (and why) if the instance timed out, refused or has no such data"""
    # the system Python's TLS is rejected by overpass-api.de, so the query goes through curl
    r = subprocess.run(['curl', '-s', '--max-time', str(limit), '-X', 'POST', '-H', f'User-Agent: {UA}',
                        '--data-urlencode', f'data={q}', url], capture_output=True)
    if r.returncode != 0 or not r.stdout:
        return None, f'curl exit {r.returncode}'
    try:
        d = json.loads(r.stdout)
    except ValueError:
        return None, r.stdout[:120].decode('utf-8', 'replace').replace('\n', ' ')
    if 'error' in d.get('remark', '') or not d.get('elements'):
        return None, d.get('remark', 'no elements')[:160]
    return d, ''


def fetch_today():
    for url in OVERPASS[::-1]:
        d, why = overpass(url, query())
        if d:
            d['_source'] = url
            json.dump(d, open(os.path.join(SRC, 'osm-park-today.json'), 'w'))
            print(f'osm-park-today.json: {len(d["elements"])} elements from {url} '
                  f'(map of {d["osm3s"]["timestamp_osm_base"]})')
            return
        print(f'  {url}: {why}')
    raise SystemExit('no Overpass instance answered')


def fetch_osm():
    for i in range(ROUNDS):
        for url in OVERPASS:
            d, why = overpass(url, query(OSM_DATE))
            if d:
                d['_source'], d['_date'] = url, OSM_DATE
                json.dump(d, open(os.path.join(SRC, 'osm-park-2024.json'), 'w'))
                print(f'osm-park-2024.json: {len(d["elements"])} elements as of {OSM_DATE} from {url}')
                return
            print(f'  round {i + 1}, {url}: {why}', flush=True)
        time.sleep(PAUSE)
    print('no attic data to be had: falling back to today\'s map')
    fetch_today()


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
        {'osm': fetch_osm, 'today': fetch_today, 'buildings': fetch_buildings}[s]()
