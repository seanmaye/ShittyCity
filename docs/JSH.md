# Jersey Shore, PA

Jersey Shore borough in Lycoming County and the country around it: the town on the West Branch of the Susquehanna, the island across from Allegheny Street, Pine Creek coming in from the west, Avis, Antes Fort, and the hills that close in the valley, with Bald Eagle Mountain to the south. It is the first city here with real terrain: the streets, parks, river and buildings all lie on the hills. Its farm fields grow and are harvested through the year. It has no rail transit to ride and no proposal yet.

- City id: `jsh`. Open it with `?city=jsh`.
- Data: `data/jsh/`.
- Hand-built scene parts: `js/scene/jsh/` (labels and views; farms); the terrain is shared engine code, `js/scene/terrain.js`.
- Data tools: `tools/jsh/`.

## What's in it

- **About 4,100 buildings**: every footprint in the mapped area, about 7.5 by 5 km from Avis to east of Antes Fort.
  - The two- and three-storey blocks along Allegheny St, Main St and the streets next to them are brick.
  - Elsewhere, houses get clapboard and siding colours (white, cream, pale blue-grey, sage, some brick), and sheds, garages, schools and plants are sized by their footprint.
- **The borough** is paved inside its boundary, which is drawn on the ground. Outside it is countryside.
- **Streets and rail.** Every street, footpath and trail is shown, along with the Lycoming Valley Railroad and Norfolk Southern's Buffalo Line. The US 220 expressway and the PA 44 bridge over the river are included.
- **Water**: the West Branch around the island, Pine Creek, the old West Branch Canal at Lock 32, ponds and streams.
- **About 19,000 trees.** There are street trees along the residential streets, yard trees in town, and trees in every mapped wood.
- **Farms**: about 140 crop fields, around 9 km² in all, laid where the USDA Cropland Data Layer has crops. It shows 55 fields of corn, 32 of soybeans, 46 of hay and 3 of winter wheat. They follow the farming year:
  - Corn and soybeans are planted into tilled soil in May and come up in rows. Corn grows into a 2.7 m canopy and dries to tan in September, and soybeans yellow. Both are harvested in October, leaving stubble.
  - Winter wheat is green from autumn to spring, then turns gold and is cut in July.
  - Hay is cut three times a summer, and round bales lie in the field after each cut.
  - Each crop's fields fall into three groups about a week apart, so the valley isn't all planted or harvested on one day.
- **Barns and silos**: about 220 farm buildings get barn shapes: gambrel and gable barns in red, white or weathered grey, and long low pole barns. Each has a big door in each end. About 30 silos stand beside them.
- **Terrain**: a 20 by 20 km elevation grid in 40 m cells. On it the woods are dark green, the fields light green, and the river bed is carved just below the water. Past the mapped area the hills carry on to the horizon, coloured as forest or cropland from the Cropland Data Layer.
- **Views**: Allegheny St, the river bridge, the valley from Bald Eagle Mountain, the biggest corn field, and the mouth of Pine Creek, plus the Overview and Whole city views.

## How terrain works

Each city's data is still built flat, in the shared formats. A city with `terrain: true` in `js/cities.js` and a `terrain.bin.gz` file gets laid onto its hills as the scene is built (`js/scene/terrain.js`):

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

**Building heights are estimates.** The Microsoft footprints come with machine-learned heights, which run low here (most houses come out 3–5 m). The height rules in `build_jsh.py` (under `# buildings`) scale them up, and falls back on the footprint's size and whether it is downtown.

## Sources

| What | Source |
| --- | --- |
| Building footprints | [Overture Maps](https://overturemaps.org/) buildings, release `2026-10-21.0`: Microsoft ML Buildings and OpenStreetMap |
| Streets, rail, water, parks, woods, the borough boundary, place names | [OpenStreetMap contributors, ODbL](https://www.openstreetmap.org/copyright) |
| Crop fields | [USDA NASS Cropland Data Layer](https://www.nass.usda.gov/Research_and_Science/Cropland/SARS1a.php) 2021, via the [Microsoft Planetary Computer](https://planetarycomputer.microsoft.com/dataset/usda-cdl) |
| Elevation | [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Terrarium, zoom 12, mostly USGS 3DEP here) |
