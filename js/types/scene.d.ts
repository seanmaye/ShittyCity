// The scene API: the object js/scene/index.js buildScene() returns, which js/main.js exposes as window.__city. The UI
// (js/ui.js) drives it, and so do the harnesses: tools/perf (scenarios.py, perf.py, probe.js), tools/ux (ux.py, audit.js,
// states/) and tools/loading/capture.py. Members typed from index.js and the module each comes from; what the harnesses
// do not use and is not simple to type is `unknown` (a module's own object) or loose. Debug list: docs/EDITING.md section 4.
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import type { Box, Polygon, Ring } from './data';

/** a floating name tag (index.js labels): far = the distance it shows within; abs: pos.y already includes the ground */
export interface Label { text: string; pos: Vector3; far?: number; abs?: boolean }

/** a "Go to" camera preset (index.js views, and each module's views) */
export interface View {
  id: string;
  name: string;
  pos: Vector3;
  target: Vector3;
  /** a cut-away to open (subway.js sections) */
  cut?: string | false;
  /** the hour to set */
  hour?: number;
  /** something seasonal: outside days or hours, the view sets day or hour */
  when?: { days: [number, number]; hours: [number, number]; day: number; hour: number };
  /** how near orbiting may come (default 40 m) */
  near?: number;
  /** pos on a portrait screen */
  portraitPos?: Vector3;
  /** called when the flight ends */
  arrive?: () => void;
  /** pos and target already include the ground */
  abs?: boolean;
}

/** an entry of "Ride a line" (index.js lines): id 'loop', a sports shuttle's index, 'm:mono:<route>', 'm:<line id>', ... */
export interface RideLine { id: string | number; name: string; group: string; color: string; hint?: string }

/** what pickCar() found under a screen point (subway.js pick, or the person, punk, seat or hunter modules' pick) */
export interface Hit { kind?: string; i?: number; person?: number; punk?: number; seat?: number; hunter?: boolean }

/** where the ride is along its line, for the line diagram (subway.js rideStrip) */
export interface RideStrip {
  name: string; color: string; x: number; z: number; dx: number; dz: number;
  stops: { t: string; f: number }[] | null;
  /** 0..1 along the line */
  f: number | null;
  /** 1 out, -1 back */
  dir: number;
  loop: boolean;
  next: unknown;
}

/** a rail route for the transit overlay and the minimap: P points in m */
export interface Route { id: string; color: string; P: Vector3[] }

export interface SceneApi {
  scene: Scene;
  camera: PerspectiveCamera;
  controls: OrbitControls;
  renderer: WebGLRenderer;
  labels: Label[];
  lines: RideLine[];
  views: View[];
  /** Philadelphia's restaurants (phl/restaurants.js); elsewhere empty */
  restaurants: { places: unknown[]; labels: Label[]; credit: string | null };
  /** the ground's height in m (0 without terrain) */
  groundAt(x: number, z: number): number;
  /** a view id, or a view itself (tools/loading/capture.py passes { pos, target, near }) */
  flyTo(view: string | (Partial<View> & Pick<View, 'pos' | 'target'>)): void;
  /** board the lead car of a "Ride a line" entry; null if none */
  boardLine(id: string | number): unknown;
  /** free flight keys: forward, strafe, up (each -1, 0 or 1) */
  setFly(forward: number, strafe: number, up: number): void;
  setCreative(on: boolean): boolean;
  getCreative(): boolean;
  creativeLook(dx: number, dy: number): void;
  /** dir < 0 faster, > 0 slower; returns the speed factor */
  creativeSpeed(dir: number): number;
  setTransitMap(on: boolean): boolean;
  getTransitMap(): boolean;
  legend: { name: string; color: string }[];
  /** the 1953 streetcars' legend (phl/oldtrolley.js); [] elsewhere */
  oldTrolleyLegend: unknown[];
  /** buildings outside the core (city.js) */
  cityBuildings: number;
  /** hours 0-24; returns the hour set */
  setTime(hour: number): number;
  getTime(): number;
  /** today's sunset, hours (sky.js) */
  readonly sunset: number;
  /** day of the year (0 = 1 January); returns the day set */
  setDay(day: number): number;
  getDay(): number;
  lastDay: number;
  /** "Nov 11 · fall" (season.js formatDay) */
  formatDay(day: number): string;
  /** the old two-way switch */
  setMood(mood: 'day' | 'dusk'): string;
  getMood(): 'day' | 'dusk';
  /** a line id from lines, or false for the overview; stay: keep the camera where it is */
  setRiding(line: string | number | false, stay?: boolean): void;
  /** a section id (subway.js), or false to close it; returns the open section's id or false */
  setCut(id: string | false): string | false;
  getCut(): string | false;
  pickCar(x: number, y: number): Hit | null;
  /** board a car, sit on a seat, or step into a person; the ride's state, or null */
  boardCar(hit: Hit): unknown;
  /** stay: leave the camera where it is */
  leaveCar(stay?: boolean): void;
  /** what you are aboard or inside (kind, line, lineName, seat, ... as each module returns it); falsy on foot */
  getCar(): ({ kind?: string } & Record<string, unknown>) | null | undefined | false;
  rideStrip(): RideStrip | null;
  /** an angler's index (phl/anglers.js), or null */
  pickAngler(x: number, y: number): number | null;
  anglerInfo(i: number): { name: string; hello: string; spot: string; view: View } | null | undefined;
  viewAngler(i: number): void;
  /** Philadelphia's night-market stall (phl/chinatown.js); null elsewhere */
  pickStall: ((x: number, y: number) => boolean) | null;
  viewStall(): void;
  /** for the minimap: flat dm outlines (data.d.ts) and every rail route */
  mapData: { bbox: Box; limits: Ring[]; water: Polygon[]; green: Polygon[]; routes: Route[] };
  flyToPoint(x: number, z: number): void;
  /** the skyline-light schemes this city shows (materials.js DISPLAY_PRESETS, filtered by CITY.presets) */
  displayPresets: { id: string; name: string; colors: string[] }[];
  setDisplayLights(colors: string[]): void;
  lookCar(dx: number, dy: number): unknown;
  moveCar: unknown;
  /** what the person you are inside does: 'drag' | 'drink' | 'glass' (today only the hunter) */
  actCar(id: string): boolean;
  /** binocular zoom; true if it zoomed */
  wheelCar(dy: number): boolean;
  /** start the render loop; resolves after the first frame */
  start(onFrame: (camera: PerspectiveCamera) => void): Promise<void>;
  startCinematic(): boolean;
  stopCinematic(): unknown;
  // modules' own objects, for the console and the harnesses
  cinematic: unknown;
  subway: unknown;
  river: unknown;
  monorail: unknown;
  peds: unknown;
  concert: unknown;
  corn: unknown;
  harvest: unknown;
  overlook: unknown;
  /** in Crossroads Church's sanctuary (jsh/church.js) */
  indoors(): boolean;
}

declare global {
  interface Window {
    /** the scene API, set by js/main.js once the city is built (the kitchen sets window.__kitchen instead) */
    __city?: SceneApi;
  }
}
