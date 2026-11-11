// Assembles the whole scene from the loaded data and exposes what the UI needs.
import * as THREE from 'three';
import { createCore } from './core.js';
import { litMats } from './materials.js';
import { buildRiver } from './river.js';
import { buildGround } from './ground.js';
import { buildBuildings } from './buildings.js';
import { buildLandmarks } from './landmarks.js';
import { buildMonorail } from './monorail.js';
import { buildTrees, buildShells } from './nature.js';
import { buildSports, courtTest } from './sports.js';
import { buildYardPark } from './yardpark.js';
import { buildSubway, SPEC } from './subway.js';
import { createSky } from './sky.js';
import { buildCity } from './city.js';
import { buildCityMarks } from './citymarks.js';
import { buildTransitMap } from './transitmap.js';
import { buildOldTrolleys } from './oldtrolley.js';
// let the status line paint between build steps (a timer, so it also works in background tabs)
const nextFrame = () => new Promise(r => setTimeout(r, 16));

export async function buildScene(canvas, data, status = () => {}) {
  const core = createCore(canvas);
  const { scene, camera, controls, renderer, sun, hemi } = core;

  status('Shaping the river…'); await nextFrame();
  const river = buildRiver(scene, data.river);
  status('Laying out parks and streets…'); await nextFrame();
  const ground = buildGround(scene, data.ground, river, data.yardpark.rings, data.city.limits);
  status(`Raising ${data.buildings.b.length.toLocaleString()} buildings…`); await nextFrame();
  const blocks = buildBuildings(scene, data.buildings).meshes;
  // the rest of the city out to the city limits (outside the original extent, its own data)
  status('Building out the rest of Philadelphia…'); await nextFrame();
  const city = buildCity(scene, data, { waterMat: river.waterMat, status, core: data.ground.bbox.map(v => v / 10) });
  camera.far = 200000; camera.updateProjectionMatrix(); controls.maxDistance = 45000;
  status('Placing landmarks and the monorail…'); await nextFrame();
  // stadiums, Independence Hall, Memorial Hall and the Delaware bridges (data/city_landmarks.json)
  const marks = buildCityMarks(scene, data.cityMarks);
  const lm = buildLandmarks(scene, data.landmarks, river);
  const monorail = buildMonorail(scene, river, ground.bridgeSegs, data.buildings, data.landmarks, courtTest(data.sports));
  buildTrees(scene, data.trees);
  const updateShells = buildShells(scene, river);
  status('Building the sports parks…'); await nextFrame();
  const sports = buildSports(scene, data.sports, river, ground.bridgeSegs, data.ground.lines);
  status('Capping the rail yard…'); await nextFrame();
  const yard = buildYardPark(scene, data.yardpark, [monorail.curve, ...sports.curves]);
  status('Laying the transit network…'); await nextFrame();
  // the original L and trolley data (Center City) plus the citywide network; the full-length
  // runs in data/metro replace the original Center City runs of the lines they extend
  const T = data.transit, Mt = data.metro, replace = new Set(Mt.replaceRuns || []);
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
  const subway = buildSubway(scene, transit, river);
  const old53 = buildOldTrolleys(scene, data.trolley1953, renderer);   // 1953 streetcar track and cars
  // the monorails' cars can be boarded like any transit car (positioned by their own modules)
  const monoSlots = [];
  const addTrain = (cars, line, lineName, color) => cars.forEach((car, c) => monoSlots.push({
    line, lineName, color, k: 0, c, pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1), q: new THREE.Quaternion(),
    sync() { this.pos.copy(car.position); this.pos.y -= 1.6; this.dir.set(0, 0, 1).applyQuaternion(car.quaternion); this.q.copy(car.quaternion); },
    onBoard(on) { car.visible = !on; },
  }));
  addTrain(monorail.cars, 'mono:loop', 'Riverfront loop monorail (proposed)', '#d6452f');
  sports.trains.forEach((cars, i) => addTrain(cars, 'mono:shuttle' + i, `${sports.lines[i].name} (proposed)`, '#1f9a8f'));
  monoSlots.forEach(sl => sl.sync());
  subway.registerFleet('monorail', { car: 14 }, monoSlots);
  subway.registerFleet('pcc53', SPEC.pcc, old53.slots);   // the 1953 streetcars can be boarded too
  // cut-aways: clip every material by the section plane, except what the subway marks noClip
  renderer.localClippingEnabled = true;
  scene.traverse(o => {
    if (!o.material) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (!m.userData.noClip) { m.clippingPlanes = subway.planes; m.clipShadows = true; } });
  });

  // label anchors
  const labels = data.landmarks.labels.map(l => {
    if (l.t === 'City Hall') return { text: l.t, pos: lm.cityhall.clone().setY(l.y) };
    if (l.river !== undefined) return { text: l.t, pos: river.atLat(39.9575).p.clone().setY(l.y) };
    return { text: l.t, pos: new THREE.Vector3(l.x, l.y, l.z) };
  }).concat(sports.labels, yard.labels, subway.labels, marks.labels, old53.labels);
  // instanced meshes hold instances far from their own origin: never let three cull them as a whole,
  // except those that carry the bounds of their instances (geometry.js withBounds)
  scene.traverse(o => { if (o.isInstancedMesh && !o.userData.bounded) o.frustumCulled = false; });

  // "Show transit lines": every rail line plus the proposed monorails
  const mono = [{ id: 'loop', color: '#d6452f', P: monorail.curve.getSpacedPoints(1500) },
    ...sports.curves.map((c, i) => ({ id: 'shuttle' + i, color: '#1f9a8f', P: c.getSpacedPoints(800) }))];
  const tmap = buildTransitMap(scene, renderer, [...subway.routes, ...mono]);

  let riding = false;
  // 24-hour clock: the sun's real position over Philadelphia today drives the sky and lighting
  const sky = createSky({
    scene, sun, hemi, litMats, nightOnly: [...lm.boatLines, ...yard.duskOnly, ...marks.nightOnly],
    onChange: st => { monorail.trainWinMat.emissiveIntensity = .05 + .75 * st.night; river.waterMat.color.set(st.water); },
  });
  const setTime = h => sky.setTime(h);
  // the old two-way switch, kept for anything that still calls it
  const setMood = m => { setTime(m === 'day' ? 12.5 : sky.sunset - .35); return m; };
  const getMood = () => (sky.getState().night > .35 ? 'dusk' : 'day');
  // rideable lines: the proposed monorails (riverfront loop, one shuttle per former expressway),
  // then every real rail line, grouped by network
  const PROPOSED = 'Monorails (proposed)';
  const lines = [{ id: 'loop', name: 'Riverfront loop', group: PROPOSED, color: '#d6452f', hint: 'You’re in the lead car. The loop runs along the east bank past the Art Museum and Boathouse Row, then back down the west bank past 30th Street.' }]
    .concat(sports.lines.map((l, i) => ({ id: i, group: PROPOSED, color: '#1f9a8f', ...l })));
  const GROUPS = ['SEPTA Metro', 'Regional Rail', 'PATCO', 'NJ Transit'];
  const rideable = new Set(subway.routes.map(r => r.id));
  for (const g of GROUPS) for (const l of transit.lines) {
    if ((l.group || 'SEPTA Metro') !== g || !rideable.has(l.id)) continue;
    const under = ['metro', 'broad', 'patco'].includes(l.kind) || /^(AIR|ACL)$/.test(l.id) ? ' Underground stretches show the tunnel around you.' : '';
    lines.push({ id: 'm:' + l.id, name: l.name, group: g, color: l.color,
      hint: `You’re at the front of a train on the ${l.name}, riding its real route to the end of the line (or the city limits) and back.${under}` });
  }
  // the 1953 streetcars, one entry per loop
  lines.push(...old53.lines.map(l => ({ ...l, group: '1953 streetcars' })));
  /** r: a line id from `lines`, or false for the overview (stay = keep the camera where it is) */
  function setRiding(r, stay = false) {
    if (subway.getRide()) leaveCar(true);
    riding = r; controls.enabled = r === false; fly = null;
    if (r === false && !stay) { camera.position.copy(core.HOME_POS); controls.target.copy(core.HOME_TGT); controls.update(); }
  }

  // camera presets for the "Go to" buttons: the overview plus the proposals
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const yp = data.yardpark, vn = yp.venue, [vx, vz] = vn.dir;
  const views = [
    { id: 'home', name: 'Overview', pos: core.HOME_POS.clone(), target: core.HOME_TGT.clone() },
    city.view,
    // from behind the lawn, looking over the audience at the bandshell
    { id: 'bowl', name: 'Railyard Bowl', pos: V(vn.x + vx * (vn.r + 70), yp.h + 75, vn.z + vz * (vn.r + 70)), target: V(vn.x, yp.h + 12, vn.z) },
    { id: 'yard', name: 'Rail Yard Park', pos: V(yp.label[0] - 420, 330, yp.label[1] + 520), target: V(yp.label[0] + 40, yp.h, yp.label[1] + 120) },
  ];
  // each corridor view centres on its densest cluster of courts, looking down along the corridor
  const courts = data.sports.courts.map(c => [c[1] / 10, c[2] / 10]);
  data.sports.routes.forEach((r, i) => {
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
  views.push(...subway.views, ...marks.views);
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
    const v = views.find(w => w.id === id); if (!v) return;
    if (riding !== false) setRiding(false, true);
    if (subway.getRide()) leaveCar(true);
    if (v.cut) setCut(v.cut);
    fly = { t: 0, dur: 2.2, p0: camera.position.clone(), t0: controls.target.clone(), p1: v.pos, t1: v.target,
            lift: Math.min(450, camera.position.distanceTo(v.pos) * .22) };
  }
  function stepFly(dt) {
    fly.t = Math.min(1, fly.t + dt / fly.dur);
    const e = fly.t < .5 ? 4 * fly.t ** 3 : 1 - (-2 * fly.t + 2) ** 3 / 2; // ease in-out
    camera.position.lerpVectors(fly.p0, fly.p1, e); camera.position.y += Math.sin(Math.PI * e) * fly.lift;
    controls.target.lerpVectors(fly.t0, fly.t1, e);
    if (fly.t >= 1) fly = null;
  }
  // first person inside an L car or a trolley: click a car (pickCar -> boardCar), Esc to leave
  function boardCar(h) {
    if (riding !== false) setRiding(false, true);
    fly = null; if (subway.getCut()) setCut(false);
    const r = subway.board(h); if (!r) return null;
    controls.enabled = false; camera.near = .05; camera.updateProjectionMatrix();   // the car is only 2.6 m wide
    return r;
  }
  /** stay: leave the camera where it is (another view is about to take over) */
  function leaveCar(stay = false) {
    const o = subway.leave(); if (!o) return;
    camera.near = 2; camera.updateProjectionMatrix(); camera.up.set(0, 1, 0); controls.enabled = riding === false;
    if (stay) return;
    const t = o.p.clone(); t.y = Math.max(t.y, 0) + 2;   // underground: look down on the street above the car
    controls.target.copy(t);
    camera.position.copy(t).addScaledVector(o.dir, -75).add(new THREE.Vector3(o.dir.z * 30, 55, -o.dir.x * 30));
    controls.update();
  }
  /** "Ride a line": board the lead car of that line's first train (monorail ids 'loop', 0, 1; transit 'm:ID') */
  function boardLine(id) {
    const key = id === 'loop' ? 'mono:loop' : typeof id === 'number' ? 'mono:shuttle' + id : String(id).replace(/^m:/, '');
    if (riding !== false) setRiding(false, true);
    fly = null; if (subway.getCut()) setCut(false);
    const r = subway.boardLine(key); if (!r) return null;
    controls.enabled = false; camera.near = .05; camera.updateProjectionMatrix();
    return r;
  }
  // free flight: W A S D (or arrows) move over the city, Space rises, Shift sinks; speed scales
  // with how far out the camera is. Camera and orbit target move together.
  const flyKeys = { f: 0, s: 0, u: 0 }, fwd = new THREE.Vector3(), side = new THREE.Vector3(), mv = new THREE.Vector3();
  function setFly(f, s_, u) { flyKeys.f = f; flyKeys.s = s_; flyKeys.u = u; if (f || s_ || u) fly = null; }
  function stepFlyKeys(dt) {
    const dist = camera.position.distanceTo(controls.target), speed = Math.max(25, Math.min(4000, dist * .9));
    camera.getWorldDirection(fwd); fwd.y = 0; if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1); fwd.normalize();
    side.set(-fwd.z, 0, fwd.x);
    mv.set(0, 0, 0).addScaledVector(fwd, flyKeys.f).addScaledVector(side, flyKeys.s); if (mv.lengthSq() > 1) mv.normalize();
    mv.y = flyKeys.u; mv.multiplyScalar(speed * dt);
    if (camera.position.y + mv.y < 3) mv.y = 3 - camera.position.y;
    camera.position.add(mv); controls.target.x += mv.x; controls.target.z += mv.z;
    controls.target.y = Math.max(0, controls.target.y + mv.y);
  }
  const pickCar = (x, y) => { camera.updateMatrixWorld(); return subway.pick(camera, x, y, canvas.clientWidth, canvas.clientHeight); };
  setTime(sky.sunset - .35);   // open at dusk, the original look

  // Shadow casters that cannot matter this frame. A block of buildings darkens something in view
  // only if the volume its shadow sweeps (from the block, away from the sun, down to the lowest
  // thing that can be seen) touches the view frustum. The shadow map covers 5.8 km around the
  // focus whatever the camera sees, so from a train or a low view most blocks are behind you.
  const LOWEST = -60;   // below the deepest cut-away
  const viewFrustum = new THREE.Frustum(), viewMat = new THREE.Matrix4(), toSun = new THREE.Vector3(), sweepEnd = new THREE.Vector3();
  function cullShadowCasters() {
    camera.updateMatrixWorld();   // the camera has moved this frame; render() would do this next
    viewFrustum.setFromProjectionMatrix(viewMat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    toSun.subVectors(sun.position, sun.target.position).normalize();
    for (const m of blocks) {
      const c = m.geometry.boundingSphere.center, r = m.geometry.boundingSphere.radius + 5;   // + the reach of the soft-shadow filter
      // the block's sphere, slid away from the sun as far as the shadow of its highest point reaches
      sweepEnd.copy(c).addScaledVector(toSun, -(m.geometry.boundingBox.max.y - LOWEST) / toSun.y);
      // outside if the whole swept capsule is behind any one plane of the frustum
      m.castShadow = !viewFrustum.planes.some(p => p.distanceToPoint(c) < -r && p.distanceToPoint(sweepEnd) < -r);
    }
  }

  const clock = new THREE.Clock(), sunOff = new THREE.Vector3();
  function start(onFrame) {
    function frame() {
      const dt = Math.min(clock.getDelta(), .05);
      monorail.update(dt, riding === 'loop', camera); old53.update(dt); subway.update(dt, camera); updateShells(dt); sports.update(dt, riding, camera); yard.update(dt);
      if (fly) stepFly(dt);
      if ((flyKeys.f || flyKeys.s || flyKeys.u) && riding === false && !subway.getRide()) stepFlyKeys(dt);
      if (riding === false && !subway.getRide()) controls.update();
      // fog, draw distance and the shadowed area follow the camera, so the whole city reads from above
      const free = riding === false && !subway.getRide();
      const focus = free ? controls.target : camera.position, d = free ? camera.position.distanceTo(controls.target) : 300;
      scene.fog.near = Math.max(2200, d * .8); scene.fog.far = Math.max(9000, d * 3.2);
      if (Math.hypot(sun.target.position.x - focus.x, sun.target.position.z - focus.z) > 150) {
        sunOff.subVectors(sun.position, sun.target.position);
        sun.target.position.set(focus.x, 0, focus.z); sun.position.copy(sun.target.position).add(sunOff);
      }
      city.update(camera, scene.fog.far);
      cullShadowCasters();
      renderer.render(scene, camera); onFrame(camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // legend for the transit highlight: one entry per service (the trolleys and B lines grouped)
  const legend = [];
  for (const g of GROUPS) {
    const ls = transit.lines.filter(l => (l.group || 'SEPTA Metro') === g && rideable.has(l.id));
    if (g === 'Regional Rail') { if (ls.length) legend.push({ name: `Regional Rail (${ls.length} lines)`, color: ls[0].color }); continue; }
    for (const l of ls) {
      if (/^T[2-5]$|^B[23]$/.test(l.id)) continue;
      legend.push({ name: l.id === 'T1' ? 'T1–T5 trolleys' : l.id === 'B1' ? 'B1–B3 Broad Street Line' : l.name, color: l.color });
    }
  }
  legend.push({ name: 'Proposed monorails', color: '#d6452f' });

  return { scene, camera, controls, renderer, labels, lines, views, flyTo, boardLine, setFly, setTransitMap: on => { old53.setOverlay(on); return tmap.set(on); }, getTransitMap: tmap.get, legend, oldTrolleyLegend: old53.legend, cityBuildings: city.buildingCount, setTime, getTime: sky.getTime, sunset: sky.sunset, setMood, getMood, setRiding, setCut, getCut: subway.getCut, pickCar, boardCar, leaveCar, getCar: subway.getRide, lookCar: subway.look, moveCar: subway.move, start, river, monorail };
}
