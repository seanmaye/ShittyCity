"""tools/phl/citylimits.py. Its input, tools/phl/raw/city/boundary.json (OSM relation 188022), is a download that is
not in git, so each test writes one in Overpass's format: a small hand-made boundary, and one from the city limits
committed in data/phl/city.json.gz (the same boundary, simplified to 0.2 m; read only)."""
import gzip, json, os

import pytest
from citylimits import Limits
from geom import LAT0, LON0, MX, MZ, area, point_in_ring, seg_dist

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")


def unproj(x, z):
    return {"lat": LAT0 - z / MZ, "lon": LON0 + x / MX}


def write_boundary(d, ways, extra=()):
    """ways: open polylines in scene metres, the relation's outer members."""
    members = [{"type": "way", "role": "outer", "geometry": [unproj(*p) for p in w]} for w in ways] + list(extra)
    with open(os.path.join(d, "boundary.json"), "w", encoding="utf-8") as f:
        json.dump({"elements": [{"type": "relation", "id": 188022, "members": members}]}, f)
    return str(d)


# a U in scene metres, 0..600 x 0..600 with a notch 200..400 x 0..400 open to the north (low z), as three ways
U = [(0, 0), (200, 0), (200, 400), (400, 400), (400, 0), (600, 0), (600, 600), (0, 600)]


@pytest.fixture
def u_limits(tmp_path):
    ways = [U[0:4], U[3:7][::-1], U[6:] + [U[0]]]   # the middle one runs backwards
    noise = [{"type": "node", "role": "admin_centre", "lat": LAT0, "lon": LON0},
             {"type": "way", "role": "inner", "geometry": [unproj(*p) for p in [(50, 50), (60, 50), (60, 60), (50, 50)]]}]
    return Limits(write_boundary(tmp_path, ways, noise))


def test_rings_and_bounds(u_limits):
    assert len(u_limits.rings) == 1
    r = u_limits.rings[0]
    assert len(r) == len(U)
    assert area(r) == pytest.approx(600 * 600 - 200 * 400)   # counter-clockwise whatever the ways' order
    assert (u_limits.x0, u_limits.x1, u_limits.z0, u_limits.z1) == pytest.approx((0, 600, 0, 600))


@pytest.mark.parametrize("x, z, inside", [
    (100, 100, True), (500, 100, True), (300, 500, True),   # both arms and the base
    (300, 100, False), (300, 390, False),                   # in the notch
    (-50, 300, False), (650, 300, False), (300, -50, False), (300, 650, False),
    (300, 5000, False), (300, -5000, False),                 # past the rows of the raster
])
def test_inside_hand_made(u_limits, x, z, inside):
    assert u_limits.inside(x, z) is inside


def test_inside_agrees_with_the_committed_limits(tmp_path):
    with gzip.open(os.path.join(ROOT, "data", "phl", "city.json.gz"), "rt", encoding="utf-8") as f:
        flat = json.load(f)["limits"][0]
    ring = [(flat[k] / 10, flat[k + 1] / 10) for k in range(0, len(flat), 2)]
    n, closed = len(ring), ring + ring[:1]
    cuts = [0, n // 3, 2 * n // 3, n]
    ways = [closed[a:b + 1] for a, b in zip(cuts, cuts[1:])]   # three ways that share their end points
    ways[1] = ways[1][::-1]
    lim = Limits(write_boundary(tmp_path, ways))
    assert len(lim.rings) == 1 and len(lim.rings[0]) == n
    assert area(lim.rings[0]) == pytest.approx(abs(area(ring)), rel=1e-9)
    assert lim.inside(0, 0)                  # the scene's origin
    assert not lim.inside(-40000, 0)         # 40 km west
    checked = 0
    for x in range(int(lim.x0) - 500, int(lim.x1) + 500, 900):
        for z in range(int(lim.z0) - 500, int(lim.z1) + 500, 900):
            # the raster samples each 20 m row at its middle: away from the boundary it is exact
            if min(seg_dist((x, z), ring[i], ring[i - 1]) for i in range(n)) < 3 * lim.c:
                continue
            assert lim.inside(x, z) == point_in_ring(x, z, ring), (x, z)
            checked += 1
    assert checked > 500
