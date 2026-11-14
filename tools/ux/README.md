# UI/UX harness

`ux.py` drives the real app in Chromium as phones, a tablet and a desktop, puts it in each UI
state (start menu, loading screen, panel open and folded, ride picker, riding, transit legend,
cut-away, the people you can see through, the dialogs and games, touch gestures), and for
every screen:

- **measures** the interface with `audit.js` (below);
- saves a **screenshot** (`<state>.png`) and an **annotated** one (`<state>.ann.png`) with
  every finding outlined and numbered;
- writes `summary.md`, `report.json` and a contact sheet, `index.html` (states × devices).

It reuses the perf harness's sides (the working tree or `--ref` built in perf mode, see "Sides" in
[tools/perf/README.md](../perf/README.md)), server, CDN cache and GPU flags (`tools/perf/perf.py`), and the
same deterministic seed and date, so two runs of the same code give the same pictures.

## Setup

Python 3.12 with Playwright and its Chromium, from the `qa` group of the repo's uv environment
(see "Run it" in [README.md](../../README.md)):

```bash
uv sync --group qa
```

```bash
uv run python -m playwright install chromium
```

## Commands

```bash
uv run python -I tools/ux/ux.py list
```

```bash
uv run python -I tools/ux/ux.py run -c phl -d phone,phone-land --label before
```

```bash
uv run python -I tools/ux/ux.py run -c jsh -d phone -s hunter,binoculars
```

```bash
uv run python -I tools/ux/ux.py compare tools/ux/out/<before> tools/ux/out/<after> --detail
```

| option | |
|---|---|
| `-c phl,nyc,jsh` | cities (default all three). Run one city per process; several processes can run at once |
| `-d phone,…` | devices (default `phone-sm,phone,phone-land,tablet,desktop`; also `android`) |
| `-s a,b` | only these states (`list` names them) |
| `--label x` | output folder suffix: `tools/ux/out/<time>-x/` |
| `--settle ms` | wait after each setup (default 700; states set their own) |
| `--headed --keep-open` | watch it, and pause after each device to poke around |
| `--no-annotate` | clean screenshots only |

`compare` lists the screens whose errors, warnings or chrome % changed, then the share of
changed pixels for every screen in both runs (a channel off by more than 8 of 255; needs
Pillow), with `diff/<city>/<device>/<state>.png` in the second run's folder marking them red.
Rides and anything moving differ between two runs of the same code, so read the shares
against a same-code pair, not against zero.

One device takes the city's load (2–20 s) plus about 1–4 s per state. A full city on five
devices is a few minutes. While iterating, run just the states and devices you are changing.

## Devices

Viewports are the *visible* area with the browser's toolbars showing (what `innerWidth` and
`innerHeight` report), from Playwright's device list. Touch devices run with `isMobile` and
`hasTouch`, so `(pointer: coarse)` and `(hover: none)` match and taps are real touch events.

| name | viewport | |
|---|---|---|
| `phone-sm` | 375×548 | iPhone SE, the smallest phone worth supporting |
| `phone` | 393×659 | iPhone 15 portrait |
| `phone-land` | 734×343 | iPhone 15 landscape: wide but very short |
| `android` | 412×839 | Pixel 7 |
| `tablet` | 768×1024 | iPad Mini portrait |
| `desktop` | 1440×900 | mouse; the regression check |

Not emulated: safe-area insets (the notch and home bar: `env(safe-area-inset-*)` is 0 in
Chromium), Safari's collapsing toolbars, real GPU speed on phones.

## What the audit measures (`audit.js`)

Chrome = the UI panels: `.hud .card`, `#minimap`, `#ridebar`, `#actions`, `#persona`,
`#credit`, the dialogs' cards, and any other visible `position: fixed` box smaller than the
screen (so new panels are picked up automatically).

| kind | severity | what |
|---|---|---|
| `panel-offscreen` | error | a panel runs off the screen and can't be scrolled to |
| `overlap` | error (>15% of the smaller) / warn | two panels on top of each other |
| `offscreen` | error (>50%) / warn | a control is off the screen, and no scroll box brings it in |
| `occluded` | error | the centre of a control is covered by something else (it can't be tapped) |
| `small-target` | error (<24 px) / warn (<44 px on touch) | WCAG 2.5.8 minimum 24 px; Apple and Material ask 44–48 on touch |
| `small-text` | warn (<10.5 px) / info (<12 px) | |
| `truncated` | warn | text cut off by an ellipsis or a clipped box |
| `h-scroll` | error | the page scrolls sideways |
| `desktop-copy` | warn | on touch screens: wording like right-click, W A S D, Esc, scroll, mouse, click |
| `label-clutter` | warn | many floating labels overlap each other |
| `coverage` | warn | the panels cover more than half of the view (not counted while a dialog is open) |
| `touch-gap` | warn | (state checks) no on-screen way to do something touch users need |
| `gesture`, `flow`, `missing`, `unreachable` | error | (state checks) a tap or gesture didn't do what it should |

Metrics per screen: `chromePct` (share of the view under panels), visible controls, labels,
label overlaps, labels under panels and off the edge.

When a finding is intended (a hint deliberately clamped to three lines with a "More"
button, say), mark the element or an ancestor with `data-ux-ok="truncated"` (space-separated
kinds). Use it sparingly and say why in a comment next to it.

## Adding a state

States live in `states/common.py` (every city) and `states/<city>.py` (that city only; the
file name sets the city). Each is a dict; `common.py`'s docstring documents the fields. A
setup can be JS (an async function body with `api` = `window.__city`, `U` = `window.__ux`
and `sleep`) or a Python function taking a `Ctx`:

- `c.tap('#ride')` or `c.tap((x, y))`: a real touch tap (mouse click on the desktop). It first
  scrolls the element's scroll boxes (the panel, a dialog) to it, as a finger would, but never
  the page. If the element is missing, off the screen or covered, it records a finding (and
  clicks it from script, so later states still run).
- `c.drag(x0, y0, x1, y1, fingers=1)`, `c.pinch(cx, cy, d0, d1)`: touch gestures via CDP.
- `c.js(body)`, `c.wait(ms)`, `c.cam()` (camera position, distance and azimuth),
  `c.finding(sev, kind, msg)`.
- `U.findPick(kind)` finds a screen point over something tappable: `car`, `person`, `seat`,
  `hunter`, `angler`, `stall`. `U.fold(true|false)` opens or folds the panel.

Before every state `__ux.reset()` leaves any car, closes the dialogs and the ride picker,
and turns transit, the cut-away and hidden labels back. The camera is not reset: fly
somewhere in the setup if the view matters.

## Workflow

1. Baseline: `run -c <city> --label before`. Read `summary.md`, then open the `.ann.png`
   of the worst screens (or `index.html` in a browser to see them all side by side).
2. Change `css/`, `js/`, `index.html`. Check by eye, not just by the numbers: an outline that
   went away because something got hidden is not a fix.
3. `run` again with the same cities, devices and states, then `compare <before> <after>
   --detail`. Errors should go down without new ones; desktop must not get worse.
