# Philadelphia

All of Philadelphia out to the city limits, with every rail transit line and our proposals: a monorail loop along both banks of the Schuylkill, sports parks on two expressways, a park over the 30th Street rail yard, and Walnut Street as a brick promenade. The buildings, rivers, parks, streets and transit all come from real map data.

- City id: `phl`. Open it with `?city=phl`.
- Data: `data/phl/`.
- Hand-built scene parts: `js/scene/phl/`.
- Data tools: `tools/phl/`.

## What's in it

- **Center City, University City and Fairmount** form the detailed core. It holds the hand-made proposals:
  - styled landmarks
  - the riverfront monorail loop
  - the expressway sports parks
  - the rail yard park
  - Walnut Street as a car-free brick shopping street, from 22nd to Front, busy with people who stroll, shop and sit for a coffee
  - the Market Street subway cut-away
- **The rest of the city** surrounds the core without changing anything in it: about 500k more buildings, plus streets, parks, creeks and park trees.
- **Real terrain.** The ground is the USGS 3DEP bare-earth elevation at 10 m, from the tidal flats by the Navy Yard to the 130 m hills of Chestnut Hill and the Wissahickon gorge. The rivers sit at their real levels: the tidal Delaware and lower Schuylkill, and the higher pools above the Fairmount and Flat Rock dams. Every building stands on the ground under it: its walls reach down to the lowest point of its footprint, so none floats on a slope, and its roof is its LiDAR height above the middle. Streets, parks, bridges, trees, people and the proposals follow the ground. At-grade track lies on it, the Els keep their height above it, and tunnels keep their depth below it.
- **Every rail transit line** is modelled, and "Show transit lines" highlights them all:
  - the L and the B1-B3 Broad Street Line
  - the G1 and T1-T5 trolleys
  - all 13 Regional Rail lines
  - PATCO and NJ Transit's Atlantic City Line
- **River boats** cover the whole riverfront, and you can ride them like any train:
  - a proposed Delaware River taxi from Glen Foerd to Fort Mifflin (12 piers)
  - Lower Schuylkill boats from Fort Mifflin to the Fairmount Water Works, and Upper Schuylkill boats from Boathouse Row to Manayunk (the dams split the river)
  - the real RiverLink Ferry to Camden

  Routes follow the real water, mid-channel; the piers stand at real riverfront parks and landings.
- **Every car has a walkable cabin:** the M-4, B-IV, Kawasaki LRV, PCC, Silverliner IV, PATCO car, the monorail and the river boat. On the boats you can walk out of the cabin's back door onto the open stern deck.
- **See through someone's eyes** on Walnut Street, or at the punk show in the Railyard Bowl. Click any of the people there to inhabit them. You go where they go: you can look around but not steer. A card shows their age, sex, height, weight and a short biography. Esc or Space steps out. You can also click any café chair or bench to sit down.
- **The 1953 streetcars.** The Center City streetcar network of January 1953 is drawn as track with running PCC cars. You can ride any loop.
- **Citywide landmarks** are modelled on their real outlines:
  - Lincoln Financial Field, Citizens Bank Park and Xfinity Mobile Arena
  - Independence Hall and Memorial Hall
  - the Ben Franklin and Walt Whitman bridges
