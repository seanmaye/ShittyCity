// New York's outer-borough landmarks: the Wonder Wheel, the Unisphere and Citi Field.
// Ported from the NYC City Model (js/scene/boroughmarks.js). Their labels and camera views are
// in data/nyc/landmarks.json.
import * as THREE from 'three';
// Coordinates are NYC-frame metres (origin 40.745, -73.984; js/cities.js).

const UP = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

function add(scene, geometry, material, x, y, z, name) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (name) mesh.name = name;
  scene.add(mesh);
  return mesh;
}

function segmentInstances(scene, segments, radius, material, name) {
  const geometry = new THREE.CylinderGeometry(radius, radius, 1, 6, 1, false);
  const mesh = new THREE.InstancedMesh(geometry, material, segments.length);
  mesh.name = name;
  const dummy = new THREE.Object3D(), delta = new THREE.Vector3();
  segments.forEach(([a, b], i) => {
    delta.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    dummy.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    dummy.quaternion.setFromUnitVectors(UP, delta.clone().normalize());
    dummy.scale.set(1, delta.length(), 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  scene.add(mesh);
  return mesh;
}

function buildWonderWheel(scene) {
  // OSM Wonder Wheel node: 40.57404, -73.97915. Its published height is about 46 m.
  const x = 407.9, z = 18976.6, radius = 22.5, centerY = 23.1;
  const steel = new THREE.MeshStandardMaterial({ color: '#d7dfdf', roughness: .32, metalness: .72 });
  const spokeMat = new THREE.MeshStandardMaterial({ color: '#c8d0d1', roughness: .4, metalness: .62 });
  const hubMat = new THREE.MeshStandardMaterial({ color: '#c4c9c8', roughness: .34, metalness: .64 });
  const baseMat = new THREE.MeshStandardMaterial({ color: '#45484a', roughness: .88 });
  const podMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .55, metalness: .08 });

  const base = add(scene, new THREE.BoxGeometry(27, .55, 8), baseMat, x, .28, z, 'Wonder Wheel foundation');
  base.castShadow = false;
  // A paired rim gives the wheel depth while keeping all spokes in one instanced batch.
  for (const side of [-1, 1]) {
    const rim = add(scene, new THREE.TorusGeometry(radius, .38, 6, 72), steel, x, centerY, z + side * 1.35, 'Wonder Wheel rim');
    rim.castShadow = false;
    const inner = add(scene, new THREE.TorusGeometry(radius * .39, .23, 5, 48), spokeMat, x, centerY, z + side * 1.35, 'Wonder Wheel inner ring');
    inner.castShadow = false;
  }
  const spokePairs = [];
  for (const side of [-1, 1]) for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12;
    spokePairs.push([[x, centerY, z + side * 1.35],
      [x + Math.sin(a) * (radius - .35), centerY + Math.cos(a) * (radius - .35), z + side * 1.35]]);
  }
  segmentInstances(scene, spokePairs, .13, spokeMat, 'Wonder Wheel spokes');

  const axle = new THREE.CylinderGeometry(2.25, 2.25, 4.1, 16, 1);
  axle.rotateX(Math.PI / 2);
  add(scene, axle, hubMat, x, centerY, z, 'Wonder Wheel axle');

  const legs = [];
  for (const side of [-1, 1]) for (const sx of [-1, 1])
    legs.push([[x + sx * 11.4, .55, z + side * .9], [x + sx * .45, centerY - 1.1, z + side * .9]]);
  segmentInstances(scene, legs, .56, steel, 'Wonder Wheel A-frame');

  // Twenty-four stationary cabins make the wheel legible from the borough overview.
  const cabins = new THREE.InstancedMesh(new THREE.BoxGeometry(1.05, 1.35, 1.0), podMat, 24);
  cabins.name = 'Wonder Wheel cabins';
  const dummy = new THREE.Object3D(), hangers = [];
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12, px = x + Math.sin(a) * (radius + .05), py = centerY + Math.cos(a) * (radius + .05);
    dummy.position.set(px, py - .82, z); dummy.updateMatrix(); cabins.setMatrixAt(i, dummy.matrix);
    cabins.setColorAt(i, new THREE.Color(['#dcae2c', '#ce5341', '#287da0', '#e2dfd0'][i % 4]));
    hangers.push([[px, py - .05, z], [px, py - 1.05, z]]);
  }
  cabins.instanceMatrix.needsUpdate = true;
  if (cabins.instanceColor) cabins.instanceColor.needsUpdate = true;
  cabins.castShadow = true;
  scene.add(cabins);
  segmentInstances(scene, hangers, .055, steel, 'Wonder Wheel cabin hangers');
}

