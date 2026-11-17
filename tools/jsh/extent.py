"""Jersey Shore's frame and extents, shared by fetch_jsh.py and build_jsh.py (and js/cities.ts CITIES.jsh.frame)."""
import math

# projection: x metres east, z metres south of Allegheny & Main
LAT0, LON0, MZ = 41.2025, -77.2536, 111000.0
MX = 111412.84 * math.cos(math.radians(LAT0)) - 93.5 * math.cos(math.radians(3 * LAT0))
# W S E N: everything mapped, about 12.7 by 18.9 km: west past Avis and South Avis, up Larrys Creek
# to Salladasburg, east past Antes Fort to Level Corner, and over Bald Eagle Mountain through the
# Antes Creek gap to Oriole and Rauchtown in Nippenose Valley
MODEL = (-77.335, 41.120, -77.183, 41.290)
# the borough's own stretch of the valley (the first mapped area): the seed corn and the Corn
# fields view stay in it, on the island, however much farmland the wider model takes in
TOWN = (-77.315, 41.180, -77.225, 41.225)
HALF, CELL = 12000, 40                            # terrain grid: +-12 km around the origin, 40 m cells
TERRAIN = (LON0 - (HALF + 400) / MX, LAT0 - (HALF + 400) / MZ, LON0 + (HALF + 400) / MX, LAT0 + (HALF + 400) / MZ)
OVERTURE_RELEASE = '2026-10-21.0'
BOROUGH = 188746                                  # OSM relation: Jersey Shore borough boundary
