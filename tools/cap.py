"""Proposal: a deck over the 30th Street rail yard, topped with a park and a concert bowl.

The cap's outline is derived from the yard itself: a raster mask around the tracks north
of the station, closed to fill the gaps between them, then trimmed to stay clear of tall
buildings, the station, the expressway sports park, through streets and the river.
"""
import math

from geom import point_in_poly, seg_dist, simplify_ring

CAP_H = 10.5  # deck height (m): just above the street bridges that already span the yard
CELL = 4.0    # raster resolution (m)


class Raster:
    def __init__(self, x0, z0, x1, z1, cell=CELL):
        self.x0, self.z0, self.c = x0, z0, cell
        self.nx, self.nz = int((x1 - x0) / cell) + 1, int((z1 - z0) / cell) + 1

    def xy(self, i, j):
        return self.x0 + (i + .5) * self.c, self.z0 + (j + .5) * self.c

    def ij(self, x, z):
        return int(math.floor((x - self.x0) / self.c)), int(math.floor((z - self.z0) / self.c))

    def new(self, v=False):
        return [[v] * self.nz for _ in range(self.nx)]

    def mark_near_seg(self, m, a, b, r):
        i0, j0 = self.ij(min(a[0], b[0]) - r, min(a[1], b[1]) - r)
        i1, j1 = self.ij(max(a[0], b[0]) + r, max(a[1], b[1]) + r)
        for i in range(max(0, i0), min(self.nx, i1 + 1)):
            for j in range(max(0, j0), min(self.nz, j1 + 1)):
                if not m[i][j] and seg_dist(self.xy(i, j), a, b) <= r:
                    m[i][j] = True

    def dist(self, m):
        """Chamfer distance (m) from each True cell to the nearest False cell or the edge."""
        INF = 1e9
        nx, nz, a, b = self.nx, self.nz, self.c, self.c * 1.4142
        d = [[(INF if m[i][j] else 0.0) for j in range(nz)] for i in range(nx)]
        for i in range(nx):
            for j in range(nz):
                if d[i][j]:
                    v = a if (i == 0 or j == 0 or i == nx - 1 or j == nz - 1) else d[i][j]
                    if i: v = min(v, d[i - 1][j] + a)
                    if j: v = min(v, d[i][j - 1] + a)
                    if i and j: v = min(v, d[i - 1][j - 1] + b)
                    if i and j < nz - 1: v = min(v, d[i - 1][j + 1] + b)
                    d[i][j] = v
        for i in range(nx - 1, -1, -1):
            for j in range(nz - 1, -1, -1):
                if d[i][j]:
                    v = d[i][j]
                    if i < nx - 1: v = min(v, d[i + 1][j] + a)
                    if j < nz - 1: v = min(v, d[i][j + 1] + a)
                    if i < nx - 1 and j < nz - 1: v = min(v, d[i + 1][j + 1] + b)
                    if i < nx - 1 and j: v = min(v, d[i + 1][j - 1] + b)
                    d[i][j] = v
        return d

    def grow(self, m, r):
        d = self.dist([[not v for v in col] for col in m])
        return [[m[i][j] or d[i][j] <= r for j in range(self.nz)] for i in range(self.nx)]

    def shrink(self, m, r):
        d = self.dist(m)
        return [[d[i][j] > r for j in range(self.nz)] for i in range(self.nx)]

    def largest(self, m):
        seen, best = self.new(), []
        for i in range(self.nx):
            for j in range(self.nz):
                if m[i][j] and not seen[i][j]:
                    comp, stack = [], [(i, j)]
                    seen[i][j] = True
                    while stack:
                        a, b = stack.pop()
                        comp.append((a, b))
                        for p, q in ((a + 1, b), (a - 1, b), (a, b + 1), (a, b - 1)):
                            if 0 <= p < self.nx and 0 <= q < self.nz and m[p][q] and not seen[p][q]:
                                seen[p][q] = True
                                stack.append((p, q))
                    if len(comp) > len(best):
                        best = comp
        out = self.new()
        for a, b in best:
            out[a][b] = True
        return out

    def contours(self, m):
        """Boundary loops of a mask (consistent winding: outer and holes come out opposite)."""
        nxt, c = {}, self.c
        for i in range(self.nx):
            for j in range(self.nz):
                if not m[i][j]:
                    continue
                x0, z0 = self.x0 + i * c, self.z0 + j * c
                x1, z1 = x0 + c, z0 + c
                if j == 0 or not m[i][j - 1]: nxt.setdefault((x1, z0), []).append((x0, z0))
                if i == self.nx - 1 or not m[i + 1][j]: nxt.setdefault((x1, z1), []).append((x1, z0))
                if j == self.nz - 1 or not m[i][j + 1]: nxt.setdefault((x0, z1), []).append((x1, z1))
                if i == 0 or not m[i - 1][j]: nxt.setdefault((x0, z0), []).append((x0, z1))
        loops = []
        while nxt:
            start = next(iter(nxt))
            ring, p = [], start
            while True:
                ring.append(p)
                q = nxt[p].pop()
                if not nxt[p]:
                    del nxt[p]
                p = q
                if p == start or p not in nxt:
                    break
            if len(ring) > 3:
                loops.append(ring)
        return loops


