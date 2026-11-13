"""Build New Orleans's data (data/nola/) from the raw sources in tools/nola/src/.

    python -m pip install shapely numpy pillow
    python -I tools/nola/fetch_nola.py          # once, or to refresh the sources
    python -I tools/nola/build_nola.py

Writes, in the shared formats (docs/EDITING.md section 3):
  buildings.json          the core's footprints (Overture: Microsoft ML and OSM), style 0, heights
                         estimated (see height())
  city_buildings.bin.gz   every other footprint as PHB1 (clean low-rise rectangles as boxes, the
                         rest as outlines)
  ground.json             the core extent as the paved centre
  river.json              the Mississippi and Lake Pontchartrain (water), the river centreline
  trees.json              street and park trees at ground level
  transit.json            the RTA streetcar lines (kind "trolley"), tracks, out-and-back runs, stops
  city.json.gz            the land outlines (everything not water), parks, streets, rail, water,
                         streams and park trees
  terrain.bin.gz          the elevation grid the scene drapes everything over (js/scene/jsh/terrain.js)
  places.json             labels and "Go to" views (js/scene/jsh/places.js)
  monorail.json           the proposed Mississippi riverfront loop (js/scene/monorail.js)
"""
import gzip, json, math, os, random, struct, sys, csv
import numpy as np
from PIL import Image
from shapely import wkt as swkt
from shapely.geometry import Polygon, MultiPolygon, LineString, Point, MultiLineString, box
from shapely.ops import unary_union, linemerge, polygonize
from shapely.strtree import STRtree
from shapely.prepared import prep

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SRC, OUT = os.path.join(HERE, 'src'), os.path.join(ROOT, 'data', 'nola')

sys.path.insert(0, HERE)
from extent import LAT0, LON0, MZ, MX, MODEL, CORE, HALF, CELL  # noqa: E402

random.seed(20261113)


def proj(lat, lon):
    return ((lon - LON0) * MX, -(lat - LAT0) * MZ)


def dm(v):
    return int(round(v * 10))


def flat(coords, outer=True):
    """[(x, z)...] metres -> flat dm ring; outer rings positive area, holes negative"""
    pts = list(coords)
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    a = sum(p[0] * q[1] - q[0] * p[1] for p, q in zip(pts, pts[1:] + pts[:1]))
    if (a < 0) == outer:
        pts = pts[::-1]
    return [v for p in pts for v in (dm(p[0]), dm(p[1]))]


def poly_rings(p):
    return [flat(p.exterior.coords)] + [flat(h.coords, False) for h in p.interiors]


def polys_of(g):
    if g.is_empty:
        return []
    if isinstance(g, Polygon):
        return [g]
    return [q for q in getattr(g, 'geoms', []) if isinstance(q, Polygon)]


def lines_of(g):
    if g.is_empty:
        return []
    if isinstance(g, LineString):
        return [g]
    out = []
    for q in getattr(g, 'geoms', []):
        out += lines_of(q)
    return out


def xy_box(W, S, E, N):
    x0, z1 = proj(S, W)
    x1, z0 = proj(N, E)
    return box(x0, z0, x1, z1)


MODEL_BOX = xy_box(*MODEL)
CORE_BOX = xy_box(*CORE)
TERR_BOX = box(-HALF, -HALF, HALF, HALF)


# ---------------------------------------------------------------- OSM
osm = json.load(open(os.path.join(SRC, 'osm.json')))['elements']
WAYS = {e['id']: e for e in osm if e['type'] == 'way'}
NODES = {e['id']: e for e in osm if e['type'] == 'node'}
RELS = [e for e in osm if e['type'] == 'relation']


def way_line(e):
    return LineString([proj(p['lat'], p['lon']) for p in e['geometry']])


def way_poly(e):
    pts = [proj(p['lat'], p['lon']) for p in e['geometry']]
    if len(pts) < 4:
        return None
    p = Polygon(pts)
    return p if p.is_valid and p.area > 1 else None


