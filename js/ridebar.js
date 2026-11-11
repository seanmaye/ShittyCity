// The line diagram at the bottom of the screen while you ride, like the strip map above a
// train's doors: the line in its colour, every stop evenly spaced, the stops already passed
// greyed out, the next stop in bold, and the train moving between them. Lines are drawn left
// (first stop) to right (last stop); the train's arrow shows which way it's heading.
const NS = 'http://www.w3.org/2000/svg';
const X0 = 30, X1 = 970, Y = 104;

export function createRidebar(api) {
  const el = document.getElementById('ridebar'), svg = document.getElementById('rb-svg');
  const nameEl = document.getElementById('rb-name'), toEl = document.getElementById('rb-to'), nextEl = document.getElementById('rb-next'), dot = document.getElementById('rb-dot');
  let key = null, last = 0, parts = null;
  const mk = (tag, attrs, parent = svg) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); parent.appendChild(e); return e; };

  function build(st) {
    svg.textContent = ''; parts = null;
    nameEl.textContent = st.name; dot.style.background = st.color;
    if (st.f == null) { svg.hidden = true; return; }
    svg.hidden = false;
    mk('line', { x1: X0, y1: Y, x2: X1, y2: Y, stroke: st.color, 'stroke-width': 9, 'stroke-linecap': 'round' });
    const n = (st.stops || []).length, many = n > 26;
    const stops = (st.stops || []).map((s, i) => {
      const x = n > 1 ? X0 + i / (n - 1) * (X1 - X0) : (X0 + X1) / 2;
      const c = mk('circle', { cx: x, cy: Y, r: many ? 5 : 6.5, fill: '#fff', stroke: st.color, 'stroke-width': 3 });
      const t = mk('text', { x: x + 2, y: Y - 13, transform: `rotate(-38 ${x + 2} ${Y - 13})`, style: many ? 'font-size:13px' : '' });
      t.textContent = s.t.length > 22 ? s.t.slice(0, 21) + '…' : s.t;
      return { f: s.f, x, name: s.t, c, el: t };
    });
    // the train: a pill in the line colour with an arrow for its direction
    const train = mk('g', {});
    mk('circle', { cx: 0, cy: 0, r: 11, fill: st.color, stroke: '#fff', 'stroke-width': 3 }, train);
    const arrow = mk('path', { d: 'M-4 -5 L4 0 L-4 5 Z', fill: '#fff' }, train);
    parts = { stops, train, arrow };
  }

  function update(now) {
    if (now - last < 200) return;
    last = now;
    const st = api.rideStrip && api.rideStrip();
    if (!st) { if (!el.hidden) { el.hidden = true; key = null; } return; }
    const k = st.name + '|' + (st.stops ? st.stops.length : 'x') + '|' + (st.f == null);
    if (k !== key) { key = k; build(st); }
    el.hidden = false;
    const stops = (parts && parts.stops) || [];
    const ends = stops.length > 1 ? [stops[0].name, stops[stops.length - 1].name] : null;
    toEl.textContent = st.loop ? (ends ? '· loop' : '') : ends ? `→ ${st.dir > 0 ? ends[1] : ends[0]}` : '';
    nextEl.innerHTML = '';
    if (st.next) { nextEl.append('Next: '); const s = document.createElement('strong'); s.textContent = st.next; nextEl.append(s); }
    if (!parts) return;
    // between two stops, the train sits in proportion to the real distance between them
    let x = X0 + st.f * (X1 - X0);
    if (stops.length > 1) {
      const j = stops.findIndex(s => s.f > st.f);
      if (j === 0) x = stops[0].x; else if (j < 0) x = stops[stops.length - 1].x;
      else { const a = stops[j - 1], b = stops[j]; x = a.x + (b.x - a.x) * (st.f - a.f) / Math.max(1e-6, b.f - a.f); }
    }
    parts.train.setAttribute('transform', `translate(${x} ${Y})`);
    parts.arrow.setAttribute('transform', st.dir < 0 ? 'scale(-1 1)' : '');
    // passed stops (behind the train in its direction of travel) grey out; the next one is bold
    let found = false;
    for (const s of st.dir > 0 ? stops : [...stops].reverse()) {
      const passed = st.dir > 0 ? s.f < st.f - .004 : s.f > st.f + .004, isNext = !passed && !found;
      if (isNext) found = true;
      s.c.setAttribute('fill', passed ? '#d5d9dc' : isNext ? st.color : '#fff');
      s.el.setAttribute('class', passed ? 'done' : isNext ? 'next' : '');
    }
  }
  return { update };
}
