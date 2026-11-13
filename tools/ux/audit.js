// In-page UI/UX audit for tools/ux/ux.py (see tools/ux/README.md).
//
// ux.py injects this with add_init_script. It exposes window.__ux:
//   __ux.audit({ touch })   measure the visible UI: panels, tap targets, overflow, overlap,
//                           occlusion, small text, truncation, desktop-only wording, label clutter
//   __ux.annotate(findings) outline every finding on the page (for the annotated screenshot)
//   __ux.clear()            remove the outlines
//   __ux.reset()            put the app back in its plain state between scenarios (leave cars,
//                           close dialogs and pickers, transit and cut-away off, labels on)
//   __ux.fold(open)         open (true) or fold (false) the HUD panel with its own button
//   __ux.findCar(pred)      scan the canvas for a point where api.pickCar() hits something
//   __ux.tapPoint(sel)      centre of an element, for a real tap from Python
// It also works pasted into a DevTools console on a running page.
(() => {
  if (window.__ux) return;
  const vis = el => {
    if (!el || !el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const R = el => el.getBoundingClientRect();
  const area = r => Math.max(0, r.width) * Math.max(0, r.height);
  const inter = (a, b) => {
    const l = Math.max(a.left, b.left), t = Math.max(a.top, b.top), r = Math.min(a.right, b.right), btm = Math.min(a.bottom, b.bottom);
    return r > l && btm > t ? { left: l, top: t, right: r, bottom: btm, width: r - l, height: btm - t } : null;
  };
  const box = r => ({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
  const txt = el => (el.getAttribute('aria-label') || el.textContent || el.title || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  // a readable name for an element: #id, else tag.class "text"
  function name(el) {
    if (!el || el === document) return '?';
    if (el.id) return '#' + el.id;
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    const t = txt(el);
    let p = el.parentElement, scope = '';
    while (p && !p.id) p = p.parentElement;
    if (p) scope = '#' + p.id + ' ';
    return `${scope}${el.tagName.toLowerCase()}${cls}${t ? ` "${t}"` : ''}`;
  }

  // ---- what counts as UI chrome: known panels, plus any other fixed-position box that is not a
  // full-screen backdrop (so new panels are picked up without editing this file)
  const KNOWN = {
    hud: '.hud .card', minimap: '#minimap', ridebar: '#ridebar', actions: '#actions', persona: '#persona',
    credit: '#credit', modehint: '#modehint', 'binoc-cap': '#binoc-cap', 'menu-card': '.menu-card',
    'loading-copy': '.loading-copy', 'fish-card': '.fish-card', 'arc-card': '.arc-card',
  };
  const NOT_CHROME = new Set(['c', 'tags', 'binoc', 'xhair', 'err', 'city-view', 'city-loading', 'menu', 'ux-ann']);
  function regions() {
    const vw = innerWidth, vh = innerHeight, out = [], seen = new Set();
    for (const [k, sel] of Object.entries(KNOWN)) {
      for (const el of document.querySelectorAll(sel)) {
        if (!vis(el)) continue;
        const r = R(el); if (area(r) < 4) continue;
        out.push({ key: k, el, r }); seen.add(el);
      }
    }
    for (const el of document.body.querySelectorAll('*')) {
      if (seen.has(el) || NOT_CHROME.has(el.id) || el.closest('#ux-ann')) continue;
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' || !vis(el)) continue;
      const r = R(el); if (area(r) < 4 || area(r) > .85 * vw * vh) continue;   // backdrops
      if ([...seen].some(s => s.contains(el) || el.contains(s))) continue;
      out.push({ key: name(el), el, r }); seen.add(el);
    }
    return out;
  }
  // a full-screen dialog backdrop that is open (everything behind it is meant to be covered)
  const modalOpen = () => [...document.querySelectorAll('.fish-modal, .arc-modal, .menu, #city-loading')].find(vis) || null;

  const INTERACTIVE = 'button, a[href], input, select, textarea, [role="button"], [role="slider"], [tabindex]:not([tabindex="-1"]), #mm, .fish-cv, .arc-cv, .arc-pick';
  // where an element can be seen: its box, clipped by overflow:hidden ancestors; a scrollable
  // ancestor whose content overflows stands in for it (you can scroll it into view)
  function reach(el) {
    let b = R(el), scroller = null, shown = true;
    for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a), ox = cs.overflowX, oy = cs.overflowY;
      const scrollY = /(auto|scroll)/.test(oy) && a.scrollHeight > a.clientHeight + 1, scrollX = /(auto|scroll)/.test(ox) && a.scrollWidth > a.clientWidth + 1;
      if (scrollY || scrollX) {
        const ar = R(a), own = inter(R(el), ar);
        if (!own || area(own) < area(R(el)) * .98) shown = false;   // scrolled out of sight for now
        b = { left: scrollX ? ar.left : b.left, right: scrollX ? ar.right : b.right, top: scrollY ? ar.top : b.top, bottom: scrollY ? ar.bottom : b.bottom }; b.width = b.right - b.left; b.height = b.bottom - b.top; scroller = scroller || a; continue;
      }
      if (ox !== 'visible' || oy !== 'visible') { const c = inter(b, R(a)); if (!c) return { b: null, scroller, shown: false }; b = c; }
      if (cs.position === 'fixed') break;
    }
    return { b, scroller, shown };
  }

  const DESKTOP_WORDS = /right-click|right click|\bW A S D\b|\bWASD\b|arrow keys|\bEsc\b|\bSpace\b|\bShift\b|scroll (?:to|sets|for|wheel)|\bmouse\b|\bhover\b|\bclick\b|\bclicking\b|keyboard/gi;

  function audit(opt = {}) {
    const touch = opt.touch ?? matchMedia('(pointer:coarse)').matches;
    const vw = innerWidth, vh = innerHeight, VP = { left: 0, top: 0, right: vw, bottom: vh, width: vw, height: vh };
    const F = [];
    const add = (sev, kind, el, msg, extra = {}) => F.push({ sev, kind, el: typeof el === 'string' ? el : name(el), msg, box: el && el.getBoundingClientRect ? box(R(el)) : extra.box, ...extra, _el: typeof el === 'string' ? null : el });
    const modal = modalOpen();
    const regs = regions();

    // panels that run off the screen (a panel that doesn't fit and can't scroll)
    for (const g of regs) {
      // a panel inside a box that scrolls (the start menu) can be scrolled into view
      const sc = reach(g.el).scroller;
      if (sc && (() => { const v = inter(R(sc), VP); return v && area(v) > .9 * area(R(sc)); })()) continue;
      const r = g.r, over = { top: -r.top, left: -r.left, bottom: r.bottom - vh, right: r.right - vw };
      const worst = Object.entries(over).filter(([, v]) => v > 1).map(([k, v]) => `${k} ${Math.round(v)}px`);
      if (worst.length) add('error', 'panel-offscreen', g.el, `${g.key} runs off the screen (${worst.join(', ')})`, { region: g.key });
    }
    // panels on top of each other
    for (let i = 0; i < regs.length; i++) for (let j = i + 1; j < regs.length; j++) {
      const a = regs[i], b = regs[j], c = inter(a.r, b.r); if (!c) continue;
      if (modal && modal.contains(a.el) !== modal.contains(b.el)) continue;   // a dialog over what's behind its backdrop
      const frac = area(c) / Math.max(1, Math.min(area(a.r), area(b.r)));
      if (frac < .02 && area(c) < 150) continue;
      add(frac > .15 ? 'error' : 'warn', 'overlap', a.el, `${a.key} overlaps ${b.key} (${Math.round(area(c))} px², ${Math.round(frac * 100)}% of the smaller)`, { other: name(b.el), box: box(c) });
    }

    // every visible control: size, reachability, is it covered
    const targets = [...document.querySelectorAll(INTERACTIVE)].filter(el => vis(el) && !el.closest('#ux-ann') && !el.closest('[inert]'));
    let nTargets = 0;
    for (const el of targets) {
      if (el.disabled) continue;
      const cs = getComputedStyle(el); if (cs.pointerEvents === 'none') continue;
      // a hidden <input> inside a label (the custom colour swatch): measure the label
      const tgt = (el.tagName === 'INPUT' && el.type !== 'range' && cs.opacity === '0' && el.closest('label')) || el;
      const r = R(tgt); if (area(r) < 1) continue;
      nTargets++;
      const { b, scroller, shown } = reach(tgt);
      if (!b) { add('warn', 'clipped', tgt, 'control is clipped out of sight by its container'); continue; }
      const vis2 = inter(b, VP), frac = vis2 ? area(vis2) / Math.max(1, area(b)) : 0;
      if (frac < .98) {
        add(frac < .5 ? 'error' : 'warn', 'offscreen', tgt, `control is ${Math.round((1 - frac) * 100)}% off the screen${scroller ? ' (its scroll box too)' : ''}`);
        continue;
      }
      // size: WCAG 2.5.8 minimum is 24 px, Apple and Material ask for 44 / 48 on touch
      const w = Math.round(r.width), h = Math.round(r.height), min = Math.min(w, h);
      const isRange = el.type === 'range';
      if (min < 24) add(touch ? 'error' : 'warn', 'small-target', tgt, `${w}×${h} px${isRange ? ' (slider: the track is the target)' : ''}; minimum 24, aim for 44 on touch`, { size: [w, h] });
      else if (touch && min < 44) add('warn', 'small-target', tgt, `${w}×${h} px; touch targets should be 44×44 or more`, { size: [w, h] });
      // covered by something else (not by an open dialog's backdrop: that is the point of it).
      // Only what is in sight now: a control scrolled out of its box is reached by scrolling
      if (!shown) continue;
      const rr = inter(r, VP) || r;
      const cx = Math.min(vw - 1, Math.max(0, (rr.left + rr.right) / 2)), cy = Math.min(vh - 1, Math.max(0, (rr.top + rr.bottom) / 2));
      const top = document.elementFromPoint(cx, cy);
      if (top && top !== tgt && !tgt.contains(top) && !top.contains(tgt) && !(tgt.tagName === 'LABEL' && tgt.contains(el))) {
        const cov = top.closest('.fish-modal, .arc-modal, .menu, #city-loading');
        if (!(cov && !cov.contains(tgt)) && !(modal && !modal.contains(tgt)))
          add('error', 'occluded', tgt, `centre is covered by ${name(top)}`, { other: name(top) });
      }
    }

    // text: too small, or cut off
    const smalls = new Map();
    const textRoots = regs.map(g => g.el);
    for (const root of textRoots) {
      const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!n.nodeValue.trim()) continue;
        const el = n.parentElement; if (!vis(el)) continue;
        // SVG text scales with its viewBox: measure what is drawn on screen
        let fs = parseFloat(getComputedStyle(el).fontSize);
        const svg = el.closest('svg'); if (svg && el.getScreenCTM) { const m = el.getScreenCTM(); if (m) fs = Math.round(fs * Math.hypot(m.a, m.b) * 10) / 10; }
        if (fs < 12) { const k = name(el).replace(/ ".*$/, ''); const s = smalls.get(k) || { fs, n: 0, el }; s.n++; s.fs = Math.min(s.fs, fs); smalls.set(k, s); }
      }
      for (const el of root.querySelectorAll('*')) {
        if (!vis(el)) continue;
        const cs = getComputedStyle(el);
        if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) add('warn', 'truncated', el, `text is cut off with an ellipsis (${el.scrollWidth} px of text in ${el.clientWidth} px)`);
        else if (cs.overflowY === 'hidden' && el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0 && el.childElementCount === 0) add('warn', 'truncated', el, `content is clipped (${el.scrollHeight} px in ${el.clientHeight} px)`);
      }
    }
    for (const [k, s] of smalls) add(s.fs < 10.5 ? 'warn' : 'info', 'small-text', s.el, `${s.n} text run(s) at ${s.fs}px (< 12px)`, { el: k, _el: s.el });

    // the page itself must not scroll sideways
    const se = document.scrollingElement;
    if (se.scrollWidth > vw + 1) add('error', 'h-scroll', 'document', `the page scrolls sideways (${se.scrollWidth}px wide in a ${vw}px viewport)`, { box: { x: 0, y: 0, w: se.scrollWidth, h: vh } });

    // desktop-only instructions shown on a touch screen
    if (touch) for (const g of regs) {
      const t = (g.el.innerText || '').replace(/\s+/g, ' ');
      const hits = [...new Set((t.match(DESKTOP_WORDS) || []).map(s => s.toLowerCase()))];
      if (hits.length) add('warn', 'desktop-copy', g.el, `mouse/keyboard wording on a touch screen: ${hits.join(', ')}`, { region: g.key, words: hits });
    }

    // floating labels: how many, how many collide or sit under a panel or off the edge
    const tags = [...document.querySelectorAll('#tags .tag')].filter(vis).map(el => ({ el, r: R(el) }));
    let tagHits = 0, tagUnder = 0, tagEdge = 0;
    for (let i = 0; i < tags.length; i++) {
      for (let j = i + 1; j < tags.length; j++) if (inter(tags[i].r, tags[j].r)) tagHits++;
      if (regs.some(g => inter(tags[i].r, g.r))) tagUnder++;
      if (tags[i].r.left < 0 || tags[i].r.right > vw || tags[i].r.top < 0) tagEdge++;
    }
    if (tags.length && tagHits > Math.max(2, tags.length * .15)) add('warn', 'label-clutter', '#tags', `${tagHits} overlapping label pairs among ${tags.length} labels`);

    // how much of the 3D view the chrome covers (sampled on a grid against the panels' boxes)
    let covered = 0, N = 0;
    for (let y = 4; y < vh; y += 8) for (let x = 4; x < vw; x += 8) { N++; if (regs.some(g => x >= g.r.left && x < g.r.right && y >= g.r.top && y < g.r.bottom)) covered++; }
    const chromePct = Math.round(covered / Math.max(1, N) * 100);
    if (!modal && chromePct > 50) add('warn', 'coverage', 'chrome', `the panels cover ${chromePct}% of the view`, { box: { x: 0, y: 0, w: vw, h: vh } });

    // data-ux-ok="kind kind…" on an element (or an ancestor) marks those findings as intended there
    const okd = F.filter(f => {
      const el = f._el; if (!el || !el.closest) return true;
      for (let a = el.closest('[data-ux-ok]'); a; a = a.parentElement && a.parentElement.closest('[data-ux-ok]'))
        if (a.dataset.uxOk.split(/[\s,]+/).includes(f.kind)) return false;
      return true;
    });
    F.length = 0; F.push(...okd.map(f => { delete f._el; return f; }));
    const order = { error: 0, warn: 1, info: 2 };
    F.sort((a, b) => order[a.sev] - order[b.sev]);
    return {
      viewport: { w: vw, h: vh, dpr: devicePixelRatio }, touch,
      media: { coarse: matchMedia('(pointer:coarse)').matches, hoverNone: matchMedia('(hover:none)').matches, landscape: vw > vh },
      modal: modal ? name(modal) : null,
      regions: regs.map(g => ({ key: g.key, el: name(g.el), box: box(g.r) })),
      metrics: { chromePct, targets: nTargets, tags: tags.length, tagOverlaps: tagHits, tagsUnderPanels: tagUnder, tagsOffEdge: tagEdge },
      findings: F,
    };
  }

  // ---- outlines for the annotated screenshot
  function annotate(findings) {
    clear();
    const layer = document.createElement('div'); layer.id = 'ux-ann';
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;font:600 10px/1.2 system-ui,sans-serif';
    const COL = { error: '#e0102f', warn: '#f08c00', info: '#1c7ed6' };
    let i = 0;
    for (const f of findings) {
      if (!f.box || f.kind === 'coverage' || f.kind === 'h-scroll') continue;
      i++;
      const d = document.createElement('div'), c = COL[f.sev];
      d.style.cssText = `position:absolute;left:${f.box.x}px;top:${f.box.y}px;width:${Math.max(2, f.box.w)}px;height:${Math.max(2, f.box.h)}px;outline:2px ${f.sev === 'info' ? 'dashed' : 'solid'} ${c};outline-offset:-1px;background:${c}14`;
      const t = document.createElement('span'); t.textContent = i;
      t.style.cssText = `position:absolute;left:-1px;top:-13px;background:${c};color:#fff;padding:0 3px;border-radius:2px`;
      if (f.box.y < 13) t.style.top = '0';
      d.appendChild(t); layer.appendChild(d); f.n = i;
    }
    document.body.appendChild(layer);
    return findings;
  }
  function clear() { document.getElementById('ux-ann')?.remove(); }

  // ---- driving the app between scenarios (through its own buttons where there is one)
  const $ = id => document.getElementById(id);
  const click = el => { if (el && vis(el) && !el.disabled) { el.click(); return true; } return false; };
  async function reset() {
    const api = window.__city;
    for (const sel of ['.fish-x', '.arc-x']) document.querySelectorAll(sel).forEach(b => { if (vis(b)) b.click(); });
    if (document.pointerLockElement) document.exitPointerLock();
    if (api) {
      if (api.getCar()) { if (!click($('getoff'))) api.leaveCar(true); }
      api.setRiding && api.setRiding(false, true); api.setFly && api.setFly(0, 0, 0);
      api.controls.autoRotate = false;
    }
    // the panel's toggles are only clickable with it open (a phone state may have folded it)
    const wasFolded = $('hud-body') && $('hud-body').hidden;
    if (wasFolded) $('fold').click();
    if ($('lines') && !$('lines').hidden) click($('ride'));
    if ($('transit')?.getAttribute('aria-pressed') === 'true') click($('transit'));
    if ($('cut')?.getAttribute('aria-pressed') === 'true') click($('cut'));
    if ($('lbl')?.textContent === 'Show labels') click($('lbl'));
    if (wasFolded && !$('hud-body').hidden) $('fold').click();
    window.scrollTo(0, 0);
    document.querySelectorAll('.hud .card, #hud-body, .lines, .persona, .fish-card, .arc-card').forEach(e => { e.scrollTop = 0; });
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  }
  function fold(open) {
    const body = $('hud-body'); if (!body) return;
    if (open === body.hidden) $('fold').click();
  }
  // scan the canvas for a point where api.pickCar hits something (pred filters the hit)
  function findCar(pred = () => true, step = 12) {
    const api = window.__city, c = api.renderer.domElement;
    for (let y = step; y < c.clientHeight - step; y += step) for (let x = step; x < c.clientWidth - step; x += step) {
      if (document.elementFromPoint(x, y) !== c) continue;
      const h = api.pickCar(x, y); if (h && pred(h)) return { x, y };
    }
    return null;
  }
  // the same, by kind: car (a train or monorail car), person, seat, hunter (the overlook), angler, stall
  const KIND = { car: h => h.person === undefined && h.seat === undefined && !h.hunter, person: h => h.person !== undefined, seat: h => h.seat !== undefined, hunter: h => !!h.hunter, any: () => true };
  function findPick(kind = 'car', step = 12) {
    const api = window.__city, c = api.renderer.domElement, W = c.clientWidth, H = c.clientHeight;
    // from the middle outwards: what's nearest the centre is what a person would tap
    const pts = [];
    for (let y = step; y < H - step; y += step) for (let x = step; x < W - step; x += step) pts.push([x, y, (x - W / 2) ** 2 + (y - H / 2) ** 2]);
    pts.sort((a, b) => a[2] - b[2]);
    for (const [x, y] of pts) {
      if (document.elementFromPoint(x, y) !== c) continue;   // under a panel: a finger there taps the panel
      if (kind === 'angler') { if (api.pickAngler && api.pickAngler(x, y) != null) return { x, y }; continue; }
      if (kind === 'stall') { if (api.pickStall && api.pickStall(x, y)) return { x, y }; continue; }
      const h = api.pickCar(x, y); if (h && KIND[kind](h)) return { x, y };
    }
    return null;
  }
  // scroll the boxes around an element (not the page) until it's in sight, as a finger would
  function scrollTo(el) {
    for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (!/(auto|scroll)/.test(cs.overflowY) || a.scrollHeight <= a.clientHeight + 1) continue;
      const er = R(el), ar = R(a);
      if (er.top < ar.top) a.scrollTop -= ar.top - er.top + 8;
      else if (er.bottom > ar.bottom) a.scrollTop += er.bottom - ar.bottom + 8;
    }
  }
  function tapPoint(sel) {
    const el = typeof sel === 'string' ? document.querySelector(sel) : sel; if (!el || !vis(el)) return null;
    scrollTo(el);
    const r = R(el); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  // the camera, for gesture checks
  function cam() {
    const api = window.__city, p = api.camera.position, t = api.controls.target;
    return { x: p.x, y: p.y, z: p.z, tx: t.x, ty: t.y, tz: t.z, dist: p.distanceTo(t), az: Math.atan2(p.x - t.x, p.z - t.z) };
  }

  window.__ux = { audit, annotate, clear, reset, fold, findCar, findPick, scrollTo, tapPoint, cam, name, vis };
})();
