// Kingda Ka (Six Flags Great Adventure, 2005-2024), for js/scene/index.ts: the standing ride (structure.ts) and its train
// (train.ts) on one layout (layout.ts), as one feature with the same calls as the other things a visitor can step into
// (the overlook, the concert): pick -> board -> frame/look -> leave.
import * as THREE from 'three';
import { makeLayout } from './layout.ts';
import type { CoasterOpts } from './layout.ts';
import { buildStructure } from './structure.ts';
import { buildTrain } from './train.ts';
import type { Coaster } from '../../types/data.ts';

/** the colour of its line on the minimap and in the ride list (the track's green) */
export const KA_COLOR = '#3f9b4b';

export function buildCoaster(scene: THREE.Scene, data: Coaster, opts: CoasterOpts) {
  const layout = makeLayout(data);
  const structure = buildStructure(scene, layout, data, opts);
  const train = buildTrain(scene, layout, data, opts);
  // the circuit, for the minimap, "Show transit lines" and cinematic mode's line shots
  const routes = [{ id: 'ka', color: KA_COLOR, P: layout.points.concat(layout.points[0]) }];
  return {
    layout, structure, train, routes,
    labels: structure.labels, views: structure.views, nightOnly: structure.nightOnly, lines: [train.line],
    update(dt: number, camera: THREE.Camera) { structure.update(dt, camera); train.update(dt, camera); },
    frame: train.frame, pick: train.pick, board: train.board, leave: train.leave, look: train.look, act: train.act,
    getState: train.getState, on: train.on, vehicles: train.vehicles,
  };
}
