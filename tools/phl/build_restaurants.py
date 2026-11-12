"""djour's starred Philadelphia food spots -> data/phl/restaurants.json.

Input (tools/phl/raw/djour/, gitignored):
  markers.json   djour's map (https://www.djourformore.com/), the 2- and 3-star places, read
                 from the loaded map page: name, lat, lon, stars, categories, neighbourhood, note
  osm_eats.json  OpenStreetMap's named food and drink places (fetch_eats.py)

Steps:
  1. merge djour's duplicate rows (seasonal lists repeat a place), drop the closed ones
     ("Gone But Not Forgetten"), keep those inside the city limits;
  2. move each to its OpenStreetMap match (same name, within MATCH_M) when there is one;
  3. stand its storefront on the wall of its building that faces the nearest street (core
     footprints and the outer city's boxes and outlines), or at the kerb for trucks and
     markets, and note the building's height.

Run: python -I tools/phl/build_restaurants.py   (then python -I tools/bundle.py)
"""
import difflib
import gzip
import html
import json
import math
import os
import re
import struct
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from citylimits import Limits  # noqa: E402
from geom import proj  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(HERE))
RAW = os.path.join(HERE, "raw", "djour")
DATA = os.path.join(ROOT, "data", "phl")
MATCH_M = 250       # how far an OSM namesake may be and still count as the same place
NEAR_BLDG_M = 25    # a point this close to a building belongs to it
STREET_M = 80       # how far to look for the street a storefront faces

# djour's tags, as words; tags not listed (internal list codes) are left out
TAG = {
    "$": "$", "$$": "$$", "$$$": "$$$", "$$$$": "$$$$", "$$$$$": "$$$$$",
    "african": "African", "armenian": "Armenian", "asian": "Asian", "bagels": "bagels", "bakery": "bakery",
    "banhmi": "bánh mì", "bbq": "barbecue", "beerbar": "beer bar", "birria": "birria", "blackowned": "Black-owned",
    "breakfasttacos": "breakfast tacos", "brekkiesammies": "breakfast sandwiches", "brewery": "brewery",
    "british": "British", "brunch": "brunch", "buffchic": "buffalo chicken", "burgers": "burgers", "BYOB": "BYOB",
    "caesar": "Caesar salad", "cake": "cake", "cambodian": "Cambodian", "cheesesteak": "cheesesteaks",
    "chickenparm": "chicken parm", "chickentenders": "chicken tenders", "chinese": "Chinese",
    "cinnamonroll": "cinnamon rolls", "cocktailbar": "cocktail bar", "coffeeshop": "coffee", "coffee shop": "coffee",
    "cookies": "cookies", "croissant": "croissants", "cutlet": "chicken cutlet", "darts": "darts",
    "datenight": "date night", "desi": "South Asian", "dimsum": "dumplings", "diners": "diner", "divebar": "dive bar",
    "espresso": "espresso", "ethiopian": "Ethiopian", "farmersmarket": "farmers market", "fchicken": "fried chicken",
    "filipino": "Filipino", "finedining": "fine dining", "foodtruck": "food truck", "french": "French",
    "frenchonion": "French onion soup", "frenchtoast": "French toast", "fries": "fries", "gelato": "gelato",
    "gf": "gluten-free options", "GF": "gluten-free options", "gobbler": "the Gobbler", "halal": "halal",
    "happyhour": "happy hour", "healthy": "healthy", "hiddengems": "hidden gem", "hoagies": "hoagies",
    "hot dog": "hot dogs", "hotcocoa": "hot cocoa", "irish": "Irish pub", "italian": "Italian", "japan": "Japanese",
    "jamesbeard winner": "James Beard winner", "jamesbeard nominated": "James Beard nominee",
    "James Beard": "James Beard nominee", "lebanese": "Lebanese", "livemusic": "live music", "liveband": "live music",
    "malayindo": "Malaysian & Indonesian", "margs": "margaritas", "mediterranean": "Mediterranean",
    "mexican": "Mexican", "mexicanpizza": "Mexican pizza", "middleeastern": "Middle Eastern",
    "mozzsticks": "mozzarella sticks", "nachos": "nachos", "nepali": "Nepali", "nonsmashburger": "burgers",
    "omakase": "omakase", "oyster": "oysters", "pancakes & waffles": "pancakes & waffles", "pasta": "pasta",
    "peruvian": "Peruvian", "pho": "phở", "pierogi": "pierogi", "pizza": "pizza", "polish": "Polish",
    "quizzo": "quizzo", "ramen": "ramen", "roastpork": "roast pork", "sandwich": "sandwiches",
    "sausage&pep": "sausage & peppers", "seafood": "seafood", "softpretzel": "soft pretzels", "soulfood": "soul food",
    "sours": "sours", "southamerican": "South American", "supperclub": "supper club", "sushi": "sushi",
    "syrian": "Syrian", "szechuan": "Sichuan", "tacos": "tacos", "tasting menu": "tasting menu", "thai": "Thai",
    "tomatopie": "tomato pie", "top25": "djour top 25", "halloffame": "djour hall of fame", "vegan": "vegan",
    "viet": "Vietnamese", "whitepizza": "white pizza", "wings": "wings", "winebar": "wine bar",
    "wheelchair": "wheelchair accessible", "noreservations": "no reservations", "yearroundmarket": "year-round",
    "Till 4am": "open till 4am", "Pinball": "pinball", "pool table bars": "pool tables", "soccer": "soccer on TV",
    "sports": "sports on TV", "oldfashioned": "old fashioneds", "Guinness": "Guinness",
}


