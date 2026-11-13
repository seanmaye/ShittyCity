// Fishing on the Schuylkill: click someone fishing on the bank (js/scene/phl/anglers.js) and they
// ask you to join them. The minigame, in a dialog over the city:
//   1. Cast   a power meter swings; press to cast. Farther out is deeper water: rarer catches.
//   2. Wait   watch the bobber. Nibbles are only nibbles: strike too soon and the bait's gone.
//   3. Bite   the bobber plunges: press within the moment (shorter for rarer catches).
//   4. Reel   hold to reel. Holding builds line tension, the fish's runs build more; let go to
//             ease off. Over the top for too long and the line snaps; slack too long and it
//             shakes the hook.
// What bites depends on rarity, how far you cast, the season (shad run in spring), the time of
// day (catfish at night) and luck. Every catch goes in your catch log (kept in this browser).
// Press: click or tap the dialog's water, Space or Enter. Esc closes.
import { CITY } from './cities.js';

export const RARITY = {
  common: { w: 60, color: '#7d8a94', label: 'Common' }, uncommon: { w: 25, color: '#3d9a4a', label: 'Uncommon' },
  rare: { w: 10, color: '#2f78c9', label: 'Rare' }, epic: { w: 4, color: '#8a46c9', label: 'Epic' }, legendary: { w: 1, color: '#d9961a', label: 'Legendary' },
};
const RANK = Object.keys(RARITY);
const spring = c => (c.day >= 80 && c.day <= 150), night = c => (c.hour < 6 || c.hour >= 20), dusk = c => ((c.hour >= 17 && c.hour < 21) || (c.hour >= 5 && c.hour < 8));
// fish: draw = { r: length/height, top, side, belly, fin?, pat?: bars|stripes|spots|blotch|scales|stripe, ear?, whisk?, fork?, snout?, eel?, scutes?, dorsal? }
const F = (id, name, r, lb, fight, draw, note, when) => ({ id, name, kind: 'fish', r, lb, fight, draw, note, when });
const T = (id, name, r, glyph, fight, note, kind = 'trash') => ({ id, name, kind, r, glyph, fight, note });
export const ITEMS = [
  F('bluegill', 'Bluegill', 'common', [.1, .9], .35, { r: 1.9, top: '#3f5a3a', side: '#6f8a5a', belly: '#e0a040', pat: 'bars', ear: '#1a2a40' }, 'The sunfish every Philly kid catches first.'),
  F('pumpkinseed', 'Pumpkinseed', 'common', [.1, .7], .3, { r: 1.9, top: '#5a6a3a', side: '#c9a24a', belly: '#f0b040', pat: 'spots', ear: '#d0302a' }, 'Look for the red tip on its ear flap.'),
  F('whiteperch', 'White perch', 'common', [.2, 1.2], .4, { r: 2.8, top: '#6d7a7c', side: '#c4cbc8', belly: '#eef0ec' }, 'Silver, scrappy, and all over the tidal Schuylkill.'),
  F('channelcat', 'Channel catfish', 'common', [1, 12], .6, { r: 4, top: '#4d5866', side: '#8a95a0', belly: '#e8e8e0', pat: 'spots', whisk: 1, fork: 1 }, 'Whiskers, a forked tail and an appetite for anything that smells.', c => (night(c) ? 2.2 : 1)),
  F('carp', 'Common carp', 'common', [2, 25], .7, { r: 3, top: '#5a4a2a', side: '#b08a3a', belly: '#e8d090', pat: 'scales', fork: 1 }, 'A golden-bronze bruiser. Below the dam they get big.'),
  F('gizzardshad', 'Gizzard shad', 'common', [.3, 1.5], .25, { r: 3.2, top: '#5a6e7a', side: '#c8d0d0', belly: '#f0f2f0', ear: '#3a4a5a', fork: 1 }, 'Bait for everything bigger. Flashy, flimsy and plentiful.'),
  F('sucker', 'White sucker', 'common', [.5, 3], .35, { r: 4, top: '#5a5040', side: '#a89a80', belly: '#e8e2d4', fork: 1 }, 'A bottom feeder with a mouth like a vacuum cleaner.'),
  F('smallmouth', 'Smallmouth bass', 'uncommon', [.5, 5], .7, { r: 3.3, top: '#4a4a2a', side: '#a08a4a', belly: '#e8dcb0', pat: 'bars' }, 'Bronzeback! Pound for pound the toughest fight in the river.'),
  F('largemouth', 'Largemouth bass', 'uncommon', [1, 8], .65, { r: 3.2, top: '#3a5a2a', side: '#8aa060', belly: '#f0f0d8', pat: 'stripe' }, 'Big mouth, big jumps. Likes the slack water near the banks.'),
  F('yellowperch', 'Yellow perch', 'uncommon', [.2, 1.5], .35, { r: 3.4, top: '#5a5a20', side: '#d8c040', belly: '#f4ecd0', pat: 'bars', fin: '#e07a2a' }, 'Dark bars on gold. Tastes as good as it looks.'),
  F('bullhead', 'Brown bullhead', 'uncommon', [.5, 3], .4, { r: 3.6, top: '#3a3020', side: '#6a5a40', belly: '#d8d0b0', whisk: 1 }, 'A catfish with a square tail and a bad attitude.', c => (night(c) ? 1.8 : 1)),
  F('rockbass', 'Rock bass', 'uncommon', [.3, 1.5], .45, { r: 2.2, top: '#4a3a2a', side: '#8a6a4a', belly: '#c8b090', pat: 'spots' }, 'Red-eyed and stubborn. Lives in the rocks below the dam.'),
  F('eel', 'American eel', 'uncommon', [1, 5], .55, { r: 12, top: '#3a3a20', side: '#7a7040', belly: '#d8d0a0', eel: 1 }, 'Born in the Sargasso Sea, swam all the way up the Schuylkill. Slippery!', c => (night(c) ? 2 : 1)),
  F('hickoryshad', 'Hickory shad', 'uncommon', [.5, 2], .5, { r: 3.6, top: '#3a6060', side: '#c0ccc8', belly: '#f0f0ee', ear: '#2a3a3a', fork: 1 }, 'A spring runner that leaps like it’s showing off.', c => (spring(c) ? 5 : .15)),
  F('striper', 'Striped bass', 'rare', [3, 35], .85, { r: 4, top: '#3a4a5a', side: '#c8d0d8', belly: '#f4f4f4', pat: 'stripes', fork: 1 }, 'A striper up from Delaware Bay: seven dark stripes and a lot of muscle.', c => (spring(c) ? 2.2 : 1)),
  F('americanshad', 'American shad', 'rare', [2, 6], .7, { r: 3.5, top: '#3a5a6a', side: '#d0d8d8', belly: '#f8f8f6', ear: '#2a3a40', fork: 1 }, 'Back in the Schuylkill every spring, up the fish ladder at the Fairmount Dam.', c => (spring(c) ? 6 : .1)),
  F('flathead', 'Flathead catfish', 'rare', [5, 50], .9, { r: 4.2, top: '#5a4a30', side: '#9a8050', belly: '#e8e0c0', pat: 'blotch', whisk: 1 }, 'An invasive giant that ambushes from the riverbed. Don’t put it back.', c => (night(c) ? 2 : 1)),
  F('bluecat', 'Blue catfish', 'rare', [5, 60], .9, { r: 4.4, top: '#4a5a70', side: '#9aaabb', belly: '#f0f0f0', whisk: 1, fork: 1 }, 'Another invader up from the Chesapeake. They get enormous.', c => (night(c) ? 2 : 1)),
  F('walleye', 'Walleye', 'rare', [1, 8], .6, { r: 4.4, top: '#5a5020', side: '#b0a050', belly: '#f0ecd8', pat: 'blotch', fork: 1 }, 'Glassy eyes made for low light. Try at dusk.', c => (dusk(c) || night(c) ? 1.8 : 1)),
  F('crappie', 'Black crappie', 'rare', [.3, 2], .45, { r: 2.1, top: '#3a3a3a', side: '#b8bcb0', belly: '#e8ece4', pat: 'spots' }, 'Calico bass to the old-timers. Paper-thin mouth: go easy.'),
  F('snakehead', 'Northern snakehead', 'epic', [3, 15], .85, { r: 6, top: '#3a3a20', side: '#7a6a3a', belly: '#d8c8a0', pat: 'blotch', dorsal: 1 }, 'Invasive! They turned up in FDR Park and the lower Schuylkill. Never release one.'),
  F('tigermuskie', 'Tiger muskellunge', 'epic', [8, 30], .95, { r: 6, top: '#4a5a3a', side: '#a8b088', belly: '#ece8d8', pat: 'bars', fork: 1 }, 'A stocked hybrid: the fish of ten thousand casts.'),
  F('gar', 'Longnose gar', 'epic', [2, 15], .7, { r: 9, top: '#4a5a3a', side: '#9aa070', belly: '#e0e0c8', pat: 'spots', snout: 1 }, 'All armour and teeth, and older than the last of the dinosaurs.'),
  F('bowfin', 'Bowfin', 'epic', [2, 10], .8, { r: 4.5, top: '#3a4a2a', side: '#6a7a4a', belly: '#c8c8a0', dorsal: 1 }, 'A living fossil that can gulp air, and fights like a wildcat.'),
  F('sturgeon', 'Atlantic sturgeon', 'legendary', [40, 300], 1, { r: 6, top: '#4a4a40', side: '#8a8a7a', belly: '#e0dcd0', scutes: 1, snout: .5 }, 'Endangered and ancient. One photo, then back it goes, very gently.'),
  F('koi', 'Golden koi', 'legendary', [3, 20], .6, { r: 3, top: '#e07a1a', side: '#f0a030', belly: '#f8e0b0', pat: 'blotch', whisk: .5 }, 'Someone’s escaped pond koi, living its best life off Boathouse Row.'),
  T('boot', 'Soggy boot', 'common', '🥾', .1, 'Left foot. The right one is still down there.'),
  T('can', 'Aluminium can', 'common', '🥫', .05, 'Into the recycling with it.'),
  T('bag', 'Plastic bag', 'common', '🛍️', .08, 'One less for the herons to choke on. Nice.'),
  T('wrapper', 'Hoagie wrapper', 'common', '🥪', .04, 'Somebody’s lunch, long gone.'),
  T('line', 'Tangle of old fishing line', 'common', '🧶', .06, 'Picking this up saves birds. Good catch.'),
  T('waterice', 'Water ice cup', 'common', '🍧', .04, 'Cherry, by the stain.'),
  T('tire', 'Tire', 'uncommon', '🛞', .3, 'How did this get here? Heavy, too.'),
  T('roadsign', 'Road work sign', 'uncommon', '🚧', .25, 'From some long-finished job on Kelly Drive.'),
  T('bikewheel', 'Bicycle wheel', 'uncommon', '🚲', .2, 'Somewhere, a bike is missing it.'),
  T('duck', 'Rubber duck', 'uncommon', '🦆', .05, 'Escaped from a charity duck race, probably.'),
  T('pretzel', 'Soft pretzel', 'uncommon', '🥨', .03, 'Still somehow salty.'),
  T('cart', 'Shopping cart', 'rare', '🛒', .45, 'The river’s most famous resident. Heave!'),
  T('oar', 'Rowing oar', 'rare', '🚣', .3, 'Lost from a shell off Boathouse Row.'),
  T('cheesesteak', 'Cheesesteak', 'rare', '🥖', .05, 'Wit. Barely touched. Don’t eat it.'),
  T('plume', 'Mummers’ plume', 'rare', '🪶', .05, 'Shed by a fancy brigade on New Year’s Day.'),
  T('bellkey', 'Liberty Bell keychain', 'uncommon', '🔔', .03, 'Crack and all.', 'treasure'),
  T('musketball', 'Musket ball', 'rare', '⚫', .03, 'From 1777, when the British held the city.', 'treasure'),
  T('bottle', 'Message in a bottle', 'epic', '🍾', .1, 'It says: “Meet me at the top of the Art Museum steps.”', 'treasure'),
  T('token', '1953 trolley token', 'epic', '🪙', .03, 'A PTC token from the year the Center City streetcars began to go.', 'treasure'),
  T('lockkey', 'Canal lock key', 'epic', '🗝️', .05, 'From the Schuylkill Navigation locks that brought coal barges to the city.', 'treasure'),
  T('spectacles', 'Ben Franklin’s spectacles', 'legendary', '👓', .05, 'Bifocals! He did invent them, after all.', 'treasure'),
  T('silverdollar', 'Mint silver dollar', 'legendary', '💰', .05, 'Struck at the first Philadelphia Mint, a few blocks from here.', 'treasure'),
];

