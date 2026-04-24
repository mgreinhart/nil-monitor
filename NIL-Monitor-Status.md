# NIL Monitor — Project Status

> Last audited: 2026-04-24 from source files (schema, cron, fetcher query counts, briefing rules, admin curation, pipeline reliability, fetcher resilience verified against actual code).

## Architecture

```
Browser → nilmonitor.com (Cloudflare Pages)
           ├── static assets (index.html, JS bundle, og-image, favicons, robots.txt)
           ├── /api/* → functions/api/[[path]].js → nil-monitor-api.mgreinhart.workers.dev
           │                                         ├── api.js (JSON endpoints + admin + SEO pages)
           │                                         ├── 11 fetcher functions from 10 files (cron)
           │                                         └── ai-pipeline.js (Claude Sonnet tagging/briefings)
           │                                         └── D1: nil-monitor-db
           └── /news, /briefing/*, /feed.xml, /sitemap.xml
                → functions/[[catchall]].js → Worker (server-rendered HTML)
```

- **Frontend:** Single-file React app (`src/App.jsx`, ~1,600 lines), Vite build, Cloudflare Pages
- **Backend:** Cloudflare Worker (`workers/index.js` entry), D1 SQLite database
- **AI Pipeline:** `workers/ai-pipeline.js`, Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`) via Anthropic API
- **Proxy (API):** `functions/api/[[path]].js` — Pages Function forwards `/api/*` to Worker (incl. POST body)
- **Proxy (SEO):** `functions/[[catchall]].js` — Pages Function forwards `/news`, `/briefing/*`, `/feed.xml`, `/sitemap.xml`
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
| `headlines` | News from all fetchers, AI-tagged. Columns: `hidden`, `hide_reason` for admin curation |
| `cases` | Litigation from CSLT scraper |
| `case_updates` | Latest/previous updates from CSLT |
| `deadlines` | Pre-loaded seed deadlines (AI-extract task not implemented) |
| `csc_activity` | AI-detected CSC items |
| `briefings` | AI-generated daily briefings (keyed by date) |
| `bills` | Federal bills (never populated — fetcher not built) |
| `house_settlement` | Key settlement metrics (7 seed rows) |
| `podcast_episodes` | Latest episode dates for 6 podcasts |
| `cslt_key_dates` | Curated monthly dates from CSLT homepage |
| `pe_deals` | Private equity deals in college athletics (10 rows) |
| `pipeline_runs` | AI pipeline execution log. `status` ∈ {`started`, `completed`, `failed`}; `started` row acts as distributed lock |
| `fetcher_runs` | Self-governing cooldown + last-error state per fetcher |
| `fetcher_errors` | Ring buffer of recent fetcher errors, capped at 100 rows (index on `occurred_at DESC`) |
| `portal_snapshot` | CFBD transfer portal aggregate (one row/day) |
| `preseason_intel` | CFBD returning production + recruiting (one row/year) |
| `gdelt_volume` | **Legacy, no longer written** — table exists but no fetcher populates it |

### Secrets (Wrangler)

| Secret | Status | Used by |
|--------|--------|---------|
| `ANTHROPIC_KEY` | Set | AI pipeline (required) |
| `NEWSDATA_KEY` | Set | NewsData.io fetcher (required) |
| `CONGRESS_KEY` | Set | Not currently imported (fetcher never built) |
| `COURTLISTENER_TOKEN` | Set | CourtListener (optional, works without) |
| `ADMIN_KEY` | Set | Admin dashboard + trigger auth (required) |
| `CFBD_KEY` | Set | CFBD fetcher (required for Portal Pulse) |
| `LEGISCAN_KEY` | **Not set** | Pending API key approval |

---

## What's Working

### Data Fetchers (11 functions from 10 files, four-group cron split)

Each fetcher self-governs cooldown via the `fetcher_runs` table, writes last-error state there, and appends to the `fetcher_errors` ring buffer on failure. All use shared utilities from `fetcher-utils.js` (ET timezone, cooldowns, entity decoding, URL normalization, game-noise/pro-sports/spam/portal-noise filters, keyword categorization, relevance gate, Jaccard dedup cache, 7-day pubDate staleness guard).

**Cron schedule (4 groups — Cloudflare free tier limit is 4 cron triggers):**

| Group | Cron | Fetchers | Notes |
|-------|------|----------|-------|
| A (Google) | `:00, :30` | `fetch-google-news.js` (88 queries) | Heaviest fetcher, isolated |
| B (Bing+Feeds) | `:10, :40` | `fetch-bing-news.js` (58q) + `fetch-publications.js` (23) + `fetch-ncaa-rss.js` (3) + `fetch-newsdata.js` (18) | Sequential |
| C (Light) | `:07, :37` | CourtListener, NIL Revolution, CSLT (×2), Podcasts, CFBD | Sequential |
| AI Pipeline | `:25` at UTC hours 10,11,19,20 | `ai-pipeline.js` | DST-aware; primary + backup slots |

Groups A/B/C run fetchers **sequentially** (not `Promise.all`) under a 25-second wall-time budget. If budget is exceeded mid-group, remaining fetchers are skipped and pick up on the next cycle. Dedup cache load failures are isolated — fetchers still run (just with per-headline DB queries instead of the cache).

> **Note on source-code comments:** comment strings in `wrangler.toml`, `workers/index.js`, and some fetcher files cite older query counts (76, 49, etc.). These are stale — actual array counts are 88/58/18/3/23 and match the cron table above.

| Fetcher | Source | Queries/Feeds | Table | Cooldown | Auth |
|---------|--------|---------------|-------|----------|------|
| `fetch-google-news.js` | Google News RSS | 88 queries | headlines | 15–30 min | None |
| `fetch-bing-news.js` | Bing News RSS | 58 queries | headlines | 15–30 min | None |
| `fetch-newsdata.js` | NewsData.io API | 18 queries | headlines | 30/60 min (credit-budgeted) | `NEWSDATA_KEY` |
| `fetch-ncaa-rss.js` | NCAA.com RSS | 3 feeds | headlines | 15–30 min | None |
| `fetch-courtlistener.js` | CourtListener RECAP | — | cases | 120–240 min | Optional token |
| `fetch-nil-revolution.js` | Troutman Pepper blog RSS | 1 feed | headlines | 120 min | None |
| `fetch-publications.js` | 23 publication/conference/gov RSS feeds | 11 Tier 1 + 12 Tier 2 | headlines | 30 min | None |
| `fetch-cslt.js` (cases) | College Sports Litigation Tracker | 1 page | cases, case_updates | 360 min | None |
| `fetch-cslt.js` (key dates) | CSLT homepage | 1 page | cslt_key_dates | 360 min | None |
| `fetch-podcasts.js` | 6 podcast RSS feeds | 6 feeds | podcast_episodes | 120 min | None |
| `fetch-cfbd.js` | CollegeFootballData.com API | portal + recruiting | portal_snapshot, preseason_intel | 360–1440 min | `CFBD_KEY` |

All fetchers active 6 AM–10 PM ET, skip overnight. In-memory dedup cache (3-day window) pre-loaded before each cron invocation, cleared after.

**CFBD fetcher cooldown rules (football-only, no basketball):**
- Football portal window (Jan 2–24): 6h — portal snapshot only
- Preseason (Aug 1 – Nov 30): 24h — portal snapshot + preseason intel
- All other times: 24h — portal snapshot only

**Note:** `fetch-congress.js` does not exist (never built). `CONGRESS_KEY` is set but unused.

#### Publication Feeds — Three-Tier Filtering Model

**Tier 1 (11 feeds) — Noise filter only OR source-specific relevance gate:**

- *No relevance gate* (scoped to college sports by design): Business of College Sports, AthleticDirectorU, The Athletic (college-sports feed), LexBlog Collegiate & Professional Sports Law, Opendorse (NCAA + NIL, 2 feeds).
- *Relevance gate applied* (broad-scope sources that publish across all topics): Sportico, Front Office Sports, NLRB (press releases + weekly summaries, 2 feeds), NCAA.org. Controlled by the `BROAD_SOURCES` set in `fetch-publications.js` — expanded beyond the earlier "Tier 1 skips gate" rule to catch non-college content from FOS/Sportico (pro sports business, VC announcements, etc.).

CollegeAD feed removed — RSS returns 2020-era content only.

**Tier 2 (12 feeds) — Relevance gate + noise filter:**
Sports Litigation Alert, On3, CBS Sports (football + basketball), ESPN (football + basketball), Yahoo Sports, The Athletic (football feed), Norton Rose Fulbright (global sports law — relevance gate filters non-college), Horizon League, ACC, Big 12.

Conference feeds (Horizon League, ACC, Big 12) are in Tier 2 because they produce mostly sports results, not business/governance content.

**Relevance gate:** All aggregator fetchers (Google News, Bing News, NewsData, NCAA RSS) plus Tier 2 publications and broad-scope Tier 1 sources run `isTitleRelevant()`. Strict regex for NIL, NCAA, college athletics, transfer portal, revenue sharing, eligibility, lawsuits, jersey patches, above-cap, athletic fees, media rights, naming rights, premium seating, sponsorship, fundraising, ticket sales, fan rewards, conference governance/self-governance/autonomy/enforcement, AD with university context, board of regents with athletics context, college athletics LLC/ventures/privatization, Athletes.org, executive orders / White House / presidential commissions on college sports, SCORE Act, SAFE Act, floor vote/markup/committee vote with college context, Senate/Commerce/HELP committee hearings on college sports, DI Council/Board/Cabinet/Membership Committee, Division I Council/Board/Cabinet/Committee, autonomy subdivision/conference with NCAA context, circumvention penalties, revenue-sharing cap mechanics ($20.5M, cap exception, Bird rights, exceed/above cap with college context).

### Headline Deduplication (fetcher-utils.js)

Multi-layer dedup system, evaluated at insert time in `insertHeadline`:

1. **Source suffix stripping** — Strips " - ESPN", " - CBS News", " | Yahoo Sports" etc. from aggregator titles before comparison.
2. **Exact title match** — In-memory cache of 3-day titles.
3. **Normalized match** — Lowercase, non-alphanumeric stripped, suffix-stripped.
4. **Substring containment** — If one normalized title contains the other (both >30 chars).
5. **Jaccard word similarity** — `|A∩B| / |A∪B|` on significant words (>3 chars). Threshold: ≥0.65 standard, ≥0.45 if shared proper noun + action context (via `sharesEntityAndAction`). Catches moderate rewordings.
6. **URL UNIQUE constraint** — Final catch at DB level. URLs normalized: strip UTM/fbclid/etc., fragments, www, trailing slashes.

Cache pre-loaded once per cron invocation (`loadDedupCache`) to avoid per-headline DB queries; cleared after the group finishes. Updated in-memory as headlines insert so parallel fetchers see each other's work.

### Headline Insert Filter Chain (`insertHeadline`)

In order, before dedup:

1. **7-day pubDate staleness guard** — Reject articles whose `pubDate` is more than 7 days old. Aggregators (MSN/Bing) recirculate months-old articles with fresh fetch timestamps; this cuts most of that at the door.
2. **Game noise filter** (`isGameNoise`) — Rejects game recaps, brackets, draft/combine coverage, recruiting noise, pro sports transactions, sportsbooks, power rankings, coaching carousel, player features. Preflight noise (HS athletes, ISD classifications, reactive NIL deal takes) and portal shopping/strategy noise override the business-signal rescue.
3. **Pro sports noise filter** (`isProSportsNoise`) — Rejects NFL/NBA/MLB/NHL/MLS/FIFA/World Cup/Copa America/WBC/spring training/Olympics/experience economy/PGA Tour/NFL Network/memorabilia/collector/sports TV upfront headlines. Only `COLLEGE_CONTEXT_RE` can override — business signals alone don't rescue.
4. **Spam title filter** (`isSpamTitle`) — Rejects clearance-sale / hot-deal / limited-offer patterns with sports-related bait words.
5. **Blocked-domain filter** (`isBlockedDomain`) — Rejects known spam domains (`padelspain`, `clearancefind`, `dealsfind`).
6. Instant keyword categorization (`categorizeByKeyword`) — assigns category if confident. Can instant-tag **Off-Topic** at insert time when pro-sports/non-college patterns match with NO college context (conservative; only after all positive categories fail).

### AI Pipeline (cron `:25` at UTC hours 10,11,19,20 — DST-aware, 6 AM / 3 PM ET with backup slots)

Four UTC cron slots map to two primary + two backup ET briefing slots:

- **EDT:** 10 UTC = 6 AM primary, 11 UTC = 7 AM backup, 19 UTC = 3 PM primary, 20 UTC = 4 PM backup
- **EST:** 11 UTC = 6 AM primary, 20 UTC = 3 PM primary (10/19 UTC resolve to 5 AM/2 PM → skipped)

Backup slots check `briefings` for today's brief (by ET hour of `generated_at`) and skip if the primary already wrote one. A single Cloudflare cron miss (free-tier crons skip occasionally) no longer kills a briefing period.

**Safety net (`ensureTodaysBriefing`):** Called from every fetcher cron tick (Groups A, B, C) in addition to the pipeline cron. If we're past the expected briefing time for the current period, no brief exists yet, and no pipeline run is in `started` state within the last 30 minutes, it triggers `runAIPipeline`. This recovers from cases where both the primary and backup pipeline slots were skipped, or where the pipeline crashed before writing. Windows: morning = 06:30–11:59 ET; afternoon = 15:30–22:59 ET. Saturday skipped, Sunday morning skipped.

Weekend schedule: Saturday = no briefs, Sunday = afternoon only (3 PM ET).

Uses `claude-sonnet-4-5-20250929`, 4096 max tokens per response. Three active tasks:

1. **Tag untagged headlines** — Batches of 50. 9 categories defined in prompt. Off-Topic guardrails prevent mistagging NIL headlines, college viewership metrics, and general-outlet college coverage.
2. **Detect CSC activity** — Keyword pre-filter on headlines → Claude sub-tagging (Guidance, Investigation, Enforcement, Personnel, Rule Clarification). Event-level dedup.
3. **Generate briefing** — 4-section format. CFO/COO institutional voice. Rules below.

#### Pipeline Reliability

- **Distributed lock:** Pipeline inserts a `status='started'` row into `pipeline_runs` at the top of the run and updates it at the end with final status. `ensureTodaysBriefing` treats any `started` row <30 min old as "another invocation is working on it" and skips. Stale `started` rows (>30 min) are auto-cleaned to `failed` with message "timed out (still in started >30min — likely Worker CPU limit)".
- **Fail-fast on silent errors:** Run is marked `failed` if a fatal error is thrown, tagging produced 0 tags despite headlines awaiting (all Claude calls silently failed), or a briefing run finished with 0 sections written.
- **Briefing retry:** One retry on Claude failure with a 2-minute wait between attempts.

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

#### Off-Topic Guardrails (in tag prompt)

1. Headlines containing "NIL" in the title are NEVER Off-Topic — NIL is the core subject.
2. College viewership/ratings/attendance = Business / Finance (institutional revenue metrics).
3. Federal government actions affecting college athletics (ICE, charter planes, congressional hearings) are relevant.
4. Judge by headline content, not by source outlet.
5. Individual NIL deal announcements = Business / Finance, not Off-Topic.
6. Pro sports league operations (NFL scheduling, PGA business) are Off-Topic even from Tier 1 outlets.

#### Source Tiering (briefing quality)

| Tier | Sources |
|------|---------|
| 1 (premium) | ESPN, USA Today, The Athletic, Sportico, AP, Reuters, SI, CBS Sports, FOS, NYT, WaPo, WSJ |
| 2 (quality analysis) | Extra Points, Business of College Sports, NIL Revolution, On3, 247Sports, Yahoo Sports |
| 3 (default) | Everything not in Tier 1, 2, or 4 |
| 4 (deprioritized) | AfroTech, TheDetroitBureau, Africa.com |

#### Briefing Rules (current system prompt)

**Voice & framing:**
- CFO/COO perspective; budget / peer-comparison / institutional-risk lens
- Every item must answer "Does this require action, awareness, or preparation?"
- Excludes routine roster/game news, individual transfers, game results

**Recency window (tight primary, widen if thin):**
- Morning: 18h primary → 24h fallback → 36h widen
- Afternoon: 12h primary → 18h fallback → 36h widen
- Widen triggers when <10 headlines in scope
- Headlines carry age tags (e.g. `[3h ago]`); fresher stories beat older ones unless significantly more important
- Excludes `hidden=1` headlines

**Aggregator-only drop (Option A):** Any headline whose source is MSN / Bing / Bing News / Yahoo / Yahoo News / AOL / Google News / NewsBreak / SmartNews / Flipboard is dropped *after* post-dedup. Logic: if a real outlet had covered the story, dedup's tier-preference sort would have kept that version — an aggregator in the final pool means no original-reporting outlet picked it up, and aggregator timestamps cannot be trusted. If this leaves <10 headlines, the window widens to 36h and re-dedups.

**Anti-repetition (5-briefing window):**
- Previous briefing's items are listed in the prompt as "already covered — don't repeat without a material update"
- Topics featured in the most recent briefing AND at least one of the four prior briefings (2+ appearances in last 5) are hard-blocked — no inclusion unless a genuinely new discrete event has occurred (new ruling, filing, vote, named party, quantitative change)
- Word-overlap threshold: 0.4 for the "appeared before" check

**Political commentary recency rule:** Recurring quotes from the same senator / rep / governor / pundit are NOT a new briefing item unless attached to a specific new procedural event (markup, vote, amendment, scheduled hearing, floor-vote timing, named co-sponsor, formal committee action). A politician repeating an existing position in a new interview/op-ed/podcast/press availability does not qualify.

**Staleness check:** Before including any item, verify it describes an event within the last 24h. Red flags: MSN/Bing/Yahoo source + event already covered in prior briefing, past tense with no recent time reference, event recognized from prior briefings under a different outlet.

**Priority rules (always lead with, when present in headlines):**
- **Presidential / executive-branch actions** on college sports — White House committees, EOs, presidential roundtables with named participants, named federal commissions — ALWAYS Item 1 when they occur
- **CSC / enforcement** — clearinghouse delays, letters of inquiry, compliance-process breakdowns, AD statements about enforcement fairness
- **University leadership** — president resignations/hirings/firings directly affecting athletics
- **Legislative mechanics** — vote timelines, count analysis, named members blocking/advancing bills, committee markups
- **Federal legislative procedure** — named provisions ("Lane Kiffin Rule"), vote date changes, new co-sponsors, new opposition. HELP / Commerce committee hearings are high-priority (Congress actively moving).
- **NCAA committee recommendations** — proposed transfer window/eligibility/roster/enforcement changes
- **Emergency governance actions** — special meetings, added votes, fast-tracked legislation outside normal calendar
- **Conference autonomous governance** — conference-level rulemaking independent of NCAA
- **New organizational models** — multi-person leadership, CRO/COO splits, president-led athletics strategy, new athletic-dept org charts
- **Revenue-sharing cap mechanics** — cap exceptions, Bird rights, exceeding $20.5M, cap adjustments
- **New deal structures** — first-of-their-kind arrangements (branded content studios, conference data commercialization, university LLCs, PE minority stakes)

**Hearing detection:** Hearings / proceedings happening **today** or within 72h MUST appear with date, committee/court, and witnesses if available. Same-day events beat anything scheduled days out.

**Source diversity:** Don't draw more than 2 of 4 items from the same source outlet.

**Specificity rule:** Always name institutions, states, people, and dollar amounts when the source data contains them. Never anonymize on-the-record details ("an unnamed school", "a state university system").

**Consolidation rule:** Multiple headlines about the same person/entity/bill → one briefing item. Two items from the same article → one item. Never split an article into multiple sections.

**Pattern-claim rule:** Don't claim a single institution's action represents a "pattern" / "broader shift" / "trend" / "wave" unless 3+ named institutions in the same cycle are taking the same action. Hedged framing is OK ("Syracuse may signal…", "Syracuse is the latest to…") if at least one prior example is cited in the body.

**Exclusion — personnel hires:** Individual hires / contract extensions / AD appointments are NOT briefing items unless they involve a Power 4 AD / conference commissioner hire or departure, a genuinely new institutional structure (first-ever CEO-title replacing AD, first conference GM), or a role with direct regulatory implications (new CSC enforcement director).

**Story quality test:** Before inclusion, ask — does this require institutional action, financial-impact awareness, or preparation for a regulatory change? If no, skip it regardless of recency. AD reading the briefing at 6 AM should finish each item thinking "I need to do something about this" or "I need to tell someone about this."

**Calendar dates are not news:** Known upcoming deadlines are not briefing items unless something NEW happened (date changed, motion filed, new party made a statement). The Deadlines panel handles countdowns.

**Source fidelity:** Every item derived from provided headlines — no general-knowledge padding. If fewer than 4 worthy items exist, return fewer sections; don't pad.

**Output format:** EXACTLY 4 sections when possible. Each has `short_title` (6–10 words, no period), `headline` (bold opening sentence), `body` (1–2 sentences max), and `source_index` (number pointing into the headline list, or null). Source index is resolved post-generation to the headline's URL, with a fuzzy-match fallback that scores word overlap + tier bonus.

### API Endpoints (all at `/api/*`)

| Endpoint | Method | Returns | Notes |
|----------|--------|---------|-------|
| `/api/cases` | GET | Active cases, soonest upcoming first | `?group=`, `?active=0` |
| `/api/cases/:id` | GET | Single case detail | |
| `/api/cases/updates` | GET | Latest 15 case updates | |
| `/api/case-updates` | GET | Latest 50 case updates | Legacy |
| `/api/headlines?limit=N&cat=X` | GET | Headlines, newest first | Excludes Off-Topic and `hidden=1`; limit capped at 200 |
| `/api/deadlines` | GET | Future deadlines, ASC | |
| `/api/house` | GET | House Settlement key/value | |
| `/api/briefing` | GET | Latest AI briefing | Returns `{ date, content, generated_at }`; cleans URL whitespace + collapses stripped-Unicode word breaks on read |
| `/api/headline-counts` | GET | 30-day daily headline counts | Excludes `hidden=1` |
| `/api/last-run` | GET | Last pipeline run timestamp | |
| `/api/csc` | GET | CSC activity feed (latest 20) | |
| `/api/podcasts` | GET | Podcast freshness dates | |
| `/api/portal-pulse` | GET | Latest portal snapshot + mode (live/summary/preseason) | |
| `/api/preseason-intel` | GET | Returning production + recruiting | |
| `/api/pe-tracker` | GET | Private equity deals | Sorted by `announced_date` DESC |
| `/api/cslt-key-dates` | GET | CSLT curated monthly dates | |
| `/api/admin` | GET | HTML admin dashboard | Cookie auth or `?key=` (redirects to strip key) |
| `/api/admin-login` | POST | Validates password, sets HMAC cookie | |
| `/api/trigger?phase=...` | GET | Manual trigger | Cookie auth required |
| `/api/admin/hide-headline` | POST | `{id, reason}` → marks headline `hidden=1` with reason tag | Cookie auth |
| `/api/admin/unhide-headline` | POST | `{id}` → unhides | Cookie auth |

### SEO Pages (server-rendered HTML, no React)

All served by the Worker via `handleSeoPages()` in `api.js`, proxied from Pages by `functions/[[catchall]].js`.

| Route | Type | Content |
|-------|------|---------|
| `/news` | All headlines | Latest 50, full meta/OG/structured data |
| `/news/legislation` through `/news/realignment` | Category pages | 8 total (legislation, litigation, governance, csc, revenue-sharing, portal, business, realignment) |
| `/briefing` | Redirect | 302 to latest archived briefing (24h+ old) |
| `/briefing/:date` | Briefing archive | Full briefing with prev/next nav, 24h delay |
| `/feed.xml` | RSS feed | Latest 50, supports `?category=` |
| `/sitemap.xml` | Dynamic sitemap | /, /news, 8 categories, /briefing, last 30 briefing dates, /feed.xml |

All SEO pages share `seoPage()` template with identical CSS, nav bar (Dashboard, All News, 8 categories, Briefing), and footer. Category pages use `CollectionPage` schema; briefings use `Article` schema. Per-category RSS `<link rel="alternate">` tags.

**24-hour briefing delay:** Today's briefing returns "available on the live dashboard" with link to nilmonitor.com. Only dates 24+ hours old (in ET) are served. Keeps the live briefing exclusive to the dashboard.

#### Trigger Phases

| Phase | Action |
|-------|--------|
| `fetch` | Run all 11 fetchers with dedup cache (bypasses cooldowns via `force: true`) |
| `tag` | Tag untagged headlines only |
| `ai` | Run AI pipeline (full, with briefing) |
| `all` | Run both fetch + ai sequentially |
| `retag` | Clear all headline tags + re-run AI pipeline |
| `fix-briefing-date` | Delete future-dated briefings (UTC/ET mismatch artifact) |
| `fix-tags` | Fix 6 hardcoded mistagged headlines → Business / Finance |
| `seed-pe` | Create pe_deals + insert 10 deals |
| `test-feeds` | Test 5 RSS feed URLs and report status |
| `delete-stale-deadline` | Delete stale "Spring transfer portal window closes" rows |

#### Admin Authentication

- `/api/admin`, `/api/trigger`, and `/api/admin/{hide,unhide}-headline` require auth via `ADMIN_KEY`
- Cookie-based auth: HMAC-SHA256 derived session token (HttpOnly, Secure, SameSite=Strict, 24h expiry)
- `?key=` param on `/api/admin`: validates, sets HMAC cookie, 302 redirects to strip key from URL
- Login form at `/api/admin` via POST to `/api/admin-login`
- If `ADMIN_KEY` not set, endpoints are open (dev mode)
- Cookie value is an HMAC hash of the admin key, not the raw secret

#### Admin Dashboard

- Fetcher status: per-fetcher last run, cooldown state, last error
- Pipeline runs: status (`started` / `completed` / `failed`), headlines tagged, CSC items, briefing generated, error messages
- Headline list with category tags — each headline title is a clickable link to the source article
- Hide / unhide UI — right-click menu per headline with reason tags (off-topic, duplicate, spam, other). Hidden headlines are excluded from the frontend headlines feed and the briefing.
- "Only surface live problems" behavior: past overdue flags are suppressed once a fetcher has recovered. Prevents false alarms on previously-transient failures.

### Frontend — Live Data Connections

These sections fetch real data from the API:

- **Briefing panel** — `/api/briefing`, branded "NIL MONITOR NEWS BRIEF" with collapsible sections, falls back to `MOCK.briefing`
- **Headlines feed** — `/api/headlines?limit=100`, category filter pills, 8 per page, Off-Topic excluded, fuzzy dedup (word overlap >0.6), auto-refreshes every 2 minutes, uniform font weight per row
- **The Courtroom** — `/api/cases` + `/api/cslt-key-dates`, Key Dates with countdown, Recent Activity (expandable), link to full CSLT tracker
- **Portal Pulse** — `/api/portal-pulse`, three-mode panel (live/summary/preseason). Renders BELOW the State NIL Legislation map.
- **PE Tracker** — `/api/pe-tracker`, compact deal list (dead deals filtered), status badges
- **Podcasts sidebar** — `/api/podcasts` for freshness sorting, Spotify iframe embeds, 24h highlight

### Frontend — Static/Local Data

- **State NIL Legislation Map** — `src/nil-state-data.json` (static, from Troutman Pepper Feb 2026). Interactive choropleth via `react-simple-maps`. 51 entries (50 states + DC). 35 enacted, 16 with no law.
- **Small state callout labels** — MD and DC use dashed connector lines; DE, NJ, CT, RI have manual offsets.

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
- 7 accounts: @PeteThamel, @RossDellenger, @NicoleAuerbach, @D1ticker, @DarrenHeitner, @achristovichh, @Sportico
- Links to full list: `https://x.com/i/lists/2024695913898528822`
- `XListEmbed` component exists in `App.jsx` but is orphaned — not called in the render tree

### Resources Panel (5 categorized groups, in main column)

| Group | Links |
|-------|-------|
| **Legal & Compliance** | CSLT, Troutman Pepper NIL Tracker, NIL Revolution Blog |
| **Data & Research** | Knight-Newhouse, nil-ncaa.com, On3 NIL Valuations |
| **Governance & Policy** | NCAA.org Governance, Congress.gov |
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

## SEO & GEO Optimization

### index.html Meta Tags

- **Title:** "NIL Monitor — Live College Athletics Regulatory Dashboard"
- **Description:** Comprehensive feature + audience + update frequency summary
- **Keywords:** 16 terms (NIL monitor, NIL tracker, college athletics dashboard, NCAA governance, etc.)
- **OG tags:** title, description, type, url, site_name, image
- **Twitter Card:** summary_large_image
- **Structured Data:** WebApplication JSON-LD with featureList, audience, pricing (free)
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
- Server-rendered `/news` page and category pages give search engines fresh, crawlable content
- `robots.txt` allows all crawlers, points to sitemap
- Dynamic sitemap includes all pages with appropriate changefreq/priority

### Analytics

Cloudflare Web Analytics beacon added to `index.html`. Results visible at Cloudflare dashboard → Analytics & Logs → Web Analytics.

---

## What's NOT Working / Missing

### Panels not rendered (API exists, frontend doesn't call it)

- **Deadlines panel** — `/api/deadlines` works, seed data loaded, no panel on Monitor page
- **House Settlement panel** — `/api/house` works, seed data loaded, no panel on Monitor page
- **CSC Command Center** — `/api/csc` works, items in DB, no dedicated panel on Monitor page
- **Bills / State Tracker live data** — `bills` table exists but returns 0 rows; States page uses static JSON

### Data gaps

- **Congress fetcher** — `fetch-congress.js` does not exist. `CONGRESS_KEY` set but unused.
- **LegiScan fetcher** — not built; `LEGISCAN_KEY` pending approval. `bills` table has 0 state bill rows.
- **CourtListener** — dormant. CSLT is the primary case source. CL fetcher runs but skips because CSLT `case_number` format (e.g. `4:24-cv-00793`) doesn't match CL's numeric docket IDs. No mapping table.
- **Deadline extraction** — Referenced in `pipeline_runs` schema but no `createDeadlines()` function exists. Only pre-loaded seed deadlines.
- **Case summaries** — Referenced in schema design but not implemented.

### Dead code in frontend

- **`MOCK.kpis`** — 5 KPI cards, defined but never rendered
- **`MOCK.timeline`** — 10 hardcoded events, defined but never rendered
- **`MOCK.xFeed`** — 6 fake tweets, defined but never rendered
- **`XListEmbed` component** — Defined but not called
- **`courtroomOpen` state** — Initialized to `true`, toggle mechanism removed, state variable remains
- **`isWithinHour` function** — Actually checks within 3 hours (10800000ms); name is misleading

### Known Issues

- **No multi-page routing** — Single scrollable dashboard with an info modal. Build spec envisioned separate pages.
- **Knight-Newhouse link** — `knightnewhousedata.org` returns 403 to automated requests (bot blocking). Works in browsers.
- **FOS non-college content** — FOS is now in `BROAD_SOURCES` and relevance-gated, which cuts most pro-sports noise. Some still slips through and gets tagged Off-Topic by the AI pipeline.
- **OpenDNS blocks `*.workers.dev`** — Local dev must use nilmonitor.com, not Workers.dev URL directly.
- **`fix-tags` trigger phase** — Hardcoded IDs for a one-time fix of 6 mistagged headlines. Harmless but should be removed in cleanup.
- **Podcast cooldown comment stale** — `fetch-podcasts.js` header says "every 6 hours" but `getCooldown()` returns 120 (2 hours). Code is correct, comment is wrong.
- **Query-count comments stale** — `wrangler.toml`, `workers/index.js`, and individual fetcher files cite older query counts (76, 49, 57, etc.). Actual arrays are 88/58/18/3/23. Comments should be refreshed in a future cleanup.

### GDELT / Google Trends — Removed

Do not re-attempt. GDELT: noisy global article counts that never surfaced meaningful data. Google Trends: too heavy. `gdelt_volume` table still exists in the schema but is no longer written to.

---

## Architecture Decisions

1. **CSLT over CourtListener** — CSLT is the primary case data source. CourtListener is dormant (no docket ID mapping).
2. **Source tiering in briefing** — Rather than filtering low-quality sources entirely, tier them so Claude can prioritize. Tier 4 sources still included if they have unique coverage.
3. **Off-Topic as a category** — Rather than expanding the noise filter, let Claude tag irrelevant headlines as "Off-Topic" so they're excluded from display but remain in the DB for audit.
4. **Static state legislation data** — `nil-state-data.json` from Troutman Pepper, not a live fetcher. LegiScan would automate this but is blocked on API key.
5. **PE deals are manually seeded** — Small, known dataset (~10 deals). No automated fetcher.
6. **Single-file frontend** — `App.jsx` contains all components, styling, and logic. No routing library.
7. **ET dates for briefings** — Briefing dates use `America/New_York`, not UTC.
8. **Three-layer headline dedup** — (a) Insert time: URL normalization + source suffix stripping + Jaccard in `fetcher-utils.js`. (b) Before briefing: source-tiered dedup in `ai-pipeline.js`. (c) Frontend: word overlap >0.6 in `App.jsx`.
9. **Three-tier publication filtering** — Scoped business feeds (Tier 1 no-gate), broad-scope Tier 1 sources (NLRB, NCAA.org, Sportico, FOS) get a relevance gate, Tier 2 broad sports needs the gate, aggregators (Tier 3) run gate in own fetchers.
10. **HMAC-derived admin cookie** — Workers stateless; HMAC-SHA256 of ADMIN_KEY as cookie value. Raw secret never stored in cookies or exposed in URLs after redirect.
11. **Server-rendered SEO pages via Worker** — Plain HTML from the Worker (not React). Fresh crawlable content on every visit.
12. **24-hour briefing delay** — Archived briefings only served for dates 24+ hours old. Keeps live briefing exclusive to the dashboard.
13. **Shared `seoPage()` template** — One function generates all SEO page HTML.
14. **Split CORS policy** — Public endpoints use wildcard CORS; admin endpoints have no `Access-Control-Allow-Origin` header.
15. **Pipeline backup slots + safety-net recovery** — Two UTC slots per briefing period (primary + 1h backup) + `ensureTodaysBriefing` check on every fetcher cron. Free-tier Cloudflare crons skip occasionally; a single miss shouldn't kill a briefing.
16. **`pipeline_runs.status = 'started'` as distributed lock** — Lets concurrent fetcher-cron `ensureTodaysBriefing` calls see an in-progress run and stand down. Stale `started` rows (>30 min) auto-cleaned at the top of each run.
17. **Fail-fast on silent Claude errors** — Pipeline marks itself failed when tagging produced 0 tags despite pending headlines, or when a briefing run wrote 0 sections. Prevents "green" runs that actually failed silently.
18. **Aggregator-only story drop** — Any briefing candidate sourced from MSN/Bing/Yahoo/AOL/Google News/NewsBreak/SmartNews/Flipboard is dropped after dedup. Logic: dedup's tier-preference sort means an aggregator in the final pool = no real outlet covered it, and aggregator timestamps are unreliable.
19. **5-briefing anti-repetition window** — Extended from 4 to catch cyclical rhetoric (senator positions repeated across multiple briefings without new procedural events). Topics featured 2+ times in last 5 briefings are hard-blocked unless a genuinely new event attaches.
20. **7-day pubDate staleness guard** — Hard reject at insert time. Aggregator recirculation of months-old articles with fresh fetch timestamps was fooling the briefing into treating stale stories as breaking.
21. **Admin hide/unhide over noise-filter expansion** — Rather than growing the regex filters for every edge-case bad headline, expose curation in the admin dashboard. Hidden rows are excluded from `/api/headlines`, `/api/headline-counts`, and briefing generation.
22. **Fetcher error ring buffer** — `fetcher_errors` capped at 100 rows; per-fetcher last-error state on `fetcher_runs`. Errors visible in admin dashboard and survive isolate recycling.

---

## CSLT Integration

- **Status:** Working, primary case data source
- **Fetcher:** `fetch-cslt.js`, every 6 hours (6 AM–10 PM ET)
- **Scrapes:** Tracker page (full case metadata) + homepage (monthly key dates)
- **Case data:** name, case_group, court, judge, case_number, filed_date, last_event_text/date, status_summary, description, upcoming_dates (JSON array)
- **Updates:** Extracts "Latest Updates" and "Previous Updates" → `case_updates`
- **Key dates:** Monthly curated dates → `cslt_key_dates` (DELETE + INSERT per month)

## CourtListener Integration

- **Status:** Dormant — fetcher runs but skips all cases
- **Problem:** CSLT cases use court-format case numbers (e.g., `4:24-cv-00793`). CourtListener needs numeric docket IDs. No mapping table.
- **To re-enable:** Build CSLT-to-CL docket ID mapping

## State Legislation Map

- **Status:** Working (static data)
- **Data source:** `src/nil-state-data.json` — manually curated, Troutman Pepper (Feb 2026)
- **Map library:** `react-simple-maps` with US Atlas topology
- **Encoding:** Enacted = coral (#DC4A2D), No law = light gray (#e2e5ec)
- **Limitation:** Static data only. Live data blocked on LegiScan API key.

---

## Cost Summary

| Service | Plan | Cost |
|---------|------|------|
| Cloudflare Workers | Free (100K requests/day) | $0 |
| Cloudflare Pages | Free | $0 |
| Cloudflare D1 | Free (5M rows read, 100K writes/day) | $0 |
| Cloudflare Web Analytics | Free | $0 |
| Anthropic API (Sonnet 4.5) | Pay-per-use | ~$1–3/day |
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
- **Aesthetic:** Bloomberg terminal meets news app. Dense, glanceable.

---

## Cron Schedule

From `wrangler.toml`:

```
crons = ["0,30 * * * *", "10,40 * * * *", "7,37 * * * *", "25 10,11,19,20 * * *"]
```

- `0,30 * * * *` — **Group A**: Google News (88q)
- `10,40 * * * *` — **Group B**: Bing News (58q) + Publications (23 feeds) + NCAA RSS (3) + NewsData (18q)
- `7,37 * * * *` — **Group C** (light): CourtListener, NIL Revolution, CSLT (cases + key dates), Podcasts, CFBD
- `25 10,11,19,20 * * *` — AI pipeline. Handler maps UTC hour → ET and picks one of: `morning-primary` (6 AM ET), `morning-backup` (7 AM ET, EDT only), `afternoon-primary` (3 PM ET), `afternoon-backup` (4 PM ET, EDT only). Backup slots skip if today's brief for the period already exists. Weekends: Saturday none, Sunday afternoon only.

All three fetcher crons also run `ensureTodaysBriefing` as a safety net (kicks the pipeline if today's brief for the current window is missing and no run is in `started` state).

Groups B and C run fetchers **sequentially** with a 25-second wall-time budget. Google News isolated in Group A because it's the heaviest (88 queries). Dedup cache load failures are isolated — fetchers continue without cache.

---

## File Map

```
src/
  App.jsx              — Entire frontend (single file, ~1,600 lines)
  nil-state-data.json  — Static state legislation data (50 states + DC)
  main.jsx             — React entry point
workers/
  index.js             — Worker entry: routes fetch→API, cron→fetchers/AI, ensureTodaysBriefing safety net
  api.js               — /api/* endpoints + admin dashboard + SEO pages + trigger phases + hide/unhide + auth
  ai-pipeline.js       — 3 active AI tasks (tag, CSC detect, briefing) + runAIPipeline + ensureTodaysBriefing
  fetcher-utils.js     — Shared: cooldowns, dedup cache (Jaccard), noise/pro-sports/spam/portal filters, relevance gate, recordError, 7-day pubDate staleness
  rss-parser.js        — Regex-based RSS parser (no DOMParser in Workers)
  fetch-google-news.js — Google News RSS (88 queries)
  fetch-bing-news.js   — Bing News RSS (58 queries)
  fetch-newsdata.js    — NewsData.io API (18 queries)
  fetch-ncaa-rss.js    — NCAA.com RSS (3 feeds)
  fetch-courtlistener.js — CourtListener RECAP (dormant)
  fetch-nil-revolution.js — Troutman Pepper blog RSS
  fetch-publications.js — 23 RSS feeds (11 Tier 1 + 12 Tier 2)
  fetch-cslt.js        — College Sports Litigation Tracker scraper (cases + key dates)
  fetch-podcasts.js    — 6 podcast RSS feeds (freshness check)
  fetch-cfbd.js        — CFBD transfer portal + preseason intel
functions/
  api/[[path]].js      — Pages Function proxy (/api/* → Worker, with POST body forwarding)
  [[catchall]].js      — Pages Function proxy (SEO routes → Worker)
public/
  favicon.svg / favicon-32x32.png / favicon-16x16.png / favicon.ico / apple-touch-icon.png / og-image.png / robots.txt / _redirects
index.html             — SPA entry with meta tags, OG, structured data, analytics
schema.sql             — D1 schema (17 tables incl. gdelt_volume legacy + fetcher_errors)
NIL-Monitor-Status.md  — This file
CLAUDE.md              — Claude Code project instructions
.github/workflows/
  deploy.yml           — Auto-deploy on push to main
```

---

## What to Build Next

Priority order based on impact and readiness:

1. **Wire up existing API endpoints to Monitor page** — Deadlines, House Settlement, and CSC panels all have working APIs. Pure frontend work.
2. **Deadline extraction AI task** — Referenced in schema but not implemented. Would auto-extract deadlines from headlines and case updates.
3. **Build Congress fetcher** — `fetch-congress.js` doesn't exist. `CONGRESS_KEY` is set and ready.
4. **Peer Intelligence** — AD compensation, budget comparisons, conference revenue. Requires research + new data source.
5. **LegiScan fetcher** — Blocked on API key. Would populate `bills` table and bring State map to life.
6. **CourtListener re-integration** — Build CSLT-to-CL docket ID mapping so filing-level data supplements CSLT case summaries.
7. **Clean up dead code** — Remove `MOCK.kpis`, `MOCK.timeline`, `MOCK.xFeed`, orphaned `XListEmbed`, stale `courtroomOpen` toggle, misleading `isWithinHour` name.
8. **Refresh stale query-count comments** — `wrangler.toml`, `workers/index.js`, fetcher file headers cite outdated numbers. Low priority but annoying.
9. **Remove `fix-tags` trigger phase** — One-time hardcoded fix that's long since run.
