"""Philadelphia's own UI states (run with -c phl). See common.py for the state format.

Walnut St (someone's eyes, a café chair, a bench), the Schuylkill fishing game from the invitation
to the catch log, the Lucky Arcade from its menu through each game and back, the Chinatown night
market and the river boats. Everything is reached the way a user would: real taps on what is drawn
(U.findPick), real touch holds and drags on the games' canvases.
"""
import time

# the time of day, set through the panel's own slider (the common "night" state leaves it at 10 PM)
def at_hour(h):
    return f"{{ const t = document.getElementById('time'); t.value = {h}; t.dispatchEvent(new Event('input')); }} "


DAY = at_hour(14)


def pick_and_tap(c, kind, view_js, wait=2600):
    """Fly to a view, find something of `kind` on screen (see __ux.findPick) and tap it."""
    c.js(view_js)
    c.wait(wait)
    c.js('U.fold(false)')
    p = c.js(f"return U.findPick('{kind}', 10);")
    if not p:
        c.finding('error', 'flow', f'no {kind} on screen to tap from this view')
        return False
    c.tap((p['x'], p['y']))
    c.wait(900)
    return True


# ---- holding a finger (or the mouse button) down: the games reel and fire while pressed
def press(c, x, y):
    if c.touch:
        c.cdp().send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y, 'id': 0}]})
    else:
        c.page.mouse.move(x, y)
        c.page.mouse.down()


def move(c, x, y):
    if c.touch:
        c.cdp().send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x, 'y': y, 'id': 0}]})
    else:
        c.page.mouse.move(x, y)


def release(c):
    if c.touch:
        c.cdp().send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    else:
        c.page.mouse.up()


def centre(c, sel):
    p = c.point(sel)
    if not p:
        c.finding('error', 'missing', f'{sel} is not visible', sel)
    return p


def still(c, what):
    """The page must not have scrolled or zoomed under the player's finger."""
    s = c.js("const se = document.scrollingElement, card = document.querySelector('.fish-modal:not([hidden]) .fish-card, .arc-modal:not([hidden]) .arc-card');"
             " return { page: se.scrollTop + se.scrollLeft, zoom: visualViewport ? visualViewport.scale : 1, card: card ? card.scrollTop : 0, card0: card ? +(card.dataset.ux0 || 0) : 0 };")
    if s['page'] or abs(s['zoom'] - 1) > .01:
        c.finding('error', 'gesture', f'{what} scrolled or zoomed the page (scroll {s["page"]}, zoom {s["zoom"]:.2f})')
    if abs(s['card'] - s['card0']) > 2:
        c.finding('error', 'gesture', f'{what} scrolled the dialog ({s["card0"]} → {s["card"]} px)')


def mark_scroll(c):
    c.js("const card = document.querySelector('.fish-modal:not([hidden]) .fish-card, .arc-modal:not([hidden]) .arc-card'); if (card) card.dataset.ux0 = card.scrollTop;")


# ---------------------------------------------------------------- fishing on the Schuylkill
FMSG = "return (document.querySelector('.fish-msg') || {}).textContent || '';"
# the line-tension gauge, read off the canvas: the length of the bar's run of solid colour (red,
# green or gold) along its middle row, as a fraction of the bar (fishing.js draws it)
TENSION = """
const cv = document.querySelector('.fish-cv'), g = cv.getContext('2d'), k = cv.height / 400;
const G = cv.dataset.gauge ? JSON.parse(cv.dataset.gauge) : { x: 20, y: 348, w: 260, h: 14 };
const y = Math.round((G.y + G.h / 2) * k), x0 = Math.round((G.x + 2) * k), x1 = Math.round((G.x + G.w - 2) * k);
const d = g.getImageData(0, y, cv.width, 1).data, cols = [[208, 48, 42], [61, 154, 74], [201, 162, 39]];
const solid = x => cols.some(([r, gg, b]) => Math.abs(d[x * 4] - r) < 14 && Math.abs(d[x * 4 + 1] - gg) < 14 && Math.abs(d[x * 4 + 2] - b) < 14);
let x = x0; while (x < x1 && solid(x)) x++;
return (x - x0) / (x1 - x0);
"""


def fish_invite(c):
    return pick_and_tap(c, 'angler', DAY + "api.flyTo('fishing');")