- **Go fishing.** People fish the Schuylkill at its real spots: below the Fairmount Dam, the Schuylkill Banks boardwalk, Kelly and MLK Drives, Bartram's Garden, Grays Ferry, Strawberry Mansion, East Falls and Manayunk. Click one and they ask you to join them. Then cast (farther out is deeper, with rarer catches), wait out the nibbles, strike on the bite (quickly: rarer catches give you less time) and reel, keeping the line tension in the green band while the fish runs, shakes its head and slowly tires. It's hard on purpose. There are 48 things to catch, from bluegill and catfish to striped bass, shad, snakehead and the legendary Atlantic sturgeon, plus trash and treasure, at five levels of rarity. Snap their line and they'll yell at you (with some colourful language) before giving you one more try. Shad run in spring and catfish bite at night. Your catch log is kept in your browser.
- **Chinatown** in detail ("Go to" Chinatown). The Friendship Gate spans 10th Street at Arch, with its 費城華埠 plaque, tiled roofs and stone lions. Shops along Race, 10th, 9th, 11th and Arch have signs, blade signs and awnings (the shops are made up), red lanterns are strung across Race, 10th and 9th, pagoda-topped lamps line the kerbs, and a dragon dance winds up and down Race Street. Signs, lanterns and lamps light up after dark.
- **The Chinatown night market** (our addition, "Go to" Chinatown night market) fills the open lot on 10th Street between Race and Cherry: food stalls, tables, string lights and a pavilion. Click the **Lucky Arcade** stall to play three games: Ping-Pong, Sky Swarm (a fixed shooter) and Dumpling Dash (a maze chase). Your best scores are kept in your browser.
- **Restaurants: djour's starred picks.** The 265 places inside the city limits that the [djour Philly food map](https://www.djourformore.com/) gives two or three stars ("worth a commute", "must hit"). Each stands where it really is: OpenStreetMap's point for it where OSM has the place by name (131 of them; the rest at djour's own point), with its storefront on the wall of its building that faces the street in its address (or the nearest street). The storefront has a painted frame, shop windows and a door, an awning in its colours and a sign board with its name and stars; the signs and windows light up after dark. Bars get lanterns instead of an awning, cafés and bakeries bistro tables outside, three-star places a blade sign and planters, breweries a roll-up door and picnic tables; food trucks park at the kerb and farmers markets are rows of tents. Each has its own label (with its stars) and a gold dot on the minimap. The panel's **Restaurants** section switches their labels on and off separately from the other labels, lists them by neighbourhood (or the three-star picks), and flies to one: the camera stands in its street and its card shows djour's stars, the kind of place, price, neighbourhood, djour's tags and djour's note where it has one (word for word). Clicking a restaurant's label flies you to just in front of it and opens the same card; the card's link to djour opens in a new tab. The 47 three-star picks are rebuilt from photos of their real exteriors: the building's own wall (brick, stone or render, in its colour) with its upper windows, the shop front's frame, windows (plate glass, multi-pane, arched, a counter window, a roll-up door), door, awning (shed, canopy, barrel, marquee) and their actual signs (boards, loose letters, blade signs, neon, lettering on the glass, painted walls), sconces, string lights and seating. Five of them have no street front of their own (DiNic's in Reading Terminal Market, Machine Shop in the Bok Building, JG Skyhigh and Vernick Fish in the Comcast Technology Center, Emily Wilson Pastry in the Globe Dye Works mill) and show only their sign at the entrance.
- **Easter eggs.** A pickup ultimate game runs on the Belmont & Edgley cricket ground in West Fairmount Park, and something is waiting on the arena plaza.
- **Signature towers** are modelled with their real setbacks and crowns.
- **Skyline lights** colour these for the Birds, the Phillies, the Sixers, the Flyers, the Union, the holidays and more:
  - the towers' crowns
  - the Cira Centre's LED skin and the FMC crown
  - Boathouse Row
  - the bridges' cable lights

## How the real data is used

- **Buildings.**
  - Every footprint in the area is extruded to its LiDAR height.
  - Signature towers keep their hand-modelled crowns: the Liberty Place spires, the Comcast Center taper, the BNY Mellon and Commerce Square pyramids, Three Logan's steps and the PSFS sign.
  - Each crown is centred on the real footprint, rotated to match it, and sized to the tower's floor plate. The rest of that lot stays as a low base.
  - Flat-topped towers (FMC, Cira, IBX, the Laurel and others) use their real footprint and height, in their original colours.
- **River.**
  - The water is the OSM polygon.
  - A 700-point centreline is the shortest path through OSM's river-line network, which splits the river around the dam and the Water Works.
  - The centreline is re-centred between the real banks, and the bank-to-bank width is measured at each point.
  - The monorail, its stations and the rowing shells follow this centreline.
- **Monorail.**
  - The guideway is set back 58 m from the water on the east bank and 65 m on the west bank.
  - Where a real building over 15 m tall is in the way, the guideway moves toward the water, up to a short cantilever over the bulkhead.
  - It is then checked against every footprint until it clears.
- **Landmark details.**
  - The Eastern State cell blocks and the Art Museum are still stylised.
  - The city layer stores Eastern State as one 185 m block, so the model is fitted to that site and turned −9.3° to match the street grid.
