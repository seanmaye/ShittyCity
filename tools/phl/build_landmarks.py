"""Landmarks for the citywide build-out: placements for the hand-styled models.

  python -I tools/phl/build_landmarks.py [raw_dir] [out_dir]

Reads raw_dir/landmarks_osm.json (extract_landmarks.py + extract_bridges.py), the city building
pages (for heights), data/phl/city.json.gz and data/phl/river.json (water, for bridge towers).
Writes data/phl/city_landmarks.json:
  stadiums: [{name, type: football | baseball | arena, outline: ring_dm, field: ring_dm | null,
              h: m, plate: [x, z] m, cf: [dx, dz]}]        (plate/cf for the ballpark)
  halls:    [{name, type: independence | memorial, x, z, w, d, ry, outline: ring_dm}]
  bridges:  [{name, a: [x, z], b: [x, z] m (deck axis ends), width, deckH, towers: [s, s] m from a,
              towerH, anchors: [s, s], color}]
  fields:   [{name, outline: ring_dm, x, z, w, d, ry}]   (the Edgley ultimate and cricket fields, from
            raw_dir/tiles/tile_all.json; the scene puts a frisbee game on them)
  labels:   [{t, x, z, y}]
build_city.py drops the generic buildings inside these outlines; build_metro.py puts PATCO
on the Ben Franklin Bridge deck.
"""
import glob, gzip, json, math, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geom import area, centroid, min_rect, point_in_poly, point_in_ring, proj, simplify_ring  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "raw", "city")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "..", "..", "data", "phl")
sys.stdout.reconfigure(encoding="utf-8")
FT = .3048

src = json.load(open(os.path.join(RAW, "landmarks_osm.json"), encoding="utf-8"))
ring_m = lambda r: [proj(la, lo) for la, lo in r]  # noqa: E731


def ccw(r):
    r = r[:-1] if r[0] == r[-1] else r
    return r if area(r) > 0 else r[::-1]


def flat(r):
    return [v for p in r for v in (round(p[0] * 10), round(p[1] * 10))]


def find(name=None, leisure=None, sport=None, near=None, radius=400):
    out = []
    for a in src["areas"]:
        t = a["tags"]
        if name and a["name"] != name:
            continue
        if leisure and t.get("leisure") != leisure:
            continue
        if sport and sport not in (t.get("sport") or ""):
            continue
        r = ccw(ring_m(a["rings"][0]))
        c = centroid(r)
        if near and math.dist(c, near) > radius:
            continue
        out.append((abs(area(r)), r, a))
    out.sort(key=lambda o: -o[0])
    return out


# heights from the city's LiDAR footprints inside each outline
pages = sorted(glob.glob(os.path.join(RAW, "buildings", "page_*.geojson")))


def lidar_heights(rings):
    best = [0.0] * len(rings)
    boxes = [(min(p[0] for p in r), min(p[1] for p in r), max(p[0] for p in r), max(p[1] for p in r)) for r in rings]
    for pg in pages:
        for f in json.load(open(pg, encoding="utf-8"))["features"]:
            g = f["geometry"]
            if not g:
                continue
            ring = g["coordinates"][0] if g["type"] == "Polygon" else g["coordinates"][0][0]
            pts = [proj(la, lo) for lo, la in ring]
            c = (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))
            for i, (r, b) in enumerate(zip(rings, boxes)):
                if b[0] <= c[0] <= b[2] and b[1] <= c[1] <= b[3] and point_in_ring(c[0], c[1], r):
                    h = (f["properties"].get("approx_hgt") or 0) * FT
                    best[i] = max(best[i], h)
    return best


stadiums, halls, labels = [], [], []

# --- South Philadelphia sports complex
linc = find("Lincoln Financial Field", "stadium")[0][1]
linc_field = find(leisure="pitch", sport="american_football", near=centroid(linc), radius=120)
cbp = find("Citizens Bank Park", "stadium")[0][1]
cbp_field = find(leisure="pitch", sport="baseball", near=centroid(cbp), radius=150)
arena = find("Xfinity Mobile Arena", "stadium")[0][1]

