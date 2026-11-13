import * as THREE from 'three';
import { buildElectro, buildSpiderMan } from './showdown-figures.js';
import { buildShowdownStreet } from './showdown-street.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const STEPS = 14;

function haloTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const fade = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  fade.addColorStop(0, 'rgba(255,255,255,1)');
  fade.addColorStop(.28, 'rgba(255,255,255,.54)');
  fade.addColorStop(.62, 'rgba(255,255,255,.13)');
  fade.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = fade; ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function groundGlow(root, map, color, x, z, w, d, opacity, shade = false) {
  const material = new THREE.MeshBasicMaterial({
    map, color, opacity, transparent: true, depthWrite: false,
    blending: shade ? THREE.NormalBlending : THREE.AdditiveBlending,
  });
  const o = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
  o.rotation.x = -Math.PI / 2; o.position.set(x, .122, z);
  root.add(o);
  return o;
}

function sprite(root, map, color, size, opacity, blending = THREE.AdditiveBlending) {
  const material = new THREE.SpriteMaterial({ map, color, opacity, blending, depthWrite: false });
  const o = new THREE.Sprite(material);
  o.scale.set(size, size, 1);
  root.add(o);
  return o;
}

function makeArcs(root) {
  const geometry = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
  const layers = [[.051, '#408bff', .32], [.020, '#c9f4ff', .97]].map(([radius, color, opacity]) => {
    const material = new THREE.MeshBasicMaterial({ color, opacity, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const mesh = new THREE.InstancedMesh(geometry, material, 12 * STEPS);
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.userData.bounded = true;
    mesh.frustumCulled = false;
    root.add(mesh);
    return { mesh, radius, opacity };
  });
  let count = 0;
  const last = V(0, 0, 0), point = V(0, 0, 0), dir = V(0, 0, 0), up = V(0, 1, 0);
  const transform = new THREE.Object3D();
  function arc(start, end, seed, width, bend, segments = STEPS) {
    last.copy(start);
    for (let i = 1; i <= segments; i++) {
      const f = i / segments, envelope = Math.sin(f * Math.PI);
      const n = k => Math.sin((i * 71.6 + seed * 113.1) * k);
      point.lerpVectors(start, end, f);
      point.x += n(1.17) * width * envelope;
      point.y += (bend + n(2.91) * width * .67) * envelope;
      point.z += n(1.93) * width * envelope;
      dir.subVectors(point, last);
      const length = dir.length();
      transform.position.lerpVectors(last, point, .5);
      transform.quaternion.setFromUnitVectors(up, dir.normalize());
      for (const { mesh, radius } of layers) {
        transform.scale.set(radius, length + radius * 1.1, radius);
        transform.updateMatrix();
        mesh.setMatrixAt(count, transform.matrix);
      }
      last.copy(point);
      count++;
    }
  }
  return {
    arc,
    refresh(energy) {
      for (const { mesh, opacity } of layers) {
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.material.opacity = opacity * energy;
      }
      count = 0;
    },
  };
}

function airborne(root, map, origin) {
  const particles = 96, positions = new Float32Array(particles * 3), colors = [];
  const g = new THREE.BufferGeometry();
  const buffer = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', buffer);
  for (let i = 0; i < particles; i++) colors.push(...(i < 72 ? [.31, .68, 1] : [1, .64, .31]));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const m = new THREE.PointsMaterial({ map, size: .117, vertexColors: true, transparent: true, opacity: .85, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(g, m);
  points.frustumCulled = false;
  root.add(points);
  const smoke = Array.from({ length: 7 }, () => sprite(root, map, '#76819e', 1, .12, THREE.NormalBlending));
  return t => {
    for (let i = 0; i < particles; i++) {
      const life = (t * (.37 + i % 6 * .065) + i * .618) % 1, angle = i * 2.39996, speed = .85 + i % 8 * .32;
      const isBlue = i < 72, d = isBlue ? .47 + speed * life : .1 + life * 1.8;
      buffer.setXYZ(i, (isBlue ? origin.x : -1.95) + Math.cos(angle) * d,
        Math.max(.15, (isBlue ? origin.y + 1.1 : .7) + life * (1.3 + i % 9 * .28) - life * life * 1.8),
        (isBlue ? origin.z : -2.43) + Math.sin(angle) * d);
    }
    buffer.needsUpdate = true;
    smoke.forEach((o, i) => {
      const life = (t * .14 + i / smoke.length) % 1;
      o.position.set(-2 + life * 2.1 + .7 * Math.sin(i), .49 + life * 1.64, -2.43 - life * 2);
      o.scale.setScalar(.66 + life * 2.45);
      o.material.opacity = .23 * Math.sin(life * Math.PI);
    });
  };
}

export function buildShowdown(scene) {
  // Local z follows Seventh Avenue, positive toward 46th Street.
  const root = new THREE.Group();
  root.name = 'Times Square showdown';
  // The base sits above the map's street and footpath ribbons.
  root.position.set(-117, .85, -1477); root.rotation.y = -.505;
  scene.add(root);
  root.updateMatrixWorld(true);
  const world = (x, y, z) => root.localToWorld(V(x, y, z));
  const { screens, lights } = buildShowdownStreet(root);
  const spider = buildSpiderMan(), electro = buildElectro();
  spider.root.position.set(-2, 1.64, -.17); spider.root.rotation.set(0, 1.36, -.072, 'YXZ');
  const origin = V(2.43, .83, -2.84);
  electro.root.position.copy(origin); electro.root.rotation.y = -.97;
  root.add(spider.root, electro.root);

  const map = haloTexture();
  groundGlow(root, map, '#090a17', -2, -.41, 4, 6, .86, true);
  groundGlow(root, map, '#090a17', 5.9, -9.1, 6, 4, .8, true);
  groundGlow(root, map, '#090e26', origin.x, origin.z, 2.3, 1.65, .57, true);
  const glow = groundGlow(root, map, '#267fff', origin.x, origin.z, 10, 8, .8);
  const policeGlow = lights.map((_, i) => {
    const x = i < 2 ? -2 : 5.9, z = i < 2 ? -.40 : -9.1;
    return groundGlow(root, map, i % 2 ? '#287bff' : '#ed3057', x + (i % 2 ? .76 : -.76), z, 5.2, 6.7, .25);
  });
  groundGlow(root, map, '#ba257c', -10, -15, 15, 12, .42);
  groundGlow(root, map, '#1165a3', 10, -18, 13, 13, .56);
  const palms = electro.hands.map(() => sprite(root, map, '#39a4ff', .85, .58));
  const aura = sprite(root, map, '#2582ff', 3.6, .27);
  const arcs = makeArcs(root);
  const particles = airborne(root, map, origin);
  const boltEnds = [V(-.58, .15, -3.75), V(4.56, .12, .02), V(6.10, .37, -4.67), V(1.03, .15, -6.24), V(2.58, 3.8, -4.65)];
  const stair = V(-3.42, 1.95, -14.1), cruiser = V(-1.18, .77, -2.25);
  const fork = V(0, 0, 0);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let time = 0, previous = -1;
  const cameraOffset = V(0, 0, 0);
  const base = { near: 3, cut: false, hour: 22 };
  const views = [
    { ...base, id: 'times-square-showdown', name: 'Spider-Man vs. Electro',
      pos: world(-.7, 4.1, 8.8), portraitPos: world(-.65, 5.3, 14.2), target: world(-.8, 2.65, -2.6) },
    { ...base, id: 'times-square-plaza', name: 'Times Square plaza',
      pos: world(8.35, 13.25, 20), portraitPos: world(8.7, 18.6, 27.5), target: world(-1.3, 4.15, -10.9) },
  ];

  function update(dt, camera, cut) {
    cameraOffset.subVectors(camera.position, root.position);
    root.visible = !cut && cameraOffset.lengthSq() < 650 ** 2;
    if (!root.visible || (still && previous !== -1)) return;
    if (!still) time += dt;
    const beat = Math.floor(time * 9);
    const charge = .72 + .15 * Math.sin(time * 3.1) + .11 * Math.sin(time * 5.8);
    electro.root.position.y = origin.y + Math.sin(time * 2.4) * .12;
    electro.root.rotation.z = Math.sin(time * 1.8) * .042;
    electro.head.rotation.y = Math.sin(time * 1.65) * .12;
    spider.head.rotation.y = -.27 + .13 * Math.sin(time * 1.85);
    glow.material.opacity = .48 + charge * .3;
    aura.position.copy(electro.root.position); aura.position.y += .98;
    aura.material.opacity = .18 + charge * .13;
    electro.root.updateMatrix();
    for (const [i, o] of palms.entries()) {
      o.position.copy(electro.hands[i]).applyMatrix4(electro.root.matrix);
      o.material.opacity = charge;
    }
    if (beat !== previous) {
      previous = beat;
      const a = palms[0].position, b = palms[1].position;
      const burst = beat % 39 >= 27 && beat % 39 <= 33;
      arcs.arc(a, boltEnds[0], beat + 1, .65, .34);
      arcs.arc(b, boltEnds[1], beat + 2, .64, .28);
      arcs.arc(b, boltEnds[2], beat + 3, .71, .64);
      arcs.arc(a, boltEnds[3], beat + 4, .61, .39);
      arcs.arc(b, boltEnds[4], beat + 5, .52, .14);
      arcs.arc(fork.lerpVectors(a, boltEnds[0], .52).add(V(0, .32, 0)), cruiser, beat + 7, .45, .36, 9);
      arcs.arc(fork.lerpVectors(b, boltEnds[1], .65).add(V(0, .24, 0)), V(3.14, .15, .57), beat + 8, .37, .2, 9);
      arcs.arc(fork.lerpVectors(b, boltEnds[4], .48), V(4.2, 2.8, -4.07), beat + 9, .32, .19, 8);
      if (burst || still) arcs.arc(a, stair, beat + 11, 1.02, .88);
      arcs.refresh(charge);
    }
    screens.forEach((m, i) => {
      const phase = (time + i * .68) % 7.1;
      const level = phase > 5.8 ? .27 + .20 * Math.sin(phase * 9) ** 2 : .86 + .11 * Math.sin(time * 1.6 + i);
      m.color.setScalar(level);
    });
    lights.forEach((m, i) => {
      const pulse = .53 + .47 * Math.sin(time * 5.25 + i * Math.PI + Math.floor(i / 2) * .6);
      m.color.set(i % 2 ? '#3f87ff' : '#ff3856').multiplyScalar(.37 + pulse * .63);
      policeGlow[i].material.opacity = .07 + pulse * .27;
    });
    particles(time);
  }

  return { views, update };
}
