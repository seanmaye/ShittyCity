"""Cut the city's OpenStreetMap data out of a Geofabrik extract (no Overpass needed).

  tools/.venv/Scripts/python tools/phl/extract_osm.py [pbf] [raw_dir]

Needs pyosmium (`python -m venv tools/.venv` then `tools/.venv/Scripts/pip install osmium`).
pbf defaults to tools/phl/raw/osm/pennsylvania.osm.pbf
(https://download.geofabrik.de/north-america/us/pennsylvania-latest.osm.pbf).

Writes the same Overpass-style JSON that fetch_city.py would, into raw_dir (tools/phl/raw/city):
  tiles/tile_all.json   ways: streets, rail, waterways, land use, water (with geometry)
  areas.json            multipolygon relations for parks, water and woods (member geometry)
  transit.json          rail transit route relations + route masters, their member ways (tags +
                        geometry) and stop nodes, plus stations, entrances and platforms nearby
"""
import json, os, re, sys, time

import osmium

HERE = os.path.dirname(os.path.abspath(__file__))
PBF = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "raw", "osm", "pennsylvania.osm.pbf")
RAW = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "raw", "city")
S, W, N, E = 39.8560, -75.2910, 40.1490, -74.9450      # city limits, padded ~1 km
TS, TW, TN, TE = 39.80, -75.40, 40.20, -74.85           # transit: a little further out

WAY_RULES = [
    ("highway", None), ("railway", re.compile(r"^(rail|light_rail|subway|tram|platform)$")),
    ("waterway", re.compile(r"^(river|stream|canal|dam|weir|riverbank)$")),
    ("natural", re.compile(r"^(water|wood|scrub|grassland)$")),
    ("leisure", re.compile(r"^(park|garden|pitch|playground|golf_course|nature_reserve)$")),
    ("landuse", re.compile(r"^(grass|recreation_ground|cemetery|forest|meadow)$")),
    ("public_transport", re.compile(r"^platform$")),
]
AREA_RULES = [("natural", re.compile(r"^(water|wood|scrub)$")), ("waterway", re.compile(r"^riverbank$")),
              ("leisure", re.compile(r"^(park|garden|golf_course|nature_reserve)$")),
              ("landuse", re.compile(r"^(grass|recreation_ground|cemetery|forest|meadow)$"))]
ROUTES = re.compile(r"^(subway|light_rail|tram|train)$")


def match(tags, rules):
    for k, rx in rules:
        v = tags.get(k)
        if v is not None and (rx is None or rx.match(v)):
            return True
    return False


def in_box(lat, lon, box):
    s, w, n, e = box
    return s <= lat <= n and w <= lon <= e


t0 = time.time()
print("pass 1: relations", flush=True)
areas, routes, masters = {}, {}, {}
need_ways, need_nodes = set(), set()
for r in osmium.FileProcessor(PBF, osmium.osm.RELATION):
    tags = dict(r.tags)
    if tags.get("type") in ("multipolygon", "boundary") and match(tags, AREA_RULES):
        mem = [(m.ref, m.role) for m in r.members if m.type == "w"]
        areas[r.id] = (tags, mem)
        need_ways.update(ref for ref, _ in mem)
    elif tags.get("type") == "route" and ROUTES.match(tags.get("route", "")):
        mem = [(m.type, m.ref, m.role) for m in r.members]
        routes[r.id] = (tags, mem)
        need_ways.update(ref for t, ref, _ in mem if t == "w")
        need_nodes.update(ref for t, ref, _ in mem if t == "n")
    elif tags.get("type") == "route_master":
        masters[r.id] = (tags, [(m.type, m.ref, m.role) for m in r.members])
print(f"  {len(areas)} area relations, {len(routes)} rail routes, {len(masters)} route masters ({time.time() - t0:.0f}s)", flush=True)

