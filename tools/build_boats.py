"""River boat lines on the Delaware and the Schuylkill (a proposal, plus the real RiverLink Ferry).

  python -I tools/build_boats.py

Reads the water the scene already draws (data/city.json.gz water + data/river.json water) and
the dams (both files), and writes data/boats.json:
  lines: [{id, name, color, proposed, stops: [{t, x, z, sx, sz, s}], p: polyline_dm}]
    x, z   the stop in the water (m), where the boat ties up
    sx, sz the nearest shore (m): the pier runs from there out to the stop
    s      the stop's distance along p (m)
Routes are found on a 12 m grid of the water: a shortest path between consecutive stops whose
cost rises near the banks, so boats keep to mid-channel; the dams are barriers (the Fairmount
Dam splits the Schuylkill lines; Flat Rock Dam ends the upper line at Manayunk). Stop places are
real riverfront parks and landings (OpenStreetMap names and positions).
"""
import gzip, heapq, json, math, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geom import proj, simplify  # noqa: E402

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
CELL = 12.0

# stops: (name, lat, lon), in running order
LINES = [
    ("D", "Delaware River taxi", "#e0457b", True, [
        ("Glen Foerd", 40.05224, -74.98022), ("Pleasant Hill Park", 40.04198, -74.99247),
        ("Pennypack on the Delaware", 40.02900, -75.01800), ("Lardner's Point Park", 40.01450, -75.04676),
        ("Frankford Arsenal", 40.00681, -75.05742), ("Pulaski Park", 39.97797, -75.09694),
        ("Penn Treaty Park", 39.96659, -75.12811), ("Race Street Pier", 39.95314, -75.13885),
        ("Spruce Street Harbor Park", 39.94430, -75.14170), ("Washington Avenue Pier", 39.93232, -75.14151),
        ("Navy Yard", 39.88700, -75.16000), ("Fort Mifflin", 39.87504, -75.21290)]),
    ("S", "Lower Schuylkill boat", "#13917f", True, [
        ("Fort Mifflin", 39.87504, -75.21290), ("Bartram's Garden", 39.93151, -75.21106),
        ("Grays Ferry Crescent", 39.94118, -75.20234), ("Schuylkill Banks (Walnut St)", 39.95050, -75.18100),
        ("Fairmount Water Works", 39.96539, -75.18311)]),
    ("U", "Upper Schuylkill boat", "#6a4fb0", True, [
        ("Boathouse Row", 39.96950, -75.18720), ("Strawberry Mansion", 39.99507, -75.18700),
        ("East Falls", 40.00673, -75.18809), ("Manayunk (Venice Island)", 40.02337, -75.22167)]),
    ("R", "RiverLink Ferry", "#d98b1c", False, [   # the real seasonal ferry across to Camden
        ("Penn's Landing", 39.94760, -75.14130), ("Camden Waterfront", 39.94470, -75.13170)]),
]

flat_pairs = lambda f: [(f[i] / 10, f[i + 1] / 10) for i in range(0, len(f), 2)]  # noqa: E731
city = json.load(gzip.open(os.path.join(ROOT, "data", "city.json.gz"), "rt", encoding="utf-8"))
river = json.load(open(os.path.join(ROOT, "data", "river.json"), encoding="utf-8"))
polys = [[flat_pairs(r) for r in p] for p in city["water"] + river["water"]]
dams = [flat_pairs(d) for d in city["dams"] + river["dams"]]

stops_m = [proj(la, lo) for _, _, _, _, st in LINES for _, la, lo in st]
X0 = min(p[0] for p in stops_m) - 2500; X1 = max(p[0] for p in stops_m) + 2500
Z0 = min(p[1] for p in stops_m) - 2500; Z1 = max(p[1] for p in stops_m) + 2500
W, H = int((X1 - X0) / CELL) + 1, int((Z1 - Z0) / CELL) + 1
print(f"grid {W} x {H} ({CELL} m)")
water = bytearray(W * H)

# ---- rasterise the water (even-odd per polygon, cell centres), edges bucketed by row
for rings in polys:
    rows = {}
    for r in rings:
        for i in range(len(r)):
            (ax, az), (bx, bz) = r[i], r[(i + 1) % len(r)]
            if az == bz:
                continue
            lo, hi = min(az, bz), max(az, bz)
            j0 = max(0, math.ceil((lo - Z0) / CELL - .5)); j1 = min(H - 1, math.floor((hi - Z0) / CELL - .5))
            for j in range(j0, j1 + 1):
                z = Z0 + (j + .5) * CELL
                if lo <= z < hi:
                    rows.setdefault(j, []).append(ax + (bx - ax) * (z - az) / (bz - az))
    for j, xs in rows.items():
        xs.sort()
        for k in range(0, len(xs) - 1, 2):
            i0 = max(0, math.ceil((xs[k] - X0) / CELL - .5)); i1 = min(W - 1, math.floor((xs[k + 1] - X0) / CELL - .5))
            for i in range(i0, i1 + 1):
                water[j * W + i] ^= 1
# ---- dams are walls
for d in dams:
    for (ax, az), (bx, bz) in zip(d, d[1:]):
        n = int(math.hypot(bx - ax, bz - az) / (CELL / 3)) + 1
        for k in range(n + 1):
            x, z = ax + (bx - ax) * k / n, az + (bz - az) * k / n
            ci, cj = int((x - X0) / CELL), int((z - Z0) / CELL)
            for di in (-1, 0, 1):
                for dj in (-1, 0, 1):
                    if 0 <= ci + di < W and 0 <= cj + dj < H:
                        water[(cj + dj) * W + ci + di] = 0
