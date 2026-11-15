# Kingda Ka: the track tools

Kingda Ka (Six Flags Great Adventure, Jackson NJ; Intamin, 2005 to 2024) as the city `ka`. This folder's track
pipeline turns public surveys of the standing ride into `data/ka/coaster.json`, which `js/scene/ka/` builds the
track, tower, supports, station and train from. (The park round it is `fetch_ka.py` and `build_ka.py`.)

```
uv run --with "laspy[lazrs]" python -I tools/ka/fetch_track.py     # sources -> tools/ka/src/   (git-ignored)
python -I tools/ka/build_track.py [--debug DIR]                    # src/ -> data/ka/coaster.json   (numpy only)
```

`build_track.py` prints every number quoted here as it runs (`--debug DIR` also writes its fits as `.npz` and the
printout as `notes.txt`). It is deterministic.

## Sources

| file in `src/` | what | used for |
|---|---|---|
| `lidar-kingda-ka-2019-epsg3857.npy` | USGS 3DEP, dataset `NJ_South_Jersey_FEMA_2018`, flown here 2019-03-08 while the ride stood; 984,381 points, about 8/m2; columns x, y (EPSG:3857), z, class | everything measured |
| `lidar-kingda-ka-2010-epsg3857.npy` | USGS `ARRA-NJ_3Counties_2010`; 269,282 points, about 2/m2 | the tower only: it caught the track on the vertical runs, before Zumanjaro's rails were hung on the tower's face |
| `osm-kingda-ka-2024.json` | OpenStreetMap on 2024-06-01 (Overpass attic query) | a first guess of where the two legs lie (way 105571105), and the station roof's outline (way 105571114) for comparison. No coordinate in the output comes from it |

The vendors classed the upper tower as noise (class 18 in 2019, class 7 in 2010): those classes are kept inside the
tower's footprint and dropped elsewhere. The two surveys' ground agrees to 1 cm (median over 6,775 four-metre cells).

## Frames, and the ground

- Scene frame (`extent.py`): x m east, z m south of LAT0/LON0, y up. The lidar's EPSG:3857 is turned back into
  latitude and longitude exactly (inverse spherical Mercator), then `extent.proj`.
