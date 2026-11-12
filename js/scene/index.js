// Assembles the whole scene from the loaded data and exposes what the UI needs.
import * as THREE from 'three';
import { createCore } from './core.js';
import { pairs } from '../data.js';
import { CITY } from '../cities.js';
import { litMats, setWindowHour, DISPLAY_PRESETS, setDisplayColors } from './materials.js';
import { buildRiver } from './river.js';
import { buildGround } from './ground.js';
import { buildBuildings } from './buildings.js';
import { buildLandmarks } from './phl/landmarks.js';
import { buildMonorail } from './phl/monorail.js';
import { buildTrees, buildShells } from './nature.js';
import { buildSports, courtTest } from './phl/sports.js';
import { buildYardPark } from './phl/yardpark.js';
import { buildSubway, SPEC } from './subway.js';
import { createSky } from './sky.js';
import { setSeason, addSnow, dayOfYear, dateOfDay, formatDay, getSeason } from './season.js';
import { buildCity } from './city.js';
import { buildCityMarks } from './phl/citymarks.js';
import { buildTransitMap } from './transitmap.js';
import { buildOldTrolleys } from './phl/oldtrolley.js';
// New York (ported from the NYC City Model): towers, East River bridges, outer-borough landmarks
// and the proposed East River monorail
import { buildLandmarks as buildNycLandmarks } from './nyc/landmarks.js';
import { buildBridges as buildNycBridges } from './nyc/bridges.js';
import { buildBoroughMarks } from './nyc/boroughmarks.js';
import { buildMonorail as buildNycMonorail } from './nyc/monorail.js';
import { buildPromenade } from './phl/promenade.js';
import { buildPedestrians } from './phl/pedestrians.js';
import { buildBoats } from './phl/boats.js';
import { buildAnglers } from './phl/anglers.js';
import { buildChinatown } from './phl/chinatown.js';
import { setTerrain, terrain, seat, surface, profile } from './terrain.js';
// let the status line paint between build steps (a timer, so it also works in background tabs)
const nextFrame = () => new Promise(r => setTimeout(r, 16));
// what a feature contributes when the city doesn't have it (another city's landmarks, say)
const none = () => ({ labels: [], views: [], nightOnly: [], duskOnly: [], boatLines: [], curves: [], trains: [], lines: [], slots: [], legend: [], update() {}, setOverlay() {} });

/** the rail yard's floor under the park deck (median of the ground inside its outline) */
function yardFloor(yp) {
  const r = pairs(yp.rings[0]), xs = r.map(p => p[0]), zs = r.map(p => p[1]), h = [];
  const inside = (x, z) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += 15) for (let z = Math.min(...zs); z <= Math.max(...zs); z += 15) if (inside(x, z)) h.push(surface(x, z));
  h.sort((a, b) => a - b); return h.length ? h[h.length >> 1] : 0;
}

/**
 * Raise the transit data onto the terrain before the subway builds from it. Each track and run is
 * first split to points at most STEP m apart, then lifted: track at street level by the ground
 * right under it (so it lies in the street, which is draped the same way), Els and tunnels by the
 * ground smoothed over 60 m either side (so a viaduct or tunnel doesn't follow every kerb), blending
 * between the two on the ramps; across water both run straight from bank to bank (terrain.js
 * profile). Each piece keeps its lift per point in `g` (dm), so subway.js can still tell street,
 * El and tunnel apart by height above the ground. Platforms follow the track beside them, and El
 * columns stretch from the ground to the deck.
 */
function liftTransit(T) {
  const STEP = 5, hash = new Map(), key = (x, z) => Math.floor(x / 50) + ',' + Math.floor(z / 50);
  const lift = flat => {
    const P = [], H = [];   // points (m) and their height above the ground in the data
    for (let i = 0; i < flat.length; i += 3) {
      const x = flat[i] / 10, z = flat[i + 1] / 10, y = flat[i + 2] / 10;
      if (P.length) {
        const a = P[P.length - 1], h0 = H[H.length - 1], n = Math.ceil(Math.hypot(x - a.x, z - a.z) / STEP);
        for (let k = 1; k < n; k++) { P.push({ x: a.x + (x - a.x) * k / n, z: a.z + (z - a.z) * k / n }); H.push(h0 + (y - h0) * k / n); }
      }
      P.push({ x, z }); H.push(y);
    }
    const exact = profile(P, 0), smooth = profile(P, 60), out = [], g = [];
    P.forEach((p, k) => {
      const w = Math.min(1, Math.max(0, (Math.abs(H[k]) - 1.5) / 3)), off = exact[k] + (smooth[k] - exact[k]) * w;
      out.push(Math.round(p.x * 10), Math.round(p.z * 10), Math.round((H[k] + off) * 10)); g.push(Math.round(off * 10));
      const h = key(p.x, p.z); (hash.get(h) || hash.set(h, []).get(h)).push([p.x, p.z, off]);
    });
    return { p: out, g };
  };
  T.tracks = T.tracks.map(t => ({ ...t, ...lift(t.p) }));
  T.runs = T.runs.map(r => ({ ...r, ...lift(r.p) }));
  const near = (x, z) => {   // the lift of the nearest track point within 80 m, else the ground
    let best = null, bd = 80 * 80;
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (const q of hash.get((Math.floor(x / 50) + a) + ',' + (Math.floor(z / 50) + b)) || []) { const d = (q[0] - x) ** 2 + (q[1] - z) ** 2; if (d < bd) { bd = d; best = q[2]; } }
    return best ?? surface(x, z);
  };
  T.platforms = T.platforms.map(p => ({ ...p, y: p.y + near(p.x, p.z) }));
  if (T.columns) { const C = T.columns.slice(); for (let i = 0; i < C.length; i += 3) { const x = C[i] / 10, z = C[i + 1] / 10; C[i + 2] = Math.max(10, Math.round(C[i + 2] + (near(x, z) - surface(x, z)) * 10)); } T.columns = C; }
}

