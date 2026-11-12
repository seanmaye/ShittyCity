// Jersey Shore's buildings (data/jsh/buildings.json), each built to the kind of building it is
// rather than extruded flat: tools/jsh/build_jsh.py tags every footprint with a type and a
// best-fit rectangle turned to face its street (buildings.j: type, x, z, w, d, angle).
//
//  house   the borough's frame houses: front-gabled (the narrow deep lots), side-gabled, or a
//          hip-roofed foursquare with a dormer; two storeys, most with a front porch
//  brick   brick houses: Federal side gables with a chimney at each end, or low-hipped Italianates
//          with a bracketed cornice; three storeys on the downtown streets
//  ranch   one-storey ranches outside the borough, hipped or gabled, some with a garage door
//  cape    one-and-a-half-storey Cape Cods: a steep side gable with dormers
//  trailer single-wide mobile homes: long, low, on skirting
//  garage, shed  outbuildings with a door, under small gables
//  block   the brick storefront blocks of Allegheny and Main: their real footprints, with
//          shop windows, a sign band and a cornice
//  church  a steep front gable of coloured windows, with a steeple and spire at the front
//  school, store, mill, big  flat-roofed schools and stores, steel-sided mills (gabled when the
//          footprint is a plain rectangle), and big hip-roofed houses and apartment buildings
//
// Walls use the small-town facade textures in materials.js; roofs, porches, chimneys, cornices
// and steeples are plain vertex-coloured geometry. Both are merged in 700 m tiles.
import * as THREE from 'three';
import { pairs } from '../../data.js';
import { worldWinMat, WIN_W, WIN_H, M } from '../materials.js';
import { Builder, addPolygon, colorOf } from '../geometry.js';
import { groundBase } from './terrain.js';
import { hash } from '../buildings.js';

const TILE = 700;
const SHINGLE = ['#4a4c4f', '#3b3d40', '#5d5f60', '#6b5a4c', '#4f4238', '#3f4a42', '#6e6f6c', '#56493f', '#2f3134'];
const TIN = ['#8e2f25', '#3f5a45', '#9ea3a6', '#5b6b7a', '#7a2a24'];
const SLATE = ['#3d4249', '#474c55', '#4b4a52'];
const BRICK = ['#8e4b3b', '#9a5541', '#7d4436', '#a4604a', '#874f40', '#93594a', '#b06f55', '#9b5a48'];
const BLOCK = [...BRICK, ...BRICK, '#c9b597', '#d8d0bc', '#8f8d88', '#6f7d68', '#e2dccb'];
const SIDING = ['#e8e5dc', '#ece9e1', '#dcd6c4', '#d8cfae', '#c9cfc9', '#b8c3c6', '#c7c9b4', '#e2d6bd', '#d3c4a2', '#bfb9ad'];
const TRAILER = ['#ece9e1', '#e2d6bd', '#d3c4a2', '#c9cfc9', '#b8c3c6', '#a9b4a0'];
const STEEL = ['#c9ccc8', '#b9bcb8', '#d9d6cc', '#8e9a9e', '#a8a091', '#6f7f74', '#8a3a2e'];
const STEEL_ROOF = ['#9ea3a6', '#b6b9b8', '#7f8588', '#3f5a45', '#8e2f25'];
const FLAT = ['#4a4a4c', '#5c5d5f', '#77787a', '#a9aaa7'];
const TRIM = '#f2f0ea', DECK = '#8f8a84', GLASS = '#2b3034', CHIMNEY = '#7d4436';
const pick = (a, r) => a[Math.floor(r * a.length) % a.length];

/** One face (a convex polygon of world points), wound and lit to face the side `hint` points to.
 *  uvs: facade UVs per point (walls), or none (roof UV, plain parts). */
