"""Build Jersey Shore, PA's data (data/jsh/) from the raw sources in tools/jsh/src/.

    python -m pip install shapely numpy pillow pyproj
    python -I tools/jsh/fetch_jsh.py          # once, or to refresh the sources
    python -I tools/jsh/build_jsh.py

Writes, in the shared formats (docs/EDITING.md section 3):
  buildings.json       every footprint in MODEL (Overture: Microsoft ML footprints and OSM),
                       heights estimated (see height()), house siding colours as styles
  ground.json          the downtown block of Allegheny St as the paved core
  river.json, trees.json, transit.json   empty (water and trees are in city.json.gz; no passenger rail)
  city.json.gz         the borough boundary (paved), parks, woods, fields, streets, rail, the
                       West Branch of the Susquehanna, Pine Creek and smaller streams, trees
  city_buildings.bin.gz  empty (every footprint is in buildings.json)
and, for this city only:
  terrain.bin.gz       elevation grid the scene drapes everything over (js/scene/terrain.js)
  places.json          labels and "Go to" views (js/scene/jsh/places.js)
  farms.json.gz        crop fields (USDA Cropland Data Layer), barns and silos (js/scene/jsh/farms.js)
"""
import gzip, json, math, os, random, struct, sys, csv
import numpy as np
from PIL import Image
from shapely import wkt as swkt
from shapely.geometry import Polygon, MultiPolygon, LineString, Point, box
from shapely.ops import unary_union, linemerge, polygonize
from shapely.strtree import STRtree
from shapely.prepared import prep

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SRC, OUT = os.path.join(HERE, 'src'), os.path.join(ROOT, 'data', 'jsh')

sys.path.insert(0, HERE)
from extent import LAT0, LON0, MZ, MX, MODEL, HALF, CELL, BOROUGH  # noqa: E402


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
TERR_BOX = box(-HALF, -HALF, HALF, HALF)

# ---------------------------------------------------------------- OSM
osm = json.load(open(os.path.join(SRC, 'osm.json')))['elements']


def way_line(e):
    return LineString([proj(p['lat'], p['lon']) for p in e['geometry']])


def way_poly(e):
    pts = [proj(p['lat'], p['lon']) for p in e['geometry']]
    if len(pts) < 4:
        return None
    p = Polygon(pts)
    return p if p.is_valid else p.buffer(0)


def rel_poly(e):
    """multipolygon relation (out geom) -> shapely geometry"""
    outer, inner = [], []
    for m in e.get('members', []):
        if m['type'] != 'way' or 'geometry' not in m:
            continue
        ls = LineString([proj(p['lat'], p['lon']) for p in m['geometry'] if p])
        (inner if m.get('role') == 'inner' else outer).append(ls)
    def rings(ls):
        return list(polygonize(linemerge(ls))) if ls else []
    g = unary_union(rings(outer))
    if inner:
        g = g.difference(unary_union(rings(inner)))
    return g


def area_of(e):
    return way_poly(e) if e['type'] == 'way' else rel_poly(e)


tags = lambda e: e.get('tags', {})
limits_geom = None
water_polys, green, lines, streams, wood_polys, tree_nodes, named = [], [], [], [], [], [], []
ROAD_W = {'motorway': 9, 'trunk': 9, 'primary': 9, 'secondary': 8, 'tertiary': 7, 'unclassified': 6, 'residential': 6.5,
          'living_street': 5, 'motorway_link': 5.5, 'primary_link': 6, 'secondary_link': 6, 'tertiary_link': 6, 'service': 4}
TRAIL_W = {'footway': 2, 'path': 1.8, 'cycleway': 2.5, 'track': 3, 'bridleway': 2, 'pedestrian': 4}
GREEN_K = {('leisure', 'park'): 0, ('leisure', 'playground'): 0, ('leisure', 'pitch'): 2, ('leisure', 'track'): 2,
           ('leisure', 'sports_centre'): 2, ('leisure', 'stadium'): 2, ('leisure', 'golf_course'): 1,
           ('landuse', 'grass'): 1, ('landuse', 'recreation_ground'): 1, ('landuse', 'meadow'): 1, ('landuse', 'farmland'): 1,
           ('landuse', 'orchard'): 1, ('natural', 'grassland'): 1, ('landuse', 'cemetery'): 4, ('amenity', 'grave_yard'): 4,
           ('landuse', 'forest'): 3, ('natural', 'wood'): 3, ('natural', 'scrub'): 3}

