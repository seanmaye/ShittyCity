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
