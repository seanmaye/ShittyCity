"""Build data/phl/trolley1953.json: Center City streetcar tracks in January 1953 (the "1953 streetcars" layer).

usage: python -I build_trolley1953.py PTC_MAP3.GIF osm/streets_cc.json osm/oldtram.json data/phl/trolley1953.json [--write] [--overlay out.png]

Then run tools/bundle.py to refresh city-models.html.

Needs Pillow (pip install pillow).

Source map: the Center City panel of the Philadelphia Transportation Company system map,
January 1953, as scanned at http://www.phillytrolley.org/ptc-map.html (image IMAGES/PTC_MAP3.GIF).
The image is NOT in this repository: download it yourself. Streetcar lines are the blue lines.

How it works:
1. Fits an affine transform from scene metres to map pixels, using 70 intersections of the
   numbered streets with Arch, Chestnut, Walnut, Lombard and South (OSM street centrelines).
   Residuals are under 2 px (about 8 m).
2. Walks every named OSM street every 4 m and keeps the stretches that lie on a blue line
   for at least 45 m. Market St west of City Hall is the subway-surface tunnel (dashed) and
   is skipped; east of City Hall it is a surface line drawn just south of the El, so it is
   matched with a wider search.
3. Gives each street the routes printed beside it on the map, and each route the year it was
   abandoned (the table on the same web page, from Harold E. Cox, Surface Cars of
   Philadelphia 1911-1965).
4. Adds the old Route 23 track on 11th and 12th Streets and other disused tram pieces mapped
   in OSM (abandoned:railway=tram / disused:railway=tram).
"""
import json, math, re, sys

sys.stdout.reconfigure(encoding="utf-8")
from PIL import Image, ImageDraw

GIF, STREETS, OLD, OUT = sys.argv[1:5]
WRITE = "--write" in sys.argv
OVERLAY = sys.argv[sys.argv.index("--overlay") + 1] if "--overlay" in sys.argv else None

LAT0, LON0, MX, MZ = 39.9560, -75.1760, 85390, 111000
def xz(g): return ((g["lon"] - LON0) * MX, -(g["lat"] - LAT0) * MZ)

# ---- OSM streets: raw name -> list of polylines (metres)
RAW = {}
for e in json.load(open(STREETS, encoding="utf-8"))["elements"]:
    if e["type"] == "way" and "geometry" in e:
        RAW.setdefault(e["tags"]["name"], []).append([xz(g) for g in e["geometry"]])
def base(n): return re.sub(r"^(North|South) (?=\d)", "", n)
BASE = {}
for n, ws in RAW.items(): BASE.setdefault(base(n), []).extend(ws)

def seg_int(a, b, c, d):
    r = (b[0] - a[0], b[1] - a[1]); s = (d[0] - c[0], d[1] - c[1]); den = r[0] * s[1] - r[1] * s[0]
    if abs(den) < 1e-9: return None
    t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den; u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den
    if -1e-6 <= t <= 1 + 1e-6 and -1e-6 <= u <= 1 + 1e-6: return (a[0] + t * r[0], a[1] + t * r[1])
def inter(A, B):
    pts = [x for p in BASE.get(A, []) for q in BASE.get(B, []) for i in range(len(p) - 1) for j in range(len(q) - 1)
           if (x := seg_int(p[i], p[i + 1], q[j], q[j + 1]))]
    return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)) if pts else None
def ordn(n): return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')} Street"

# ---- 1. affine fit: map pixel columns/rows of the blue lines, read off the image
COLS = {92.3: 23, 115.1: 22, 183.1: 20, 213.7: 19, 244.8: 18, 274.3: 17, 305.2: 16, 337.0: 15,
        410.2: 13, 440.0: 12, 470.7: 11, 500.6: 10, 532.1: 9, 562.7: 8,
        591.4: 7, 621.4: 6, 652.0: 5, 683.5: 4, 713.0: 3, 749.5: 2}
ROWS = {105.4: "Arch Street", 198.0: "Chestnut Street", 237.2: "Walnut Street", 358.5: "Lombard Street", 384.5: "South Street"}
cp = [(I, (u, v)) for u, n in COLS.items() for v, r in ROWS.items() if (I := inter(ordn(n), r))]
def lsq(cp, k):
    M = [[0.0] * 3 for _ in range(3)]; b = [0.0] * 3
    for (x, z), uv in cp:
        f = (x, z, 1.0)
        for i in range(3):
            b[i] += f[i] * uv[k]
            for j in range(3): M[i][j] += f[i] * f[j]
    A = [M[i] + [b[i]] for i in range(3)]
    for i in range(3):
        p = max(range(i, 3), key=lambda r: abs(A[r][i])); A[i], A[p] = A[p], A[i]
        for r in range(3):
            if r != i: f = A[r][i] / A[i][i]; A[r] = [a - f * c for a, c in zip(A[r], A[i])]
    return [A[i][3] / A[i][i] for i in range(3)]
