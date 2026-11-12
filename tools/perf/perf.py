"""Runtime performance harness: drives the real app in Chromium with the GPU on, measures load
and per-frame cost in a set of scenarios, and writes a report plus CPU and allocation profiles
that open in Chrome DevTools. See tools/perf/README.md.

  python -I tools/perf/perf.py run [--quick | -s overview-dusk,ride-L] [--repeat 3] [--label before]
  python -I tools/perf/perf.py run -s overview-dusk --census --ablate
  python -I tools/perf/perf.py compare tools/perf/out/<before> tools/perf/out/<after>
  python -I tools/perf/perf.py hot tools/perf/out/<run>/overview-dusk.cpuprofile [--focus frame]
  python -I tools/perf/perf.py list

Needs Python Playwright and its Chromium (pip install playwright; python -m playwright install chromium).
"""
import argparse
import datetime
import functools
import hashlib
import http.server
import json
import os
import re
import shutil
import statistics
import subprocess
import sys
import threading
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from scenarios import QUICK, RESET, SCENARIOS  # noqa: E402

PROBE = os.path.join(HERE, 'probe.js')
CACHE = os.path.join(HERE, '.cache')
OUT = os.path.join(HERE, 'out')
CDN = re.compile(r'^https://(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)/')
THREE_MODULE = 'three@0.128.0/build/three.module.js'
FIXED_DATE = '2026-10-15T12:00:00-04:00'   # the sun's path depends on the date: pin it
MB = 1048576

# Appended to three.module.js for --census/--ablate: records which app code added each object.
# `builder` is the outermost build*/create* function under buildScene (one per scene module,
# e.g. buildCity, buildSubway); `site` is the app file:line that called add().
TAG_PATCH = r"""
;(() => {   // appended by tools/perf/perf.py: who added each object to the scene
  const SRC = globalThis.__perfSrc = new WeakMap(), add = Object3D.prototype.add;
  const FRAME = /at (?:(.+?) \()?(?:[a-z]+:\/\/[^/]+)?\/(js\/[^\s():]+):(\d+):\d+\)?$/;
  Object3D.prototype.add = function (...objs) {
    const lim = Error.stackTraceLimit; Error.stackTraceLimit = 80;
    const stack = new Error().stack.split('\n'); Error.stackTraceLimit = lim;
    let site = null, builder = null;
    for (const line of stack) {
      const m = FRAME.exec(line.trim()); if (!m) continue;
      if (!site) site = m[2] + ':' + m[3];
      const fn = (m[1] || '').split(/[ .]/).pop();
      if (fn === 'buildScene') break;
      if (/^(build|create)[A-Z]/.test(fn)) builder = fn;
    }
    if (site) for (const o of objs) if (o && o !== this && !SRC.has(o)) SRC.set(o, { b: builder || site.replace(/^.*\//, '').replace(/:\d+$/, ''), s: site });
    return add.apply(this, objs);
  };
})();
"""


# ---------------------------------------------------------------- serving the app

class _Handler(http.server.SimpleHTTPRequestHandler):
    # HTTP/1.1 keep-alive: with the default HTTP/1.0 close-per-request, current Playwright's
    # request interception (the CDN route in open_app) resets parallel module loads
    # (net::ERR_CONNECTION_RESET) and the scene never starts
    protocol_version = 'HTTP/1.1'

    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


class _Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 128   # the page opens dozens of module and data requests at once; Windows refuses past the default 5

    def handle_error(self, request, client_address):   # the browser closing sockets early is fine
        pass


class _SnapHandler(_Handler):
    """Serves a snapshot folder (perf.py snap); anything it does not hold (data/) comes from ROOT."""

    def translate_path(self, path):
        p = super().translate_path(path)
        if os.path.exists(p):
            return p
        rel = os.path.relpath(p, self.directory)
        return p if rel.startswith('..') else os.path.join(ROOT, rel)


def serve(root=ROOT):
    srv = _Server(('127.0.0.1', 0), functools.partial(_Handler if os.path.samefile(root, ROOT) else _SnapHandler, directory=root))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f'http://127.0.0.1:{srv.server_address[1]}'


def cdn_handler(tag_three):
    """Serve three.js and the font from tools/perf/.cache (filled on first use): no CDN latency
    in the load numbers, and runs work offline once cached."""
    os.makedirs(CACHE, exist_ok=True)

    def handle(route):
        url = route.request.url
        h = hashlib.sha1(url.encode()).hexdigest()[:20]
        bp, mp = os.path.join(CACHE, h + '.body'), os.path.join(CACHE, h + '.json')
        if os.path.exists(bp) and os.path.exists(mp):
            with open(bp, 'rb') as f:
                body = f.read()
            with open(mp, encoding='utf-8') as f:
                meta = json.load(f)
        else:
            r = route.fetch()
            body = r.body()
            meta = {'url': url, 'status': r.status, 'type': r.headers.get('content-type', 'application/octet-stream')}
            if r.ok:
                with open(bp, 'wb') as f:
                    f.write(body)
                with open(mp, 'w', encoding='utf-8') as f:
                    json.dump(meta, f)
        if url.endswith(THREE_MODULE):
            # three draws four random numbers for every object's uuid. Give those their own stream, so
            # creating one object more or fewer doesn't reshuffle the app's seeded Math.random (tree
            # shapes and colours): screenshots then stay comparable across code changes.
            body = body.replace(b'function generateUUID() {', b'function generateUUID() { const Math = { random: globalThis.__perfUuidRandom || globalThis.Math.random };', 1)
            if tag_three:
                body += TAG_PATCH.encode()
        route.fulfill(status=meta['status'], body=body, headers={'content-type': meta['type'], 'access-control-allow-origin': '*'})
    return handle


def gpu_args():
    # no vsync and no frame cap: frames run as fast as the slower of CPU and GPU allows, so a
    # 12 ms -> 9 ms improvement shows up instead of both reading as 16.7 ms
    a = ['--disable-gpu-vsync', '--disable-frame-rate-limit', '--ignore-gpu-blocklist', '--enable-gpu']
    # headless Chromium falls back to SwiftShader (software GL) unless told to use the real GPU
    if sys.platform == 'win32':
        a.append('--use-angle=d3d11')
    elif sys.platform == 'darwin':
        a.append('--use-angle=metal')
    else:
        a += ['--use-angle=vulkan', '--enable-features=Vulkan']
    return a


def git(*args):
    try:
        return subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True, timeout=10).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ''


# ---------------------------------------------------------------- numbers

def dist(xs):
    xs = sorted(x for x in xs if x is not None)
    if not xs:
        return None
    q = lambda p: xs[min(len(xs) - 1, int(round(p / 100 * (len(xs) - 1))))]  # noqa: E731
    return {'mean': round(statistics.fmean(xs), 2), 'p50': q(50), 'p95': q(95), 'p99': q(99), 'max': xs[-1], 'n': len(xs)}


def metrics(cdp):
    return {m['name']: m['value'] for m in cdp.send('Performance.getMetrics')['metrics']}


