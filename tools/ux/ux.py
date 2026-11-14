"""UI/UX harness: drives the real app in Chromium as phones, tablets and a desktop, puts it in
every UI state (menu, loading, HUD open and folded, ride picker, riding, transit legend,
cut-away, the people you can see through, the dialogs and games, ...), and for each one
measures the interface and saves a clean and an annotated screenshot. See tools/ux/README.md.

  python -I tools/ux/ux.py list
  python -I tools/ux/ux.py run [-c phl,nyc,jsh] [-d phone,phone-land] [-s overview,hud-open] [--label before]
  python -I tools/ux/ux.py compare tools/ux/out/<before> tools/ux/out/<after>

Needs Python Playwright and its Chromium (see tools/perf/README.md: Setup).
"""
import argparse
import datetime
import html
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import time
import traceback
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'perf'))
from perf import CDN, FIXED_DATE, PROBE, cdn_handler, diff_note, diff_table, gpu_args, git, prepare_side, serve, side_has  # noqa: E402

AUDIT = os.path.join(HERE, 'audit.js')
OUT = os.path.join(HERE, 'out')
CITIES = ['phl', 'nyc', 'jsh']

# Viewports are the *visible* area in the browser (what innerWidth/innerHeight report with the
# browser's own toolbars showing), from Playwright's device list where it has the device.
DEVICES = {
    'phone-sm':   {'desc': 'iPhone SE (3rd gen), Safari, portrait', 'viewport': (375, 548), 'dpr': 2, 'touch': True},
    'phone':      {'desc': 'iPhone 15, Safari, portrait', 'viewport': (393, 659), 'dpr': 3, 'touch': True},
    'phone-land': {'desc': 'iPhone 15, Safari, landscape', 'viewport': (734, 343), 'dpr': 3, 'touch': True},
    'android':    {'desc': 'Pixel 7, Chrome, portrait', 'viewport': (412, 839), 'dpr': 2.625, 'touch': True},
    'tablet':     {'desc': 'iPad Mini, portrait', 'viewport': (768, 1024), 'dpr': 2, 'touch': True},
    'desktop':    {'desc': 'laptop, mouse', 'viewport': (1440, 900), 'dpr': 1, 'touch': False},
}
DEFAULT_DEVICES = ['phone-sm', 'phone', 'phone-land', 'tablet', 'desktop']


# ---------------------------------------------------------------- states

def load_states():
    """Every states/<name>.py defines STATES (a list of dicts); common.py first."""
    d = os.path.join(HERE, 'states')
    files = sorted(f for f in os.listdir(d) if f.endswith('.py') and not f.startswith('_'))
    files.sort(key=lambda f: (f != 'common.py', f))
    out = []
    for f in files:
        spec = importlib.util.spec_from_file_location('ux_states_' + f[:-3], os.path.join(d, f))
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        for s in m.STATES:
            s.setdefault('cities', None if f == 'common.py' else [f[:-3]])
            s['file'] = f
            out.append(s)
    names = Counter(s['name'] for s in out)
    dup = [n for n, k in names.items() if k > 1]
    if dup:
        raise SystemExit(f'duplicate state names: {dup}')
    return out


