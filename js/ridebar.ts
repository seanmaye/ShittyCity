// The line diagram at the bottom of the screen while you ride, like the strip map above a
// train's doors: the line in its colour, every stop evenly spaced, the stops already passed
// greyed out, the next stop in bold, and the train moving between them. Lines are drawn left
// (first stop) to right (last stop); the train's arrow shows which way it's heading.
// On a narrow bar (a phone, or beside the open panel on a tablet: css/style.css switches on the
// bar's own width) the whole line can't be drawn legibly, so it shows the stops around the train
// instead, in the order the train reaches them, left to right, with real-size names.
const NS = 'http://www.w3.org/2000/svg';
const X0 = 30, X1 = 970, Y = 104;

export function createRidebar(api) {
  const el = document.getElementById('ridebar'), svg = document.getElementById('rb-svg');
  const nameEl = document.getElementById('rb-name'), toEl = document.getElementById('rb-to'), nextEl = document.getElementById('rb-next'), dot = document.getElementById('rb-dot');
  // the narrow strip: the line, a few stops (a dot and a name each) and the train
  const near = document.createElement('div'); near.className = 'rb-near'; near.setAttribute('aria-hidden', 'true');
  near.dataset.uxOk = 'truncated';   // a long stop name is clamped to two lines here; the next one is written out in full above
  nameEl.dataset.uxOk = 'truncated';   // narrow: the line's name gives way (ellipsis) to where it's going
  const rail = document.createElement('b'), list = document.createElement('ol'), pill = document.createElement('i');
  rail.className = 'rb-rail'; list.className = 'rb-stops'; pill.className = 'rb-train';
  near.append(rail, list, pill); el.appendChild(near);
  let key = null, nearKey = null, last = 0, parts = null;
  const mk = (tag, attrs, parent = svg) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); parent.appendChild(e); return e; };

  function build(st) {
    svg.textContent = ''; parts = null; nearKey = null;
    nameEl.textContent = st.name; dot.style.background = st.color; el.style.setProperty('--c', st.color);
    near.hidden = st.f == null; svg.toggleAttribute('hidden', st.f == null);   // (an SVG element has no `hidden` property)
    if (st.f == null) return;
    mk('line', { x1: X0, y1: Y, x2: X1, y2: Y, stroke: st.color, 'stroke-width': 9, 'stroke-linecap': 'round' });
    const n = (st.stops || []).length, many = n > 26;
    svg.setAttribute('viewBox', n ? '0 0 1000 120' : '0 84 1000 40');   // no stop names to make room for: just the line
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

  /** the narrow strip: the last stop passed, the next, and as many after it as fit, nearest first */
  function strip(st, stops, nextI) {
    const W = near.clientWidth; if (!W) return;   // the wide diagram is showing instead
    const n = stops.length, loop = st.loop;
    if (!n) {   // a line with no stops of its own (the 1953 streetcars, Philadelphia's monorails): just where along it
      if (nearKey !== 'bare') { nearKey = 'bare'; list.textContent = ''; rail.style.left = '0'; rail.style.right = '0'; rail.className = 'rb-rail'; }
      pill.style.left = (st.f * 100).toFixed(2) + '%'; pill.classList.toggle('back', st.dir < 0);
      return;
    }
    // in the order the train meets them (a loop: round from the stop just passed)
    const ord = st.dir > 0 ? stops : [...stops].reverse();
    const j = nextI < 0 ? n : ord.indexOf(stops[nextI]);
    const m = Math.min(n, Math.max(3, Math.min(6, Math.round(W / 92))));
    const start = loop ? j - 1 : Math.max(0, Math.min(j - 1, n - m)), at = i => ord[((i % n) + n) % n];
    const shown = []; for (let k = 0; k < m; k++) shown.push(at(start + k));
    const k2 = shown.map(s => s.name).join('|') + '#' + (j - start);
    if (k2 !== nearKey) {
      nearKey = k2; list.textContent = '';
      shown.forEach((s, k) => {
        const li = document.createElement('li'), d = document.createElement('i'), t = document.createElement('span');
        t.textContent = s.name; li.className = k < j - start ? 'done' : k === j - start ? 'next' : ''; li.append(d, t); list.appendChild(li);
      });
      // the rail runs on past the ends of the window where the line does (faded), else stops at its last stop
      const moreL = loop || start > 0, moreR = loop || start + m < n;
      rail.className = 'rb-rail' + (moreL ? ' more-l' : '') + (moreR ? ' more-r' : '');
      rail.style.left = moreL ? '0' : (50 / m).toFixed(2) + '%'; rail.style.right = moreR ? '0' : (50 / m).toFixed(2) + '%';
    }
    // the train, between the stop it passed and the next, in proportion to the real distance
    const p = j - start, cell = k => (k + .5) / m * 100;
    let x;
    if (!loop && j >= n) x = cell(m - 1) + 35 / m;                 // past the last stop, running out to the end
    else if (!loop && j === 0) x = Math.max(2, cell(0) - 35 / m);    // not yet at the first
    else {
      const a = at(j - 1).f, b = at(j).f, span = loop ? ((b - a) % 1 + 1) % 1 : b - a, gone = loop ? ((st.f - a) % 1 + 1) % 1 : st.f - a;
      x = cell(p - 1) + Math.max(0, Math.min(1, span ? gone / span : 0)) * 100 / m;
    }
    pill.style.left = x.toFixed(2) + '%'; pill.classList.remove('back');
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
    toEl.textContent = st.loop ? '· loop' : ends ? `→ ${st.dir > 0 ? ends[1] : ends[0]}` : '';
    if (!parts) { nextEl.textContent = nextEl.dataset.v = ''; return; }
    // between two stops, the train sits in proportion to the real distance between them
    let x = X0 + st.f * (X1 - X0);
    if (stops.length > 1) {
      const j = stops.findIndex(s => s.f > st.f);
      if (j === 0) x = stops[0].x; else if (j < 0) x = stops[stops.length - 1].x;
      else { const a = stops[j - 1], b = stops[j]; x = a.x + (b.x - a.x) * (st.f - a.f) / Math.max(1e-6, b.f - a.f); }
    }
    parts.train.setAttribute('transform', `translate(${x} ${Y})`);
    parts.arrow.setAttribute('transform', st.dir < 0 ? 'scale(-1 1)' : '');
    // the next stop is the one the train's sign announces (st.next: the real track, both ways), or,
    // where it names none on the diagram, the first ahead of the train; those behind it grey out
    // (on a loop nothing stays passed)
    let found = -1, bd = Infinity;
    if (st.next) stops.forEach((s, i) => { const d = Math.abs(s.f - st.f); if (s.name === st.next && d < bd) { bd = d; found = i; } });
    if (found < 0) {
      const ahead = stops.map((s, i) => (st.dir > 0 ? i : stops.length - 1 - i));
      found = ahead.find(i => (st.dir > 0 ? stops[i].f >= st.f - .004 : stops[i].f <= st.f + .004)) ?? (st.loop && stops.length ? 0 : -1);
    }
    stops.forEach((s, i) => {
      const passed = !st.loop && (found < 0 || (st.dir > 0 ? i < found : i > found)), isNext = i === found;
      s.c.setAttribute('fill', passed ? '#d5d9dc' : isNext ? st.color : '#fff');
      s.el.setAttribute('class', passed ? 'done' : isNext ? 'next' : '');
    });
    const next = st.next || (found >= 0 ? stops[found].name : null);
    if (nextEl.dataset.v !== (next || '')) {
      nextEl.dataset.v = next || ''; nextEl.textContent = '';
      if (next) { const l = document.createElement('span'), s = document.createElement('strong'); l.className = 'rb-nl'; l.textContent = 'Next'; s.textContent = next; nextEl.append(l, ' ', s); }
    }
    strip(st, stops, found);
  }
  return { update };
}
