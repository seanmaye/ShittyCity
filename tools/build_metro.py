"""Build the citywide rail transit network: every SEPTA Metro line (L, B1-B3, G1, T1-T5), all 13
Regional Rail lines, PATCO and NJ Transit's Atlantic City Line, inside the city limits.

  python -I tools/build_metro.py [raw_dir] [out_dir]

raw_dir defaults to tools/raw/city (extract_osm.py output), out_dir to data/.
Writes data/metro.json.gz, which js/scene/index.js merges into data/transit.json:
  lines      [{id, name, kind, color, group}]
  tracks     [{k, p: flat [x, z, y] dm}]       new physical track (the L and trolleys only outside the
                                              original extent, which keeps its own; surface Regional
                                              Rail is already drawn by the street layer)
  runs       [{line, p}]                      the loop every line's trains follow (out and back)
  replaceRuns  ids whose original Center City runs these full-length runs replace
  platforms, stations, entrances              same formats as transit.json
  columns    flat [x, z, h] dm                El and viaduct columns

Depth model (as in transit.json): tunnel layer -1 -> 7 m below the street, -2 -> 9 m, -3 -> 13 m,
-4 -> 17 m; Els and PATCO viaducts 9.5 m up; Regional Rail, trolleys and NJ Transit on bridges
follow the bridge decks the street layer draws. Grades are limited per kind; inside the original
extent the L and trolley runs are the original ones, untouched, and the new track is blended
into them at the edge.
"""
import gzip, json, math, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geom import Grid, point_in_poly, proj  # noqa: E402
from citylimits import Limits  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
sys.stdout.reconfigure(encoding="utf-8")
RAW = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "raw", "city")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "..", "data")


def jload(p):
    if p.endswith(".gz"):
        with gzip.open(p, "rt", encoding="utf-8") as f:
            return json.load(f)
    with open(p, encoding="utf-8") as f:
        return json.load(f)