class Ctx:
    """What a Python setup/check gets: the page, the device, and helpers that act like a user
    (real taps on touch devices, real clicks on the desktop) and record findings."""

    def __init__(self, page, device, dname, city):
        self.page, self.device, self.dname, self.city = page, device, dname, city
        self.touch = device['touch']
        self.findings = []
        self._cdp = None

    def finding(self, sev, kind, msg, el='', box=None):
        self.findings.append({'sev': sev, 'kind': kind, 'el': el, 'msg': msg, 'box': box})

    def js(self, body, arg=None):
        """Run `body` as an async function with api (window.__city), U (window.__ux), sleep and arg in scope."""
        return self.page.evaluate('async ([body, arg]) => { const api = window.__city, U = window.__ux, sleep = ms => new Promise(r => setTimeout(r, ms));'
                                  ' return await (new Function("api", "U", "sleep", "arg", "return (async () => {" + body + "\\n})()"))(api, U, sleep, arg); }', [body, arg])

    def wait(self, ms):
        self.page.wait_for_timeout(ms)

    def point(self, sel):
        return self.page.evaluate('s => __ux.tapPoint(s)', sel)

    def tap(self, sel_or_xy, must=True):
        """Tap (touch) or click (mouse) an element by selector, or a point (x, y). If the element
        is missing, hidden or off the screen, records a finding and clicks it from script instead
        (so the states after it can still be reached). Returns True if a real tap happened."""
        if isinstance(sel_or_xy, (tuple, list)):
            x, y = sel_or_xy
        else:
            p = self.point(sel_or_xy)
            if not p:
                if must:
                    self.finding('error', 'missing', f'{sel_or_xy} is not visible, so it cannot be tapped', sel_or_xy)
                return False
            x, y = p['x'], p['y']
            w, h = self.device['viewport']
            if not (0 <= x < w and 0 <= y < h):
                self.finding('error', 'unreachable', f'{sel_or_xy} is off the screen at ({round(x)}, {round(y)})', sel_or_xy)
                self.page.evaluate('s => document.querySelector(s).click()', sel_or_xy)
                return False
            # would the tap land on it? (something on top of it would take the tap)
            hit = self.page.evaluate('([s, x, y]) => { const el = document.querySelector(s), t = document.elementFromPoint(x, y); return !t || el === t || el.contains(t) || t.contains(el) ? null : __ux.name(t); }', [sel_or_xy, x, y])
            if hit:
                self.finding('error', 'occluded', f'tapping {sel_or_xy} hits {hit} instead', sel_or_xy)
        if self.touch:
            self.page.touchscreen.tap(x, y)
        else:
            self.page.mouse.click(x, y)
        return True

    def cdp(self):
        if not self._cdp:
            self._cdp = self.page.context.new_cdp_session(self.page)
        return self._cdp

    def drag(self, x0, y0, x1, y1, steps=12, ms=300, fingers=1, spread=60):
        """A one- or two-finger drag (touch) or a left-button drag (mouse)."""
        if not self.touch:
            self.page.mouse.move(x0, y0)
            self.page.mouse.down()
            for i in range(1, steps + 1):
                self.page.mouse.move(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps)
                self.page.wait_for_timeout(ms / steps)
            self.page.mouse.up()
            return
        pts = lambda x, y: [{'x': x + k * spread, 'y': y, 'id': k} for k in range(fingers)]  # noqa: E731
        c = self.cdp()
        c.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': pts(x0, y0)})
        for i in range(1, steps + 1):
            self.page.wait_for_timeout(ms / steps)
            c.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': pts(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps)})
        c.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})

    def pinch(self, cx, cy, d0, d1, steps=12, ms=300):
        """Two fingers d0 px apart moving to d1 px apart around (cx, cy) (d1 > d0: spread = zoom in).
        On a mouse device, wheel instead."""
        if not self.touch:
            self.page.mouse.move(cx, cy)
            self.page.mouse.wheel(0, 400 if d1 < d0 else -400)
            return
        c = self.cdp()
        pts = lambda d: [{'x': cx - d / 2, 'y': cy, 'id': 0}, {'x': cx + d / 2, 'y': cy, 'id': 1}]  # noqa: E731
        c.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': pts(d0)})
        for i in range(1, steps + 1):
            self.page.wait_for_timeout(ms / steps)
            c.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': pts(d0 + (d1 - d0) * i / steps)})
        c.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})

    def cam(self):
        return self.page.evaluate('__ux.cam()')


def applies(st, city, dname, device):
    if st.get('cities') is not None and city not in st['cities']:
        return False
    ds = st.get('devices')
    if ds == 'touch' and not device['touch']:
        return False
    if ds == 'mouse' and device['touch']:
        return False
    if isinstance(ds, (list, tuple)) and dname not in ds:
        return False
    return True


# ---------------------------------------------------------------- one device

def new_context(browser, device, base, block=None):
    w, h = device['viewport']
    ctx = browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=device['dpr'],
                              is_mobile=device['touch'], has_touch=device['touch'])
    ctx.add_init_script(script='window.__PERF_CFG = ' + json.dumps({'seed': 1, 'date': FIXED_DATE}) + ';')
    ctx.add_init_script(path=PROBE)
    ctx.add_init_script(path=AUDIT)
    ctx.route(CDN, cdn_handler(False))
    if block:
        ctx.route(block, lambda r: r.abort())
    return ctx


