# NIL Monitor — Project Status

> Last audited: 2026-02-22 from source files, D1 queries, and deployed endpoints.

## Architecture

```
Browser → nilmonitor.com (Cloudflare Pages)
           └── /api/* → Pages Function proxy → nil-monitor-api.mgreinhart.workers.dev
                                                  ├── api.js (JSON endpoints)
                                                  ├── 11 fetchers (cron, self-governing cooldowns)
                                                  ├── ai-pipeline.js (Claude Sonnet tagging/briefings)
                                                  └── D1: nil-monitor-db
```

- **Frontend:** Single-file React app (`src/App.jsx`), Vite build, Cloudflare Pages
- **Backend:** Cloudflare Worker (`workers/index.js` entry), D1 SQLite database
- **AI Pipeline:** `workers/ai-pipeline.js`, Claude Sonnet via Anthropic API
- **Proxy:** `functions/api/[[path]].js` — Pages Function forwards `/api/*` to Worker
- **CI/CD:** `.github/workflows/deploy.yml` — push to main deploys both Worker and Pages
- **Domain:** nilmonitor.com (Cloudflare Pages custom domain)

### D1 Database

ID: `c205339b-2bde-4f06-ab64-bedef8db1f53`, name: `nil-monitor-db`

| Table | Rows | Purpose |
|-------|------|---------|
| headlines | 646 | News articles from all fetchers, AI-tagged |
| cases | 117 | Litigation from CSLT scraper |
| case_updates | 9 | Latest/previous updates from CSLT |
| deadlines | 10 | AI-extracted + 6 pre-loaded seed deadlines |
| csc_activity | 11 | AI-detected CSC items |
| briefings | 3 | AI-generated daily briefings |
| bills | 0 | Federal bills (Congress.gov); no state bills (LegiScan blocked) |
| house_settlement | 7 | Key settlement metrics (seed data) |
| gdelt_volume | 30 | Daily article counts for news volume chart |
| podcast_episodes | 5 | Latest episode dates for NEW badges |
| pipeline_runs | 11 | AI pipeline execution log |
| fetcher_runs | 10 | Self-governing cooldown state |

### Secrets (Wrangler)

- `ANTHROPIC_KEY` — AI pipeline (required)
- `NEWSDATA_KEY` — NewsData.io fetcher (required)
- `CONGRESS_KEY` — Congress.gov fetcher (required)
- `COURTLISTENER_TOKEN` — CourtListener (optional, works without)
- `LEGISCAN_KEY` — Not set, pending API key approval

---

## What's Working

### Data Fetchers (11 active, cron `*/15 * * * *`)

Each fetcher self-governs its cooldown via the `fetcher_runs` table. All use shared utilities from `fetcher-utils.js` (ET timezone, cooldowns, entity decoding, URL normalization, game-noise filtering, keyword categorization, fuzzy headline dedup).

| Fetcher | Source | Table | Cooldown | Auth |
|---------|--------|-------|----------|------|
| `fetch-google-news.js` | Google News RSS (19 queries) | headlines | 15–30 min | None |
| `fetch-bing-news.js` | Bing News RSS (15 queries) | headlines | 15–30 min | None |
| `fetch-newsdata.js` | NewsData.io API (13 queries) | headlines | 30–480 min | NEWSDATA_KEY |
| `fetch-ncaa-rss.js` | NCAA.com RSS (3 feeds) | headlines | 15–30 min | None |
| `fetch-congress.js` | Congress.gov API | bills | 240 min | CONGRESS_KEY |
| `fetch-courtlistener.js` | CourtListener RECAP API | cases | 120–240 min | Optional token |
| `fetch-nil-revolution.js` | Troutman Pepper blog RSS | headlines | 120 min | None |
| `fetch-publications.js` | 8 RSS feeds (Sportico, FOS, BOCS, ESPN, etc.) | headlines | 30 min | None |
| `fetch-cslt.js` | College Sports Litigation Tracker (scrape) | cases, case_updates | 360 min | None |
| `fetch-podcasts.js` | 5 podcast RSS feeds | podcast_episodes | 360 min | None |
| `fetch-gdelt.js` | GDELT DOC 2.0 API | gdelt_volume | 360 min | None |