# kind: grade limit, platform top above the rail, platform length, the colour of its fleet
KINDS = {
    "metro": dict(g=.035, top=1.0, plat=110), "broad": dict(g=.035, top=1.05, plat=135),
    "patco": dict(g=.035, top=1.05, plat=130), "regional": dict(g=.02, top=1.15, plat=190),
    "trolley": dict(g=.05, top=.3, plat=0), "pcc": dict(g=.05, top=.3, plat=0),
}
RR = "#5c6c96"
LINES = [  # id, kind, colour, group, name, OSM route relation name(s) (a single relation = both ways)
    ("L", "metro", "#2d6fc0", "SEPTA Metro", "L · Market–Frankford Line", ["SEPTA Market-Frankford Line: 69th Street → Frankford", "SEPTA Market-Frankford Line: Frankford → 69th Street"]),
    ("B1", "broad", "#f2862b", "SEPTA Metro", "B1 · Broad Street Line local", ["SEPTA Broad Street Line Local: Fern Rock → NRG", "SEPTA Broad Street Line Local: NRG → Fern Rock"]),
    ("B2", "broad", "#f2862b", "SEPTA Metro", "B2 · Broad Street Line express", ["SEPTA Broad Street Line Express: Fern Rock → Walnut-Locust", "SEPTA Broad Street Line Express: Walnut-Locust → Fern Rock"]),
    ("B3", "broad", "#f2862b", "SEPTA Metro", "B3 · Broad-Ridge Spur", ["SEPTA Broad-Ridge Spur: 8th & Market → Fern Rock", "SEPTA Broad-Ridge Spur: Fern Rock → 8th & Market"]),
    ("G1", "pcc", "#e9a920", "SEPTA Metro", "G1 · Girard Avenue trolley", ["SEPTA 15: Frankford & Delaware → Girard & 63rd", "SEPTA 15: Girard & 63rd → Frankford & Delaware"]),
    ("T1", "trolley", "#4f9a32", "SEPTA Metro", "T1 trolley", ["SEPTA T1: Center City → Malvern Loop", "SEPTA T1: Malvern Loop → Center City"]),
    ("T2", "trolley", "#4f9a32", "SEPTA Metro", "T2 trolley", ["SEPTA T2: Center City → Angora Loop", "SEPTA T2: Angora Loop → Center City"]),
    ("T3", "trolley", "#4f9a32", "SEPTA Metro", "T3 trolley", ["SEPTA T3: Center City → Yeadon Loop", "SEPTA T3: Yeadon Loop → Center City"]),
    ("T4", "trolley", "#4f9a32", "SEPTA Metro", "T4 trolley", ["SEPTA T4: Center City → Darby", "SEPTA T4: Darby → Center City"]),
    ("T5", "trolley", "#4f9a32", "SEPTA Metro", "T5 trolley", ["SEPTA T5: Center City → Eastwick Loop", "SEPTA T5: Eastwick Loop → Center City"]),
    ("AIR", "regional", RR, "Regional Rail", "Airport Line", ["SEPTA Airport Line: Jefferson → PHL Airport", "SEPTA Airport Line: PHL Airport → Jefferson"]),
    ("CHE", "regional", RR, "Regional Rail", "Chestnut Hill East Line", ["SEPTA Chestnut Hill East Line: Center City <→ Chestnut Hill East"]),
    ("CHW", "regional", RR, "Regional Rail", "Chestnut Hill West Line", ["SEPTA Chestnut Hill West Line: Center City <→ Chestnut Hill West"]),
    ("CYN", "regional", RR, "Regional Rail", "Cynwyd Line", ["SEPTA Cynwyd Line: Center City <→ Cynwyd"]),
    ("FOX", "regional", RR, "Regional Rail", "Fox Chase Line", ["SEPTA Fox Chase Line: Center City → Fox Chase", "SEPTA Fox Chase Line: Fox Chase → Center City"]),
    ("LAN", "regional", RR, "Regional Rail", "Lansdale/Doylestown Line", ["SEPTA Lansdale/Doylestown Line: Center City → Doylestown", "SEPTA Lansdale/Doylestown Line: Doylestown → Center City"]),
    ("MED", "regional", RR, "Regional Rail", "Media/Wawa Line", ["SEPTA Media/Wawa Line: Center City → Wawa", "SEPTA Media/Wawa Line: Wawa → Center City"]),
    ("NOR", "regional", RR, "Regional Rail", "Manayunk/Norristown Line", ["SEPTA Manayunk/Norristown Line: Center City → Norristown", "SEPTA Manayunk/Norristown Line: Norristown → Center City"]),
    ("PAO", "regional", RR, "Regional Rail", "Paoli/Thorndale Line", ["SEPTA Paoli/Thorndale Line: Center City → Thorndale", "SEPTA Paoli/Thorndale Line: Thorndale → Center City"]),
    ("TRE", "regional", RR, "Regional Rail", "Trenton Line", ["SEPTA Trenton Line: Center City <→ Trenton"]),
    ("WAR", "regional", RR, "Regional Rail", "Warminster Line", ["SEPTA Warminster Line: Center City → Warminster", "SEPTA Warminster Line: Warminster → Center City"]),
    ("WIL", "regional", RR, "Regional Rail", "Wilmington/Newark Line", ["SEPTA Wilmington/Newark Line: Center City → Newark", "SEPTA Wilmington/Newark Line: Newark → Center City"]),
    ("WTR", "regional", RR, "Regional Rail", "West Trenton Line", ["SEPTA West Trenton Line: Center City → West Trenton", "SEPTA West Trenton Line: West Trenton → Center City"]),
    ("PATCO", "patco", "#cf3a3d", "PATCO", "PATCO Speedline", ["PATCO Speedline: 15th-16th & Locust => Lindenwold", "PATCO Speedline: Lindenwold => 15th-16th & Locust"]),
    ("ACL", "regional", "#8e5aa8", "NJ Transit", "Atlantic City Line", ["NJ Transit Atlantic City Line: Philadelphia => Atlantic City", "NJ Transit Atlantic City Line: Atlantic City => Philadelphia"]),
]
REPLACE = ["L", "T1", "T2", "T3", "T4", "T5"]   # their Center City runs exist; extend them
OWN_CORE_TRACK = set(REPLACE)                   # their Center City track exists too


