// Minimap in the top right: a north-up map of the whole city (city limits, parks, water and
// every rail line) with you on it: a view cone where the camera is, or the train you're riding,
// with its line drawn bold. + and − zoom from the whole city down to a few blocks; click the
// map to fly there.
const LEVELS = [0, 14000, 6000, 2500, 1100];   // metres across the map (0 = the whole city)
const COUNTRY = '#dfe3d6', CITY = '#f2efe9', PARK = '#bcd8a4', WATER = '#8dbad6', EDGE = '#6b7a86';

export function createMinimap(api, { eats = () => null } = {}) {
  const wrap = document.getElementById('minimap'), cv = document.getElementById('mm'), ctx = cv.getContext('2d');
  const scaleEl = document.getElementById('mm-scale');
  const D = api.mapData, [bx0, bz0, bx1, bz1] = D.bbox.map(v => v / 10);
  const span = Math.max(bx1 - bx0, bz1 - bz0), cx0 = (bx0 + bx1) / 2, cz0 = (bz0 + bz1) / 2;

  // the base map, drawn once: about 12 m per pixel
  const N = 2560, mpp = span / N, ox = cx0 - span / 2, oz = cz0 - span / 2;
  const base = document.createElement('canvas'); base.width = base.height = N;
  const b = base.getContext('2d');
  const path = rings => {
    b.beginPath();
    for (const r of rings) { for (let i = 0; i < r.length; i += 2) { const x = (r[i] / 10 - ox) / mpp, y = (r[i + 1] / 10 - oz) / mpp; i ? b.lineTo(x, y) : b.moveTo(x, y); } b.closePath(); }
  };
  b.fillStyle = COUNTRY; b.fillRect(0, 0, N, N);
  path(D.limits); b.fillStyle = CITY; b.fill('evenodd');
  b.fillStyle = PARK; for (const g of D.green) { path(g); b.fill('evenodd'); }
  b.fillStyle = WATER; for (const w of D.water) { path(w); b.fill('evenodd'); }
  path(D.limits); b.strokeStyle = EDGE; b.lineWidth = 2.5; b.setLineDash([9, 6]); b.stroke(); b.setLineDash([]);
  const line = (P, w) => { b.beginPath(); P.forEach((p, i) => { const x = (p.x - ox) / mpp, y = (p.z - oz) / mpp; i ? b.lineTo(x, y) : b.moveTo(x, y); }); b.lineWidth = w; b.stroke(); };
  b.lineJoin = b.lineCap = 'round'; b.globalAlpha = .8;
  for (const r of D.routes) { b.strokeStyle = r.color; line(r.P, 2.5); }
  b.globalAlpha = 1;

  let level = 2, view = null, last = 0, dpr = 1;
  const size = () => { dpr = Math.min(2, window.devicePixelRatio || 1); const w = Math.round(wrap.clientWidth * dpr); if (cv.width !== w) cv.width = cv.height = w; };
  const metres = () => LEVELS[level] || span;

  /** routes of the line being ridden: getRide().line, with the monorails' 'mono:' prefix dropped */
  let rideKey = null, rideRoutes = [];
  function draw(camera) {
    size();
    const W = cv.width, ride = api.rideStrip && api.rideStrip();
    const me = ride ? { x: ride.x, z: ride.z, dx: ride.dx, dz: ride.dz } : (() => { const d = camera.getWorldDirection(camera.position.clone()); return { x: camera.position.x, z: camera.position.z, dx: d.x, dz: d.z }; })();
    const m = metres(), cx = level ? me.x : cx0, cz = level ? me.z : cz0, k = W / m;   // pixels per metre
    view = { cx, cz, m };
    ctx.fillStyle = COUNTRY; ctx.fillRect(0, 0, W, W);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(base, (cx - m / 2 - ox) / mpp, (cz - m / 2 - oz) / mpp, m / mpp, m / mpp, 0, 0, W, W);
    const px = (x, z) => [(x - cx) * k + W / 2, (z - cz) * k + W / 2];
    // the ridden line, bold on top
    if (ride) {
      const car = api.getCar(), key = car && String(car.line).replace(/^mono:/, '');
      if (key !== rideKey) { rideKey = key; rideRoutes = D.routes.filter(r => r.id === key); }
      ctx.lineJoin = ctx.lineCap = 'round'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6 * dpr;
      for (const pass of [0, 1]) {
        if (pass) { ctx.strokeStyle = ride.color; ctx.lineWidth = 3.5 * dpr; }
        for (const r of rideRoutes) { ctx.beginPath(); r.P.forEach((p, i) => { const [x, y] = px(p.x, p.z); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); }
      }
    }
    // djour's restaurants (while their labels are on): gold dots, bigger for three stars
    const E = eats();
    if (E) {
      ctx.fillStyle = '#c8901c'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2 * dpr;
      for (const p of E) {
        const [ex, ey] = px(p.x, p.z); if (ex < -6 || ey < -6 || ex > W + 6 || ey > W + 6) continue;
        ctx.beginPath(); ctx.arc(ex, ey, (p.s >= 3 ? 3.4 : 2.4) * dpr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
    // you: a view cone (flying) or the train (riding)
    const [x, y] = px(me.x, me.z), a = Math.atan2(me.dz, me.dx);
    if (!ride) {
      const r = 34 * dpr, g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(214,69,47,.55)'); g.addColorStop(1, 'rgba(214,69,47,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, a - .5, a + .5); ctx.closePath(); ctx.fill();
    }
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = ride ? ride.color : '#d6452f'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * dpr;
    ctx.beginPath(); ctx.moveTo(8 * dpr, 0); ctx.lineTo(-5 * dpr, 5.5 * dpr); ctx.lineTo(-2.5 * dpr, 0); ctx.lineTo(-5 * dpr, -5.5 * dpr); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // north arrow
    ctx.fillStyle = 'rgba(29,43,54,.75)'; ctx.font = `600 ${11 * dpr}px Archivo, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillText('N', 12 * dpr, 16 * dpr);
    ctx.beginPath(); ctx.moveTo(12 * dpr, 19 * dpr); ctx.lineTo(9 * dpr, 25 * dpr); ctx.lineTo(15 * dpr, 25 * dpr); ctx.closePath(); ctx.fill();
    // scale: a round distance about a quarter of the map
    const nice = [100, 200, 500, 1000, 2000, 5000, 10000].find(v => v >= m / 5) || 10000;
    scaleEl.textContent = nice >= 1000 ? `${nice / 1000} km` : `${nice} m`; scaleEl.style.width = '';
  }

  // on a phone the map starts folded to a small map button (css/style.css .minimap.folded); the
  // choice is kept. Folded only matters there: on bigger screens the button isn't shown.
  const small = matchMedia('(max-width:640px),(max-height:500px)'), tog = document.getElementById('mm-tog');
  let folded = true; try { folded = localStorage.getItem('minimap-open') !== '1'; } catch (e) { /* default */ }
  const fold = f => {
    folded = f; wrap.classList.toggle('folded', f); last = 0;
    tog.setAttribute('aria-expanded', String(!f));
    const t = f ? 'Show the map' : 'Hide the map'; tog.setAttribute('aria-label', t); tog.title = t;
    tog.firstElementChild.innerHTML = f ? '<path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5zM9 4v13.5M15 6.5V20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>'
      : '<path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>';
  };
  tog.addEventListener('click', () => { fold(!folded); try { localStorage.setItem('minimap-open', folded ? '0' : '1'); } catch (e) { /* not kept */ } });
  fold(folded);

  function update(camera, now) {
    if (wrap.hidden || (folded && small.matches) || now - last < 90) return;
    last = now; draw(camera);
  }
  const zoom = d => { level = Math.max(0, Math.min(LEVELS.length - 1, level + d)); last = 0; };
  document.getElementById('mm-in').addEventListener('click', () => zoom(1));
  document.getElementById('mm-out').addEventListener('click', () => zoom(-1));
  cv.addEventListener('wheel', e => { e.preventDefault(); zoom(e.deltaY < 0 ? 1 : -1); }, { passive: false });
  cv.addEventListener('click', e => {
    if (!view) return;
    const r = cv.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width - .5, fz = (e.clientY - r.top) / r.height - .5;
    api.flyToPoint(view.cx + fx * view.m, view.cz + fz * view.m);
  });
  wrap.hidden = false;
  return { update };
}