def frame_summary(fr, m0, m1):
    """fr: __perf.record() arrays; m0/m1: Performance.getMetrics before and after."""
    sl = lambda k: fr[k][1:]   # noqa: E731  (the first interval straddles the start)
    dt = sl('dt')
    n = max(1, len(dt))
    s = {'frames': len(dt), 'fps': round(1000 / statistics.fmean(dt), 1) if dt else 0,
         'dt': dist(dt), 'work': dist(sl('work')), 'render': dist(sl('render')),
         'other': dist([w - r for w, r in zip(sl('work'), sl('render'))]),
         'gpu': dist(sl('gpu')), 'calls': statistics.median(sl('calls')) if dt else 0,
         'tris': statistics.median(sl('tris')) if dt else 0}
    p50 = s['dt']['p50'] if s['dt'] else 0
    s['hitches'] = sum(1 for d in dt if d > max(50, 2.5 * p50))
    secs = max(1e-6, m1['Timestamp'] - m0['Timestamp'])
    d = lambda k: (m1.get(k, 0) - m0.get(k, 0))   # noqa: E731
    s['main'] = {'taskMsPerFrame': round(d('TaskDuration') * 1000 / n, 2),
                 'scriptMsPerS': round(d('ScriptDuration') * 1000 / secs, 1),
                 'styleMsPerS': round(d('RecalcStyleDuration') * 1000 / secs, 1),
                 'layoutMsPerS': round(d('LayoutDuration') * 1000 / secs, 1),
                 'styleRecalcsPerFrame': round(d('RecalcStyleCount') / n, 2),
                 'layoutsPerFrame': round(d('LayoutCount') / n, 2)}
    s['heapMB'] = round(m1['JSHeapUsedSize'] / MB, 1)
    s['bound'] = bound(s)
    return s


def bound(s):
    """What limits the frame rate: the GPU, the page's main thread, or something else."""
    if not s['dt']:
        return '?'
    dt, main = s['dt']['p50'], s['main']['taskMsPerFrame']
    gpu = s['gpu']['p50'] if s['gpu'] else None
    # a busy GPU also shows up as main-thread time: WebGL calls block once the command buffer
    # to the GPU process is full, so check the GPU first
    if gpu is not None and gpu >= .75 * dt:
        return 'GPU'
    if main >= .75 * dt:
        return 'CPU'
    return 'other'   # GPU process, compositor, or a frame cap


# ---------------------------------------------------------------- profiles

SPECIAL = {'(root)', '(program)', '(idle)', '(garbage collector)'}
NATIVE = '(native: WebGL calls, builtins)'   # self time in functions with no script URL
BUILDER = re.compile(r'(build|create)[A-Z]')


def short_url(u):
    if not u:
        return ''
    m = re.match(r'https?://(?:127\.0\.0\.1|localhost):\d+/(.*)', u)
    if m:
        return m.group(1)
    if 'three@' in u:
        return 'three/' + u.rsplit('/', 1)[-1]
    return u


def _label(k):
    fn, url, line = k
    return f'{fn} ({url}:{line})' if url else fn


class _Tree:
    """A call tree (cpuprofile nodes, or a heap profile's nested head) with self costs."""

    def __init__(self, nodes, self_cost):
        self.nodes = nodes            # id -> node
        self.self = self_cost         # id -> cost
        self.kids = {i: n.get('children', []) for i, n in nodes.items()}
        child = {c for cs in self.kids.values() for c in cs}
        self.root = next(i for i in nodes if i not in child)
        self.key = {}
        for i, n in nodes.items():
            cf = n['callFrame']
            self.key[i] = (cf['functionName'] or '(anonymous)', short_url(cf['url']), cf['lineNumber'] + 1)
        order, st = [], [self.root]
        while st:
            i = st.pop()
            order.append(i)
            st.extend(self.kids[i])
        self.sub = {}
        for i in reversed(order):
            self.sub[i] = self.self.get(i, 0) + sum(self.sub[c] for c in self.kids[i])

    def scope(self, focus=None):
        """Roots to analyse: the whole tree, or the outermost calls of `focus`."""
        if not focus:
            return [self.root]
        out, st = [], [self.root]
        while st:
            i = st.pop()
            if self.key[i][0] == focus:
                out.append(i)
            else:
                st.extend(self.kids[i])
        return out

    def totals(self, roots):
        selfk, totk, cnt = defaultdict(float), defaultdict(float), defaultdict(int)
        st = [(r, False) for r in roots]
        while st:
            i, leaving = st.pop()
            k = self.key[i]
            if leaving:
                cnt[k] -= 1
                continue
            selfk[k] += self.self.get(i, 0)
            if cnt[k] == 0:
                totk[k] += self.sub[i]
            cnt[k] += 1
            st.append((i, True))
            st.extend((c, False) for c in self.kids[i])
        return selfk, totk

    def lines(self, roots, limit, max_depth=22, unit=lambda v: f'{v:8.1f} ms', denom=1.0):
        """Top-down tree, merging siblings with the same function and folding direct recursion."""
        out = []

        def expand(ids, pk):
            res, st = [], [c for i in ids for c in self.kids[i]]
            while st:
                c = st.pop()
                if self.key[c] == pk:
                    st.extend(self.kids[c])
                else:
                    res.append(c)
            return res

        def walk(ids, pk, depth):
            groups = defaultdict(list)
            for c in expand(ids, pk):
                if self.key[c][0] != '(idle)':
                    groups[self.key[c]].append(c)
            for k, cs in sorted(groups.items(), key=lambda kv: -sum(self.sub[c] for c in kv[1])):
                t = sum(self.sub[c] for c in cs)
                if t < limit:
                    break
                out.append(f'{100 * t / denom:5.1f}% {unit(t)}  ' + '  ' * depth + _label(k))
                if depth < max_depth:
                    walk(cs, k, depth + 1)
        walk(roots, None, 0)
        return out


def analyze_cpu(p, frames=None, top=15, focus=None, tree_pct=1.5):
    """Summarise a .cpuprofile: self/total time per function, time per file, a top-down tree.
    frames: frames rendered during the profile, to also report ms per frame."""
    nodes = {n['id']: n for n in p['nodes']}
    self_ms = defaultdict(float)
    sm, td = p['samples'], p['timeDeltas']
    for i, nid in enumerate(sm):
        self_ms[nid] += (td[i + 1] if i + 1 < len(td) else 0) / 1000
    t = _Tree(nodes, self_ms)
    wall = (p['endTime'] - p['startTime']) / 1000
    byname = defaultdict(float)
    for i, v in self_ms.items():
        if t.key[i][0] in SPECIAL:
            byname[t.key[i][0]] += v
    roots = t.scope(focus)
    selfk, totk = t.totals(roots)
    busy = sum(t.sub[r] for r in roots) - (byname['(idle)'] if not focus else 0)
    busy = max(busy, 1e-9)
    pf = (lambda v: round(v / frames, 3)) if frames else (lambda v: None)

    def rows(d, skip_special=True):
        r = [(k, v) for k, v in d.items() if not (skip_special and k[0] in SPECIAL)]
        r.sort(key=lambda kv: -kv[1])
        return [{'fn': k[0], 'file': k[1], 'line': k[2], 'ms': round(v, 1), 'pct': round(100 * v / busy, 1), 'msPerFrame': pf(v)} for k, v in r[:top]]
    files = defaultdict(float)
    for k, v in selfk.items():
        files[k[1] or (k[0] if k[0] in SPECIAL else NATIVE)] += v
    files.pop('(idle)', None)
    builders = sorted(((k, v) for k, v in totk.items() if BUILDER.match(k[0]) and k[1].startswith('js/')), key=lambda kv: -kv[1])
    return {
        'focus': focus, 'wallMs': round(wall, 1), 'busyMs': round(busy, 1), 'idleMs': round(byname['(idle)'], 1),
        'gcMs': round(byname['(garbage collector)'], 1), 'programMs': round(byname['(program)'], 1),
        'frames': frames, 'busyMsPerFrame': pf(busy),
        'nativeMs': round(files.get(NATIVE, 0), 1), 'nativeMsPerFrame': pf(files.get(NATIVE, 0)),
        'self': rows(selfk), 'total': rows(totk),
        'builders': [{'fn': k[0], 'file': k[1], 'line': k[2], 'ms': round(v, 1)} for k, v in builders],
        'files': [{'file': f, 'ms': round(v, 1), 'pct': round(100 * v / busy, 1)} for f, v in sorted(files.items(), key=lambda kv: -kv[1])[:12]],
        'tree': t.lines(roots, busy * tree_pct / 100, denom=busy),
    }


