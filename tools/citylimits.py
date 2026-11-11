"""Philadelphia's city limits (OSM relation 188022) and a fast point-inside test."""
import json, os

from geom import area, proj, stitch


class Limits:
    """rings: outer boundary ring(s) in scene metres; inside(x, z) via a scanline raster."""

    def __init__(self, raw_dir, cell=20.0):
        with open(os.path.join(raw_dir, "boundary.json"), encoding="utf-8") as f:
            rel = json.load(f)["elements"][0]
        outer = [[(p["lat"], p["lon"]) for p in m["geometry"]] for m in rel["members"]
                 if m.get("type") == "way" and m.get("role") == "outer"]
        self.rings = [[proj(*p) for p in r] for r in stitch(outer)]
        self.rings.sort(key=lambda r: -abs(area(r)))
        for r in self.rings:
            if area(r) < 0:
                r.reverse()
        xs = [p[0] for r in self.rings for p in r]
        zs = [p[1] for r in self.rings for p in r]
        self.x0, self.x1, self.z0, self.z1 = min(xs), max(xs), min(zs), max(zs)
        self.c, self.ox, self.oz = cell, self.x0 - cell, self.z0 - cell
        self.nz = int((self.z1 - self.z0) / cell) + 3
        self.rows = []
        for j in range(self.nz):
            z = self.oz + (j + .5) * cell
            xs_ = []
            for r in self.rings:
                for i in range(len(r)):
                    (ax, az), (bx, bz) = r[i], r[(i + 1) % len(r)]
                    if (az > z) != (bz > z):
                        xs_.append(ax + (z - az) * (bx - ax) / (bz - az))
            xs_.sort()
            self.rows.append(xs_)

    def inside(self, x, z):
        j = int((z - self.oz) / self.c)
        if not 0 <= j < self.nz:
            return False
        k = 0
        xs_ = self.rows[j]
        while k < len(xs_) and xs_[k] < x:
            k += 1
        return k % 2 == 1