for e in osm:
    t = tags(e)
    if e['type'] == 'relation' and e['id'] == BOROUGH:
        limits_geom = rel_poly(e)
        continue
    if e['type'] == 'node':
        if t.get('natural') == 'tree':
            tree_nodes.append(proj(e['lat'], e['lon']))
        elif t.get('name'):
            named.append((t, proj(e['lat'], e['lon'])))
        continue
    if t.get('natural') == 'water' or t.get('waterway') == 'riverbank':
        g = area_of(e)
        if g is not None:
            water_polys += polys_of(g.intersection(TERR_BOX))
        continue
    k = next((v for (a, b), v in GREEN_K.items() if t.get(a) == b), None)
    if k is not None and e['type'] in ('way', 'relation'):
        g = area_of(e)
        if g is None or g.is_empty:
            continue
        if k == 3:
            wood_polys += polys_of(g.intersection(TERR_BOX))
        for p in polys_of(g.intersection(MODEL_BOX)):
            if p.area > 30:
                green.append((k, p))
        if t.get('name'):
            named.append((t, g.representative_point().coords[0]))
        continue
    if e['type'] != 'way':
        continue
    if t.get('name') and t.get('amenity') in ('school', 'townhall', 'library', 'place_of_worship'):
        named.append((t, way_poly(e).representative_point().coords[0] if way_poly(e) else way_line(e).coords[0]))
    hw, rw, ww = t.get('highway'), t.get('railway'), t.get('waterway')
    if t.get('area') == 'yes' or hw in ('steps', 'construction', 'proposed', 'platform', 'elevator', 'corridor'):
        continue
    kind = w = None
    if hw in ROAD_W:
        kind, w = 0, ROAD_W[hw]
        if hw == 'service' and t.get('service') in ('parking_aisle', 'driveway'):
            w = 3
    elif hw in TRAIL_W:
        kind, w = 1, TRAIL_W[hw]
    elif rw == 'rail':
        kind, w = 2, 4
    elif ww in ('stream', 'canal', 'drain', 'ditch'):
        g = way_line(e).intersection(MODEL_BOX)
        for ls in lines_of(g):
            streams.append({'w': {'stream': 4, 'canal': 9, 'drain': 2, 'ditch': 1.5}[ww], 'p': [v for c in ls.coords for v in (dm(c[0]), dm(c[1]))]})
        continue
    if kind is None:
        continue
    g = way_line(e).intersection(MODEL_BOX)
    for ls in lines_of(g):
        lines.append({'k': kind, 'w': w, 'b': 1 if t.get('bridge') in ('yes', 'viaduct') else 0,
                      'l': int(t.get('layer', 0) or 0) if str(t.get('layer', '0')).lstrip('-').isdigit() else 0,
                      'p': [v for c in ls.coords for v in (dm(c[0]), dm(c[1]))], '_n': t.get('name', ''), '_hw': hw or rw})

water_union = unary_union(water_polys)
water_polys = polys_of(water_union)
print(f'osm: {len(lines)} lines, {len(green)} green areas, {len(water_polys)} water polygons, {len(streams)} streams')

# ---------------------------------------------------------------- terrain
z = 12
tiles = {}
for f in os.listdir(os.path.join(SRC, 'dem')):
    if f.endswith('.png'):
        _, x, y = f[:-4].split('_')
        a = np.asarray(Image.open(os.path.join(SRC, 'dem', f)).convert('RGB')).astype(np.float64)
        tiles[(int(x), int(y))] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
X0, Y0 = min(k[0] for k in tiles), min(k[1] for k in tiles)
NXT, NYT = max(k[0] for k in tiles) - X0 + 1, max(k[1] for k in tiles) - Y0 + 1
DEM = np.zeros((NYT * 256, NXT * 256))
for (x, y), a in tiles.items():
    DEM[(y - Y0) * 256:(y - Y0 + 1) * 256, (x - X0) * 256:(x - X0 + 1) * 256] = a
n2 = 2 ** z * 256


