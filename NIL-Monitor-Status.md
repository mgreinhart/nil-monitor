# NIL Monitor — Project Status

> Last audited: 2026-03-18 from source files (query counts, feed counts, cron schedule, endpoint lists, security patterns verified against actual code).

## Architecture

```
Browser → nilmonitor.com (Cloudflare Pages)
           ├── static assets (index.html, JS bundle, og-image, favicons, robots.txt)
           ├── /api/* → functions/api/[[path]].js → nil-monitor-api.mgreinhart.workers.dev
           │                                         ├── api.js (JSON endpoints + admin + SEO pages)
           │                                         ├── 11 fetcher functions from 10 files (cron)
           │                                         ├── ai-pipeline.js (Claude Sonnet tagging/briefings)
           │                                         └── D1: nil-monitor-db
           └── /news, /briefing/*, /feed.xml, /sitemap.xml
                → functions/[[catchall]].js → Worker (server-rendered HTML)
```

- **Frontend:** Single-file React app (`src/App.jsx`), Vite build, Cloudflare Pages
- **Backend:** Cloudflare Worker (`workers/index.js` entry), D1 SQLite database
- **AI Pipeline:** `workers/ai-pipeline.js`, Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`) via Anthropic API
- **Proxy (API):** `functions/api/[[path]].js` — Pages Function forwards `/api/*` to Worker (includes POST body forwarding)
- **Proxy (SEO):** `functions/[[catchall]].js` — Pages Function forwards `/news`, `/briefing/*`, `/feed.xml`, `/sitemap.xml` to Worker
- **CI/CD:** `.github/workflows/deploy.yml` — push to main deploys both Worker and Pages (~2 min)
- **Domain:** nilmonitor.com (Cloudflare Pages custom domain)
- **Analytics:** Cloudflare Web Analytics (beacon token: `b0217e2a37a248f19d85fb4d814489b4`)

### URLs

| URL | Purpose |
|-----|---------|
| `https://nilmonitor.com` | Production frontend (React SPA) |
| `https://nilmonitor.com/news` | Server-rendered news page (SEO) |
| `https://nilmonitor.com/news/legislation` | Category landing page (8 categories) |
| `https://nilmonitor.com/briefing` | Redirects to latest archived briefing |
| `https://nilmonitor.com/briefing/:date` | Server-rendered briefing archive (24h delay) |
| `https://nilmonitor.com/feed.xml` | RSS feed (supports `?category=` filter) |
| `https://nilmonitor.com/sitemap.xml` | Dynamic sitemap (categories + briefing dates) |
| `https://nilmonitor.com/robots.txt` | Robots file (static, in `public/`) |
| `https://nil-monitor-api.mgreinhart.workers.dev` | Worker API (direct) |
| `https://nilmonitor.com/api/admin` | Admin status dashboard (password protected) |
| `https://nilmonitor.com/api/trigger?phase=...` | Manual trigger endpoint (password protected) |

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
| `podcast_episodes` | Latest episode dates for 6 podcasts |
| `cslt_key_dates` | Curated monthly dates from CSLT homepage |
| `pe_deals` | Private equity deals in college athletics (10 rows) |
| `pipeline_runs` | AI pipeline execution log |
| `portal_snapshot` | CFBD transfer portal aggregate data (one row per day) |
| `preseason_intel` | CFBD returning production + recruiting rankings (one row per year) |
| `fetcher_runs` | Self-governing cooldown state for fetchers |
| `gdelt_volume` | **Legacy, no longer written** — table exists but no fetcher populates it |

### Secrets (Wrangler)

| Secret | Status | Used by |
|--------|--------|---------|
| `ANTHROPIC_KEY` | Set | AI pipeline (required) |
| `NEWSDATA_KEY` | Set | NewsData.io fetcher (required) |
| `CONGRESS_KEY` | Set | Congress.gov fetcher (not currently imported) |
| `COURTLISTENER_TOKEN` | Set | CourtListener (optional, works without) |
| `ADMIN_KEY` | Set | Admin dashboard + trigger auth (required) |
| `CFBD_KEY` | Set | CFBD portal fetcher (required for Portal Pulse) |
| `LEGISCAN_KEY` | **Not set** | Pending API key approval |

---

## What's Working

### Data Fetchers (11 functions from 10 files, four-group cron split)

Each fetcher self-governs its cooldown via the `fetcher_runs` table. All use shared utilities from `fetcher-utils.js` (ET timezone, cooldowns, entity decoding, URL normalization, game-noise filtering, keyword categorization, relevance gating, Jaccard-based headline dedup cache).

**Cron schedule (4 groups — Cloudflare free tier limit is 4 cron triggers):**

| Group | Cron | Fetchers | Notes |
|-------|------|----------|-------|
| A (Google) | `:00, :30` | `fetch-google-news.js` (86 queries) | Heaviest fetcher, isolated |
| B (Bing+Feeds) | `:10, :40` | `fetch-bing-news.js` (57q) + `fetch-publications.js` (23) + `fetch-ncaa-rss.js` (3) + `fetch-newsdata.js` (18) | Added federal legislation + NCAA governance queries |
| C (Light) | `:07, :37` | CourtListener, NIL Revolution, CSLT (×2), Podcasts, CFBD | Lightweight |
| AI Pipeline | `:25` at hours 10,11,19,20 UTC | `ai-pipeline.js` | Checks ET hour for DST |

| Fetcher | Source | Queries/Feeds | Table | Cooldown | Auth |
|---------|--------|---------------|-------|----------|------|
| `fetch-google-news.js` | Google News RSS | 82 queries | headlines | 15–30 min | None |
| `fetch-bing-news.js` | Bing News RSS | 57 queries | headlines | 15–30 min | None |
| `fetch-newsdata.js` | NewsData.io API | 18 queries | headlines | 30–60 min | `NEWSDATA_KEY` |
| `fetch-ncaa-rss.js` | NCAA.com RSS | 3 feeds | headlines | 15–30 min | None |
| `fetch-courtlistener.js` | CourtListener RECAP | — | cases | 120–240 min | Optional token |
| `fetch-nil-revolution.js` | Troutman Pepper blog RSS | 1 feed | headlines | 120 min | None |
| `fetch-publications.js` | 23 publication/conference/gov RSS feeds | 11 Tier 1 + 12 Tier 2 | headlines | 30 min | None |
| `fetch-cslt.js` (cases) | College Sports Litigation Tracker (scrape) | 1 page | cases, case_updates | 360 min | None |
| `fetch-cslt.js` (key dates) | CSLT homepage | 1 page | cslt_key_dates | 360 min | None |
| `fetch-podcasts.js` | 6 podcast RSS feeds | 6 feeds | podcast_episodes | 120 min | None |
| `fetch-cfbd.js` | CollegeFootballData.com API | portal + recruiting | portal_snapshot, preseason_intel | 360–1440 min | `CFBD_KEY` |

All fetchers active 6 AM–10 PM ET, skip overnight. In-memory dedup cache (3-day window) pre-loaded before fetchers run, cleared after.

**CFBD fetcher cooldown rules (football-only, no basketball):**
- Football portal window (Jan 2–24): 6h — portal snapshot only
- Preseason (Aug 1 – Nov 30): 24h — portal snapshot + preseason intel
- All other times: 24h — portal snapshot only

**Note:** `fetch-congress.js` does not exist (never built). The `CONGRESS_KEY` secret is set but unused.

#### Publication Feeds — Three-Tier Filtering Model

**Tier 1 (11 feeds) — Noise filter only (some with relevance gate):**
Business of College Sports, AthleticDirectorU, The Athletic (college sports), LexBlog College Sports, Opendorse (NCAA + NIL, 2 feeds) — these are college-scoped by design, no relevance gate needed. Sportico, Front Office Sports, NLRB (press releases + weekly summaries, 2 feeds), NCAA.org (institutional RSS) — these publish across all sports/topics, so a source-specific relevance gate is applied despite Tier 1 placement to filter out non-college content (VC announcements, pro sports business, general labor, etc.). CollegeAD feed removed — RSS returns 2020-era content only.

**Tier 2 (12 feeds) — Relevance gate + noise filter:**
Sports Litigation Alert, On3, CBS Sports (football + basketball), ESPN (football + basketball), Yahoo Sports, The Athletic (football), Norton Rose Fulbright (global sports law — relevance gate filters non-college), Horizon League, ACC, Big 12

Conference feeds (Horizon League, ACC, Big 12) are in Tier 2 because they produce mostly sports results, not business/governance content.

**Relevance gate:** All headline fetchers (Google News, Bing News, NewsData, NCAA RSS, plus Tier 2 publications) run `isTitleRelevant()` — strict regex check for NIL, NCAA, college athletics, transfer portal, revenue sharing, eligibility, lawsuits, jersey patches, above-cap, athletic fees, media rights, naming rights, premium seating, sponsorship, fundraising, ticket sales, fan rewards, conference governance/self-governance/autonomy/enforcement, AD abbreviation with university context, board of regents with athletics/oversight context, college athletics LLC/ventures/privatization, Athletes.org, executive orders on college sports, SCORE Act, SAFE Act, floor vote/markup/committee vote with college context, NCAA governance bodies (DI Council, DI Board, DI Cabinet, DI Membership Committee, Division I Council/Board/Cabinet/Committee), autonomy subdivision/conference, circumvention penalties — all with college/university/athletic context where required. Tier 1 publication feeds skip the relevance gate (they're business-scoped by design) but still run through the game noise filter. Exception: government/institutional sources (NLRB, NCAA.org) in Tier 1 have a source-specific relevance gate applied because they publish across all topics.

### Headline Deduplication (fetcher-utils.js)

Multi-layer dedup system:
1. **Source suffix stripping** — Strips " - ESPN", " - CBS News", " | Yahoo Sports" etc. from aggregator titles before comparison
2. **Exact title match** — In-memory cache of 3-day titles
3. **Normalized match** — Lowercase, non-alphanumeric stripped, suffix-stripped
4. **Substring containment** — If one normalized title contains the other (both >30 chars)
5. **Jaccard word similarity** — `|A∩B| / |A∪B|` on significant words (>3 chars). Threshold: ≥0.65 (standard), ≥0.45 (if shared proper noun + action context). Catches moderate rewordings of the same headline across different sources.
6. **URL UNIQUE constraint** — Final catch at DB level. URLs normalized (strip UTM params, fragments, www, trailing slashes).

Cache pre-loaded once per cron invocation (`loadDedupCache`) to avoid per-headline DB queries. Updated in-memory as headlines are inserted so parallel fetchers see each other's inserts.

### AI Pipeline (cron `:25` at hours 10,11,19,20 UTC — DST-aware, 6 AM / 3 PM ET)

Fires at all four candidate UTC hours; handler checks actual ET hour and only runs when h=6 or h=15. This ensures correct timing across EST/EDT transitions. Weekend schedule: Saturday = no briefs, Sunday = afternoon only (3 PM ET).

Uses `claude-sonnet-4-5-20250929`, 4096 max tokens per response. Three active tasks:

1. **Tag untagged headlines** — Assigns category + severity + CSC sub-tag. Batches of 50 headlines. 9 categories defined in prompt.
2. **Detect CSC activity** — Keyword pre-filter on headlines → Claude sub-tagging (Guidance, Investigation, Enforcement, Personnel, Rule Clarification). Event-level dedup.
3. **Generate briefing** — 4-section format. CFO/COO institutional voice. Morning: 36-hour recency window. Afternoon: 18-hour window. Source tiering (Tier 1–4). Headline deduplication before sending to Claude (>0.5 similarity threshold). Unicode→ASCII cleanup on output. Date computed in ET (not UTC). Includes CSC/Enforcement priority, University Leadership priority, Legislative Mechanics priority, and Conference Autonomous Governance priority instructions.

#### Headline Categories (9 total)

| Category | Scope |
|----------|-------|
| Legislation | Federal/state bills, hearings, votes, enacted laws, regulatory proposals |
| Litigation | Court filings, rulings, settlements, lawsuits, injunctions |
| NCAA Governance | NCAA rule changes, board decisions, policy updates, restructuring |
| CSC / Enforcement | College Sports Commission actions, investigations, guidance, enforcement |
| Revenue Sharing | House settlement mechanism ($20.5M cap), participation agreements, trust structures |
| Business / Finance | Athletic budgets, deficits, PE investments, conference revenue, media rights, facility financing, NIL marketplace |
| Roster / Portal | Transfer portal, roster rules, eligibility, waivers, scholarship limits |
| Realignment | Conference membership changes, media rights deals, expansion/contraction |
| Off-Topic | Not about college athletics (filtered from display and API responses) |

#### Off-Topic Guardrails (added 2026-03-12)

The tagging prompt now includes explicit rules to prevent recurring mistagging:
1. Headlines containing "NIL" in the title are NEVER Off-Topic — NIL is the core subject
2. College viewership/ratings/attendance = Business / Finance (institutional revenue metrics)
3. Federal government actions affecting college athletics (ICE, charter planes, congressional hearings) are relevant
4. Judge by headline content, not by source outlet
5. Individual NIL deal announcements = Business / Finance, not Off-Topic
6. Off-Topic only for genuinely non-college-athletics content (pro sports, entertainment, non-US sports)

#### Source Tiering (briefing quality)

| Tier | Sources |
|------|---------|
| 1 (premium) | ESPN, USA Today, The Athletic, Sportico, AP, Reuters, SI, CBS Sports, FOS, NYT, WaPo, WSJ |
| 2 (quality analysis) | Extra Points, Business of College Sports, NIL Revolution, On3, 247Sports, Yahoo Sports |
| 3 (default) | Everything not in Tier 1, 2, or 4 |
| 4 (deprioritized) | AfroTech, TheDetroitBureau, Africa.com |

#### Briefing Voice & Prompt Quality Notes

- CFO/COO perspective with financial context and peer comparisons
- Institutional risk lens: every item must answer "Does this require action, awareness, or preparation?"
- Connects dots across related stories (PE deal + school deficit in same cycle)
- Excludes routine roster/game news, individual transfers, game results
- Focuses on enforcement, regulation, court rulings, policy, financial signals
- **CSC/Enforcement priority:** Always high-priority — directly affects institutional compliance obligations
- **University Leadership priority:** President resignations/hirings/firings are high-priority — the president is the AD's boss
- **Legislative Mechanics priority:** Congressional floor vote timelines, vote counts, procedural developments are high-priority
- **Conference Autonomous Governance priority:** Conference-level rulemaking independent of NCAA is high-priority
- **Adjacent Industry:** Sports media mergers/broadcast deals assessed for downstream college athletics implications
- **Anti-repetition rule:** Fetches most recent previous briefing and passes its headlines into the prompt. Avoids repeating items unless there's a material update (new ruling, filing, vote, quantitative change).
- **Source fidelity:** Every briefing item must be directly derived from provided headlines — no invented content or general-knowledge padding
- **Calendar dates are not news:** Known upcoming deadlines are NOT briefing items unless something NEW happened (date changed, motion filed, new statement)
- **Story selection priorities:** AD/coach contract details with revenue-sharing mechanics, CSC deal rejections/arbitration, state governor actions on NIL legislation, conference self-governance discussions are all HIGH-PRIORITY
- **Recency awareness:** Headlines include age tags (e.g., `[3h ago]`). Fresher stories beat older ones unless the older story is significantly more important.

### API Endpoints (all at `/api/*`)

| Endpoint | Returns | Notes |
|----------|---------|-------|
| `/api/cases` | Active cases sorted by soonest upcoming date | `?group=` filter, `?active=0` includes inactive |
| `/api/cases/:id` | Single case detail | Full case object |
| `/api/cases/updates` | Latest 15 case updates | |
| `/api/case-updates` | Latest 50 case updates | Legacy endpoint |
| `/api/headlines?limit=N&cat=X` | Headlines, newest first | Excludes Off-Topic, limit capped at 200 |
| `/api/deadlines` | Future deadlines, sorted ASC | |
| `/api/house` | House Settlement key-value pairs | |
| `/api/briefing` | Latest AI briefing | Returns `{ date, content, generated_at }` |
| `/api/headline-counts` | 30-day daily headline counts | |
| `/api/last-run` | Last pipeline run timestamp | |
| `/api/csc` | CSC activity feed (latest 20) | |
| `/api/podcasts` | Podcast freshness dates | spotify_id + latest_date |
| `/api/portal-pulse` | Latest portal snapshot + mode (live/summary/preseason) | CFBD data |
| `/api/preseason-intel` | Returning production + recruiting rankings | Direct access |
| `/api/pe-tracker` | Private equity deals | Sorted by announced_date DESC |
| `/api/cslt-key-dates` | CSLT curated monthly dates | |
| `/api/admin` | HTML admin dashboard | Cookie auth or `?key=` (redirects to strip key) |
| `/api/admin-login` | POST — validates password, sets HMAC cookie | |
| `/api/trigger?phase=...` | Manual trigger | Cookie auth required |

### SEO Pages (server-rendered HTML, no React)

All served by the Worker via `handleSeoPages()` in `api.js`, proxied from Pages by `functions/[[catchall]].js`.

| Route | Type | Content |
|-------|------|---------|
| `/news` | All headlines | Latest 50 headlines, full meta/OG/structured data |
| `/news/legislation` | Category page | Legislation headlines |
| `/news/litigation` | Category page | Litigation headlines |
| `/news/governance` | Category page | NCAA Governance headlines |
| `/news/csc` | Category page | CSC / Enforcement headlines |
| `/news/revenue-sharing` | Category page | Revenue Sharing headlines |
| `/news/portal` | Category page | Roster / Portal headlines |
| `/news/business` | Category page | Business / Finance headlines |
| `/news/realignment` | Category page | Realignment headlines |
| `/briefing` | Redirect | 302 to latest archived briefing (24h+ old) |
| `/briefing/:date` | Briefing archive | Full briefing with prev/next nav, 24h delay |
| `/feed.xml` | RSS feed | Latest 50 headlines, supports `?category=` |
| `/sitemap.xml` | Dynamic sitemap | /, /news, 8 categories, /briefing, last 30 briefing dates, /feed.xml |

All SEO pages share a common HTML template (`seoPage()`) with:
- Identical CSS, header (logo + nav bar), and footer
- Nav bar with links to Dashboard, All News, 8 categories, and Briefing
- Unique title, meta description, OG tags, Twitter cards, and structured data per page
- Category pages use `CollectionPage` schema; briefings use `Article` schema
- Per-category RSS `<link rel="alternate">` tags

**Briefing 24-hour delay:** Today's briefing returns "available on the live dashboard" with link to nilmonitor.com. Only dates that are 24+ hours old (in ET) are served. This keeps the live briefing as a reason to visit the actual product.

#### Trigger Phases

| Phase | Action |
|-------|--------|
| `fetch` | Run all 11 fetchers (with dedup cache) |
| `tag` | Tag untagged headlines only |
| `ai` | Run AI pipeline (full, with briefing) |
| `all` | Run both fetch + ai sequentially |
| `retag` | Clear all headline tags + re-run AI pipeline (200 per pass) |
| `fix-briefing-date` | Delete future-dated briefings (UTC/ET mismatch artifact) |
| `fix-tags` | Fix 6 specific mistagged Off-Topic headlines → Business / Finance |
| `seed-pe` | Create pe_deals table + insert 10 deals |
| `test-feeds` | Test 5 RSS feed URLs and report status |
| `delete-stale-deadline` | Delete stale "Spring transfer portal window closes" deadlines |

#### Admin Authentication

- `/api/admin` and `/api/trigger` require authentication via `ADMIN_KEY` secret
- Cookie-based auth: HMAC-SHA256 derived session token (HttpOnly, Secure, SameSite=Strict, 24h expiry)
- `?key=` param on `/api/admin`: validates key, sets HMAC cookie, 302 redirects to strip key from URL
- Login form at `/api/admin` via POST to `/api/admin-login`
- If `ADMIN_KEY` is not set, endpoints are open (dev mode)
- Cookie value is an HMAC hash of the admin key, not the raw secret

### Frontend — Live Data Connections

These sections fetch real data from the API:

- **Briefing panel** — `/api/briefing`, branded "NIL MONITOR NEWS BRIEF" with collapsible sections, falls back to `MOCK.briefing`
- **Headlines feed** — `/api/headlines?limit=100`, category filter pills, 8 per page, Off-Topic excluded, fuzzy dedup (word overlap >0.6), auto-refreshes every 2 minutes
- **The Courtroom** — `/api/cases` + `/api/cslt-key-dates`, Key Dates with countdown, Recent Activity (expandable), link to full CSLT tracker
- **Portal Pulse** — `/api/portal-pulse`, three-mode panel (live/summary/preseason) below The Courtroom. Shows portal volume, gainers/losers, or preseason intel depending on season.
- **PE Tracker** — `/api/pe-tracker`, compact deal list (dead deals filtered), status badges
- **Podcasts sidebar** — `/api/podcasts` for freshness sorting, Spotify iframe embeds, 24h highlight

### Frontend — Static/Local Data

- **State NIL Legislation Map** — `src/nil-state-data.json` (static, from Troutman Pepper Feb 2026). Interactive choropleth via `react-simple-maps`. Enacted states in accent orange, no-law states in gray. Click opens centered overlay with status badge, detail text, and provision sections. 51 entries (50 states + DC). 35 enacted, 16 with no law.
- **Small state callout labels** — MD and DC use dashed connector lines from state center to offset label position. DE, NJ, CT, RI have manual positioning with custom offsets.

### Sidebar Content

**Podcasts (6, sorted by most recent episode):**

| Name | Spotify ID |
|------|-----------|
| Highway to NIL | `1Pju07vvKyIqEZOGDNaMMD` |
| NIL Clubhouse | `3AbKOjnxZaBLs9VVfujToU` |
| SBJ Morning Buzzcast | `0NOi7MnlTRMfb3Dv17DOaP` |
| One Question Leadership | `6QmP0ZLPAiEG7iqhywSURD` |
| The Standard | `30VL73UUR59yLZfagH1Rzv` |
| Next Play by Playfly Sports | `3fFqOS7yBgT7n0CcnHVMXk` |

**X List Preview Card (defined but NOT rendered):**
- 7 key accounts: @PeteThamel (ESPN), @RossDellenger (Yahoo), @NicoleAuerbach (Athletic), @D1ticker, @DarrenHeitner (NIL Legal), @achristovichh (FOS), @Sportico
- Links to full list: `https://x.com/i/lists/2024695913898528822`
- `XListEmbed` component exists in `App.jsx` but is orphaned — not called in the render tree

### Resources Panel (5 categorized groups, in main column)

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

## SEO & GEO Optimization (added 2026-03-12)

### index.html Meta Tags

- **Title:** "NIL Monitor — Live College Athletics Regulatory Dashboard"
- **Description:** Comprehensive feature + audience + update frequency summary
- **Keywords:** NIL monitor, NIL tracker, college athletics dashboard, NCAA governance, etc. (16 terms)
- **OG tags:** og:title, og:description, og:type, og:url, og:site_name, og:image
- **Twitter Card:** summary_large_image with title/description/image
- **Structured Data:** WebApplication JSON-LD schema with featureList, audience, pricing (free)
- **Canonical:** https://nilmonitor.com
- **RSS alternate:** `/feed.xml`
- **Theme color:** #0f1729 (navy)

### Favicons

| File | Size | Design |
|------|------|--------|
| `favicon.svg` | 32×32 SVG | Coral rounded rect with "NIL" text |
| `favicon-32x32.png` | 32×32 | Same as SVG |
| `favicon-16x16.png` | 16×16 | Same as SVG |
| `favicon.ico` | Multi-size | 16+32 |
| `apple-touch-icon.png` | 180×180 | Coral pill on navy background |

### OG Image

`public/og-image.png` (1200×630): Dark navy background, coral "NIL" pill + "MONITOR" in white monospace, subtitle "Live College Athletics Regulatory Dashboard", coral accent line, "nilmonitor.com" URL.

### GEO (Generative Engine Optimization)

- `<noscript>` block in `index.html` with full-text description, feature list, and data source attribution for AI crawlers
- Server-rendered `/news` page and category pages give search engines fresh, crawlable content updated every 15 minutes
- `robots.txt` allows all crawlers, points to sitemap
- Dynamic sitemap includes all pages with appropriate changefreq/priority

### Analytics

Cloudflare Web Analytics beacon added to `index.html` (just before `</body>`). Results visible at Cloudflare dashboard → Analytics & Logs → Web Analytics.

---

## What's NOT Working / Missing

### Panels not rendered (API exists, frontend doesn't call it)

- **Deadlines panel** — `/api/deadlines` works, seed data loaded, no panel on Monitor page
- **House Settlement panel** — `/api/house` works, seed data loaded, no panel on Monitor page
- **CSC Command Center** — `/api/csc` works, items in DB, no dedicated panel on Monitor page
- **Bills / State Tracker live data** — `bills` table exists but returns 0 rows; States page uses static JSON

### Removed endpoints

- **Coverage Intelligence** — `/api/coverage-intel` endpoint was removed from api.js. Panel was already removed from frontend.

### Data gaps

- **Congress fetcher** — `fetch-congress.js` does not exist (never built). `CONGRESS_KEY` is set but unused.
- **LegiScan fetcher** — not built; `LEGISCAN_KEY` pending approval. The `bills` table has 0 state bill rows.
- **CourtListener** — effectively dormant. CSLT is now the primary case source. CL fetcher runs but skips all cases because CSLT `case_number` format doesn't match CL's numeric docket IDs. No mapping table exists. To re-enable: build CSLT-to-CL docket ID mapping.
- **Deadline extraction** — Referenced in `pipeline_runs` schema but no `createDeadlines()` function exists in `ai-pipeline.js`. Only pre-loaded seed deadlines exist.
- **Case summaries** — Referenced in schema design but not implemented in AI pipeline.

### Dead code in frontend

- **`MOCK.kpis`** — 5 KPI cards, defined but **never rendered** (no KPI bar exists)
- **`MOCK.timeline`** — 10 hardcoded events, defined but **never rendered**
- **`MOCK.xFeed`** — 6 fake tweets, defined but **never rendered**
- **`XListEmbed` component** — Defined (lines 175-197) but not called in render tree
- **`courtroomOpen` state** — Initialized to `true`, toggle mechanism removed, state variable remains
- **`isWithinHour` function** — Actually checks within 3 hours (10800000ms), name is misleading

### Known Issues

- **No multi-page routing** — Build spec envisioned separate pages (Monitor, States, Cases, Headlines, About). The app is a single scrollable dashboard with an info modal.
- **Knight-Newhouse link** — `knightnewhousedata.org` returns 403 to automated requests (bot blocking). Works in browsers. Link is correct.
- **FOS non-college content** — Front Office Sports is Tier 1 (no relevance gate) because it covers college sports business, but also publishes non-college sports business (Mike Tyson deals, F1, Padres). The game noise filter catches some but not all. These get tagged Off-Topic by the AI pipeline.
- **OpenDNS blocks `*.workers.dev`** — Local dev must use nilmonitor.com, not the Workers.dev URL directly.
- **`fix-tags` trigger phase** — Contains hardcoded IDs for one-time fix of 6 mistagged headlines. Harmless but should be removed in a future cleanup.
- **Podcast cooldown comment stale** — `fetch-podcasts.js` header comment says "every 6 hours" but `getCooldown()` returns `120` (2 hours). Code is correct, comment is wrong.

### GDELT — Removed

GDELT was removed from both backend and frontend. The `gdelt_volume` table still exists in the schema but is no longer written to. The fetcher was removed from `index.js`. The info modal entry, state variable, and fetch call were removed from `App.jsx`. Do not re-attempt — it was noisy global article counts that never surfaced meaningful data.

### Google Trends — Removed

Removed early in development — too heavy. Do not re-attempt.

---

## Changes This Session (2026-03-18)

### Security Hardening (api.js, ai-pipeline.js, functions/api/[[path]].js)

1. **XSS fix: admin dashboard error messages** — Fetcher error messages (from external HTTP responses) are now escaped via `escHtml()` in both the `title` attribute and visible text in the admin dashboard. Previously rendered raw, which could allow stored XSS if an external API returned HTML/JS in an error response.

2. **Admin auth: HMAC-derived session token** — Admin cookie `admin_token` now stores an HMAC-SHA256 derived token instead of the raw `ADMIN_KEY` secret. Uses `crypto.subtle` to derive a deterministic token from the key. No server-side session state needed.

3. **Admin auth: `?key=` redirect** — The `?key=` query param on `/api/admin` still works for login but now immediately 302-redirects to `/api/admin` (stripping the key from the URL) while setting the HMAC cookie. The raw secret no longer persists in the browser bar or history.

4. **SQL parameterization** — `ai-pipeline.js` briefing query replaced `${recencyHours}` template literal interpolation with a computed cutoff timestamp passed via `.bind()`. Not attacker-controlled today, but eliminates a fragile pattern.

5. **CORS split** — Replaced single wildcard CORS with `PUBLIC_CORS` (wildcard, for public API endpoints) and `ADMIN_CORS` (no `Access-Control-Allow-Origin`, for admin/trigger endpoints). Admin endpoints no longer broadcast cross-origin access.

6. **Headlines limit cap** — `/api/headlines?limit=N` now capped at 200 via `Math.min(..., 200)` with NaN fallback to 50. Prevents abusive large queries.

7. **POST body forwarding in proxy** — `functions/api/[[path]].js` now forwards `context.request.body` for non-GET/HEAD requests. The form-based admin login (`/api/admin-login` POST) was silently broken because the proxy only forwarded method + headers, not the body. Both login paths (form POST and `?key=` redirect) now work.

8. **Proxy redirect passthrough** — Added `redirect: 'manual'` to the Pages Function proxy so 302 responses (admin login Set-Cookie redirects) pass through to the browser instead of being followed internally by `fetch()`.

### Coverage Gap Fix: Federal Legislation + NCAA Governance (fetch-google-news.js, fetch-bing-news.js, fetch-publications.js, fetcher-utils.js)

Three recurring D1 ticker stories were confirmed missing: SCORE Act revisions (Politico), DI Membership Committee autonomy subdivision (NCAA.org), DI Cabinet portal circumvention penalties (NCAA.org). Root causes: no SCORE Act query in Google News, no NCAA governance body queries in either fetcher, NCAA.org RSS not in feed list, relevance gate missing SCORE Act and DI governance body terms.

9. **Google News queries (+6, now 82)** — Added: `"SCORE Act" college sports`, `"college sports" legislation Congress`, `"college athletics" "federal legislation" OR "floor vote" OR "markup"`, `"NCAA governance" OR "DI Council" OR "DI Board"`, `NCAA "transfer portal" circumvention OR tampering penalties`, `"DI Cabinet" OR "DI Membership Committee" OR "NCAA subdivision"`.

10. **Bing News queries (+4, now 53)** — Added: `"SCORE Act" revision OR markup OR "floor vote"`, `"college sports" Congress "floor vote" OR hearing OR committee`, `"DI Council" OR "DI Board" OR "DI Cabinet" NCAA`, `"DI Membership Committee" OR "autonomy subdivision" NCAA`.

11. **NCAA.org RSS feed** — Added `https://www.ncaa.org/rss` to `fetch-publications.js` as Tier 1 with relevance gate (same treatment as NLRB). This is the institutional feed from NCAA.org that carries DI Council decisions, DI Board actions, committee votes, and governance announcements. Distinct from ncaa.COM feeds (which are pure sports/event content).

12. **Relevance gate expansion** — Added: `\bscore\s+act\b`, `\bsafe\s+act\b` with college context, `floor\s+vote|markup|committee\s+vote` with college/NCAA context, `\bdi\s+(council|board|cabinet|membership\s+committee)\b`, `\bdivision\s+i\s+(council|board|cabinet|committee)\b`, `autonomy\s+(subdivision|conference)` with NCAA context, `circumvention\s+penalt`. Previously failing headlines now pass: "House GOP leaders working to revise SCORE Act ahead of mid-April floor vote" and "DI Membership Committee discusses creation of autonomy subdivision."

13. **Keyword categorizer expansion** — `categorizeByKeyword()` now instant-tags: SCORE Act / SAFE Act / floor vote → Legislation. DI Council / DI Board / DI Cabinet / Membership Committee / autonomy subdivision → NCAA Governance.

14. **Politico not added** — Investigated Politico RSS (politicopicks.xml, congress.xml). Zero college sports items in current feed. Their SCORE Act coverage reaches us via Google News queries instead. Low yield, high noise — not worth the feed slot.

### Coverage Gap Fix: SBJ / Bird Rights / Revenue Sharing Cap (2026-03-18/19)

Big Ten "Bird rights" revenue-sharing cap story (SBJ exclusive, picked up by CollegeAD/D1 ticker) was missing. Investigation found: SBJ has no working RSS feed (all endpoints return 301). SBJ articles ARE indexed by Google News. CollegeAD RSS is dead (2020-era content). Two of six test headlines failed relevance gate.

15. **Google News queries (+2, now 84)** — Added: `site:sportsbusinessjournal.com college OR NCAA OR NIL` (catches all SBJ college sports articles indexed by Google), `"revenue sharing" cap exception OR exceed OR retention college`.

16. **Bing News queries (+2, now 55)** — Added: `"Sports Business Journal" college OR NCAA OR NIL`, `"revenue sharing" cap exception OR exceed OR "Bird rights"`.

17. **CollegeAD feed removed** — RSS at `collegead.com/feed/` returns only 2020-2021 content. Zero CollegeAD headlines in last 7 days. Feed is dead. Publications now 23 feeds (11 Tier 1 + 12 Tier 2).

18. **Relevance gate: revenue sharing cap mechanics** — Added: `cap exception` with college/conference context, `Bird rights` with college/revenue/retention context, `$20.5M` standalone, `exceed/above/over` + `revenue sharing/compensation cap`, `revenue sharing/compensation cap` + `exceed/exception/retain/retention`.

19. **SBJ structural gap documented** — SBJ is paywalled with no RSS. Coverage path is via `site:sportsbusinessjournal.com` Google News query. SBJ articles that Google indexes will now be captured. Secondary coverage from ESPN, CBS Sports, etc. also caught by topic queries.

---

## Architecture Decisions

1. **CSLT over CourtListener** — CSLT is the primary case data source. CourtListener is dormant (no docket ID mapping). CSLT provides richer metadata (case groups, upcoming dates, status summaries, updates).
2. **Source tiering in briefing** — Rather than filtering low-quality sources entirely, tier them so Claude can prioritize. Tier 4 sources still included if they have unique coverage.
3. **Off-Topic as a category** — Rather than expanding the noise filter, let Claude tag irrelevant headlines as "Off-Topic" so they're excluded from stats and display but remain in the database for audit.
4. **Static state legislation data** — `nil-state-data.json` from Troutman Pepper, not a live fetcher. Updated manually when legislation changes. LegiScan would automate this but is blocked on API key.
5. **PE deals are manually seeded** — Small, known dataset (~10-15 deals). Updated via trigger phase when news breaks. No automated fetcher needed.
6. **Single-file frontend** — `App.jsx` contains all components, styling, and logic. No routing library. Keeps deployment simple and avoids build complexity.
7. **ET dates for briefings** — Briefing dates use `America/New_York` timezone, not UTC. Prevents "Latest available" mismatch when UTC is ahead of ET.
8. **Three-layer headline dedup** — (a) At insert time: URL normalization + source suffix stripping + Jaccard similarity in `fetcher-utils.js`. (b) Before briefing generation: source-tiered dedup in `ai-pipeline.js`. (c) Before frontend display: word overlap >0.6 in `App.jsx`. Three layers catch different cases.
9. **Three-tier publication filtering** — Niche business feeds (Tier 1) need no relevance gate since they're scoped by design. Broad sports feeds and conference RSS (Tier 2) need relevance gate to avoid game/recruiting noise. Aggregators (Tier 3: Google/Bing/NewsData) have relevance gate in their own fetcher files.
10. **HMAC-derived admin cookie** — Workers are stateless (no sessions). Uses HMAC-SHA256 of ADMIN_KEY as cookie value. Raw secret never stored in cookies or exposed in URLs after redirect. HttpOnly+Secure+SameSite=Strict protections.
11. **Server-rendered SEO pages via Worker** — Category pages and briefing archive served as plain HTML from the Worker (not React). Gives Google crawlable content that updates every visit. Pages Function catch-all proxies these routes.
12. **24-hour briefing delay** — Archived briefings only served for dates 24+ hours old. Keeps the live briefing exclusive to the React dashboard, driving traffic to the actual product.
13. **Shared `seoPage()` template** — Single function generates all SEO page HTML, ensuring consistent branding. Takes title, description, canonical, structured data, body content, footer text as parameters.
14. **Split CORS policy** — Public API endpoints use wildcard CORS (data is intended to be public). Admin endpoints use no `Access-Control-Allow-Origin` header (same-origin only). Defense-in-depth alongside SameSite=Strict cookies.

---

## Headline Filtering Rules (full pipeline)

1. **Relevance gate** (`fetcher-utils.js: isTitleRelevant`) — Strict regex match for NIL, NCAA, college athletics, transfer portal, revenue sharing, eligibility, lawsuits, jersey patches, above-cap, athletic fees, media rights, naming rights, premium seating, sponsorship, fundraising, ticket sales, fan rewards, conference governance/self-governance/autonomy/enforcement, AD abbreviation with university context, board of regents with athletics/oversight context, college athletics LLC/ventures/privatization, Athletes.org, executive orders on college sports, SCORE Act, SAFE Act, floor vote/markup/committee vote with college context, DI Council/Board/Cabinet/Membership Committee, Division I Council/Board/Cabinet/Committee, autonomy subdivision/conference with NCAA context, circumvention penalties — all with college/university/athletic context where required. Applied by Tier 2 publications, all aggregator fetchers, NCAA RSS, and gov/institutional Tier 1 feeds (NLRB, NCAA.org). Other Tier 1 publications skip this gate.
2. **Game noise filter** (`fetcher-utils.js: isGameNoise`) — Rejects game recaps, brackets, draft/combine coverage, recruiting noise, pro sports transactions, sportsbooks, power rankings, coaching carousel, player features. ~100 patterns. Business signals (NIL, NCAA governance, CSC, revenue sharing, legislation, antitrust, jersey patch, above-cap, athletic fee, apparel, facility funding, sponsorship, naming rights, premium seating, philanthropy, fan rewards) always pass through via `BUSINESS_SIGNAL_RE`.
2b. **Pro sports noise filter** (`fetcher-utils.js: isProSportsNoise`) — Rejects NFL/NBA/MLB/NHL/MLS/FIFA/World Cup/Copa America/WBC/spring training/Olympics/experience economy/PGA Tour/NFL Network/memorabilia/collector/sports TV upfront headlines. Only `COLLEGE_CONTEXT_RE` can override (business signals alone don't rescue pro sports content). Applied after game noise filter in publications and at insert time in fetcher-utils.
3. **URL dedup** — `headlines.url` has UNIQUE constraint. URLs normalized (strip UTM params, fragments, www, trailing slashes).
4. **Title dedup at insert** — In-memory cache of 3-day titles. Five checks: exact match → normalized match (with source suffix stripping) → substring containment → Jaccard word similarity (≥0.65) → URL constraint.
4b. **Instant Off-Topic tagging** (`fetcher-utils.js: categorizeByKeyword`) — Headlines matching pro sports patterns (NFL/NBA/NHL/MLB/PGA/UFC/MLS/NWSL/NASCAR/F1, pro team names, golf tournaments, memorabilia, domestic violence charges) with NO college context are tagged Off-Topic at insert time. Prevents Tier 1 source junk from appearing untagged in the feed. Conservative: only fires after all positive category checks fail.
5. **AI tagging** — Claude assigns category + severity. Off-Topic tagged for non-college-sports content. Off-Topic guardrails prevent mistagging of NIL headlines, college viewership, and general-outlet college athletics coverage.
6. **Off-Topic exclusion** — API queries exclude `category = 'Off-Topic'` from headlines. Untagged headlines (NULL category) are still shown to preserve the live feed feel.
7. **Frontend dedup** — Word overlap >0.6 against already-displayed headlines. Catches aggregator copies that passed URL dedup.

---

## CSLT Integration

- **Status:** Working, primary case data source
- **Fetcher:** `fetch-cslt.js`, runs every 6 hours (6 AM–10 PM ET)
- **Scrapes:** Tracker page (full case metadata) + homepage (monthly key dates)
- **Case data:** name, case_group, court, judge, case_number, filed_date, last_event_text/date, status_summary, description, upcoming_dates (JSON array)
- **Updates:** Extracts "Latest Updates" and "Previous Updates" sections → `case_updates` table
- **Key dates:** Monthly curated dates → `cslt_key_dates` table (DELETE + INSERT per month)
- **Frontend:** The Courtroom panel shows upcoming key dates (top 5 with countdown), recent activity, expandable case detail

## CourtListener Integration

- **Status:** Dormant — fetcher runs but skips all cases
- **Fetcher:** `fetch-courtlistener.js`, runs every 2–4 hours (6 AM–10 PM ET)
- **Problem:** CSLT cases use court-format case numbers (e.g., "4:24-cv-00793"). CourtListener needs numeric docket IDs. No mapping table exists.
- **Auth:** `COURTLISTENER_TOKEN` is set but optional (API works without token)
- **To re-enable:** Build CSLT-to-CL docket ID mapping so filing-level data supplements CSLT case summaries

## State Legislation Map

- **Status:** Working (static data)
- **Data source:** `src/nil-state-data.json` — manually curated from Troutman Pepper (Feb 2026)
- **Map library:** `react-simple-maps` with US Atlas topology
- **Encoding:** Enacted = accent orange (#DC4A2D), No law = light gray (#e2e5ec)
- **Interaction:** Hover darkens state, click opens centered overlay with status badge, detail text, provision sections
- **Small state labels:** Manual lon/lat positioning. MD and DC use dashed callout lines. NJ has white text on enacted fill.
- **Attribution:** "Troutman Pepper — State & Federal NIL Legislation Tracker (Feb 2026)"
- **Limitation:** Static data only. Live data blocked on LegiScan API key.

---

## Cost Summary

| Service | Plan | Cost |
|---------|------|------|
| Cloudflare Workers | Free (100K requests/day) | $0 |
| Cloudflare Pages | Free | $0 |
| Cloudflare D1 | Free (5M rows read, 100K rows written/day) | $0 |
| Cloudflare Web Analytics | Free | $0 |
| Anthropic API (Sonnet 4.5) | Pay-per-use | ~$1–3/day (2 pipeline runs × ~50 headlines tagged + 1 briefing) |
| NewsData.io | Free tier (200 credits/day) | $0 |
| Congress.gov | Free API key | $0 |
| CourtListener | Free account | $0 |
| Google News RSS | Free | $0 |
| Bing News RSS | Free | $0 |
| CFBD API | Free (1,000 calls/month) | $0 |
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
crons = ["0,30 * * * *", "10,40 * * * *", "7,37 * * * *", "25 10,11,19,20 * * *"]
```

- `0,30 * * * *` — **Group A** fetchers: Google News (82q)
- `10,40 * * * *` — **Group B** fetchers: Bing News (57q), Publications (23 feeds), NCAA RSS (3), NewsData (18q)
- `7,37 * * * *` — **Group C** fetchers (lighter/supplemental): CourtListener, NIL Revolution, CSLT (cases + key dates), Podcasts, CFBD
- `25 10,11,19,20 * * *` — AI pipeline (fires at 4 UTC hours; handler checks actual ET hour, only runs when h=6 or h=15, auto-adjusting for DST). Weekdays: AM+PM. Saturday: none. Sunday: PM only.

Splitting fetchers into three staggered groups keeps each invocation under Cloudflare's free-tier CPU limit. Google News isolated in its own group because it's the heaviest fetcher (86 queries). Groups B and C run fetchers **sequentially** (not `Promise.all`) with a 25-second wall-time budget — if the budget is consumed, remaining fetchers are skipped gracefully and will run on the next cron cycle. This prevents CPU timeout crashes when query counts grow.

---

## File Map

```
src/
  App.jsx              — Entire frontend (single file)
  nil-state-data.json  — Static state legislation data (50 states + DC)
  main.jsx             — React entry point
workers/
  index.js             — Worker entry: routes fetch→API, cron→fetchers/AI
  api.js               — /api/* endpoints + admin dashboard + SEO pages + trigger phases + auth
  ai-pipeline.js       — 3 active AI tasks (tag, CSC detect, briefing)
  fetcher-utils.js     — Shared: cooldowns, dedup cache (Jaccard), noise filter, relevance gate
  rss-parser.js        — Regex-based RSS parser (no DOMParser in Workers)
  fetch-google-news.js — Google News RSS (86 queries)
  fetch-bing-news.js   — Bing News RSS (57 queries)
  fetch-newsdata.js    — NewsData.io API (18 queries)
  fetch-ncaa-rss.js    — NCAA.com RSS (3 feeds)
  fetch-courtlistener.js — CourtListener RECAP (dormant)
  fetch-nil-revolution.js — Troutman Pepper blog RSS
  fetch-publications.js — 24 RSS feeds (11 Tier 1 + 12 Tier 2)
  fetch-cslt.js        — College Sports Litigation Tracker scraper (cases + key dates)
  fetch-podcasts.js    — 6 podcast RSS feeds (freshness check)
  fetch-cfbd.js        — CFBD transfer portal + preseason intel
functions/
  api/[[path]].js      — Pages Function proxy (/api/* → Worker, with POST body forwarding)
  [[catchall]].js      — Pages Function proxy (SEO routes → Worker)
public/
  favicon.svg          — SVG favicon (coral NIL pill)
  favicon.png          — Legacy PNG favicon
  favicon-32x32.png    — 32×32 PNG favicon
  favicon-16x16.png    — 16×16 PNG favicon
  favicon.ico          — ICO favicon (multi-size)
  apple-touch-icon.png — 180×180 Apple touch icon
  og-image.png         — 1200×630 Open Graph social card
  robots.txt           — SEO robots file
  _redirects           — Cloudflare Pages redirects
index.html             — SPA entry with meta tags, OG, structured data, analytics
schema.sql             — D1 schema (16 tables)
NIL-Monitor-Status.md  — This file
CLAUDE.md              — Claude Code project instructions
.github/workflows/
  deploy.yml           — Auto-deploy on push to main
```

---

## What to Build Next

Priority order based on impact and readiness:

1. **Wire up existing API endpoints to Monitor page** — Deadlines, House Settlement, and CSC panels all have working APIs with data. Pure frontend work.
2. **Run `fix-tags` trigger** — 6 mistagged headlines need the manual trigger to be executed via admin.
3. **Deadline extraction AI task** — Referenced in schema but not implemented. Would auto-extract deadlines from headlines and case data.
4. **Build Congress fetcher** — `fetch-congress.js` doesn't exist yet; needs to be built. `CONGRESS_KEY` is set and ready.
5. **Peer Intelligence** — AD compensation, budget comparisons, conference revenue data. Requires research + new data source.
6. **LegiScan fetcher** — Blocked on API key. Would populate the `bills` table and bring the state legislation map to life with real-time data.
7. **CourtListener re-integration** — Build CSLT-to-CL docket ID mapping so filing-level data supplements CSLT case summaries.
8. **Clean up dead code** — Remove `MOCK.kpis`, `MOCK.timeline`, `MOCK.xFeed`, orphaned `XListEmbed` component, stale `courtroomOpen` toggle, misleading `isWithinHour` name.
