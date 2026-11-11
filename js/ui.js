// HUD buttons, hint text and the floating landmark labels.
import * as THREE from 'three';
import { formatHour } from './scene/sky.js';
export function createUI(api) {
  const tagsEl = document.getElementById('tags');
  const LABELS = api.labels.map(({ text, pos, section, stn, far, cutHide }) => {
    const el = document.createElement('div'); el.className = section ? 'tag sub' : stn ? 'tag stn ' + stn : 'tag'; el.textContent = text; tagsEl.appendChild(el);
    return { el, v: pos, section, far: far || 6500, cutHide: cutHide || [] };
  });
  let showTags = true; const pv = new THREE.Vector3();

  function placeTags(camera) {
    if (!!api.getCar() !== carOn) syncCar();
    const w = window.innerWidth, h = window.innerHeight, placed = [];
    LABELS.forEach(l => {
      if (!showTags || carOn || (l.section && l.section !== api.getCut()) || l.cutHide.includes(api.getCut())) { l.el.style.display = 'none'; return; }
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
  const CUT_HINT = 'Market Street cut open: the L (blue) and the T1–T5 trolleys (green) in the subway below. Tunnels that turn away from Market are drawn see-through. Track positions are from OpenStreetMap; depths are estimates.';
  const baseHint = () => (api.getCut() ? CUT_HINT : HINT0);
  const cutBtn = document.getElementById('cut'), CUT_VIEW = api.views.find(v => v.cut);
  const syncCut = () => {
    const on = !!api.getCut(); cutBtn.setAttribute('aria-pressed', String(on));
    cutBtn.textContent = on ? 'Close the cut' : 'Cut away Market St';
    if (!riding && !api.getCar()) hint.textContent = baseHint();
  };
  // 24-hour clock slider (sun position for today's date in Philadelphia)
  const timeIn = document.getElementById('time'), timeOut = document.getElementById('time-out');
  const showTime = h => { timeOut.textContent = formatHour(h); timeIn.setAttribute('aria-valuetext', formatHour(h)); };
  timeIn.value = String(Math.round(api.getTime() * 4) / 4); showTime(api.getTime());
  timeIn.addEventListener('input', () => showTime(api.setTime(+timeIn.value)));
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

  // click any train car (or a monorail car) to ride inside it; underground cars only inside an open cut
  const canvas = api.renderer.domElement, offBtn = document.getElementById('getoff');
  let down = null, carOn = false, hoverPending = false;
  const rel = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  function syncCar() {
    const c = api.getCar(); carOn = !!c; offBtn.hidden = !carOn; canvas.style.cursor = carOn ? 'grab' : '';
    if (c) {
      hint.textContent = c.kind === 'metro'
        ? 'Aboard an L train, inside a SEPTA M-4 car. Drag to look around, W A S D or the arrow keys to walk the aisle, Esc or “Get off” to leave. The sign at the front shows the next stop.'
        : c.kind === 'trolley'
          ? `Aboard a ${c.line} trolley, inside a Kawasaki LRV. Walk up to the front for the view through the windscreen. Drag to look around, W A S D or the arrow keys to walk, Esc or “Get off” to leave.`
          : `Aboard the ${c.lineName}, inside a ${c.model}. Drag to look around, W A S D or the arrow keys to walk the aisle (the cab window is at the front), Esc or “Get off” to leave.`;
      markView(null);
    } else if (!riding) hint.textContent = baseHint();
  }
  canvas.addEventListener('pointerdown', e => {
    down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, t: performance.now(), id: e.pointerId };
    if (carOn) { canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; }
  });
  canvas.addEventListener('pointermove', e => {
    if (carOn) {
      if (down && down.id === e.pointerId) { api.lookCar(e.clientX - down.lx, e.clientY - down.ly); down.lx = e.clientX; down.ly = e.clientY; }
      return;
    }
    if (e.buttons || e.pointerType !== 'mouse' || hoverPending) return;   // hover cursor over a clickable car
    hoverPending = true;
    requestAnimationFrame(() => { hoverPending = false; if (!carOn) canvas.style.cursor = api.pickCar(...rel(e)) ? 'pointer' : ''; });
  });
  const endDrag = e => {
    const d = down; down = null;
    if (carOn) { canvas.style.cursor = 'grab'; return; }
    if (!d || e.type !== 'pointerup' || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || performance.now() - d.t > 600) return;
    const hit = api.pickCar(...rel(e)); if (!hit) return;
    if (riding) { riding = false; rideBtn.textContent = 'Ride a line'; openPicker(false); }
    api.boardCar(hit); syncCar(); syncCut();
  };
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
  // keys: inside a car W A S D / arrows walk the aisle; otherwise they fly the camera over the
  // city, with Space to rise and Shift to sink
  const keys = new Set(), flyKeys = new Set();
  const KEYMAP = { w: 'f', arrowup: 'f', s: 'b', arrowdown: 'b', a: 'l', arrowleft: 'l', d: 'r', arrowright: 'r' };
  const FLYMAP = { ...KEYMAP, ' ': 'u', shift: 'd' };
  const applyKeys = () => api.moveCar((keys.has('f') ? 1 : 0) - (keys.has('b') ? 1 : 0), (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0));
  const applyFly = () => api.setFly((flyKeys.has('f') ? 1 : 0) - (flyKeys.has('b') ? 1 : 0), (flyKeys.has('r') ? 1 : 0) - (flyKeys.has('l') ? 1 : 0), (flyKeys.has('u') ? 1 : 0) - (flyKeys.has('d') ? 1 : 0));
  window.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target, typing = t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && t.type !== 'range'));
    if (typing) return;
    if (carOn) {
      if (e.key === 'Escape') { api.leaveCar(); syncCar(); return; }
      const k = KEYMAP[e.key.toLowerCase()]; if (!k) return;
      e.preventDefault(); keys.add(k); applyKeys();
      return;
    }
    const k = FLYMAP[e.key.toLowerCase()]; if (!k) return;
    if (t && t.type === 'range' && e.key.startsWith('Arrow')) return;   // the time slider keeps its arrow keys
    e.preventDefault();
    if (!flyKeys.size) markView(null);
    flyKeys.add(k); applyFly();
  });
  window.addEventListener('keyup', e => {
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
  [timeIn, lblBtn, rideBtn, cutBtn, trBtn].forEach(b => b.disabled = false);

  return { placeTags };
}
