"""Kingda Ka's track, measured: tools/ka/src/ (fetch_track.py) -> data/ka/coaster.json.

    python -I tools/ka/build_track.py [--debug DIR]      # needs numpy only

The centreline of the ride (midway between the running rails, at the height of the rail centres) with the riders' up
at every point, and what the lidar shows of the tower, the supports, the station and the other fixed track. README.md
beside this file says what every number rests on; in short:

  measured (USGS 3DEP lidar flown 2019-03-08 while the ride stood, 8 points/m2; the 2010 survey for the tower's
  vertical runs, which it caught before Zumanjaro's rails were hung on the tower's face):
    - both long legs in plan (straight lines fitted to the returns on the rails, 0.1 m rms)
    - the whole profile: launch incline, pull-up, pull-out, hill, brake run (curves fitted to the rail-top returns)
    - the top hat's crest and its two sides, the tower's legs, rings, struts and feet
    - where the two vertical runs stand and how the track winds on them (a few dozen returns: weak but consistent)
    - the turnaround in plan and height, the two station lanes where they leave the roof, the storage tracks
  assumed (said again in the output's `assumed` list):
    - what the station roof hides: the lanes' S-curves and the level of the track under it
    - exactly where the track rolls on the way up (placed where the 2010 returns show the truss sliding across), and
      the radius of the roll on the way down (the returns wind the published way, 270 degrees to the right)
    - where the brakes section starts

Frames. The scene frame is extent.proj: x metres east, z metres south, y up, flat ground at y = 0. The ride's own frame
used here is (a, b): a along the launch leg toward the tower, b across it (the launch side positive), both in metres
from the scene's origin; U and V are its unit vectors in (x, z). y in the output is the height above ONE datum, the
median ground under the ride (the ground falls 2 m from the station to the tower: `ground` in the output has the real
relief), so every slope is the true one.
"""
import json, math, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from extent import LAT0, LON0, MX, MZ, proj  # noqa: E402

SRC = os.path.join(HERE, 'src')
OUT = os.path.join(HERE, '..', '..', 'data', 'ka', 'coaster.json')
RM = 6378137.0                    # EPSG:3857's sphere
RAIL = 0.14                       # rail tube, m (js/scene/ka/layout.ts): the lidar's surface is its top, the centreline its middle
REG = 10.0                        # how hard the fits hold the curvature smooth between knots
TRAIN = 14.0                      # a five-car train, m
LANE = 4.0                        # the station lanes stand this far either side of the launch line (measured where they leave the roof,
                                  # and the storage tracks continue the same 4 m grid)
E_TOW = 170.0                     # the legs' profiles are fitted against e = E_TOW - (distance along the leg): metres back from beyond the tower
STEP = 1.0                        # spacing of the output, m
DEBUG = sys.argv[sys.argv.index('--debug') + 1] if '--debug' in sys.argv else None
NOTES = []                        # what the run found, printed at the end and kept in the README's numbers


def say(*a):
    s = ' '.join(str(v) for v in a); NOTES.append(s); print(s)


# ------------------------------------------------------------------------------------------------ sources
def load_lidar(year):
    """x, z (scene metres), elevation (m), class"""
    P = np.load(os.path.join(SRC, f'lidar-kingda-ka-{year}-epsg3857.npy'))
    lon = np.degrees(P[:, 0] / RM); lat = np.degrees(2 * np.arctan(np.exp(P[:, 1] / RM)) - np.pi / 2)
    return (lon - LON0) * MX, -(lat - LAT0) * MZ, P[:, 2], P[:, 3].astype(int)


def osm_ways():
    d = json.load(open(os.path.join(SRC, 'osm-kingda-ka-2024.json')))
    return {e['id']: e for e in d['elements'] if e['type'] == 'way'}


def way_xz(w):
    return np.array([proj(g['lat'], g['lon']) for g in w['geometry']])


# ------------------------------------------------------------------------------------------------ small tools
def unit(v):
    v = np.asarray(v, float); return v / np.linalg.norm(v)


def smoothstep(t):
    t = np.clip(t, 0, 1); return t * t * t * (t * (6 * t - 15) + 10)


def ramp(t, f=0.2):
    """0..1 over t = 0..1, straight in the middle with a parabola of width f at each end (continuous slope)"""
    t = np.clip(np.asarray(t, float), 0, 1); k = 1 / (1 - f)
    return np.where(t < f, k * t * t / (2 * f), np.where(t > 1 - f, 1 - k * (1 - t) ** 2 / (2 * f), k * (t - f / 2)))