def dm(v):
    return int(round(v * 10))


els = jload(os.path.join(RAW, "transit.json"))["elements"]
WAYS = {e["id"]: e for e in els if e["type"] == "way"}
NODES = {e["id"]: e for e in els if e["type"] == "node"}
RELS = {e["tags"].get("name"): e for e in els if e["type"] == "relation" and e["tags"].get("type") == "route"}
LIM = Limits(RAW)
core = jload(os.path.join(OUT, "ground.json"))["bbox"]
CX0, CZ0, CX1, CZ1 = (v / 10 for v in core)
old = jload(os.path.join(OUT, "transit.json"))


def in_core(x, z, pad=0.0):
    return CX0 - pad <= x <= CX1 + pad and CZ0 - pad <= z <= CZ1 + pad


# --------------------------------------------------------------------------- paths
class Path(list):
    """A stitched path; gaps = joins where the next member way doesn't share a node."""
    gaps = 0


def path_of(rel):
    """Member track ways stitched in order -> list of points (x, z, way_id, way_s, way_len)."""
    ways = [WAYS[m["ref"]] for m in rel["members"] if m["type"] == "way" and m["role"] in ("", "forward", "backward") and m["ref"] in WAYS
            and WAYS[m["ref"]]["tags"].get("railway") not in ("platform",) and WAYS[m["ref"]]["tags"].get("public_transport") != "platform"]
    out = Path()
    for k, w in enumerate(ways):
        g = [(p["lat"], p["lon"]) for p in w["geometry"]]
        if out:
            end = out[-1][5]
            if end not in (g[0], g[-1]):
                out.gaps += 1
            if g[-1] == end and g[0] != end:
                g = g[::-1]
            elif g[0] != end and g[-1] != end:
                d0 = math.dist(proj(*g[0]), (out[-1][0], out[-1][1])); d1 = math.dist(proj(*g[-1]), (out[-1][0], out[-1][1]))
                if d1 < d0:
                    g = g[::-1]
        elif len(ways) > 1:
            n0 = [(p["lat"], p["lon"]) for p in ways[1]["geometry"]]
            if g[0] in (n0[0], n0[-1]):
                g = g[::-1]
        pts = [proj(*p) for p in g]
        L = sum(math.dist(a, b) for a, b in zip(pts, pts[1:]))
        s = 0.0
        for i, (p, ll) in enumerate(zip(pts, g)):
            if i:
                s += math.dist(pts[i - 1], p)
            if out and i == 0 and ll == out[-1][5]:
                continue   # shared node
            out.append((p[0], p[1], w["id"], s, L, ll))
    return out


