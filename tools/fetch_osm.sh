#!/bin/sh
# Re-download the OpenStreetMap transit data that build_transit.py reads (run from the tools/ folder,
# in Git Bash). Uses the public Overpass API; please don't run it in a loop.
# Data (c) OpenStreetMap contributors, ODbL.
set -e
cd "$(dirname "$0")/osm"
UA="transit-model-builder/1.0"
API=https://overpass-api.de/api/interpreter

# 1) tracks, stations, stops and entrances in the model area (plus the route list)
Q='[out:json][timeout:120];
(
  way["railway"~"^(subway|tram|light_rail)$"](39.925,-75.235,39.990,-75.140);
  node["railway"~"^(station|stop|halt|subway_entrance|tram_stop)$"](39.925,-75.235,39.990,-75.140);
  node["public_transport"~"^(stop_position|platform|station)$"]["subway"="yes"](39.925,-75.235,39.990,-75.140);
  node["public_transport"~"^(stop_position|platform|station)$"]["light_rail"="yes"](39.925,-75.235,39.990,-75.140);
  node["public_transport"~"^(stop_position|platform|station)$"]["tram"="yes"](39.925,-75.235,39.990,-75.140);
);
out tags geom;
rel["route"~"^(subway|tram|light_rail)$"](39.925,-75.235,39.990,-75.140);
out tags;'
curl -s -m 150 -A "$UA" --data-urlencode "data=$Q" "$API" -o transit.json
echo "transit.json: $(wc -c < transit.json) bytes"

# 2) the route relations used (L and T1-T5, both directions). To add a line, put its
#    relation ids here AND in ROUTE_IDS in build_transit.py (find ids on openstreetmap.org).
Q='[out:json][timeout:90];
rel(id:951958,7953595,10702992,1808454,2717636,10703187,1809444,10705524,1809435,10705414,2723998,10703675);
out body;'
curl -s -m 120 -A "$UA" --data-urlencode "data=$Q" "$API" -o routes.json
echo "routes.json: $(wc -c < routes.json) bytes"

# 3) for the 1953 streetcar layer (build_trolley1953.py): named Center City streets, and old
#    tram track still mapped in OSM in the model area
Q='[out:json][timeout:90];
way["highway"~"^(trunk|primary|secondary|tertiary|residential|unclassified)$"]["name"](39.936,-75.192,39.962,-75.136);
out tags geom;'
curl -s -m 120 -A "$UA" --data-urlencode "data=$Q" "$API" -o streets_cc.json
echo "streets_cc.json: $(wc -c < streets_cc.json) bytes"
Q='[out:json][timeout:90];
( way["disused:railway"="tram"](39.930,-75.208,39.982,-75.136);
  way["abandoned:railway"="tram"](39.930,-75.208,39.982,-75.136); );
out tags geom;'
curl -s -m 120 -A "$UA" --data-urlencode "data=$Q" "$API" -o oldtram.json
echo "oldtram.json: $(wc -c < oldtram.json) bytes"
