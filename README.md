# NIL Monitor

Live regulatory dashboard for college athletics decision-makers. Tracks NIL legislation, litigation, NCAA governance, CSC enforcement, and the news environment — in one view.

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Project Status

**Phase 1: Static Shell** ✅ Complete
- 5-page dashboard with realistic mock data
- Two-column layout with persistent sidebar
- Interactive state map, expandable case cards, category filters

**Phase 2: Live Data** → Next
- See `docs/NIL-Monitor-Build-Spec.md` for the full implementation plan

## Docs

- `docs/NIL-Monitor-Revised-IA.md` — Information architecture (the "what")
- `docs/NIL-Monitor-Build-Spec.md` — Build specification (the "how")

## Tech Stack

- **Frontend:** React + Vite
- **Hosting:** Cloudflare Pages (Phase 2)
- **Backend:** Cloudflare Workers + D1 (Phase 2)
- **AI:** Anthropic Claude API (Phase 3)