def graph_path(rel):
    """For relations whose ways are unordered or cover both tracks: the longest shortest path
    through the network of member ways, same point format as path_of()."""
    import heapq
    ways = [WAYS[m["ref"]] for m in rel["members"] if m["type"] == "way" and m["role"] in ("", "forward", "backward") and m["ref"] in WAYS
            and WAYS[m["ref"]]["tags"].get("railway") != "platform" and WAYS[m["ref"]]["tags"].get("public_transport") != "platform"]
    adj = {}
    for w in ways:
        g = [(p["lat"], p["lon"]) for p in w["geometry"]]
        P = [proj(*ll) for ll in g]
        for i in range(len(g) - 1):
            d = math.dist(P[i], P[i + 1])
            adj.setdefault(g[i], []).append((g[i + 1], d, w["id"]))
            adj.setdefault(g[i + 1], []).append((g[i], d, w["id"]))

    # bridge small gaps where consecutive ways don't share a node (or a short piece is missing)
    ends = []
    for w in ways:
        g = w["geometry"]
        for q in (g[0], g[-1]):
            ends.append(((q["lat"], q["lon"]), proj(q["lat"], q["lon"]), w["id"]))
    eg = Grid(100)
    for e in ends:
        eg.add(e, e[1][0] - 80, e[1][1] - 80, e[1][0] + 80, e[1][1] + 80)
    for a in ends:
        for b in eg.near(*a[1]):
            if b[2] != a[2] and b[0] != a[0]:
                d = math.dist(a[1], b[1])
                if d < 80:
                    adj.setdefault(a[0], []).append((b[0], d, a[2]))

    def far(src):
        dist, prev, pq = {src: 0.0}, {}, [(0.0, src)]
        while pq:
            d, u = heapq.heappop(pq)
            if d > dist[u]:
                continue
            for v, w_, wid in adj[u]:
                if d + w_ < dist.get(v, math.inf):
                    dist[v], prev[v] = d + w_, (u, wid)
                    heapq.heappush(pq, (d + w_, v))
        end = max(dist, key=dist.get)
        return end, dist, prev
    # the member ways can fall into several unconnected pieces: take the longest route over all of them
    best, done = None, set()
    for w in ways:
        start0 = (w["geometry"][0]["lat"], w["geometry"][0]["lon"])
        if start0 in done:
            continue
        a_, d0, _ = far(start0)
        done |= set(d0)
        b_, dist_, prev_ = far(a_)
        if best is None or dist_[b_] > best[1][best[0]]:
            best = (b_, dist_, prev_, a_)
    b, dist, prev, a = best
    seq, u = [(b, None)], b
    while u != a:
        u, wid = prev[u]
        seq.append((u, wid))
    seq.reverse()
    # seq[i] = (node, way used to reach the next node)
    out, s_in_way = [], {}
    for i, (ll, _) in enumerate(seq):
        wid = seq[i][1] if seq[i][1] is not None else seq[i - 1][1]
        x, z = proj(*ll)
        w = WAYS[wid]
        L = sum(math.dist(proj(w["geometry"][k]["lat"], w["geometry"][k]["lon"]), proj(w["geometry"][k + 1]["lat"], w["geometry"][k + 1]["lon"])) for k in range(len(w["geometry"]) - 1))
        if out and out[-1][2] == wid:
            s_in_way[wid] += math.dist(out[-1][:2], (x, z))
        else:
            s_in_way[wid] = 0.0
        out.append((x, z, wid, min(s_in_way[wid], L), L, ll))
    total = dist[b]
    return out, total


def jumps(path):
    return getattr(path, "gaps", 0)


# the Delaware bridges are modelled by citymarks.js (data/city_landmarks.json): track on their decks
# follows the same deck profile, deckY(s) = min(deckH, 1 + .045 * min(s, L - s)), s along the axis
DECKS = []
if os.path.exists(os.path.join(OUT, "city_landmarks.json")):
    for _b in jload(os.path.join(OUT, "city_landmarks.json"))["bridges"]:
        (_ax, _az), (_bx, _bz) = _b["a"], _b["b"]
        _L = math.dist((_ax, _az), (_bx, _bz))
        DECKS.append((_ax, _az, (_bx - _ax) / _L, (_bz - _az) / _L, _L, _b["width"], _b["deckH"]))


def on_deck(x, z):
    """deck height (m) if (x, z) is on a modelled bridge deck, else None"""
    for ax, az, dx, dz, L, W, H in DECKS:
        s = (x - ax) * dx + (z - az) * dz
        if 0 <= s <= L and abs((x - ax) * -dz + (z - az) * dx) <= W / 2 + 4:
            return min(H, 1 + .045 * min(s, L - s))
    return None


