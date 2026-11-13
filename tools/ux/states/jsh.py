"""Jersey Shore's own UI states (run with -c jsh). See common.py for the state format."""

AUTUMN = "api.setDay(300); api.setTime(12); document.getElementById('time').value = 12;"
JULY = "api.setDay(190); api.setTime(9); document.getElementById('time').value = 9;"


def car(c):
    return c.js("const k = api.getCar(); return k && { kind: k.kind, id: k.id, now: k.now || null, bino: k.bino || 0 };")


def to_overlook(c, setup=AUTUMN):
    c.js(setup + " api.flyTo('ridge');")
    c.wait(3200)


def tap_hunter(c, setup=AUTUMN):
    to_overlook(c, setup)
    p = c.js("return U.findPick('hunter', 10);")
    if not p:
        c.finding('error', 'flow', 'the hunter is not on screen at the overlook')
        return False
    c.tap((p['x'], p['y']))
    c.wait(1200)
    k = car(c)
    if not k or k['id'] != 'hunter':
        c.finding('error', 'flow', f'tapping the hunter did not put you in his chair ({k})')
        return False
    return True


def binoculars(c):
    if tap_hunter(c):
        c.tap('#actions button:last-child')   # "Check out the view"
        c.wait(2500)


def act(n, wait=1300):
    def setup(c):
        if tap_hunter(c):
            c.tap(f'#actions button:nth-child({n})')
            c.wait(wait)
    return setup


def check_now(word):
    def check(c):
        k = car(c)
        now = c.js("return document.getElementById('pe-now').textContent;")
        if not k or word not in (k['now'] or ''):
            c.finding('error', 'flow', f'the action did not start: "{k and k["now"]}"')
        elif word not in now:
            c.finding('error', 'flow', f'the card\'s "Now" did not follow: "{now}"')
    return check


def zoom(c):
    binoculars(c)
    c.wait(2000)   # the pan and the zoom to what's worth seeing settle
    c.state0 = c.js('return api.camera.fov;')
    w, h = c.device['viewport']
    c.pinch(w * .6, h * .62, 50, min(w, h) * .4)   # (right and low: clear of a tablet's open panel, which would take a finger)
    c.wait(1500)


def check_zoom(c):
    a, b = c.state0, c.js('return api.camera.fov;')
    if b > a * .9:
        c.finding('error', 'gesture', f'spreading two fingers over the binoculars did not zoom in (field of view {a:.2f} → {b:.2f}°)')


def leave_hunter(c):
    if tap_hunter(c):
        c.tap('#getoff')   # "Leave": back behind his chair
        c.wait(900)


def check_leave_hunter(c):
    k = car(c)
    if not k or k['kind'] != 'vista':
        c.finding('error', 'flow', f'"Leave" did not put you back behind the chair ({k})')
    if c.js("return !document.getElementById('persona').hidden;"):
        c.finding('error', 'flow', "his card is still showing after leaving him")


def step_away(c):
    to_overlook(c)
    c.tap('#getoff')   # "Step away"
    c.wait(900)


def check_step_away(c):
    if car(c):
        c.finding('error', 'flow', '"Step away" did not leave the overlook')


def eyes_button(c):
    to_overlook(c)
    c.tap('#actions button:first-child')   # "See through his eyes", for whoever can't find him to tap
    c.wait(1200)


def check_eyes(c):
    k = car(c)
    if not k or k['id'] != 'hunter':
        c.finding('error', 'flow', f'"See through his eyes" did not put you in his chair ({k})')
    elif c.js("return document.getElementById('persona').hidden;"):
        c.finding('error', 'flow', "in his chair, but his card did not come up")


def fold_card(c):
    if tap_hunter(c):
        c.tap('#pe-fold')
        c.wait(400)


def check_fold_card(c):
    if c.js("return !document.getElementById('pe-bio').offsetParent;") is not True:
        c.finding('error', 'flow', 'folding the card left the bio showing')


def then_open(setup):
    """setup, then open the panel (it folds itself on a phone after you tap someone) to read the hint"""
    def run(c):
        setup(c)
        c.js('U.fold(true)')
        c.wait(300)
    return run


def crew(c):
    c.js(JULY + " api.flyTo('crew');")
    c.wait(3000)


