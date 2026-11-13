"""New Orleans's frame and extents, shared by fetch_nola.py and build_nola.py (and js/cities.js CITIES.nola.frame)."""
import math

# projection: x metres east, z metres south of Canal & Royal (the French Quarter)
LAT0, LON0, MZ = 29.9555, -90.0665, 111000.0
MX = 111412.84 * math.cos(math.radians(LAT0)) - 93.5 * math.cos(math.radians(3 * LAT0))
MODEL = (-90.125, 29.915, -89.975, 30.000)      # W S E N: everything mapped
HALF, CELL = 10000, 40                            # terrain grid: +-10 km around the origin, 40 m cells
TERRAIN = (LON0 - (HALF + 400) / MX, LAT0 - (HALF + 400) / MZ, LON0 + (HALF + 400) / MX, LAT0 + (HALF + 400) / MZ)
OVERTURE_RELEASE = '2026-10-21.0'
# the detailed core (its footprints go in buildings.json, the rest in city_buildings.bin.gz):
# the French Quarter, the CBD, the Marigny, the Bywater and the Garden District
CORE = (-90.080, 29.930, -90.045, 29.965)