def capture(page, art, rel, device, ctx_findings=(), annotate=True):
    """Audit the page as it is now, save <rel>.png and <rel>.ann.png. Returns the audit."""
    a = page.evaluate('o => __ux.audit(o)', {'touch': device['touch']})
    for f in ctx_findings:
        a['findings'].insert(0, f)
    os.makedirs(os.path.dirname(os.path.join(art, rel)), exist_ok=True)
    page.screenshot(path=os.path.join(art, rel + '.png'), scale='css')
    if annotate and a['findings']:
        a['findings'] = page.evaluate('f => __ux.annotate(f)', a['findings'])
        page.screenshot(path=os.path.join(art, rel + '.ann.png'), scale='css')
        page.evaluate('__ux.clear()')
        a['ann'] = rel + '.ann.png'
    a['png'] = rel + '.png'
    return a


def wait_scene(page, timeout=300000):
    page.wait_for_function("""() => (window.__perf && __perf.frameCount >= 10 && !document.getElementById('time').disabled)
        || getComputedStyle(document.getElementById('err')).display !== 'none'
        || /Couldn|needs a local/.test(document.getElementById('status').textContent)""", timeout=timeout, polling=250)
    if page.evaluate("() => !(window.__perf && __perf.frameCount >= 10)"):
        raise RuntimeError('the scene did not start: ' + page.evaluate("document.getElementById('status').textContent"))
    # the loading screen has gone and the view is live
    page.wait_for_function("() => document.getElementById('city-loading').hidden", timeout=30000)


def run_device(browser, base, city, dname, device, states, a, art, first_city):
    res = {}
    errors = []
    ctx = new_context(browser, device, base)
    try:
        pre = [s for s in states if s.get('pre')]
        # states before any city is loaded (menu, load error): once per device, not per city
        for st in pre:
            if st['pre'] == 'loading' or not first_city:
                continue
            page = ctx.new_page()
            try:
                if st['pre'] == 'menu':
                    page.goto(base + '/index.html', wait_until='load')
                    page.wait_for_selector('#menu:not([hidden])', timeout=20000)
                    page.wait_for_timeout(400)
                elif st['pre'] == 'error':
                    page.route(re.compile(r'/data/[a-z]+/river\.json$'), lambda r: r.abort())
                    page.goto(base + '/index.html?city=' + city, wait_until='load')
                    page.wait_for_selector('#loading-back:not([hidden])', timeout=60000)
                    page.wait_for_timeout(300)
                res[st['name']] = capture(page, art, f'all/{dname}/{st["name"]}', device, annotate=not a.no_annotate)
                res[st['name']]['city'] = 'all'
            except Exception as e:   # noqa: BLE001
                res[st['name']] = {'error': f'{type(e).__name__}: {e}'}
            finally:
                page.close()

        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
        page.on('console', lambda m: errors.append(f'console.{m.type}: {m.text}') if m.type == 'error' else None)
        t0 = time.time()
        page.goto(base + '/index.html?city=' + city, wait_until='domcontentloaded', timeout=120000)
        load_st = next((s for s in states if s.get('pre') == 'loading'), None)
        if load_st:
            try:   # the loading screen, once its picture is in
                page.wait_for_function("() => !document.getElementById('city-loading').hidden && (document.getElementById('loading-art').complete || !document.getElementById('loading-art').src)", timeout=15000, polling=100)
                page.wait_for_timeout(250)
                res[load_st['name']] = capture(page, art, f'{city}/{dname}/{load_st["name"]}', device, annotate=not a.no_annotate)
            except Exception as e:   # noqa: BLE001
                res[load_st['name']] = {'error': f'{type(e).__name__}: {e}'}
        wait_scene(page)
        print(f'    loaded in {time.time() - t0:.0f} s', flush=True)

        for st in states:
            if st.get('pre'):
                continue
            name = st['name']
            if not applies(st, city, dname, device):
                continue
            if st.get('when') and not page.evaluate('() => { const api = window.__city; return !!(' + st['when'] + '); }'):
                res[name] = {'skipped': 'not in this city (' + st['when'] + ')'}
                continue
            c = Ctx(page, device, dname, city)
            try:
                page.evaluate('__ux.reset()')
                fold = st.get('fold')
                if fold is None:   # the app's first-visit default: folded on small screens (js/ui.js COMPACT)
                    w, h = device['viewport']
                    fold = 'folded' if w <= 640 or h <= 500 else 'open'
                if fold in ('open', 'folded'):
                    page.evaluate('o => __ux.fold(o)', fold == 'open')
                setup = st.get('setup')
                if callable(setup):
                    setup(c)
                elif setup:
                    c.js(setup)
                page.wait_for_timeout(st.get('settle', a.settle))
                if st.get('check'):
                    st['check'](c)
                r = capture(page, art, f'{city}/{dname}/{name}', device, c.findings, annotate=not a.no_annotate)
                res[name] = r
                ne = sum(f['sev'] == 'error' for f in r['findings'])
                nw = sum(f['sev'] == 'warn' for f in r['findings'])
                print(f'    {name:<22} {ne:>2} errors {nw:>3} warnings  chrome {r["metrics"]["chromePct"]}%', flush=True)
            except Exception as e:   # noqa: BLE001
                res[name] = {'error': f'{type(e).__name__}: {e}', 'trace': traceback.format_exc(limit=3)}
                print(f'    {name:<22} FAILED: {e}', flush=True)
                try:
                    os.makedirs(os.path.join(art, city, dname), exist_ok=True)
                    page.screenshot(path=os.path.join(art, city, dname, name + '.fail.png'), scale='css')
                except Exception:   # noqa: BLE001
                    pass
        if a.keep_open:
            input('    (browser left open: press Enter to go on) ')
    finally:
        ctx.close()
    return res, errors


