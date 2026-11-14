// Entry point: pick a city (start menu, or ?city=phl / ?city=nyc) -> load its data -> build the
// scene -> wire up the UI -> run. One city per page load: "Change city" reloads to the menu.
// first: three.js settings, before any module makes a colour
import { LIGHT } from './three-setup.js';
import { CITIES, setCity } from './cities.js';
import { loadData } from './data.js';
import { buildScene } from './scene/index.js';
import { createUI } from './ui.js';
import { startLoadingScreens } from './loading.js';
// Each city's own code (js/scene/<city>/<city>.js) and the URLs the build gave its data files (js/urls/<city>.js), as chunks
// of their own that no other city downloads. (Here rather than in js/cities.js, which shares a chunk with three.js: a change
// to one city's code or data then renames only this chunk and that city's, and the shared ones stay cached.)
const CODE = { phl: () => import('./scene/phl/phl.js'), nyc: () => import('./scene/nyc/nyc.js'), jsh: () => import('./scene/jsh/jsh.js'), pine: () => import('./scene/pine/pine.js') };
const URLS = { phl: () => import('./urls/phl.js'), nyc: () => import('./urls/nyc.js'), jsh: () => import('./urls/jsh.js'), nola: () => import('./urls/nola.js') };
const $ = id => document.getElementById(id);
const statusEl = $('status'), progress = $('loading-progress');
const changeCity = () => location.assign(location.href.split(/[?#]/)[0]);

function status(message, value) {
  if (progress.hidden) return; // Other map requests can still finish after a failure.
  if (statusEl.textContent !== message) statusEl.textContent = message;
  progress.value = Math.max(progress.value, value);
}

let slideshow = { settle() {}, stop() {} };
function showLoading(city) {
  const screen = $('city-loading'), heading = $('loading-city');
  screen.dataset.city = city.id;
  heading.textContent = city.name;
  screen.hidden = false;
  slideshow = startLoadingScreens(city, screen);
  heading.focus();
}

/** show the start menu and resolve with the id of the city picked */
function chooseCity() {
  document.body.classList.add('choosing');
  const menu = $('menu'), list = $('cities');
  return new Promise(resolve => {
    for (const c of Object.values(CITIES)) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'city';
      const name = document.createElement('b'), blurb = document.createElement('small'), go = document.createElement('em');
      name.textContent = c.name; blurb.textContent = c.blurb; go.textContent = 'View city →';
      b.append(name, blurb, go);
      b.addEventListener('click', () => {
        menu.hidden = true; document.body.classList.remove('choosing');
        // keep the choice in the address, so a reload stays in this city (file:// may refuse)
        try { history.replaceState(null, '', '?city=' + c.id); } catch (e) { /* fine */ }
        resolve(c.id);
      });
      list.appendChild(b);
    }
    menu.hidden = false; list.querySelector('button').focus();
  });
}

const asked = new URLSearchParams(location.search).get('city');
const city = setCity(Object.hasOwn(CITIES, asked) ? asked : await chooseCity());
// the URLs of the city's data files and its own code, each a chunk of its own, both asked for at once: the loading screen and
// the data wait only for the URLs (a small chunk), and the code arrives while the data loads. (This module awaits at
// top level, so a city's chunk must never import the chunk this module is in: each would wait for the other. The build keeps
// the modules both use in chunks of their own; tools/perf's smoke would time out if that changed.)
const urls = URLS[city.id] ? URLS[city.id]() : Promise.resolve({ default: {} });
const own = CODE[city.id] ? CODE[city.id]() : Promise.resolve({});
own.catch(() => {});   // (a failure shows where it is awaited, below)
city.urls = Object.fromEntries(Object.entries((await urls).default).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1), url]));
showLoading(city);
// the page's text for this city
document.title = city.title;
$('heading').textContent = city.heading; $('hint').textContent = city.hint; $('credit').textContent = city.credit;
$('c').setAttribute('aria-label', city.canvasLabel);
$('mm').setAttribute('aria-label', `Map of ${city.name} showing where you are. Click to fly there.`);
$('switch-city').addEventListener('click', changeCity);
$('loading-back').addEventListener('click', changeCity);

try {
  if (city.kitchen) {
    // a single room, not a map: no data to load and none of the city controls
    document.body.classList.add('kitchen');
    status('Setting out the kitchen…', 60);
    const { buildKitchen } = await own;
    const api = buildKitchen($('c'));
    window.__kitchen = api;
    await api.start();
  } else {
    const data = await loadData(p => status(`Loading map data… ${Math.round(p * 100)}%`, p * 50));
    const code = await own;
    const api = await buildScene($('c'), data, status, code);
    const ui = createUI(api, code);
    slideshow.settle();   // no new slides while the city's first frames load the GPU
    status('Rendering the city…', 95);
    const firstFrame = api.start(camera => ui.placeTags(camera));
    window.__city = api; // handy for poking at the scene from the console
    await firstFrame;
  }
  status('', 100);
  const screen = $('city-loading'), view = $('city-view');
  const hadFocus = screen.contains(document.activeElement);
  view.inert = false;
  if (hadFocus) view.focus();
  // fade the loading screen away over the first frames of the city
  const fade = matchMedia('(prefers-reduced-motion: reduce)').matches ? null : screen.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, easing: 'ease-in' });
  const close = () => { screen.hidden = true; slideshow.stop(); };
  if (fade) { screen.style.pointerEvents = 'none'; fade.finished.then(close, close); } else close();
} catch (e) {
  console.error(e);
  progress.hidden = true;
  statusEl.textContent = location.protocol === 'file:'
    ? 'This page needs a local web server to load its data files. See README.md.'
    : `Couldn’t build the scene: ${e.message}`;
  const back = $('loading-back');
  back.hidden = false;
  back.focus();
}
