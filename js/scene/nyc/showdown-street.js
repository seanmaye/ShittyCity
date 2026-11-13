import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeFigure } from '../phl/people.js';

const lit = (color, emissive = color, emissiveIntensity = .24) =>
  new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity, roughness: .81 });
const bright = color => new THREE.MeshBasicMaterial({ color });
const box = new THREE.BoxGeometry(1, 1, 1);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 16);
const plane = new THREE.PlaneGeometry(1, 1);
const V = p => new THREE.Vector3(...p);

function add(parent, geometry, material, position, scale, yaw = 0) {
  const o = new THREE.Mesh(geometry, material);
  o.position.set(...position); o.scale.set(...scale); o.rotation.y = yaw;
  parent.add(o);
  return o;
}

function artwork(w, h, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  paint(ctx, w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  return texture;
}

function billboard(parent, spec) {
  const { x, y, z, w, h, yaw, bg, ink, title, sub, design } = spec;
  const texture = artwork(512, 512, (ctx, W, H) => {
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, bg); grad.addColorStop(1, '#080f26');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.globalAlpha = .52;
    if (design === 'rings') {
      for (let i = 0; i < 7; i++) {
        ctx.lineWidth = 2 + i * 2; ctx.beginPath();
        ctx.ellipse(405, 164, 90 + i * 17, 53 + i * 19, -.69, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (design === 'rays') {
      for (let i = 0; i < 10; i++) {
        ctx.beginPath(); ctx.moveTo(120, 245); ctx.lineTo(i * 94 - 120, 0);
        ctx.lineTo(i * 94 - 93, 0); ctx.closePath(); ctx.fill();
      }
    } else {
      for (let i = 0; i < 12; i++) {
        const height = 35 + (i * 67) % 150;
        ctx.fillRect(i * 46, 227 - height, 25, height);
      }
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#0a1026'; ctx.fillRect(0, 260, W, 159);
    ctx.font = '900 85px Arial'; ctx.fillStyle = ink; ctx.fillText(title, 30, 355, 451);
    ctx.font = '700 25px Arial'; ctx.fillStyle = '#f3f5ff'; ctx.fillText(sub, 32, 395, 448);
    ctx.fillStyle = '#10162d'; ctx.globalAlpha = .21;
    for (let row = 0; row < H; row += 5) ctx.fillRect(0, row, W, 1);
  });
  const group = new THREE.Group(); group.position.set(x, y, z); group.rotation.y = yaw; parent.add(group);
  const frame = lit('#202638', '#202742', .33), trim = lit('#455268');
  add(group, box, frame, [0, 0, 0], [w + .6, h + .6, .66]);
  for (const side of [-1, 1]) {
    add(group, box, trim, [side * (w / 2 + .17), 0, .32], [.15, h + .55, .12]);
    add(group, box, frame, [side * w * .35, -y / 2 - h / 4, -.26], [.35, Math.max(.2, y - h / 2), .37]);
  }
  const material = new THREE.MeshBasicMaterial({ map: texture, color: '#ffffff' });
  add(group, plane, material, [0, 0, .34], [w, h, 1]);
  return material;
}

function sign(parent, text, color, position, scale, yaw = 0) {
  const map = artwork(512, 128, (ctx, w, h) => {
    ctx.fillStyle = color; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#e6eef9'; ctx.lineWidth = 5; ctx.strokeRect(7, 7, w - 14, h - 14);
    ctx.fillStyle = '#eef5ff'; ctx.font = 'bold 63px Arial'; ctx.textAlign = 'center';
    ctx.textBaseline = 'middle'; ctx.fillText(text, w / 2, h / 2 + 3, w - 33);
  });
  return add(parent, plane, new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide }), position, scale, yaw);
}

function cruiser(parent, position, yaw, tilt) {
  const car = new THREE.Group(); car.position.set(...position); car.rotation.set(0, yaw, tilt, 'YXZ'); parent.add(car);
  const body = lit('#b6c9d9', '#506883', .52), trim = lit('#1a2436', '#232d4c', .58);
  const glass = lit('#243b5c', '#263c60', .75), bumper = lit('#526680');
  const white = bright('#c3dcfa'), rear = bright('#f24756'), blue = lit('#275eab', '#3663a7', .73);
  add(car, box, trim, [0, .36, 0], [1.96, .35, 4.88]);
  add(car, box, body, [0, .68, 0], [1.96, .56, 4.74]);
  add(car, box, body, [0, 1.48, -.19], [1.49, .16, 1.83]);
  add(car, box, glass, [0, 1.193, -.22], [1.54, .46, 1.88]);
  for (const [z, angle] of [[.81, -.48], [-1.26, .49]]) {
    const windshield = add(car, box, glass, [0, 1.18, z], [1.51, .57, .065]);
    windshield.rotation.x = angle;
  }
  for (const side of [-1, 1]) {
    add(car, box, body, [side * .776, 1.19, -.22], [.06, .48, .10]);
    add(car, box, trim, [side * .964, 1.12, .68], [.23, .13, .27]);
    add(car, box, blue, [side * .985, .65, 0], [.015, .14, 3.15]);
    for (const z of [-.74, .34]) add(car, box, trim, [side * .997, .81, z], [.02, .038, .15]);
    add(car, box, white, [side * .709, .737, 2.382], [.36, .17, .044]);
    add(car, box, rear, [side * .762, .73, -2.383], [.31, .14, .049]);
    for (const z of [-1.54, 1.54]) {
      const tire = add(car, cylinder, trim, [side * .959, .354, z], [.364, .24, .364]);
      tire.rotation.z = Math.PI / 2;
      const hub = add(car, cylinder, bumper, [side * 1.084, .354, z], [.192, .033, .192]);
      hub.rotation.z = Math.PI / 2;
    }
  }
  add(car, box, trim, [0, .655, 2.392], [.99, .17, .056]);
  for (let i = 0; i < 6; i++) add(car, box, bumper, [0, .586 + i * .025, 2.426], [.93, .009, .015]);
  for (const z of [-2.44, 2.44]) add(car, box, bumper, [0, .414, z], [1.94, .18, .14]);
  sign(car, 'NYPD', '#23457c', [0, .984, 1.59], [.99, .24, 1]).rotation.x = -Math.PI / 2;
  add(car, box, trim, [0, 1.58, -.62], [1.28, .085, .27]);
  const lights = [bright('#ff3856'), bright('#3f87ff')];
  lights.forEach((m, i) => add(car, box, m, [(i - .5) * .64, 1.66, -.62], [.60, .092, .22]));
  return lights;
}

function pavement(parent) {
  const m = lit('#4d5267', '#4c5374', .47);
  const map = artwork(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#a9abba'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 3400; i++) {
      const v = 112 + (i * 137) % 74;
      ctx.fillStyle = `rgba(${v},${v},${v},.45)`;
      ctx.fillRect((i * 53 + (i * i >> 4)) % w, (i * 179 + (i * i >> 7)) % h, 1 + i % 3, 1);
    }
  });
  map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(7, 11); m.map = map;
  const road = add(parent, plane, m, [.9, .095, -5], [33, 70, 1]);
  road.rotation.x = -Math.PI / 2;
}