def dem_at(lat, lon):
    """bilinear elevation (m) at lat/lon arrays"""
    px = (lon + 180) / 360 * n2 - X0 * 256 - .5
    py = (1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2 * n2 - Y0 * 256 - .5
    i, j = np.floor(px).astype(int), np.floor(py).astype(int)
    fx, fy = px - i, py - j
    i = np.clip(i, 0, DEM.shape[1] - 2); j = np.clip(j, 0, DEM.shape[0] - 2)
    a, b, c, d = DEM[j, i], DEM[j, i + 1], DEM[j + 1, i], DEM[j + 1, i + 1]
    return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy


N = 2 * HALF // CELL + 1
gx = -HALF + np.arange(N) * CELL
GX, GZ = np.meshgrid(gx, gx)                      # [j (z), i (x)]
H = dem_at(LAT0 - GZ / MZ, LON0 + GX / MX)
# smooth a little: the tiles' 29 m pixels are noisy at 40 m
k = np.array([1, 2, 1]) / 4
H = np.apply_along_axis(lambda r: np.convolve(np.pad(r, 1, mode='edge'), k, 'valid'), 1, H)
H = np.apply_along_axis(lambda r: np.convolve(np.pad(r, 1, mode='edge'), k, 'valid'), 0, H)

# water mask on the grid: inside any water polygon (the river, Pine Creek, ponds)
from shapely import contains_xy  # noqa: E402
wet = contains_xy(water_union, GX.ravel(), GZ.ravel()).reshape(GX.shape) if not water_union.is_empty else np.zeros(GX.shape, bool)
# BASE: the river surface by town = y 0 in the scene
near = wet & (np.hypot(GX, GZ) < 4000)
BASE = float(np.percentile(H[near], 20)) if near.any() else float(H.min())
print(f'terrain: {N} x {N} at {CELL} m, river level by town {BASE:.1f} m, top {H.max():.0f} m')
# carve every water cell to just under the lowest water around it, so banks never poke through
from numpy.lib.stride_tricks import sliding_window_view  # noqa: E402
Hw = np.where(wet, H, np.inf)
R = 4
pad = np.pad(Hw, R, constant_values=np.inf)
lowest = sliding_window_view(pad, (2 * R + 1, 2 * R + 1)).min(axis=(2, 3))
H = np.where(wet, np.minimum(H, np.where(np.isfinite(lowest), lowest, H)) - 1.5, H)
# the valley floor stays where the data is drawn; the grid fades to 0 over its last 1.5 km
edge = np.maximum(np.abs(GX), np.abs(GZ))
fade = np.clip((HALF - edge) / 1500, 0, 1)
Hrel = (H - BASE) * fade
# land cover per vertex: 1 = forest (OSM woods; outside them, steep slopes), 0 = open
gzs, gxs = np.gradient(H, CELL)
slope = np.hypot(gxs, gzs)
woods_u = unary_union(wood_polys)
forest = contains_xy(woods_u, GX.ravel(), GZ.ravel()).reshape(GX.shape) if not woods_u.is_empty else np.zeros(GX.shape, bool)
inside_model = contains_xy(MODEL_BOX, GX.ravel(), GZ.ravel()).reshape(GX.shape)
forest = np.where(inside_model, forest, slope > .12)
cover = np.where(wet, 2, forest.astype(int)).astype(np.uint8)   # 2 = water bed


def h_at(x, z_):
    """terrain height (m above BASE) as the scene computes it (js/scene/terrain.js): the grid's triangles"""
    u, v = (x + HALF) / CELL, (z_ + HALF) / CELL
    i, j = min(N - 2, max(0, int(u))), min(N - 2, max(0, int(v)))
    fu, fv = u - i, v - j
    h00, h10, h01, h11 = Hq[j, i], Hq[j, i + 1], Hq[j + 1, i], Hq[j + 1, i + 1]
    if fu >= fv:
        return h00 + fu * (h10 - h00) + fv * (h11 - h10)
    return h00 + fv * (h01 - h00) + fu * (h11 - h01)


Hq = np.round(Hrel * 10).astype(np.int16) / 10

# ---------------------------------------------------------------- buildings
rows = list(csv.DictReader(open(os.path.join(SRC, 'buildings.csv'), encoding='utf-8')))
hashf = lambda s: (int.from_bytes(s.encode()[:8].ljust(8, b'0'), 'little') * 2654435761 % 2 ** 32) / 2 ** 32
downtown_lines = [LineString(pairs) for pairs in
                  ([(l['p'][i] / 10, l['p'][i + 1] / 10) for i in range(0, len(l['p']), 2)] for l in lines
                   if l['_n'] in ('Allegheny Street', 'North Main Street', 'South Main Street', 'Thomas Street', 'Smith Street'))]
downtown = unary_union([ls.intersection(Point(0, 0).buffer(650)).buffer(42) for ls in downtown_lines])
# house siding: white and pale clapboard, some brick (style kind "row": punched windows)
HOUSE = ['#e8e5dc', '#ece9e1', '#dcd6c4', '#d8cfae', '#c9cfc9', '#b8c3c6', '#c7c9b4', '#e2d6bd', '#9a5a45', '#a7a197', '#d3c4a2', '#bfb9ad']
styles = [None] + [{'id': f'house{i}', 'color': c, 'kind': 'row'} for i, c in enumerate(HOUSE)]
blds, foot, info = [], [], []
for r in rows:
    g = swkt.loads(r['wkt'])
    for p in polys_of(g):
        p = Polygon([proj(y, x) for x, y in p.exterior.coords], [[proj(y, x) for x, y in h.coords] for h in p.interiors])
        if not p.is_valid:
            p = p.buffer(0)
            if not isinstance(p, Polygon):
                continue
        p = p.simplify(.3)
        if p.is_empty or p.area < 8 or not MODEL_BOX.contains(p.centroid) or water_union.contains(p.centroid):
            continue
        A, ms, rnd = p.area, float(r['height'] or 0), hashf(r['id'])
        dt = downtown.contains(p.centroid)
        if r['num_floors']:
            h = float(r['num_floors']) * 3.3 + 1
        elif A < 22:
            h = 2.6 + rnd * .6                       # sheds
        elif A < 55:
            h = 3.2 + rnd * .8                       # garages
        elif dt:
            h = max(8.5, min(14, ms * 1.6)) + rnd * 2.5   # two- and three-storey brick blocks on Allegheny St
        elif A > 700:
            h = max(6, min(12, ms * 1.4)) + rnd      # schools, plants, warehouses
        else:
            h = max(5.5, min(10.5, ms * 1.5)) + rnd * 1.5   # houses
        house = not dt and 55 <= A < 400
        style = 1 + int(hashf(r['id'][::-1]) * len(HOUSE)) if house else 0
        blds.append([dm(h), style] + poly_rings(p))
        foot.append(p)
        info.append({'A': A, 'dt': dt, 'cls': r['class'], 'fill': False})
print(f'buildings: {len(blds)}')

# infill: the ML footprints miss many houses in the borough (under trees, on narrow lots). Walk
# every town street and set a house on each stretch of frontage that is still empty (no building,
# street, path, rail, water, park or school ground near it), some with a garage out back.
random.seed(23)
TOWN_HW = ('residential', 'tertiary', 'secondary', 'primary', 'unclassified', 'living_street')
town_lines = [LineString([(l['p'][i] / 10, l['p'][i + 1] / 10) for i in range(0, len(l['p']), 2)]) for l in lines
              if l['k'] == 0 and l['_hw'] in TOWN_HW and not l['b']]
grounds = [way_poly(e) for e in osm if e['type'] == 'way' and tags(e).get('amenity') in ('school', 'place_of_worship', 'parking')]
keep_out = unary_union(
    [p.buffer(2.5) for p in foot] +
    [LineString([(l['p'][i] / 10, l['p'][i + 1] / 10) for i in range(0, len(l['p']), 2)]).buffer(l['w'] / 2 + (8 if l['k'] == 2 else 1.5))
     for l in lines] +
    [g for _, g in green] + [water_union.buffer(4)] + [g for g in grounds if g is not None] +
    [p.buffer(35) for p in foot if p.area > 700] + [downtown])
keep_p, town_p = prep(keep_out), prep(limits_geom.buffer(-6))
added = []


def lot(cx, cz, ux, uz, w, d):
    """rectangle w along the street (unit ux, uz), d deep, centred on cx, cz"""
    nx, nz = -uz, ux
    return Polygon([(cx + sx * ux * w / 2 + sz * nx * d / 2, cz + sx * uz * w / 2 + sz * nz * d / 2)
                    for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))])


