"""Pull the outlines of the city's major landmarks out of the Geofabrik extract.

  tools/.venv/Scripts/python -I tools/phl/extract_landmarks.py [pbf] [raw_dir]

Writes raw_dir/landmarks_osm.json: {"areas": [{name, tags, rings: [[[lat, lon], ...]]}],
"bridges": [{name, tags, line: [[lat, lon], ...]}]} for the names in NAMES (stadiums, arena,
halls), the playing fields inside the stadiums, and the Delaware suspension bridges' decks.
"""
import json, os, sys

import osmium

HERE = os.path.dirname(os.path.abspath(__file__))
PBF = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "raw", "osm", "pennsylvania.osm.pbf")
RAW = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "raw", "city")
S, W, N, E = 39.85, -75.30, 40.15, -74.94
NAMES = {"Lincoln Financial Field", "Citizens Bank Park", "Wells Fargo Center", "Xfinity Mobile Arena",
         "Independence Hall", "Memorial Hall", "Liberty Bell Center", "National Constitution Center"}
BRIDGES = {"Benjamin Franklin Bridge", "Walt Whitman Bridge"}
SPORTS = {"baseball", "american_football", "soccer"}

areas, bridges = [], {}
fp = osmium.FileProcessor(PBF).with_locations().with_areas(osmium.filter.KeyFilter("leisure", "building", "name"))
for o in fp:
    if o.is_area():
        tags = dict(o.tags)
        name = tags.get("name", "")
        pitch = tags.get("leisure") == "pitch" and tags.get("sport") in SPORTS
        if not (name in NAMES or tags.get("leisure") == "stadium" or pitch):
            continue
        rings = [[[n.lat, n.lon] for n in r] for r in o.outer_rings()]
        if not rings or not any(S <= la <= N and W <= lo <= E for la, lo in rings[0]):
            continue
        areas.append({"name": name, "tags": tags, "rings": rings})
    elif o.is_way():
        name = o.tags.get("name", "")
        if name in BRIDGES and o.tags.get("highway"):
            try:
                line = [[n.lat, n.lon] for n in o.nodes]
            except osmium.InvalidLocationError:
                continue
            bridges.setdefault(name, []).append({"tags": dict(o.tags), "line": line})
out = {"areas": areas, "bridges": [{"name": k, "ways": v} for k, v in bridges.items()]}
with open(os.path.join(RAW, "landmarks_osm.json"), "w", encoding="utf-8") as f:
    json.dump(out, f)
print(f"{len(areas)} areas ({sum(1 for a in areas if a['name'])} named), bridges: { {k: len(v) for k, v in bridges.items()} }")
