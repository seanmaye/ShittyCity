import * as THREE from 'three';

const sphere = new THREE.SphereGeometry(1, 20, 14);
const V = p => new THREE.Vector3(...p);
const fabric = (color, emissive, emissiveIntensity = .24) =>
  new THREE.MeshStandardMaterial({ color, roughness: .74, emissive, emissiveIntensity });

function mesh(parent, geometry, material, [x, y, z]) {
  const o = new THREE.Mesh(geometry, material);
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

function oval(parent, material, center, scale) {
  const o = mesh(parent, sphere, material, center);
  o.scale.set(...scale);
  return o;
}

function limb(parent, material, start, end, r0, r1, depth = 1) {
  const a = V(start), b = V(end), direction = b.clone().sub(a);
  const o = mesh(parent, new THREE.CylinderGeometry(r1, r0, direction.length(), 14), material, a.lerp(b, .5).toArray());
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  o.scale.z = depth;
  return o;
}

function lines(parent, material, paths) {
  const points = [];
  for (const path of paths) for (let i = 1; i < path.length; i++) points.push(...path[i - 1], ...path[i]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  parent.add(new THREE.LineSegments(g, material));
}

function webTexture(radial) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = '#241824'; ctx.lineWidth = 3;
  const columns = radial ? 16 : 8, rows = radial ? 11 : 5, step = 512 / columns;
  for (let i = 0; i < columns; i++) {
    const x = i * step;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke();
  }
  for (let j = 1; j <= rows; j++) {
    const y = j * 256 / (rows + 1);
    ctx.beginPath(); ctx.moveTo(0, y);
    for (let i = 0; i < columns; i++) ctx.quadraticCurveTo((i + .5) * step, y + 9, (i + 1) * step, y);
    ctx.stroke();
  }
  return new THREE.CanvasTexture(canvas);
}

function lens(head, side, material, scale, lift) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(.031, .004, .068, .036);
  shape.quadraticCurveTo(.08, .003, .065, -.027);
  shape.quadraticCurveTo(.029, -.048, 0, 0);
  const g = new THREE.ShapeGeometry(shape, 18);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = side * (.049 + (p.getX(i) - .036) * scale), y = .015 + p.getY(i) * scale;
    const z = .113 * Math.sqrt(1 - (x / .109) ** 2 - (y / .147) ** 2) + lift;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  mesh(head, g, material, [0, 0, 0]);
}

export function buildSpiderMan() {
  const root = new THREE.Group(), head = new THREE.Group();
  root.name = 'Spider-Man';
  const red = fabric('#c5283d', '#912135', .52), blue = fabric('#204b9a', '#203e85', .55);
  const mask = red.clone(), webbed = red.clone();
  mask.map = mask.emissiveMap = webTexture(true);
  webbed.map = webbed.emissiveMap = webTexture(false);
  const black = new THREE.MeshBasicMaterial({ color: '#131427', side: THREE.DoubleSide });
  const silver = new THREE.MeshBasicMaterial({ color: '#e5f7ff', side: THREE.DoubleSide });
  const emblem = new THREE.LineBasicMaterial({ color: '#161321' });
  const pelvis = [0, .61, -.08], neck = [0, 1.09, .18];
  oval(root, blue, pelvis, [.177, .153, .13]);
  limb(root, blue, pelvis, neck, .14, .223, .64);
  const chest = oval(root, webbed, [0, .91, .138], [.218, .255, .13]);
  chest.rotation.x = .48;
  limb(root, red, neck, [0, 1.20, .21], .065, .067);
  head.position.set(0, 1.265, .237); root.add(head);
  oval(head, mask, [0, 0, 0], [.109, .147, .113]);
  for (const side of [-1, 1]) {
    lens(head, side, black, 1.2, .01);
    lens(head, side, silver, .92, .016);
  }
  oval(root, black, [0, .945, .283], [.017, .035, .008]);
  const legs = [];
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    const y = .917 + .014 * i, reach = .048 + .006 * (i % 2);
    legs.push([[0, y, .286], [side * reach, y + .014, .284], [side * (reach + .011), y + (i < 2 ? -.035 : .044), .28]]);
  }
  lines(root, emblem, legs);

  // One knee is forward over the lightbar. The trailing foot braces on the roof.
  for (const [hip, knee, ankle] of [
    [[-.111, .60, -.058], [-.31, .405, .34], [-.26, .085, .11]],
    [[.111, .60, -.10], [.324, .28, -.13], [.27, .085, -.50]],
  ]) {
    oval(root, blue, knee, [.088, .087, .088]);
    limb(root, blue, hip, knee, .111, .085);
    limb(root, webbed, knee, ankle, .079, .055);
    oval(root, red, [ankle[0], .068, ankle[2] + .075], [.067, .063, .151]);
  }
  const hand = [.34, 1.062, .80];
  for (const [shoulder, elbow, wrist] of [
    [[.188, 1.05, .145], [.31, .91, .44], hand],
    [[-.185, 1.05, .137], [-.43, .78, -.055], [-.49, .60, -.295]],
  ]) {
    oval(root, red, shoulder, [.105, .104, .1]);
    limb(root, blue, shoulder, elbow, .089, .066);
    oval(root, webbed, elbow, [.069, .069, .069]);
    limb(root, webbed, elbow, wrist, .073, .047);
    oval(root, red, wrist, [.053, .039, .069]);
  }
  for (const x of [-.037, .034]) {
    limb(root, webbed, [hand[0] + x, hand[1], .82], [hand[0] + x, hand[1] + .02, .914], .016, .011);
  }
  return { root, head };
}