- The ride's own frame `(a, b)`: `a` along OSM's launch leg toward the tower, `b` across it, the launch side positive
  (`axis.u` in the output is the unit vector of `a` in (x, z); `b`'s is `(-u[1], u[0])`).
- **One datum.** The ground under the ride (class-2 returns within 12 m of the track) falls 2 m from the station to
  the tower: +0.8 m at the turnaround, +0.4 at the station exit, 0 mid-launch, -1.15 at the foot of the pull-up, -0.8
  at the tower (5th to 95th percentile -1.18 to +0.83). That is small, so y is the height above ONE level, the median
  of that ground (38.57 m in the survey's heights), and every slope in the file is the true one. The price: on the
  scene's flat ground the station stands 0.9 m too low and the tower 0.8 m too tall against their real ground
  (`ground.relief`, `tower.base`, `station.ground` say by how much).

## How the centreline is made

Each stretch is a plane curve whose curvature runs straight between knots 3 to 5 m apart (so the tangent is
continuous and the curvature has no steps), fitted to the returns on the rails by least squares with a penalty on
the curvature's second difference. The lidar's surface is the top of the rails; the centreline is 0.07 m (half a rail)
under it along the riders' up.

1. **The two legs in plan**: straight lines through the rail returns (the top 0.3 m of the cloud in each metre of a
   3 m, then 1 m corridor round OSM's line). Launch leg `b = 11.947 + 0.00747 a`, rms 0.08 m over 197 bins; hill leg
   `b = -10.891 - 0.02502 a`, rms 0.10 m over 242 bins. They differ in heading by 1.86 degrees: 28.04 m apart at the
   tower, 16.83 m at the turnaround. The rails' returns span 1.00 m across.
2. **Each leg in profile** (launch incline and pull-up; pull-out, hill and brake run): one curve from the vertical
   run outward. Where the track stands up there is only air on the riders' side of it, so the fit reaches for the
   outermost returns there. Launch 1,947 returns within 0.3 m, rms 0.056 m; hill 2,406, rms 0.071 m. A second layer of
   returns lies 0.93 m under the rails: the box truss's lower chords (`truss.depth`).
3. **The top hat**: both surveys' returns within 0.85 m of the plane `a = 160.45` (square to the launch leg, 2.8 m in
   front of the tower's front legs), fitted with one half-curve mirrored about the crest: 194 returns, rms 0.13 m.
   Crest radius 8.2 m, half-width 12.65 m, vertical below 113.7 m.
4. **The vertical runs** join those. Going up, the 2010 returns show the truss sliding 1.23 m toward the tower's middle
   as it turns to face outward; coming down they wind round a vertical axis the long way. See "assumed" below for
   what was chosen where they cannot say.
5. **The turnaround** in plan: a curve from the hill line to the launch line through 304 rail returns (tightest
   radius 7.5 m; it ends on the launch line to 2 mm). Its two rails are level with each other (0.001 m over 129
   returns): no banking.
6. **Turnaround to launch, in height**: a curve whose slope runs straight between knots, through the rail returns
   either side of the station roof (39 two-metre bins, rms 0.02 m), meeting the two fitted legs in height and slope.
7. The pieces are joined, resampled 1.0001 m apart along the 3D curve, and `n` is squared up against the tangent.

## coaster.json

Metres throughout; angles in degrees unless named `ry` (three.js rotation.y, radians).

- `name`, `note`, `units`.
- `track.step` (1.0001), `track.closed`, `track.p` (949 points, in order of travel from the rear of the standing
  train), `track.n` (the riders' up at each: unit, square to the track, continuous, closing on itself),
  `track.sections` (below).
- `tower`: `x`, `z` the middle of the three main legs' triangle on the ground; `h` 137.788, the highest point of the
  centreline; `base` -0.817, the real ground at its foot against the datum; `ry` the footprint's rotation (local +x
  from the front legs toward the rear leg); `w` 15.2 (front legs to rear leg), `d` 27.84 (between the front legs);
  `legs` the three feet with `role` up / down / rear; `levels` the nine bracing rings (11.9, 26.9, 42.1, 57.4, 72.6,
  87.9, 102.9, 118.1 and the head frame at 126.4, 15.2 m apart); `rear` `[y, x, z]` of the rear leg at the ground
  and at each ring (upright to 72.6 m, then leaning in toward the crest); `feet` the two outrigger feet; `struts`
  18 straight members of the two outrigger frames, each `[x0, y0, z0, x1, y1, z1]` (two nodes about 30.5 m up on each
  side, tied to the main legs at that height, at the ground and at the 57.4 m ring, standing on one shared foot);
  `crest` where the top hat's crest is, its half-width and radius; `track_offset` how far in front of the front legs
  the top hat's plane stands.
- `supports`: 23, each `x`, `z`, `y` (where it meets the underside of the truss), `s` (track distance), `kind`,
  `base` (the real ground there against the datum), `n` (returns), `a`; `pedestal` the top of its concrete footing
  where that was seen; for `aframe`: `feet` (the column's foot, then the raking strut's), `strut_y` (where the strut
  leaves the column), `strut_n`, and `tie_y` (a level tie at 16.1 m on the three tallest).
- `station`: `x`, `z`, `ry`, `w` 28.25 (along the track), `d` 19.75, `h` 10.9 (the ridge); `eave`; `roof` (a lower
  slope from the eave at 5.68 to 8.09, then a raised middle 7.98 m wide from 9.15 to the ridge); `floor` 2.45 (the
  platform); `rail` 1.96 (centreline height under the roof); `lanes` (+4, -4 m from the launch line, the first the
  one `track.p` uses); `ground` +0.91.
- `sidings`: `lane2` (the other station lane, from where the lanes part to where they meet), `storage1`, `storage2`
  (the dead-end storage tracks): each `id`, `p`, `n`.
- `ground`: `datum` (38.57), `relief` `[x, z, metres above the datum]` along the ride's axis.
- `axis`: `u`, and each leg's line (`x`, `z` a point on it, `ux`, `uz` its direction toward the tower).
- `truss`: `depth` 0.93, `rail_span` 1.00.
- `twist`: `up` and `down`: `deg`, `y0`, `y1` (where the roll starts and ends, heights above the datum), and for
  `down` the `radius` of the line it rolls about, above the rails.
- `brakes`: `fins_s0` (the hill's crest: photographs show brake fins from there on), `straight_s0` (where the single
  straight grade begins), `s1`, `grade_deg`.
- `check`: the energy run's numbers (below). `assumed`: the list of what is not measured.

Sections (m along the track): station 0-16, launch 16-249, pullup 249-360, tower_up 360-403, tophat 403-463,
tower_down 463-505, pullout 505-608, hill 608-836, brakes 836-896, turnaround 896-949.

## The numbers

| | this file | published |
|---|---|---|
| length | 949.1 m | 950.4 m (3,118 ft) |
| top of rail above the ground at the tower's foot | 138.68 m (centreline 138.60) | 139.0 m (456 ft) |
| hill crest above the ground under it | 39.51 m | 39.3 m (129 ft) |
| between the up and down tracks | 28.0 m at the foot of the tower, 25.3 m where the top hat begins; the tower's front legs 27.84 m | about 28 |
| launch track | level for 32 m from the station, then a straight 1.72 degree climb of 201 m to the pull-up | "slopes very slightly uphill" |
| brake run | one straight 2.83 degree fall, 21 m, after the hill's long run-out | |
| valley between pull-out and hill | 10.35 m above the datum | |

Rail returns against the finished centreline (2019 survey, returns within 0.8 m sideways and 0.35 m of the rails'
top surface; n, rms): launch 1,722, 0.050 m; pullup 429, 0.087; tophat 82, 0.113; tower_down 10, 0.21; pullout 325,
0.083; hill 1,485, 0.073; brakes 536, 0.048; turnaround 420, 0.055; station and tower_up: none seen in that survey
(under the roof; the vertical up-run shows only in the 2010 survey: 51 returns, rms 0.30 m against the modelled truss;
the descent 91 of 169 within 1.2 m, rms 0.69 m).

Energy run (a point on the rails, gravity, rolling friction 0.008 of the load, air 2e-4 v2 per metre), from 57.2 m/s
(128 mph) where the launch ends, 100 m into the launch track: 55.7 m/s at the foot of the pull-up; 5.26 g in the
pull-up; over the top at 18.1 m/s; 4.84 g in the pull-out at 51.2 m/s; hill crest at 43.5 m/s, -0.6 g; 48.7 m/s into
the brake run. The crest's radius is 8.2 m, so a train is weightless over it at 9.0 m/s: the real trains crawled
over, which with these losses means leaving the launch at 54.5 m/s (to crest at 8 m/s), not the headline 57.2.
Tightest radius anywhere 7.5 m (the turnaround, taken at walking pace); the lanes' S-curves 6 to 8 m.
Roll: at most 4.0 degrees per metre going up (138 degrees/s for the train that crests at 8 m/s) and 7.6 coming down
(244 degrees/s): 269 degrees in 44 m of fall cannot be slow.

## Measured, and assumed

Measured (lidar): both legs in plan; the launch track's level and climb; pull-up, pull-out, valley, hill and brake
run; the top hat; where the vertical runs stand; the turnaround in plan and height and that it is flat; where the
two station lanes leave and rejoin the launch line (seen for 6 m outside each end of the roof, 3.3 to 4.1 m apart
from it there) and the two storage tracks (30 m long, 4.02 and 7.99 m from the launch line at the same rail height:
the lanes and they share one 4 m grid); the station roof; the tower's legs, rings, outrigger frames; 23 supports.

Measured weakly, and said so in `assumed`:

- **The roll going up** (90.4 degrees to the right, the published sense; the top hat being square to the launch leg
  fixes the amount). Where it happens rests on 51 returns of the 2010 survey that show the truss sliding 1.23 m
  across: best fitted by a roll from 80 to 100 m; the output uses the longest roll that fits within 15 % of that,
  76 to 104 m. Spread over the whole vertical run (76 to 114 m) the misfit is 46 % worse.
- **The roll coming down** (268.6 degrees to the right, published 270; the short way round, 91 degrees to the left,
  is ruled out by the returns, which wind through the station side, then the outer side). It runs from 121 to 77 m,
  the whole vertical fall. The returns circle a vertical axis; the fit is best with the track rolling about a line
  1.4 m above the rails (misfit 156, against 164 at 1.05 m, 208 at none): a heartline roll, its radius good to about
  half a metre. So a point on the rails sees 2.9 g sideways there while a rider's chest sees little.

Assumed (nothing in the surveys):

- Under the station roof (a = -166.5 to -144): the lanes run straight, 4 m either side of the launch line, joined to
  it by S-curves from where the lanes are seen to part (a = -178.5) and meet (a = -130.5); the rails carry on level.
  The real ride had a sliding switch track at each end; the file draws both lanes as fixed track.
- Which lane the train uses: the one on the launch side (`sidings[0]` is the other).
- The `brakes` section starts where the hill's descent has eased to 14 degrees. Nothing in the lidar marks the first
  brake fin; photographs show fins from the hill's crest (`brakes.fins_s0`).

Left out, for want of evidence: supports under the launch track, the brake run and the turnaround (hidden by the
track and catwalks; the scene spaces its own there); Zumanjaro's three rails (not separable from the tower's bracing
in the 2019 returns; the head frame at 126.4 m is in `tower.levels`); any transfer track beyond the two storage
tracks.
