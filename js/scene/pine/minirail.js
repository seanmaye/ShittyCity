// The 1938 Pine St Kitchen's mini monorails: three toy-sized lines built with the shared
// monorail (js/scene/monorail.js) inside a group scaled down to SCALE, so its city-sized beam,
// cars and stations come out a few inches big. Kitchen units are inches (x east, z south, y up).
// All three hang out of the way, the cars slung under the beam:
//  - Countertop Express: back and forth just off the counter edge, from the drawer stack beside
//    the stove round the corner and along the dishwasher and the sink, hung from the counter
//  - Island Shuttle: back and forth round the island's free end, hung from its counter edge
//  - Upper Cabinet Skyway: a loop round the room over the upper cabinets, hung from the ceiling
// One train per line: two cars with see-through windows and a chef inside (white jacket, red
// neckerchief, toque), who waves when you look at him, and between them a flatbed carrying the
// line's load strapped down (a whisk, a baguette, a cheese and a rolling pin). The cars can be boarded like the cities'
// monorails: slots and fleet go to the shared ride system (subway.js registerFleet), whose
// monorail cabin is shrunk to fit and whose passenger is a chef too. highlight(renderer) draws
// the lines in their colours.
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { buildMonorail } from '../monorail.js';

const SCALE = .35;                    // inches per monorail unit
const UNDER_COUNTER = 34.6, CEILING = 108;
const L = v => v / SCALE;             // inches -> monorail units

/** a path through corner points [x, z] (inches) at height y, corners rounded by r: a loop when closed */
function path(corners, y, r, closed) {
  const out = [], n = corners.length;
  for (let i = 0; i < n; i++) {
    const end = !closed && (i === 0 || i === n - 1);
    if (end) { out.push(corners[i]); continue; }
    const [px, pz] = corners[(i + n - 1) % n], [cx, cz] = corners[i], [nx, nz] = corners[(i + 1) % n];
    const a = Math.hypot(cx - px, cz - pz), b = Math.hypot(nx - cx, nz - cz), k = Math.min(r, a / 2, b / 2);
    out.push([cx - (cx - px) / a * k, cz - (cz - pz) / a * k], [cx + (nx - cx) / b * k, cz + (nz - cz) / b * k]);
  }
  return out.map(([x, z]) => [L(x), L(y), L(z)]);
}

// a counter's edge is 1.5 in proud of its cabinets; the lines run 1.1 in outside it
const LINES = [
  {
    id: 'counter', name: 'Countertop Express', color: '#d6452f', y: 33.2, hang: UNDER_COUNTER, shuttle: true, r: 5, cargo: 'whisk',
    corners: [[81, 26.6], [101.4, 26.6], [101.4, 113]],
    stations: [{ name: 'Coffee Corner', at: [87, 26.6] }, { name: 'Dishwasher Dock', at: [101.4, 47] }, { name: 'Sink Street', at: [101.4, 80] }],
  },
  {
    id: 'island', name: 'Island Shuttle', color: '#2f9a5a', y: 33.2, hang: UNDER_COUNTER, shuttle: true, r: 8, cargo: 'baguette',
    corners: [[70.9, 132], [70.9, 70.9], [31.6, 70.9], [31.6, 132]],
    stations: [{ name: 'Back Door', at: [70.9, 124] }, { name: 'Fruit Bowl', at: [51, 70.9] }, { name: 'Stool Stop', at: [31.6, 112] }],
  },
  {
    id: 'sky', name: 'Upper Cabinet Skyway', color: '#2d6fc0', y: 101, hang: CEILING, shuttle: false, r: 9, cargo: 'cheese',
    corners: [[7, 7], [121, 7], [121, 133], [7, 133]],
    stations: [{ name: 'Fridge Top', at: [18, 7] }, { name: 'Window Bay', at: [121, 78] }, { name: 'Back Door', at: [40, 133] }],
  },
];

