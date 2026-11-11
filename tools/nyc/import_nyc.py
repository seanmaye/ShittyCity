"""Convert the New York model's data into this engine's formats (data/nyc/).

  python -I tools/nyc/import_nyc.py <path to the nyc-city-model checkout> [out dir]

The source is the NYC City Model repository (\\\\192.168.168.72\\tsptemp\\sean\\nyc-city-model,
imported at commit 676aee9). It reads that checkout's data/map.json.gz, transit.json,
landmarks.json and monorail.json, and writes data/nyc/ in the same formats as Philadelphia's files
(see docs/EDITING.md):

  buildings.json.gz      Manhattan's footprints (outside the outer-borough detail windows), like
                         data/buildings.json; footprints a modelled landmark replaces are left out
  city_buildings.bin.gz  the outer-borough detail windows as PHB1 (like data/city_buildings.bin.gz):
                         clean low-rise rectangles as boxes, every other footprint as an outline
  city.json.gz           land outlines (the "limits": borough shorelines and the New Jersey
                         waterfront), parks, streets, paths, water and trees, like data/city.json.gz
  ground.json            the Manhattan extent only (everything it would hold is in city.json.gz)
  river.json, trees.json empty: New York's water and trees are in city.json.gz
  transit.json           the MTA lines, as kind "nycsub", with each stop's lines merged into one station
  landmarks.json         the modelled towers, labels and camera views (js/scene/nyc/landmarks.js)
  monorail.json          the proposed East River Loop (js/scene/nyc/monorail.js)

Standard library only. The footprint helpers (simplify_*, dm_ring, fit_rectangular_lowrise) are
ported from the NYC repository's tools/build.py so the geometry matches its own build.
"""
import gzip, json, math, os, struct, sys

if len(sys.argv) < 2:
    raise SystemExit(__doc__)
SRC = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "..", "..", "data", "nyc")

LAT0, LON0 = 40.745, -73.984          # the NYC frame (js/cities.js), x east / z south in metres
MX, MZ = 111000 * math.cos(math.radians(LAT0)), 111000
# Manhattan's detailed extent (the NYC fetch_map.py bbox): the "core" of this city
CORE_WSEN = (-74.025, 40.695, -73.944, 40.804)
# the hand-modelled bridges (js/scene/nyc/bridges.js): their OSM decks are left out of the streets
MODELLED_BRIDGES = ("Brooklyn Bridge", "Manhattan Bridge", "Williamsburg Bridge", "Queensboro Bridge")


def xz(lon, lat):
    return (lon - LON0) * MX, -(lat - LAT0) * MZ


def bbox_dm(wsen):
    (x0, z1), (x1, z0) = xz(wsen[0], wsen[1]), xz(wsen[2], wsen[3])
    return [int(round(v * 10)) for v in (x0, z0, x1, z1)]


def read_json(path):
    with (gzip.open(path, "rt", encoding="utf-8") if path.endswith(".gz") else open(path, encoding="utf-8")) as f:
        return json.load(f)


# ---- geometry helpers (ported from nyc-city-model/tools/build.py)
def polys(geom):
    if not geom:
        return []
    t, c = geom.get("type"), geom.get("coordinates", [])
    return [c] if t == "Polygon" else c if t == "MultiPolygon" else []


def line_geoms(geom):
    if not geom:
        return []
    t, c = geom.get("type"), geom.get("coordinates", [])
    return [c] if t == "LineString" else c if t == "MultiLineString" else []


def simplify_line(coords, tolerance):
    if len(coords) < 3:
        return coords
    keep = {0, len(coords) - 1}
    stack = [(0, len(coords) - 1)]
    tol2 = tolerance * tolerance
    while stack:
        start, end = stack.pop()
        ax, az = coords[start][:2]
        bx, bz = coords[end][:2]
        dx, dz = bx - ax, bz - az
        l2 = dx * dx + dz * dz
        far, split = tol2, None
        for i in range(start + 1, end):
            px, pz = coords[i][:2]
            f = max(0, min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) if l2 else 0
            d = (px - ax - f * dx) ** 2 + (pz - az - f * dz) ** 2
            if d > far:
                far, split = d, i
        if split is not None:
            keep.add(split)
            stack.extend(((start, split), (split, end)))
    return [coords[i] for i in sorted(keep)]


def simplify_ring(coords, tolerance):
    """Drop sub-tolerance survey noise while keeping each footprint's outline."""
    if len(coords) < 6 or coords[0][:2] != coords[-1][:2]:
        return coords
    points = coords[:-1]
    x, z = points[0][:2]
    split = max(range(1, len(points)), key=lambda i: (points[i][0] - x) ** 2 + (points[i][1] - z) ** 2)
    first = simplify_line(points[:split + 1], tolerance)
    second = simplify_line(coords[split:], tolerance)
    out = first[:-1] + second
    return out if len(out) >= 5 else coords


