"""Jersey Shore's frame and extents, shared by fetch_jsh.py and build_jsh.py (and js/cities.js CITIES.jsh.frame)."""
import math

# projection: x metres east, z metres south of Allegheny & Main
LAT0, LON0, MZ = 41.2025, -77.2536, 111000.0
MX = 111412.84 * math.cos(math.radians(LAT0)) - 93.5 * math.cos(math.radians(3 * LAT0))
MODEL = (-77.315, 41.180, -77.225, 41.225)      # W S E N: everything mapped
HALF, CELL = 10000, 40                            # terrain grid: +-10 km around the origin, 40 m cells
TERRAIN = (LON0 - (HALF + 400) / MX, LAT0 - (HALF + 400) / MZ, LON0 + (HALF + 400) / MX, LAT0 + (HALF + 400) / MZ)
OVERTURE_RELEASE = '2026-10-21.0'
BOROUGH = 188746                                  # OSM relation: Jersey Shore borough boundary