- **Citywide landmarks.**
  - The stadiums use their OSM outlines and pitches with LiDAR heights. The stands rise from the pitch edge to the outline.
  - The football markings are the real 109.7 × 48.8 m, placed inside OSM's pitch (which includes the apron).
  - Citizens Bank Park's home plate is the pitch corner whose foul corners sit about 110 m away at a right angle. Its outfield faces north-northeast, toward the skyline, as in the real park.
  - The bridges follow the OSM deck ways. Their real main spans (533 m and 610 m) are centred on the river crossing.

## Proposal: expressways to sports parks

I-76 (Schuylkill Expressway) and I-676 (Vine Street Expressway), with all their ramps, are taken out of the street layer:

- Carriageways become a green corridor. Ramps become greenway trails. Elevated sections become park bridges.
- `tools/phl/proposal.py` finds each expressway's centreline, midway between its two carriageways. It then lays courts end to end wherever they fit: tennis, basketball, five-a-side soccer and volleyball. No pickleball.
- Courts stay off bridges, the Logan Square tunnel, buildings, water, rail and remaining streets. They switch to a narrower court type where the corridor tightens. There are currently 134 courts.
- A shuttle monorail (teal livery) runs at 26 m above each corridor. That is above the 18 m riverfront loop, so the two can cross. Piers stand between courts, and trains run end to end and back.
- Each corridor also gets a promenade path along one edge. The courts have floodlights that switch on at dusk.
- The "Proposed monorails" group under **Ride a line** has all three lines: the riverfront loop, the Schuylkill line and the Vine Street line. On the shuttle lines, the camera turns around at each terminus while the train waits.

Full-size soccer pitches (68 x 44 m) are supported, but none ever fits the corridor's width.

## Proposal: Rail Yard Park and the Railyard Bowl

The rail yard north of 30th Street Station is covered by a deck at 10.5 m, just above the street bridges that already cross it. On top is a 33 ha park.

- **Outline.**
  - `tools/phl/cap.py` draws the outline from the yard itself. It builds a raster mask around the tracks, closes the gaps between them, and fills in the yard's interior.
  - It then trims the deck to stay off the station, the I-76 sports park, through streets, the river, and any building taller than the deck.
  - Any such building stands up through a cut-out in the park.
- **The park.**
  - A promenade runs just inside the edge, with paths leading out from the bowl, scattered trees and open lawns.
  - Trees keep clear of the monorail guideways.
  - Street bridges over the yard now meet the deck instead of crossing above it. The real rail viaducts are kept.
- **The Railyard Bowl.** The site search picks the largest fan-shaped lawn that fits (125 m radius). The stage faces the audience, so they look past it toward the Center City skyline. It sits at least 80 m from the monorail corridors, so the shell stays clear of the guideways. The bowl has:
  - red fixed seats in front, with grass terraces stepping up behind;
  - a bandshell of nested arches whose steps glow at dusk;
  - a stage with an apron and a backstage building;
  - video screens, speaker towers and delay towers;
  - a ring of light poles, and moving light beams at dusk.
