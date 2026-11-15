"""Build the park round Kingda Ka (data/ka/, all but coaster.json) from the raw sources in tools/ka/src/.

    python -I tools/ka/fetch_ka.py          # once, or to refresh the sources
    python -I tools/ka/build_ka.py

Six Flags Great Adventure, Jackson NJ, as OpenStreetMap had it on extent.OSM_DATE (while the ride
stood), in the frame of extent.py. Writes, in the shared formats (docs/EDITING.md section 3):
  buildings.json          the core's footprints (Overture: OpenStreetMap and Microsoft ML), style 0,
                          heights estimated (see est_height()); none within 8 m of Kingda Ka's track
                          or under its tower (js/scene/ka/ models the station and the tower's foot)
  city_buildings.bin.gz   every other footprint as PHB1 (clean low-rise rectangles as boxes, the
                          rest as outlines)
  ground.json             the core extent (the park proper); its green and lines are in city.json.gz
  river.json, transit.json   empty (the water is in city.json.gz; no rail)
  trees.json              the trees OpenStreetMap maps one by one, and its tree rows
  city.json.gz            limits = the whole mapped rectangle; green: every bit of it that is not
                          paved or water (gardens, lawns, and the pine woods all round: where nothing
                          is mapped the land is woods or grass, whichever is round it); the roads,
                          car-park aisles and footpaths; lakes, ponds, pools and streams; and the
                          trees scattered through the woods, gardens and lawns
  places.json             labels and "Go to" views (js/scene/jsh/places.ts reads them)
  rides.json              every other mapped ride (not loaded by the page yet): the other coasters'
                          track plans and the flat rides, { coasters: [{ name, ways: [polyline_dm] }],
                          attractions: [{ name, kind, x, z (m), outline?: ring_dm, line?: polyline_dm }] }
                          (ways: the mapped pieces joined end to end where they chain, longest first;
                          kind: the map's attraction=* value, or "attraction" where it only says
                          tourism=attraction; line: a ride mapped as an open way, such as a water slide)

No tree stands within 12 m of Kingda Ka's track (data/ka/coaster.json track.p if it is there, else
OpenStreetMap's plan) or between its two long legs, within 6 m of any other coaster's track, or on
a path, road, building or ride.
"""
import csv, gzip, json, math, os, struct, sys
import numpy as np
import shapely
from shapely import wkt as swkt
from shapely.geometry import Polygon, LineString, Point, box
from shapely.ops import unary_union, polygonize
from shapely.strtree import STRtree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SRC, OUT = os.path.join(HERE, 'src'), os.path.join(ROOT, 'data', 'ka')

sys.path.insert(0, HERE)
from extent import LAT0, LON0, MZ, MX, MODEL, CORE, OSM_DATE, proj  # noqa: E402

rng = np.random.default_rng(20240601)


def dm(v):
    return int(round(v * 10))


def flat(coords, outer=True):
    """[(x, z)...] metres -> flat dm ring; outer rings positive area, holes negative"""
    pts = [(dm(x), dm(z)) for x, z in coords]
    pts = [p for i, p in enumerate(pts) if i == 0 or p != pts[i - 1]]
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    a = sum(p[0] * q[1] - q[0] * p[1] for p, q in zip(pts, pts[1:] + pts[:1]))
    if (a < 0) == outer:
        pts = pts[::-1]
    return [v for p in pts for v in p]


def poly_rings(p):
    return [flat(p.exterior.coords)] + [flat(h.coords, False) for h in p.interiors]


def polys_of(g):
    if g is None or g.is_empty:
        return []
    if isinstance(g, Polygon):
        return [g]
    return [q for q in getattr(g, 'geoms', []) if isinstance(q, Polygon) and not q.is_empty]


def lines_of(g):
    if g.is_empty:
        return []
    if isinstance(g, LineString):
        return [g]
    out = []
    for q in getattr(g, 'geoms', []):
        out += lines_of(q)
    return out


def line_dm(ln):
    return [v for x, z in ln.coords for v in (dm(x), dm(z))]


def xy_box(W, S, E, N):
    x0, z1 = proj(S, W)
    x1, z0 = proj(N, E)
    return box(x0, z0, x1, z1)


def tidy(g, min_area=12, min_hole=8):
    """a (multi)polygon's parts, simplified, without slivers and pinholes"""
    out = []
    for p in polys_of(g):
        p = p.simplify(.4)
        if not p.is_valid:
            p = p.buffer(0)
        for q in polys_of(p):
            if q.area < min_area:
                continue
            holes = [h for h in q.interiors if Polygon(h).area >= min_hole]
            out.append(Polygon(q.exterior, holes))
    return out


MODEL_BOX = xy_box(*MODEL)
CORE_BOX = xy_box(*CORE)
# the box of fetch_track.py's 2024 extract round the ride (W S E N)
PATCH = (-74.4376, 40.1385, -74.4326, 40.1414)
PATCH_BOX = xy_box(*PATCH)


# ---------------------------------------------------------------- OSM, as of 2024
def ll(p):
    return proj(p['lat'], p['lon'])


def el_geom(e):
    """something to test an element against a box with"""
    if e['type'] == 'node':
        return Point(ll(e))
    if e['type'] == 'way':
        pts = [ll(p) for p in e.get('geometry', []) if p]
        return LineString(pts) if len(pts) > 1 else Point(pts[0]) if pts else None
    ls = [LineString([ll(p) for p in m['geometry'] if p]) for m in e.get('members', [])
          if m['type'] == 'way' and len([p for p in m.get('geometry') or [] if p]) > 1]
    return unary_union(ls) if ls else None