All fetchers active 6 AM–10 PM ET, skip overnight.

### AI Pipeline (cron `0 11,21 * * *` — 6 AM / 4 PM ET)

Uses `claude-sonnet-4-5-20250929`. Four tasks:

1. **Tag untagged headlines** — assigns category + severity + CSC sub-tag (batches of 50)
2. **Extract deadlines** — finds future dates from headlines + case data, deduplicates against existing
3. **Detect CSC activity** — keyword pre-filter → Claude sub-tagging, event-level dedup
4. **Generate briefing** — 4-section format, morning avoids yesterday's content, afternoon carries forward important items

### API Endpoints (all at `/api/*`)

| Endpoint | What it returns |
|----------|----------------|
| `/api/cases` | Active cases sorted by soonest upcoming date |
| `/api/cases/:id` | Single case detail |
| `/api/cases/updates` | Latest 15 case updates |
| `/api/case-updates` | Latest 50 case updates (legacy) |
| `/api/headlines?limit=N&cat=X` | Headlines, newest first |
| `/api/deadlines` | Future deadlines, sorted ASC |
| `/api/house` | House Settlement key-value pairs |
| `/api/briefing` | Latest AI briefing |
| `/api/bills?state=X` | Bills (empty until LegiScan) |
| `/api/headline-counts` | 30-day daily counts |
| `/api/last-run` | Last pipeline run timestamp |
| `/api/csc` | CSC activity feed (latest 20) |
| `/api/gdelt-volume` | 30-day article counts + total + avg |
| `/api/podcasts` | Podcast freshness dates |
| `/api/trigger?phase=fetch\|ai\|all` | Manual trigger (dev/admin) |

### Frontend — Live Data Connections

These sections fetch real data from the API:

- **Briefing panel** — `/api/briefing`, shows AM/PM header with timestamp, falls back to `MOCK.briefing`
- **Headlines feed** — `/api/headlines?limit=100`, auto-refreshes every 2 minutes, falls back to `MOCK.headlines`
- **The Courtroom** — `/api/cases`, grouped by `case_group`, expandable detail with court/judge/dates
- **GDELT news volume chart** — `/api/gdelt-volume`, SVG area chart with 30-day data
- **Podcasts sidebar** — `/api/podcasts` for NEW badges (episode within 48h), Spotify iframe embeds

### Frontend — Static/Local Data

- **State NIL Legislation Map** — `src/nil-state-data.json` (static, from Troutman Pepper). Interactive map with callout labels for small states (MD, DE, NJ, CT, RI). Centered overlay card on click showing all provision sections expanded.

---

## What's NOT Working / Missing

### Mock data still rendered

- **`MOCK.briefing`** — used as fallback when API returns no briefing. Not a bug, but the mock content is stale placeholder text.
- **`MOCK.headlines`** — used as fallback when API returns no headlines. Same caveat.
- **`MOCK.timeline`** — 10 hardcoded events. Defined in MOCK but **never rendered** on the page. The Events Timeline section from the original IA is not implemented.
- **`MOCK.kpis`** — 5 KPI cards. Defined in MOCK but **never rendered**. KPI strip was removed from the dashboard design.
- **`MOCK.xFeed`** — 6 fake tweets. Defined in MOCK but **never rendered**. The X sidebar embed was planned but not connected.

### Panels not rendered (API exists, frontend doesn't call it)

- **Deadlines panel** — `/api/deadlines` works, seed data loaded, no panel on Monitor page
- **House Settlement panel** — `/api/house` works, seed data loaded, no panel on Monitor page
- **CSC Command Center** — `/api/csc` works, 11 items in DB, no panel on Monitor page
- **Bills / State Tracker live data** — `/api/bills` works but returns 0 rows; States page uses static JSON

### Data gaps

- **LegiScan fetcher** — not built; `LEGISCAN_KEY` pending approval. The `bills` table has 0 state bill rows. `fetch-congress.js` covers federal bills only (also 0 rows currently — NIL-related federal bills may simply not exist in the 119th Congress yet).
- **CourtListener** — effectively dormant. CSLT is now the primary case source. CL only supplements with filing activity if docket IDs are manually mapped. No docket IDs are currently mapped.

