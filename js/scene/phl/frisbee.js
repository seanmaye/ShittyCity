// A pickup ultimate frisbee game on the Belmont & Edgley cricket ground in West Fairmount Park
// (OSM "Edgley Ultimate Fields", data/city_landmarks.json -> fields). Seven a side, light
// shirts against dark: the offence works the disc up the field, cutters break for open space,
// defenders mark them; a catch in the end zone scores, a dropped pass turns it over.
import * as THREE from 'three';
import { makeFigure, pose } from './people.js';
import { pairs } from '../../data.js';
import { Builder, addPolygon } from '../geometry.js';

const LEN = 100, WID = 37, EZ = 18;   // regulation field: 64 m playing field plus two 18 m end zones

export function buildFrisbee(scene, f) {
  const g = new THREE.Group(); g.position.set(f.x, 0, f.z); g.rotation.y = f.ry; scene.add(g);
  // the mown grass of the whole ground, from its real outline
  const ob = new Builder(); addPolygon(ob, [pairs(f.outline)], .42);
  const lawn = new THREE.Mesh(ob.geometry(), new THREE.MeshStandardMaterial({ color: '#6aa451', roughness: 1 })); lawn.receiveShadow = true; scene.add(lawn);
  // the field: chalk lines on the grass, and the cricket square beside it
  const chalk = new THREE.MeshStandardMaterial({ color: '#f4f4ef', roughness: 1 });
  const line = (x, z, w, d) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), chalk); m.rotation.x = -Math.PI / 2; m.position.set(x, .45, z); g.add(m); };
  line(0, -WID / 2, LEN, .15); line(0, WID / 2, LEN, .15);
  for (const x of [-LEN / 2, -LEN / 2 + EZ, LEN / 2 - EZ, LEN / 2]) line(x, 0, .15, WID);
  const off = Math.min(f.d / 2 - 12, WID / 2 + 22);
  const sq = new THREE.Mesh(new THREE.PlaneGeometry(22, 3.2), new THREE.MeshStandardMaterial({ color: '#c9b48a', roughness: 1 }));
  sq.rotation.x = -Math.PI / 2; sq.position.set(0, .44, off); g.add(sq);
  for (const x of [-10.06, 10.06]) {   // stumps at each end of the pitch
    for (const z of [-.11, 0, .11]) { const s = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .71, 5), chalk); s.position.set(x, .8, off + z); g.add(s); }
  }

  const disc = new THREE.Mesh(new THREE.CylinderGeometry(.135, .12, .03, 16), new THREE.MeshStandardMaterial({ color: '#f2f04a', roughness: .5 }));
  disc.castShadow = true; g.add(disc);
  const SKIN = ['#8d5a3c', '#c99370', '#e0b48f', '#6b4430', '#b07a55', '#f0c9a6'], HAIR = ['#1d1410', '#3a2a20', '#6b4a2b', '#2a1d16', '#a07a4a'];
  const players = [];
  for (let i = 0; i < 14; i++) {
    const team = i < 7 ? 0 : 1;
    const F = makeFigure({ shirt: team ? '#23324a' : '#f2f2ee', shorts: team ? '#1b1f27' : '#3a3f4a', skin: SKIN[i % SKIN.length], hair: HAIR[(i * 3) % HAIR.length], shoe: i % 3 ? '#e6e6e6' : '#c8402c' });
    const sc = .92 + ((i * 37) % 11) / 60; F.root.scale.setScalar(sc); g.add(F.root);
    players.push({ F, team, p: new THREE.Vector2(), t: new THREE.Vector2(), v: new THREE.Vector2(), ph: i, retarget: 0, mark: 0 });
  }
  let attack = 0, dir = 1, holder = 0, hold = 0, flight = null;   // dir: the attacking team runs toward +x when 1
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clampField = v => v.set(Math.max(-LEN / 2 + 1, Math.min(LEN / 2 - 1, v.x)), Math.max(-WID / 2 + 1, Math.min(WID / 2 - 1, v.y)));

  /** line both teams up at opposite ends, the receiving team at x = -dir side */
  function pull() {
    players.forEach((P, i) => {
      const k = i % 7, own = P.team === attack ? -dir : dir;
      P.p.set(own * (LEN / 2 - EZ + 2) - own * (k === 0 ? 4 : 0), -15 + k * 5); P.t.copy(P.p); P.v.set(0, 0);
    });
    holder = players.findIndex(P => P.team === attack); hold = 1.2; flight = null;
    players.filter(P => P.team !== attack).forEach((P, j) => { P.mark = players.findIndex(Q => Q.team === attack) + j; });
  }
  pull();

  function throwTo() {
    const H = players[holder], mates = players.map((P, i) => i).filter(i => i !== holder && players[i].team === attack);
    // favour cutters who are downfield and away from their defender
    const score = i => { const P = players[i], m = players.find(Q => Q.team !== attack && Q.mark === i); return (P.p.x - H.p.x) * dir + (m ? m.p.distanceTo(P.p) * 3 : 0) + rnd(0, 20); };
    const r = mates.reduce((b, i) => (score(i) > score(b) ? i : b), mates[0]), R = players[r];
    const to = R.p.clone().add(R.v.clone().multiplyScalar(1.2)).add(new THREE.Vector2(dir * rnd(2, 10), rnd(-4, 4)));
    clampField(to);
    const dist = H.p.distanceTo(to), dur = .35 + dist / 15;
    R.t.copy(to); R.retarget = dur + .5;
    flight = { from: H.p.clone(), to, t: 0, dur, r, curve: rnd(-1, 1) * dist * .07, high: 1.5 + dist * .05, drop: Math.random() < .12 };
    holder = -1;
  }

  const hand = new THREE.Vector3();
  function update(dt) {
    if (!g.visible) return;
    if (flight) {
      flight.t += dt / flight.dur;
      const t = Math.min(1, flight.t), pos = flight.from.clone().lerp(flight.to, t), n = new THREE.Vector2(-(flight.to.y - flight.from.y), flight.to.x - flight.from.x).normalize();
      pos.addScaledVector(n, Math.sin(Math.PI * t) * flight.curve);
      const y = flight.drop && t > .7 ? 1.2 * (1 - (t - .7) / .3) + .5 : 1.2 + Math.sin(Math.PI * t) * flight.high;
      disc.position.set(pos.x, Math.max(.5, y), pos.y); disc.rotation.set(.12, disc.rotation.y + dt * 30, -.08);
      if (t >= 1) {
        if (flight.drop) {   // turnover: the nearest defender picks it up and their team attacks the other way
          attack = 1 - attack; dir = -dir;
          holder = players.reduce((b, P, i) => (P.team === attack && (b < 0 || P.p.distanceTo(flight.to) < players[b].p.distanceTo(flight.to)) ? i : b), -1);
          players[holder].t.copy(flight.to);
          players.filter(P => P.team !== attack).forEach((P, j) => { P.mark = players.map((Q, i) => i).filter(i => players[i].team === attack)[j]; });
        } else holder = flight.r;
        hold = rnd(1.2, 3.2); flight = null;
        // a catch in the end zone they attack: point scored, the scoring team pulls to the other
        const H = players[holder];
        if (H.p.x * dir > LEN / 2 - EZ) { attack = 1 - attack; dir = -dir; setTimeout(pull, 2500); hold = 99; }
      }
    } else if (holder >= 0 && (hold -= dt) <= 0) throwTo();

    players.forEach((P, i) => {
      const isHolder = i === holder;
      if (isHolder) P.t.copy(P.p);   // the thrower keeps a pivot foot planted
      else if (P.team === attack) {
        if ((P.retarget -= dt) <= 0) {   // cut: break toward open space downfield, or clear back
          P.t.set(P.p.x + dir * rnd(-6, 16), rnd(-WID / 2 + 3, WID / 2 - 3)); clampField(P.t); P.retarget = rnd(1.5, 3.5);
        }
      } else {   // defence: stay goal-side of the player you mark, the marker on the thrower
        const ref = holder >= 0 && players[holder] === players[P.mark] ? players[holder] : players[P.mark];
        if (ref) { P.t.copy(ref.p).add(new THREE.Vector2(dir * 1.6, (i % 2 ? 1 : -1) * .8)); clampField(P.t); }
      }
      const d = P.t.clone().sub(P.p), dist = d.length(), want = dist < .3 ? 0 : Math.min(dist * 2, P.team === attack ? 7 : 6.5);
      P.v.lerp(d.normalize().multiplyScalar(want), Math.min(1, dt * 4));
      P.p.addScaledVector(P.v, dt);
      const sp = P.v.length(); P.ph += sp * dt * 1.6;
      P.F.root.position.set(P.p.x, .4, P.p.y);
      const face = isHolder && flight == null ? Math.atan2(dir, 0) : sp > .3 ? Math.atan2(P.v.x, P.v.y) : Math.atan2(holder >= 0 ? players[holder].p.x - P.p.x : 0, holder >= 0 ? players[holder].p.y - P.p.y : 1);
      P.F.root.rotation.y += Math.atan2(Math.sin(face - P.F.root.rotation.y), Math.cos(face - P.F.root.rotation.y)) * Math.min(1, dt * 8);
      pose(P.F, P.ph, sp);
      if (flight && flight.r === i && flight.t > .6) { P.F.shL.rotation.x = P.F.shR.rotation.x = -2.6; P.F.elL.rotation.x = P.F.elR.rotation.x = -.2; }   // reaching for the catch
      if (isHolder) {   // backhand wind-up just before the throw
        const w = Math.max(0, 1 - hold / .5);
        P.F.shR.rotation.x = -1.2; P.F.shR.rotation.z = -.6 + w * 1.6; P.F.elR.rotation.x = -.4;
        P.F.handR.getWorldPosition(hand); g.worldToLocal(hand); disc.position.copy(hand);
      }
    });
  }
  // a view from beside the field, looking along it
  const c = Math.cos(f.ry), s = Math.sin(f.ry), wx = (lx, lz) => f.x + lx * c + lz * s, wz = (lx, lz) => f.z - lx * s + lz * c;
  const view = { id: 'frisbee', name: 'Edgley frisbee', pos: new THREE.Vector3(wx(-25, 48), 20, wz(-25, 48)), target: new THREE.Vector3(wx(5, 0), 0, wz(5, 0)) };
  return { update, view };
}
