// Lucky Arcade: the street stall in Chinatown's night market (js/scene/phl/chinatown.js). Click it
// and this dialog opens on a menu of three games, each drawn on one 480 x 480 canvas:
//   Ping-Pong      a rally across a ping-pong table against the stall's CPU, first to 7 points
//   Sky Swarm      a fixed shooter: bugs fly into formation, then peel off and dive at your launcher
//   Dumpling Dash  a maze chase: eat every sesame seed while four cats hunt you; a fortune cookie
//                  turns the chase around for a few seconds
// Keys: arrows or W A S D move; Space fires (Sky Swarm) or starts again; P pauses; Esc goes back
// to the menu, then closes. Pointer or touch: Ping-Pong's paddle follows it, Sky Swarm's launcher
// moves to it and fires while pressed, Dumpling Dash turns on a swipe. Best scores stay in this browser.
// On a touch screen the instructions speak of fingers, not keys.
import { CITY } from './cities.js';

const TOUCH = matchMedia('(pointer: coarse)');
const say = (keys, touch) => (TOUCH.matches ? touch : keys);
const AGAIN = () => say('Space or click to play again', 'Tap to play again');

const W = 480, H = 480;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const FONT = '"Courier New", ui-monospace, monospace';
function hud(g, left, right, color = '#fff6c8') {
  g.fillStyle = color; g.font = `bold 16px ${FONT}`; g.textBaseline = 'middle';
  g.textAlign = 'left'; g.fillText(left, 12, 15); g.textAlign = 'right'; g.fillText(right, W - 12, 15);
}
function banner(g, big, small) {
  g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, H / 2 - 52, W, 104);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffd75a'; g.font = `bold 34px ${FONT}`; g.fillText(big, W / 2, H / 2 - 14);
  if (small) { g.fillStyle = '#fff'; g.font = `15px ${FONT}`; g.fillText(small, W / 2, H / 2 + 24); }
}

// ---------------------------------------------------------------- Ping-Pong
function pingPong() {
  const TOP = 44, BOT = H - 14, LX = 34, RX = W - 34, PW = 10, PH = 72, R = 7, WIN = 7;
  const s = { you: 0, cpu: 0, py: (TOP + BOT) / 2, cy: (TOP + BOT) / 2, bx: W / 2, by: (TOP + BOT) / 2, vx: 0, vy: 0, wait: 1.2, to: -1, rally: 0, best: 0, aim: 0, over: false, msg: '' };
  const serve = dir => { s.bx = W / 2; s.by = (TOP + BOT) / 2; const a = rnd(-.5, .5), v = 290; s.vx = dir * v * Math.cos(a); s.vy = v * Math.sin(a); s.rally = 0; s.aim = rnd(-28, 28); };
  const hit = (dir, py) => {
    const off = clamp((s.by - py) / (PH / 2 + R), -1, 1), v = Math.min(760, Math.hypot(s.vx, s.vy) * 1.06);
    s.vx = dir * v * Math.cos(off * 1.0); s.vy = v * Math.sin(off * 1.0); s.rally++; s.best = Math.max(s.best, s.rally); s.aim = rnd(-34, 34);
  };
  const point = who => {
    s[who]++; s.wait = 1; s.to = who === 'you' ? 1 : -1;
    if (s[who] >= WIN) { s.over = true; s.msg = who === 'you' ? 'You win' : 'The stall wins'; }
  };
  return {
    help: say('W / S or the arrow keys (or the mouse) move your paddle. First to 7. Your longest rally is your score.',
      'Slide a finger up and down the table to move your paddle. First to 7. Your longest rally is your score.'),
    get score() { return s.best; }, get over() { return s.over; }, get result() { return `${s.msg}, ${s.you} to ${s.cpu}. Longest rally ${s.best}.`; },
    update(dt, inp) {
      if (s.over) return;
      if (inp.held.u) s.py -= 430 * dt; if (inp.held.d) s.py += 430 * dt;
      if (inp.ptr.live) s.py += (inp.ptr.y - s.py) * Math.min(1, dt * 16);
      s.py = clamp(s.py, TOP + PH / 2, BOT - PH / 2);
      // the CPU follows the ball when it's coming, with a little slop, and drifts home otherwise
      const tgt = s.vx > 0 && s.bx > W * .3 ? s.by + s.aim : (TOP + BOT) / 2, cs = 245 + 12 * Math.min(8, s.rally);
      s.cy = clamp(s.cy + clamp(tgt - s.cy, -cs * dt, cs * dt), TOP + PH / 2, BOT - PH / 2);
      if (s.wait > 0) { s.wait -= dt; if (s.wait <= 0) serve(s.to); return; }
      s.bx += s.vx * dt; s.by += s.vy * dt;
      if (s.by < TOP + R) { s.by = TOP + R; s.vy = Math.abs(s.vy); }
      if (s.by > BOT - R) { s.by = BOT - R; s.vy = -Math.abs(s.vy); }
      if (s.vx < 0 && s.bx - R < LX + PW / 2 && s.bx > LX - PW && Math.abs(s.by - s.py) < PH / 2 + R) { s.bx = LX + PW / 2 + R; hit(1, s.py); }
      if (s.vx > 0 && s.bx + R > RX - PW / 2 && s.bx < RX + PW && Math.abs(s.by - s.cy) < PH / 2 + R) { s.bx = RX - PW / 2 - R; hit(-1, s.cy); }
      if (s.bx < -R) point('cpu'); else if (s.bx > W + R) point('you');
    },
    draw(g) {
      g.fillStyle = '#10161f'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#1d6b4a'; g.fillRect(12, TOP - 6, W - 24, BOT - TOP + 12);
      g.strokeStyle = '#f4f4ee'; g.lineWidth = 3; g.strokeRect(13.5, TOP - 4.5, W - 27, BOT - TOP + 9);
      g.lineWidth = 1.5; g.setLineDash([6, 6]); g.beginPath(); g.moveTo(14, (TOP + BOT) / 2); g.lineTo(W - 14, (TOP + BOT) / 2); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#e8e8e0'; g.fillRect(W / 2 - 2, TOP - 10, 4, BOT - TOP + 20);   // the net
      g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.arc(s.bx + 4, s.by + 5, R, 0, 7); g.fill();
      const pad = (x, y, c) => { g.fillStyle = c; g.beginPath(); g.roundRect ? g.roundRect(x - PW / 2, y - PH / 2, PW, PH, 4) : g.rect(x - PW / 2, y - PH / 2, PW, PH); g.fill(); };
      pad(LX, s.py, '#e8402e'); pad(RX, s.cy, '#28304a');
      g.fillStyle = '#fff3d6'; g.beginPath(); g.arc(s.bx, s.by, R, 0, 7); g.fill();
      hud(g, `YOU ${s.you}`, `${s.cpu} CPU`);
      g.textAlign = 'center'; g.fillStyle = '#9fb7c6'; g.font = `13px ${FONT}`; g.fillText(`rally ${s.rally} · best ${s.best}`, W / 2, 15);
      if (s.over) banner(g, s.msg, AGAIN());
    },
  };
}

