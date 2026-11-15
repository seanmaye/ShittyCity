"""Download the raw sources for Kingda Ka's track into tools/ka/src/ (build_track.py reads them).

  src/osm-kingda-ka-2024.json            OpenStreetMap round the ride as it was on extent.OSM_DATE (Overpass API, an
                                         "attic" query: the ride came down in early 2025 and is gone from today's map).
                                         Way 105571105 with way 105571117 is the track; way 105571114 the station roof.
  src/lidar-kingda-ka-2019-epsg3857.npy  USGS 3DEP lidar, dataset NJ_South_Jersey_FEMA_2018, flown here on 2019-03-08
                                         while the ride stood, about 8 points/m2. Columns x, y (EPSG:3857 metres), z
                                         (metres), classification (2 ground; the tower above about 90 m is 18, "high noise").
  src/lidar-kingda-ka-2010-epsg3857.npy  the older ARRA-NJ_3Counties_2010 survey, about 2 points/m2 (its returns on the
                                         upper tower are class 7). It saw the tower before Zumanjaro's rails were hung on it.

    uv run --with "laspy[lazrs]" python -I tools/ka/fetch_track.py [osm] [lidar]      # default: both

The lidar comes from the USGS public bucket (s3://usgs-lidar-public, read over https) as Entwine Point Tiles: an octree of
.laz files in EPSG:3857. Only the nodes that touch the ride's box are fetched (a few MB each survey; they are kept in
src/ept-cache/ so a second run downloads nothing). z has no stated vertical datum in the EPT metadata; build_track.py only
uses heights against the ground of the same survey. Reading .laz needs laspy with the lazrs backend, which is not in the
project's dependency groups: hence the `uv run --with`.

(src/recon-profile.csv, a first-pass profile from the reconnaissance, is not made here and nothing reads it.)
"""
import concurrent.futures as cf
import io, json, math, os, subprocess, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from extent import OSM_DATE  # noqa: E402

SRC = os.path.join(HERE, 'src')
UA = {'User-Agent': 'city-models-builder/1.0'}
OVERPASS = 'https://overpass-api.de/api/interpreter'
BUCKET = 'https://s3-us-west-2.amazonaws.com/usgs-lidar-public/'
# the ride and a margin: S, W, N, E. The lidar box is a touch inside OpenStreetMap's
OSM_BOX = (40.1385, -74.4376, 40.1414, -74.4326)
LIDAR_BOX = (40.1386, -74.4375, 40.1413, -74.4327)
SURVEYS = {'2019': 'NJ_South_Jersey_FEMA_2018', '2010': 'ARRA-NJ_3Counties_2010'}
RM = 6378137.0                                   # EPSG:3857's sphere


def fetch_osm():
    # the system Python's TLS is rejected by overpass-api.de, so the query goes through curl (as tools/nola/fetch_nola.py)
    b = ','.join(str(v) for v in OSM_BOX)
    keys = ('roller_coaster', 'attraction', 'building', 'man_made', 'highway', 'railway', 'natural', 'water', 'waterway', 'landuse', 'leisure',
            'barrier', 'amenity', 'tourism')
    q = f'[out:json][timeout:120][date:"{OSM_DATE}"];(\n' + ''.join(f' nwr["{k}"]({b});\n' for k in keys) + ');out body geom;'
    r = subprocess.run(['curl', '-s', '--max-time', '300', '-X', 'POST', '-H', f'User-Agent: {UA["User-Agent"]}', '--data-urlencode', f'data={q}', OVERPASS],
                       capture_output=True)
    if r.returncode != 0 or not r.stdout:
        raise SystemExit(f'overpass failed: {r.stderr.decode()[:300]}')
    try:
        d = json.loads(r.stdout)
    except ValueError:
        raise SystemExit(f'overpass did not answer with JSON (busy?): {r.stdout[:300]!r}')
    ways = {e['id'] for e in d['elements'] if e['type'] == 'way'}
    if 105571105 not in ways: raise SystemExit('the answer has no way 105571105 (Kingda Ka): not written')
    json.dump(d, open(os.path.join(SRC, 'osm-kingda-ka-2024.json'), 'w'))
    print('osm-kingda-ka-2024.json:', len(d['elements']), 'elements')