def chaikin(ring, n=2):
    for _ in range(n):
        out = []
        for i in range(len(ring)):
            a, b = ring[i], ring[(i + 1) % len(ring)]
            out += [(a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25), (a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75)]
        ring = out
    return ring


def ring_area(r):
    return sum(r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1] for i in range(len(r))) / 2


def plan_cap(lines, buildings, water, lm, sports, rnd):
    st = lm["station"]
    X0, X1, Z0, Z1 = st["x"] - 520, st["x"] + 260, st["z"] - 1250, st["z"] - st["d"] / 2 + 30
    R = Raster(X0, Z0, X1, Z1)
    inside = lambda p: X0 - 60 < p[0] < X1 + 60 and Z0 - 60 < p[1] < Z1 + 60  # noqa: E731

    rail, roads, xl = R.new(), [], []
    for l in lines:
        p = l["p"]
        pts = [(p[i] / 10, p[i + 1] / 10) for i in range(0, len(p), 2)]
        if not any(inside(q) for q in pts):
            continue
        for a, b in zip(pts, pts[1:]):
            if l["k"] == 2:
                R.mark_near_seg(rail, a, b, 6)
            elif l.get("x"):
                xl.append((a, b, l["w"]))
            elif l["k"] == 0 and not l["b"] and l["w"] >= 8:
                roads.append((a, b, l["w"]))
    m = R.shrink(R.grow(rail, 18), 18)  # close the gaps between tracks

    # keep clear of tall buildings, the station, the sports corridor, through streets, water
    ex, exb = R.new(), R.new()
    for o in buildings:
        ring = o["rings"][0]
        if o["h"] < CAP_H or not any(inside(q) for q in ring):
            continue  # low yard sheds simply go under the deck
        for a, b in zip(ring, ring[1:] + ring[:1]):
            R.mark_near_seg(exb, a, b, 5)
        xs, zs = [q[0] for q in ring], [q[1] for q in ring]
        i0, j0 = R.ij(min(xs), min(zs))
        i1, j1 = R.ij(max(xs), max(zs))
        for i in range(max(0, i0), min(R.nx, i1 + 1)):
            for j in range(max(0, j0), min(R.nz, j1 + 1)):
                if point_in_poly(*R.xy(i, j), o["rings"]):
                    exb[i][j] = True
    c, s_ = math.cos(st["ry"]), math.sin(st["ry"])
    for i in range(R.nx):
        for j in range(R.nz):
            if not m[i][j]:
                continue
            x, z = R.xy(i, j)
            dx, dz = x - st["x"], z - st["z"]
            if abs(dx * c - dz * s_) <= st["w"] / 2 + 6 and abs(dx * s_ + dz * c) <= st["d"] / 2 + 6:
                ex[i][j] = True
            elif any(point_in_poly(x, z, poly) for poly in water):
                ex[i][j] = True
    for r in sports["routes"]:
        p = r["p"]
        pts = [(p[i] / 10, p[i + 1] / 10) for i in range(0, len(p), 2)]
        for k, (a, b) in enumerate(zip(pts, pts[1:])):
            if inside(a):
                R.mark_near_seg(ex, a, b, r["a"][k] / 2 + 12)
    for a, b, w in xl:
        R.mark_near_seg(ex, a, b, w / 2 + 8)
    for a, b, w in roads:
        R.mark_near_seg(ex, a, b, w / 2 + 3)
    clip = lambda mm: [[mm[i][j] and not ex[i][j] and not exb[i][j] for j in range(R.nz)] for i in range(R.nx)]  # noqa: E731
    m = clip(m)
    opened = R.largest(R.grow(R.shrink(m, 16), 16))  # drop slivers and the narrow track throats
    m = [[opened[i][j] and m[i][j] for j in range(R.nz)] for i in range(R.nx)]
    # Fill the yard's interior (service roads and sheds between the track fans) so the deck
    # is one continuous park; buildings taller than the deck still stand up through it.
    outside, stack = R.new(), [(i, j) for i in range(R.nx) for j in (0, R.nz - 1)] + [(i, j) for j in range(R.nz) for i in (0, R.nx - 1)]
    stack = [(i, j) for i, j in stack if not m[i][j]]
    for i, j in stack:
        outside[i][j] = True
    while stack:
        a, b = stack.pop()
        for p, q in ((a + 1, b), (a - 1, b), (a, b + 1), (a, b - 1)):
            if 0 <= p < R.nx and 0 <= q < R.nz and not m[p][q] and not outside[p][q]:
                outside[p][q] = True
                stack.append((p, q))
    m = [[(m[i][j] or not outside[i][j]) and not exb[i][j] for j in range(R.nz)] for i in range(R.nx)]
    D = R.dist(m)
    area_m2 = sum(v for col in m for v in col) * R.c ** 2

    def rings_of(mask, tol=2.5, min_area=300):
        out = [chaikin(simplify_ring(loop, tol), 2) for loop in R.contours(mask) if abs(ring_area(loop)) >= min_area]
        out.sort(key=lambda r: -abs(ring_area(r)))
        if out and ring_area(out[0]) < 0:
            out = [r[::-1] for r in out]
        return out

    cap_rings = rings_of(m)

    def Dat(x, z):
        i, j = R.ij(x, z)
        return D[i][j] if 0 <= i < R.nx and 0 <= j < R.nz else 0.0

    # --- concert bowl: the biggest fan-shaped lawn that fits; the audience looks past the
    # stage toward the Center City skyline when the site allows it
    ch = (lm["cityhall"]["x"], lm["cityhall"]["z"])
    # the bandshell rises above both monorails, so keep the stage away from their corridors
    route_segs = []
    for r in sports["routes"]:
        p = r["p"]
        pts = [(p[i] / 10, p[i + 1] / 10) for i in range(0, len(p), 2)]
        route_segs += [(a, b) for a, b in zip(pts, pts[1:]) if inside(a)]
    far_from_lines = lambda x, z: all(seg_dist((x, z), a, b) > 80 for a, b in route_segs)  # noqa: E731
    best = None
    for rad in (125, 110, 100, 90, 80, 70, 60):
        for i in range(0, R.nx, 2):
            for j in range(0, R.nz, 2):
                if D[i][j] < 26:
                    continue
                sx, sz = R.xy(i, j)
                if not far_from_lines(sx, sz):
                    continue
                for k in range(36):
                    th = k * math.pi / 18
                    ux, uz = math.cos(th), math.sin(th)  # stage -> audience
                    if not all(Dat(sx - ux * 28 + vx, sz - uz * 28 + vz) > 6 for vx, vz in ((0, 0), (-uz * 24, ux * 24), (uz * 24, -ux * 24))):
                        continue
                    if not all(Dat(sx + rr * math.cos(th + a), sz + rr * math.sin(th + a)) > 8
                               for rr in (rad * .3, rad * .6, rad) for a in (-0.95, -0.5, 0, 0.5, 0.95)):
                        continue
                    tx, tz = sx - ch[0], sz - ch[1]
                    score = (ux * tx + uz * tz) / math.hypot(tx, tz)
                    if best is None or score > best[0]:
                        best = (score, sx, sz, ux, uz, rad)
        if best:
            break
    score, sx, sz, ux, uz, rad = best
    venue = {"x": round(sx, 1), "z": round(sz, 1), "dir": [round(ux, 4), round(uz, 4)], "r": rad}

    def in_venue(x, z, pad):
        dx, dz = x - sx, z - sz
        d = math.hypot(dx, dz)
        if d < 52 + pad:
            return True
        if d > rad + pad:
            return False
        return (dx * ux + dz * uz) / max(d, 1e-6) > math.cos(1.0 + pad / max(d, 1))

    # --- promenade just inside the edge, plus three spokes from the back of the lawn
    # the promenade breaks where it would cross the bowl; spokes then lead to the lawn
    paths = []
    for r in rings_of([[D[i][j] > 9 for j in range(R.nz)] for i in range(R.nx)], 3, 2000):
        if not any(in_venue(x, z, 6) for x, z in r):
            paths.append({"ring": 1, "p": r})
            continue
        k0 = next(k for k, q in enumerate(r) if in_venue(q[0], q[1], 6))
        rot = r[k0:] + r[:k0]  # start inside the bowl so each run outside it is contiguous
        run = []
        for q in rot + [rot[0]]:
            if in_venue(q[0], q[1], 6):
                if len(run) > 3:
                    paths.append({"ring": 0, "p": run})
                run = []
            else:
                run.append(q)
        if len(run) > 3:
            paths.append({"ring": 0, "p": run})
    base = math.atan2(uz, ux)
    for a in (-0.75, 0, 0.75):
        hx, hz = math.cos(base + a), math.sin(base + a)
        pts = []
        for t in range(int(rad + 6), 1500, 4):
            x, z = sx + hx * t, sz + hz * t
            if Dat(x, z) < 9:
                break
            pts.append((x, z))
        if len(pts) > 3:
            paths.append({"ring": 0, "p": pts})

    # --- trees across the rest of the deck, off the promenade
    trees = []
    for i in range(R.nx):
        for j in range(R.nz):
            if D[i][j] < 7 or rnd.random() > R.c ** 2 / 340:  # sparse enough to leave open lawns
                continue
            x, z = R.xy(i, j)
            x += rnd.uniform(-R.c / 2, R.c / 2)
            z += rnd.uniform(-R.c / 2, R.c / 2)
            if 7.5 < D[i][j] < 11.5 or in_venue(x, z, 14):
                continue
            trees += [round(x * 10), round(z * 10)]

    def cap_test(x, z):
        i, j = R.ij(x, z)
        return 0 <= i < R.nx and 0 <= j < R.nz and m[i][j]

    cx = sum(p[0] for p in cap_rings[0]) / len(cap_rings[0])
    cz = sum(p[1] for p in cap_rings[0]) / len(cap_rings[0])
    flat = lambda r: [v for p in r for v in (round(p[0] * 10), round(p[1] * 10))]  # noqa: E731
    info = f"cap {area_m2 / 10000:.1f} ha, {len(cap_rings)} rings; bowl lawn radius {rad} m (skyline score {score:.2f}); {len(trees) // 2} trees"
    return {
        "h": CAP_H,
        "rings": [flat(r) for r in cap_rings],
        "paths": [{"ring": p["ring"], "p": flat(p["p"])} for p in paths],
        "venue": venue,
        "trees": trees,
        "label": [round(cx, 1), round(cz, 1)],
        "area_ha": round(area_m2 / 10000, 1),
    }, cap_test, info