print(f"water cells {sum(water)}")

# ---- distance from the bank (cells), breadth-first from the shoreline
INF = 1 << 30
dist = {}
frontier = []
N8 = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)]
for c in range(W * H):
    if water[c]:
        i, j = c % W, c // W
        if any(not (0 <= i + di < W and 0 <= j + dj < H) or not water[(j + dj) * W + i + di] for di, dj in N8[:4]):
            dist[c] = 0; frontier.append(c)
while frontier:
    nxt = []
    for c in frontier:
        i, j = c % W, c // W
        for di, dj in N8[:4]:
            if 0 <= i + di < W and 0 <= j + dj < H:
                n = (j + dj) * W + i + di
                if water[n] and n not in dist:
                    dist[n] = dist[c] + 1; nxt.append(n)
    frontier = nxt

cell_of = lambda x, z: int((z - Z0) / CELL) * W + int((x - X0) / CELL)  # noqa: E731
centre = lambda c: (X0 + (c % W + .5) * CELL, Z0 + (c // W + .5) * CELL)  # noqa: E731


def snap(x, z, clear=4, radius=700):
    """the water cell nearest (x, z) at least `clear` cells from the bank (a pier's reach)"""
    ci, cj, r = int((x - X0) / CELL), int((z - Z0) / CELL), int(radius / CELL)
    best = None
    for want in (clear, 2, 1, 0):
        for j in range(max(0, cj - r), min(H, cj + r + 1)):
            for i in range(max(0, ci - r), min(W, ci + r + 1)):
                c = j * W + i
                if water[c] and dist.get(c, -1) >= want:
                    d = (i - ci) ** 2 + (j - cj) ** 2
                    if best is None or d < best[0]:
                        best = (d, c)
        if best:
            return best[1]
    raise SystemExit(f"no water near {x:.0f}, {z:.0f}")


def shore(c):
    """nearest land cell centre to water cell c"""
    ci, cj = c % W, c // W
    for r in range(1, 40):
        best = None
        for j in range(cj - r, cj + r + 1):
            for i in range(ci - r, ci + r + 1):
                if 0 <= i < W and 0 <= j < H and not water[j * W + i]:
                    d = (i - ci) ** 2 + (j - cj) ** 2
                    if best is None or d < best[0]:
                        best = (d, j * W + i)
        if best:
            return centre(best[1])
    return centre(c)


def route(a, b):
    """cheapest water path a -> b; steps near the banks cost more, so it keeps mid-channel"""
    bx, bz = b % W, b // W
    g = {a: 0.0}; prev = {}
    pq = [(0.0, a)]
    while pq:
        f, c = heapq.heappop(pq)
        if c == b:
            break
        i, j = c % W, c // W
        for di, dj in N8:
            n = (j + dj) * W + i + di
            if not (0 <= i + di < W and 0 <= j + dj < H) or not water[n]:
                continue
            step = math.hypot(di, dj) * (1 + 3.5 * max(0.0, 1 - dist.get(n, 0) * CELL / 60))
            ng = g[c] + step
            if ng < g.get(n, INF):
                g[n] = ng; prev[n] = c
                heapq.heappush(pq, (ng + math.hypot(i + di - bx, j + dj - bz), n))
    if b not in prev and a != b:
        raise SystemExit("no water route between stops (a dam or land in the way)")
    path = [b]
    while path[-1] != a:
        path.append(prev[path[-1]])
    return [centre(c) for c in reversed(path)]


def chaikin(P, n=2):
    for _ in range(n):
        Q = [P[0]]
        for (ax, az), (bx, bz) in zip(P, P[1:]):
            Q += [(ax * .75 + bx * .25, az * .75 + bz * .25), (ax * .25 + bx * .75, az * .25 + bz * .75)]
        Q.append(P[-1]); P = Q
    return P


out = []
for lid, name, color, proposed, stops in LINES:
    cells = [snap(*proj(la, lo)) for _, la, lo in stops]
    P = []
    for a, b in zip(cells, cells[1:]):
        seg = route(a, b)
        P += seg if not P else seg[1:]
    P = chaikin(simplify(P, 6.0), 3)
    # each stop's distance along the final line
    S = [0.0]
    for (ax, az), (bx, bz) in zip(P, P[1:]):
        S.append(S[-1] + math.hypot(bx - ax, bz - az))
    rec = []
    for (t, _, _), c in zip(stops, cells):
        x, z = centre(c)
        k = min(range(len(P)), key=lambda i: (P[i][0] - x) ** 2 + (P[i][1] - z) ** 2)
        sx, sz = shore(c)
        rec.append({"t": t, "x": round(x, 1), "z": round(z, 1), "sx": round(sx, 1), "sz": round(sz, 1), "s": round(S[k], 1)})
    out.append({"id": lid, "name": name, "color": color, "proposed": proposed, "stops": rec,
                "p": [v for x, z in P for v in (round(x * 10), round(z * 10))]})
    print(f"  {name}: {S[-1] / 1000:.1f} km, {len(rec)} stops, {len(P)} points")
with open(os.path.join(ROOT, "data", "boats.json"), "w", encoding="utf-8") as f:
    json.dump({"lines": out}, f, separators=(",", ":"))
print("  wrote data/boats.json")