def fish_game(c):
    """The invitation, then "Yes, let's fish": the cast meter swinging."""
    if not fish_invite(c):
        return False
    c.wait(300)
    c.tap('.fish-invite .row button')
    c.wait(600)
    if c.js("return document.querySelector('.fish-game').hidden;"):
        c.finding('error', 'flow', '"Yes, let’s fish" did not start the game')
        return False
    mark_scroll(c)
    return True


def fish_bite(c, timeout=12):
    """Tap to cast, then wait for the bite and tap to strike (a real tap each time)."""
    if not fish_game(c):
        return False
    c.tap('.fish-cv')
    t0 = time.time()
    while time.time() - t0 < timeout:
        m = c.js(FMSG)
        if m.startswith('Bite'):
            c.tap('.fish-cv')
            c.wait(150)
            if c.js(FMSG).startswith(('Fish on', 'Something')):
                return True
            c.finding('warn', 'flow', f'tapped on the bite but: {c.js(FMSG)}')
            return False
        if m.startswith(('Too', 'The line')):
            break
        c.wait(30)
    c.finding('error', 'flow', f'never got a bite to strike (last message: {c.js(FMSG)!r})')
    return False


def fish_reel(c, seconds=30, until_over=True):
    """Hold a finger on the water to reel and lift it when the tension runs high, like a player
    watching the gauge (reacting in about a tenth of a second)."""
    p = centre(c, '.fish-cv')
    if not p:
        return
    held, t0 = False, time.time()
    while time.time() - t0 < seconds:
        m = c.js(FMSG)
        if not m.startswith(('Fish on', 'Something')):
            break
        ten = c.js(TENSION)
        want = ten < .55
        if want != held:
            (press(c, p['x'], p['y']) if want else release(c))
            held = want
        if not until_over and time.time() - t0 > 2.5:
            break
        c.wait(60)
    if held and until_over:
        release(c)
    return held


def fishing_reel(c):
    if fish_bite(c):
        held = fish_reel(c, until_over=False)
        if not held:   # the screenshot shows the line being reeled in
            p = centre(c, '.fish-cv')
            if p:
                press(c, p['x'], p['y'])
        c.wait(200)
        still(c, 'holding on the water')


def fishing_reel_check(c):
    m = c.js(FMSG)
    release(c)
    if m and not m.startswith(('Fish on', 'Something', 'Snap', 'The line', 'New', 'Too')) and '(' not in m:
        c.finding('warn', 'flow', f'reeling: unexpected message {m!r}')


def fishing_catch(c):
    if fish_bite(c):
        fish_reel(c)
        c.wait(400)
        still(c, 'reeling in')


def fishing_catch_check(c):
    over = c.js("return !document.querySelector('.fish-row').hidden;")
    if not over:
        c.finding('error', 'flow', f'the fight never ended (message: {c.js(FMSG)!r})')


def fishing_log(c):
    """Strike too soon (the quickest way to the end of a cast), then "Catch log"."""
    if not fish_game(c):
        return
    c.tap('.fish-cv')
    c.wait(1300)
    c.tap('.fish-cv')
    c.wait(400)
    c.tap('.fish-row button:nth-child(2)')
    c.wait(500)


def fishing_log_check(c):
    if c.js("return document.querySelector('.fish-log').hidden;"):
        c.finding('error', 'flow', '"Catch log" did not open the log')


# ---------------------------------------------------------------- the Lucky Arcade
def arc_menu(c):
    return pick_and_tap(c, 'stall', at_hour(21) + 'api.viewStall();')


def arc_play(c, i):
    """Open the stall and tap the i-th game (1-based) in its menu."""
    if not arc_menu(c):
        return None
    c.wait(300)
    c.tap(f'.arc-list .arc-pick:nth-child({i})')
    c.wait(400)
    if c.js("return document.querySelector('.arc-game').hidden;"):
        c.finding('error', 'flow', f'tapping game {i} did not start it')
        return None
    mark_scroll(c)
    return centre(c, '.arc-cv')


