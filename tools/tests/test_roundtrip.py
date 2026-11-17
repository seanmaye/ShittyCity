"""The PHB1 and TER1 writers (tools/phl/formats.py) against the JavaScript readers and the committed data.

- test/fixtures/phb1.bin and ter1.bin are what the writers make of test/fixtures/roundtrip.json, and
  test/roundtrip.test.js reads them with the app's own decode() and setTerrain(). A writer change that alters the
  bytes fails here until the fixtures are written again, with
      WRITE_FIXTURES=1 uv run pytest tools/tests/test_roundtrip.py
  after which the JavaScript test must pass on them too.
- Decoding the committed Philadelphia files and packing the values again gives the same bytes: the writers in
  formats.py still write what build_city.py and build_terrain.py wrote.
"""
import array, gzip, json, math, os, struct, sys
from itertools import accumulate

import pytest
from formats import pack_phb1, pack_ter1

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
FIXTURES = os.path.join(ROOT, "test", "fixtures")


def read_phb1(b):
    """city_buildings.bin -> (boxes, polys) as pack_phb1 takes them, in file order."""
    assert b[:4] == b"PHB1"
    nB, nP, nV = struct.unpack_from("<3I", b, 4)
    o = 16

    def take(fmt, n):
        nonlocal o
        v = struct.unpack_from(f"<{n}{fmt}", b, o)
        o += n * struct.calcsize(fmt)
        return v
    bx, bz, vx, vz = take("i", nB), take("i", nB), take("i", nV), take("i", nV)
    bw, bd, br, bh, pn, ph = take("H", nB), take("H", nB), take("H", nB), take("H", nB), take("H", nP), take("H", nP)
    bk, pk = take("B", nB), take("B", nP)
    assert o == len(b) and sum(pn) == nV
    boxes = [(x / 10, z / 10, w / 10, d / 10, r / 65535 * math.pi, h / 10, k)
             for x, z, w, d, r, h, k in zip(accumulate(bx), accumulate(bz), bw, bd, br, bh, bk)]
    polys, v = [], 0
    for n, h, k in zip(pn, ph, pk):   # each outline's first vertex is absolute, the rest deltas
        polys.append(([(x / 10, z / 10) for x, z in zip(accumulate(vx[v:v + n]), accumulate(vz[v:v + n]))], h / 10, k))
        v += n
    return boxes, polys


def read_ter1(b):
    """terrain.bin -> (X0, Z0, CELL, W, H, ground, water) as pack_ter1 takes them."""
    assert b[:4] == b"TER1"
    x0, z0, cell, W, H = struct.unpack_from("<5i", b, 4)
    assert len(b) == 24 + 2 * W * H * 2
    grids = []
    for off in (24, 24 + W * H * 2):
        a = array.array("h", b[off:off + W * H * 2])
        if sys.byteorder == "big": a.byteswap()
        grids.append(array.array("d", (v / 10 for j in range(H) for v in accumulate(a[j * W:(j + 1) * W]))))   # rows delta-coded
    return x0 / 10, z0 / 10, cell / 10, W, H, *grids


def first_difference(got, want):
    if got == want:
        return None
    i = next((k for k in range(min(len(got), len(want))) if got[k] != want[k]), min(len(got), len(want)))
    return f"{len(got)} bytes against {len(want)}; they first differ at byte {i}"


def spec():
    with open(os.path.join(FIXTURES, "roundtrip.json"), encoding="utf-8") as f:
        return json.load(f)


def packed(s):
    p, t = s["phb1"], s["ter1"]
    return {
        "phb1.bin": pack_phb1([(b["x"], b["z"], b["w"], b["d"], b["ry"], b["h"], b["kind"]) for b in p["boxes"]],
                              [([tuple(q) for q in r["ring"]], r["h"], r["kind"]) for r in p["polys"]]),
        "ter1.bin": pack_ter1(t["x0"], t["z0"], t["cell"], t["W"], t["H"], t["ground"], t["water"]),
    }


@pytest.mark.parametrize("name", ["phb1.bin", "ter1.bin"])
def test_fixture_is_the_writers_output(name):
    got, path = packed(spec())[name], os.path.join(FIXTURES, name)
    if os.environ.get("WRITE_FIXTURES"):
        with open(path, "wb") as f:
            f.write(got)
    with open(path, "rb") as f:
        assert first_difference(got, f.read()) is None, f"{name} is not what the writer makes of roundtrip.json (WRITE_FIXTURES=1 rewrites it)"


def test_phb1_fixture_reads_back():
    s = spec()["phb1"]
    with open(os.path.join(FIXTURES, "phb1.bin"), "rb") as f:
        boxes, polys = read_phb1(f.read())
    assert [b[:4] + b[5:] for b in boxes] == [(b["x"], b["z"], b["w"], b["d"], b["h"], b["kind"]) for b in s["boxes"]]
    assert [b[4] for b in boxes] == pytest.approx([b["ry"] for b in s["boxes"]], abs=math.pi / 65535 / 2)   # 0..65535 = 0..pi
    assert [(r, h, k) for r, h, k in polys] == [([tuple(q) for q in r["ring"]], r["h"], r["kind"]) for r in s["polys"]]


def test_ter1_fixture_reads_back():
    t = spec()["ter1"]
    with open(os.path.join(FIXTURES, "ter1.bin"), "rb") as f:
        X0, Z0, CELL, W, H, G, Wd = read_ter1(f.read())
    assert (X0, Z0, CELL, W, H) == (t["x0"], t["z0"], t["cell"], t["W"], t["H"])
    assert list(G) == t["ground"] and list(Wd) == t["water"]


def gunzip(path):
    with gzip.open(os.path.join(ROOT, path), "rb") as f:
        return f.read()


def test_reencode_phl_buildings():
    b = gunzip("data/phl/city_buildings.bin.gz")
    assert first_difference(pack_phb1(*read_phb1(b)), b) is None


def test_reencode_phl_terrain():
    b = gunzip("data/phl/terrain.bin.gz")
    assert first_difference(pack_ter1(*read_ter1(b)), b) is None
