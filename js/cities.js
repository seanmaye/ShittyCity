// The cities this model can show, and the active one. Everything that differs between cities
// and isn't data (projection, camera, sun, HUD text, which data files to load) lives here.
// js/main.js calls setCity() once, before any data is loaded or scene module runs, so modules
// may read CITY inside their functions (never at module top level: the bundle evaluates every
// module before main runs).

// Philadelphia's SEPTA station tags: Metro ids, trolley ranges, then the networks
function septaLines(s, LINES) {
  const ids = s.lines || [], parts = [], t = ids.filter(i => /^T\d$/.test(i)).map(i => +i.slice(1)).sort((a, b) => a - b);
  for (const id of ids) if (/^(L|B\d|G\d)$/.test(id)) parts.push(id);
  if (t.length) parts.push(t.length > 2 && t[t.length - 1] - t[0] === t.length - 1 ? `T${t[0]}–T${t[t.length - 1]}` : t.map(v => 'T' + v).join(', '));
  const groups = new Set(ids.map(i => LINES[i] && LINES[i].group).filter(g => g && g !== 'SEPTA Metro'));
  return [...parts, ...groups].join(' · ');
}

export const CITIES = {
  phl: {
    id: 'phl', name: 'Philadelphia',
    loadingArt: [
      { file: 'loading-waterfront.webp', colors: ['#f5703b', '#f9da70'] },
      { file: 'loading-street.webp', colors: ['#a28cc3', '#ffb853'] },
    ],
    blurb: 'All of Philadelphia to the city limits, every rail transit line, and a proposed monorail loop along the Schuylkill.',
    // projection: x metres east, z metres south of (LAT0, LON0); MX is metres per degree of longitude here
    frame: { LAT0: 39.9560, LON0: -75.1760, MX: 85390, MZ: 111000 },
    dir: 'data/phl', prefix: 'phl-',   // data files, and their <script id="data-phl-…"> blocks in the bundle
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
    hint: 'All of Philadelphia to the city limits, every rail transit line, and a proposed monorail loop along the Schuylkill. Right-click the view to fly with the mouse, like creative mode: the mouse looks around, W A S D fly, Space and Shift rise and sink, scroll sets the speed, Esc lets go. Or drag to orbit and scroll to zoom. Click any train to ride inside it.',
    cutButton: 'Cut away Market St',
    cutHint: 'Market Street cut open: the L (blue) and the T1–T5 trolleys (green) in the subway below. Tunnels that turn away from Market are drawn see-through. Track positions are from OpenStreetMap; depths are estimates.',
    credit: 'Buildings: City of Philadelphia LI footprints · River, parks, streets, transit: © OpenStreetMap contributors · Restaurant picks and notes: djour (djourformore.com)',
    building: 'Building out the rest of Philadelphia…',
    groups: ['SEPTA Metro', 'Regional Rail', 'PATCO', 'NJ Transit'],
    stationLines: septaLines,
    presets: null,   // every skyline-light preset in materials.js
  },
  nyc: {
    id: 'nyc', name: 'New York',
    loadingArt: [
      { file: 'loading-waterfront.webp', colors: ['#ea72a8', '#febe81'] },
      { file: 'loading-street.webp', colors: ['#5ea7ec', '#fda449'] },
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
    hint: 'Manhattan, Brooklyn and Queens, eleven subway lines and a proposed East River monorail loop. Right-click the view to fly with the mouse, like creative mode: the mouse looks around, W A S D fly, Space and Shift rise and sink, scroll sets the speed, Esc lets go. Or drag to orbit and scroll to zoom. Click any train to ride inside it.',
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
    loadingArt: [
      { file: 'loading-overlook.webp', colors: ['#e8572a', '#f6c445'] },
    ],
    blurb: 'A Lycoming County river town on the West Branch of the Susquehanna, with Pine Creek, Bald Eagle Mountain and the hills around it.',
    frame: { LAT0: 41.2025, LON0: -77.2536, MX: 83877.23, MZ: 111000 },   // Allegheny & Main; tools/jsh/extent.py
    dir: 'data/jsh', prefix: 'jsh-',
    files: [
      ['buildings', 'buildings.json'], ['river', 'river.json'], ['ground', 'ground.json'], ['trees', 'trees.json'],
      ['transit', 'transit.json'], ['city', 'city.json.gz'], ['cityBuildings', 'city_buildings.bin.gz'],
      ['grid', 'terrain.bin.gz'], ['places', 'places.json'], ['farms', 'farms.json.gz'],
    ],
    // from the hill above town, looking south over Allegheny St and the river to Bald Eagle Mountain
    home: { pos: [41.2190, -77.2640, 520], target: [41.1965, -77.2560, 20] },
    sunTarget: [41.2025, -77.2560], sun: { lat: 41.2025, lon: -77.2536 },
    sea: false,
    grid: true,   // data/jsh/terrain.bin.gz (as data.grid): everything is laid onto the hills (js/scene/jsh/terrain.js)
    storage: 'jsh3d:',
    title: 'Jersey Shore, PA: a river town on the West Branch',
    heading: 'Jersey Shore, on the West Branch',
    canvasLabel: '3D model of Jersey Shore, Pennsylvania, on the West Branch Susquehanna River, with the surrounding hills',
    hint: 'Jersey Shore borough and its neighbours on the West Branch of the Susquehanna, with Pine Creek and Bald Eagle Mountain, on real terrain. In July a detasseling crew works the seed corn on the island: click one of them to see through their eyes. “Bald Eagle Vista w/ Mr. Kepner” leaves you standing behind a hunter above the valley: click him to take a drag, drink his beer, or glass the valley through his binoculars (in late autumn a combine works the last standing corn below). Right-click the view to fly with the mouse, like creative mode: the mouse looks around, W A S D fly, Space and Shift rise and sink, scroll sets the speed, Esc lets go. Or drag to orbit and scroll to zoom.',
    cutButton: '', cutHint: '',
    credit: 'Buildings: Overture Maps (Microsoft ML Buildings, OpenStreetMap) · Streets, parks, water: © OpenStreetMap contributors · Terrain: AWS Terrain Tiles (USGS 3DEP) · Crops: USDA NASS Cropland Data Layer',
    building: 'Spreading out along the river…',
    groups: [],
    stationLines: s => (s.lines || []).join(' '),
    presets: [],   // no lit skyline: the panel leaves out Skyline lights
  },
};

/** the active city (filled in place by setCity, so every importer sees the same object) */
export const CITY = {};
export function setCity(id) { return Object.assign(CITY, CITIES[id]); }
