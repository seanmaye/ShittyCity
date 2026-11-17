// The cities this model can show, and the active one. Everything that differs between cities
// and isn't data (projection, camera, sun, HUD text, which data files to load) lives here.
// js/main.ts calls setCity() once, before any data is loaded or scene module runs, so modules
// may read CITY inside their functions (never at module top level: imported modules run their
// top level before main.ts calls setCity()).
import type { City, CityEntry } from './types/city.ts';

// Philadelphia's SEPTA station tags: Metro ids, trolley ranges, then the networks
export function septaLines(s, LINES) {
  const ids = s.lines || [], parts = [], t = ids.filter(i => /^T\d$/.test(i)).map(i => +i.slice(1)).sort((a, b) => a - b);
  for (const id of ids) if (/^(L|B\d|G\d)$/.test(id)) parts.push(id);
  if (t.length) parts.push(t.length > 2 && t[t.length - 1] - t[0] === t.length - 1 ? `T${t[0]}–T${t[t.length - 1]}` : t.map(v => 'T' + v).join(', '));
  const groups = new Set(ids.map(i => LINES[i] && LINES[i].group).filter(g => g && g !== 'SEPTA Metro'));
  return [...parts, ...groups].join(' · ');
}

// Each entry is checked as a CityEntry (js/types/city.d.ts), and may also carry fields that type doesn't list yet: a new
// field on a city is not an error (the & Record<string, unknown>).
export const CITIES: Record<string, CityEntry & Record<string, unknown>> = {
  phl: {
    id: 'phl', name: 'Philadelphia',
    // the loading slideshow (js/loading.ts): frames of the 3D city at its points of interest, made
    // by tools/loading/capture.py. view: a "Go to" view id, or cam: [[x, y, z], [tx, ty, tz]] (y over
    // the ground); hour: hours from sunset; day: day of the year (0 = 1 Jan; 285, mid-October, if left
    // out). hero: [pose, outfit] (POSES and OUTFITS in js/loading.ts); side: where the figure stands.
    loadingScreens: [
      { file: 'poi-independence-hall.webp', name: 'Independence Hall', area: 'Old City', view: 'indhall', hour: -1, hero: ['akimbo', 'tee'], side: 'right' },
      { file: 'poi-chinatown.webp', name: 'Friendship Gate', area: 'Chinatown', view: 'chinatown', hour: 0, hero: ['point', 'red'], side: 'left' },
      { file: 'poi-ben-franklin-bridge.webp', name: 'Ben Franklin Bridge', area: 'Delaware River', view: 'bfb', hour: -.25, hero: ['flex', 'green'], side: 'left' },
      { file: 'poi-walnut-street.webp', name: 'Walnut St Promenade', area: 'Center City', view: 'walnut', hour: -.6, hero: ['strut', 'black'], side: 'right' },
      { file: 'poi-sports-complex.webp', name: 'Sports Complex', area: 'South Philly', view: 'stadiums', hour: -.8, hero: ['folded', 'yellow'], side: 'left' },
      { file: 'poi-railyard-bowl.webp', name: 'Alvin and the Chipmunks', area: 'Live at the Railyard Bowl', view: 'punks', hour: -.5, hero: ['rock', 'punk'], side: 'right' },
    ],
    blurb: 'All of Philadelphia to the city limits, every rail transit line, and a proposed monorail loop along the Schuylkill.',
    // projection: x metres east, z metres south of (LAT0, LON0); MX is metres per degree of longitude here
    frame: { LAT0: 39.9560, LON0: -75.1760, MX: 85390, MZ: 111000 },
    dir: 'data/phl', prefix: 'phl-',   // data files (prefix is no longer used)
    // [key in the loaded object, file in dir]; .gz files are gzip (JSON or binary)
    files: [
      ['buildings', 'buildings.json'], ['river', 'river.json'], ['ground', 'ground.json'], ['trees', 'trees.json'],
      ['landmarks', 'landmarks.json'], ['sports', 'sports.json'], ['yardpark', 'yardpark.json'], ['transit', 'transit.json'],
      ['trolley1953', 'trolley1953.json'], ['city', 'city.json.gz'], ['cityBuildings', 'city_buildings.bin.gz'], ['metro', 'metro.json.gz'], ['cityMarks', 'city_landmarks.json'], ['boats', 'boats.json'], ['terrain', 'terrain.bin.gz'], ['restaurants', 'restaurants.json'],
    ],
    home: { pos: [39.9425, -75.1935, 430], target: [39.9560, -75.1730, 70] },   // [lat, lon, height]
    sunTarget: [39.9575, -75.1760], sun: { lat: 39.952, lon: -75.164 },
    sea: false,   // false: the land beyond the city limits is countryside
    storage: 'phl3d:',
    title: 'Philadelphia: Schuylkill riverfront and monorail',
    heading: 'Philadelphia’s Schuylkill, reimagined',
    canvasLabel: '3D model of Philadelphia to the city limits, with its rail transit network and a proposed monorail loop along the Schuylkill',
    // what the city is; the panel adds how to move around (for a mouse or a touch screen, js/ui.ts)
    hint: 'All of Philadelphia to the city limits, every rail transit line, and a proposed monorail loop along the Schuylkill.',
    cutButton: 'Cut away Market St',
    cutHint: 'Market Street cut open: the L (blue) and the T1–T5 trolleys (green) in the subway below. Tunnels that turn away from Market are drawn see-through. Track positions are from OpenStreetMap; depths are estimates.',
    credit: 'Buildings: City of Philadelphia LI footprints · River, parks, streets, transit: © OpenStreetMap contributors · Restaurant picks and notes: djour (djourformore.com)',
    building: 'Building out the rest of Philadelphia…',
    groups: ['SEPTA Metro', 'Regional Rail', 'PATCO', 'NJ Transit'],
    stationLines: septaLines,
    presets: null,   // every skyline-light preset in materials.ts
  },
  nyc: {
    id: 'nyc', name: 'New York',
    loadingScreens: [
      { file: 'poi-empire-state.webp', name: 'Empire State Building', area: 'Midtown', cam: [[260, 90, 40], [-140, 320, -382]], hour: -.6, hero: ['akimbo', 'black'], side: 'left' },
      { file: 'poi-brooklyn-bridge.webp', name: 'Brooklyn Bridge', area: 'DUMBO', cam: [[-760, 45, 4620], [-1085, 45, 4318]], hour: -.3, hero: ['point', 'denim'], side: 'right' },
      { file: 'poi-unisphere.webp', name: 'Unisphere', area: 'Flushing Meadows', cam: [[11600, 8, -80], [11666, 24, -154]], hour: -.8, hero: ['wave', 'yellow'], side: 'left' },
      { file: 'poi-wonder-wheel.webp', name: 'Wonder Wheel', area: 'Coney Island', cam: [[372, 5, 19045], [408, 24, 18977]], hour: -.5, hero: ['flex', 'red'], side: 'right' },
      { file: 'poi-central-park.webp', name: 'Central Park', area: 'Manhattan', view: 'central-park', hour: -1.2, hero: ['strut', 'tee'], side: 'right' },
    ],
    blurb: 'Manhattan, Brooklyn and Queens, the East River bridges, eleven subway lines and a proposed East River monorail loop.',
    frame: { LAT0: 40.745, LON0: -73.984, MX: 84096.03595426386, MZ: 111000 },
    dir: 'data/nyc', prefix: 'nyc-',
    files: [
      ['buildings', 'buildings.json.gz'], ['river', 'river.json'], ['ground', 'ground.json'], ['trees', 'trees.json'],
      ['transit', 'transit.json'], ['city', 'city.json.gz'], ['cityBuildings', 'city_buildings.bin.gz'],
      ['nycLandmarks', 'landmarks.json'], ['monorailRoutes', 'monorail.json'],
    ],
    home: { pos: [40.74334, -73.99095, 1000], target: [40.75100, -73.98500, 60] },   // over Midtown, looking north
    sunTarget: [40.745, -73.984], sun: { lat: 40.745, lon: -73.984 },
    sea: true,    // true: everything that isn't mapped land is water (the harbour, the rivers, the ocean)
    storage: 'nyc3d:',
    title: 'New York: Manhattan, Brooklyn and Queens',
    heading: 'New York, from the waterfront to the skyline',
    canvasLabel: '3D model of Manhattan, Brooklyn and Queens with MTA subway routes and a proposed East River monorail loop',
    hint: 'Manhattan, Brooklyn and Queens, eleven subway lines and a proposed East River monorail loop.',
    cutButton: 'Cut away Times Square',
    cutHint: 'Times Square cut open: the 1 train corridor and the lines that cross it underground. Tunnels that turn away are drawn see-through. Routes are from MTA GTFS; tunnel depths and platforms are illustrative.',
    credit: 'Buildings: NYC Open Data · Shorelines: NYC Open Data, NJDEP · Streets, parks, water: © OpenStreetMap contributors · Subway: MTA GTFS',
    building: 'Building out Brooklyn and Queens…',
    groups: ['MTA Subway'],
    stationLines: s => (s.lines || []).join(' '),
    presets: ['white', 'holiday', 'pride'],
  },
  jsh: {
    id: 'jsh', name: 'Jersey Shore, PA',
    loadingScreens: [
      { file: 'poi-allegheny-street.webp', name: 'Allegheny St', area: 'Downtown', view: 'downtown', hour: -.8, hero: ['akimbo', 'flannel'], side: 'right' },
      { file: 'poi-river-bridge.webp', name: 'West Branch Bridge', area: 'The river island', view: 'bridge', hour: -.4, hero: ['point', 'denim'], side: 'left' },
      { file: 'poi-pine-creek.webp', name: 'Pine Creek', area: 'Up the valley', view: 'pinecreek', hour: -.6, hero: ['wave', 'tee'], side: 'right' },
      { file: 'poi-bald-eagle-vista.webp', name: 'Bald Eagle Vista', area: 'With Mr. Kepner', view: 'ridge', hour: -.3, hero: ['folded', 'blaze'], side: 'right' },
      { file: 'poi-corn-fields.webp', name: 'The Seed Corn', area: 'July on the island', view: 'farms', day: 195, hour: -1.5, hero: ['strut', 'green'], side: 'left' },
    ],
    blurb: 'A Lycoming County river town on the West Branch of the Susquehanna, with Bald Eagle Mountain and a proposed monorail loop to Antes Fort.',
    frame: { LAT0: 41.2025, LON0: -77.2536, MX: 83877.23, MZ: 111000 },   // Allegheny & Main; tools/jsh/extent.py
    dir: 'data/jsh', prefix: 'jsh-',
    files: [
      ['buildings', 'buildings.json'], ['river', 'river.json'], ['ground', 'ground.json'], ['trees', 'trees.json'],
      ['transit', 'transit.json'], ['city', 'city.json.gz'], ['cityBuildings', 'city_buildings.bin.gz'],
      ['grid', 'terrain.bin.gz'], ['places', 'places.json'], ['farms', 'farms.json.gz'], ['monorailRoutes', 'monorail.json'],
    ],
    // from the hill above town, looking south over Allegheny St and the river to Bald Eagle Mountain
    home: { pos: [41.2190, -77.2640, 520], target: [41.1965, -77.2560, 20] },
    sunTarget: [41.2025, -77.2560], sun: { lat: 41.2025, lon: -77.2536 },
    sea: false,
    grid: true,   // data/jsh/terrain.bin.gz (as data.grid): everything is laid onto the hills (js/scene/jsh/terrain.ts)
    storage: 'jsh3d:',
    title: 'Jersey Shore, PA: a river town on the West Branch',
    heading: 'Jersey Shore, on the West Branch',
    canvasLabel: '3D model of Jersey Shore, Pennsylvania, with the surrounding hills and a proposed West Branch monorail loop',
    // (a phone shows the first three lines: the town, then the things to go and do)
    hint: 'Jersey Shore and its neighbours on the West Branch of the Susquehanna, under Bald Eagle Mountain, on real terrain. Go to “Bald Eagle Vista w/ Mr. Kepner” and click the hunter to take a drag, drink his beer, or glass the valley through his binoculars (in late autumn a combine works the last standing corn below). In July a detasseling crew works the seed corn on the island (“Detasseling crew”): click one of them to see through their eyes. Select the West Branch Loop under “Ride a line” or click a monorail car to board.',
    cutButton: '', cutHint: '',
    credit: 'Buildings: Overture Maps (Microsoft ML Buildings, OpenStreetMap) · Streets, parks, water: © OpenStreetMap contributors · Terrain: AWS Terrain Tiles (USGS 3DEP) · Crops: USDA NASS Cropland Data Layer',
    building: 'Spreading out along the river…',
    groups: [],
    stationLines: s => (s.lines || []).join(' '),
    presets: [],   // no lit skyline: the panel leaves out Skyline lights
  },
  nola: {
    id: 'nola', name: 'New Orleans',
    blurb: 'The French Quarter, the CBD and the Garden District, the Mississippi and Lake Pontchartrain, six streetcar lines and a proposed riverfront monorail loop.',
    frame: { LAT0: 29.9555, LON0: -90.0665, MX: 96529.37, MZ: 111000 },   // Canal & Royal; tools/nola/extent.py
    dir: 'data/nola', prefix: 'nola-',
    files: [
      ['buildings', 'buildings.json'], ['river', 'river.json'], ['ground', 'ground.json'], ['trees', 'trees.json'],
      ['transit', 'transit.json'], ['city', 'city.json.gz'], ['cityBuildings', 'city_buildings.bin.gz'],
      ['places', 'places.json'], ['monorailRoutes', 'monorail.json'],
    ],
    home: { pos: [29.9650, -90.0850, 450], target: [29.9555, -90.0640, 30] },   // over Uptown, looking toward the Quarter and the river
    sunTarget: [29.9555, -90.0665], sun: { lat: 29.9555, lon: -90.0665 },
    sea: true,    // everything that isn't mapped land is water (the Mississippi, Lake Pontchartrain)
    storage: 'nola3d:',
    title: 'New Orleans: the French Quarter and the Mississippi',
    heading: 'New Orleans, from the Quarter to the river',
    canvasLabel: '3D model of New Orleans with its streetcar lines and a proposed Mississippi riverfront monorail loop',
    hint: 'The French Quarter, the CBD and the Garden District, the Mississippi and Lake Pontchartrain, six RTA streetcar lines and a proposed riverfront monorail loop. Right-click the view to fly with the mouse, like creative mode: the mouse looks around, W A S D fly, Space and Shift rise and sink, scroll sets the speed, Esc lets go. Or drag to orbit and scroll to zoom. Click any streetcar to ride inside it.',
    cutButton: '', cutHint: '',
    credit: 'Buildings: Overture Maps (Microsoft ML Buildings, OpenStreetMap) · Streets, parks, water: © OpenStreetMap contributors · Streetcars: OpenStreetMap',
    building: 'Spreading out along the Mississippi…',
    groups: ['RTA Streetcar'],
    stationLines: s => (s.lines || []).join(' '),
    presets: [],   // no lit skyline: the panel leaves out Skyline lights
  },
  ka: {
    // one roller coaster and the park round it: Kingda Ka at Six Flags Great Adventure, as it stood until 2024
    // (js/scene/ka/; the track is data/ka/coaster.json, from OpenStreetMap's plan and the USGS lidar survey)
    id: 'ka', name: 'Kingda Ka',
    loadingScreens: [
      { file: 'poi-whole-ride.webp', name: 'Kingda Ka', area: 'Six Flags Great Adventure', view: 'ka-ride', hour: -1.2, day: 200, hero: ['point', 'green'], side: 'left' },
      { file: 'poi-top-hat.webp', name: 'The top hat', area: '456 feet up', view: 'ka-tophat', hour: -1.6, day: 200, hero: ['akimbo', 'tee'], side: 'right' },
      { file: 'poi-station.webp', name: 'The station', area: 'Golden Kingdom', view: 'ka-station', hour: -.9, day: 200, hero: ['wave', 'yellow'], side: 'right' },
      { file: 'poi-airtime-hill.webp', name: 'The airtime hill', area: '129 feet', view: 'ka-hill', hour: -.7, day: 200, hero: ['flex', 'red'], side: 'left' },
    ],
    blurb: 'The tallest roller coaster ever built, as it stood at Six Flags Great Adventure until 2024: 456 feet up at 128 mph, rebuilt from the lidar survey of the real ride. Take a seat.',
    frame: { LAT0: 40.1400, LON0: -74.4350, MX: 85219.2867194834, MZ: 111000 },   // the middle of the ride's layout; tools/ka/extent.py
    dir: 'data/ka', prefix: 'ka-',
    files: [
      ['buildings', 'buildings.json'], ['river', 'river.json'], ['ground', 'ground.json'], ['trees', 'trees.json'],
      ['transit', 'transit.json'], ['city', 'city.json.gz'], ['cityBuildings', 'city_buildings.bin.gz'],
      ['places', 'places.json'], ['coaster', 'coaster.json'],
    ],
    // from over the station end, looking up the launch track to the tower
    home: { pos: [40.13700, -74.43950, 190], target: [40.14020, -74.43440, 45] },
    sunTarget: [40.1400, -74.4350], sun: { lat: 40.1400, lon: -74.4350 },
    sea: false,
    storage: 'ka3d:',
    title: 'Kingda Ka: 456 feet, 128 mph',
    heading: 'Kingda Ka, as it stood',
    canvasLabel: '3D model of the Kingda Ka roller coaster at Six Flags Great Adventure, with its 456-foot top-hat tower and a train you can ride',
    hint: 'Kingda Ka at Six Flags Great Adventure in Jackson, New Jersey: the tallest roller coaster ever built (456 ft) and for years the fastest (128 mph in 3.5 seconds), open 2005 to 2024 and taken down in 2025. The track follows the lidar survey of the standing ride. Pick Kingda Ka under “Ride a line”, or click the train, to take a seat.',
    cutButton: '', cutHint: '',
    credit: 'Track plan, paths, water, woods: © OpenStreetMap contributors · Track heights and structure: USGS 3DEP lidar · Buildings: Overture Maps (Microsoft ML Buildings, OpenStreetMap)',
    building: 'Laying out the park…',
    groups: [],
    stationLines: s => (s.lines || []).join(' '),
    presets: [],   // no lit skyline: the panel leaves out Skyline lights
  },
  pine: {
    // not a map: one kitchen, built by hand in js/scene/pine/kitchen.ts (main.ts skips the map
    // data, the city scene and its panel controls for a city with kitchen: true)
    id: 'pine', name: '1938 Pine St Kitchen', kitchen: true,
    blurb: 'One kitchen, drawer by drawer: open any drawer or cabinet to see what goes in it under the organization plan.',
    dir: 'data/pine', prefix: 'pine-', files: [], storage: 'pine3d:',
    title: '1938 Pine St Kitchen',
    heading: '1938 Pine St Kitchen',
    canvasLabel: '3D model of the kitchen at 1938 Pine St, with drawers and cabinets that open to show what is stored in each',
    hint: 'Click any drawer or cabinet door to open it and see what goes inside, or pick one below. Drag to look around, scroll to zoom, right-drag to slide the view.',
    credit: 'Modelled from photos of the kitchen · Contents follow the kitchen organization plan',
  },
};

/** the active city (filled in place by setCity, so every importer sees the same object; main.ts then adds
 *  urls: each data file's and loading screen's URL in the build, by file name, from its URLS) */
export const CITY = {} as City;
export function setCity(id: string) { return Object.assign(CITY, CITIES[id]); }
