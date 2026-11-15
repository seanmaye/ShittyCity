"""Kingda Ka's frame and extents, shared by the tools here (and js/cities.ts CITIES.ka.frame)."""
import math

# projection: x metres east, z metres south of a point in the middle of Kingda Ka's layout
# (between the launch track and the brake run, Six Flags Great Adventure, Jackson NJ)
LAT0, LON0, MZ = 40.1400, -74.4350, 111000.0
MX = 111412.84 * math.cos(math.radians(LAT0)) - 93.5 * math.cos(math.radians(3 * LAT0))
MODEL = (-74.456, 40.127, -74.420, 40.150)      # W S E N: everything mapped (the park, its car parks, the woods round it)
# the detailed core (its footprints go in buildings.json, the rest in city_buildings.bin.gz): the park itself
CORE = (-74.4470, 40.1320, -74.4290, 40.1440)
OVERTURE_RELEASE = '2026-10-21.0'
# OpenStreetMap as it was while the ride stood (it closed in November 2024 and came down in early 2025)
OSM_DATE = '2024-06-01T00:00:00Z'


def proj(lat, lon):
    """lat, lon -> (x, z) metres in the scene frame"""
    return ((lon - LON0) * MX, -(lat - LAT0) * MZ)