def dm_ring(coords, positive=False):
    """[[x, z], ...] metres -> flat decimetres, open, outer rings counter-clockwise (positive area)."""
    pts = [[int(round(float(p[0]) * 10)), int(round(float(p[1]) * 10))] for p in coords]
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts.pop()
    if len(pts) < 3:
        return []
    a = sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))
    if (a > 0) != positive:
        pts.reverse()
    return [v for p in pts for v in p]


def dm_line(coords):
    return [int(round(float(v) * 10)) for p in coords if len(p) >= 2 for v in p[:2]]


def fit_rectangular_lowrise(ring):
    """A compact oriented rectangle (cx, cz, w, d, yaw, area) for a clean low-rise footprint, or None."""
    pts = [(float(p[0]), float(p[1])) for p in ring]
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts.pop()
    if len(pts) < 4:
        return None
    edge = max(((pts[(i + 1) % len(pts)][0] - p[0], pts[(i + 1) % len(pts)][1] - p[1]) for i, p in enumerate(pts)),
               key=lambda v: v[0] * v[0] + v[1] * v[1])
    if edge[0] ** 2 + edge[1] ** 2 < 16:
        return None
    phi = math.atan2(edge[1], edge[0])
    c, s = math.cos(phi), math.sin(phi)
    uv = [(x * c + z * s, -x * s + z * c) for x, z in pts]
    u0, u1 = min(p[0] for p in uv), max(p[0] for p in uv)
    v0, v1 = min(p[1] for p in uv), max(p[1] for p in uv)
    w, d = u1 - u0, v1 - v0
    box = w * d
    if box < 24 or box > 1100 or min(w, d) < 4.5 or max(w, d) > 48 or max(w, d) / max(.01, min(w, d)) > 5.5:
        return None
    area = abs(sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))) / 2
    if area / box < .94:
        return None
    if max(min(abs(u - u0), abs(u - u1), abs(v - v0), abs(v - v1)) for u, v in uv) > .35:
        return None
    cu, cv = (u0 + u1) / 2, (v0 + v1) / 2
    return cu * c - cv * s, cu * s + cv * c, w, d, -phi, box   # yaw: three.js rotation.y


def ring_area(r):
    return abs(sum(r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1] for i in range(len(r)))) / 2


# ---- read the NYC model
print("reading", SRC)
M = read_json(os.path.join(SRC, "data", "map.json.gz"))
LM = read_json(os.path.join(SRC, "data", "landmarks.json"))
TR = read_json(os.path.join(SRC, "data", "transit.json"))
MONO = read_json(os.path.join(SRC, "data", "monorail.json"))
os.makedirs(OUT, exist_ok=True)


def write_json(name, obj):
    path = os.path.join(OUT, name)
    text = json.dumps(obj, separators=(",", ":"), ensure_ascii=False)
    if name.endswith(".gz"):
        with open(path, "wb") as fo, gzip.GzipFile(fileobj=fo, mode="wb", compresslevel=9, mtime=0) as gz:
            gz.write(text.encode("utf-8"))
    else:
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
    print(f"  {name}: {os.path.getsize(path) // 1024} KB")


# ---- buildings: Manhattan as footprints; the detail windows as boxes and outlines (PHB1)
replaced = {str(f["source_id"]) for f in LM["features"] if f.get("source_id") is not None}
core_b, boxes, outlines = [], [], []
for f in M["buildings"]:
    if str(f.get("id")) in replaced:
        continue
    h = max(3.0, float(f.get("height_m") or 8.0))
    shapes = polys(f.get("geometry"))
    if not f.get("detail_window"):
        for poly in shapes:
            rings = [dm_ring(simplify_ring(r, .35) if len(poly) == 1 else r, positive=(i == 0)) for i, r in enumerate(poly)]
            rings = [r for r in rings if r]
            if rings:
                core_b.append([int(round(h * 10)), 0, *rings])
        continue
    for poly in shapes:
        outer = poly[0]
        fit = fit_rectangular_lowrise(outer) if h < 16 and len(poly) == 1 else None
        if fit:
            cx, cz, w, d, yaw, area = fit
            boxes.append((cx, cz, w, d, yaw % math.pi, h, 0 if area < 320 else 1))
            continue
        ring = simplify_ring(outer, .35)
        pts = [(float(p[0]), float(p[1])) for p in ring]
        if len(pts) > 1 and pts[0] == pts[-1]:
            pts.pop()
        if len(pts) < 3:
            continue
        outlines.append((pts, h, 0 if h < 16 and ring_area(pts) < 320 else 1))
