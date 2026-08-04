# NIL Monitor

Live regulatory dashboard for college athletics decision-makers. Tracks NIL legislation, litigation, NCAA governance, CSC enforcement, and the news environment — in one view.

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Project Status

**In production at [nilmonitor.com](https://nilmonitor.com).** Live data pipeline and AI
briefing generation are running; the dashboard is a single scrollable page plus
server-rendered SEO pages.

- 11 fetchers on four cron groups feed a D1 database (~190 queries/feeds)
- Claude Sonnet 4.5 tags headlines and writes a twice-daily briefing
- Server-rendered `/news`, 8 category pages, briefing archive, RSS, sitemap
- Not built: Congress and LegiScan fetchers, AI deadline extraction, live state-bill data

`NIL-Monitor-Status.md` is the source of truth for current state, architecture decisions,
and known issues. The build spec and IA doc below are historical — the shipped system
diverges from both.

## Docs

- `NIL-Monitor-Status.md` — **Current state, decisions, known issues (read this first)**
- `AUDIT-2026-08-04-design.md` — Software design audit + prioritized refactors
- `AUDIT-2026-04-24.md` — Defect/performance audit (annotated with resolution status)
- `docs/NIL-Monitor-Revised-IA.md` — Original information architecture (the "what")
- `docs/NIL-Monitor-Build-Spec.md` — Original build specification (the "how")

## Tech Stack

- **Frontend:** React + Vite, deployed to Cloudflare Pages
- **Backend:** Cloudflare Workers + D1 (SQLite)
- **AI:** Anthropic Claude API (Sonnet 4.5)
- **CI:** GitHub Actions — push to `main` deploys Worker + Pages (no test gate)
