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
// a touch screen (no mouse, no keyboard to speak of), and a small screen (a phone either way up):
// the wording, the walk pad and the panel follow them (css/style.css has the same breakpoints)
const TOUCH = matchMedia('(pointer: coarse)'), COMPACT = matchMedia('(max-width: 640px), (max-height: 500px)');
/** text written for the mouse, said for a finger: click -> tap (cities' own hints, c.hint) */
export function touchify(t) {
  if (!TOUCH.matches || !t) return t;
  return t.replace(/Drag or click to look around/g, 'Drag to look around').replace(/\b(Space, )?Esc or (“[^”]+”)/g, '$2')
    .replace(/\b([Cc])lick(s|ed|ing)?\b/g, (m, c, end) => (c === 'C' ? 'T' : 't') + 'ap' + ({ s: 's', ed: 'ped', ing: 'ping' }[end] || ''));
}
/** how to move around, after each city's own hint */
const controlsHint = trains => TOUCH.matches
  ? 'Drag to turn the view, pinch to zoom, and drag with two fingers to move.' + (trains ? ' Tap any train to ride inside it.' : '')
  : 'Right-click the view to fly with the mouse, like creative mode: the mouse looks around, W A S D fly, Space and Shift rise and sink, scroll sets the speed, Esc lets go. Or drag to orbit and scroll to zoom.' + (trains ? ' Click any train to ride inside it.' : '');
