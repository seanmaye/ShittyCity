// The proposed East River Loop: a data-driven straddle monorail (data/nyc/monorail.json).
// Ported from the NYC City Model (js/scene/monorail.js). Path points are [x, z] at the guideway
// height or [x, y, z] metres in the NYC frame. Its cars are boarded through subway.registerFleet
// (js/scene/index.js), like Philadelphia's monorails.
import * as THREE from 'three';

const H = 18;
const V3 = (...p) => p.length === 2 ? new THREE.Vector3(p[0], H, p[1]) : new THREE.Vector3(p[0], p[1], p[2]);
const wrap = (n, d) => ((n % d) + d) % d;

function routeCurve(route, height) {
  const points = (route.path || []).map(p => p.length === 2 ? new THREE.Vector3(p[0], height, p[1]) : new THREE.Vector3(p[0], p[1], p[2]));
  if (points.length < 2) return null;
  return new THREE.CatmullRomCurve3(points, !!route.closed, 'centripetal');
}

function addGuideway(scene, curve, route, height) {
  const length = curve.getLength(), steps = Math.max(24, Math.ceil(length / 7));
  const bed = new THREE.Mesh(new THREE.TubeGeometry(curve, steps, 1.05, 6, !!route.closed),
    new THREE.MeshStandardMaterial({ color: route.guidewayColor || '#d8dde1', roughness: .58, metalness: .12 }));
  bed.castShadow = bed.receiveShadow = true; scene.add(bed);
  // Narrow running strips on the two edges give the beam a clear straddle-monorail profile.
  const railMat = new THREE.MeshStandardMaterial({ color: '#858f98', roughness: .36, metalness: .58 });
  for (const side of [-1, 1]) {
    const edge = [];
    for (let i = 0; i <= (route.closed ? steps - 1 : steps); i++) {
      const u = i / steps, p = curve.getPointAt(u), t = curve.getTangentAt(u);
      const n = new THREE.Vector3(-t.z, 0, t.x).normalize();
      edge.push(p.addScaledVector(n, side * .82));
    }
    const edgeCurve = new THREE.CatmullRomCurve3(edge, !!route.closed, 'centripetal');
    const rail = new THREE.Mesh(new THREE.TubeGeometry(edgeCurve, steps, .16, 5, !!route.closed), railMat);
    rail.castShadow = true; scene.add(rail);
  }
  return length;
}

function addSupports(scene, curve, length, route) {
  const interval = Math.max(20, route.supportInterval || 34), count = Math.floor(length / interval);
  if (!count) return;
  const columnGeo = new THREE.CylinderGeometry(.72, 1.12, 1, 10);
  columnGeo.translate(0, .5, 0);
  const capGeo = new THREE.BoxGeometry(3.7, .9, 3.6);
  const concrete = new THREE.MeshStandardMaterial({ color: '#c6cbd0', roughness: .76 });
  const columns = new THREE.InstancedMesh(columnGeo, concrete, count), caps = new THREE.InstancedMesh(capGeo, concrete, count);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const p = curve.getPointAt((i + .5) / count);
    dummy.position.set(p.x, 0, p.z);
    dummy.scale.set(1, p.y - 1.1, 1);
    dummy.updateMatrix();
    columns.setMatrixAt(i, dummy.matrix);
    dummy.position.y = p.y - .55;
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    caps.setMatrixAt(i, dummy.matrix);
  }
  columns.castShadow = caps.castShadow = true; scene.add(columns, caps);
}