def heights(path, kind):
    """y (m) for each path point from its way's tags, with grade-limited ramps."""
    g = KINDS[kind]["g"]
    n = len(path)
    cat, tgt = [], []
    for i, (x, z, wid, s, L, _) in enumerate(path):
        t = WAYS[wid]["tags"]
        try:
            layer = int(t.get("layer", "0"))
        except ValueError:
            layer = 0
        if t.get("tunnel") in ("yes", "building_passage") or layer < 0:
            cat.append("T"); tgt.append({-1: -7.0, -2: -9.0, -3: -13.0, -4: -17.0}.get(max(-4, min(-1, layer or -2)), -9.0))
        elif t.get("bridge") not in (None, "no") and on_deck(x, z) is not None:
            cat.append("D"); tgt.append(on_deck(x, z) + .35)
        elif t.get("bridge") not in (None, "no"):
            if kind in ("regional", "trolley", "pcc"):
                top = min(17, 9 + 4 * max(0, (layer or 1) - 1))
                cat.append("R"); tgt.append(min(top, .8 + .15 * min(s, L - s)) + .05)
            else:
                cat.append("E"); tgt.append(9.5 if (layer or 1) <= 2 else 13.5)
        else:
            cat.append("G"); tgt.append(.9)
    S = [0.0]
    for i in range(1, n):
        S.append(S[-1] + math.dist(path[i - 1][:2], path[i][:2]))

    def dist_to_not(c):
        d = [math.inf] * n
        last = -math.inf
        for i in range(n):
            if cat[i] != c:
                last = S[i]
            d[i] = S[i] - last
        last = math.inf
        for i in range(n - 1, -1, -1):
            if cat[i] != c:
                last = S[i]
            d[i] = min(d[i], last - S[i])
        return d
    dT, dE = dist_to_not("T"), dist_to_not("E")
    y = []
    for i in range(n):
        if cat[i] == "T":
            y.append(max(tgt[i], -g * dT[i]) if math.isfinite(dT[i]) else tgt[i])
        elif cat[i] == "E":
            y.append(min(tgt[i], .9 + g * dE[i]) if math.isfinite(dE[i]) else tgt[i])
        else:
            y.append(tgt[i])
    return y, S


def longest_inside(pts, excursion=4000.0):
    """The longest stretch inside the city limits; short trips outside (a line that clips a
    neighbouring township and comes back, like the Fox Chase Line) count as inside."""
    inside = [LIM.inside(p[0], p[1]) for p in pts]
    i = 0
    while i < len(pts):
        if inside[i]:
            i += 1
            continue
        j = i
        while j < len(pts) and not inside[j]:
            j += 1
        if 0 < i and j < len(pts) and sum(math.dist(pts[k][:2], pts[k + 1][:2]) for k in range(i - 1, j)) < excursion:
            for k in range(i, j):
                inside[k] = True
        i = j
    best, cur = [], []
    for p, ok in zip(pts, inside):
        if ok:
            cur.append(p)
        else:
            if len(cur) > len(best):
                best = cur
            cur = []
    return cur if len(cur) > len(best) else best


def resample(pts, step=5.0):
    out = [pts[0]]
    for a, b in zip(pts, pts[1:]):
        L = math.dist(a[:2], b[:2])
        n = max(1, int(math.ceil(L / step)))
        for k in range(1, n + 1):
            t = k / n
            out.append(tuple(a[j] + (b[j] - a[j]) * t for j in range(3)))
    return out


def flat3(pts):
    o = []
    for x, z, y in pts:
        o += [dm(x), dm(z), dm(y)]
    return o


old_runs = {}
for r in old["runs"]:
    f = r["p"]
    old_runs.setdefault(r["line"], []).append([(f[i] / 10, f[i + 1] / 10, f[i + 2] / 10) for i in range(0, len(f), 3)])
old_pts = {k: [p for run in v for p in run] for k, v in old_runs.items()}

