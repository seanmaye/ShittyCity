// The data files as js/data.js loadData() returns them: one key per [key, file] in the city's CITY.files (js/cities.js),
// each file decoded by its name (.json and .json.gz: JSON; .bin.gz: decoded by js/formats.js in the data worker). Shapes from
// docs/EDITING.md section 3 and the modules that read them (named per block). Units (EDITING.md section 2): dm = integer
// decimetres in the city's frame, m = metres. Types only: nothing here is checked against the files when they load.

/** flat [x, z, x, z, ...] dm (data.js pairs() turns it into [x, z] m) */
export type Flat = number[];
/** flat [x, z, y, x, z, y, ...] dm: transit track and runs (NOTE the order x, z, y) */
export type Flat3 = number[];
/** a ring, flat dm: an outer ring has positive signed area, a hole negative (EDITING.md section 2) */
export type Ring = Flat;
/** [outer ring, hole, hole, ...] */
export type Polygon = Ring[];
/** [x0, z0, x1, z1] dm */
export type Box = [number, number, number, number];
/** [x, z] m, as data.js pairs() returns them */
export type Pair = [number, number];
export type Vec3 = [number, number, number];

// ---- shared formats (EDITING.md "Shared formats"); the engine needs these seven

/** data-<city>-buildings, the core's footprints (js/scene/buildings.js; Jersey Shore: jsh/town.js) */
export interface Buildings {
  styles: (BuildingStyle | null)[];
  /** [height dm, style index (0 generic), outer ring dm, hole ring dm, ...] */
  b: [number, number, ...Ring[]][];
  /** Jersey Shore only: six per footprint, [type (index into jtypes), x dm, z dm, w dm, d dm, angle mrad] (jsh/town.js) */
  j?: number[];
  jtypes?: string[];
}
export interface BuildingStyle { id: string; color: string; kind: 'glass' | 'stone' | 'row' }

/** data-<city>-river (js/scene/river.js) */
export interface River {
  water: Polygon[];
  /** indexes into water of the river polygons (they get bulkhead edges) */
  river: number[];
  /** flat [x, z, width] dm, south to north along the channel, or [] */
  center: number[];
  dams: Flat[];
}

/** [kind, outer ring dm, hole ring dm, ...]; kind 0 park, 1 grass, 2 pitch, 3 wood, 4 cemetery */
export type Green = [number, ...Ring[]];
/** k 0 road, 1 path or trail, 2 rail; w width m; b 1 bridge; l OSM layer; x 1 former expressway; p polyline dm */
export interface StreetLine { k: number; w: number; b: number; l: number; x?: number; p: Flat }

/** data-<city>-ground, the core's ground (js/scene/ground.js) */
export interface Ground { bbox: Box; green: Green[]; lines: StreetLine[] }

/** data-<city>-transit (js/scene/subway.js; index.js merges Philadelphia's data-phl-metro into it). Depths are estimates. */
export interface Transit {
  note?: string;
  lines: TransitLine[];
  tracks: { k: string; p: Flat3 }[];
  runs: { line: string; p: Flat3 }[];
  platforms: Platform[];
  stations: Station[];
  entrances?: Entrance[];
  sections: Section[];
}
/** kind picks the car (subway.js SPEC, CAR_IN); group: the "Ride a line" heading (default: the city's first group) */
export interface TransitLine { id: string; name: string; kind: string; color: string; group?: string }
/** m; y = the platform's top */
export interface Platform { x: number; z: number; y: number; ry: number; l: number; w: number; k: string }
/** m; k: kinds stopping here, u: kinds underground here; lines: line ids (the tag text: CITY.stationLines); T: trolley refs */
export interface Station { t: string; x: number; z: number; k: string[]; u?: string[]; lines?: string[]; T?: string[] }
/** m: a subway entrance near a station */
export interface Entrance { x: number; z: number; k: string }
/** a cut-away plane: p m, d unit vector; keeps the side n = (d.z, -d.x); band m behind it opened up; depth m */
export interface Section { id: string; name: string; p: Pair; d: Pair; band: number; depth: number }

/** data-<city>-city (gzip JSON), the rest of the city outside the core's buildings (js/scene/city.js) */
export interface CityRest {
  core: Box;
  bbox: Box;
  /** the land: paved inside */
  limits: Ring[];
  green: Green[];
  lines: StreetLine[];
  dams: Flat[];
  water: Polygon[];
  streams: { w: number; p: Flat }[];
  trees: Flat;
}

