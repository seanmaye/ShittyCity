"""Build the data-transit block (L and T1-T5) from OpenStreetMap extracts and write it into the HTML.

usage: python -I build_transit.py transit.json routes.json page.html [--write]

Depths are ESTIMATES: OSM only gives tunnel layers, not metres. Model used:
  layer -2 -> rail 9 m below street, layer -3 -> 13 m, under the Schuylkill -> 17.5 m,
  grades limited to 3.5 % (L) / 5 % (trolleys), ramping to street level at portals.
"""
import json, math, re, sys

sys.stdout.reconfigure(encoding="utf-8")
TRANSIT, ROUTES, PAGE = sys.argv[1:4]
WRITE = "--write" in sys.argv

LAT0, LON0, MX, MZ = 39.9560, -75.1760, 85390, 111000
def xz(g): return ((g["lon"] - LON0) * MX, -(g["lat"] - LAT0) * MZ)

html = open(PAGE, encoding="utf-8").read()
def block(name):
    return re.search(r'(<script type="application/json" id="data-%s">)(.*?)(</script>)' % name, html, re.S)
def load(name): return json.loads(block(name).group(2))

bx0, bz0, bx1, bz1 = [v / 10 for v in load("ground")["bbox"]]
rc = load("river")["center"]
RIVER = [(rc[i] / 10, rc[i + 1] / 10, rc[i + 2] / 10) for i in range(0, len(rc), 3)]

def in_river(x, z, margin):
    best, w = 1e18, 0
    for cx, cz, cw in RIVER:
        d = (x - cx) ** 2 + (z - cz) ** 2
        if d < best: best, w = d, cw
    return math.sqrt(best) < w / 2 + margin

els = json.load(open(TRANSIT, encoding="utf-8"))["elements"]
rels = [e for e in json.load(open(ROUTES, encoding="utf-8"))["elements"] if e["type"] == "relation"]
WAYS = {e["id"]: e for e in els if e["type"] == "way"}

# ---- routes: L both directions; T1..T5 inbound + outbound
ROUTE_IDS = {"L": [951958, 7953595],
             "T1": [1808454, 10702992], "T2": [10703187, 2717636], "T3": [10705524, 1809444],
             "T4": [10705414, 1809435], "T5": [10703675, 2723998]}
KIND = lambda ref: "metro" if ref == "L" else "trolley"
relby = {r["id"]: r for r in rels}

way_kind, way_refs = {}, {}
for ref, ids in ROUTE_IDS.items():
    for rid in ids:
        for m in relby[rid]["members"]:
            if m["type"] == "way" and m["role"] in ("", "forward", "backward") and m["ref"] in WAYS:
                way_kind[m["ref"]] = KIND(ref); way_refs.setdefault(m["ref"], set()).add(ref)

# ---- densified graph. node key: rounded coords for OSM vertices (shared between ways)
STEP = 5.0
node_xy, node_tun, node_layer, node_kind, adj = {}, {}, {}, {}, {}
way_nodes = {}
def key_of(x, z): return (round(x, 2), round(z, 2))
for wid, kind in way_kind.items():
    w = WAYS[wid]; t = w["tags"]
    tun = t.get("tunnel") == "yes"; layer = int(t.get("layer", "0").split(";")[0])
    P = [xz(g) for g in w["geometry"]]
    keys = []
    for i in range(len(P) - 1):
        (ax, az), (bx, bz) = P[i], P[i + 1]
        L = math.hypot(bx - ax, bz - az); n = max(1, math.ceil(L / STEP))
        for k in range(n):
            x, z = ax + (bx - ax) * k / n, az + (bz - az) * k / n
            keys.append(key_of(x, z) if k == 0 else (wid, i, k))
            node_xy[keys[-1]] = (x, z)
    keys.append(key_of(*P[-1])); node_xy[keys[-1]] = P[-1]
    for k in keys:
        node_tun.setdefault(k, set()).add(tun)
        node_kind.setdefault(k, set()).add(kind)
        node_layer[k] = min(node_layer.get(k, 0), layer)
    g = 0.035 if kind == "metro" else 0.05
    for a, b in zip(keys, keys[1:]):
        L = math.dist(node_xy[a], node_xy[b])
        adj.setdefault(a, []).append((b, L, g)); adj.setdefault(b, []).append((a, L, g))
    way_nodes[wid] = keys

SURF = -0.9  # rails at street level sit on the roads (y = +0.9)
BASE = {-1: 9.0, -2: 9.0, -3: 13.0, -4: 17.0}
D, fixed = {}, set()
for k, tset in node_tun.items():
    if False in tset: D[k] = SURF; fixed.add(k); continue   # surface or portal node
    x, z = node_xy[k]
    D[k] = 17.5 if in_river(x, z, 30) else BASE.get(node_layer[k], 9.0)

