"""Philadelphia's terrain: the 3DEP bare-earth elevation resampled onto the scene's grid.

  python -I tools/phl/build_terrain.py [raw_dir] [cell_m]

Reads raw_dir/dem/*.tif (tools/phl/fetch_dem.py) and the water the scene draws (data/phl/city.json.gz
and river.json), and writes data/phl/terrain.bin.gz (gzip binary "TER1", little endian):
  int32 x0_dm, z0_dm   the grid's first sample (scene frame; x east, z south)
  int32 cell_dm, W, H  spacing and size (samples, row by row from x0, z0)
  int16 ground[W*H]    ground height, decimetres above NAVD88; under rivers and lakes the bed
                       (the water surface less up to 2.5 m, shelving from the bank)
  int16 water[W*H]     water surface less ground (decimetres): the water level in water and on
                       the land next to it (so draped water meets the banks), 0 elsewhere
Each row of both grids is delta-coded (first value, then differences) before gzip.
The rivers in 3DEP are hydro-flattened, so the water levels are real: the tidal Delaware and
lower Schuylkill near 0 m, the pools above the Fairmount and Flat Rock dams higher.
"""
import array, gzip, json, math, os, struct, sys
from collections import deque

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
RAW = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "raw")
CELL = float(sys.argv[2]) if len(sys.argv) > 2 else 10.0
LAT0, LON0, MX, MZ = 39.9560, -75.1760, 85390.0, 111000.0
BED, SHELF = 2.5, 3   # m below the water surface, reached this many cells out from the bank
NEAR = 12             # cells of land next to water that carry the water level

# ---- the GeoTIFFs (uncompressed, tiled or striped float32, geographic lat/lon)
def read_tiff(path):
    b = open(path, "rb").read()
    bo = "<" if b[:2] == b"II" else ">"
    off = struct.unpack(bo + "I", b[4:8])[0]; n = struct.unpack(bo + "H", b[off:off + 2])[0]
    size = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 11: 4, 12: 8, 16: 8}; fmt = {3: "H", 4: "I", 11: "f", 12: "d", 16: "Q"}
    tags = {}
    for i in range(n):
        e = b[off + 2 + i * 12: off + 14 + i * 12]
        tag, typ, cnt = struct.unpack(bo + "HHI", e[:8])
        sz = size.get(typ, 1) * cnt
        raw = e[8:8 + sz] if sz <= 4 else b[struct.unpack(bo + "I", e[8:12])[0]:][:sz]
        tags[tag] = struct.unpack(bo + fmt[typ] * cnt, raw) if typ in fmt else raw
    W, H = tags[256][0], tags[257][0]
    assert tags[259][0] == 1 and tags[258][0] == 32 and tags[339][0] == 3, "expected uncompressed float32"
    out = array.array("f", bytes(W * H * 4))
    if 322 in tags:   # tiled
        tw, th = tags[322][0], tags[323][0]; across = math.ceil(W / tw)
        for k, (o, c) in enumerate(zip(tags[324], tags[325])):
            t = array.array("f", b[o:o + c]); tx, ty = (k % across) * tw, (k // across) * th
            if bo == ">": t.byteswap()
            for r in range(th):
                y = ty + r
                if y >= H: break
                w = min(tw, W - tx); out[y * W + tx: y * W + tx + w] = t[r * tw: r * tw + w]
    else:             # striped
        rows = tags[278][0]; pos = 0
        for o, c in zip(tags[273], tags[279]):
            t = array.array("f", b[o:o + c])
            if bo == ">": t.byteswap()
            out[pos:pos + len(t)] = t; pos += len(t)
    sx, sy = tags[33550][0], tags[33550][1]; lon0, lat0 = tags[33922][3], tags[33922][4]
    return {"W": W, "H": H, "lon0": lon0, "lat0": lat0, "dx": sx, "dy": sy, "z": out}

dems = [read_tiff(os.path.join(RAW, "dem", f)) for f in sorted(os.listdir(os.path.join(RAW, "dem"))) if f.endswith(".tif")]
print(f"  {len(dems)} DEM tiles")

def dem_at(lon, lat):
    """bilinear elevation at a point (pixel-is-area: centres at +0.5), or None"""
    for d in dems:
        fx = (lon - d["lon0"]) / d["dx"] - .5; fy = (d["lat0"] - lat) / d["dy"] - .5
        if -.5 <= fx <= d["W"] - .5 and -.5 <= fy <= d["H"] - .5:
            ix = min(max(int(math.floor(fx)), 0), d["W"] - 2); iy = min(max(int(math.floor(fy)), 0), d["H"] - 2)
            tx = min(max(fx - ix, 0), 1); ty = min(max(fy - iy, 0), 1); W = d["W"]; z = d["z"]
            a, b, c, e = z[iy * W + ix], z[iy * W + ix + 1], z[(iy + 1) * W + ix], z[(iy + 1) * W + ix + 1]
            if min(a, b, c, e) < -1000: continue   # no data here: try another tile
            return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + e * tx) * ty
    return None