# the player's sprite read off the arcade canvas: the mean x and y (game pixels, 480 square) of the
# pixels of one colour inside a box
SPRITE = """
const [col, bx, by, bw, bh] = arg, cv = document.querySelector('.arc-cv'), k = cv.width / 480;
const d = cv.getContext('2d').getImageData(Math.round(bx * k), Math.round(by * k), Math.round(bw * k), Math.round(bh * k));
let n = 0, sx = 0, sy = 0;
for (let i = 0; i < d.data.length; i += 4) if (Math.abs(d.data[i] - col[0]) < 16 && Math.abs(d.data[i + 1] - col[1]) < 16 && Math.abs(d.data[i + 2] - col[2]) < 16) { n++; sx += (i / 4) % d.width; sy += Math.floor(i / 4 / d.width); }
return n ? { x: bx + sx / n / k, y: by + sy / n / k, n } : null;
"""
PADDLE = ([232, 64, 46], 20, 30, 30, 450)        # Ping-Pong: your red paddle down the left
LAUNCHER = ([214, 48, 31], 0, 410, 480, 60)     # Sky Swarm: the red lantern along the bottom


def arcade_pong(c):
    p = arc_play(c, 1)
    if not p:
        return
    c.wait(300)
    r = c.js("const r = document.querySelector('.arc-cv').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height };")
    y0 = c.js(SPRITE, PADDLE)
    x = r['l'] + r['w'] * .2
    press(c, x, r['t'] + r['h'] * .5)
    for i in range(1, 13):   # drag the finger up the table: the paddle should follow
        move(c, x, r['t'] + r['h'] * (.5 - .35 * i / 12))
        c.wait(30)
    c.wait(250)
    y1 = c.js(SPRITE, PADDLE)
    release(c)
    c.state0 = (y0, y1)
    still(c, 'dragging on the table')


def arcade_pong_check(c):
    y0, y1 = getattr(c, 'state0', (None, None))
    if y0 and y1 and y0['y'] - y1['y'] < 40:
        c.finding('error', 'gesture', f"dragging a finger up the table did not move the paddle (y {y0['y']:.0f} → {y1['y']:.0f})")


def arcade_swarm(c):
    p = arc_play(c, 2)
    if not p:
        return
    c.wait(300)
    r = c.js("const r = document.querySelector('.arc-cv').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height };")
    x0 = c.js(SPRITE, LAUNCHER)
    y = r['t'] + r['h'] * .8
    press(c, r['l'] + r['w'] * .5, y)
    for i in range(1, 25):   # hold and slide right: the launcher follows and fires
        move(c, r['l'] + r['w'] * (.5 + .35 * i / 24), y)
        c.wait(40)
    c.wait(200)
    x1 = c.js(SPRITE, LAUNCHER)
    c.state0 = (x0, x1)
    still(c, 'holding and sliding on the sky')


def arcade_swarm_check(c):
    release(c)
    x0, x1 = getattr(c, 'state0', (None, None))
    if x0 and x1 and x1['x'] - x0['x'] < 60:
        c.finding('error', 'gesture', f"sliding a finger right did not move the launcher (x {x0['x']:.0f} → {x1['x']:.0f})")


def arcade_dash(c):
    p = arc_play(c, 3)
    if not p:
        return
    c.wait(1800)   # READY?
    r = c.js("const r = document.querySelector('.arc-cv').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height };")
    cx, cy = r['l'] + r['w'] * .5, r['t'] + r['h'] * .5
    c.drag(cx, cy, cx, cy - r['h'] * .15, steps=6, ms=120)   # swipe up
    c.wait(900)
    still(c, 'swiping on the maze')


def arcade_back(c):
    """From a game: "Back to games" (the menu again), then the close button."""
    if not arc_play(c, 1):
        return
    c.wait(400)
    c.tap('.arc-row button:nth-child(3)')
    c.wait(300)
    if c.js("return document.querySelector('.arc-menu').hidden;"):
        c.finding('error', 'flow', '"Back to games" did not go back to the menu')
    c.state0 = c.js("return document.activeElement && document.activeElement.className;")


def arcade_close(c):
    if not arc_menu(c):
        return
    c.wait(300)
    c.tap('.arc-x')
    c.wait(300)


def arcade_close_check(c):
    if c.js("return !document.querySelector('.arc-modal').hidden || document.body.classList.contains('arcade');"):
        c.finding('error', 'flow', 'the close button did not close the arcade')


