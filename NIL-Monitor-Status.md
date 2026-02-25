# NIL Monitor — Project Status

> Last audited: 2026-02-24 from source files, deployed endpoints, and conversation history.

## Architecture

```
Browser → nilmonitor.com (Cloudflare Pages)
           └── /api/* → Pages Function proxy → nil-monitor-api.mgreinhart.workers.dev
                                                  ├── api.js (JSON endpoints + admin dashboard)
                                                  ├── 11 fetchers (cron, self-governing cooldowns)
                                                  ├── ai-pipeline.js (Claude Sonnet tagging/briefings)
                                                  └── D1: nil-monitor-db
```

- **Frontend:** Single-file React app (`src/App.jsx`, ~1600 lines), Vite build, Cloudflare Pages
- **Backend:** Cloudflare Worker (`workers/index.js` entry), D1 SQLite database
- **AI Pipeline:** `workers/ai-pipeline.js`, Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`) via Anthropic API
- **Proxy:** `functions/api/[[path]].js` — Pages Function forwards `/api/*` to Worker
- **CI/CD:** `.github/workflows/deploy.yml` — push to main deploys both Worker and Pages (~2 min)
- **Domain:** nilmonitor.com (Cloudflare Pages custom domain)

### URLs

| URL | Purpose |
|-----|---------|
| `https://nilmonitor.com` | Production frontend |
| `https://nil-monitor-api.mgreinhart.workers.dev` | Worker API (direct) |
| `https://nilmonitor.com/api/admin` | Admin status dashboard (HTML) |
| `https://nilmonitor.com/api/trigger?phase=...` | Manual trigger endpoint |

### D1 Database

ID: `c205339b-2bde-4f06-ab64-bedef8db1f53`, name: `nil-monitor-db`

| Table | Purpose |
|-------|---------|
| `headlines` | News articles from all fetchers, AI-tagged with category/severity |
| `cases` | Litigation from CSLT scraper |
| `case_updates` | Latest/previous updates from CSLT |
| `deadlines` | AI-extracted + 6 pre-loaded seed deadlines |
| `csc_activity` | AI-detected CSC items |
| `briefings` | AI-generated daily briefings (keyed by date) |
| `bills` | Federal bills (Congress.gov); no state bills (LegiScan blocked) |
| `house_settlement` | Key settlement metrics (7 seed rows) |
| `gdelt_volume` | Daily article counts for GDELT news volume chart |
| `podcast_episodes` | Latest episode dates for 5 podcasts |
| `cslt_key_dates` | Curated monthly dates from CSLT homepage |
| `pe_deals` | Private equity deals in college athletics (10 rows) |
| `pipeline_runs` | AI pipeline execution log |
| `fetcher_runs` | Self-governing cooldown state for 11 fetchers |

### Secrets (Wrangler)

| Secret | Status | Used by |
|--------|--------|---------|
| `ANTHROPIC_KEY` | Set | AI pipeline (required) |
| `NEWSDATA_KEY` | Set | NewsData.io fetcher (required) |
| `CONGRESS_KEY` | Set | Congress.gov fetcher (required) |
| `COURTLISTENER_TOKEN` | Set | CourtListener (optional, works without) |
| `LEGISCAN_KEY` | **Not set** | Pending API key approval |

---

## What's Working

### Data Fetchers (11 active, cron `*/15 * * * *`)

Each fetcher self-governs its cooldown via the `fetcher_runs` table. All use shared utilities from `fetcher-utils.js` (ET timezone, cooldowns, entity decoding, URL normalization, game-noise filtering, keyword categorization, relevance gating, fuzzy headline dedup cache).

| Fetcher | Source | Queries/Feeds | Table | Cooldown | Auth |
|---------|--------|---------------|-------|----------|------|
| `fetch-google-news.js` | Google News RSS | 31 queries | headlines | 15–30 min | None |
| `fetch-bing-news.js` | Bing News RSS | 25 queries | headlines | 15–30 min | None |
| `fetch-newsdata.js` | NewsData.io API | 14 queries | headlines | 30–60 min | `NEWSDATA_KEY` |
| `fetch-ncaa-rss.js` | NCAA.com RSS | 3 feeds | headlines | 15–30 min | None |
| `fetch-congress.js` | Congress.gov API | — | bills | 240 min | `CONGRESS_KEY` |
| `fetch-courtlistener.js` | CourtListener RECAP | — | cases | 120–240 min | Optional token |
| `fetch-nil-revolution.js` | Troutman Pepper blog RSS | 1 feed | headlines | 120 min | None |
| `fetch-publications.js` | 9 publication RSS feeds | 9 feeds | headlines | 30 min | None |
| `fetch-cslt.js` | College Sports Litigation Tracker (scrape) | 2 pages | cases, case_updates, cslt_key_dates | 360 min | None |
| `fetch-podcasts.js` | 5 podcast RSS feeds | 5 feeds | podcast_episodes | 360 min | None |
| `fetch-gdelt.js` | GDELT DOC 2.0 API | 1 query | gdelt_volume | 360 min | None |

All fetchers active 6 AM–10 PM ET, skip overnight. In-memory dedup cache pre-loaded before fetchers run, cleared after.

**Publication feeds (9):** Business of College Sports, AthleticDirectorU, Sportico, Front Office Sports, Sports Litigation Alert, CBS Sports, ESPN, On3, NYT

**Relevance gate:** All headline fetchers run `isTitleRelevant()` — strict regex check for NIL, NCAA, college athletics, transfer portal, revenue sharing, etc. Game recaps, recruiting noise, and irrelevant content are filtered before DB insert.

### AI Pipeline (cron `0 11,21 * * *` — 6 AM / 4 PM ET)

Uses `claude-sonnet-4-5-20250929`, 4096 max tokens per response. Three active tasks:

1. **Tag untagged headlines** — Assigns category + severity + CSC sub-tag. Batches of 50 headlines. 9 categories defined in prompt.
2. **Detect CSC activity** — Keyword pre-filter on headlines → Claude sub-tagging (Guidance, Investigation, Enforcement, Personnel, Rule Clarification). Event-level dedup.
3. **Generate briefing** — 4-section format. CFO/COO institutional voice. 36-hour recency window on `published_at`. Source tiering (Tier 1–4). Headline deduplication before sending to Claude (>0.5 similarity threshold). Non-ASCII validation on output. Date computed in ET (not UTC).

#### Headline Categories (9 total)

| Category | Scope |
|----------|-------|
| Legislation | Federal/state bills, hearings, votes, enacted laws, regulatory proposals |
| Litigation | Court filings, rulings, settlements, lawsuits, injunctions |
| NCAA Governance | NCAA rule changes, board decisions, policy updates, restructuring |
| CSC / Enforcement | College Sports Commission actions, investigations, guidance, enforcement |
| Revenue Sharing | House settlement mechanism ($20.5M cap), participation agreements, trust structures |
| Business / Finance | Athletic budgets, deficits, PE investments, conference revenue, media rights, facility financing |
| Roster / Portal | Transfer portal, roster rules, eligibility, waivers, scholarship limits |
| Realignment | Conference membership changes, media rights deals, expansion/contraction |
| Off-Topic | Not about college athletics (filtered from display and API responses) |

#### Source Tiering (briefing quality)

| Tier | Sources |
|------|---------|
| 1 (premium) | ESPN, USA Today, The Athletic, Sportico, AP, Reuters, SI, CBS Sports, FOS, NYT, WaPo, WSJ |
| 2 (quality analysis) | Extra Points, Business of College Sports, NIL Revolution, On3, 247Sports, Yahoo Sports |
| 3 (default) | Everything not in Tier 1, 2, or 4 |
| 4 (deprioritized) | AfroTech, TheDetroitBureau, Africa.com |

#### Briefing Voice

- CFO/COO perspective with financial context and peer comparisons
- Institutional risk lens: every item must answer "Does this require action, awareness, or preparation?"
- Connects dots across related stories (PE deal + school deficit in same cycle)
- Excludes routine roster/game news, individual transfers, game results
- Focuses on enforcement, regulation, court rulings, policy, financial signals

### API Endpoints (all at `/api/*`)

| Endpoint | Returns | Notes |
|----------|---------|-------|
| `/api/cases` | Active cases sorted by soonest upcoming date | Grouped by case_group |
| `/api/cases/:id` | Single case detail | Full case object |
| `/api/cases/updates` | Latest 15 case updates | |
| `/api/case-updates` | Latest 50 case updates | Legacy endpoint |
| `/api/headlines?limit=N&cat=X` | Headlines, newest first | Excludes Off-Topic by default |
| `/api/deadlines` | Future deadlines, sorted ASC | |
| `/api/house` | House Settlement key-value pairs | |
| `/api/briefing` | Latest AI briefing | Returns `{ date, content, generated_at }` |
| `/api/bills?state=X` | Bills | Empty until LegiScan |
| `/api/headline-counts` | 30-day daily headline counts | |
| `/api/last-run` | Last pipeline run timestamp | |
| `/api/csc` | CSC activity feed (latest 20) | |
| `/api/coverage-intel` | 14-day category breakdown, source breadth | Excludes Off-Topic |
| `/api/gdelt-volume` | 30-day article counts + total + avg | |
| `/api/podcasts` | Podcast freshness dates | spotify_id + latest_date |
| `/api/pe-tracker` | Private equity deals | Sorted by announced_date DESC |
| `/api/cslt-key-dates` | CSLT curated monthly dates | |
| `/api/admin` | HTML admin dashboard | Fetcher status, metrics, issues |
| `/api/trigger?phase=...` | Manual trigger | See trigger phases below |

#### Trigger Phases

| Phase | Action |
|-------|--------|
| `fetch` | Run all 11 fetchers (with dedup cache) |
| `ai` | Run AI pipeline (full, with briefing) |
| `all` | Run both fetch + ai sequentially |
| `retag` | Clear all headline tags + re-run AI pipeline (200 per pass) |
| `fix-briefing-date` | Delete future-dated briefings (UTC/ET mismatch artifact) |
| `seed-pe` | Create pe_deals table + insert 10 deals |

### Frontend — Live Data Connections

These sections fetch real data from the API:

- **Briefing panel** — `/api/briefing`, branded "NIL MONITOR NEWS BRIEF" with collapsible sections, falls back to `MOCK.briefing`
- **Headlines feed** — `/api/headlines?limit=100`, category filter pills, 8 per page, Off-Topic excluded, fuzzy dedup (word overlap >0.6)
- **The Courtroom** — `/api/cases` + `/api/cslt-key-dates`, Key Dates with countdown, Recent Activity (expandable), link to full CSLT tracker
- **Coverage Intelligence** — `/api/coverage-intel`, 4 stat cards (Coverage Shift, Dominant Topic, Source Breadth, Quiet Zone) + stacked area chart with 8 categories
- **PE Tracker** — `/api/pe-tracker`, compact deal list (dead deals filtered), status badges
- **Podcasts sidebar** — `/api/podcasts` for freshness sorting, Spotify iframe embeds, 24h highlight

### Frontend — Static/Local Data

- **State NIL Legislation Map** — `src/nil-state-data.json` (static, from Troutman Pepper Feb 2026). Interactive choropleth via `react-simple-maps`. Enacted states in accent orange, no-law states in gray. Click opens centered overlay with status badge, detail text, and provision sections.

### Sidebar Content

**Podcasts (5, sorted by most recent episode):**

| Name | Spotify ID |
|------|-----------|
| Highway to NIL | `1Pju07vvKyIqEZOGDNaMMD` |
| NIL Clubhouse | `3AbKOjnxZaBLs9VVfujToU` |
| SBJ Morning Buzzcast | `0NOi7MnlTRMfb3Dv17DOaP` |
| One Question Leadership | `6QmP0ZLPAiEG7iqhywSURD` |
| The Standard | `30VL73UUR59yLZfagH1Rzv` |

**X List Preview Card:**
- 7 key accounts shown: @PeteThamel (ESPN), @RossDellenger (Yahoo), @NicoleAuerbach (Athletic), @D1ticker, @DarrenHeitner (NIL Legal), @achristovichh (FOS), @Sportico
- Links to full list: `https://x.com/i/lists/2024695913898528822`

### Resources Panel (5 categorized groups)

| Group | Links |
|-------|-------|
| **Legal & Compliance** | College Sports Litigation Tracker, Troutman Pepper NIL Tracker, NIL Revolution Blog |
| **Data & Research** | Knight-Newhouse College Athletics Database, nil-ncaa.com, On3 NIL Valuations |
| **Governance & Policy** | NCAA.org Governance, Congress.gov (NCAA search) |
| **Industry** | AthleticDirectorU, NACDA, D1.ticker, Front Office Sports |
| **Follow** | NIL Monitor X List |

### PE Tracker (10 deals seeded)

| Investor | Target | Status |
|----------|--------|--------|
| Otro Capital | University of Utah | announced |
| CAS (RedBird + Weatherford) | Big 12 Conference | pending |
| CVC Capital Partners | Big 12 Conference | dead (hidden) |
| UC Investments | Big Ten Conference | on_hold |
| Sixth Street | Florida State | dead (hidden) |
| Arctos Partners | Florida State | dead (hidden) |
| Elevate / Velocity / Texas PSF | Multiple schools | announced |
| TBD (BAGS Initiative) | Boise State | exploring |
| Clearlake / Charlesbank / Fortress | Learfield (~200 schools) | closed |
| KKR | Arctos Partners (acquisition) | announced |

Dead deals are filtered from display. 7 visible on the frontend.

### House Settlement Seed Data

| Key | Value |
|-----|-------|
| phase | Final Approval Pending |
| hearing_date | 2026-03-12 |
| rev_share_cap | $20.5M |
| cap_adjustment_date | 2026-07-01 |
| back_damages_total | $2.78B |
| back_damages_distributed | $0 |
| opted_in | 62/70 |

---

## What's NOT Working / Missing

### Panels not rendered (API exists, frontend doesn't call it)

- **Deadlines panel** — `/api/deadlines` works, seed data loaded, no panel on Monitor page
- **House Settlement panel** — `/api/house` works, seed data loaded, no panel on Monitor page
- **CSC Command Center** — `/api/csc` works, items in DB, no dedicated panel on Monitor page
- **Bills / State Tracker live data** — `/api/bills` works but returns 0 rows; States page uses static JSON

### Data gaps

- **LegiScan fetcher** — not built; `LEGISCAN_KEY` pending approval. The `bills` table has 0 state bill rows. `fetch-congress.js` covers federal bills only (also 0 rows — NIL-related federal bills may not exist in the 119th Congress yet).
- **CourtListener** — effectively dormant. CSLT is now the primary case source. CL fetcher runs but skips all cases because CSLT `case_number` format doesn't match CL's numeric docket IDs. No mapping table exists. To re-enable: build CSLT-to-CL docket ID mapping.
- **Deadline extraction** — Referenced in `pipeline_runs` schema but no `createDeadlines()` function exists in `ai-pipeline.js`. Only pre-loaded seed deadlines exist.
- **Case summaries** — Referenced in schema design but not implemented in AI pipeline.

### Mock data still defined

- **`MOCK.briefing`** — fallback when API returns no briefing (stale placeholder text)
- **`MOCK.headlines`** — fallback when API returns no headlines
- **`MOCK.timeline`** — 10 hardcoded events, defined but **never rendered**
- **`MOCK.kpis`** — 5 KPI cards, defined but **never rendered**
- **`MOCK.xFeed`** — 6 fake tweets, defined but **never rendered**

### Known Issues

- **No multi-page routing** — Build spec envisioned separate pages (Monitor, States, Cases, Headlines, About). The app is a single scrollable dashboard with an info modal.
- **GDELT error handling** — Errors throw for diagnostic visibility in trigger log. GDELT API outage shows as error in trigger response. Intentional.
- **Knight-Newhouse link** — `knightnewhousedata.org` returns 403 to automated requests (bot blocking). Works in browsers. Link is correct.

---

## Changes This Session (2026-02-24)

### Briefing Quality (ai-pipeline.js)

1. **Source tiering** — Added 4-tier source classification. Tier 1 (ESPN, AP, WSJ, etc.) prioritized; Tier 4 (AfroTech, etc.) deprioritized. Briefing dedup keeps highest-tier version of similar headlines.
2. **36-hour recency window** — Changed from variable 14h/24h lookback to fixed 36-hour window on `published_at`. Prevents old articles picked up late by aggregators from polluting briefings.
3. **Headline deduplication before Claude** — New `deduplicateHeadlines()` function: tier-sorts, removes >0.5 similarity matches, re-sorts by severity. Prevents Claude from seeing 3 versions of the same story.
4. **Briefing voice change** — From "sharp deputy AD" to CFO/COO with financial context, peer comparisons, institutional risk lens, and action orientation.
5. **Non-ASCII validation** — Strips CJK/Arabic/etc. characters from Claude response, collapses whitespace. 2-attempt retry loop.
6. **Briefing date fix** — Changed from `new Date().toISOString().split('T')[0]` (UTC) to `toLocaleDateString('en-CA', { timeZone: 'America/New_York' })` (ET). Fixed "Latest available" mismatch when UTC was ahead of ET.

### Headline Tagging (ai-pipeline.js)

7. **Precise category definitions** — Rewrote `TAG_SYSTEM_PROMPT` with exact scopes for all 9 categories plus disambiguation examples (Revenue Sharing vs NIL deals, Business/Finance vs Revenue Sharing).
8. **Off-Topic category** — New category for non-college-sports headlines. Filtered from all API responses (`AND category != 'Off-Topic'`) and frontend display.
9. **Business / Finance category** — New category for athletic budgets, deficits, PE investments, conference revenue, media rights, facility financing, naming rights, donor economics.
10. **Retag trigger** — Added `phase=retag` to clear all tags and re-run pipeline. Used to retag all ~941 headlines after category changes.

### Frontend (App.jsx)

11. **Coverage Intelligence stat cards** — Normalized to design system: all values dark navy (T.text), labels 9px uppercase #7c8698 JetBrains Mono, values 14px bold, sublabels 10px. Removed green/red color indicators.
12. **Podcast swap** — Replaced "The Portal" with "SBJ Morning Buzzcast" (Spotify ID `0NOi7MnlTRMfb3Dv17DOaP`).
13. **Podcast sort** — Changed from static order with 24h-fresh promotion to always sorted by most recent episode date.
14. **Headline dedup (frontend)** — Fuzzy title matching with word overlap >0.6 threshold before display.
15. **X-axis chart labels** — Moved from `<div>` with `justifyContent: space-between` to SVG `<text>` elements at exact data point x-coordinates. Labels now align with chart data.
16. **PE Tracker panel** — New panel with 10 researched PE deals. Compact list with investor, target, amount, status badge. Dead deals filtered. Side-by-side with Resources in 2-column grid.
17. **Resources reorganization** — Replaced flat link list with 5 categorized groups (Legal & Compliance, Data & Research, Governance & Policy, Industry, Follow). 15 links total.
18. **Removed hidden scroll** — PE Tracker had `maxHeight: 320` with no scroll indicator. Removed constraint.
19. **NCAA governance link fix** — Changed from 404 URL (`/sports/2023/2/14/governance.aspx`) to working URL (`/sports/governance`).
20. **Info page edit** — Removed "overnight" from tagline.

### Schema & Data

21. **pe_deals table** — Added to `schema.sql` with investor, target, conference, amount, announced_date, status, terms_summary, source_url.
22. **PE seed data** — 10 deals added to `seed.sql` covering Otro Capital, CAS/RedBird, CVC, UC Investments, Sixth Street, Arctos, Elevate, BAGS/Boise State, Learfield recapitalization, KKR/Arctos acquisition.
23. **seed-pe trigger** — Added `phase=seed-pe` to create table and insert deals via API.

### Workers

24. **Podcast fetcher** — Updated `fetch-podcasts.js` to replace The Portal with SBJ Morning Buzzcast feed URL and Spotify ID.
25. **Off-Topic API filters** — Added `AND category != 'Off-Topic'` to all 5 coverage-intel queries and default headlines query in `api.js`.

---

## Architecture Decisions

1. **CSLT over CourtListener** — CSLT is the primary case data source. CourtListener is dormant (no docket ID mapping). CSLT provides richer metadata (case groups, upcoming dates, status summaries, updates).
2. **Source tiering in briefing** — Rather than filtering low-quality sources entirely, tier them so Claude can prioritize. Tier 4 sources still included if they have unique coverage.
3. **Off-Topic as a category** — Rather than expanding the noise filter, let Claude tag irrelevant headlines as "Off-Topic" so they're excluded from stats and display but remain in the database for audit.
4. **Static state legislation data** — `nil-state-data.json` from Troutman Pepper, not a live fetcher. Updated manually when legislation changes. LegiScan would automate this but is blocked on API key.
5. **PE deals are manually seeded** — Small, known dataset (~10-15 deals). Updated via `seed.sql` when news breaks. No automated fetcher needed.
6. **Single-file frontend** — `App.jsx` contains all components, styling, and logic. No routing library. Keeps deployment simple and avoids build complexity.
7. **ET dates for briefings** — Briefing dates use `America/New_York` timezone, not UTC. Prevents "Latest available" mismatch when UTC is ahead of ET.
8. **Frontend dedup separate from backend** — Headlines are deduped at insert time (URL normalization + title similarity in `fetcher-utils.js`), again before briefing generation (source-tiered dedup), and again before frontend display (word overlap >0.6). Three layers catch different cases.

---

## Headline Filtering Rules (full pipeline)

1. **Relevance gate** (`fetcher-utils.js: isTitleRelevant`) — Strict regex match for NIL, NCAA, college athletics, transfer portal, revenue sharing, etc. Applied by all headline fetchers. Rejects anything that doesn't match.
2. **Game noise filter** (`fetcher-utils.js: isGameNoise`) — Rejects game recaps, brackets, draft coverage, recruiting noise. Business signals (NIL, NCAA governance, CSC, revenue sharing, legislation, antitrust) always pass through.
3. **URL dedup** — `headlines.url` has UNIQUE constraint. URLs normalized (strip UTM params, fragments, www, trailing slashes).
4. **Title dedup at insert** — In-memory cache of 7-day titles. Exact match + normalized fuzzy match prevent near-duplicates.
5. **AI tagging** — Claude assigns category + severity. Off-Topic tagged for non-college-sports content.
6. **Off-Topic exclusion** — API queries exclude `category = 'Off-Topic'` from headlines, coverage-intel, and stats.
7. **Frontend dedup** — Word overlap >0.6 against already-displayed headlines. Catches aggregator copies that passed URL dedup.

---

## GDELT Integration

- **Status:** Working
- **Fetcher:** `fetch-gdelt.js`, runs every 6 hours (6 AM–10 PM ET)
- **API:** GDELT DOC 2.0 (free, no auth)
- **Query:** `(NIL OR "name image likeness" OR NCAA OR "transfer portal" OR "college athlete" OR "revenue sharing" OR "House v NCAA" OR "private equity" "college sports")`
- **Data:** 30-day rolling daily article counts → `gdelt_volume` table
- **Frontend:** Not directly charted (Coverage Intelligence uses its own headline counts). GDELT volume available at `/api/gdelt-volume` but not currently displayed on the dashboard.

## CSLT Integration

- **Status:** Working, primary case data source
- **Fetcher:** `fetch-cslt.js`, runs every 6 hours (6 AM–10 PM ET)
- **Scrapes:** Tracker page (full case metadata) + homepage (monthly key dates)
- **Case data:** name, case_group, court, judge, case_number, filed_date, last_event_text/date, status_summary, description, upcoming_dates (JSON array)
- **Updates:** Extracts "Latest Updates" and "Previous Updates" sections → `case_updates` table
- **Key dates:** Monthly curated dates → `cslt_key_dates` table (DELETE + INSERT per month)
- **Frontend:** The Courtroom panel shows upcoming key dates (top 5 with countdown), recent activity, expandable case detail

## State Legislation Map

- **Status:** Working (static data)
- **Data source:** `src/nil-state-data.json` — manually curated from Troutman Pepper (Feb 2026)
- **Map library:** `react-simple-maps` with US Atlas topology
- **Encoding:** Enacted = accent orange (#DC4A2D), No law = light gray (#e2e5ec)
- **Interaction:** Hover darkens state, click opens centered overlay with status badge, detail text, provision sections
- **Small state labels:** Manual lon/lat positioning for MD, DE, NJ, CT, RI, etc.
- **Attribution:** "Troutman Pepper — State & Federal NIL Legislation Tracker (Feb 2026)"
- **Limitation:** Static data only. Live data blocked on LegiScan API key.

---

## Cost Summary

| Service | Plan | Cost |
|---------|------|------|
| Cloudflare Workers | Free (100K requests/day) | $0 |
| Cloudflare Pages | Free | $0 |
| Cloudflare D1 | Free (5M rows read, 100K rows written/day) | $0 |
| Anthropic API (Sonnet 4.5) | Pay-per-use | ~$1–3/day (2 pipeline runs × ~50 headlines tagged + 1 briefing) |
| NewsData.io | Free tier (200 credits/day) | $0 |
| Congress.gov | Free API key | $0 |
| CourtListener | Free account | $0 |
| GDELT | Free, no auth | $0 |
| Google News RSS | Free | $0 |
| Bing News RSS | Free | $0 |
| Domain (nilmonitor.com) | Cloudflare Registrar | ~$10/year |

---

## Design System

Design tokens in the `T` object at top of `App.jsx`:

- **Fonts:** Geist Sans (body), Geist Mono / JetBrains Mono (data/timestamps/labels)
- **Colors:** Navy nav (`#0f1729`), off-white bg (`#f1f3f7`), coral accent (`#DC4A2D`), muted labels (`#7c8698`)
- **Category colors:** Indigo (Legislation), Blue (Litigation), Purple (NCAA Governance), Red (CSC), Emerald (Revenue Sharing), Orange (Business/Finance), Amber (Roster/Portal), Slate (Realignment)
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
  App.jsx              — Entire frontend (~1600 lines, single file)
  nil-state-data.json  — Static state legislation data (50 states)
  main.jsx             — React entry point
workers/
  index.js             — Worker entry: routes fetch→API, cron→fetchers/AI
  api.js               — All /api/* endpoints + admin dashboard + trigger phases
  ai-pipeline.js       — 3 active AI tasks (tag, CSC detect, briefing)
  fetcher-utils.js     — Shared: cooldowns, dedup cache, noise filter, relevance gate, categorization
  rss-parser.js        — Regex-based RSS parser (no DOMParser in Workers)
  fetch-google-news.js — Google News RSS (31 queries)
  fetch-bing-news.js   — Bing News RSS (25 queries)
  fetch-newsdata.js    — NewsData.io API (14 queries)
  fetch-ncaa-rss.js    — NCAA.com RSS (3 feeds)
  fetch-congress.js    — Congress.gov API
  fetch-courtlistener.js — CourtListener RECAP (dormant)
  fetch-nil-revolution.js — Troutman Pepper blog RSS
  fetch-publications.js — 9 publication RSS feeds
  fetch-cslt.js        — College Sports Litigation Tracker scraper (cases + key dates)
  fetch-podcasts.js    — 5 podcast RSS feeds (freshness check)
  fetch-gdelt.js       — GDELT news volume API
functions/
  api/[[path]].js      — Pages Function proxy (/api/* → Worker)
schema.sql             — D1 schema (14 tables)
seed.sql               — House Settlement metrics + deadlines + PE deals
NIL-Monitor-Status.md  — This file
CLAUDE.md              — Claude Code project instructions
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
2. **Deadline extraction AI task** — Referenced in schema but not implemented. Would auto-extract deadlines from headlines and case data.
3. **Peer Intelligence** — AD compensation, budget comparisons, conference revenue data. Requires research + new data source.
4. **LegiScan fetcher** — Blocked on API key. Would populate the `bills` table and bring the state legislation map to life with real-time data.
5. **CourtListener re-integration** — Build CSLT-to-CL docket ID mapping so filing-level data supplements CSLT case summaries.
6. **Clean up dead MOCK data** — Remove `MOCK.kpis`, `MOCK.timeline`, `MOCK.xFeed` once their replacements are live.
