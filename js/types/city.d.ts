// A city's settings: an entry of CITIES in js/cities.js, and CITY, the active one (docs/EDITING.md section 8).
import type { Station, TransitLine } from './data';

/** the projection: x = (lon - LON0) * MX metres east, z = -(lat - LAT0) * MZ metres south (EDITING.md section 2) */
export interface Frame { LAT0: number; LON0: number; MX: number; MZ: number }

/** [lat, lon, height m] */
export type LatLonH = [number, number, number];

/** a loading-screen slide (js/loading.js; made by tools/loading/capture.py, which reads view, cam, hour and day) */
export interface LoadingScreen {
  /** data/<city>/<file> */
  file: string;
  name: string;
  area: string;
  /** a "Go to" view id, or cam: [[x, y, z], [tx, ty, tz]] m (y over the ground) */
  view?: string;
  cam?: [[number, number, number], [number, number, number]];
  /** hours from sunset */
  hour: number;
  /** day of the year (0 = 1 Jan); 285 if left out */
  day?: number;
  /** [pose, outfit]: POSES and OUTFITS in js/loading.js */
  hero: [string, string];
  side: 'left' | 'right';
}

/** settings every city has */
interface CityBase {
  id: string;
  name: string;
  /** the start menu's card */
  blurb: string;
  /** data/<city> */
  dir: string;
  /** no longer used */
  prefix: string;
  /** [key in loadData's result, file in dir]; .gz files are gzip (JSON or binary) */
  files: [string, string][];
  /** localStorage prefix (folded panel, skyline lights) */
  storage: string;
  title: string;
  heading: string;
  canvasLabel: string;
  /** what the city is; js/ui.js adds how to move around */
  hint: string;
  credit: string;
  loadingScreens?: LoadingScreen[];
}

/** a map city (js/cities.js phl, nyc, jsh, nola) */
export interface MapCityEntry extends CityBase {
  kitchen?: undefined;
  frame: Frame;
  /** the Overview camera */
  home: { pos: LatLonH; target: LatLonH };
  /** the shadow centre, [lat, lon] */
  sunTarget: [number, number];
  /** where the sun is computed for (js/scene/sky.ts) */
  sun: { lat: number; lon: number };
  /** true: everything outside data-<city>-city `limits` is water; false: countryside */
  sea: boolean;
  /** true (Jersey Shore): data-jsh-terrain loads as data.grid and everything is laid onto it (js/scene/jsh/terrain.ts) */
  grid?: boolean;
  /** "Cut away ..." button and its hint; '' for none */
  cutButton: string;
  cutHint: string;
  /** the status line while the rest of the city builds */
  building: string;
  /** the "Ride a line" networks in order; a line without a group is in the first */
  groups: string[];
  /** a station tag's line text (js/scene/subway.ts); LINES: the city's lines by id */
  stationLines: (s: Station, LINES: Record<string, TransitLine>) => string;
  /** skyline-light preset ids from js/scene/materials.ts DISPLAY_PRESETS: null all, [] no Skyline lights section */
  presets: string[] | null;
}

/** not a map: one room built by hand (js/cities.js pine; main.js skips the data, the city scene and its panel controls) */
export interface KitchenEntry extends CityBase {
  kitchen: true;
}

/** an entry of CITIES (js/cities.js) */
export type CityEntry = MapCityEntry | KitchenEntry;

/**
 * CITY (js/cities.js): the active map city. Empty until main.js calls setCity(), which fills it in place before any data
 * loads or scene module runs; main.js then adds urls. Read it inside functions, never at module top level. (A kitchen
 * city passes through CITY too, but nothing that reads these fields runs for it.)
 */
export type City = MapCityEntry & {
  /** each data file's and loading screen's URL in the build, by file name (main.js, from its import.meta.glob URLS) */
  urls: Record<string, string>;
};