def relax(op):
    changed = True; it = 0
    while changed and it < 5000:
        changed = False; it += 1
        for a, nbrs in adj.items():
            if a in fixed: continue
            for b, L, g in nbrs:
                v = op(D[a], D[b], L, g)
                if abs(v - D[a]) > 1e-6: D[a] = v; changed = True
    return it
i1 = relax(lambda da, db, L, g: max(da, db - g * L))       # deep spots pull neighbours down
i2 = relax(lambda da, db, L, g: min(da, db + g * L))       # portals pull neighbours up
print("relax passes", i1, i2)

# ---- clip polylines (lists of (x,z,y)) to the map bbox
def inside(p): return bx0 <= p[0] <= bx1 and bz0 <= p[1] <= bz1
def clip(pts):
    out, cur = [], []
    for i, p in enumerate(pts):
        if inside(p):
            if not cur and i > 0: cur.append(edge(pts[i - 1], p))
            cur.append(p)
        elif cur:
            cur.append(edge(cur[-1], p)); out.append(cur); cur = []
    if cur: out.append(cur)
    return [c for c in out if len(c) > 1]
def edge(a, b):  # a inside, b outside (or vice versa): bisect to the boundary
    lo, hi = (a, b) if inside(a) else (b, a)
    for _ in range(30):
        m = tuple((lo[i] + hi[i]) / 2 for i in range(3))
        if inside(m): lo = m
        else: hi = m
    return lo

def pts_of(keys): return [(node_xy[k][0], node_xy[k][1], -D[k]) for k in keys]
dm = lambda v: int(round(v * 10))
def flat(pts): return [dm(c) for p in pts for c in p]

def build_tracks():
    out = []
    for wid, keys in way_nodes.items():
        for piece in clip(pts_of(keys)):
            out.append({"k": way_kind[wid], "p": flat(piece)})
    return out
tracks = build_tracks()

# train runs: chain each relation's ways in order
def chain(rid):
    seq = [m["ref"] for m in relby[rid]["members"] if m["type"] == "way" and m["role"] in ("", "forward", "backward") and m["ref"] in way_nodes]
    out = []
    for i, wid in enumerate(seq):
        ks = list(way_nodes[wid])
        if out:
            if math.dist(node_xy[out[-1]], node_xy[ks[0]]) > math.dist(node_xy[out[-1]], node_xy[ks[-1]]): ks.reverse()
        elif i + 1 < len(seq):
            nx = way_nodes[seq[i + 1]]
            ends = [node_xy[nx[0]], node_xy[nx[-1]]]
            if min(math.dist(node_xy[ks[0]], e) for e in ends) < min(math.dist(node_xy[ks[-1]], e) for e in ends): ks.reverse()
        if out and math.dist(node_xy[out[-1]], node_xy[ks[0]]) < .5: ks = ks[1:]
        out += ks
    return pts_of(out)

def build_runs():
    runs = []
    for ref, ids in ROUTE_IDS.items():
        pieces = [clip(chain(rid)) for rid in ids]
        if ref != "L":
            # inbound ends at the Juniper loop, outbound starts there: join into one run through the loop
            a, b = pieces[0], pieces[1]
            if a and b and math.dist(a[-1][-1][:2], b[0][0][:2]) < 40:
                a[-1] = a[-1] + b[0]; pieces = [a + b[1:]]
        for pl in pieces:
            for piece in pl:
                if len(piece) > 1: runs.append({"line": ref, "p": flat(piece)})
    return runs
runs = build_runs()

# ---- stations and platforms
def nearest_on(pts, x, z):
    best = None
    for i in range(len(pts) - 1):
        (ax, az, ay), (bx, bz, by) = pts[i], pts[i + 1]
        ex, ez = bx - ax, bz - az; L2 = ex * ex + ez * ez
        if L2 < 1e-6: continue
        t = max(0, min(1, ((x - ax) * ex + (z - az) * ez) / L2))
        px, pz = ax + ex * t, az + ez * t; d = math.hypot(x - px, z - pz)
        if best is None or d < best[0]:
            L = math.sqrt(L2); best = (d, px, pz, ay + (by - ay) * t, ex / L, ez / L)
    return best

trk_pts = [(t["k"], [(t["p"][i] / 10, t["p"][i + 1] / 10, t["p"][i + 2] / 10) for i in range(0, len(t["p"]), 3)]) for t in tracks]
platforms = []

