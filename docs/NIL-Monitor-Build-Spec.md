# NIL Monitor — Build Specification

## Tech Stack

| Layer | Tool | Why |
|---|---|---|
| Frontend | React (Vite) | Already built in Phase 1 |
| Hosting | Cloudflare Pages | Free, deploys from GitHub on push |
| Backend | Cloudflare Workers | Native cron triggers for scheduled jobs, free tier = 100K requests/day |
| Database | Cloudflare D1 | SQLite at the edge, free tier = 5M reads/day, 100K writes/day |
| AI Processing | Anthropic API (Claude) | Briefing generation, event extraction, deadline detection, case summarization |
| Repo | GitHub | Source of truth, triggers Cloudflare Pages deploys |
| Dev Tool | Claude Code | Primary development workflow |

### Cloudflare Free Tier Limits (relevant)

- **Workers:** 100K requests/day, 10ms CPU per invocation (50ms on cron), 128MB memory
- **D1:** 5M rows read/day, 100K rows written/day, 5GB storage
- **Pages:** Unlimited sites, 500 builds/month
- **Cron Triggers:** Unlimited schedules on free plan

These limits are generous for our use case. The entire data pipeline runs maybe 20-30 Worker invocations per day.

---

## Phase 2: Live Embeds + Raw Data Pipes

**Goal:** Replace all mock data with real data. No AI processing yet — structured data goes straight into the frontend. Sidebar becomes fully live.

**Estimated time:** 1-2 weeks of focused work.

### 2A: Live Embeds (Day 1)

These are copy-paste embed codes. No backend. Can be done in an afternoon.

**X List Timeline**
1. Create a Twitter/X account (or use existing)
2. Create a public List: "NIL Monitor Feed"
3. Add 30-50 accounts: Pete Thamel, Ross Dellenger, Nicole Auerbach, D1.ticker, Extra Points, NCAA official, CSC official, conference accounts, sports lawyers, NIL-focused journalists
4. Go to publish.twitter.com → paste the List URL → copy embed code
5. Replace the mock X feed in the sidebar with the embed `<iframe>`
6. Style with CSS to fit the sidebar column

**Spotify Podcast Embed**
1. Find "Highway to NIL" on Spotify
2. Click Share → Embed → Copy embed code
3. Replace mock podcast section in sidebar with embed `<iframe>`
4. Always shows latest episode automatically

**Google Trends Embeds**
1. Go to Google Trends
2. Search for terms: "NIL", "transfer portal", "House settlement", "conference realignment"
3. Use the embed widget option (or `<script>` tag from trends.google.com)
4. Replace mock trends placeholder in The Outside View section

**Polymarket**
- Check Polymarket for active college sports markets
- If markets exist: embed via their widget system or display odds from their public API
- If no markets: show "No active prediction markets" gracefully
- This can be a simple fetch from `https://gamma-api.polymarket.com/` on the client side

**NIL Revolution RSS**
- Troutman Pepper's blog is WordPress-based; RSS feed likely at `/feed/` or `/rss/`
- Parse RSS client-side (or via a tiny Worker) and display latest 4-5 post titles in sidebar
- Link out to their site

**Deliverable:** Sidebar is 100% live. Outside View section has real Google Trends and Polymarket data. Dashboard feels alive.

### 2B: Cloudflare Setup (Day 2)

**Cloudflare Account + Wrangler**
```bash
# Install wrangler CLI
npm install -g wrangler

# Login
wrangler login

# Init project (in your existing repo)
wrangler init nil-monitor --type javascript
```

**D1 Database**
```bash
# Create database
wrangler d1 create nil-monitor-db

# Add to wrangler.toml
[[d1_databases]]
binding = "DB"
database_name = "nil-monitor-db"
database_id = "<id-from-above>"
```

