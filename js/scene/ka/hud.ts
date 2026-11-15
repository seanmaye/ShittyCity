// The rider's readout on Kingda Ka: what the ride is doing ("Hold…", "LAUNCH", "Rollback!"), and speed, height and
// g-force as big numbers. Made here and put in the page's dock (index.html #dock, ahead of the action buttons: on a big
// screen it is placed at the top of the view, on a phone the dock stacks it over the buttons), shown only while you are
// aboard; cinematic mode hides the dock, and this with it. Its look is css/style.css, the "Kingda Ka" block at the end.
// With it, over the whole view, the edges of the rider's sight: they darken while the seat presses hard for long (the
// pull-up at the foot of the tower is four or five g for two seconds, and riders did grey out at the edges there).
export interface HudReadout {
  /** what the ride is doing; hot: say it loudly (the launch, a rollback) */
  phase: string; hot: boolean;
  mph: number; ft: number;
  /** how many g the rider feels in all, and the part of it through the seat (under 0: lifted out of it) */
  g: number; vert: number;
  /** how far the edges of the view have greyed, 0..1 */
  grey: number;
}

export function createHud() {
  // (no page: the tests, or a tool that builds the scene without one)
  if (typeof document === 'undefined') return { show(_on: boolean) {}, set(_r: HudReadout) {} };
  const el = document.createElement('div'); el.className = 'ka-hud'; el.id = 'ka-hud'; el.hidden = true; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'off');
  el.innerHTML = '<p class="ka-phase"></p><div class="ka-nums">'
    + '<div><b class="ka-v">0</b><span>mph</span></div><div><b class="ka-h">0</b><span>ft up</span></div><div><b class="ka-g">1.0</b><span class="ka-gl">g</span></div></div>';
  const dock = document.getElementById('dock'), acts = document.getElementById('actions');
  if (dock && acts && acts.parentNode === dock) dock.insertBefore(el, acts); else (document.getElementById('city-view') || document.body).appendChild(el);
  const vig = document.createElement('div'); vig.className = 'ka-grey'; vig.hidden = true; vig.setAttribute('aria-hidden', 'true');
  const canvas = document.getElementById('c');   // straight after the view's canvas: over the view, under every panel
  if (canvas) canvas.after(vig); else (document.getElementById('city-view') || document.body).appendChild(vig);
  let grey = -1;
  const phase = el.querySelector<HTMLElement>('.ka-phase'), v = el.querySelector('.ka-v'), h = el.querySelector('.ka-h'), g = el.querySelector<HTMLElement>('.ka-g'), gl = el.querySelector('.ka-gl');
  // written only when it changes: this runs every frame
  const put = (e: Element, t: string) => { if (e.textContent !== t) e.textContent = t; };
  return {
    show(on: boolean) { if (el.hidden === on) { el.hidden = !on; if (!on) { vig.hidden = true; grey = -1; } } },
    set(r: HudReadout) {
      put(phase, r.phase); phase.classList.toggle('hot', r.hot);
      put(v, String(Math.round(r.mph))); put(h, String(Math.max(0, Math.round(r.ft)))); put(g, r.g.toFixed(1));
      // floating: the seat is pushing less than a fifth of your weight, or pulling
      const float = r.vert < .2; g.classList.toggle('float', float); g.classList.toggle('heavy', r.g >= 3);
      put(gl, float ? 'g · airtime' : 'g');
      const k = Math.round(r.grey * 50) / 50; if (k !== grey) { grey = k; vig.hidden = k <= 0; vig.style.opacity = String(k); }
    },
  };
}