AX, AY = lsq(cp, 0), lsq(cp, 1)
def P(x, z): return (AX[0] * x + AX[1] * z + AX[2], AY[0] * x + AY[1] * z + AY[2])
res = max(math.dist(P(*m), uv) for m, uv in cp)
print(f"affine: {len(cp)} control points, worst residual {res:.1f} px")

# ---- 2. detect
im = Image.open(GIF).convert("RGB"); W, H = im.size; px = im.load()
BLUE = [[(lambda r, g, b: b > r + 45 and b >= g + 10 and r < 120)(*px[x, y]) for x in range(W)] for y in range(H)]
def hit(u, v, R):
    k = int(math.ceil(R))
    for dy in range(-k, k + 1):
        for dx in range(-k, k + 1):
            X, Y = int(round(u + dx)), int(round(v + dy))
            if 0 <= X < W and 0 <= Y < H - 25 and BLUE[Y][X] and (X - u) ** 2 + (Y - v) ** 2 <= R * R + .5: return True
    return False

SKIP = {"Ridge Avenue",               # Route 61: an electric trolleybus in 1953, no rails
        "Benjamin Franklin Parkway", "Logan Circle", "John F. Kennedy Boulevard", "Vine Street",
        "Broad Street", "North Broad Street", "South Broad Street", "Juniper Street",
        "East Penn Square", "South Penn Square", "West Penn Square", "North Penn Square"}  # the City Hall loop is underground