export function buildElectro() {
  const root = new THREE.Group(), head = new THREE.Group();
  root.name = 'Electro';
  const coat = fabric('#232c4a', '#293861', .7), lapel = fabric('#38445b', '#354367', .58);
  const hoodie = fabric('#515563', '#474960', .38), denim = fabric('#282b44', '#283450', .6);
  const boot = fabric('#202536', '#2a3854', .46);
  const skin = fabric('#2e83bd', '#377fc2', .9), lip = fabric('#294b8c', '#355b9f', .7);
  const eye = new THREE.MeshBasicMaterial({ color: '#e1fbff' });
  const veins = new THREE.LineBasicMaterial({ color: '#88d6ff', transparent: true, opacity: .76 });

  oval(root, denim, [0, .90, 0], [.197, .181, .131]);
  limb(root, coat, [0, .81, 0], [0, 1.45, 0], .198, .239, .65);
  oval(root, hoodie, [0, 1.23, .128], [.127, .246, .044]);
  for (const side of [-1, 1]) {
    limb(root, lapel, [side * .138, 1.43, .135], [side * .078, .89, .132], .04, .016);
    limb(root, hoodie, [side * .16, 1.40, -.11], [side * .08, 1.53, -.03], .079, .065);
    limb(root, lapel, [side * .10, 1.001, .147], [side * .165, 1.042, .119], .016, .017);
    const hip = [side * .102, .93, 0], knee = [side * .164, .51, .052 + side * .055], ankle = [side * .215, .12, -.039 + side * .088];
    limb(root, denim, hip, knee, .108, .081);
    oval(root, denim, knee, [.08, .098, .081]);
    limb(root, denim, knee, ankle, .081, .059);
    oval(root, boot, [ankle[0], .087, ankle[2] + .065], [.079, .078, .157]);
  }
  limb(root, skin, [0, 1.43, 0], [0, 1.61, 0], .071, .066);
  head.position.set(0, 1.66, .017); root.add(head);
  oval(head, skin, [0, .038, -.012], [.119, .151, .111]);
  oval(head, skin, [0, -.034, .017], [.098, .105, .093]);
  oval(head, skin, [0, .014, .102], [.031, .047, .044]);
  oval(head, lip, [0, -.058, .096], [.046, .012, .013]);
  for (const s of [-1, 1]) {
    oval(head, skin, [s * .115, .006, -.006], [.025, .043, .022]);
    oval(head, lip, [s * .047, .047, .089], [.041, .024, .021]);
    oval(head, eye, [s * .046, .045, .105], [.028, .011, .014]);
    lines(head, veins, [
      [[s * .024, .173, .045], [s * .052, .133, .069], [s * .043, .108, .091], [s * .076, .079, .083]],
      [[s * .051, .134, .07], [s * .085, .115, .065], [s * .107, .068, .047]],
      [[s * .108, .031, .052], [s * .09, .014, .085], [s * .105, -.018, .07], [s * .075, -.06, .081], [s * .062, -.098, .053]],
    ]);
  }
  const hands = [[-.62, 1.11, .27], [.65, 1.29, .17]];
  for (const [i, s] of [-1, 1].entries()) {
    const shoulder = [s * .21, 1.39, -.01], elbow = [s * .43, 1.11, .064], palm = hands[i];
    oval(root, coat, shoulder, [.119, .119, .112]);
    limb(root, coat, shoulder, elbow, .106, .076);
    oval(root, coat, elbow, [.078, .078, .078]);
    limb(root, coat, elbow, palm, .078, .047);
    oval(root, skin, palm, [.056, .045, .064]);
    for (let j = 0; j < 4; j++) {
      const a = [palm[0] + s * .034, palm[1] + (j - 1.5) * .024, palm[2] + .017];
      const b = [a[0] + s * (.057 + .024 * Math.sin(j)), a[1] + (j - 1.5) * .017, a[2] + .028];
      const c = [b[0] + s * .023, b[1] + .015, b[2] + .02];
      limb(root, skin, a, b, .014, .011); limb(root, skin, b, c, .011, .008);
    }
    limb(root, skin, palm, [palm[0] + s * .022, palm[1] + .065, palm[2] + .071], .022, .014);
  }
  return { root, head, hands: hands.map(V) };
}
