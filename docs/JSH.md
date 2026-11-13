# Jersey Shore, PA

Jersey Shore borough in Lycoming County and the country around it: the town on the West Branch of the Susquehanna, the island across from Allegheny Street, Pine Creek coming in from the west, Avis, Antes Fort, and the hills that close in the valley, with Bald Eagle Mountain to the south. It was the first city here with real terrain: the streets, parks, river and buildings all lie on the hills. Its farm fields grow and are harvested through the year.

- City id: `jsh`. Open it with `?city=jsh`.
- Data: `data/jsh/`.
- Hand-built scene parts: `js/scene/jsh/` (labels and views; farms; the seed corn and its detasseling crew; the overlook on Bald Eagle Mountain and the late harvest below it); its terrain is its own module, `js/scene/jsh/terrain.js` (an elevation grid with land cover, a different format from Philadelphia's lidar terrain in `js/scene/terrain.js`).
- Data tools: `tools/jsh/`.

## What's in it

- **About 5,100 buildings**: every footprint in the mapped area, about 7.5 by 5 km from Avis to east of Antes Fort, plus about 1,000 filled in where the borough's streets had empty frontage. Each is built as the kind of building it is (`js/scene/jsh/town.js`), not extruded flat:
  - **Borough houses**: two-storey frame houses in clapboard colours, front-gabled on the narrow deep lots, side-gabled, or hip-roofed foursquares with a dormer. Most have a front porch with posts and a rail, many a chimney, some shutters and tin roofs.
  - **Brick houses**: Federal side gables with a chimney at each end, or low-hipped Italianates with a deep cornice. Some are three storeys near downtown, and some have slate roofs.
  - **Allegheny St and Main St business blocks**: brick storefronts on their real footprints, with shop windows, a sign band, tall upper windows with stone heads, and a cornice.
  - **Churches** have a steep front gable of coloured windows, a tower, a belfry and a spire. **Schools and stores** are flat-roofed brick or steel. **Mills and warehouses** are ribbed steel with overhead doors, under a low gable when the footprint is a plain rectangle.
  - **Outside the borough** there are one-storey ranches, Cape Cods with dormers, older farmhouses and single-wide trailers on skirting.
  - **Garages and sheds** are small gabled outbuildings with their doors.
  - Every building faces its nearest street. The type of each, and that orientation, are worked out in `build_jsh.py` (under `# what each remaining building is`). The infill and its alley garages are under `# infill`. Infill keeps off existing buildings, streets, paths, rail, water, parks, school grounds, downtown and big plants.
- **The borough** is paved inside its boundary, which is drawn on the ground. Outside it is countryside.
- **Streets and rail.** Every street, footpath and trail is shown, along with the Lycoming Valley Railroad and Norfolk Southern's Buffalo Line. The US 220 expressway and the PA 44 bridge over the river are included.
- **Proposed West Branch Loop.** The elevated monorail links Allegheny Street, the river island and Antes Fort. Pick it under **Ride a line** or click a car to board. The guideway climbs gradually onto the foothills near Antes Fort and descends toward the river on the way back. Its route is in `data/jsh/monorail.json`, with guideway elevations in metres above the model datum. Piers and station stairs extend to the local ground height.
- **Water**: the West Branch around the island, Pine Creek, the old West Branch Canal at Lock 32, ponds and streams.
- **About 19,000 trees.** There are street trees along the residential streets, yard trees in town, and trees in every mapped wood.
- **Farms**: about 140 crop fields, around 9 km² in all, laid where the USDA Cropland Data Layer has crops. It shows 55 fields of corn, 32 of soybeans, 46 of hay and 3 of winter wheat. They follow the farming year:
  - Corn and soybeans are planted into tilled soil in May and come up in rows. Corn grows into a 2.7 m canopy and dries to tan in September, and soybeans yellow. Both are harvested in October, leaving stubble.
  - Winter wheat is green from autumn to spring, then turns gold and is cut in July.
  - Hay is cut three times a summer, and round bales lie in the field after each cut.
  - Each crop's fields fall into three groups about a week apart, so the valley isn't all planted or harvested on one day.
- **Corn up close**: near the camera, every corn field is drawn as real plants on its own rows, the same plants as the seed-corn block, with tassels from early July (`js/scene/jsh/cornlod.js`). Further off it stays a solid canopy, with a hole cut exactly where the plants stand.
  - Within 30 m the plants are full; out to 90 m they're simplified, with every other one left out past 50 m.
  - The higher you fly, the smaller that area gets, and above about 95 m there are no plants at all, so the overview costs nothing extra.
  - Plants are made 16 m square at a time as you get near, and the last 500 squares are kept.
  - Low over a field this adds about 300k triangles and well under 5 ms of CPU on frames where the camera has moved.
- **Seed corn and a detasseling crew**: in the biggest corn field, on the island, there is a seed-corn block 120 m long. It has four sets of four female rows, each set between two male rows. The female parent lines are short (about 2 m at tasseling), and the male rows stand half a metre taller and keep their tassels.
  - From July 5 to August 6, 6:00 to 15:00, a crew of four teenagers walks the female rows, one to a row, pulling every tassel. They go up one set and back down the next, and the tassels disappear as they pass. When the block is done they start a second pull, and the tassels come back.
  - Until the dew burns off at 10:30 they wear black trash bags over their torsos and legs.
  - The crew boss walks a few steps behind them, scowling, with a pistol holstered on the belt.
  - Click any of the five to see through their eyes. Their card works like the Walnut St one in Philadelphia: a portrait, age, sex, height, weight, what they're doing right now, and a short life story. The stories are fictional, written for these people (`js/scene/jsh/crewprofiles.js`).
  - From a distance the block is under its field's own canopy and can't be told apart. Its plants and the crew show inside the same circle of real corn as every other field.
  - The **Detasseling crew** view follows the crew, wherever they are in the rows. Set the Season slider to July and the time to morning to see them.
  - The season window is `SEASON` in `js/scene/jsh/detassel.js`, and the working hours and the dew time are `HOURS` and `DEW` there.
- **The overlook on Bald Eagle Mountain** (`js/scene/jsh/overlook.js`): the **Bald Eagle Vista w/ Mr. Kepner** view flies to the flat top of the mountain, a few steps off the summit toward town, and leaves you standing behind a deer hunter in a folding chair (he and the buck below are there all year, not just in deer season). He wears camo and a blaze-orange vest and cap, smokes a cigarette that gives off smoke, and now and then takes a drag or a drink by himself. Beside him are a torn-open 40-pack of beer and the empties, and a stump with his binoculars on it and his rifle leaning against it; off to his right, in frame from the view, his pickup stands nose to the valley with the tailgate down and an eight-point buck in the bed. Drag (or click) to look around from behind the chair; the button reads "Step away", and Esc or Space steps away too.
  - Click him to see through his eyes. His card is like the Walnut St and detasseling-crew cards (portrait, age, sex, height, weight, what he is doing now, a short life story; Duane Kepner is fictional, like the crew). Three buttons, also on keys 1, 2 and 3: **Take a drag** (his hand comes up and he breathes smoke out), **Drink beer** (the can comes up and the view tips back; each one finishes a can, adds an empty to the ground and moves the beer count on his card up by one; left to himself he only sips, four to a can), and **Check out the view** (his binoculars come up, pan and zoom to whatever is worth watching; scroll zooms, dragging takes over from the pan). From the summit the town is some 7 km away, so the valley is a fairly thin band on the horizon. Esc or Space steps back behind the chair, and again hands the camera back.
  - The site is a few steps off the "Bald Eagle Mountain" label in `places.json` toward town (`overlookSite()`). The old "Bald Eagle Vista w/ Mr. Kepner" view is no longer in `data/jsh/places.json` or `tools/jsh/build_jsh.py`: the overlook module owns it, and the flight there ends with you standing (`stand()`), not orbiting.
- **The last corn standing, and a combine** (`js/scene/jsh/harvest.js`): one corn field is left standing late and taken off slowly by a red combine with an eight-row corn head, so there is something to watch through the binoculars. It is the nearest corn field of 3 ha or more whose whole outline is in sight of the overlook with little standing in front of it (`pickLateField()`; today a 33 ha field whose centre is about 5.8 km from the summit). The combine works it from October 14 to December 1 (`HARVEST`), 7:00 to 21:30 (`HOURS`), lights on after dark, up one swath and back down the next. How far it has got follows the date, and from there it carries on in real time. Behind it the field is stubble, and up close the real corn plants (`cornlod.js`) disappear as it passes. Outside the harvest window the binoculars go to the river bridge in town instead. This field is drawn by `harvest.js`, not `farms.js`, and its group's usual October harvest day does not apply to it.
- **Barns and silos**: about 220 farm buildings get barn shapes: gambrel and gable barns in red, white or weathered grey, and long low pole barns. Each has a big door in each end. About 30 silos stand beside them.
- **Terrain**: a 20 by 20 km elevation grid in 40 m cells. On it the woods are dark green, the fields light green, and the river bed is carved just below the water. Past the mapped area the hills carry on to the horizon, coloured as forest or cropland from the Cropland Data Layer.
- **Views**: Allegheny St, the river bridge, Bald Eagle Vista w/ Mr. Kepner (the overlook above: the flight ends with you standing behind the hunter), the biggest corn field, the detasseling crew, and the mouth of Pine Creek, plus the Overview and Whole city views.

## How terrain works

Each city's data is still built flat, in the shared formats. Jersey Shore has `grid: true` in `js/cities.js`, and its `terrain.bin.gz` is loaded as `data.grid` (not `data.terrain`, which is Philadelphia's format). Everything gets laid onto its hills as the scene is built (`js/scene/jsh/terrain.js`):