def rel_poly(rel):
    outer, holes = [], []
    for m in rel['members']:
        if m['type'] != 'way' or m['ref'] not in WAYS:
            continue
        p = way_poly(WAYS[m['ref']])
        if not p:
            continue
        (outer if m.get('role') in ('outer', '') else holes).append(p)
    if not outer:
        return None
    try:
        u = unary_union(outer)
        if holes:
            u = u.difference(unary_union(holes))
        return u
    except Exception:
        return None


# ---- water
water_polys = []
for e in osm:
    if e['type'] == 'way':
        t = e.get('tags', {})
        if t.get('natural') == 'water' or t.get('water') or t.get('waterway') == 'riverbank':
            p = way_poly(e)
            if p:
                water_polys.append(p)
    elif e['type'] == 'relation':
        t = e.get('tags', {})
        if t.get('natural') == 'water' or t.get('waterway') == 'riverbank':
            p = rel_poly(e)
            if p:
                water_polys.append(p)
water_union = unary_union([p for p in water_polys if p.area > 200])
# clip the water to the model box: bayous and canals that run out of the mapped area would
# otherwise render as thin strips of raised water (the sea sits lower) radiating out from the city
water_union = water_union.intersection(MODEL_BOX)
# the Mississippi and Lake Pontchartrain are the big water bodies (river.json); the rest are ponds
big_water = [p for p in polys_of(water_union) if p.area > 200000]
small_water = [p for p in polys_of(water_union) if p.area <= 200000]

# ---- land limits: the model box minus the water
land = MODEL_BOX.difference(water_union)
limits_polys = [p for p in polys_of(land) if p.area > 1000]

# ---- parks / green
GREEN_KIND = {
    'park': 0, 'grass': 1, 'pitch': 2, 'playground': 0, 'golf_course': 0, 'sports_centre': 0,
    'track': 0, 'stadium': 0, 'recreation_ground': 0, 'cemetery': 4, 'forest': 1, 'meadow': 1,
    'farmland': 1, 'farmyard': 1, 'orchard': 1, 'wood': 1, 'scrub': 1, 'grassland': 1,
    'grave_yard': 4,
}
green = []
for e in osm:
    t = e.get('tags', {})
    kind = None
    if e['type'] == 'way':
        for k in ('leisure', 'landuse', 'natural', 'amenity'):
            if t.get(k) in GREEN_KIND:
                kind = GREEN_KIND[t[k]]
                break
        if kind is None:
            continue
        p = way_poly(e)
    elif e['type'] == 'relation':
        for k in ('leisure', 'landuse', 'natural'):
            if t.get(k) in GREEN_KIND:
                kind = GREEN_KIND[t[k]]
                break
        if kind is None:
            continue
        p = rel_poly(e)
    else:
        continue
    if p and p.area > 400:
        green.append((kind, p))
green_union = unary_union([p for _, p in green]) if green else None

# ---- streets, paths, rail
HW_W = {'motorway': 14, 'trunk': 14, 'primary': 11, 'secondary': 9, 'tertiary': 7,
        'unclassified': 5, 'residential': 5, 'living_street': 4, 'service': 3, 'pedestrian': 4}
lines = []
for e in WAYS.values():
    t = e.get('tags', {})
    if t.get('railway') in ('tram', 'light_rail', 'streetcar', 'rail', 'platform'):
        k = 2
        w = 4 if t.get('railway') == 'rail' else 3
    elif t.get('highway'):
        if t.get('highway') in ('path', 'footway', 'track', 'steps', 'pedestrian'):
            k = 1
            w = 2
        else:
            k = 0
            w = HW_W.get(t.get('highway'), 5)
    else:
        continue
    if t.get('area') == 'yes' or t.get('highway') == 'proposed':
        continue
    ln = way_line(e)
    if ln.length < 6:
        continue
    try:
        layer = int((t.get('layer') or '0').split(';')[0])
    except (TypeError, ValueError):
        layer = 0
    lines.append({'k': k, 'w': w, 'b': int(t.get('bridge') in ('yes', 'rail', 'z')), 'l': layer,
                  'p': [v for x, z in ln.coords for v in (dm(x), dm(z))], '_ln': ln})