function buildUnisphere(scene) {
  // NYC Parks gives a 120 ft globe diameter and a 20 ft tripod base.
  // OSM/NYC landmark anchor: about 40.74639, -73.84528.
  const x = 11665.8, z = -154.3, globeR = 18.3, centerY = 24.4;
  const steel = new THREE.MeshStandardMaterial({ color: '#b9c9c9', roughness: .28, metalness: .78, wireframe: true });
  const ringMat = new THREE.MeshStandardMaterial({ color: '#d3dddc', roughness: .3, metalness: .76 });
  const baseMat = new THREE.MeshStandardMaterial({ color: '#aeb9b8', roughness: .36, metalness: .65 });
  const earth = add(scene, new THREE.SphereGeometry(globeR, 28, 18), steel, x, centerY, z, 'Unisphere lattice globe');
  earth.castShadow = false;

  // Three satellite-orbit rings, oriented through different planes around the globe.
  const ringSpecs = [
    { r: 19.9, n: new THREE.Vector3(0, 1, 0) },
    { r: 21.0, n: new THREE.Vector3(.77, .42, .48).normalize() },
    { r: 22.0, n: new THREE.Vector3(-.56, .70, .44).normalize() },
  ];
  for (const spec of ringSpecs) {
    const ring = add(scene, new THREE.TorusGeometry(spec.r, .27, 5, 64), ringMat, x, centerY, z, 'Unisphere satellite ring');
    ring.quaternion.setFromUnitVectors(Z_AXIS, spec.n);
    ring.castShadow = false;
  }

  // Three broad tripod legs meet the lower globe; the short pool rim sits at grade.
  const supportPairs = [];
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 6 + i * Math.PI * 2 / 3;
    supportPairs.push([[x + Math.cos(a) * 7.1, .4, z + Math.sin(a) * 7.1],
      [x + Math.cos(a) * 13.2, 12.0, z + Math.sin(a) * 13.2]]);
  }
  segmentInstances(scene, supportPairs, .62, baseMat, 'Unisphere tripod');
  const pool = add(scene, new THREE.TorusGeometry(47, .28, 4, 96),
    new THREE.MeshStandardMaterial({ color: '#81999a', roughness: .3, metalness: .35 }), x, .38, z, 'Unisphere reflecting-pool edge');
  pool.rotation.x = Math.PI / 2;
  pool.castShadow = false;
}

function ovalFacade(rx, rz, y0, y1, segments = 96) {
  const positions = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const a = i * Math.PI * 2 / segments, x = Math.cos(a) * rx, z = Math.sin(a) * rz;
    positions.push(x, y0, z, x, y1, z);
    if (i < segments) {
      const j = i * 2;
      indices.push(j, j + 2, j + 3, j, j + 3, j + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices); g.computeVertexNormals();
  return g;
}

function ovalRoof(rxOuter, rzOuter, rxInner, rzInner, y, segments = 96) {
  const positions = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const a = i * Math.PI * 2 / segments, c = Math.cos(a), s = Math.sin(a);
    positions.push(c * rxOuter, y, s * rzOuter, c * rxInner, y, s * rzInner);
    if (i < segments) {
      const j = i * 2;
      indices.push(j, j + 2, j + 3, j, j + 3, j + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices); g.computeVertexNormals();
  return g;
}

function buildCitiField(scene) {
  // Stadium anchor: 40.75694, -73.84583. Add only façade and roof trim over the mapped mass.
  const x = 11619.5, z = -1325.3;
  const brick = new THREE.MeshStandardMaterial({ color: '#a95438', roughness: .78, side: THREE.DoubleSide });
  const roof = new THREE.MeshStandardMaterial({ color: '#899094', roughness: .48, metalness: .32, side: THREE.DoubleSide });
  const fascia = add(scene, ovalFacade(129, 113, 30, 38), brick, x, 0, z, 'Citi Field brick fascia');
  fascia.castShadow = false;
  const crown = add(scene, ovalRoof(133, 117, 118, 103, 42.5), roof, x, 0, z, 'Citi Field roof rim');
  crown.castShadow = false;

  // Repeated exterior piers give the oval its brick-and-arch rhythm without making another bowl.
  const pierGeo = new THREE.BoxGeometry(1.5, 8.5, 2.1);
  const piers = new THREE.InstancedMesh(pierGeo, brick, 32);
  piers.name = 'Citi Field façade piers';
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 32; i++) {
    const a = i * Math.PI * 2 / 32, px = Math.cos(a) * 130.2, pz = Math.sin(a) * 114.2;
    dummy.position.set(x + px, 34.2, z + pz);
    dummy.rotation.y = Math.atan2(Math.cos(a), Math.sin(a));
    dummy.updateMatrix(); piers.setMatrixAt(i, dummy.matrix);
  }
  piers.instanceMatrix.needsUpdate = true;
  piers.castShadow = true;
  piers.receiveShadow = true;
  scene.add(piers);
}

export function buildBoroughMarks(scene) {
  buildWonderWheel(scene);
  buildUnisphere(scene);
  buildCitiField(scene);
  // Expansion data owns visible labels and camera presets to prevent duplicate UI tags.
  return { labels: [] };
}