def merc(lat, lon):
    return RM * math.radians(lon), RM * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def fetch_lidar(year, dataset):
    import laspy
    import numpy as np
    cache = os.path.join(SRC, 'ept-cache', dataset); os.makedirs(cache, exist_ok=True)
    x0, y0 = merc(LIDAR_BOX[0], LIDAR_BOX[1]); x1, y1 = merc(LIDAR_BOX[2], LIDAR_BOX[3])

    def get(path):
        fp = os.path.join(cache, path.replace('/', '_'))
        if os.path.exists(fp) and os.path.getsize(fp) > 0: return open(fp, 'rb').read()
        for attempt in range(4):
            try:
                raw = urllib.request.urlopen(urllib.request.Request(BUCKET + dataset + '/' + path, headers=UA), timeout=120).read(); break
            except OSError:
                if attempt == 3: raise
        open(fp, 'wb').write(raw); return raw

    ept = json.loads(get('ept.json')); B = ept['bounds']; size = B[3] - B[0]
    if ept['srs'].get('horizontal') != '3857': raise SystemExit(f'{dataset} is not in EPSG:3857')

    def hit(d, x, y, z):                         # does octree node d-x-y-z touch the box (any height the ground or the tower could have)?
        s = size / 2 ** d
        return not (B[0] + (x + 1) * s < x0 or B[0] + x * s > x1 or B[1] + (y + 1) * s < y0 or B[1] + y * s > y1 or B[2] + (z + 1) * s < -100 or B[2] + z * s > 600)

    nodes = {}

    def walk(key):                               # the hierarchy comes in pages: a node marked -1 has a page of its own
        h = json.loads(get(f'ept-hierarchy/{key}.json')); more = []

        def rec(k):
            d, x, y, z = map(int, k.split('-'))
            if k not in h or not hit(d, x, y, z): return
            if h[k] == -1 and k != key: more.append(k); return
            if h[k] > 0: nodes[k] = h[k]
            for i in range(8): rec(f'{d + 1}-{2 * x + (i & 1)}-{2 * y + ((i >> 1) & 1)}-{2 * z + ((i >> 2) & 1)}')
        rec(key)
        for k in more: walk(k)
    walk('0-0-0-0')

    def load(k):
        las = laspy.read(io.BytesIO(get(f'ept-data/{k}.laz')))
        x, y, z = np.asarray(las.x), np.asarray(las.y), np.asarray(las.z)
        m = (x >= x0) & (x <= x1) & (y >= y0) & (y <= y1)
        return np.column_stack([x[m], y[m], z[m], np.asarray(las.classification)[m].astype(float)])
    with cf.ThreadPoolExecutor(12) as ex: P = np.vstack(list(ex.map(load, list(nodes))))
    out = os.path.join(SRC, f'lidar-kingda-ka-{year}-epsg3857.npy')
    np.save(out, P.astype(np.float64))
    area = (x1 - x0) * (y1 - y0) * math.cos(math.radians((LIDAR_BOX[0] + LIDAR_BOX[2]) / 2)) ** 2      # Mercator metres are 1 / cos(lat) long
    print(f'{os.path.basename(out)}: {len(P)} points from {len(nodes)} nodes of {dataset}, {len(P) / area:.1f} per m2, classes',
          {int(c): int(n) for c, n in zip(*np.unique(P[:, 3], return_counts=True))})


if __name__ == '__main__':
    todo = sys.argv[1:] or ['osm', 'lidar']
    os.makedirs(SRC, exist_ok=True)
    if 'osm' in todo: fetch_osm()
    if 'lidar' in todo:
        for year, dataset in SURVEYS.items(): fetch_lidar(year, dataset)
