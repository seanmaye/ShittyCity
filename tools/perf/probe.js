// In-page instrumentation for tools/perf/perf.py (see tools/perf/README.md).
//
// perf.py injects this with add_init_script, so it runs before the page's own scripts. It
// wraps requestAnimationFrame (per-frame JS time) and, once main.js publishes
// window.__city, the renderer's render() (render CPU time, GPU time via
// EXT_disjoint_timer_query_webgl2, draw calls, triangles). Everything is exposed on
// window.__perf.
//
// It also works pasted into a DevTools console on a page that's already running (in the
// browser pane, Chrome DevTools MCP, ...): run it, then __perf.attach(window.__city) and
// e.g. await __perf.record(3000). Load timings and the first frame need the init-script route.
(() => {
  if (window.__perf) return;
  const cfg = window.__PERF_CFG || {};
  const now = () => performance.now();
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ---- deterministic runs: seeded Math.random, fixed calendar date (the clock still runs)
  if (cfg.seed != null) {
    const mulberry32 = a => () => {
      a = (a + 0x6D2B79F5) >>> 0; let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    Math.random = mulberry32(cfg.seed >>> 0);
    // three's object uuids draw from their own stream (perf.py patches generateUUID to use it), so
    // the number of objects a build creates doesn't shift the random numbers the app itself draws
    window.__perfUuidRandom = mulberry32((cfg.seed ^ 0x9E3779B9) >>> 0);
  }
  if (cfg.date) {
    const Real = Date, base = Real.parse(cfg.date) - now();
    class FixedDate extends Real {
      constructor(...a) { if (a.length) super(...a); else super(base + performance.now()); }
      static now() { return base + performance.now(); }
    }
    window.Date = FixedDate;
  }

  const P = window.__perf = { cfg, phases: [], longTasks: [], frameCount: 0, readyAt: null, firstFrame: null, api: null, gpuTimer: false };
  P.sleep = sleep;

  // ---- load: the #status line marks each build step; long tasks
  const watchStatus = () => {
    const el = document.getElementById('status'); if (!el) return;
    const log = () => P.phases.push({ t: now(), text: el.textContent });
    log(); new MutationObserver(log).observe(el, { childList: true, characterData: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchStatus); else watchStatus();
  try { new PerformanceObserver(l => l.getEntries().forEach(e => P.longTasks.push({ t: e.startTime, d: e.duration }))).observe({ type: 'longtask', buffered: true }); } catch (e) { /* unsupported */ }

  // main.js sets window.__city (window.__schuylkill before the city picker) right after
  // api.start(), before the first frame runs
  let appApi;
  for (const name of ['__city', '__schuylkill']) Object.defineProperty(window, name, {
    configurable: true, enumerable: true,
    get: () => appApi,
    set: v => { appApi = v; if (P.readyAt == null) P.readyAt = now(); if (v && v.renderer) P.attach(v); },
  });

  // ---- frames: every rAF callback is timed; callbacks with the same timestamp are one frame
  let cur = null, prevTs = null, rec = null, pollGpu = () => {}, paused = false, parked = [];
  const raf = window.requestAnimationFrame.bind(window);
  /** Stop the page's render loop (its rAF callbacks wait) / start it again, e.g. to take a heap
   *  snapshot of a still scene. Not for running two copies of the app side by side: the second
   *  copy renders 12-50% slower on a laptop GPU (see perf.py cmd_ab). */
  P.pause = () => { paused = true; };
  P.resume = () => {
    paused = false; prevTs = null;
    const cbs = parked; parked = [];
    cbs.forEach(cb => window.requestAnimationFrame(cb));
  };
  window.requestAnimationFrame = cb => (paused ? (parked.push(cb), 0) : raf(ts => {
    if (!cur || cur.ts !== ts) {
      if (cur) P.frameCount++;
      cur = { ts, dt: prevTs == null ? 0 : ts - prevTs, work: 0, render: 0, calls: 0, tris: 0, gpu: 0, gpuPending: 0, gpuBad: false };
      prevTs = ts;
      if (rec) rec.push(cur);
      pollGpu();
    }
    const s = now();
    try { cb(ts); } finally { cur.work += now() - s; }
  }));

  // ---- the renderer: CPU time inside render(), GPU time, draw counts; census hook
  let censusReq = null;
  P.attach = api => {
    if (P.api) return;
    P.api = api;
    import('three').then(m => { P.THREE = m; }, () => {});   // for the diagnostic toggles
    const r = api.renderer, gl = r.getContext();
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    P.gpuTimer = !!ext;
    const pending = [];
    let active = false;
    pollGpu = () => {
      if (!pending.length) return;
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      for (let i = 0; i < pending.length;) {
        const p = pending[i];
        if (!gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) { i++; continue; }
        const ns = gl.getQueryParameter(p.q, gl.QUERY_RESULT);
        gl.deleteQuery(p.q); pending.splice(i, 1);
        if (p.f) { p.f.gpuPending--; if (disjoint) p.f.gpuBad = true; else p.f.gpu += ns / 1e6; }
      }
    };
    const render = r.render;
    r.render = function (scene, camera) {
      const f = cur, s = now();
      let q = null, done = null;
      if (ext && !active) { q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); active = true; }
      if (censusReq && f && scene === api.scene) done = startCensus(r);
      try { return render.call(this, scene, camera); } finally {
        if (q) { gl.endQuery(ext.TIME_ELAPSED_EXT); active = false; pending.push({ q, f }); if (f) f.gpuPending++; }
        const d = now() - s;
        if (f) {
          f.render += d; f.calls += r.info.render.calls; f.tris += r.info.render.triangles;
          if (!P.firstFrame) P.firstFrame = { at: s, cpu: d, f };
        }
        if (done) { const req = censusReq; censusReq = null; req(done()); }
      }
    };
  };

  /** Record frames for `ms` milliseconds. Returns per-frame arrays (ms): dt (frame interval),
   *  work (all rAF callbacks), render (inside renderer.render), gpu (GPU time, null if
   *  unavailable), calls, tris. */
  P.record = async ms => {
    const frames = rec = [];
    await sleep(ms);
    rec = null;
    for (let i = 0; i < 60 && frames.some(f => f.gpuPending > 0); i++) await new Promise(r => raf(r));
    const R = x => Math.round(x * 100) / 100;
    return {
      dt: frames.map(f => R(f.dt)), work: frames.map(f => R(f.work)), render: frames.map(f => R(f.render)),
      gpu: frames.map(f => (P.gpuTimer && !f.gpuBad && f.gpuPending === 0 && f.render > 0 ? R(f.gpu) : null)),
      calls: frames.map(f => f.calls), tris: frames.map(f => f.tris),
    };
  };

  // ---- attribution: which code added each object to the scene
  // perf.py --census/--ablate appends a hook to three.module.js that records, for every
  // Object3D.add(), the app's call site and the build*/create* function it ran under, in
  // globalThis.__perfSrc (a WeakMap). Without that hook, objects are grouped by material.
  P.tagOf = o => {
    const src = window.__perfSrc;
    for (let x = o; x && src; x = x.parent) { const t = src.get(x); if (t) return t; }
    return null;
  };
  const groupOf = (o, material) => P.tagOf(o) || { b: 'untagged', s: `${material.type} #${material.color ? material.color.getHexString() : '-'}` };

  function startCensus(r) {
    const rows = new Map(), rbd = r.renderBufferDirect;
    r.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
      const pass = scene ? 'main' : 'shadow', g = groupOf(object, material), key = g.b + '\u0000' + g.s + '\u0000' + pass;
      let row = rows.get(key);
      if (!row) rows.set(key, row = { builder: g.b, site: g.s, pass, calls: 0, tris: 0, lines: 0, points: 0, instances: 0, materials: {} });
      const idx = geometry.index, pos = geometry.attributes.position;
      let n = idx ? idx.count : pos ? pos.count : 0;
      n = Math.min(n, geometry.drawRange.count); if (group) n = Math.min(n, group.count);
      const inst = object.isInstancedMesh ? object.count : geometry.isInstancedBufferGeometry ? geometry.instanceCount : 1;
      row.calls++; row.instances += inst; row.materials[material.type] = (row.materials[material.type] || 0) + 1;
      if (object.isMesh || object.isSprite) row.tris += material.wireframe ? 0 : Math.floor(n / 3) * inst;
      else if (object.isLine) row.lines += n * inst;
      else if (object.isPoints) row.points += n * inst;
      return rbd.apply(this, arguments);
    };
    return () => { r.renderBufferDirect = rbd; return [...rows.values()]; };
  }
  /** Every draw call of the next frame (main and shadow passes), grouped by source. */
  P.census = () => new Promise(res => { censusReq = res; });

  /** Scene totals: objects by type, instances, geometry memory, per builder when tagged. */
  P.inventory = () => {
    const api = P.api, r = api.renderer, seen = new Set(), per = {};
    const s = { objects: 0, meshes: 0, instancedMeshes: 0, instances: 0, lines: 0, points: 0, sprites: 0, lights: 0, castShadow: 0, geometries: 0, geometryMB: 0, materials: 0 };
    const mats = new Set(), geos = new Set();
    const bytes = a => { if (!a || seen.has(a)) return 0; seen.add(a); return a.byteLength; };
    const attrBytes = at => bytes(at.isInterleavedBufferAttribute ? at.data.array : at.array);
    api.scene.traverse(o => {
      s.objects++;
      const t = P.tagOf(o), b = t ? t.b : 'untagged', pb = per[b] || (per[b] = { objects: 0, meshes: 0, instances: 0, castShadow: 0, geometryMB: 0 });
      pb.objects++;
      if (o.isLight) s.lights++;
      if (o.isInstancedMesh) { s.instancedMeshes++; s.instances += o.count; pb.instances += o.count; }
      if (o.isMesh) { s.meshes++; pb.meshes++; if (o.castShadow) { s.castShadow++; pb.castShadow++; } }
      else if (o.isLine) s.lines++; else if (o.isPoints) s.points++; else if (o.isSprite) s.sprites++;
      (Array.isArray(o.material) ? o.material : o.material ? [o.material] : []).forEach(m => mats.add(m));
      let gb = 0;
      if (o.geometry && !geos.has(o.geometry)) {
        geos.add(o.geometry);
        for (const k in o.geometry.attributes) gb += attrBytes(o.geometry.attributes[k]);
        if (o.geometry.index) gb += attrBytes(o.geometry.index);
      }
      if (o.isInstancedMesh) { gb += attrBytes(o.instanceMatrix); if (o.instanceColor) gb += attrBytes(o.instanceColor); }
      s.geometryMB += gb / 1048576; pb.geometryMB += gb / 1048576;
    });
    s.geometries = geos.size; s.materials = mats.size;
    s.programs = r.info.programs ? r.info.programs.length : null;
    s.textures = r.info.memory.textures; s.geometryMB = Math.round(s.geometryMB * 10) / 10;
    Object.values(per).forEach(p => { p.geometryMB = Math.round(p.geometryMB * 10) / 10; });
    s.byBuilder = window.__perfSrc ? per : null;
    return s;
  };

  // ---- ablation: switch one thing off, measure, switch it back on (perf.py --ablate)
  /** Hide every object a builder added (render layers, so the app's own per-frame visibility
   *  toggles don't undo it). Lights stay on: removing one would recompile every shader. */
  P.hideBuilder = name => {
    const saved = [];
    P.api.scene.traverse(o => {
      if (o.isLight) return;
      const t = P.tagOf(o);
      if (t && t.b === name) { saved.push([o, o.layers.mask]); o.layers.mask = 0; }
    });
    P._restore = () => saved.forEach(([o, m]) => { o.layers.mask = m; });
    return saved.length;
  };
  const TOGGLES = {
    // stop re-rendering the shadow map every frame (shadows freeze but stay drawn): the shadow pass's cost
    'no shadow pass': api => { const sm = api.renderer.shadowMap, was = sm.autoUpdate; sm.autoUpdate = false; return () => { sm.autoUpdate = was; }; },
    // half the pixels: a big GPU drop means fragment/fill bound, none means vertex/draw bound
    'half resolution': api => { const r = api.renderer, pr = r.getPixelRatio(); r.setPixelRatio(pr / 2); return () => r.setPixelRatio(pr); },
    // the floating DOM labels (placeTags each frame, style recalc and layout)
    'labels off': () => { const b = document.getElementById('lbl'); b.click(); return () => b.click(); },
    // --- diagnostics: these change the picture (and recompile shaders); they only say where GPU time goes
    // surfaces stop sampling the shadow map (the shadow pass still runs): the cost of the soft-shadow lookups
    'diag: no shadow lookups': api => {
      const saved = []; api.scene.traverse(o => { if (o.receiveShadow) { saved.push(o); o.receiveShadow = false; } });
      return () => saved.forEach(o => { o.receiveShadow = true; });
    },
    // draw into a 1 x 1 pixel scissor: every vertex and draw call still runs (and the shadow pass), but
    // almost no pixels are shaded. What is left is the geometry cost; the drop is the main pass's pixel cost
    'diag: 1-pixel scissor': api => { const r = api.renderer; r.setScissor(0, 0, 1, 1); r.setScissorTest(true); return () => r.setScissorTest(false); },
    // draw into an off-screen target with and without 4x multisampling: the difference is what MSAA costs
    'diag: off-screen, MSAA x4': api => offscreen(api, 4),
    'diag: off-screen, no MSAA': api => offscreen(api, 0),
    // plain depth buffer instead of the logarithmic one (no gl_FragDepth, so early depth rejection works)
    'diag: no log depth': api => {
      const c = api.renderer.capabilities, was = c.logarithmicDepthBuffer, touch = () => allMaterials(api).forEach(m => { m.needsUpdate = true; });
      c.logarithmicDepthBuffer = false; touch(); return () => { c.logarithmicDepthBuffer = was; touch(); };
    },
  };
  const offscreen = (api, samples) => {
    const T = P.THREE, r = api.renderer, s = r.getDrawingBufferSize(new T.Vector2());
    const rt = samples ? new T.WebGLMultisampleRenderTarget(s.x, s.y) : new T.WebGLRenderTarget(s.x, s.y);
    if (samples) rt.samples = samples;
    r.setRenderTarget(rt); return () => { r.setRenderTarget(null); rt.dispose(); };
  };
  const allMaterials = api => { const s = new Set(); api.scene.traverse(o => (Array.isArray(o.material) ? o.material : o.material ? [o.material] : []).forEach(m => s.add(m))); return [...s]; };
  P.toggles = Object.keys(TOGGLES);
  P.applyToggle = name => { P._restore = TOGGLES[name](P.api); return true; };
  P.restore = () => { if (P._restore) { P._restore(); P._restore = null; } };

  /** Load timings, relative to navigation start (ms). */
  P.loadReport = () => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const res = performance.getEntriesByType('resource');
    const files = res.filter(e => /\/data\//.test(e.name)).map(e => ({ file: e.name.split('/data/')[1], start: e.startTime, end: e.responseEnd, kb: Math.round(e.encodedBodySize / 1024) }));
    const cdn = res.filter(e => /^https:/.test(e.name)).map(e => ({ url: e.name, start: e.startTime, end: e.responseEnd }));
    const ff = P.firstFrame;
    return {
      domContentLoaded: nav.domContentLoadedEventEnd, loadEvent: nav.loadEventEnd, files, cdn,
      phases: P.phases, readyAt: P.readyAt,
      firstFrame: ff ? { at: ff.at, cpu: ff.cpu, work: ff.f.work, gpu: P.gpuTimer && ff.f.gpuPending === 0 && !ff.f.gpuBad ? ff.f.gpu : null } : null,
      longTasks: P.longTasks, gpuTimer: P.gpuTimer,
    };
  };

  P.glInfo = () => {
    const gl = P.api.renderer.getContext(), d = gl.getExtension('WEBGL_debug_renderer_info');
    return { renderer: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), vendor: d ? gl.getParameter(d.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
             webgl2: P.api.renderer.capabilities.isWebGL2, maxTextureSize: P.api.renderer.capabilities.maxTextureSize, gpuTimer: P.gpuTimer,
             dpr: devicePixelRatio, pixelRatio: P.api.renderer.getPixelRatio(), canvas: [P.api.renderer.domElement.width, P.api.renderer.domElement.height] };
  };
})();
//# sourceURL=perf-probe.js
