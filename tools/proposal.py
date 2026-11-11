"""Proposal layer: the expressways become linear sports parks with a monorail overhead.

plan_sports() finds the centreline of each expressway (midway between its two
carriageways), then lays courts and fields end to end along it wherever they fit:
not on bridges or over tunnels, not into buildings, water, rail or surviving streets.
"""
import heapq
import math

from geom import Grid, clip_line, point_in_poly, proj, seg_dist

ROUTES = {"Schuylkill Expressway": "Schuylkill Sports Park", "Vine Street Expressway": "Vine Street Sports Park"}

# footprint incl. run-off: (length along the corridor, width across), metres
TYPES = {
    "soccer": (68.0, 44.0),      # 7-a-side pitch
    "futsal": (44.0, 24.0),      # 5-a-side
    "tennis": (36.6, 18.3),
    "basketball": (32.0, 19.0),
    "volleyball": (24.0, 15.0),
}
TYPE_NAMES = list(TYPES)
PATTERN = ["tennis", "basketball", "futsal", "tennis", "volleyball", "basketball", "soccer", "tennis", "basketball"]
GAP = 4.0
STEP = 8.0


def _graph(ways):
    key = lambda p: (round(p[0], 2), round(p[1], 2))  # noqa: E731
    adj, pos = {}, {}
    for pts in ways:
        for a, b in zip(pts, pts[1:]):
            ka, kb = key(a), key(b)
            pos[ka], pos[kb] = a, b
            d = math.dist(a, b)
            adj.setdefault(ka, []).append((kb, d))
            adj.setdefault(kb, []).append((ka, d))
    return adj, pos


def _dijkstra(adj, src):
    dist, prev, pq = {src: 0.0}, {}, [(0.0, src)]
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u]:
            continue
        for v, w in adj[u]:
            if d + w < dist.get(v, 1e18):
                dist[v], prev[v] = d + w, u
                heapq.heappush(pq, (d + w, v))
    return dist, prev


def _longest_paths(ways):
    """Longest shortest-path ("diameter") through each connected component, longest first."""
    adj, pos = _graph(ways)
    seen, out = set(), []
    for start in adj:
        if start in seen:
            continue
        d0, _ = _dijkstra(adj, start)
        seen |= set(d0)
        a = max(d0, key=d0.get)
        d1, prev = _dijkstra(adj, a)
        b = max(d1, key=d1.get)
        path, u = [b], b
        while u != a:
            u = prev[u]
            path.append(u)
        out.append((d1[b], [pos[k] for k in path]))
    out.sort(key=lambda t: -t[0])
    return [p for _, p in out]


def _resample(pts, step):
    out = [pts[0]]
    carry = 0.0
    for a, b in zip(pts, pts[1:]):
        L = math.dist(a, b)
        s = step - carry
        while s <= L:
            out.append((a[0] + (b[0] - a[0]) * s / L, a[1] + (b[1] - a[1]) * s / L))
            s += step
        carry = L - (s - step)
    return out


def _nearest_on(p, segs_grid):
    best, bq = 1e18, None
    for a, b in segs_grid.near(p[0], p[1]):
        dx, dz = b[0] - a[0], b[1] - a[1]
        L = dx * dx + dz * dz
        t = 0 if not L else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L))
        q = (a[0] + t * dx, a[1] + t * dz)
        d = math.dist(p, q)
        if d < best:
            best, bq = d, q
    return best, bq


def _seg_grid(pts, cell=80):
    g = Grid(cell)
    for a, b in zip(pts, pts[1:]):
        g.add((a, b), min(a[0], b[0]) - 80, min(a[1], b[1]) - 80, max(a[0], b[0]) + 80, max(a[1], b[1]) + 80)
    return g


