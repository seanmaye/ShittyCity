// HUD buttons, hint text and the floating landmark labels.
import * as THREE from 'three';
import { formatHour } from './scene/sky.js';
import { createMinimap } from './minimap.js';
import { createRidebar } from './ridebar.js';
import { createFishing } from './fishing.js';
import { createArcade } from './arcade.js';
import { CITY } from './cities.js';
// remembered per viewer and city (browser storage may be unavailable: then nothing is remembered)
const store = { get: k => { try { return localStorage.getItem(CITY.storage + k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(CITY.storage + k, v); } catch (e) { /* ignore */ } } };
export function createUI(api) {
  const tagsEl = document.getElementById('tags');
  const LABELS = api.labels.map(({ text, pos, section, stn, far, cutHide, layer }) => {
    const el = document.createElement('div'); el.className = section ? 'tag sub' : stn ? 'tag stn ' + stn : layer ? 'tag ' + layer : 'tag'; el.textContent = text; tagsEl.appendChild(el);
    return { el, v: pos, section, layer, far: far || 6500, cutHide: cutHide || [] };
  });
  let showTags = true; const pv = new THREE.Vector3();
  // the card for someone you're inhabiting on Walnut St
  const persona = document.getElementById('persona'), peNow = document.getElementById('pe-now');
  let personaOn = null;
  function showPersona(c) {
    persona.hidden = !c; personaOn = c ? c.id : null; if (!c) return;
    document.getElementById('pe-name').textContent = c.name;
    document.getElementById('pe-age').textContent = c.age;
    document.getElementById('pe-sex').textContent = c.sex;
    const tin = Math.round(c.height / 2.54), ft = Math.floor(tin / 12), inch = tin % 12;
    document.getElementById('pe-h').textContent = `${ft}′${inch}″`;
    document.getElementById('pe-h').title = `${c.height} cm`;
    document.getElementById('pe-w').textContent = `${c.lb} lb`;
    document.getElementById('pe-w').title = `${c.kg} kg`;
    peNow.textContent = c.now; document.getElementById('pe-bio').textContent = c.bio;
    // their face, from the same model as their figure in the street
    const face = document.getElementById('pe-face'), cv = api.peds && api.peds.portrait(c.id);
    face.setAttribute('aria-label', `Portrait of ${c.name}`);
    if (cv && cv.parentNode !== face) face.replaceChildren(cv);
  }

  function placeTags(camera) {
    if (!!api.getCar() !== carOn) syncCar();
    if (carOn && personaOn !== null) { const c = api.getCar(); if (c && c.kind === 'person') { if (c.id !== personaOn) syncCar(); else if (c.now !== peNow.textContent) peNow.textContent = c.now; } }
    const now = performance.now(); minimap.update(camera, now); ridebar.update(now);
    const w = window.innerWidth, h = window.innerHeight, placed = [];
    LABELS.forEach(l => {
      if (!showTags || carOn || (l.section && l.section !== api.getCut()) || l.cutHide.includes(api.getCut()) || (l.layer === 't53' && !api.getTransitMap())) { l.el.style.display = 'none'; return; }
      pv.copy(l.v).project(camera);
      if (pv.z > 1 || pv.x < -1.1 || pv.x > 1.1 || pv.y < -1.1 || pv.y > 1.1 || camera.position.distanceTo(l.v) > l.far) { l.el.style.display = 'none'; return; }
      if (!l.wd) { l.el.style.display = 'block'; l.wd = l.el.offsetWidth || 120; }
      const x = (pv.x + 1) / 2 * w; let y = (1 - pv.y) / 2 * h - 8;
      for (let k = 0; k < 6; k++) { const hit = placed.some(r => Math.abs(r.x - x) < (r.w + l.wd) / 2 + 4 && Math.abs(r.y - y) < 24); if (!hit) break; y -= 26; }
      placed.push({ x, y, w: l.wd }); l.el.style.display = 'block'; l.el.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`;
    });
  }

  const lblBtn = document.getElementById('lbl'), rideBtn = document.getElementById('ride'), hint = document.getElementById('hint');
  const HINT0 = hint.textContent;
  const CUT_HINT = CITY.cutHint;
  const baseHint = () => (api.getCut() ? CUT_HINT : HINT0);
  const cutBtn = document.getElementById('cut'), CUT_VIEW = api.views.find(v => v.cut);
  cutBtn.hidden = !CUT_VIEW;   // a city without a cut-away section
  const syncCut = () => {
    const on = !!api.getCut(); cutBtn.setAttribute('aria-pressed', String(on));
    cutBtn.textContent = on ? 'Close the cut' : CITY.cutButton;
    if (!riding && !api.getCar()) hint.textContent = baseHint();
  };
  // 24-hour clock slider (sun position for today's date in the city)
  const timeIn = document.getElementById('time'), timeOut = document.getElementById('time-out');
  const showTime = h => { timeOut.textContent = formatHour(h); timeIn.setAttribute('aria-valuetext', formatHour(h)); };
  timeIn.value = String(Math.round(api.getTime() * 4) / 4); showTime(api.getTime());
  timeIn.addEventListener('input', () => showTime(api.setTime(+timeIn.value)));
  // day/night speed: frozen at the left end; to the right the clock runs ever faster, up to a
  // whole day in 4 seconds (cubic, so the slow end has room: real time sits near 4%)
  const speedIn = document.getElementById('speed'), speedOut = document.getElementById('speed-out');
  const MAX_RATE = 24 / 4;   // hours of model time per real second at the right end
  let rate = 0, clockT = 0, clockUI = 0;
  const showSpeed = () => {
    const v = +speedIn.value / 1000; rate = MAX_RATE * v * v * v;
    const perDay = rate ? 24 / rate : 0, x = rate * 3600;
    speedOut.textContent = !rate ? 'Frozen' : perDay < 120 ? `1 day = ${perDay < 10 ? perDay.toFixed(1) : Math.round(perDay)} s`
      : perDay < 7200 ? `1 day = ${Math.round(perDay / 60)} min` : x < 1.5 ? 'real time' : `${Math.round(x)}× real time`;
    speedIn.setAttribute('aria-valuetext', speedOut.textContent);
  };
  speedIn.addEventListener('input', showSpeed); showSpeed();
  (function tick(now) {
    const dt = clockT ? Math.min(1, (now - clockT) / 1000) : 0; clockT = now;   // capped: no big leap after a sleeping tab
    if (rate && dt) {
      const h = api.setTime((api.getTime() + rate * dt) % 24);
      if (now - clockUI > 120) { clockUI = now; timeIn.value = String(h); showTime(h); }   // the slider follows, a few times a second
    }
    requestAnimationFrame(tick);
  })(0);
  // time of year: snow in winter, blossom and flower beds in spring, autumn colour, bare trees
  const dayIn = document.getElementById('day'), dayOut = document.getElementById('day-out');
  const showDay = d => { dayOut.textContent = api.formatDay(d); dayIn.setAttribute('aria-valuetext', api.formatDay(d)); };
  dayIn.value = String(api.getDay()); showDay(api.getDay());
  let dayPending = false;   // recolouring every tree is a lot of work: once per frame at most
  dayIn.addEventListener('input', () => {
    showDay(+dayIn.value); if (dayPending) return; dayPending = true;
    requestAnimationFrame(() => { dayPending = false; api.setDay(+dayIn.value); });
  });
  lblBtn.addEventListener('click', () => { showTags = !showTags; lblBtn.textContent = showTags ? 'Hide labels' : 'Show labels'; });
  // ride: the main button opens a picker of lines; picking one starts the ride
  const linesEl = document.getElementById('lines');
  const COLORS = { loop: '#d6452f' };
  let riding = false;
  const openPicker = open => { linesEl.hidden = !open; rideBtn.setAttribute('aria-expanded', String(open)); };
  let groupRow = null, groupName = null;
  api.lines.forEach(line => {
    if (line.group !== groupName) {       // a heading and a row of buttons per network
      groupName = line.group; const h = document.createElement('h2'); h.textContent = groupName || 'Lines';
      groupRow = document.createElement('div'); groupRow.className = 'row'; linesEl.append(h, groupRow);
    }
    const b = document.createElement('button'); b.type = 'button'; b.className = 'ghost';
    const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = line.color || COLORS[line.id] || '#1f9a8f'; dot.setAttribute('aria-hidden', 'true');
    b.append(dot, line.name);
    b.addEventListener('click', () => {
      // board the lead car of the line's first train: walk around inside it like any car
      openPicker(false); markView(null);
      if (api.boardLine(line.id)) { syncCar(); syncCut(); }
    });
    groupRow.appendChild(b);
  });
  rideBtn.addEventListener('click', () => {
    if (riding) {
      riding = false; api.setRiding(false); markView('home');
      rideBtn.textContent = 'Ride a line'; hint.textContent = baseHint();
    } else openPicker(linesEl.hidden);
  });

  // "Go to" buttons fly the camera to a preset view (and step off the train if riding)
  const viewEl = document.getElementById('view-btns'), viewBtns = {};
  const markView = id => Object.entries(viewBtns).forEach(([k, b]) => b.setAttribute('aria-current', String(k === id)));
  api.views.forEach(v => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'ghost'; b.textContent = v.name;
    b.addEventListener('click', () => {
      if (riding) { riding = false; rideBtn.textContent = 'Ride a line'; hint.textContent = HINT0; }
      openPicker(false); api.flyTo(v.id); markView(v.id); syncCut();
    });
    viewEl.appendChild(b); viewBtns[v.id] = b;
  });
  markView('home');
  api.controls.addEventListener('start', () => markView(null)); // free look: no preset is current
  cutBtn.addEventListener('click', () => {
    if (api.getCut()) api.setCut(false);
    else if (CUT_VIEW) { if (riding) rideBtn.click(); api.flyTo(CUT_VIEW.id); markView(CUT_VIEW.id); }
    syncCut();
  });
  syncCut();

  // click any train car (or a monorail car) to ride inside it; underground cars only inside an open cut.
  // A cafe chair or bench on Walnut St works the same way: click to sit, Esc to stand up.
  const canvas = api.renderer.domElement, offBtn = document.getElementById('getoff');
  let down = null, carOn = false, hoverPending = false;
  // creative mode: right-clicking the view captures the mouse (pointer lock); the mouse then turns the
  // camera directly (or looks around inside a car), a crosshair marks the centre, Esc lets go
  const xhair = document.getElementById('xhair');
  let locked = false, speedTimer = 0;
  const lockMouse = () => { if (!locked && canvas.requestPointerLock) { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } };
  // the pill at the bottom says how to get in and out of creative mode
  const modeHint = document.getElementById('modehint');
  const syncModeHint = () => {
    modeHint.innerHTML = carOn ? ''
      : locked ? 'Flying · <kbd>W A S D</kbd> move · <kbd>Space</kbd> / <kbd>Shift</kbd> up and down · scroll for speed · click a train to board, a chair to sit or a person to see through their eyes · <kbd>Esc</kbd> to let go'
      : '<kbd>Right-click</kbd> to fly with the mouse (creative mode)';
  };
  canvas.addEventListener('contextmenu', e => e.preventDefault());   // right-click enters creative mode instead
  syncModeHint();
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas; xhair.hidden = !locked; syncModeHint();
    if (locked) { if (!carOn) { api.setCreative(true); markView(null); } }
    else api.setCreative(false);
  });
  document.addEventListener('mousemove', e => {
    if (!locked) return;
    if (carOn) api.lookCar(e.movementX, e.movementY); else api.creativeLook(e.movementX, e.movementY);
  });
  canvas.addEventListener('wheel', e => {
    if (!api.getCreative()) return;
    e.preventDefault();
    const m = api.creativeSpeed(e.deltaY);
    const st = document.getElementById('status'); st.textContent = `Flying speed ×${m.toFixed(m < 1 ? 2 : 1)}`;
    clearTimeout(speedTimer); speedTimer = setTimeout(() => { st.textContent = ''; }, 1200);
  }, { passive: false });
  const rel = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  function syncCar() {
    const c = api.getCar(); carOn = !!c; offBtn.hidden = !carOn; canvas.style.cursor = carOn ? 'grab' : '';
    if (!carOn && locked) api.setCreative(true);   // got off with the mouse still captured: back to flying
    syncModeHint();
    offBtn.textContent = c && c.kind === 'seat' ? 'Stand up' : c && c.kind === 'person' ? 'Leave' : 'Get off';
    showPersona(c && c.kind === 'person' ? c : null);
    if (c) {
      // Philadelphia's Walnut St (people, seats), L and trolleys have their own wording; every
      // other car uses its model name
      hint.textContent = c.kind === 'person'
        ? `Seeing Walnut Street through ${c.name}’s eyes. You can’t steer; you go where they go. Drag or click to look around, Space, Esc or “Leave” to step out.`
        : c.kind === 'seat'
        ? (c.seat === 'cafe' ? 'Sitting at a café table on Walnut Street.' : 'Sitting on a bench on Walnut Street.') + ' Drag or click to look around, Space, Esc or “Stand up” to get up.'
        : c.kind === 'metro'
        ? 'Aboard an L train, inside a SEPTA M-4 car. Drag or click to look around, W A S D or the arrow keys to walk the aisle, Esc or “Get off” to leave. The sign at the front shows the next stop.'
        : c.kind === 'trolley'
          ? `Aboard a ${c.line} trolley, inside a Kawasaki LRV. Walk up to the front for the view through the windscreen. Drag or click to look around, W A S D or the arrow keys to walk, Esc or “Get off” to leave.`
          : `Aboard the ${c.lineName}, inside a ${c.model}. Drag or click to look around, W A S D or the arrow keys to walk the aisle (the cab window is at the front), Esc or “Get off” to leave.`;
      markView(null);
    } else if (!riding) hint.textContent = baseHint();
  }
  canvas.addEventListener('pointerdown', e => {
    if (locked) { down = { lockedClick: true }; return; }
    down = { button: e.button, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, t: performance.now(), id: e.pointerId };
    if (carOn) { canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; }
  });
  canvas.addEventListener('pointermove', e => {
    if (locked) return;   // handled by the mousemove listener above
    if (carOn) {
      if (down && down.id === e.pointerId) { api.lookCar(e.clientX - down.lx, e.clientY - down.ly); down.lx = e.clientX; down.ly = e.clientY; }
      return;
    }
    if (e.buttons || e.pointerType !== 'mouse' || hoverPending) return;   // hover cursor over a clickable car
    hoverPending = true;
    requestAnimationFrame(() => { hoverPending = false; if (!carOn) canvas.style.cursor = api.pickCar(...rel(e)) || anglerAt(...rel(e)) != null || stallAt(...rel(e)) ? 'pointer' : ''; });
  });
  const endDrag = e => {
    const d = down; down = null;
    if (d && d.lockedClick) {   // mouse captured: click the train under the crosshair
      if (carOn || e.type !== 'pointerup') return;
      const ai = anglerAt(canvas.clientWidth / 2, canvas.clientHeight / 2);   // someone fishing under the crosshair
      if (ai != null) { document.exitPointerLock(); fishing.open(ai); return; }
      if (stallAt(canvas.clientWidth / 2, canvas.clientHeight / 2)) { document.exitPointerLock(); arcade.open(); return; }   // the arcade stall
      const hit = api.pickCar(canvas.clientWidth / 2, canvas.clientHeight / 2); if (!hit) return;
      if (riding) { riding = false; rideBtn.textContent = 'Ride a line'; openPicker(false); }
      api.boardCar(hit); syncCar(); syncCut(); return;
    }
    const click = d && e.type === 'pointerup' && Math.hypot(e.clientX - d.x, e.clientY - d.y) <= 6 && performance.now() - d.t <= 600;
    if (carOn) { canvas.style.cursor = 'grab'; if (click) lockMouse(); return; }
    if (!click) return;
    if (d.button === 2) { lockMouse(); return; }   // right-click (not a right-drag pan): creative mode
    const ai = anglerAt(...rel(e));   // someone fishing on the Schuylkill: they ask you to join them
    if (ai != null) { if (riding) { riding = false; api.setRiding(false, true); rideBtn.textContent = 'Ride a line'; openPicker(false); } fishing.open(ai); return; }
    if (stallAt(...rel(e))) { if (riding) { riding = false; api.setRiding(false, true); rideBtn.textContent = 'Ride a line'; openPicker(false); } arcade.open(); return; }   // Chinatown's Lucky Arcade
    const hit = api.pickCar(...rel(e)); if (!hit) return;   // only a right-click enters creative mode
    if (riding) { riding = false; rideBtn.textContent = 'Ride a line'; openPicker(false); }
    api.boardCar(hit); syncCar(); syncCut();
  };
  // fishing (Philadelphia): the anglers on the Schuylkill banks, and the minigame
  const fishing = api.pickAngler ? createFishing(api) : { open() {}, active: () => false };
  const anglerAt = (x, y) => (api.pickAngler ? api.pickAngler(x, y) : null);
  // the arcade stall in Chinatown's night market (Philadelphia): its games (js/arcade.js)
  const arcade = api.pickStall ? createArcade(api) : { open() {}, active: () => false };
  const stallAt = (x, y) => (api.pickStall ? api.pickStall(x, y) : false);
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
  // keys: inside a car W A S D / arrows walk the aisle; otherwise they fly the camera over the
  // city, with Space to rise and Shift to sink
  const keys = new Set(), flyKeys = new Set();
  let holdSpace = false;   // the Space press that stood up from a seat doesn't also fly up, until it's released
  const KEYMAP = { w: 'f', arrowup: 'f', s: 'b', arrowdown: 'b', a: 'l', arrowleft: 'l', d: 'r', arrowright: 'r' };
  const FLYMAP = { ...KEYMAP, ' ': 'u', shift: 'd' };
  const applyKeys = () => api.moveCar((keys.has('f') ? 1 : 0) - (keys.has('b') ? 1 : 0), (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0));
  const applyFly = () => api.setFly((flyKeys.has('f') ? 1 : 0) - (flyKeys.has('b') ? 1 : 0), (flyKeys.has('r') ? 1 : 0) - (flyKeys.has('l') ? 1 : 0), (flyKeys.has('u') ? 1 : 0) - (flyKeys.has('d') ? 1 : 0));
  window.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || fishing.active() || arcade.active()) return;   // the fishing and arcade dialogs have the keys
    const t = e.target, typing = t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && t.type !== 'range'));
    if (typing) return;
    if (carOn) {
      // Esc gets off any train or stands up from a seat; Space also stands up from a seat
      if (e.key === 'Escape' || (e.key === ' ' && ['seat', 'person'].includes(api.getCar().kind))) { e.preventDefault(); if (e.key === ' ') holdSpace = true; api.leaveCar(); syncCar(); return; }
      const k = KEYMAP[e.key.toLowerCase()]; if (!k) return;
      e.preventDefault(); keys.add(k); applyKeys();
      return;
    }
    if (e.key === ' ' && holdSpace) { e.preventDefault(); return; }
    const k = FLYMAP[e.key.toLowerCase()]; if (!k) return;
    if (t && t.type === 'range' && e.key.startsWith('Arrow')) return;   // the time slider keeps its arrow keys
    e.preventDefault();
    if (!flyKeys.size) markView(null);
    flyKeys.add(k); applyFly();
  });
  window.addEventListener('keyup', e => {
    if (e.key === ' ') holdSpace = false;
    const k = KEYMAP[e.key.toLowerCase()]; if (k) { keys.delete(k); applyKeys(); }
    const f = FLYMAP[e.key.toLowerCase()]; if (f && flyKeys.delete(f)) { applyFly(); if (e.key === ' ') e.preventDefault(); }
  });
  window.addEventListener('blur', () => { keys.clear(); applyKeys(); flyKeys.clear(); applyFly(); });
  offBtn.addEventListener('click', () => { api.leaveCar(); syncCar(); });
  // "Show transit lines": highlight every line in its colour, with a legend
  const trBtn = document.getElementById('transit'), legendEl = document.getElementById('legend');
  for (const it of api.legend) {
    const s = document.createElement('span'), i = document.createElement('i'); i.style.background = it.color; i.setAttribute('aria-hidden', 'true');
    s.append(i, it.name); legendEl.appendChild(s);
  }
  trBtn.addEventListener('click', () => {
    const on = api.setTransitMap(!api.getTransitMap());
    trBtn.setAttribute('aria-pressed', String(on)); trBtn.textContent = on ? 'Hide transit lines' : 'Show transit lines'; legendEl.hidden = !on;
  });
  // the 1953 streetcar stripes share the transit legend, under their own heading
  if (api.oldTrolleyLegend.length) { const h53 = document.createElement('b'); h53.className = 'legend-h'; h53.textContent = 'Former streetcar lines (1953 map)'; legendEl.appendChild(h53); }
  for (const it of api.oldTrolleyLegend) {
    const s = document.createElement('span'), i = document.createElement('i'); i.className = it.kind; i.style.setProperty('--c', it.color); i.setAttribute('aria-hidden', 'true');
    s.append(i, it.name); legendEl.appendChild(s);
  }
  // fold the panel down to its title (remembered; folded by default on small screens)
  const card = document.querySelector('.hud .card'), body = document.getElementById('hud-body'), foldBtn = document.getElementById('fold');
  const fold = on => {
    body.hidden = on; card.classList.toggle('folded', on); foldBtn.setAttribute('aria-expanded', String(!on));
    const t = on ? 'Expand the panel' : 'Collapse the panel'; foldBtn.setAttribute('aria-label', t); foldBtn.title = t;
  };
  const saved = store.get('folded');
  fold(saved == null ? window.innerWidth < 640 : saved === '1');
  foldBtn.addEventListener('click', () => { const on = !body.hidden; fold(on); store.set('folded', on ? '1' : '0'); });

  // skyline display lights: a colour scheme for the towers' crowns, the Cira Centre's LED skin,
  // the FMC crown and Boathouse Row, as the city does for teams and holidays
  const swatches = document.getElementById('swatches'), skyName = document.getElementById('sky-name'), skyColor = document.getElementById('sky-color');
  const customSw = skyColor.closest('.swatch'), swBtns = [];
  const statusEl = document.getElementById('status'); let skyTimer = 0;
  function setScheme(id, colors, name, quiet) {
    api.setDisplayLights(colors); skyName.textContent = name;
    swBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
    customSw.classList.toggle('on', id === 'custom');
    store.set('skyline', id === 'custom' ? 'custom:' + colors[0] : id);
    if (!quiet && api.getMood() === 'day') {   // the lights only show after dark
      statusEl.textContent = 'Skyline lights show after dark: slide the time past sunset.';
      clearTimeout(skyTimer); skyTimer = setTimeout(() => { statusEl.textContent = ''; }, 3200);
    }
  }
  for (const p of api.displayPresets) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'swatch'; b.dataset.id = p.id;
    b.title = p.name; b.setAttribute('aria-label', p.name + ' skyline lights');
    const n = p.colors.length;
    b.style.setProperty('--sw', n === 1 ? p.colors[0] : `conic-gradient(${p.colors.map((c, i) => `${c} ${i / n * 360}deg ${(i + 1) / n * 360}deg`).join(',')})`);
    b.addEventListener('click', () => setScheme(p.id, p.colors, p.name));
    swatches.insertBefore(b, customSw); swBtns.push(b);
  }
  skyColor.addEventListener('input', () => setScheme('custom', [skyColor.value], 'Your colour'));
  const sk = store.get('skyline') || 'white', pre = api.displayPresets.find(p => p.id === sk);
  if (sk.startsWith('custom:')) { skyColor.value = sk.slice(7); setScheme('custom', [skyColor.value], 'Your colour', true); }
  else setScheme(pre ? pre.id : 'white', (pre || api.displayPresets[0]).colors, (pre || api.displayPresets[0]).name, true);

  const minimap = createMinimap(api), ridebar = createRidebar(api);
  [timeIn, speedIn, dayIn, lblBtn, rideBtn, cutBtn, trBtn].forEach(b => b.disabled = false);

  return { placeTags };
}