# ---- streams (waterways that are not riverbank)
streams = []
for e in WAYS.values():
    t = e.get('tags', {})
    if t.get('waterway') and t.get('waterway') != 'riverbank':
        ln = way_line(e)
        if ln.length > 15:
            # clip to the model box: canals and the river centreline that run out of the mapped
            # area would otherwise render as thin raised-water ribbons radiating out from the city
            for seg in lines_of(ln.intersection(MODEL_BOX)):
                if len(seg.coords) >= 2:
                    streams.append({'w': 3, 'p': [v for x, z in seg.coords for v in (dm(x), dm(z))]})

# ---- trees
tree_pts = [proj(e['lat'], e['lon']) for e in osm if e['type'] == 'node' and e.get('tags', {}).get('natural') == 'tree']

# ---- named places (labels)
named = []
for e in osm:
    if e['type'] != 'node':
        continue
    t = e.get('tags', {})
    if t.get('place') in ('suburb', 'quarter', 'neighbourhood', 'hamlet', 'village', 'city', 'town'):
        x, z = proj(e['lat'], e['lon'])
        named.append({'t': t.get('name'), 'x': x, 'z': z, 'big': t.get('place') in ('city', 'town', 'suburb', 'quarter')})
    elif t.get('amenity') in ('stadium', 'theatre', 'museum', 'library', 'townhall') and t.get('name'):
        x, z = proj(e['lat'], e['lon'])

        named.append({'t': t['name'], 'x': x, 'z': z, 'big': False})

print(f'OSM: {len(water_polys)} water ways -> {len(big_water)} big + {len(small_water)} small water, '
      f'{len(limits_polys)} land outlines, {len(green)} parks, {len(lines)} streets/paths/rail, '
      f'{len(streams)} streams, {len(tree_pts)} tree nodes, {len(named)} named places')

# ---------------------------------------------------------------- buildings (Overture)
def hashf(s):
    h = 0
    for ch in s:
        h = (h * 131 + ord(ch)) % 997
    return h / 997


def est_height(nf, ms, area, downtown):
    """metres; num_floors and the ML height from Overture (both may be empty)"""
    if nf:
        return float(nf) * 3.3 + 1
    if ms and ms > 20:
        return ms                                   # a real tower: trust it
    if ms and ms > 0:
        return ms * 1.25                            # ML heights run low on houses
    if area < 22:
        return 2.6
    if area < 55:
        return 3.2
    if downtown:
        return max(8.5, min(16, (ms or 6) * 1.7))   # two- and three-storey brick blocks
    if area > 900:
        return max(6, min(14, (ms or 6) * 1.4))     # schools, plants, warehouses
    return max(5.5, min(11, (ms or 5) * 1.5))       # houses


# the CBD, where the taller blocks stand
CBD = prep(xy_box(-90.0750, 29.9500, -90.0520, 29.9620))


def wkt_to_m(w):
    """Overture WKT is (lon, lat) degrees; return the footprint in the metre frame, or None"""
    try:
        g = swkt.loads(w)
    except Exception:
        return None
    if g.is_empty or not isinstance(g, Polygon):
        return None
    t = lambda x, y: ((x - LON0) * MX, -(y - LAT0) * MZ)
    return Polygon([t(x, y) for x, y in g.exterior.coords],
                   [[t(x, y) for x, y in h.coords] for h in g.interiors])


core_b, outer = [], []
with open(os.path.join(SRC, 'buildings.csv'), newline='') as f:
    for r in csv.DictReader(f):
        p = wkt_to_m(r['wkt'])
        if p is None:
            continue
        if not p.is_valid:
            p = p.buffer(0)
            if not isinstance(p, Polygon):
                continue
        p = p.simplify(.3)
        if p.is_empty or p.area < 8:
            continue
        c = p.centroid
        if not MODEL_BOX.contains(c) or water_union.contains(c):
            continue
        ms = float(r['height']) if r['height'] else 0
        h = est_height(r['num_floors'], ms, p.area, CBD.contains(c))
        h = min(max(h, 2.5), 130)
        if CORE_BOX.contains(c):
            core_b.append([dm(h), 0] + poly_rings(p))
        else:
            outer.append((p, h))