ymap = {}          # OSM node (lat, lon) -> y, for building the physical track
lines_out, runs_out, dir_paths = [], [], {}
for lid, kind, col, group, name, rels in LINES:
    paths = []
    for rn in rels:
        rel = RELS.get(rn)
        if not rel:
            print(f"  ! {lid}: relation not found: {rn}")
            continue
        p = path_of(rel)
        if jumps(p) or len(rels) == 1:
            # unordered or two-track relation: route through the way network instead
            gp, _ = graph_path(rel)
            if len(rels) == 1 or jumps(gp) < jumps(p):
                # keep the listed direction: start at the end nearer the first listed way
                if p and math.dist(gp[-1][:2], p[0][:2]) < math.dist(gp[0][:2], p[0][:2]):
                    gp = gp[::-1]
                print(f"    {lid}: {rn[:50]} -> routed through the track network ({jumps(p)} gaps in member order)")
                p = gp
        y, _ = heights(p, kind)
        pts = [(a[0], a[1], yy, a[5]) for a, yy in zip(p, y)]
        if lid in REPLACE:
            # blend into the original Center City run where the new track meets the original extent
            ref = old_pts.get(lid, [])
            inside = [in_core(q[0], q[1]) for q in pts]
            for i in range(1, len(pts)):
                if inside[i] != inside[i - 1]:
                    j = i if inside[i] else i - 1          # first point inside
                    o = min(ref, key=lambda r: (r[0] - pts[j][0]) ** 2 + (r[1] - pts[j][1]) ** 2) if ref else None
                    if not o or math.dist(o[:2], pts[j][:2]) > 40:
                        continue
                    dy = o[2] - pts[j][2]
                    for k in range(len(pts)):
                        if inside[k]:
                            continue
                        d = math.dist(pts[k][:2], pts[j][:2])
                        if d < 150:
                            x, z, yy, ll = pts[k]
                            pts[k] = (x, z, yy + dy * (1 - d / 150), ll)
        for q in pts:
            ymap.setdefault(q[3], q[2])
        paths.append(pts)
    if not paths:
        continue
    if len(paths) == 1:
        paths = [paths[0], paths[0][::-1]]
    dir_paths[lid] = paths
    loop = []
    for pth in paths:
        part = longest_inside([(q[0], q[1], q[2]) for q in pth])
        if len(part) > 1:
            loop += resample(part)
    if len(loop) < 2:
        print(f"  ! {lid}: nothing inside the city")
        continue
    if lid in REPLACE:
        # put the original Center City runs back exactly, in place of the new run's core stretches.
        # The run is a loop: start it outside the core so each core stretch is one piece.
        k0 = next((i for i, q in enumerate(loop) if not in_core(q[0], q[1])), 0)
        loop = loop[k0:] + loop[:k0]
        segs, i = [], 0
        while i < len(loop):
            if in_core(loop[i][0], loop[i][1]):
                j = i
                while j + 1 < len(loop) and in_core(loop[j + 1][0], loop[j + 1][1]):
                    j += 1
                segs.append((i, j))
                i = j + 1
            else:
                i += 1
        out, last = [], 0
        for a, b in segs:
            best = None
            for run in old_runs.get(lid, []):
                for rr in (run, run[::-1]):
                    d = math.dist(rr[0][:2], loop[a][:2]) + math.dist(rr[-1][:2], loop[b][:2])
                    if best is None or d < best[0]:
                        best = (d, rr)
            out += loop[last:a]
            if best and best[0] < 120:
                out += best[1]
            else:
                print(f"  ! {lid}: no matching original run for a core stretch ({best and best[0]:.0f} m); using new track")
                out += loop[a:b + 1]
            last = b + 1
        loop = out + loop[last:]
    runs_out.append({"line": lid, "p": flat3(loop)})
    lines_out.append({"id": lid, "name": name, "kind": kind, "color": col, "group": group})
    print(f"  {lid:5s} {kind:8s} run {sum(math.dist(a[:2], b[:2]) for a, b in zip(loop, loop[1:])) / 1000:5.1f} km")

