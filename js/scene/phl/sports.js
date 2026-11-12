// Proposal: the Schuylkill and Vine Street expressways become linear sports parks
// (tennis, basketball, five-a-side, volleyball) with a shuttle monorail overhead.
// Court positions come from data/phl/sports.json (tools/phl/proposal.py).
import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pairs } from '../../data.js';
import { M, litMats } from '../materials.js';
import { Builder } from '../geometry.js';
import { beam, piers, station, train, liftCurve } from './monorail.js';
import { seasonalGrass } from '../season.js';
export const H2 = 26; // above the riverfront loop (18 m) so the lines can cross

const PX = 12; // texture pixels per metre
const WHITE = '#f4f4ee';

function canvas(w, d, draw) {
  const c = document.createElement('canvas'); c.width = Math.round(w * PX); c.height = Math.round(d * PX);
  const g = c.getContext('2d'); g.setTransform(PX, 0, 0, PX, c.width / 2, c.height / 2);
  g.lineWidth = .12; g.strokeStyle = WHITE; g.lineJoin = 'miter';
  draw(g);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8; return t;
}
const rect = (g, x0, z0, x1, z1) => g.strokeRect(x0, z0, x1 - x0, z1 - z0);
const line = (g, x0, z0, x1, z1) => { g.beginPath(); g.moveTo(x0, z0); g.lineTo(x1, z1); g.stroke(); };
const arc = (g, x, z, r, a0, a1) => { g.beginPath(); g.arc(x, z, r, a0, a1); g.stroke(); };

// Surface markings drawn in metres from the court centre; x runs along the corridor.
const SURFACE = {
  tennis: (g, w, d) => {
    g.fillStyle = '#3f7d5c'; g.fillRect(-w / 2, -d / 2, w, d);
    g.fillStyle = '#2e6299'; g.fillRect(-11.885, -5.485, 23.77, 10.97);
    rect(g, -11.885, -5.485, 11.885, 5.485); line(g, -11.885, -4.115, 11.885, -4.115); line(g, -11.885, 4.115, 11.885, 4.115);
    line(g, -6.4, -4.115, -6.4, 4.115); line(g, 6.4, -4.115, 6.4, 4.115); line(g, -6.4, 0, 6.4, 0);
    line(g, -11.885, 0, -11.6, 0); line(g, 11.6, 0, 11.885, 0);
  },
  basketball: (g, w, d) => {
    g.fillStyle = '#59636b'; g.fillRect(-w / 2, -d / 2, w, d);
    g.fillStyle = '#c27a46'; g.fillRect(-14, -7.5, 28, 15);
    rect(g, -14, -7.5, 14, 7.5); line(g, 0, -7.5, 0, 7.5); arc(g, 0, 0, 1.8, 0, Math.PI * 2);
    for (const s of [-1, 1]) {
      g.fillStyle = '#a65d33'; g.fillRect(Math.min(s * 14, s * 8.2), -2.45, 5.8, 4.9);
      rect(g, Math.min(s * 14, s * 8.2), -2.45, Math.max(s * 14, s * 8.2), 2.45); arc(g, s * 8.2, 0, 1.8, 0, Math.PI * 2);
      const hx = s * 12.425, t0 = Math.asin(6.6 / 6.75), ex = hx - s * 6.75 * Math.cos(t0);
      line(g, s * 14, -6.6, ex, -6.6); line(g, s * 14, 6.6, ex, 6.6);
      if (s > 0) arc(g, hx, 0, 6.75, Math.PI - t0, Math.PI + t0); else arc(g, hx, 0, 6.75, -t0, t0);
    }
  },
  futsal: (g, w, d) => {
    g.fillStyle = '#3c6e45'; g.fillRect(-w / 2, -d / 2, w, d);
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#4c9a52' : '#56a55b'; g.fillRect(-20 + i * 5, -10, 5, 20); }
    rect(g, -20, -10, 20, 10); line(g, 0, -10, 0, 10); arc(g, 0, 0, 3, 0, Math.PI * 2);
    arc(g, -20, 0, 6, -Math.PI / 2, Math.PI / 2); arc(g, 20, 0, 6, Math.PI / 2, Math.PI * 1.5);
  },
  volleyball: (g, w, d) => {
    g.fillStyle = '#dcc28c'; g.fillRect(-w / 2, -d / 2, w, d);
    g.strokeStyle = '#2b6cb0'; g.lineWidth = .1;
    rect(g, -9, -4.5, 9, 4.5); line(g, -3, -4.5, -3, 4.5); line(g, 3, -4.5, 3, 4.5);
  },
  soccer: (g, w, d) => {
    g.fillStyle = '#3c6e45'; g.fillRect(-w / 2, -d / 2, w, d);
    for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#4c9a52' : '#56a55b'; g.fillRect(-32 + i * 4, -20, 4, 40); }
    rect(g, -32, -20, 32, 20); line(g, 0, -20, 0, 20); arc(g, 0, 0, 6, 0, Math.PI * 2);
    rect(g, -32, -8, -24, 8); rect(g, 24, -8, 32, 8);
  },
};