// ---- the chef: an original little figure in monorail units (a car is 3.1 wide, 3 tall)
const CHEF = (() => {
  const m = c => new THREE.MeshStandardMaterial({ color: c, roughness: .7 });
  return { coat: m('#f4f2ee'), skin: m('#e2b48c'), scarf: m('#c8312b'), dark: m('#2a2420'), hat: m('#ffffff') };
})();
/** { root, head, arm }: the arm is his right, which waves */
function chef() {
  const g = new THREE.Group(), add = (geo, mat, x, y, z, to = g) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); to.add(o); return o; };
  add(new THREE.CylinderGeometry(.55, .7, 1.2, 12), CHEF.coat, 0, -.55, 0);                // the jacket (seated)
  for (const s of [-1, 1]) for (const y of [-.25, -.6]) add(new THREE.SphereGeometry(.06, 6, 4), CHEF.dark, s * .2, y, .6);   // double row of buttons
  add(new THREE.TorusGeometry(.3, .09, 6, 14), CHEF.scarf, 0, .08, 0).rotation.x = Math.PI / 2;   // neckerchief
  const head = new THREE.Group(); head.position.set(0, .38, 0); g.add(head);
  add(new THREE.SphereGeometry(.36, 14, 10), CHEF.skin, 0, 0, 0, head);
  for (const s of [-1, 1]) add(new THREE.SphereGeometry(.05, 6, 4), CHEF.dark, s * .13, .05, .32, head);   // eyes
  add(new THREE.CylinderGeometry(.34, .34, .22, 14), CHEF.hat, 0, .36, 0, head);              // the toque: band
  const puff = add(new THREE.SphereGeometry(.42, 14, 10), CHEF.hat, 0, .62, 0, head); puff.scale.set(1, .62, 1);   // and its puffed top
  for (const a of [0, 2.1, 4.2]) add(new THREE.SphereGeometry(.22, 10, 8), CHEF.hat, Math.cos(a) * .26, .7, Math.sin(a) * .26, head);
  for (const sx of [1, -1]) {   // arms: shoulder -> upper arm -> forearm; the right (-x, as he faces +z) waves
    const up = new THREE.Group(); up.position.set(sx * .62, -.1, 0); g.add(up);
    add(new THREE.CylinderGeometry(.13, .13, .55, 8), CHEF.coat, 0, -.27, 0, up);
    const fore = new THREE.Group(); fore.position.y = -.52; up.add(fore);
    add(new THREE.CylinderGeometry(.11, .11, .45, 8), CHEF.coat, 0, -.22, 0, fore);
    add(new THREE.SphereGeometry(.12, 8, 6), CHEF.skin, 0, -.48, 0, fore);
    up.rotation.x = -.5; fore.rotation.x = -1;
    if (sx < 0) g.userData.arm = { up, fore };
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = false; });
  return { root: g, head, arm: g.userData.arm, w: 0, t: 0 };
}
/** wave when the camera looks at his head from close by (the rule the cities' passengers follow) */
const _hp = new THREE.Vector3(), _cd = new THREE.Vector3(), _cl = new THREE.Vector3();
function wave(P, dt, camera) {
  P.t += dt;
  P.head.getWorldPosition(_hp); camera.getWorldDirection(_cd);
  const to = _hp.sub(camera.position), d = to.length();
  const seen = P.root.parent.visible && d < 40 && to.dot(_cd) / d > Math.cos(30 * Math.PI / 180);
  P.w += ((seen ? 1 : 0) - P.w) * Math.min(1, dt * (seen ? 5 : 2.5));
  const w = P.w * P.w * (3 - 2 * P.w);
  P.arm.up.rotation.set(-.5 * (1 - w), 0, -2.3 * w);
  P.arm.fore.rotation.set(-1 * (1 - w), 0, w * (-.9 + .45 * Math.sin(P.t * 9)));
  _cl.copy(camera.position); P.root.worldToLocal(_cl);
  P.head.rotation.y = Math.max(-1, Math.min(1, Math.atan2(_cl.x, _cl.z + .1))) * w;
}