# ---- the scene grid
city = json.load(gzip.open(os.path.join(ROOT, "data", "phl", "city.json.gz"), "rt", encoding="utf-8"))
river = json.load(open(os.path.join(ROOT, "data", "phl", "river.json"), encoding="utf-8"))
bx0, bz0, bx1, bz1 = [v / 10 for v in city["bbox"]]
X0, Z0 = math.floor((bx0 - 200) / CELL) * CELL, math.floor((bz0 - 200) / CELL) * CELL
W, H = int((bx1 + 200 - X0) / CELL) + 1, int((bz1 + 200 - Z0) / CELL) + 1
print(f"  grid {W} x {H} at {CELL} m")
G = array.array("f", bytes(W * H * 4))
missing = 0
for j in range(H):
    lat = LAT0 - (Z0 + j * CELL) / MZ
    for i in range(W):
        v = dem_at(LON0 + (X0 + i * CELL) / MX, lat)
        if v is None: missing += 1; v = -9999.0
        G[j * W + i] = v
if missing: print(f"  {missing} samples without data: filled from neighbours")
# fill any holes from the nearest sample with data
if missing:
    q = deque(c for c in range(W * H) if G[c] > -1000)
    while q:
        c = q.popleft(); i, j = c % W, c // W
        for n in (c - 1 if i else -1, c + 1 if i < W - 1 else -1, c - W, c + W):
            if 0 <= n < W * H and G[n] < -1000: G[n] = G[c]; q.append(n)

# ---- water: rasterise the water the scene draws (even-odd per polygon, cell centres)
flat = lambda f: [(f[k] / 10, f[k + 1] / 10) for k in range(0, len(f), 2)]  # noqa: E731
wet = bytearray(W * H)
for poly in city["water"] + river["water"]:
    rows = {}
    for r in (flat(x) for x in poly):
        for k in range(len(r)):
            (ax, az), (bx, bz) = r[k], r[(k + 1) % len(r)]
            if az == bz: continue
            lo, hi = min(az, bz), max(az, bz)
            for j in range(max(0, math.ceil((lo - Z0) / CELL)), min(H - 1, math.floor((hi - Z0) / CELL)) + 1):
                z = Z0 + j * CELL
                if lo <= z < hi: rows.setdefault(j, []).append(ax + (bx - ax) * (z - az) / (bz - az))
    for j, xs in rows.items():
        xs.sort()
        for k in range(0, len(xs) - 1, 2):
            for i in range(max(0, math.ceil((xs[k] - X0) / CELL)), min(W - 1, math.floor((xs[k + 1] - X0) / CELL)) + 1):
                wet[j * W + i] ^= 1
print(f"  water cells {sum(wet)}")

# distance (cells) from the bank inside the water, breadth first
def spread(seeds, limit):
    d = {c: 0 for c in seeds}; q = deque(seeds)
    while q:
        c = q.popleft(); i, j = c % W, c // W
        for n in ((c - 1) if i else None, (c + 1) if i < W - 1 else None, (c - W) if j else None, (c + W) if j < H - 1 else None):
            if n is not None and n not in d and wet[n] and d[c] < limit:
                d[n] = d[c] + 1; q.append(n)
    return d
src = {}
shore_w = [c for c in range(W * H) if wet[c] and any(not wet[n] for n in ((c - 1) if c % W else c, (c + 1) if c % W < W - 1 else c, max(c - W, 0), min(c + W, W * H - 1)))]
shore_l = [c for c in range(W * H) if not wet[c] and any(wet[n] for n in ((c - 1) if c % W else c, (c + 1) if c % W < W - 1 else c, max(c - W, 0), min(c + W, W * H - 1)))]
din = spread(shore_w, SHELF)
# the water level of each water cell is the DEM there (hydro-flattened); land near water takes the
# level of the nearest water cell
level = {c: G[c] for c in range(W * H) if wet[c]}
for c in shore_l:
    i, j = c % W, c // W
    nb = [n for n in ((c - 1) if i else None, (c + 1) if i < W - 1 else None, (c - W) if j else None, (c + W) if j < H - 1 else None) if n is not None and wet[n]]
    src[c] = min(level[n] for n in nb)
dout = {c: 0 for c in shore_l}; q = deque(shore_l)
while q:
    c = q.popleft(); i, j = c % W, c // W
    for n in ((c - 1) if i else None, (c + 1) if i < W - 1 else None, (c - W) if j else None, (c + W) if j < H - 1 else None):
        if n is not None and not wet[n] and n not in dout and dout[c] < NEAR:
            dout[n] = dout[c] + 1; src[n] = src[c]; q.append(n)

Wd = array.array("f", bytes(W * H * 4))   # water surface less ground
for c, lv in level.items():
    bed = min(BED, .6 + (BED - .6) * din.get(c, SHELF) / SHELF)   # shelving from the bank
    G[c] = lv - bed; Wd[c] = bed
for c in dout:
    Wd[c] = src[c] - G[c]    # usually negative: the bank stands above the water

# ---- write: int16 decimetres, rows delta-coded, gzip
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
path = os.path.join(ROOT, "data", "phl", "terrain.bin.gz")
with gzip.open(path, "wb", compresslevel=9) as f:
    f.write(head + pack(G) + pack(Wd))
lo, hi = min(G), max(G)
print(f"  ground {lo:.1f} to {hi:.1f} m; wrote data/phl/terrain.bin.gz ({os.path.getsize(path) / 1e6:.1f} MB)")
