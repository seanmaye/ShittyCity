# Layer 6: UI layer

Research date: 2026-11-13. Nothing here has been executed; see [SUMMARY.md](SUMMARY.md).

## The need

**What the code does today.** The interface is static HTML with hand-written DOM code:

- All HUD markup is in [index.html](../../index.html) (81 lines, 11,638 B): the panel, sliders,
  minimap, ride bar, persona card, restaurant card, loading screen and start menu, each with an
  `id`.
- JavaScript looks elements up by id and updates them imperatively. Counts per file
  (`grep -o` for each pattern):

  | File | Lines | `createElement` | id lookups | `addEventListener` | `innerHTML` | Direct state writes (`.hidden =`, `classList`, `textContent`, `setAttribute`) |
  | --- | --- | --- | --- | --- | --- | --- |
  | [js/ui.js](../../js/ui.js) | 578 | 26 | 56 | 46 | 1 | 122 |
  | [js/main.js](../../js/main.js) | 100 | 4 | 19 | 3 | 0 | 21 |
  | [js/ridebar.js](../../js/ridebar.js) | 128 | 10 | 6 | 0 | 0 | 23 |
  | [js/minimap.js](../../js/minimap.js) | 115 | 1 | 6 | 5 | 1 | 5 |
  | [js/loading.js](../../js/loading.js) | 342 | 3 | 1 | 0 | 0 | 5 |
  | [js/scene/pine/kitchen.js](../../js/scene/pine/kitchen.js) (its own panel) | 785 | 30 | 3 | 17 | 4 | 38 |
  | [js/arcade.js](../../js/arcade.js), [js/fishing.js](../../js/fishing.js) (canvas games in dialogs) | 524, 440 | 1, 1 | 0 | 16, 14 | 0 | 24, 23 |

- Two parts are not ordinary UI and no library would take them over: the floating labels are
  repositioned from the camera every frame (`ui.placeTags`, called from the render loop at
  [js/main.js:78](../../js/main.js)), and the minimap, ride-bar diagram, arcade and fishing games
  draw to canvas or SVG.
- 7 `localStorage` call sites hold per-city preferences.
- **The QA harness depends on this structure.** [tools/ux/audit.js](../../tools/ux/audit.js)
  finds panels by selector (`.hud .card`, `#minimap`, `#ridebar`, `#actions`, `#persona`,
  `#credit`; see [tools/ux/README.md](../../tools/ux/README.md)), the state scripts tap `#ride`
  and friends, and `data-ux-ok` attributes in the markup suppress known findings
  ([index.html:29](../../index.html)).

**What we would gain.** Less hand-synchronised state. Today, when riding starts, several
elements are toggled by separate statements; the risk is forgetting one. A reactive layer would
make each element a function of state.

**What rules an option out.** A runtime larger than the code it removes; needing a compiler
plugin; rendering the per-frame labels through a virtual DOM (the perf README already tracks
style and layout cost per second for them); changing the ids and selectors `tools/ux` relies on
without a matching harness change; the section 4 disqualifiers.

## Candidates

Same sources as [layer 1](01-3d-engine.md). Gzip is bundlephobia's min+gzip for the package
entry.