# ---------------------------------------------------------------- Walnut St
# a point on the 3D view itself (not under a panel) where the pick finds what `arg` names, and
# finds it a few pixels around too (so something moving past doesn't take the tap)
OPEN = "const c0 = api.renderer.domElement, on = (x, y) => document.elementFromPoint(x, y) === c0;"


def sit_on(c, kind):
    """Tap a seat of the right kind ('cafe' or 'bench') seen from the Walnut St view. A seat's kind
    only shows once you sit on it, so every seat in sight is tried from script first (sitting and
    standing straight up again), then the view is flown again and the nearest of the kind is tapped."""
    c.js(DAY + "api.flyTo('walnut');")
    c.wait(2600)
    c.js('U.fold(false)')
    p = c.js(OPEN + """const W = c0.clientWidth, H = c0.clientHeight, pts = [], seen = new Set();
      for (let y = 10; y < H - 10; y += 8) for (let x = 10; x < W - 10; x += 8) { const h = api.pickCar(x, y); if (h && h.seat !== undefined && !seen.has(h.seat) && on(x, y)) { seen.add(h.seat); pts.push({ x, y, i: h.seat, d: (x - W / 2) ** 2 + (y - H / 2) ** 2 }); } }
      pts.sort((a, b) => a.d - b.d);
      for (const q of pts) { api.boardCar({ seat: q.i }); const k = api.getCar(); const kind = k && k.seat; api.leaveCar(true); if (kind === arg) return q; }
      return null;""", kind)
    if not p:
        c.finding('error', 'flow', f'no {kind} seat in sight from the Walnut St view')
        return False
    got = None
    for _ in range(3):
        c.js(DAY + "api.flyTo('walnut');")
        c.wait(2600)
        # the same seat again, where nothing passing (a streetcar, someone walking) is in front of it
        q = c.js(OPEN + """const [x0, y0, i] = arg, pts = [], is = (x, y) => { const h = api.pickCar(x, y); return h && h.seat === i; };
          for (let dy = -60; dy <= 60; dy += 3) for (let dx = -60; dx <= 60; dx += 3) pts.push([x0 + dx, y0 + dy, dx * dx + dy * dy]);
          pts.sort((a, b) => a[2] - b[2]);
          for (const [x, y] of pts) if (is(x, y) && is(x - 4, y) && is(x + 4, y) && on(x, y)) return { x, y };
          for (const [x, y] of pts) if (is(x, y) && on(x, y)) return { x, y };
          return null;""", [p['x'], p['y'], p['i']])
        if q:
            c.tap((q['x'], q['y']))
            c.wait(900)
            got = c.js("const k = api.getCar(); return k && k.kind === 'seat' ? k.seat : null;")
            if got == kind:
                return True
        c.js("if (api.getCar()) api.leaveCar(true);")
    c.finding('error', 'flow', f'tapping a {kind} seat sat on: {got}')
    return False


# ---------------------------------------------------------------- boats
def ride_boat(c):
    """Tap a river boat. From the River boats view they are specks on a phone, so first stand where
    "Get off" leaves you (aboard a water taxi from the line list, then off it: looking down at the
    boat from just behind it), then tap the boat in front of you."""
    c.js(DAY + "const l = api.lines.find(l => l.group === 'River boats'); if (l) api.boardLine(l.id); await sleep(400); api.leaveCar();")
    c.wait(900)
    c.js('U.fold(false)')
    c.wait(300)
    for _ in range(6):
        p = c.js(OPEN + """const W = c0.clientWidth, H = c0.clientHeight, pts = [];
          for (let y = 10; y < H - 10; y += 4) for (let x = 10; x < W - 10; x += 4) pts.push([x, y, (x - W / 2) ** 2 + (y - H / 2) ** 2]);
          pts.sort((a, b) => a[2] - b[2]);
          let any = 0;
          for (const [x, y] of pts) { const h = api.pickCar(x, y); if (h && h.kind === 'boat') { any++; if (on(x, y)) return { x, y }; } }
          return { none: any };""")
        if 'x' in p:
            break
        c.wait(500)
    else:
        c.finding('warn', 'flow', f"no boat in the open to tap ({p['none']} points on a boat under a panel)")
        return
    c.tap((p['x'], p['y']))
    c.wait(1500)