# ---- the outer footprints as PHB1: clean low-rise rectangles as boxes, the rest as outlines
def fit_box(p, h):
    """(cx, cz, w, d, yaw, area) for a clean low-rise footprint, or None"""
    ring = list(p.exterior.coords)
    if ring[0] == ring[-1]:
        ring = ring[:-1]
    if len(ring) < 4:
        return None
    pts = [(float(x), float(z)) for x, z in ring]
    edge = max(((pts[(i + 1) % len(pts)][0] - p[0], pts[(i + 1) % len(pts)][1] - p[1]) for i, p in enumerate(pts)),
               key=lambda v: v[0] * v[0] + v[1] * v[1])
    if edge[0] ** 2 + edge[1] ** 2 < 16:
        return None
    phi = math.atan2(edge[1], edge[0])
    c, s = math.cos(phi), math.sin(phi)
    uv = [(x * c + z * s, -x * s + z * c) for x, z in pts]
    u0, u1 = min(q[0] for q in uv), max(q[0] for q in uv)
    v0, v1 = min(q[1] for q in uv), max(q[1] for q in uv)
    w, d = u1 - u0, v1 - v0
    boxarea = w * d
    if boxarea < 24 or boxarea > 1400 or min(w, d) < 4.0 or max(w, d) > 60 or max(w, d) / max(.01, min(w, d)) > 6:
        return None
    area = abs(sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))) / 2
    if area / boxarea < .92:
        return None
    if max(min(abs(u - u0), abs(u - u1), abs(v - v0), abs(v - v1)) for u, v in uv) > .4:
        return None
    if h > 13:
        return None
    cu, cv = (u0 + u1) / 2, (v0 + v1) / 2
    return cu * c - cv * s, cu * s + cv * c, w, d, -phi


boxes, polys = [], []
for p, h in outer:
    b = fit_box(p, h)
    k = 0 if p.area < 400 else 1        # 0 rowhouse (brick), 1 other (office palette)
    if b:
        cx, cz, w, d, yaw = b
        boxes.append([dm(cx), dm(cz), dm(w), dm(d), int(round((yaw % math.pi) / math.pi * 65535)) & 65535, dm(h), k])
    else:
        polys.append([poly_rings(p)[0], dm(h), k])

# ---------------------------------------------------------------- transit (RTA streetcars)
# the route relations, grouped by their NORTA ref; the forward relation traces the line
LINES = {
    '2':  ('A', 'A · Arts',            '#e31837'),
    '47': ('B', 'B · Broad',           '#00843d'),
    '48': ('C', 'C · Cleveland',       '#0057b8'),
    '12': ('D', 'D · DC Street',       '#6a0dad'),
    '46': ('E', 'E · Esplanade',       '#f7941e'),
    '49': ('Canal', 'Canal Street',    '#f2c200'),
}
route_rels = [r for r in RELS if r.get('tags', {}).get('route') in ('tram', 'light_rail')
              and r['tags'].get('ref') in LINES]
# keep one relation per ref (prefer the one with more ways)
by_ref = {}
for r in route_rels:
    ref = r['tags']['ref']
    n = sum(1 for m in r['members'] if m['type'] == 'way' and m.get('role') in ('', 'forward'))
    if ref not in by_ref or n > by_ref[ref][0]:
        by_ref[ref] = (n, r)


def trace_line(way_ids):
    """ordered [x, z] metres along the line, from one terminus to the other"""
    lines = [way_line(WAYS[wid]) for wid in way_ids if wid in WAYS]
    if not lines:
        return None
    merged = linemerge(lines)
    segs = sorted(lines_of(merged), key=lambda l: -l.length)
    if not segs:
        return None
    main = segs[0]
    rest = segs[1:]
    close = lambda a, b: math.dist(a, b) < 4
    for _ in range(len(rest)):          # attach any piece that shares an endpoint with the line
        if not rest:
            break
        c0, c1 = main.coords[0], main.coords[-1]
        attached = False
        for i, s in enumerate(rest):
            sc = list(s.coords)
            if close(sc[0], c1):
                main = LineString(list(main.coords) + sc[1:]); rest.pop(i); attached = True; break
            if close(sc[-1], c1):
                main = LineString(list(main.coords) + sc[::-1][1:]); rest.pop(i); attached = True; break
            if close(sc[0], c0):
                main = LineString(sc[1:] + list(main.coords)); rest.pop(i); attached = True; break
            if close(sc[-1], c0):
                main = LineString(sc[::-1][1:] + list(main.coords)); rest.pop(i); attached = True; break
        if not attached:
            break
    n = int(main.length / 5) + 1        # densify to ~5 m
    pts = [main.interpolate(main.length * i / (n - 1)) for i in range(n)]
    return [(p.x, p.y) for p in pts]