/** data-<city>-city_buildings: gzip binary "PHB1" (layout: EDITING.md), decoded by js/formats.js decode (read by js/scene/city.js) */
export type CityBuildings = ReturnType<typeof import('../formats.js').decode>;

/** data-<city>-places, Jersey Shore and New Orleans (js/scene/jsh/places.js): y m above the ground there */
export interface Places {
  labels: { t: string; x: number; z: number; y: number; far?: number }[];
  /** y already includes the ground */
  views: { id: string; name: string; pos: Vec3; target: Vec3 }[];
}

/** data-<city>-monorail: a proposed monorail (js/scene/monorail.js), New York, Jersey Shore and New Orleans */
export interface Monorail {
  name: string;
  description?: string;
  /** m, the default guideway height */
  height?: number;
  /** m/s */
  speed: number;
  routes: MonorailRoute[];
}
export interface MonorailRoute {
  id: string; name: string; color: string; closed: boolean; supportInterval: number; trainSpacing: number; cars: number;
  /** m: [x, z] at the guideway height, or [x, y, z] */
  path: (Pair | Vec3)[];
  stations: { name: string; position: Pair; length: number }[];
}

// ---- Philadelphia (EDITING.md "Philadelphia only")

/** data-phl-landmarks, m (js/scene/phl/landmarks.js) */
export interface PhlLandmarks {
  towers: { x: number; z: number; w: number; d: number; ry: number; id: string; h: number; color: string; cap: string; kind: string }[];
  cityhall: { x: number; z: number; w: number; d: number; ry: number };
  station: { x: number; z: number; w: number; d: number; ry: number };
  museum: { x: number; z: number };
  esp: { x: number; z: number; ry: number; size: number };
  boathouses: { x: number; z: number; w: number; d: number; ry: number; h: number }[];
  /** a tag at (x, y, z), or with river set, pinned to the river; "City Hall" snaps to the modelled tower */
  labels: { t: string; x?: number; z?: number; y: number; river?: number }[];
}

/** data-phl-sports, PROPOSAL: I-76 and I-676 as sports parks (js/scene/phl/sports.js) */
export interface PhlSports {
  /** name: soccer | futsal | tennis | basketball | volleyball; w along the corridor, d across, m */
  types: { name: string; w: number; d: number }[];
  /** [type index, x dm, z dm, ry mrad] */
  courts: [number, number, number, number][];
  /** p centreline dm; a corridor width m per point */
  routes: { label: string; p: Flat; a: number[] }[];
}

/** data-phl-yardpark, PROPOSAL: the deck over the 30th Street rail yard (js/scene/phl/yardpark.js) */
export interface PhlYardPark {
  /** deck height m */
  h: number;
  rings: Ring[];
  /** ring 1 closed, 0 open */
  paths: { ring: number; p: Flat }[];
  /** m; dir: unit vector stage to audience; r lawn radius */
  venue: { x: number; z: number; dir: Pair; r: number };
  trees: Flat;
  /** m */
  label: Pair;
  area_ha: number;
}

/** data-phl-trolley1953: Center City streetcar track in January 1953 (js/scene/phl/oldtrolley.js) */
export interface PhlTrolley1953 {
  note?: string;
  routes: { n: number; name: string; gone: number | null; now?: string }[];
  streets: { s: string; r: number[]; p: Flat }[];
  /** st 0 disused rails still in the street, 1 removed track */
  rails: { st: number; p: Flat }[];
}

/** data-phl-metro (gzip JSON): every rail line in the city, merged into data-phl-transit at load (index.js) */
export interface PhlMetro {
  note?: string;
  lines: TransitLine[];
  tracks: Transit['tracks'];
  runs: Transit['runs'];
  /** ids of data-phl-transit runs these replace */
  replaceRuns: string[];
  platforms: Platform[];
  stations: Station[];
  entrances: Entrance[];
  /** flat [x, z, h] dm, El and viaduct columns */
  columns: number[];
}

/** data-phl-city_landmarks: models fitted to real outlines (js/scene/phl/citymarks.js, frisbee.js) */
export interface PhlCityMarks {
  stadiums: {
    name: string; type: 'football' | 'baseball' | 'arena'; outline: Ring; field: Ring | null; h: number;
    fieldBox?: { x: number; z: number; w: number; d: number; ry: number }; plate?: Pair; cf?: Pair;
  }[];
  halls: { name: string; type: 'independence' | 'memorial'; x: number; z: number; w: number; d: number; ry: number; outline: Ring }[];
  bridges: { name: string; a: Pair; b: Pair; width: number; deckH: number; towerH: number; towers: Pair; anchors: Pair; color: string }[];
  fields: { name: string; outline: Ring; x: number; z: number; w: number; d: number; ry: number }[];
  labels: { t: string; x: number; y: number; z: number }[];
}