// ---------------------------------------------------------------- Sky Swarm
const BUGS = {
  gnat: { pts: 50, body: '#7dd34a', wing: 'rgba(200,255,200,.55)', hp: 1 },
  wasp: { pts: 80, body: '#f29a1a', wing: 'rgba(255,240,200,.55)', hp: 1 },
  beetle: { pts: 150, body: '#9a4ad8', wing: 'rgba(230,200,255,.5)', hp: 2 },
};
function skySwarm() {
  const s = { x: W / 2, lives: 3, score: 0, wave: 0, t: 0, cool: 0, dive: 2.5, dead: 0, inv: 2, over: false, next: 0, shots: [], bombs: [], foes: [], parts: [], stars: [] };
  for (let i = 0; i < 70; i++) s.stars.push([rnd(0, W), rnd(0, H), rnd(10, 50)]);
  const PY = H - 40;
  function newWave() {
    s.wave++; s.foes = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) {
      const type = r === 0 ? 'beetle' : r === 1 ? 'wasp' : 'gnat', side = c < 4 ? -1 : 1;
      const sx = W / 2 + (c - 3.5) * 42, sy = 70 + r * 36;
      s.foes.push({ type, hp: BUGS[type].hp, sx, sy, x: -50, y: -50, st: 'enter', k: -(r * .35 + (c % 4) * .1), x0: W / 2 + side * 260, y0: -30, side, flap: rnd(0, 6) });
    }
  }
  newWave();
  const boom = (x, y, c, n = 16) => { for (let i = 0; i < n; i++) { const a = rnd(0, 7), v = rnd(40, 200); s.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(.3, .8), c }); } };
  function kill() {
    boom(s.x, PY, '#ffd75a', 30); boom(s.x, PY, '#e8402e', 20);
    s.lives--; s.dead = 1.6; s.bombs = [];
  }
  return {
    help: say('← → or A / D move, Space fires (or press and drag on the screen). Divers score double.',
      'Hold a finger on the sky: your launcher slides under it and fires. Divers score double.'),
    get score() { return s.score; }, get over() { return s.over; }, get result() { return `Game over on wave ${s.wave}: ${s.score} points.`; },
    update(dt, inp) {
      s.t += dt;
      for (const st of s.stars) { st[1] += st[2] * dt; if (st[1] > H) { st[1] = 0; st[0] = rnd(0, W); } }
      for (const p of s.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt; p.life -= dt; }
      s.parts = s.parts.filter(p => p.life > 0);
      if (s.over) return;
      const alive = s.dead <= 0;
      if (s.dead > 0) { s.dead -= dt; if (s.dead <= 0) { if (s.lives <= 0) { s.over = true; return; } s.inv = 2; s.x = W / 2; } }
      if (alive) {
        if (inp.held.l) s.x -= 270 * dt; if (inp.held.r) s.x += 270 * dt;
        if (inp.ptr.down) s.x += clamp(inp.ptr.x - s.x, -300 * dt, 300 * dt);
        s.x = clamp(s.x, 20, W - 20); s.inv -= dt; s.cool -= dt;
        if ((inp.held.fire || inp.ptr.down) && s.cool <= 0 && s.shots.length < 2) { s.shots.push({ x: s.x, y: PY - 16 }); s.cool = .22; }
      }
      for (const b of s.shots) b.y -= 560 * dt;
      s.shots = s.shots.filter(b => b.y > -10);
      for (const b of s.bombs) { b.x += b.vx * dt; b.y += 230 * dt; }
      s.bombs = s.bombs.filter(b => b.y < H + 10);
      const sway = Math.sin(s.t * .9) * 26, breathe = s.wave > 1 ? 1 + .06 * Math.sin(s.t * 1.7) : 1;
      const slot = f => [W / 2 + (f.sx - W / 2) * breathe + sway, 40 + (f.sy - 40) * breathe];
      const formed = [];
      for (const f of s.foes) {
        f.flap += dt * 14;
        const [tx, ty] = slot(f);
        if (f.st === 'enter') {
          f.k += dt * .8; const k = clamp(f.k, 0, 1), u = 1 - k;
          const cx = f.x0 - f.side * 160, cy = 320;   // swing down through the middle, then up into place
          f.x = u * u * f.x0 + 2 * u * k * cx + k * k * tx; f.y = u * u * f.y0 + 2 * u * k * cy + k * k * ty;
          if (f.k < 0) { f.x = -60; f.y = -60; }
          if (f.k >= 1) f.st = 'form';
        } else if (f.st === 'form') { f.x = tx; f.y = ty; formed.push(f); }
        else if (f.st === 'dive') {
          f.k += dt;
          if (f.k < .7) { const a = f.k / .7 * Math.PI; f.x = f.dx + f.side * 34 * (1 - Math.cos(a)); f.y = f.dy - 34 * Math.sin(a); }
          else {
            const vmax = Math.min(190, 95 + s.wave * 20);   // early waves steer lazily, later ones hunt
            f.vx = clamp(f.vx + Math.sign(s.x - f.x) * 260 * dt, -vmax, vmax); f.x += f.vx * dt; f.y += (170 + s.wave * 12) * dt;
            if (f.shots > 0 && f.y > f.fireY) { s.bombs.push({ x: f.x, y: f.y + 10, vx: clamp((s.x - f.x) * .3, -60, 60) }); f.shots--; f.fireY += 70; }
            if (f.y > H + 24) { f.y = -24; f.x = tx; f.st = 'back'; }
          }
        } else if (f.st === 'back') {
          const dx = tx - f.x, dy = ty - f.y, d = Math.hypot(dx, dy), v = 240 * dt;
          if (d < v) f.st = 'form'; else { f.x += dx / d * v; f.y += dy / d * v; }
        }
      }
      s.dive -= dt;
      if (s.dive <= 0 && formed.length && alive) {
        const n = s.wave > 2 && Math.random() < .35 ? 2 : 1;
        for (let i = 0; i < n && formed.length; i++) {
          const f = formed.splice(Math.floor(Math.random() * formed.length), 1)[0];
          f.st = 'dive'; f.k = 0; f.dx = f.x; f.dy = f.y; f.vx = 0; f.side = f.x < s.x ? -1 : 1; f.shots = (s.wave > 1 || Math.random() < .6 ? 1 : 0) + (Math.random() < s.wave * .1 ? 1 : 0); f.fireY = rnd(160, 260);
        }
        s.dive = Math.max(.55, 2.4 - s.wave * .22) * rnd(.6, 1.3);
      }
      // hits
      for (const b of s.shots) for (const f of s.foes) {
        if (b.dead || f.hp <= 0 || Math.abs(b.x - f.x) > 15 || Math.abs(b.y - f.y) > 14) continue;
        b.dead = true; f.hp--;
        if (f.hp <= 0) { s.score += BUGS[f.type].pts * (f.st === 'dive' ? 2 : 1); boom(f.x, f.y, BUGS[f.type].body); boom(f.x, f.y, '#fff3c8', 8); }
        else boom(f.x, f.y, '#f2a7c3', 5);
      }
      s.shots = s.shots.filter(b => !b.dead);
      if (alive && s.inv <= 0) {
        if (s.bombs.some(b => Math.abs(b.x - s.x) < 13 && Math.abs(b.y - PY) < 14)) kill();
        else for (const f of s.foes) if (f.hp > 0 && f.st === 'dive' && Math.abs(f.x - s.x) < 22 && Math.abs(f.y - PY) < 20) { f.hp = 0; boom(f.x, f.y, BUGS[f.type].body); kill(); break; }
      }
      s.foes = s.foes.filter(f => f.hp > 0);
      if (!s.foes.length) { s.next += dt; if (s.next > 1.6) { s.next = 0; newWave(); } }
    },
    draw(g) {
      g.fillStyle = '#060814'; g.fillRect(0, 0, W, H);
      for (const [x, y, v] of s.stars) { g.fillStyle = v > 35 ? '#ffffff' : '#7d8db5'; g.fillRect(x, y, v > 35 ? 2 : 1, v > 35 ? 2 : 1); }
      for (const f of s.foes) {
        const B = BUGS[f.type], w = Math.abs(Math.sin(f.flap)) * 9 + 3;
        g.save(); g.translate(f.x, f.y); if (f.st === 'dive' && f.k > .7) g.rotate(clamp(f.vx / 300, -.6, .6) + Math.PI);
        g.fillStyle = B.wing; g.beginPath(); g.ellipse(-8, -3, w, 5, -.4, 0, 7); g.ellipse(8, -3, w, 5, .4, 0, 7); g.fill();
        g.fillStyle = f.type === 'beetle' && f.hp < 2 ? '#f2a7c3' : B.body; g.beginPath(); g.ellipse(0, 0, f.type === 'beetle' ? 9 : 6, f.type === 'gnat' ? 7 : 10, 0, 0, 7); g.fill();
        if (f.type === 'wasp') { g.fillStyle = '#1d1410'; g.fillRect(-6, -1, 12, 2.5); g.fillRect(-5, 4, 10, 2.5); }
        if (f.type === 'beetle') { g.fillStyle = '#ffd75a'; g.beginPath(); g.arc(-4, 2, 2, 0, 7); g.arc(4, 2, 2, 0, 7); g.fill(); g.fillRect(-.6, -9, 1.2, 18); }
        g.fillStyle = '#fff'; g.beginPath(); g.arc(-3, -7, 2.4, 0, 7); g.arc(3, -7, 2.4, 0, 7); g.fill();
        g.fillStyle = '#000'; g.beginPath(); g.arc(-3, -6.5, 1.1, 0, 7); g.arc(3, -6.5, 1.1, 0, 7); g.fill();
        g.restore();
      }
      for (const b of s.shots) { g.fillStyle = '#ffd75a'; g.fillRect(b.x - 1.5, b.y, 3, 12); g.fillStyle = '#fff'; g.fillRect(b.x - 2.5, b.y - 2, 5, 4); g.fillStyle = 'rgba(255,120,40,.6)'; g.fillRect(b.x - 1, b.y + 12, 2, 6); }
      for (const b of s.bombs) { g.fillStyle = '#ff4f3a'; g.beginPath(); g.moveTo(b.x, b.y - 6); g.lineTo(b.x + 4, b.y); g.lineTo(b.x, b.y + 6); g.lineTo(b.x - 4, b.y); g.fill(); }
      for (const p of s.parts) { g.globalAlpha = clamp(p.life * 2, 0, 1); g.fillStyle = p.c; g.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); }
      g.globalAlpha = 1;
      if (s.dead <= 0 && !s.over && (s.inv <= 0 || Math.floor(s.t * 10) % 2)) {   // the launcher: a red lantern with a gold nozzle
        g.save(); g.translate(s.x, PY);
        g.fillStyle = '#ff8a3a'; g.beginPath(); g.moveTo(-5, 12); g.lineTo(0, 18 + Math.random() * 5); g.lineTo(5, 12); g.fill();
        g.fillStyle = '#d6301f'; g.beginPath(); g.ellipse(0, 2, 16, 11, 0, 0, 7); g.fill();
        g.fillStyle = '#ffd75a'; g.fillRect(-12, -9, 24, 3); g.fillRect(-12, 10, 24, 3); g.fillRect(-3, -17, 6, 9);
        g.fillStyle = 'rgba(255,240,180,.8)'; g.fillRect(-1, -6, 2, 14);
        g.restore();
      }
      hud(g, `SCORE ${s.score}`, `WAVE ${s.wave}`);
      for (let i = 0; i < s.lives - (s.dead > 0 ? 0 : 1); i++) { g.fillStyle = '#d6301f'; g.beginPath(); g.ellipse(18 + i * 22, H - 12, 8, 6, 0, 0, 7); g.fill(); }
      if (!s.foes.length && !s.over) banner(g, `WAVE ${s.wave + 1}`, 'Here they come');
      if (s.over) banner(g, 'GAME OVER', AGAIN());
    },
  };
}