export function createUI(api) {
  const toastEl = document.getElementById('toast'); let toastTimer = 0;
  const toast = (msg, ms) => { toastEl.textContent = msg; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.textContent = ''; }, ms); };
  const tagsEl = document.getElementById('tags');
  const LABELS = api.labels.map(({ text, pos, section, stn, far, cutHide, layer, stars, eat }) => {
    const el = document.createElement('div'); el.className = section ? 'tag sub' : stn ? 'tag stn ' + stn : layer ? 'tag ' + layer : 'tag'; el.textContent = text; tagsEl.appendChild(el);
    if (layer === 'eat') {   // a restaurant: its stars before the name, and a click opens its card
      const st = document.createElement('span'); st.className = 'st'; st.textContent = '★'.repeat(stars); el.prepend(st);
      if (stars >= 3) el.classList.add('s3');
      el.addEventListener('click', () => goEat(eat));   // fly to the front of it, and show its card
    }
    return { el, v: pos, section, layer, far: far || 6500, cutHide: cutHide || [] };
  });
  let showTags = true, showEats = true; const pv = new THREE.Vector3();
  // the card for someone you're inhabiting on Walnut St
  const persona = document.getElementById('persona'), peNow = document.getElementById('pe-now');
  let personaOn = null;
  // on a small screen the card folds down to the name and what they're doing (someone new: the whole card)
  const peFold = document.getElementById('pe-fold');
  const foldPersona = on => {
    persona.classList.toggle('min', on); peFold.setAttribute('aria-expanded', String(!on));
    const t = on ? 'Show the whole card' : 'Fold the card'; peFold.setAttribute('aria-label', t); peFold.title = t;
  };
  peFold.addEventListener('click', () => foldPersona(!persona.classList.contains('min')));
  function showPersona(c) {
    if (!c || c.id !== personaOn) foldPersona(false);
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
    const face = document.getElementById('pe-face'), cv = c.portrait ? c.portrait() : api.peds && api.peds.portrait(c.id);
    face.setAttribute('aria-label', `Portrait of ${c.name}`);
    if (cv && cv.parentNode !== face) face.replaceChildren(cv);
  }

  // things to do as the person you are inside (c.actions: [{ id, label, key, on }]), in a bar at the
  // bottom; and the mask of the binoculars they are looking through (c.bino: 0 down .. 1 up)
  const actEl = document.getElementById('actions'), binoc = document.getElementById('binoc'), binocCap = document.getElementById('binoc-cap'), actBtns = [];
  let actIds = '';
  function syncActions(c) {
    const acts = (c && c.actions) || [], ids = acts.map(a => a.id).join();
    if (ids !== actIds) {
      actIds = ids; actEl.hidden = !acts.length; actBtns.length = 0;
      actEl.replaceChildren(...acts.map(a => {
        const b = document.createElement('button'), t = document.createElement('span'), k = document.createElement('kbd');
        b.type = 'button'; b.className = 'ghost'; k.textContent = a.key; b.append(t); if (a.key) b.append(k);
        b.addEventListener('click', () => {
          const was = api.getCar(); api.actCar(a.id); b.blur();   // (blur: Space must still mean "leave", not "press this again")
          const now = api.getCar(); if (!now !== !was || (now && (now.kind !== was.kind || now.id !== was.id))) syncCar();   // it put you somewhere else (the overlook's "See through his eyes")
        });
        actBtns.push({ b, t }); return b;
      }));
    }
    acts.forEach((a, i) => {
      const { b, t } = actBtns[i];
      if (t.textContent !== a.label) t.textContent = a.label;
      if (a.on !== undefined && b.getAttribute('aria-pressed') !== String(a.on)) b.setAttribute('aria-pressed', String(a.on));
    });
    // binoculars up: the card steps aside, and what they are looking at is written under the view
    const k = (c && c.bino) || 0;
    if (binoc.hidden !== k < .01) binoc.hidden = k < .01;
    if (k >= .01) {
      binoc.style.opacity = k.toFixed(2); if (binocCap.textContent !== c.now) binocCap.textContent = c.now;
      const how = TOUCH.matches ? 'Spread or pinch two fingers to zoom' : 'Scroll to zoom'; if (binocCap.dataset.how !== how) binocCap.dataset.how = how;
    }
    persona.classList.toggle('away', k > .5);
  }

  // the panels a label keeps out from under (it can't be read there, and on a phone they cover
  // much of the view): measured a few times a second, before this frame's writes, not every frame
  const CHROME = '.hud .card, #minimap, .mm-ctl, .dock > :not([hidden]), #walkpad:not([hidden]), #binoc-cap, .fish-card, .arc-card, #eatcard:not([hidden]), .kinfo:not([hidden])';
  let chrome = [], chromeT = -1e9;
  function placeTags(camera) {
    const now = performance.now();
    if (now - chromeT > 250) { chromeT = now; chrome = [...document.querySelectorAll(CHROME)].map(e => e.getBoundingClientRect()).filter(r => r.width > 1 && r.height > 1); }
    const car = api.getCar();
    if (!!car !== carOn) syncCar();
    if (carOn && personaOn !== null) { const c = car; if (c && c.kind === 'person') { if (c.id !== personaOn) syncCar(); else if (c.now !== peNow.textContent) peNow.textContent = c.now; } }
    syncActions(car);
    minimap.update(camera, now); ridebar.update(now);
    const w = window.innerWidth, h = window.innerHeight, placed = [], inCar = carOn && !(car && car.labels);   // (from the overlook the place names help)
    const noTags = !showTags || inCar, noEats = !showEats || inCar;   // restaurant labels have their own switch
    // near the ground only nearby labels: far ones would pile up along the horizon over the street
    const lift = camera.position.y - (api.groundAt ? api.groundAt(camera.position.x, camera.position.z) : 0), reach = Math.max(250, lift * 20);
    // a label sits above its place; one that would sit on another is lifted above it (on a phone only
    // twice: stacks of names fill a small screen); with no room above (another name, a panel, the top
    // of the screen) it hangs below the place instead; with no room at all it is left out, never
    // drawn over the rest or under a panel
    const lifts = COMPACT.matches ? 2 : 6, hide = l => { l.el.style.display = 'none'; };
    LABELS.forEach(l => {
      if ((l.layer === 'eat' ? noEats : noTags) || (l.section && l.section !== api.getCut()) || l.cutHide.includes(api.getCut()) || (l.layer === 't53' && !api.getTransitMap())) { hide(l); return; }
      pv.copy(l.v).project(camera);
      if (pv.z > 1 || pv.x < -1 || pv.x > 1 || pv.y < -1 || pv.y > 1 || camera.position.distanceTo(l.v) > Math.min(l.far, reach)) { hide(l); return; }
      if (!l.wd) { l.el.style.display = 'block'; l.wd = l.el.offsetWidth || 120; l.ht = l.el.offsetHeight || 22; }
      const ax = (pv.x + 1) / 2 * w, ay = (1 - pv.y) / 2 * h, half = l.wd / 2;
      if (ax < 8 || ax > w - 8 || ay < 8 || ay > h - 8 || chrome.some(r => ax > r.left && ax < r.right && ay > r.top && ay < r.bottom)) { hide(l); return; }   // the place itself is off the screen or under a panel
      // kept on the screen: slid in from the edge, its stem still on the place
      const x = Math.min(w - 4 - half, Math.max(4 + half, ax)), x0 = x - half, x1 = x + half;
      const free = (top, bot) => top > 2 && bot < h - 2 && !placed.some(r => x0 < r.x1 + 4 && x1 > r.x0 - 4 && top < r.bot && bot > r.top)
        && !chrome.some(r => x0 < r.right && x1 > r.left && top < r.bottom && bot > r.top);
      let top = -1;
      for (let k = 0, y = ay - 8; k <= lifts; k++, y -= 26) if (free(y - l.ht, y + (k ? 0 : 8))) { top = y - l.ht; break; }
      const below = top < 0 && free(ay, ay + 8 + l.ht);
      if (below) top = ay + 8;
      if (top < 0) { hide(l); return; }
      placed.push({ x0, x1, top, bot: top + l.ht }); l.el.style.display = 'block'; l.el.style.transform = `translate(${x0}px,${top}px)`;
      if (below !== !!l.below) { l.below = below; l.el.classList.toggle('below', below); }
      const sx = Math.round(ax - x); if (sx !== l.sx) { l.sx = sx; l.el.style.setProperty('--sx', sx + 'px'); }
    });
  }

  const lblBtn = document.getElementById('lbl'), rideBtn = document.getElementById('ride'), hint = document.getElementById('hint');
  const hintMore = document.getElementById('hint-more');
  // on small screens the hint shows three lines; More opens the rest
  const syncMore = () => { hintMore.hidden = hint.classList.contains('open') ? false : !(hint.scrollHeight > hint.clientHeight + 1); };
  const setHint = t => {
    t = touchify(t); if (hint.textContent === t) return;
    hint.textContent = t; hint.classList.remove('open'); hintMore.textContent = 'More'; hintMore.setAttribute('aria-expanded', 'false');
    requestAnimationFrame(syncMore);
  };
  hintMore.addEventListener('click', () => {
    const open = hint.classList.toggle('open'); hintMore.textContent = open ? 'Less' : 'More'; hintMore.setAttribute('aria-expanded', String(open));
  });
  COMPACT.addEventListener('change', () => requestAnimationFrame(syncMore));
  const HINT0 = CITY.hint + ' ' + controlsHint(api.lines.length > 0);
  const CUT_HINT = CITY.cutHint;
  const baseHint = () => (api.getCut() ? CUT_HINT : HINT0);
  const cutBtn = document.getElementById('cut'), CUT_VIEW = api.views.find(v => v.cut);
  cutBtn.hidden = !CUT_VIEW;   // a city without a cut-away section
  // on a phone the panel folds away to show the cut, hint and all: a line at the bottom says what
  // you're looking at and closes it (css/style.css .cut-mini: small screens, panel folded, not aboard)
  const cutMini = document.createElement('div'), cutTxt = document.createElement('p'), cutClose = document.createElement('button');
  cutMini.className = 'dock-mini cut-mini'; cutMini.id = 'cut-mini'; cutMini.hidden = true; cutMini.setAttribute('role', 'group'); cutMini.setAttribute('aria-label', 'Cut-away');
  cutTxt.textContent = touchify(((CITY.cutHint || '').match(/^.*?\.(?=\s|$)/) || [''])[0] + ' Click a train in the cut to ride it.');
  cutClose.type = 'button'; cutClose.className = 'ghost'; cutClose.textContent = 'Close'; cutClose.setAttribute('aria-label', 'Close the cut');
  cutClose.addEventListener('click', () => cutBtn.click());
  cutMini.append(cutTxt, cutClose); if (CUT_VIEW) document.getElementById('dock').appendChild(cutMini);
  const syncCut = () => {
    const on = !!api.getCut(); cutBtn.setAttribute('aria-pressed', String(on)); cutMini.hidden = !on;
    cutBtn.textContent = on ? 'Close the cut' : CITY.cutButton;
    if (!riding && !api.getCar()) setHint(baseHint());
  };
  // 24-hour clock slider (sun position for today's date in the city)
  const timeIn = document.getElementById('time'), timeOut = document.getElementById('time-out');
  const showTime = h => { timeOut.textContent = formatHour(h); timeIn.setAttribute('aria-valuetext', formatHour(h)); };
  timeIn.value = String(api.getTime()); showTime(api.getTime());
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
  dayIn.max = String(api.lastDay);
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
  // the panel scrolls on a short screen: bring what just opened under the buttons into sight (as
  // much of it as fits), or tapping "Ride a line" seems to do nothing
  const reveal = el => requestAnimationFrame(() => {
    const box = document.getElementById('hud-body'), r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
    if (!el.hidden && r.bottom > b.bottom) box.scrollTop += Math.max(0, Math.min(r.bottom - b.bottom + 8, r.top - b.top - 8));
  });
  const openPicker = open => { linesEl.hidden = !open; rideBtn.setAttribute('aria-expanded', String(open)); if (open) reveal(linesEl); };
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
      if (api.boardLine(line.id)) { syncCar(); syncCut(); autoFold(); }
    });
    groupRow.appendChild(b);
  });
  rideBtn.hidden = !api.lines.length;   // a city without rail transit
  rideBtn.addEventListener('click', () => {
    if (riding) {
      riding = false; api.setRiding(false); markView('home');
      rideBtn.textContent = 'Ride a line'; setHint(baseHint());
    } else openPicker(linesEl.hidden);
  });

  // "Go to" buttons fly the camera to a preset view (and step off the train if riding)
  const viewEl = document.getElementById('view-btns'), viewBtns = {};
  const markView = id => Object.entries(viewBtns).forEach(([k, b]) => b.setAttribute('aria-current', String(k === id)));
  api.views.forEach(v => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'ghost'; b.textContent = v.name;
    b.addEventListener('click', () => {
      if (riding) { riding = false; rideBtn.textContent = 'Ride a line'; setHint(HINT0); }
      openPicker(false); api.flyTo(v.id); markView(v.id); syncCut(); autoFold();
      if (v.when) {   // the view may have moved the season and the clock: the sliders follow
        timeIn.value = String(api.getTime()); showTime(api.getTime());
        dayIn.value = String(api.getDay()); showDay(api.getDay());
      }
    });
    viewEl.appendChild(b); viewBtns[v.id] = b;
  });
  markView('home');
  api.controls.addEventListener('start', () => markView(null)); // free look: no preset is current

  // "Restaurants": djour's starred picks (js/scene/phl/restaurants.js): their labels' own switch, a
  // neighbourhood picker and a button per place; a place's button or label flies there and opens its card
  const EATS = (api.restaurants && api.restaurants.places) || [], eatsEl = document.getElementById('eats');
  const eatCard = document.getElementById('eatcard'), eatBtn = document.getElementById('eat-lbl');
  const hoodSel = document.getElementById('eat-hood'), eatList = document.getElementById('eat-list');
  const STAR_WORDS = (api.restaurants && api.restaurants.stars) || {};
  const KIND_WORD = { restaurant: 'Restaurant', bar: 'Bar', cafe: 'Café', bakery: 'Bakery', brewery: 'Brewery', truck: 'Food truck', market: 'Farmers market' };
  let eatOn = null;
  function openEat(i) {
    const p = EATS[i]; if (!p) return;
    eatOn = i; eatCard.hidden = false;
    document.getElementById('eat-name').textContent = p.n;
    document.getElementById('eat-stars').textContent = `${'★'.repeat(p.s)} ${STAR_WORDS[p.s] || ''}`.trim();
    document.getElementById('eat-meta').textContent = [p.soon ? 'Coming soon' : null, p.club ? 'Supper club' : KIND_WORD[p.k], p.p, p.hood].filter(Boolean).join(' · ');
    document.getElementById('eat-tags').textContent = p.c.join(' · ');
    const note = document.getElementById('eat-note'); note.hidden = !p.d; note.textContent = p.d || '';
    LABELS.forEach(l => l.el.classList.toggle('on', l.layer === 'eat' && l.el === eatTag[i]));
  }
  function goEat(i) {
    const p = EATS[i]; if (!p) return;
    if (riding) { riding = false; rideBtn.textContent = 'Ride a line'; hint.textContent = HINT0; }
    openPicker(false); api.flyTo(p.view); markView(null); openEat(i);
  }
  // the card's link to djour opens in a new tab (also from inside the single-file build)
  eatCard.querySelector('.eat-src a').addEventListener('click', e => { e.preventDefault(); window.open(e.currentTarget.href, '_blank', 'noopener'); });
  const eatTag = []; LABELS.forEach((l, k) => { if (l.layer === 'eat') eatTag[api.labels[k].eat] = l.el; });
  document.getElementById('eat-x').addEventListener('click', () => { eatCard.hidden = true; eatOn = null; LABELS.forEach(l => l.el.classList.remove('on')); });
  if (EATS.length) {
    eatsEl.hidden = false;
    eatBtn.addEventListener('click', () => {
      showEats = !showEats; eatBtn.textContent = showEats ? 'Hide restaurant labels' : 'Show restaurant labels'; eatBtn.setAttribute('aria-pressed', String(showEats));
    });
    const hoods = {}; EATS.forEach(p => { hoods[p.hood || 'Elsewhere'] = (hoods[p.hood || 'Elsewhere'] || 0) + 1; });
    hoodSel.append(new Option(`Three-star picks (${EATS.filter(p => p.s >= 3).length})`, '★3'), new Option(`All (${EATS.length})`, ''),
      ...Object.keys(hoods).sort().map(h => new Option(`${h} (${hoods[h]})`, h)));
    const fill = () => {
      const v = hoodSel.value, list = EATS.filter(p => (v === '★3' ? p.s >= 3 : !v || (p.hood || 'Elsewhere') === v))
        .sort((a, b) => b.s - a.s || a.n.localeCompare(b.n));
      eatList.replaceChildren(...list.map(p => {
        const b = document.createElement('button'), st = document.createElement('span');
        b.type = 'button'; b.className = 'ghost'; st.className = 'st'; st.textContent = '★'.repeat(p.s); b.append(st, p.n);
        b.addEventListener('click', () => goEat(p.i));
        return b;
      }));
    };
    hoodSel.addEventListener('change', fill); fill();
  }
  cutBtn.addEventListener('click', () => {
    if (api.getCut()) api.setCut(false);
    else if (CUT_VIEW) { if (riding) rideBtn.click(); api.flyTo(CUT_VIEW.id); markView(CUT_VIEW.id); autoFold(); }
    syncCut();
  });
  syncCut();

  // click any train car (or a monorail car) to ride inside it; underground cars only inside an open cut.
  // A cafe chair or bench on Walnut St works the same way: click to sit, Esc to stand up.
  const canvas = api.renderer.domElement, offBtn = document.getElementById('getoff'), walkpad = document.getElementById('walkpad');
  const releaseWalk = () => { if (!walkpad) return; walkpad.querySelectorAll('button.on').forEach(b => b.classList.remove('on')); };
  let down = null, carOn = false, hoverPending = false;
  // creative mode: right-clicking the view captures the mouse (pointer lock); the mouse then turns the
  // camera directly (or looks around inside a car), a crosshair marks the centre, Esc lets go
  const xhair = document.getElementById('xhair');
  let locked = false;
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
    if (carOn && api.wheelCar(e.deltaY)) { e.preventDefault(); return; }   // binoculars: zoom
    if (!api.getCreative()) return;
    e.preventDefault();
    const m = api.creativeSpeed(e.deltaY);
    toast(`Flying speed ×${m.toFixed(m < 1 ? 2 : 1)}`, 1200);
  }, { passive: false });
  // binoculars on a touch screen: spread two fingers to zoom in, pinch to zoom out, a wheel step
  // (api.wheelCar) for every 20% the fingers' spread changes; one finger looks around, two don't
  const fingers = new Map(), PINCH = Math.log(1.2); let pinch = null;
  const spread = () => { const [a, b] = [...fingers.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]) || 1; };
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    fingers.set(e.pointerId, [e.clientX, e.clientY]); if (fingers.size === 2 && carOn) pinch = { d: spread(), k: 0 };
  });
  canvas.addEventListener('pointermove', e => {
    if (!fingers.has(e.pointerId)) return;
    fingers.set(e.pointerId, [e.clientX, e.clientY]); if (!pinch || fingers.size !== 2) return;
    const d = spread(); pinch.k += Math.log(d / pinch.d); pinch.d = d;
    for (; pinch.k > PINCH; pinch.k -= PINCH) api.wheelCar(-1);
    for (; pinch.k < -PINCH; pinch.k += PINCH) api.wheelCar(1);
  });
  const lift = e => { fingers.delete(e.pointerId); if (fingers.size < 2) pinch = null; };
  canvas.addEventListener('pointerup', lift); canvas.addEventListener('pointercancel', lift);
  const rel = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  function syncCar() {
    const c = api.getCar(); carOn = !!c; offBtn.hidden = !carOn; canvas.style.cursor = carOn ? 'grab' : '';
    const walk = carOn && !['seat', 'person', 'vista'].includes(c.kind);
    document.body.classList.toggle('aboard', carOn); document.body.classList.toggle('aboard-walk', walk);
    walkpad.hidden = !(walk && TOUCH.matches); if (walkpad.hidden) releaseWalk();
    if (!carOn && locked) api.setCreative(true);   // got off with the mouse still captured: back to flying
    syncModeHint();
    offBtn.textContent = c && c.kind === 'seat' ? 'Stand up' : c && c.kind === 'person' ? 'Leave' : c && c.kind === 'vista' ? 'Step away' : 'Get off';
    showPersona(c && c.kind === 'person' ? c : null);
    if (c) {
      // Philadelphia's Walnut St (people, seats), L and trolleys have their own wording; every
      // other car uses its model name (c.hint: somewhere with wording of its own; c.hintTouch
      // for a touch screen, else c.hint with click said as tap)
      const t = TOUCH.matches, walkHow = t ? 'the on-screen arrows to walk' : 'W A S D or the arrow keys to walk', look = t ? 'Drag to look around' : 'Drag or click to look around';
      const leave = w => t ? `tap “${w}” to leave` : `Esc or “${w}” to leave`;
      setHint(c.hint ? (t && c.hintTouch) || c.hint : c.kind === 'person'
        ? `Seeing Walnut Street through ${c.name}’s eyes. You can’t steer; you go where they go. ${look}, ${t ? 'tap' : 'Space, Esc or'} “Leave” to step out.`
        : c.kind === 'seat'
        ? (c.seat === 'cafe' ? 'Sitting at a café table on Walnut Street.' : 'Sitting on a bench on Walnut Street.') + ` ${look}, ${t ? 'tap' : 'Space, Esc or'} “Stand up” to get up.`
        : c.kind === 'metro'
        ? `Aboard an L train, inside a SEPTA M-4 car. ${look}, ${walkHow} the aisle, ${leave('Get off')}. The sign at the front shows the next stop.`
        : c.kind === 'trolley'
          ? `Aboard a ${c.line} trolley, inside a Kawasaki LRV. Walk up to the front for the view through the windscreen. ${look}, ${walkHow}, ${leave('Get off')}.`
          : `Aboard the ${c.lineName}, inside a ${/\(proposed\)/.test(c.lineName) ? String(c.model).replace(/ \(proposed\)$/, '') : c.model}. ${look}, ${walkHow} the aisle (the cab window is at the front), ${leave('Get off')}.`);
      markView(c.view || null);
      // on a phone the hint is in the folded panel: say its first sentence for a moment instead
      const key = c.kind + ':' + (c.id ?? c.lineName ?? c.name);
      if (key !== lastCar) requestAnimationFrame(() => {
        if (!COMPACT.matches || !document.getElementById('hud-body').hidden) return;
        const first = (hint.textContent.match(/^.+?[.!?](?=\s|$)/) || [hint.textContent])[0];
        toast(first, 4000);
      });
      lastCar = key;
    } else { lastCar = null; if (!riding) setHint(baseHint()); }
  }
  let lastCar = null;
  canvas.addEventListener('pointerdown', e => {
    if (locked) { down = { lockedClick: true }; return; }
    down = { button: e.button, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, t: performance.now(), id: e.pointerId };
    if (carOn) { canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; }
  });
  canvas.addEventListener('pointermove', e => {
    if (locked) return;   // handled by the mousemove listener above
    if (carOn) {
      if (down && down.id === e.pointerId) { if (!pinch) api.lookCar(e.clientX - down.lx, e.clientY - down.ly); down.lx = e.clientX; down.ly = e.clientY; }
      else if (!e.buttons && e.pointerType === 'mouse' && spectating()) canvas.style.cursor = api.pickCar(...rel(e)) ? 'pointer' : 'grab';
      return;
    }
    if (e.buttons || e.pointerType !== 'mouse' || hoverPending) return;   // hover cursor over a clickable car
    hoverPending = true;
    requestAnimationFrame(() => { hoverPending = false; if (!carOn) canvas.style.cursor = api.pickCar(...rel(e)) || anglerAt(...rel(e)) != null || stallAt(...rel(e)) ? 'pointer' : ''; });
  });
  // standing somewhere as yourself (the overlook), where there is still someone to click on
  const spectating = () => { const c = carOn && api.getCar(); return !!c && c.kind === 'vista'; };
  const endDrag = e => {
    const d = down; down = null;
    if (d && d.lockedClick) {   // mouse captured: click the train under the crosshair
      if ((carOn && !spectating()) || e.type !== 'pointerup') return;
      const ai = anglerAt(canvas.clientWidth / 2, canvas.clientHeight / 2);   // someone fishing under the crosshair
      if (ai != null) { document.exitPointerLock(); fishing.open(ai); return; }
      if (stallAt(canvas.clientWidth / 2, canvas.clientHeight / 2)) { document.exitPointerLock(); arcade.open(); return; }   // the arcade stall
      const hit = api.pickCar(canvas.clientWidth / 2, canvas.clientHeight / 2); if (!hit) return;
      if (riding) { riding = false; rideBtn.textContent = 'Ride a line'; openPicker(false); }
      api.boardCar(hit); syncCar(); syncCut(); return;
    }
    const click = d && e.type === 'pointerup' && Math.hypot(e.clientX - d.x, e.clientY - d.y) <= 6 && performance.now() - d.t <= 600;
    if (carOn) {
      canvas.style.cursor = 'grab'; if (!click) return;
      const hit = d.button !== 2 && spectating() && api.pickCar(...rel(e));
      if (hit) { api.boardCar(hit); syncCar(); } else lockMouse();
      return;
    }
    if (!click) return;
    if (d.button === 2) { lockMouse(); return; }   // right-click (not a right-drag pan): creative mode
    const ai = anglerAt(...rel(e));   // someone fishing on the Schuylkill: they ask you to join them
    if (ai != null) { if (riding) { riding = false; api.setRiding(false, true); rideBtn.textContent = 'Ride a line'; openPicker(false); } fishing.open(ai); return; }
    if (stallAt(...rel(e))) { if (riding) { riding = false; api.setRiding(false, true); rideBtn.textContent = 'Ride a line'; openPicker(false); } arcade.open(); return; }   // Chinatown's Lucky Arcade
    const hit = api.pickCar(...rel(e)); if (!hit) return;   // only a right-click enters creative mode
    if (riding) { riding = false; rideBtn.textContent = 'Ride a line'; openPicker(false); }
    api.boardCar(hit); syncCar(); syncCut(); autoFold();
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
      const car = api.getCar();
      if (e.key === 'Escape' || (e.key === ' ' && ['seat', 'person', 'vista'].includes(car.kind))) { e.preventDefault(); if (e.key === ' ') holdSpace = true; api.leaveCar(); syncCar(); return; }
      const todo = (car.actions || []).find(a => a.key === e.key); if (todo) { e.preventDefault(); if (!e.repeat) api.actCar(todo.id); return; }
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
  walkpad.querySelectorAll('button').forEach(b => {
    const k = b.dataset.k, stop = () => { if (keys.delete(k)) applyKeys(); b.classList.remove('on'); };
    b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); keys.add(k); applyKeys(); b.classList.add('on'); });
    b.addEventListener('pointerup', stop); b.addEventListener('pointercancel', stop); b.addEventListener('lostpointercapture', stop);
    b.addEventListener('contextmenu', e => e.preventDefault());   // a long press is a walk, not a menu
  });
  offBtn.addEventListener('click', () => { api.leaveCar(); syncCar(); });
  // "Show transit lines": highlight every line in its colour, with a legend
  const trBtn = document.getElementById('transit'), legendEl = document.getElementById('legend');
  trBtn.hidden = !api.legend.length && !api.oldTrolleyLegend.length;
  for (const it of api.legend) {
    const s = document.createElement('span'), i = document.createElement('i'); i.style.background = it.color; i.setAttribute('aria-hidden', 'true');
    s.append(i, it.name); legendEl.appendChild(s);
  }
  // on a phone the panel folds away to show the lines, and a strip of the legend sits at the bottom
  // instead (css/style.css .legend-mini: small screens, panel folded), with a button to hide them
  const mini = document.createElement('div'), miniList = document.createElement('div'), miniOff = document.createElement('button');
  mini.className = 'dock-mini legend-mini'; mini.id = 'legend-mini'; mini.hidden = true; mini.setAttribute('role', 'group'); mini.setAttribute('aria-label', 'Transit lines');
  miniList.className = 'lm-list';
  miniOff.type = 'button'; miniOff.className = 'ghost'; miniOff.textContent = 'Hide'; miniOff.setAttribute('aria-label', 'Hide transit lines');
  miniOff.addEventListener('click', () => trBtn.click());
  for (const it of [...api.legend, ...api.oldTrolleyLegend]) {   // "1 · Broadway - 7 Avenue Local" is just "1" here
    const s = document.createElement('span'), i = document.createElement('i'); i.className = it.kind || 'band'; i.style.setProperty('--c', it.color); i.setAttribute('aria-hidden', 'true');
    s.append(i, it.name.split(' · ')[0]); s.title = it.name; miniList.appendChild(s);
  }
  mini.append(miniList, miniOff); document.getElementById('dock').appendChild(mini);
  trBtn.addEventListener('click', () => {
    const on = api.setTransitMap(!api.getTransitMap());
    trBtn.setAttribute('aria-pressed', String(on)); trBtn.textContent = on ? 'Hide transit lines' : 'Show transit lines'; legendEl.hidden = !on; mini.hidden = !on;
    if (on) reveal(legendEl);
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
    document.body.classList.toggle('hud-open', !on);
    if (!on) requestAnimationFrame(syncMore);
  };
  // on a phone the panel gets out of the way once you've picked where to go (not remembered)
  function autoFold() { if (COMPACT.matches && !body.hidden) fold(true); }
  // the panel's size, for placing the minimap under it on a phone (css/style.css --hud-h, --hud-w)
  new ResizeObserver(() => {
    const r = card.getBoundingClientRect(), root = document.documentElement.style;
    root.setProperty('--hud-w', Math.round(r.right) + 'px'); if (body.hidden) root.setProperty('--hud-h', Math.round(r.bottom) + 'px');
  }).observe(card);
  const saved = store.get('folded');
  fold(saved == null ? COMPACT.matches : saved === '1');
  foldBtn.addEventListener('click', () => { const on = !body.hidden; fold(on); store.set('folded', on ? '1' : '0'); });

  // skyline display lights: a colour scheme for the towers' crowns, the Cira Centre's LED skin,
  // the FMC crown and Boathouse Row, as the city does for teams and holidays
  const swatches = document.getElementById('swatches'), skyName = document.getElementById('sky-name'), skyColor = document.getElementById('sky-color');
  const customSw = skyColor.closest('.swatch'), swBtns = [];
  function setScheme(id, colors, name, quiet) {
    api.setDisplayLights(colors); skyName.textContent = name;
    swBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
    customSw.classList.toggle('on', id === 'custom');
    store.set('skyline', id === 'custom' ? 'custom:' + colors[0] : id);
    if (!quiet && api.getMood() === 'day') toast('Skyline lights show after dark: slide the time past sunset.', 3200);   // the lights only show after dark
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
  swatches.closest('.skyline').hidden = !api.displayPresets.length;   // a city with no lit skyline (CITY.presets [])
  if (!api.displayPresets.length) { /* nothing to light */ }
  else if (sk.startsWith('custom:')) { skyColor.value = sk.slice(7); setScheme('custom', [skyColor.value], 'Your colour', true); }
  else setScheme(pre ? pre.id : 'white', (pre || api.displayPresets[0]).colors, (pre || api.displayPresets[0]).name, true);

  const minimap = createMinimap(api, { eats: () => (showEats && EATS.length ? EATS : null) }), ridebar = createRidebar(api);
  [timeIn, speedIn, dayIn, lblBtn, rideBtn, cutBtn, trBtn].forEach(b => b.disabled = false);

  return { placeTags };
}