# ---------------------------------------------------------------- report

def summarize(report):
    L = []
    hdr = report['header']
    L.append(f"# UI/UX audit {hdr['time']}{' — ' + hdr['label'] if hdr.get('label') else ''}\n")
    L.append(f"git {hdr['git']}{' (with uncommitted changes)' if hdr['dirty'] else ''} · {hdr['browser']}\n")
    L.append('Devices: ' + ', '.join(f"`{d}` {DEVICES[d]['viewport'][0]}×{DEVICES[d]['viewport'][1]}" for d in hdr['devices']) + '\n')
    rows, kinds = [], Counter()
    tot = Counter()
    for city, devs in report['results'].items():
        for dname, sts in devs.items():
            for sname, r in sts.items():
                if 'findings' not in r:
                    rows.append((city, dname, sname, None, None, None, r.get('error') or r.get('skipped', '')))
                    continue
                e = sum(f['sev'] == 'error' for f in r['findings'])
                w = sum(f['sev'] == 'warn' for f in r['findings'])
                tot['error'] += e
                tot['warn'] += w
                for f in r['findings']:
                    if f['sev'] != 'info':
                        kinds[(f['sev'], f['kind'])] += 1
                top = next((f for f in r['findings'] if f['sev'] != 'info'), None)
                rows.append((city, dname, sname, e, w, r['metrics']['chromePct'], (f"{top['kind']}: {top['msg']}" if top else '')))
    L.append(f"**{tot['error']} errors, {tot['warn']} warnings** across {len(rows)} screens.\n")
    L.append('## By kind\n\n| severity | kind | count |\n|---|---|---|')
    for (sev, k), n in sorted(kinds.items(), key=lambda kv: (kv[0][0] != 'error', -kv[1])):
        L.append(f'| {sev} | {k} | {n} |')
    L.append('\n## Screens\n\n| city | device | state | err | warn | chrome % | first issue |\n|---|---|---|---|---|---|---|')
    for city, d, s, e, w, c, top in rows:
        L.append(f"| {city} | {d} | {s} | {'' if e is None else e} | {'' if w is None else w} | {'' if c is None else c} | {top.replace('|', '/')[:140]} |")
    L.append('\n## Findings\n\nNumbers match the outlines in each `.ann.png`.\n')
    for city, devs in report['results'].items():
        for dname, sts in devs.items():
            for sname, r in sts.items():
                F = [f for f in r.get('findings', []) if f['sev'] != 'info']
                if not F:
                    continue
                L.append(f'### {city} · {dname} · {sname}\n')
                for f in F[:14]:
                    L.append(f"- {('**' + f['sev'] + '**') if f['sev'] == 'error' else f['sev']} {('[' + str(f['n']) + '] ') if f.get('n') else ''}`{f['kind']}` {f['el']}: {f['msg']}")
                if len(F) > 14:
                    L.append(f'- …and {len(F) - 14} more (report.json)')
                L.append('')
    if report.get('pageErrors'):
        L.append('## Page errors\n')
        for k, errs in report['pageErrors'].items():
            for e in errs[:10]:
                L.append(f'- {k}: {e}')
    return '\n'.join(L) + '\n'