**Schema — create tables:**
```sql
-- Bills (state + federal, from LegiScan)
CREATE TABLE bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT UNIQUE,        -- LegiScan bill_id or Congress.gov bill number
  state TEXT,                   -- 2-letter code, or "US" for federal
  bill_number TEXT,
  title TEXT,
  description TEXT,
  status TEXT,                  -- introduced, in_committee, passed_one, passed_both, enacted, failed
  sponsor TEXT,
  cosponsor_count INTEGER DEFAULT 0,
  committee TEXT,
  last_action TEXT,
  last_action_date TEXT,
  url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Cases (from CourtListener + seeded at setup)
CREATE TABLE cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT UNIQUE,        -- CourtListener docket ID
  name TEXT,
  court TEXT,
  judge TEXT,
  status TEXT,
  category TEXT,                -- settlement_implementation, contract_enforcement, antitrust, employment, governance
  filed_date TEXT,
  last_filing_date TEXT,
  filing_count INTEGER DEFAULT 0,
  next_action TEXT,
  next_action_date TEXT,
  description TEXT,             -- AI-generated summary
  courtlistener_url TEXT,
  pacer_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Headlines (from NewsData.io + Google News RSS)
CREATE TABLE headlines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT,                  -- "ESPN", "Sportico", etc.
  title TEXT,
  url TEXT UNIQUE,
  category TEXT,                -- legislation, litigation, ncaa_governance, csc_enforcement, revenue_sharing, roster_portal, realignment
  published_at TEXT,
  fetched_at TEXT DEFAULT (datetime('now'))
);

-- Events Timeline (AI-extracted from all sources)
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT,
  source_url TEXT,
  category TEXT,
  text TEXT,
  severity TEXT,                -- routine, important, critical
  event_time TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Deadlines (AI-extracted + pre-loaded)
CREATE TABLE deadlines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT,
  category TEXT,
  text TEXT,
  severity TEXT,
  source TEXT,                  -- "pre-loaded", "ai-extracted", source name
  created_at TEXT DEFAULT (datetime('now'))
);

-- CSC Activity (AI-tagged from news + official sources)
CREATE TABLE csc_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tag TEXT,                     -- guidance, investigation, enforcement, personnel, rule_clarification
  text TEXT,
  source TEXT,
  source_url TEXT,
  activity_time TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Daily Briefings (AI-generated)
CREATE TABLE briefings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT UNIQUE,
  content TEXT,                 -- JSON array of [headline, body] pairs
  generated_at TEXT DEFAULT (datetime('now'))
);

-- House Settlement (key metrics, updated periodically)
CREATE TABLE house_settlement (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE,
  value TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);
```

**Deploy schema:**
```bash
wrangler d1 execute nil-monitor-db --file=./schema.sql
```

**Seed House Settlement data:**
```sql
INSERT INTO house_settlement (key, value) VALUES
  ('phase', 'Final Approval Pending'),
  ('hearing_date', '2026-03-12'),
  ('rev_share_cap', '$20.5M'),
  ('cap_adjustment_date', '2026-07-01'),
  ('back_damages_total', '$2.78B'),
  ('back_damages_distributed', '$0'),
  ('opted_in', '62/70');
```

**Seed initial deadlines:**
```sql
INSERT INTO deadlines (date, category, text, severity, source) VALUES
  ('2026-02-23', 'CSC / Enforcement', 'CSC Q1 reporting window closes', 'critical', 'pre-loaded'),
  ('2026-03-01', 'Revenue Sharing', 'Participation agreement signature deadline (Power 4)', 'critical', 'pre-loaded'),
  ('2026-03-12', 'Litigation', 'House v. NCAA final fairness hearing', 'critical', 'pre-loaded'),
  ('2026-03-15', 'Roster / Portal', 'Spring transfer portal window closes', 'important', 'pre-loaded'),
  ('2026-04-15', 'CSC / Enforcement', 'CSC Q2 reporting window opens', 'routine', 'pre-loaded'),
  ('2026-07-01', 'Revenue Sharing', 'Revenue-sharing cap annual adjustment', 'important', 'pre-loaded');
```

**Seed initial cases** (the 5 from the mock data, plus any others you want to track from the start).

### 2C: Data Fetch Workers (Days 3-10)

Each Worker fetches from one data source, parses the response, and writes to D1. All triggered by cron.

**Worker structure (one file per source):**

