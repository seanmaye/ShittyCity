// Entry point: pick a city (start menu, or ?city=phl / ?city=nyc) -> load its data -> build the
// scene -> wire up the UI -> run. One city per page load: "Change city" reloads to the menu.
// first: three.js settings, before any module makes a colour
import { LIGHT } from './three-setup.js';
import { CITIES, setCity } from './cities.js';
import { loadData } from './data.js';
import { buildScene } from './scene/index.js';
import { createUI } from './ui.js';
const $ = id => document.getElementById(id);
const statusEl = $('status'), progress = $('loading-progress');
const changeCity = () => location.assign(location.href.split(/[?#]/)[0]);

function status(message, value) {
  if (progress.hidden) return; // Other map requests can still finish after a failure.
  if (statusEl.textContent !== message) statusEl.textContent = message;
  progress.value = Math.max(progress.value, value);
}

function showLoading(city) {
  const screen = $('city-loading'), art = $('loading-art'), heading = $('loading-city');
  screen.dataset.city = city.id;
  heading.textContent = city.name;
  if (city.loadingArt?.length) {
    const { file, colors } = city.loadingArt[Math.floor(Math.random() * city.loadingArt.length)];
    progress.style.setProperty('--loading-fill', `linear-gradient(90deg, ${colors.join(', ')})`);
    const embedded = $(`art-${city.prefix}${file.replace(/\.webp$/, '')}`);
    art.addEventListener('load', () => { art.hidden = false; }, { once: true });
    art.src = embedded ? `data:image/webp;base64,${embedded.textContent.trim()}` : `${city.dir}/${file}`;
  }
  screen.hidden = false;
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
showLoading(city);
// the page's text for this city
document.title = city.title;
$('heading').textContent = city.heading; $('hint').textContent = city.hint; $('credit').textContent = city.credit;
$('c').setAttribute('aria-label', city.canvasLabel);
$('mm').setAttribute('aria-label', `Map of ${city.name} showing where you are. Click to fly there.`);
$('switch-city').addEventListener('click', changeCity);
$('loading-back').addEventListener('click', changeCity);

try {
  const data = await loadData(p => status(`Loading map data… ${Math.round(p * 100)}%`, p * 50));
  const api = await buildScene($('c'), data, status);
  const ui = createUI(api);
  status('Rendering the city…', 95);
  const firstFrame = api.start(camera => ui.placeTags(camera));
  window.__city = api; // handy for poking at the scene from the console
  await firstFrame;
  status('', 100);
  const screen = $('city-loading'), view = $('city-view');
  const hadFocus = screen.contains(document.activeElement);
  screen.hidden = true;
  view.inert = false;
  if (hadFocus) view.focus();
} catch (e) {
  console.error(e);
  progress.hidden = true;
  statusEl.textContent = location.protocol === 'file:' && !$(`data-${city.prefix}river`)
    ? 'This page needs a local web server to load its data files. See README.md.'
    : `Couldn’t build the scene: ${e.message}`;
  const back = $('loading-back');
  back.hidden = false;
  back.focus();
}