print("pass 2: nodes and ways (with locations)", flush=True)
ways_out, member_geom, nodes_out, transit_extra = [], {}, {}, []
n_ways = 0
fp = osmium.FileProcessor(PBF, osmium.osm.NODE | osmium.osm.WAY).with_locations()
for o in fp:
    if o.is_node():
        if not o.tags:
            continue
        tags = dict(o.tags)
        lat, lon = o.location.lat, o.location.lon
        if o.id in need_nodes or (in_box(lat, lon, (TS, TW, TN, TE)) and (
                tags.get("railway") in ("station", "halt", "subway_entrance", "stop", "tram_stop")
                or tags.get("public_transport") in ("station", "stop_position"))):
            nodes_out[o.id] = {"type": "node", "id": o.id, "lat": lat, "lon": lon, "tags": tags}
        continue
    n_ways += 1
    if n_ways % 1000000 == 0:
        print(f"  {n_ways // 1000000}M ways ({time.time() - t0:.0f}s)", flush=True)
    wanted = o.id in need_ways
    tags = dict(o.tags) if (wanted or o.tags) else {}
    rule = bool(tags) and match(tags, WAY_RULES)
    if not (wanted or rule):
        continue
    try:
        geom = [(n.lat, n.lon) for n in o.nodes]
    except osmium.InvalidLocationError:
        geom = [(n.lat, n.lon) for n in o.nodes if n.location.valid()]
    if len(geom) < 2:
        continue
    if wanted:
        member_geom[o.id] = (tags, geom)
    if rule and any(in_box(la, lo, (S, W, N, E)) for la, lo in geom):
        el = {"type": "way", "id": o.id, "tags": tags, "geometry": [{"lat": la, "lon": lo} for la, lo in geom]}
        ways_out.append(el)
        if tags.get("railway") == "platform" or tags.get("public_transport") == "platform":
            transit_extra.append(el)
print(f"  {len(ways_out)} ways in the city, {len(member_geom)} relation member ways, {len(nodes_out)} nodes ({time.time() - t0:.0f}s)", flush=True)

os.makedirs(os.path.join(RAW, "tiles"), exist_ok=True)


def dump(path, elements):
    with open(path + ".part", "w") as f:
        json.dump({"elements": elements}, f, separators=(",", ":"))
    os.replace(path + ".part", path)
    print(f"  wrote {os.path.relpath(path, RAW)}: {os.path.getsize(path) // 1024 // 1024} MB, {len(elements)} elements", flush=True)


dump(os.path.join(RAW, "tiles", "tile_all.json"), ways_out)

area_els = []
for rid, (tags, mem) in areas.items():
    members, hit = [], False
    for ref, role in mem:
        g = member_geom.get(ref)
        if not g:
            continue
        hit = hit or any(in_box(la, lo, (S, W, N, E)) for la, lo in g[1])
        members.append({"type": "way", "ref": ref, "role": role, "geometry": [{"lat": la, "lon": lo} for la, lo in g[1]]})
    if hit:
        area_els.append({"type": "relation", "id": rid, "tags": tags, "members": members})
dump(os.path.join(RAW, "areas.json"), area_els)

tr_els, keep_routes = [], set()
for rid, (tags, mem) in routes.items():
    geoms = [member_geom[ref][1] for t, ref, _ in mem if t == "w" and ref in member_geom]
    if any(in_box(la, lo, (S, W, N, E)) for g in geoms for la, lo in g):
        keep_routes.add(rid)
        tr_els.append({"type": "relation", "id": rid, "tags": tags,
                       "members": [{"type": {"n": "node", "w": "way", "r": "relation"}[t], "ref": ref, "role": role} for t, ref, role in mem]})
for rid, (tags, mem) in masters.items():
    if any(t == "r" and ref in keep_routes for t, ref, _ in mem):
        tr_els.append({"type": "relation", "id": rid, "tags": tags,
                       "members": [{"type": {"n": "node", "w": "way", "r": "relation"}[t], "ref": ref, "role": role} for t, ref, role in mem]})
used_ways = {ref for rid in keep_routes for t, ref, _ in routes[rid][1] if t == "w"}
for ref in sorted(used_ways):
    if ref in member_geom:
        tags, g = member_geom[ref]
        tr_els.append({"type": "way", "id": ref, "tags": tags, "geometry": [{"lat": la, "lon": lo} for la, lo in g]})
tr_els += list(nodes_out.values()) + transit_extra
dump(os.path.join(RAW, "transit.json"), tr_els)
print(f"done in {time.time() - t0:.0f}s", flush=True)
