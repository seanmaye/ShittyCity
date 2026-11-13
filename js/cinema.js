// Cinematic mode's screen (the camera work is js/scene/cinematic.js): letterbox bars, the fade
// through black between shots, and a title for each shot. Everything else on screen (the panel, the
// map, the labels) steps aside. Any key, click, tap or scroll ends it. When the view has been left
// alone for a while it starts by itself, like a screensaver; ?cinematic (or #cinematic) in the
// address starts it as soon as the city is up, for a screen left running somewhere.
const IDLE = 150;   // s with no input before it starts by itself

/**
 * api: the scene (startCinematic, stopCinematic, cinematic.state). canStart(): nothing else is going
 * on (no train, no dialog, no flying). onStop(): the UI catches up (no Go-to view is current).
 * The clock, season and Speed slider run on underneath: the tour is the live city.
 */
export function createCinema(api, { canStart = () => true, onStop = () => {} } = {}) {
  const el = document.createElement('div'); el.className = 'cine'; el.id = 'cine'; el.hidden = true;
  el.innerHTML = '<div class="cine-bar top"></div><div class="cine-bar bot"></div><div class="cine-fade"></div>'
    + '<div class="cine-cap" aria-live="polite"><b class="cine-title"></b><span class="cine-sub"></span></div>'
    + '<p class="cine-exit">Cinematic mode · press any key, click or tap to exit</p>';
  document.getElementById('city-view').appendChild(el);
  const fade = el.querySelector('.cine-fade'), cap = el.querySelector('.cine-cap'), title = el.querySelector('.cine-title'), sub = el.querySelector('.cine-sub'), exitHint = el.querySelector('.cine-exit');
  let on = false, shown = -1, lastInput = performance.now(), hintTimer = 0;

  function start() {
    if (on || !api.startCinematic()) return false;
    on = true; shown = -1; el.hidden = false; document.body.classList.add('cinematic');
    requestAnimationFrame(() => el.classList.add('on'));   // the bars slide in
    showHint();
    return true;
  }
  function stop() {
    if (!on) return;
    on = false; api.stopCinematic(); el.classList.remove('on'); document.body.classList.remove('cinematic');
    fade.style.opacity = '0'; cap.classList.remove('show');
    setTimeout(() => { if (!on) el.hidden = true; }, 700);
    lastInput = performance.now(); onStop();
  }
  const showHint = () => { exitHint.classList.add('show'); clearTimeout(hintTimer); hintTimer = setTimeout(() => exitHint.classList.remove('show'), 3500); };

  /** each frame: the fade, and the title for the first few seconds of each shot */
  function update() {
    if (!on) return;
    const s = api.cinematic.state;
    fade.style.opacity = s.fade.toFixed(3);
    if (s.n !== shown) { shown = s.n; title.textContent = s.title; sub.textContent = s.sub; sub.hidden = !s.sub; }
    cap.classList.toggle('show', !!s.title && s.shotT > 1.4 && s.shotT < 6.5);
  }

  // anything at all ends it (and does nothing else: the key or click is used up)
  let ended = -1e9;
  const end = e => { lastInput = performance.now(); if (!on) return; e.preventDefault(); e.stopImmediatePropagation(); ended = performance.now(); stop(); };
  window.addEventListener('keydown', e => { if (on && ['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return; end(e); }, true);
  window.addEventListener('pointerdown', end, true);
  window.addEventListener('wheel', e => { if (on) end(e); else lastInput = performance.now(); }, { capture: true, passive: false });
  window.addEventListener('pointermove', () => { lastInput = performance.now(); if (on) showHint(); }, true);
  // the click that follows the pointerdown that ended it mustn't land on a train or a button
  for (const type of ['click', 'pointerup', 'contextmenu']) window.addEventListener(type, e => { if (performance.now() - ended < 800) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);

  // left alone long enough: start by itself
  setInterval(() => {
    if (on || document.visibilityState !== 'visible' || performance.now() - lastInput < IDLE * 1000 || !canStart()) return;
    start();
  }, 5000);
  const ask = new URLSearchParams(location.search).has('cinematic') || location.hash === '#cinematic';
  if (ask) setTimeout(() => { if (canStart()) start(); }, 1500);

  return { start, stop, update, on: () => on };
}
