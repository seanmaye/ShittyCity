// Entry point: pick a city (start menu, or ?city=phl / ?city=nyc) -> load its data -> build the
// scene -> wire up the UI -> run. One city per page load: "Change city" reloads to the menu.
import { CITIES, setCity } from './cities.js';
import { loadData } from './data.js';
import { buildScene } from './scene/index.js';
import { createUI } from './ui.js';
const statusEl = document.getElementById('status');
const status = t => { statusEl.textContent = t; };
const $ = id => document.getElementById(id);

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
const city = setCity(CITIES[asked] ? asked : await chooseCity());
// the page's text for this city
document.title = city.title;
$('heading').textContent = city.heading; $('hint').textContent = city.hint; $('credit').textContent = city.credit;
$('c').setAttribute('aria-label', city.canvasLabel);
$('mm').setAttribute('aria-label', `Map of ${city.name} showing where you are. Click to fly there.`);
$('switch-city').addEventListener('click', () => location.assign(location.href.split(/[?#]/)[0]));

try {
  const data = await loadData(p => status(`Loading map data… ${Math.round(p * 100)}%`));
  const api = await buildScene($('c'), data, status);
  const ui = createUI(api);
  status('');
  api.start(camera => ui.placeTags(camera));
  window.__schuylkill = api; // handy for poking at the scene from the console
} catch (e) {
  console.error(e);
  status(location.protocol === 'file:'
    ? 'This page needs a local web server to load its data files. See README.md.'
    : `Couldn’t build the scene: ${e.message}`);
}