BROAD_X = (-75.1636 - LON0) * MX
def runs_of(name, w, R, keep=lambda p: True):
    pts = []
    for a, b in zip(w, w[1:]):
        n = max(1, int(math.dist(a, b) // 4))
        pts += [(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n) for k in range(n)]
    pts.append(w[-1])
    h = [keep(p) and hit(*P(*p), R) for p in pts]
    i = 0
    while i < len(h):                     # bridge gaps of up to 16 m (dashes, route numbers over the line)
        if not h[i]:
            j = i
            while j < len(h) and not h[j]: j += 1
            if 0 < i and j < len(h) and j - i <= 4: h[i:j] = [True] * (j - i)
            i = j
        else: i += 1
    out, i = [], 0
    while i < len(h):
        if h[i]:
            j = i
            while j < len(h) and h[j]: j += 1
            run = pts[i:j]
            if sum(math.dist(a, b) for a, b in zip(run, run[1:])) >= 45: out.append(run)
            i = j
        else: i += 1
    return out

found = []  # (raw name, polyline)
for name, ways in RAW.items():
    if name in SKIP: continue
    for w in ways:
        if name == "Market Street":     # surface cars only east of City Hall
            for r in runs_of(name, w, 3.6, lambda p: p[0] > BROAD_X + 60): found.append((name, r))
        else:
            for r in runs_of(name, w, 1.8): found.append((name, r))

# ---- 3. routes (printed beside each street on the map) and when each route was abandoned
ROUTES = {2: ("15th and 16th Streets", 1956), 5: ("Frankford – 2nd and 3rd Streets", 1955), 7: ("Strawberry Mansion – 22nd & 23rd Sts.", 1955),
          9: ("Strawberry Mansion – 4th and 5th Sts.", 1956), 12: ("Grays Ferry", 1956),
          13: ("Chester Avenue", None), 17: ("South 19th & 20th Streets", 1957), 18: ("South 22nd and 23rd Streets", 1953),
          20: ("12th and 13th Streets", 1957), 21: ("North 17th and 18th Streets", 1956),
          23: ("Germantown Avenue – 11th & 12th Sts.", 1992), 32: ("South 17th & 18th Streets", 1957),
          33: ("North 22nd Street", 1955), 36: ("Elmwood Avenue", None), 40: ("Lombard and South Streets", 1956),
          42: ("West Spruce Street", 1956), 47: ("Godfrey – 8th & 9th Streets", 1969), 48: ("Fairmount – Arch Street", 1956),
          50: ("Lawndale – 4th & 5th Streets", 1980), 65: ("York Road – 6th & 7th Streets", 1953)}
STILL = {13: "now the T3, in the subway", 36: "now the T5, in the subway"}
ARCH_Z = inter("16th Street", "Arch Street")[1]
X16, X19 = inter("16th Street", "Arch Street")[0], inter("19th Street", "Arch Street")[0]
def routes_for(name, p):
    mx = sum(q[0] for q in p) / len(p); mz = sum(q[1] for q in p) / len(p)
    b = base(name); north = name.startswith("North ")
    if b in ("22nd Street", "23rd Street"): return [7, 9] if north else [7, 36]
    if b in ("19th Street", "20th Street"): return [33] if north else [17, 18]
    if name == "West Rittenhouse Square": return [17, 18]
    if b in ("17th Street", "18th Street"): return [21] if north else [32]
    if b in ("15th Street", "16th Street"): return [2, 48] if north and mz < ARCH_Z else [2]
    if b in ("12th Street", "13th Street"): return [20]
    if b in ("10th Street", "11th Street"): return [23]
    if b in ("8th Street", "9th Street"): return [47]
    if b in ("6th Street", "7th Street"): return [65]
    if b in ("4th Street", "5th Street"): return [9, 50]
    if b in ("2nd Street", "3rd Street"): return [5]
    # 5th, 6th and 7th St take other names beside Independence Mall and Washington Square
    if name in ("Independence Mall West", "West Washington Square"): return [65]
    if name == "Independence Mall East": return [9, 50]
    if name == "Old 2nd Street": return [5]
    if name == "Arch Street": return [9] if mx < X19 else [9, 33] if mx < X16 else [9, 33, 48]
    if name in ("Chestnut Street", "Walnut Street"): return [13, 42]
    if name in ("Lombard Street", "South Street"): return [12, 40]
    if name == "Market Street": return [17, 18, 21, 32, 36]
    return []

def clip(p):
    """the model covers the whole city, so everything on the map is kept"""
    return [p] if len(p) > 1 else []
dm = lambda v: int(round(v * 10))
flat = lambda p: [dm(c) for q in p for c in q]

streets = []
for name, p in found:
    # split the run wherever the set of routes changes (e.g. along Arch St)
    pieces, cur, cr = [], [p[0]], routes_for(name, [p[0]])
    for q in p[1:]:
        r = routes_for(name, [q]); cur.append(q)
        if r != cr: pieces.append((cr, cur)); cur, cr = [q], r
    pieces.append((cr, cur))
    for r, piece in pieces:
        if not r: print("  no route read for", name, "- skipped"); continue
        for c in clip(piece):
            streets.append({"s": base(name), "r": r, "p": flat(c)})

# ---- 4. OSM remnants
rails = []
for e in json.load(open(OLD, encoding="utf-8"))["elements"]:
    t = e.get("tags", {})
    st = 0 if t.get("disused:railway") == "tram" else 1 if t.get("abandoned:railway") == "tram" else None
    if st is None or "geometry" not in e: continue
    for c in clip([xz(g) for g in e["geometry"]]): rails.append({"st": st, "p": flat(c)})

block = {"note": "Center City streetcar tracks of January 1953, traced from the PTC system map; route abandonment years "
                 "from Harold E. Cox, Surface Cars of Philadelphia 1911-1965. Remnants: OpenStreetMap (ODbL).",
         "routes": [{"n": n, "name": nm, "gone": g, **({"now": STILL[n]} if n in STILL else {})} for n, (nm, g) in sorted(ROUTES.items())],
         "streets": streets, "rails": rails}

tot = {}
for s in streets:
    L = sum(math.dist((s["p"][i], s["p"][i + 1]), (s["p"][i + 2], s["p"][i + 3])) for i in range(0, len(s["p"]) - 2, 2)) / 10
    k = (s["s"], tuple(s["r"])); tot[k] = tot.get(k, 0) + L
for (s, r), L in sorted(tot.items()): print(f"  {s:22s} {str(list(r)):20s} {L:6.0f} m")
print(f"{len(streets)} street runs, {len(rails)} OSM remnant pieces "
      f"({sum(1 for r in rails if r['st'] == 0)} disused, {sum(1 for r in rails if r['st'] == 1)} removed)")

if OVERLAY:
    ov = im.copy(); d = ImageDraw.Draw(ov)
    for s in streets: d.line([P(s["p"][i] / 10, s["p"][i + 1] / 10) for i in range(0, len(s["p"]), 2)], fill=(255, 0, 255), width=2)
    ov.resize((W * 2, H * 2)).save(OVERLAY)

if WRITE:
    with open(OUT, "w", encoding="utf-8") as f: json.dump(block, f, separators=(",", ":"), ensure_ascii=False)
    print("wrote", OUT, "- now run tools/bundle.py")