def free(p):
    return town_p.contains(p) and not keep_p.intersects(p) and not any(q.distance(p) < 2.5 for q in added[-400:])


for ls in town_lines:
    for side in (1, -1):
        s, L = 4.0, ls.length
        while s < L - 4:
            a, b = ls.interpolate(s), ls.interpolate(min(L, s + 1))
            ux, uz = b.x - a.x, b.y - a.y
            n = math.hypot(ux, uz) or 1
            ux, uz = ux / n, uz / n
            nx, nz = -uz * side, ux * side                     # away from the street
            w, d, back = 7 + random.random() * 3, 9 + random.random() * 4, 7 + random.random() * 3
            cx, cz = a.x + nx * (back + d / 2), a.y + nz * (back + d / 2)
            p = lot(cx, cz, ux, uz, w, d)
            if not free(p):
                s += 2
                continue
            added.append(p)
            h = 7 + random.random() * 2.5
            blds.append([dm(h), 1 + int(random.random() * len(HOUSE))] + poly_rings(p))
            foot.append(p)
            info.append({'A': p.area, 'dt': False, 'cls': '', 'fill': True})
            if random.random() < .4:                           # a garage on the alley
                gc = (cx + nx * (d / 2 + 9), cz + nz * (d / 2 + 9))
                g = lot(gc[0], gc[1], ux, uz, 6 + random.random() * 1.5, 6.5)
                if free(g):
                    added.append(g)
                    blds.append([dm(3.4), 0] + poly_rings(g))
                    foot.append(g)
                    info.append({'A': g.area, 'dt': False, 'cls': '', 'fill': True})
            s += w + 2.5 + random.random() * 2.5
print(f'buildings: {len(added)} infilled on empty frontage, {len(blds)} in all')
foot_tree = STRtree(foot)

# ---------------------------------------------------------------- trees
random.seed(7)
road_geoms = [LineString([(l['p'][i] / 10, l['p'][i + 1] / 10) for i in range(0, len(l['p']), 2)]).buffer(l['w'] / 2 + 2.5)
              for l in lines if l['k'] in (0, 2)]
blocked = unary_union(road_geoms + [p.buffer(3) for p in foot] + [water_union.buffer(4)])
blocked_p = prep(blocked)
# ---------------------------------------------------------------- farms: crop fields, barns, silos
# USDA NASS Cropland Data Layer (src/cdl.png, 30 m classes in EPSG:5070) -> field outlines by crop
from pyproj import Transformer  # noqa: E402
from shapely.ops import transform as stransform  # noqa: E402
cdl = np.asarray(Image.open(os.path.join(SRC, 'cdl.png')))
cdl_meta = json.load(open(os.path.join(SRC, 'cdl.json')))
ca, _, cx0, _, ce, cy0 = cdl_meta['transform']
to_ll = Transformer.from_crs('EPSG:5070', 'EPSG:4326', always_xy=True)
to_alb = Transformer.from_crs('EPSG:4326', 'EPSG:5070', always_xy=True)
CROPS = {'corn': {1, 12, 13, 225, 226, 228, 237, 241}, 'soy': {5, 26, 239, 240, 254},
         'grain': {21, 22, 23, 24, 25, 27, 28, 29, 205, 236}, 'hay': {36, 37, 58, 59, 60},
         'veg': {4, 6, 42, 43, 44, 47, 48, 49, 53, 54, 57, 61, 69, 206, 207, 208, 209, 213, 214, 216, 219, 221, 222, 229, 243, 244, 245, 246, 247, 248, 249, 250}}
group = np.zeros(cdl.shape, np.uint8)       # 0 none, 1.. CROPS order, 6 pasture
for gi, codes in enumerate(CROPS.values(), 1):
    group[np.isin(cdl, list(codes))] = gi
group[cdl == 176] = 6
# majority filter (3 x 3) so single stray pixels don't make fields
pad = np.pad(group, 1)
win = sliding_window_view(pad, (3, 3)).reshape(group.shape + (9,))
counts = np.stack([(win == g).sum(-1) for g in range(7)], -1)
group = np.where(counts.max(-1) >= 5, counts.argmax(-1), group).astype(np.uint8)


def alb_to_local(x, y):
    lon, lat = to_ll.transform(x, y)
    return ((np.asarray(lon) - LON0) * MX, -(np.asarray(lat) - LAT0) * MZ)


# pixel window over MODEL
mx = [to_alb.transform(lo, la) for lo in (MODEL[0], MODEL[2]) for la in (MODEL[1], MODEL[3])]
c0, c1 = int((min(p[0] for p in mx) - cx0) / ca) - 2, int((max(p[0] for p in mx) - cx0) / ca) + 2
r0, r1 = int((max(p[1] for p in mx) - cy0) / ce) - 2, int((min(p[1] for p in mx) - cy0) / ce) + 2
keep_out = unary_union([water_union] + road_geoms + [p.buffer(4) for p in foot]
                       + [p for k, p in green if k in (0, 2, 3, 4)] + [woods_u.intersection(MODEL_BOX)])