transit_lines, tracks, runs, stations = [], [], [], []
stop_nodes = [e for e in osm if e['type'] == 'node' and
              (e.get('tags', {}).get('railway') in ('tram_stop', 'station', 'stop') or
               e.get('tags', {}).get('public_transport') == 'platform')]
for ref, (lid, lname, color) in LINES.items():
    if ref not in by_ref:
        continue
    rel = by_ref[ref][1]
    way_ids = [m['ref'] for m in rel['members'] if m['type'] == 'way' and m.get('role') in ('', 'forward')]
    path = trace_line(way_ids)
    if not path or len(path) < 3:
        print(f'  line {lid}: could not trace ({len(way_ids)} ways)')
        continue
    # out-and-back ride loop: to the far end and back to the start
    run_pts = []
    for x, z in path + path[-2::-1]:
        run_pts += [dm(x), dm(z), 9]        # rails at street level sit on the roads (y = +0.9 m)
    runs.append({'line': lid, 'p': run_pts})
    transit_lines.append({'id': lid, 'name': lname, 'kind': 'trolley', 'color': color})
    # the physical track: the line's centreline
    tracks.append({'k': 'trolley', 'p': [v for x, z in path for v in (dm(x), dm(z), 9)]})
    # the stops on this line
    line_geom = LineString(path)
    for s in stop_nodes:
        x, z = proj(s['lat'], s['lon'])
        if line_geom.distance(Point(x, z)) < 40:
            stations.append({'t': s['tags'].get('name') or f'{lid} stop', 'x': round(x), 'z': round(z),
                             'k': ['trolley'], 'lines': [lid]})
    print(f'  line {lid}: {len(path)} points, {len(path) and round(math.dist(path[0], path[-1]) / 1000, 2)} km')
# merge stops that share a name and are close (one station per physical stop)
merged = []
for s in stations:
    hit = next((o for o in merged if o['t'] == s['t'] and math.hypot(o['x'] - s['x'], o['z'] - s['z']) < 60), None)
    if hit:
        for l in s['lines']:
            if l not in hit['lines']:
                hit['lines'].append(l)
        continue
    merged.append(s)
order = [l['id'] for l in transit_lines]
for s in merged:
    s['lines'].sort(key=order.index)
print(f'transit: {len(transit_lines)} lines, {len(tracks)} tracks, {len(runs)} runs, {len(merged)} stations')

print(f'city buildings: {len(boxes)} boxes, {len(polys)} outlines')

print(f'buildings: {len(core_b)} in the core, {len(outer)} outside (of the Overture footprints)')

# ---------------------------------------------------------------- park trees
# street trees are the OSM tree nodes; parks get trees scattered inside them (kept off streets
# and buildings). Both are written as flat [x, z, ...] dm.
street_trees = [p for p in tree_pts if MODEL_BOX.contains(Point(*p))]
park_trees = []
if green_union is not None:
    street_union = unary_union([l['_ln'] for l in lines if l['k'] == 0]) if lines else None
    for kind, p in green:
        if kind not in (0, 1):          # parks and grass/woods get trees; pitches and cemeteries don't
            continue
        n = min(400, int(p.area / 900))
        placed = 0
        for _ in range(n * 4):
            if placed >= n:
                break
            x = random.uniform(p.bounds[0], p.bounds[2])
            z = random.uniform(p.bounds[1], p.bounds[3])
            pt = Point(x, z)
            if not p.contains(pt):
                continue
            if street_union is not None and street_union.distance(pt) < 6:
                continue
            park_trees.append((x, z))
            placed += 1