def analyze_heap(p, secs, top=12, focus=None):
    """Summarise a sampled allocation profile (bytes allocated per function, kept or not)."""
    nodes, self_b, st = {}, {}, [p['head']]
    while st:
        n = st.pop()
        nodes[n['id']] = {'callFrame': n['callFrame'], 'children': [c['id'] for c in n.get('children', [])]}
        self_b[n['id']] = n.get('selfSize', 0)
        st.extend(n.get('children', []))
    t = _Tree(nodes, self_b)
    roots = t.scope(focus)
    selfk, totk = t.totals(roots)
    total = max(1, sum(t.sub[r] for r in roots))

    def rows(d):
        r = sorted(((k, v) for k, v in d.items() if k[0] not in SPECIAL), key=lambda kv: -kv[1])[:top]
        return [{'fn': k[0], 'file': k[1], 'line': k[2], 'MB': round(v / MB, 2), 'MBps': round(v / MB / secs, 2), 'pct': round(100 * v / total, 1)} for k, v in r]
    return {'allocMB': round(total / MB, 1), 'MBps': round(total / MB / secs, 2), 'secs': round(secs, 1),
            'self': rows(selfk), 'total': rows(totk),
            'tree': t.lines(roots, total * 2 / 100, unit=lambda v: f'{v / MB:7.2f} MB', denom=total)}


def census_tables(rows):
    tot = defaultdict(int)
    by_b = defaultdict(lambda: dict.fromkeys(('calls', 'shadowCalls', 'tris', 'shadowTris', 'lines', 'points'), 0))
    sites = defaultdict(lambda: {'calls': 0, 'shadowCalls': 0, 'tris': 0, 'shadowTris': 0, 'instances': 0, 'materials': defaultdict(int)})
    for r in rows:
        sh = r['pass'] == 'shadow'
        b = by_b[r['builder']]
        b['shadowCalls' if sh else 'calls'] += r['calls']
        b['shadowTris' if sh else 'tris'] += r['tris']
        b['lines'] += r['lines']
        b['points'] += r['points']
        tot['shadowCalls' if sh else 'calls'] += r['calls']
        tot['shadowTris' if sh else 'tris'] += r['tris']
        s = sites[(r['builder'], r['site'])]
        s['shadowCalls' if sh else 'calls'] += r['calls']
        s['shadowTris' if sh else 'tris'] += r['tris']
        if not sh:
            s['instances'] += r['instances']
            for m, c in r['materials'].items():
                s['materials'][m] += c
    builders = sorted(({'builder': k, **v} for k, v in by_b.items()), key=lambda d: -(d['calls'] + d['shadowCalls']))
    site_rows = sorted(({'builder': b, 'site': s, **{k: (dict(v) if k == 'materials' else v) for k, v in d.items()}} for (b, s), d in sites.items()),
                       key=lambda d: -(d['calls'] + d['shadowCalls']))
    return {'totals': dict(tot), 'builders': builders, 'sites': site_rows[:25]}


# ---------------------------------------------------------------- driving the app

# Before an `ab --shots` screenshot: the app moves the sun's shadow box to the camera's focus in
# steps (only when the focus is more than 150 m from it), so where it ends up after a camera flight
# depends on frame timing, and the shadow map's texels land differently from run to run. Centre it
# on the focus exactly, so both sides draw their shadows from the same place.
SHOT_ALIGN = """() => {
  const api = (window.__city || window.__schuylkill), sun = api.scene.children.find(o => o.isDirectionalLight);
  if (!sun || api.getCar()) return;
  const off = sun.position.clone().sub(sun.target.position), t = api.controls.target;
  sun.target.position.set(t.x, 0, t.z); sun.position.copy(sun.target.position).add(off);
}"""

def js_setup(sc):
    return 'async () => { const api = window.__city || window.__schuylkill, P = window.__perf;\n' + RESET + sc['setup'] + '\n}'


def quick_measure(page, ms):
    fr = page.evaluate('ms => __perf.record(ms)', ms)
    g = lambda k: dist(fr[k][1:])   # noqa: E731
    out = {}
    for k in ('dt', 'work', 'render', 'gpu'):
        d = g(k)
        out[k] = d['p50'] if d else None
    out['calls'] = statistics.median(fr['calls'][1:]) if len(fr['calls']) > 1 else 0
    out['tris'] = statistics.median(fr['tris'][1:]) if len(fr['tris']) > 1 else 0
    return out


def ablate(page, sc, a, census):
    """Switch each part off in turn and measure what the frame loses."""
    ms = int(a.ablate_seconds * 1000)
    moving = sc.get('moving')

    def measure_with(apply_js=None):
        if apply_js:
            page.evaluate(apply_js)
        if moving:   # moving scenarios restart from their first frame for every measurement
            page.evaluate(js_setup(sc))
            page.wait_for_timeout(sc.get('settle', a.settle))
        else:
            page.wait_for_timeout(800 if apply_js else 0)
        m = quick_measure(page, ms)
        if apply_js:
            page.evaluate('__perf.restore()')
            page.wait_for_timeout(400)
        return m

    base1 = measure_with()
    items = [('toggle', t) for t in page.evaluate('__perf.toggles')]
    tc = census['totals']
    calls_all = max(1, tc.get('calls', 0) + tc.get('shadowCalls', 0))
    tris_all = max(1, tc.get('tris', 0) + tc.get('shadowTris', 0))
    picked = [b['builder'] for b in census['builders']
              if b['builder'] != 'untagged' and ((b['calls'] + b['shadowCalls']) / calls_all >= .02 or (b['tris'] + b['shadowTris']) / tris_all >= .02)]
    items += [('hide', b) for b in picked[:a.ablate_max]]
    res = []
    for kind, name in items:
        js = f'__perf.applyToggle({json.dumps(name)})' if kind == 'toggle' else f'__perf.hideBuilder({json.dumps(name)})'
        res.append({'what': name if kind == 'toggle' else f'hide {name}', **measure_with(js)})
    base2 = measure_with()
    base = {k: (None if base1[k] is None or base2[k] is None else round((base1[k] + base2[k]) / 2, 2)) for k in base1}
    for r in res:
        for k in ('dt', 'work', 'render', 'gpu', 'calls', 'tris'):
            r['d_' + k] = None if r[k] is None or base[k] is None else round(r[k] - base[k], 2)
    return {'baseline': base, 'baselineDrift': {k: (None if base1[k] is None or base2[k] is None else round(base2[k] - base1[k], 2)) for k in base1}, 'rows': res}


