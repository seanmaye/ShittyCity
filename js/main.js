// Entry point: load data -> build scene -> wire up UI -> run.
import { loadData } from './data.js';
import { buildScene } from './scene/index.js';
import { createUI } from './ui.js';
const statusEl = document.getElementById('status');
const status = t => { statusEl.textContent = t; };

try {
  const data = await loadData(p => status(`Loading map data… ${Math.round(p * 100)}%`));
  const api = await buildScene(document.getElementById('c'), data, status);
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
