"""Second landmark pass: the Delaware suspension bridges (decks and outlines) and Memorial Hall.

  tools/.venv/Scripts/python -I tools/phl/extract_bridges.py [pbf] [raw_dir]

Merges into raw_dir/landmarks_osm.json: "bridges": [{name, ways: [{tags, line}]}] for every
highway/railway way whose name or bridge:name is one of BRIDGES, the man_made=bridge outlines
of the same bridges, and building areas named in HALLS.
"""
import json, os, sys

import osmium

HERE = os.path.dirname(os.path.abspath(__file__))
PBF = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "raw", "osm", "pennsylvania.osm.pbf")
RAW = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "raw", "city")
S, W, N, E = 39.85, -75.30, 40.15, -74.94
BRIDGES = {"Benjamin Franklin Bridge", "Ben Franklin Bridge", "Walt Whitman Bridge"}
HALLS = {"Memorial Hall", "Please Touch Museum", "Please Touch Museum at Memorial Hall"}


def canon(n):
    return "Benjamin Franklin Bridge" if "Franklin" in n else n


path = os.path.join(RAW, "landmarks_osm.json")
out = json.load(open(path, encoding="utf-8"))
bridges, outlines, halls = {}, [], []
fp = osmium.FileProcessor(PBF).with_locations().with_areas(osmium.filter.KeyFilter("man_made", "building"))
for o in fp:
    if o.is_area():
        t = dict(o.tags)
        nm = t.get("name", "") or t.get("bridge:name", "")
        if (t.get("man_made") == "bridge" and nm in BRIDGES) or (t.get("building") and t.get("name") in HALLS):
            rings = [[[n.lat, n.lon] for n in r] for r in o.outer_rings()]
            if rings and any(S <= la <= N and W <= lo <= E for la, lo in rings[0]):
                (outlines if t.get("man_made") == "bridge" else halls).append({"name": canon(nm) if t.get("man_made") == "bridge" else t["name"], "tags": t, "rings": rings})
    elif o.is_way():
        t = o.tags
        nm = t.get("bridge:name", "") or t.get("name", "")
        if nm in BRIDGES and (t.get("highway") or t.get("railway")) and t.get("bridge"):
            try:
                line = [[n.lat, n.lon] for n in o.nodes]
            except osmium.InvalidLocationError:
                continue
            bridges.setdefault(canon(nm), []).append({"tags": dict(t), "line": line})
out["bridges"] = [{"name": k, "ways": v} for k, v in bridges.items()]
out["bridge_outlines"] = outlines
out["areas"] += halls
with open(path, "w", encoding="utf-8") as f:
    json.dump(out, f)
print(f"bridges { {k: len(v) for k, v in bridges.items()} }, outlines {len(outlines)}, halls {[h['name'] for h in halls]}")
