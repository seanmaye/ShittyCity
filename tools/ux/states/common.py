"""UI states every city has (see tools/ux/README.md: Adding a state).

A state is a dict:
  name      short kebab-case, unique across all states files
  desc      one line for the report
  pre       'menu' | 'loading' | 'error': captured before a city's scene is running (handled by ux.py)
  when      JS expression with `api` in scope; the state is skipped when it is falsy
  devices   'touch' | 'mouse' | [device names]   (default: every device)
  fold      'open' | 'folded' | None | 'keep': the HUD panel before setup (None: the app's
            first-visit default for the device, folded on phones; 'keep': don't touch it)
  setup     JS (an async function body with api, U = window.__ux, sleep in scope), or a Python
            function setup(c) taking a ux.Ctx (c.tap, c.drag, c.pinch, c.js, c.wait, c.finding)
  settle    ms to wait after setup before measuring (camera flights take 2.2 s)
  check     optional Python function check(c): assert things, c.finding(sev, kind, msg)

Every state starts from __ux.reset(): out of any car, dialogs closed, ride picker closed,
transit and cut-away off, labels on. The camera stays where the last state left it, so
states that care about the view fly somewhere first.
"""


def _home(c):
    c.js("api.flyTo('home');")
    c.wait(2500)


def ride_first_line(c):
    """Open the ride picker and tap the first line, as a user would."""
    c.js("U.fold(true)")
    c.tap('#ride')
    c.wait(250)
    c.tap('#lines button')
    c.wait(300)


def check_boarded(c):
    car = c.js('const k = api.getCar(); return k && { kind: k.kind || null, name: k.name || k.lineName || null };')
    if not car:
        c.finding('error', 'flow', 'nothing was boarded')


def check_move_controls(c):
    """Inside a car on a touch screen, is there any way to walk the aisle?"""
    if not c.touch:
        return
    car = c.js('const k = api.getCar(); return k ? (k.kind || "train") : null;')
    if car in (None, 'seat', 'person', 'vista'):
        return
    has = c.js("return !![...document.querySelectorAll('[data-touch-move]')].find(e => U.vis(e));")
    if not has:
        c.finding('warn', 'touch-gap', 'no on-screen control to walk inside the car: W A S D only (mark one with data-touch-move)')


def touch_orbit(c):
    _home(c)
    c.js("U.fold(false)")
    c.wait(200)
    w, h = c.device['viewport']
    c.state0 = c.cam()
    c.drag(w * .3, h * .55, w * .7, h * .55)
    c.wait(600)


def check_orbit(c):
    a, b = c.state0, c.cam()
    if abs(b['az'] - a['az']) < .05 and abs(b['y'] - a['y']) < 1:
        c.finding('error', 'gesture', 'a one-finger drag across the view did not turn the camera')


def touch_pinch(c):
    _home(c)
    c.js("U.fold(false)")
    c.wait(200)
    w, h = c.device['viewport']
    c.state0 = c.cam()
    c.pinch(w * .5, h * .55, 60, min(w, h) * .7)
    c.wait(700)


def check_pinch(c):
    a, b = c.state0, c.cam()
    if b['dist'] > a['dist'] * .95:
        c.finding('error', 'gesture', f"spreading two fingers did not zoom in (distance {a['dist']:.0f} → {b['dist']:.0f} m)")


def touch_board(c):
    _home(c)
    c.js("U.fold(false)")
    p = c.js("return U.findPick('car', 10);")
    if not p:
        c.finding('info', 'flow', 'no train in view to tap from the overview')
        return
    c.tap((p['x'], p['y']))
    c.wait(1500)


def check_touch_board(c):
    if c.js('return !!api.getCar();'):
        check_move_controls(c)
    elif any(f['kind'] == 'flow' for f in c.findings):
        return
    else:
        c.finding('error', 'gesture', 'tapping a train did not board it')


STATES = [
    {'name': 'menu', 'pre': 'menu', 'desc': 'the start menu: pick a city'},
    {'name': 'load-error', 'pre': 'error', 'desc': 'a data file failed to load: the error and "Change city"'},
    {'name': 'loading', 'pre': 'loading', 'desc': "the city's loading screen, while it builds"},

    {'name': 'first-view', 'desc': 'the first view after loading, as a first-time visitor sees it (the default fold)',
     'fold': 'keep', 'setup': None, 'settle': 300},
    {'name': 'hud-open', 'fold': 'open', 'desc': 'the panel opened at the overview', 'setup': _home, 'settle': 300},
    {'name': 'hud-folded', 'fold': 'folded', 'desc': 'the panel folded to its title at the overview', 'setup': _home, 'settle': 300},
    {'name': 'ride-picker', 'fold': 'open', 'when': 'api.lines.length', 'desc': '"Ride a line" opened: the list of lines',
     'setup': lambda c: (c.tap('#ride'), c.wait(300))},
    {'name': 'riding', 'when': 'api.lines.length', 'desc': "riding a line's lead car (picked from the list): line diagram, Get off, hint",
     'setup': ride_first_line, 'settle': 2500, 'check': lambda c: (check_boarded(c), check_move_controls(c))},
    {'name': 'riding-folded', 'when': 'api.lines.length', 'desc': 'riding, with the panel folded away',
     'setup': lambda c: (ride_first_line(c), c.wait(1500), c.js('U.fold(false)')), 'settle': 800},
    {'name': 'transit-map', 'fold': 'open', 'when': 'api.legend.length || api.oldTrolleyLegend.length', 'desc': '"Show transit lines": the coloured lines and their legend',
     'setup': lambda c: (c.js("api.flyTo(api.views.find(v => v.id === 'city') ? 'city' : 'home');"), c.wait(300), c.tap('#transit')), 'settle': 2500},
    {'name': 'cut-away', 'fold': 'open', 'when': 'api.views.some(v => v.cut)', 'desc': 'the subway cut-away',
     'setup': lambda c: c.tap('#cut'), 'settle': 2800},
    {'name': 'goto-view', 'fold': 'open', 'desc': 'tapped the second "Go to" button: the panel after the flight',
     'setup': lambda c: c.tap('#view-btns button:nth-child(2)'), 'settle': 2800},
    {'name': 'night', 'fold': 'folded', 'desc': 'the overview at 10 PM: lights, labels on a dark sky',
     'setup': "api.flyTo('home'); api.setTime(22); document.getElementById('time').value = 22;", 'settle': 2600},

    {'name': 'touch-orbit', 'devices': 'touch', 'desc': 'one-finger drag across the view (should orbit)', 'setup': touch_orbit, 'check': check_orbit, 'settle': 200},
    {'name': 'touch-pinch', 'devices': 'touch', 'desc': 'two-finger spread on the view (should zoom in)', 'setup': touch_pinch, 'check': check_pinch, 'settle': 200},
    {'name': 'touch-board', 'devices': 'touch', 'when': 'api.lines.length', 'desc': 'tap a train seen from the overview (should board it)',
     'setup': touch_board, 'check': check_touch_board, 'settle': 300},
]