all_trees = street_trees + park_trees
print(f'trees: {len(street_trees)} street, {len(park_trees)} park')

# ---------------------------------------------------------------- places (labels and views)
def V(px, pz, py, tx, tz, ty):
    return {'pos': [round(px), round(py), round(pz)], 'target': [round(tx), round(ty), round(tz)]}


labels = []
seen_names = set()
for n in named:
    if n['t'] in seen_names:
        continue
    seen_names.add(n['t'])
    labels.append({'t': n['t'], 'x': round(n['x'], 1), 'z': round(n['z'], 1),
                   'y': 70 if n['big'] else 22, 'far': 9000 if n['big'] else 4000})
# a few fixed landmarks the OSM place nodes miss
for t, x, z, y, far in [
    ('French Quarter', *proj(29.9580, -90.0650), 70, 9000),
    ('Central Business District', *proj(29.9520, -90.0710), 70, 9000),
    ('Garden District', *proj(29.9320, -90.0700), 70, 9000),
    ('City Park', *proj(29.9680, -90.0900), 70, 9000),
    ('Lakefront', *proj(29.9850, -90.0200), 70, 9000),
    ('St. Charles Avenue', *proj(29.9520, -90.0950), 22, 4000),
    ('Cathedral of St. Louis', *proj(29.9575, -90.0645), 40, 3000),
    ('Crescent City Connection', *proj(29.9480, -89.9950), 40, 4000),
]:
    if t not in seen_names:
        seen_names.add(t)
        labels.append({'t': t, 'x': round(x, 1), 'z': round(z, 1), 'y': y, 'far': far})

views = [
    {'id': 'french-quarter', 'name': 'French Quarter', **V(*proj(29.9595, -90.0600), 120, *proj(29.9570, -90.0655), 5)},
    {'id': 'cbd', 'name': 'Central Business District', **V(*proj(29.9470, -90.0780), 150, *proj(29.9530, -90.0690), 10)},
    {'id': 'garden', 'name': 'Garden District', **V(*proj(29.9280, -90.0760), 110, *proj(29.9330, -90.0690), 5)},
    {'id': 'city-park', 'name': 'City Park', **V(*proj(29.9720, -90.0960), 130, *proj(29.9680, -90.0890), 5)},
    {'id': 'lakefront', 'name': 'Lakefront', **V(*proj(29.9880, -90.0300), 120, *proj(29.9840, -90.0180), 5)},
    {'id': 'river', 'name': 'Mississippi River', **V(*proj(29.9500, -90.0100), 90, *proj(29.9520, -89.9950), 0)},
    {'id': 'overview', 'name': 'Overview', **V(*proj(29.9750, -90.1000), 600, *proj(29.9500, -90.0600), 0)},
]
print(f'places: {len(labels)} labels, {len(views)} views')

# ---------------------------------------------------------------- the proposed monorail
# an illustrative elevated loop along the Mississippi riverfront, from the CBD to the Lakefront
MONO = {
    'name': 'Mississippi Riverfront Monorail',
    'description': 'Illustrative elevated loop linking the Central Business District, the riverfront and the Lakefront.',
    'height': 18, 'speed': 22,
    'routes': [{
        'id': 'riverfront-loop', 'name': 'Riverfront Loop', 'color': '#d6452f', 'closed': True,
        'supportInterval': 36, 'trainSpacing': 2300, 'cars': 3,
        'path': [
            [6100, 1600], [6400, 900], [6650, 0], [6850, -1100], [7000, -2300], [7050, -3200],
            [6600, -3100], [6200, -2400], [6000, -1400], [5950, -300], [6000, 700],
        ],
        'stations': [
            {'name': 'Canal / Riverfront', 'position': [6100, 1600], 'length': 72},
            {'name': 'Arts District', 'position': [6650, 0], 'length': 72},
            {'name': 'Lakefront', 'position': [7050, -3200], 'length': 72},
            {'name': 'City Park', 'position': [6200, -2400], 'length': 72},
        ],
    }],
}
print('monorail: 1 route (the riverfront loop)')