def load_osm():
    """the map on OSM_DATE: the attic extract of the whole box if fetch_ka.py got one; else today's
    map with the 2024 extract round the ride patched in over it (everything today's map has there
    that the extract has not was mapped after the ride came down, and goes)"""
    full = os.path.join(SRC, 'osm-park-2024.json')
    if os.path.exists(full):
        return json.load(open(full))['elements'], MODEL_BOX, f'OpenStreetMap as of {OSM_DATE} (whole box)'
    today = json.load(open(os.path.join(SRC, 'osm-park-today.json')))
    old = json.load(open(os.path.join(SRC, 'osm-kingda-ka-2024.json')))['elements']
    have = {(e['type'], e['id']) for e in old}
    out, gone = [], 0
    for e in today['elements']:
        if (e['type'], e['id']) in have:
            continue
        g = el_geom(e)
        if g is not None and g.intersects(PATCH_BOX):
            gone += 1
            continue
        out.append(e)
    return out + old, PATCH_BOX, (f'OpenStreetMap of {today["osm3s"]["timestamp_osm_base"]}, with the {OSM_DATE} extract '
                                  f'patched in round the ride ({len(old)} elements in, {gone} newer ones out)')


osm, AUTH_BOX, OSM_SAYS = load_osm()
print(OSM_SAYS)
WAYS = [e for e in osm if e['type'] == 'way' and len([p for p in e.get('geometry') or [] if p]) > 1]
NODES = [e for e in osm if e['type'] == 'node']
RELS = [e for e in osm if e['type'] == 'relation']


def way_pts(e):
    return [ll(p) for p in e['geometry'] if p]


def way_line(e):
    return LineString(way_pts(e))


def way_poly(e):
    pts = way_pts(e)
    if len(pts) < 4 or pts[0] != pts[-1]:
        return None
    p = Polygon(pts)
    if not p.is_valid:
        p = p.buffer(0)
    return p if not p.is_empty and p.area > 1 else None


def rel_poly(rel):
    """a multipolygon relation's area: its outer ways stitched into rings, less its inner ones"""
    outer, inner = [], []
    for m in rel.get('members', []):
        pts = [ll(p) for p in m.get('geometry') or [] if p]
        if m['type'] == 'way' and len(pts) > 1:
            (inner if m.get('role') == 'inner' else outer).append(LineString(pts))
    if not outer:
        return None
    g = unary_union(list(polygonize(unary_union(outer))))
    if inner:
        g = g.difference(unary_union(list(polygonize(unary_union(inner)))))
    return g if not g.is_empty else None


# ---------------------------------------------------------------- Kingda Ka's plan
def ka_plan():
    """the track's centreline in plan (closed), and where its tower stands"""
    f = os.path.join(OUT, 'coaster.json')
    if os.path.exists(f):
        try:
            c = json.load(open(f))
            pts = [(p[0], p[2]) for p in c['track']['p']]
            tw = c.get('tower') or {}
            hi = max(c['track']['p'], key=lambda p: p[1])
            return LineString(pts + pts[:1]), (tw.get('x', hi[0]), tw.get('z', hi[2])), 'data/ka/coaster.json'
        except (ValueError, KeyError, IndexError, TypeError):
            pass                                    # half-written by its builder: use the map's plan
    by = {e['id']: way_pts(e) for e in WAYS if e['id'] in (105571105, 105571117)}
    pts = by[105571105] + by[105571117][1:]
    # the top hat is the short far end of the plan: the middle of the points furthest from the station
    far = max(pts, key=lambda p: math.dist(p, pts[0]))
    near = [p for p in pts if math.dist(p, far) < 30]
    return LineString(pts), (sum(p[0] for p in near) / len(near), sum(p[1] for p in near) / len(near)), 'OpenStreetMap ways 105571105 + 105571117'


KA_LINE, KA_TOWER, KA_SAYS = ka_plan()
KA_WAYS = {105571105, 105571117}
KA_INSIDE = unary_union(list(polygonize(unary_union(KA_LINE))))          # the strip between the two long legs
KA_TREES = unary_union([KA_LINE.buffer(12), KA_INSIDE, Point(KA_TOWER).buffer(26)])
KA_BUILD = unary_union([KA_LINE.buffer(8), Point(KA_TOWER).buffer(20)])   # no footprints here: track and tower
print(f'Kingda Ka plan from {KA_SAYS}: {KA_LINE.length:.0f} m, tower at {KA_TOWER[0]:.0f}, {KA_TOWER[1]:.0f}')


# ---------------------------------------------------------------- ground cover
WATER, PAVED, BARE = 'water', 'paved', 'bare'      # bare: grass that takes no trees (the solar farm)


