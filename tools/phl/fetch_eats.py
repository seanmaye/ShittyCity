"""Download OpenStreetMap's named food and drink places in and around Philadelphia, to check
the djour map's coordinates against (build_restaurants.py). One Overpass query, written to
tools/phl/raw/djour/osm_eats.json. Run: python -I tools/phl/fetch_eats.py"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch_city import overpass  # noqa: E402

# the city's bounding box plus a little (south, west, north, east)
BBOX = "39.86,-75.29,40.14,-74.95"
TAGS = [
    '["amenity"~"^(restaurant|cafe|bar|pub|fast_food|ice_cream|biergarten|food_court|marketplace)$"]',
    '["shop"~"^(bakery|deli|pastry|confectionery|coffee|butcher|cheese|chocolate|seafood)$"]',
    '["craft"~"^(brewery|winery|distillery)$"]',
]

def fetch_places():
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "raw", "djour", "osm_eats.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    parts = "".join(f"nwr{t}[name]({BBOX});" for t in TAGS)
    overpass(f"[out:json][timeout:300];({parts});out center tags;", out)
    print(out, os.path.getsize(out) // 1024, "KB")


def fetch_addresses():
    """the street addresses the restaurant research found (restaurant_looks.json), as OSM objects
    carrying that house number and street: tools/phl/raw/djour/osm_addr.json"""
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, "restaurant_looks.json"), encoding="utf-8") as f:
        looks = json.load(f)["places"]
    parts = ""
    for p in looks:
        if p.get("address"):
            num, street = p["address"].split(" ", 1)
            parts += f'nwr["addr:housenumber"="{num}"]["addr:street"="{street}"]({BBOX});'
    out = os.path.join(here, "raw", "djour", "osm_addr.json")
    overpass(f"[out:json][timeout:120];({parts});out center tags;", out)
    print(out, os.path.getsize(out) // 1024, "KB")


if __name__ == "__main__":
    fetch_places()
    fetch_addresses()
