// Cinematic mode: hands-free fly-arounds of whatever city is loaded, made up as it goes, so it never
// shows the same shot twice. Nothing in here knows one city from another: the shots are made from
// what every city's scene already has, so a new city gets its own cinematic without any work.
//
//   - the city's "Go to" views (index.js `views`): the places its author chose to show off;
//   - its landmark labels (the named towers, stadiums and bridges), where they stand tall, and its
//     other named places;
//   - the tallest clusters of its skyline, and any built-up spot at all ("wander");
//   - its rail lines (and boat routes), flown along from above;
//   - the whole city, round the home view (the opening shot).
//
// Each shot is a slow camera move (orbit, push in, pull back, truck sideways, crane up, or a flight
// along a route) lasting a dozen seconds or so, opening and closing on a fade through black. It is
// the live city: the clock, the season and the day's speed stay as the viewer set them (the Time,
// Season and Speed sliders), so a running day turns to night under the tour. Before a move is
// used it is checked against a coarse height map of everything in the scene (the skyline: buildings,
// bridges, landmarks and hills, built the first time cinematic mode starts). The camera must stay
// clear above it all along the move, and the line of sight to the subject must stay open; a shot
// that fails, or that is too like one already shown, is thrown away and another made.
//
// index.js drives it: step(dt) each frame while it is on (the orbit controls are off meanwhile),
// and ui.js draws the letterbox, the fade and the caption from state.
import * as THREE from 'three';

const CELL = 50;                 // m: the skyline grid
const FADE = .9, BLACK = .35;    // s: each fade, and the hold in black between shots

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
/** mostly constant speed, easing only at the very ends (the fades hide those) */
const glide = t => t - .5 * Math.sin(2 * Math.PI * t) / (2 * Math.PI);

/**
 * scene, camera: the city's. views: its "Go to" presets ({ id, name, pos, target, when?, hour?,
 * cut?, arrive? }). home: { pos, target }. labels: [{ text, pos, layer?, section?, stn? }].
 * routes: [{ id, P: [{x, y, z}] }]. ground(x, z): the ground height. getDay(): the day of the year
 * (a view of something seasonal is left out of season). name: the city's name, for the captions.
 */