def area_class(t, is_rel):
    """what an area's tags make it: WATER, PAVED, BARE, a green kind (0 park or garden, 1 grass,
    2 pitch, 3 wood, 4 cemetery), or None (not ground cover)"""
    nat, lu, le, am, hw = t.get('natural'), t.get('landuse'), t.get('leisure'), t.get('amenity'), t.get('highway')
    if t.get('building') or t.get('attraction'):
        return None
    if nat == 'water' or le == 'swimming_pool' or lu in ('basin', 'reservoir') or am == 'fountain':
        return WATER
    if nat == 'wood' or lu == 'forest':
        return 3
    if nat == 'wetland':
        return 1 if t.get('wetland') in ('marsh', 'wet_meadow', 'reedbed', 'fen') else 3
    if le == 'pitch':
        return 2
    if le == 'garden':
        return 0
    if lu in ('grass', 'meadow', 'farmland', 'village_green', 'recreation_ground', 'orchard') or nat in ('grassland', 'scrub', 'heath'):
        return 1
    if le == 'park' or t.get('tourism') == 'picnic_site':
        return 0
    if lu == 'cemetery' or am == 'grave_yard':
        return 4
    if t.get('power') in ('plant', 'generator'):
        return BARE
    if (am == 'parking' or lu in ('industrial', 'railway', 'retail') or nat in ('sand', 'beach', 'scree', 'bare_rock')
            or le == 'playground' or t.get('man_made') == 'wastewater_plant' or t.get('power') == 'substation'):
        return PAVED
    if hw in ('pedestrian', 'footway', 'service', 'path') and (t.get('area') == 'yes' or is_rel):
        return PAVED
    return None


areas, plazas = [], []
for e in WAYS + RELS:
    t = e.get('tags', {})
    k = area_class(t, e['type'] == 'relation')
    if k is None:
        continue
    g = rel_poly(e) if e['type'] == 'relation' else way_poly(e)
    if g is None:
        continue
    g = g.intersection(MODEL_BOX)
    areas += [(k, p) for p in polys_of(g) if p.area > 4]
    if k == PAVED and t.get('highway'):
        plazas.append(g)
# where mapped areas overlap, the smaller lies on the larger (a garden in a plaza, a pond in a wood,
# a lawn island in a car park): each keeps what no smaller area has taken
areas.sort(key=lambda a: a[1].area)
_tree = STRtree([p for _, p in areas])
cover = {}
for i, (k, p) in enumerate(areas):
    over = [areas[j][1] for j in _tree.query(p) if j < i and areas[j][1].intersects(p)]
    if over:
        p = p.difference(unary_union(over))
    cover.setdefault(k, []).append(p)
cover = {k: unary_union(v) for k, v in cover.items()}
EMPTY = Polygon()
water_u, paved_u, bare_u = cover.get(WATER, EMPTY), cover.get(PAVED, EMPTY), cover.get(BARE, EMPTY)
mapped = unary_union(list(cover.values()))
# the park's walks and squares, mapped as areas: they are the paving itself, so a path's line stops at their edge
plaza_u = unary_union(plazas).intersection(paved_u) if plazas else EMPTY

# ---- where nothing is mapped: woods or grass, whichever there is more of within 90 m (woods if
# neither: this is the edge of the Pine Barrens), never paving
STEP, REACH = 10, 9
bx0, bz0, bx1, bz1 = MODEL_BOX.bounds
gx, gz = np.arange(bx0 + STEP / 2, bx1, STEP), np.arange(bz0 + STEP / 2, bz1, STEP)
GX, GZ = np.meshgrid(gx, gz)


def raster(g):
    if g.is_empty:
        return np.zeros(GX.shape)
    shapely.prepare(g)
    return shapely.contains_xy(g, GX.ravel(), GZ.ravel()).reshape(GX.shape).astype(float)


def blur(a, r=REACH):
    """box sum over (2r + 1) squared cells"""
    p = np.pad(a, r + 1)
    c = p.cumsum(0).cumsum(1)
    n = 2 * r + 1
    return (c[n:, n:] - c[:-n, n:] - c[n:, :-n] + c[:-n, :-n])[:a.shape[0], :a.shape[1]]


open_u = unary_union([cover.get(k, EMPTY) for k in (0, 1, 2, 4)] + [bare_u])
near_wood, near_open, near_paved = blur(raster(cover.get(3, EMPTY))), blur(raster(open_u)), blur(raster(paved_u))
to_wood = (near_wood >= near_open) & ~((near_wood == 0) & (near_paved > .12 * (2 * REACH + 1) ** 2))
cells = [box(x - STEP / 2, z - STEP / 2, x + STEP / 2, z + STEP / 2)
         for x, z, w in zip(GX.ravel(), GZ.ravel(), to_wood.ravel()) if w]
wood_side = unary_union(cells).buffer(8).buffer(-8) if cells else EMPTY
rest = MODEL_BOX.difference(mapped)
rest_wood, rest_grass = rest.intersection(wood_side), rest.difference(wood_side)

green = {k: cover.get(k, EMPTY) for k in (0, 1, 2, 3, 4)}
green[3] = unary_union([green[3], rest_wood])
green[1] = unary_union([green[1], rest_grass, bare_u])
# the ride stands in a mown clearing: no woods under the track, between its legs or round the tower
clearing = KA_TREES.difference(unary_union([water_u, paved_u, green[0], green[2]]))
green[3] = green[3].difference(KA_TREES)
green[1] = unary_union([green[1], clearing])
green_out = [(k, p) for k in (0, 1, 2, 3, 4) for p in tidy(green[k])]
water_out = tidy(water_u, 6, 4)
m2 = lambda g: f'{g.area / 1e4:.1f} ha'
print(f'ground: {len(areas)} mapped areas; woods {m2(green[3])} ({m2(rest_wood)} of it unmapped land), grass {m2(green[1])} '
      f'({m2(rest_grass)} unmapped), gardens and parks {m2(green[0])}, paved areas {m2(paved_u)}, water {m2(water_u)} '
      f'of {m2(MODEL_BOX)}')