// Equipment in the court's local frame: [geometry, material key]
const box = (w, h, d, x, y, z) => { const b = new THREE.BoxGeometry(w, h, d); b.translate(x, y, z); return b; };
const cyl = (r, h, x, y, z) => { const c = new THREE.CylinderGeometry(r, r, h, 8); c.translate(x, y, z); return c; };
function floodlights(w, d, h = 11) {
  const out = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    out.push([cyl(.15, h, sx * (w / 2 - .4), h / 2, sz * (d / 2 - .4)), 'pole']);
    out.push([box(1.1, .35, .7, sx * (w / 2 - .8), h, sz * (d / 2 - .8)), 'lamp']);
  }
  return out;
}
const goal = (x, s, gw = 3, gh = 2) => [
  [box(.12, gh, .12, x, gh / 2, -gw / 2), 'white'], [box(.12, gh, .12, x, gh / 2, gw / 2), 'white'],
  [box(.12, .12, gw, x, gh, 0), 'white'], [box(1, .05, gw, x + s * .5, .03, 0), 'net'],
];
const EQUIP = {
  tennis: (w, d) => [
    [box(.06, 1.0, 12.8, 0, .5, 0), 'net'], [cyl(.06, 1.07, 0, .535, -6.4), 'pole'], [cyl(.06, 1.07, 0, .535, 6.4), 'pole'],
    [box(w, 3, .06, 0, 1.5, -d / 2), 'fence'], [box(w, 3, .06, 0, 1.5, d / 2), 'fence'],
    [box(.06, 3, d, -w / 2, 1.5, 0), 'fence'], [box(.06, 3, d, w / 2, 1.5, 0), 'fence'],
    ...floodlights(w - 1, d - 1),
  ],
  basketball: (w, d) => [-1, 1].flatMap(s => [
    [cyl(.1, 3.95, s * 15, 1.975, 0), 'pole'], [box(1.6, .1, .1, s * 14.2, 3.4, 0), 'pole'],
    [box(.05, 1.05, 1.8, s * 12.8, 3.42, 0), 'white'], [new THREE.TorusGeometry(.23, .02, 6, 16).rotateX(Math.PI / 2).translate(s * 12.425, 3.05, 0), 'rim'],
  ]).concat(floodlights(w, d, 9)),
  futsal: (w, d) => [...goal(-20, -1), ...goal(20, 1), ...floodlights(w, d)],
  volleyball: () => [[box(.04, 1, 9.5, 0, 1.93, 0), 'net'], [cyl(.06, 2.55, 0, 1.275, -5.2), 'pole'], [cyl(.06, 2.55, 0, 1.275, 5.2), 'pole']],
  soccer: (w, d) => [...goal(-32, -1, 5, 2), ...goal(32, 1, 5, 2), ...floodlights(w, d, 14)],
};

