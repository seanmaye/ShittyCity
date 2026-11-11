"""Small pure-Python 2D geometry helpers used by build_data.py (no shapely/numpy needed)."""
import math

# Same local projection the scene uses (js/data.js): metres east (x) and south (z) of the origin.
LAT0, LON0, MX, MZ = 39.9560, -75.1760, 85390.0, 111000.0


def proj(lat, lon):
    return ((lon - LON0) * MX, -(lat - LAT0) * MZ)


def area(ring):
    a = 0.0
    n = len(ring)
    for i in range(n):
        x1, z1 = ring[i]
        x2, z2 = ring[(i + 1) % n]
        a += x1 * z2 - x2 * z1
    return a / 2


def centroid(ring):
    a = area(ring)
    if abs(a) < 1e-9:
        return (sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring))
    cx = cz = 0.0
    n = len(ring)
    for i in range(n):
        x1, z1 = ring[i]
        x2, z2 = ring[(i + 1) % n]
        f = x1 * z2 - x2 * z1
        cx += (x1 + x2) * f
        cz += (z1 + z2) * f
    return (cx / (6 * a), cz / (6 * a))


def _seg_dist2(p, a, b):
    ax, az = a
    dx, dz = b[0] - ax, b[1] - az
    L = dx * dx + dz * dz
    t = 0.0 if L == 0 else max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - az) * dz) / L))
    ex, ez = ax + t * dx - p[0], az + t * dz - p[1]
    return ex * ex + ez * ez


def seg_dist(p, a, b):
    return math.sqrt(_seg_dist2(p, a, b))


def simplify(pts, tol):
    """Douglas-Peucker for an open polyline."""
    if len(pts) < 3:
        return list(pts)
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    t2 = tol * tol
    while stack:
        i, j = stack.pop()
        best, bi = -1.0, -1
        for k in range(i + 1, j):
            d = _seg_dist2(pts[k], pts[i], pts[j])
            if d > best:
                best, bi = d, k
        if best > t2:
            keep[bi] = True
            stack += [(i, bi), (bi, j)]
    return [p for p, k in zip(pts, keep) if k]


