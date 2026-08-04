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

- **Tests exist now (2026-08-04)** — `npm test` runs 73 `vitest` tests in
  `workers/__tests__/`, wired into `.github/workflows/deploy.yml` before either deploy
  step. Run it before pushing any change to `workers/`. Coverage is a smoke test
  (imports every worker module) plus fixtures for the headline classifier chain — it does
  not cover `api.js`, `ai-pipeline.js`, or the frontend. Still treat every change to
  `workers/` as a production change.
- **Fetcher noise filters and the relevance gate are runtime-constructed regexes**
  (`new RegExp([...].join('|'))` in `fetcher-utils.js`). A syntax error there is not caught
  by `wrangler deploy --dry-run` (verified) — it throws at module load and takes down the
  whole Worker, API included. `npm test` catches this via the module-import smoke test;
  it does not require manually importing the module yourself.
- When a finding in either audit doc is fixed, annotate that doc in the same commit.