function materials() {
  const lamp = new THREE.MeshStandardMaterial({ color: '#e9e4d2', emissive: '#fff4d6', emissiveIntensity: 0 }); lamp.userData.lit = 1.4; litMats.push(lamp);
  return {
    pole: new THREE.MeshStandardMaterial({ color: '#5c646b', roughness: .6, metalness: .4 }),
    white: new THREE.MeshStandardMaterial({ color: '#f4f4ee', roughness: .6 }),
    rim: new THREE.MeshStandardMaterial({ color: '#e0582b', roughness: .5 }),
    net: new THREE.MeshStandardMaterial({ color: '#e8e8e8', transparent: true, opacity: .55, roughness: .9, side: THREE.DoubleSide }),
    fence: new THREE.MeshStandardMaterial({ color: '#2f4a3a', transparent: true, opacity: .32, roughness: .9, side: THREE.DoubleSide, depthWrite: false }),
    lamp,
  };
}

function buildCourts(scene, data) {
  const mats = materials(), dm = new THREE.Object3D(), boxes = [];
  const byType = data.types.map(() => []);
  for (const [ti, x, z, r] of data.courts) {
    byType[ti].push([x / 10, z / 10, r / 1000]);
    const t = data.types[ti]; boxes.push({ x: x / 10, z: z / 10, ry: r / 1000, w: t.w, d: t.d });
  }
  data.types.forEach((t, ti) => {
    const list = byType[ti]; if (!list.length) return;
    const add = (geo, mat, cast) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach(([x, z, ry], i) => { dm.position.set(x, 0, z); dm.rotation.set(0, ry, 0); dm.updateMatrix(); im.setMatrixAt(i, dm.matrix); });
      im.castShadow = cast; im.receiveShadow = true; scene.add(im);
    };
    const surf = new THREE.PlaneGeometry(t.w, t.d); surf.rotateX(-Math.PI / 2); surf.translate(0, .95, 0);
    add(surf, new THREE.MeshStandardMaterial({ map: canvas(t.w, t.d, g => SURFACE[t.name](g, t.w, t.d)), roughness: .9 }), false);
    const groups = {};
    for (const [geo, key] of EQUIP[t.name](t.w, t.d)) (groups[key] = groups[key] || []).push(geo.toNonIndexed());
    for (const [key, geos] of Object.entries(groups)) add(BufferGeometryUtils.mergeBufferGeometries(geos), mats[key], key !== 'fence' && key !== 'net');
  });
  return boxes;
}

/** Court footprints from data/phl/sports.json, and a point test against them. */
export function courtTest(data) {
  const boxes = data.courts.map(([ti, x, z, r]) => ({ x: x / 10, z: z / 10, ry: r / 1000, w: data.types[ti].w, d: data.types[ti].d }));
  return (x, z, pad = 1.5) => boxes.some(b => Math.abs(x - b.x) < 45 && Math.abs(z - b.z) < 45 && inBox(x, z, b, pad));
}

function inBox(x, z, b, pad) {
  const dx = x - b.x, dz = z - b.z, c = Math.cos(b.ry), s = Math.sin(b.ry);
  return Math.abs(dx * c - dz * s) <= b.w / 2 + pad && Math.abs(dx * s + dz * c) <= b.d / 2 + pad;
}

function segDist2(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L)) : 0;
  const ex = ax + t * dx - px, ez = az + t * dz - pz; return ex * ex + ez * ez;
}

