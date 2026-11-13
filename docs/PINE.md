# 1938 Pine St Kitchen (`pine`)

One kitchen rather than a city, at `?city=pine`. It has no map data: `js/scene/pine/kitchen.js`
builds the room by hand and `js/scene/pine/items.js` builds the things stored in it. `main.js`
skips the map loader, the city scene and the city panel controls for a city with `kitchen: true`.

## What's in it

- **The room**, modelled from photos: maple shaker cabinets, grey-beige laminate counters, mauve
  quarry tile, white top-freezer fridge with its spice racks, black gas range under a stainless
  microwave, stainless dishwasher, double sink under the east window, the island with stools,
  the wire pantry rack and the back door.
- **Every storage spot in the organization plan opens.** Click a drawer or door, or pick it under
  Drawers, Base cabinets or Upper cabinets in the panel (which also flies the camera to it). A
  card lists what goes inside and why. *Open everything* and *Close everything* do all of them.
- The sink base doesn't open: under the sink was out of scope.
- **Mini monorails** (our addition), three toy-sized lines with named stations, kept out of the
  way: the cars hang below the beam, and the beams hang from the counters and the ceiling. One
  train per line: two cars with a chef in a white toque inside (he waves when you look at him
  through the windows) and, between them, a flatbed carrying the line's load strapped down:
  - **Countertop Express** (red): back and forth just off the counter edge, from the drawer
    stack beside the stove round the corner past the dishwasher to the sink. Stations: Coffee
    Corner, Dishwasher Dock, Sink Street. Load: a big balloon whisk.
  - **Island Shuttle** (green): back and forth round the island's free end, hung from its
    counter edge. Stations: Back Door, Fruit Bowl, Stool Stop. Load: a baguette.
  - **Upper Cabinet Skyway** (blue): a loop round the room over the upper cabinets, hung from
    the ceiling. Stations: Fridge Top, Window Bay, Back Door. Load: a wheel of cheese and a
    rolling pin.

  They ride like the cities' monorails: click any car (the cursor turns to a hand over one you
  can board; the flatbeds have nowhere to sit), or *Ride* in the panel's *Mini monorail*
  section, to sit inside it. The cabin is the cities' monorail cabin shrunk to the toy cars,
  with its passenger (a chef in a toque and white jacket, who waves; you board facing him) and
  the lit next-stop sign; drag to look
  around, W A S D to walk, Esc or *Get off* to leave, and the line diagram at the bottom shows
  the stops. *Show lines* highlights each line in its colour. They're built with the shared
  monorail (`js/scene/monorail.js`) in `js/scene/pine/minirail.js`, where `LINES` holds each
  line's corners (inches), height and stations; the rides use the shared ride system
  (`js/scene/subway.js`, created empty but for these cars).

## Layout (inches; x east, z south, origin at the north-west corner)

| Run | Facing | What, west/north to east/south |
| --- | --- | --- |
| North wall | south | fridge (x 1–34), B1 + D1 (34–49), range (49–79), D2–D5 stack (79–91), lazy susan corner B2 |
| East wall | west | corner, dishwasher (z 36–60), sink base (60–96), D6 + cabinet (96–114), trash |
| Island | east | big cabinet IA under I1 + I2 at the back-door end, IB under I3 + I4 toward the rounded end |
| Uppers | | U1 over the fridge, U2, U3 over the microwave, U4, U5 in the corner, U6 by the window, U7 on the south wall over the island |

**Island spacing.** The island is placed so the aisle between its east counter edge and the sink
run's counter edge equals the gap between its west (seating) edge and the west wall:
`GAP = (SINK_EDGE - ISLAND_TOP) / 2`, about 32.75in each side. Change `ISLAND_TOP` or the room
width in `kitchen.js` and both gaps stay equal.

## Contents

The contents follow the organization plan as it last stood, including the later change to two
big 22.8 × 18 × 26in island cabinets: small appliances under I1 + I2, food storage, mixing bowls
and glass baking dishes under I3 + I4; the lazy susan keeps pots, the slow cooker and the
stockpot; the corner upper keeps Pyrex cups and prep bowls; and the tops of the uppers are clear.
Each spot's list is in its `items` in `kitchen.js`; the 3D things are placed in the fill code
right after it.