# ---------------------------------------------------------------- roads, paths, streams
ROAD_W = {'motorway': 14, 'trunk': 14, 'primary': 12, 'secondary': 9.5, 'tertiary': 8, 'unclassified': 7,
          'residential': 6.5, 'living_street': 5, 'primary_link': 7.5, 'secondary_link': 6.5, 'tertiary_link': 6,
          'service': 5, 'raceway': 4.5}
SERVICE_W = {'parking_aisle': 6.5, 'driveway': 4, 'alley': 4, 'drive-through': 3.5}
PATH_W = {'footway': 3, 'path': 1.8, 'steps': 2.5, 'cycleway': 2.5, 'bridleway': 2, 'track': 3.2, 'pedestrian': 7}
SOFT = ('dirt', 'ground', 'gravel', 'sand', 'unpaved', 'compacted', 'fine_gravel', 'grass', 'earth')
lines = []
plaza_in = plaza_u.buffer(-1)                       # (a path runs 1 m onto the paving, so no gap shows)
for e in WAYS:
    t = e.get('tags', {})
    hw = t.get('highway')
    if not hw or t.get('area') == 'yes' or hw in ('proposed', 'construction', 'platform', 'corridor', 'elevator'):
        continue
    if hw in PATH_W:
        k, w = 1, PATH_W[hw]
    elif hw in ROAD_W:
        k, w = 0, SERVICE_W.get(t.get('service'), ROAD_W[hw]) if hw == 'service' else ROAD_W[hw]
        try:
            w = max(w, int(t.get('lanes', '0').split(';')[0]) * 3.5 + 1)
        except ValueError:
            pass
        if hw == 'primary' and t.get('oneway') == 'yes':
            w = min(w, 8.5)                          # one carriageway of a divided road
        if hw == 'service' and t.get('surface') in SOFT:
            k, w = 1, 4                              # a dirt road (the safari's)
    else:
        continue
    try:
        layer = int((t.get('layer') or '0').split(';')[0])
    except ValueError:
        layer = 0
    g = way_line(e).intersection(MODEL_BOX)
    if k == 1:
        g = g.difference(plaza_in)
    for ln in lines_of(g):
        if ln.length >= 4:
            lines.append({'k': k, 'w': w, 'b': int(t.get('bridge') not in (None, 'no')), 'l': layer, 'p': line_dm(ln), '_ln': ln})

STREAM_W = {'river': 8, 'canal': 4, 'stream': 2.5, 'ditch': 1.5, 'drain': 1.5}
streams = []
for e in WAYS:
    ww = e.get('tags', {}).get('waterway')
    if ww in STREAM_W:
        for ln in lines_of(way_line(e).intersection(MODEL_BOX)):
            if ln.length > 10:
                streams.append({'w': STREAM_W[ww], 'p': line_dm(ln)})
print(f'lines: {sum(l["k"] == 0 for l in lines)} roads, {sum(l["k"] == 1 for l in lines)} paths, {len(streams)} streams')

# ---------------------------------------------------------------- the other rides (rides.json)
ALIAS = {'Bizarro': 'Medusa', 'Bizzaro': 'Medusa', 'Jersey Devil': 'Jersey Devil Coaster', 'Joker': 'The Joker',
         'Superman - Ultimate Flight': 'Superman: Ultimate Flight'}
NOT_OURS = ('kingda ka', 'zumanjaro')              # the ride itself and the drop tower on it: js/scene/ka/
name_of = lambda t: ALIAS.get(t.get('name', ''), t.get('name', ''))
track_ways = [e for e in WAYS if (e.get('tags', {}).get('roller_coaster') in ('track', 'station') and way_poly(e) is None
                                  or e.get('tags', {}).get('roller_coaster') == 'track'
                                  or e.get('tags', {}).get('railway') in ('monorail', 'narrow_gauge', 'miniature', 'tram'))]
coaster_nodes = [(name_of(e['tags']), Point(ll(e))) for e in NODES
                 if e.get('tags', {}).get('attraction') == 'roller_coaster' and e['tags'].get('name')]
# ways that share a node are one ride
parent = list(range(len(track_ways)))


def find(i):
    while parent[i] != i:
        parent[i] = parent[parent[i]]
        i = parent[i]
    return i


at_node = {}
for i, e in enumerate(track_ways):
    for p in way_pts(e):
        key = (round(p[0], 2), round(p[1], 2))
        if key in at_node:
            parent[find(i)] = find(at_node[key])
        else:
            at_node[key] = i


def chain(ways):
    """polylines joined end to end wherever two of them meet at an end (a closed loop is left alone)"""
    out = [list(w) for w in ways]
    again = True
    while again:
        again = False
        for i in range(len(out)):
            for j in range(i + 1, len(out)):
                a, b = out[i], out[j]
                if a[0] == a[-1] or b[0] == b[-1]:
                    continue
                if a[-1] == b[0]:
                    c = a + b[1:]
                elif a[-1] == b[-1]:
                    c = a + b[-2::-1]
                elif a[0] == b[-1]:
                    c = b + a[1:]
                elif a[0] == b[0]:
                    c = b[::-1] + a[1:]
                else:
                    continue
                out[i] = c
                del out[j]
                again = True
                break
            if again:
                break
    return out