// ---------------------------------------------------------------- Dumpling Dash
// '#' wall, '.' sesame seed, 'o' fortune cookie, '-' the pen's door, 'C' inside the pen, 'P' start,
// ' ' outside the maze, except on row 9: the tunnel that wraps from one side to the other
const MAZE = [
  '###################',
  '#o.......#.......o#',
  '#.##.###.#.###.##.#',
  '#.................#',
  '#.##.#.#####.#.##.#',
  '#....#...#...#....#',
  '####.###.#.###.####',
  '   #.#.......#.#   ',
  '####.#.##-##.#.####',
  '    ...#CCC#...    ',
  '####.#.#####.#.####',
  '   #.#.......#.#   ',
  '####.#.#####.#.####',
  '#........#........#',
  '#.##.###.#.###.##.#',
  '#o.#.....P.....#.o#',
  '##.#.#.#####.#.#.##',
  '#....#...#...#....#',
  '#.######.#.######.#',
  '#.................#',
  '###################',
];
const COLS = 19, ROWS = 21, T = 21, OX = (W - COLS * T) / 2, OY = H - ROWS * T - 9;
const FORTUNES = ['Luck favours the hungry.', 'Good things come in steamers of three.', 'A full belly is a quiet mind.',
  'Today, the cats fear you.', 'You will find treasure in small things.', 'Patience is a slow-cooked broth.', 'Your next adventure is just around the corner.'];
