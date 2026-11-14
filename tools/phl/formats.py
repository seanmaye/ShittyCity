"""The binary files the scene reads, packed as the builders write them (not gzipped). No side effects at import,
so tools/tests can check them against the JavaScript readers.

  pack_phb1   city_buildings.bin (layout in build_city.py), read by decode() in js/scene/city.js
  pack_ter1   terrain.bin (layout in build_terrain.py), read by setTerrain() in js/scene/terrain.js
"""
import array, math, struct, sys


def dm(v):
    return int(round(v * 10))


def deltas(vals):
    out, prev = [], 0
    for v in vals:
        out.append(v - prev)
        prev = v
    return out


def pack_phb1(boxes, polys):
    """boxes: (x, z, w, d, ry, h, kind) in metres, ry in radians (0..pi); polys: (ring [(x, z), ...], h, kind).
    Written in the order given (build_city.py sorts them by tile first)."""
    bx_i = deltas([dm(b[0]) for b in boxes])
    bz_i = deltas([dm(b[1]) for b in boxes])
    pv_x, pv_z, pv_n, pv_h, pv_k = [], [], [], [], []
    for r, h, k in polys:
        xs_ = [dm(p[0]) for p in r]
        zs_ = [dm(p[1]) for p in r]
        pv_x += [xs_[0]] + [xs_[i] - xs_[i - 1] for i in range(1, len(xs_))]
        pv_z += [zs_[0]] + [zs_[i] - zs_[i - 1] for i in range(1, len(zs_))]
        pv_n.append(len(r))
        pv_h.append(min(65535, dm(h)))
        pv_k.append(k)
    u16 = lambda v: max(0, min(65535, int(round(v))))  # noqa: E731
    return b"".join([
        b"PHB1", struct.pack("<III", len(boxes), len(polys), len(pv_x)),
        struct.pack(f"<{len(bx_i)}i", *bx_i), struct.pack(f"<{len(bz_i)}i", *bz_i),
        struct.pack(f"<{len(pv_x)}i", *pv_x), struct.pack(f"<{len(pv_z)}i", *pv_z),
        struct.pack(f"<{len(boxes)}H", *[u16(b[2] * 10) for b in boxes]),
        struct.pack(f"<{len(boxes)}H", *[u16(b[3] * 10) for b in boxes]),
        struct.pack(f"<{len(boxes)}H", *[u16(b[4] / math.pi * 65535) for b in boxes]),
        struct.pack(f"<{len(boxes)}H", *[u16(b[5] * 10) for b in boxes]),
        struct.pack(f"<{len(pv_n)}H", *pv_n), struct.pack(f"<{len(pv_h)}H", *pv_h),
        bytes(b[6] for b in boxes), bytes(pv_k),
    ])


def pack_ter1(X0, Z0, CELL, W, H, G, Wd):
    """The grid's first sample (X0, Z0) and spacing CELL in metres, W x H samples; G ground and Wd water surface
    less ground, in metres, row by row (W * H values each)."""
    def pack(a):
        out = array.array("h", bytes(W * H * 2))
        for j in range(H):
            prev = 0
            for i in range(W):
                v = max(-32767, min(32767, int(round(a[j * W + i] * 10))))
                out[j * W + i] = v - prev; prev = v
        if sys.byteorder == "big": out.byteswap()
        return out.tobytes()
    head = b"TER1" + struct.pack("<5i", round(X0 * 10), round(Z0 * 10), round(CELL * 10), W, H)
    return head + pack(G) + pack(Wd)