function face(b, pts, hint, col, uvs) {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    nx += (p[1] - q[1]) * (p[2] + q[2]); ny += (p[2] - q[2]) * (p[0] + q[0]); nz += (p[0] - q[0]) * (p[1] + q[1]);
  }
  const L = Math.hypot(nx, ny, nz); if (L < 1e-9) return;
  nx /= L; ny /= L; nz /= L;
  if (nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
  const c = colorOf(col), k = pts.map((p, i) => b.v(p[0], p[1], p[2], nx, ny, nz, uvs ? uvs[i][0] : -1, uvs ? uvs[i][1] : -1, c));
  const a = pts[0];
  for (let i = 1; i + 1 < pts.length; i++) {
    const p = pts[i], q = pts[i + 1], ux = p[0] - a[0], uy = p[1] - a[1], uz = p[2] - a[2], vx = q[0] - a[0], vy = q[1] - a[1], vz = q[2] - a[2];
    if ((uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * ny + (ux * vy - uy * vx) * nz >= 0) b.tri(k[0], k[i], k[i + 1]); else b.tri(k[0], k[i + 1], k[i]);
  }
}

/**
 * A building's local frame: x across its front (width w), z toward the street (depth d, the
 * front wall at z = +d/2), y up. P maps a local point to the world, N a local direction.
 */
function frame(cx, cz, ang) {
  const fx = Math.cos(ang), fz = Math.sin(ang), ax = -fz, az = fx;
  return {
    P: (x, y, z) => [cx + x * ax + z * fx, y, cz + x * az + z * fz],
    N: (x, y, z) => [x * ax + z * fx, y, x * az + z * fz],
  };
}

/** Everything one building adds, in its frame: wall (b: textured), and plain parts (t). */
function parts(F, wall, trim, base, u0) {
  const { P, N } = F;
  const wv = y => (y - base) / WIN_H;
  const o = {
    trim,
    /** a box of plain colour (local, axis-aligned), no bottom */
    box(x0, x1, z0, z1, y0, y1, col) {
      face(trim, [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], N(0, 0, 1), col);
      face(trim, [P(x0, y0, z0), P(x1, y0, z0), P(x1, y1, z0), P(x0, y1, z0)], N(0, 0, -1), col);
      face(trim, [P(x1, y0, z0), P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0)], N(1, 0, 0), col);
      face(trim, [P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0)], N(-1, 0, 0), col);
      face(trim, [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], N(0, 1, 0), col);
    },
    /** the four walls of a W x D box (half sizes) from y0 to y1, windows running round from u0 */
    walls(W, D, y0, y1, col) {
      const c = [[-W, -D], [W, -D], [W, D], [-W, D]];
      let u = u0;
      for (let i = 0; i < 4; i++) {
        const [ax, az] = c[i], [bx, bz] = c[(i + 1) % 4], L = Math.hypot(bx - ax, bz - az), u1 = u + L / WIN_W;
        face(wall, [P(ax, y0, az), P(bx, y0, bz), P(bx, y1, bz), P(ax, y1, az)], N(ax + bx, 0, az + bz), col,
          [[u, wv(y0)], [u1, wv(y0)], [u1, wv(y1)], [u, wv(y1)]]);
        u = Math.round(u1 * 32) / 32;   // start the next wall on a whole bay
      }
    },
    /** walls of a real footprint ring (world coordinates) around cx, cz, facing away from it
     *  (in = true: a courtyard, facing in toward it) */
    ringWalls(ring, cx, cz, y0, y1, col, inn = false) {
      let u = u0;
      for (let i = 0; i < ring.length; i++) {
        const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length], L = Math.hypot(bx - ax, bz - az); if (L < .05) continue;
        let nx = bz - az, nz = -(bx - ax);   // either side; pick the one away from the centre
        if ((nx * ((ax + bx) / 2 - cx) + nz * ((az + bz) / 2 - cz) < 0) !== inn) { nx = -nx; nz = -nz; }
        const u1 = u + L / WIN_W;
        face(wall, [[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]], [nx, 0, nz], col, [[u, wv(y0)], [u1, wv(y0)], [u1, wv(y1)], [u, wv(y1)]]);
        u = u1;
      }
    },
    /** a roof over a W x D box with its eaves at E: 'gable' or 'hip', ridge along 'x' or 'z',
     *  rising `pitch` per metre; gable ends are walled in (textured, so attics get a window) */
    roof(kind, along, W, D, E, pitch, col, wallCol, O = .4) {
      const R = along === 'x' ? W : D, S = along === 'x' ? D : W, H = S * pitch;
      const k = (r, s, y) => (along === 'x' ? P(r, y, s) : P(s, y, r));
      const kn = (r, s, y) => (along === 'x' ? N(r, y, s) : N(s, y, r));
      const ye = E - O * pitch, top = E + H;
      if (kind === 'hip') {
        const r = Math.max(0, R - S);
        for (const s of [1, -1]) {
          face(trim, [k(-R - O, s * (S + O), ye), k(R + O, s * (S + O), ye), k(r, 0, top), k(-r, 0, top)], kn(0, 1, s), col);
          face(trim, [k(s * (R + O), -S - O, ye), k(s * (R + O), S + O, ye), k(s * r, 0, top)], kn(s, 1, 0), col);
        }
        return top;
      }
      for (const s of [1, -1]) {
        face(trim, [k(-R - O, s * (S + O), ye), k(R + O, s * (S + O), ye), k(R + O, 0, top), k(-R - O, 0, top)], kn(0, 1, s), col);
        const uL = u0 + (s > 0 ? .25 : .5);
        face(wall, [k(s * R, -S, E), k(s * R, S, E), k(s * R, 0, top)], kn(s, 0, 0), wallCol,
          [[uL, wv(E)], [uL + 2 * S / WIN_W, wv(E)], [uL + S / WIN_W, wv(top)]]);
      }
      return top;
    },
    /** a front porch across [x0, x1], P deep, with posts, a rail and a shed roof */
    porch(x0, x1, D, Pd, roofCol) {
      const y0 = base - .4, deck = base + .6, rt = base + 3.2;
      o.box(x0, x1, D, D + Pd, y0, deck, DECK);
      const n = Math.max(2, Math.round((x1 - x0) / 2.6) + 1);
      for (let i = 0; i < n; i++) { const x = x0 + .12 + (x1 - x0 - .24) * i / (n - 1); o.box(x - .09, x + .09, D + Pd - .3, D + Pd - .12, deck, rt - .2, TRIM); }
      o.box(x0 + .1, x1 - .1, D + Pd - .25, D + Pd - .17, deck + .85, deck + .95, TRIM);
      face(trim, [P(x0 - .2, rt, D), P(x1 + .2, rt, D), P(x1 + .2, rt - .45, D + Pd + .2), P(x0 - .2, rt - .45, D + Pd + .2)], N(0, 1, .2), roofCol);
    },
    /** a gabled dormer on the +z roof slope of a side gable (ridge along x, half-span S) */
    dormer(x, S, E, pitch, roofCol, col) {
      const zf = S * .55, yr = E + (S - zf) * pitch, yt = Math.min(E + S * pitch - .5, yr + 1.5), dw = .85;
      if (yt < yr + .7) return;
      o.box(x - dw, x + dw, .3, zf, E, yt, col);
      face(trim, [P(x - .45, yr + .2, zf + .02), P(x + .45, yr + .2, zf + .02), P(x + .45, yt - .2, zf + .02), P(x - .45, yt - .2, zf + .02)], N(0, 0, 1), GLASS);
      const ap = yt + .6;
      for (const s of [1, -1]) face(trim, [P(x + s * (dw + .15), yt - .05, zf + .2), P(x + s * (dw + .15), yt - .05, .3), P(x, ap, .3), P(x, ap, zf + .2)], N(s, 1, 0), roofCol);
      face(trim, [P(x - dw, yt, zf), P(x + dw, yt, zf), P(x, ap, zf)], N(0, 0, 1), col);
    },
    chimney(x, z, top, col = CHIMNEY) { o.box(x - .35, x + .35, z - .35, z + .35, top - 2, top + .9, col); },
    /** a door on the front wall (z = D) */
    door(x, D, w, h, col) { face(trim, [P(x - w / 2, base, D + .04), P(x + w / 2, base, D + .04), P(x + w / 2, base + h, D + .04), P(x - w / 2, base + h, D + .04)], N(0, 0, 1), col); },
  };
  return o;
}