# --------------------------------------------------------------------------- physical track
tracks, seen = [], set()
for lid, kind, col, group, name, rels in LINES:
    for rn in rels:
        rel = RELS.get(rn)
        if not rel:
            continue
        for m in rel["members"]:
            if m["type"] != "way" or m["ref"] in seen or m["ref"] not in WAYS or m["role"] not in ("", "forward", "backward"):
                continue
            w = WAYS[m["ref"]]
            if w["tags"].get("railway") == "platform" or w["tags"].get("public_transport") == "platform":
                continue
            seen.add(m["ref"])
            g = [(p["lat"], p["lon"]) for p in w["geometry"]]
            pts = [(*proj(*ll), ymap.get(ll, .9)) for ll in g]
            # keep the parts inside the city, outside the original extent for the L and trolleys,
            # and only underground for Regional Rail (its surface track is in the street layer)
            keep = lambda q: LIM.inside(q[0], q[1]) and not (lid in OWN_CORE_TRACK and in_core(q[0], q[1])) and not (kind == "regional" and q[2] > -1)  # noqa: E731
            cur = []
            for q in resample(pts):
                if keep(q):
                    cur.append(q)
                else:
                    if len(cur) > 1:
                        tracks.append({"k": kind, "p": flat3(cur)})
                    cur = []
            if len(cur) > 1:
                tracks.append({"k": kind, "p": flat3(cur)})
print(f"  {len(tracks)} track pieces")

# --------------------------------------------------------------------------- columns under Els and viaducts
water = [[[(r[i] / 10, r[i + 1] / 10) for i in range(0, len(r), 2)] for r in poly] for poly in jload(os.path.join(OUT, "city.json.gz"))["water"]]
water += [[[(r[i] / 10, r[i + 1] / 10) for i in range(0, len(r), 2)] for r in poly] for poly in jload(os.path.join(OUT, "river.json"))["water"]]
wg = Grid(300)
for poly in water:
    xs = [p[0] for p in poly[0]]; zs = [p[1] for p in poly[0]]
    wg.add(poly, min(xs), min(zs), max(xs), max(zs))
wet = lambda x, z: any(point_in_poly(x, z, p) for p in wg.near(x, z))  # noqa: E731
columns = []
for t in tracks:
    if t["k"] not in ("metro", "broad", "patco"):
        continue
    f = t["p"]; pts = [(f[i] / 10, f[i + 1] / 10, f[i + 2] / 10) for i in range(0, len(f), 3)]
    s, nxt = 0.0, 9.0
    for a, b in zip(pts, pts[1:]):
        s += math.dist(a[:2], b[:2])
        if s >= nxt:
            nxt += 18
            if b[2] > 3 and not wet(b[0], b[1]) and on_deck(b[0], b[1]) is None:
                columns += [dm(b[0]), dm(b[1]), dm(b[2] - .7)]
print(f"  {len(columns) // 3} columns")

# --------------------------------------------------------------------------- stations, platforms, entrances
def nearest_on(path, x, z):
    best = None
    for i in range(len(path) - 1):
        (ax, az, ay, _), (bx, bz, by, _) = path[i], path[i + 1]
        ex, ez = bx - ax, bz - az
        L2 = ex * ex + ez * ez
        if L2 < 1e-9:
            continue
        u = max(0.0, min(1.0, ((x - ax) * ex + (z - az) * ez) / L2))
        px, pz = ax + ex * u, az + ez * u
        d = math.hypot(x - px, z - pz)
        if best is None or d < best[0]:
            L = math.sqrt(L2)
            best = (d, px, pz, ay + (by - ay) * u, ex / L, ez / L)
    return best


station_nodes = [n for n in NODES.values() if n["tags"].get("railway") in ("station", "halt") and n["tags"].get("name")]
stations = {}     # (name) -> record
old_plats = [(p["x"], p["z"], p["y"]) for p in old["platforms"]]
old_names = {s["t"] for s in old["stations"]}
platforms = []


def add_platform(x, z, y, ry, kind):
    for (px, pz, py) in old_plats + [(p["x"], p["z"], p["y"]) for p in platforms]:
        if math.hypot(px - x, pz - z) < 25 and abs(py - y) < 2:
            return
    platforms.append({"x": round(x, 1), "z": round(z, 1), "y": round(y, 2), "ry": round(ry, 4), "l": KINDS[kind]["plat"], "w": 3.5, "k": kind})