write_json("buildings.json.gz", {"styles": [None], "b": core_b})
print(f"  {len(core_b)} Manhattan footprints, {len(boxes)} boxes, {len(outlines)} outlines")

# PHB1, as tools/build_city.py writes it: sorted by 1 km tile so the delta coding stays small
dm = lambda v: int(round(v * 10))  # noqa: E731
u16 = lambda v: max(0, min(65535, int(round(v))))  # noqa: E731
boxes.sort(key=lambda b: (int(b[1] // 1000), int(b[0] // 1000), b[0]))
outlines.sort(key=lambda p: (int(p[0][0][1] // 1000), int(p[0][0][0] // 1000)))


def deltas(vals):
    out, prev = [], 0
    for v in vals:
        out.append(v - prev)
        prev = v
    return out


pv_x, pv_z, pv_n, pv_h, pv_k = [], [], [], [], []
for r, h, k in outlines:
    xs, zs = [dm(p[0]) for p in r], [dm(p[1]) for p in r]
    pv_x += [xs[0]] + [xs[i] - xs[i - 1] for i in range(1, len(xs))]
    pv_z += [zs[0]] + [zs[i] - zs[i - 1] for i in range(1, len(zs))]
    pv_n.append(len(r))
    pv_h.append(min(65535, dm(h)))
    pv_k.append(k)
blob = b"".join([
    b"PHB1", struct.pack("<III", len(boxes), len(outlines), len(pv_x)),
    struct.pack(f"<{len(boxes)}i", *deltas([dm(b[0]) for b in boxes])),
    struct.pack(f"<{len(boxes)}i", *deltas([dm(b[1]) for b in boxes])),
    struct.pack(f"<{len(pv_x)}i", *pv_x), struct.pack(f"<{len(pv_z)}i", *pv_z),
    struct.pack(f"<{len(boxes)}H", *[u16(b[2] * 10) for b in boxes]),
    struct.pack(f"<{len(boxes)}H", *[u16(b[3] * 10) for b in boxes]),
    struct.pack(f"<{len(boxes)}H", *[u16(b[4] / math.pi * 65535) for b in boxes]),
    struct.pack(f"<{len(boxes)}H", *[u16(b[5] * 10) for b in boxes]),
    struct.pack(f"<{len(pv_n)}H", *pv_n), struct.pack(f"<{len(pv_h)}H", *pv_h),
    bytes(b[6] for b in boxes), bytes(pv_k),
])
with open(os.path.join(OUT, "city_buildings.bin.gz"), "wb") as fo, gzip.GzipFile(fileobj=fo, mode="wb", compresslevel=9, mtime=0) as gz:
    gz.write(blob)
print(f"  city_buildings.bin.gz: {os.path.getsize(os.path.join(OUT, 'city_buildings.bin.gz')) // 1024} KB")


# ---- ground: land outlines, parks, streets and paths, water, trees (all in city.json.gz)
def green_kind(t):
    """this engine's park colours (ground.js GREEN): park, grass, pitch, wood, cemetery"""
    if t.get("natural") in ("wood", "heath") or t.get("landuse") == "forest" or t.get("leisure") == "nature_reserve":
        return 3
    if t.get("landuse") == "cemetery":
        return 4
    if t.get("leisure") == "pitch":
        return 2
    if t.get("leisure") in ("park", "garden", "playground"):
        return 0
    return 1


def rings_of(poly, simplify=0):
    out = []
    for i, r in enumerate(poly):
        if simplify and i == 0:
            r = simplify_ring(r, simplify)
        flat = dm_ring(r, positive=(i == 0))
        if flat:
            out.append(flat)
    return out


limits = [r for f in M["land"] for poly in polys(f["geometry"]) for r in rings_of(poly[:1])]
green = [[green_kind(f.get("tags") or {}), *rs] for f in M["greenspace"] for poly in polys(f.get("geometry")) for rs in [rings_of(poly)] if rs]
water = [rs for f in M["water"] for poly in polys(f.get("geometry")) for rs in [rings_of(poly)] if rs]

PATHS = {"footway", "path", "cycleway", "pedestrian", "steps"}
ROADS = {"motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link",
         "tertiary", "tertiary_link", "residential", "living_street", "unclassified"}
lines, dropped = [], 0
for f in M["roads"]:
    t = f.get("tags") or {}
    hw = t.get("highway", "residential")
    if hw not in ROADS and hw not in PATHS:
        continue
    path = hw in PATHS
    w0 = 3.0 if path else 9 if hw in ("motorway", "trunk", "primary") else 6 if hw in ("secondary", "tertiary") else 4.2
    try:
        w = float(t.get("width") or w0)
    except (TypeError, ValueError):
        w = w0
    bridge = str(t.get("bridge", "")).lower() in {"yes", "true", "viaduct", "movable", "aqueduct"}
    name = t.get("bridge:name") or t.get("name") or ""
    if bridge and any(b in name for b in MODELLED_BRIDGES):
        dropped += 1
        continue
    try:
        layer = int(t.get("layer") or 0)
    except (TypeError, ValueError):
        layer = 0
    for ln in line_geoms(f.get("geometry")):
        p = dm_line(simplify_line(ln, .65 if path else 1.0))
        length = sum(math.hypot((p[i + 2] - p[i]) / 10, (p[i + 3] - p[i + 1]) / 10) for i in range(0, len(p) - 2, 2))
        if len(p) >= 4 and length >= (8 if path else 18):
            lines.append({"k": 1 if path else 0, "w": w, "b": int(bridge), "l": layer, "p": p})
trees = [int(round(float(v) * 10)) for x, z in M["trees"] for v in (x, z)]
core = bbox_dm(CORE_WSEN)
write_json("city.json.gz", {"core": core, "bbox": bbox_dm(M["frame"]["bbox_wsen"]), "limits": limits, "green": green,
                            "lines": lines, "dams": [], "water": water, "streams": [], "trees": trees})
print(f"  {len(limits)} land outlines, {len(green)} parks, {len(lines)} streets and paths "
      f"({dropped} decks of modelled bridges left out), {len(water)} water areas, {len(trees) // 2} trees")
write_json("ground.json", {"bbox": core, "green": [], "lines": []})
write_json("river.json", {"water": [], "river": [], "center": [], "dams": []})
write_json("trees.json", [])

# ---- transit: the MTA lines as kind "nycsub"; one station per stop, listing all its lines
KIND = "nycsub"
# every ride path must be a closed out-and-back loop of finite [x, z, y] points, or the ride jumps
# (the NYC repository's tools/check_transit.py)
for run in TR["runs"]:
    flat = run["p"]
    if len(flat) < 9 or len(flat) % 3 or not all(math.isfinite(v) for v in flat):
        raise SystemExit(f'line {run["line"]}: invalid ride path')
    pts = [flat[i:i + 3] for i in range(0, len(flat), 3)]
    if pts[0] != pts[-1]:
        raise SystemExit(f'line {run["line"]}: the ride path must end where it starts')
    print(f'  line {run["line"]}: {len(pts)} points, longest step {max(math.dist(a, b) for a, b in zip(pts, pts[1:])) / 10:.1f} m')
if {str(l["id"]) for l in TR["lines"]} != {str(r["line"]) for r in TR["runs"]}:
    raise SystemExit("every line needs exactly one ride path")
stations = []
for s in TR["stations"]:
    hit = next((o for o in stations if o["t"] == s["t"] and math.hypot(o["x"] - s["x"], o["z"] - s["z"]) < 250), None)
    if hit:
        hit["lines"] += [i for i in s.get("L", []) if i not in hit["lines"]]
        if s.get("u"):
            hit["u"] = [KIND]
        continue
    stations.append({"t": s["t"], "x": s["x"], "z": s["z"], "k": [KIND], "u": [KIND] if s.get("u") else [], "lines": list(s.get("L", []))})
order = [l["id"] for l in TR["lines"]]
for s in stations:
    s["lines"].sort(key=order.index)
transit = {
    "note": TR.get("elevationNote", ""),
    "lines": [{"id": l["id"], "name": f'{l["id"]} · {l["name"]}', "kind": KIND, "color": l["color"]} for l in TR["lines"]],
    "tracks": [{**t, "k": KIND} for t in TR["tracks"]],
    "runs": TR["runs"],
    "platforms": [{**p, "k": KIND} for p in TR["platforms"]],
    "stations": stations,
    "sections": [{**s, "name": s["name"].replace(" cutaway", "")} for s in TR["sections"]],
}
write_json("transit.json", transit)
print(f"  {len(transit['lines'])} lines, {len(stations)} stations (from {len(TR['stations'])} stops)")

# ---- landmarks and the proposed monorail, carried over as they are
write_json("landmarks.json", {k: LM[k] for k in ("features", "views", "labels")})
write_json("monorail.json", MONO)
print("done")