### Known Issues

- **`pipeline_runs` schema drift** — Remote DB may have column named `events_created` while `schema.sql` and `ai-pipeline.js` use `headlines_tagged`. Pipeline still runs but column name may be mismatched. Verify with `PRAGMA table_info(pipeline_runs)` if issues arise.
- **GDELT fetcher error handling** — Errors now throw (for diagnostic visibility in trigger log) rather than silently returning. This is intentional after debugging but means a GDELT API outage would show as an error in the trigger response.
- **No multi-page routing** — The build spec envisioned separate pages (Monitor, States, Cases, Headlines, About). The app is a single scrollable dashboard with an info modal. All content is in `MonitorPage`.
- **Sidebar is podcasts only** — The X List embed (`X_LIST_URL` configured) and Kalshi prediction markets were planned but are not rendered. Sidebar contains only `<PodcastsSection />`.

---

## Design System

Design tokens in the `T` object at top of `App.jsx`:

- **Fonts:** Geist Sans (body), Geist Mono (data/timestamps)
- **Colors:** Navy nav (`#0f1729`), off-white bg (`#f1f3f7`), coral accent (`#DC4A2D`), category-specific colors in `CAT_COLORS`
- **Aesthetic:** Bloomberg terminal meets news app. Dense, glanceable. No decoration for decoration's sake.

---

## Cron Schedule

From `wrangler.toml`:

```
crons = ["*/15 * * * *", "0 11,21 * * *"]
```

- `*/15 * * * *` — All 11 fetchers fire (each self-governs via cooldown table)
- `0 11,21 * * *` — AI pipeline (11:00 UTC = 6 AM ET, 21:00 UTC = 4 PM ET), always includes briefing

---

## File Map

```
src/
  App.jsx              — Entire frontend (single file)
  nil-state-data.json  — Static state legislation data
  main.jsx             — React entry point
workers/
  index.js             — Worker entry: routes fetch→API, cron→fetchers/AI
  api.js               — All /api/* endpoints
  ai-pipeline.js       — 4-task AI pipeline (tag, deadlines, CSC, briefing)
  fetcher-utils.js     — Shared: cooldowns, dedup, noise filter, categorization
  rss-parser.js        — Regex-based RSS parser (no DOMParser in Workers)
  fetch-google-news.js — Google News RSS
  fetch-bing-news.js   — Bing News RSS
  fetch-newsdata.js    — NewsData.io API
  fetch-ncaa-rss.js    — NCAA.com RSS
  fetch-congress.js    — Congress.gov API
  fetch-courtlistener.js — CourtListener RECAP (dormant)
  fetch-nil-revolution.js — Troutman Pepper blog RSS
  fetch-publications.js — 8 publication RSS feeds
  fetch-cslt.js        — College Sports Litigation Tracker scraper
  fetch-podcasts.js    — Podcast RSS freshness
  fetch-gdelt.js       — GDELT news volume API
functions/
  api/[[path]].js      — Pages Function proxy (/api/* → Worker)
schema.sql             — D1 schema (12 tables)
seed.sql               — House Settlement metrics + pre-loaded deadlines
docs/
  NIL-Monitor-Build-Spec.md  — Original build plan
  NIL-Monitor-Revised-IA.md  — Information architecture
.github/workflows/
  deploy.yml           — Auto-deploy on push to main
```

---

## What to Build Next

Priority order based on impact and readiness:

1. **Wire up existing API endpoints to Monitor page** — Deadlines, House Settlement, and CSC panels all have working APIs with data. Pure frontend work.
2. **Events Timeline** — Needs `events` table, AI extraction task, `/api/events` endpoint, and frontend panel. Biggest remaining mock section.
3. **X List embed in sidebar** — URL configured, just needs an iframe. Quick win.
4. **LegiScan fetcher** — Blocked on API key. Populates the entire state bill tracker.
5. **Clean up dead MOCK data** — Remove `MOCK.kpis`, `MOCK.timeline`, `MOCK.xFeed` once their replacements are live.