def run_scenario(page, cdp, sc, a, art):
    name = sc['name']
    page.evaluate(js_setup(sc))
    page.wait_for_timeout(sc.get('settle', a.settle))
    m0 = metrics(cdp)
    fr = page.evaluate('ms => __perf.record(ms)', int(a.seconds * 1000))
    m1 = metrics(cdp)
    s = {'desc': sc.get('desc', ''), **frame_summary(fr, m0, m1)}
    if art:
        with open(os.path.join(art, name + '.frames.json'), 'w') as f:
            json.dump(fr, f)
    if art and not a.no_profile:
        secs = a.profile_seconds
        heap_ok = True
        cdp.send('HeapProfiler.enable')
        try:
            cdp.send('HeapProfiler.startSampling', {'samplingInterval': 32768, 'includeObjectsCollectedByMajorGC': True, 'includeObjectsCollectedByMinorGC': True})
        except Exception:   # older Chromium: live objects only
            try:
                cdp.send('HeapProfiler.startSampling', {'samplingInterval': 32768})
            except Exception:
                heap_ok = False
        f0 = page.evaluate('__perf.frameCount')
        cdp.send('Profiler.setSamplingInterval', {'interval': 100})
        cdp.send('Profiler.start')
        page.wait_for_timeout(int(secs * 1000))
        prof = cdp.send('Profiler.stop')['profile']
        heap = cdp.send('HeapProfiler.stopSampling')['profile'] if heap_ok else None
        frames = page.evaluate('__perf.frameCount') - f0
        with open(os.path.join(art, name + '.cpuprofile'), 'w') as f:
            json.dump(prof, f)
        s['cpu'] = analyze_cpu(prof, frames=frames, top=a.top)
        if heap:
            with open(os.path.join(art, name + '.heapprofile'), 'w') as f:
                json.dump(heap, f)
            s['heap'] = analyze_heap(heap, secs, top=a.top)
    if art:
        page.screenshot(path=os.path.join(art, name + '.png'))
    if a.census or a.ablate:
        rows = page.evaluate('__perf.census()')
        s['census'] = census_tables(rows)
        if art:
            with open(os.path.join(art, name + '.census.json'), 'w') as f:
                json.dump(rows, f, indent=0)
        if a.ablate:
            print(f'    ablating {name}…', flush=True)
            s['ablation'] = ablate(page, sc, a, s['census'])
    return s


def load_phases(L):
    """#status messages -> [(label, startMs, ms)], ending with the first frame."""
    out = []
    for p in L['phases']:
        label = 'Loading map data (fetch + decode)' if p['text'].startswith('Loading map data') else p['text'].strip()
        if not label:
            break
        if out and out[-1][0] == label:
            continue
        out.append([label, p['t']])
    end = L['readyAt'] or (out[-1][1] if out else 0)
    res = [(lab, round(t0, 1), round((out[i + 1][1] if i + 1 < len(out) else end) - t0, 1)) for i, (lab, t0) in enumerate(out)]
    if L.get('firstFrame'):
        ff = L['firstFrame']
        res.append(('first frame (shader compile, buffer upload)', round(ff['at'], 1), round(ff['work'], 1)))
    return res


def launch(pw, a):
    return pw.chromium.launch(headless=not a.headed, channel=a.channel, args=gpu_args())


def open_app(browser, a, base, tag=False, profile_load=False):
    """A new context and page with the probe, loaded until the scene has drawn 10 frames.
    Returns (page, cdp, errors, load report); with profile_load, load['profile'] is the CPU
    profile of the whole load."""
    w, h = (int(v) for v in a.size.lower().split('x'))
    ctx = browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=a.dpr)
    ctx.add_init_script(script='window.__PERF_CFG = ' + json.dumps({'seed': 1, 'date': FIXED_DATE}) + ';')
    ctx.add_init_script(path=PROBE)
    ctx.route(CDN, cdn_handler(tag))
    ctx.route(re.compile(r'/__blank$'), lambda r: r.fulfill(body='<!doctype html><title>perf</title>', content_type='text/html'))
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.on('console', lambda m: errors.append(f'console.{m.type}: {m.text}') if m.type == 'error' else None)
    cdp = ctx.new_cdp_session(page)
    cdp.send('Performance.enable')
    page.goto(base + '/__blank')          # same origin first, so the profiler survives navigation
    if profile_load:
        cdp.send('Profiler.enable')
        cdp.send('Profiler.setSamplingInterval', {'interval': 200})
        cdp.send('Profiler.start')
    page.goto(base + '/index.html?city=' + a.city, wait_until='load', timeout=120000)   # ?city skips the start menu
    page.wait_for_function("""() => (window.__perf && __perf.frameCount >= 10)
        || getComputedStyle(document.getElementById('err')).display !== 'none'
        || /Couldn|needs a local/.test(document.getElementById('status').textContent)""", timeout=300000, polling=250)
    if page.evaluate("() => !(window.__perf && __perf.frameCount >= 10)"):
        raise RuntimeError('the scene did not start: ' + page.evaluate("document.getElementById('status').textContent") + '\n' + '\n'.join(errors))
    L = page.evaluate('__perf.loadReport()')
    if profile_load:
        L['profile'] = cdp.send('Profiler.stop')['profile']
    L['phaseList'] = load_phases(L)
    L['heapMB'] = round(metrics(cdp)['JSHeapUsedSize'] / MB, 1)
    L['inventory'] = page.evaluate('__perf.inventory()')
    L['tagged'] = tag
    return page, cdp, errors, L


def run_once(pw, a, base, scen, art):
    tag = a.census or a.ablate
    browser = launch(pw, a)
    try:
        page, cdp, errors, L = open_app(browser, a, base, tag, profile_load=bool(art and not a.no_profile))
        if 'profile' in L:
            p = L.pop('profile')
            with open(os.path.join(art, 'load.cpuprofile'), 'w') as f:
                json.dump(p, f)
            L['cpu'] = analyze_cpu(p, top=a.top, tree_pct=1.0)
        run = {'browser': browser.version, 'gl': page.evaluate('__perf.glInfo()'), 'load': L, 'scenarios': {}}
        for sc in scen:
            print(f'  {sc["name"]}…', flush=True)
            run['scenarios'][sc['name']] = run_scenario(page, cdp, sc, a, art)
        run['errors'] = errors
        return run
    finally:
        browser.close()


# ---------------------------------------------------------------- report

def scenario_metrics(name, s):
    g = lambda d, f='p50': (s[d][f] if s.get(d) else None)   # noqa: E731
    k = {f'{name}.fps': s['fps'], f'{name}.frameP50': g('dt'), f'{name}.frameP95': g('dt', 'p95'),
         f'{name}.jsP50': g('work'), f'{name}.renderCpuP50': g('render'), f'{name}.otherJsP50': g('other'),
         f'{name}.gpuP50': g('gpu'), f'{name}.mainMsPerFrame': s['main']['taskMsPerFrame'],
         f'{name}.styleLayoutMsPerS': round(s['main']['styleMsPerS'] + s['main']['layoutMsPerS'], 1),
         f'{name}.drawCalls': s['calls'], f'{name}.triangles': s['tris'], f'{name}.hitches': s['hitches'], f'{name}.heapMB': s['heapMB']}
    if s.get('heap'):
        k[f'{name}.allocMBps'] = s['heap']['MBps']
    return k


def load_metrics(L):
    k = {}
    ff = L.get('firstFrame') or {}
    k['load.readyMs'] = L['readyAt']
    k['load.firstFrameMs'] = ff.get('work')
    k['load.firstFrameGpuMs'] = ff.get('gpu')
    k['load.interactiveMs'] = (ff['at'] + ff['work']) if ff else None
    k['load.dataFetchedMs'] = max((f['end'] for f in L['files']), default=None)
    for lab, _, ms in L['phaseList']:
        k['load.phase: ' + lab] = ms
    k['load.heapMB'] = L['heapMB']
    k['load.geometryMB'] = L['inventory']['geometryMB']
    return k


def key_metrics(run):
    """The flat numbers `compare` lines up between reports."""
    k = load_metrics(run['load'])
    for name, s in run['scenarios'].items():
        k.update(scenario_metrics(name, s))
    return k


