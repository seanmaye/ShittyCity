# Kingda Ka

One roller coaster and the park round it: Kingda Ka at Six Flags Great Adventure in Jackson, New Jersey, as it stood in its last years. It was the tallest roller coaster ever built (456 ft) and for years the fastest (128 mph in 3.5 seconds). It opened in 2005, last ran in November 2024 and was taken down in early 2025. The model is rebuilt from the surveys made while it stood, and you can ride it.

- City id: `ka`. Open it with `?city=ka`.
- Data: `data/ka/`.
- Hand-built scene parts: `js/scene/ka/` (the track's layout, the standing structure, the train, its physics and the rider's seat).
- Data tools: `tools/ka/` (`tools/ka/README.md` documents the track pipeline and every field of `coaster.json`).

## What's in it

- **The track**, 949 m of it (published: 950 m), as one closed circuit: station, launch straight, pull-up, the vertical run up the tower with its quarter twist, the top hat, the vertical run down through the 270-degree spiral, pull-out, the 129 ft airtime hill, the brake run and the turnaround home. Green box-truss track on everything raised, teal ladder track on the flat.
- **The top-hat tower**: three legs, nine rings of bracing, the crest walkway and lift mast, with **Zumanjaro: Drop of Doom** on its face (three orange tracks whose gondolas rise together and drop).
- **Supports** where the survey shows them (23 under the pull-up, pull-out and hill, in navy), and posts and piers under the flat track.
- **The station**: two lanes under a two-tier green roof on a timber frame, the entrance sign, the two storage tracks, the launch track's walkway, railings and brake fins.
- **The train**: train 1, the green one. Five cars, 18 seats, riders who change in the station, restraints that open and close. It runs the circuit all day whether anyone is aboard or not.
- **Night**: red obstruction lights on the tower, lamps along the launch track and over the crest, a lit station.
- **The park round it**, as OpenStreetMap had it on 1 June 2024: Great Adventure's paths and plazas, 420 buildings, the car parks, the lake and ponds, Hurricane Harbor, and the pine woods on every side (about 52,000 trees). The other rides are named where they stand but not modelled.

## Riding it

Pick **Kingda Ka** under **Ride a line**, or click the train. You sit in the front row.

- The train loads for 15 to 20 seconds, rolls out to the launch position, waits, settles back onto the catch car and is thrown to 128 mph in 3.5 seconds. It goes over the top at about 18 mph, falls through the spiral, takes the hill at about 85 mph and meets the brakes at about 63 mph. A whole cycle is about a minute and a half.
- The readout at the top shows speed, height and g-force, and what part of the ride you are on.
- **Launch now** (key 1) skips the waiting. **Back row / Front row** (key 3) changes seats.
- **Rollbacks.** About one launch in fifteen comes up short, as the real ones sometimes did: the train stops short of the crest, falls back down the tower, is caught by the launch track's brake fins and is launched again. **Force a rollback** (key 2) makes the next launch one of these.
- Drag to look around. Esc or **Get off** leaves.

## How close it is to the real ride

Measured from the USGS lidar survey flown on 8 March 2019 (and the 2010 survey for the tower's vertical runs):

| What | Model | Published |
| --- | --- | --- |
| Track length | 949.1 m | 950.4 m |
| Top of the rail above the ground at the tower's foot | 138.7 m | 139.0 m |
| Airtime hill above its ground | 39.5 m | 39.3 m |

- The two long legs, the launch incline, the pull-up and pull-out, the hill, the brake run, the turnaround and the top hat's arch are fitted to the returns on the rails, 5 to 11 cm rms. The rails are 1.00 m apart and the box truss 0.93 m deep, both read from the survey.
- The tower's legs, rings and struts, the 23 supports and the station roof are placed from the survey.
- **Assumed, not measured:** the track under the station roof (the survey cannot see it); which of the two lanes the train uses; exactly where the quarter twist on the way up sits (51 returns from 2010 place it; its direction, to the right, is the published one); every tube diameter; the train's dimensions; all colours, which are read from photographs. `tools/ka/README.md` lists each assumption with its numbers.
- The model's ground is flat. The real ground falls about 2 m from the station to the tower, so the station stands 0.9 m low and the tower 0.8 m tall against their real ground.
- The physics is calibrated, not measured: only the 3.5 second launch and the top speed are published. Air drag is set so the train crests at 8 m/s.

## Rebuilding the data

```bash
uv sync --group data --group fetch
uv run python -I tools/ka/fetch_ka.py                                # the park's sources -> tools/ka/src/
uv run python -I tools/ka/build_ka.py                                # writes data/ka/ (all but coaster.json)
uv run --with "laspy[lazrs]" python -I tools/ka/fetch_track.py       # the track's sources -> tools/ka/src/
uv run python -I tools/ka/build_track.py                             # writes data/ka/coaster.json
```

`build_ka.py` reads `coaster.json` to keep trees and buildings clear of the ride, so run it again after `build_track.py` if the track changes. `tools/ka/extent.py` holds the frame (its origin is the middle of the ride's layout) and the extents; if you change the frame there, change `CITIES.ka.frame` in `js/cities.ts` to match. The OpenStreetMap queries ask for the map as of `OSM_DATE` (1 June 2024), because today's map shows the site without the ride. `fetch_track.py` was written from the scripts that made the downloads but has not itself been run end to end.

`data/ka/rides.json` holds the mapped tracks of the park's other eleven coasters and its other attractions. The page does not load it yet.

## Sources

| What | Source |
| --- | --- |
| Track heights, the tower, supports and station | USGS 3DEP lidar: `NJ_South_Jersey_FEMA_2018` (flown here 2019-03-08) and `ARRA-NJ_3Counties_2010` |
| Track plan (as a first guess), paths, roads, water, woods, place names | [OpenStreetMap contributors, ODbL](https://www.openstreetmap.org/copyright), as of 2024-06-01 |
| Building footprints | [Overture Maps](https://overturemaps.org/) buildings, release `2026-10-21.0`: Microsoft ML Buildings and OpenStreetMap |
| Dimensions, the ride cycle, the twists, the trains | Published figures (Wikipedia, RCDB and the park's own), and photographs for shapes and colours |
