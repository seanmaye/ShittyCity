"""Capture the loading-screen backgrounds: frames of each city's own 3D model at its points of interest.

Each city lists its screens in js/cities.js (loadingScreens): a "Go to" view id or a camera, the
time of day (hours from sunset) and the day of the year. This opens the real app in Chromium with
the GPU on, flies to each one, waits for it to settle, and saves what the city's canvas drew (no
panel or labels) as data/<city>/<file>, a 1920x1080 WebP.

Needs the local server (python -I tools/serve.py) and Playwright, like tools/perf:
    pip install playwright && python -m playwright install chromium

Run:  python -I tools/loading/capture.py              every city
      python -I tools/loading/capture.py nyc          one city
      python -I tools/loading/capture.py nyc --only poi-unisphere.webp
      python -I tools/loading/capture.py --headed     watch it
Then rebuild the bundle (python -I tools/bundle.py).
"""
import argparse
import base64
import os
import sys

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_DAY = 285          # mid-October: autumn colour, sunset a little after six
SETTLE_MS = 3500           # the camera flight takes 2.2 s; then let shadows and detail catch up


def gpu_args():
    # headless Chromium falls back to software GL unless told to use the real GPU (tools/perf/perf.py)
    a = ['--ignore-gpu-blocklist', '--enable-gpu']
    if sys.platform == 'win32':
        a.append('--use-angle=d3d11')
    elif sys.platform == 'darwin':
        a.append('--use-angle=metal')
    else:
        a += ['--use-angle=vulkan', '--enable-features=Vulkan']
    return a


FLY = """async ([s, day]) => {
  const a = window.__city;
  a.setDay(s.day ?? day);
  a.setTime(a.sunset + (s.hour ?? -1));
  a.controls.maxPolarAngle = Math.PI * .62;   // street-level shots may look up at a landmark
  let v;
  if (s.cam) {
    const [p, t] = s.cam, g = a.groundAt(t[0], t[2]);
    v = { pos: a.camera.position.clone().set(p[0], p[1] + g, p[2]), target: a.camera.position.clone().set(t[0], t[1] + g, t[2]), near: 5 };
  } else {
    v = a.views.find(w => w.id === s.view);
    if (!v) throw new Error('no view ' + s.view);
  }
  a.flyTo(v);
}"""

GRAB = """() => {
  const a = window.__city;
  a.renderer.render(a.scene, a.camera);   // draw now, so the canvas still holds the frame below
  return a.renderer.domElement.toDataURL('image/webp', 0.82);
}"""


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('cities', nargs='*', help='city ids (default: every city with loadingScreens)')
    ap.add_argument('--only', action='append', default=[], help='just this file (repeatable)')
    ap.add_argument('--base', default='http://localhost:8765')
    ap.add_argument('--headed', action='store_true')
    a = ap.parse_args()

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=not a.headed, args=gpu_args())
        probe = browser.new_page()
        probe.goto(a.base + '/index.html', wait_until='load')
        cities = probe.evaluate("""async () => { const { CITIES } = await import('/js/cities.js');
            return Object.values(CITIES).filter(c => c.loadingScreens).map(c => ({ id: c.id, dir: c.dir, screens: c.loadingScreens })); }""")
        probe.close()
        for c in cities:
            if a.cities and c['id'] not in a.cities:
                continue
            screens = [s for s in c['screens'] if not a.only or s['file'] in a.only]
            if not screens:
                continue
            page = browser.new_page(viewport={'width': 1920, 'height': 1080}, device_scale_factor=1)
            page.goto(f"{a.base}/index.html?city={c['id']}", wait_until='load', timeout=120000)
            page.wait_for_function('() => window.__city && document.getElementById("city-loading").hidden', timeout=300000, polling=500)
            for s in screens:
                page.evaluate(FLY, [s, DEFAULT_DAY])
                page.wait_for_timeout(SETTLE_MS)
                url = page.evaluate(GRAB)
                out = os.path.join(ROOT, c['dir'], s['file'])
                with open(out, 'wb') as f:
                    f.write(base64.b64decode(url.split(',', 1)[1]))
                print(f"{os.path.relpath(out, ROOT)}  {os.path.getsize(out) // 1024} KB")
            page.close()
        browser.close()


if __name__ == '__main__':
    main()