def aggregate(runs):
    allk = defaultdict(list)
    for r in runs:
        for key, v in key_metrics(r).items():
            if v is not None:
                allk[key].append(v)
    return {key: {'median': round(statistics.median(v), 2), 'min': round(min(v), 2), 'max': round(max(v), 2), 'n': len(v)} for key, v in allk.items()}


f1 = lambda x: '-' if x is None else (str(int(x)) if float(x).is_integer() else f'{x:.1f}')   # noqa: E731


def _where(r):
    return f"{r['fn']} `{r['file']}:{r['line']}`" if r['file'] else r['fn']


def summary_md(rep):
    m, out = rep['meta'], []
    g = m['gl']
    out.append(f"# Perf report {m['label'] or ''}".rstrip())
    out.append(f"\n{m['date']} · commit {m['commit']}{' + uncommitted changes' if m['dirty'] else ''} · {m['browser']} · "
               f"{'headed' if m['headed'] else 'headless'} · {m['size']} @ dpr {m['dpr']} · {m['repeat']} run(s)")
    out.append(f"\nGPU: {g['renderer']} (WebGL{'2' if g['webgl2'] else '1'}, GPU timer {'on' if g['gpuTimer'] else 'unavailable'})")
    if re.search(r'SwiftShader|llvmpipe|Basic Render', g['renderer'], re.I):
        out.append('\n> **Software rendering.** The GPU wasn\'t used, so GPU and frame numbers are meaningless. Check the --use-angle flag in gpu_args().')
    if m['tagged']:
        out.append('\n> Census/ablation run: three.js was patched to tag every add(), which slows the load. Use a plain run for load times.')
    M = rep['metrics']
    v = lambda key: M[key]['median'] if key in M else None   # noqa: E731
    rng = lambda key: (f" ({M[key]['min']:.0f}–{M[key]['max']:.0f})" if key in M and M[key]['n'] > 1 else '')   # noqa: E731

    L = rep['load']
    out.append('\n## Load\n')
    out.append(f"Scene ready at **{f1(v('load.readyMs'))} ms**{rng('load.readyMs')}, first frame drawn at **{f1(v('load.interactiveMs'))} ms**{rng('load.interactiveMs')}. "
               f"Data fetched by {f1(v('load.dataFetchedMs'))} ms. JS heap {L['heapMB']} MB; geometry {L['inventory']['geometryMB']} MB.\n")
    out.append('| step (from the #status line) | starts at ms | takes ms |\n|---|---:|---:|')
    for lab, t0, ms in L['phaseList']:
        out.append(f"| {lab} | {t0:.0f} | {f1(v('load.phase: ' + lab))}{rng('load.phase: ' + lab)} |")
    if L.get('firstFrame') and L['firstFrame'].get('gpu') is not None:
        out.append(f"\nFirst frame: {L['firstFrame']['work']:.0f} ms JS (render() {L['firstFrame']['cpu']:.0f} ms), {L['firstFrame']['gpu']:.1f} ms GPU.")
    lt = L['longTasks']
    if lt:
        out.append(f"Long tasks: {len(lt)}, {sum(t['d'] for t in lt):.0f} ms in total, longest {max(t['d'] for t in lt):.0f} ms.")
    inv = L['inventory']
    out.append(f"\nScene: {inv['objects']:,} objects, {inv['meshes']:,} meshes ({inv['instancedMeshes']:,} instanced, {inv['instances']:,} instances), "
               f"{inv['castShadow']:,} shadow casters, {inv['lines']:,} lines, {inv['points']:,} points, {inv['materials']} materials, "
               f"{inv['programs']} shader programs, {inv['textures']} textures.")
    if inv.get('byBuilder'):
        out.append('\n| builder | objects | meshes | instances | shadow casters | geometry MB |\n|---|---:|---:|---:|---:|---:|')
        for b, d in sorted(inv['byBuilder'].items(), key=lambda kv: -kv[1]['geometryMB']):
            out.append(f"| {b} | {d['objects']:,} | {d['meshes']:,} | {d['instances']:,} | {d['castShadow']:,} | {d['geometryMB']} |")
    if L.get('cpu'):
        c = L['cpu']
        out.append(f"\nLoad CPU profile ({c['wallMs']:.0f} ms wall, {c['busyMs']:.0f} ms busy, GC {c['gcMs']:.0f} ms): `load.cpuprofile`\n")
        if c.get('builders'):
            out.append('| builder (inclusive CPU time) | ms |\n|---|---:|')
            out += [f"| {_where(r)} | {r['ms']:.0f} |" for r in c['builders']]
        out.append('\nTop self time during load:\n')
        out += [f"- {r['ms']:.0f} ms ({r['pct']}%) {_where(r)}" for r in c['self'][:10]]

    out.append('\n## Scenarios\n')
    out.append('All times are ms per frame (median); `bound` is what limits the frame rate. JS = all rAF callbacks; '
               'render = CPU inside renderer.render(); other JS = JS minus render (updates, labels); main = all main-thread work per frame (includes style/layout).\n')
    out.append('| scenario | fps | frame p50 / p95 | JS | render CPU | other JS | GPU | main | bound | draws | tris | alloc MB/s | hitches |\n'
               '|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|')
    for name, s in rep['scenarios'].items():
        p = name + '.'
        out.append(f"| {name} | {f1(v(p + 'fps'))}{rng(p + 'fps')} | {f1(v(p + 'frameP50'))} / {f1(v(p + 'frameP95'))} | {f1(v(p + 'jsP50'))} | "
                   f"{f1(v(p + 'renderCpuP50'))} | {f1(v(p + 'otherJsP50'))} | {f1(v(p + 'gpuP50'))} | {f1(v(p + 'mainMsPerFrame'))} | {s['bound']} | "
                   f"{f1(v(p + 'drawCalls'))} | {(v(p + 'triangles') or 0) / 1e6:.2f}M | {f1(v(p + 'allocMBps'))} | {f1(v(p + 'hitches'))} |")
    for name, s in rep['scenarios'].items():
        out.append(f"\n### {name}\n\n{s['desc']}. Bound: **{s['bound']}**. Frame p50 {f1(s['dt']['p50'])} ms, p99 {f1(s['dt']['p99'])}, max {f1(s['dt']['max'])}; "
                   f"style {s['main']['styleMsPerS']} + layout {s['main']['layoutMsPerS']} ms/s ({s['main']['styleRecalcsPerFrame']} recalcs, "
                   f"{s['main']['layoutsPerFrame']} layouts per frame). Screenshot `{name}.png`.")
        c = s.get('cpu')
        if c:
            out.append(f"\nCPU profile `{name}.cpuprofile`: {c['busyMsPerFrame']} ms busy per frame over {c['frames']} frames; GC {c['gcMs']:.0f} of {c['busyMs']:.0f} ms busy. "
                       f"{c['nativeMsPerFrame']} ms/frame is native (WebGL calls, builtins): with a busy GPU, most of that is the main thread "
                       f"waiting for the GPU process, not JS work.\n")
            out.append('| self ms/frame | % | function |\n|---:|---:|---|')
            out += [f"| {r['msPerFrame']} | {r['pct']} | {_where(r)} |" for r in c['self'][:12]]
            out.append('\nBy file (self): ' + ', '.join(f"{f['file']} {f['pct']}%" for f in c['files'][:8]))
            out.append('\nHot path (top-down, inclusive):\n```')
            out += c['tree'][:40]
            out.append('```')
        hp = s.get('heap')
        if hp:
            out.append(f"\nAllocations `{name}.heapprofile`: {hp['MBps']} MB/s. Top allocating functions (self):\n")
            out += [f"- {r['MBps']} MB/s ({r['pct']}%) {_where(r)}" for r in hp['self'][:8]]
        cs = s.get('census')
        if cs:
            t = cs['totals']
            out.append(f"\nDraw census (one frame): {t.get('calls', 0)} main-pass draws ({t.get('tris', 0) / 1e6:.2f}M tris), "
                       f"{t.get('shadowCalls', 0)} shadow-pass draws ({t.get('shadowTris', 0) / 1e6:.2f}M tris). `{name}.census.json`\n")
            out.append('| builder | draws | shadow draws | tris | shadow tris | lines | points |\n|---|---:|---:|---:|---:|---:|---:|')
            out += [f"| {b['builder']} | {b['calls']} | {b['shadowCalls']} | {b['tris']:,} | {b['shadowTris']:,} | {b['lines']:,} | {b['points']:,} |" for b in cs['builders'][:14]]
            out.append('\n| add() site | draws | shadow draws | tris | instances | materials |\n|---|---:|---:|---:|---:|---|')
            out += [f"| `{d['site']}` ({d['builder']}) | {d['calls']} | {d['shadowCalls']} | {d['tris']:,} | {d['instances']:,} | "
                    + ', '.join(f'{k}×{n}' for k, n in d['materials'].items()) + ' |' for d in cs['sites'][:15]]
        ab = s.get('ablation')
        if ab:
            b = ab['baseline']
            out.append(f"\nAblation (switch one thing off, Δ ms per frame vs baseline frame {f1(b['dt'])} / JS {f1(b['work'])} / render {f1(b['render'])} / GPU {f1(b['gpu'])}; "
                       f"baseline drifted {f1(ab['baselineDrift']['dt'])} ms between the start and end, so treat smaller Δs as noise):\n")
            out.append('| switched off | Δ frame | Δ JS | Δ render CPU | Δ GPU | Δ draws | Δ tris |\n|---|---:|---:|---:|---:|---:|---:|')
            for r in sorted(ab['rows'], key=lambda r: (r['d_dt'] if r['d_dt'] is not None else 0)):
                out.append(f"| {r['what']} | {f1(r['d_dt'])} | {f1(r['d_work'])} | {f1(r['d_render'])} | {f1(r['d_gpu'])} | {f1(r['d_calls'])} | {(r['d_tris'] or 0) / 1e6:+.2f}M |")
    if rep.get('errors'):
        out.append('\n## Page errors\n')
        out += [f'- {e}' for e in rep['errors'][:20]]
    return '\n'.join(out) + '\n'