def add_platforms(x, z, kind, near=60):
    """Platforms for an underground stop of `kind` near (x, z): island between the two metro tracks
    if they are far enough apart, otherwise side platforms where they don't collide with other track."""
    hits = [h for k, P in trk_pts if k == kind and P[0][2] < -1 for h in [nearest_on(P, x, z)] if h and h[0] < 30 and h[3] < -2]
    if not hits: return False
    if any(p["k"] == kind and math.dist((p["x"], p["z"]), (x, z)) < near for p in platforms): return True
    ref = min(hits)
    _, cx, cz, cy, tx, tz = ref
    nx_, nz_ = -tz, tx
    lat = sorted({round((h[1] - cx) * nx_ + (h[2] - cz) * nz_, 1) for h in hits})
    cl = []
    for v in lat:
        if cl and v - cl[-1][-1] < 1.5: cl[-1].append(v)
        else: cl.append([v])
    cl = [sum(c) / len(c) for c in cl]
    s1, s2 = cl[0], cl[-1]
    others = [round((h[1] - cx) * nx_ + (h[2] - cz) * nz_, 1) for k, P in trk_pts if k != kind
              for h in [nearest_on(P, cx, cz)] if h and h[0] < 30 and h[3] < -2 and abs(h[3] - cy) < 3]
    Lp, top = (110, 1.0) if kind == "metro" else (55, 0.3)
    spans = []
    if kind == "metro" and s2 - s1 >= 7.0: spans.append(((s1 + s2) / 2, s2 - s1 - 3.2))
    else:
        for c, w in ((s1 - 1.6 - 1.75, 3.5), (s2 + 1.6 + 1.75, 3.5)):
            if all(abs(o - c) > w / 2 + 1.4 for o in others + cl): spans.append((c, w))
    for c, w in spans:
        platforms.append({"x": round(cx + nx_ * c, 1), "z": round(cz + nz_ * c, 1), "y": round(cy + top, 2),
                          "ry": round(math.atan2(tx, tz), 4), "l": Lp, "w": round(w, 1), "k": kind})
    return True

# 1) OSM station nodes (their positions are the station centres, better for placing platforms)
for n in els:
    if n["type"] != "node": continue
    t = n["tags"]
    if t.get("railway") not in ("station", "halt") and t.get("public_transport") != "station": continue
    x, z = xz(n)
    if not inside((x, z, 0)): continue
    for kind in ("metro", "trolley"):
        if kind == "metro" and t.get("subway") != "yes": continue
        if kind == "trolley" and "yes" not in (t.get("tram"), t.get("light_rail")) and t.get("station") not in ("tram", "light_rail"): continue
        add_platforms(x, z, kind)

# 2) every stop listed in the route relations: the station list, plus platforms at any
#    underground stop the station nodes missed (37th St, the 13th St trolley stop at Juniper)
NODES = {e["id"]: e for e in els if e["type"] == "node"}
RNODES = {e["id"]: e for e in json.load(open(ROUTES, encoding="utf-8"))["elements"] if e["type"] == "node"}
stops = []   # (name, x, z, kind, ref)
for ref, ids in ROUTE_IDS.items():
    for rid in ids:
        for m in relby[rid]["members"]:
            if m["type"] != "node" or not m["role"].startswith("stop"): continue
            g = NODES.get(m["ref"]) or RNODES.get(m["ref"])
            if not g: continue
            x, z = xz(g)
            if not inside((x, z, 0)): continue
            name = g.get("tags", {}).get("name", "").replace("Street", "St").replace("Avenue", "Ave")
            stops.append((name, x, z, KIND(ref), ref))
stations = []
for name, x, z, kind, ref in stops:
    s = next((s for s in stations if s["t"] == name and math.dist((s["_x"] / s["_n"], s["_z"] / s["_n"]), (x, z)) < 200), None)
    if not s: s = {"t": name, "_x": 0, "_z": 0, "_n": 0, "k": [], "T": set(), "u": set()}; stations.append(s)
    s["_x"] += x; s["_z"] += z; s["_n"] += 1
    if kind not in s["k"]: s["k"].append(kind)
    if ref != "L": s["T"].add(ref)
    hits = [h for k, P in trk_pts if k == kind for h in [nearest_on(P, x, z)] if h and h[0] < 30]
    if hits and min(hits)[3] < -2:
        s["u"].add(kind)
        add_platforms(x, z, kind, 130 if kind == "metro" else 80)   # stop markers sit at a platform's end
for s in stations:
    s["x"] = round(s.pop("_x") / s["_n"], 1); s["z"] = round(s.pop("_z") / s.pop("_n"), 1)
    s["k"].sort(); s["T"] = sorted(s["T"]); s["u"] = sorted(s["u"])
    if not s["T"]: del s["T"]
stations = [{k: s[k] for k in ("t", "x", "z", "k", "T", "u") if k in s} for s in stations]

