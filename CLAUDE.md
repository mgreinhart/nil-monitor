# NIL Monitor — Claude Code Instructions

Before answering any questions or making any changes, read `NIL-Monitor-Status.md` for current project state. That file is the source of truth for what's built, what's working, architecture decisions, and known issues.

If the status doc seems stale or you're unsure, audit the actual source files in `src/` and `workers/` before proceeding.

## Project Overview

Live dashboard at nilmonitor.com for college athletics decision-makers. Tracks NIL legislation, litigation, NCAA governance, and CSC enforcement.

## Key Files

- `NIL-Monitor-Status.md` — Current state, what works, what doesn't, all decisions
- `AUDIT-2026-08-04-design.md` — Software design audit (testing gaps, naming, module
  boundaries). **Start with its "Start here" section** — it names the one refactor that
  should precede all others.
- `AUDIT-2026-04-24.md` — Defect/perf audit. Read the resolution annotation at the top
  first; eight of its findings were fixed on 2026-04-24 and are marked as such.
- `docs/NIL-Monitor-Build-Spec.md` — Original build specification (historical; the built
  system diverges — see the status doc for what actually shipped)
- `docs/NIL-Monitor-Revised-IA.md` — Information architecture (historical, same caveat)
- `src/` — React frontend (Vite)
- `workers/` — Cloudflare Workers (API, fetchers, AI pipeline)
- `schema.sql` — D1 database schema

## Working Notes

- **No tests exist and CI has no gate** — `.github/workflows/deploy.yml` deploys straight
  to production on push to `main`. Treat every change to `workers/` as a production change.
- **Fetcher noise filters and the relevance gate are runtime-constructed regexes**
  (`new RegExp([...].join('|'))` in `fetcher-utils.js`). A syntax error there is not caught
  by the build — it throws at module load and takes down the whole Worker, API included.
  Verify any regex edit by importing the module before pushing.
- When a finding in either audit doc is fixed, annotate that doc in the same commit.