# ---------------------------------------------------------------- commands

def pick_scenarios(a):
    if a.scenarios:
        want = [s.strip() for s in a.scenarios.split(',') if s.strip()]
    elif a.quick:
        want = QUICK
    else:
        want = [s['name'] for s in SCENARIOS]
    by = {s['name']: s for s in SCENARIOS}
    bad = [w for w in want if w not in by]
    if bad:
        sys.exit(f'unknown scenario(s): {", ".join(bad)}. Try: perf.py list')
    return [by[w] for w in want]


def out_dir(a, kind=''):
    stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    out = a.out or os.path.join(OUT, stamp + kind + (f'-{a.label}' if a.label else ''))
    os.makedirs(out, exist_ok=True)
    return out


def write_report(a, runs, scen, out, commit, dirty, label):
    r0 = runs[0]
    rep = {
        'meta': {'label': label, 'date': datetime.datetime.now().isoformat(timespec='seconds'), 'commit': commit, 'dirty': dirty,
                 'browser': r0['browser'], 'gl': r0['gl'], 'headed': a.headed, 'size': a.size, 'dpr': a.dpr, 'repeat': len(runs),
                 'seconds': a.seconds, 'settle': a.settle, 'scenarios': [s['name'] for s in scen], 'tagged': bool(a.census or a.ablate)},
        'metrics': aggregate(runs), 'load': r0['load'], 'scenarios': r0['scenarios'],
        'runs': [key_metrics(r) for r in runs], 'errors': sorted({e for r in runs for e in r['errors']}),
    }
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, 'report.json'), 'w', encoding='utf-8') as f:
        json.dump(rep, f, indent=1)
    md = summary_md(rep)
    with open(os.path.join(out, 'summary.md'), 'w', encoding='utf-8') as f:
        f.write(md)
    return rep, md


def cmd_run(a):
    scen = pick_scenarios(a)
    out = out_dir(a)
    from playwright.sync_api import sync_playwright
    srv, base = serve()
    runs = []
    try:
        with sync_playwright() as pw:
            for i in range(a.repeat):
                print(f'run {i + 1}/{a.repeat}: loading the scene…', flush=True)
                runs.append(run_once(pw, a, base, scen, out if i == 0 else None))
    finally:
        srv.shutdown()
    dirty = bool(git('status', '--porcelain', '--', 'js', 'css', 'index.html', 'data'))
    _, md = write_report(a, runs, scen, out, git('rev-parse', '--short', 'HEAD'), dirty, a.label)
    print(md)
    print(f'Wrote {os.path.relpath(out, ROOT)} (summary.md, report.json, profiles, screenshots)')