# subway entrances (OSM) near an underground station, coloured by that station's lines
entrances = []
for n in els:
    if n["type"] != "node" or n.get("tags", {}).get("railway") != "subway_entrance": continue
    x, z = xz(n)
    if not inside((x, z, 0)): continue
    near = [s for s in stations if s["u"] and math.dist((s["x"], s["z"]), (x, z)) < 160]
    if not near: continue
    s = min(near, key=lambda s: math.dist((s["x"], s["z"]), (x, z)))
    entrances.append({"x": round(x, 1), "z": round(z, 1), "k": "metro" if "metro" in s["u"] else "trolley"})

# stations are level: flatten the track under each platform to the depth at its centre, re-grade, rebuild
for pl in platforms:
    ks = [k for k, tset in node_tun.items() if False not in tset and pl["k"] in node_kind[k]
          and math.dist(node_xy[k], (pl["x"], pl["z"])) < pl["l"] / 2 + 15]
    c = min(ks, key=lambda k: math.dist(node_xy[k], (pl["x"], pl["z"])))
    pl["_c"] = c
    for k in ks: D[k] = D[c]; fixed.add(k)
relax(lambda da, db, L, g: max(da, db - g * L)); relax(lambda da, db, L, g: min(da, db + g * L))
for pl in platforms: pl["y"] = round(-D[pl.pop("_c")] + (1.0 if pl["k"] == "metro" else 0.3), 2)
tracks = build_tracks(); runs = build_runs()
trk_pts = [(t["k"], [(t["p"][i] / 10, t["p"][i + 1] / 10, t["p"][i + 2] / 10) for i in range(0, len(t["p"]), 3)]) for t in tracks]

# ---- section plane along Market St (fitted to the L's straight Center City run)
P = [(x, z) for k, pts in trk_pts if k == "metro" for (x, z, y) in pts if -1300 < x < 800 and y < -2]
mx_, mz_ = sum(p[0] for p in P) / len(P), sum(p[1] for p in P) / len(P)
kk = sum((p[0] - mx_) * (p[1] - mz_) for p in P) / sum((p[0] - mx_) ** 2 for p in P)
d = (1 / math.hypot(1, kk), kk / math.hypot(1, kk)); nrm = (d[1], -d[0])   # nrm points north
off = lambda x, z: (x - mx_) * nrm[0] + (z - mz_) * nrm[1]
par = lambda tx, tz: abs(tx * d[0] + tz * d[1]) > .985
near = []
for k, pts in trk_pts:
    for a, b in zip(pts, pts[1:]):
        L = math.dist(a[:2], b[:2])
        if L > 0 and a[2] < -2 and par((b[0] - a[0]) / L, (b[1] - a[1]) / L) and abs(off(a[0], a[1])) < 25: near.append(off(a[0], a[1]))
south = min(min(near) - 2.4, min(off(p["x"], p["z"]) - p["w"] / 2 for p in platforms if abs(off(p["x"], p["z"])) < 25)) - 1.0
far = [off(x, z) for k, pts in trk_pts for (x, z, y) in pts if y < -2 and 0 <= off(x, z) - south < 40]
band = round(max(far) - south + 2.4 + .5, 1)
sx, sz = mx_ + nrm[0] * south, mz_ + nrm[1] * south
section = {"id": "market", "name": "Market St", "p": [round(sx, 1), round(sz, 1)], "d": [round(d[0], 5), round(d[1], 5)], "band": band, "depth": 40}
print("section", section)

LINES = [{"id": "L", "name": "L · Market–Frankford Line", "kind": "metro", "color": "#2d6fc0"}] + \
        [{"id": f"T{i}", "name": f"T{i} trolley", "kind": "trolley", "color": "#4f9a32"} for i in range(1, 6)]
out = {"note": "Track positions from OpenStreetMap (ODbL). Depths are estimates.",
       "lines": LINES, "tracks": tracks, "runs": runs, "platforms": platforms,
       "stations": stations, "entrances": entrances, "sections": [section]}

print("tracks", len(tracks), "runs", [(r["line"], len(r["p"]) // 3) for r in runs])
print("platforms", len(platforms)); [print("  ", p) for p in platforms]
print("stations", len(stations)); [print("  ", s) for s in stations]
print("entrances", len(entrances))
ys = [t["p"][i + 2] / 10 for t in tracks for i in range(0, len(t["p"]), 3)]
print("depth range", min(ys), max(ys))
body = json.dumps(out, separators=(",", ":"), ensure_ascii=False).replace("</", "<\\/")
print("block size", len(body))

if WRITE:
    tag = '<script type="application/json" id="data-transit">'
    m = block("transit")
    if m: html = html[:m.start(2)] + body + html[m.end(2):]
    else:
        anchor = html.index('<script type="module">', html.index('id="data-yardpark"'))
        html = html[:anchor] + tag + body + "</script>\n" + html[anchor:]
    open(PAGE, "w", encoding="utf-8", newline="").write(html)
    print("written")