/** data-phl-boats: river boat lines (js/scene/phl/boats.js). Stops m: x, z where the boat ties up, sx, sz the bank, s along p */
export interface PhlBoats {
  lines: { id: string; name: string; color: string; proposed: boolean; stops: { t: string; x: number; z: number; sx: number; sz: number; s: number }[]; p: Flat }[];
}

/** data-phl-restaurants: djour's starred food spots (js/scene/phl/restaurants.js; fields: EDITING.md) */
export interface PhlRestaurants {
  source: string;
  credit: string;
  stars: Record<string, string>;
  places: Restaurant[];
}
export interface Restaurant {
  n: string; x: number; z: number; ry: number; w: number; h: number; sd: number;
  /** [x, z, height] m: where its camera view stands */
  v: Vec3;
  f: Pair | null;
  k: 'restaurant' | 'bar' | 'cafe' | 'bakery' | 'brewery' | 'truck' | 'market';
  s: number; hood: string; c: string[]; p?: string; d?: string; soon?: number; club?: number;
  /** the three-star picks' researched exterior (tools/phl/restaurant_looks.json): not typed here */
  look?: Record<string, unknown>;
}

/** data-phl-terrain: gzip binary "TER1" in Philadelphia's layout (EDITING.md), decoded by js/formats.js readTerrain (for js/scene/terrain.js setTerrain) */
export type PhlTerrain = ReturnType<typeof import('../formats.js').readTerrain>;

// ---- New York (EDITING.md "New York only")

/** data-nyc-landmarks, m (js/scene/nyc/landmarks.js) */
export interface NycLandmarks {
  features: { id: string; name: string; x: number; z: number; w: number; d: number; h: number; color: string; kind: 'glass' | 'stone'; cap: string; ry: number; source_id?: number }[];
  labels: { t: string; x: number; y: number; z: number }[];
  /** the "Go to" buttons ("overview" is the home view, from js/cities.js) */
  views: { id: string; name: string; pos: Vec3; target: Vec3 }[];
}

// ---- Jersey Shore (EDITING.md "Jersey Shore only")

/** data-jsh-terrain: gzip binary "TER1", NOT data-phl-terrain's layout (EDITING.md), decoded by js/formats.js readGrid (for js/scene/jsh/terrain.js loadTerrain) */
export type JshGrid = ReturnType<typeof import('../formats.js').readGrid>;

/** data-jsh-farms (gzip JSON; js/scene/jsh/farms.js). m unless said */
export interface JshFarms {
  year: number;
  /** a: row direction rad; s: planting group 0..1; p: [outer ring dm, holes...] */
  fields: { k: 'corn' | 'soy' | 'grain' | 'hay' | 'veg'; a: number; s: number; p: Polygon }[];
  /** w the long side; t: gambrel | gable | pole; c wall colour, r roof colour */
  barns: { x: number; z: number; w: number; d: number; ry: number; t: string; c: string; r: string }[];
  silos: { x: number; z: number; r: number; h: number; c: string }[];
  /** the seed-corn block (jsh/detassel.js): a row direction rad, row spacing m, s its field's planting group */
  seed: { x: number; z: number; a: number; len: number; sets: number; row: number; s: number } | null;
}

// ---- per city: what loadData returns, by the keys in each city's CITY.files

export interface SharedData {
  buildings: Buildings; river: River; ground: Ground; trees: Flat; transit: Transit; city: CityRest; cityBuildings: CityBuildings;
}
export interface PhlData extends SharedData {
  landmarks: PhlLandmarks; sports: PhlSports; yardpark: PhlYardPark; trolley1953: PhlTrolley1953; metro: PhlMetro;
  cityMarks: PhlCityMarks; boats: PhlBoats; terrain: PhlTerrain; restaurants: PhlRestaurants;
}
export interface NycData extends SharedData { nycLandmarks: NycLandmarks; monorailRoutes: Monorail }
export interface JshData extends SharedData { grid: JshGrid; places: Places; farms: JshFarms; monorailRoutes: Monorail }
export interface NolaData extends SharedData { places: Places; monorailRoutes: Monorail }

/** the active city's data: the shared blocks, and each other block only if this city has it (index.js tests: data.landmarks ? ...) */
export type CityData = SharedData & Partial<Omit<PhlData & NycData & JshData & NolaData, keyof SharedData>>;
