"""Build the rest of Philadelphia (everything outside the original Center City extent).

  python -I tools/phl/build_city.py [raw_dir] [out_dir]

raw_dir defaults to tools/phl/raw/city (see fetch_city.py), out_dir to data/phl/.
The original extent (data/phl/ground.json bbox) is left to the existing data: nothing here
overlaps it, so the hand-made changes there stay exactly as they are.

Writes
  data/phl/city_buildings.bin.gz   every other building footprint in the city limits (binary, below)
  data/phl/city.json.gz            city limits, streets, rail, paths, parks, water, streams, trees

city_buildings.bin layout (little endian; positions in decimetres, scene frame):
  "PHB1", nBox u32, nPoly u32, nVert u32
  box x  i32[nBox] (delta from previous), box z i32[nBox] (delta), poly vertex x/z i32[nVert] (delta
  within each polygon, first absolute)
  box w u16, d u16, ry u16 (0..65535 = 0..pi), h u16 (dm)  [nBox each]
  poly vertex count u16[nPoly], poly h u16[nPoly]
  box kind u8[nBox], poly kind u8[nPoly]                   (0 rowhouse, 1 other)
"""
import glob, gzip, json, math, os, random, struct, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geom import (Grid, area, centroid, clip_line, clip_ring, min_rect, point_in_poly,  # noqa: E402
                  point_in_ring, proj, seg_dist, simplify, simplify_ring, stitch)
from citylimits import Limits  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "raw", "city")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "..", "..", "data", "phl")
FT = 0.3048
random.seed(11)

# the original extent, owned by the existing data files
core = json.load(open(os.path.join(OUT, "ground.json"), encoding="utf-8"))["bbox"]
CX0, CZ0, CX1, CZ1 = (v / 10 for v in core)
WPAD = 400  # the original water polygons reach 400 m past the extent


def in_core(x, z, pad=0.0):
    return CX0 - pad <= x <= CX1 + pad and CZ0 - pad <= z <= CZ1 + pad


def dm(v):
    return int(round(v * 10))


def flat(pts):
    out = []
    for x, z in pts:
        out += [dm(x), dm(z)]
    return out


# ------------------------------------------------------------------ city limits
print("City limits")
LIM = Limits(RAW)
city = LIM.rings
BX0, BX1, BZ0, BZ1 = LIM.x0, LIM.x1, LIM.z0, LIM.z1
inside_city = LIM.inside
print(f"  {len(city)} ring(s), {sum(abs(area(r)) for r in city) / 1e6:.0f} km2, x {BX0:.0f}..{BX1:.0f} z {BZ0:.0f}..{BZ1:.0f}")

# regions outside the core rectangle, as four rectangles (for clipping polygons and lines)
BIG = 4000
EX0, EZ0, EX1, EZ1 = BX0 - BIG, BZ0 - BIG, BX1 + BIG, BZ1 + BIG


def strips(pad=0.0):
    a0, b0, a1, b1 = CX0 - pad, CZ0 - pad, CX1 + pad, CZ1 + pad
    return [(EX0, EZ0, a0, EZ1), (a1, EZ0, EX1, EZ1), (a0, EZ0, a1, b0), (a0, b1, a1, EZ1)]


def clip_poly_outside(poly, pad=0.0, tol=0.8):
    """Polygon (rings) minus the core rectangle, as up to four polygons."""
    out = []
    for rect in strips(pad):
        rings = []
        for k, r in enumerate(poly):
            c = clip_ring(r, *rect)
            if len(c) < 3:
                if k == 0:
                    break
                continue
            c = simplify_ring(c, tol)
            if len(c) < 3 or abs(area(c)) < 1:
                if k == 0:
                    break
                continue
            if (area(c) > 0) != (k == 0):
                c = c[::-1]
            rings.append(c)
        if rings:
            out.append(rings)
    return out


def lines_outside(pts):
    pieces = []
    for rect in strips():
        pieces += clip_line(pts, *rect)
    return pieces