groups = {}
for i, e in enumerate(track_ways):
    groups.setdefault(find(i), []).append(e)
coasters, other_tracks = [], []
for ways in groups.values():
    if any(e['id'] in KA_WAYS for e in ways):
        continue
    ways.sort(key=lambda e: e['id'])
    names = [name_of(e['tags']) for e in ways if e.get('tags', {}).get('name')]
    name = max(sorted(set(names)), key=names.count) if names else ''
    parts = []
    for pts in chain([way_pts(e) for e in ways]):
        ln = LineString(pts)
        parts += [ln] if MODEL_BOX.contains(ln) else lines_of(ln.intersection(MODEL_BOX))
    parts.sort(key=lambda l: -l.length)
    if not parts or sum(l.length for l in parts) < 25:
        continue
    if not name:                                    # an unnamed track: the coaster whose map pin is on it
        d, nm = min(((min(l.distance(pt) for l in parts), nm) for nm, pt in coaster_nodes), default=(1e9, ''))
        name = nm if d < 45 else ''
    other_tracks += parts
    coasters.append({'name': name, 'ways': [line_dm(l) for l in parts]})
# pieces of one ride mapped apart (a lift hill drawn on its own) go under one name; '' = the map has no name for it
by_name = {}
for c in coasters:
    if c['name'] and c['name'] in by_name:
        by_name[c['name']]['ways'] += c['ways']
    else:
        by_name[c['name'] or len(by_name)] = c
coasters = sorted(by_name.values(), key=lambda c: (c['name'], c['ways'][0][:2]))
tracks_u = unary_union(other_tracks) if other_tracks else EMPTY

attractions, ride_shapes = [], []
for e in WAYS + NODES:
    t = e.get('tags', {})
    kind = t.get('attraction') or ('attraction' if t.get('tourism') == 'attraction' else None)
    if not kind or any(s in t.get('name', '').lower() for s in NOT_OURS):
        continue
    a = {'name': name_of(t), 'kind': kind}
    if e['type'] == 'node':
        g = Point(ll(e))
    else:
        p = way_poly(e)
        g = p if p is not None else way_line(e)
        a['outline' if p is not None else 'line'] = poly_rings(p)[0] if p is not None else line_dm(g)
    c = g.centroid
    if not MODEL_BOX.contains(c):
        continue
    a['x'], a['z'] = round(c.x, 1), round(c.y, 1)
    a['_g'] = g
    attractions.append(a)
# a ride mapped as a pin and as an outline is one ride; a coaster's pin is its track
shaped = {a['name'] for a in attractions if a['name'] and ('outline' in a or 'line' in a)}
tracked = {c['name'] for c in coasters}
attractions = [a for a in attractions if isinstance(a['_g'], Point) is False or (a['name'] not in shaped and a['name'] not in tracked)]
attractions.sort(key=lambda a: (a['name'], a['x'], a['z']))
ride_shapes = [a['_g'].buffer(10 if isinstance(a['_g'], Point) else 3) for a in attractions]
print(f'rides: {len(coasters)} coaster tracks ({", ".join(c["name"] or "(unnamed)" for c in coasters)}), {len(attractions)} other attractions')

# ---------------------------------------------------------------- buildings (Overture)
def est_height(cls, nf, h, area):
    """metres; a park's buildings are single-storey sheds, stalls and show buildings"""
    if cls == 'roof':
        return min(h or 4.2, 6)                     # queue shelters and station canopies
    try:
        nf = float(nf or 0)
    except ValueError:
        nf = 0
    if nf:
        return nf * 3.6 + .8
    if h:
        return h
    if cls in ('hut', 'toilets', 'garage', 'shed'):
        return 3
    if cls == 'apartments':
        return 9
    return 2.8 if area < 25 else 3.4 if area < 120 else 4.2 if area < 500 else 5.5 if area < 1500 else 7


def wkt_to_m(w):
    """Overture WKT is (lon, lat) degrees; return the footprint in the metre frame, or None"""
    try:
        g = swkt.loads(w)
    except Exception:
        return None
    if g.is_empty or not isinstance(g, Polygon):
        return None
    t = lambda x, y: ((x - LON0) * MX, -(y - LAT0) * MZ)
    return Polygon([t(x, y) for x, y in g.exterior.coords], [[t(x, y) for x, y in h.coords] for h in g.interiors])


# the footprints the map had in 2024, where we know them (the whole box, or just round the ride)
old_b = []
for e in WAYS + RELS:
    t = e.get('tags', {})
    if t.get('building') and t.get('building') != 'no':
        g = rel_poly(e) if e['type'] == 'relation' else way_poly(e)
        for p in polys_of(g):
            if AUTH_BOX.contains(p.centroid):
                old_b.append((p, t))
old_tree = STRtree([p for p, _ in old_b]) if old_b else None

foot = []                                           # (polygon, height, name, source)
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
        if p.is_empty or p.area < 6 or not MODEL_BOX.contains(p.centroid):
            continue
        if r['src'] == 'OpenStreetMap' and AUTH_BOX.contains(p.centroid) and old_tree is not None \
                and not any(old_b[j][0].intersection(p).area > .3 * p.area for j in old_tree.query(p)):
            continue                                # built (or mapped) since 2024
        h = est_height(r['class'], r['num_floors'], float(r['height']) if r['height'] else 0, p.area)
        foot.append((p, min(max(h, 2.6), 40), r['name'], r['src']))