# the ballpark: the OSM pitch includes foul ground, so find the backstop corner P whose two foul-pole
# corners A, B are ~100-115 m away at about a right angle; home plate sits ~14 m in front of P and
# centre field lies along the bisector of PA and PB. The pitch is nearly square, so every corner looks
# like a right angle: the real park's outfield faces north-northeast (the skyline beyond left field),
# so only corners whose bisector points into the northern half (dz < -.5) qualify.
field = cbp_field[0][1] if cbp_field else None
plate, cf = None, None
if field:
    f = simplify_ring(field, 1.0)
    best = None
    for P in f:
        for A in f:
            for B in f:
                if A is B or P is A or P is B:
                    continue
                ax, az, bx, bz = A[0] - P[0], A[1] - P[1], B[0] - P[0], B[1] - P[1]
                la, lb = math.hypot(ax, az), math.hypot(bx, bz)
                if la < 60 or lb < 60:
                    continue
                ang = math.degrees(math.acos(max(-1, min(1, (ax * bx + az * bz) / (la * lb)))))
                ux, uz = ax / la + bx / lb, az / la + bz / lb
                if uz / math.hypot(ux, uz) > -.5:
                    continue
                score = abs(ang - 90) + abs(la - lb) / 4 + abs((la + lb) / 2 - 110) / 4
                if best is None or score < best[0]:
                    best = (score, P, (ax / la + bx / lb, az / la + bz / lb))
    _, P, (dx, dz) = best
    L = math.hypot(dx, dz)
    cf = (dx / L, dz / L)
    plate = (P[0] + cf[0] * 14, P[1] + cf[1] * 14)

hs = lidar_heights([linc, cbp, arena])
print(f"  LiDAR heights: Linc {hs[0]:.0f} m, CBP {hs[1]:.0f} m, arena {hs[2]:.0f} m")
fb = None
if linc_field:
    fx, fz, fw, fd, fry = min_rect(linc_field[0][1])
    if fd > fw:
        fw, fd, fry = fd, fw, fry + math.pi / 2
    fb = {"x": round(fx, 1), "z": round(fz, 1), "w": round(fw, 1), "d": round(fd, 1), "ry": round(fry, 4)}
stadiums.append({"name": "Lincoln Financial Field", "type": "football", "outline": flat(linc),
                 "field": flat(linc_field[0][1]) if linc_field else None, "fieldBox": fb, "h": round(hs[0] or 45, 1)})
stadiums.append({"name": "Citizens Bank Park", "type": "baseball", "outline": flat(cbp), "field": flat(field) if field else None,
                 "h": round(hs[1] or 30, 1), "plate": [round(plate[0], 1), round(plate[1], 1)] if plate else None,
                 "cf": [round(cf[0], 4), round(cf[1], 4)] if cf else None})
stadiums.append({"name": "Xfinity Mobile Arena", "type": "arena", "outline": flat(arena), "field": None, "h": round(hs[2] or 38, 1)})
for s in stadiums:
    r = [(s["outline"][i] / 10, s["outline"][i + 1] / 10) for i in range(0, len(s["outline"]), 2)]
    c = centroid(r)
    labels.append({"t": s["name"], "x": round(c[0], 1), "z": round(c[1], 1), "y": round(s["h"] + 12, 1)})

# --- historic halls
for name, typ in (("Independence Hall", "independence"), ("Memorial Hall", "memorial"), ("Please Touch Museum", "memorial")):
    hit = find(name)
    if not hit or any(h["type"] == typ for h in halls):
        continue
    r = hit[0][1]
    cx, cz, w, d, ry = min_rect(r)
    halls.append({"name": "Memorial Hall" if typ == "memorial" else name, "type": typ, "x": round(cx, 1), "z": round(cz, 1),
                  "w": round(w, 1), "d": round(d, 1), "ry": round(ry, 4), "outline": flat(r)})
    labels.append({"t": "Memorial Hall" if typ == "memorial" else name, "x": round(cx, 1), "z": round(cz, 1), "y": 58 if typ == "independence" else 52})
print(f"  halls: {[h['name'] for h in halls]}")

# --- suspension bridges over the Delaware
water = []
with gzip.open(os.path.join(OUT, "city.json.gz"), "rt", encoding="utf-8") as fh:
    for poly in json.load(fh)["water"]:
        water.append([[(r[i] / 10, r[i + 1] / 10) for i in range(0, len(r), 2)] for r in poly])
for poly in json.load(open(os.path.join(OUT, "river.json"), encoding="utf-8"))["water"]:
    water.append([[(r[i] / 10, r[i + 1] / 10) for i in range(0, len(r), 2)] for r in poly])
wet = lambda x, z: any(point_in_poly(x, z, p) for p in water)  # noqa: E731
SPEC = {"Benjamin Franklin Bridge": dict(width=39, deckH=41, towerH=117, span=533, side=219, color="#3f6c9f"),
        "Walt Whitman Bridge": dict(width=37, deckH=46, towerH=116, span=610, side=233, color="#77837f")}
