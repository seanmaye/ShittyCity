// Data-driven straddle monorails. Path points are [x, z] at the default guideway
// height or [x, y, z] in local metres. The scene registers the cars with the shared ride system.
// Per-route options: suspended (the cars hang below the beam on hanger arms, and the supports
// rise from the beam to whatever it hangs from: groundAt gives that height), and shuttle (an
// open line: the train runs to one end and back, every car facing the same way throughout),
// flatbed (the index of a car built as an open deck, loaded by cargo(car)) and seeThrough/rider.
import * as THREE from 'three';

const H = 18;
const SUSPEND = -3.3;   // a hanging car's centre, below the beam's (a sitting one's is 2.3 above)
const V3 = (...p) => p.length === 2 ? new THREE.Vector3(p[0], H, p[1]) : new THREE.Vector3(p[0], p[1], p[2]);
const wrap = (n, d) => ((n % d) + d) % d;

function routeCurve(route, height) {
  const points = (route.path || []).map(p => p.length === 2 ? new THREE.Vector3(p[0], height, p[1]) : new THREE.Vector3(p[0], p[1], p[2]));
  if (points.length < 2) return null;
  return new THREE.CatmullRomCurve3(points, !!route.closed, 'centripetal');
}

function addGuideway(scene, curve, route) {
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

function addSupports(scene, curve, length, route, groundAt) {
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
    const ground = groundAt(p.x, p.z);
    if (route.suspended) {   // a hanger from the top of the beam up to the counter or ceiling above
      dummy.position.set(p.x, p.y + .9, p.z); dummy.scale.set(.5, Math.max(.2, ground - p.y - .9), .5);
      dummy.updateMatrix(); columns.setMatrixAt(i, dummy.matrix);
      dummy.position.y = ground - .3; dummy.scale.set(.6, .6, .6); dummy.updateMatrix(); caps.setMatrixAt(i, dummy.matrix);
      continue;
    }
    dummy.position.set(p.x, ground, p.z);
    dummy.scale.set(1, p.y - 1.1 - ground, 1);
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

function addStation(scene, curve, station, route, batch, groundAt) {
  const u = station.at != null ? wrap(station.at, 1) : (() => {
    if (!station.position) return 0;
    const target = V3(...station.position); let best = Infinity, bi = 0;
    for (let i = 0; i <= 600; i++) {
      const p = curve.getPointAt(i / 600);
      if (station.position.length === 2) p.y = target.y;
      const d = p.distanceToSquared(target);
      if (d < best) { best = d; bi = i; }
    }
    return bi / 600;
  })();
  const p = curve.getPointAt(u), t = curve.getTangentAt(u), g = new THREE.Group();
  g.position.copy(p); g.rotation.y = Math.atan2(t.x, t.z); scene.add(g);
  const canopy = batch.canopy(route.color || '#e24a3b');
  const length = station.length || 68;
  g.updateMatrix();
  if (route.suspended) {
    for (const side of [-1, 1]) {
      batch.add('platform', batch.concrete, g.matrix, side * 4.6, SUSPEND - 1.9, 0, 1, 1, length);
      batch.add('screen', batch.glass, g.matrix, side * 2.3, SUSPEND - .2, 0, 1, 1, length);
      for (const z of [-length / 2 + 1, length / 2 - 1]) batch.add('post', batch.concrete, g.matrix, side * 6.3, SUSPEND / 2 + .4, z, 1, (1.8 - SUSPEND) / 5.2, 1);
    }
    g.userData.stationName = station.name || '';
    return { group: g, u, name: station.name || '', position: p.clone().add(new THREE.Vector3(0, SUSPEND, 0)), route: route.id };
  }
  for (const side of [-1, 1]) {
    batch.add('platform', batch.concrete, g.matrix, side * 4.8, -.55, 0, 1, 1, length);
    batch.add('screen', batch.glass, g.matrix, side * 2.3, .85, 0, 1, 1, length);
  }
  batch.add('roof', canopy, g.matrix, 0, 5.5, 0, 1, 1, length + 5);
  const postOffset = Math.min(28, length / 2 - 3);
  for (const z of [-postOffset, 0, postOffset]) for (const x of [-5.8, 5.8]) {
    batch.add('post', batch.concrete, g.matrix, x, 2.85, z);
  }
  const drop = p.y - groundAt(p.x + 9 * Math.cos(g.rotation.y), p.z - 9 * Math.sin(g.rotation.y));
  batch.add('stair', batch.concrete, g.matrix, 9, -drop / 2, 0, 1, drop, 1);
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
  // route.seeThrough: an open window band of clear glass between a lower shell and a roof, so
  // whoever rides (route.rider(car, index) adds them) can be seen from outside
  if (route.seeThrough && !shared.lowerGeo) {
    shared.lowerGeo = new THREE.BoxGeometry(3.1, 1.2, carLength); shared.roofGeo = new THREE.BoxGeometry(3.1, .4, carLength);
    shared.endGeo = new THREE.BoxGeometry(3.1, 1.4, .14);
    shared.glassMat = new THREE.MeshStandardMaterial({ color: '#cfe6f2', roughness: .05, metalness: .1, transparent: true, opacity: .22, depthWrite: false });
  }
  for (let i = 0; i < carCount; i++) {
    const car = new THREE.Group();
    const stripe = new THREE.Mesh(shared.stripeGeo, shared.stripeMat); stripe.position.y = -.77;
    const skirt = new THREE.Mesh(shared.skirtGeo, shared.underMat); skirt.position.y = -1.55;
    if (route.flatbed === i) {
      // a flatbed: an open deck with low side rails and stake posts; route.cargo(car) loads it
      if (!shared.deckGeo) { shared.deckGeo = new THREE.BoxGeometry(3.1, .4, carLength); shared.railGeo = new THREE.BoxGeometry(.14, .35, carLength - .4); shared.stakeGeo = new THREE.BoxGeometry(.18, .7, .18); }
      const deck = new THREE.Mesh(shared.deckGeo, shared.shellMat); deck.position.y = -1.1;
      car.add(deck, stripe, skirt);
      for (const x of [-1.45, 1.45]) {
        const rail = new THREE.Mesh(shared.railGeo, shared.stripeMat); rail.position.set(x, -.7, 0); car.add(rail);
        for (const z of [-carLength / 2 + .4, 0, carLength / 2 - .4]) { const st = new THREE.Mesh(shared.stakeGeo, shared.underMat); st.position.set(x, -.65, z); car.add(st); }
      }
      if (route.suspended) {   // hung under the beam: a gantry at each end carries the deck up to the hanger
        if (!shared.gantryGeo) { shared.gantryGeo = new THREE.BoxGeometry(.22, 2.7, .22); shared.topGeo = new THREE.BoxGeometry(.3, .3, carLength - .3); }
        for (const z of [-carLength / 2 + .3, carLength / 2 - .3]) { const g = new THREE.Mesh(shared.gantryGeo, shared.underMat); g.position.set(0, .45, z); car.add(g); }
        const top = new THREE.Mesh(shared.topGeo, shared.underMat); top.position.y = 1.65; car.add(top);
      }
      if (route.cargo) route.cargo(car);
    } else if (route.seeThrough) {
      const lower = new THREE.Mesh(shared.lowerGeo, shared.shellMat); lower.position.y = -.9;
      const roof = new THREE.Mesh(shared.roofGeo, shared.shellMat); roof.position.y = 1.3;
      const glass = new THREE.Mesh(shared.windowGeo, shared.glassMat); glass.position.y = .4; glass.renderOrder = 2;
      car.add(lower, roof, stripe, skirt, glass);
      for (const z of [-1, 1]) { const end = new THREE.Mesh(shared.endGeo, shared.glassMat); end.position.set(0, .4, z * (carLength / 2 - .07)); car.add(end); }
    } else {
      const body = new THREE.Mesh(shared.bodyGeo, shared.shellMat);
      const windows = new THREE.Mesh(shared.windowGeo, shared.windowMat); windows.position.y = .4;
      car.add(body, stripe, windows, skirt);
    }
    if (route.suspended) {
      const arm = new THREE.Mesh(shared.armGeo || (shared.armGeo = new THREE.BoxGeometry(.4, 2.6, 1)), shared.underMat); arm.position.y = 2.75;
      const bogie = new THREE.Mesh(shared.bogieGeo || (shared.bogieGeo = new THREE.BoxGeometry(2.7, .7, 2.6)), shared.underMat); bogie.position.y = -SUSPEND + 1.4;
      car.add(arm, bogie);
    }
    if (route.rider && route.flatbed !== i) route.rider(car, i);
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
export function buildMonorail(scene, proposal = {}, groundAt = () => 0) {
  const height = proposal.height || H, routes = [], objects = [], labels = [], allStations = [];
  const stationBatch = createStationBatch(scene);
  const speed = proposal.speed || 22;
  for (const spec of proposal.routes || []) {
    const curve = routeCurve(spec, height); if (!curve) continue;
    const length = addGuideway(scene, curve, spec);
    addSupports(scene, curve, length, spec, groundAt);
    const stations = (spec.stations || []).map(s => addStation(scene, curve, s, spec, stationBatch, groundAt));
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
    routes.push({ id: spec.id, name: spec.name || spec.id, color: spec.color || '#e24a3b', curve, length, closed: !!spec.closed, trains, speed, distance: 0, stations,
                  suspended: !!spec.suspended, shuttle: !!spec.shuttle && !spec.closed });
    for (const s of stations) labels.push({ text: s.name, pos: s.position.clone().add(new THREE.Vector3(0, 15, 0)), far: 3600, route: spec.id });
  }
  stationBatch.flush();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), aim = new THREE.Vector3(), look = new THREE.Matrix4(), UP = new THREE.Vector3(0, 1, 0);
  function update(dt) {
    for (const route of routes) route.distance += route.speed * dt;
    for (const route of routes) for (const train of route.trains) {
      const step = train.carLength + train.gap, lift = route.suspended ? SUSPEND : 2.3;
      // a shuttle: the whole train slides to the far end and back (car 0 at the far end's side)
      let base = 0, back = false;
      if (route.shuttle) {
        const span = Math.max(1, route.length - train.cars.length * step), m = wrap(train.offset + route.distance, 2 * span);
        back = m > span; base = back ? 2 * span - m : m;
      }
      for (let i = 0; i < train.cars.length; i++) {
        const car = train.cars[i];
        const dist = route.shuttle ? base + (train.cars.length - 1 - i) * step + train.carLength / 2
          : wrap(train.offset + route.distance - i * step, route.length);
        const u = Math.min(1, dist / route.length);
        route.curve.getPointAt(u, a);
        if (route.shuttle) b.copy(a).add(route.curve.getTangentAt(u, aim).multiplyScalar(.8));
        else route.curve.getPointAt(wrap(u + .8 / route.length, 1), b);
        // aim it along the beam in its parent's own frame (Object3D.lookAt takes world coordinates,
        // which differ from these when the network sits in a scaled group, like the kitchen's)
        car.position.set(a.x, a.y + lift, a.z); aim.set(b.x, b.y + lift, b.z);
        look.lookAt(aim, car.position, UP); car.quaternion.setFromRotationMatrix(look);
        car.userData.along = dist; car.userData.back = back;   // where it is on its line (the kitchen's ride diagram)
      }
    }
  }
  update(0);
  return { routes, objects, labels, stations: allStations, update };
}