- **Buildings** stand at the lowest ground under their footprint, so no wall floats on a slope. Their roofs stay level.
- **Trees** stand on the ground at their own spot.
- **Flat layers** (paving, parks, water, streets, rail, bridge decks) are cut along the grid's own triangle edges and lifted. Every piece lies exactly in the plane of the terrain under it, so nothing pokes through, however steep the slope.
- **The ground itself** is drawn from the grid in 2 km tiles. Flat country continues past it to the horizon, and the grid eases down to that level over its last 1.5 km.

Heights in the scene are metres above the river by town (about 157 m above sea level, `base` in the file), so the valley floor sits near y = 0. Labels and views (`places.json`) already include the ground height.

## Rebuilding the data

```bash
python -m pip install shapely numpy pillow pyproj duckdb rasterio
python -I tools/jsh/fetch_jsh.py      # downloads the sources into tools/jsh/src/
python -I tools/jsh/build_jsh.py      # writes data/jsh/
python -I tools/bundle.py
```

`fetch_jsh.py` only needs re-running to refresh the sources. `duckdb` is only needed for its buildings step, and `rasterio` for its crop step. The sources are committed in `tools/jsh/src/`. `tools/jsh/extent.py` holds the frame and the extents: the origin is Allegheny & Main, `MODEL` is the mapped area and `TERRAIN` is the elevation grid. If you change the frame there, change `CITIES.jsh.frame` in `js/cities.js` to match.

