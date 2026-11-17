# Layer 8: Hosting and delivery

Research date: 2026-11-13. Nothing here has been executed; see [SUMMARY.md](SUMMARY.md).
Cloudflare documentation pages were read on that date; each has a "Last updated" stamp between
2026-04-17 and 2026-11-12.

## The need

**What is deployed today.**

- A Cloudflare **Worker with static assets and no Worker script**. [wrangler.jsonc](../../wrangler.jsonc)
  is five lines: `name: "shittycity"`, `compatibility_date: "2026-11-01"`, and
  `assets.directory: "."`. The repository root is the asset directory.
- **Workers Builds** deploys every push to `main`. Evidence: each commit carries a GitHub check
  run "Workers Builds: shittycity" from the `cloudflare-workers-and-pages` app
  (`gh api repos/seanmaye/ShittyCity/commits/<sha>/check-runs`). It is not Cloudflare Pages.
- [.assetsignore](../../.assetsignore) keeps `city-models.html`, `.git`, `tools`, `docs`,
  `*.md`, `node_modules` and the config files out of the upload.
- What is served: 109 files (`git ls-files index.html css js data | wc -l`): `index.html`,
  1 stylesheet, 56 modules, 51 data files. The largest is `data/phl/terrain.bin.gz` at
  5,760,004 B.
- The page also loads from two third parties: three.js from jsDelivr and Archivo from Google
  Fonts ([index.html:8-15](../../index.html)).
- There is no `_headers` or `_redirects` file, so Cloudflare's defaults apply.

**Unverified** (dashboard-only settings, and the production URL is not recorded anywhere in the
repository): the build, deploy and preview commands as configured; whether build cache and
preview builds are on; the Workers plan (free or paid); the actual response headers in
production; the custom domain, if any. The defaults are in
[layer 3](03-build-dev-server.md)'s table.

**What we would gain.** Repeat visits that re-download nothing; one origin; a deploy pinned to
a known wrangler version; previews per branch for reviewing the refactor phases.

**What rules an option out.** A per-file limit below our largest file; a product Cloudflare is
steering users away from; cost for something that is free today; moving data somewhere that
needs its own deploy step without a reason.

## Limits against our files