def contact_sheet(report):
    """index.html: one row per state, one column per device, annotated shots with their findings."""
    hdr = report['header']
    devs = hdr['devices']
    css = ('body{font:14px system-ui,sans-serif;margin:16px;background:#f4f5f7;color:#1d2b36}h2{margin:28px 0 8px}'
           'table{border-collapse:collapse}td,th{vertical-align:top;padding:6px;border-top:1px solid #d5d9de;text-align:left}'
           'th{position:sticky;top:0;background:#f4f5f7;z-index:1}img{display:block;max-height:420px;max-width:340px;border:1px solid #c8ced5;border-radius:6px;background:#fff}'
           '.b{display:inline-block;border-radius:9px;padding:0 7px;font-size:12px;font-weight:600;margin:4px 4px 0 0}.e{background:#e0102f;color:#fff}.w{background:#f08c00;color:#fff}.ok{background:#2b8a3e;color:#fff}'
           'details{max-width:340px;font-size:12px}li{margin:2px 0}code{font-size:11px}.st{font-weight:600}.d{color:#5c6873;font-size:12px}')
    out = [f'<!doctype html><meta charset="utf-8"><title>UX audit {html.escape(hdr["time"])}</title><style>{css}</style>',
           f'<h1>UI/UX audit {html.escape(hdr["time"])} {html.escape(hdr.get("label") or "")}</h1><p>git {html.escape(hdr["git"])}{" (dirty)" if hdr["dirty"] else ""}. '
           'Click a picture for the clean screenshot. Outline colours: red error, orange warning, blue dashed info.</p>']
    for city, by_dev in report['results'].items():
        out.append(f'<h2>{html.escape(city)}</h2><table><tr><th>state</th>' + ''.join(f'<th>{d}<div class="d">{DEVICES[d]["viewport"][0]}×{DEVICES[d]["viewport"][1]}</div></th>' for d in devs) + '</tr>')
        names = []
        for d in devs:
            for s in by_dev.get(d, {}):
                if s not in names:
                    names.append(s)
        for s in names:
            out.append(f'<tr><td class="st">{html.escape(s)}<div class="d">{html.escape(report["states"].get(s, ""))}</div></td>')
            for d in devs:
                r = by_dev.get(d, {}).get(s)
                if not r:
                    out.append('<td></td>')
                    continue
                if 'findings' not in r:
                    out.append(f'<td class="d">{html.escape(r.get("error") or r.get("skipped", ""))[:200]}</td>')
                    continue
                F = r['findings']
                e = sum(f['sev'] == 'error' for f in F)
                w = sum(f['sev'] == 'warn' for f in F)
                img = r.get('ann') or r['png']
                badges = (f'<span class="b e">{e} err</span>' if e else '') + (f'<span class="b w">{w} warn</span>' if w else '') + ('' if e or w else '<span class="b ok">ok</span>')
                items = ''.join(f'<li>{("[" + str(f["n"]) + "] ") if f.get("n") else ""}<b>{f["sev"]}</b> <code>{html.escape(f["kind"])}</code> {html.escape(f["el"] or "")}: {html.escape(f["msg"])}</li>' for f in F)
                out.append(f'<td><a href="{html.escape(r["png"])}"><img loading="lazy" src="{html.escape(img)}"></a>{badges}<span class="d"> chrome {r["metrics"]["chromePct"]}%</span>'
                           + (f'<details><summary>{len(F)} findings</summary><ol>{items}</ol></details>' if F else '') + '</td>')
            out.append('</tr>')
        out.append('</table>')
    return '\n'.join(out)


# ---------------------------------------------------------------- commands

