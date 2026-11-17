// Jersey Shore's labels and "Go to" views (data/jsh/places.json, written by tools/jsh/build_jsh.py).
// Label heights are above the ground under them (terrain.ts); view positions already include it.
import * as THREE from 'three';
import { groundAt } from './terrain.ts';
import type { Places } from '../../types/data.ts';

export function buildPlaces(data: Places) {
  const labels = data.labels.map(l => ({ text: l.t, far: l.far, pos: new THREE.Vector3(l.x, groundAt(l.x, l.z) + l.y, l.z) }));
  const views = data.views.map(v => ({ id: v.id, name: v.name, pos: new THREE.Vector3(...v.pos), target: new THREE.Vector3(...v.target) }));
  return { labels, views };
}