function streetFurniture(parent) {
  const ink = lit('#333b4d'), paint = lit('#bec6cd', '#6c7c98', .5), gold = lit('#b69559', '#806139', .55);
  const steel = lit('#565f76', '#2e3c53', .52), curb = lit('#9c9bad', '#545c78', .5);
  const stone = lit('#666c80', '#5f6786', .35), riser = lit('#6f2440', '#7c1631', .66);
  const step = lit('#bc3550', '#a62040', .64), edge = bright('#ff6d7c');
  const lamp = bright('#fff1bd'), red = bright('#ff5858'), green = bright('#65f4ba');
  // Merge the repeated paving, stairs, barriers and rails by material.
  const batches = new Map(), dummy = new THREE.Object3D();
  function part(g, m, p, s, q) {
    dummy.position.set(...p); dummy.scale.set(...s); dummy.quaternion.copy(q ?? identity); dummy.updateMatrix();
    const batch = batches.get(m) ?? [];
    if (!batches.has(m)) batches.set(m, batch);
    batch.push(g.clone().applyMatrix4(dummy.matrix));
  }
  const identity = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const slab = (m, x, y, z, w, h, d) => part(box, m, [x, y, z], [w, h, d]);
  const pole = (m, x, y, z, r, h) => part(cylinder, m, [x, y, z], [r, h, r]);
  function rail(m, from, to, r) {
    const a = V(from), b = V(to), d = b.clone().sub(a);
    part(cylinder, m, a.lerp(b, .5).toArray(), [r, d.length(), r], new THREE.Quaternion().setFromUnitVectors(up, d.normalize()));
  }
  for (const z of [-25, 16]) {
    for (let i = 0; i < 11; i++) slab(paint, -1 + i * .95, .105, z, .5, .016, 2.4);
    slab(paint, 3.75, .107, z - 1.75, 10.7, .017, .16);
  }
  for (const x of [3.85, 4.08]) for (const z of [-17, -9, 1, 8, 23]) slab(gold, x, .106, z, .093, .02, 3.6);
  for (const x of [-14.7, 15.85]) {
    slab(stone, x, .105, -5, 2.95, .11, 60);
    slab(curb, x - Math.sign(x) * 1.46, .177, -5, .18, .18, 60);
    for (let z = -33; z < 25; z += 1.5) slab(ink, x, .164, z, 2.91, .011, .027);
  }
  slab(stone, -7.15, .155, -18, 8.5, .23, 13);
  slab(curb, -7.15, .25, -11.5, 8.5, .11, .14);
  const stairZ = -13, stepDepth = .62;
  for (let i = 0; i < 12; i++) {
    const h = .43 + i * .23, z = stairZ - i * stepDepth;
    slab(riser, -7.1, h / 2, z, 7.8, h, stepDepth);
    slab(step, -7.1, h + .035, z, 7.91, .07, stepDepth);
    slab(edge, -7.1, h + .045, z + .311, 7.88, .034, .018);
  }
  slab(step, -7.1, 2.995, -21.12, 7.9, .39, 2.02);
  for (const x of [-10.78, -7.1, -3.42]) {
    rail(steel, [x, 1.34, -12.65], [x, 3.92, -19.95], .043);
    for (let i = 0; i < 12; i += 3) pole(steel, x, .93 + i * .23, stairZ - i * stepDepth, .035, .94);
  }
  for (const [x, z, side] of [[9.9, -19.5, -1], [-11.8, -9.2, 1], [12.7, 11.6, -1], [-10.5, -31.5, 1]]) {
    pole(steel, x, .28, z, .23, .46);
    pole(ink, x, 3.1, z, .095, 5.9);
    rail(steel, [x, 5.7, z], [x + side * 1.8, 6.05, z], .076);
    slab(ink, x + side * 1.8, 6.05, z, .73, .16, .37);
    slab(lamp, x + side * 1.8, 5.952, z, .52, .034, .27);
    slab(ink, x, 3.85, z + .19, .35, .87, .34);
    for (const [i, m] of [red, gold, green].entries()) slab(m, x, 4.12 - i * .255, z + .367, .17, .16, .025);
  }
  for (const [x, z] of [[-6.3, 4.3], [6.1, -5.7], [8.8, -5.7], [-12, -7.1], [12, 8.6]]) {
    for (const sx of [-1, 1]) {
      pole(steel, x + sx * 1.15, .63, z, .031, 1.06);
      slab(steel, x + sx * 1.15, .13, z, .09, .064, .53);
    }
    for (const y of [.31, 1.10]) slab(steel, x, y, z, 2.33, .051, .052);
    for (let i = -5; i <= 5; i++) pole(steel, x + i * .18, .69, z, .019, .8);
  }
  for (const [x, z] of [[-13, -8], [-13, 11], [11, -23], [7.6, 12]]) {
    pole(ink, x, .53, z, .27, .84); pole(steel, x, .95, z, .29, .095);
  }
  for (const [x, z] of [[-1.1, 3.5], [1.6, -3.2], [2.4, -8]]) {
    pole(ink, x, .103, z, .31, .019);
    for (let j = -4; j <= 4; j++) slab(steel, x + j * .054, .117, z, .014, .011, .35);
  }
  for (const [material, geos] of batches) {
    parent.add(new THREE.Mesh(mergeGeometries(geos), material));
    geos.forEach(g => g.dispose());
  }
}