def cmd_run(a):
    from playwright.sync_api import sync_playwright
    states = load_states()
    if a.states:
        want = a.states.split(',')
        bad = [s for s in want if s not in {x['name'] for x in states}]
        if bad:
            raise SystemExit(f'unknown state(s): {bad}; see `ux.py list`')
        states = [s for s in states if s['name'] in want]
    devs = a.devices.split(',') if a.devices else DEFAULT_DEVICES
    for d in devs:
        if d not in DEVICES:
            raise SystemExit(f'unknown device {d}; one of {list(DEVICES)}')
    cities = a.cities.split(',') if a.cities else CITIES
    stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    art = os.path.join(OUT, stamp + ('-' + re.sub(r'[^\w.-]+', '-', a.label) if a.label else ''))
    os.makedirs(art, exist_ok=True)
    snap = None
    if a.ref and not side_has(ROOT, a.ref, 'package.json'):   # the app as it was at a commit (index.html, css/, js/; data/ from the working tree)
        sha = git('rev-parse', '--short', a.ref)
        if not sha:
            raise SystemExit(f'unknown git ref {a.ref}')
        snap = root = os.path.join(OUT, f'.ref-{sha}-{os.getpid()}')
        os.makedirs(snap, exist_ok=True)
        arc = subprocess.run(['git', 'archive', a.ref, 'index.html', 'css', 'js'], cwd=ROOT, capture_output=True, check=True).stdout
        subprocess.run(['tar', '-x', '-C', snap], input=arc, check=True)
        done = lambda: None   # noqa: E731
    else:   # the working tree, or a commit with a package.json: built in perf mode like perf.py's sides (perf.prepare_side)
        if a.ref and not git('rev-parse', '--short', a.ref):
            raise SystemExit(f'unknown git ref {a.ref}')
        root, _, done = prepare_side(ROOT, a.ref)
    srv, base = serve(root)
    report = {'header': {'time': stamp, 'label': a.label, 'git': git('rev-parse', '--short', a.ref) if a.ref else git('rev-parse', '--short', 'HEAD'),
                         'dirty': False if a.ref else bool(git('status', '--porcelain', '--', 'index.html', 'css', 'js')),
                         'devices': devs, 'cities': cities, 'browser': ''},
              'states': {s['name']: s.get('desc', '') for s in states}, 'results': defaultdict(dict), 'pageErrors': {}}
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=not a.headed, args=gpu_args())
            report['header']['browser'] = 'Chromium ' + browser.version
            for ci, city in enumerate(cities):
                for dname in devs:
                    print(f'{city} · {dname} ({DEVICES[dname]["desc"]})', flush=True)
                    res, errors = run_device(browser, base, city, dname, DEVICES[dname], states, a, art, first_city=(ci == 0))
                    for k, v in res.items():
                        if v.get('city') == 'all':
                            report['results']['all'].setdefault(dname, {})[k] = v
                        else:
                            report['results'][city].setdefault(dname, {})[k] = v
                    if errors:
                        report['pageErrors'][f'{city}/{dname}'] = errors
            browser.close()
    finally:
        srv.shutdown()
        done()
        if snap:
            shutil.rmtree(snap, ignore_errors=True)
        # 'all' (menu, load error) first
        res = report['results']
        report['results'] = {k: res[k] for k in sorted(res, key=lambda c: (c != 'all', cities.index(c) if c in cities else 0))}
        with open(os.path.join(art, 'report.json'), 'w', encoding='utf-8') as f:
            json.dump(report, f, indent=1)
        s = summarize(report)
        with open(os.path.join(art, 'summary.md'), 'w', encoding='utf-8') as f:
            f.write(s)
        with open(os.path.join(art, 'index.html'), 'w', encoding='utf-8') as f:
            f.write(contact_sheet(report))
    head = s.split('## Findings')[0]
    print('\n' + head)
    print(f'Report: {os.path.relpath(art, ROOT)}/summary.md · contact sheet: {os.path.relpath(art, ROOT)}/index.html')


def flat(report):
    out = {}
    for city, devs in report['results'].items():
        for d, sts in devs.items():
            for s, r in sts.items():
                if 'findings' in r:
                    out[(city, d, s)] = r
    return out