fields, farm_any = [], []
for gi, name in enumerate(list(CROPS) + ['pasture'], 1):
    boxes = [box(cx0 + c * ca, cy0 + (r + 1) * ce, cx0 + (c + 1) * ca, cy0 + r * ce)
             for r in range(r0, r1) for c in range(c0, c1) if group[r, c] == gi]
    if not boxes:
        continue
    g = stransform(alb_to_local, unary_union(boxes)).intersection(MODEL_BOX)
    farm_any.append(g)
    if name == 'pasture':
        continue                                 # pasture stays open grass
    # pixel stairs -> straight field edges: close small gaps, open thin spurs, then simplify the steps away
    g = g.buffer(15).buffer(-30).buffer(15).simplify(16).buffer(-4, join_style=2).buffer(4, join_style=2).difference(keep_out)
    for p in polys_of(g):
        p = p.buffer(-1.5).buffer(1.5)
        for q in polys_of(p):
            if q.area < 2500:
                continue
            rr = list(q.minimum_rotated_rectangle.exterior.coords)
            e1, e2 = (rr[1][0] - rr[0][0], rr[1][1] - rr[0][1]), (rr[2][0] - rr[1][0], rr[2][1] - rr[1][1])
            ex, ez = e1 if math.hypot(*e1) >= math.hypot(*e2) else e2
            fields.append({'k': name, 'a': round(math.atan2(ez, ex), 3), 's': round(random.random(), 3), 'p': poly_rings(q)})
# a seed-corn block in the biggest corn field (js/scene/jsh/detassel.js): sets of four female rows,
# each between two taller male rows, down which a detasseling crew walks in July
SEED_SETS, SEED_LEN, ROW_W = 4, 120.0, .76
seed = None
corn = [(i, Polygon([(f['p'][0][k] / 10, f['p'][0][k + 1] / 10) for k in range(0, len(f['p'][0]), 2)],
                    [[(h[k] / 10, h[k + 1] / 10) for k in range(0, len(h), 2)] for h in f['p'][1:]])) for i, f in enumerate(fields) if f['k'] == 'corn']