bridges = []
for b in src.get("bridges", []):
    sp = SPEC.get(b["name"])
    if not sp:
        continue
    pts = [proj(la, lo) for w in b["ways"] for la, lo in w["line"]]
    # the axis: OSM's man_made=bridge outline of the suspension section when there is one (its
    # centre is mid-river, the main span's centre); otherwise the principal axis of the deck ways,
    # which the curving approach ramps pull a little off line
    outl = [o for o in src.get("bridge_outlines", []) if o["name"] == b["name"]]
    if outl:
        ocx, ocz, ow, od, ory = min_rect([proj(la, lo) for la, lo in outl[0]["rings"][0]])
        if od > ow:
            ory += math.pi / 2
        mx, mz, ux, uz = ocx, ocz, math.cos(ory), -math.sin(ory)
    else:
        mx = sum(p[0] for p in pts) / len(pts); mz = sum(p[1] for p in pts) / len(pts)
        sxx = sum((p[0] - mx) ** 2 for p in pts); szz = sum((p[1] - mz) ** 2 for p in pts); sxz = sum((p[0] - mx) * (p[1] - mz) for p in pts)
        ang = .5 * math.atan2(2 * sxz, sxx - szz)
        ux, uz = math.cos(ang), math.sin(ang)
    ts = [(p[0] - mx) * ux + (p[1] - mz) * uz for p in pts]
    t0, t1 = min(ts), max(ts)
    a = (mx + ux * t0, mz + uz * t0); bb = (mx + ux * t1, mz + uz * t1)
    if a[0] > bb[0]:
        a, bb = bb, a          # a: the Philadelphia (west) end
    L = math.dist(a, bb)
    d = ((bb[0] - a[0]) / L, (bb[1] - a[1]) / L)
    # the widest stretch over water: the towers stand either side of its middle
    s_wet = [s for s in range(0, int(L), 10) if wet(a[0] + d[0] * s, a[1] + d[1] * s)]
    if not s_wet:
        print(f"  ! {b['name']}: no water under the deck")
        continue
    runs, cur = [], [s_wet[0]]
    for s in s_wet[1:]:
        if s - cur[-1] > 30:
            runs.append(cur); cur = [s]
        else:
            cur.append(s)
    runs.append(cur)
    r0 = max(runs, key=lambda r: r[-1] - r[0])
    mid = (r0[0] + r0[-1]) / 2          # the real main span, centred on the river crossing
    if outl:
        mid = (mx - a[0]) * d[0] + (mz - a[1]) * d[1]
    sa, sb = mid - sp["span"] / 2, mid + sp["span"] / 2
    bridges.append({"name": b["name"], "a": [round(a[0], 1), round(a[1], 1)], "b": [round(bb[0], 1), round(bb[1], 1)],
                    "width": sp["width"], "deckH": sp["deckH"], "towerH": sp["towerH"], "color": sp["color"],
                    "towers": [round(sa, 1), round(sb, 1)], "anchors": [round(max(30, sa - sp["side"]), 1), round(min(L - 30, sb + sp["side"]), 1)]})
    mid = ((a[0] + bb[0]) / 2, (a[1] + bb[1]) / 2)
    labels.append({"t": b["name"], "x": round(a[0] + d[0] * sa, 1), "z": round(a[1] + d[1] * sa, 1), "y": sp["towerH"] + 10})
    print(f"  {b['name']}: deck {L:.0f} m, main span {sb - sa:.0f} m")

# the Belmont & Edgley cricket ground in West Fairmount Park (OSM: "Edgley Ultimate Fields",
# sport multi;ultimate;cricket, by the Cricket/Archery Field clubhouse on Edgley Avenue)
fields = []
tiles = json.load(open(os.path.join(RAW, "tiles", "tile_all.json"), encoding="utf-8"))
for e in (tiles["elements"] if isinstance(tiles, dict) else tiles):
    t = e.get("tags", {})
    if e.get("type") == "way" and t.get("leisure") == "pitch" and t.get("name") == "Edgley Ultimate Fields":
        r = ccw([proj(g["lat"], g["lon"]) for g in e["geometry"]])
        cx, cz, w, d, ry = min_rect(r)
        fields.append({"name": "Belmont & Edgley Cricket Ground", "outline": flat(r), "x": round(cx, 1), "z": round(cz, 1), "w": round(w, 1), "d": round(d, 1), "ry": round(ry, 4)})
        labels.append({"t": "Belmont & Edgley Cricket Ground", "x": round(cx, 1), "z": round(cz, 1), "y": 24})
        print(f"  Edgley fields: {w:.0f} x {d:.0f} m")

out = {"stadiums": stadiums, "halls": halls, "bridges": bridges, "fields": fields, "labels": labels}
with open(os.path.join(OUT, "city_landmarks.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, separators=(",", ":"))
print(f"  wrote city_landmarks.json: {os.path.getsize(os.path.join(OUT, 'city_landmarks.json')) // 1024} KB")