| Limit | Value (Workers Free / Paid) | Ours | Headroom | Source |
| --- | --- | --- | --- | --- |
| Size of one static asset | 25 MiB / 25 MiB | 5.76 MB largest served file; `city-models.html` (41.05 MB) is over the limit and excluded | The largest file is 22% of the limit | [platform limits](https://developers.cloudflare.com/workers/platform/limits/#static-assets) |
| Files per Worker version | 20,000 / 100,000 | 109 | Ample | same |
| Total asset size | No limit stated on the limits page | 31 MB of data plus about 1.1 MB of code | n/a | same |
| `_headers` rules | 100 | 0 | Ample | same |
| Requests to static assets | "free and unlimited"; "no additional cost for storing Assets" | n/a | n/a | [billing and limitations](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) |
| Range requests | Not supported: a `Range` request gets `200 OK` and the whole file | Not used today | Rules out range-read formats ([layer 4](04-data-formats-loading.md)) | same |

A city would have to grow a single file past 25 MiB before the limit matters. Philadelphia's
terrain grid is the one to watch: it is 34.3 MB before gzip.

## Default delivery behaviour

| Behaviour | What Cloudflare does | Effect on us | Source |
| --- | --- | --- | --- |
| Caching | `Cache-Control: public, max-age=0, must-revalidate` plus an `ETag` on every asset | Every visit revalidates all of a city's files: one conditional request per file, answered `304` if unchanged. For Philadelphia that is 56 modules + 16 data files + CSS + HTML on every load | [headers](https://developers.cloudflare.com/workers/static-assets/headers/) |
| Compression | Gzip, Brotli or Zstandard for a fixed list of content types, including `application/json`, `text/javascript`, `text/css`, `text/html`, `image/svg+xml`, `application/wasm` | Our `.js`, `.css`, `.html` and plain `.json` are compressed at the edge. `.json.gz` and `.bin.gz` are not on the list and travel as stored, then get decompressed in [js/data.js:17-21](../../js/data.js). `.webp` is already compressed | [content compression](https://developers.cloudflare.com/speed/optimization/content/compression/) |
| Content type | Set from the file extension at upload | `.gz` files get a gzip type, not JSON | [headers](https://developers.cloudflare.com/workers/static-assets/headers/) |
| Upload | Files already uploaded are reused; each version has its own manifest | A code-only commit does not re-upload 31 MB of data | [direct upload](https://developers.cloudflare.com/workers/static-assets/direct-upload/) |
| Deploy consistency | During a deploy, HTML and assets can briefly come from different versions; a file missing from the selected version returns `404` when there is no Worker script | With un-hashed names we get the newer or older file, silently. With hashed names we get a `404` and the error overlay | [version skew](https://developers.cloudflare.com/workers/versions-and-deployments/version-skew/) |

Custom headers: a `_headers` file in the asset directory overrides the defaults. Because rules
are joined, changing `Cache-Control` for a path needs the default detached first
(`! Cache-Control`, then the new value), as the headers page shows.

## Candidates

| Option | What it is | Limits | Status | Verdict |
| --- | --- | --- | --- | --- |
| **Workers static assets** (today) | Assets attached to a Worker, deployed by `wrangler deploy` | 25 MiB per file; 20,000 files free | Cloudflare's current product for static sites; framework guides and the Pages migration guide point here | Finalist |
| **Cloudflare Pages** | The older static hosting product | 25 MiB per file; 20,000 files free; 500 builds per month free; 20-minute builds | Cloudflare publishes a [Pages → Workers migration guide](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/), which says Workers has "a distinctly broader set of features" | Out: same limits, fewer features, and we would be migrating against the vendor's direction. One real difference: Pages allows custom domains on DNS not hosted at Cloudflare; Workers does not (same guide) |
| **Workers static assets + R2 for data** | App from assets; `data/` from an R2 bucket on a custom domain | R2 has no 25 MiB limit; 10 GB-month, 1 million Class A and 10 million Class B operations free per month; egress free | Supported | Finalist (for later) |
| **Assets + a Worker script in front** | `run_worker_first` routes requests through code | Worker requests are billed and count against the free daily limit; assets alone are free | Supported | Out for now: no need for code at the edge, and it would put a request quota on a site that has none. It is the only way to add range requests or content negotiation |
| **Other hosts** (GitHub Pages, Netlify, Vercel) | n/a | n/a | n/a | Out of scope: the brief is Cloudflare as used now, and nothing found here is a reason to leave |

Sources: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/#static-assets),
[Pages limits](https://developers.cloudflare.com/pages/platform/limits/),
[R2 pricing](https://developers.cloudflare.com/r2/pricing/) (storage $0.015 per GB-month, Class A
$4.50 and Class B $0.36 per million beyond the free tier),
[R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/).

## Vetting the finalists

**Workers static assets**
- Fits everything we serve, with room. Free for our use.
- Preview builds give each branch its own URL, with a pull-request comment
  ([build branches](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/),
  [previews](https://developers.cloudflare.com/workers/previews/)). Worker Previews "requires
  Wrangler 4.135.0 or later. Update the project dependency". We have no project dependency
  today; the pinned `wrangler` from [layer 3](03-build-dev-server.md) provides one. For a Worker
  connected before Worker Previews existed, enabling it is a one-time switch that "cannot be
  reversed".
- [wrangler](https://www.npmjs.com/package/wrangler) 4.162.0: 148 releases in 12 months,
  [socket.dev](https://socket.dev/npm/package/wrangler) 98 / 100 / 92 / 96 / 100, provenance,
  Node `>=22.12.0`.

**R2 for data**
- Solves three problems we don't have yet: files over 25 MiB, range requests, and publishing
  data separately from code.
- Costs: a second upload step (`wrangler r2 object put` or an S3-compatible sync) outside the
  git-driven deploy; a custom domain is required for caching ("To use features like ... caching
  ... you must configure your bucket behind a custom domain"), and "By default, only certain
  file types are cached", so `.bin` and `.gz` need a cache rule; cross-origin fetches need CORS
  on the bucket; data and code can drift apart unless file names are versioned.
- At 31 MB the storage is far inside the 10 GB free tier.

## Fit check

| Change | Files touched | Effort (rough days) | Deploy change |
| --- | --- | --- | --- |
| Pin wrangler | `package.json` (dev dependency), lockfile | Part of layer 3 | Builds use the pinned version |
| Asset directory → build output | [wrangler.jsonc](../../wrangler.jsonc) (`"directory": "./dist"`); [.assetsignore](../../.assetsignore) deleted or reduced (it must sit "in the root of the assets directory", and `dist/` will contain only what should ship) | Part of layer 3 | Build command `npm run build` |
| Long-lived caching for hashed code | New `public/_headers` with a rule for Vite's `/assets/*` output | 0.25 | None |
| Hashed names for data | A build step that copies `data/<city>/*` to hashed names and writes a manifest; [js/data.js:40](../../js/data.js) and [js/loading.js:207](../../js/loading.js) read paths from the manifest instead of `CITY.dir + '/' + file`; `tools/perf` and `tools/ux` unaffected if they run the built output | 1 to 2 | Build step |
| Self-host three.js and the font | Covered in layer 3 | n/a | Removes two third-party origins |
| Preview builds | Dashboard setting; the one-time switch | 0.25 | Each branch push builds |
| R2 for data (later) | `js/data.js` base URL; a bucket, custom domain, CORS and cache rule; an upload script; [tools/perf/perf.py:90](../../tools/perf/perf.py) (its snapshot server falls back to the repo's `data/`) | 2 to 3 | A second publish step |

Perf scenarios and other checks:

| Claim | Check |
| --- | --- |
| Immutable caching makes a repeat visit download nothing | Not measurable with `tools/perf` (fresh browser, local server). Check on a preview URL: load twice with Playwright against the deployed site and count requests and transferred bytes on the second load; expect only `index.html` to be revalidated |
| Self-hosting three.js and the font does not slow the first load | Same preview-URL method, first load, compared with production. `tools/perf` deliberately keeps CDN latency out of its numbers ([tools/perf/README.md](../../tools/perf/README.md), Setup), so it cannot show this |
| Headers are what we intend | `curl -sI` on a hashed asset, a data file and `/` on the preview URL; record `cache-control`, `content-encoding`, `content-type`, `cf-cache-status` |
| Nothing changed in the app | `perf.py ab --quick --shots` against the built output |

## Recommendation

**Stay on Workers static assets with Workers Builds. Don't move to Pages. Don't add R2 or a
Worker script yet.** Make four delivery changes:

1. Serve the build output, with `wrangler` pinned in `package.json`.
2. Self-host three.js and Archivo, so the site has one origin.
3. Content-hash file names (code through Vite; data through a small manifest step) and add a
   `_headers` rule giving hashed files `Cache-Control: public, max-age=31536000, immutable`.
   Leave `index.html` on the default revalidating policy.
4. Turn on preview builds for the refactor's pull requests.

**Runner-up: R2 behind a custom domain for `data/`**, adopted when any one of these becomes
true: a data file approaches 25 MiB, we want a range-read format, or data needs to be published
without a code deploy.

## Risks

- **Hashed names plus version skew.** A page loaded just before a deploy can request a chunk
  that the new version no longer has and get `404`. Our page fetches everything in its first
  seconds, so exposure is short. The existing `#err` overlay tells the user to reload
  ([index.html:76](../../index.html)).
- **Un-hashed leftovers.** Any file referenced by a fixed name (the loading-screen `.webp`s
  through `CITY.loadingScreens`, [js/cities.js:23-29](../../js/cities.js)) must go through the
  manifest too, or keep the default policy. Mixing immutable caching with fixed names serves
  stale files for a year.
- **`_headers` joining.** Adding `Cache-Control` without detaching the default produces two
  conflicting values, "which makes this easy to miss" (headers page). Verify with `curl`.
- **Preview switch is irreversible** and previews "do not use production settings". We have no
  bindings or secrets, so the difference is small, but read the banner before confirming.
- **Dashboard settings are not in git.** Build command, cache and branch settings can change
  without a commit. Record them in the README when they are set.
- **Free-plan build concurrency is 1.** With previews on, a branch push and a `main` push queue
  behind each other
  ([limits](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)).

## Migration steps

1. Read and record the current dashboard settings and the production URL (closes the unverified
   items above). `curl -sI` the production site for a module, a `.json`, a `.bin.gz` and `/`.
2. With layer 3: pin `wrangler`, point `assets.directory` at `dist`, set the build command.
3. Add `public/_headers`:

   ```txt
   /assets/*
     ! Cache-Control
     Cache-Control: public, max-age=31536000, immutable
   ```

4. Add the data manifest step and switch `data.js` and `loading.js` to it; extend the
   `_headers` rule to the hashed data path.
5. Enable preview builds; open a pull request and check the preview URL with the `curl` and
   two-load checks above.
6. Revisit R2 only when one of the three triggers is met.