if corn:
    fi, fp = max(corn, key=lambda c: c[1].area)
    a = fields[fi]['a']; ux, uz = math.cos(a), math.sin(a); vx, vz = -uz, ux
    rows = SEED_SETS * 5 + 1; W = (rows - 1) * ROW_W
    def block(cx, cz, mu=0, mv=0):
        hl, hw = SEED_LEN / 2 + mu, W / 2 + mv
        return Polygon([(cx + ux * su * hl + vx * sv * hw, cz + uz * su * hl + vz * sv * hw) for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
    inner = fp.buffer(-12)
    best = None
    x0, z0, x1, z1 = inner.bounds
    for cx in np.arange(x0, x1, 15):
        for cz in np.arange(z0, z1, 15):
            if inner.contains(block(cx, cz, 14, 4)):
                d = inner.exterior.distance(Point(cx, cz))
                if best is None or d > best[0]:
                    best = (d, cx, cz)
    if best:
        _, cx, cz = best
        seed = {'x': round(float(cx), 1), 'z': round(float(cz), 1), 'a': a, 'len': SEED_LEN, 'sets': SEED_SETS, 'row': ROW_W, 's': fields[fi]['s']}   # s: its field's planting group
        # the field keeps its outline: its canopy covers the block from afar, and near the camera
        # js/scene/jsh/cornlod.js leaves the block and its 8 m headlands to detassel.js
        print(f'farms: seed-corn block at ({cx:.0f}, {cz:.0f}), {SEED_SETS} sets of 4 female rows')
farm_ctx = prep(unary_union(farm_any).buffer(150)) if farm_any else None
blocked = unary_union([blocked] + [Polygon([(f['p'][0][i] / 10, f['p'][0][i + 1] / 10) for i in range(0, len(f['p'][0]), 2)]) for f in fields])
blocked_p = prep(blocked)
print(f'farms: {len(fields)} fields (' + ', '.join(f"{k} {sum(1 for f in fields if f['k'] == k)}" for k in CROPS) +
      f'), {sum(Polygon([(f["p"][0][i] / 10, f["p"][0][i + 1] / 10) for i in range(0, len(f["p"][0]), 2)]).area for f in fields) / 1e6:.2f} km2')

# barns: big farm buildings outside the borough, near fields and pasture, away from house clusters;
# silos: small round footprints beside them. Both are modelled in js/scene/jsh/farms.js instead.
SILO_ROUND = .62
BARN_WALL = ['#8e2f25', '#8e2f25', '#9b3a2c', '#7e2a22', '#e6e2d8', '#d9d3c4', '#8a8173', '#a33d2e']
BARN_ROOF = ['#4d5256', '#3d4245', '#5a5e60', '#3f5a45', '#6b3a2e', '#7a7f82']
POLE_WALL = ['#d9d6cc', '#b9bcb8', '#c8b99a', '#8f2f27', '#e4e2da']
barns, silos, drop = [], [], set()
centroids = [p.centroid for p in foot]
cent_tree = STRtree(centroids)
for i, p in enumerate(foot):
    c, A = centroids[i], p.area
    if A < 140 or A > 1800 or farm_ctx is None or limits_geom.contains(c) or downtown.contains(c) or not farm_ctx.contains(c):
        continue
    rr = list(p.minimum_rotated_rectangle.exterior.coords)
    s1, s2 = math.dist(rr[0], rr[1]), math.dist(rr[1], rr[2])
    w, d = max(s1, s2), min(s1, s2)
    if d < 6 or not (A >= 240 or w / d >= 1.7):
        continue
    if any(math.hypot(c.x - x, c.y - z_) < 80 for t, (x, z_) in named if t.get('amenity') or t.get('leisure')):
        continue                                 # a church, school or park building
    if len(cent_tree.query(c.buffer(120))) > 10:
        continue                                 # a cluster of houses, not a farmstead
    ex, ez = (rr[1][0] - rr[0][0], rr[1][1] - rr[0][1]) if s1 >= s2 else (rr[2][0] - rr[1][0], rr[2][1] - rr[1][1])
    rnd = random.random()
    pole = A > 900 or w / d > 3.2
    barns.append({'x': round(c.x, 1), 'z': round(c.y, 1), 'w': round(w, 1), 'd': round(d, 1), 'ry': round(math.atan2(-ez, ex), 3),
                  't': 'pole' if pole else 'gambrel' if rnd < .7 else 'gable',
                  'c': random.choice(POLE_WALL if pole else BARN_WALL), 'r': random.choice(BARN_ROOF)})
    drop.add(i)
for i, p in enumerate(foot):
    c, A = centroids[i], p.area
    if i in drop or not 10 <= A <= 90:
        continue
    rmax = max(math.dist((c.x, c.y), q) for q in p.exterior.coords)
    if A / (math.pi * rmax * rmax) < SILO_ROUND or not any(math.hypot(b['x'] - c.x, b['z'] - c.y) < 70 for b in barns):
        continue
    r = math.sqrt(A / math.pi)
    silos.append({'x': round(c.x, 1), 'z': round(c.y, 1), 'r': round(r, 2), 'h': round(10 + r * 3 + random.random() * 4, 1),
                  'c': random.choice(['#c9c4b8', '#b8b2a5', '#d5d0c4', '#5b6f8a', '#8e3a2c'])})
    drop.add(i)
print(f'farms: {len(barns)} barns, {len(silos)} silos')

# what each remaining building is, for js/scene/jsh/town.js, which gives it a shape of its own:
# pitched roofs, porches and chimneys on houses, storefronts and cornices downtown, steeples on
# churches, metal sheds at the mills. Per building: [type, x, z, w, d, angle] (dm, dm, dm, dm,
# mrad): the footprint's best-fit rectangle with its front (+d) turned to the nearest street.
JTYPES = ['shed', 'garage', 'house', 'brick', 'ranch', 'cape', 'trailer', 'block', 'church', 'school', 'mill', 'big', 'store']
CHURCH_WORDS = ('church', 'chapel', 'lutheran', 'methodist', 'baptist', 'presbyterian', 'catholic', 'episcopal', 'brethren')
churches = [Point(xy) for t, xy in named if t.get('amenity') == 'place_of_worship' or
            any(w in t.get('name', '').lower() for w in CHURCH_WORDS)]
schools = [Point(xy) for t, xy in named if t.get('amenity') == 'school' or 'school' in t.get('name', '').lower()]
street_geoms = [LineString([(l['p'][i] / 10, l['p'][i + 1] / 10) for i in range(0, len(l['p']), 2)]) for l in lines
                if l['k'] == 0 and l['_hw'] not in ('motorway', 'motorway_link', 'service')]
street_tree = STRtree(street_geoms)
borough_p = prep(limits_geom)
# the business blocks: Allegheny St from about Broad St to past Main, and Main St by the corner
def named_lines(test):
    return [LineString([(l['p'][i] / 10, l['p'][i + 1] / 10) for i in range(0, len(l['p']), 2)]) for l in lines if test(l['_n'])]


shops_p = prep(unary_union([ls.intersection(box(-330, -120, 90, 80)).buffer(26) for ls in named_lines(lambda n: n == 'Allegheny Street')] +
                           [ls.intersection(Point(0, 0).buffer(140)).buffer(24) for ls in named_lines(lambda n: n.endswith('Main Street'))]))
jmeta, kept = [], []
for i, p in enumerate(foot):
    if i in drop:
        continue
    kept.append(blds[i])
    c, A, inf = centroids[i], p.area, info[i]
    rr = list(p.minimum_rotated_rectangle.exterior.coords)
    e1 = (rr[1][0] - rr[0][0], rr[1][1] - rr[0][1])
    e2 = (rr[2][0] - rr[1][0], rr[2][1] - rr[1][1])
    l1, l2 = math.hypot(*e1) or 1, math.hypot(*e2) or 1
    fill_ratio = A / (l1 * l2)
    # the front: toward the nearest street within 45 m, else across the short side
    j = street_tree.nearest(c)
    sd = street_geoms[j].distance(c)
    if sd < 45:
        q = street_geoms[j].interpolate(street_geoms[j].project(c))
        fx, fz = q.x - c.x, q.y - c.y
    else:
        fx, fz = (e1 if l1 < l2 else e2)
    # depth axis: whichever rectangle side lines up best with the front
    if abs(e1[0] * fx + e1[1] * fz) / l1 >= abs(e2[0] * fx + e2[1] * fz) / l2:
        dax, d, w = e1, l1, l2
    else:
        dax, d, w = e2, l2, l1
    sgn = 1 if dax[0] * fx + dax[1] * fz >= 0 else -1
    ang = math.atan2(dax[1] * sgn, dax[0] * sgn)
    k = A / (w * d)                                      # the rectangle, shrunk to the footprint's area
    w, d = w * math.sqrt(k), d * math.sqrt(k)
    rnd = hashf(f'{c.x:.1f},{c.y:.1f}')
    long_ = max(w, d) / max(1, min(w, d))
    in_boro = borough_p.contains(c)
    near = lambda pts, r: any(c.distance(q) < r for q in pts)
    if A < 22:
        t = 'shed'
    elif A < 55 or (A < 90 and long_ > 2.2 and not inf['fill']):
        t = 'garage'
    elif A >= 100 and near(churches, 35):
        t = 'church'
    elif A >= 500 and (inf['cls'] == 'school' or near(schools, 90)):
        t = 'school'
    elif shops_p.contains(c):
        t = 'block'
    elif A < 400:
        if in_boro:
            t = 'brick' if rnd < (.45 if inf['dt'] else .22) else 'house'
        elif long_ > 2.5 and A < 140:
            t = 'trailer'
        else:
            t = 'ranch' if rnd < .45 else 'cape' if rnd < .65 else 'house'
    elif A < 900:
        t = 'big' if in_boro and fill_ratio > .75 and long_ < 2.2 else 'store'
    else:
        t = 'mill'
    jmeta += [JTYPES.index(t), dm(c.x), dm(c.y), dm(w), dm(d), int(round(ang * 1000))]
blds = kept
print('buildings by type: ' + ', '.join(f'{t} {jmeta[0::6].count(k)}' for k, t in enumerate(JTYPES)))

# terrain colour past the mapped area: the Cropland Data Layer's forest and fields
lon_g, lat_g = LON0 + GX / MX, LAT0 - GZ / MZ
ax_, ay_ = to_alb.transform(lon_g.ravel(), lat_g.ravel())
ci = np.clip(((np.asarray(ax_) - cx0) / ca).astype(int), 0, cdl.shape[1] - 1)
ri = np.clip(((np.asarray(ay_) - cy0) / ce).astype(int), 0, cdl.shape[0] - 1)
cls = cdl[ri, ci].reshape(GX.shape)
cdl_forest = np.isin(cls, [141, 142, 143, 152])
cdl_crop = np.isin(cls, list(set().union(*CROPS.values())))
cover = np.where(cover == 2, 2, np.where(inside_model, cover, np.where(cdl_forest, 1, np.where(cdl_crop, 3, 0)))).astype(np.uint8)

trees = list(tree_nodes)
# street trees along residential streets in the borough and around it
lim_buf = limits_geom.buffer(600)
for l in lines:
    if l['_hw'] not in ('residential', 'tertiary', 'secondary', 'unclassified'):
        continue
    ls = LineString([(l['p'][i] / 10, l['p'][i + 1] / 10) for i in range(0, len(l['p']), 2)])
    if not lim_buf.intersects(ls):
        continue
    for s in np.arange(8, ls.length, 22):
        a, b = ls.interpolate(s - 1), ls.interpolate(s + 1)
        dx, dz = b.x - a.x, b.y - a.y
        L = math.hypot(dx, dz) or 1
        for side in (1, -1):
            if random.random() < .45:
                continue
            off = l['w'] / 2 + 4.5 + random.random() * 2
            x, zz = a.x + (-dz / L) * off * side, a.y + (dx / L) * off * side
            if not blocked_p.contains(Point(x, zz)):
                trees.append((x, zz))
# yard trees in the town, and woodland on the hills
x0b, z0b, x1b, z1b = MODEL_BOX.bounds
lim_p, woods_p = prep(lim_buf), prep(woods_u.intersection(MODEL_BOX))
for xx in np.arange(x0b, x1b, 26):
    for zz in np.arange(z0b, z1b, 26):
        x, z_ = xx + random.uniform(-11, 11), zz + random.uniform(-11, 11)
        pt = Point(x, z_)
        if woods_p.contains(pt):
            if random.random() < .82 and not blocked_p.contains(pt):
                trees.append((x, z_))
        elif lim_p.contains(pt) and random.random() < .22 and not blocked_p.contains(pt):
            trees.append((x, z_))
print(f'trees: {len(trees)}')

# ---------------------------------------------------------------- labels and views
def lbl(t, x, z_, y=18, far=None):
    d = {'t': t, 'x': round(x, 1), 'z': round(z_, 1), 'y': y}
    if far:
        d['far'] = far
    return d


labels = []
for t, (x, z_) in named:
    if not MODEL_BOX.contains(Point(x, z_)):
        continue
    nm = t['name']
    if t.get('place') in ('village', 'town', 'hamlet'):
        labels.append(lbl(nm, x, z_, 70, 9000))
    elif t.get('amenity') or t.get('leisure') in ('park', 'sports_centre', 'stadium'):
        labels.append(lbl(nm, x, z_, 22))
# the rivers: the widest water by town, and Pine Creek
river_poly = max(water_polys, key=lambda p: p.intersection(Point(0, 0).buffer(3000)).area)
rp = river_poly.intersection(Point(0, 1200).buffer(1500)).representative_point()
labels.append(lbl('West Branch Susquehanna River', rp.x, rp.y, 30, 8000))
pine = [p for p in water_polys if p.centroid.x < -3600 and p.centroid.y < 0]
pp = Point(-3800, -400)
if pine:
    pp = max(pine, key=lambda p: p.area).representative_point()
    labels.append(lbl('Pine Creek', pp.x, pp.y, 25, 6000))
# Bald Eagle Mountain: the highest ground of the ridge south of the river
ridge = (GZ > 2500) & (GZ < 6500) & (np.abs(GX) < 5000)
j, i = np.unravel_index(np.where(ridge, Hrel, -1e9).argmax(), Hrel.shape)
labels.append(lbl('Bald Eagle Mountain', float(gx[i]), float(gx[j]), 60, 14000))
labels.append(lbl('Allegheny St', -110, -25, 30, 2500))


def V(px, pz, py, tx, tz, ty):
    return {'pos': [round(px), round(h_at(px, pz) + py), round(pz)], 'target': [round(tx), round(h_at(tx, tz) + ty), round(tz)]}


# the PA 44 bridge from Allegheny & Main over the West Branch: the bridge by town most over water
def wet_len(l):
    ls = LineString([(l['p'][i] / 10, l['p'][i + 1] / 10) for i in range(0, len(l['p']), 2)])
    return ls.intersection(water_union).length if ls.distance(Point(0, 0)) < 1500 else 0
bridge = max((l for l in lines if l['b'] and l['k'] == 0), key=wet_len)
bx, bz = LineString([(bridge['p'][i] / 10, bridge['p'][i + 1] / 10) for i in range(0, len(bridge['p']), 2)]).interpolate(.5, normalized=True).coords[0]
views = [
    {'id': 'downtown', 'name': 'Allegheny St', **V(-330, 260, 110, -60, -30, 5)},
    {'id': 'bridge', 'name': 'River bridge', **V(bx + 380, bz + 330, 90, bx - 60, bz - 20, 5)},
    # (the view from Bald Eagle Mountain is the overlook's: js/scene/jsh/overlook.js, at the mountain's label)
    *([{'id': 'farms', 'name': 'Corn fields', **V(cf.x + 800, cf.y + 1250, 600, cf.x + 60, cf.y + 250, 0)}] if (cf := (lambda cs: max(cs, key=lambda q: q.area).centroid if cs else None)(
        [Polygon([(f['p'][0][i] / 10, f['p'][0][i + 1] / 10) for i in range(0, len(f['p'][0]), 2)]) for f in fields if f['k'] == 'corn'])) else []),
    # (the detasseling crew's view follows the crew: js/scene/jsh/detassel.js)
    {'id': 'pinecreek', 'name': 'Pine Creek', **V(pp.x + 900, pp.y + 1100, 380, pp.x, pp.y, 0)},
]

# ---------------------------------------------------------------- write
os.makedirs(OUT, exist_ok=True)
def wjson(name, obj):
    json.dump(obj, open(os.path.join(OUT, name), 'w'), separators=(',', ':'))
def wgz(name, raw):
    with gzip.GzipFile(os.path.join(OUT, name), 'wb', 9, mtime=0) as f:
        f.write(raw)

lim_polys = polys_of(limits_geom)
core = [dm(-250), dm(-75), dm(30), dm(35)]        # the paved core: Allegheny St's business blocks, Broad to Main
wjson('buildings.json', {'styles': styles, 'b': blds, 'jtypes': JTYPES, 'j': jmeta})
wjson('ground.json', {'bbox': core, 'green': [], 'lines': []})
wjson('river.json', {'water': [], 'river': [], 'center': [], 'dams': []})
wjson('trees.json', [])
wjson('transit.json', {'lines': [], 'tracks': [], 'runs': [], 'platforms': [], 'stations': [], 'entrances': [], 'sections': []})
mb = MODEL_BOX.bounds
city = {
    'core': core, 'bbox': [dm(v) for v in mb],
    'limits': [flat(p.exterior.coords) for p in lim_polys],
    'green': [[k] + poly_rings(p) for k, p in green],
    'lines': [{k: v for k, v in l.items() if not k.startswith('_')} for l in lines],
    'dams': [], 'water': [poly_rings(p) for p in water_polys if p.area > 50], 'streams': streams,
    'trees': [v for x, z_ in trees for v in (dm(x), dm(z_))],
}
wgz('city.json.gz', json.dumps(city, separators=(',', ':')).encode())
wgz('city_buildings.bin.gz', b'PHB1' + struct.pack('<III', 0, 0, 0))
# terrain.bin: "TER1", n u32, half f32, cell f32, base f32 (metres above sea level of y = 0),
# then heights i16[n*n] (dm above base, row-major from the north-west corner: row = z, col = x),
# then cover u8[n*n] (0 open, 1 forest, 2 water bed, 3 cropland)
raw = b'TER1' + struct.pack('<Ifff', N, HALF, CELL, BASE) + np.round(Hrel * 10).astype('<i2').tobytes() + cover.tobytes()
wgz('terrain.bin.gz', raw)
wjson('places.json', {'labels': labels, 'views': views})
wgz('farms.json.gz', json.dumps({'year': cdl_meta['year'], 'fields': fields, 'barns': barns, 'silos': silos, 'seed': seed}, separators=(',', ':')).encode())
for f in sorted(os.listdir(OUT)):
    print(f'  {f:24s} {os.path.getsize(os.path.join(OUT, f)) / 1024:8.0f} KB')
