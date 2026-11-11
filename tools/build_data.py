"""Turn the raw downloads into the compact JSON files the scene loads.

  python -I tools/build_data.py [raw_dir] [out_dir]

raw_dir defaults to tools/raw (see fetch_data.py), out_dir to data/.
All coordinates are written as integer decimetres in the scene's local frame
(x = metres east, z = metres south of 39.9560 N, 75.1760 W).
"""
import json, math, os, random, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geom import (Grid, area, centroid, clip_line, clip_ring, min_rect, point_in_poly,  # noqa: E402
                  point_in_ring, proj, seg_dist, simplify, simplify_ring, stitch)

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "raw")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "..", "data")
os.makedirs(OUT, exist_ok=True)

S, W, N, E = 39.936, -75.208, 39.982, -75.152
BX0, BZ1 = proj(S, W)
BX1, BZ0 = proj(N, E)
FT = 0.3048
random.seed(7)


def dm(v):
    return int(round(v * 10))


def flat(pts):
    out = []
    for x, z in pts:
        out += [dm(x), dm(z)]
    return out


def dump(name, obj):
    p = os.path.join(OUT, name)
    with open(p, "w") as f:
        json.dump(obj, f, separators=(",", ":"))
    print(f"  wrote {name}: {os.path.getsize(p) // 1024} KB")


# --------------------------------------------------------------------------- landmarks
# Signature towers keep their hand-modelled caps; position, size and rotation come from
# the real footprint. Heights are the published architectural heights (metres).
CAPPED = [
    # id, footprint name, approx lat/lon (fallback search), height, tower w x d, colour, cap, kind, label
    ("ctc", "comcast innovation and technology center", 39.9550, -75.1706, 342, (52, 48), "#b4c4d2", "ctc", "glass", "Comcast Technology Center"),
    ("comcast", "comcast center", 39.9545, -75.1682, 297, (60, 60), "#7f9cb2", "taper", "glass", "Comcast Center"),
    ("lib1", "one liberty place", 39.9522, -75.1678, 288, (50, 50), "#5f7f9e", "liberty", "glass", "One Liberty Place"),
    ("lib2", "two liberty place", 39.9514, -75.1662, 258, (46, 44), "#5f7f9e", "liberty", "glass", None),
    ("mellon", "bny mellon center", 39.9534, -75.1699, 241, (50, 50), "#b99f86", "pyramid", "stone", None),
    ("logan3", "three logan square", 39.9557, -75.1692, 225, (48, 42), "#7a7f86", "stepped", "stone", None),
    ("comm1", "one commerce square", 39.9536, -75.1738, 172, (44, 44), "#cfc6b4", "pyramid", "stone", None),
    ("comm2", "two commerce square", 39.9526, -75.1743, 172, (44, 44), "#cfc6b4", "pyramid", "stone", None),
    ("psfs", "loews philadelphia hotel", 39.9516, -75.1606, 150, (44, 30), "#556270", "psfs", "stone", None),
]
# Flat-topped towers are drawn from their real footprint and LiDAR height, in the original colours.
STYLED = [
    ("ibx", "independence blue cross", 39.9541, -75.1720, "#9aa0a6", "stone", None),
    ("b1818", "1818 beneficial bank place", 39.9530, -75.1714, "#a9b1b8", "stone", None),
    ("centresq", "centre square", 39.9520, -75.1656, "#4a4f55", "stone", None),
    ("ritz", "addr:1414 S PENN SQ", 39.9513, -75.1646, "#6c879e", "glass", None),
    ("murano", "osm:The Murano", 39.9548, -75.1757, "#7f98ad", "glass", None),
    ("laurel", None, 39.9500, -75.1734, "#8aa2b5", "glass", None),
    ("aramark", "aramark tower", 39.9520, -75.1585, "#93a9b9", "glass", None),
    ("fmc", "fmc tower", 39.9512, -75.1840, "#9fb2c2", "glass", "FMC Tower"),
    ("evo", "evo cira center south", 39.9525, -75.1843, "#8aa2b5", "glass", None),
    ("cira", "addr:2929 ARCH ST", 39.9575, -75.1828, "#8fb0c6", "glass", "Cira Centre"),
]