function createStationBatch(scene) {
  const concrete = new THREE.MeshStandardMaterial({ color: '#b9c1c8', roughness: .72 });
  const glass = new THREE.MeshStandardMaterial({ color: '#c2d8e4', roughness: .2, metalness: .12, transparent: true, opacity: .52 });
  const boxes = {
    platform: new THREE.BoxGeometry(4.2, .8, 1),
    screen: new THREE.BoxGeometry(.16, 2.7, 1),
    roof: new THREE.BoxGeometry(13, .5, 1),
    post: new THREE.BoxGeometry(.35, 5.2, .35),
    stair: new THREE.BoxGeometry(5, 1, 5),
  };
  const items = new Map(), canopies = new Map(), scratch = new THREE.Object3D(), matrix = new THREE.Matrix4();
  const canopy = color => {
    if (!canopies.has(color)) canopies.set(color, new THREE.MeshStandardMaterial({ color, roughness: .55 }));
    return canopies.get(color);
  };
  function add(type, material, base, x, y, z, sx = 1, sy = 1, sz = 1) {
    const key = type + ':' + material.uuid;
    let item = items.get(key);
    if (!item) { item = { geometry: boxes[type], material, matrices: [], cast: false, receive: false }; items.set(key, item); }
    scratch.position.set(x, y, z); scratch.rotation.set(0, 0, 0); scratch.scale.set(sx, sy, sz); scratch.updateMatrix();
    matrix.multiplyMatrices(base, scratch.matrix);
    item.matrices.push(matrix.clone());
    if (type === 'platform') { item.cast = item.receive = true; }
    else if (type === 'roof' || type === 'stair') item.cast = true;
  }
  function flush() {
    for (const item of items.values()) {
      const mesh = new THREE.InstancedMesh(item.geometry, item.material, item.matrices.length);
      for (let i = 0; i < item.matrices.length; i++) mesh.setMatrixAt(i, item.matrices[i]);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = item.cast; mesh.receiveShadow = item.receive; scene.add(mesh);
    }
  }
  return { add, flush, concrete, glass, canopy };
}

function addStation(scene, curve, station, route, batch) {
  const u = station.at != null ? wrap(station.at, 1) : (() => {
    if (!station.position) return 0;
    const target = V3(...station.position); let best = Infinity, bi = 0;
    for (let i = 0; i <= 600; i++) { const p = curve.getPointAt(i / 600), d = p.distanceToSquared(target); if (d < best) { best = d; bi = i; } }
    return bi / 600;
  })();
  const p = curve.getPointAt(u), t = curve.getTangentAt(u), g = new THREE.Group();
  g.position.copy(p); g.rotation.y = Math.atan2(t.x, t.z); scene.add(g);
  const canopy = batch.canopy(route.color || '#e24a3b');
  g.updateMatrix();
  for (const side of [-1, 1]) {
    batch.add('platform', batch.concrete, g.matrix, side * 4.8, -.55, 0, 1, 1, station.length || 68);
    batch.add('screen', batch.glass, g.matrix, side * 2.3, .85, 0, 1, 1, station.length || 68);
  }
  batch.add('roof', canopy, g.matrix, 0, 5.5, 0, 1, 1, (station.length || 68) + 5);
  for (const z of [-28, 0, 28]) for (const x of [-5.8, 5.8]) {
    batch.add('post', batch.concrete, g.matrix, x, 2.85, z);
  }
  batch.add('stair', batch.concrete, g.matrix, 9, -p.y / 2, 0, 1, p.y, 1);
  g.userData.stationName = station.name || '';
  return { group: g, u, name: station.name || '', position: p.clone(), route: route.id };
}