# ---------------------------------------------------------------- write
os.makedirs(OUT, exist_ok=True)


def wjson(name, obj):
    json.dump(obj, open(os.path.join(OUT, name), 'w'), separators=(',', ':'))


def wgz(name, raw):
    with gzip.GzipFile(os.path.join(OUT, name), 'wb', 9, mtime=0) as f:
        f.write(raw)


# ---- city_buildings.bin.gz (PHB1)
boxes.sort(key=lambda b: (b[0], b[1]))          # sort so the delta-encoded x, z stay small
nB, nP = len(boxes), len(polys)
nV = sum(len(p[0]) // 2 for p in polys)
bx = [b[0] for b in boxes]
bz = [b[1] for b in boxes]
prev_x, prev_z = bx[0], bz[0]
for i in range(1, nB):          # delta-encode against the previous ORIGINAL value
    cur_x, cur_z = bx[i], bz[i]
    bx[i] = cur_x - prev_x
    bz[i] = cur_z - prev_z
    prev_x, prev_z = cur_x, cur_z
# polygon vertices are delta-encoded per ring (first absolute, then differences), like the
# boxes above and like tools/nyc/import_nyc.py: the engine (js/scene/city.js) decodes them the
# same way, so writing them absolute makes every ring accumulate into a giant starburst.
vx, vz = [], []
for ring, h, k in polys:
    xs, zs = ring[0::2], ring[1::2]
    vx += [xs[0]] + [xs[i] - xs[i - 1] for i in range(1, len(xs))]
    vz += [zs[0]] + [zs[i] - zs[i - 1] for i in range(1, len(zs))]
raw = b'PHB1' + struct.pack('<III', nB, nP, nV)
raw += np.array(bx, dtype='<i4').tobytes() + np.array(bz, dtype='<i4').tobytes()
raw += np.array(vx, dtype='<i4').tobytes() + np.array(vz, dtype='<i4').tobytes()
raw += np.array([b[2] for b in boxes], dtype='<u2').tobytes()
raw += np.array([b[3] for b in boxes], dtype='<u2').tobytes()
raw += np.array([b[4] for b in boxes], dtype='<u2').tobytes()
raw += np.array([b[5] for b in boxes], dtype='<u2').tobytes()
raw += np.array([len(p[0]) // 2 for p in polys], dtype='<u2').tobytes()
raw += np.array([p[1] for p in polys], dtype='<u2').tobytes()
raw += np.array([b[6] for b in boxes], dtype='u1').tobytes()
raw += np.array([p[2] for p in polys], dtype='u1').tobytes()
wgz('city_buildings.bin.gz', raw)

# ---- the rest
core_bbox = [dm(v) for v in CORE_BOX.bounds]
model_bbox = [dm(v) for v in MODEL_BOX.bounds]
city_lines = [{k: v for k, v in l.items() if k != '_ln'} for l in lines]
city = {
    'core': core_bbox, 'bbox': model_bbox,
    'limits': [flat(p.exterior.coords) for p in limits_polys],
    'green': [[k] + poly_rings(p) for k, p in green],
    'lines': city_lines,
    'dams': [],
    'water': [poly_rings(p) for p in (big_water + small_water) if p.area > 50],
    'streams': streams,
    'trees': [v for x, z in all_trees for v in (dm(x), dm(z))],
}
wjson('buildings.json', {'styles': [None], 'b': core_b})
wjson('ground.json', {'bbox': core_bbox, 'green': [], 'lines': []})
wjson('river.json', {'water': [], 'river': [], 'center': [], 'dams': []})
wjson('trees.json', [v for x, z in all_trees for v in (dm(x), dm(z))])
wjson('transit.json', {'lines': transit_lines, 'tracks': tracks, 'runs': runs, 'platforms': [],
                       'stations': merged, 'entrances': [], 'sections': []})
wjson('places.json', {'labels': labels, 'views': views})
wjson('monorail.json', MONO)
wgz('city.json.gz', json.dumps(city, separators=(',', ':')).encode())
for f in sorted(os.listdir(OUT)):
    print(f'  {f:24s} {os.path.getsize(os.path.join(OUT, f)) / 1024:8.0f} KB')