# --------------------------------------------------------------------------- buildings
print("Buildings")
src = json.load(open(os.path.join(RAW, "philly_buildings.geojson")))
B = []  # dicts: rings, h, name, addr, c (centroid), a (area)
for f in src["features"]:
    g, p = f["geometry"], f["properties"]
    if not g:
        continue
    polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
    h = p.get("approx_hgt") or p.get("max_hgt") or 25
    h = max(3.0, h * FT)
    for poly in polys:
        rings = []
        for k, r in enumerate(poly):
            pts = [proj(lat, lon) for lon, lat in r]
            if len(pts) > 1 and pts[0] == pts[-1]:
                pts = pts[:-1]
            pts = simplify_ring(pts, 0.25)
            if len(pts) < 3 or abs(area(pts)) < (4 if k == 0 else 2):
                if k == 0:
                    break
                continue
            # outer ring counter-clockwise in x/z screen sense, holes opposite
            if (area(pts) > 0) != (k == 0):
                pts = pts[::-1]
            rings.append(pts)
        if not rings:
            continue
        c = centroid(rings[0])
        if not (BX0 <= c[0] <= BX1 and BZ0 <= c[1] <= BZ1):
            continue
        B.append({"rings": rings, "h": h, "name": (p.get("building_name") or "").strip(),
                  "addr": (p.get("address") or "").strip(), "c": c, "a": abs(area(rings[0]))})
print(f"  {len(B)} footprints in bbox")


# A few buildings are missing from the city layer (Amtrak's 30th Street Station, the Murano);
# take their outlines from OpenStreetMap.
osm = json.load(open(os.path.join(RAW, "osm.json")))["elements"]
OSM_B = {}
for el in osm:
    t = el.get("tags", {})
    if el["type"] == "way" and "building" in t and t.get("name") and el.get("geometry"):
        r = [proj(p["lat"], p["lon"]) for p in el["geometry"]][:-1]
        if area(r) < 0:
            r = r[::-1]
        OSM_B[t["name"]] = {"rings": [r], "h": float(t.get("height", 0) or 0), "name": t["name"], "addr": "",
                            "c": centroid(r), "a": abs(area(r))}


def find(name, lat, lon, radius=90):
    if name and name.startswith("osm:"):
        o = OSM_B[name[4:]]
        inside = [b for b in B if point_in_poly(o["c"][0], o["c"][1], b["rings"])]
        if inside:
            return inside[0]
        B.append(o)
        return o
    if name and name.startswith("addr:"):
        hit = [b for b in B if b["addr"].upper() == name[5:]]
        return max(hit, key=lambda b: b["a"])
    x, z = proj(lat, lon)
    if name:
        hit = [b for b in B if b["name"].lower() == name]
        if hit:
            return max(hit, key=lambda b: b["a"])
    near = [b for b in B if math.hypot(b["c"][0] - x, b["c"][1] - z) < radius]
    return max(near, key=lambda b: b["h"]) if near else None


def obb(b):
    cx, cz, w, d, ry = min_rect(b["rings"][0])
    return {"x": round(cx, 1), "z": round(cz, 1), "w": round(w, 1), "d": round(d, 1), "ry": round(ry, 4)}


def in_box(pt, box, pad=0.0):
    dx, dz = pt[0] - box["x"], pt[1] - box["z"]
    c, s = math.cos(box["ry"]), math.sin(box["ry"])
    lx, lz = dx * c - dz * s, dx * s + dz * c  # inverse of rotation.y
    return abs(lx) <= box["w"] / 2 + pad and abs(lz) <= box["d"] / 2 + pad


drop = set()  # ids of footprints replaced by hand-modelled landmarks
styles = [None]  # index 0 = generic
style_of = {}
h_of = {}  # height overrides (podiums under stylised towers)
LM = {"towers": [], "labels": []}