def grid_median(x, z, v, x0, z0, cell, nx, nz):
    ix = np.floor((x - x0) / cell).astype(int); iz = np.floor((z - z0) / cell).astype(int)
    ok = (ix >= 0) & (ix < nx) & (iz >= 0) & (iz < nz)
    key = iz[ok] * nx + ix[ok]; vv = v[ok]
    o = np.lexsort((vv, key)); key = key[o]; vv = vv[o]
    u, start, cnt = np.unique(key, return_index=True, return_counts=True)
    G = np.full(nx * nz, np.nan); G[u] = vv[start + cnt // 2]
    return G.reshape(nz, nx)


def fill_nan(G):
    G = G.copy()
    for _ in range(200):
        bad = np.isnan(G)
        if not bad.any(): break
        P = np.pad(G, 1, constant_values=np.nan)
        nb = np.stack([P[1 + dz:P.shape[0] - 1 + dz, 1 + dx:P.shape[1] - 1 + dx] for dz in (-1, 0, 1) for dx in (-1, 0, 1) if dz or dx])
        n = (~np.isnan(nb)).sum(0); s = np.nansum(nb, 0)
        G[bad & (n > 0)] = (s / np.maximum(n, 1))[bad & (n > 0)]
    return G


def gauss_newton(fun, p, iters=8, lam=1e-6, eps=None):
    """least squares on fun(p) -> residuals, numeric Jacobian, a little damping"""
    p = np.array(p, float); eps = np.full(len(p), 1e-6) if eps is None else eps
    r = fun(p); cost = r @ r
    for _ in range(iters):
        J = np.empty((len(r), len(p)))
        for j in range(len(p)):
            q = p.copy(); q[j] += eps[j]; J[:, j] = (fun(q) - r) / eps[j]
        A = J.T @ J; g = J.T @ r; mu = lam * (np.trace(A) / len(p) + 1e-12)
        for _try in range(8):
            dp = np.linalg.solve(A + mu * np.eye(len(p)), -g); r2 = fun(p + dp); c2 = r2 @ r2
            if c2 < cost: p = p + dp; r = r2; done = cost - c2 < 1e-10 * cost; cost = c2; break
            mu *= 10
        else:
            break
        if done: break
    return p


# ------------------------------------------------------------------------------------------------ planar curves
def integrate(p0, th0, sk, kk, ds=0.1, S=None):
    """the curve from p0 heading th0 whose curvature runs straight between the knots (sk, kk): s, x, y, heading"""
    S = sk[-1] if S is None else S
    s = np.arange(0, S + ds / 2, ds)
    k = np.interp(s, sk, kk)
    th = th0 + np.r_[0, np.cumsum((k[1:] + k[:-1]) * ds / 2)]
    c, sn = np.cos(th), np.sin(th)
    X = p0[0] + np.r_[0, np.cumsum((c[1:] + c[:-1]) * ds / 2)]
    Y = p0[1] + np.r_[0, np.cumsum((sn[1:] + sn[:-1]) * ds / 2)]
    return s, X, Y, th


def project(px, py, s, X, Y, th):
    """each point's place along the curve (s) and its distance to the left of it (the normal (-sin, cos))"""
    si = np.empty(len(px)); dn = np.empty(len(px))
    for i0 in range(0, len(px), 400):
        sl = slice(i0, i0 + 400)
        d2 = (px[sl, None] - X[None, :]) ** 2 + (py[sl, None] - Y[None, :]) ** 2
        j = np.argmin(d2, axis=1)
        ex, ey = px[sl] - X[j], py[sl] - Y[j]
        si[sl] = s[j] + ex * np.cos(th[j]) + ey * np.sin(th[j]); dn[sl] = -ex * np.sin(th[j]) + ey * np.cos(th[j])
    return si, dn


def normal_dist(px, py, si, s, X, Y, th):
    cx = np.interp(si, s, X); cy = np.interp(si, s, Y); t = np.interp(si, s, th)
    return -(px - cx) * np.sin(t) + (py - cy) * np.cos(t)


def top_bins(u, v, step=1.0, band=0.3, nmin=4, pct=97):
    """the upper edge of a cloud: per bin of u, the points within `band` under the 97th percentile of v -> mean u, v"""
    out = []
    k = np.floor(u / step).astype(int)
    o = np.argsort(k); k = k[o]; u = u[o]; v = v[o]
    idx = np.r_[0, np.flatnonzero(np.diff(k)) + 1, len(k)]
    for i0, i1 in zip(idx[:-1], idx[1:]):
        if i1 - i0 < nmin: continue
        vv = v[i0:i1]; t = np.percentile(vv, pct); q = (vv > t - band) & (vv < t + .15)
        if q.sum() >= min(3, nmin): out.append((u[i0:i1][q].mean(), vv[q].mean(), q.sum()))
    return np.array(out)


# ================================================================================================ the build
def main():
    ways = osm_ways()
    W = way_xz(ways[105571105])
    assert len(W) == 15, 'OSM way 105571105 is not the one this was written against'
    # the ride's frame: a along OSM's launch leg (its nodes 14 -> 12, station end to tower), b across, launch side positive
    U = unit(W[12] - W[14]); V = np.array([-U[1], U[0]])
    x, z, el, cl = load_lidar(2019)
    a = x * U[0] + z * U[1]; b = x * V[0] + z * V[1]
    xo, zo, elo, clo = load_lidar(2010)
    ao = xo * U[0] + zo * U[1]; bo = xo * V[0] + zo * V[1]

    # ---------------------------------------------------------------- ground and datum
    gnd = cl == 2
    cell = 2.0; x0, z0 = x.min(), z.min(); nx = int((x.max() - x0) / cell) + 1; nz = int((z.max() - z0) / cell) + 1
    G = fill_nan(grid_median(x[gnd], z[gnd], el[gnd], x0, z0, cell, nx, nz))

    def ground_at(px, pz):
        ix = np.clip(np.floor((np.asarray(px) - x0) / cell).astype(int), 0, nx - 1); iz = np.clip(np.floor((np.asarray(pz) - z0) / cell).astype(int), 0, nz - 1)
        return G[iz, ix]
    hag = el - ground_at(x, z)

    # OSM's two legs in (a, b), as first guesses of where to look
    Wa, Wb = W @ U, W @ V
    guess = {'launch': np.polyfit(Wa[[14, 12]], Wb[[14, 12]], 1)[::-1], 'hill': np.polyfit(Wa[[5, 8]], Wb[[5, 8]], 1)[::-1]}
    tower_box = (a > 150) & (a < 194) & (np.abs(b) < 30)
    keep = (cl == 1) | ((cl == 18) & tower_box & (hag < 150))     # the vendor classed the upper tower as high noise
    obj = keep & (hag > 0.8)

    # ---------------------------------------------------------------- the two legs in plan: straight lines on the rail returns
    lines = {}
    for nm, a0, a1 in (('launch', -105, 150), ('hill', -188, 150)):
        c0, c1 = guess[nm]
        for half in (3.0, 1.2, 1.0, 1.0):
            m = obj & (a > a0) & (a < a1) & (np.abs(b - (c0 + c1 * a)) < half)
            k = np.floor(a[m]).astype(int); o = np.argsort(k); k = k[o]; am = a[m][o]; bm = b[m][o]; em = el[m][o]
            idx = np.r_[0, np.flatnonzero(np.diff(k)) + 1, len(k)]; rows = []
            for i0, i1 in zip(idx[:-1], idx[1:]):
                if i1 - i0 < 4: continue
                t = np.percentile(em[i0:i1], 97); q = (em[i0:i1] > t - .3) & (em[i0:i1] < t + .15)
                if q.sum() >= 5 and .6 < np.ptp(bm[i0:i1][q]) < 1.5: rows.append((am[i0:i1][q].mean(), bm[i0:i1][q].mean(), np.ptp(bm[i0:i1][q])))
            R = np.array(rows); ok = np.ones(len(R), bool)
            for _ in range(4):
                co = np.polyfit(R[ok, 0], R[ok, 1], 1); res = R[:, 1] - np.polyval(co, R[:, 0]); ok = np.abs(res) < max(.15, 2.5 * res[ok].std())
            c1, c0 = co
        lines[nm] = (c0, c1, float(res[ok].std()), int(ok.sum()), float(np.median(R[ok, 2])))
        say(f'{nm} leg in plan: b = {c0:.3f} {c1:+.5f} a   rms {res[ok].std():.3f} m over {ok.sum()} one-metre bins')
    cL, cH = lines['launch'], lines['hill']; rail_span = (cL[4] + cH[4]) / 2
    nL, nH = math.hypot(1, cL[1]), math.hypot(1, cH[1])
    uL = (U + cL[1] * V) / nL; vL = (V - cL[1] * U) / nL; oL = cL[0] * V          # launch line: direction (toward the tower), its left... b side, a point on it
    uH = (U + cH[1] * V) / nH; vH = (V - cH[1] * U) / nH; oH = cH[0] * V
    say(f'the legs differ in heading by {math.degrees(math.atan(cL[1]) - math.atan(cH[1])):.2f} degrees; they are {cL[0] + cL[1] * 160 - cH[0] - cH[1] * 160:.2f} m apart at the tower, '
        f'{cL[0] - cL[1] * 185 - cH[0] + cH[1] * 185:.2f} m at the turnaround')

    def frame(line_o, line_u, line_v, px, pz):
        """a point's distance along a leg (from the foot of the scene origin on it, toward the tower) and across it (b side)"""
        return (px - line_o[0]) * line_u[0] + (pz - line_o[1]) * line_u[1], (px - line_o[0]) * line_v[0] + (pz - line_o[1]) * line_v[1]
    dLp, qLp = frame(oL, uL, vL, x, z); dHp, qHp = frame(oH, uH, vH, x, z)

    # the datum: the median ground within 12 m of the track
    near = gnd & (((np.abs(qLp) < 12) & (dLp > -200) & (dLp < 170)) | ((np.abs(qHp) < 12) & (dHp > -200) & (dHp < 170)) | ((a > 160) & (a < 190) & (np.abs(b) < 25)))
    datum = float(np.median(el[near]))
    Y = el - datum; Yo = elo - datum
    say(f'ground under the ride: median {datum:.2f} m (the datum), 5th..95th percentile {np.percentile(el[near], 5) - datum:+.2f} .. {np.percentile(el[near], 95) - datum:+.2f} m')
    relief = []
    for a0 in range(-200, 190, 20):
        m = near & (a >= a0) & (a < a0 + 20)
        if m.sum() > 20: relief.append([a0 + 10, round(float(np.median(el[m]) - datum), 2)])
    say('ground along the ride (a, m above datum):', relief)
    g_tower = float(np.median(el[gnd & (a > 150) & (a < 190) & (np.abs(b) < 22)]) - datum)

    # ---------------------------------------------------------------- the two legs in profile
    # each leg, seen from the side with the tower on the left: e = distance from the tower end back toward the station, y up.
    # The curve starts on the vertical run heading straight down and turns toward +e; its curvature runs straight between knots.
    def fit_leg(nm, lo_, lu_, lv_, e_free_to, e_end, y_start):
        d, q = frame(lo_, lu_, lv_, x, z)
        m = obj & (np.abs(q) < 0.75) & (d < E_TOW) & (E_TOW - d < e_end + 3) & (Y < y_start + 3)
        e = E_TOW - d[m]; yy = Y[m]
        # the 2010 survey saw more of the track where it stands up against the tower (its returns there are class 7)
        d2, q2 = frame(lo_, lu_, lv_, xo, zo)
        m2 = (clo != 2) & (np.abs(q2) < 0.75) & (d2 < E_TOW) & (E_TOW - d2 < 40) & (Yo > 28) & (Yo < y_start + 3)
        e = np.r_[e, E_TOW - d2[m2]]; yy = np.r_[yy, Yo[m2]]
        # first sight of the rails: the top of the cloud where the track is flat, its edge toward the station and the sky where it stands up
        flat = top_bins(e, yy, 1.0); flat = flat[flat[:, 0] > 52]
        r2 = math.sqrt(.5); st = e < 62
        steep = top_bins((yy[st] - e[st]) * r2, (yy[st] + e[st]) * r2, 1.5, band=.4, nmin=1, pct=100)
        se = (steep[:, 1] - steep[:, 0]) * r2; sy = (steep[:, 1] + steep[:, 0]) * r2
        ks = (se <= 52) & (sy < y_start + 1); se, sy = se[ks], sy[ks]; o = np.argsort(-sy); se, sy = se[o], sy[o]
        for _ in range(3):                                             # the edge runs outward as it comes down: drop what does not
            med = np.array([np.median(se[max(0, i - 3):i + 4]) for i in range(len(se))]); ok = np.abs(se - med) < 1.0; se, sy = se[ok], sy[ok]
        P = np.r_[np.c_[se, sy], flat[np.argsort(flat[:, 0]), :2]]
        if DEBUG: print(nm, 'first sight, top:', np.round(P[:14], 2).tolist())
        if P[0, 1] < y_start - 3:
            # no sight of the rails up to the start: carry the bend on (a parabola through the highest 15 m seen) to where it stands vertical
            top = (P[:, 1] > P[0, 1] - 15) & (np.arange(len(P)) < len(se)); c2, c1, c0 = np.polyfit(P[top, 1], P[top, 0], 2); yv = min(-c1 / (2 * c2), y_start) if c2 > 0 else P[0, 1]
            yb = np.arange(yv, P[0, 1], -1.0); P = np.r_[[[np.polyval([c2, c1, c0], yv), y_start + 2]], np.c_[np.polyval([c2, c1, c0], yb), yb], P]
        else:
            P = np.r_[[[P[0, 0], y_start + 2]], P[P[:, 1] < y_start + 1.5]]
        # a first curve through that: headings from short straight fits along it, curvature from the headings
        s0 = np.r_[0, np.cumsum(np.hypot(*np.diff(P, axis=0).T))]
        sg = np.arange(0, s0[-1], 1.0); eg = np.interp(sg, s0, P[:, 0]); yg = np.interp(sg, s0, P[:, 1])
        i_st = int(np.argmin(np.abs(yg - y_start))); eg, yg, sg = eg[i_st:], yg[i_st:], sg[i_st:] - sg[i_st]
        th = np.empty(len(sg))
        for i in range(len(sg)):
            j0, j1 = max(0, i - 6), min(len(sg), i + 7); th[i] = math.atan2(np.polyfit(np.arange(j0, j1), yg[j0:j1], 1)[0], np.polyfit(np.arange(j0, j1), eg[j0:j1], 1)[0])
        th = np.unwrap(th); th[:3] = -math.pi / 2
        dk = 5.0; S = sg[-1]; sk = np.arange(0, S + dk, dk)
        kk = np.gradient(np.interp(sk, sg, th), dk); kk[0] = 0
        free = (sk > 1) & (np.interp(sk, sg, eg) < e_free_to)
        p = np.r_[eg[0], kk[free]]
        regw = np.where(np.interp(sk, sg, yg)[1:-1] > 30, 5.0, 1.0)      # few returns on the steep part: hold the curvature smoother there
        if DEBUG: print(nm, 'P top', np.round(P[:5], 2).tolist(), 'S', S, 'th0..', np.round(np.degrees(th[:40:4]), 1), 'free', free.sum(), 'kk', np.round(kk[:12], 4))

        def curve(p):
            k = np.zeros(len(sk)); k[free] = p[1:]
            return integrate((p[0], y_start), -math.pi / 2, sk, k, S=sk[-1])

        def stage(p, pe, py, w, lo, hi, hi_steep=None):
            hi_steep = hi if hi_steep is None else hi_steep
            s, X, Yc, t = curve(p)
            si, dn = project(pe, py, s, X, Yc, t); ok = (dn > lo) & (dn < np.where(py > 30, hi_steep, hi)) & (si > 0) & (si < s[-1])
            pe, py, ps, w = pe[ok], py[ok], si[ok], w[ok]

            def res(p):
                s, X, Yc, t = curve(p); k = np.zeros(len(sk)); k[free] = p[1:]
                return np.r_[normal_dist(pe, py, ps, s, X, Yc, t) * w, REG * regw * np.diff(k, 2) * dk]
            return gauss_newton(res, p, iters=6, eps=np.r_[1e-4, np.full(len(p) - 1, 1e-7)])
        for _ in range(5): p = stage(p, P[:, 0], P[:, 1], np.full(len(P), 3.0), -9, 9)        # onto the first sight of the rails
        w = np.where(yy > 25, 3.0, 1.0)                                # few returns on the steep part: weigh them up so the long flat does not outvote them
        # then onto the returns themselves. Where the track stands up there is only air on the riders' side of it, so anything
        # found there IS the track: reach out for it first, then close in
        for lo, hi, hs in ((-.5, .5, 4.), (-.4, .4, 2.5), (-.35, .35, 1.5), (-.3, .35, 1.), (-.25, .3, 1.), (-.22, .28, 1.), (-.22, .28, 1.), (-.22, .28, 1.)): p = stage(p, e, yy, w, lo, hi, hs)
        s, X, Yc, t = curve(p)
        si, dn = project(e, yy, s, X, Yc, t); ok = (dn > -.3) & (dn < np.where(yy > 30, 1., .3)) & (si > 0) & (si < s[-1])
        cx = X + np.sin(t) * RAIL / 2; cy = Yc - np.cos(t) * RAIL / 2  # the lidar's surface is the top of the rails: the centreline is half a rail under it
        say(f'{nm} profile: {ok.sum()} returns within 0.3 m of the fitted rail tops, rms {dn[ok].std():.3f} m (median {np.median(dn[ok]):+.3f}); '
            f'above 25 m {(ok & (yy > 25)).sum()} returns, rms {dn[ok & (yy > 25)].std():.3f} m; the track stands vertical {E_TOW - p[0]:.2f} m along the leg')
        if DEBUG: np.savez(os.path.join(DEBUG, f'leg_{nm}.npz'), e=e, y=yy, s=s, X=cx, Y=cy, th=t, si=si, dn=dn, P=P, sk=sk, k=np.interp(s, sk, np.r_[0, p[1:]][np.cumsum(free) * free]))
        cut = int(np.argmax(cx > e_end)) if (cx > e_end).any() else len(cx)   # the fitted curve, as far as asked for
        lowl = (dn > -1.5) & (dn < -.55) & (yy > 8) & (si > 0) & (si < s[-1])   # the layer of returns under the rails: the truss's lower chords (the catwalks, on the launch track)
        return s[:cut], cx[:cut], cy[:cut], t[:cut], (int(ok.sum()), float(dn[ok].std()), float(-np.median(dn[lowl])) if lowl.sum() > 30 else None)

    Y_UP0, Y_DN1 = 76.0, 76.0                                          # where the fitted profiles take over from the vertical runs (above the datum)
    sA, eA, yA, tA, fitA = fit_leg('launch', oL, uL, vL, E_TOW - 85, E_TOW + 104, Y_UP0)
    sE, eE, yE, tE, fitE = fit_leg('hill', oH, uH, vH, E_TOW + 172, E_TOW + 186, Y_DN1)
    # ---------------------------------------------------------------- the top hat
    # Both surveys saw its rails from above (2019 as class 18, 2010 as class 7). It lies in a plane square to the launch leg.
    TB = (a > 150) & (a < 194) & (np.abs(b) < 30) & (cl != 2) & (cl != 7) & (hag < 150)
    TBo = (ao > 150) & (ao < 194) & (np.abs(bo) < 30) & (clo != 2) & (Yo < 150)
    ta, tb, tY = np.r_[a[TB], ao[TBo]], np.r_[b[TB], bo[TBo]], np.r_[Y[TB], Yo[TBo]]
    crest = (tY > np.percentile(tY[tY > 120], 60)) & (ta > 157.5) & (ta < 162.2) & (np.abs(tb) < 6)
    hh, ee = np.histogram(ta[crest], bins=np.arange(157.5, 162.21, .1)); cs = np.convolve(hh, np.ones(21), 'valid')   # the 2.1 m wide band that holds most of the crest
    a_T = float(ee[np.argmax(cs)] + 1.05)
    m = (np.abs(ta - a_T) < 0.85) & (tY > 100)
    hb, hY = tb[m], tY[m]
    J, dj = 10, 3.0; sj = np.arange(J + 1) * dj; S_half = 48.0

    def half(p):
        c = np.r_[np.abs(p[2:]), 0.0]; k = -(math.pi / 2) * c / (np.sum((c[1:] + c[:-1]) * dj / 2))
        return integrate((0.0, p[1]), 0.0, np.r_[sj, S_half], np.r_[k, 0.0], S=S_half)
    p = np.r_[np.median(hb[hY > hY.max() - 3]), np.percentile(hY, 99.5), np.linspace(1, .1, J)]
    for lo, hi in ((-1.2, 1.5), (-.7, 1.0), (-.45, .6), (-.3, .4), (-.25, .35), (-.25, .35), (-.25, .35)):
        s_, X_, Y_, t_ = half(p); si, dn = project(np.abs(hb - p[0]), hY, s_, X_, Y_, t_); ok = (dn > lo) & (dn < hi) & (si > -.5) & (si < S_half - 1)
        qb, qY, qs = hb[ok], hY[ok], si[ok]

        def res(p):
            s_, X_, Y_, t_ = half(p); c = np.r_[np.abs(p[2:]), 0.0]
            return np.r_[normal_dist(np.abs(qb - p[0]), qY, np.clip(qs, 0, None), s_, X_, Y_, t_), 12.0 * np.diff(np.r_[c[1], c] / np.sum(c), 2), 0.05 * (np.sum(c) - 5)]
        p = gauss_newton(res, p, iters=8, eps=np.r_[1e-4, 1e-4, np.full(J, 1e-5)])
    s_, X_, Y_, t_ = half(p); si, dn = project(np.abs(hb - p[0]), hY, s_, X_, Y_, t_); ok = (np.abs(dn) < .35) & (si > -.5) & (si < S_half - 1)
    b_c, W_top, top_rail = float(p[0]), float(X_[-1]), float(p[1])
    i_v = int(np.argmax(t_ <= -math.pi / 2 + 1e-9)); Y_C = float(Y_[i_v])     # where the curve has become vertical
    kmax = float(np.max(np.abs(np.gradient(t_, s_))))
    say(f'top hat: plane a = {a_T:.2f}; crest at b = {b_c:.2f}, top of rail {top_rail:.2f} m above the datum = {top_rail - g_tower:.2f} m above the ground at the tower\'s foot; '
        f'half-width {W_top:.2f} m; vertical below {Y_C:.1f} m; tightest radius {1 / kmax:.1f} m; {ok.sum()} returns within 0.35 m, rms {dn[ok].std():.3f} m')
    if DEBUG: np.savez(os.path.join(DEBUG, 'tophat.npz'), b=hb, Y=hY, s=s_, X=X_, Yc=Y_, th=t_, p=p, dn=dn, si=si, ta=ta, tb=tb, tY=tY)
    # ---------------------------------------------------------------- the two vertical runs
    Yv = np.array([0., 1., 0.])
    v3 = lambda h: np.array([h[0], 0., h[1]])                           # a plan vector (x, z) as a scene vector
    def roll(n0, t, phi): return n0 * math.cos(phi) + np.cross(t, n0) * math.sin(phi)      # n0 rolled to the riders' right about t
    def roll_angle(n0, n1, t): return math.atan2(np.cross(t, n0) @ n1, n0 @ n1) % (2 * math.pi)
    b_u, b_d = b_c + W_top, b_c - W_top                                # where the top hat's two sides stand (rail tops; the centreline is RAIL / 2 inside)
    PA = oL + uL * (E_TOW - eA[0]); PE = oH + uH * (E_TOW - eE[0])       # the centreline where each fitted leg stands vertical (x, z)
    PCu = a_T * U + (b_u - RAIL / 2) * V; PCd = a_T * U + (b_d + RAIL / 2) * V
    # going up: the track starts facing the station (riders' up = back along the launch) and ends facing outward. The 2010
    # returns show the truss sliding toward the tower's middle as it turns: find where (the returns lie between the rails and the
    # truss's far chords, which move from behind the rails to inside them)
    bL_T = cL[0] + cL[1] * a_T; DEPTH = round(fitE[2], 2)               # the box truss's depth: how far under the rails' tops the hill leg's second layer of returns lies
    say(f'box truss: its lower chords return {fitE[2]:.2f} m under the rail tops on the hill leg (the catwalks {fitA[2]:.2f} m under them on the launch track); the rails\' returns span {rail_span:.2f} m across')
    mu_ = (np.abs(ta - a_T) < 1.3) & (tb > bL_T - 3.2) & (tb < bL_T + 1.2) & (tY > 62) & (tY < 110)
    tries = []
    for y1 in np.arange(Y_UP0, 97, 1.0):
        for wd in np.arange(8, 45, 2.0):
            if y1 + wd > Y_C: continue                                 # the roll has to fit on the vertical run
            S_ = ramp((tY[mu_] - y1) / wd); br = bL_T + (b_u - bL_T) * S_
            dist = np.maximum(0, np.maximum(tb[mu_] - br, br - DEPTH * S_ - tb[mu_])); sc = np.sum(np.minimum(dist, 1.0) ** 2)
            tries.append((float(sc), y1, wd, float(np.sqrt(np.mean(dist[dist < 1.0] ** 2))), int((dist < 1.0).sum())))
    best = min(tries); ok_ = [t_ for t_ in tries if t_[0] <= 1.15 * best[0]]
    # the returns are few (a 1.2 m slide against 0.3 m of scatter): of the placements that fit them within 15 % of the best,
    # take the LONGEST, the gentlest roll they allow
    _, Yu1, wu, rms_u, n_u = max(ok_, key=lambda t_: (t_[2], -t_[0])); Yu2 = Yu1 + wu
    say(f'up run: best fit of the slide {best[1]:.0f}-{best[1] + best[2]:.0f} m (misfit {best[0]:.2f}); longest within 15 % of it {Yu1:.0f}-{Yu2:.0f} m; '
        f'over the whole vertical run ({Y_UP0:.0f}-{Y_C:.0f} m) the misfit would be {min(t_[0] for t_ in tries if t_[1] == Y_UP0 and t_[1] + t_[2] >= Y_C - 2.5):.2f}')
    phi_up = roll_angle(-v3(uL), v3(V), Yv)
    say(f'up run: the track turns {math.degrees(phi_up):.1f} degrees to the right and slides {b_u - bL_T:+.2f} m across between {Yu1:.0f} and {Yu2:.0f} m above the datum '
        f'({n_u} returns within 1 m of the modelled truss, rms {rms_u:.2f} m)')
    # coming down: the returns wind round a vertical axis the long way (270 degrees to the riders' right). Model: the track
    # rolls about a line r above the rails; find where the roll starts and ends, and r, from the returns
    bH_T = cH[0] + cH[1] * a_T
    md_ = (ta > 155.3) & (ta < 162.6) & (tb > bH_T - 3.4) & (tb < bH_T + 3.6) & (tY > 70) & (tY < 121)
    n_t, n_b = v3(-V), v3(-uH); phi_dn = roll_angle(n_t, n_b, -Yv)

    def down_run(Yq, y0, y1, r, r0=None, th0=None):
        """the centreline (x, z) and the riders' up at heights Yq on the descent, for a roll from y0 down to y1 about a line r above the rails
        (r0, th0: where the top hat's own curve is at each height and how it points; looked up by height if not given)"""
        w = ramp((y0 - Yq) / (y0 - y1))
        if r0 is None:
            k = np.clip(np.searchsorted(-Y_, -Yq), 1, len(Y_) - 1); f = np.clip((Y_[k - 1] - Yq) / np.maximum(Y_[k - 1] - Y_[k], 1e-9), 0, 1)
            r0 = X_[k - 1] + (X_[k] - X_[k - 1]) * f; th0 = t_[k - 1] + (t_[k] - t_[k - 1]) * f
        base = (a_T * U)[None, :] + (b_c - r0 + RAIL / 2 * np.sin(-th0))[:, None] * V[None, :]
        T0 = np.c_[np.cos(th0) * -V[0], np.sin(th0), np.cos(th0) * -V[1]]; N0 = np.c_[np.sin(th0) * V[0], np.cos(th0), np.sin(th0) * V[1]]
        N = np.array([roll(N0[i], T0[i], phi_dn * w[i]) for i in range(len(Yq))])
        delta = (PE + r * n_b[[0, 2]]) - (PCd + r * n_t[[0, 2]])
        P = base + r * N0[:, [0, 2]] - r * N[:, [0, 2]] + delta[None, :] * w[:, None]
        return P, N, N0, w
    best = None; pd_ = np.c_[ta[md_] * U[0] + tb[md_] * V[0], ta[md_] * U[1] + tb[md_] * V[1]]; by_r = {}
    for r in (0.0, 0.35, 0.7, 1.05, 1.4, 1.75, 2.1):
        for y0 in np.arange(108, 125, 1.0):
            for y1 in np.arange(Y_DN1 + 1, 86, 1.0):
                Pq, Nq, _, _ = down_run(tY[md_], y0, y1, r)
                d0 = pd_ - Pq; t = np.clip(-(d0[:, 0] * Nq[:, 0] + d0[:, 1] * Nq[:, 2]) / DEPTH, 0, 1)       # nearest point of the rails-to-chords segment
                dist = np.hypot(d0[:, 0] + t * DEPTH * Nq[:, 0], d0[:, 1] + t * DEPTH * Nq[:, 2]); sc = np.sum(np.minimum(dist, 1.2) ** 2)
                if best is None or sc < best[0]: best = (sc, y0, y1, r, float(np.sqrt(np.mean(dist[dist < 1.2] ** 2))), int((dist < 1.2).sum()))
                by_r[r] = min(by_r.get(r, 1e9), float(sc))
    _, Yd0, Yd1, r_dn, rms_d, n_d = best
    say(f'down run: the track rolls {math.degrees(phi_dn):.1f} degrees to the right between {Yd0:.0f} and {Yd1:.0f} m above the datum, about a line {r_dn:.2f} m above the rails '
        f'({n_d} of {md_.sum()} returns within 1.2 m of the modelled truss, rms {rms_d:.2f} m)')
    say('  the same fit\'s misfit for each radius tried: ' + ', '.join(f'{r_:.2f} m: {v_:.0f}' for r_, v_ in by_r.items()))
    if DEBUG: np.savez(os.path.join(DEBUG, 'runs.npz'), pu=np.c_[ta[mu_], tb[mu_], tY[mu_]], pd=np.c_[ta[md_], tb[md_], tY[md_]], Yu=[Yu1, Yu2], Yd=[Yd0, Yd1, r_dn])

    # ---------------------------------------------------------------- the turnaround, in plan
    # from the end of the fitted hill leg (on the hill line, heading away from the tower) round to the launch line
    dE1 = E_TOW - eE[-1]; dA1 = E_TOW - eA[-1]                           # where the fitted legs end, along their lines
    aE1 = dE1 / nH; p0 = np.array([aE1, cH[0] + cH[1] * aE1])           # in (a, b)
    psi0 = math.pi + math.atan(cH[1]); psi1 = math.atan(cL[1]); turn = psi1 - psi0       # about -178 degrees: clockwise in (a, b), a LEFT turn on the ground
    gap = (cL[0] + cL[1] * aE1) - p0[1]; R0 = gap / 2
    dkt = 3.0; S_t = 6 + math.pi * R0 + 14; skt = np.arange(0, S_t + dkt, dkt)
    rail_y0 = yE[-1] + RAIL / 2                                         # rail-top height where the turn starts; it falls about 4.5 % from there
    mt = obj & (a < aE1 + 4) & (a > aE1 - 2 * R0 - 6) & (b > p0[1] - 3) & (b < p0[1] + gap + 3)
    far = mt & (np.abs(b - p0[1] - gap / 2) < 1.5) & (np.abs(Y - (rail_y0 - 0.045 * (3 + math.pi * R0 / 2))) < .4)
    a_far = float(np.median(a[far])); L0 = max(.5, aE1 - (a_far + R0))  # the returns at the far end of the U say where it turns
    if DEBUG: print('turn: start a', aE1, 'far end', a_far, 'gap', gap, 'R0', R0, 'L0', L0, 'rail_y0', rail_y0)
    k0 = np.where((skt > L0) & (skt < L0 + math.pi * R0), -1 / R0, 0.0); freet = (skt > 1) & (skt < S_t - 6)

    def turn_curve(p):
        k = np.zeros(len(skt)); k[freet] = p; return integrate(p0, psi0, skt, k, S=skt[-1])
    p = k0[freet]
    for tol, hy in ((1.3, .45), (1.0, .4), (.85, .35), (.8, .3), (.8, .3)):
        s_t, Xt, Yt, tt = turn_curve(p); si, dn = project(a[mt], b[mt], s_t, Xt, Yt, tt)
        ok = (np.abs(dn) < tol) & (si > 0) & (si < s_t[-1]) & (np.abs(Y[mt] - (rail_y0 - 0.045 * si)) < hy)
        qa, qb, qs = a[mt][ok], b[mt][ok], si[ok]

        def res(p):
            s_t, Xt, Yt, tt = turn_curve(p); k = np.zeros(len(skt)); k[freet] = p
            off = Yt[-1] - (cL[0] + cL[1] * Xt[-1])                     # the end must lie on the launch line, heading along it
            return np.r_[normal_dist(qa, qb, qs, s_t, Xt, Yt, tt), 6 * np.diff(k, 2) * dkt, 30 * off, 300 * (tt[-1] - psi0 - turn)]
        p = gauss_newton(res, p, iters=8)
    s_t, Xt, Yt, tt = turn_curve(p); si, dn = project(a[mt], b[mt], s_t, Xt, Yt, tt)
    ok = (np.abs(dn) < .8) & (si > 0) & (si < s_t[-1]) & (np.abs(Y[mt] - (rail_y0 - 0.045 * si)) < .3)
    kt = np.gradient(tt, s_t); i_min = int(np.argmin(Xt))
    say(f'turnaround: {ok.sum()} returns on its rails, rms {np.sqrt(np.mean((np.abs(dn[ok]) - np.abs(dn[ok]).mean()) ** 2)):.3f} m about two lines {2 * np.abs(dn[ok]).mean():.2f} m apart; '
        f'tightest radius {1 / np.abs(kt).max():.2f} m; it reaches a = {Xt.min():.2f}; ends on the launch line within {abs(Yt[-1] - cL[0] - cL[1] * Xt[-1]) * 1000:.0f} mm, {math.degrees(tt[-1] - psi0 - turn):+.3f} degrees')
    # banking: does the outer rail stand higher? (the height of the rail returns against their distance from the centreline)
    arc = ok & (np.abs(np.interp(si, s_t, kt)) > .5 * np.abs(kt).max()) & (np.abs(dn) > .25)
    side = np.sign(dn[arc]); hres = Y[mt][arc] - (rail_y0 - 0.045 * si[arc])
    dyo = float(np.median(hres[side > 0]) - np.median(hres[side < 0])); gauge_seen = 2 * float(np.abs(dn[arc]).mean())
    bank_deg = math.degrees(math.asin(np.clip(dyo / gauge_seen, -1, 1)))    # dn > 0 is the left of travel in (a, b)... the OUTSIDE of this turn
    say(f'turnaround banking: the outer rail is {dyo:+.3f} m against the inner over {gauge_seen:.2f} m ({arc.sum()} returns): {bank_deg:+.1f} degrees')
    if DEBUG: np.savez(os.path.join(DEBUG, 'turn.npz'), a=a[mt], b=b[mt], Y=Y[mt], X=Xt, Yc=Yt, s=s_t, th=tt, dn=dn, si=si, ok=ok)
    # ---------------------------------------------------------------- from the turnaround through the station to the launch incline
    # In plan: the fitted turn, then the launch line, leaving it by LANE for one of the two station lanes. What the roof hides
    # (a = A_IN .. A_OUT) is assumed: straight, parallel to the launch line, with S-curves at each end from where the lanes are
    # seen to part (A_SPLIT) and to meet again (A_MERGE).
    A_SPLIT, A_IN, A_OUT, A_MERGE = -178.5, -166.5, -144.0, -130.5
    A_ST0 = -163.0; A_ST1 = A_ST0 + TRAIN + 1                            # where the train stands
    i_cut = int(np.argmax((np.arange(len(Xt)) > i_min) & (Xt > A_SPLIT - 3.5)))
    aA1 = dA1 / nL
    def lane_path(sign):
        aa = np.arange(Xt[i_cut], aA1, 0.05); aa = np.r_[aa, aA1]
        off = sign * LANE * (smoothstep((aa - A_SPLIT) / (A_IN - A_SPLIT)) - smoothstep((aa - A_OUT) / (A_MERGE - A_OUT)))
        return np.c_[aa, cL[0] + cL[1] * aa + off / nL * 1.0]
    lane = lane_path(+1)                                               # the lane the modelled train uses: the one away from the brake run
    F_ab = np.r_[np.c_[Xt[:i_cut], Yt[:i_cut]], lane]
    sF = np.r_[0, np.cumsum(np.hypot(*np.diff(F_ab, axis=0).T))]
    # heights: the top of the returns along that path (not under the roof), then a curve whose SLOPE runs straight between knots
    mF = obj & (a < aA1 + 1) & (b > p0[1] - 2) & (b < cL[0] + LANE + 3) & (Y < yE[-1] + .7) & ~((a > -170.5) & (a < -136.5) & (b > 0))
    fa, fb, fY = a[mF], b[mF], Y[mF]
    j = np.empty(len(fa), int); dmin = np.empty(len(fa))
    Fs = F_ab[::4]; sFs = sF[::4]
    for i0_ in range(0, len(fa), 500):
        d2 = (fa[i0_:i0_ + 500, None] - Fs[None, :, 0]) ** 2 + (fb[i0_:i0_ + 500, None] - Fs[None, :, 1]) ** 2
        j[i0_:i0_ + 500] = np.argmin(d2, 1); dmin[i0_:i0_ + 500] = np.sqrt(np.min(d2, 1))
    onp = dmin < 0.75; env = top_bins(sFs[j][onp], fY[onp], 2.0, band=.25, nmin=4)
    dkh = 4.0; skh = np.arange(0, sF[-1] + dkh, dkh); skh[-1] = sF[-1]; K = len(skh)
    fine = np.linspace(0, sF[-1], 4000); hat = np.array([np.interp(fine, skh, np.eye(K)[k]) for k in range(K)]).T
    Bm = np.vstack([np.zeros(K), np.cumsum((hat[1:] + hat[:-1]) / 2 * (fine[1] - fine[0]), axis=0)])       # the integral of each knot's hat
    m0, m1 = math.tan(tE[-1]), -math.tan(tA[-1]); g0, g1 = yE[-1], yA[-1]
    es, ey = env[:, 0], env[:, 1] - RAIL / 2; keep_e = np.ones(len(es), bool)
    for _ in range(4):
        rows = np.array([np.interp(es[keep_e], fine, Bm[:, k]) for k in range(K)]).T
        Aeq = np.vstack([rows, 60 * Bm[-1][None, :], 8 * np.diff(np.eye(K), 2, axis=0)]); beq = np.r_[ey[keep_e] - g0, 60 * (g1 - g0), np.zeros(K - 2)]
        fixed = np.zeros(K); fixed[0], fixed[-1] = m0, m1
        mk = fixed.copy(); mk[1:-1] = np.linalg.lstsq(Aeq[:, 1:-1], beq - Aeq @ fixed, rcond=None)[0]
        gF = g0 + Bm @ mk; r_ = ey - np.interp(es, fine, gF); keep_e = np.abs(r_) < max(.12, 2.5 * r_[keep_e].std())
    say(f'turnaround to launch: heights from {keep_e.sum()} two-metre bins of rail returns, rms {r_[keep_e].std():.3f} m; the track is level at {np.interp(sF[np.argmin(np.abs(F_ab[:, 0] + 125))], fine, gF):.2f} m '
        f'through the station exit and starts to climb near a = {F_ab[np.argmax((np.interp(sF, fine, np.gradient(gF, fine)) > .012) & (F_ab[:, 0] > -135) & (np.arange(len(sF)) > i_cut)), 0]:.0f}')
    yF = np.interp(sF, fine, gF)
    if DEBUG: np.savez(os.path.join(DEBUG, 'F.npz'), F=F_ab, sF=sF, yF=yF, env=env, pts=np.c_[sFs[j][onp], fY[onp]])

    # ---------------------------------------------------------------- the whole circuit, in order of travel
    def piece(xz, y, n, tag): return {'p': np.c_[xz[:, 0], y, xz[:, 1]], 'n': n, 'tag': tag}
    ab2xz = lambda A_: A_[:, :1] * U[None, :] + A_[:, 1:2] * V[None, :]
    pieces = []
    # A: the launch incline and the pull-up (the fit ran the other way)
    xzA = oL[None, :] + (E_TOW - eA)[:, None] * uL[None, :]
    nA = np.c_[np.sin(tA) * uL[0], np.cos(tA), np.sin(tA) * uL[1]]
    pieces.append(piece(xzA[::-1], yA[::-1], nA[::-1], 'A'))
    # B: the vertical run up, turning to face outward as it slides across
    yb = np.arange(Y_UP0, Y_C, 0.1)[1:]; Sb = ramp((yb - Yu1) / (Yu2 - Yu1))
    xzB = PA[None, :] + (PCu - PA)[None, :] * Sb[:, None]
    nB = np.array([roll(-v3(uL), Yv, phi_up * q) for q in Sb])
    pieces.append(piece(xzB, yb, nB, 'B'))
    # C: the top hat's rising half (the fitted half-curve, mirrored): b = b_c + r, riders' up outward
    up = np.arange(i_v, -1, -1); rr = X_[up] - RAIL / 2 * np.sin(-t_[up]); yy_ = Y_[up] - RAIL / 2 * np.cos(t_[up])
    xzC = (a_T * U)[None, :] + (b_c + rr)[:, None] * V[None, :]
    nC = np.c_[np.sin(-t_[up]) * V[0], np.cos(t_[up]), np.sin(-t_[up]) * V[1]]
    pieces.append(piece(xzC, yy_, nC, 'C'))
    # D: the falling half and the vertical run down, rolling 270 degrees
    yv_ = np.arange(Y_[i_v] - .1, Y_DN1 + .05, -0.1)
    yd = np.r_[Y_[1:i_v + 1] - RAIL / 2 * np.cos(t_[1:i_v + 1]), yv_ - RAIL / 2 * 0]
    Pd, Nd, _, _ = down_run(yd, Yd0, Yd1, r_dn, np.r_[X_[1:i_v + 1], np.full(len(yv_), X_[i_v])], np.r_[t_[1:i_v + 1], np.full(len(yv_), -math.pi / 2)])
    n_dc = i_v                                                         # D's first points are still the top hat's curve
    pieces.append(piece(Pd, yd, Nd, 'D'))
    # E: pull-out, hill, brake run
    xzE = oH[None, :] + (E_TOW - eE)[:, None] * uH[None, :]
    nE = np.c_[np.sin(tE) * uH[0], np.cos(tE), np.sin(tE) * uH[1]]
    pieces.append(piece(xzE, yE, nE, 'E'))
    # F: turnaround, station lane, the start of the launch track (no banking: the returns on the turn's two rails are level)
    xzF = ab2xz(F_ab)[1:-1]; pF = np.c_[xzF[:, 0], yF[1:-1], xzF[:, 1]]
    tF = np.gradient(pF, axis=0); tF /= np.linalg.norm(tF, axis=1)[:, None]
    nF = Yv[None, :] - tF[:, 1:2] * tF; nF /= np.linalg.norm(nF, axis=1)[:, None]
    pieces.append({'p': pF, 'n': nF, 'tag': 'F'})
    pieces[3]['tag'] = ['C'] * n_dc + ['D'] * (len(yd) - n_dc)
    P3 = np.vstack([q['p'] for q in pieces]); N3 = np.vstack([q['n'] for q in pieces]); tag = np.concatenate([[q['tag']] * len(q['p']) if isinstance(q['tag'], str) else q['tag'] for q in pieces])
    seg = np.linalg.norm(np.diff(np.vstack([P3, P3[:1]]), axis=0), axis=1)
    keep_p = np.r_[True, seg[:-1] > 1e-4]; P3, N3, tag = P3[keep_p], N3[keep_p], tag[keep_p]
    seg = np.linalg.norm(np.diff(np.vstack([P3, P3[:1]]), axis=0), axis=1)
    say(f'joins (largest gap between successive dense points, m): {seg.max():.3f} at {tag[np.argmax(seg)]}->{tag[(np.argmax(seg) + 1) % len(tag)]}')
    # start in the station: where the rear of the standing train is
    a3 = P3[:, 0] * U[0] + P3[:, 2] * U[1]
    i_st = int(np.argmin(np.where(tag == 'F', np.abs(a3 - A_ST0) + 1e3 * (np.arange(len(a3)) < np.argmax(tag == 'F') + i_cut), 1e9)))
    P3, N3, tag, a3 = np.roll(P3, -i_st, 0), np.roll(N3, -i_st, 0), np.roll(tag, -i_st), np.roll(a3, -i_st)
    cum = np.r_[0, np.cumsum(np.linalg.norm(np.diff(np.vstack([P3, P3[:1]]), axis=0), axis=1))]; L = float(cum[-1])
    n_out = int(round(L / STEP)); step = L / n_out; so = np.arange(n_out) * step
    Pc = np.vstack([P3, P3[:1]]); Nc = np.vstack([N3, N3[:1]])
    Q = np.c_[[np.interp(so, cum, Pc[:, k]) for k in range(3)]].T; Nq = np.c_[[np.interp(so, cum, Nc[:, k]) for k in range(3)]].T
    Tq = np.roll(Q, -1, 0) - np.roll(Q, 1, 0); Tq /= np.linalg.norm(Tq, axis=1)[:, None]
    Nq -= np.sum(Nq * Tq, axis=1)[:, None] * Tq; Nq /= np.linalg.norm(Nq, axis=1)[:, None]
    tago = tag[np.clip(np.searchsorted(cum, so, side='right') - 1, 0, len(tag) - 1)]; ao_ = Q[:, 0] * U[0] + Q[:, 2] * U[1]
    pitch = np.degrees(np.arcsin(np.clip(Tq[:, 1], -1, 1)))

    # ---------------------------------------------------------------- sections
    def first(cond, after=0):
        i = np.flatnonzero(cond & (np.arange(n_out) >= after)); return int(i[0]) if len(i) else n_out
    kap = np.linalg.norm(np.roll(Tq, -1, 0) - np.roll(Tq, 1, 0), axis=1) / (2 * step)       # curvature of the output, 1/m
    i_sta = first(ao_ > A_ST1)
    i_pu = first((tago == 'A') & (kap > 5e-4) & (ao_ > 60))
    i_tu = first(pitch > 89.0, i_pu)
    i_th = first(tago == 'C', i_tu)
    i_td = first(tago == 'D', i_th)
    i_po = first((tago == 'E') & (pitch > -89.0), i_td)
    i_hi = i_po + int(np.argmin(Q[i_po:i_po + 160, 1]))
    i_cr = i_hi + int(np.argmax(Q[i_hi:i_hi + 250, 1]))
    i_br = first(pitch > -14.0, i_cr + int(np.argmin(pitch[i_cr:i_cr + 150])))     # the brake run: from where the descent has eased to 14 degrees
    i_ta = first((tago == 'F') & (kap > 5e-3), i_br)
    cuts = [0, i_sta, i_pu, i_tu, i_th, i_td, i_po, i_hi, i_br, i_ta, n_out]
    ids = ['station', 'launch', 'pullup', 'tower_up', 'tophat', 'tower_down', 'pullout', 'hill', 'brakes', 'turnaround']
    # distances as js/scene/ka/layout.ts will measure them: along the output's own points
    Qr = np.round(Q, 3); sQ = np.r_[0, np.cumsum(np.linalg.norm(np.diff(np.vstack([Qr, Qr[:1]]), axis=0), axis=1))]
    sections = [{'id': ids[k], 's0': round(float(sQ[cuts[k]]), 3), 's1': round(float(sQ[cuts[k + 1]]), 3)} for k in range(10)]
    i_top = int(np.argmax(Q[:, 1]))
    say(f'track: {L:.1f} m ({n_out} points, {step:.4f} m apart; published 950 m); top {Q[i_top, 1]:.2f} m above the datum ({Q[i_top, 1] - g_tower:.2f} above the ground at the tower) at s = {i_top * step:.0f}; '
        f'valley {Q[i_hi, 1]:.2f}; hill crest {Q[i_cr, 1]:.2f} m ({Q[i_cr, 1] - float(ground_at(Q[i_cr, 0], Q[i_cr, 2])) + datum:.2f} above the ground under it; published 39.3)')
    say('sections: ' + ', '.join(f"{o['id']} {o['s0']:.0f}-{o['s1']:.0f}" for o in sections))
    i_inc = first((np.gradient(Q[:, 1]) / step > .012) & (ao_ > -135))
    say(f'launch track: {(i_pu - i_sta) * step:.0f} m from the standing train\'s nose to the foot of the pull-up (s = {i_pu * step:.0f}); level to s = {i_inc * step:.0f}, then climbing {math.degrees(-tA[-1]):.2f} degrees')
    # ---------------------------------------------------------------- does a train get round it? (a point mass: gravity, rolling friction, air)
    G_ = 9.81; MU, KAIR = 0.008, 2.0e-4                                 # friction per unit of load; drag per metre (0.5 rho CdA / m, about 3 m2 and 9 t)
    dT = (np.roll(Tq, -1, 0) - np.roll(Tq, 1, 0)) / (2 * step); Sd = np.cross(Nq, Tq)
    i_v0 = first((ao_ > 0) & (tago == 'A'))                              # where the launch is over: about 100 m of 1.67 g from the start of the launch track
    v = np.zeros(n_out); gn = np.zeros(n_out); gl = np.zeros(n_out); v[i_v0] = 57.2; tsim = 0.0
    for i in range(i_v0, i_br):
        gn[i] = (v[i] ** 2 * (dT[i] @ Nq[i]) + G_ * Nq[i, 1]) / G_; gl[i] = (v[i] ** 2 * (dT[i] @ Sd[i]) + G_ * Sd[i, 1]) / G_
        v2 = v[i] ** 2 - 2 * G_ * (Q[(i + 1) % n_out, 1] - Q[i, 1]) - 2 * (MU * G_ * abs(gn[i]) + KAIR * v[i] ** 2) * step
        if v2 <= 0: say(f'THE TRAIN STALLS at s = {i * step:.0f} (y {Q[i, 1]:.1f})'); break
        v[i + 1] = math.sqrt(v2); tsim += 2 * step / (v[i] + v[i + 1])
    def run(v0, upto):
        vv = np.zeros(n_out); vv[i_v0] = v0
        for i in range(i_v0, upto):
            g1 = (vv[i] ** 2 * (dT[i] @ Nq[i]) + G_ * Nq[i, 1]) / G_
            v2 = vv[i] ** 2 - 2 * G_ * (Q[(i + 1) % n_out, 1] - Q[i, 1]) - 2 * (MU * G_ * abs(g1) + KAIR * vv[i] ** 2) * step
            if v2 <= 0: return None
            vv[i + 1] = math.sqrt(v2)
        return vv
    lo_v, hi_v = 45.0, 57.2
    for _ in range(30):
        mid_v = (lo_v + hi_v) / 2; vv = run(mid_v, i_top + 1)
        if vv is None or vv[i_top] < 8.0: lo_v = mid_v
        else: hi_v = mid_v
    v_crawl = hi_v
    def rng(i0_, i1_, arr, f): j = i0_ + int(f(arr[i0_:i1_])); return f'{arr[j]:+.2f} at s = {j * step:.0f}'
    say(f'energy run from 57.2 m/s where the launch ends (s = {i_v0 * step:.0f}): {v[i_pu]:.1f} m/s at the foot of the pull-up; pull-up load {rng(i_pu, i_tu, gn, np.argmax)} g; '
        f'over the top at {v[i_top]:.1f} m/s, load {gn[i_top]:+.2f} g; pull-out load {rng(i_po, i_hi + 30, gn, np.argmax)} g at up to {v[i_po:i_hi + 30].max():.1f} m/s; '
        f'hill crest {v[i_cr]:.1f} m/s, load {gn[i_cr]:+.2f} g; into the brake run at {v[i_br]:.1f} m/s; {tsim:.1f} s from launch end to brake run; '
        f'largest sideways load at rail level {np.abs(gl[i_v0:i_br]).max():.2f} g at s = {(i_v0 + int(np.argmax(np.abs(gl[i_v0:i_br])))) * step:.0f} (in the descent\'s roll, which turns about a line above the rails); '
        f'with the same losses the train crests at 8 m/s (zero load over the {1 / kmax:.1f} m crest is {math.sqrt(G_ / kmax):.1f} m/s) if it leaves the launch at {v_crawl:.1f} m/s')
    rollr = np.degrees(np.arccos(np.clip(np.sum(Nq * np.roll(Nq, -1, 0), axis=1), -1, 1))) / step
    vc = run(v_crawl, i_br)
    pk = lambda vv_, i0_, i1_: (float((rollr[i0_:i1_] * vv_[i0_:i1_]).max()), float(vv_[i0_ + int(np.argmax(rollr[i0_:i1_] * vv_[i0_:i1_]))]))
    roll_rates = {'up': pk(vc, i_tu, i_th), 'down': pk(vc, i_th, i_po), 'up_fast': pk(v, i_tu, i_th), 'down_fast': pk(v, i_th, i_po)}
    say(f'roll rates: going up at most {rollr[i_tu:i_th].max():.1f} degrees per m, which is {roll_rates["up"][0]:.0f} degrees/s at {roll_rates["up"][1]:.0f} m/s (a train that crests at 8 m/s; {roll_rates["up_fast"][0]:.0f} at the full 57.2 m/s launch); '
        f'coming down at most {rollr[i_th:i_po].max():.1f} degrees per m, {roll_rates["down"][0]:.0f} degrees/s at {roll_rates["down"][1]:.0f} m/s ({roll_rates["down_fast"][0]:.0f} after the full launch)')
    # the brake run: straight at one grade from i_bs; the section starts earlier, where the hill's descent has eased to 14 degrees (a convention:
    # nothing in the lidar marks where the fins begin; photographs show them from the hill's crest on)
    i_bs = first((kap < 4e-4) & (tago == 'E'), i_br)
    say(f'brake run: one straight grade of {pitch[min(i_bs + 5, n_out - 1)]:.2f} degrees from s = {i_bs * step:.0f} to the turnaround at s = {i_ta * step:.0f} ({(i_ta - i_bs) * step:.0f} m); the brakes section starts at s = {i_br * step:.0f}, the hill\'s crest is at s = {i_cr * step:.0f}')
    say(f'smoothness: tightest radius {1 / kap.max():.2f} m at s = {np.argmax(kap) * step:.0f} ({tago[np.argmax(kap)]}); largest change of curvature between neighbours {np.abs(np.diff(kap)).max():.4f} /m per m at s = {np.argmax(np.abs(np.diff(kap))) * step:.0f}; '
        f'fastest turn of the riders\' up {rollr.max():.1f} degrees per m at s = {np.argmax(rollr) * step:.0f}; it closes on itself (first . last = {Nq[0] @ Nq[-1]:.4f})')

    # ---------------------------------------------------------------- how far the lidar's rail returns lie from the centreline, per section
    Pall = np.c_[x[obj], Y[obj], z[obj]]
    box = (Pall[:, 0] > Q[:, 0].min() - 2) & (Pall[:, 0] < Q[:, 0].max() + 2) & (Pall[:, 2] > Q[:, 2].min() - 2) & (Pall[:, 2] < Q[:, 2].max() + 2); Pall = Pall[box]
    cellq = 4.0; keyq = {}
    for i, q in enumerate(Q):
        keyq.setdefault((int(q[0] // cellq), int(q[1] // cellq), int(q[2] // cellq)), []).append(i)
    near_i = np.full(len(Pall), -1); near_d = np.full(len(Pall), 9.0)
    kx, ky, kz = (Pall[:, 0] // cellq).astype(int), (Pall[:, 1] // cellq).astype(int), (Pall[:, 2] // cellq).astype(int)
    for (cx_, cy_, cz_) in set(zip(kx.tolist(), ky.tolist(), kz.tolist())):
        cand = [i for dx in (-1, 0, 1) for dy in (-1, 0, 1) for dz in (-1, 0, 1) for i in keyq.get((cx_ + dx, cy_ + dy, cz_ + dz), [])]
        if not cand: continue
        sel = np.flatnonzero((kx == cx_) & (ky == cy_) & (kz == cz_)); cand = np.array(cand)
        d2 = np.linalg.norm(Pall[sel][:, None, :] - Q[cand][None, :, :], axis=2); jj = np.argmin(d2, 1)
        near_i[sel] = cand[jj]; near_d[sel] = d2[np.arange(len(sel)), jj]
    okq = near_d < 1.5; pi_, ii = Pall[okq], near_i[okq]
    rel = pi_ - Q[ii]; rn = np.sum(rel * Nq[ii], 1) - RAIL / 2; rs = np.sum(rel * Sd[ii], 1)
    fitrep = {}
    for k, nm in enumerate(ids):
        insec = (ii >= cuts[k]) & (ii < cuts[k + 1]) & (np.abs(rs) < .8) & (np.abs(rn) < .35)
        fitrep[nm] = (int(insec.sum()), float(np.sqrt(np.mean(rn[insec] ** 2))) if insec.sum() else None)
    say('rail returns against the centreline (2019 survey; height above the rails\' top surface, |sideways| < 0.8 m, |height| < 0.35 m): ' +
        ', '.join(f'{nm} n={n_} rms {r_:.3f} m' if n_ else f'{nm} none seen' for nm, (n_, r_) in fitrep.items()))
    # ================================================================================================ what stands still
    sc_xz = lambda aa, bb: (float(aa * U[0] + bb * V[0]), float(aa * U[1] + bb * V[1]))
    r3 = lambda v: round(float(v), 3)
    ry_axis = math.atan2(-U[1], U[0])                                   # rotation.y of something whose local +x runs along the ride's axis, toward the tower

    # ---------------------------------------------------------------- the tower
    rings = []
    inside = TB & (a > a_T + 4) & (a < a_T + 15) & (np.abs(b - b_c) < 8) & (Y > 6)
    hh, ee = np.histogram(Y[inside], bins=np.arange(6, 135, .25))
    sm_ = np.convolve(hh, np.ones(3), 'same')
    for i in np.flatnonzero((sm_ >= 14) & (sm_ >= np.roll(sm_, 1)) & (sm_ > np.roll(sm_, -1))):
        if not rings or ee[i] - rings[-1] > 3: rings.append(float(ee[i] + .125))
    # the three main legs. The front two stand straight: where returns stack up over the most heights
    def column(a0, b0, rad=2.0, y0=14, y1=100):
        m = TB & (np.hypot(a - a0, b - b0) < rad) & (Y > y0) & (Y < y1) & (np.min(np.abs(Y[:, None] - np.array(rings)[None, :]), axis=1) > 1.0)
        ka, kb, ky = np.round(a[m] / .5).astype(int), np.round(b[m] / .5).astype(int), (Y[m] // 2).astype(int)
        occ = {}
        for i_, j_, k_ in zip(ka, kb, ky): occ.setdefault((i_, j_), set()).add(k_)
        best = max(len(v_) for v_ in occ.values()); cells = [(k_, len(v_)) for k_, v_ in occ.items() if len(v_) >= .6 * best]
        w_ = np.array([n_ for _, n_ in cells], float); c_ = np.array([k_ for k_, _ in cells], float) * .5
        return float(c_[:, 0] @ w_ / w_.sum()), float(c_[:, 1] @ w_ / w_.sum())
    colU = column(a_T + 3, bL_T); colD = column(a_T + 3, bH_T)
    # the rear leg leans: at each ring, the corner of the triangle away from the station
    rear = []
    for yr in rings:
        m = TB & (np.abs(Y - yr) < .6) & (np.abs(b - b_c) < 1.5) & (a > a_T + 5)
        if m.sum() >= 3: rear.append((yr, float(np.percentile(a[m], 97)), float(np.median(b[m][a[m] > np.percentile(a[m], 80)]))))
    rear = np.array(rear); cb_ = float(np.median(rear[:, 2])); a_rear0 = float(np.median(rear[:4, 1]))
    if DEBUG: print('rear leg by ring (y, a, b):', np.round(rear, 2).tolist())
    rear_at = lambda yy: (float(np.interp(yy, np.r_[g_tower, rear[:, 0]], np.r_[a_rear0, np.minimum.accumulate(np.r_[a_rear0, rear[1:, 1]])])), cb_)   # straight up, then leaning in toward the crest
    i_lean = int(np.argmax(rear[:, 1] < a_rear0 - 1.0))
    say(f'tower: rings at {[round(v_, 1) for v_ in rings]} m above the datum (the ground at its foot is {g_tower:+.2f}); front legs at (a, b) = ({colU[0]:.2f}, {colU[1]:.2f}) and ({colD[0]:.2f}, {colD[1]:.2f}), {colU[1] - colD[1]:.2f} m apart; '
        f'rear leg {rear_at(g_tower)[0] - (colU[0] + colD[0]) / 2:.2f} m behind them (b = {cb_:.2f}), upright to the ring at {rear[i_lean - 1, 0]:.0f} m and leaning in above it: a = {[round(float(v_), 1) for v_ in rear[:, 1]]}; the rails stand {(colU[0] + colD[0]) / 2 - a_T:.2f} m in front of the front legs')
    # the outrigger frames either side: two nodes about 30 m up, each tied to a main leg and standing on a raking strut to a shared foot
    def node(a0, b0, ylo, yhi, rad=2.5):
        m = TB & (np.hypot(a - a0, b - b0) < rad) & (Y > ylo) & (Y < yhi)
        t_ = np.percentile(Y[m], 90); q_ = m & (Y > t_ - .8)
        return np.array([np.median(a[q_]), np.median(b[q_]), float(t_)])
    def line_to_ground(a0, b0, a1, b1, ylo, yhi, wid=1.2):
        """a raking member seen between two plan points: its line, carried down to the ground and up to yhi"""
        d_ = np.array([a1 - a0, b1 - b0]); ln = np.linalg.norm(d_); d_ /= ln
        t_ = (a - a0) * d_[0] + (b - b0) * d_[1]; o_ = -(a - a0) * d_[1] + (b - b0) * d_[0]
        m = TB & (t_ > -1) & (t_ < ln + 1) & (np.abs(o_) < wid) & (Y > ylo) & (Y < yhi)
        if m.sum() < 6: return None
        ct = np.polyfit(Y[m], t_[m], 1); co_ = float(np.median(o_[m]))
        at = lambda yy: (a0 + d_[0] * np.polyval(ct, yy) - d_[1] * co_, b0 + d_[1] * np.polyval(ct, yy) + d_[0] * co_)
        return at, int(m.sum())
    struts = []; feet = []
    for sgn, colF in ((-1, colD), (1, colU)):
        bq = lambda db: b_c + sgn * db                                 # mirrored about the tower's middle
        N1 = node(a_T + 13, bq(18.6), 26, 32); N2 = node(a_T + 22.3, bq(12.2), 26, 32)
        r1 = line_to_ground(N1[0], N1[1], a_T + 24, bq(22.5), 4 + g_tower, N1[2] - 1); r2 = line_to_ground(N2[0], N2[1], a_T + 24.6, bq(22.5), 4 + g_tower, N2[2] - 1)
        f1 = r1[0](g_tower) if r1 else None; f2 = r2[0](g_tower) if r2 else None
        foot = np.mean([f_ for f_ in (f1, f2) if f_ is not None], axis=0)
        feet.append(sc_xz(*foot))
        P_ = lambda aa, bb, yy: [*sc_xz(aa, bb)[:1], float(yy), sc_xz(aa, bb)[1]]
        rr_ = rear_at(N2[2]); top_y = min(rings, key=lambda v_: abs(v_ - 57.5))
        for A_, B_ in ((P_(*N1), P_(foot[0], foot[1], g_tower)), (P_(*N2), P_(foot[0], foot[1], g_tower)), (P_(*N1), P_(*N2)),
                       (P_(*N1), P_(colF[0], colF[1], N1[2])), (P_(*N2), P_(rr_[0], rr_[1], N2[2])),
                       (P_(*N1), P_(colF[0], colF[1], top_y)), (P_(*N2), P_(*rear_at(top_y), top_y)),
                       (P_(*N1), P_(colF[0], colF[1], g_tower)), (P_(*N2), P_(*rear_at(g_tower), g_tower))):
            struts.append([r3(v_) for v_ in (*A_, *B_)])
        say(f'tower outrigger ({"launch" if sgn > 0 else "hill"} side): nodes at (a, b, y) = {np.round(N1, 1).tolist()} and {np.round(N2, 1).tolist()}, standing on a foot at ({foot[0]:.1f}, {foot[1]:.1f})')
    mid = ((colU[0] + colD[0]) / 2 + (rear_at(g_tower)[0] - colU[0]) / 2, (colU[1] + colD[1]) / 2)
    tower = {'x': r3(sc_xz(*mid)[0]), 'z': r3(sc_xz(*mid)[1]), 'h': r3(Q[i_top, 1]), 'ry': r3(ry_axis), 'w': r3(rear_at(g_tower)[0] - colU[0]), 'd': r3(colU[1] - colD[1]),
             'base': r3(g_tower),
             'legs': [{'x': r3(sc_xz(*c_)[0]), 'z': r3(sc_xz(*c_)[1]), 'role': nm} for nm, c_ in (('up', colU), ('down', colD), ('rear', rear_at(g_tower)))],
             'levels': [r3(v_) for v_ in rings],
             'rear': [[r3(yy), r3(sc_xz(*rear_at(yy))[0]), r3(sc_xz(*rear_at(yy))[1])] for yy in [g_tower] + list(rear[:, 0])],
             'feet': [{'x': r3(f_[0]), 'z': r3(f_[1])} for f_ in feet], 'struts': struts,
             'crest': {'x': r3(sc_xz(a_T, b_c)[0]), 'z': r3(sc_xz(a_T, b_c)[1]), 'half': r3(W_top), 'radius': r3(1 / kmax)},
             'track_offset': r3(colU[0] - a_T)}

    # ---------------------------------------------------------------- the station building: the roof the lidar saw
    bS = cL[0] + cL[1] * (A_IN + A_OUT) / 2
    rf = keep & (a > A_IN - 7) & (a < A_OUT + 9) & (np.abs(b - bS) < 12.5)
    upper = rf & (Y > 8.8) & (hag < 13); lower = rf & (Y > 5.55) & (Y < 8.2)
    ua0, ua1 = np.percentile(a[upper], [.5, 99.5]); ub0, ub1 = np.percentile(b[upper], [.5, 99.5])
    def span(v, lo, hi):                                               # the longest run of quarter-metre bins at least half as full as the typical one
        h_, e_ = np.histogram(v, bins=np.arange(lo, hi + .01, .25)); on = h_ > .5 * np.median(h_[h_ > 0]); best_ = (0, 0, 0); i = 0
        while i < len(on):
            if on[i]:
                j_ = i
                while j_ + 1 < len(on) and on[j_ + 1]: j_ += 1
                if j_ - i > best_[0]: best_ = (j_ - i, i, j_)
                i = j_
            i += 1
        return float(e_[best_[1]]), float(e_[best_[2] + 1])
    rb0, rb1 = span(b[(lower | upper) & (a > ua0) & (a < ua1)], bS - 12.5, bS + 12.5)
    ra0, ra1 = span(a[(lower | upper) & (b > rb0) & (b < rb1)], A_IN - 7, A_OUT + 9)
    ridge = float(np.percentile(Y[upper], 99.5)); up_eave = float(np.percentile(Y[upper], .5)); low_top = float(np.percentile(Y[lower], 99.5)); eave = float(np.percentile(Y[lower & (np.abs(b - bS) > (rb1 - rb0) / 2 - 1.5)], 5))
    floor_m = keep & (a > ra0 + .3) & (a < ra0 + 3) & (b > rb0 + 2) & (b < rb1 - 2) & (hag > 1.2) & (hag < 2.6)
    floor = float(np.median(Y[floor_m])) if floor_m.sum() > 5 else None
    sx, sz = sc_xz((ra0 + ra1) / 2, (rb0 + rb1) / 2)
    Wr = way_xz(ways[105571114]); Wra, Wrb = Wr @ U, Wr @ V
    station = {'x': r3(sx), 'z': r3(sz), 'ry': r3(ry_axis), 'w': r3(ra1 - ra0), 'd': r3(rb1 - rb0), 'h': r3(ridge),
               'eave': r3(eave), 'roof': {'ridge': r3(ridge), 'upper_eave': r3(up_eave), 'upper_d': r3(ub1 - ub0), 'upper_w': r3(ua1 - ua0), 'lower_top': r3(low_top), 'eave': r3(eave)},
               'floor': r3(floor) if floor else None, 'rail': r3(float(np.interp(sF[np.argmin(np.abs(F_ab[:, 0] - (A_IN + A_OUT) / 2))], fine, gF))),
               'lanes': [r3(LANE), r3(-LANE)], 'ground': r3(float(np.median(el[gnd & (a > ra0 - 5) & (a < ra1 + 5) & (np.abs(b - bS) < 14)]) - datum))}
    say(f'station roof (lidar): a {ra0:.1f}..{ra1:.1f}, b {rb0:.1f}..{rb1:.1f} = {ra1 - ra0:.1f} m along the track x {rb1 - rb0:.1f} m across, its middle {(rb0 + rb1) / 2 - bS:+.2f} m from the launch line; '
        f'eave {eave:.2f}, lower slopes up to {low_top:.2f}, then a raised middle {ub1 - ub0:.1f} m wide from {up_eave:.2f} to the ridge at {ridge:.2f} m above the datum; platform floor {floor:.2f}; ground there {station["ground"]:+.2f}. '
        f'OSM\'s roof outline: a {Wra.min():.1f}..{Wra.max():.1f}, b {Wrb.min():.1f}..{Wrb.max():.1f}')
    # ---------------------------------------------------------------- supports: what the lidar caught under the track
    # A column stands straight under a 1.1 m wide truss, so little of it is seen from above: a few returns in a stack, or just
    # the concrete pedestal it stands on (a flat top 1.5-2 m above the ground, wider than the track). Looked for only where
    # the track is 6 m or more up (pull-up, pull-out, hill); under the launch track, the brake run and the turnaround nothing
    # can be told apart from the catwalks and the track itself. The hill's tall columns each show a raking strut running down
    # toward the infield, and a level tie half way up.
    supports = []
    under = DEPTH + RAIL / 2
    rng_ = np.random.default_rng(1)
    for nm, (lo_, lu_, lv_), (k0_, k1_), infield in (('pullup', (oL, uL, vL), (i_sta, i_tu), -1), ('hill', (oH, uH, vH), (i_po, i_ta), 1)):
        d_, q_ = frame(lo_, lu_, lv_, x, z)
        dq, _ = frame(lo_, lu_, lv_, Q[k0_:k1_, 0], Q[k0_:k1_, 2]); o = np.argsort(dq); dq = dq[o]; yq = Q[k0_:k1_, 1][o]; iq = np.arange(k0_, k1_)[o]
        yt = np.interp(d_, dq, yq) - under; gl_ = ground_at(x, z) - datum; H_ = yt - gl_
        zone = keep & (d_ > dq[0]) & (d_ < min(dq[-1], a_T - 14)) & (H_ > 6)
        stack = zone & (np.abs(q_) < 1.3) & (Y > gl_ + np.maximum(2.5, np.minimum(10.5, .3 * H_))) & (Y < yt - .6)
        ped = zone & (np.abs(q_) < 1.6) & (Y - gl_ > 1.2) & (Y - gl_ < 2.4)
        def runs(mask, nmin):                                          # groups of returns along the track, none longer than a footing
            idx = np.flatnonzero(mask); o2 = np.argsort(d_[idx]); idx = idx[o2]
            return [g_ for g_ in (np.split(idx, np.flatnonzero(np.diff(d_[idx]) > 2.0) + 1) if len(idx) else []) if len(g_) >= nmin and np.ptp(d_[g_]) <= 3.6]
        found = [[g_, None] for g_ in runs(stack, 4)]
        for g_ in runs(ped, 5):
            if np.std(Y[g_]) > .15: continue                           # a pedestal's top is flat
            near_ = [f_ for f_ in found if abs(np.median(d_[f_[0]]) - np.median(d_[g_])) < 4.0]
            if near_: near_[0][1] = g_
            else: found.append([None, g_])
        for gs, gp in found:
            gi = gs if gs is not None else gp
            dc = float(np.median(d_[gi])); qc = float(np.median(q_[gs])) if gs is not None and len(gs) >= 3 else 0.0
            px, pz = lo_ + lu_ * dc + lv_ * qc; ytc = float(np.interp(dc, dq, yq) - under); gb = float(np.median(gl_[gi]))
            sup = {'x': r3(px), 'z': r3(pz), 'y': r3(ytc), 's': r3(sQ[iq[np.argmin(np.abs(dq - dc))]]), 'kind': 'column', 'base': r3(gb), 'n': int(len(gi))}
            if gp is not None: sup['pedestal'] = r3(float(np.median(Y[gp])))
            sup['a'] = round(dc / math.hypot(1, (cL if nm == 'pullup' else cH)[1]), 1)
            if ytc - gb > 14:
                # the raking strut: the straight line, falling away to the infield, that most returns beside the column lie on
                c_ = keep & (np.abs(d_ - dc) < 1.1) & (q_ * infield > .25) & (q_ * infield < 24) & (Y > gb + 9) & (Y < ytc)
                qq, yy_ = q_[c_] * infield, Y[c_]; best_ = (0, None)
                if c_.sum() >= 6:
                    for _ in range(300):
                        i_, j_ = rng_.choice(len(qq), 2, replace=False)
                        if abs(qq[i_] - qq[j_]) < .8: continue
                        sl = (yy_[i_] - yy_[j_]) / (qq[i_] - qq[j_])
                        if not -6 < sl < -.7: continue
                        inl = np.abs(yy_ - (yy_[i_] + sl * (qq - qq[i_]))) < .3
                        if inl.sum() > best_[0]: best_ = (int(inl.sum()), inl)
                if best_[0] >= 6 and np.ptp(qq[best_[1]]) > 1.2:
                    sl, ic = np.polyfit(qq[best_[1]], yy_[best_[1]], 1); qf = (gb - ic) / sl; fx, fz = lo_ + lu_ * dc + lv_ * (qf * infield)
                    sup.update({'kind': 'aframe', 'feet': [[r3(px), r3(pz)], [r3(fx), r3(fz)]], 'strut_y': r3(min(ic, ytc)), 'strut_n': best_[0]})
                    tie = c_ & (np.abs(Y - np.median(Y[c_ & (Y < gb + .6 * (ytc - gb))]) if (c_ & (Y < gb + .6 * (ytc - gb))).sum() > 4 else 1e9) < .25) if c_.sum() else c_
                    if tie.sum() >= 5 and np.ptp(q_[tie]) > 1.2: sup['tie_y'] = r3(float(np.median(Y[tie])))
            supports.append(sup)
    supports.sort(key=lambda o_: o_['s'])
    say(f'supports: {len(supports)} seen, at s = {[round(o_["s"]) for o_ in supports]}; ' + '; '.join(
        f's {o_["s"]:.0f} (a {o_["a"]:.0f}): {o_["kind"]}, meets the track at {o_["y"]:.1f}' + (f', pedestal {o_["pedestal"]:.1f}' if 'pedestal' in o_ else '') +
        (f', strut from {o_["strut_y"]:.1f} to a foot {math.hypot(o_["feet"][1][0] - o_["x"], o_["feet"][1][1] - o_["z"]):.1f} m into the infield ({o_["strut_n"]} returns)' if 'feet' in o_ else '') +
        (f', tie at {o_["tie_y"]:.1f}' if 'tie_y' in o_ else '') for o_ in supports))

    # ---------------------------------------------------------------- the other fixed track
    sidings = []
    # the second station lane, from where the lanes part to where they meet (heights as the first lane's)
    l2 = lane_path(-1); keep2 = (l2[:, 0] > A_SPLIT - .5) & (l2[:, 0] < A_MERGE + .5); l2 = l2[keep2][::20]
    s2 = np.interp(l2[:, 0], F_ab[i_cut:, 0], sF[i_cut:]); y2 = np.interp(s2, fine, gF); xz2 = ab2xz(l2)
    sidings.append({'id': 'lane2', 'p': [[r3(xz2[i, 0]), r3(y2[i]), r3(xz2[i, 1])] for i in range(len(l2))], 'n': [[0, 1, 0]] * len(l2)})
    # the two dead-end storage tracks beside the launch track: strips of returns at rail height, on the lanes' 4 m grid
    for k_ in (1, 2):
        b0_ = cL[0] + cL[1] * -100 - LANE * k_
        m = obj & (np.abs(b - b0_) < 1.6) & (a > -135) & (a < -60) & (np.abs(Y - (station['rail'] + RAIL / 2)) < .25)
        if m.sum() < 80: continue
        ha_, ea_ = np.histogram(a[m], bins=np.arange(-135, -59.9, 1.0)); on = np.flatnonzero(ha_ >= 4)
        runs = np.split(on, np.flatnonzero(np.diff(on) > 2) + 1); run = max(runs, key=len); sa0, sa1 = float(ea_[run[0]]), float(ea_[run[-1] + 1])
        mm = m & (a >= sa0) & (a <= sa1); cb1, cb0 = np.polyfit(a[mm], b[mm], 1); ys = float(np.median(Y[mm])) - RAIL / 2
        aa = np.arange(sa0, sa1 + .01, 1.0)
        sidings.append({'id': f'storage{k_}', 'p': [[r3(sc_xz(v_, cb0 + cb1 * v_)[0]), r3(ys), r3(sc_xz(v_, cb0 + cb1 * v_)[1])] for v_ in aa], 'n': [[0, 1, 0]] * len(aa)})
        say(f'storage track {k_}: a {sa0:.0f}..{sa1:.0f} ({sa1 - sa0:.0f} m), {cL[0] + cL[1] * (sa0 + sa1) / 2 - cb0 - cb1 * (sa0 + sa1) / 2:.2f} m from the launch line, rails {ys + RAIL / 2:.2f} m above the datum; {mm.sum()} returns')

    # ---------------------------------------------------------------- write
    rnd = lambda A_: [[r3(v_) for v_ in row] for row in A_]
    out = {
        'name': 'Kingda Ka',
        'note': 'Centreline and structure measured from the USGS 3DEP lidar flown on 2019-03-08 while the ride stood (NJ_SouthJersey_2018 dataset; the 2010 3-county survey for the tower\'s vertical runs), '
                'guided by OpenStreetMap as of 2024-06-01; what the station roof hides follows the published layout. tools/ka/README.md.',
        'units': 'metres; x east, y up, z south of extent.py LAT0/LON0; y above the datum (the median ground under the ride)',
        'track': {'step': round(float(sQ[-1]) / n_out, 6), 'closed': True, 'p': rnd(Q), 'n': rnd(Nq), 'sections': sections},
        'tower': tower, 'supports': supports, 'station': station, 'sidings': sidings,
        'ground': {'datum': round(datum, 2), 'relief': [[r3(sc_xz(v_[0], (cL[0] + cH[0]) / 2)[0]), r3(sc_xz(v_[0], (cL[0] + cH[0]) / 2)[1]), v_[1]] for v_ in relief]},
        'axis': {'u': [round(float(U[0]), 6), round(float(U[1]), 6)], 'launch': {'x': r3(oL[0]), 'z': r3(oL[1]), 'ux': round(float(uL[0]), 5), 'uz': round(float(uL[1]), 5)}, 'hill': {'x': r3(oH[0]), 'z': r3(oH[1]), 'ux': round(float(uH[0]), 5), 'uz': round(float(uH[1]), 5)}},
        'truss': {'depth': DEPTH, 'rail_span': r3(rail_span)},
        'twist': {'up': {'deg': round(math.degrees(phi_up), 1), 'y0': r3(Yu1), 'y1': r3(Yu2)}, 'down': {'deg': round(math.degrees(phi_dn), 1), 'y0': r3(Yd0), 'y1': r3(Yd1), 'radius': r3(r_dn)}},
        'brakes': {'fins_s0': r3(sQ[i_cr]), 'straight_s0': r3(sQ[i_bs]), 's1': r3(sQ[i_ta]), 'grade_deg': r3(pitch[min(i_bs + 5, n_out - 1)])},
        'check': {'v_launch': 57.2, 's_launch_end': r3(sQ[i_v0]), 'v_top': r3(v[i_top]), 'v_launch_for_8_at_top': r3(v_crawl), 'g_pullup': r3(gn[i_pu:i_tu].max()), 'g_pullout': r3(gn[i_po:i_hi + 30].max()),
                  'v_hill': r3(v[i_cr]), 'v_brakes': r3(v[i_br]), 'mu': MU, 'k_air': KAIR,
                  'roll_deg_per_s': {k_: round(v_[0], 1) for k_, v_ in roll_rates.items()}},
        'assumed': ['the station lanes between a = %.1f and %.1f along the launch line (under the roof), and the S-curves that join them to the launch line' % (A_IN, A_OUT),
                    'which of the two lanes the train uses (the one on the launch side, away from the brake run); sidings[0] is the other',
                    'the height of the track under the roof (carried level between the returns either side)',
                    'the roll going up is placed where the 2010 returns show the truss sliding across (%.0f-%.0f m; 51 returns, weak); its sense (to the right) is the published one' % (Yu1, Yu2),
                    'the roll coming down turns about a line %.2f m above the rails: the radius that fits the returns best, within about half a metre' % r_dn,
                    'where the brakes section starts (the descent eased to 14 degrees); brakes.fins_s0, the hill crest, is where photographs show the first fins'],
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w') as f: json.dump(out, f, separators=(',', ':'))
    say(f'wrote {os.path.relpath(OUT)}: {os.path.getsize(OUT) / 1024:.0f} KB')
    if DEBUG: open(os.path.join(DEBUG, 'notes.txt'), 'w').write('\n'.join(NOTES))


if __name__ == '__main__':
    main()