def cmd_ab(a):
    """The --base commit (A) against the working tree (B): one fresh browser per measurement,
    alternating A B, B A, ... so drift in GPU clocks, heat or background load hits both, then a
    paired t-test per metric. Never two copies at once: on a laptop GPU the second copy of the
    scene runs 12-50% slower than the first (tested), which would bias whichever loads second."""
    scen = pick_scenarios(a)
    out = out_dir(a, '-ab')
    tmp = os.path.join(OUT, '.ab-base')
    if a.a_snap:   # side A is a snapshot folder (perf.py snap), not a commit
        commit, root_a = 'snapshot ' + a.a_snap, snap_dir(a.a_snap)
    else:
        commit = git('rev-parse', '--short', a.base)
        if not commit:
            sys.exit(f'unknown git ref: {a.base}')
        if os.path.exists(tmp):
            subprocess.run(['git', 'worktree', 'remove', '--force', tmp], cwd=ROOT, capture_output=True)
        r = subprocess.run(['git', 'worktree', 'add', '--detach', tmp, a.base], cwd=ROOT, capture_output=True, text=True)
        if r.returncode:
            sys.exit('git worktree add failed: ' + r.stderr)
        root_a = tmp
    root_b = snap_dir(a.b_snap) if a.b_snap else ROOT
    b_name = 'snapshot ' + a.b_snap if a.b_snap else 'working tree'
    from playwright.sync_api import sync_playwright
    (sa, base_a), (sb, base_b) = serve(root_a), serve(root_b)
    rounds = {'frames': defaultdict(lambda: ([], [])), 'load': defaultdict(lambda: ([], []))}   # metric -> (A values, B values), paired by index
    env, errors = {}, []

    def block(pw, k, keep=True, shots=False):
        browser = launch(pw, a)
        try:
            page, cdp, errs, L = open_app(browser, a, base_a if k == 'A' else base_b)
            env.setdefault('gl', page.evaluate('__perf.glInfo()'))
            errors.extend(errs)
            got = load_metrics(L) if a.load else {}
            for sc in scen:
                page.evaluate(js_setup(sc))
                page.wait_for_timeout(sc.get('settle', a.settle))
                m0 = metrics(cdp)
                fr = page.evaluate('ms => __perf.record(ms)', int(a.seconds * 1000))
                m1 = metrics(cdp)
                got.update(scenario_metrics(sc['name'], frame_summary(fr, m0, m1)))
                if shots:
                    page.evaluate(SHOT_ALIGN)
                    page.wait_for_timeout(400)
                    page.screenshot(path=os.path.join(out, f'{k}-{sc["name"]}.png'))
        finally:
            browser.close()
        if keep:
            for key, v in got.items():
                if v is not None:
                    rounds['load' if key.startswith('load.') else 'frames'][key]['AB'.index(k)].append(v)
    try:
        with sync_playwright() as pw:
            print('warm-up (discarded)…', flush=True)   # the first browser of a session runs differently
            block(pw, 'B', keep=False)
            for i in range(a.rounds):
                for k in ('AB' if i % 2 == 0 else 'BA'):
                    print(f'round {i + 1}/{a.rounds}: {k} ({"base " + commit if k == "A" else b_name})…', flush=True)
                    block(pw, k, shots=a.shots and i == a.rounds - 1)
    finally:
        sa.shutdown()
        sb.shutdown()
        if not a.a_snap:
            subprocess.run(['git', 'worktree', 'remove', '--force', tmp], cwd=ROOT, capture_output=True)
    dirty = bool(git('status', '--porcelain', '--', 'js', 'css', 'index.html', 'data'))
    gl = (env.get('gl') or {}).get('renderer', '?')
    side_a = commit if a.a_snap else f'base {a.base} ({commit})'
    side_b = b_name if a.b_snap else f'the working tree ({git("rev-parse", "--short", "HEAD")}{" + uncommitted changes" if dirty else ""})'
    lines = [f'# A/B: {side_a} vs {side_b}\n',
             f'GPU: {gl}. {a.rounds} paired rounds (A B, B A, …), each side a fresh browser that loads the app'
             f'{" (load metrics recorded)" if a.load else ""} and measures each scenario for {a.seconds} s.\n',
             f'Δ = B − A (mean over paired rounds). A verdict needs |Δ| ≥ {a.threshold}% and a paired t-test: '
             f'"better"/"worse" at 99%, "likely" at 95%. Higher is better only for fps. {"Every metric shown." if a.all else "Only metrics past the threshold are shown (--all for every row)."}\n']
    verdicts = []
    raw = {}
    for part, title in (('frames', 'Frames'), ('load', 'Load')):
        if not rounds[part]:
            continue
        lines += [f'\n## {title}\n', '| metric | A | B | Δ | Δ% | t | B better in | verdict |', '|---|---:|---:|---:|---:|---:|---:|---|']
        shown = 0
        for key, (xa, xb) in rounds[part].items():
            n = min(len(xa), len(xb))
            if not n:
                continue
            raw[key] = {'A': xa, 'B': xb}
            d = [xb[i] - xa[i] for i in range(n)]
            ma, mb, md = statistics.fmean(xa[:n]), statistics.fmean(xb[:n]), statistics.fmean(d)
            pct = 100 * md / ma if ma else 0
            sd = statistics.stdev(d) if n > 1 else 0
            t = md / (sd / n ** .5) if n > 1 and sd > 0 else (float('inf') if md and n > 1 else 0)
            hib = key.endswith('.fps')
            wins = sum(1 for x in d if (x > 0 if hib else x < 0))
            big = abs(pct) >= a.threshold and abs(md) >= .05
            good = (md > 0) == hib
            if big and n > 1 and abs(t) >= t_crit(n - 1):
                verdict = 'better' if good else '**worse**'
            elif big and n > 1 and abs(t) >= t_crit(n - 1, _T95):
                verdict = 'likely better' if good else '**likely worse**'
            else:
                verdict = 'not significant' if big else ''
            if verdict and verdict != 'not significant':
                verdicts.append((key, verdict, pct))
            if not big and not a.all:
                continue
            lines.append(f'| {key} | {ma:.2f} | {mb:.2f} | {md:+.2f} | {pct:+.1f}% | {t:+.1f} | {wins}/{n} | {verdict} |')
            shown += 1
        if not shown:
            lines.append('| (nothing changed by the threshold or more) | | | | | | | |')
    lines.append('\n**Result:** ' + ('; '.join(f'{k} {v.strip("*")} ({p:+.1f}%)' for k, v, p in verdicts) if verdicts
                                       else 'no significant difference.'))
    if a.rounds < 4:
        lines.append('\nFewer than 4 rounds: the t-test can only catch large effects. Use --rounds 6 for small ones.')
    md = '\n'.join(lines) + '\n'
    with open(os.path.join(out, 'ab.md'), 'w', encoding='utf-8') as f:
        f.write(md)
    with open(os.path.join(out, 'ab.json'), 'w', encoding='utf-8') as f:
        json.dump({'base': a.base, 'commit': commit, 'dirty': dirty, 'env': env, 'errors': sorted(set(errors)), 'rounds': a.rounds,
                   'seconds': a.seconds, 'scenarios': [s['name'] for s in scen], 'values': raw,
                   'verdicts': [{'metric': k, 'verdict': v.strip('*'), 'pct': round(p, 2)} for k, v, p in verdicts]}, f, indent=1)
    print(md)
    print(f'Wrote {os.path.relpath(out, ROOT)} (ab.md, ab.json)')


def snap_dir(name):
    d = os.path.join(OUT, '.snap', name)
    if not os.path.isdir(d):
        sys.exit(f'no snapshot named {name}: make one with perf.py snap {name}')
    return d


def cmd_snap(a):
    """Copy the app sources (index.html, css/, js/) to out/.snap/<name>, to use as a side of `ab`
    later: stacked changes can then be measured one at a time without committing. --ref copies
    them from a commit instead of the working tree."""
    d = os.path.join(OUT, '.snap', a.name)
    if os.path.exists(d):
        shutil.rmtree(d)
    os.makedirs(d)
    src = ROOT
    if a.ref:
        src = os.path.join(OUT, '.snap-src')
        subprocess.run(['git', 'worktree', 'remove', '--force', src], cwd=ROOT, capture_output=True)
        r = subprocess.run(['git', 'worktree', 'add', '--detach', src, a.ref], cwd=ROOT, capture_output=True, text=True)
        if r.returncode:
            sys.exit('git worktree add failed: ' + r.stderr)
    try:
        shutil.copy2(os.path.join(src, 'index.html'), d)
        for sub in ('css', 'js'):
            shutil.copytree(os.path.join(src, sub), os.path.join(d, sub))
    finally:
        if a.ref:
            subprocess.run(['git', 'worktree', 'remove', '--force', src], cwd=ROOT, capture_output=True)
    print(f'Wrote {os.path.relpath(d, ROOT)}')


# two-sided 99% and 95% critical values of Student's t, by degrees of freedom
_T99 = {1: 63.66, 2: 9.92, 3: 5.84, 4: 4.60, 5: 4.03, 6: 3.71, 7: 3.50, 8: 3.36, 9: 3.25, 10: 3.17, 12: 3.05, 15: 2.95, 20: 2.85, 30: 2.75, 10 ** 9: 2.58}
_T95 = {1: 12.71, 2: 4.30, 3: 3.18, 4: 2.78, 5: 2.57, 6: 2.45, 7: 2.36, 8: 2.31, 9: 2.26, 10: 2.23, 12: 2.18, 15: 2.13, 20: 2.09, 30: 2.04, 10 ** 9: 1.96}


def t_crit(df, table=_T99):
    return next(table[k] for k in sorted(table) if df <= k)