| Name | Version | Last release | Dependents (repos / pkgs) | Weekly downloads | Gzip | Deps | Types | License | Maintenance signal | Fit notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Vanilla DOM (today) | n/a | n/a | n/a | n/a | 0 | 0 | via `lib.dom` | n/a | n/a | No change. Types from [layer 2](02-language-types.md) catch wrong ids if lookups go through one typed helper |
| [@preact/signals-core](https://www.npmjs.com/package/@preact/signals-core) | 1.14.5 | 2026-10-27 | † (monorepo) | 15,227,790 | 2,168 | 0 | yes | MIT | 8 releases in 12 months; provenance; 6 npm maintainers; top contributor 23% | State only: `signal`, `computed`, `effect`. DOM stays ours |
| [alien-signals](https://www.npmjs.com/package/alien-signals) | 3.2.1 | 2026-05-14 | 111,142 / 210 | 13,913,954 | 1,950 | 0 | yes | MIT | 4 releases in 12 months; 1 npm maintainer | State only. Lower-level API |
| [nanostores](https://www.npmjs.com/package/nanostores) | 1.5.5 | 2026-10-06 | 35,608 / 733 | 20,059,104 | 2,374 | 0 | yes | MIT | 13 releases in 12 months; provenance; 1 npm maintainer | Stores with `subscribe`; no automatic dependency tracking |
| [@vue/reactivity](https://www.npmjs.com/package/@vue/reactivity) | 3.5.45 | 2026-11-05 | † | 24,482,170 | 7,369 | 1 | yes | MIT | 21 releases in 12 months | State only; largest of the state-only options |
| [signal-polyfill](https://www.npmjs.com/package/signal-polyfill) | 0.2.2 | 2025-01-17 | 2,051 / 128 | 975,258 | 2,698 | 0 | yes | Apache-2.0 | 0 releases in 12 months; last push 2025-02-13 | Polyfill of the TC39 Signals proposal |
| [lit](https://www.npmjs.com/package/lit) | 3.3.3 | 2026-05-14 | 195,061 / 12,257 | 9,580,877 | 6,024 | 3 | yes | BSD-3-Clause | 2 releases in 12 months; provenance; 8 npm maintainers; top contributor 31% | Web components with tagged-template rendering |
| [lit-html](https://www.npmjs.com/package/lit-html) | 3.3.3 | 2026-05-14 | (same repo) | 9,537,526 | 3,214 | 1 | yes | BSD-3-Clause | same | Templates only, no components |
| [preact](https://www.npmjs.com/package/preact) | 11.2.0 | 2026-11-06 | 979,745 / 7,281 | 57,388,262 | 5,021 | 0 | yes | MIT | 22 releases in 12 months; 37 open issues; provenance; top contributor 26% | Components and virtual DOM. JSX needs a transform; `htm` avoids it |
| [htm](https://www.npmjs.com/package/htm) | 3.1.1 | 2022-04-26 | 37,929 / 713 | 2,594,783 | 744 | 0 | yes | Apache-2.0 | No release since 2022 | JSX-like tagged templates for Preact |
| [solid-js](https://www.npmjs.com/package/solid-js) | 1.9.19 | 2026-11-10 | 87,158 / 6,044 | 11,301,127 | 8,597 | 3 | yes | MIT | 9 releases in 12 months; top contributor 80% | Fine-grained reactivity. Needs its compiler plugin |
| [svelte](https://www.npmjs.com/package/svelte) | 5.57.3 | 2026-10-26 | 433,935 / 18,820 | 9,399,332 | 10,774 | 15 | yes | MIT | 90 releases in 12 months | Compiler and `.svelte` files |
| [alpinejs](https://www.npmjs.com/package/alpinejs) | 3.17.5 | 2026-10-20 | 318 / 6 † | 939,486 | 19,083 | 1 | no | MIT | 21 releases in 12 months | Behaviour in HTML attributes |
| [vanjs-core](https://www.npmjs.com/package/vanjs-core) | 1.6.2 | 2026-11-01 | 329 / 69 | 5,127 | 1,228 | 0 | yes | MIT | 2 releases in 12 months; top contributor 73% | Tiny reactive DOM builder |
| [petite-vue](https://www.npmjs.com/package/petite-vue) | 0.4.1 | 2022-01-18 | 352 / 27 | 9,277 | 6,963 | 0 | yes | MIT | No release since 2022 | |
| [mithril](https://www.npmjs.com/package/mithril) | 2.3.8 | 2025-11-08 | 8,778 / 517 | 32,021 | 9,544 | 0 | no | MIT | 0 releases in 12 months | |
| [uhtml](https://www.npmjs.com/package/uhtml) | 5.0.9 | 2025-08-06 | 618 / 99 | 28,854 | 6,527 | 1 | yes | MIT | 0 releases in 12 months | |
| [redom](https://www.npmjs.com/package/redom) | 4.3.0 | 2025-01-17 | 972 / 74 | 2,687 | 4,022 | 0 | yes | MIT | 0 releases in 12 months | |

## Cut

- **petite-vue, redom, signal-polyfill, htm**: no release in 18+ months (2022-01, 2025-01,
  2025-01, 2022-04). `signal-polyfill` is also tied to a proposal that has not shipped.
- **mithril, alpinejs**: no built-in types. Alpine also moves logic into HTML attributes, away
  from the type checker, and is the largest runtime in the table (19,083 B).
- **svelte, solid-js**: both need a compiler step and their own file or syntax conventions for a
  UI of this size.
- **vanjs-core**: 5,127 weekly downloads and one main author.
- **uhtml**: no release in 15 months, low adoption.
- **@vue/reactivity, nanostores, alien-signals**: workable state layers, each a weaker fit than
  `@preact/signals-core` (larger; no automatic tracking; lower-level API, respectively).

Finalists: **stay vanilla**, **`@preact/signals-core` alone**, **Preact with signals**, **Lit**.

## Vetting

**@preact/signals-core 1.14.5**
- [socket.dev](https://socket.dev/npm/package/@preact/signals-core): supply chain 100,
  vulnerability 100, quality 99, maintenance 92, license 100. No install scripts, zero
  dependencies, provenance attested.
- 2,168 B gzip. Framework-independent: it does not need Preact.

**Preact 11.2.0**
- [socket.dev](https://socket.dev/npm/package/preact): 100 / 100 / 100 / 99 / 100. Zero
  dependencies, provenance, 37 open issues against 979,745 dependent repositories.
- 5,021 B gzip, plus the signals integration package (size not pulled; unverified).
- Without JSX it needs `htm` (cut above) or hand-written `h()` calls. With JSX it needs the
  transform Vite provides, which ties this choice to [layer 3](03-build-dev-server.md).

**Lit 3.3.3**
- [socket.dev](https://socket.dev/npm/package/lit): 100 / 100 / 92 / 87 / 100. Backed by a team
  (8 npm maintainers), slow cadence (2 releases in 12 months).
- 6,024 B gzip. Components render into shadow DOM by default, which hides their internals from
  `document.querySelector`. [tools/ux/audit.js](../../tools/ux/audit.js) and our single
  stylesheet ([css/style.css](../../css/style.css), 573 lines) both assume one light DOM.

## Fit check

| Finalist | Files touched | API vs our usage | Effort (rough days) | Deploy change |
| --- | --- | --- | --- | --- |
| Stay vanilla | None. Optionally one typed `$<T>(id)` helper replacing the per-file `const $ = id => document.getElementById(id)` ([js/main.js:11](../../js/main.js)) | n/a | 0 (0.5 for the helper) | None |
| `@preact/signals-core` | `js/ui.js` first (122 state writes become a smaller set of `effect`s); markup and ids unchanged, so `tools/ux` is unaffected | State becomes signals; DOM code stays | 2 to 4 for `ui.js`, unverified | +2,168 B gzip |
| Preact + signals | `index.html` (panel markup moves into components), `js/ui.js`, `js/ridebar.js`, `js/main.js` menu, kitchen panel; `tools/ux` state scripts if any id changes | Components replace `createElement` chains (26 in `ui.js`, 30 in `kitchen.js`) | 6 to 10, unverified | About +5 to 8 KB gzip; JSX transform |
| Lit | The same files, plus `css/style.css` split per component or light-DOM rendering forced; `tools/ux/audit.js` selectors | Custom elements | 8 to 12, unverified | +6,024 B gzip |

How much code each removes is unverified: nothing was ported. The counts above bound it. The
largest removable block is `ui.js`'s 122 direct state writes and the 56 `createElement` calls
across `ui.js` and `kitchen.js`. The per-frame label code, the canvas drawing and the event
wiring to the scene API stay whatever we choose.

Perf scenarios for any change here:

- `python -I tools/perf/perf.py ab --quick`: the **main** and **other JS** columns and
  "style/layout ms per second" must not rise. Labels are the sensitive part.
- `tools/ux/ux.py run` for all three cities and `compare` against the baseline run: no new
  findings, identical screenshots.

## Recommendation

**Stay vanilla.** The UI is about 1,260 lines across five files plus the kitchen panel, most of
its markup is static HTML, and the QA harness is built around that markup. No candidate offers a
measured reduction that outweighs a rewrite. Take the type-safety gain from
[layer 2](02-language-types.md) instead.

**Runner-up: `@preact/signals-core` as a state layer only**, tried first on one contained
module ([js/ridebar.js](../../js/ridebar.js), 128 lines, or the riding/transit/cut toggles in
`ui.js`). Adopt it more widely only if the trial removes code and passes the two checks above.

Not recommended: a component framework (Preact, Lit, Solid, Svelte) for a HUD of this size.

## Risks

- **Staying vanilla keeps the hand-sync risk.** Mitigation: TypeScript on `ui.js`, and the
  `tools/ux` state checks (`flow`, `missing`, `unreachable` findings) that already exercise each
  UI state.
- **A partial signals adoption leaves two styles in one file.** Keep the trial to whole modules.
- **Any markup change can invalidate `tools/ux` baselines.** Re-baseline in the same change.

## Migration steps

Only if the runner-up is trialled:

1. Baseline `tools/ux` for all cities and devices.
2. Add `@preact/signals-core` (exact version). Port `ridebar.js`: its inputs (line, next stop,
   position) become signals, its DOM updates become `effect`s. Keep every id.
3. Measure: lines before and after, `perf.py ab -s ride-L`, `ux.py compare`.
4. Decide from those numbers whether to continue into `ui.js`.