const CATS = [['#ff6a3c', 'Ginger'], ['#f2a7c3', 'Peaches'], ['#7ec8e3', 'Misty'], ['#e8c04a', 'Butterscotch']];
const DIRS = [[0, -1], [-1, 0], [0, 1], [1, 0]];
function dumplingDash() {
  let grid, seeds;
  const s = { score: 0, lives: 3, level: 1, t: 0, mode: 0, modeT: 0, pause: 1.5, dying: 0, clear: 0, chain: 0, fortune: '', fortuneT: 0, pops: [], over: false };
  const SCHEDULE = [7, 20, 7, 20, 5, 1e9];   // scatter, chase, ... seconds
  const P = {}, cats = CATS.map(([c, n], i) => ({ i, color: c, name: n }));
  const cell = (x, y) => (y < 0 || y >= ROWS ? '#' : grid[y][((x % COLS) + COLS) % COLS]);
  const open = (x, y) => { if (y === 9 && (x < 0 || x >= COLS)) return true; const c = cell(x, y); return c !== '#' && c !== '-' && c !== 'C' && !(c === ' ' && y !== 9); };
  function resetMaze() { grid = MAZE.map(r => r.split('')); seeds = 0; for (const r of grid) for (const c of r) if (c === '.' || c === 'o') seeds++; }
  function resetActors() {
    Object.assign(P, { tx: 9, ty: 15, dir: [0, 0], want: [-1, 0], p: 0, face: -1, bob: 0 });
    cats.forEach((c, i) => Object.assign(c, i === 0 ? { tx: 9, ty: 7, mode: 'out' } : { tx: 7 + i, ty: 9, mode: 'pen' }, { dir: [-1, 0], p: 0, fright: 0, release: s.t + 1.2 + [0, 2, 5, 8][i] }));
    s.mode = 0; s.modeT = 0; s.pause = 1.2;
  }
  resetMaze(); resetActors();
  const posOf = m => { let x = m.tx + m.dir[0] * m.p; if (x < -.5) x += COLS; if (x > COLS - .5) x -= COLS; return [x, m.ty + m.dir[1] * m.p]; };
  /** move m `dist` tiles; at each tile centre call turn(m) to pick the next direction */
  function advance(m, dist, turn) {
    let guard = 0;
    while (dist > 1e-6 && guard++ < 8) {
      if (m.p === 0) {
        turn(m);
        if (!open(m.tx + m.dir[0], m.ty + m.dir[1])) { m.dir = [0, 0]; return; }
      } else if (m.want && m.want[0] === -m.dir[0] && m.want[1] === -m.dir[1]) {   // turn straight back mid-tile
        m.tx += m.dir[0]; m.ty += m.dir[1]; m.p = 1 - m.p; m.dir = m.want;
      }
      if (!m.dir[0] && !m.dir[1]) return;
      const step = Math.min(dist, 1 - m.p); m.p += step; dist -= step;
      if (m.p >= 1 - 1e-6) { m.tx += m.dir[0]; m.ty += m.dir[1]; m.p = 0; if (m.tx < 0) m.tx = COLS - 1; if (m.tx >= COLS) m.tx = 0; }
    }
  }
  function eatAt(x, y) {
    const c = cell(x, y);
    if (c === '.') { grid[y][x] = '_'; s.score += 10; seeds--; }   // '_' eaten floor (' ' is the void outside)
    else if (c === 'o') {
      grid[y][x] = '_'; s.score += 50; seeds--; s.chain = 0;
      s.fortune = FORTUNES[Math.floor(Math.random() * FORTUNES.length)]; s.fortuneT = 3;
      for (const k of cats) if (k.mode === 'out') { k.fright = Math.max(2, 6.5 - s.level * .6); if (k.p > 0) { k.tx += k.dir[0]; k.ty += k.dir[1]; k.p = 1 - k.p; } k.dir = [-k.dir[0], -k.dir[1]]; }
    }
    if (!seeds) s.clear = 2;
  }
  const playerTurn = m => {
    eatAt(((m.tx % COLS) + COLS) % COLS, m.ty);
    if (m.want && open(m.tx + m.want[0], m.ty + m.want[1])) m.dir = m.want;
  };
  function catTarget(k) {
    if (k.mode === 'eyes') return [9, 7];
    const scatter = s.mode % 2 === 0, corner = [[COLS, -2], [-1, -2], [COLS, ROWS + 1], [-1, ROWS + 1]][k.i];
    if (scatter) return corner;
    const pd = P.dir[0] || P.dir[1] ? P.dir : [P.face, 0];
    if (k.i === 0) return [P.tx, P.ty];
    if (k.i === 1) return [P.tx + pd[0] * 4, P.ty + pd[1] * 4];
    if (k.i === 2) return Math.hypot(k.tx - P.tx, k.ty - P.ty) > 7 ? [P.tx, P.ty] : corner;
    if (!k.wander || s.t > k.wanderT) { k.wander = [Math.floor(rnd(0, COLS)), Math.floor(rnd(0, ROWS))]; k.wanderT = s.t + 3; }
    return k.wander;
  }
  const catTurn = k => {
    if (k.mode === 'eyes' && k.tx === 9 && k.ty === 7) { k.mode = 'pen'; k.tx = 9; k.ty = 9; k.dir = [0, 0]; k.release = s.t + 1.5; return; }
    const back = [-k.dir[0], -k.dir[1]];
    let opts = DIRS.filter(d => open(k.tx + d[0], k.ty + d[1]) && !(d[0] === back[0] && d[1] === back[1]));
    if (!opts.length) opts = [back];
    if (k.fright > 0) { k.dir = opts[Math.floor(Math.random() * opts.length)]; return; }
    const [gx, gy] = catTarget(k);
    k.dir = opts.reduce((b, d) => { const v = (k.tx + d[0] - gx) ** 2 + (k.ty + d[1] - gy) ** 2; return v < b[0] ? [v, d] : b; }, [1e9, opts[0]])[1];
  };
  return {
    help: say('Arrow keys or W A S D (or swipe) to steer. Eat every sesame seed; a fortune cookie lets you chase the cats.',
      'Swipe to steer. Eat every sesame seed; a fortune cookie lets you chase the cats.'),
    get score() { return s.score; }, get over() { return s.over; }, get result() { return `Game over on level ${s.level}: ${s.score} points.`; },
    update(dt, inp) {
      s.t += dt; s.fortuneT -= dt; for (const p of s.pops) p.t -= dt; s.pops = s.pops.filter(p => p.t > 0);
      if (s.over) return;
      if (inp.dir) P.want = inp.dir;
      if (s.pause > 0) { s.pause -= dt; return; }
      if (s.dying > 0) {
        s.dying -= dt;
        if (s.dying <= 0) { if (--s.lives <= 0) { s.over = true; return; } resetActors(); }
        return;
      }
      if (s.clear > 0) { s.clear -= dt; if (s.clear <= 0) { s.level++; resetMaze(); resetActors(); } return; }
      if (!cats.some(k => k.fright > 0)) { s.modeT += dt; if (s.modeT > SCHEDULE[Math.min(s.mode, SCHEDULE.length - 1)]) { s.modeT = 0; s.mode++; } }
      const ps = Math.min(7.6, 6 + s.level * .25);
      advance(P, ps * dt, playerTurn); if (P.dir[0]) P.face = P.dir[0]; P.bob += dt * (P.dir[0] || P.dir[1] ? 12 : 3);
      for (const k of cats) {
        if (k.mode === 'pen') { if (s.t >= k.release && s.pause <= 0) { k.mode = 'out'; k.tx = 9; k.ty = 7; k.p = 0; k.dir = [Math.random() < .5 ? -1 : 1, 0]; } continue; }
        k.fright = Math.max(0, k.fright - dt);
        const tunnel = k.ty === 9 && (k.tx < 4 || k.tx > 14);
        const v = k.mode === 'eyes' ? 11 : k.fright > 0 ? 3.4 : tunnel ? 3 : Math.min(7.2, 5.3 + s.level * .3);
        k.want = null; advance(k, v * dt, catTurn);
      }
      // collisions, by drawn position
      const [px, py] = posOf(P);
      for (const k of cats) {
        if (k.mode !== 'out') continue;
        const [kx, ky] = posOf(k); if (Math.hypot(kx - px, ky - py) > .7) continue;
        if (k.fright > 0) { const pts = 200 * 2 ** s.chain++; s.score += pts; s.pops.push({ x: kx, y: ky, t: 1, txt: pts }); k.mode = 'eyes'; k.fright = 0; s.pause = .45; }
        else { s.dying = 1.4; return; }
      }
    },
    draw(g) {
      g.fillStyle = '#0d0a10'; g.fillRect(0, 0, W, H);
      const flash = s.clear > 0 && Math.floor(s.clear * 6) % 2;
      // walls: dark red blocks with a gold edge where they meet the corridors
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const c = grid[y][x], X = OX + x * T, Y = OY + y * T;
        if (c === '#') {
          g.fillStyle = flash ? '#f4f1ea' : '#5e1610'; g.fillRect(X, Y, T, T);
          g.strokeStyle = '#e8b84a'; g.lineWidth = 2; g.beginPath();
          const edge = (dx, dy) => { const n = cell(x + dx, y + dy); return n !== '#' && !(n === ' ' && y + dy !== 9 && (x + dx < 3 || x + dx > 15)); };
          if (y > 0 && edge(0, -1)) { g.moveTo(X, Y + 1); g.lineTo(X + T, Y + 1); }
          if (y < ROWS - 1 && edge(0, 1)) { g.moveTo(X, Y + T - 1); g.lineTo(X + T, Y + T - 1); }
          if (x > 0 && edge(-1, 0)) { g.moveTo(X + 1, Y); g.lineTo(X + 1, Y + T); }
          if (x < COLS - 1 && edge(1, 0)) { g.moveTo(X + T - 1, Y); g.lineTo(X + T - 1, Y + T); }
          g.stroke();
        } else if (c === '-') { g.fillStyle = '#f2a7c3'; g.fillRect(X, Y + T / 2 - 2, T, 4); }
        else if (c === '.') { g.fillStyle = '#f4e3b5'; g.beginPath(); g.ellipse(X + T / 2, Y + T / 2, 2.6, 1.7, .6, 0, 7); g.fill(); }
        else if (c === 'o') {
          const r = 6 + Math.sin(s.t * 6) * 1.2; g.fillStyle = '#e8b04a'; g.beginPath(); g.arc(X + T / 2, Y + T / 2, r, Math.PI * .15, Math.PI * 1.85); g.closePath(); g.fill();
          g.strokeStyle = '#a8701a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X + T / 2 - r * .7, Y + T / 2); g.lineTo(X + T / 2 + r * .4, Y + T / 2); g.stroke();
        }
      }
      // the cats
      for (const k of cats) {
        const [x, y] = posOf(k), X = OX + (x + .5) * T, Y = OY + (y + .5) * T, ex = k.dir[0] * 1.5, ey = k.dir[1] * 1.5;
        if (s.dying > 0 && s.dying < 1.1) continue;
        if (k.mode !== 'eyes') {
          const scared = k.fright > 0, blink = scared && k.fright < 1.6 && Math.floor(k.fright * 6) % 2;
          g.fillStyle = scared ? (blink ? '#f4f1ea' : '#3346b8') : k.color;
          g.beginPath(); g.moveTo(X - 8, Y - 3); g.lineTo(X - 7, Y - 11); g.lineTo(X - 2, Y - 7); g.lineTo(X + 2, Y - 7); g.lineTo(X + 7, Y - 11); g.lineTo(X + 8, Y - 3);
          g.quadraticCurveTo(X + 10, Y + 9, X, Y + 9); g.quadraticCurveTo(X - 10, Y + 9, X - 8, Y - 3); g.fill();
          if (scared) { g.strokeStyle = '#fff'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(X - 5, Y + 4); for (let i = 0; i < 4; i++) g.lineTo(X - 5 + (i + 1) * 2.5, Y + 4 + (i % 2 ? -1.5 : 1.5)); g.stroke(); }
          else { g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1; g.beginPath(); g.moveTo(X - 3, Y + 3); g.lineTo(X - 10, Y + 2); g.moveTo(X + 3, Y + 3); g.lineTo(X + 10, Y + 2); g.stroke(); }
        }
        g.fillStyle = '#fff'; g.beginPath(); g.ellipse(X - 3.5, Y - 2, 2.6, 3.2, 0, 0, 7); g.ellipse(X + 3.5, Y - 2, 2.6, 3.2, 0, 0, 7); g.fill();
        g.fillStyle = k.mode === 'eyes' ? '#3346b8' : '#111'; g.beginPath(); g.arc(X - 3.5 + ex, Y - 2 + ey, 1.4, 0, 7); g.arc(X + 3.5 + ex, Y - 2 + ey, 1.4, 0, 7); g.fill();
      }
      // the dumpling: a pleated half-moon that bounces as it goes, facing its way
      {
        const [x, y] = posOf(P), X = OX + (x + .5) * T, Y = OY + (y + .5) * T, sq = s.dying > 0 ? clamp(s.dying / 1.4, 0, 1) : 1;
        g.save(); g.translate(X, Y + 3); g.scale(P.face * (1 + .06 * Math.sin(P.bob)), sq * (1 - .06 * Math.sin(P.bob)));
        g.fillStyle = '#f7f0de'; g.beginPath(); g.moveTo(-9, 4); g.quadraticCurveTo(-10, -11, 0, -11); g.quadraticCurveTo(10, -11, 9, 4); g.closePath(); g.fill();
        g.strokeStyle = '#d8c8a2'; g.lineWidth = 1.2; g.beginPath();
        for (let i = -2; i <= 2; i++) { g.moveTo(i * 3, -10.5); g.quadraticCurveTo(i * 3 + 1.5, -7, i * 3.4, -4); } g.stroke();
        g.fillStyle = '#1d1410'; g.beginPath(); g.arc(2, -3, 1.3, 0, 7); g.arc(6, -3, 1.3, 0, 7); g.fill();
        g.fillStyle = '#f2a7c3'; g.beginPath(); g.arc(7.5, 0, 1.4, 0, 7); g.fill();
        const chew = P.dir[0] || P.dir[1] ? Math.abs(Math.sin(P.bob * .8)) * 2.2 : .6;
        g.fillStyle = '#8a2a1a'; g.beginPath(); g.ellipse(5, 1.2, 1.6, chew, 0, 0, 7); g.fill();
        g.restore();
      }
      for (const p of s.pops) { g.fillStyle = '#7ec8e3'; g.font = `bold 12px ${FONT}`; g.textAlign = 'center'; g.fillText(p.txt, OX + (p.x + .5) * T, OY + (p.y + .5) * T - (1 - p.t) * 10); }
      hud(g, `SCORE ${s.score}`, `LEVEL ${s.level}`);
      for (let i = 0; i < s.lives - 1; i++) { g.fillStyle = '#f7f0de'; g.beginPath(); g.arc(W / 2 - 20 + i * 18, 15, 6, Math.PI, 0); g.closePath(); g.fill(); }
      if (s.fortuneT > 0) { g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(0, OY + 9 * T, W, T); g.fillStyle = '#ffd75a'; g.font = `bold 13px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(`🥠 ${s.fortune}`, W / 2, OY + 9.5 * T); }
      if (s.pause > 0 && !s.dying && s.t < 2 && s.level === 1 && s.lives === 3) banner(g, 'READY?', 'Eat every seed. Dodge the cats.');
      if (s.over) banner(g, 'GAME OVER', AGAIN());
      else if (s.clear > 0) banner(g, 'ALL CLEAR!', `On to level ${s.level + 1}`);
    },
  };
}

const GAMES = [
  { id: 'pingpong', name: 'Ping-Pong', blurb: 'Rally across the table against the stall’s CPU. First to 7.', unit: 'longest rally', make: pingPong },
  { id: 'swarm', name: 'Sky Swarm', blurb: 'Bugs fly into formation and dive at your firework launcher.', unit: 'points', make: skySwarm },
  { id: 'dash', name: 'Dumpling Dash', blurb: 'Eat every sesame seed in the maze. Four hungry cats are after you.', unit: 'points', make: dumplingDash },
];

export function createArcade(api) {
  const K = CITY.storage + 'arcade';
  const load = () => { try { return JSON.parse(localStorage.getItem(K)) || {}; } catch (e) { return {}; } };
  const save = v => { try { localStorage.setItem(K, JSON.stringify(v)); } catch (e) { /* not kept */ } };
  let best = load();

  const el = (tag, cls, parent, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; if (parent) parent.appendChild(e); return e; };
  const modal = el('div', 'arc-modal', document.body); modal.hidden = true;
  modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'arc-title');
  const card = el('div', 'arc-card', modal), head = el('div', 'arc-head', card), title = el('h2', '', head, 'Lucky Arcade 幸運街機'); title.id = 'arc-title';
  const close = el('button', 'arc-x', head, '×'); close.type = 'button'; close.setAttribute('aria-label', 'Close');
  const menu = el('div', 'arc-menu', card);
  el('p', 'arc-quote', menu, '“Free play tonight! Pick a game. Beat the high score and you win a panda.” — Auntie Lin, behind the counter');
  const list = el('div', 'arc-list', menu), cardsBy = {};
  for (const G of GAMES) {
    const b = el('button', 'arc-pick', list); b.type = 'button';
    const thumb = el('canvas', '', b); thumb.width = 240; thumb.height = 240; thumb.setAttribute('aria-hidden', 'true');
    // the thumbnail: a few seconds into a game that plays itself
    const tg = thumb.getContext('2d'), demo = G.make(), idle = { held: { l: 0, r: 0, u: 0, d: 0, fire: 0 }, dir: null, ptr: { live: false, down: false, x: W / 2, y: H / 2 } };
    for (let i = 0; i < 100; i++) demo.update(1 / 30, idle);
    tg.scale(.5, .5); demo.draw(tg);
    el('b', '', b, G.name); el('span', '', b, G.blurb); const bs = el('span', 'arc-best', b);
    b.addEventListener('click', () => play(G)); cardsBy[G.id] = { b, bs };
  }
  const game = el('div', 'arc-game', card); game.hidden = true;
  const cv = el('canvas', 'arc-cv', game); cv.tabIndex = 0;
  const msg = el('p', 'arc-msg', game); msg.setAttribute('aria-live', 'polite');
  const row = el('div', 'row arc-row', game);
  const again = el('button', '', row, 'Restart'), pauseBtn = el('button', 'ghost', row, 'Pause'), back = el('button', 'ghost', row, 'Back to games');
  [again, pauseBtn, back].forEach(b => { b.type = 'button'; });
  const g = cv.getContext('2d');

  let G = null, inst = null, raf = 0, last = 0, paused = false, lastFocus = null, recorded = false;
  const inp = { held: { l: 0, r: 0, u: 0, d: 0, fire: 0 }, dir: null, ptr: { live: false, down: false, x: W / 2, y: H / 2 } };
  const showBest = () => { for (const X of GAMES) cardsBy[X.id].bs.textContent = best[X.id] ? `Best: ${best[X.id]} ${X.unit}` : 'No score yet'; };
  showBest();
  function size() { const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); }
  // (focus without scrolling: on a short screen that would scroll the title out of sight)
  function showMenu() {
    stop(); G = inst = null; game.hidden = true; menu.hidden = false; card.dataset.part = 'menu'; showBest();
    title.textContent = 'Lucky Arcade 幸運街機'; list.querySelector('button').focus({ preventScroll: true }); card.scrollTop = 0;
  }
  function play(which) {
    G = which; inst = G.make(); paused = false; recorded = false; pauseBtn.textContent = 'Pause';
    menu.hidden = true; game.hidden = false; card.dataset.part = 'game'; title.textContent = `Lucky Arcade · ${G.name}`;
    msg.textContent = inst.help; size(); cv.focus({ preventScroll: true }); card.scrollTop = 0;
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
  }
  function stop() { cancelAnimationFrame(raf); raf = 0; }
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (!inst) return;
    if (!paused) inst.update(dt, inp);
    inp.dir = null;
    inst.draw(g);
    if (paused) banner(g, 'PAUSED', say('P or the Pause button to carry on', 'Tap “Carry on” to play on'));
    if (inst.over && !recorded) {
      recorded = true; const sc = inst.score, prev = best[G.id] || 0;
      if (sc > prev) { best[G.id] = sc; save(best); }
      msg.textContent = `${inst.result} ${sc > prev && sc > 0 ? 'A new best!' : prev ? `Best: ${prev} ${G.unit}.` : ''}`;
    }
  }
  function open() {
    lastFocus = document.activeElement;
    if (api.viewStall) api.viewStall();
    modal.hidden = false; document.body.classList.add('arcade'); best = load(); showMenu();
  }
  function shut() {
    stop(); modal.hidden = true; document.body.classList.remove('arcade'); G = inst = null;
    for (const k in inp.held) inp.held[k] = 0;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  const restart = () => { if (G) play(G); };
  const togglePause = () => { if (!inst || inst.over) return; paused = !paused; pauseBtn.textContent = paused ? 'Carry on' : 'Pause'; };

  // keys: held for movement and fire; a press also sets the maze's next turn
  const KEYS = { arrowleft: 'l', a: 'l', arrowright: 'r', d: 'r', arrowup: 'u', w: 'u', arrowdown: 'd', s: 'd', ' ': 'fire', z: 'fire', x: 'fire' };
  const DIR = { l: [-1, 0], r: [1, 0], u: [0, -1], d: [0, 1] };
  modal.addEventListener('keydown', e => {
    e.stopPropagation();
    const k = e.key.toLowerCase();
    if (k === 'escape') { e.preventDefault(); if (G) showMenu(); else shut(); return; }
    if (!G || (e.target.tagName === 'BUTTON' && (k === ' ' || k === 'enter'))) return;
    if (k === 'p') { togglePause(); return; }
    if ((k === ' ' || k === 'enter') && inst && inst.over) { e.preventDefault(); restart(); return; }
    const a = KEYS[k]; if (!a) return;
    e.preventDefault(); inp.held[a] = 1; inp.ptr.live = false; if (DIR[a]) inp.dir = DIR[a];
  });
  modal.addEventListener('keyup', e => { e.stopPropagation(); const a = KEYS[e.key.toLowerCase()]; if (a) inp.held[a] = 0; });
  // pointer: position in game pixels; a swipe of 18 px turns the dumpling
  const at = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; };
  let swipe = null;
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId); cv.focus(); const [x, y] = at(e);
    if (inst && inst.over) { restart(); return; }
    Object.assign(inp.ptr, { down: true, live: true, x, y }); swipe = [x, y];
  });
  cv.addEventListener('pointermove', e => {
    const [x, y] = at(e); Object.assign(inp.ptr, { x, y, live: e.pointerType === 'mouse' || inp.ptr.down });
    if (swipe && Math.hypot(x - swipe[0], y - swipe[1]) > 18) {
      const dx = x - swipe[0], dy = y - swipe[1]; inp.dir = Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]; swipe = [x, y];
    }
  });
  const up = () => { inp.ptr.down = false; if (inp.ptr.live && !matchMedia('(pointer:fine)').matches) inp.ptr.live = false; swipe = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', () => { if (!inp.ptr.down) inp.ptr.live = false; });
  cv.addEventListener('contextmenu', e => e.preventDefault());   // a long press (holding to fire) is not a right-click
  close.addEventListener('click', shut); back.addEventListener('click', showMenu); again.addEventListener('click', restart);
  pauseBtn.addEventListener('click', () => { togglePause(); cv.focus(); });
  modal.addEventListener('pointerdown', e => { if (e.target === modal) shut(); });
  const away = () => { for (const k in inp.held) inp.held[k] = 0; if (inst && !inst.over && !paused) togglePause(); };
  window.addEventListener('blur', away);
  document.addEventListener('visibilitychange', () => { if (document.hidden) away(); });   // a phone switching apps

  return { open, active: () => !modal.hidden };
}
