# Layer 2: Language and type safety

Research date: 2026-11-13. Nothing here has been executed; see [SUMMARY.md](SUMMARY.md).

## The need

**What the code does today.** 56 plain JavaScript ES modules, 15,000 lines, no type checking
of any kind (`git ls-files 'js/*' | xargs wc -l`). There are 262 `/** ... */` comment blocks and
none of them carries a typed tag: `grep -rhoE '@(param|returns?|type|typedef)\b' js` finds 0.
The style is dense: 2,167 lines are longer than 120 characters and the longest is 885.

Where types would pay off, with the places that have no safety net today:

| Untyped contract | Where it is defined | Where it is consumed |
| --- | --- | --- |
| The shape of every data file (documented in prose in [docs/EDITING.md](../EDITING.md)) | Python writers in `tools/<city>/` | `data.b`, `city.limits`, `data.cityBuildings` and so on across `js/scene/*.js` |
| The city config object | [js/cities.js](../../js/cities.js) (`CITIES`, 4 entries with different optional keys: `kitchen`, `grid`, `sea`, `presets`) | `CITY.frame`, `CITY.files`, `CITY.home` in most scene modules |
| The scene API returned by `buildScene` | [js/scene/index.js](../../js/scene/index.js) | [js/ui.js](../../js/ui.js), [js/minimap.js](../../js/minimap.js), [js/ridebar.js](../../js/ridebar.js), and as `window.__city` by [tools/perf/scenarios.py](../../tools/perf/scenarios.py) and [tools/ux/audit.js](../../tools/ux/audit.js) |
| Binary layouts (PHB1 header, terrain grids) | `tools/phl/build_city.py`, `tools/phl/build_terrain.py`, `tools/nyc/import_nyc.py` | [js/scene/city.js:22](../../js/scene/city.js), [js/scene/terrain.js:19](../../js/scene/terrain.js), [js/scene/jsh/terrain.js:21](../../js/scene/jsh/terrain.js) |
| three.js API across upgrades | `three` | 48 modules |

**What we would gain.** Errors at edit time when a data key, a config key or a three.js method
is wrong; editor completion for three.js; a checked `window.__city` surface for the QA tools.

**What rules an option out.** Anything that needs a runtime other than the browser; anything
that stops [tools/perf](../../tools/perf/README.md) from attributing time and draw calls to
`file:line` in our sources; a checker without releases or without types for our three.js version.

## Candidates

There are few real alternatives in this layer, so the list is short.

| Option | What it is | Status (2026-11-13) | Verdict |
| --- | --- | --- | --- |
| Plain JS | Today | n/a | Baseline |
| JS + JSDoc types + `tsc --checkJs` | Types in comments, checked by TypeScript, no syntax change | Supported, but TypeScript 7 narrowed its JSDoc handling (below) | Finalist |
| TypeScript (`.ts` files) | Type syntax, erased at build | `typescript` 7.0.2, published 2026-07-08 | Finalist |
| Flow | Meta's checker | No `@types/three` equivalent | Out: no three.js types |
| ReScript, Elm, Kotlin/JS and similar | Compile-to-JS languages | n/a | Out: a rewrite, and three.js interop by hand |
| TC39 "types as comments" proposal | Native type annotations | Not in browsers | Out: not shipped |

Package numbers (same sources as [layer 1](01-3d-engine.md)):