export function buildTown(scene, data) {
  const { b: B, j: J, jtypes: T, styles } = data;
  const tiles = new Map();
  const tile = (x, z, kind) => {
    const key = Math.floor(x / TILE) + ',' + Math.floor(z / TILE);
    let t = tiles.get(key); if (!t) tiles.set(key, t = { walls: new Map(), trim: new Builder({ color: true }) });
    let w = t.walls.get(kind); if (!w) t.walls.set(kind, w = new Builder({ uv: true, color: true }));
    return [w, t.trim];
  };
  for (let i = 0; i < B.length; i++) {
    const type = T[J[i * 6]], cx = J[i * 6 + 1] / 10, cz = J[i * 6 + 2] / 10, w = J[i * 6 + 3] / 10, d = J[i * 6 + 4] / 10, ang = J[i * 6 + 5] / 1000;
    const r = k => hash(i * 13 + k), W = w / 2, D = d / 2, F = frame(cx, cz, ang), h = B[i][0] / 10, style = B[i][1];
    const siding = style ? styles[style].color : pick(SIDING, r(1));
    const shingle = pick(SHINGLE, r(2)), u0 = Math.floor(r(3) * 32) / 32;
    const corners = [F.P(-W, 0, -D), F.P(W, 0, -D), F.P(W, 0, D), F.P(-W, 0, D)].map(p => [p[0], p[2]]);
    const base = groundBase(corners), y0 = base - .6;
    const at = kind => parts(F, ...tile(cx, cz, kind), base, u0);

    if (type === 'house' || type === 'brick' || type === 'big') {
      const brick = type === 'brick' || (type === 'big' && r(4) < .6), q = at(brick ? 'brickh' : 'clap');
      const col = brick ? pick(BRICK, r(5)) : siding;
      const storeys = type === 'big' ? 3 : type === 'brick' && W * D > 45 && r(6) < .4 ? 3 : 2;
      const E = base + .6 + storeys * 3.1;
      const roofCol = brick && r(7) < .25 ? pick(SLATE, r(8)) : !brick && r(7) < .15 ? pick(TIN, r(8)) : shingle;
      q.walls(W, D, y0, E, col);
      let top;
      if (type === 'big') {
        top = q.roof('hip', W > D ? 'x' : 'z', W, D, E, .45, roofCol, col);
        if (r(9) < .5) q.porch(-W * .8, W * .8, D, 2.4, roofCol);
      } else if (brick) {
        if (r(9) < .35) {   // Italianate: a low hip and a deep cornice under it
          q.box(-W - .25, W + .25, -D - .25, D + .25, E - .7, E, r(10) < .5 ? TRIM : '#5a4234');
          top = q.roof('hip', W > D ? 'x' : 'z', W, D, E, .28, roofCol, col, .6);
        } else {            // Federal: a side gable with a chimney at each end
          top = q.roof('gable', 'x', W, D, E, .55, roofCol, col, .25);
          for (const s of [1, -1]) q.chimney(s * (W - .4), 0, top, col);
        }
        if (r(11) < .3) q.porch(-W * .45, W * .45, D, 1.8, roofCol);
      } else {
        const v = r(9), square = Math.abs(w / d - 1) < .3;
        if (square && v > .55) {   // foursquare
          top = q.roof('hip', 'x', W, D, E, .5, roofCol, col);
          q.dormer(0, D, E, .5, roofCol, col);
        } else if (d > w * .95 && v < .6) {   // front gable, the long way back from the street
          top = q.roof('gable', 'z', W, D, E, .9 + r(12) * .25, roofCol, col, .35);
        } else {
          top = q.roof('gable', 'x', W, D, E, .65 + r(12) * .2, roofCol, col, .35);
        }
        if (r(13) < .6) q.chimney((r(14) - .5) * W, -D * .3, top);
        const pr = r(15);
        if (pr < .5) q.porch(-W + .1, W - .1, D, 2.3, roofCol);
        else if (pr < .75) q.porch(r(16) < .5 ? -W + .1 : 0, r(16) < .5 ? 0 : W - .1, D, 2.1, roofCol);
      }
    } else if (type === 'ranch') {
      const brick = r(4) < .25, q = at(brick ? 'brickh' : 'clap'), col = brick ? pick(BRICK, r(5)) : siding;
      const E = base + .4 + 2.9, along = W >= D ? 'x' : 'z';
      q.walls(W, D, y0, E, col);
      const top = q.roof(r(6) < .4 ? 'hip' : 'gable', along, W, D, E, .32, shingle, col, .5);
      if (r(7) < .4) q.chimney(W * .3, 0, top);
      if (r(8) < .35 && W > 5) q.door(W - 2, D, 2.6, 2.2, r(9) < .6 ? TRIM : '#7a6650');
    } else if (type === 'cape') {
      const q = at('clap'), E = base + .4 + 3, S = W >= D ? D : W;
      q.walls(W, D, y0, E, siding);
      const along = W >= D ? 'x' : 'z';
      const top = q.roof('gable', along, W, D, E, 1, shingle, siding, .3);
      if (along === 'x') { if (W > 4.5) { q.dormer(-W * .45, S, E, 1, shingle, siding); q.dormer(W * .45, S, E, 1, shingle, siding); } else q.dormer(0, S, E, 1, shingle, siding); }
      q.chimney(along === 'x' ? W - .5 : 0, along === 'x' ? 0 : -D + .5, top);
    } else if (type === 'trailer') {
      const q = at('clap'), col = pick(TRAILER, r(4)), E = base + .8 + 2.5;
      q.box(-W + .1, W - .1, -D + .1, D - .1, base - .3, base + .8, '#6d6a64');   // skirting
      q.walls(W, D, base + .75, E, col);
      q.roof('gable', W >= D ? 'x' : 'z', W, D, E, .12, r(5) < .5 ? '#c9ccc8' : shingle, col, .15);
    } else if (type === 'garage' || type === 'shed') {
      const q = at('plain'), shed = type === 'shed', E = base + (shed ? 2.2 : 2.8);
      q.walls(W, D, y0, E, siding);
      q.roof('gable', shed ? (W >= D ? 'x' : 'z') : 'z', W, D, E, shed ? .5 : .45, r(4) < .2 ? pick(TIN, r(5)) : shingle, siding, .25);
      if (shed) q.door(0, D, Math.min(1.1, w * .5), 1.9, '#5a4a3c');
      else for (let n = w > 6.4 ? 2 : 1, k = 0; k < n; k++) q.door((k - (n - 1) / 2) * (w / n), D, Math.min(2.6, w / n - .5), 2.2, r(6) < .6 ? TRIM : '#7a6650');
    } else if (type === 'church') {
      const q = at('church'), col = r(4) < .7 ? pick(BRICK, r(5)) : '#e6e2d8', roofCol = r(6) < .5 ? pick(SLATE, r(7)) : shingle;
      const E = base + 7.5;
      q.walls(W, D, y0, E, col);
      const top = q.roof('gable', 'z', W, D, E, 1, roofCol, col, .4);
      const tw = Math.min(4.6, w * .36), tz0 = D - tw * .6, tz1 = D + tw * .45, tt = top + 3;
      q.box(-tw / 2, tw / 2, tz0, tz1, y0, tt, col);   // the tower
      q.box(-tw / 2 - .15, tw / 2 + .15, tz0 - .15, tz1 + .15, tt, tt + .4, TRIM);
      const bt = tt + 3, bw = tw / 2 - .3;   // the belfry, its louvres dark
      q.box(-bw, bw, tz0 + .3, tz1 - .3, tt + .4, bt, col === '#e6e2d8' ? TRIM : col);
      const tm = (tz0 + tz1) / 2, hz = (tz1 - tz0) / 2 - .29;
      for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const P = (a, y) => F.P(nx ? nx * (bw + .01) : a, y, nz ? tm + nz * (hz + .01) : tm + a);
        face(q.trim, [P(-.5, tt + 1), P(.5, tt + 1), P(.5, bt - .4), P(-.5, bt - .4)], F.N(nx, 0, nz), '#2a2624');
      }
      const sp = bt + 8 + r(8) * 5, spire = r(9) < .6 ? pick(SLATE, r(10)) : TRIM;   // the spire
      const sx = bw + .1, sz = (tz1 - tz0) / 2 - .2;
      for (const [ax, az, bx, bz] of [[-1, 1, 1, 1], [1, 1, 1, -1], [1, -1, -1, -1], [-1, -1, -1, 1]])
        face(q.trim, [F.P(ax * sx, bt, tm + az * sz), F.P(bx * sx, bt, tm + bz * sz), F.P(0, sp, tm)], F.N(ax + bx, .3, az + bz), spire);
    } else if (type === 'mill' && B[i].length === 3) {
      // steel sheds: a plain rectangle gets a low gable, anything else its real outline, flat
      const ring = pairs(B[i][2]), area = Math.abs(ring.reduce((s, p, k) => { const q2 = ring[(k + 1) % ring.length]; return s + p[0] * q2[1] - q2[0] * p[1]; }, 0)) / 2;
      const col = pick(STEEL, r(4)), roofCol = pick(STEEL_ROOF, r(5));
      if (area / (w * d) > .9) {
        const q = at('metal'), E = base + Math.max(5, Math.min(10, h));
        q.walls(W, D, y0, E, col);
        q.roof('gable', W >= D ? 'x' : 'z', W, D, E, .14, roofCol, col, .5);
      } else flatTop(at('metal'), B[i], cx, cz, base, base + Math.max(5, Math.min(12, h)), col, pick(FLAT, r(6)), null);
    } else {
      // block, school, store, and mills with courtyards: their real outline with a flat roof
      let kind, col, top, cornice = null;
      if (type === 'block') { kind = 'block'; col = pick(BLOCK, r(4)); top = base + Math.max(7.6, Math.min(14, h)); cornice = r(5) < .55 ? '#e8e2d2' : r(5) < .8 ? '#4c3a30' : col; }
      else if (type === 'school') { kind = 'office'; col = pick(BRICK, r(4)); top = base + Math.max(7, Math.min(11, h)); cornice = '#cfc6b2'; }
      else if (type === 'store') { const brick = r(4) < .5; kind = brick ? 'block' : 'metal'; col = brick ? pick(BLOCK, r(5)) : pick(STEEL, r(5)); top = base + (brick ? 5 : 6); cornice = brick ? '#d8d0bc' : null; }
      else { kind = 'metal'; col = pick(STEEL, r(4)); top = base + Math.max(5, Math.min(12, h)); }
      flatTop(at(kind), B[i], cx, cz, base, top, col, pick(FLAT, r(7)), cornice);
    }
  }
  const meshes = [];
  const plain = M('#ffffff', { vertexColors: true, roughness: .8 });
  tiles.forEach(t => {
    t.walls.forEach((b, kind) => {
      if (!b.count) return;
      const m = new THREE.Mesh(b.geometry(), worldWinMat(kind));
      m.castShadow = m.receiveShadow = true; m.userData.draped = true; scene.add(m); meshes.push(m);
    });
    if (t.trim.count) {
      const m = new THREE.Mesh(t.trim.geometry(), plain);
      m.castShadow = m.receiveShadow = true; m.userData.draped = true; scene.add(m); meshes.push(m);
    }
  });
  return { meshes, count: B.length, nightOnly: [] };
}