def crew_person(c):
    crew(c)
    p = c.js("return U.findPick('person', 8);")
    if not p:
        c.finding('error', 'flow', 'no one on the detasseling crew is on screen to tap')
        return
    c.tap((p['x'], p['y']))
    c.wait(1200)


def check_crew_person(c):
    k = car(c)
    if not k or k['kind'] != 'person':
        c.finding('error', 'gesture', 'tapping one of the crew did not put you in their shoes')
        return
    hint = c.js("return document.getElementById('hint').textContent;")
    if 'Walnut' in hint:
        c.finding('error', 'flow', f'the hint for the crew talks about Philadelphia: "{hint[:80]}…"')


STATES = [
    {'name': 'overlook', 'desc': 'standing behind Mr. Kepner at Bald Eagle Vista (harvest season)',
     'setup': AUTUMN + " api.flyTo('ridge');", 'settle': 3200},
    {'name': 'overlook-hint', 'fold': 'open', 'desc': 'standing at the overlook with the panel open: the hint',
     'setup': AUTUMN + " api.flyTo('ridge');", 'settle': 3200},
    {'name': 'hunter', 'desc': "tapped the hunter: his card and the things to do (drag, beer, binoculars)",
     'setup': tap_hunter, 'settle': 600},
    {'name': 'hunter-hint', 'desc': "in the hunter's chair with the panel open: the hint, the card, the actions",
     'setup': then_open(tap_hunter), 'settle': 600},
    {'name': 'hunter-eyes', 'desc': 'standing at the overlook, tapped "See through his eyes" instead of him',
     'setup': eyes_button, 'check': check_eyes, 'settle': 400},
    {'name': 'hunter-card-folded', 'devices': ['phone-sm', 'phone', 'phone-land'], 'desc': "his card folded down to his name and what he's doing",
     'setup': fold_card, 'check': check_fold_card, 'settle': 300},
    {'name': 'hunter-drag', 'desc': 'as the hunter: tapped "Take a drag"',
     'setup': act(1), 'check': check_now('drag'), 'settle': 300},
    {'name': 'hunter-drink', 'desc': 'as the hunter: tapped "Drink beer"',
     'setup': act(2), 'check': check_now('Drinking'), 'settle': 300},
    {'name': 'binoculars', 'desc': "through the hunter's binoculars: the mask and the caption",
     'setup': binoculars, 'settle': 600},
    {'name': 'binoculars-zoom', 'desc': 'through the binoculars: spread two fingers (the wheel on a desktop) to zoom in',
     'setup': zoom, 'check': check_zoom, 'settle': 300},
    {'name': 'hunter-leave', 'desc': 'as the hunter, tapped "Leave": back behind his chair',
     'setup': leave_hunter, 'check': check_leave_hunter, 'settle': 300},
    {'name': 'step-away', 'desc': 'standing at the overlook, tapped "Step away"',
     'setup': step_away, 'check': check_step_away, 'settle': 300},
    {'name': 'hunter-night', 'desc': "in the hunter's chair at 9 PM: the card and the actions on a dark view",
     'setup': lambda c: tap_hunter(c, "api.setDay(300); api.setTime(21); document.getElementById('time').value = 21;"), 'settle': 600},
    {'name': 'crew', 'desc': 'the detasseling crew in July, 9 AM (trash bags against the dew): "Go to: Detasseling crew"',
     'setup': crew, 'settle': 300},
    {'name': 'crew-person', 'desc': 'tapped one of the detasseling crew: their card and the hint',
     'setup': crew_person, 'check': check_crew_person, 'settle': 500},
    {'name': 'crew-person-hint', 'desc': 'one of the crew, with the panel open: the hint',
     'setup': then_open(crew_person), 'check': check_crew_person, 'settle': 500},
    {'name': 'corn-july', 'desc': '"Go to: Corn fields" in July',
     'setup': JULY + " api.flyTo('farms');", 'settle': 3000},
    {'name': 'corn-harvest', 'desc': '"Go to: Corn fields" in late October (the harvest)',
     'setup': AUTUMN + " api.flyTo('farms');", 'settle': 3000},
    {'name': 'pine-creek', 'desc': '"Go to: Pine Creek"',
     'setup': "api.flyTo('pinecreek');", 'settle': 3000},
]