def label(text, x, z, y):
    LM["labels"].append({"t": text, "x": round(x, 1), "z": round(z, 1), "y": y})


def add_style(sid, col, kind):
    styles.append({"id": sid, "color": col, "kind": kind})
    return len(styles) - 1


for tid, name, lat, lon, h, (tw, td), col, cap, kind, lbl in CAPPED:
    b = find(name, lat, lon)
    box = obb(b)
    # The footprint often includes a podium or atrium: centre the tower on it at its real
    # floor-plate size and keep the rest of the lot as a low base in the same cladding.
    long_ax = box["w"] >= box["d"]
    tl, ts = max(tw, td), min(tw, td)
    if long_ax:
        box["w"], box["d"] = min(box["w"], tl), min(box["d"], ts)
    else:
        box["w"], box["d"] = min(box["w"], ts), min(box["d"], tl)
    for o in B:
        if o is not b and in_box(o["c"], box, 2):
            drop.add(id(o))
    style_of[id(b)] = add_style(tid, col, kind)
    h_of[id(b)] = max(12.0, min(30.0, h * 0.08))
    LM["towers"].append(dict(box, id=tid, h=h, color=col, cap=cap, kind=kind))
    if lbl:
        label(lbl, box["x"], box["z"], h + 8)
    print(f"  {tid:9s} <- {b['name'] or b['addr']:42s} tower {box['w']:5.1f}x{box['d']:5.1f}m  lidar {b['h']:5.1f}m  model {h}m")

for tid, name, lat, lon, col, kind, lbl in STYLED:
    b = find(name, lat, lon)
    style_of[id(b)] = add_style(tid, col, kind)
    if not b["h"]:
        b["h"] = 144.0  # Murano, OSM outline only
    if lbl:
        label(lbl, b["c"][0], b["c"][1], round(b["h"]) + 8)
    print(f"  {tid:9s} <- {b['name'] or b['addr']:42s} lidar {b['h']:5.1f}m")

# City Hall: tower on the north side, courtyard building
ch = find("city hall", 39.9524, -75.1636)
box = obb(ch)
for o in B:
    if in_box(o["c"], box, 4):
        drop.add(id(o))
LM["cityhall"] = box
print(f"  cityhall  {box}")

# 30th Street Station (OSM outline): long axis on local z
st = OSM_B["William H. Gray III 30th Street Station"]
st_box = obb(st)
# The OSM outline includes the east annex; the head house is ~100 m (E-W) by ~195 m (N-S).
# Put local z on the axis nearest north-south.
if abs(math.cos(st_box["ry"])) < abs(math.sin(st_box["ry"])):
    st_box["w"], st_box["d"], st_box["ry"] = st_box["d"], st_box["w"], round(st_box["ry"] + math.pi / 2, 4)
st_box["w"], st_box["d"] = min(st_box["w"], 100.0), min(st_box["d"], 195.0)
for o in B:
    if in_box(o["c"], st_box, 3):
        drop.add(id(o))
LM["station"] = st_box
print(f"  station   {st_box}")

# Art Museum: real centroid; the stylised model faces City Hall down the Parkway
pma = find("philadelphia museum of art (pma)", 39.9655, -75.1806)
LM["museum"] = {"x": round(pma["c"][0], 1), "z": round(pma["c"][1], 1)}
for o in B:
    if math.hypot(o["c"][0] - pma["c"][0], o["c"][1] - pma["c"][1]) < 125:
        drop.add(id(o))

# Eastern State: the city layer has the whole walled site as one block, so keep the
# stylised wall and radial cell blocks, fitted to the real site.
esp = find("eastern state penitentiary museum", 39.9683, -75.1727)
# The site outline is irregular, so take the wall orientation from the surrounding street grid
angs = []
for o in B:
    d_ = math.hypot(o["c"][0] - esp["c"][0], o["c"][1] - esp["c"][1])
    if 120 < d_ < 400 and len(o["rings"][0]) == 4:
        r = min_rect(o["rings"][0])[4] % (math.pi / 2)
        angs.append(r - math.pi / 2 if r > math.pi / 4 else r)
