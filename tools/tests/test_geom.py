"""tools/phl/geom.py on small cases that can be checked by hand."""
import math

import pytest
from geom import (LAT0, LON0, Grid, area, centroid, clip_line, clip_ring, hull, min_rect, point_in_poly, point_in_ring,
                  proj, seg_dist, simplify, simplify_ring, stitch)

SQUARE = [(0, 0), (2, 0), (2, 2), (0, 2)]
L_SHAPE = [(0, 0), (2, 0), (2, 1), (1, 1), (1, 2), (0, 2)]   # a 2 x 1 bar and a 1 x 1 square on top of its left end
U_SHAPE = [(0, 0), (3, 0), (3, 3), (2, 3), (2, 1), (1, 1), (1, 3), (0, 3)]   # concave: a notch 1..2 x 1..3


def test_proj():
    assert proj(LAT0, LON0) == (0, 0)
    x, z = proj(LAT0 - 0.001, LON0 + 0.001)   # south-east of the origin: x east, z south
    assert x == pytest.approx(85.39) and z == pytest.approx(111.0)


def test_area_is_signed():
    assert area(SQUARE) == 4
    assert area(SQUARE[::-1]) == -4
    assert area(L_SHAPE) == 3


def test_centroid():
    assert centroid([(1, 1), (3, 1), (3, 3), (1, 3)]) == pytest.approx((2, 2))
    # the bar (area 2, centre 1, .5) and the square (area 1, centre .5, 1.5): 2.5 / 3 each way
    assert centroid(L_SHAPE) == pytest.approx((2.5 / 3, 2.5 / 3))
    assert centroid([(0, 0), (1, 0), (2, 0)]) == pytest.approx((1, 0))   # no area: the mean of the points


def test_seg_dist():
    assert seg_dist((1, 1), (0, 0), (2, 0)) == 1
    assert seg_dist((5, 0), (0, 0), (2, 0)) == 3   # past the end: to the end point
    assert seg_dist((3, 4), (0, 0), (0, 0)) == 5   # a zero-length segment


def test_simplify_keeps_endpoints():
    assert simplify([(0, 0), (1, 0), (2, 0), (3, 0)], .1) == [(0, 0), (3, 0)]
    assert simplify([(0, 0), (1, .01), (2, 0), (3, 5), (4, 0)], .1) == [(0, 0), (2, 0), (3, 5), (4, 0)]
    assert simplify([(0, 0), (5, 5)], 1) == [(0, 0), (5, 5)]


def test_simplify_ring():
    ring = [(0, 0), (1, 0), (2, 0), (2, 1), (2, 2), (1, 2), (0, 2), (0, 1)]   # a square with a point mid-edge
    assert simplify_ring(ring, .1) == SQUARE
    assert simplify_ring(SQUARE[:3], 10) == SQUARE[:3]   # under four points: as it is


@pytest.mark.parametrize("pt, inside", [
    ((.5, 2), True), ((2.5, 2), True), ((1.5, .5), True),   # both arms and the base
    ((1.5, 2), False), ((1.5, 3.5), False), ((4, 1), False), ((-1, 1), False),   # the notch, above it, either side
])
def test_point_in_ring_concave(pt, inside):
    assert point_in_ring(*pt, U_SHAPE) is inside


def test_point_in_ring_on_the_edge():
    # the crossing test is half-open: a point on a low (min x or min z) edge is inside, one on a high edge is not
    assert [point_in_ring(x, z, SQUARE) for x, z in [(0, 1), (1, 0), (2, 1), (1, 2)]] == [True, True, False, False]


def test_point_in_poly_with_a_hole():
    rings = [[(0, 0), (4, 0), (4, 4), (0, 4)], [(1, 1), (3, 1), (3, 3), (1, 3)]]
    assert point_in_poly(.5, .5, rings)
    assert not point_in_poly(2, 2, rings)
    assert not point_in_poly(5, 5, rings)


def test_hull():
    # duplicates, an interior point and a point on an edge all drop out; counter-clockwise from the lowest point
    assert hull([(0, 0), (2, 0), (2, 2), (0, 2), (1, 1), (1, 0), (0, 0)]) == SQUARE
    assert hull([(0, 0), (1, 1)]) == [(0, 0), (1, 1)]


def test_min_rect_of_a_rotated_rectangle():
    cx, cz, ry, w, d = 10, -5, .5, 4, 2
    ux, uz, vx, vz = math.cos(ry), -math.sin(ry), math.sin(ry), math.cos(ry)   # three.js rotation.y: local x and z
    corners = [(cx + a * w / 2 * ux + b * d / 2 * vx, cz + a * w / 2 * uz + b * d / 2 * vz) for a, b in [(-1, -1), (1, -1), (1, 1), (-1, 1)]]
    got = min_rect(corners)
    assert got == pytest.approx((cx, cz, w, d, ry))


def test_min_rect_box_covers_the_points():
    pts = [(0, 0), (6, 0), (6, 1), (0, 1), (3, .5)]
    cx, cz, w, d, ry = min_rect(pts)
    assert (cx, cz) == pytest.approx((3, .5))
    assert w * d == pytest.approx(6)
    assert sorted((w, d)) == pytest.approx([1, 6])


def test_clip_ring_to_a_rectangle():
    sq = [(0, 0), (4, 0), (4, 4), (0, 4)]
    got = clip_ring(sq, 2, 1, 6, 3)
    assert sorted(got) == [(2, 1), (2, 3), (4, 1), (4, 3)]
    assert area(got) == 4
    assert clip_ring(sq, 5, 5, 6, 6) == []      # wholly outside
    assert sorted(clip_ring(sq, -1, -1, 5, 5)) == sorted(sq)   # wholly inside


def test_clip_line():
    assert clip_line([(-1, 1), (5, 1)], 0, 0, 4, 4) == [[(0, 1), (4, 1)]]
    # out through the top edge and back in: two pieces
    assert clip_line([(1, 1), (1, 5), (3, 5), (3, 1)], 0, 0, 4, 4) == [[(1, 1), (1, 4)], [(3, 4), (3, 1)]]
    assert clip_line([(5, 5), (6, 6)], 0, 0, 4, 4) == []


def test_stitch():
    # three ways of a triangle, one of them reversed: one ring, without the closing point repeated
    rings = stitch([[(0, 0), (1, 0)], [(1, 1), (1, 0)], [(1, 1), (0, 0)]])
    assert len(rings) == 1 and sorted(rings[0]) == [(0, 0), (1, 0), (1, 1)]
    assert stitch([[(0, 0), (1, 0)], [(1, 0), (1, 1)]]) == []   # does not close
    assert stitch([[(0, 0)]]) == []


def test_grid():
    g = Grid(10)
    g.add("a", 5, 5, 25, 15)
    assert g.near(6, 6) == ["a"]
    assert g.near(29, 19) == ["a"]   # the same cells as the box's corners
    assert g.near(35, 5) == ()
    assert g.near(-1, 5) == ()