ftree = STRtree([f[0] for f in foot])
added = 0
for p, t in old_b:                                  # gone from the map since: back as they stood
    if any(foot[j][0].intersection(p).area > .3 * min(p.area, foot[j][0].area) for j in ftree.query(p)):
        continue
    p = p.simplify(.3)
    if p.area >= 6 and MODEL_BOX.contains(p.centroid):
        foot.append((p, est_height(t.get('building'), t.get('building:levels'), 0, p.area), t.get('name', ''), f'OpenStreetMap {OSM_DATE[:4]}'))
        added += 1

core_b, outer, left_out, kept = [], [], [], []
for p, h, name, src in foot:
    if p.intersects(KA_BUILD):
        x0, z0, x1, z1 = p.bounds
        left_out.append((name or '(unnamed)', round(p.centroid.x), round(p.centroid.y), round(x1 - x0), round(z1 - z0), round(p.area), src))
        continue
    kept.append(p)
    if CORE_BOX.contains(p.centroid):
        core_b.append([dm(h), 0] + poly_rings(p))
    else:
        outer.append((p, h))
core_b.sort(key=lambda b: (b[2][0], b[2][1]))
print(f'buildings: {len(core_b)} in the core, {len(outer)} outside, {added} back from the 2024 map; '
      f'{len(left_out)} left out at Kingda Ka:')
for lo in sorted(left_out, key=lambda v: v[1]):
    print('   %-28s centre %5d, %5d   %3d x %3d m  (%d m2, %s)' % lo)


def fit_box(p, h):
    """(cx, cz, w, d, yaw) for a clean low-rise rectangle, or None"""
    ring = list(p.exterior.coords)[:-1]
    if len(ring) < 4 or len(p.interiors):
        return None
    pts = [(float(x), float(z)) for x, z in ring]
    edge = max(((pts[(i + 1) % len(pts)][0] - q[0], pts[(i + 1) % len(pts)][1] - q[1]) for i, q in enumerate(pts)),
               key=lambda v: v[0] * v[0] + v[1] * v[1])
    if edge[0] ** 2 + edge[1] ** 2 < 16:
        return None
    phi = math.atan2(edge[1], edge[0])
    c, s = math.cos(phi), math.sin(phi)
    uv = [(x * c + z * s, -x * s + z * c) for x, z in pts]
    u0, u1 = min(q[0] for q in uv), max(q[0] for q in uv)
    v0, v1 = min(q[1] for q in uv), max(q[1] for q in uv)
    w, d = u1 - u0, v1 - v0
    if w * d < 24 or w * d > 1400 or min(w, d) < 4.0 or max(w, d) > 60 or max(w, d) / max(.01, min(w, d)) > 6:
        return None
    if p.area / (w * d) < .92 or h > 13:
        return None
    if max(min(abs(u - u0), abs(u - u1), abs(v - v0), abs(v - v1)) for u, v in uv) > .4:
        return None
    cu, cv = (u0 + u1) / 2, (v0 + v1) / 2
    return cu * c - cv * s, cu * s + cv * c, w, d, -phi


boxes, polys = [], []
for p, h in outer:
    b = fit_box(p, h)
    k = 0 if p.area < 400 else 1                    # 0 rowhouse (brick), 1 other (office palette)
    if b:
        cx, cz, w, d, yaw = b
        boxes.append([dm(cx), dm(cz), dm(w), dm(d), int(round((yaw % math.pi) / math.pi * 65535)) & 65535, dm(h), k])
    else:
        polys.append([poly_rings(p)[0], dm(h), k])
boxes.sort(key=lambda b: (b[0], b[1]))              # sorted so the delta-coded x, z stay small
polys.sort(key=lambda q: (q[0][0], q[0][1]))

# ---------------------------------------------------------------- trees
road_u = unary_union([l['_ln'].buffer(l['w'] / 2 + (3.5 if l['k'] == 0 else 2.5)) for l in lines])
wires = [way_line(e).buffer(5) for e in WAYS if e.get('tags', {}).get('power') in ('line', 'minor_line')]
build_u = unary_union([p.buffer(4) for p in kept]) if kept else EMPTY
hard = unary_union([KA_TREES, tracks_u.buffer(6), build_u, road_u])          # what even a mapped tree keeps off
brooks = [LineString([(s['p'][i] / 10, s['p'][i + 1] / 10) for i in range(0, len(s['p']), 2)]).buffer(s['w'] / 2 + 1) for s in streams]
blocked = unary_union([hard, water_u.buffer(2.5), paved_u.buffer(2.5), bare_u, green[2].buffer(2)] + ride_shapes + wires + brooks)
INNER = MODEL_BOX.buffer(-4)


def keep_clear(g, x, z):
    shapely.prepare(g)
    return ~shapely.contains_xy(g, x, z)


def scatter(region, step, share):
    """trees on a jittered lattice in a region, clear of everything in `blocked`"""
    if region.is_empty:
        return np.zeros((0, 2))
    x0, z0, x1, z1 = region.bounds
    X, Z = np.meshgrid(np.arange(x0, x1 + step, step), np.arange(z0, z1 + step, step))
    x = X.ravel() + rng.uniform(-.42, .42, X.size) * step
    z = Z.ravel() + rng.uniform(-.42, .42, X.size) * step
    ok = rng.random(X.size) < share
    shapely.prepare(region)
    ok &= shapely.contains_xy(region, x, z)
    ok &= keep_clear(blocked, x, z) & shapely.contains_xy(INNER, x, z)
    return np.column_stack([x[ok], z[ok]])