def cmd_compare(a):
    A, B = (json.load(open(os.path.join(p, 'report.json'), encoding='utf-8')) for p in (a.a, a.b))
    fa, fb = flat(A), flat(B)
    key = lambda f: (f['sev'], f['kind'], re.sub(r'\d+', '#', f['el'] or ''))  # noqa: E731
    te = tw = 0
    print(f"| city | device | state | errors | warnings | chrome % |\n|---|---|---|---|---|---|")
    for k in sorted(set(fa) | set(fb)):
        ra, rb = fa.get(k), fb.get(k)
        if not ra or not rb:
            print(f"| {' | '.join(k)} | {'new' if rb else 'gone'} | | |")
            continue
        ea, wa = (sum(f['sev'] == s for f in ra['findings']) for s in ('error', 'warn'))
        eb, wb = (sum(f['sev'] == s for f in rb['findings']) for s in ('error', 'warn'))
        te += eb - ea
        tw += wb - wa
        ca, cb = ra['metrics']['chromePct'], rb['metrics']['chromePct']
        if (ea, wa, ca) != (eb, wb, cb):
            print(f"| {' | '.join(k)} | {ea} → {eb} | {wa} → {wb} | {ca} → {cb} |")
    print(f'\nTotal change: errors {te:+d}, warnings {tw:+d}')
    t, _ = diff_table([(' · '.join(k), os.path.join(a.a, fa[k]['png']), os.path.join(a.b, fb[k]['png']), os.path.join(a.b, 'diff', fb[k]['png']))
                       for k in sorted(set(fa) & set(fb))], 'city · device · state')
    print('\n## Pixels\n\n' + diff_note(os.path.join(a.b, 'diff', '<city>/<device>/<state>.png')) + '\n' + '\n'.join(t))
    if a.detail:
        for k in sorted(set(fa) & set(fb)):
            ka = Counter(key(f) for f in fa[k]['findings'] if f['sev'] != 'info')
            kb = Counter(key(f) for f in fb[k]['findings'] if f['sev'] != 'info')
            gone, new = ka - kb, kb - ka
            if gone or new:
                print(f"\n{' · '.join(k)}")
                for f in gone:
                    print(f'  - fixed: {f[0]} {f[1]} {f[2]}')
                for f in new:
                    print(f'  + new:   {f[0]} {f[1]} {f[2]}')


def cmd_list(a):
    print('Devices (default: ' + ','.join(DEFAULT_DEVICES) + '):')
    for k, d in DEVICES.items():
        print(f"  {k:<11} {d['viewport'][0]:>4}×{d['viewport'][1]:<5} dpr {d['dpr']:<5} {'touch' if d['touch'] else 'mouse'}  {d['desc']}")
    print('\nStates:')
    for s in load_states():
        where = 'all cities' if s.get('cities') is None else ','.join(s['cities'])
        print(f"  {s['name']:<22} [{where}{'; ' + str(s['devices']) if s.get('devices') else ''}] {s.get('desc', '')}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    r = sub.add_parser('run', help='audit and screenshot every state on every device')
    r.add_argument('-c', '--cities', help='comma-separated city ids (default: all)')
    r.add_argument('-d', '--devices', help='comma-separated device names (default: ' + ','.join(DEFAULT_DEVICES) + ')')
    r.add_argument('-s', '--states', help='comma-separated state names (default: all)')
    r.add_argument('--label', help='suffix for the output folder')
    r.add_argument('--ref', help='audit the app as it is at this git commit (e.g. HEAD) instead of the working tree')
    r.add_argument('--settle', type=int, default=700, help='ms to wait after a state is set up (default 700; states can override)')
    r.add_argument('--headed', action='store_true', help='show the browser')
    r.add_argument('--keep-open', action='store_true', help='pause after each device so you can look around (with --headed)')
    r.add_argument('--no-annotate', action='store_true', help='skip the annotated screenshots')
    r.set_defaults(fn=cmd_run)
    c = sub.add_parser('compare', help='compare two runs: errors and warnings per screen')
    c.add_argument('a')
    c.add_argument('b')
    c.add_argument('--detail', action='store_true', help='list the findings fixed and new per screen')
    c.set_defaults(fn=cmd_compare)
    sub.add_parser('list', help='devices and states').set_defaults(fn=cmd_list)
    a = ap.parse_args()
    a.fn(a)


if __name__ == '__main__':
    main()