def ride_boat_check(c):
    k = c.js("const k = api.getCar(); return k ? (k.kind || 'train') : null;")
    if k != 'boat':
        c.finding('error', 'flow', f'tapping a boat did not board it (aboard: {k})')
    elif c.touch and not c.js("return !![...document.querySelectorAll('[data-touch-move]')].find(e => U.vis(e));"):
        c.finding('warn', 'touch-gap', 'aboard a boat on a touch screen with no way to walk the cabin')


STATES = [
    # Walnut St
    {'name': 'walnut', 'fold': 'open', 'desc': 'the Walnut St promenade view, panel open',
     'setup': DAY + "api.flyTo('walnut');", 'settle': 2800},
    {'name': 'walnut-folded', 'desc': 'the Walnut St promenade, panel folded: the street, its labels and people',
     'setup': DAY + "api.flyTo('walnut');", 'settle': 2800},
    {'name': 'persona', 'desc': 'tapped someone on Walnut St: seeing through their eyes, with their card',
     'setup': lambda c: pick_and_tap(c, 'person', DAY + "api.flyTo('walnut');"), 'settle': 1200},
    {'name': 'seat', 'desc': 'tapped a café chair on Walnut St: sitting at a table',
     'setup': lambda c: sit_on(c, 'cafe'), 'settle': 1200},
    {'name': 'bench', 'desc': 'tapped a bench on Walnut St: sitting on it',
     'setup': lambda c: sit_on(c, 'bench'), 'settle': 1200},

    # fishing on the Schuylkill: invitation, casting, reeling, the result, the catch log
    {'name': 'fishing', 'desc': 'tapped an angler on the Schuylkill: the fishing invitation',
     'setup': fish_invite, 'settle': 900},
    {'name': 'fishing-cast', 'desc': '"Yes, let’s fish": the cast meter swinging, tap to cast',
     'setup': fish_game, 'settle': 500},
    {'name': 'fishing-reel', 'desc': 'cast, struck on the bite (taps), now holding a finger on the water to reel',
     'setup': fishing_reel, 'check': fishing_reel_check, 'settle': 100},
    {'name': 'fishing-catch', 'desc': 'reeled to the end by touch (holding and letting go): the catch, or the line snapping',
     'setup': fishing_catch, 'check': fishing_catch_check, 'settle': 600},
    {'name': 'fishing-log', 'desc': 'after a cast, "Catch log": every fish and find, caught or not',
     'setup': fishing_log, 'check': fishing_log_check, 'settle': 400},

    # the Lucky Arcade in Chinatown
    {'name': 'nightmarket', 'fold': 'folded', 'desc': 'the Chinatown night market at 9 PM: stalls, lanterns, labels',
     'setup': at_hour(21) + "api.flyTo('nightmarket');", 'settle': 2800},
    {'name': 'arcade', 'desc': "tapped the Lucky Arcade stall in Chinatown: the game menu",
     'setup': arc_menu, 'settle': 900},
    {'name': 'arcade-pong', 'desc': 'Ping-Pong: a finger dragged up the table moves the paddle',
     'setup': arcade_pong, 'check': arcade_pong_check, 'settle': 300},
    {'name': 'arcade-swarm', 'desc': 'Sky Swarm: holding a finger and sliding it moves the launcher and fires',
     'setup': arcade_swarm, 'check': arcade_swarm_check, 'settle': 100},
    {'name': 'arcade-dash', 'desc': 'Dumpling Dash: a swipe on the maze turns the dumpling',
     'setup': arcade_dash, 'settle': 300},
    {'name': 'arcade-back', 'desc': 'from a game, "Back to games": the menu again',
     'setup': arcade_back, 'settle': 300},
    {'name': 'arcade-close', 'desc': 'the arcade menu closed with its × button (the city again)',
     'setup': arcade_close, 'check': arcade_close_check, 'settle': 300},

    # the rivers
    {'name': 'boats', 'fold': 'folded', 'desc': 'the River boats view at Penn’s Landing: piers, boats, their labels',
     'setup': DAY + "api.flyTo('boats');", 'settle': 2800},
    {'name': 'boat-ride', 'desc': 'tapped a river boat (seen from just behind it): aboard, its line diagram, walking the cabin',
     'setup': ride_boat, 'check': ride_boat_check, 'settle': 800},
]