/** A flat-roofed building on its real footprint: walls, a roof, and a cornice or parapet. */
function flatTop(q, rec, cx, cz, base, top, col, roofCol, cornice) {
  const rings = rec.slice(2).map(pairs), trim = q.trim;
  rings.forEach((ring, k) => {
    const [hx, hz] = k ? ring.reduce((s, p) => [s[0] + p[0] / ring.length, s[1] + p[1] / ring.length], [0, 0]) : [cx, cz];
    q.ringWalls(ring, hx, hz, base - .6, top, col, k > 0);
  });
  if (cornice) {
    const out = rings[0].map(([x, z]) => { const dx = x - cx, dz = z - cz, L = Math.hypot(dx, dz) || 1; return [x + dx / L * .35, z + dz / L * .35]; });
    for (let i = 0; i < out.length; i++) {
      const [ax, az] = out[i], [bx, bz] = out[(i + 1) % out.length];
      let nx = bz - az, nz = -(bx - ax); if (nx * ((ax + bx) / 2 - cx) + nz * ((az + bz) / 2 - cz) < 0) { nx = -nx; nz = -nz; }
      face(trim, [[ax, top - .7, az], [bx, top - .7, bz], [bx, top + .35, bz], [ax, top + .35, az]], [nx, 0, nz], cornice);
    }
    trim.c = colorOf(roofCol); addPolygon(trim, [out, ...rings.slice(1)], top + .35);
  } else { trim.c = colorOf(roofCol); addPolygon(trim, rings, top); }
}