// ---- what each line's flatbed carries, strapped to the deck (monorail units: deck top at y -.9,
// the deck 3.1 wide and 13.8 long, z along the car)
const CARGO = (() => {
  const m = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .6 }, o));
  return { steel: m('#c9ccd0', { metalness: .85, roughness: .25 }), handle: m('#2b2b2b'), crust: m('#c98a3e', { roughness: .85 }), score: m('#e8c27a', { roughness: .9 }),
    cheese: m('#f2c14e', { roughness: .7 }), rind: m('#d9962b'), wood: m('#b07a45', { roughness: .8 }), strap: m('#7a1f24', { roughness: .9 }), buckle: m('#c9b37a', { metalness: .8, roughness: .3 }) };
})();
function cargo(kind) {
  const g = new THREE.Group(), add = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); g.add(o); return o; };
  let h = 1;   // how high the load stands above the deck, for the straps
  if (kind === 'whisk') {
    // a big balloon whisk lying along the deck: handle aft, wire loops forward
    add(new THREE.CylinderGeometry(.24, .2, 4.2, 12), CARGO.handle, 0, -.5, -3.4).rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(.27, .27, .35, 12), CARGO.steel, 0, -.5, -1.2).rotation.x = Math.PI / 2;
    for (let k = 0; k < 6; k++) {
      const w = add(new THREE.TorusGeometry(.75, .045, 6, 28), CARGO.steel, 0, -.5 + .0, 1.4);
      w.geometry.scale(3.4 / 1.5, 1, 1); w.rotation.set(k * Math.PI / 6, Math.PI / 2, 0, 'YXZ');   // loops round the long axis, which then lies along the car
    }
    h = .95;
  } else if (kind === 'baguette') {
    // a long loaf with its scoring marks
    const loaf = add(new THREE.CapsuleGeometry(.6, 8.6, 6, 14), CARGO.crust, 0, -.38, 0); loaf.rotation.x = Math.PI / 2; loaf.scale.set(1, 1, .82);
    for (let k = -2; k <= 2; k++) { const c = add(new THREE.BoxGeometry(.2, .06, 1.1), CARGO.score, 0, .1, k * 1.7); c.rotation.y = .5; }
    h = .95;
  } else {
    // a wheel of cheese with a wedge cut out, and a rolling pin beside it
    add(new THREE.CylinderGeometry(1.25, 1.25, 1, 28, 1, false, .5, Math.PI * 2 - 1), CARGO.cheese, 0, -.4, 2.4);
    add(new THREE.CylinderGeometry(1.27, 1.27, .08, 28, 1, false, .5, Math.PI * 2 - 1), CARGO.rind, 0, .1, 2.4);
    const pin = add(new THREE.CylinderGeometry(.42, .42, 4.4, 16), CARGO.wood, 0, -.48, -2.6); pin.rotation.x = Math.PI / 2;
    for (const z of [-5.25, .05]) { const k = add(new THREE.CylinderGeometry(.16, .16, 1.3, 10), CARGO.wood, 0, -.48, z); k.rotation.x = Math.PI / 2; }
    h = 1.15;
  }
  // two straps over the load, side rail to side rail, each with a buckle
  for (const z of [-2.6, 2.6]) {
    const s = add(new THREE.TorusGeometry(1, .07, 6, 20, Math.PI), CARGO.strap, 0, -.9, z); s.scale.set(1.45, h + .05, 1.6);
    add(new THREE.BoxGeometry(.3, .26, .3), CARGO.buckle, 1.2, -.3, z);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = false; });
  return g;
}

/** a station's name board, beside the platform */
function nameBoard(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 64); g.fillStyle = color; g.fillRect(0, 0, 256, 12);
  g.fillStyle = '#1d2b36'; g.font = '700 30px Archivo,"Segoe UI",Arial,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 30; while (size > 12 && g.measureText(text).width > 236) { size--; g.font = `700 ${size}px Archivo,"Segoe UI",Arial,sans-serif`; }
  g.fillText(text, 128, 39);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
  return new THREE.Mesh(new THREE.PlaneGeometry(6.5, 1.6), new THREE.MeshStandardMaterial({ map: t, roughness: .6, side: THREE.DoubleSide }));
}

