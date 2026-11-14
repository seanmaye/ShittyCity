# Layer 5: Data pipeline (Python)

Research date: 2026-11-13. Nothing here has been executed; see [SUMMARY.md](SUMMARY.md).

## The need

**What the code does today.** 35 Python files under `tools/` (`git ls-files tools | grep -c '\.py$'`):
24 data scripts in `tools/phl/`, `tools/jsh/`, `tools/nyc/`, and the QA and utility scripts
(`serve.py`, `bundle.py`, `unbundle.py`, `perf/`, `ux/`, `loading/`). They fetch public sources
and write `data/<city>/`, which is committed.

**Corrections to the section 0 inventory:**

- **No dependency file of any kind exists.** `find` for `requirements*`, `pyproject.toml`,
  `uv.lock`, `Pipfile*`, `setup.cfg`, `.python-version` returns nothing. Versions are whatever
  `pip install` gave on the day; the docs name packages without versions
  ([docs/JSH.md:65](../JSH.md), [docs/PHL.md:157](../PHL.md), [tools/perf/README.md](../../tools/perf/README.md)).
- **Two more third-party packages are in use** beyond the five listed: `rasterio` and `duckdb`
  ([tools/jsh/fetch_jsh.py:52,82-85](../../tools/jsh/fetch_jsh.py)), plus `playwright` for the
  harnesses ([tools/perf/perf.py:800](../../tools/perf/perf.py), [tools/ux/ux.py:407](../../tools/ux/ux.py),
  [tools/loading/capture.py:22](../../tools/loading/capture.py)).
- **Most data scripts use only the standard library.** Third-party imports by file:

  | Package | Imported in |
  | --- | --- |
  | shapely, numpy, Pillow | [tools/jsh/build_jsh.py:21-27](../../tools/jsh/build_jsh.py) (shapely also at line 235) |
  | Pillow | [tools/phl/build_trolley1953.py:30](../../tools/phl/build_trolley1953.py) |
  | osmium | [tools/phl/extract_osm.py:17](../../tools/phl/extract_osm.py), [extract_landmarks.py:11](../../tools/phl/extract_landmarks.py), [extract_bridges.py:11](../../tools/phl/extract_bridges.py) |
  | duckdb, rasterio, pyproj, numpy, Pillow | [tools/jsh/fetch_jsh.py](../../tools/jsh/fetch_jsh.py) (imported inside the steps that need them) |

  The grep in the brief counted `shapely` in 7 import lines; they are all in `build_jsh.py`.
  The Philadelphia builders use their own [tools/phl/geom.py](../../tools/phl/geom.py)
  (263 lines, "no dependencies").
- **The local environment** is a uv-managed CPython 3.12 venv at `tools/.venv` holding only
  `playwright` 1.65.1 and `greenlet` (`tools/.venv/pyvenv.cfg`: `uv = 0.13.4`). The system
  `python3` is 3.9.6. The docs' venv commands are Windows paths (`tools/.venv/Scripts/pip`,
  [docs/PHL.md:157-169](../PHL.md)).
- **New York's data is not built here.** `tools/nyc/import_nyc.py` converts data from a separate
  project on an office file share, imported at commit `676aee9`
  ([docs/NYC.md:56](../NYC.md)).

**Inputs the pipeline needs**, from the docs:

| Input | Size | Source | Reproducible unattended? |
| --- | --- | --- | --- |
| Philadelphia core raw downloads | about 45 MB | Overpass and city open data ([docs/PHL.md:140](../PHL.md)) | Overpass is rate-limited; `fetch_osm.sh` says "please don't run it in a loop" |
| Geofabrik Pennsylvania extract | about 350 MB | `download.geofabrik.de` ([docs/PHL.md:146](../PHL.md)) | Yes, but it changes daily |
| Philadelphia building footprints | about 210 MB | OpenDataPhilly ([docs/PHL.md:205](../PHL.md)) | Yes |
| USGS 3DEP elevation | about 40 MB | USGS National Map ([docs/PHL.md:212](../PHL.md)) | Yes |
| djour restaurant markers | small | Read by hand from a web page; "there is no download script" ([docs/PHL.md:211](../PHL.md)) | No |
| 1953 PTC map image | one GIF | Not in the repo; downloaded by hand ([tools/phl/README.md](../../tools/phl/README.md)) | No |
| Jersey Shore sources | 8.7 MB, committed in `tools/jsh/src/` | Overpass, Overture, AWS Terrain Tiles, USDA CDL | Committed, so yes |
| New York | n/a | Another repository on an office share | No |