/** Green corridor of varying width plus a promenade along one edge. */
function corridor(scene, route) {
  const pts = pairs(route.p), gb = new Builder(), pb = new Builder();
  const strip = (b, offFn, wFn, y) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1]; let dx = bx - ax, dz = bz - az; const L = Math.hypot(dx, dz); if (L < .01) continue;
      dx /= L; dz /= L; const nx = -dz, nz = dx;
      const oa = offFn(i), ob = offFn(i + 1), wa = wFn(i) / 2, wb = wFn(i + 1) / 2, s = b.count;
      b.v(ax + nx * (oa + wa) - dx, y, az + nz * (oa + wa) - dz, 0, 1, 0); b.v(ax + nx * (oa - wa) - dx, y, az + nz * (oa - wa) - dz, 0, 1, 0);
      b.v(bx + nx * (ob + wb) + dx, y, bz + nz * (ob + wb) + dz, 0, 1, 0); b.v(bx + nx * (ob - wb) + dx, y, bz + nz * (ob - wb) + dz, 0, 1, 0);
      b.tri(s, s + 2, s + 1); b.tri(s + 1, s + 2, s + 3);
    }
  };
  strip(gb, () => 0, i => route.a[i] + 8, 0);
  strip(pb, i => route.a[i] / 2 + 1.5, () => 3, 0);
  const g = new THREE.Mesh(gb.geometry(), seasonalGrass(M('#78a85c', { side: THREE.FrontSide }))); g.position.y = .34; g.receiveShadow = true;
  const p = new THREE.Mesh(pb.geometry(), M('#e2cfa4', { side: THREE.FrontSide })); p.position.y = .9; p.receiveShadow = true;
  scene.add(g, p);
}

/** Elevated shuttle over one corridor: beam, piers between the courts, stations, a train running end to end. */
function shuttle(scene, route, ctx) {
  const all = pairs(route.p), ctrl = all.filter((_, i) => i % 3 === 0 || i === all.length - 1);
  const curve = liftCurve(new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new THREE.Vector3(x, H2, z)), false, 'centripetal'), H2);
  const L = curve.getLength();
  beam(scene, curve, L);
  const clear = p => {
    if (ctx.courts.some(b => Math.abs(p.x - b.x) < 45 && Math.abs(p.z - b.z) < 45 && inBox(p.x, p.z, b, 1.5))) return false;
    const r = ctx.river.riverInfo(p.x, p.z); if (Math.abs(r.d) < r.w / 2 + 2) return false;
    if (ctx.bridgeSegs.some(b => segDist2(p.x, p.z, b[0], b[1], b[2], b[3]) < 12 * 12)) return false;
    for (const s of ctx.keep.get(Math.floor(p.x / 50) + ',' + Math.floor(p.z / 50)) || []) if (segDist2(p.x, p.z, s[0], s[1], s[2], s[3]) < (s[4] / 2 + 1.5) ** 2) return false;
    return true;
  };
  const spots = []; let last = -1e9;
  for (let s = 4; s < L - 4; s += 4) { if (s - last < 28) continue; const p = curve.getPointAt(s / L); if (clear(p)) { spots.push(p); last = s; } }
  piers(scene, spots, H2);
  const can = new THREE.MeshStandardMaterial({ color: '#1f9a8f', roughness: .6 }), plat = new THREE.MeshStandardMaterial({ color: '#bfc4c8' });
  const n = Math.max(2, Math.round(L / 1100) + 1);
  for (let k = 0; k < n; k++) station(scene, curve, Math.min(.97, Math.max(.03, k / (n - 1))), H2, can, plat);
  const { cars, trainWinMat, CAR, GAP } = train(scene, 3, '#1f9a8f');
  trainWinMat.userData.lit = .8; litMats.push(trainWinMat);
  const span = cars.length * (CAR + GAP), run = L - span - 40, V = 22, dwell = 8, Tr = run / V, P = 2 * (Tr + dwell);
  let t = Math.random() * P;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), camGoal = new THREE.Vector3(), lookGoal = new THREE.Vector3(), look = new THREE.Vector3();
  let wasRiding = false;
  return { curve, cars, update(dt, riding, camera) {
    t = (t + dt) % P;
    const ph = t < Tr ? t / Tr : t < Tr + dwell ? 1 : t < 2 * Tr + dwell ? 1 - (t - Tr - dwell) / Tr : 0;
    const sc = 20 + span / 2 + run * (1 - Math.cos(Math.PI * ph)) / 2;
    cars.forEach((c, i) => {
      const s = sc + (i - (cars.length - 1) / 2) * (CAR + GAP);
      curve.getPointAt(s / L, a); curve.getPointAt(Math.min(1, (s + 2) / L), b);
      c.position.set(a.x, a.y + 3.3, a.z); c.lookAt(b.x, b.y + 3.3, b.z);
    });
    if (!riding) { wasRiding = false; return; }
    // Facing angle: 0 = toward the far end, PI = back toward the start. It swings round
    // while the train waits at each terminus, so the view always faces the way it's going.
    const th = t < Tr ? 0 : t < Tr + dwell ? Math.PI * (1 - Math.cos(Math.PI * (t - Tr) / dwell)) / 2
      : t < 2 * Tr + dwell ? Math.PI : Math.PI + Math.PI * (1 - Math.cos(Math.PI * (t - 2 * Tr - dwell) / dwell)) / 2;
    const sCam = Math.max(1, Math.min(L - 1, sc + Math.cos(th) * (span / 2 + 3)));
    curve.getPointAt(sCam / L, a); const tg = curve.getTangentAt(sCam / L);
    camGoal.set(a.x, a.y + 5.2, a.z);
    const fx = tg.x * Math.cos(th) - tg.z * Math.sin(th), fz = tg.z * Math.cos(th) + tg.x * Math.sin(th);
    lookGoal.set(a.x + fx * 90, a.y + 3, a.z + fz * 90);
    if (!wasRiding) { camera.position.copy(camGoal); look.copy(lookGoal); wasRiding = true; }
    camera.position.lerp(camGoal, .3); look.lerp(lookGoal, .12); camera.lookAt(look);
  } };
}

