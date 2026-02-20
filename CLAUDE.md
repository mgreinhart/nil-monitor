# CLAUDE.md — NIL Monitor

## What This Is

NIL Monitor is a live regulatory dashboard for college athletics decision-makers (ADs, compliance officers, sports lawyers). It answers: "Did anything change overnight that I need to know about?"

## Current State

Phase 1 (static shell) is complete. The entire app is in `src/App.jsx` — a single-file React component with mock data. Five pages: Monitor (dashboard), States, Cases, Headlines, About.

## Architecture

- **Frontend:** React + Vite. All in `src/App.jsx` right now.
- **Backend (Phase 2):** Cloudflare Workers + D1. Workers fetch data on cron schedules, store in D1, serve via API.
- **AI Pipeline (Phase 3):** Cloudflare Worker calls Anthropic API to generate briefings, extract events/deadlines, tag CSC activity.

## Key Docs

- `docs/NIL-Monitor-Revised-IA.md` — Full information architecture. Read this for product context, user personas, what each section does, and data source details.
- `docs/NIL-Monitor-Build-Spec.md` — Phase 2-4 implementation plan. D1 schema, Worker patterns, API endpoints, AI prompt templates, deploy pipeline.

## Design Tokens

The app uses a Bloomberg-terminal-meets-news-app aesthetic. Key values are in the `T` object at the top of `App.jsx`:
- Fonts: DM Sans (body) + JetBrains Mono (data/timestamps)
- Colors: Navy nav, off-white bg, blue accent, green/amber/red status
- Dense information layout — no decoration for decoration's sake

## Development

```bash
npm run dev          # Vite dev server on localhost:5173
npm run build        # Production build to dist/
```

## What Comes Next

Phase 2A: Replace mock sidebar content with live embeds (X List, Spotify, Google Trends). These are just iframe embed codes — no backend needed.

Phase 2B: Set up Cloudflare (wrangler, D1 database, schema from build spec).

Phase 2C: Data fetch Workers (LegiScan, CourtListener, NewsData.io, etc.)

Phase 2D: API Worker + connect frontend to real data.

See the build spec for the full session-by-session sequence.