export async function buildScene(canvas, data, status = () => {}) {
  // the real ground under everything, where the city has it (data/<city>/terrain.bin.gz)
  setTerrain(data.terrain || null);
  const core = createCore(canvas);
  const { scene, camera, controls, renderer, sun, hemi } = core;
  if (terrain.on) { const g = surface(core.HOME_TGT.x, core.HOME_TGT.z); core.HOME_POS.y += g; core.HOME_TGT.y += g; }

  status('Shaping the river…', 50); await nextFrame();
  const river = buildRiver(scene, data.river);
  status('Laying out parks and streets…', 55); await nextFrame();
  const ground = buildGround(scene, data.ground, river, data.yardpark ? data.yardpark.rings : [], { sea: CITY.sea, paved: data.city.limits });
  status(`Raising ${data.buildings.b.length.toLocaleString()} buildings…`, 60); await nextFrame();
  const blds = buildBuildings(scene, data.buildings);
  // the rest of the city out to the city limits (outside the original extent, its own data)
  status(CITY.building, 67); await nextFrame();
  // playing fields that the park trees must keep off (the Edgley frisbee and cricket ground)
  const clear = ((data.cityMarks || {}).fields || []).map(f => pairs(f.outline));
  const city = await buildCity(scene, data, {
    waterMat: river.waterMat,
    status: async message => { status(message, 73); await nextFrame(); },
    clear,
    sea: CITY.sea,
    core: CITY.sea ? null : data.ground.bbox.map(v => v / 10),
  });
  camera.far = 200000; camera.updateProjectionMatrix(); controls.maxDistance = 45000;
  status('Placing landmarks and the monorail…', 79); await nextFrame();
  // Philadelphia: stadiums, Independence Hall, Memorial Hall and the Delaware bridges (data/phl/city_landmarks.json)
  const marks = data.cityMarks ? buildCityMarks(scene, data.cityMarks) : none();
  // Philadelphia's styled landmarks, riverfront monorail and rowing shells (they follow the Schuylkill)
  const lm = data.landmarks ? buildLandmarks(scene, data.landmarks, river) : none();
  const monorail = data.landmarks
    ? buildMonorail(scene, river, ground.bridgeSegs, data.buildings, data.landmarks, data.sports ? courtTest(data.sports) : undefined)
    : { curve: null, cars: [], trainWinMat: { emissiveIntensity: 0 }, update() {} };
  // New York's modelled towers, bridges and borough landmarks (data/nyc/landmarks.json)
  const nyc = data.nycLandmarks ? buildNycLandmarks(scene, data.nycLandmarks) : none();
  const nycBridges = data.nycLandmarks ? buildNycBridges(scene).bridgeSpans : [];
  if (data.nycLandmarks) buildBoroughMarks(scene);
  const nycMono = data.monorailRoutes ? buildNycMonorail(scene, data.monorailRoutes) : { routes: [], labels: [], update() {} };
  buildTrees(scene, data.trees);
  // PROPOSAL (Philadelphia only): Walnut St, 22nd to Front, as a brick-paved shopping street, with people
  const isPhl = CITY.id === 'phl';
  const walnut = isPhl ? buildPromenade(scene, { buildings: data.buildings, cityB: city.boxes, roads: [data.ground.lines, data.city.lines], trees: data.trees })
    : { view: null, getSeat: () => null, stand: () => null, sit: () => null, pickSeat: () => null, seatFrame() {}, lookSeat() {} };
  const peds = isPhl ? buildPedestrians(scene, walnut.nav)   // people strolling, shopping and sitting on Walnut
    : { update() {}, pickPerson: () => null, inhabit: () => null, leave: () => null, getInhabited: () => null, lookAt() {}, inhabitFrame() {}, portrait: () => null, setVisible() {}, people: [] };
  // Chinatown: the Friendship Gate, signs, lanterns, a dragon dance and the night market's arcade stall
  const chinatown = isPhl ? buildChinatown(scene, { buildings: data.buildings })
    : { update() {}, pickStall: () => false, stallView: null, labels: [], views: [] };
  const updateShells = data.landmarks ? buildShells(scene, river) : () => {};
  let sports = none(), yard = none();
  if (data.sports) { status('Building the sports parks…', 82); await nextFrame(); sports = buildSports(scene, data.sports, river, ground.bridgeSegs, data.ground.lines); }
  if (data.yardpark) {
    status('Capping the rail yard…', 85); await nextFrame();
    const from = scene.children.length;
    yard = buildYardPark(scene, data.yardpark, [monorail.curve, ...sports.curves].filter(Boolean));
    // the deck stays level: all of it rises together, by the floor of the yard it covers
    if (terrain.on) { const y = yardFloor(data.yardpark); scene.children.slice(from).forEach(o => { o.userData.terrain = { y }; }); yard.labels.forEach(l => { l.pos.y += y; l.abs = true; }); }
  }
  status('Laying the transit network…', 88); await nextFrame();
  // the city's transit; Philadelphia also has its citywide network in data/phl/metro.json.gz,
  // whose full-length runs replace the Center City runs of the lines they extend
  const T = data.transit, Mt = data.metro || { lines: [], tracks: [], runs: [], platforms: [], stations: [] }, replace = new Set(Mt.replaceRuns || []);
  const lineById = new Map(T.lines.map(l => [l.id, { ...l }]));
  for (const l of Mt.lines) {
    const had = lineById.get(l.id);
    lineById.set(l.id, had ? Object.assign(had, { group: l.group }) : { ...l });   // keep the original names and colours
  }
  const transit = {
    note: T.note, sections: T.sections, columns: Mt.columns,
    lines: [...lineById.values()],
    tracks: [...T.tracks, ...Mt.tracks],
    runs: [...T.runs.filter(r => !replace.has(r.line)), ...Mt.runs],
    platforms: [...T.platforms, ...Mt.platforms], stations: [...T.stations, ...Mt.stations], entrances: [...(T.entrances || []), ...(Mt.entrances || [])],
  };
  if (terrain.on) liftTransit(transit);   // tracks, platforms and El columns onto the ground
  const before = new Set(scene.children);
  const subway = buildSubway(scene, transit, river);
  if (terrain.on) scene.children.filter(o => !before.has(o)).forEach(o => { if (!o.userData.terrain) o.userData.terrain = 'done'; });
  const old53 = data.trolley1953 ? buildOldTrolleys(scene, data.trolley1953, renderer) : none();   // 1953 streetcar track and cars
  // no snow on the rail network (tunnels, stations, cars and their insides) or on the rivers
  scene.children.filter(o => !before.has(o)).forEach(o => o.traverse(m => { if (m.material) [].concat(m.material).forEach(x => { x.userData.noSnow = true; }); }));
  river.waterMat.userData.noSnow = true;
  // the monorails' cars can be boarded like any transit car (positioned by their own modules)
  const monoSlots = [];
  const addTrain = (cars, line, lineName, color, k = 0) => cars.forEach((car, c) => monoSlots.push({
    line, lineName, color, k, c, pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1), q: new THREE.Quaternion(),
    sync() { this.pos.copy(car.position); this.pos.y -= 1.6; this.dir.set(0, 0, 1).applyQuaternion(car.quaternion); this.q.copy(car.quaternion); },
    onBoard(on) { car.visible = !on; },
  }));
  addTrain(monorail.cars, 'mono:loop', 'Riverfront loop monorail (proposed)', '#d6452f');
  sports.trains.forEach((cars, i) => addTrain(cars, 'mono:shuttle' + i, `${sports.lines[i].name} (proposed)`, '#1f9a8f'));
  nycMono.routes.forEach(r => r.trains.forEach((t, k) => addTrain(t.cars, 'mono:' + r.id, `${r.name} monorail (proposed)`, r.color, k)));
  monoSlots.forEach(sl => sl.sync());
  if (monoSlots.length) subway.registerFleet('monorail', { car: 14 }, monoSlots);
  if (old53.slots.length) subway.registerFleet('pcc53', SPEC.pcc, old53.slots);   // the 1953 streetcars can be boarded too
  // river boats on the Delaware and the Schuylkill (where the city has them), boarded like any train
  const boats = data.boats ? buildBoats(scene, data.boats) : { slots: [], lines: [], routes: [], labels: [], update() {} };
  if (boats.slots.length) subway.registerFleet('boat', boats.spec, boats.slots);
  // people fishing along the Schuylkill: click one to be asked to fish with them (js/fishing.js)
  const anglers = isPhl ? buildAnglers(scene, river, data.boats, [...data.river.water, ...data.city.water]) : { update() {}, pick: () => null, info: () => null, views: [] };
  // everything else onto the ground: drape the flat ground pieces, set the rest down on it (terrain.js)
  if (terrain.on) { status('Setting the city on its hills…', 92); await nextFrame(); seat(scene); }
  // cut-aways: clip every material by the section plane, except what the subway marks noClip
  // winter snow on whatever faces the sky (roofs, ground, parks, decks, conifers): season.js
  scene.traverse(o => { if (o.isMesh) [].concat(o.material).forEach(m => addSnow(m, m.userData.snowAmt ?? 1)); });
  renderer.localClippingEnabled = true;
  scene.traverse(o => {
    if (!o.material) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (!m.userData.noClip) { m.clippingPlanes = subway.planes; m.clipShadows = true; } });
  });

  // label anchors
  const labels = (data.landmarks ? data.landmarks.labels : []).map(l => {
    if (l.t === 'City Hall') return { text: l.t, pos: lm.cityhall.clone().setY(l.y) };
    if (l.river !== undefined) return { text: l.t, pos: river.atLat(39.9575).p.clone().setY(l.y) };
    return { text: l.t, pos: new THREE.Vector3(l.x, l.y, l.z) };
  }).concat(sports.labels, yard.labels, subway.labels, marks.labels, old53.labels, boats.labels, chinatown.labels, nyc.labels.filter(l => !nycBridges.some(b => b.id === l.text)), nycMono.labels,
    nycBridges.map(b => ({ text: b.id, far: 3700, pos: new THREE.Vector3((b.a[0] + b.b[0]) / 2, b.labelHeight, (b.a[1] + b.b[1]) / 2) })));
  // tags float the same height above the ground as they did above the flat model
  if (terrain.on) for (const l of labels) if (!l.abs && l.pos) l.pos.y += surface(l.pos.x, l.pos.z);
  // instanced meshes hold instances far from their own origin: never let three cull them as a whole,
  // except those that carry the bounds of their instances (geometry.js withBounds)
  scene.traverse(o => { if (o.isInstancedMesh && !o.userData.bounded) o.frustumCulled = false; });

  // "Show transit lines": every rail line plus the proposed monorails
  const mono = [...(monorail.curve ? [{ id: 'loop', color: '#d6452f', P: monorail.curve.getSpacedPoints(1500) }] : []),
    ...sports.curves.map((c, i) => ({ id: 'shuttle' + i, color: '#1f9a8f', P: c.getSpacedPoints(800) })),
    ...nycMono.routes.map(r => ({ id: 'mono:' + r.id, color: r.color, P: r.curve.getSpacedPoints(1500) }))];
  const tmap = buildTransitMap(scene, renderer, [...subway.routes, ...mono, ...boats.routes]);

  let riding = false;
  // 24-hour clock: the sun's real position over the city today drives the sky and lighting
  const sky = createSky({
    scene, sun, hemi, litMats, nightOnly: [...lm.boatLines, ...yard.duskOnly, ...marks.nightOnly, ...lm.nightOnly, ...blds.nightOnly, ...city.nightOnly],
    onChange: st => { setWindowHour(sky.getTime()); monorail.trainWinMat.emissiveIntensity = .05 + .75 * st.night; river.waterMat.color.set(st.water); },
  });
  const setTime = h => sky.setTime(h);
  // the old two-way switch, kept for anything that still calls it
  const setMood = m => { setTime(m === 'day' ? 12.5 : sky.sunset - .35); return m; };
  const getMood = () => (sky.getState().night > .35 ? 'dusk' : 'day');
  // rideable lines: the proposed monorails (riverfront loop, one shuttle per former expressway),
  // then every real rail line, grouped by network
  const PROPOSED = 'Monorails (proposed)';
  const lines = (monorail.curve ? [{ id: 'loop', name: 'Riverfront loop', group: PROPOSED, color: '#d6452f', hint: 'You’re in the lead car. The loop runs along the east bank past the Art Museum and Boathouse Row, then back down the west bank past 30th Street.' }] : [])
    .concat(sports.lines.map((l, i) => ({ id: i, group: PROPOSED, color: '#1f9a8f', ...l })))
    .concat(nycMono.routes.map(r => ({ id: 'm:mono:' + r.id, name: r.name, group: PROPOSED, color: r.color,
      hint: `You’re in the lead car of the proposed ${r.name}. Look through the front or side windows as the monorail crosses the East River.` })));
  // the city's networks in order (js/cities.js); a line without a group belongs to the first
  const GROUPS = CITY.groups, groupOf = l => l.group || GROUPS[0];
  const rideable = new Set(subway.routes.map(r => r.id));
  for (const g of GROUPS) for (const l of transit.lines) {
    if (groupOf(l) !== g || !rideable.has(l.id)) continue;
    const under = ['metro', 'broad', 'patco', 'nycsub'].includes(l.kind) || /^(AIR|ACL)$/.test(l.id) ? ' Underground stretches show the tunnel around you.' : '';
    lines.push({ id: 'm:' + l.id, name: l.name, group: g, color: l.color,
      hint: `You’re at the front of a train on the ${l.name}, riding its real route to the end of the line (or the city limits) and back.${under}` });
  }
  // the 1953 streetcars, one entry per loop
  lines.push(...boats.lines.map(l => ({ ...l, group: 'River boats' })));
  lines.push(...old53.lines.map(l => ({ ...l, group: '1953 streetcars' })));
  /** r: a line id from `lines`, or false for the overview (stay = keep the camera where it is) */
  function setRiding(r, stay = false) {
    if (aboard()) leaveCar(true);
    riding = r; controls.enabled = r === false; fly = null;
    if (r === false && !stay) { camera.position.copy(core.HOME_POS); controls.target.copy(core.HOME_TGT); controls.update(); }
  }

  // camera presets for the "Go to" buttons: the overview plus the proposals
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const views = [
    { id: 'home', name: 'Overview', pos: core.HOME_POS.clone(), target: core.HOME_TGT.clone() },
    city.view,
  ];
  if (walnut.view) views.push(walnut.view);
  if (data.yardpark) {
    const yp = data.yardpark, vn = yp.venue, [vx, vz] = vn.dir;
    views.push(
      // from behind the lawn, looking over the audience at the bandshell
      { id: 'bowl', name: 'Railyard Bowl', pos: V(vn.x + vx * (vn.r + 70), yp.h + 75, vn.z + vz * (vn.r + 70)), target: V(vn.x, yp.h + 12, vn.z) },
      { id: 'yard', name: 'Rail Yard Park', pos: V(yp.label[0] - 420, 330, yp.label[1] + 520), target: V(yp.label[0] + 40, yp.h, yp.label[1] + 120) });
  }
  // each corridor view centres on its densest cluster of courts, looking down along the corridor
  const courts = data.sports ? data.sports.courts.map(c => [c[1] / 10, c[2] / 10]) : [];
  (data.sports ? data.sports.routes : []).forEach((r, i) => {
    const pts = []; for (let k = 0; k < r.p.length; k += 2) pts.push([r.p[k] / 10, r.p[k + 1] / 10]);
    const nearest = (x, z) => { let bi = 0, bd = 1e18; pts.forEach(([px, pz], k) => { const d = (px - x) ** 2 + (pz - z) ** 2; if (d < bd) { bd = d; bi = k; } }); return [bi, bd]; };
    const mine = courts.filter(([x, z]) => data.sports.routes.every((o, j) => j === i || nearest(x, z)[1] <= (() => { let bd = 1e18; for (let k = 0; k < o.p.length; k += 2) bd = Math.min(bd, (o.p[k] / 10 - x) ** 2 + (o.p[k + 1] / 10 - z) ** 2); return bd; })()));
    const [cx, cz] = mine.reduce((best, c) => { const n = mine.filter(o => Math.hypot(o[0] - c[0], o[1] - c[1]) < 130).length; return n > best[2] ? [c[0], c[1], n] : best; }, [pts[0][0], pts[0][1], -1]);
    const [k] = nearest(cx, cz), a = pts[Math.max(0, k - 3)], b = pts[Math.min(pts.length - 1, k + 3)];
    const t = V(b[0] - a[0], 0, b[1] - a[1]).normalize(), n = V(-t.z, 0, t.x);
    const steep = r.label.startsWith('Vine'); // the Vine Street trench is walled in by buildings: look down from higher
    views.push({ id: 'sports' + i, name: r.label.replace(' Sports Park', ' courts'),
      pos: V(cx, 0, cz).addScaledVector(n, steep ? 70 : 120).addScaledVector(t, -110).setY(steep ? 190 : 95), target: V(cx, 2, cz).addScaledVector(t, 30) });
  });
  // New York's named views (data/nyc/landmarks.json; its overview is the home view) and the bridges
  for (const v of (data.nycLandmarks || {}).views || []) if (v.id !== 'overview') views.push({ id: v.id, name: v.name, pos: V(...v.pos), target: V(...v.target) });
  if (nycBridges.length) views.push({ id: 'bridges', name: 'East River bridges', pos: V(1260, 475, 5070), target: V(-460, 70, 4030) });
  views.push(...subway.views, ...marks.views, ...anglers.views, ...chinatown.views);
  // the river boats at Penn's Landing, from over Columbus Boulevard
  const rsp = data.boats && data.boats.lines.flatMap(l => l.stops).find(st => st.t === 'Race Street Pier');
  if (rsp) views.push({ id: 'boats', name: 'River boats', pos: V(rsp.x - 300, 150, rsp.z + 300), target: V(rsp.x + 80, 0, rsp.z - 40) });
  // camera presets look at the ground where it really is (the home view is lifted with HOME_TGT)
  if (terrain.on) for (const v of views) if (!v.abs && v.id !== 'home') { const g = surface(v.target.x, v.target.z); v.pos = v.pos.clone(); v.target = v.target.clone(); v.pos.y += g; v.target.y += g; v.abs = true; }
  // while a section is cut open the camera may look level into it (normally it stays above the horizon)
  function setCut(id) {
    const r = subway.setCut(id);
    controls.maxPolarAngle = r ? Math.PI * .58 : Math.PI / 2.1;
    return r;
  }
  // smooth camera flight between views; any drag or zoom cancels it
  let fly = null;
  controls.addEventListener('start', () => { fly = null; });
  function flyTo(id) {
    const v = typeof id === 'object' ? id : views.find(w => w.id === id); if (!v) return;   // a view id, or a view itself
    setCreative(false);
    if (riding !== false) setRiding(false, true);
    if (aboard()) leaveCar(true);
    if (v.cut) setCut(v.cut);
    fly = { t: 0, dur: 2.2, p0: camera.position.clone(), t0: controls.target.clone(), p1: v.pos, t1: v.target,
            lift: Math.min(450, camera.position.distanceTo(v.pos) * .22) };
  }
  /** fly over a map point (minimap click), keeping the current viewing angle and distance */
  function flyToPoint(x, z) {
    setCreative(false);
    if (riding !== false) setRiding(false, true);
    if (aboard()) leaveCar(true);
    const off = camera.position.clone().sub(controls.target), t1 = new THREE.Vector3(x, surface(x, z), z);
    if (off.y < 150) off.multiplyScalar(150 / Math.max(1, off.y));
    fly = { t: 0, dur: 1.8, p0: camera.position.clone(), t0: controls.target.clone(), p1: t1.clone().add(off), t1, lift: Math.min(450, camera.position.distanceTo(t1) * .12) };
  }
  // for the minimap: the outline layers (flat dm arrays, see data.js pairs) and every rail route
  const mapData = {
    bbox: data.city.bbox, limits: data.city.limits,
    water: [...data.city.water, ...data.river.water], green: [...data.city.green.map(g => g.slice(1)), ...data.ground.green.map(g => g.slice(1))],
    routes: [...subway.routes, ...mono, ...boats.routes].map(r => ({ id: r.id, color: r.color, P: r.P })),
  };
  function stepFly(dt) {
    fly.t = Math.min(1, fly.t + dt / fly.dur);
    const e = fly.t < .5 ? 4 * fly.t ** 3 : 1 - (-2 * fly.t + 2) ** 3 / 2; // ease in-out
    camera.position.lerpVectors(fly.p0, fly.p1, e); camera.position.y += Math.sin(Math.PI * e) * fly.lift;
    controls.target.lerpVectors(fly.t0, fly.t1, e);
    if (fly.t >= 1) fly = null;
  }
  // first person inside an L car or a trolley: click a car (pickCar -> boardCar), Esc to leave
  function boardCar(h) {
    setCreative(false);
    if (riding !== false) setRiding(false, true);
    fly = null; if (subway.getCut()) setCut(false);
    if (h && h.person !== undefined) {   // someone on Walnut St: see through their eyes
      subway.leave(); walnut.stand(); const r = peds.inhabit(h.person); if (!r) return null;
      controls.enabled = false; camera.near = .05; camera.updateProjectionMatrix();
      return r;
    }
    if (h && h.seat !== undefined) {   // a cafe chair or bench on Walnut St: sit down
      subway.leave(); peds.leave(); const r = walnut.sit(h.seat); if (!r) return null;
      controls.enabled = false; camera.near = .05; camera.updateProjectionMatrix();
      return r;
    }
    walnut.stand(); peds.leave();
    const r = subway.board(h); if (!r) return null;
    controls.enabled = false; camera.near = .05; camera.updateProjectionMatrix();   // the car is only 2.6 m wide
    return r;
  }
  /** stay: leave the camera where it is (another view is about to take over) */
  function leaveCar(stay = false) {
    const o = subway.leave() || walnut.stand() || peds.leave(); if (!o) return;
    camera.near = 2; camera.updateProjectionMatrix(); camera.up.set(0, 1, 0); controls.enabled = riding === false;
    if (stay) return;
    const t = o.p.clone(); t.y = Math.max(t.y, 0) + 2;   // underground: look down on the street above the car
    controls.target.copy(t);
    if (o.cam) camera.position.copy(o.cam);   // Walnut St: back along the street, above its middle
    else camera.position.copy(t).addScaledVector(o.dir, -75).add(new THREE.Vector3(o.dir.z * 30, 55, -o.dir.x * 30));
    controls.update();
  }
  /** "Ride a line": board the lead car of that line's first train (monorail ids 'loop', 0, 1; transit 'm:ID') */
  function boardLine(id) {
    setCreative(false);
    const key = id === 'loop' ? 'mono:loop' : typeof id === 'number' ? 'mono:shuttle' + id : String(id).replace(/^m:/, '');
    if (riding !== false) setRiding(false, true);
    fly = null; if (subway.getCut()) setCut(false);
    walnut.stand(); peds.leave();
    const r = subway.boardLine(key); if (!r) return null;
    controls.enabled = false; camera.near = .05; camera.updateProjectionMatrix();
    return r;
  }
  // free flight: W A S D (or arrows) move over the city, Space rises, Shift sinks; speed scales
  // with how far out the camera is. Camera and orbit target move together.
  const flyKeys = { f: 0, s: 0, u: 0 }, fwd = new THREE.Vector3(), side = new THREE.Vector3(), mv = new THREE.Vector3();
  function setFly(f, s_, u) { flyKeys.f = f; flyKeys.s = s_; flyKeys.u = u; if (f || s_ || u) fly = null; }
  // creative mode (the UI turns it on while the mouse is captured): the mouse turns the camera
  // directly, like Minecraft's creative flight; W A S D fly along the view, Space/Shift up and down,
  // the scroll wheel sets the speed. Orbit controls are off meanwhile.
  let creative = false, yaw = 0, pitch = 0, speedMul = 1;
  const eul = new THREE.Euler(0, 0, 0, 'YXZ');
  function setCreative(on) {
    on = !!on && riding === false && !aboard();
    if (on === creative) return creative;
    creative = on;
    if (on) {
      fly = null; controls.enabled = false;
      eul.setFromQuaternion(camera.quaternion, 'YXZ'); yaw = eul.y; pitch = eul.x;
    } else {
      // hand back to the orbit controls: put their target ahead of the camera, a little downhill
      // (they never look above the horizon)
      camera.getWorldDirection(fwd); fwd.y = Math.min(fwd.y, -.2); fwd.normalize();
      const D = Math.max(60, Math.min(3000, camera.position.y * 1.4));
      controls.target.copy(camera.position).addScaledVector(fwd, D); controls.target.y = Math.max(0, controls.target.y);
      controls.enabled = true; controls.update();
    }
    return creative;
  }
  function creativeLook(dx, dy) {
    if (!creative) return;
    yaw -= dx * .0022; pitch = Math.max(-1.55, Math.min(1.55, pitch - dy * .0022));
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }
  /** scroll wheel in creative mode: faster (dir < 0) or slower (dir > 0) */
  const creativeSpeed = dir => { speedMul = Math.max(.1, Math.min(10, speedMul * (dir < 0 ? 1.25 : .8))); return speedMul; };
  function stepFlyKeys(dt) {
    const dist = creative ? Math.max(camera.position.y, 20) : camera.position.distanceTo(controls.target);
    const speed = Math.max(creative ? 15 : 25, Math.min(4000, dist * .9)) * (creative ? speedMul : 1);
    camera.getWorldDirection(fwd); fwd.y = 0; if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1); fwd.normalize();
    side.set(-fwd.z, 0, fwd.x);
    mv.set(0, 0, 0).addScaledVector(fwd, flyKeys.f).addScaledVector(side, flyKeys.s); if (mv.lengthSq() > 1) mv.normalize();
    mv.y = flyKeys.u; mv.multiplyScalar(speed * dt);
    const floor = surface(camera.position.x + mv.x, camera.position.z + mv.z) + 3;   // never below the ground
    if (camera.position.y + mv.y < floor) mv.y = floor - camera.position.y;
    camera.position.add(mv);
    if (creative) return;
    controls.target.x += mv.x; controls.target.z += mv.z;
    controls.target.y = Math.max(surface(controls.target.x, controls.target.z), controls.target.y + mv.y);
  }
  // click a train car to board it, or a cafe chair or bench on Walnut St to sit down
  const pickCar = (x, y) => { camera.updateMatrixWorld(); const w = canvas.clientWidth, h = canvas.clientHeight; return subway.pick(camera, x, y, w, h) || peds.pickPerson(camera, x, y, w, h) || walnut.pickSeat(camera, x, y, w, h); };
  const aboard = () => subway.getRide() || walnut.getSeat() || peds.getInhabited();
  // Start the season and lighting from the same local date and time.
  const now = new Date();
  const year = now.getFullYear();
  const lastDay = dayOfYear(new Date(year, 11, 31));
  function setDay(day) {
    const st = setSeason(day, year);
    sky.setDate(dateOfDay(st.day, year));
    return st.day;
  }
  setDay(dayOfYear(now));
  setTime(now.getHours() + now.getMinutes() / 60);

  // Shadow casters that cannot matter this frame. A block of buildings darkens something in view
  // only if the volume its shadow sweeps (from the block, away from the sun, down to the lowest
  // thing that can be seen) touches the view frustum. The shadow map covers 5.8 km around the
  // focus whatever the camera sees, so from a train or a low view most blocks are behind you.
  const LOWEST = -60;   // below the deepest cut-away
  const viewFrustum = new THREE.Frustum(), viewMat = new THREE.Matrix4(), toSun = new THREE.Vector3(), sweepEnd = new THREE.Vector3();
  /** Returns true if any block started casting a shadow (the shadow map is then out of date). */
  function cullShadowCasters() {
    let added = false;
    camera.updateMatrixWorld();   // the camera has moved this frame; render() would do this next
    viewFrustum.setFromProjectionMatrix(viewMat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    toSun.subVectors(sun.position, sun.target.position).normalize();
    for (const m of blds.meshes) {
      const c = m.geometry.boundingSphere.center, r = m.geometry.boundingSphere.radius + 5;   // + the reach of the soft-shadow filter
      // the block's sphere, slid away from the sun as far as the shadow of its highest point reaches
      sweepEnd.copy(c).addScaledVector(toSun, -(m.geometry.boundingBox.max.y - LOWEST) / toSun.y);
      // outside if the whole swept capsule is behind any one plane of the frustum
      const cast = !viewFrustum.planes.some(p => p.distanceToPoint(c) < -r && p.distanceToPoint(sweepEnd) < -r);
      if (cast && !m.castShadow) added = true;
      m.castShadow = cast;
    }
    return added;
  }

  const clock = new THREE.Clock(), sunOff = new THREE.Vector3();
  // shadows are the costliest part of a frame: redraw the shadow map at once when the sun moves
  // (time of day, or re-centring on the camera below), otherwise only every few frames so moving
  // trains and people still drag their shadows along
  const SHADOW_EVERY = 4, shadowSun = new THREE.Vector3(NaN, 0, 0);
  let shadowTick = 0;
  renderer.shadowMap.autoUpdate = false;
  function start(onFrame) {
    function frame() {
      const dt = Math.min(clock.getDelta(), .05);
      monorail.update(dt, riding === 'loop', camera); old53.update(dt); boats.update(dt); anglers.update(dt); subway.update(dt, camera); updateShells(dt); sports.update(dt, riding, camera); yard.update(dt); marks.update(dt); nycMono.update(dt); chinatown.update(dt, camera);
      if (fly) stepFly(dt);
      peds.update(dt, camera); walnut.seatFrame(camera); peds.inhabitFrame(camera);
      if ((flyKeys.f || flyKeys.s || flyKeys.u) && riding === false && !aboard()) stepFlyKeys(dt);
      if (riding === false && !aboard() && !creative) controls.update();
      // fog, draw distance and the shadowed area follow the camera, so the whole city reads from above
      const free = riding === false && !aboard() && !creative;
      const focus = free ? controls.target : camera.position, d = free ? camera.position.distanceTo(controls.target) : creative ? Math.max(300, camera.position.y * 1.6) : 300;
      scene.fog.near = Math.max(2200, d * .8); scene.fog.far = Math.max(9000, d * 3.2);
      if (Math.hypot(sun.target.position.x - focus.x, sun.target.position.z - focus.z) > 150) {
        sunOff.subVectors(sun.position, sun.target.position);
        sun.target.position.set(focus.x, 0, focus.z); sun.position.copy(sun.target.position).add(sunOff);
      }
      city.update(camera, scene.fog.far);
      // a block that starts casting must be in the map at once, or its shadow blinks in late
      if (cullShadowCasters() || ++shadowTick >= SHADOW_EVERY || !shadowSun.equals(sun.position)) {
        renderer.shadowMap.needsUpdate = true; shadowTick = 0; shadowSun.copy(sun.position);
      }
      renderer.render(scene, camera); onFrame(camera);
      requestAnimationFrame(frame);
    }
    return new Promise((resolve, reject) => {
      requestAnimationFrame(() => {
        try {
          frame();
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  // legend for the transit highlight: one entry per service (the trolleys and B lines grouped)
  const legend = [];
  for (const g of GROUPS) {
    const ls = transit.lines.filter(l => groupOf(l) === g && rideable.has(l.id));
    if (g === 'Regional Rail') { if (ls.length) legend.push({ name: `Regional Rail (${ls.length} lines)`, color: ls[0].color }); continue; }
    for (const l of ls) {
      if (/^T[2-5]$|^B[23]$/.test(l.id)) continue;
      legend.push({ name: l.id === 'T1' ? 'T1–T5 trolleys' : l.id === 'B1' ? 'B1–B3 Broad Street Line' : l.name, color: l.color });
    }
  }
  if (mono.length) legend.push({ name: 'Proposed monorails', color: '#d6452f' });
  for (const l of boats.lines) legend.push({ name: l.name, color: l.color });

  return { scene, camera, controls, renderer, labels, lines, views, flyTo, boardLine, setFly, setCreative, getCreative: () => creative, creativeLook, creativeSpeed, setTransitMap: on => { old53.setOverlay(on); return tmap.set(on); }, getTransitMap: tmap.get, legend, oldTrolleyLegend: old53.legend, cityBuildings: city.buildingCount, setTime, getTime: sky.getTime, get sunset() { return sky.sunset; }, setDay, getDay: () => getSeason().day, lastDay, formatDay: day => formatDay(day, year), setMood, getMood, setRiding, setCut, getCut: subway.getCut, pickCar, boardCar, leaveCar, getCar: aboard, rideStrip: subway.rideStrip,
    pickAngler: (x, y) => { camera.updateMatrixWorld(); return anglers.pick(camera, x, y, canvas.clientWidth, canvas.clientHeight); }, anglerInfo: anglers.info,
    viewAngler: i => { const a = anglers.info(i); if (a) flyTo(a.view); },
    pickStall: isPhl ? (x, y) => { camera.updateMatrixWorld(); return chinatown.pickStall(camera, x, y, canvas.clientWidth, canvas.clientHeight); } : null,
    viewStall: () => { if (chinatown.stallView) flyTo(chinatown.stallView); }, mapData, flyToPoint, displayPresets: CITY.presets ? DISPLAY_PRESETS.filter(p => CITY.presets.includes(p.id)) : DISPLAY_PRESETS, setDisplayLights: setDisplayColors, lookCar: (dx, dy) => (walnut.getSeat() ? walnut.lookSeat(dx, dy) : peds.getInhabited() ? peds.lookAt(dx, dy) : subway.look(dx, dy)), moveCar: subway.move, start, river, monorail, peds };
}