/** what bites: rarity weights, shifted toward the rare by a long cast (power 0..1), fish only
 *  half as keen in winter, each item's own season and hour (when) */
export function rollCatch(c) {
  const winter = c.day < 60 || c.day >= 340;
  const w = ITEMS.map(it => {
    const k = RANK.indexOf(it.r);
    let v = RARITY[it.r].w * (1 + c.power * k * .45) * (it.when ? it.when(c) : 1);
    if (it.kind === 'trash') v *= 1.7 - c.power;
    if (it.kind === 'fish' && winter) v *= .5;
    return v;
  });
  let x = Math.random() * w.reduce((a, b) => a + b);
  for (let i = 0; i < ITEMS.length; i++) if ((x -= w[i]) <= 0) return ITEMS[i];
  return ITEMS[0];
}

// ---- drawing
let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
/** a fish (or the item's glyph) centred at (cx, cy), len pixels long, facing right (flip -1: left) */
export function drawCatch(g, it, cx, cy, len, flip = 1, t = 0, alpha = 1, mono = null) {
  g.save(); g.globalAlpha = alpha; g.translate(cx, cy); g.scale(flip, 1);
  if (it.kind !== 'fish') {
    g.rotate(Math.sin(t * 6) * .15); g.font = `${Math.round(len * .7)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (mono) { g.fillStyle = mono; g.globalAlpha = alpha * .5; g.beginPath(); g.arc(0, 0, len * .36, 0, 7); g.fill(); }
    else g.fillText(it.glyph, 0, 0);
    g.restore(); return;
  }
  const d = it.draw, L = len, h = L / Math.min(d.r, 5.5) * (d.eel ? .7 : 1), wag = Math.sin(t * 11) * h * .18;
  const col = k => mono || d[k];
  const nose = L * (.5 + (d.snout ? .12 * d.snout : 0));
  // tail
  g.fillStyle = mono || d.fin || d.top;
  if (!d.eel) {
    g.beginPath(); g.moveTo(-L * .4, 0);
    if (d.scutes) { g.lineTo(-L * .62, -h * .75 + wag); g.lineTo(-L * .5, wag * .3); g.lineTo(-L * .58, h * .4 + wag); }
    else { g.lineTo(-L * .6, -h * .55 + wag); g.lineTo(-L * (d.fork ? .5 : .58), wag * .4); g.lineTo(-L * .6, h * .55 + wag); }
    g.closePath(); g.fill();
  }
  // body
  const body = new Path2D();
  if (d.eel) {
    body.moveTo(nose, 0);
    body.bezierCurveTo(L * .4, -h * .5, -L * .2, -h * .5 + wag * .5, -L * .55, wag);
    body.bezierCurveTo(-L * .2, h * .5 + wag * .5, L * .4, h * .5, nose, 0);
  } else {
    body.moveTo(nose, 0);
    if (d.snout) body.lineTo(L * .42, -h * .12);
    body.bezierCurveTo(L * .32, -h * .62, -L * .15, -h * .6, -L * .42, -h * .12 + wag * .3);
    body.lineTo(-L * .42, h * .12 + wag * .3);
    body.bezierCurveTo(-L * .15, h * .56, L * .32, h * .56, d.snout ? L * .42 : nose, d.snout ? h * .12 : 0);
    if (d.snout) body.lineTo(nose, 0);
  }
  body.closePath();
  if (mono) g.fillStyle = mono;
  else { const gr = g.createLinearGradient(0, -h * .6, 0, h * .6); gr.addColorStop(0, d.top); gr.addColorStop(.5, d.side); gr.addColorStop(1, d.belly); g.fillStyle = gr; }
  // dorsal fin (long on snakehead and bowfin)
  g.save(); g.fillStyle = mono || d.fin || d.top; g.beginPath();
  if (d.dorsal) { g.moveTo(L * .2, -h * .45); g.quadraticCurveTo(-L * .1, -h * .8, -L * .4, -h * .2); g.lineTo(-L * .38, -h * .1); }
  else if (!d.eel) { g.moveTo(L * .12, -h * .5); g.lineTo(-L * .05, -h * .82); g.lineTo(-L * .2, -h * .48); }
  g.closePath(); g.fill(); g.restore();
  g.fill(body);
  if (!mono) {
    g.save(); g.clip(body); seed = it.id.length * 97 + it.id.charCodeAt(0);
    const dark = 'rgba(20,24,20,.35)';
    if (d.pat === 'bars') { g.fillStyle = dark; for (let k = 0; k < 6; k++) g.fillRect(L * (.25 - k * .12), -h, L * .045, h * 1.3); }
    if (d.pat === 'stripes') { g.strokeStyle = 'rgba(30,34,40,.55)'; g.lineWidth = Math.max(1, h * .045); for (let k = 0; k < 6; k++) { const y = -h * .32 + k * h * .11; g.beginPath(); g.moveTo(-L * .45, y); g.lineTo(L * .4, y); g.stroke(); } }
    if (d.pat === 'stripe') { g.fillStyle = 'rgba(30,40,20,.5)'; g.fillRect(-L * .45, -h * .06, L * .85, h * .14); }
    if (d.pat === 'spots' || d.pat === 'blotch') {
      g.fillStyle = d.pat === 'spots' ? dark : (it.id === 'koi' ? 'rgba(250,248,240,.85)' : 'rgba(30,26,16,.4)');
      for (let k = 0; k < (d.pat === 'spots' ? 26 : 9); k++) { g.beginPath(); g.ellipse(L * (rnd() * .8 - .42), h * (rnd() * .8 - .45), d.pat === 'spots' ? h * .04 : h * .14, d.pat === 'spots' ? h * .04 : h * .09, rnd() * 3, 0, 7); g.fill(); }
    }
    if (d.pat === 'scales') { g.strokeStyle = 'rgba(80,50,10,.35)'; g.lineWidth = 1; for (let x = -L * .4; x < L * .35; x += h * .16) for (let y = -h * .5; y < h * .5; y += h * .16) { g.beginPath(); g.arc(x + (Math.round(y / h * 6) % 2) * h * .08, y, h * .08, -1.2, 1.2); g.stroke(); } }
    if (d.scutes) { g.fillStyle = 'rgba(220,214,190,.8)'; for (let k = 0; k < 9; k++) { const x = L * (.3 - k * .08); g.beginPath(); g.moveTo(x, -h * .26); g.lineTo(x + h * .05, -h * .18); g.lineTo(x, -h * .1); g.lineTo(x - h * .05, -h * .18); g.fill(); } }
    if (d.ear) { g.fillStyle = d.ear; g.beginPath(); g.ellipse(L * .26, -h * .02, h * .07, h * .05, 0, 0, 7); g.fill(); }
    g.restore();
    // eye, gill line, whiskers
    const ex = L * (d.snout ? .38 : .36), ey = -h * .14;
    g.fillStyle = '#f4f2e8'; g.beginPath(); g.arc(ex, ey, Math.max(1.5, h * .08), 0, 7); g.fill();
    g.fillStyle = ['rockbass', 'smallmouth'].includes(it.id) ? '#b0201a' : '#111'; g.beginPath(); g.arc(ex + h * .015, ey, Math.max(1, h * .045), 0, 7); g.fill();
    g.strokeStyle = 'rgba(20,20,20,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(L * .27, -h * .32); g.quadraticCurveTo(L * .22, 0, L * .27, h * .3); g.stroke();
    if (d.whisk) { g.strokeStyle = 'rgba(40,36,30,.8)'; g.lineWidth = Math.max(1, h * .03); for (const [a, b] of [[-.05, .5], [.06, .55], [.1, .3]].slice(0, d.whisk > .6 ? 3 : 1)) { g.beginPath(); g.moveTo(nose - L * .02, h * a); g.quadraticCurveTo(nose + L * .06, h * (a + .1), nose + L * .03, h * b); g.stroke(); } }
  }
  g.restore();
}

// what the angler yells when you snap their line, and what they always say after
const YELLS = [
  'Are you kidding me?! That was my good damn line!',
  'Son of a— my LINE! You know what that stuff costs?!',
  'Aw, come ON! You horsed it in like a damn jabroni!',
  'What the hell was that?! You don’t yank it, you ease it!',
  'Jesus, Mary and Joseph! Twelve bucks of line, gone to hell!',
  'Holy crap! Did I say pull like a tow truck? Did I?!',
  'Dammit! That’s coming out of your hoagie money!',
  'Oh for God’s sake. Who taught you to fish, a Cowboys fan?!',
  'You snapped it! Hell’s bells, you snapped it clean off!',
];
const ONE_MORE = ['…Alright, alright. One more try.', 'Ugh. Fine. One more try.', 'Okay. Breathe. One more try.', 'I’m tying on a new hook. One more try.', '*sigh* …One more try.'];
const pickOf = a => a[Math.floor(Math.random() * a.length)];
// how hard it is (all of it in one place): the cast meter's swing (radians a second), nibbles a
// second, the strike window (s, less per rarity step), and the reel: tension gained holding (more
// while the fish runs) and shed letting go, per second; the green band where reeling gains line
// (30% outside it); reeling speed and how much a fish's fight slows it; line taken back on a run;
// the snap and slack limits (s); runs (length s0 + s1*rnd + s2*fight*rnd, every n0 + n1*rnd*(1.2 -
// fight) s); head shakes (sudden tension); and the fish tiring (its fight falls by tire over tireT s).
// Tuned by simulation: a player who watches the gauge and reacts in a quarter second lands common
// fish every time, strong ones ~90%, rare ~45%, legendary ~15%; one who ignores it lands almost none.
const HARD = { swing: 5.2, nibbles: 1.4, strike: .5, strikeStep: .06,
  tenUp: .5, runUp: 1.0, tenDown: .7, band: [.3, .85], reel: .3, reelFight: .1, runReel: .3, takeLine: .05, snap: .24, slack: 1.2,
  shake: .12, s0: .15, s1: .2, s2: .55, n0: .9, n1: 1.8, tire: .3, tireT: 45 };

// ---- the game
export function createFishing(api) {
  const K = CITY.storage + 'creel';
  const load = () => { try { return JSON.parse(localStorage.getItem(K)) || {}; } catch (e) { return {}; } };
  const save = c => { try { localStorage.setItem(K, JSON.stringify(c)); } catch (e) { /* not kept */ } };
  let creel = load();

  // the invitation, and the game dialog
  const el = (tag, cls, parent, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; if (parent) parent.appendChild(e); return e; };
  const modal = el('div', 'fish-modal', document.body); modal.hidden = true;
  modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'fish-title');
  const card = el('div', 'fish-card', modal);
  const head = el('div', 'fish-head', card), title = el('h2', '', head); title.id = 'fish-title';
  const close = el('button', 'fish-x', head, '×'); close.type = 'button'; close.setAttribute('aria-label', 'Close');
  const invite = el('div', 'fish-invite', card), quote = el('p', 'fish-quote', invite), irow = el('div', 'row', invite);
  const yes = el('button', '', irow, 'Yes, let’s fish'), no = el('button', 'ghost', irow, 'No thanks'); yes.type = no.type = 'button';
  const game = el('div', 'fish-game', card), cv = el('canvas', 'fish-cv', game);
  cv.setAttribute('aria-label', 'The river, your line and bobber. Press to cast, strike and reel.');
  const msg = el('p', 'fish-msg', game); msg.setAttribute('aria-live', 'polite');
  const grow = el('div', 'row fish-row', game);
  const again = el('button', '', grow, 'Cast again'), logBtn = el('button', 'ghost', grow, 'Catch log'), done = el('button', 'ghost', grow, 'Head back');
  [again, logBtn, done].forEach(b => { b.type = 'button'; });
  const log = el('div', 'fish-log', card), logHead = el('p', 'fish-loghead', log), grid = el('div', 'fish-grid', log);
  const back = el('button', 'fish-back', log, 'Back to fishing'); back.type = 'button';   // (kept in sight at the foot of the long log)
  // the picture is 400 high and as wide as the box the page gives it (css/style.css: 720 on a big
  // screen, squarer on a phone); k is picture pixels per CSS pixel, so its words stay legible
  const g = cv.getContext('2d'), H = 400;
  let W = 720, k = 1;

  let angler = null, state = 'idle', st = {}, raf = 0, last = 0, holding = false, lastFocus = null;
  const show = part => { invite.hidden = part !== 'invite'; game.hidden = part !== 'game'; log.hidden = part !== 'log'; card.dataset.part = part; };
  function open(i) {
    angler = api.anglerInfo(i); if (!angler) return;
    lastFocus = document.activeElement;
    api.viewAngler(i);
    title.textContent = `${angler.name}, fishing ${angler.spot}`;
    quote.textContent = `“${angler.hello}”`;
    modal.hidden = false; document.body.classList.add('fishing'); show('invite'); yes.focus();
  }
  function shut() {
    modal.hidden = true; document.body.classList.remove('fishing'); cancelAnimationFrame(raf); raf = 0; state = 'idle'; holding = false;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function start() {
    show('game'); size(); aim(); card.scrollTop = 0;
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
    cv.focus({ preventScroll: true });
  }
  const say = t => { msg.textContent = t; };
  function aim() { state = 'aim'; st = { t: 0 }; grow.hidden = true; say('Press to cast. The farther out, the deeper the water and the rarer the catch.'); }
  function size() {
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    if (r.width > 1 && r.height > 1) { W = Math.round(Math.min(720, Math.max(400, H * r.width / r.height))); k = W / r.width; }
    cv.width = Math.round((r.width || W) * dpr); cv.height = Math.round(cv.width * H / W); g.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
  }
  // a font for words in the picture: px, or more when the picture is small on screen (at least min CSS px)
  const font = (px, min, w = 600) => `${w} ${Math.round(Math.max(px, min * k))}px Archivo, system-ui, sans-serif`;

  const ctx = () => { const day = api.getDay ? api.getDay() : 180, hour = api.getTime(); return { day, hour, power: st.power || 0 }; };
  function press() {
    if (state === 'aim') { st.power = .5 - .5 * Math.cos(st.t * HARD.swing); state = 'cast'; st.ct = 0; say('…'); }
    else if (state === 'wait') { say('Too soon! You yanked the bait away.'); end(null, 'early'); }
    else if (state === 'bite') {
      const it = st.item;
      state = 'reel'; st.prog = 0; st.ten = .3; st.over = 0; st.slack = 0; st.surge = 0; st.next = .3 + Math.random() * .5; st.rt = 0;
      say(it.kind === 'fish' ? 'Fish on! Keep the tension in the green: hold to reel, let go when it runs.' : 'Something’s on. Feels… odd. Keep it in the green and reel.');
    }
  }
  function end(item, why) {
    state = 'over'; holding = false; grow.hidden = false;
    st.result = item; st.why = why; st.endT = st.t;
    // snapped their line: they let you have it, then give you one more try (every time)
    again.textContent = why === 'snap' ? 'One more try' : 'Cast again';
    again.focus();
    if (why === 'snap') {
      st.yell = pickOf(YELLS); st.oneMore = pickOf(ONE_MORE);
      say(`Snap! ${angler.name} yells: “${st.yell}” Then: “${st.oneMore}”`);
    }
    if (!item) return;
    const wt = item.lb ? item.lb[0] + (item.lb[1] - item.lb[0]) * Math.pow(Math.random(), 2.4) : 0;
    const rec = creel[item.id] || { n: 0, best: 0 }, isNew = !rec.n;
    rec.n++; if (wt > rec.best) rec.best = wt; creel[item.id] = rec; save(creel);
    st.weight = wt; st.isNew = isNew;
    const wtxt = wt ? (wt < 1 ? ` · ${Math.round(wt * 16)} oz` : ` · ${wt.toFixed(1)} lb`) : '';
    say(`${isNew ? 'New! ' : ''}${item.name} (${RARITY[item.r].label}${wtxt}). ${item.note}`);
  }

  function loop(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    step(dt); draw(now / 1000);
    raf = modal.hidden ? 0 : requestAnimationFrame(loop);
  }
  function step(dt) {
    st.t = (st.t || 0) + dt;
    if (state === 'cast') { st.ct += dt; if (st.ct > .9) { state = 'wait'; st.wait = 1.5 + Math.random() * (dusk(ctx()) ? 3 : 5); st.nib = 0; say('Watch the bobber…'); } }
    else if (state === 'wait') {
      st.wait -= dt;
      if (st.nib <= 0 && Math.random() < dt * HARD.nibbles) st.nib = .45;   // nibbles: not yet! (they look a lot like bites)
      st.nib -= dt;
      if (st.wait <= 0) {   // what's biting is decided now: the rarer it is, the quicker you must strike
        st.item = rollCatch(ctx()); state = 'bite'; st.bt = 0; st.win = HARD.strike - RANK.indexOf(st.item.r) * HARD.strikeStep; say('Bite! Strike now!');
      }
    } else if (state === 'bite') { st.bt += dt; if (st.bt > st.win) { say('Too slow. It stole the bait.'); end(null, 'slow'); } }
    else if (state === 'reel') {
      st.rt += dt;
      const f = st.item.fight * (1 - HARD.tire * Math.min(1, st.rt / HARD.tireT));   // it tires as you fight it
      // the fish makes runs (longer and more often the stronger it is) and shakes its head (jolts)
      st.next -= dt; if (st.next <= 0) { st.surge = HARD.s0 + HARD.s1 * Math.random() + HARD.s2 * f * Math.random(); st.next = HARD.n0 + Math.random() * HARD.n1 * (1.2 - f); }
      const running = st.surge > 0; st.surge -= dt;
      if (Math.random() < dt * 2 * f) st.ten += HARD.shake * f;
      const pull = f * (running ? 1 : .25), green = st.ten >= HARD.band[0] && st.ten <= HARD.band[1];
      if (holding) { st.ten += (HARD.tenUp + pull * HARD.runUp) * dt; st.prog += (HARD.reel - f * HARD.reelFight) * (running ? HARD.runReel : 1) * (green ? 1 : .3) * dt; }
      else { st.ten -= (HARD.tenDown - pull * .3) * dt; st.prog -= pull * HARD.takeLine * dt; }
      st.ten = Math.max(0, Math.min(1.05, st.ten)); st.prog = Math.max(0, st.prog);
      if (st.ten >= 1) { st.over += dt; if (st.over > HARD.snap) return end(null, 'snap'); } else st.over = Math.max(0, st.over - dt);
      if (st.ten < .1) { st.slack += dt; if (st.slack > HARD.slack) { say('The line went slack and it shook the hook.'); return end(null, 'slack'); } } else st.slack = 0;
      if (st.prog >= 1) end(st.item, 'caught');
    }
  }

  // ---- the picture: sky by the hour, the far bank and skyline, the river, you on the bank
  function draw(t) {
    const hour = api.getTime(), dayL = hour > 7 && hour < 17.5 ? 1 : hour > 5.5 && hour < 20 ? .5 : 0, WY = 175;
    const sky = g.createLinearGradient(0, 0, 0, WY);
    sky.addColorStop(0, dayL > .9 ? '#6fa8d8' : dayL > .4 ? '#35406e' : '#0b1430'); sky.addColorStop(1, dayL > .9 ? '#d8ecf6' : dayL > .4 ? '#f0a070' : '#1c2848');
    g.fillStyle = sky; g.fillRect(0, 0, W, WY);
    // the skyline across the river
    seed = 7; g.fillStyle = dayL > .4 ? '#7b8794' : '#1a2030';
    for (let x = 180; x < W; x += 14 + rnd() * 18) { const bh = 14 + rnd() * (x > 380 && x < 560 ? 95 : 40), bw = 10 + rnd() * 16; g.fillRect(x, WY - 22 - bh, bw, bh + 4);
      if (dayL < .5) { g.fillStyle = '#ffd890'; for (let k = 0; k < bh / 9; k++) if (rnd() < .4) g.fillRect(x + 2 + rnd() * (bw - 5), WY - 22 - bh + k * 9 + 3, 2, 3); g.fillStyle = '#1a2030'; } }
    g.fillStyle = dayL > .4 ? '#5d7c45' : '#1d2a1c'; g.fillRect(150, WY - 22, W - 150, 22);   // far bank trees
    // the river
    const wg = g.createLinearGradient(0, WY, 0, H); wg.addColorStop(0, dayL > .4 ? '#5a8494' : '#1e3442'); wg.addColorStop(1, dayL > .4 ? '#1c3a44' : '#0a1820');
    g.fillStyle = wg; g.fillRect(0, WY, W, H - WY);
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1;
    for (let k = 0; k < 14; k++) { const y = WY + 6 + k * 4, x = (k * 97 + t * (18 + k * 3)) % (W + 80) - 40; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 30 + k * 2, y); g.stroke(); }
    // fish going about their business down below
    seed = 3;
    for (let k = 0; k < 6; k++) { const it = ITEMS[k * 3 % 26], y = WY + 70 + rnd() * 140, sp = 14 + rnd() * 20, dir = rnd() < .5 ? 1 : -1;
      const x = ((rnd() * W + t * sp * dir) % (W + 120) + W + 120) % (W + 120) - 60; drawCatch(g, it, x, y, 34 + rnd() * 30, dir, t + k, .22, 'rgba(10,25,30,1)'); }
    // the bank you stand on, and you
    g.fillStyle = dayL > .4 ? '#7a6a52' : '#2a241c'; g.beginPath(); g.moveTo(0, WY - 30); g.lineTo(120, WY - 30); g.lineTo(150, WY + 30); g.lineTo(150, H); g.lineTo(0, H); g.fill();
    g.fillStyle = dayL > .4 ? '#2c3440' : '#0e1218'; g.beginPath(); g.arc(70, WY - 92, 11, 0, 7); g.fill(); g.fillRect(60, WY - 80, 20, 42); g.fillRect(58, WY - 40, 9, 12); g.fillRect(73, WY - 40, 9, 12);
    // rod, bending with the tension
    const ten = state === 'reel' ? st.ten : 0, hand = [84, WY - 66];
    const cast = state === 'aim' ? 0 : state === 'cast' ? Math.min(1, st.ct / .9) : 1, power = st.power || 0;
    const bx = 190 + power * (W - 250), by = WY + 2;
    const tip = state === 'aim' ? [hand[0] + 30 - Math.cos(st.t * HARD.swing) * 40, hand[1] - 78] : [hand[0] + 150 - ten * 20, hand[1] - 80 + ten * 55];   // wound back for the cast
    g.strokeStyle = '#1b1b1b'; g.lineWidth = 3; g.beginPath(); g.moveTo(hand[0], hand[1]); g.quadraticCurveTo(hand[0] + 70, hand[1] - 70 + ten * 50, tip[0], tip[1]); g.stroke();
    // the line, the bobber, the catch
    let end_ = null;
    if (state === 'cast') { const k = cast, x = tip[0] + (bx - tip[0]) * k, y = tip[1] + (by - tip[1]) * k - Math.sin(Math.PI * k) * 120; end_ = [x, y]; }
    else if (state === 'wait' || state === 'bite') {
      const dip = state === 'bite' ? 10 + Math.sin(st.bt * 30) * 3 : st.nib > 0 ? 6 + Math.sin(st.nib * 40) * 3 : 0;   // nibbles dip almost as deep
      end_ = [bx, by + Math.sin(t * 2.4) * 1.5 + dip];
      if (state === 'bite') { g.fillStyle = '#ffffff'; g.font = font(34, 22, 'bold'); g.textAlign = 'center'; g.fillText('!', bx, by - 30); }
    } else if (state === 'reel') {
      const fx = bx - (bx - 175) * st.prog + Math.sin(t * 7) * 10 * st.item.fight, fy = WY + 40 + (1 - st.prog) * 90 * (st.item.kind === 'fish' ? 1 : .5) + Math.sin(t * 5) * 6;
      end_ = [fx, fy];
      drawCatch(g, st.item, fx - (st.item.kind === 'fish' ? 30 : 0), fy, st.item.kind === 'fish' ? 80 + RANK.indexOf(st.item.r) * 14 : 54, 1, t);
    }
    if (end_) {
      g.strokeStyle = 'rgba(240,240,240,.8)'; g.lineWidth = 1; g.beginPath(); g.moveTo(tip[0], tip[1]);
      g.quadraticCurveTo((tip[0] + end_[0]) / 2, Math.max(tip[1], end_[1]) + 30 * (1 - ten), end_[0], end_[1]); g.stroke();
      if (state !== 'reel') { g.fillStyle = '#e0302a'; g.beginPath(); g.arc(end_[0], end_[1] - 2, 6, Math.PI, 0); g.fill(); g.fillStyle = '#f4f4f0'; g.beginPath(); g.arc(end_[0], end_[1] - 2, 6, 0, Math.PI); g.fill(); }
    }
    // gauges: the cast meter, or the line tension and how far there is to go
    g.font = font(12, 10.5); g.textAlign = 'left';
    if (state === 'aim') {
      const p = .5 - .5 * Math.cos(st.t * HARD.swing);
      bar(20, H - 34, 260, 14, p, '#e0a31c', 'Cast');
    } else if (state === 'reel') {
      const green = st.ten >= HARD.band[0] && st.ten <= HARD.band[1];
      g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(20, H - 52, 260, 14);
      g.fillStyle = 'rgba(61,154,74,.4)'; g.fillRect(20 + 260 * HARD.band[0], H - 52, 260 * (HARD.band[1] - HARD.band[0]), 14);   // the green band
      bar(20, H - 52, 260, 14, Math.min(1, st.ten), st.ten > HARD.band[1] ? '#d0302a' : green ? '#3d9a4a' : '#c9a227', 'Line tension', [[HARD.band[0], '#3d9a4a'], [HARD.band[1], '#d0302a']], true);
      bar(20, H - 26, 260, 10, st.prog, '#2f78c9', 'Reeled in');
      g.font = font(15, 13);
      const [sx, sy] = W >= 640 ? [420, H - 34] : [20, H - 64];   // beside the gauges, or above them on a narrow picture
      if (st.surge > 0) { g.fillStyle = '#ff6b5a'; g.fillText('It’s running!', sx, sy); }   // a run: ease off
      else { g.fillStyle = '#ffffff'; g.fillText(holding ? 'Reeling…' : 'Hold to reel', sx, sy); }
    }
    // the result
    if (state === 'over' && st.why === 'snap') {   // the angler beside you, yelling
      const age = st.t - st.endT, shake = age < .8 ? Math.sin(age * 60) * 4 * (1 - age / .8) : 0;
      speech(age > 1.4 ? `${st.yell} ${st.oneMore}` : st.yell, 100 + shake, WY - 112, '#fff1ee', '#b3261e', Math.round(Math.max(17, 12 * k)));   // then, after a beat, one more try
    }
    if (state === 'over' && st.result) {
      const it = st.result;
      const cw = Math.min(400, W - 40);
      g.fillStyle = 'rgba(10,16,22,.72)'; g.fillRect(W / 2 - cw / 2, 40, cw, 220);
      g.strokeStyle = RARITY[it.r].color; g.lineWidth = 3; g.strokeRect(W / 2 - cw / 2, 40, cw, 220);
      drawCatch(g, it, W / 2, 125, it.kind === 'fish' ? Math.min(210, cw - 60) : 120, 1, 0);
      g.textAlign = 'center'; g.fillStyle = '#ffffff'; g.font = font(22, 15); g.fillText(it.name, W / 2, 210, cw - 20);
      g.fillStyle = RARITY[it.r].color; g.font = font(14, 11);
      g.fillText(`${st.isNew ? 'NEW · ' : ''}${RARITY[it.r].label.toUpperCase()}${st.weight ? (st.weight < 1 ? ` · ${Math.round(st.weight * 16)} oz` : ` · ${st.weight.toFixed(1)} lb`) : ''}`, W / 2, 236);
    }
  }
  /** a speech bubble from the angler on the bank, its text wrapped to fit */
  function speech(text, x, y, fill, ink, size) {
    g.font = `600 ${size}px Archivo, system-ui, sans-serif`;
    const maxW = Math.min(300, W - x - 44), words = text.split(' '), lines = [];
    let line = '';
    for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
    lines.push(line);
    const lh = size * 1.3, bw = Math.max(...lines.map(l => g.measureText(l).width)) + 24, bh = lines.length * lh + 16, by = Math.max(8, y - bh);   // kept inside the picture
    g.fillStyle = fill; g.strokeStyle = ink; g.lineWidth = 2;
    g.beginPath(); g.roundRect ? g.roundRect(x, by, bw, bh, 12) : g.rect(x, by, bw, bh); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(x + 16, by + bh - 1); g.lineTo(x - 14, by + bh + 22); g.lineTo(x + 34, by + bh - 1); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(x + 16, by + bh); g.lineTo(x - 14, by + bh + 22); g.lineTo(x + 34, by + bh); g.stroke();
    g.fillStyle = ink; g.textAlign = 'left'; g.textBaseline = 'top';
    lines.forEach((l, i) => g.fillText(l, x + 12, by + 8 + i * lh));
    g.textBaseline = 'alphabetic';
  }
  function bar(x, y, w, h, v, col, label, marks = [], keepBg = false) {
    if (!keepBg) { g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x, y, w, h); }
    g.fillStyle = col; g.fillRect(x, y, w * v, h);
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1; g.strokeRect(x + .5, y + .5, w - 1, h - 1);
    for (const [m, c] of marks) { g.fillStyle = c; g.fillRect(x + w * m - 1, y - 3, 2, h + 6); }
    g.fillStyle = '#ffffff'; g.fillText(label, x + w + 10, y + h - 2);
  }

  function showLog() {
    show('log'); grid.textContent = '';
    const found = ITEMS.filter(it => creel[it.id]).length;
    logHead.textContent = `Your catch log: ${found} of ${ITEMS.length} found. Rarer ones bite farther out; some only in season or after dark.`;
    for (const it of ITEMS) {
      const rec = creel[it.id], cell = el('div', 'fish-cell', grid), c = el('canvas', '', cell);
      cell.style.borderColor = RARITY[it.r].color; c.width = c.height = 96; const cg = c.getContext('2d');
      drawCatch(cg, it, 48, 48, it.kind === 'fish' ? 84 : 70, 1, 0, 1, rec ? null : 'rgba(120,130,140,.55)');
      el('b', '', cell, rec ? it.name : '???');
      el('span', '', cell, rec ? `${RARITY[it.r].label} · ×${rec.n}${rec.best ? ` · best ${rec.best < 1 ? Math.round(rec.best * 16) + ' oz' : rec.best.toFixed(1) + ' lb'}` : ''}` : RARITY[it.r].label);
    }
    back.focus({ preventScroll: true }); card.scrollTop = 0;   // open at the top of the log
  }

  // controls: click / tap / Space / Enter presses; holding reels
  const down = e => { if (game.hidden || state === 'over') return; if (e) e.preventDefault(); holding = true; press(); };
  const up = () => { holding = false; };
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); down(e); });
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('contextmenu', e => e.preventDefault());   // a long press (holding to reel) is not a right-click
  new ResizeObserver(() => { if (!game.hidden) size(); }).observe(cv);   // turning the phone: the picture follows its box
  cv.tabIndex = 0;
  modal.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); shut(); return; }
    if ((e.key === ' ' || e.key === 'Enter') && !game.hidden && document.activeElement === cv) { if (!e.repeat) down(e); else e.preventDefault(); }
    e.stopPropagation();
  });
  modal.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') up(); e.stopPropagation(); });
  yes.addEventListener('click', start); no.addEventListener('click', shut); close.addEventListener('click', shut); done.addEventListener('click', shut);
  again.addEventListener('click', () => { aim(); cv.focus(); }); logBtn.addEventListener('click', showLog); back.addEventListener('click', () => { show('game'); again.focus(); });
  modal.addEventListener('pointerdown', e => { if (e.target === modal) shut(); });
  return { open, active: () => !modal.hidden };
}