def plan_sports(osm, buildings, lines, water, bbox):
    x0, z0, x1, z1 = bbox
    # --- obstacles
    bgrid = Grid(40)
    for o in buildings:
        xs = [p[0] for p in o["rings"][0]]
        zs = [p[1] for p in o["rings"][0]]
        bgrid.add(o, min(xs), min(zs), max(xs), max(zs))
    wgrid = Grid(80)
    for poly in water:
        xs = [p[0] for p in poly[0]]
        zs = [p[1] for p in poly[0]]
        wgrid.add(poly, min(xs), min(zs), max(xs), max(zs))
    keep = Grid(40)  # rail and surviving at-grade streets the courts must stay off
    for l in lines:
        if l.get("x") or l["b"] or l["k"] == 1:
            continue
        p = l["p"]
        pts = [(p[i] / 10, p[i + 1] / 10) for i in range(0, len(p), 2)]
        for a, b in zip(pts, pts[1:]):
            keep.add((a, b, l["w"]), min(a[0], b[0]) - 30, min(a[1], b[1]) - 30, max(a[0], b[0]) + 30, max(a[1], b[1]) + 30)

    def clear(x, z):
        for o in bgrid.near(x, z):
            if point_in_poly(x, z, o["rings"]):
                return False
        for poly in wgrid.near(x, z):
            if point_in_poly(x, z, poly):
                return False
        for a, b, w in keep.near(x, z):
            if seg_dist((x, z), a, b) < w / 2 + 1.5:
                return False
        return True

    courts, routes = [], []
    for name, label in ROUTES.items():
        ways, flags = [], Grid(60)
        for el in osm:
            t = el.get("tags", {})
            if el["type"] != "way" or t.get("highway") != "motorway" or t.get("name") != name:
                continue
            pts = [proj(p["lat"], p["lon"]) for p in el["geometry"]]
            ways.append(pts)
            bad = t.get("bridge") in ("yes", "viaduct") or t.get("tunnel") in ("yes",) or t.get("covered") == "yes"
            for a, b in zip(pts, pts[1:]):
                flags.add((a, b, bad), min(a[0], b[0]) - 40, min(a[1], b[1]) - 40, max(a[0], b[0]) + 40, max(a[1], b[1]) + 40)
        paths = _longest_paths(ways)
        A = _resample(paths[0], STEP)
        Bg = _seg_grid(paths[1]) if len(paths) > 1 else None
        cen, avail = [], []
        for p in A:
            d, q = _nearest_on(p, Bg) if Bg else (1e18, None)
            if q is not None and d < 70:
                cen.append(((p[0] + q[0]) / 2, (p[1] + q[1]) / 2))
                avail.append(d + 18)
            else:
                cen.append(p)
                avail.append(20)
        # ease the centreline, take the narrowest nearby width
        cs = [(sum(c[0] for c in cen[max(0, i - 3): i + 4]) / len(cen[max(0, i - 3): i + 4]),
               sum(c[1] for c in cen[max(0, i - 3): i + 4]) / len(cen[max(0, i - 3): i + 4])) for i in range(len(cen))]
        av = [min(avail[max(0, i - 3): i + 4]) for i in range(len(avail))]
        aidx = {c: a for c, a in zip(cs, av)}

        def on_bad(p):
            best, bad = 1e18, False
            for a, b, f in flags.near(p[0], p[1]):
                d = seg_dist(p, a, b)
                if d < best:
                    best, bad = d, f
            return bad

        for piece in clip_line(cs, x0, z0, x1, z1):
            if sum(math.dist(a, b) for a, b in zip(piece, piece[1:])) < 300:
                continue
            piece = _resample(piece, STEP)
            # widths for resampled points: nearest original sample
            pw = []
            for p in piece:
                k = min(range(len(cs)), key=lambda i: (cs[i][0] - p[0]) ** 2 + (cs[i][1] - p[1]) ** 2)
                pw.append(av[k])
            bad = [on_bad(p) for p in piece]
            routes.append({"label": label, "p": [v for p in piece for v in (round(p[0] * 10), round(p[1] * 10))],
                           "a": [round(w) for w in pw]})
            # --- lay courts end to end
            n, i, pat = len(piece), 0, 0
            while i < n - 2:
                placed = False
                first = PATTERN[pat % len(PATTERN)]
                order = [first] + sorted((t for t in TYPES if t != first), key=lambda t: -TYPES[t][0] * TYPES[t][1])
                for t in order:
                    L, W = TYPES[t]
                    j = i + int(math.ceil(L / STEP))
                    if j >= n or any(bad[i:j + 1]) or min(pw[i:j + 1]) < W:
                        continue
                    a, b = piece[i], piece[j]
                    ux, uz = (b[0] - a[0]) / math.dist(a, b), (b[1] - a[1]) / math.dist(a, b)
                    vx, vz = -uz, ux
                    cx, cz = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
                    # the corridor must stay roughly straight under the court
                    mid = piece[(i + j) // 2]
                    if abs((mid[0] - cx) * vx + (mid[1] - cz) * vz) > W * 0.25:
                        continue
                    ok = all(clear(cx + ux * L * fu + vx * W * fv, cz + uz * L * fu + vz * W * fv)
                             for fu in (-.5, -.25, 0, .25, .5) for fv in (-.5, 0, .5))
                    if not ok:
                        continue
                    courts.append([TYPE_NAMES.index(t), round(cx * 10), round(cz * 10), round(math.atan2(-uz, ux) * 1000)])
                    i = j + int(math.ceil(GAP / STEP))
                    pat += 1
                    placed = True
                    break
                if not placed:
                    i += 1
    return {"types": [{"name": t, "w": TYPES[t][0], "d": TYPES[t][1]} for t in TYPE_NAMES],
            "courts": courts, "routes": routes}