/** scene: the kitchen's scene. Returns { lines: [{ id, name, color, stations }], slots, fleet, update(dt, camera), highlight(renderer) } */
export function buildMiniRail(scene) {
  const root = new THREE.Group(); root.name = 'minirail'; root.scale.setScalar(SCALE); scene.add(root);
  const lines = [], riders = [];
  for (const spec of LINES) {
    const g = new THREE.Group(); root.add(g);
    const route = {
      id: spec.id, name: spec.name, color: spec.color, closed: !spec.shuttle, shuttle: spec.shuttle, suspended: true,
      path: path(spec.corners, spec.y, spec.r, !spec.shuttle),
      cars: 3, carLength: 13.8, carGap: .9, trainSpacing: 1e9, seeThrough: true, bodyColor: '#f7f5f0',   // one train
      flatbed: 1, cargo: car => car.add(cargo(spec.cargo)),   // its middle car carries the line's load
      supportInterval: spec.hang === CEILING ? 40 : 24,
      stations: spec.stations.map(s => ({ name: s.name, position: [L(s.at[0]), L(spec.y), L(s.at[1])], length: 13 })),
      rider: car => { const c = chef(); c.root.position.set(0, -.1, 0); car.add(c.root); riders.push(c); },
    };
    const net = buildMonorail(g, { height: L(spec.y), speed: 15, routes: [route] }, () => L(spec.hang));
    const r = net.routes[0];
    if (!r) continue;
    // name boards beside each station, on the outer side
    for (const s of net.stations) {
      const b = nameBoard(s.name, spec.color), t = r.curve.getTangentAt(s.u);
      b.position.copy(s.position).add(new THREE.Vector3(t.z, 0, -t.x).multiplyScalar(-7.5)).add(new THREE.Vector3(0, -2.4, 0));
      b.rotation.y = Math.atan2(t.x, t.z) + Math.PI / 2; g.add(b);
    }
    lines.push({ id: spec.id, name: spec.name, color: spec.color, stations: net.stations.map(s => s.name), net, route: r });
  }

  // every car can be boarded through the shared ride system, like the cities' monorails: a slot
  // reports where its car is and how far along its line (for the next-stop sign and the diagram).
  // A shuttle's run is out and back (its unfolded length is twice the line's); the loop's is once round.
  const slots = [], wrapL = (v, n) => ((v % n) + n) % n;
  for (const l of lines) {
    const r = l.route, len = r.length, out = r.shuttle, RL = out ? 2 * len : len;
    const fold = v => { const m = wrapL(v, RL); return out ? (m <= len ? m / len : (RL - m) / len) : m / len; };
    const stops = l.net.stations.flatMap(st => (out ? [{ s: st.u * len, t: st.name }, { s: RL - st.u * len, t: st.name }] : [{ s: st.u * len, t: st.name }])).sort((a, b) => a.s - b.s);
    const run = { L: RL, stops, at: (v, o = new THREE.Vector3()) => r.curve.getPointAt(Math.min(1, fold(v)), o),
      strip: { back: out, out: len, fold, u: v => wrapL(v, RL), stops: l.net.stations.map(st => ({ t: st.name, f: st.u })).sort((a, b) => a.f - b.f) } };
    r.trains.forEach((t, k) => t.cars.forEach((car, c) => {
      if (c === 1) return;   // the flatbed: nothing to sit in
      const sl = {
        line: 'kmono:' + l.id, lineName: l.name, led: l.name, color: l.color, k, c, run, s: 0,
        pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1), q: new THREE.Quaternion(),
        sync() {
          car.getWorldPosition(this.pos); this.pos.y -= 1.6 * SCALE; this.q.copy(car.quaternion); this.dir.set(0, 0, 1).applyQuaternion(this.q);
          const a = car.userData.along || 0; this.s = out && car.userData.back ? RL - a : a;
        },
        onBoard(on) { car.visible = !on; },
      };
      sl.sync(); slots.push(sl);
    }));
  }
  // the cabin is the cities' monorail cabin, shrunk to the toy cars; its passenger is a chef
  const toque = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: .35, roughness: .8 });
  const fleet = {
    car: 13.8 * SCALE, scale: SCALE, pickY: 1.6 * SCALE,   // (a slot sits 1.6 units below its car's middle)
    dress(person) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(.105, .105, .07, 16), toque); band.position.y = .14;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(.135, 16, 10), toque); puff.position.y = .24; puff.scale.set(1, .7, 1);
      person.head.add(band, puff);
      for (const a of [0, 2.1, 4.2]) { const b = new THREE.Mesh(new THREE.SphereGeometry(.07, 10, 8), toque); b.position.set(Math.cos(a) * .08, .27, Math.sin(a) * .08); person.head.add(b); }
      // and a white jacket in place of the shirt (the cabin's colours live in emissive)
      person.root.traverse(o => { if (o.isMesh && o.material.emissive && o.material.emissive.getHexString() === '4f7a3a') o.material = toque; });
    },
  };

  return {
    lines, slots, fleet,
    update(dt, camera) {
      for (const l of lines) l.net.update(dt);
      if (camera) for (const c of riders) wave(c, dt, camera);
    },
    /** each line drawn bright in its colour on top of everything, like "Show transit lines": { set(on), get() } */
    highlight(renderer) {
      const group = new THREE.Group(); group.visible = false; scene.add(group);
      const mats = [], size = new THREE.Vector2();
      for (const l of lines) {
        const pos = [];
        for (const p of l.route.curve.getSpacedPoints(300)) pos.push(p.x * SCALE, p.y * SCALE + .8, p.z * SCALE);
        const g = new LineGeometry(); g.setPositions(pos);
        const m = new LineMaterial({ color: new THREE.Color(l.color).getHex(), linewidth: 5, transparent: true, opacity: .95, depthTest: false });
        mats.push(m);
        const line = new Line2(g, m); line.computeLineDistances(); line.renderOrder = 20; line.frustumCulled = false; group.add(line);
      }
      const resize = () => { renderer.getSize(size); mats.forEach(m => m.resolution.set(size.x, size.y)); };
      window.addEventListener('resize', resize); resize();
      return { set: on => { group.visible = !!on; return group.visible; }, get: () => group.visible };
    },
  };
}