def split_in_city(pts):
    """Runs of consecutive points inside the city limits."""
    out, cur = [], []
    for p in pts:
        if inside_city(*p):
            cur.append(p)
        else:
            if len(cur) > 1:
                out.append(cur)
            cur = []
    if len(cur) > 1:
        out.append(cur)
    return out


# the hand-modelled landmarks (build_landmarks.py) replace the footprints inside their outlines and
# the road decks of the two Delaware bridges
MARKS, MARK_BRIDGES = [], set()
_mk = os.path.join(OUT, "city_landmarks.json")
if os.path.exists(_mk):
    _m = json.load(open(_mk, encoding="utf-8"))
    for o in _m["stadiums"] + _m["halls"]:
        rr = [(o["outline"][i] / 10, o["outline"][i + 1] / 10) for i in range(0, len(o["outline"]), 2)]
        MARKS.append((min(p[0] for p in rr), min(p[1] for p in rr), max(p[0] for p in rr), max(p[1] for p in rr), rr))
    MARK_BRIDGES = {b["name"] for b in _m["bridges"]} | {"Ben Franklin Bridge"}


def in_mark(x, z):
    return any(x0 <= x <= x1 and z0 <= z <= z1 and point_in_ring(x, z, rr) for x0, z0, x1, z1, rr in MARKS)


# ------------------------------------------------------------------ buildings
print("Buildings")
dropped = 0
boxes, polys = [], []
seen = set()
pages = sorted(glob.glob(os.path.join(RAW, "buildings", "page_*.geojson")))
for pi, page in enumerate(pages):
    for f in json.load(open(page, encoding="utf-8"))["features"]:
        g, p = f["geometry"], f["properties"]
        oid = p.get("objectid")
        if not g or oid in seen:
            continue
        seen.add(oid)
        ring_ll = g["coordinates"][0] if g["type"] == "Polygon" else max((pp[0] for pp in g["coordinates"]), key=len)
        r = [proj(lat, lon) for lon, lat in ring_ll]
        if len(r) > 1 and r[0] == r[-1]:
            r = r[:-1]
        if len(r) < 3:
            continue
        a = abs(area(r))
        if a < 6:
            continue
        cx, cz = centroid(r)
        if in_core(cx, cz) or not inside_city(cx, cz):
            continue
        if in_mark(cx, cz):
            dropped += 1
            continue
        h = p.get("approx_hgt") or p.get("max_hgt") or 25
        h = max(3.0, min(6000, h * FT))
        kind = 0 if h < 16 and a < 320 else 1
        bx_, bz_, w, d, ry = min_rect(r)
        if a >= 400 and a / max(w * d, 1e-6) < 0.82:
            r = simplify_ring(r, 0.5)
            if area(r) < 0:
                r = r[::-1]
            if 3 <= len(r) <= 400:
                polys.append((r, h, kind))
                continue
        ry = ry % math.pi
        boxes.append((bx_, bz_, max(w, .5), max(d, .5), ry, h, kind))
    if pi % 25 == 0:
        print(f"  page {pi + 1}/{len(pages)}: {len(boxes)} boxes, {len(polys)} outlines", flush=True)
print(f"  {len(boxes)} boxes + {len(polys)} outlines (outside the original extent, inside the city); {dropped} replaced by landmark models")

