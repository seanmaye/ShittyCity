"""New York's own UI states (run with -c nyc), and the ride screens for Philadelphia's lines (the
ride bar, picker and legend are shared: their states carry 'cities': ['phl']). See common.py for
the state format."""


def clean(c):
    """Transit lines and the cut-away off: __ux.reset() can't reach their buttons once the panel has
    folded itself away on a phone (after the cut-away, say), so they'd carry over into the next state."""
    c.js("U.fold(true); for (const id of ['transit', 'cut']) { const b = document.getElementById(id);"
         " if (b && b.getAttribute('aria-pressed') === 'true') b.click(); }")


def ride(c, match):
    """Open the ride picker and tap the line whose name starts with `match`, as a user would."""
    clean(c)
    c.tap('#ride')
    c.wait(250)
    ok = c.js("document.querySelectorAll('[data-ux-pick]').forEach(e => delete e.dataset.uxPick);"
              " const b = [...document.querySelectorAll('#lines button')].find(b => b.textContent.startsWith(arg));"
              " if (b) b.dataset.uxPick = '1'; return !!b;", match)
    if not ok:
        c.finding('error', 'missing', f'no line called "{match}…" in the ride picker')
        return False
    c.tap('#lines [data-ux-pick]')
    c.wait(300)
    return True


def check_bar(c):
    """While riding: the line diagram shows, with the next stop written out and readable."""
    r = c.js("""const bar = document.getElementById('ridebar'); if (!bar || bar.hidden) return { bar: false };
      const nx = document.querySelector('#rb-next strong'), st = api.rideStrip && api.rideStrip();
      return { bar: true, next: nx ? nx.textContent : '', size: nx ? parseFloat(getComputedStyle(nx).fontSize) : 0,
               stops: st && st.stops ? st.stops.length : 0, f: st ? st.f : null };""")
    if not r['bar']:
        c.finding('error', 'missing', 'riding, but the line diagram is not showing')
        return
    if r['f'] is None:
        c.finding('warn', 'flow', 'the line diagram has nothing to draw for this line (no position along it)')
    if r['stops'] and not r['next']:
        c.finding('warn', 'flow', 'the line has stops but the ride bar names no next stop')


def board_in_cut(c):
    """Open the cut-away, then tap a train in the open cut (underground cars board only there)."""
    clean(c)
    c.tap('#cut')
    c.wait(2900)
    c.js('U.fold(false)')
    p = c.js("return U.findPick('car', 10);")
    if not p:
        c.finding('info', 'flow', 'no train in sight in the cut-away to tap')
        return
    c.tap((p['x'], p['y']))
    c.wait(1500)


def transit_folded(c):
    c.js("api.flyTo(api.views.find(v => v.id === 'city') ? 'city' : 'home');")
    c.wait(300)
    clean(c)
    c.tap('#transit')
    c.wait(400)
    c.js('U.fold(false)')


PHL = ['phl']

STATES = [
    {'name': 'bridges', 'fold': 'folded', 'desc': 'the East River bridges view (labels over water)',
     'setup': "api.flyTo('bridges');", 'settle': 2800},
    # the ride bar on lines short and long (New York; the first line in the picker, `riding`, is the monorail loop)
    {'name': 'ride-6', 'desc': 'riding the 6 (19 stops) from the picker: next stop and nearby stops',
     'setup': lambda c: ride(c, '6 ·'), 'settle': 2500, 'check': check_bar},
    {'name': 'ride-f', 'desc': 'riding the F (45 stops, Jamaica to Coney Island): the longest diagram',
     'setup': lambda c: ride(c, 'F ·'), 'settle': 2500, 'check': check_bar},
    {'name': 'ride-a', 'desc': 'riding the A (long stop names: Ozone Park-Lefferts Blvd)',
     'setup': lambda c: ride(c, 'A ·'), 'settle': 2500, 'check': check_bar},
    {'name': 'cut-board', 'cities': ['nyc', 'phl'], 'desc': 'the cut-away (Times Square, Market St), then tapped a train in the open cut',
     'setup': board_in_cut, 'settle': 1200},
    {'name': 'transit-folded', 'cities': ['nyc', 'phl'], 'desc': '"Show transit lines", then the panel folded to see the map: the legend strip',
     'when': 'api.legend.length', 'setup': transit_folded, 'settle': 2500},
    # Philadelphia's rides (the bar, picker and legend are shared; `riding` there is the riverfront loop)
    {'name': 'phl-ride-l', 'cities': PHL, 'desc': 'Philadelphia: riding the L (Market–Frankford, 26 stops)',
     'setup': lambda c: ride(c, 'L ·'), 'settle': 2500, 'check': check_bar},
    {'name': 'phl-ride-rr', 'cities': PHL, 'desc': 'Philadelphia: riding the Chestnut Hill East Regional Rail line',
     'setup': lambda c: ride(c, 'Chestnut Hill East'), 'settle': 2500, 'check': check_bar},
    {'name': 'phl-ride-t1', 'cities': PHL, 'desc': 'Philadelphia: riding the T1 trolley (48 stops, long street-corner names)',
     'setup': lambda c: ride(c, 'T1'), 'settle': 2500, 'check': check_bar},
    {'name': 'phl-ride-shuttle', 'cities': PHL, 'desc': 'Philadelphia: the Schuylkill sports-park shuttle (end to end, unnamed stations)',
     'setup': lambda c: ride(c, 'Schuylkill line'), 'settle': 2500, 'check': check_bar},
    {'name': 'phl-ride-boat', 'cities': PHL, 'desc': 'Philadelphia: the Delaware River taxi',
     'setup': lambda c: ride(c, 'Delaware River taxi'), 'settle': 2500, 'check': check_bar},
]