# the pine woods close up their canopy (a crown is some 10 m across); gardens and picnic groves are
# planted more thinly, lawns and verges have the odd tree
wood_trees = scatter(green[3], 9.5, .93)
park_trees = scatter(green[0], 11, .5)
lawn_trees = scatter(green[1].difference(bare_u), 22, .4)
scattered = np.vstack([wood_trees, park_trees, lawn_trees])

mapped_pts = [ll(e) for e in NODES if e.get('tags', {}).get('natural') == 'tree']
for e in WAYS:
    if e.get('tags', {}).get('natural') == 'tree_row':
        ln = way_line(e)
        mapped_pts += [ln.interpolate(s).coords[0] for s in np.arange(0, ln.length + .1, 8)]
mp = np.array(mapped_pts).reshape(-1, 2)
if len(mp):
    ok = keep_clear(hard, mp[:, 0], mp[:, 1]) & shapely.contains_xy(INNER, mp[:, 0], mp[:, 1]) & keep_clear(water_u, mp[:, 0], mp[:, 1])
    mp = mp[ok]
    # a scattered tree gives way to a mapped one within 5 m
    near = STRtree([Point(p) for p in mp]).query(shapely.points(scattered).tolist(), predicate='dwithin', distance=5)[0]
    scattered = np.delete(scattered, np.unique(near), axis=0)
all_pts = np.vstack([scattered, mp])
assert not shapely.contains_xy(KA_TREES, all_pts[:, 0], all_pts[:, 1]).any()
print(f'trees: {len(mp)} mapped; scattered: {len(wood_trees)} in the woods, {len(park_trees)} in gardens and groves, '
      f'{len(lawn_trees)} on lawns ({len(scattered)} after making way for mapped ones)')

# ---------------------------------------------------------------- places (labels and views)
def at(name, default):
    """where the map has something of that name (a place pin first), else the given lat, lon"""
    hits = [e for e in osm if e.get('tags', {}).get('name') == name]
    hits.sort(key=lambda e: (e['type'] != 'node', 'place' not in e.get('tags', {})))
    for e in hits:
        g = el_geom(e)
        if g is not None and MODEL_BOX.contains(g.centroid):
            return g.centroid.x, g.centroid.y
    return proj(*default)


def over(name, default):
    """the middle of a coaster's mapped track"""
    for c in coasters:
        if c['name'] == name:
            xs, zs = [v for w in c['ways'] for v in w[0::2]], [v for w in c['ways'] for v in w[1::2]]
            return (min(xs) + max(xs)) / 20, (min(zs) + max(zs)) / 20
    return proj(*default)


# the lake the park fronts (the map calls it Prospertown Lake, like the larger water west of it)
lake = max(polys_of(water_u.intersection(box(-460, 440, 260, 860))), key=lambda p: p.area)
lake_pt = lake.representative_point()
lots = sorted(polys_of(unary_union([p for k, p in areas if k == PAVED]).intersection(
    unary_union([way_poly(e) for e in WAYS if e.get('tags', {}).get('amenity') == 'parking' and way_poly(e) is not None]))),
    key=lambda p: -p.area)
car_park = lots[0].representative_point() if lots else Point(proj(40.1418, -74.4405))
LABELS = [
    # text, (x, z), height, far
    ('Six Flags Great Adventure', at('Main Street', (40.1363, -74.4399)), 90, 9000),
    ('Hurricane Harbor', at('Hurricane Harbor New Jersey', (40.1459, -74.4376)), 60, 9000),
    ('Wild Safari', (520, 300), 60, 9000),
    ('The lake', (lake_pt.x, lake_pt.y), 30, 6000),
    ('Car park', (car_park.x, car_park.y), 40, 6000),
    ('Main gate', at('Six Flags Great Adventure Sign', (40.1370, -74.4402)), 28, 3500),
    ('Golden Kingdom', at('The Golden Kingdom', (40.1376, -74.4369)), 30, 3500),
    ('El Toro', at('El Toro', (40.1388, -74.4345)), 62, 4500),
    ('Nitro', at('Nitro', (40.1356, -74.4443)), 75, 4500),
    ('Medusa', at('Medusa', (40.1384, -74.4327)), 48, 2500),
    ('Green Lantern', over('Green Lantern', (40.1397, -74.4381)), 50, 2500),
    ('Superman: Ultimate Flight', at('Superman - Ultimate Flight', (40.1399, -74.4400)), 38, 2500),
    ('Jersey Devil Coaster', at('Jersey Devil', (40.1344, -74.4438)), 44, 2500),
    ('Batman The Ride', at('Batman The Ride', (40.1359, -74.4440)), 36, 2000),
    ('Skull Mountain', at('Skull Mountain', (40.1346, -74.4420)), 26, 2000),
    ('Runaway Mine Train', at('Runaway Mine Train', (40.1373, -74.4347)), 22, 1500),
    ('Saw Mill Log Flume', at('Saw Mill Log Flume', (40.1367, -74.4352)), 22, 1500),
    ('Boardwalk', at('Boardwalk', (40.1379, -74.4383)), 22, 1500),
    ('Frontier Adventures', at('Frontier Adventures', (40.1371, -74.4349)), 22, 1500),
    ('Plaza del Carnaval', at('Plaza del Carnaval', (40.1381, -74.4358)), 22, 1500),
    ('Fantasy Forest', at('Fantasy Forest', (40.1364, -74.4389)), 22, 1500),
    ('Main Street', at('Liberty Square Gazebo', (40.1356, -74.4398)), 22, 1500),
    ('Lakefront', at('Lakefront', (40.1351, -74.4399)), 22, 1500),
    ('Adventure Alley', at('Adventure Alley', (40.1358, -74.4409)), 22, 1500),
    ('Movietown', at('Movietown', (40.1363, -74.4431)), 22, 1500),
    ('Adventure Seaport', at('Adventure Seaport', (40.1351, -74.4436)), 22, 1500),
    ('Monmouth Road (Route 537)', at('Monmouth Road', (40.1475, -74.4445)), 22, 2500),
]
labels = [{'t': t, 'x': round(x, 1), 'z': round(z, 1), 'y': y, 'far': far} for t, (x, z), y, far in LABELS
          if MODEL_BOX.contains(Point(x, z))]