def kind_of(tags):
    t = set(tags)
    if t & {"foodtruck", "halal carts"}:
        return "truck"
    if "farmersmarket" in t:
        return "market"
    if "brewery" in t:
        return "brewery"
    food = t & {"best restaurant", "restaurant", "italian", "pizza", "sushi", "mexican", "chinese", "burgers",
                "finedining", "BYOB", "seafood", "brunch", "cheesesteak", "hoagies", "tacos", "viet", "japan"}
    if t & {"cocktailbar", "beerbar", "divebar", "winebar", "irish"} and not food:
        return "bar"
    if t & {"bakery", "cookies", "cake", "croissant"} and not food:
        return "bakery"
    if t & {"coffeeshop", "coffee shop"} and not food:
        return "cafe"
    return "restaurant"


def clean_note(s):
    s = re.sub(r"<br\s*/?>", "\n", s or "", flags=re.I)
    s = html.unescape(re.sub(r"<[^>]+>", "", s))
    lines = [ln.strip() for ln in s.split("\n")]
    out = "\n".join(ln for ln in lines if ln)
    return out.strip()


def norm(name):
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    s = s.replace("&", " and ").replace("+", " and ")
    s = re.sub(r"['’`]", "", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    words = [w for w in s.split() if w not in {"the", "a", "philly", "philadelphia", "and"}]
    return " ".join(words)


def similar(a, b):
    if not a or not b:
        return 0
    if a == b:
        return 1
    if (a in b or b in a) and min(len(a), len(b)) >= 4:
        return .9
    return difflib.SequenceMatcher(None, a, b).ratio()


# ---------------------------------------------------------------- inputs

def load_djour():
    with open(os.path.join(RAW, "markers.json"), encoding="utf-8") as f:
        rows = json.load(f)["rows"]
    merged = {}
    for name, lat, lon, stars, cats, hood, note in rows:
        tags = [c for c in cats.split("|") if c]
        key = (name.strip(), round(lat, 4), round(lon, 4))
        p = merged.get(key)
        if not p:
            merged[key] = p = dict(name=name.strip(), lat=lat, lon=lon, stars=0, tags=[], hood="", note="")
        p["stars"] = max(p["stars"], stars)
        p["tags"] += [t for t in tags if t not in p["tags"]]
        h = hood.strip().lstrip("xs") if hood.startswith(("x", "sR")) else hood.strip()
        if h and (not p["hood"] or not hood.startswith("x")):
            p["hood"] = h
        n = clean_note(note)
        if len(n) > len(p["note"]):
            p["note"] = n
    return list(merged.values())


def load_osm():
    with open(os.path.join(RAW, "osm_eats.json"), encoding="utf-8") as f:
        els = json.load(f)["elements"]
    out = []
    for e in els:
        c = e.get("center") or e
        if "lat" not in c or not e.get("tags", {}).get("name"):
            continue
        x, z = proj(c["lat"], c["lon"])
        out.append((norm(e["tags"]["name"]), x, z, e["tags"]["name"], e["tags"].get("addr:street", "")))
    return out


ROADS = {"primary", "secondary", "tertiary", "residential", "unclassified", "living_street", "pedestrian",
         "trunk", "primary_link", "secondary_link", "tertiary_link"}


def load_named_roads():
    """{street name (lower case): [(ax, az, bx, bz)]} from the raw OSM download (fetch_city.py)"""
    with open(os.path.join(HERE, "raw", "city", "tiles", "tile_all.json"), encoding="utf-8") as f:
        els = json.load(f)["elements"]
    roads = {}
    for e in els:
        t = e.get("tags", {})
        if e.get("type") != "way" or t.get("highway") not in ROADS or not t.get("name") or not e.get("geometry"):
            continue
        pts = [proj(g["lat"], g["lon"]) for g in e["geometry"]]
        lst = roads.setdefault(t["name"].lower(), [])
        lst += [(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) for i in range(len(pts) - 1)]
    return roads


ABBR = {"st": "street", "ave": "avenue", "av": "avenue", "rd": "road", "blvd": "boulevard", "ln": "lane", "pl": "place",
        "sq": "square", "dr": "drive", "pkwy": "parkway", "n": "north", "s": "south", "e": "east", "w": "west"}


def street_name(s):
    """'1623 Walnut St' / 'Walnut Street' -> 'walnut street'"""
    words = re.sub(r"[^a-z0-9 ]", " ", s.lower()).split()
    while words and words[0].isdigit():
        words.pop(0)
    return " ".join(ABBR.get(w, w) for w in words)


def load_looks():
    """{(name, hood or None): entry} from restaurant_looks.json"""
    with open(os.path.join(HERE, "restaurant_looks.json"), encoding="utf-8") as f:
        return {(e["name"], e.get("hood")): e for e in json.load(f)["places"]}


def load_addresses():
    """{(housenumber, street lower case): [(x, z, name, osm type)]} from raw/djour/osm_addr.json"""
    path = os.path.join(RAW, "osm_addr.json")
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        els = json.load(f)["elements"]
    out = {}
    for e in els:
        t, c = e.get("tags", {}), e.get("center") or e
        if "lat" not in c:
            continue
        x, z = proj(c["lat"], c["lon"])
        out.setdefault((t.get("addr:housenumber", ""), t.get("addr:street", "").lower()), []).append((x, z, t.get("name", ""), e["type"]))
    return out


def load_buildings():
    """[(ring [(x, z) m], height m)] for the core footprints and the outer city's boxes and outlines."""
    blds = []
    with open(os.path.join(DATA, "buildings.json"), encoding="utf-8") as f:
        for b in json.load(f)["b"]:
            r = b[2]
            blds.append(([(r[i] / 10, r[i + 1] / 10) for i in range(0, len(r), 2)], b[0] / 10))
    with gzip.open(os.path.join(DATA, "city_buildings.bin.gz"), "rb") as f:
        raw = f.read()
    nB, nP, nV = struct.unpack_from("<III", raw, 4)
    o = [16]

    def arr(fmt, n):
        v = list(struct.unpack_from(f"<{n}{fmt}", raw, o[0]))
        o[0] += n * struct.calcsize(fmt)
        return v
    bx, bz, vx, vz = arr("i", nB), arr("i", nB), arr("i", nV), arr("i", nV)
    bw, bd, br, bh = arr("H", nB), arr("H", nB), arr("H", nB), arr("H", nB)
    pn, ph = arr("H", nP), arr("H", nP)
    for i in range(1, nB):
        bx[i] += bx[i - 1]
        bz[i] += bz[i - 1]
    for i in range(nB):
        a = br[i] / 65535 * math.pi
        ex, ez = (math.cos(a), -math.sin(a)), (math.sin(a), math.cos(a))
        cx, cz, hw, hd = bx[i] / 10, bz[i] / 10, bw[i] / 20, bd[i] / 20
        ring = [(cx + sx * hw * ex[0] + sz * hd * ez[0], cz + sx * hw * ex[1] + sz * hd * ez[1])
                for sx, sz in ((1, 1), (-1, 1), (-1, -1), (1, -1))]
        blds.append((ring, bh[i] / 10))
    v = 0
    for i in range(nP):
        xs, zs = vx[v:v + pn[i]], vz[v:v + pn[i]]
        v += pn[i]
        for k in range(1, len(xs)):
            xs[k] += xs[k - 1]
            zs[k] += zs[k - 1]
        blds.append(([(x / 10, z / 10) for x, z in zip(xs, zs)], ph[i] / 10))
    return blds


def load_streets():
    """road centreline segments [(ax, az, bx, bz, width)] in metres"""
    segs = []
    with open(os.path.join(DATA, "ground.json"), encoding="utf-8") as f:
        lines = json.load(f)["lines"]
    with gzip.open(os.path.join(DATA, "city.json.gz"), "rt", encoding="utf-8") as f:
        lines += json.load(f)["lines"]
    for ln in lines:
        if ln["k"] != 0 or ln.get("x") or ln.get("b"):
            continue
        p = ln["p"]
        for i in range(0, len(p) - 2, 2):
            segs.append((p[i] / 10, p[i + 1] / 10, p[i + 2] / 10, p[i + 3] / 10, ln["w"]))
    return segs


class Grid:
    """items bucketed by 50 m cells, for 'what is near (x, z)'"""

    def __init__(self, items, bounds, cell=50.0):
        self.c, self.cells = cell, {}
        for it in items:
            x0, z0, x1, z1 = bounds(it)
            for i in range(int(x0 // cell), int(x1 // cell) + 1):
                for j in range(int(z0 // cell), int(z1 // cell) + 1):
                    self.cells.setdefault((i, j), []).append(it)

    def near(self, x, z, r):
        c, seen = self.c, set()
        for i in range(int((x - r) // c), int((x + r) // c) + 1):
            for j in range(int((z - r) // c), int((z + r) // c) + 1):
                for it in self.cells.get((i, j), ()):
                    if id(it) not in seen:
                        seen.add(id(it))
                        yield it


# ---------------------------------------------------------------- geometry

def seg_closest(px, pz, ax, az, bx, bz):
    dx, dz = bx - ax, bz - az
    L2 = dx * dx + dz * dz
    t = 0 if L2 == 0 else max(0, min(1, ((px - ax) * dx + (pz - az) * dz) / L2))
    qx, qz = ax + t * dx, az + t * dz
    return qx, qz, math.hypot(px - qx, pz - qz), t


def inside(px, pz, ring):
    c = False
    for i in range(len(ring)):
        (ax, az), (bx, bz) = ring[i], ring[i - 1]
        if (az > pz) != (bz > pz) and px < ax + (pz - az) * (bx - ax) / (bz - az):
            c = not c
    return c


def signed_area(ring):
    return sum(ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1] for i in range(len(ring))) / 2


def nearest_street(x, z, streets):
    best = None
    for ax, az, bx, bz, w in streets.near(x, z, STREET_M):
        qx, qz, d, _ = seg_closest(x, z, ax, az, bx, bz)
        if d <= STREET_M and (best is None or d < best[2]):
            best = (qx, qz, d, w, (bx - ax, bz - az))
    return best


def nearest_on(x, z, segs):
    best = None
    for ax, az, bx, bz in segs:
        qx, qz, d, _ = seg_closest(x, z, ax, az, bx, bz)
        if best is None or d < best[2]:
            best = (qx, qz, d)
    return best


def storefront(x, z, bgrid, streets, front=None):
    """(fx, fz, ry, width, building height, on_building) for a place at (x, z), its shop front facing
    the street `front` (segments of the street in its address) when given, else the nearest street"""
    st = nearest_on(x, z, front) if front else nearest_street(x, z, streets)
    # the building it is in, or the nearest one
    best = None
    for ring, h in bgrid.near(x, z, NEAR_BLDG_M):
        if inside(x, z, ring):
            best = (0, ring, h)
            break
        for i in range(len(ring)):
            d = seg_closest(x, z, *ring[i - 1], *ring[i])[2]
            if d <= NEAR_BLDG_M and (best is None or d < best[0]):
                best = (d, ring, h)
    if best is None or st is None:
        ry = math.atan2(st[0] - x, st[1] - z) if st else 0.0
        return x, z, ry, 0, 0, False
    _, ring, h = best
    sgn = 1 if signed_area(ring) > 0 else -1
    sx, sz = st[0] - x, st[1] - z
    sl = math.hypot(sx, sz) or 1
    pick = None
    for i in range(len(ring)):
        (ax, az), (bx, bz) = ring[i - 1], ring[i]
        L = math.hypot(bx - ax, bz - az)
        if L < 3:
            continue
        # outward normal of this edge (positive-area rings run so the outside is on the right)
        nx, nz = sgn * (bz - az) / L, sgn * -(bx - ax) / L
        face = (nx * sx + nz * sz) / sl
        qx, qz, d, t = seg_closest(x, z, ax, az, bx, bz)
        # how far the street is in front of this wall: a wall facing it, near the point, wins
        ex, ez = (ax + bx) / 2, (az + bz) / 2
        to_st = nearest_on(qx, qz, front) if front else nearest_street(qx, qz, streets)
        gap = to_st[2] if to_st else STREET_M
        score = face * 2 - d / 15 - gap / 20 + min(L, 12) / 24
        if face > .3 and (pick is None or score > pick[0]):
            pick = (score, ax, az, bx, bz, L, nx, nz, t)
    if pick is None:
        ry = math.atan2(sx, sz)
        return x, z, ry, 0, h, False
    _, ax, az, bx, bz, L, nx, nz, t = pick
    t = min(max(t, 2.5 / L), 1 - 2.5 / L) if L > 5 else .5
    fx, fz = ax + t * (bx - ax), az + t * (bz - az)
    return fx, fz, math.atan2(nx, nz), L, h, True


def crosses(ax, az, bx, bz, cx, cz, dx, dz):
    """do segments a-b and c-d cross?"""
    def side(px, pz, qx, qz, rx, rz):
        return (qx - px) * (rz - pz) - (qz - pz) * (rx - px)
    d1, d2 = side(cx, cz, dx, dz, ax, az), side(cx, cz, dx, dz, bx, bz)
    d3, d4 = side(ax, az, bx, bz, cx, cz), side(ax, az, bx, bz, dx, dz)
    return d1 * d2 < 0 and d3 * d4 < 0


def clear(cx, cz, tx, tz, bgrid):
    """(cx, cz) is outside every building and can see (tx, tz) past them"""
    mx, mz, r = (cx + tx) / 2, (cz + tz) / 2, math.hypot(tx - cx, tz - cz) / 2 + 2
    for ring, _ in bgrid.near(mx, mz, r):
        if inside(cx, cz, ring):
            return False
        for i in range(len(ring)):
            if crosses(cx, cz, tx, tz, *ring[i - 1], *ring[i]):
                return False
    return True


def camera(fx, fz, ry, front, streets, bgrid):
    """where the place's view stands: (x, z, height above the ground). In its street, some way along
    it, with a clear line of sight to the shop front; else looking down from above the roofs."""
    nx, nz = math.sin(ry), math.cos(ry)
    tx, tz = fx + nx * .6, fz + nz * .6
    if front:
        best = None
        for ax, az, bx, bz in front:
            qx, qz, d, _ = seg_closest(fx, fz, ax, az, bx, bz)
            if best is None or d < best[2]:
                best = (qx, qz, d, (bx - ax, bz - az))
        st = best
    else:
        st = nearest_street(fx, fz, streets)
        st = st and (st[0], st[1], st[2], st[4])
    if st:
        qx, qz, _, (ux, uz) = st
        L = math.hypot(ux, uz) or 1
        ux, uz = ux / L, uz / L
        for a in (11, -11, 8, -8, 5, -5, 2, -2):
            for k in (0, .35):   # on the centreline, or a little toward the shop's side
                cx, cz = qx + ux * a + (tx - qx) * k, qz + uz * a + (tz - qz) * k
                if math.hypot(cx - tx, cz - tz) > 3.5 and clear(cx, cz, tx, tz, bgrid):
                    return cx, cz, 5
    return fx + nx * 30, fz + nz * 30, 34


def front_view(fx, fz, ry, bgrid):
    """a camera spot straight out in front of the shop front at eye height, as far back as the
    street allows (up to 9 m), or None when even 3.5 m out is blocked"""
    nx, nz = math.sin(ry), math.cos(ry)
    tx, tz = fx + nx * .6, fz + nz * .6
    for d in (9, 7.5, 6, 4.5, 3.5):
        cx, cz = fx + nx * d, fz + nz * d
        if clear(cx, cz, tx, tz, bgrid):
            return [round(cx, 1), round(cz, 1)]
    return None


# ---------------------------------------------------------------- main

def main():
    places = load_djour()
    closed = [p for p in places if "Gone But Not Forgetten" in p["tags"]]
    places = [p for p in places if p not in closed]
    lim = Limits(os.path.join(HERE, "raw", "city"))
    for p in places:
        p["x"], p["z"] = proj(p["lat"], p["lon"])
    outside = [p for p in places if not lim.inside(p["x"], p["z"])]
    places = [p for p in places if lim.inside(p["x"], p["z"])]

    osm = load_osm()
    ogrid = Grid(osm, lambda o: (o[1], o[2], o[1], o[2]))
    moved = []
    for p in places:
        n = norm(p["name"])
        best = None
        for o in ogrid.near(p["x"], p["z"], MATCH_M):
            d = math.hypot(o[1] - p["x"], o[2] - p["z"])
            s = similar(n, o[0])
            if d <= MATCH_M and s >= .82 and (best is None or (s, -d) > (best[0], -best[1])):
                best = (s, d, o)
        p["snap"] = "djour"
        m = re.search(r"Address:\s*([^\n]+)", p["note"])
        p["street"] = street_name(m.group(1)) if m else ""
        if best:
            p["snap"] = "osm"
            p["street"] = street_name(best[2][4]) or p["street"]
            if best[1] > 3:
                moved.append((round(best[1]), p["name"], best[2][3]))
            p["x"], p["z"] = best[2][1], best[2][2]
    print(f"{len(places)} places in the city ({len(closed)} closed and {len(outside)} outside the limits left out)")

    # the researched looks of the three-star picks (restaurant_looks.json): attach each one, and
    # move the place to the street address the research found, where OSM has that address
    looks = load_looks()
    addr = load_addresses()
    readdressed = []
    for p in places:
        lk = looks.get((p["name"], p["hood"])) or looks.get((p["name"], None))
        if not lk:
            continue
        p["look"] = dict(lk["look"], indoor=bool(lk.get("indoor")))
        if not lk.get("address"):
            continue
        num, street = lk["address"].split(" ", 1)
        cands = addr.get((num, street.lower()), [])
        if not cands:
            continue
        # a same-named object first, then the building, then any point with that address
        n = norm(p["name"])
        pick_ = (max(cands, key=lambda c: (similar(n, norm(c[2])) >= .7, c[3] == "way", -math.hypot(c[0] - p["x"], c[1] - p["z"]))))
        d = math.hypot(pick_[0] - p["x"], pick_[1] - p["z"])
        if d > 3:
            readdressed.append((round(d), p["name"], lk["address"]))
        p["x"], p["z"] = pick_[0], pick_[1]
        p["street"] = street_name(street)
    print(f"{sum('look' in p for p in places)} places have a researched look; moved to their researched address:")
    for d, n, a_ in sorted(readdressed, reverse=True):
        print(f"  {d:5d} m  {n}  ->  {a_}")
    print(f"{sum(p['snap'] == 'osm' for p in places)} matched in OSM; moved more than 25 m:")
    for d, a, b in sorted(moved, reverse=True):
        if d > 25:
            print(f"  {d:4d} m  {a}  ->  OSM '{b}'")

    print("loading buildings and streets…")
    blds = load_buildings()
    bgrid = Grid(blds, lambda b: (min(p[0] for p in b[0]), min(p[1] for p in b[0]),
                                   max(p[0] for p in b[0]), max(p[1] for p in b[0])))
    segs = load_streets()
    sgrid = Grid(segs, lambda s: (min(s[0], s[2]), min(s[1], s[3]), max(s[0], s[2]), max(s[1], s[3])))
    roads = {street_name(k): v for k, v in load_named_roads().items()}
    faced = high = 0

    out = []
    loose = []
    for p in sorted(places, key=lambda p: p["name"].lower()):
        k = kind_of(p["tags"])
        # the street in its address, if it runs within 60 m of the place
        front = None
        if p["street"] in roads:
            near = [sg for sg in roads[p["street"]] if seg_closest(p["x"], p["z"], *sg)[2] < 60]
            front = near or None
            faced += bool(front)
        if k in ("truck", "market"):
            st = nearest_street(p["x"], p["z"], sgrid)
            fx, fz, w, h, on = p["x"], p["z"], 0, 0, False
            ry = math.atan2(st[0] - fx, st[1] - fz) if st else 0
        else:
            fx, fz, ry, w, h, on = storefront(p["x"], p["z"], bgrid, sgrid, front)
            if not on:
                loose.append(p["name"])
        tags = []
        for t in p["tags"]:
            word = TAG.get(t)
            if word and word not in tags:
                tags.append(word)
        price = next((t for t in tags if t.startswith("$")), "")
        tags = [t for t in tags if not t.startswith("$")]
        st = nearest_on(fx, fz, front) if front else nearest_street(fx, fz, sgrid)
        vx, vz, vh = camera(fx, fz, ry, front, sgrid, bgrid)
        high += vh > 5
        rec = dict(n=p["name"], x=round(fx, 1), z=round(fz, 1), ry=round(ry, 3), w=round(min(w, 40), 1),
                   h=round(h, 1), sd=round(st[2], 1) if st else 0, v=[round(vx, 1), round(vz, 1), vh],
                   f=front_view(fx, fz, ry, bgrid),
                   k=k, s=p["stars"], hood=p["hood"], c=tags)
        if price:
            rec["p"] = price
        if p["note"]:
            rec["d"] = p["note"]
        if "coming soon" in p["tags"]:
            rec["soon"] = 1
        if "supperclub" in p["tags"]:
            rec["club"] = 1
        if "look" in p:
            rec["look"] = p["look"]
        out.append(rec)
    print(f"{faced} face the street in their address; {high} views look down from above the roofs")
    print(f"{len(out)} storefronts; not against a building wall (stand on their own): {len(loose)}")
    for n in loose:
        print("  ", n)
    doc = {
        "source": "djour's Philly food map, https://www.djourformore.com/ (two- and three-star picks)",
        "credit": "Restaurant picks and notes: djour (djourformore.com)",
        "stars": {"2": "Better: worth a commute", "3": "Best: must hit when in Philly"},
        "places": out,
    }
    path = os.path.join(DATA, "restaurants.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    print(path, os.path.getsize(path) // 1024, "KB")


if __name__ == "__main__":
    main()