function makeTrain(scene, route, carCount = 3, shared = null) {
  const cars = [], carLength = route.carLength || 13.8, gap = route.carGap || .9;
  if (!shared) shared = {
    shellMat: new THREE.MeshStandardMaterial({ color: route.bodyColor || '#f2f4f5', roughness: .34, metalness: .18 }),
    stripeMat: new THREE.MeshStandardMaterial({ color: route.color || '#e24a3b', roughness: .46 }),
    windowMat: new THREE.MeshStandardMaterial({ color: '#203343', roughness: .18, metalness: .3, emissive: '#ffe0aa', emissiveIntensity: .55 }),
    underMat: new THREE.MeshStandardMaterial({ color: '#68727b', roughness: .5, metalness: .35 }),
    lampMat: new THREE.MeshBasicMaterial({ color: '#fff3c0' }),
    bodyGeo: new THREE.BoxGeometry(3.1, 3, carLength),
    stripeGeo: new THREE.BoxGeometry(3.14, .38, carLength - .15),
    windowGeo: new THREE.BoxGeometry(3.16, 1.12, carLength - 2.1),
    skirtGeo: new THREE.BoxGeometry(2.6, .72, carLength - .9),
    noseGeo: new THREE.SphereGeometry(1, 16, 12),
    windshieldGeo: new THREE.BoxGeometry(2.25, .95, .08),
    lampGeo: new THREE.BoxGeometry(.22, .2, .08),
  };
  for (let i = 0; i < carCount; i++) {
    const car = new THREE.Group();
    const body = new THREE.Mesh(shared.bodyGeo, shared.shellMat);
    const stripe = new THREE.Mesh(shared.stripeGeo, shared.stripeMat); stripe.position.y = -.77;
    const windows = new THREE.Mesh(shared.windowGeo, shared.windowMat); windows.position.y = .4;
    const skirt = new THREE.Mesh(shared.skirtGeo, shared.underMat); skirt.position.y = -1.55;
    car.add(body, stripe, windows, skirt);
    if (i === 0 || i === carCount - 1) {
      const nose = new THREE.Mesh(shared.noseGeo, shared.shellMat); nose.scale.set(1.48, 1.45, 2.1); nose.position.z = (i === 0 ? 1 : -1) * carLength / 2; car.add(nose);
      const windshield = new THREE.Mesh(shared.windshieldGeo, shared.windowMat);
      windshield.position.set(0, .35, (i === 0 ? 1 : -1) * (carLength / 2 + .65)); windshield.rotation.x = (i === 0 ? -.12 : .12); car.add(windshield);
      for (const x of [-.92, .92]) {
        const lamp = new THREE.Mesh(shared.lampGeo, shared.lampMat);
        lamp.position.set(x, -.55, (i === 0 ? 1 : -1) * (carLength / 2 + .5)); car.add(lamp);
      }
    }
  // Trains move every frame, while the city's shadow map is cached between view changes.
  car.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    scene.add(car); cars.push(car);
  }
  return { cars, carLength, gap, shared };
}

/** Build the proposed network from local-metre route data. */
export function buildMonorail(scene, proposal = {}) {
  const height = proposal.height || H, routes = [], objects = [], labels = [], allStations = [];
  const stationBatch = createStationBatch(scene);
  const speed = proposal.speed || 22;
  for (const spec of proposal.routes || []) {
    const curve = routeCurve(spec, height); if (!curve) continue;
    const length = addGuideway(scene, curve, spec, height);
    addSupports(scene, curve, length, spec);
    const stations = (spec.stations || []).map(s => addStation(scene, curve, s, spec, stationBatch));
    allStations.push(...stations);
    const fleet = makeTrain(scene, spec, spec.cars || 3), trains = [];
    const spacing = spec.trainSpacing || Math.max(length * .62, fleet.carLength * fleet.cars.length * 2.8);
    const trainCount = Math.max(1, Math.floor(length / spacing));
    for (let n = 0; n < trainCount; n++) {
      const offset = n * length / trainCount;
      const set = n === 0 ? fleet.cars : makeTrain(scene, spec, spec.cars || 3, fleet.shared).cars;
      set.forEach((obj, i) => { obj.userData.routeId = spec.id; obj.userData.carIndex = i; objects.push(obj); });
      trains.push({ cars: set, offset, carLength: fleet.carLength, gap: fleet.gap });
    }
    routes.push({ id: spec.id, name: spec.name || spec.id, color: spec.color || '#e24a3b', curve, length, closed: !!spec.closed, trains, speed, distance: 0, stations });
    for (const s of stations) labels.push({ text: s.name, pos: s.position.clone().add(new THREE.Vector3(0, 15, 0)), far: 3600, route: spec.id });
  }
  stationBatch.flush();
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  function update(dt) {
    for (const route of routes) route.distance += route.speed * dt;
    for (const route of routes) for (const train of route.trains) for (let i = 0; i < train.cars.length; i++) {
      const car = train.cars[i];
      const dist = wrap(train.offset + route.distance - i * (train.carLength + train.gap), route.length);
      const u = dist / route.length;
      route.curve.getPointAt(u, a);
      route.curve.getPointAt(wrap(u + .8 / route.length, 1), b);
      car.position.set(a.x, a.y + 2.3, a.z); car.lookAt(b.x, b.y + 2.3, b.z);
    }
  }
  update(0);
  return { routes, objects, labels, stations: allStations, update };
}