export function createCinematic({ scene, camera, views, home, labels = [], routes = [], vehicles = () => [], spots = [], ground = () => 0, getDay = () => 0, name = '' }) {
  let grid = null;   // { x0, z0, nx, nz, h: Float32Array } how far the highest thing in each cell stands above the ground

  // ---------------------------------------------------------------- the skyline
  function buildGrid() {
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3(), all = new THREE.Box3(), tmp = new THREE.Box3(), m = new THREE.Matrix4();
    const meshes = [];
    scene.traverse(o => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      meshes.push(o);
      box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      if (box.max.x - box.min.x < 60000 && box.max.z - box.min.z < 60000) all.union(box);   // (not the sky)
    });
    const x0 = Math.floor(all.min.x / CELL) * CELL, z0 = Math.floor(all.min.z / CELL) * CELL;
    const nx = Math.min(2400, Math.ceil((all.max.x - x0) / CELL) + 1), nz = Math.min(2400, Math.ceil((all.max.z - z0) / CELL) + 1);
    const h = new Float32Array(nx * nz);
    const stamp = (ax, az, bx, bz, y) => {   // the rectangle [ax..bx] x [az..bz] stands y above the ground
      const i0 = clamp(Math.floor((ax - x0) / CELL), 0, nx - 1), i1 = clamp(Math.floor((bx - x0) / CELL), 0, nx - 1);
      const j0 = clamp(Math.floor((az - z0) / CELL), 0, nz - 1), j1 = clamp(Math.floor((bz - z0) / CELL), 0, nz - 1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * nx + i; if (h[k] < y) h[k] = y; }
    };
    const v = new THREE.Vector3();
    for (const o of meshes) {
      const g = o.geometry;
      if (o.isInstancedMesh) {   // each instance by its box
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, m); if (m.elements[0] === 0 && m.elements[5] === 0 && m.elements[10] === 0) continue;   // hidden (scaled to nothing)
          tmp.copy(g.boundingBox).applyMatrix4(m.premultiply(o.matrixWorld));
          if (tmp.max.x - tmp.min.x > 3000 || tmp.max.z - tmp.min.z > 3000) continue;
          stamp(tmp.min.x, tmp.min.z, tmp.max.x, tmp.max.z, tmp.max.y - ground((tmp.min.x + tmp.max.x) / 2, (tmp.min.z + tmp.max.z) / 2));
        }
        continue;
      }
      box.copy(g.boundingBox).applyMatrix4(o.matrixWorld);
      if (box.max.x - box.min.x < 400 && box.max.z - box.min.z < 400) { stamp(box.min.x, box.min.z, box.max.x, box.max.z, box.max.y - ground((box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2)); continue; }
      if (box.max.x - box.min.x > 60000) continue;
      // a big merged mesh (a block of buildings, a bridge, the ground): vertex by vertex, every few
      const p = g.attributes.position, step = p.count > 400000 ? 3 : 1, e = o.matrixWorld.elements;
      for (let i = 0; i < p.count; i += step) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        v.set(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
        const k = clamp(Math.floor((v.z - z0) / CELL), 0, nz - 1) * nx + clamp(Math.floor((v.x - x0) / CELL), 0, nx - 1), up = v.y - ground(v.x, v.z);   // (the ground itself: about 0)
        if (h[k] < up) h[k] = up;
      }
    }
    grid = { x0, z0, nx, nz, h };
  }
  /** how far the highest thing within `r` metres of (x, z) stands above the ground */
  function rise(x, z, r = CELL) {
    const g = grid, i0 = clamp(Math.floor((x - r - g.x0) / CELL), 0, g.nx - 1), i1 = clamp(Math.floor((x + r - g.x0) / CELL), 0, g.nx - 1);
    const j0 = clamp(Math.floor((z - r - g.z0) / CELL), 0, g.nz - 1), j1 = clamp(Math.floor((z + r - g.z0) / CELL), 0, g.nz - 1);
    let y = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) y = Math.max(y, g.h[j * g.nx + i]);
    return y;
  }
  /** the top of the highest thing within `r` metres of (x, z): the ground, where nothing stands */
  function top(x, z, r = CELL) {
    const y = rise(x, z, r);
    let gy = ground(x, z);
    if (r > 0) for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) gy = Math.max(gy, ground(x + dx, z + dz));   // (a hillside)
    return gy + y;
  }

  // ---------------------------------------------------------------- moves
  // A move is at(u, pos, tgt): u from 0 to 1 along the shot; it writes the camera's position and aim.
  const Y = new THREE.Vector3(0, 1, 0);
  /** around the subject: `arc` radians, rising by `rise` of the height on the way */
  const orbit = (tgt, off, arc, rise = .12) => (u, p, t) => { t.copy(tgt); p.copy(off).applyAxisAngle(Y, (u - .5) * arc); p.y *= 1 + rise * (u - .5) * 2; p.add(tgt); };
  /** toward (k < 1) or away from (k > 1) the subject, drifting `yaw` radians round it */
  const dolly = (tgt, off, k0, k1, yaw = 0) => (u, p, t) => { t.copy(tgt); p.copy(off).multiplyScalar(k0 + (k1 - k0) * u).applyAxisAngle(Y, (u - .5) * yaw).add(tgt); };
  /** sideways past the subject, the aim travelling with the camera */
  const truck = (tgt, off, span) => {
    const side = new THREE.Vector3(-off.z, 0, off.x).normalize().multiplyScalar(span);
    return (u, p, t) => { const s = u - .5; t.copy(tgt).addScaledVector(side, s * .7); p.copy(tgt).add(off).addScaledVector(side, s); };
  };
  /** rising from low to high (the subject's top comes up into view), aim lifting a little */
  const crane = (tgt, off, lift) => (u, p, t) => { t.copy(tgt); t.y += lift * .25 * u; p.copy(off).applyAxisAngle(Y, (u - .5) * .25); p.y = off.y * (.55 + .7 * u); p.add(tgt); };

  /** is the move clear: camera above everything, subject in sight? */
  const pa = new THREE.Vector3(), ta = new THREE.Vector3(), q = new THREE.Vector3();
  function clear(at, margin, sight = true) {
    for (let s = 0; s <= 12; s++) {
      at(s / 12, pa, ta);
      if (pa.y < top(pa.x, pa.z, 60) + margin) return false;
      if (!sight) continue;
      const d = pa.distanceTo(ta);
      for (let k = 1; k < 16; k++) {   // the line of sight, up to the last stretch before the subject
        const f = k / 16 * Math.max(0, 1 - Math.min(.35, 120 / Math.max(d, 1)));
        q.lerpVectors(pa, ta, f);
        if (q.y < top(q.x, q.z, 0) + 2) return false;
      }
    }
    return true;
  }

  // ---------------------------------------------------------------- the shots
  // Shots are made one at a time, for ever. Each picks a kind of subject (weighted, never the same
  // kind twice running), the subject of that kind shot least so far, then a fresh camera for it:
  // which side, how far, how high, which move and how long. It is kept only if it is clear (clear()
  // above) and unlike every shot so far, so no shot is ever seen twice: no subject again from within
  // 40° and about the same distance, no stretch of a line flown again, and nothing near the last few
  // shots' subjects. The "wander" kind picks any built-up spot in the city, so there is always more.
  const rnd = (a, b) => a + Math.random() * (b - a);
  const KINDS = ['orbit', 'orbit-', 'push', 'pull', 'truck', 'crane'];
  function move(kind, tgt, o, d) {
    return kind === 'orbit' ? orbit(tgt, o, rnd(.45, .8)) : kind === 'orbit-' ? orbit(tgt, o, -rnd(.45, .8))
      : kind === 'push' ? dolly(tgt, o, rnd(1.15, 1.3), rnd(.8, .9), rnd(-.18, .18)) : kind === 'pull' ? dolly(tgt, o, rnd(.75, .85), rnd(1.18, 1.32), rnd(-.18, .18))
      : kind === 'truck' ? truck(tgt, o, Math.min(600, d * rnd(.35, .55))) : crane(tgt, o, Math.min(160, d * .2));
  }
  const NAMED = labels.filter(l => l.pos && !l.layer && !l.section && !l.stn && l.text);
  function nameNear(x, z, max = 800) {
    let best = null, bd = max;
    for (const l of NAMED) { const d = Math.hypot(l.pos.x - x, l.pos.z - z); if (d < bd) { bd = d; best = l.text; } }
    return best;
  }
  /** everything worth a shot, by kind (made once, after the skyline grid) */
  let S = null, built = null;
  function subjects() {
    const sub = { city: [{ id: 'home', title: name, tgt: home.target.clone(), off: home.pos.clone().sub(home.target), uses: 0 }], view: [], landmark: [], place: [], skyline: [], route: [], eat: [] };
    for (const v of views) {
      if (v.arrive || v.cut !== undefined || v.id === 'home') continue;   // (standing somewhere, or a cut-away)
      const off = v.pos.clone().sub(v.target);
      if (off.length() > 12000) continue;   // the map-like whole-city view
      sub.view.push({ id: 'v:' + v.id, title: v.name, tgt: v.target.clone(), off, when: v.when, uses: 0 });
    }
    // labelled landmarks where they rise above their surroundings; the other names as places
    for (const l of NAMED) {
      const h = rise(l.pos.x, l.pos.z, 60), g = ground(l.pos.x, l.pos.z);
      if (h > 35) { if (!sub.landmark.some(o => Math.hypot(o.tgt.x - l.pos.x, o.tgt.z - l.pos.z) < 250)) sub.landmark.push({ id: 'l:' + l.text, title: l.text, tgt: new THREE.Vector3(l.pos.x, g + h * .55, l.pos.z), h, uses: 0 }); }
      else if (!sub.place.some(o => Math.hypot(o.tgt.x - l.pos.x, o.tgt.z - l.pos.z) < 300)) sub.place.push({ id: 'p:' + l.text, title: l.text, tgt: new THREE.Vector3(l.pos.x, g + 6, l.pos.z), h: 12, uses: 0 });
    }
    // the skyline's tall clusters, and every built-up cell (for "wander")
    const g = grid, cells = [], tall = [];
    for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) {
      const h = g.h[j * g.nx + i]; if (h < 25 || h > 700) continue;   // (25 m: buildings, not a stand of trees)
      tall.push(j * g.nx + i); if (h > 40 && (i + j) % 2 === 0) cells.push({ i, j, h });
    }
    built = Int32Array.from(tall);
    cells.sort((p, o) => o.h - p.h);
    for (const c of cells) {
      if (sub.skyline.length >= 40) break;
      const x = g.x0 + (c.i + .5) * CELL, z = g.z0 + (c.j + .5) * CELL;
      if (sub.skyline.some(o => Math.hypot(o.tgt.x - x, o.tgt.z - z) < 450)) continue;
      sub.skyline.push({ id: 's:' + c.i + ',' + c.j, title: nameNear(x, z) || 'The skyline', tgt: new THREE.Vector3(x, ground(x, z) + c.h * .5, z), h: c.h, uses: 0 });
    }
    // every line (rail, monorail, boat) at least 500 m long; its length sets how long a stretch of it can be
    for (const rt of routes) {
      if (!rt.P || rt.P.length < 2) continue;
      let L = 0; for (let i = 1; i < rt.P.length; i++) L += Math.hypot(rt.P[i].x - rt.P[i - 1].x, rt.P[i].z - rt.P[i - 1].z);
      if (L >= 500) sub.route.push({ id: 'r:' + rt.id, raw: rt.id, title: rt.name || '', P: rt.P, L, uses: 0 });
    }
    spots.forEach((o, i) => sub.eat.push({ id: 'e:' + i, title: o.title, sub: o.sub, tgt: o.target.clone(), front: o.front.clone(), street: o.street.clone(), moves: EAT_MOVES.slice(), uses: 0 }));
    return sub;
  }
  const WEIGHT = { view: 3, landmark: 2.5, eat: 2.2, wander: 2, route: 1.5, skyline: 1.2, place: 1, city: .3 };
  /** a random spot: a subject made on the spot. A city's are among its taller buildings; a small
   *  town (few of those) wanders its streets instead, within a few hundred metres of its names and
   *  views (the height map can't tell a house from a tree, and the forest on the mountain is dull) */
  function wander() {
    if (built.length < 400) {
      const anchors = [...NAMED.map(l => l.pos), ...views.filter(v => !v.arrive && v.cut === undefined).map(v => v.target)]; if (!anchors.length) return null;
      const p = anchors[Math.floor(Math.random() * anchors.length)], a = rnd(0, Math.PI * 2), r = rnd(0, 600), x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r;
      return { id: 'w', title: nameNear(x, z, 900) || '', tgt: new THREE.Vector3(x, ground(x, z) + 6, z), h: Math.max(12, rise(x, z, 60)), place: true, uses: 0 };
    }
    const g = grid; let k = -1;
    for (let n = 0; n < 3; n++) { const c = built[Math.floor(Math.random() * built.length)]; if (k < 0 || g.h[c] > g.h[k]) k = c; }   // the tallest of three: buildings worth a look
    const i = k % g.nx, j = Math.floor(k / g.nx);
    const x = g.x0 + (i + .5) * CELL, z = g.z0 + (j + .5) * CELL, h = Math.max(15, rise(x, z, 80));
    return { id: 'w:' + k, title: nameNear(x, z, 1500) || '', tgt: new THREE.Vector3(x, ground(x, z) + h * .45, z), h, uses: 0 };
  }

  // what has been shot: { x, z, az, d } for a subject, { route, x, z } for a stretch of line
  const done = [], recent = [];
  const angle = (a, b) => Math.abs(((a - b) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
  const seenShot = (x, z, az, d) => done.some(o => o.az !== undefined && Math.hypot(o.x - x, o.z - z) < Math.max(80, d * .15) && angle(o.az, az) < .7 && Math.abs(Math.log(o.d / d)) < .4);
  const nearRecent = (x, z) => recent.some(o => Math.hypot(o.x - x, o.z - z) < 400);

  /** one try at a shot of `kind`: a shot, or null */
  function attempt(kind, first, relaxed) {
    if (kind === 'route') return routeShot();
    if (kind === 'eat') return eatShot(relaxed);
    let subj;
    if (kind === 'wander') subj = wander();
    else {
      const day = getDay(), ok = S[kind].filter(o => (o.fails || 0) < 40 && !(o.when && (day < o.when.days[0] || day > o.when.days[1])));   // (out of season: the Season slider)
      if (!ok.length) return null;
      const least = Math.min(...ok.map(o => o.uses)), pool = ok.filter(o => o.uses === least);
      subj = pool[Math.floor(Math.random() * pool.length)];
    }
    if (!subj || (!first && !relaxed && nearRecent(subj.tgt.x, subj.tgt.z))) return null;
    // a fresh camera for it: a few goes at a side, distance and height no shot of it has had yet
    const tgt = subj.tgt;
    let off, kinds, sight, close, d, az;
    for (let k = 0; ; k++) {
      ({ off, kinds, sight, close } = aim(kind, subj, first)); d = off.length(); az = Math.atan2(off.x, off.z);
      if (!seenShot(tgt.x, tgt.z, az, d)) break;
      if (k >= 8) { subj.fails = (subj.fails || 0) + 1; return null; }
    }
    const at = close ? dolly(tgt, off, rnd(1.02, 1.08), rnd(.92, .97), rnd(-.08, .08)) : move(kinds[Math.floor(Math.random() * kinds.length)], tgt, off, d);
    if (!close && !clear(at, Math.max(6, Math.min(40, d * .04)), sight)) return null;
    return { title: subj.title, kind, subj, at, dur: d > 1500 ? rnd(15, 18) : d > 300 ? rnd(13, 16) : rnd(11, 14), mark: { x: tgt.x, z: tgt.z, az, d } };
  }
  /** where the camera stands for a shot of subj: its offset from the subject, the moves it may make */
  function aim(kind, subj, first) {
    let off, kinds = KINDS, sight = true, close = false;
    if (kind === 'city') {   // the whole city: towers may cross the line of sight, the camera just stays clear of them
      off = subj.off.clone().multiplyScalar(rnd(1, 1.6)).applyAxisAngle(Y, first ? rnd(-.3, .3) : rnd(-Math.PI, Math.PI)); off.y *= rnd(.9, 1.6);
      kinds = ['orbit', 'orbit-', 'pull', 'push']; sight = false;
    } else if (kind === 'view') {
      close = subj.off.length() < 140;   // a street, a stall: too fine for the skyline grid, so barely leave the author's framing
      off = subj.off.clone().applyAxisAngle(Y, close ? rnd(-.12, .12) : rnd(-1.1, 1.1)).multiplyScalar(close ? rnd(.95, 1.1) : rnd(.8, 1.35));
      if (!close) off.y *= rnd(.8, 1.6);
    } else {
      const h = subj.h, dist = kind === 'place' || subj.place ? rnd(220, 480) : (220 + h * 2.6) * rnd(.7, 1.5), el = rnd(.12, .6), a = rnd(0, Math.PI * 2);
      off = new THREE.Vector3(Math.sin(a) * dist, (subj.place ? 40 : h * .5) + dist * Math.tan(el), Math.cos(a) * dist);
      if (kind === 'landmark') kinds = ['orbit', 'orbit-', 'crane', 'truck', 'pull'];
    }
    return { off, kinds, sight, close };
  }
  /** At street level, in front of a spot (a starred restaurant's shop front): too fine for the skyline
   *  grid, so the camera only moves within the street, from the two places the city found clear (its
   *  eye-level view in front, and its view from up the street). Seven moves each, each made once:
   *  push in from up the street, pull back from the door, slide along the front either way, rise up
   *  the facade, arc round either way. */
  const EAT_MOVES = ['push', 'pull', 'slide+', 'slide-', 'rise', 'arc+', 'arc-'];
  function eatShot(relaxed) {
    const ok = S.eat.filter(o => o.moves.length);
    if (!ok.length) return null;
    const least = Math.min(...ok.map(o => o.uses)), pool = ok.filter(o => o.uses === least), sp = pool[Math.floor(Math.random() * pool.length)];
    if (!relaxed && nearRecent(sp.tgt.x, sp.tgt.z)) return null;
    const mv = sp.moves[Math.floor(Math.random() * sp.moves.length)];
    const tgt = sp.tgt, F = sp.front, St = sp.street;
    const n = new THREE.Vector3(F.x - tgt.x, 0, F.z - tgt.z), D = n.length(); n.normalize();   // out from the shop front, and how far the clear view stands
    const side = new THREE.Vector3(-n.z, 0, n.x), eye = F.y - tgt.y;
    let at;
    if (mv === 'push' || mv === 'pull') {   // between up the street and the door
      const a = St.clone(), b = F.clone().lerp(St, rnd(.05, .3)), [p0, p1] = mv === 'push' ? [a, b] : [b, a], aim = tgt.clone(); aim.y += rnd(0, 1.5);
      at = (u, p, t) => { p.lerpVectors(p0, p1, u); t.copy(aim); };
    } else if (mv === 'slide+' || mv === 'slide-') {   // along the front, at the clear distance
      const s = rnd(3, 6) * (mv === 'slide+' ? 1 : -1), back = D * rnd(1, 1.4), h = rnd(1.7, 3.5);
      at = (u, p, t) => { const k = u - .5; p.copy(tgt).addScaledVector(n, back).addScaledVector(side, k * s * 2); p.y = tgt.y + eye - 2.1 + h; t.copy(tgt).addScaledVector(side, k * s * .6); };
    } else if (mv === 'rise') {   // up the facade: the shop front, then the building over it
      const back = D * rnd(1.1, 1.5), off = rnd(-2, 2), top = rnd(10, 18);
      at = (u, p, t) => { p.copy(tgt).addScaledVector(n, back).addScaledVector(side, off); p.y = tgt.y + 1.8 + (top - 1.8) * u; t.copy(tgt); t.y += (p.y - tgt.y) * .45; };   // (the aim rises too: the facade stays in frame)
    } else {   // a slow arc round the front, staying in the street
      const r = D * rnd(1.1, 1.5), arc = rnd(.3, .5) * (mv === 'arc+' ? 1 : -1), h = rnd(2, 4);
      at = (u, p, t) => { const a = (u - .5) * arc; p.copy(tgt).addScaledVector(n, r * Math.cos(a)).addScaledVector(side, r * Math.sin(a)); p.y = tgt.y + h; t.copy(tgt); };
    }
    return { title: sp.title, sub: sp.sub, kind: 'eat', subj: sp, at, dur: rnd(11, 14), take: () => sp.moves.splice(sp.moves.indexOf(mv), 1), mark: { eat: sp.id, x: tgt.x, z: tgt.z } };
  }
  /** A line: one of its trains (or trolleys, monorails, boats) moving along it, the camera going with
   *  it. Styles: chase (behind and above), lead (ahead, looking back at it coming), side (alongside),
   *  high (well back and up, the line ahead of it), pass (a fixed spot down the line it goes by).
   *  For our own trains, where the car will be over the shot is known (vehicles' at(t)): it must stay
   *  above ground the whole way, and the camera clear with the car in sight all along. Cars moved by
   *  another module (the monorails, the boats) are judged from where they are now, with room to spare.
   *  Never the same stretch of a line twice; the least-flown line first. */
  const STYLES = ['chase', 'lead', 'side', 'high', 'pass'];
  const diag = {};   // why line shots were turned down, by reason (api.cinematic.diag, for poking at)
  const fv = new THREE.Vector3(), rv = new THREE.Vector3(), cp = new THREE.Vector3(), ct = new THREE.Vector3(), fut = new THREE.Vector3();
  function frame(style, o, car, f, r, outP, outT) {   // where the camera wants to be for a car at car, heading f (flat), r to its right
    const q = o.q;
    if (style === 'chase') { outP.copy(car).addScaledVector(f, -q.back).addScaledVector(r, q.side); outT.copy(car).addScaledVector(f, q.ahead); }
    else if (style === 'lead') { outP.copy(car).addScaledVector(f, q.back).addScaledVector(r, q.side); outT.copy(car).addScaledVector(f, -4); }
    else if (style === 'side') { outP.copy(car).addScaledVector(r, q.side).addScaledVector(f, q.ahead * .3); outT.copy(car).addScaledVector(f, 6); }
    else if (style === 'high') { outP.copy(car).addScaledVector(f, -q.back * 2.2).addScaledVector(r, q.side * 2); outT.copy(car).addScaledVector(f, q.ahead * 1.8); }
    outP.y = ground(outP.x, outP.z) + o.H; outT.y = car.y + 2;
  }
  function routeShot() {
    // the least-flown line, leaving out one resting after failing again and again (its trains all in
    // tunnels just now, nowhere built up, or that stretch flown): it mustn't hold up every other line,
    // and it gets another go once its trains have moved on
    const list = S.route.filter(o => !(o.rest > state.n)); if (!list.length) return null;
    // (turns, not shots: a line whose turn came to nothing goes to the back like any other)
    const least = Math.min(...list.map(o => o.turns || 0)), pool = list.filter(o => (o.turns || 0) === least), rt = pool[Math.floor(Math.random() * pool.length)];
    rt.turns = (rt.turns || 0) + 1;
    // its cars that are out in the open now (not in a tunnel)
    const cars = vehicles(rt.raw).filter(c => !c.hidden() && (!c.at || c.at(0, fut).h > -.5));
    let why = cars.length ? null : 'no cars out';
    // a dozen goes: a car of it and a way of filming it
    for (let n = 0; n < 12 && cars.length; n++) {
      const r = tryCar(rt, cars[Math.floor(Math.random() * cars.length)], STYLES[Math.floor(Math.random() * STYLES.length)]);
      if (typeof r === 'string') { diag[r] = (diag[r] || 0) + 1; why = why || r; continue; }
      rt.fails = 0;
      return r;
    }
    rt.fails = (rt.fails || 0) + 1; if (why) diag['line: ' + why] = (diag['line: ' + why] || 0) + 1;
    if (rt.fails >= 5) { rt.rest = state.n + 15; rt.fails = 0; }   // (a rest of 15 shots)
    return null;
  }
  /** one car of a line filmed one way: the shot, or why not */
  function tryCar(rt, car, style) {
    const dur = rnd(12, 16), x0 = car.pos.x, z0 = car.pos.z;
    if (done.some(o => o.route === rt.id && Math.hypot(o.x - x0, o.z - z0) < 600)) return 'flown';
    if (nearRecent(x0, z0)) return 'recent';
    // where it will be: samples over the shot (our own trains), else straight on from here at its
    // speed (monorails and boats, which never go underground)
    const path = [];
    for (let k = 0; k <= 12; k++) {
      const t = dur * k / 12, p = new THREE.Vector3();
      if (car.at) { car.at(t, p); if (p.h < -.5) return 'underground'; }
      else p.copy(car.pos).addScaledVector(fv.set(car.dir.x, 0, car.dir.z).normalize(), (car.speed || 8) * t);
      path.push(p);
    }
    // not across bare ground where a city has no footprints: something built or planted near most of
    // it (the river for a boat)
    if (!rt.raw.startsWith('boat:') && path.filter(p => rise(p.x, p.z, 300) > 8).length < path.length * .4) return 'bare';
    const q = { back: rnd(18, 40), side: rnd(-14, 14), ahead: rnd(15, 40) };
    if (style === 'side') q.side = rnd(22, 40) * (Math.random() < .5 ? 1 : -1);
    // one height above the ground for the whole shot, clear of whatever the camera passes over
    const want = style === 'high' ? rnd(55, 110) : rnd(7, 22);
    const o = { q, H: 0 }, heading = (k, out) => { const a = path[Math.max(0, k - 1)], b = path[Math.min(12, k + 1)]; return out.set(b.x - a.x, 0, b.z - a.z).normalize(); };
    const passAt = new THREE.Vector3();
    if (style === 'pass') {   // a spot beside the line, about two-thirds of the way along
      heading(8, fv); rv.set(-fv.z, 0, fv.x);
      passAt.copy(path[8]).addScaledVector(rv, rnd(16, 32) * (Math.random() < .5 ? 1 : -1)).addScaledVector(fv, rnd(10, 30));
    }
    const camAt = (k, outP, outT) => {
      if (style === 'pass') { outP.copy(passAt); outP.y = ground(outP.x, outP.z) + o.H; outT.copy(path[k]); outT.y += 2; return; }
      heading(k, fv); rv.set(-fv.z, 0, fv.x); frame(style, o, path[k], fv, rv, outP, outT);
    };
    let H = want;
    const lift = () => { for (let k = 0; k <= 12; k++) { camAt(k, cp, ct); H = Math.max(H, top(cp.x, cp.z, 25) - ground(cp.x, cp.z) + 4); } };
    lift();
    if (H > want + 40 && style !== 'high') return 'canyon';   // (buried in a street canyon: this style won't do here)
    // the higher the camera has to be, the farther off it stands, so it looks along the car, not down on its roof
    if (H > want) { const k = Math.max(1, (H * 1.3 + 10) / q.back); q.back *= k; q.ahead *= Math.min(2, k); if (style === 'side') q.side *= Math.max(1, (H * 1.1 + 10) / Math.abs(q.side)); lift(); }
    o.H = H;
    // the car in sight all the way: up to the last 60 m before it (the skyline grid's cells are 50 m,
    // so nearer than that a street-level car looks walled in by the buildings along its street)
    for (let k = 0; k <= 12; k++) {
      camAt(k, cp, ct);
      const d = cp.distanceTo(ct), stop = Math.max(0, 1 - 60 / Math.max(d, 1));
      for (let j = 1; j < 10; j++) { fut.lerpVectors(cp, ct, j / 10 * stop); if (fut.y < top(fut.x, fut.z, 0) + 1.5) return 'sight'; }
    }
    // the shot: the live car, the camera easing after it (no jolt on a curve)
    const sm = { p: new THREE.Vector3(), t: new THREE.Vector3(), f: new THREE.Vector3(), on: false };
    const at = (u, p, t, dt = 0) => {
      fv.set(car.dir.x, 0, car.dir.z); if (fv.lengthSq() < 1e-6) fv.copy(sm.f); fv.normalize();
      if (!sm.on) sm.f.copy(fv); else sm.f.lerp(fv, 1 - Math.exp(-dt * 2)).normalize();
      rv.set(-sm.f.z, 0, sm.f.x);
      if (style === 'pass') { cp.copy(passAt); cp.y = ground(cp.x, cp.z) + o.H; ct.copy(car.pos); ct.y += 2; }
      else frame(style, o, car.pos, sm.f, rv, cp, ct);
      if (!sm.on) { sm.p.copy(cp); sm.t.copy(ct); sm.on = true; }
      else { sm.p.lerp(cp, 1 - Math.exp(-dt * 2.5)); sm.t.lerp(ct, 1 - Math.exp(-dt * 5)); }
      p.copy(sm.p); t.copy(sm.t);
    };
    return { title: rt.title || nameNear(x0, z0, 2000) || name, kind: 'route', subj: rt, at, dur, live: true, style, mark: { route: rt.id, x: x0, z: z0, style } };
  }
  let lastKind = null;
  /** the next shot, never one seen before (first: the opening shot, of the whole city) */
  function make(first) {
    if (!S) S = subjects();
    for (let n = 0; n < 400; n++) {
      const relaxed = n >= 150;   // (a small place, long into the tour: near a recent one, or under a recent name, will do; never a shot already seen)
      let kind = 'city';
      if (!first || n > 30) {
        const kinds = Object.keys(WEIGHT).filter(k => (relaxed || k !== lastKind) && (k === 'wander' || S[k].length));
        if (!kinds.length) return null;
        let w = Math.random() * kinds.reduce((s, k) => s + WEIGHT[k], 0); kind = kinds.find(k => (w -= WEIGHT[k]) < 0) || kinds[0];
      }
      const s = relaxed && n % 2 ? attempt('wander', false, true) : attempt(kind, first, relaxed);
      if (!s || (!relaxed && s.title && recent.some(o => o.title === s.title))) continue;   // (nor the same name on screen again soon)
      s.mark.title = s.title; if (s.take) s.take(); s.subj.uses++; lastKind = s.kind; done.push(s.mark); recent.push(s.mark); if (recent.length > 4) recent.shift();
      return s;
    }
    return null;
  }

  // ---------------------------------------------------------------- running
  let on = false, shot = null, t = 0, phase = 'in';
  const state = { fade: 1, title: '', sub: '', shotT: 0, n: 0 };
  function next() {
    const s = make(state.n === 0);
    if (!s) return false;
    shot = s; t = 0; phase = 'in';
    state.n++; state.title = s.title || ''; state.sub = s.sub || (s.kind === 'city' ? '' : name); state.shotT = 0;
    return true;
  }
  function start() {
    if (on) return true;
    if (!grid) buildGrid();
    on = true; state.n = 0;
    if (!next()) { on = false; return false; }
    state.fade = 1;
    return true;
  }
  function stop() {
    if (!on) return null;
    on = false; shot = null; state.fade = 0; state.title = '';
    return true;
  }
  const P = new THREE.Vector3(), T = new THREE.Vector3();
  /** each frame while on: moves the camera; returns the subject it's looking at (for the orbit controls) */
  function step(dt) {
    if (!on || !shot) return null;
    t += dt; state.shotT = t;
    const D = shot.dur;
    if (phase === 'in') { state.fade = 1 - smooth(t / FADE); if (t > D - FADE) phase = 'out'; }
    if (phase === 'out') { state.fade = smooth((t - (D - FADE)) / FADE); if (t >= D + BLACK && next()) return step(0); }
    shot.at(shot.live ? clamp(t / D, 0, 1) : glide(clamp(t / D, 0, 1)), P, T, dt);   // (a live shot follows its vehicle, eased by dt)
    // never through the ground (the grid catches the rest when the move is planned)
    P.y = Math.max(P.y, ground(P.x, P.z) + 4);
    camera.position.copy(P); camera.up.set(0, 1, 0); camera.lookAt(T);
    return T;
  }
  return { start, stop, step, on: () => on, state, shots: done, diag, top: (x, z, r) => (grid ? top(x, z, r) : null) };   // (shots, top: for poking at from the console)
}