export function buildSports(scene, data, river, bridgeSegs, groundLines) {
  const courts = buildCourts(scene, data);
  // surviving at-grade streets and rail that piers must not land on
  const keep = new Map();
  for (const l of groundLines) {
    if (l.x || l.b || l.k === 1) continue;
    const p = pairs(l.p);
    for (let i = 0; i < p.length - 1; i++) {
      const s = [p[i][0], p[i][1], p[i + 1][0], p[i + 1][1], l.w];
      // register in every 50 m cell the segment's box touches
      for (let x = Math.floor((Math.min(s[0], s[2]) - 10) / 50); x <= Math.floor((Math.max(s[0], s[2]) + 10) / 50); x++)
        for (let z = Math.floor((Math.min(s[1], s[3]) - 10) / 50); z <= Math.floor((Math.max(s[1], s[3]) + 10) / 50); z++) {
          const key = x + ',' + z; (keep.get(key) || keep.set(key, []).get(key)).push(s);
        }
    }
  }
  const ctx = { courts, river, bridgeSegs, keep };
  data.routes.forEach(r => corridor(scene, r));
  const updates = data.routes.map(r => shuttle(scene, r, ctx));
  const labels = data.routes.map(r => {
    const p = pairs(r.p), m = p[Math.floor(p.length / 2)];
    return { text: r.label, pos: new THREE.Vector3(m[0], H2 + 10, m[1]) };
  });
  const lines = data.routes.map(r => {
    const name = r.label.replace(' Sports Park', ' line');
    const hint = name.startsWith('Vine')
      ? 'You’re on the Vine Street line, 26 m above the courts that now fill the old I-676 trench through Center City. The train runs end to end and turns back at each terminus.'
      : 'You’re on the Schuylkill line, 26 m above the courts where I-76 used to run along the river. The train runs end to end and turns back at each terminus.';
    return { name, hint };
  });
  return { labels, lines, curves: updates.map(u => u.curve), trains: updates.map(u => u.cars), update: (dt, ride, camera) => updates.forEach((u, i) => u.update(dt, ride === i, camera)) };
}