**Farms are estimated from 30 m crop pixels.** Fields of one crop that touch are merged into one, and their edges are smoothed and kept off roads, buildings, woods and water. The newest Cropland Data Layer online is 2021, and corn and soybeans rotate from year to year. Barns are footprints of at least 140 m² outside the borough, near fields or pasture, and not among a cluster of houses. Silos are small round footprints beside a barn. The rules are under `# farms` in `build_jsh.py`. Farm buildings are drawn by `js/scene/jsh/farms.js`, not as ordinary buildings.

**Building heights are estimates.** The Microsoft footprints come with machine-learned heights, which run low here (most houses come out 3–5 m). Pitched-roof buildings take their storeys from their type in `town.js`. The flat-roofed ones (business blocks, schools, mills) use the height rules in `build_jsh.py` (under `# buildings`), which scale the ML heights up and fall back on the footprint's size and whether it is downtown. **Infilled houses are guesses**: they mark where a house probably stands, not a mapped footprint.

## Sources

| What | Source |
| --- | --- |
| Building footprints | [Overture Maps](https://overturemaps.org/) buildings, release `2026-10-21.0`: Microsoft ML Buildings and OpenStreetMap |
| Streets, rail, water, parks, woods, the borough boundary, place names | [OpenStreetMap contributors, ODbL](https://www.openstreetmap.org/copyright) |
| Crop fields | [USDA NASS Cropland Data Layer](https://www.nass.usda.gov/Research_and_Science/Cropland/SARS1a.php) 2021, via the [Microsoft Planetary Computer](https://planetarycomputer.microsoft.com/dataset/usda-cdl) |
| Elevation | [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Terrarium, zoom 12, mostly USGS 3DEP here) |