- **The show: Alvin and the Chipmunks, live, to a crowd of punks** ("Go to" Punk show at the Railyard Bowl; an evening show, so the flight moves the clock to 8:30 PM if it's earlier than 5). In `js/scene/phl/concert.js`.
  - On stage, giant chipmunks: Alvin out front with a mic (red sweater with the big "A", red cap), Simon on guitar (blue, glasses) and Theodore on the drums (green). The set loops through seven songs, and the video screens say what's playing. For two of them the Chipettes come out of the wings (Brittany in pink, Jeanette in purple with glasses, Eleanor in green with pigtails), sing and dance, and walk off again.
  - In the pit and up the first rows, about 80 punks: mohawks and liberty spikes in neon colours, shaved heads, studded leather, denim and army jackets with patches on the back, band tees, red plaid bondage pants, combat boots, spiked collars, wallet chains. Each one pogos, headbangs, holds a fist up, moshes in the pit, smokes, drinks, or sits slumped in a K-hole on the steps, and now and then does one of their own things by themselves. Nobody stands under the rail viaduct that crosses the seats.
  - Click a punk to see through their eyes, with a card about them (a made-up name, punk name, neighbourhood, job, band, why they're at a Chipmunks show, what they have on and what they're on tonight: `punkprofiles.js`). Each has four things to do (keys 1 to 4), two drugs and two other things, from: Take a puff, Shoot ketamine, Huff glue, Drop a pill, Do a bump of speed, Shotgun a beer, Light a cigarette, Pogo, Start a mosh pit, Crowd surf, Spit at the stage and Yell “ALVIN!” (Alvin turns and points at you). They play out on the body and on what you see: being stoned sways and softens the view; glue blurs and brightens it; a pill, once it kicks in, cycles the colours; speed jitters it; beers add a drunken roll; and ketamine leaves the body: the view floats up out of you and looks down on you slumped on the steps for 40 seconds. Everyone here is fictional.

## Proposal: the Walnut Street promenade

Walnut Street from 22nd to Front becomes a car-free shopping street.

- **The street.**
  - The road surface is replaced by herringbone brick, 9 m each side of the centreline, with granite gutters either side of the streetcar track. The 1953 rails stay, set in the paving.
  - Along each kerb line, a 24 m rhythm of lamp, bench, planter tree and bench repeats.
- **The shops.**
  - Building faces that front the street get an awning and a lit shop window about every 6.5 m.
  - Each shop bay has a door, and about half the shops have café tables outside.
- **The people.** About 200 people stroll both sides, go into shops through doors that swing open, and sit on benches or at café tables with a coffee or a book.
  - Their figures are Kyle's jointed people, drawn instanced.
  - Each has a made-up name, age, height, weight and biography (`js/scene/phl/profiles.js`). All of them are fictional.
- **Sit or inhabit.** Every café chair and bench is a seat you can click to sit on. Click a person to see the street through their eyes.
- **The view.** "Go to" has a "Walnut St promenade" view.

The whole proposal is code: `js/scene/phl/promenade.js` (the street and shops) and `js/scene/phl/pedestrians.js` (the people). It needs no data files of its own.

## Rebuilding the data

All of these write to `data/phl/`. Raw downloads go to `tools/phl/raw/`, which is kept out of git.

### The core

```bash
python tools/phl/fetch_data.py tools/phl/raw
```

```bash
python -I tools/phl/build_data.py tools/phl/raw data/phl
```

`fetch_data.py` retries across Overpass mirrors because the public servers are often busy. The raw downloads are about 45 MB, and the core's data files come to about 5.5 MB. `build_data.py` does not touch `data/phl/transit.json` or the citywide files.

The L and trolley data (`data/phl/transit.json`) and the 1953 streetcars have their own builders: see [tools/phl/README.md](../tools/phl/README.md).

### The rest of the city and the transit network

The OpenStreetMap data comes from Geofabrik's Pennsylvania extract (about 350 MB), read with pyosmium (the `data` group, `uv sync --group data`). That's much faster and more reliable than querying Overpass for an area this size.

```bash
python -I tools/phl/fetch_city.py
```

```bash
curl -L -o tools/phl/raw/osm/pennsylvania.osm.pbf https://download.geofabrik.de/north-america/us/pennsylvania-latest.osm.pbf
```

```bash
uv sync --group data
```

```bash
uv run python -I tools/phl/extract_osm.py
```

```bash
uv run python -I tools/phl/extract_landmarks.py
```

```bash
uv run python -I tools/phl/extract_bridges.py
```

```bash
python -I tools/phl/build_landmarks.py
```

```bash
python -I tools/phl/build_boats.py
```

```bash
python -I tools/phl/build_city.py
```

```bash
python -I tools/phl/build_metro.py
```

```bash
python -I tools/phl/fetch_eats.py
```

```bash
python -I tools/phl/build_restaurants.py
```

```bash
python -I tools/phl/fetch_dem.py
```

```bash
python -I tools/phl/build_terrain.py
```

What each step does:
- `fetch_city.py` downloads the 546k building footprints (about 210 MB, resumable) and the city boundary.
- `build_city.py` keeps everything outside the core and inside the city limits, so the core's data is never touched. It takes about 5 minutes.
- Run `build_landmarks.py` before the other two builds:
  - `build_city.py` leaves out the footprints inside the landmark outlines and the bridge decks.
  - `build_metro.py` lays PATCO on the Ben Franklin Bridge deck.
- `build_metro.py` builds every line's track, stations and out-and-back route. It reuses the Center City L and trolley geometry exactly, and blends the new track into it at the edge of the core.
- The restaurants: djour's starred places are read from the map on its page into `tools/phl/raw/djour/markers.json` (name, position, stars, tags, neighbourhood and note; there is no download script, since the page loads them itself). `fetch_eats.py` downloads OpenStreetMap's named food and drink places (one Overpass query, about 1.5 MB), and the OSM objects at the street addresses in `restaurant_looks.json`. `restaurant_looks.json` (in git) holds the researched exteriors of the three-star picks, written from photos of each one (its sources are listed with it); edit it to change a look. `build_restaurants.py` merges djour's repeated rows, leaves out the closed ones and those outside the city limits, moves each to its OSM namesake within 250 m (or, for a researched one, to its street address), finds the wall it fronts (the street in its OSM address, else the nearest one) and a camera spot in that street with a clear view of it, and writes `restaurants.json`. It needs `city.json.gz`, `city_buildings.bin.gz` and the raw OSM roads, so run it after `build_city.py`.
- `fetch_dem.py` downloads the 3DEP elevation for the city's box plus 600 m, at 10 m, as four float32 GeoTIFFs (about 40 MB) from the USGS National Map elevation service.
- `build_terrain.py` resamples it onto the scene grid and lowers a riverbed under the water the scene draws, so run it after `build_city.py`. It takes under a minute and writes `terrain.bin.gz` (about 6 MB). The ground everything else stands on is worked out when the page loads, so nothing else needs rebuilding when the terrain changes.

| Tool | What it does |
| --- | --- |
| `fetch_data.py` | downloads the raw sources for the core |
| `build_data.py` | turns them into the core's files in `data/phl/` |
| `geom.py` | small geometry helpers (no dependencies) |
| `proposal.py` | lays out the expressway sports parks (`sports.json`) |
| `cap.py` | shapes the rail yard deck and sites the bowl (`yardpark.json`) |
| `fetch_city.py` | downloads the citywide building footprints and the city boundary |
| `extract_osm.py` | cuts the city's OSM data out of the Geofabrik Pennsylvania extract |
| `citylimits.py` | the city boundary and a fast point-inside test |
| `build_city.py` | the rest of the city (`city.json.gz`, `city_buildings.bin.gz`) |
| `build_metro.py` | the citywide rail network (`metro.json.gz`) |
| `build_transit.py` | the Center City L and trolley data (`transit.json`) |
| `build_trolley1953.py` | the 1953 streetcars (`trolley1953.json`) |
| `extract_landmarks.py` | stadium, hall and pitch outlines from the Pennsylvania extract |
| `extract_bridges.py` | the Delaware bridge decks and Memorial Hall (merged into the same file) |
| `build_landmarks.py` | fits the landmark models (`city_landmarks.json`) |
| `build_boats.py` | routes the river boats mid-channel through the water (`boats.json`), from `city.json.gz` and `river.json` |
| `fetch_eats.py` | downloads OpenStreetMap's named food and drink places, to check djour's points against |
| `build_restaurants.py` | djour's starred restaurants, placed and faced (`restaurants.json`) |
| `restaurant_looks.json` | the researched exteriors of the three-star picks, merged in by `build_restaurants.py` |
| `fetch_dem.py` | downloads the USGS 3DEP bare-earth elevation (10 m GeoTIFFs) |
| `build_terrain.py` | the ground heights and water levels (`terrain.bin.gz`) |

## Sources

| What | Source |
| --- | --- |
| Building footprints and heights | City of Philadelphia, *LI Building Footprints* (OpenDataPhilly). Heights are the LiDAR `approx_hgt` field. |
| 30th Street Station, the Murano | OpenStreetMap outlines (both are missing from the city layer) |
| River, shoreline, Fairmount Dam | OpenStreetMap water polygons and `waterway` lines |
| Parks, grass, woods | OpenStreetMap `leisure` / `landuse` / `natural` areas |
| Streets, trails, rail, bridges | OpenStreetMap `highway` / `railway` ways |
| Rail transit: tracks, stations, platforms, entrances | OpenStreetMap route relations; tunnel depths and El heights are estimates |
| City limits | OpenStreetMap relation 188022 |
| Restaurants | djour's Philly food map, [djourformore.com](https://www.djourformore.com/): the two- and three-star picks, their tags and notes (quoted word for word with permission); positions checked against OpenStreetMap's named food and drink places |
| Terrain | USGS 3D Elevation Program (3DEP) bare-earth DEM, 1/3 arc-second, from the National Map elevation service (public domain) |
| 1953 streetcars | The Philadelphia Transportation Company map of January 1953, and Harold E. Cox, *Surface Cars of Philadelphia 1911-1965* |

Map data © OpenStreetMap contributors, ODbL. Building data © City of Philadelphia.