`build_city.py` alone "takes about 5 minutes" ([docs/PHL.md:206](../PHL.md)).

**What we would gain.** The same package versions on every machine and a year from now; one
command to set up; lint and tests for the geometry helpers.

**What rules an option out.** Packages without wheels for current Python on macOS arm64 and
Linux x86_64; tools that need a system GDAL install; anything that puts 650 MB of rate-limited
downloads into every deploy.

## Libraries in use

Sources: version, upload date, license, `requires_python`, dependencies and wheel tags from
`https://pypi.org/pypi/<name>/json`; downloads from
`https://pypistats.org/api/packages/<name>/recent`; repo stats from
`https://api.github.com/repos/<repo>`; contributor share from `.../contributors?per_page=100`.

| Name | Version | Last release | Weekly downloads | Runtime deps | Requires Python | Wheels (cp314 manylinux x86_64 / macOS arm64) | License | Maintenance signal |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [shapely](https://pypi.org/project/shapely/) | 2.2.0 | 2026-10-07 | 17,882,227 | 1 (numpy) | >=3.11 | yes / yes | BSD-3-Clause | 1 stable release in 12 months; repo pushed 2026-11-06; ★4,542; top contributor 40% |
| [osmium](https://pypi.org/project/osmium/) (pyosmium) | 4.3.2 | 2026-10-18 | 297,038 | 1 (requests) | >=3.8 | yes / yes | BSD-2-Clause | 3 releases in 12 months; 14 open issues; ★403; top contributor 83% |
| [pyproj](https://pypi.org/project/pyproj/) | 3.8.0 | 2026-09-05 | 5,905,581 | 1 (certifi) | >=3.12 | yes / yes | MIT | 1 release in 12 months; ★1,239; top contributor 74% |
| [numpy](https://pypi.org/project/numpy/) | 2.5.4 | 2026-10-10 | 270,336,645 | 0 | >=3.12 | yes / yes | BSD-3-Clause and others | 13 releases in 12 months |
| [pillow](https://pypi.org/project/pillow/) | 13.0.0 | 2026-10-16 | 172,604,372 | 0 | >=3.11 | yes / yes | MIT-CMU | 5 releases in 12 months |
| [rasterio](https://pypi.org/project/rasterio/) | 1.5.2 | 2026-09-30 | 1,761,427 | 6 | >=3.12 | yes / yes | BSD-3-Clause | 4 releases in 12 months; ★2,592 |
| [duckdb](https://pypi.org/project/duckdb/) | 2.0.0 | 2026-10-21 | 18,385,584 | 0 | >=3.11 | abi3 / yes | unverified (PyPI's license field is empty) | 11 releases in 12 months |
| [playwright](https://pypi.org/project/playwright/) | 1.65.1 | 2026-11-11 | 31,509,198 | 1 (greenlet) | >=3.10 | yes / yes | Apache-2.0 | 11 releases in 12 months; 1 open issue |

All eight are maintained and ship wheels for both platforms. Three now require Python 3.12 or
later (numpy, pyproj, rasterio), which matches the 3.12 venv and rules out the system 3.9.6.

## Candidates: reproducible environments

| Name | Version | Last release | Weekly downloads | Runtime deps | License | Maintenance signal | Fit notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [uv](https://pypi.org/project/uv/) | 0.13.8 | 2026-11-12 | 48,792,110 | 0 (single binary) | MIT OR Apache-2.0 | 102 releases in 12 months; ★91,976; top contributor 32% | Already on this machine (0.13.4) and in Cloudflare's build image (0.13.4). Installs Python itself, has a cross-platform lockfile (`uv.lock`), dependency groups, and inline script metadata |
| [pip-tools](https://pypi.org/project/pip-tools/) | 7.6.2 | 2026-10-07 | 3,378,113 | 8 | BSD-3-Clause | 4 releases in 12 months | `requirements.in` → pinned `requirements.txt`. Lock is per platform |
| [poetry](https://pypi.org/project/poetry/) | 2.5.1 | 2026-09-20 | 10,372,108 | 22 | MIT | 11 releases in 12 months | In the build image (2.4.3). Aimed at packaging a library; we publish none |
| [pdm](https://pypi.org/project/pdm/) | 2.29.7 | 2026-11-06 | 352,362 | 23 | MIT | 20 releases in 12 months | Similar scope to poetry |
| [hatch](https://pypi.org/project/hatch/) | 1.18.2 | 2026-10-28 | 752,583 | 19 | MIT | 11 releases in 12 months | Environment matrix tool; depends on uv itself |
| Plain `requirements.txt` with pins | n/a | n/a | n/a | n/a | n/a | n/a | No hashes, no transitive pins unless frozen by hand |

Cut: **poetry, pdm, hatch** (project managers for publishable packages, with 19 to 23
dependencies of their own, solving a problem we don't have). Finalists: **uv**, **pip-tools**,
**pinned `requirements.txt`**.

## Candidates: would another library simplify `tools/<city>/`?

| Name | Version | Last release | Weekly downloads | Runtime deps | License | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| [geopandas](https://pypi.org/project/geopandas/) | 1.2.0 | 2026-09-28 | 3,164,099 | 6 (pandas, pyogrio, pyproj, shapely ...) | BSD-3-Clause | Adds pandas and a GDAL binding to scripts that pass lists of shapely geometries and write custom binary and JSON. No step maps onto a dataframe operation that isn't one line of shapely today |
| [duckdb](https://pypi.org/project/duckdb/) spatial | 2.0.0 | 2026-10-21 | 18,385,584 | 0 | unverified (as above) | Already used for the one job it fits: reading Overture's GeoParquet from S3 with a bounding box ([fetch_jsh.py:52](../../tools/jsh/fetch_jsh.py)). It could do the same for a new city's buildings. Its OSM reader returns raw nodes, ways and relations, so the assembly logic in `extract_osm.py` would remain |
| [quackosm](https://pypi.org/project/quackosm/) | 0.20.0 | 2026-11-02 | 7,379 | 17 | Apache-2.0 | PBF → GeoParquet on DuckDB. 17 dependencies and low adoption to replace 250 lines |
| [osmnx](https://pypi.org/project/osmnx/) | 2.1.1 | 2026-07-21 | 108,156 | 6 (geopandas, networkx ...) | MIT | Street-network analysis through Overpass. We need raw ways with tags, which we already fetch |
| [overturemaps](https://pypi.org/project/overturemaps/) | 2.1.1 | 2026-11-10 | 27,117 | 8 (pyarrow ...) | MIT | Official Overture downloader CLI. The DuckDB query we have does the same in a dozen lines |
| [pyogrio](https://pypi.org/project/pyogrio/) / [fiona](https://pypi.org/project/fiona/) | 0.13.0 / 1.10.1 | 2026-06-26 / 2024-09-16 | 3,102,020 / 766,303 | 3 / 6 | MIT / BSD-3-Clause | GDAL vector I/O. We read GeoJSON and CSV with the standard library. fiona has had no release in 26 months |
| [GDAL](https://pypi.org/project/gdal/) (`ogr2ogr`) | 3.13.3 | 2026-08-18 | 78,120 | 0 | MIT | No wheels on PyPI (source only); needs a system GDAL. A system dependency for format conversion we don't do |
| `osmium-tool` (command line) | not on PyPI; version unverified | unverified | n/a | n/a | GPL-3.0 (unverified; check before use) | `osmium extract --bbox` would cut the 350 MB Pennsylvania file to the city before Python reads it. A possible speed-up for `extract_osm.py`, not a simplification. Copyleft applies to the tool, not to data it outputs |

None of these removes meaningful code. The pipeline's weight is in domain logic (depth
estimates for tunnels, fitting rectangles to footprints, crop fields from 30 m pixels), not in
I/O.

## Vetting the finalists

**uv 0.13.8**
- 102 releases in 12 months is fast-moving and still 0.x. It is one static binary with no
  Python dependencies, so pinning its version in docs is enough.
- Covers everything we need in one tool: `uv python install`, `uv sync`, `uv run`,
  `uv.lock` (cross-platform, hashed), `[dependency-groups]` in `pyproject.toml`.
- Present in the Cloudflare build image at 0.13.4 with Python 3.14.8
  ([build image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)), if we
  ever want to run a pure-Python check there.

**pip-tools 7.6.2**
- Mature, small scope. Output is a pinned `requirements.txt` that plain `pip` installs.
- The lock is resolved for the platform it runs on. We develop on macOS arm64 and the docs
  were written on Windows, so one lock would not serve both.

**Pinned `requirements.txt`**
- Zero tooling. No transitive pins or hashes unless generated by one of the tools above.

## Should data generation run in the build?

No. Keep `data/` committed.

- The inputs total roughly 650 MB of downloads, some from servers that ask not to be polled,
  against a 20-minute build timeout and 3,000 free build minutes a month
  ([limits](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)).
- Three inputs cannot be fetched by a script at all (table above).
- OpenStreetMap changes daily. A build that re-fetches would change the city on every deploy,
  and `tools/perf`'s A/B comparisons assume the data is fixed.
- The committed data is small in git terms: 20 commits touch `data/`, and the largest files
  have one version each in history (the same `git cat-file` survey as in
  [layer 3](03-build-dev-server.md)). The repository's weight is the 41 MB bundle, not `data/`.

What can run in a build or CI is a cheap validation of the committed data (headers, counts,
closed loops), see [layer 7](07-quality-tooling.md).

## Fit check

| Finalist | Files touched | Effort (rough days) | Deploy change |
| --- | --- | --- | --- |
| uv | New `pyproject.toml`, `uv.lock`, `.python-version`. Docs: [docs/PHL.md:153-169](../PHL.md), [docs/JSH.md:65](../JSH.md), [tools/perf/README.md](../../tools/perf/README.md), [tools/ux/README.md](../../tools/ux/README.md), README "Run it". No script changes | 0.5 | None |
| pip-tools | `requirements/*.in` and generated `.txt` per group and platform; the same docs | 0.5 to 1 | None |
| Pinned `requirements.txt` | One or two files; the same docs | 0.25 | None |

No runtime performance claim attaches to this layer. The check that a locked environment
reproduces the data is to rebuild Jersey Shore (its sources are committed) and confirm
`git diff --stat data/jsh` is empty: `uv run tools/jsh/build_jsh.py`. If newer shapely or numpy
versions change output bytes, that is worth knowing before it happens by accident.

## Recommendation

**uv, with one `pyproject.toml` and a committed `uv.lock`.** Dependency groups: `data`
(shapely, numpy, pillow, osmium), `fetch` (duckdb, rasterio, pyproj), `qa` (playwright), `dev`
(ruff, pytest). Pin Python to 3.12 in `.python-version` for now (it is what the venv uses and
every package supports it); move to 3.14 as a separate, tested change.

**Runner-up:** pip-tools with one compiled `requirements.txt` per group, if we would rather not
depend on a 0.x tool.

Keep the current libraries. Keep generated data committed. Don't add GeoPandas, GDAL or a
tiler.

## Risks

- **uv is pre-1.0 and releases about twice a week.** Lockfile format changes are possible. Pin
  the uv version in the docs and upgrade deliberately.
- **Locked versions may not reproduce today's data byte for byte**, because we don't know which
  versions produced it. The Jersey Shore rebuild check above finds out. For Philadelphia the raw
  inputs are not in the repo (`tools/phl/raw/` is git-ignored), so a rebuild needs fresh
  downloads and will differ anyway.
- **New York cannot be rebuilt from this repository.** That is a bus-factor problem independent
  of tooling; see Open questions in [SUMMARY.md](SUMMARY.md).
- **Docs assume Windows.** The commands need rewriting in a form that works on both
  (`uv run ...` does).

## Migration steps

1. `uv init --bare`, then `uv add --group data shapely numpy pillow osmium`,
   `--group fetch duckdb rasterio pyproj`, `--group qa playwright`, `--group dev ruff pytest`.
   Commit `pyproject.toml`, `uv.lock`, `.python-version`.
2. Rebuild Jersey Shore with the locked environment and diff `data/jsh`. Record the result.
3. Replace the `pip install` and venv lines in the five docs with `uv sync --group <name>` and
   `uv run <script>`. Keep `-I` where the docs use it today.
4. Delete the hand-made `tools/.venv` instructions in [tools/ux/README.md](../../tools/ux/README.md);
   `uv sync` creates `.venv` at the repo root (add it to `.gitignore`).
5. Add Ruff and pytest per [layer 7](07-quality-tooling.md).
