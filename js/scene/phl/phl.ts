// Philadelphia's own code, as js/scene/index.ts and js/ui.ts use it. main.ts loads this with import() (CODE),
// so it and everything only it imports is a chunk of its own that no other city downloads.
export { buildLandmarks } from './landmarks.ts';
export { buildMonorail } from './monorail.ts';
export { buildSports, courtTest } from './sports.ts';
export { buildYardPark } from './yardpark.ts';
export { buildConcert } from './concert.ts';
export { buildCityMarks } from './citymarks.ts';
export { buildOldTrolleys } from './oldtrolley.ts';
export { buildPromenade, onPromenade } from './promenade.ts';
export { buildPedestrians } from './pedestrians.ts';
export { buildBoats } from './boats.ts';
export { buildAnglers } from './anglers.ts';
export { buildChinatown } from './chinatown.ts';
export { buildRestaurants } from './restaurants.ts';
// the fishing minigame (the anglers) and Chinatown's arcade stall, which js/ui.ts opens
export { createFishing } from '../../fishing.ts';
export { createArcade } from '../../arcade.ts';