views = [
    {'id': 'park', 'name': 'The whole park', 'pos': [-250, 760, 1900], 'target': [-250, 0, 120]},
    {'id': 'car-park', 'name': 'From the car park', 'pos': [round(car_park.x), 26, round(car_park.y)], 'target': [round(KA_TOWER[0]), 80, round(KA_TOWER[1])]},
    {'id': 'lake', 'name': 'Across the lake', 'pos': [round(lake_pt.x), 45, round(lake_pt.y + 190)], 'target': [-40, 40, 150]},
    {'id': 'harbor', 'name': 'Hurricane Harbor', 'pos': [-560, 190, -1060], 'target': [-300, 0, -640]},
]
print(f'places: {len(labels)} labels, {len(views)} views')

# ---------------------------------------------------------------- write
os.makedirs(OUT, exist_ok=True)


def wjson(name, obj):
    json.dump(obj, open(os.path.join(OUT, name), 'w'), separators=(',', ':'), ensure_ascii=False)


def wgz(name, raw):
    with gzip.GzipFile(os.path.join(OUT, name), 'wb', 9, mtime=0) as f:
        f.write(raw)


# ---- city_buildings.bin.gz (PHB1): box x, z as deltas from the previous box; outline vertices
# first absolute, then deltas, per outline (js/scene/city.ts decodes them so)
delta = lambda a: [a[0]] + [a[i] - a[i - 1] for i in range(1, len(a))] if a else []
vx, vz = [], []
for ring, h, k in polys:
    vx += delta(ring[0::2])
    vz += delta(ring[1::2])
raw = b'PHB1' + struct.pack('<III', len(boxes), len(polys), len(vx))
raw += np.array(delta([b[0] for b in boxes]), dtype='<i4').tobytes() + np.array(delta([b[1] for b in boxes]), dtype='<i4').tobytes()
raw += np.array(vx, dtype='<i4').tobytes() + np.array(vz, dtype='<i4').tobytes()
for i in (2, 3, 4, 5):
    raw += np.array([b[i] for b in boxes], dtype='<u2').tobytes()
raw += np.array([len(p[0]) // 2 for p in polys], dtype='<u2').tobytes()
raw += np.array([p[1] for p in polys], dtype='<u2').tobytes()
raw += np.array([b[6] for b in boxes], dtype='u1').tobytes() + np.array([p[2] for p in polys], dtype='u1').tobytes()
wgz('city_buildings.bin.gz', raw)

core_bbox = [dm(v) for v in CORE_BOX.bounds]
tree_dm = lambda pts: [int(v) for v in np.round(np.asarray(pts) * 10).astype(int).ravel()]
lines.sort(key=lambda l: (l['k'], l['p'][:4]))
city = {
    'core': core_bbox, 'bbox': [dm(v) for v in MODEL_BOX.bounds],
    'limits': [flat(MODEL_BOX.exterior.coords)],
    'green': [[k] + poly_rings(p) for k, p in green_out],
    'lines': [{k: v for k, v in l.items() if k != '_ln'} for l in lines],
    'dams': [],
    'water': [poly_rings(p) for p in water_out],
    'streams': streams,
    'trees': tree_dm(scattered),
}
wjson('buildings.json', {'styles': [None], 'b': core_b})
wjson('ground.json', {'bbox': core_bbox, 'green': [], 'lines': []})
wjson('river.json', {'water': [], 'river': [], 'center': [], 'dams': []})
wjson('trees.json', tree_dm(mp))
wjson('transit.json', {'lines': [], 'tracks': [], 'runs': [], 'platforms': [], 'stations': [], 'entrances': [], 'sections': []})
wjson('places.json', {'labels': labels, 'views': views})
wjson('rides.json', {'coasters': coasters,
                     'attractions': [{k: v for k, v in a.items() if k != '_g'} for a in attractions]})
wgz('city.json.gz', json.dumps(city, separators=(',', ':')).encode())
print(f'city.json.gz: {len(green_out)} green polygons, {len(lines)} lines, {len(water_out)} water polygons, '
      f'{len(streams)} streams, {len(scattered)} trees')
for f in sorted(os.listdir(OUT)):
    print(f'  {f:24s} {os.path.getsize(os.path.join(OUT, f)) / 1024:8.0f} KB')