def _report(path):
    p = os.path.join(path, 'report.json') if os.path.isdir(path) else path
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def cmd_compare(a):
    A, B = _report(a.a), _report(a.b)
    ma, mb = A['metrics'], B['metrics']
    keys = [k for k in ma if k in mb]
    print(f"A: {a.a} ({A['meta']['commit']}{'+' if A['meta']['dirty'] else ''}, {A['meta']['repeat']} run(s))")
    print(f"B: {a.b} ({B['meta']['commit']}{'+' if B['meta']['dirty'] else ''}, {B['meta']['repeat']} run(s))")
    if A['meta']['gl']['renderer'] != B['meta']['gl']['renderer'] or A['meta']['size'] != B['meta']['size']:
        print('WARNING: different GPU or viewport; the numbers are not comparable.')
    print(f"\nChanged by at least {a.threshold}% and more than the run-to-run spread "
          f"({'all rows' if a.all else 'pass --all for every row'}). Higher is better only for fps.\n")
    print('| metric | A | B | Δ | Δ% | |\n|---|---:|---:|---:|---:|---|')
    shown = 0
    for k in keys:
        x, y = ma[k], mb[k]
        va, vb = x['median'], y['median']
        d = vb - va
        pct = 100 * d / va if va else (0 if not d else float('inf'))
        noise = max(x['max'] - x['min'], y['max'] - y['min'])
        small = abs(d) < 0.05 or abs(pct) < a.threshold or abs(d) <= noise
        if small and not a.all:
            continue
        better = (d > 0) if k.endswith('.fps') else (d < 0)
        single = A['meta']['repeat'] < 2 or B['meta']['repeat'] < 2
        mark = '' if small else ('better' if better else '**worse**') + (' (unverified)' if single else '')
        print(f'| {k} | {va:g} | {vb:g} | {d:+.2f} | {pct:+.1f}% | {mark} |')
        shown += 1
    if not shown:
        print('| (no metric changed beyond the threshold) | | | | | |')
    if A['meta']['repeat'] < 2 or B['meta']['repeat'] < 2:
        print('\nOne run per side: no spread to judge noise by, and two identical runs can differ by 10-20%. '
              'Use `perf.py ab` (or --repeat 3 on both) before believing any row.')


def cmd_hot(a):
    with open(a.file, encoding='utf-8') as f:
        p = json.load(f)
    if 'head' in p:
        r = analyze_heap(p, a.seconds or 1, top=a.top, focus=a.focus)
        print(f"{r['allocMB']} MB sampled{' under ' + a.focus if a.focus else ''}" + (f", {r['MBps']} MB/s" if a.seconds else ''))
        rows = r['self'] if not a.total else r['total']
        for x in rows:
            print(f"{x['MB']:9.2f} MB {x['pct']:5.1f}%  {x['fn']} {x['file']}:{x['line']}")
    else:
        r = analyze_cpu(p, top=a.top, focus=a.focus, tree_pct=a.tree_pct)
        print(f"wall {r['wallMs']} ms, busy {r['busyMs']} ms{' in ' + a.focus if a.focus else ''}, idle {r['idleMs']}, GC {r['gcMs']}, program {r['programMs']}")
        print('\n' + ('total' if a.total else 'self') + ' time:')
        for x in (r['total'] if a.total else r['self']):
            print(f"{x['ms']:9.1f} ms {x['pct']:5.1f}%  {x['fn']} {x['file']}:{x['line']}")
        print('\nby file: ' + ', '.join(f"{f['file']} {f['pct']}%" for f in r['files']))
    print('\ntop-down:')
    print('\n'.join(r['tree']))


def cmd_list(a):
    for s in SCENARIOS:
        print(f"{s['name']:16} {s['desc']}{'  [quick]' if s['name'] in QUICK else ''}")


def main():
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    r = sub.add_parser('run', help='measure the app')
    ab = sub.add_parser('ab', help='interleaved A/B: a git ref against the working tree (timings only)')

    def common(p):
        p.add_argument('-s', '--scenarios', help='comma-separated names (perf.py list); default: all')
        p.add_argument('--quick', action='store_true', help='only ' + ', '.join(QUICK))
        p.add_argument('--label', default='', help='appended to the output folder name')
        p.add_argument('--out', help='output folder (default tools/perf/out/<time>[-label])')
        p.add_argument('--seconds', type=float, default=5, help='timing window per scenario')
        p.add_argument('--settle', type=int, default=3000, help='ms to wait after a scenario starts')
        p.add_argument('--city', default='phl', help='city id from js/cities.js (the scenarios are written for phl)')
        p.add_argument('--size', default='1600x900', help='viewport WxH')
        p.add_argument('--dpr', type=float, default=1, help='device pixel ratio (the app caps at 2)')
        p.add_argument('--headed', action='store_true', help='show the browser window')
        p.add_argument('--channel', default=None, help='e.g. chrome or msedge to use an installed browser instead of Playwright\'s Chromium')
        p.add_argument('--top', type=int, default=15)
    common(r)
    r.add_argument('--repeat', type=int, default=1, help='fresh browser runs; the report holds medians and ranges (profiles come from run 1)')
    r.add_argument('--profile-seconds', type=float, default=4, help='CPU + allocation profile window per scenario')
    r.add_argument('--no-profile', action='store_true', help='timings only (faster)')
    r.add_argument('--census', action='store_true', help='count every draw call of one frame by the code that added the object')
    r.add_argument('--ablate', action='store_true', help='switch parts off one at a time and measure the difference (implies --census; slow)')
    r.add_argument('--ablate-seconds', type=float, default=2.5)
    r.add_argument('--ablate-max', type=int, default=10, help='at most this many builders to hide')
    r.set_defaults(fn=cmd_run)
    common(ab)
    ab.add_argument('--base', default='HEAD', help='git ref for side A (default HEAD: your uncommitted changes are B)')
    ab.add_argument('--rounds', type=int, default=5, help='paired rounds (A B, B A, ...), each a fresh browser per side')
    ab.add_argument('--no-load', dest='load', action='store_false', help='skip the load metrics (frame metrics only)')
    ab.add_argument('--threshold', type=float, default=3, help='minimum %% change for a verdict')
    ab.add_argument('--all', action='store_true', help='show every metric')
    ab.add_argument('--a-snap', help='side A from a snapshot (perf.py snap NAME) instead of --base')
    ab.add_argument('--b-snap', help='side B from a snapshot instead of the working tree')
    ab.add_argument('--shots', action='store_true', help='save a screenshot of every scenario for both sides (A-<name>.png, B-<name>.png) in the last round')
    ab.set_defaults(fn=cmd_ab, census=False, ablate=False, no_profile=True)
    c = sub.add_parser('compare', help='diff two reports')
    c.add_argument('a')
    c.add_argument('b')
    c.add_argument('--threshold', type=float, default=5, help='minimum %% change to show')
    c.add_argument('--all', action='store_true')
    c.set_defaults(fn=cmd_compare)
    h = sub.add_parser('hot', help='analyse a saved .cpuprofile or .heapprofile')
    h.add_argument('file')
    h.add_argument('--focus', help='only inside this function (e.g. frame, render, update, placeTags)')
    h.add_argument('--total', action='store_true', help='rank by inclusive time instead of self time')
    h.add_argument('--top', type=int, default=30)
    h.add_argument('--tree-pct', type=float, default=1.0, help='hide tree branches under this %% of the time')
    h.add_argument('--seconds', type=float, help='heap profiles: the window length, to report MB/s')
    h.set_defaults(fn=cmd_hot)
    sn = sub.add_parser('snap', help='snapshot the sources for a later ab --a-snap / --b-snap')
    sn.add_argument('name')
    sn.add_argument('--ref', help='snapshot this commit instead of the working tree')
    sn.set_defaults(fn=cmd_snap)
    sub.add_parser('list', help='list scenarios').set_defaults(fn=cmd_list)
    a = ap.parse_args()
    if getattr(a, 'ablate', False):
        a.census = True
    a.fn(a)


if __name__ == '__main__':
    main()