def simplify_ring(ring, tol):
    if len(ring) < 4:
        return ring
    # split at the vertex farthest from vertex 0 so the closing edge is kept
    far = max(range(len(ring)), key=lambda i: (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2)
    a = simplify(ring[: far + 1], tol)
    b = simplify(ring[far:] + [ring[0]], tol)
    out = a[:-1] + b[:-1]
    return out if len(out) >= 3 else ring


def point_in_ring(x, z, ring):
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, zi = ring[i]
        xj, zj = ring[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi) + xi:
            inside = not inside
        j = i
    return inside


def point_in_poly(x, z, rings):
    if not point_in_ring(x, z, rings[0]):
        return False
    return not any(point_in_ring(x, z, h) for h in rings[1:])


def hull(pts):
    pts = sorted(set(pts))
    if len(pts) < 3:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lo, up = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0:
            up.pop()
        up.append(p)
    return lo[:-1] + up[:-1]


def min_rect(pts):
    """Minimum-area bounding rectangle -> (cx, cz, w, d, ry).

    w runs along the rectangle's local x axis, d along local z; ry is the three.js
    rotation.y that maps local x onto that axis (x east, z south)."""
    h = hull(pts)
    best = None
    for i in range(len(h)):
        x1, z1 = h[i]
        x2, z2 = h[(i + 1) % len(h)]
        L = math.hypot(x2 - x1, z2 - z1)
        if L < 1e-6:
            continue
        ux, uz = (x2 - x1) / L, (z2 - z1) / L
        vx, vz = -uz, ux
        us = [p[0] * ux + p[1] * uz for p in h]
        vs = [p[0] * vx + p[1] * vz for p in h]
        a = (max(us) - min(us)) * (max(vs) - min(vs))
        if best is None or a < best[0]:
            mu, mv = (max(us) + min(us)) / 2, (max(vs) + min(vs)) / 2
            best = (a, mu * ux + mv * vx, mu * uz + mv * vz, max(us) - min(us), max(vs) - min(vs), ux, uz)
    _, cx, cz, w, d, ux, uz = best
    return cx, cz, w, d, math.atan2(-uz, ux)


def clip_ring(ring, x0, z0, x1, z1):
    """Sutherland-Hodgman clip of a ring to an axis-aligned rectangle."""
    def clip(pts, inside, inter):
        out = []
        n = len(pts)
        for i in range(n):
            cur, prev = pts[i], pts[i - 1]
            if inside(cur):
                if not inside(prev):
                    out.append(inter(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(inter(prev, cur))
        return out

    def ix(xc):
        return lambda a, b: (xc, a[1] + (b[1] - a[1]) * (xc - a[0]) / (b[0] - a[0]))

    def iz(zc):
        return lambda a, b: (a[0] + (b[0] - a[0]) * (zc - a[1]) / (b[1] - a[1]), zc)

    pts = ring
    for inside, inter in (
        (lambda p: p[0] >= x0, ix(x0)), (lambda p: p[0] <= x1, ix(x1)),
        (lambda p: p[1] >= z0, iz(z0)), (lambda p: p[1] <= z1, iz(z1)),
    ):
        if not pts:
            break
        pts = clip(pts, inside, inter)
    return pts


def clip_line(pts, x0, z0, x1, z1):
    """Clip an open polyline to a rectangle; returns a list of pieces."""
    def inside(p):
        return x0 <= p[0] <= x1 and z0 <= p[1] <= z1

    def lb(a, b):  # Liang-Barsky
        dx, dz = b[0] - a[0], b[1] - a[1]
        t0, t1 = 0.0, 1.0
        for p, q in ((-dx, a[0] - x0), (dx, x1 - a[0]), (-dz, a[1] - z0), (dz, z1 - a[1])):
            if p == 0:
                if q < 0:
                    return None
                continue
            r = q / p
            if p < 0:
                t0 = max(t0, r)
            else:
                t1 = min(t1, r)
        if t0 > t1:
            return None
        return (a[0] + t0 * dx, a[1] + t0 * dz), (a[0] + t1 * dx, a[1] + t1 * dz)

    pieces, cur = [], []
    for i in range(len(pts) - 1):
        seg = lb(pts[i], pts[i + 1])
        if seg is None:
            if cur:
                pieces.append(cur)
                cur = []
            continue
        a, b = seg
        if not cur:
            cur = [a]
        cur.append(b)
        if not inside(pts[i + 1]):
            pieces.append(cur)
            cur = []
    if cur:
        pieces.append(cur)
    return [p for p in pieces if len(p) >= 2]


def stitch(ways, eps=1e-7):
    """Join open ways (lists of (lat, lon)) into closed rings."""
    ways = [list(w) for w in ways if len(w) >= 2]
    rings = []
    key = lambda p: (round(p[0] / eps), round(p[1] / eps))  # noqa: E731
    while ways:
        cur = ways.pop()
        changed = True
        while key(cur[0]) != key(cur[-1]) and changed:
            changed = False
            for i, w in enumerate(ways):
                if key(w[0]) == key(cur[-1]):
                    cur += w[1:]
                elif key(w[-1]) == key(cur[-1]):
                    cur += w[::-1][1:]
                elif key(w[-1]) == key(cur[0]):
                    cur = w[:-1] + cur
                elif key(w[0]) == key(cur[0]):
                    cur = w[::-1][:-1] + cur
                else:
                    continue
                ways.pop(i)
                changed = True
                break
        if key(cur[0]) == key(cur[-1]) and len(cur) >= 4:
            rings.append(cur[:-1])
    return rings


class Grid:
    """Uniform bucket grid for quick spatial lookups."""

    def __init__(self, cell):
        self.cell = cell
        self.b = {}

    def add(self, item, x0, z0, x1, z1):
        c = self.cell
        for i in range(int(math.floor(x0 / c)), int(math.floor(x1 / c)) + 1):
            for j in range(int(math.floor(z0 / c)), int(math.floor(z1 / c)) + 1):
                self.b.setdefault((i, j), []).append(item)

    def near(self, x, z):
        return self.b.get((int(math.floor(x / self.cell)), int(math.floor(z / self.cell))), ())