for lid, kind, col, group, name, rels in LINES:
    if lid not in dir_paths:
        continue
    stops = []
    for rn in rels:
        rel = RELS.get(rn)
        if rel:
            stops += [NODES[m["ref"]] for m in rel["members"] if m["type"] == "node" and m["role"].startswith("stop") and m["ref"] in NODES]
    if not stops:   # some Regional Rail relations list no stops: use the stations along the track
        paths = dir_paths[lid]
        for n in station_nodes:
            x, z = proj(n["lat"], n["lon"])
            hit = nearest_on(paths[0], x, z)
            if hit and hit[0] < 60:
                stops.append(n)
    for n in stops:
        nm = n["tags"].get("name")
        if not nm:
            continue
        x, z = proj(n["lat"], n["lon"])
        if not LIM.inside(x, z):
            continue
        hits = [h for h in (nearest_on(p, x, z) for p in dir_paths[lid]) if h and h[0] < 60]
        if not hits:
            continue
        under = min(h[3] for h in hits) < -1
        # the L and trolley stations inside the original extent already exist
        if lid in OWN_CORE_TRACK and in_core(x, z):
            continue
        key = nm
        rec = stations.get(key)
        if rec and math.hypot(rec["x"] - x, rec["z"] - z) > 400:
            key = f"{nm}@{round(x)},{round(z)}"; rec = stations.get(key)
        if not rec:
            rec = stations[key] = {"t": nm, "x": round(x, 1), "z": round(z, 1), "k": [], "u": [], "lines": []}
        if kind not in rec["k"]:
            rec["k"].append(kind)
        if under and kind not in rec["u"]:
            rec["u"].append(kind)
        if lid not in rec["lines"]:
            rec["lines"].append(lid)
        if kind in ("trolley", "pcc"):
            rec.setdefault("T", [])
            if lid not in rec["T"]:
                rec["T"].append(lid)
        # platforms beside each direction's track (street trolley stops have none)
        if KINDS[kind]["plat"] and not (kind in ("trolley", "pcc") and not under):
            for h in hits:
                d, px, pz, py, tx, tz = h
                nx, nz = -tz, tx
                others = [o for o in hits if o is not h and math.hypot(o[1] - px, o[2] - pz) < 25]
                side = 1
                if others:
                    o = others[0]
                    side = -1 if ((o[1] - px) * nx + (o[2] - pz) * nz) > 0 else 1
                off = 1.6 + 3.5 / 2
                add_platform(px + nx * off * side, pz + nz * off * side, py + KINDS[kind]["top"], math.atan2(tx, tz), kind)
stations_out = [s for s in stations.values() if not (s["t"] in old_names and in_core(s["x"], s["z"]) and set(s["k"]) <= {"metro", "trolley"})]
print(f"  {len(stations_out)} stations, {len(platforms)} platforms")

old_ent = [(e["x"], e["z"]) for e in old.get("entrances", [])]
entrances = []
for n in NODES.values():
    if n["tags"].get("railway") != "subway_entrance":
        continue
    x, z = proj(n["lat"], n["lon"])
    if not LIM.inside(x, z) or any(math.hypot(x - a, z - b) < 8 for a, b in old_ent):
        continue
    near = [s for s in stations_out if s["u"] and math.hypot(s["x"] - x, s["z"] - z) < 160]
    if not near:
        continue
    s = min(near, key=lambda s: math.hypot(s["x"] - x, s["z"] - z))
    entrances.append({"x": round(x, 1), "z": round(z, 1), "k": "trolley" if s["u"] == ["trolley"] else "metro"})
print(f"  {len(entrances)} entrances")

out = {"note": "OpenStreetMap route relations (ODbL); depths and El heights are estimates.",
       "lines": lines_out, "tracks": tracks, "runs": runs_out, "replaceRuns": REPLACE,
       "platforms": platforms, "stations": stations_out, "entrances": entrances, "columns": columns}
raw = json.dumps(out, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
with open(os.path.join(OUT, "metro.json.gz"), "wb") as fo:
    with gzip.GzipFile(fileobj=fo, mode="wb", compresslevel=9, mtime=0) as gz:
        gz.write(raw)
print(f"  wrote metro.json.gz: {os.path.getsize(os.path.join(OUT, 'metro.json.gz')) // 1024} KB (raw {len(raw) // 1024} KB)")