export function buildShowdownStreet(root) {
  pavement(root);
  streetFurniture(root);
  const screens = [
    { x: -14.5, y: 9.6, z: -21.5, w: 10, h: 8.5, yaw: .61, bg: '#6a154c', ink: '#ffa1ce', title: 'BROADWAY', sub: 'TONIGHT ON STAGE', design: 'rays' },
    { x: 13.6, y: 10.6, z: -20.8, w: 11, h: 12.8, yaw: -.70, bg: '#0e496c', ink: '#8ff3ff', title: 'OSCORP', sub: 'POWERING TOMORROW', design: 'rings' },
    { x: -13.9, y: 19.3, z: -24, w: 10.2, h: 6.8, yaw: .56, bg: '#58262f', ink: '#ffe185', title: 'MIDTOWN', sub: 'LIVE FROM NEW YORK', design: 'skyline' },
    { x: 14.4, y: 24, z: -26, w: 10.2, h: 8.3, yaw: -.60, bg: '#282261', ink: '#9da8ff', title: 'NYC LIVE', sub: 'TIMES SQUARE', design: 'rays' },
    { x: 5.4, y: 11.2, z: -49, w: 11.5, h: 15, yaw: -.13, bg: '#4c1830', ink: '#ff8c86', title: 'TIMES', sub: 'SQUARE · NEW YORK', design: 'skyline' },
    { x: -11.4, y: 13.7, z: -44, w: 8, h: 10, yaw: .29, bg: '#223a66', ink: '#a2c7ff', title: 'NY1', sub: 'MIDTOWN NEWS', design: 'rings' },
  ].map(s => billboard(root, s));
  sign(root, 'BROADWAY', '#28594c', [9.9, 4.64, -19.2], [2.6, .60, 1]);
  sign(root, 'W 47 ST', '#28594c', [11.4, 4.64, -19.45], [1.85, .6, 1], -.55);
  sign(root, 'POLICE LINE', '#2b4f83', [7.45, .79, -5.64], [2.0, .27, 1]);
  const lights = [
    ...cruiser(root, [-2.0, .08, -.40], .11, -.09),
    ...cruiser(root, [5.9, .12, -9.1], -1.18, .03),
  ];

  const people = [
    [-5.2, 1.45, -16.0, '#e8a661', .8], [-8.9, 2.14, -17.8, '#39476e', -.7],
    [-6.6, .96, -14.5, '#986b9b', -.5], [-10.2, 2.84, -19.55, '#ca7457', .9],
    [-8.4, .28, -11.9, '#688b8a', .6], [-11.1, .10, -9.5, '#85435a', -1.3],
    [7.25, .10, -8.0, '#2b446c', -.6], [9.7, .10, -6.1, '#344d78', -.9],
    [11.3, .10, -11.6, '#998477', 1.9], [12.6, .10, -10.9, '#4e7d9a', 1.45],
  ];
  for (const [i, [x, y, z, shirt, yaw]] of people.entries()) {
    const F = makeFigure({ shirt, skin: ['#a87762', '#c4947e', '#775543'][i % 3] });
    F.root.position.set(x, y, z); F.root.rotation.y = yaw; root.add(F.root);
    F.root.traverse(o => { if (o.isMesh) { o.castShadow = false; o.material.emissive.set(o.material.color); o.material.emissiveIntensity = .47; } });
    F.pelvis.rotation.x = .13; F.hipL.rotation.x = -.27; F.hipR.rotation.x = .24;
    F.kneeL.rotation.x = .34; F.kneeR.rotation.x = .21;
    F.shL.rotation.set(-.72 - i % 3 * .24, 0, .3);
    F.shR.rotation.set(-.42 - i % 2 * .38, 0, -.23);
    F.elL.rotation.x = -.75; F.elR.rotation.x = -.5;
  }
  return { screens, lights };
}