# sort by 1 km tile so the delta coding stays small and tiles load contiguously
T = 1000.0
boxes.sort(key=lambda b: (int((b[1] - BZ0) // T), int((b[0] - BX0) // T), b[0]))
polys.sort(key=lambda p: (int((p[0][0][1] - BZ0) // T), int((p[0][0][0] - BX0) // T)))


def deltas(vals):
    out, prev = [], 0
    for v in vals:
        out.append(v - prev)
        prev = v
    return out


bx_i = deltas([dm(b[0]) for b in boxes])
bz_i = deltas([dm(b[1]) for b in boxes])
pv_x, pv_z, pv_n, pv_h, pv_k = [], [], [], [], []
for r, h, k in polys:
    xs_ = [dm(p[0]) for p in r]
    zs_ = [dm(p[1]) for p in r]
    pv_x += [xs_[0]] + [xs_[i] - xs_[i - 1] for i in range(1, len(xs_))]
    pv_z += [zs_[0]] + [zs_[i] - zs_[i - 1] for i in range(1, len(zs_))]
    pv_n.append(len(r))
    pv_h.append(min(65535, dm(h)))
    pv_k.append(k)
u16 = lambda v: max(0, min(65535, int(round(v))))  # noqa: E731
blob = b"".join([
    b"PHB1", struct.pack("<III", len(boxes), len(polys), len(pv_x)),
    struct.pack(f"<{len(bx_i)}i", *bx_i), struct.pack(f"<{len(bz_i)}i", *bz_i),
    struct.pack(f"<{len(pv_x)}i", *pv_x), struct.pack(f"<{len(pv_z)}i", *pv_z),
    struct.pack(f"<{len(boxes)}H", *[u16(b[2] * 10) for b in boxes]),
    struct.pack(f"<{len(boxes)}H", *[u16(b[3] * 10) for b in boxes]),
    struct.pack(f"<{len(boxes)}H", *[u16(b[4] / math.pi * 65535) for b in boxes]),
    struct.pack(f"<{len(boxes)}H", *[u16(b[5] * 10) for b in boxes]),
    struct.pack(f"<{len(pv_n)}H", *pv_n), struct.pack(f"<{len(pv_h)}H", *pv_h),
    bytes(b[6] for b in boxes), bytes(pv_k),
])
with open(os.path.join(OUT, "city_buildings.bin.gz"), "wb") as fo:
    with gzip.GzipFile(fileobj=fo, mode="wb", compresslevel=9, mtime=0) as gz:
        gz.write(blob)
print(f"  wrote city_buildings.bin.gz: {os.path.getsize(os.path.join(OUT, 'city_buildings.bin.gz')) // 1024} KB (raw {len(blob) // 1024} KB)")

# box grid for keeping trees out of buildings
bgrid = Grid(60)
for b in boxes:
    rr = math.hypot(b[2], b[3]) / 2
    bgrid.add(b, b[0] - rr, b[1] - rr, b[0] + rr, b[1] + rr)
for p in polys:
    xs_ = [q[0] for q in p[0]]
    zs_ = [q[1] for q in p[0]]
    bgrid.add(p, min(xs_), min(zs_), max(xs_), max(zs_))


def in_building(x, z):
    for o in bgrid.near(x, z):
        if len(o) == 3:
            if point_in_ring(x, z, o[0]):
                return True
        else:
            cx, cz, w, d, ry = o[:5]
            dx, dz = x - cx, z - cz
            c, s = math.cos(ry), math.sin(ry)
            if abs(dx * c - dz * s) <= w / 2 + 1 and abs(dx * s + dz * c) <= d / 2 + 1:
                return True
    return False


# ------------------------------------------------------------------ OSM
print("OpenStreetMap")
ways = {}
for t in sorted(glob.glob(os.path.join(RAW, "tiles", "tile_*.json"))):
    for el in json.load(open(t, encoding="utf-8"))["elements"]:
        if el["type"] == "way" and el.get("geometry"):
            ways[el["id"]] = el
areas_rel = json.load(open(os.path.join(RAW, "areas.json"), encoding="utf-8"))["elements"]
print(f"  {len(ways)} ways, {len(areas_rel)} area relations")


def way_pts(el):
    return [proj(p["lat"], p["lon"]) for p in el["geometry"] if p]


def polygons(el):
    if el["type"] == "way":
        g = el.get("geometry") or []
        if len(g) < 4 or (g[0]["lat"], g[0]["lon"]) != (g[-1]["lat"], g[-1]["lon"]):
            return []
        return [[way_pts(el)[:-1]]]
    outers, inners = [], []
    for m in el.get("members", []):
        if m.get("type") != "way" or not m.get("geometry"):
            continue
        pts = [(p["lat"], p["lon"]) for p in m["geometry"] if p]
        (inners if m.get("role") == "inner" else outers).append(pts)
    polys_ = [[[proj(*p) for p in r]] for r in stitch(outers)]
    for r in stitch(inners):
        hr = [proj(*p) for p in r]
        for poly in polys_:
            if point_in_ring(hr[0][0], hr[0][1], poly[0]):
                poly.append(hr)
                break
    return polys_


def near_city(poly):
    """Keep land use whose centre (or any of the first vertices) is in the city."""
    r = poly[0]
    c = centroid(r)
    return inside_city(*c) or any(inside_city(*p) for p in r[:: max(1, len(r) // 12)])


GREEN_KIND = {"park": 0, "garden": 0, "recreation_ground": 0, "grass": 1, "meadow": 1, "grassland": 1,
              "golf_course": 1, "pitch": 2, "playground": 2, "wood": 3, "forest": 3, "scrub": 3, "cemetery": 4}
green, water, seen_areas = [], [], set()
for el in list(ways.values()) + areas_rel:
    t = el.get("tags", {})
    key = (el["type"], el["id"])
    if key in seen_areas:
        continue
    is_water = t.get("natural") == "water" or t.get("waterway") == "riverbank"
    k = None
    if not is_water:
        for kk in ("leisure", "landuse", "natural"):
            if t.get(kk) in GREEN_KIND:
                k = GREEN_KIND[t[kk]]
                break
        if k is None:
            continue
    seen_areas.add(key)
    for poly in polygons(el):
        if is_water:
            # water reaches 2 km past the limits so rivers don't stop at the city line
            cp = [clip_ring(r, BX0 - 2000, BZ0 - 2000, BX1 + 2000, BZ1 + 2000) for r in poly]
            if len(cp[0]) < 3:
                continue
            cp = [r for r in cp if len(r) >= 3]
            for piece in clip_poly_outside(cp, WPAD, 1.0):
                if abs(area(piece[0])) > 50:
                    water.append(piece)
        else:
            if not near_city(poly):
                continue
            for piece in clip_poly_outside(poly, 0, .8):
                if abs(area(piece[0])) > 40:
                    green.append((k, piece))
green.sort(key=lambda g: -abs(area(g[1][0])))
print(f"  green {len(green)}, water {len(water)}")

WIDTH = {"motorway": 20, "trunk": 16, "primary": 14, "secondary": 12, "tertiary": 10,
         "motorway_link": 8, "trunk_link": 8, "primary_link": 7, "secondary_link": 7, "tertiary_link": 6,
         "residential": 8, "unclassified": 8, "living_street": 6, "service": 4.5, "pedestrian": 5,
         "footway": 2.5, "path": 2.5, "cycleway": 3, "track": 3}
PATHS = {"pedestrian", "footway", "path", "cycleway", "track"}
BRIDGE = {"yes", "viaduct", "movable", "cantilever", "trestle", "aqueduct"}
STREAM_W = {"river": 30, "canal": 12, "stream": 6}
lines, streams, dams = [], [], []
road_grid = Grid(60)
for el in ways.values():
    t = el.get("tags", {})
    hw, rw, ww = t.get("highway"), t.get("railway"), t.get("waterway")
    if ww in STREAM_W:
        if t.get("tunnel") or t.get("layer", "0").startswith("-"):
            continue  # culverts and buried creeks
        for piece in lines_outside(way_pts(el)):
            for run in split_in_city(piece):
                streams.append({"w": STREAM_W[ww], "p": flat(simplify(run, 1.0))})
        continue
    if ww in ("dam", "weir"):
        for piece in lines_outside(way_pts(el)):
            dams.append(flat(piece))
        continue
    if hw:
        if hw not in WIDTH or t.get("area") == "yes" or t.get("tunnel") in ("yes", "building_passage", "culvert"):
            continue
        if hw == "footway" and t.get("footway") in ("sidewalk", "crossing"):
            continue
        if hw == "service" and t.get("service") in ("parking_aisle", "drive-through"):
            continue
        kind, w = (1 if hw in PATHS else 0), WIDTH[hw]
        lanes = t.get("lanes", "")
        if kind == 0 and lanes.isdigit() and hw != "service":
            w = max(w, int(lanes) * 3.4)
    elif rw == "rail":
        # subway, light rail and trolley track is drawn by the transit layer
        if t.get("tunnel") or t.get("layer", "0").startswith("-"):
            continue
        kind, w = 2, 3.2
    else:
        continue
    if t.get("bridge") and (t.get("name") in MARK_BRIDGES or t.get("bridge:name") in MARK_BRIDGES):
        continue                     # modelled by citymarks.js
    br = 1 if t.get("bridge") in BRIDGE else 0
    try:
        layer = int(t.get("layer", "1" if br else "0"))
    except ValueError:
        layer = 1 if br else 0
    for piece in lines_outside(way_pts(el)):
        for run in split_in_city(piece):
            run = simplify(run, 0.5)
            rec = {"k": kind, "w": w, "b": br, "l": max(0, layer) if br else 0, "p": flat(run)}
            lines.append(rec)
            for a, b in zip(run, run[1:]):
                road_grid.add((a, b, w, kind), min(a[0], b[0]) - w, min(a[1], b[1]) - w, max(a[0], b[0]) + w, max(a[1], b[1]) + w)
print(f"  lines {len(lines)} (bridges {sum(l['b'] for l in lines)}), streams {len(streams)}, dams {len(dams)}")

# ------------------------------------------------------------------ trees (parks and woods only)
print("Trees")
wgrid = Grid(200)
for poly in water:
    xs_ = [p[0] for p in poly[0]]
    zs_ = [p[1] for p in poly[0]]
    wgrid.add(poly, min(xs_), min(zs_), max(xs_), max(zs_))


def tree_ok(x, z):
    if in_core(x, z) or not inside_city(x, z) or in_building(x, z) or in_mark(x, z):
        return False
    for a, b, w, kind in road_grid.near(x, z):
        if seg_dist((x, z), a, b) < w / 2 + (1.2 if kind == 1 else 2.5):
            return False
    for poly in wgrid.near(x, z):
        if point_in_poly(x, z, poly):
            return False
    return True


DENS = {0: 1 / 900, 1: 0, 2: 0, 3: 1 / 260, 4: 1 / 1100}
CAP = 90000
trees = []
for k, poly in green:
    n = abs(area(poly[0])) * DENS[k]
    n = int(n) + (1 if random.random() < n - int(n) else 0)
    if not n:
        continue
    xs_ = [p[0] for p in poly[0]]
    zs_ = [p[1] for p in poly[0]]
    x0, x1, z0, z1 = min(xs_), max(xs_), min(zs_), max(zs_)
    got = tries = 0
    while got < n and tries < n * 8:
        tries += 1
        x, z = random.uniform(x0, x1), random.uniform(z0, z1)
        if point_in_poly(x, z, poly) and tree_ok(x, z):
            trees += [dm(x), dm(z)]
            got += 1
if len(trees) // 2 > CAP:
    idx = sorted(random.sample(range(len(trees) // 2), CAP))
    trees = [v for i in idx for v in trees[2 * i: 2 * i + 2]]
print(f"  {len(trees) // 2} trees")

out = {
    "core": core,
    "bbox": [dm(BX0), dm(BZ0), dm(BX1), dm(BZ1)],
    "limits": [flat(simplify_ring(r, 2)) for r in city],
    "green": [[k] + [flat(r) for r in poly] for k, poly in green],
    "water": [[flat(r) for r in poly] for poly in water],
    "streams": streams,
    "dams": dams,
    "lines": lines,
    "trees": trees,
}
raw = json.dumps(out, separators=(",", ":")).encode()
with open(os.path.join(OUT, "city.json.gz"), "wb") as fo:
    with gzip.GzipFile(fileobj=fo, mode="wb", compresslevel=9, mtime=0) as gz:
        gz.write(raw)
print(f"  wrote city.json.gz: {os.path.getsize(os.path.join(OUT, 'city.json.gz')) // 1024} KB (raw {len(raw) // 1024} KB)")