| Name | Version | Last release | Dependents (repos / pkgs) | Weekly downloads | Deps | Types | License | Maintenance signal |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [typescript](https://www.npmjs.com/package/typescript) | 7.0.2 | 2026-07-08 (7.1.0-beta on the `beta` tag) | 25,046,538 / 1,606,780 | 416,642,849 | 20 (platform binaries; only one installs) | n/a | Apache-2.0 | 6.0.2 on 2026-03-23, 6.0.3 on 2026-04-16, 7.0.2 on 2026-07-08; top contributor 12% of commits |
| [@types/three](https://www.npmjs.com/package/@types/three) | 0.187.0 | 2026-10-30 (same day as three 0.187.0) | † (DefinitelyTyped monorepo) | 23,896,872 | 6 | n/a | MIT | 12 releases in 12 months, tracking three's cadence |

- [socket.dev/npm/package/typescript](https://socket.dev/npm/package/typescript): supply chain
  99, vulnerability 100, quality 89, maintenance 100, license 100.
  [@types/three](https://socket.dev/npm/package/@types/three): 100 / 100 / 80 / 90 / 100.
- Neither has install scripts (registry `scripts`).
- `@types/three` 0.187.0 depends on `fflate`, `meshoptimizer`, `@tweenjs/tween.js`,
  `@dimforge/rapier3d-compat`, `@types/webxr` and `@types/stats.js` for the addon typings. These
  are dev-time only and never reach the bundle.

## What changed in TypeScript 7

From the [TypeScript 7.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
(section "JavaScript Differences"): the compiler was ported to native code, and "we have
reworked our JavaScript support to be more consistent with how we analyze TypeScript files".
Listed differences include: values can't be used where types are expected (write
`typeof someValue`), `@enum` is no longer recognised, a standalone `?` is not a type, `@class`
does not make a function a constructor, and postfix `!` is not supported.

The same post lists options that are now hard errors: `target: es5`, `moduleResolution: node`
and `classic`, `module: amd/umd/systemjs/none`, and `baseUrl`. For us that means
`moduleResolution: "bundler"` and `module: "esnext"` or `"preserve"`.

Effect on the choice: JSDoc checking still works, and we use none of the removed Closure-style
forms (we have no typed tags at all). But the direction is clear: JS files are now checked like
TS files, with the comment syntax as a thin layer over it.

## Vetting the finalists against our code

**JS + JSDoc + `tsc --checkJs`**
- No file is renamed and nothing is transformed, so the sources still run unbuilt and
  `tools/perf`'s `file:line` attribution ([tools/perf/perf.py:42-51](../../tools/perf/perf.py),
  which parses `new Error().stack`) keeps working as it does today.
- Shared shapes (data files, `CITY`, the scene API) can live in `.d.ts` files and be imported
  with `/** @import { PhlData } from './types' */`.
- Cost: annotations are comments, which is verbose in a codebase that packs several statements
  per line. A function like `buildCity(scene, data, { waterMat, status, clear, sea, core })`
  ([js/scene/city.js:62](../../js/scene/city.js)) needs a multi-line comment block per parameter
  object.

**TypeScript files**
- Inline annotations suit the dense style better than comment blocks.
- Needs a transform step. With Vite (layer 3) that is built in: no extra package, types are
  stripped by the bundler. Node 24, which both this machine and Cloudflare's build image run
  (`node -v`; [build image doc](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)),
  can also run erasable-syntax `.ts` directly for small scripts and tests.
- `tools/bundle.py` cannot handle it: it finds imports and exports with regular expressions over
  the JS sources ([tools/bundle.py:17-20](../../tools/bundle.py)). This choice depends on the
  single-file decision in layer 3.
- `tools/perf` serves source folders directly and maps stacks to `file:line`. With `.ts` it has
  to measure either the Vite dev server or the built output, and resolve positions through
  source maps. That is harness work that layer 3 already requires (see its fit check).

## Fit check

| Finalist | Files touched | Effort (rough days) | Deploy change |
| --- | --- | --- | --- |
| JSDoc + `checkJs` | New `tsconfig.json` and `js/types/*.d.ts`; comment edits across `js/` | 0.5 to start (config, `@types/three`, typed data and `CITY` shapes); then file by file. Reaching `strict` across 56 files: 5 to 8, unverified | Optional: add `tsc --noEmit` to the build command. No output change |
| TypeScript | The same, plus renaming 56 files and their import paths, `tools/bundle.py` retired or replaced, `tools/perf` and `tools/ux` reading source maps | 1 for the mechanical rename behind `allowJs`; then the same 5 to 8 to reach `strict`; plus 1 to 2 for the harness | Requires the layer 3 build. `tsc --noEmit` in the build command |

No performance claim is attached to this layer. Types are erased; the check that it changed
nothing at runtime is `python -I tools/perf/perf.py ab --quick --shots` (expect "not
significant" on every metric and identical screenshots).

Type-checking the QA tools: `window.__city` is the contract between the app and
[tools/perf/scenarios.py](../../tools/perf/scenarios.py) (`api.flyTo`, `api.setTime`,
`api.boardLine`, `api.setCut`, `api.setFly` ...). Exporting its type from `js/scene/index` lets
`tsc` flag a rename that would otherwise show up as a perf run that times out.

## Recommendation

**TypeScript 7 with `@types/three`, adopted in two stages.**

1. **Stage A, with or without a build:** `tsconfig.json` with `allowJs`, `checkJs`, `noEmit`,
   `moduleResolution: "bundler"`. Write the shared shapes once as `.d.ts`: the data files per
   city, `CITY`, and the scene API. This is the JSDoc option, and it gets most of the value for
   about half a day.
2. **Stage B, after layer 3 lands:** rename files to `.ts` a folder at a time, leaf modules
   first (`data`, `cities`, `geometry`, `season`), with `erasableSyntaxOnly` so the output is
   the input minus types. Turn on `strict` per folder.

**Runner-up:** stop at stage A (JS + JSDoc + `checkJs`). Choose it if we decide in layer 3 to
keep the no-build setup or to keep `tools/bundle.py` as is.

## Risks

- **Annotation noise in dense code.** Adding types to 800-character lines will make them longer.
  This pairs with the formatter decision in [layer 7](07-quality-tooling.md).
- **`@types/three` lags or disagrees with three.** It shipped the same day as three 0.187.0 this
  time. Pin both to the same version and bump them together.
- **First run noise.** `checkJs` on 15,000 untyped lines will report many errors. Start with
  `strict: false` and a per-file `// @ts-check` opt-in, then widen.
- **Private three.js access.** [js/three-setup.js:37](../../js/three-setup.js) reads
  `__webglTexture`, which the typings don't declare. Keep the cast in that one file.
- **TypeScript 7 is four months old.** 7.0.2 is the only stable 7.x release so far
  (`https://registry.npmjs.org/typescript`, `time`). Editor and tool integrations are still
  catching up; check that the editor in use runs the 7.x language service.

## Migration steps

1. Add `typescript` and `@types/three` (matching the three version) as dev dependencies.
2. Add `tsconfig.json` (`allowJs`, `checkJs: false`, `noEmit`, `moduleResolution: "bundler"`,
   `module: "preserve"`, `target: "es2022"`, `lib: ["es2023", "dom"]`).
3. Write `js/types/data.d.ts` from [docs/EDITING.md](../EDITING.md), `js/types/city.d.ts` from
   [js/cities.js](../../js/cities.js), and the scene API type.
4. Add `// @ts-check` to `data.js`, `cities.js`, `scene/geometry.js`, `scene/season.js`, fix
   what it reports, and add `tsc --noEmit` to the checks ([layer 7](07-quality-tooling.md)).
5. Widen file by file. After layer 3: rename to `.ts` per folder and enable `strict` there.
6. Once every file is checked, set `checkJs: true` globally and remove the per-file comments.
