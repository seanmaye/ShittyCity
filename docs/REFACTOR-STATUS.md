# Refactor status

Kept by the orchestrator of [REFACTOR-PLAN.md](REFACTOR-PLAN.md). Only the orchestrator edits
this file. It is how the work is picked up again after a context summary or in a new session.

Last updated: 2026-11-13.

## Standing facts

**Opening decisions (asked 2026-11-13, answered by Micah):**

1. Dashboard: Sean owns the Cloudflare account; Micah has admin access and offered to sign in
   to the dashboard in a browser for readouts. Dashboard:
   `https://dash.cloudflare.com/1af14c0b141e374a8e01a11bba70b7d0/workers/services/view/shittycity/production`.
   Production site URL: _not yet recorded_ (P0 dashboard readout).
2. A failing check blocks the deploy: **yes, from P3** (`cf:build` = `npm run check && npm run build`).
3. TypeScript: **typed contracts and opt-in checking now (P4c); `.ts` renames later (P6a)** with
   their own go-ahead.
4. Preview builds: **no**. Consequence: P4b's live caching checks, and P3's "deliberate type
   error fails its build", run without a preview URL (P3: show the failing CI job instead; P4b:
   `curl` against production after merge).
5. GitHub Actions workflow on `seanmaye/ShittyCity`: **yes** (minimal in P2, full in P3).
6. Messages to contributors: **orchestrator drafts, Micah sends.** Two are due: before P1b
   merges and before P2 merges.

**Reference machine:** _from the P0 baseline report_.

**Pixel-diff tolerances:** _from P1c calibration_.

**Contributors:** `main` moves about 16 commits a day from several people and their agents.
Re-list files before every phase.

## Gate matrix

_P0 inventory, filled in below._

## Phases

### P0. Baseline and inventory

- State: in progress.
- Branch / PR: `refactor/p0-docs`.
- Main checkout fast-forwarded to `origin/main` at `9c38eae` on 2026-11-13.

### P1a. Locked Python environment

- State: not started.

### P1b. Retire the single-file bundle

- State: not started.

### P1c. Smoke check and pixel diff

- State: not started.

### P2. The build

- State: not started.

### P3. Checks in the build

- State: not started.

### P4a. three.js 0.187.0

- State: not started.

### P4b. Per-city code splitting, hashed data, long-lived caching

- State: not started.

### P4c. Typed contracts, opt-in checking

- State: not started.

### P5. Data decoding in a worker (go or no-go)

- State: not started.