```
workers/
  legiscan.js        -- State + federal bills
  courtlistener.js   -- Case filings + new case alerts
  newsdata.js        -- News headlines
  google-news.js     -- Supplemental headlines via RSS
  congress.js        -- Federal bill detail
  ncaa-rss.js        -- NCAA.org governance RSS
```

**wrangler.toml cron triggers:**
```toml
[triggers]
crons = [
  "0 */6 * * *",    # Every 6 hours: LegiScan
  "0 8,20 * * *",   # Twice daily: CourtListener, NCAA RSS
  "0 */6 * * *",    # Every 6 hours: NewsData.io, Google News RSS
  "0 10 * * *",     # Daily: Congress.gov
]
```

**LegiScan Worker (example pattern):**
```javascript
export default {
  async scheduled(event, env, ctx) {
    // Fetch active NIL-related bills
    const keywords = ["NIL", "name image likeness", "college athlete", "student athlete compensation"];
    for (const keyword of keywords) {
      const resp = await fetch(
        `https://api.legiscan.com/?key=${env.LEGISCAN_KEY}&op=search&query=${encodeURIComponent(keyword)}`
      );
      const data = await resp.json();
      // Parse results, upsert into D1 bills table
      for (const bill of data.searchresult?.results || []) {
        await env.DB.prepare(`
          INSERT OR REPLACE INTO bills (source_id, state, bill_number, title, status, last_action, last_action_date, url, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).bind(bill.bill_id, bill.state, bill.bill_number, bill.title, bill.status, bill.last_action, bill.last_action_date, bill.url).run();
      }
    }
  }
};
```

**Each Worker follows the same pattern:**
1. Fetch from API
2. Parse response
3. Upsert into D1
4. Log success/failure

**API Keys needed:**
- LegiScan: Free tier API key (sign up at legiscan.com)
- NewsData.io: Free tier API key (sign up at newsdata.io)
- Congress.gov: Free API key (api.congress.gov)
- CourtListener: No key needed (free API, unauthenticated)
- NCAA.org RSS: No key needed
- Google News RSS: No key needed

Store keys as Worker secrets:
```bash
wrangler secret put LEGISCAN_KEY
wrangler secret put NEWSDATA_KEY
wrangler secret put CONGRESS_KEY
```

### 2D: Frontend → D1 Connection (Days 8-12)

**API Worker** — a single Worker that serves data from D1 to the frontend:

```
workers/
  api.js   -- Reads from D1, serves JSON endpoints
```

**Endpoints:**
```
GET /api/bills?state=TX          → bills for a state
GET /api/bills?state=US          → federal bills
GET /api/bills/stats             → bill counts by state/status
GET /api/cases                   → all tracked cases
GET /api/cases/:id               → single case with filings
GET /api/headlines?cat=litigation → filtered headlines
GET /api/deadlines               → upcoming deadlines
GET /api/house                   → House settlement metrics
GET /api/briefing                → latest daily briefing (empty until Phase 3)
GET /api/events                  → events timeline (empty until Phase 3)
GET /api/csc                     → CSC activity feed (empty until Phase 3)
```

**Frontend changes:**
- Replace all MOCK data imports with `fetch('/api/...')` calls
- Add loading states
- Add error states
- Data refreshes on page load (no polling needed; the backend updates on its schedule)

**Deliverable:** State Tracker shows real LegiScan bills. Case Tracker shows real CourtListener data. Headlines page shows real news. Deadlines show pre-loaded + any manually added dates. House Settlement shows seeded metrics. Sidebar is fully live (embeds from Phase 2A). The AI-powered sections (briefing, events timeline, CSC feed) are present but empty or show "AI processing coming soon."

### 2E: GitHub → Cloudflare Deploy Pipeline

```bash
# In Cloudflare dashboard:
# Pages → Create project → Connect GitHub repo
# Build command: npm run build
# Output directory: dist
# Environment variables: add D1 binding
```

Every push to `main` triggers a deploy. Takes ~30 seconds.

---

## Phase 3: AI Processing Pipeline

**Goal:** The AI reads all incoming data and produces the intelligence layer — briefing, events, deadlines, CSC tags, case summaries, severity ratings.

**Estimated time:** 2-3 weeks with iteration on prompt quality.

### 3A: Pipeline Architecture

**One Worker, triggered after each data fetch cycle:**

```
workers/
  ai-pipeline.js   -- Reads new data from D1, sends to Claude, writes processed output back to D1
```

**Cron schedule:** Runs 30 minutes after each data fetch cycle (to ensure new data is in D1):
```toml
# Add to wrangler.toml
# Data fetchers run at :00, AI pipeline runs at :30
crons = [
  "30 */6 * * *",   # AI pipeline: 4x daily, 30 min after data fetch
  "30 8 * * *",     # Morning briefing generation
]
```

**Pipeline flow:**
```
1. Query D1 for all records updated since last pipeline run
2. Bundle new headlines, bills, filings, etc. into a context payload
3. Send to Claude API with structured prompts
4. Parse Claude's response (JSON)
5. Write results to D1: events, deadlines, CSC items, briefing, severity updates
6. Update last_pipeline_run timestamp
```

### 3B: Anthropic API Integration

```javascript
async function callClaude(env, systemPrompt, userContent) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",  // Best balance of quality and cost for this
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    }),
  });
  return await resp.json();
}
```

**Cost estimate:** Sonnet at ~$3/M input, $15/M output tokens. Each pipeline run processes maybe 2-5K input tokens and generates 1-2K output. At 4 runs/day, that's roughly $0.30-$1.00/day. Under $30/month.

```bash
wrangler secret put ANTHROPIC_KEY
```

### 3C: AI Tasks (Each Gets a Specific Prompt)

**Task 1: Event Extraction**

Input: New headlines, bill updates, filing updates from D1 (since last run).

Prompt pattern:
```
You are extracting discrete events for a college athletics regulatory dashboard.
An event is something that HAPPENED — a bill moved, a filing was made, a rule changed,
guidance was issued. Not general commentary or opinion.

For each event, return JSON:
{
  "events": [
    {
      "text": "One-sentence description of what happened",
      "category": "Legislation|Litigation|NCAA Governance|CSC / Enforcement|Revenue Sharing|Roster / Portal|Realignment",
      "severity": "routine|important|critical",
      "source": "Source name",
      "source_url": "URL"
    }
  ]
}

Here are the new items since the last processing cycle:
[...data from D1...]
```

**Task 2: Daily Briefing**

Input: All events extracted in the last 24 hours + any significant bill/case updates.

Prompt pattern:
```
You are a sharp deputy AD briefing your boss at 6 AM. Write a concise briefing
of the most significant developments in the last 24 hours. Voice: direct,
action-oriented, no fluff. Cite sources. Highlight anything requiring
institutional action.

Return JSON:
{
  "sections": [
    { "headline": "Bold opening sentence", "body": "2-3 sentences of detail" }
  ]
}

Developments from the last 24 hours:
[...events + raw data...]
```

**Task 3: Deadline Extraction**

Input: New court filings, bill updates, news mentioning dates.

Prompt pattern:
```
Extract any upcoming deadlines from these items. A deadline is a specific future date
that requires action or attention — a hearing date, a filing deadline, a reporting window,
a legislative hearing, a vote date.

Return JSON:
{
  "deadlines": [
    {
      "date": "YYYY-MM-DD",
      "category": "...",
      "text": "Brief description",
      "severity": "routine|important|critical",
      "source": "Where this date was found"
    }
  ]
}

New items:
[...data...]
```

**Task 4: CSC Detection and Tagging**

Input: All new headlines and items mentioning "College Sports Commission", "CSC", Bryan Seeley, Katie Medearis, or related enforcement terms.

Prompt pattern:
```
Identify items related to the College Sports Commission and tag each one.

Return JSON:
{
  "csc_items": [
    {
      "text": "Description",
      "tag": "Guidance|Investigation|Enforcement|Personnel|Rule Clarification",
      "source": "...",
      "source_url": "..."
    }
  ]
}
```

**Task 5: New Case Summarization**

Input: New case data from CourtListener RECAP alerts.

Prompt pattern:
```
Write a 2-sentence summary of this new federal court case for an athletic director's
dashboard. Include: what the case is about, who the parties are, and why it matters
to college athletics.

Assign a category: Settlement Implementation, Contract Enforcement, Antitrust,
Employment Classification, or Governance.
```

### 3D: Pipeline Orchestration

The ai-pipeline Worker runs all tasks in sequence:

```javascript
export default {
  async scheduled(event, env, ctx) {
    const lastRun = await getLastPipelineRun(env.DB);

    // 1. Get new data since last run
    const newHeadlines = await getNewHeadlines(env.DB, lastRun);
    const newBillUpdates = await getNewBillUpdates(env.DB, lastRun);
    const newFilings = await getNewFilings(env.DB, lastRun);

    if (newHeadlines.length + newBillUpdates.length + newFilings.length === 0) {
      return; // Nothing new, skip processing
    }

    // 2. Extract events
    const events = await extractEvents(env, newHeadlines, newBillUpdates, newFilings);
    await writeEvents(env.DB, events);

    // 3. Extract deadlines
    const deadlines = await extractDeadlines(env, newFilings, newBillUpdates, newHeadlines);
    await writeDeadlines(env.DB, deadlines);

    // 4. Tag CSC activity
    const cscItems = await tagCSCActivity(env, newHeadlines);
    await writeCSCActivity(env.DB, cscItems);

    // 5. Generate briefing (only on morning run)
    if (isMorningRun(event)) {
      const todayEvents = await getTodayEvents(env.DB);
      const briefing = await generateBriefing(env, todayEvents);
      await writeBriefing(env.DB, briefing);
    }

    // 6. Summarize new cases (if any detected)
    const newCases = await getUnsummarizedCases(env.DB);
    for (const c of newCases) {
      const summary = await summarizeCase(env, c);
      await updateCaseSummary(env.DB, c.id, summary);
    }

    await setLastPipelineRun(env.DB);
  }
};
```

### 3E: Frontend Updates

- `/api/briefing` now returns real AI-generated briefing
- `/api/events` now returns real AI-extracted events with severity
- `/api/deadlines` now returns pre-loaded dates + AI-extracted dates
- `/api/csc` now returns AI-tagged CSC activity
- Case descriptions are AI-generated

**Deliverable:** The full dashboard is alive. Every section has real data. The briefing reads like a sharp deputy AD. Events timeline shows actual things that happened. Deadlines include dates extracted from court filings. CSC activity is automatically detected and tagged.

---

## Phase 4: Tuning + Polish

**Goal:** Make everything better. This phase is ongoing.

**Estimated time:** Ongoing, but initial pass is 1-2 weeks.

### 4A: Briefing Quality

- Refine the briefing prompt based on real output. The first few briefings will be okay but not great. Iterate on voice, length, and what gets highlighted.
- Test with real ADs if possible — does this save them time? What's missing?
- Tune severity assessment — initial thresholds will be wrong. What counts as "critical" vs. "important"?

### 4B: Event Extraction Accuracy

- Review AI-extracted events against raw data. Are events being missed? Are non-events being included?
- Refine category assignment — is the AI correctly distinguishing Legislation from Litigation?
- Tune the "something happened" detector — the AI should only extract discrete events, not commentary

### 4C: Deadline Reliability

- Audit extracted deadlines against known dates. Are court hearing dates being caught? Are legislative hearing dates being caught?
- Add deduplication — the same deadline might be mentioned in multiple sources
- Add expiration — auto-remove deadlines that have passed

### 4D: Additional Features (Backlog)

These are not Phase 4 requirements, but natural next steps:

- **Conference-peer filtering on state map:** "Show me Big Ten states" / "Show me SEC states"
- **Email digest:** Optional daily email with the briefing content (Cloudflare Workers + SendGrid/Resend free tier)
- **Push notifications:** Browser notifications for critical-severity events
- **KPI strip (conditional):** If the data pipeline reveals metrics that genuinely signal change (event volume spikes, severity shifts), add them back above the fold
- **Search:** Full-text search across bills, cases, headlines, events
- **User preferences:** Allow filtering by conference, state, or category as default view

---

## Development Workflow with Claude Code

### Setup
```bash
# Clone repo
git clone https://github.com/<your-username>/nil-monitor.git
cd nil-monitor

# Install dependencies
npm install

# Install wrangler
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Start Claude Code
claude
```

### Working Pattern

Claude Code can handle most of the implementation directly:

1. **"Set up D1 database with the schema from the build spec"** → Claude Code creates schema.sql, runs wrangler commands
2. **"Write the LegiScan Worker"** → Claude Code writes the Worker, tests it locally with `wrangler dev`
3. **"Connect the frontend to the API"** → Claude Code replaces mock data with fetch calls
4. **"Write the AI pipeline prompt for event extraction"** → Claude Code writes the prompt, tests against sample data

### Local Development
```bash
# Frontend
npm run dev           # Vite dev server on localhost:5173

# Workers
wrangler dev          # Worker dev server on localhost:8787

# D1 (local)
wrangler d1 execute nil-monitor-db --local --file=schema.sql
```

### Deploy
```bash
# Workers
wrangler deploy

# Frontend (auto-deploys on push to main via Cloudflare Pages)
git push origin main
```

---

## File Structure (Final)

```
nil-monitor/
├── src/                        # React frontend (Vite)
│   ├── App.jsx
│   ├── pages/
│   │   ├── Monitor.jsx
│   │   ├── States.jsx
│   │   ├── Cases.jsx
│   │   ├── Headlines.jsx
│   │   └── About.jsx
│   ├── components/
│   │   ├── Panel.jsx
│   │   ├── Badge.jsx
│   │   ├── StateMap.jsx
│   │   ├── Timeline.jsx
│   │   └── ...
│   └── lib/
│       └── api.js              # fetch wrappers for /api/* endpoints
├── workers/
│   ├── api.js                  # API endpoint Worker (serves D1 data to frontend)
│   ├── legiscan.js             # LegiScan data fetcher
│   ├── courtlistener.js        # CourtListener data fetcher
│   ├── newsdata.js             # NewsData.io fetcher
│   ├── google-news.js          # Google News RSS fetcher
│   ├── congress.js             # Congress.gov fetcher
│   ├── ncaa-rss.js             # NCAA.org RSS fetcher
│   └── ai-pipeline.js          # AI processing pipeline
├── schema.sql                  # D1 database schema
├── seed.sql                    # Initial data (deadlines, cases, house settlement)
├── wrangler.toml               # Cloudflare Workers config + cron triggers
├── vite.config.js
├── package.json
└── README.md
```

---

## API Keys / Accounts Needed

| Service | Action | Cost |
|---|---|---|
| Cloudflare | Sign up at cloudflare.com | Free |
| LegiScan | Sign up at legiscan.com, get API key | Free (30K queries/mo) |
| NewsData.io | Sign up at newsdata.io, get API key | Free (200 credits/day) |
| Congress.gov | Sign up at api.congress.gov, get API key | Free (5K req/hr) |
| Anthropic | Sign up at console.anthropic.com, get API key | ~$20-30/month |
| Twitter/X | Account for creating the curated List | Free |

**Total recurring cost: ~$20-30/month** (Anthropic API only). Everything else is free.

---

## When to Start

Now. Phase 2A (live embeds) requires no backend — it's embed codes in the existing React app. You can have the sidebar live today.

The sequence to follow in Claude Code:

1. **Session 1:** Live embeds (X List, Spotify, Google Trends, Polymarket). Push to GitHub.
2. **Session 2:** Cloudflare setup, D1 schema, seed data. Push.
3. **Session 3:** First data Worker (LegiScan — it's the most impactful, populates the entire State Tracker). Push.
4. **Session 4:** API Worker + frontend connection for bills. Push. State Tracker is now live.
5. **Session 5:** CourtListener Worker + case data. Cases page goes live.
6. **Session 6:** NewsData + Google News Workers. Headlines page goes live.
7. **Session 7:** Congress.gov Worker. Federal bill detail enriched.
8. **Session 8:** AI pipeline — event extraction first, then briefing, then deadlines, then CSC tagging.

Each session is a few hours. Each push deploys automatically. Progress is visible immediately.