angs.sort()
gry = angs[len(angs) // 2]
c_, s_ = math.cos(gry), math.sin(gry)
lx = [x * c_ - z * s_ for x, z in esp["rings"][0]]
lz = [x * s_ + z * c_ for x, z in esp["rings"][0]]
mx, mz = (max(lx) + min(lx)) / 2, (max(lz) + min(lz)) / 2
eb = {"x": round(mx * c_ + mz * s_, 1), "z": round(-mx * s_ + mz * c_, 1),
      "w": round(max(lx) - min(lx), 1), "d": round(max(lz) - min(lz), 1), "ry": round(gry, 4)}
ex, ez = eb["x"], eb["z"]
LM["esp"] = {"x": ex, "z": ez, "ry": eb["ry"], "size": round(min(eb["w"], eb["d"]), 1)}
drop.add(id(esp))
esp_style = add_style("esp", "#9b9387", "stone")
for o in B:
    if o is not esp and in_box(o["c"], eb, 0):
        style_of[id(o)] = esp_style
print(f"  esp       {LM['esp']}")

# Boathouse Row: each real boathouse becomes a gabled, outlined boathouse
LM["boathouses"] = []
for o in B:
    m = re.match(r"^(\d+) JOHN B KELLY DR", o["addr"].upper())
    if m and int(m.group(1)) <= 15 and o["h"] >= 6 and o["a"] > 120:
        box = obb(o)
        if box["d"] > box["w"]:
            box["w"], box["d"], box["ry"] = box["d"], box["w"], round(box["ry"] + math.pi / 2, 4)
        box["h"] = round(o["h"], 1)
        LM["boathouses"].append(box)
        drop.add(id(o))
LM["boathouses"].sort(key=lambda b: b["x"])
bh = LM["boathouses"]
print(f"  {len(bh)} boathouses")
if bh:
    mid = bh[len(bh) // 2]
    label("Boathouse Row", mid["x"], mid["z"], 22)

# Fairmount Water Works: real footprints in white
styles.append({"id": "waterworks", "color": "#efe9dc", "kind": "stone"})
ww_style = len(styles) - 1
ww = [o for o in B if "WATER WORKS DR" in o["addr"].upper()]
for o in ww:
    style_of[id(o)] = ww_style
if ww:
    label("Fairmount Water Works", sum(o["c"][0] for o in ww) / len(ww), sum(o["c"][1] for o in ww) / len(ww), 20)

label("City Hall", LM["cityhall"]["x"], LM["cityhall"]["z"] - (LM["cityhall"]["d"] / 2 - 16), 172)
label("30th Street Station", st_box["x"], st_box["z"], 40)
label("Philadelphia Museum of Art", LM["museum"]["x"], LM["museum"]["z"], 52)
label("Eastern State Penitentiary", ex, ez, 18)

out_b = []
for o in B:
    if id(o) in drop:
        continue
    out_b.append([dm(h_of.get(id(o), o["h"])), style_of.get(id(o), 0)] + [flat(r) for r in o["rings"]])
print(f"  {len(out_b)} footprints kept, {len(drop)} replaced by landmark models")

# --------------------------------------------------------------------------- OSM
print("OpenStreetMap")
PAD = 400
CX0, CZ0, CX1, CZ1 = BX0 - PAD, BZ0 - PAD, BX1 + PAD, BZ1 + PAD


def way_pts(el):
    return [proj(p["lat"], p["lon"]) for p in el.get("geometry", []) if p]


def polygons(el):
    """Return list of polygons (each a list of rings: outer, holes) in local metres."""
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
    polys = [[[proj(*p) for p in r]] for r in stitch(outers)]
    for r in stitch(inners):
        hr = [proj(*p) for p in r]
        for poly in polys:
            if point_in_ring(hr[0][0], hr[0][1], poly[0]):
                poly.append(hr)
                break
    return polys


def clip_poly(poly, tol=0.6, rect=None):
    out = []
    for k, r in enumerate(poly):
        r = clip_ring(r, *(rect or (CX0, CZ0, CX1, CZ1)))
        if len(r) < 3:
            if k == 0:
                return None
            continue
        r = simplify_ring(r, tol)
        if (area(r) > 0) != (k == 0):
            r = r[::-1]
        out.append(r)
    return out


tags = lambda el: el.get("tags", {})  # noqa: E731

# ---- water
water, river_polys, dams, river_lines = [], [], [], []
for el in osm:
    t = tags(el)
    if t.get("natural") == "water" or t.get("waterway") == "riverbank":
        is_river = t.get("water") == "river" or t.get("waterway") == "riverbank" or "schuylkill" in t.get("name", "").lower()
        for poly in polygons(el):
            cp = clip_poly(poly, 0.8)
            if not cp or abs(area(cp[0])) < 20:
                continue
            water.append(cp)
            if is_river:
                river_polys.append(cp)
    elif t.get("waterway") == "river" and "schuylkill" in t.get("name", "").lower():
        river_lines.append([(p["lat"], p["lon"]) for p in el.get("geometry", [])])
    elif t.get("waterway") in ("dam", "weir"):
        for piece in clip_line(way_pts(el), BX0, BZ0, BX1, BZ1):
            dams.append(flat(piece))
print(f"  water polygons {len(water)} (river {len(river_polys)}), dams {len(dams)}")


# ---- river centreline + width from the real banks
river_segs = []
for poly in river_polys:
    for r in poly:
        for i in range(len(r)):
            river_segs.append((r[i], r[(i + 1) % len(r)]))
seg_grid = Grid(100)
for s in river_segs:
    (x1, z1), (x2, z2) = s
    seg_grid.add(s, min(x1, x2), min(z1, z2), max(x1, x2), max(z1, z2))


def ray(px, pz, dx, dz, maxd=700):
    best = maxd
    t = 0.0
    seen = set()
    while t < best:  # march through grid cells along the ray
        for s in seg_grid.near(px + dx * t, pz + dz * t):
            if id(s) in seen:
                continue
            seen.add(id(s))
            (ax, az), (bx, bz) = s
            ex, ez = bx - ax, bz - az
            den = dx * ez - dz * ex
            if abs(den) < 1e-12:
                continue
            u = ((ax - px) * ez - (az - pz) * ex) / den
            v = ((ax - px) * dz - (az - pz) * dx) / den
            if 0 <= v <= 1 and 0 < u < best:
                best = u
        t += 50
    return best if best < maxd else None


def resample(pts, n):
    d = [0.0]
    for i in range(1, len(pts)):
        d.append(d[-1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    out, j = [], 0
    for k in range(n):
        s = d[-1] * k / (n - 1)
        while j < len(d) - 2 and d[j + 1] < s:
            j += 1
        f = 0 if d[j + 1] == d[j] else (s - d[j]) / (d[j + 1] - d[j])
        out.append((pts[j][0] + (pts[j + 1][0] - pts[j][0]) * f, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * f))
    return out


def smooth(vals, k):
    out = []
    for i in range(len(vals)):
        lo, hi = max(0, i - k), min(len(vals), i + k + 1)
        out.append(sum(vals[lo:hi]) / (hi - lo))
    return out


def median(vals, k):
    out = []
    for i in range(len(vals)):
        w = sorted(vals[max(0, i - k): i + k + 1])
        out.append(w[len(w) // 2])
    return out


def main_stem(lines):
    """Shortest path through the river-line network from its southern to its northern end.
    OSM splits the Schuylkill around the dam, the Water Works forebay and bridge piers;
    the shortest route follows the main channel."""
    import heapq
    key = lambda p: (round(p[0], 6), round(p[1], 6))  # noqa: E731
    adj, pos = {}, {}
    for l in lines:
        for a, b in zip(l, l[1:]):
            ka, kb = key(a), key(b)
            pos[ka], pos[kb] = a, b
            d = math.hypot(*(u - v for u, v in zip(proj(*a), proj(*b))))
            adj.setdefault(ka, []).append((kb, d))
            adj.setdefault(kb, []).append((ka, d))
    src = min(pos, key=lambda k: pos[k][0])
    dst = max(pos, key=lambda k: pos[k][0])
    dist, prev, pq = {src: 0.0}, {}, [(0.0, src)]
    while pq:
        d, u = heapq.heappop(pq)
        if u == dst:
            break
        if d > dist.get(u, 1e18):
            continue
        for v, w in adj[u]:
            if d + w < dist.get(v, 1e18):
                dist[v], prev[v] = d + w, u
                heapq.heappush(pq, (d + w, v))
    path, u = [dst], dst
    while u != src:
        u = prev[u]
        path.append(u)
    return [pos[k] for k in reversed(path)]


line = [proj(*p) for p in main_stem(river_lines)]
pieces = clip_line(line, BX0 - 300, BZ0 - 300, BX1, BZ1 + 600)
line = max(pieces, key=len)
if line[0][1] < line[-1][1]:  # run south -> north (z decreasing)
    line = line[::-1]
NS = 700
pts = resample(line, NS)
for it in range(3):
    xs, zs = smooth([p[0] for p in pts], 4), smooth([p[1] for p in pts], 4)
    pts = resample(list(zip(xs, zs)), NS)
    newp, widths = [], []
    for i, (x, z) in enumerate(pts):
        a, b = pts[max(0, i - 2)], pts[min(NS - 1, i + 2)]
        tx, tz = b[0] - a[0], b[1] - a[1]
        L = math.hypot(tx, tz)
        tx, tz = tx / L, tz / L
        nx, nz = -tz, tx
        r, l = ray(x, z, nx, nz), ray(x, z, -nx, -nz)
        if r is None or l is None:
            newp.append((x, z))
            widths.append(None)
            continue
        newp.append((x + nx * (r - l) / 2, z + nz * (r - l) / 2))
        widths.append(r + l)
    good = [w for w in widths if w]
    fill = sum(good) / len(good)
    last = fill
    for i, w in enumerate(widths):
        if w is None:
            widths[i] = last
        else:
            last = w
    pts = newp
widths = smooth(median(widths, 9), 6)
xs, zs = smooth([p[0] for p in pts], 3), smooth([p[1] for p in pts], 3)
center = []
for x, z, w in zip(xs, zs, widths):
    center += [dm(x), dm(z), dm(max(50, min(320, w)))]
print(f"  river centreline {NS} samples, width {min(widths):.0f}-{max(widths):.0f} m")

dump("river.json", {
    "water": [[flat(r) for r in poly] for poly in water],
    "river": [i for i, poly in enumerate(water) if poly in river_polys],
    "center": center,
    "dams": dams,
})

# ---- green space
GREEN_KIND = {"park": 0, "garden": 0, "recreation_ground": 0, "grass": 1, "meadow": 1, "grassland": 1,
              "pitch": 2, "playground": 2, "wood": 3, "forest": 3, "scrub": 3, "cemetery": 4}
green, named_parks = [], {}
for el in osm:
    t = tags(el)
    k = None
    for key in ("leisure", "landuse", "natural"):
        if t.get(key) in GREEN_KIND:
            k = GREEN_KIND[t[key]]
            break
    if k is None:
        continue
    for poly in polygons(el):
        cp = clip_poly(poly, 0.6, (BX0, BZ0, BX1, BZ1))  # parks stop at the paved extent
        if not cp or abs(area(cp[0])) < 30:
            continue
        green.append((k, cp))
        nm = t.get("name", "")
        if nm in ("Rittenhouse Square", "Logan Square", "Logan Circle") and nm not in named_parks:
            named_parks[nm] = centroid(cp[0])
green.sort(key=lambda g: -abs(area(g[1][0])))  # big parks first so small ones draw on top
for nm, (x, z) in named_parks.items():
    label("Logan Square" if nm.startswith("Logan") else nm, x, z, 14)
print(f"  green areas {len(green)}; named {list(named_parks)}")

# ---- streets, paths, rail
WIDTH = {"motorway": 20, "trunk": 16, "primary": 14, "secondary": 12, "tertiary": 10,
         "motorway_link": 8, "trunk_link": 8, "primary_link": 7, "secondary_link": 7, "tertiary_link": 6,
         "residential": 8, "unclassified": 8, "living_street": 6, "service": 4.5, "pedestrian": 5,
         "footway": 2.5, "path": 2.5, "cycleway": 3, "track": 3}
PATHS = {"pedestrian", "footway", "path", "cycleway", "track"}
BRIDGE = {"yes", "viaduct", "movable", "cantilever", "trestle", "aqueduct"}
lines_out = []
road_grid = Grid(60)
for el in osm:
    if el["type"] != "way":
        continue
    t = tags(el)
    hw, rw = t.get("highway"), t.get("railway")
    if hw:
        if hw not in WIDTH or t.get("area") == "yes" or t.get("tunnel") in ("yes", "building_passage", "culvert"):
            continue
        if hw == "footway" and t.get("footway") in ("sidewalk", "crossing"):
            continue
        if hw == "service" and t.get("service") in ("parking_aisle", "drive-through"):
            continue
        kind, w = (1 if hw in PATHS else 0), WIDTH[hw]
        lanes = t.get("lanes", "")
        if kind == 0 and lanes.isdigit() and hw not in ("service",):
            w = max(w, int(lanes) * 3.4)
    elif rw in ("rail", "light_rail", "subway"):
        if t.get("tunnel") or t.get("layer", "0").startswith("-"):
            continue
        kind, w = 2, 3.2
    else:
        continue
    br = 1 if t.get("bridge") in BRIDGE else 0
    try:
        layer = int(t.get("layer", "1" if br else "0"))
    except ValueError:
        layer = 1 if br else 0
    for piece in clip_line(way_pts(el), BX0, BZ0, BX1, BZ1):
        piece = simplify(piece, 0.4)
        rec = {"k": kind, "w": w, "b": br, "l": max(0, layer) if br else 0, "p": flat(piece)}
        if hw in ("motorway", "motorway_link"):
            rec["x"] = 1  # expressway: becomes park in the proposal
        lines_out.append(rec)
        for i in range(len(piece) - 1):
            a, b = piece[i], piece[i + 1]
            seg = (a, b, w, kind, br)
            road_grid.add(seg, min(a[0], b[0]) - w, min(a[1], b[1]) - w, max(a[0], b[0]) + w, max(a[1], b[1]) + w)
print(f"  lines {len(lines_out)} (bridges {sum(l['b'] for l in lines_out)})")

dump("ground.json", {
    "bbox": [dm(BX0), dm(BZ0), dm(BX1), dm(BZ1)],
    "green": [[k] + [flat(r) for r in poly] for k, poly in green],
    "lines": lines_out,
})

# --------------------------------------------------------------------------- proposal
print("Proposal: expressways -> sports parks")
from proposal import plan_sports  # noqa: E402
sports = plan_sports(osm, B, lines_out, water, (BX0, BZ0, BX1, BZ1))
counts = {}
for c in sports["courts"]:
    counts[sports["types"][c[0]]["name"]] = counts.get(sports["types"][c[0]]["name"], 0) + 1
print(f"  {len(sports['courts'])} courts/fields {counts}; {len(sports['routes'])} monorail routes "
      f"{[round(len(r['p']) / 2 * 8) for r in sports['routes']]} m")
dump("sports.json", sports)
from cap import plan_cap  # noqa: E402
yard, on_cap, info = plan_cap(lines_out, B, water, LM, sports, random)
print("  rail yard cap: " + info)
dump("yardpark.json", yard)
court_boxes = []
for ti, cx, cz, r in sports["courts"]:
    t = sports["types"][ti]
    court_boxes.append({"x": cx / 10, "z": cz / 10, "w": t["w"], "d": t["d"], "ry": r / 1000})

# --------------------------------------------------------------------------- trees
print("Trees")
bgrid = Grid(40)
for o in B:
    xs_ = [p[0] for p in o["rings"][0]]
    zs_ = [p[1] for p in o["rings"][0]]
    bgrid.add(o, min(xs_), min(zs_), max(xs_), max(zs_))
wgrid = Grid(80)
for poly in water:
    xs_ = [p[0] for p in poly[0]]
    zs_ = [p[1] for p in poly[0]]
    wgrid.add(poly, min(xs_), min(zs_), max(xs_), max(zs_))
avoid = [(LM["museum"]["x"], LM["museum"]["z"], 160), (LM["cityhall"]["x"], LM["cityhall"]["z"], 90),
         (st_box["x"], st_box["z"], 110), (ex, ez, 105)]
for b in LM["boathouses"]:
    avoid.append((b["x"], b["z"], max(b["w"], b["d"]) * 0.7))
for tw in LM["towers"]:
    avoid.append((tw["x"], tw["z"], max(tw["w"], tw["d"]) * 0.75))


def tree_ok(x, z):
    if not (BX0 < x < BX1 and BZ0 < z < BZ1):
        return False
    for ax, az, r in avoid:
        if (x - ax) ** 2 + (z - az) ** 2 < r * r:
            return False
    for o in bgrid.near(x, z):
        if point_in_poly(x, z, o["rings"]):
            return False
        if seg_near_ring(x, z, o["rings"][0], 3):
            return False
    for a, b, w, kind, br in road_grid.near(x, z):
        if seg_dist((x, z), a, b) < w / 2 + (1.2 if kind == 1 else 2.5):
            return False
    for poly in wgrid.near(x, z):
        if point_in_poly(x, z, poly):
            return False
    if on_cap(x, z):
        return False
    for c in court_boxes:
        if abs(x - c["x"]) < 45 and abs(z - c["z"]) < 45 and in_box((x, z), c, 2):
            return False
    return True


def seg_near_ring(x, z, ring, d):
    for i in range(len(ring)):
        if seg_dist((x, z), ring[i], ring[(i + 1) % len(ring)]) < d:
            return True
    return False


DENS = {0: 1 / 420, 1: 1 / 2500, 2: 0, 3: 1 / 110, 4: 1 / 500}
trees = []
for k, poly in green:
    n = abs(area(poly[0])) * DENS[k]
    n = int(n) + (1 if random.random() < n - int(n) else 0)
    if not n:
        continue
    xs_ = [p[0] for p in poly[0]]
    zs_ = [p[1] for p in poly[0]]
    x0, x1, z0, z1 = min(xs_), max(xs_), min(zs_), max(zs_)
    got, tries = 0, 0
    while got < n and tries < n * 12:
        tries += 1
        x, z = random.uniform(x0, x1), random.uniform(z0, z1)
        if point_in_poly(x, z, poly) and tree_ok(x, z):
            trees += [dm(x), dm(z)]
            got += 1
# street trees along Center City residential streets
for l in lines_out:
    if l["k"] != 0 or l["w"] > 12 or l["b"]:
        continue
    p = l["p"]
    pts_ = [(p[i] / 10, p[i + 1] / 10) for i in range(0, len(p), 2)]
    for i in range(len(pts_) - 1):
        (ax, az), (bx_, bz_) = pts_[i], pts_[i + 1]
        L = math.hypot(bx_ - ax, bz_ - az)
        if L < 1:
            continue
        nx, nz = -(bz_ - az) / L, (bx_ - ax) / L
        s = random.uniform(4, 12)
        while s < L:
            if random.random() < 0.35:
                for side in (-1, 1):
                    o = l["w"] / 2 + 2.2
                    x, z = ax + (bx_ - ax) * s / L + nx * o * side, az + (bz_ - az) * s / L + nz * o * side
                    if tree_ok(x, z):
                        trees += [dm(x), dm(z)]
            s += 9
print(f"  {len(trees) // 2} trees")
dump("trees.json", trees)

dump("buildings.json", {"styles": styles, "b": out_b})
LM["labels"].append({"t": "Schuylkill River", "river": 0.62, "y": 10})
dump("landmarks.json", LM)
