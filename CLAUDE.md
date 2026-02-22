# NIL Monitor — Claude Code Instructions

Before answering any questions or making any changes, read `NIL-Monitor-Status.md` for current project state. That file is the source of truth for what's built, what's working, architecture decisions, and known issues.

If the status doc seems stale or you're unsure, audit the actual source files in `src/` and `workers/` before proceeding.

## Project Overview

Live dashboard at nilmonitor.com for college athletics decision-makers. Tracks NIL legislation, litigation, NCAA governance, and CSC enforcement.

## Key Files

- `NIL-Monitor-Status.md` — Current state, what works, what doesn't, all decisions
- `NIL-Monitor-Build-Spec.md` — Original build specification
- `NIL-Monitor-Revised-IA.md` — Information architecture
- `NIL-Monitor-Schedule.md` — Fetch/pipeline architecture reference
- `src/` — React frontend (Vite)
- `workers/` — Cloudflare Workers (API, fetchers, AI pipeline)
- `schema.sql` — D1 database schema
