# NIL Monitor — Revised Information Architecture

## What This Is

A live, publicly accessible dashboard that gives college athletics decision-makers a single place to answer the question they ask every morning: **did anything change overnight that I need to know about?**

NIL Monitor tracks the regulatory, legal, and governance landscape of college athletics across five domains simultaneously: state and federal legislation, active litigation, NCAA governance and rule changes, College Sports Commission (CSC) enforcement activity, and the news environment that shapes public and institutional attention.

The product is live. When you open it, you are seeing the current state of the world.

## The Problem

The job of running a college athletic department changed fundamentally between 2024 and 2026. Revenue sharing, roster caps, multi-year player contracts, the College Sports Commission, 50 different state NIL laws, ongoing federal litigation, and an enforcement apparatus that didn't exist 18 months ago have turned athletic departments into operations that resemble professional sports front offices — without the infrastructure, staffing, or institutional knowledge that professional leagues spent decades building.

The people navigating this — ADs, compliance officers, GMs, sports lawyers, NIL agents, journalists — currently assemble their picture of the regulatory landscape from 8-10 separate sources every morning: D1.ticker for curated news, Teamworks/Opendorse for compliance operations, Saul Ewing or Troutman Pepper for legislative reference, CourtListener or PACER for litigation, NCAA.org for governance decisions, Twitter/X for real-time breaking developments, and conference office memos for compliance guidance. This takes 30-45 minutes. Things still get missed. A bill moves in a neighboring state and nobody catches it for days. A CSC guidance memo drops after the evening newsletter. A court filing happens on a Friday afternoon.

NIL Monitor replaces that assembly process with a single live view.

## Who Uses This

**Primary: Athletic Directors and their senior staff.** The AD is the convergence point — the person who must hold legislation, litigation, governance, enforcement, and public attention in their head simultaneously. ADs at 350+ D1 programs, along with their Deputy ADs, Chiefs of Staff, Senior Woman Administrators, and the new wave of General Managers, need full-spectrum situational awareness across all domains. ADU's 2025 burnout survey found exhaustion and disengagement both in the high-risk range for D1 administrators. The information burden is a direct contributor.

**Compliance officers.** The people responsible for CSC reporting (all third-party NIL deals over $600, reported within five business days), state law compliance, House settlement implementation, and institutional risk management. They need to know what changed in the regulatory environment — today, not next week.

**Sports lawyers.** Attorneys at firms like Troutman Pepper, Husch Blackwell, Saul Ewing, and in-house university counsel who need a single view of active litigation and legislative movement. They produce legal analysis; we surface what needs analyzing.

**NIL agents, collectives, and agencies.** The intermediaries negotiating deals in an environment where the rules are being written in real time. They need to know which state laws affect their operations, what the CSC considers a "valid business purpose," and which enforcement actions signal where the lines are.

**Sports business journalists.** Reporters at Sportico, Front Office Sports, The Athletic, ESPN, and newsletter operators like Extra Points and Business of College Sports who need a referenceable, citable source for the current state of legislation, litigation, and governance.

**Investors and brands.** Capital allocators evaluating regulatory risk in a $2.75B athlete compensation ecosystem that is still being legally defined.

## What Already Exists (and What Doesn't)

### Editorial layer (news consumption)
- **D1.ticker** — Dominant. 99% of D1 ADs. Curated email 2x/day. No interactivity, no filtering, no live updates. Owned by College.town, which also acquired Extra Points.
- **Extra Points** (Matt Brown) — Deep analysis of college sports business and policy, 4x/week. Not real-time. Now part of D1.ticker family.
- **CollegeAD News Feed** ($17/mo) — Insider sourcing on personnel and industry news. Hand-curated.
- **Sportico, Front Office Sports, Business of College Sports** — Sports business editorial. Good for investors and journalists. None track legislation or litigation systematically.
- **AthleticDirectorU** — Peer leadership content and professional development for ADs. Not a news or data product.

### Legal reference layer (static, manually updated)
- **Saul Ewing NIL Legislation Tracker** — Most widely cited state-by-state tracker. Static webpage. Updated irregularly.
- **Troutman Pepper Locke NIL Revolution** — Blog + podcast + state/federal tracker. Excellent legal analysis. Manually updated. Their "Highway to NIL" podcast is the best legal analysis audio in the space.
- **Husch Blackwell Annual NCAA Compliance Report** — Gold standard annual reference. A PDF, not a live tool.

### Operational layer (enterprise SaaS)
- **Teamworks / INFLCR** — Compliance management, NIL operations, and now GM/roster planning (Teamworks GM, used by 40+ D1 programs). Enterprise pricing.
- **Opendorse** — NIL marketplace, compliance tracking, deal management. Enterprise pricing.
- **Spry** — Compliance forms, scheduling, NIL process management.
- **On3 NIL** — Athlete valuation database and NIL deal coverage. Consumer/fan-facing.

### What doesn't exist
Nobody provides a live, integrated view across legislation + litigation + governance + enforcement + news. That's NIL Monitor. We don't compete with D1.ticker (editorial), Teamworks (operations), or Troutman Pepper (legal analysis). We are the **first screen** — the check that determines how you spend the rest of your morning.

---

## Design Principle: Zero Manual Maintenance

After initial setup — seeding the case list, curating the X List, configuring data source queries, pre-loading known fixed dates — the dashboard runs itself. No manual content entry, no daily updates, no curation burden. Every piece of information on the dashboard is either pulled from an automated data source, processed by the AI pipeline, or rendered by a free live embed.

This is non-negotiable and shapes every architectural decision in this document.

---

## The AI Processing Pipeline

The AI is not just the briefing writer. It is the processing layer for the entire dashboard.

Every data stream — LegiScan bills, CourtListener filings, NewsData.io articles, Google News headlines, NCAA.org RSS, NIL Revolution blog posts — feeds into the AI pipeline on each scheduled processing cycle. The AI reads, categorizes, and routes information to the correct parts of the dashboard:

- **Briefing generation:** Synthesize the most significant developments into the daily briefing.
- **Event extraction:** Identify discrete events (a bill moved, a filing was made, guidance was issued) and add them to the Events Timeline with appropriate category tags and source attribution.
- **Deadline extraction:** When a court filing contains a next hearing date, the AI extracts it and adds it to the Deadlines calendar. When a news article reports a new CSC reporting window or a legislative committee hearing date, same thing. Deadlines are not manually entered — they are discovered and populated by the AI reading the same data it's already processing.
- **CSC detection and tagging:** News articles, filings, and official announcements mentioning the College Sports Commission are automatically tagged `CSC / Enforcement` and routed to the dedicated CSC Activity Feed. The AI further sub-tags each item: `Guidance` | `Investigation` | `Enforcement` | `Personnel` | `Rule Clarification`.
- **New case detection:** CourtListener RECAP Search Alerts monitor for new federal cases matching keywords (NCAA, NIL, name image likeness, College Sports Commission, college athlete, revenue sharing). When a new case surfaces, the AI writes an initial summary, assigns a category, and adds it to the Case Tracker.
- **Case update processing:** When new filings appear on tracked cases, the AI reads the filing, updates the case's last activity date, extracts any new deadlines, and flags significant developments for the briefing.
- **Severity assessment:** The AI assigns severity indicators (routine / important / critical) to deadlines and events based on institutional impact, proximity, and precedent.

The pipeline runs on each data refresh cycle. The result: every section of the dashboard — briefing, timeline, deadlines, CSC feed, case tracker, KPI counts — stays current without any human intervention.

---

## Dashboard Structure

The dashboard is organized around **the questions the AD asks every morning**, not by data source type.

### Dashboard Hierarchy: Above the Fold vs. Below the Fold

The 30-second scan is actually a 3-second glance followed by a 27-second read. The glance tells you whether today is normal or not. The read gives you the details. The layout must serve both.

**Above the fold (visible on first load, no scroll — the actual dashboard):**
- Daily Briefing (left column, compact — the single most important block)
- Upcoming Deadlines (next to or directly below briefing — what's coming)
- House Settlement key numbers (the centerpiece metric — not the full command center, just the numbers: cap amount, next deadline, CSC action count)
- Live X Feed (right column sidebar — the pulse)

These panels are arranged as a **dense grid of compact cards** within the main content area, not full-width stacked sections. Think Bloomberg terminal quadrants, not a scrolling blog. The briefing, deadlines, and House numbers should all be visible simultaneously alongside the sidebar.

**No KPI strip.** Inventory counts ("47 state bills") don't answer the dashboard question ("did something change?"). The briefing, deadlines, and House numbers already tell the AD whether today is normal. If the live data pipeline later reveals metrics that genuinely signal change — event volume, severity level, days since last CSC action — they can be added then. Not before.

**Below the fold (scroll to explore — the detail layer):**
- Full Events Timeline with all filters
- Full House Settlement & CSC Command Center (expanded metrics, CSC Activity Feed, key personnel)
- Full Deadlines list (beyond the top 3-4)
- Regulatory Landscape with state map
- Litigation summary cards
- The Outside View (news volume, Google Trends, Polymarket)
- NIL Revolution latest posts and podcast player (can also live in sidebar)

Below the fold, sections can breathe — the map gets full width, litigation cards expand, trends embeds have room. Nobody expects to see the state map without scrolling. But the *dashboard* — the glanceable answer to "is today normal or a five-alarm day?" — must fit on one screen.

### Main Dashboard (Monitor page)

The single-page view. Everything an AD needs in one scan. Designed for a 30-second check: is today a normal day or a five-alarm day?

**Top of page: Status bar**
- LIVE indicator
- Last data refresh timestamp
- Navigation across all pages

**Section 1: What Changed Today**
*The briefing and timeline. This section dominates the top of the page visually — it's the reason people opened the tab.*

- **Daily Briefing** — AI-generated summary of the most significant developments in the last 24 hours. Written in the voice of a sharp deputy AD briefing their boss. Concise, action-oriented, no fluff. Cites sources. Highlights anything that requires institutional action.
- **Events Timeline** — Chronological feed with category tags and time filters. Every event is something that *happened* — a bill moved, a filing was made, a rule changed, guidance was issued, a case was decided. Not general news. Events. Populated automatically by the AI pipeline processing all incoming data streams.
  - Categories: `Legislation` | `Litigation` | `NCAA Governance` | `CSC / Enforcement` | `Revenue Sharing` | `Roster / Portal` | `Realignment`
  - Time filters: Today | 24h | 3d | 7d | 30d
  - Source attribution on every item

**Section 2: Deadlines & Calendar**
*These people run on deadlines. Missing one creates institutional risk.*

- **Upcoming Deadlines** — Countdown-style display of the next 5-8 critical dates
  - Court dates (hearings, filing deadlines, oral arguments) — auto-extracted from CourtListener filings by AI
  - Legislative session key dates (committee hearings, floor votes) — auto-extracted from LegiScan data by AI
  - House settlement implementation milestones — pre-loaded at setup (fixed dates defined in the settlement), with new milestones auto-extracted from filings and news as they emerge
  - CSC reporting windows — pre-loaded at setup (recurring schedule), with changes auto-detected from CSC guidance
  - Transfer portal open/close dates — pre-loaded at setup (published annually by NCAA), updated if changes detected in NCAA.org RSS
- Each deadline: date, days remaining, category tag, brief description, severity indicator (routine / important / critical)
- Deadlines within 7 days get visual emphasis
- **All deadlines are either pre-loaded at setup or auto-extracted by the AI pipeline. No ongoing manual entry.**

**Section 3: House Settlement & CSC Command Center**
*This is the centerpiece. The single most consequential thing in the industry. Every AD, compliance officer, and lawyer is tracking this.*

- **House Settlement Status** — Current phase, key metrics, visual progress indicator
  - Revenue-sharing cap: current amount ($20.5M), next adjustment date, annual increase rate
  - Back-damages fund: total ($2.78B), distribution status, next disbursement date
  - Opt-in status: how many schools have opted in (if data available)
  - Participation agreement status: signed vs. unsigned among Power 4
- **CSC Activity Feed** — Dedicated sub-feed showing latest guidance memos, investigations, enforcement actions, tip line activity. Populated automatically by the AI pipeline, which monitors all news and official sources for CSC-related content and tags each item:
  - `Guidance` | `Investigation` | `Enforcement` | `Personnel` | `Rule Clarification`
  - Sources: NewsData.io queries for "College Sports Commission," Google News RSS, NCAA.org, CourtListener (for any CSC-related filings), X feed (real-time breaking)
- **Key Personnel** — CSC leadership (Bryan Seeley, Katie Medearis) for context. Static, set at launch.
- **Link out** to full case detail on the Case Tracker page

**Section 4: Regulatory Landscape (Legislation)**
*Two-panel layout: map + detail*

- **State Map** — Grid cartogram of all 50 states, color-coded by legislative status
  - Enacted (has current NIL law) | Active bills in session | Introduced | No active legislation
  - Click any state → detail panel shows bills, sponsors, status, last action
  - All data from LegiScan API, fully automated
- **Detail Panel** — When no state is selected, shows federal bills. When a state is selected, shows that state's bills.
  - Future: conference-peer filtering (show me Big Ten states, show me SEC states)
- **Federal Bills** — Always visible, shown separately above or alongside the map
  - Bill number, title, sponsor, co-sponsor count, status, last action, committee
  - Data from LegiScan + Congress.gov, fully automated

**Section 5: The Courtroom (Litigation Summary)**
*Not just House v. NCAA. Contract enforcement, employment classification, antitrust challenges, and governance litigation.*

- **Active Cases** — Card for each tracked case with status badge, court, judge, last filing date, next action
  - Priority ordering: cases with upcoming deadlines or recent activity first
  - Initial case list seeded at setup with AI-generated summaries
  - New cases auto-detected via CourtListener RECAP Search Alerts and auto-summarized by AI
  - Case data (filings, dates, status) updated automatically from CourtListener
- Case categories:
  - `Settlement Implementation` (House v. NCAA)
  - `Contract Enforcement` (Williams v. Washington, Duke, Georgia, Wisconsin cases)
  - `Antitrust` (Dartmouth v. Ivy League, etc.)
  - `Employment Classification` (Carter v. NCAA, NLRB proceedings)
  - `Governance` (Tennessee v. NCAA, etc.)
- Click through to full detail on Case Tracker page

**Section 6: The Outside View (Attention & News)**
*What the outside world — and therefore your president, your board, and reporters — is paying attention to.*

- **News Volume** — Bar chart showing article volume over last 30 days for tracked terms. Built from NewsData.io query data, fully automated.
- **Search Trends** — Google Trends native embeds for key terms (NIL, transfer portal, House settlement, conference realignment). These are free, live Google widgets configured once at setup — they auto-update forever. No API needed.
- **Prediction Markets** — Polymarket live embeds. The Polymarket public API is queried automatically for active markets matching college sports keywords. If relevant markets exist, they display as live, auto-updating odds widgets. If no active markets exist, the section gracefully shows "No active prediction markets." Fully automated.
- This section is smaller and lower on the page. It's context, not action.

### Sidebar (persistent, right column on desktop)

The sidebar is the heartbeat of the dashboard. It's what makes NIL Monitor feel alive rather than periodically refreshed.

- **Live X Feed** — Embedded X List timeline showing a curated list of 30-50 accounts: beat reporters (Pete Thamel, Ross Dellenger, Nicole Auerbach), sports lawyers, official NCAA/CSC accounts, conference office accounts, D1.ticker, Extra Points, key ADs, and NIL-focused journalists. Uses X's free embedded timeline widget via publish.twitter.com — no API key, no cost. Auto-updates in real time. The list is curated once at setup; adding or removing an account occasionally is routine site maintenance, not ongoing content management.

- **Latest from NIL Revolution** — Auto-populated feed of latest post titles from Troutman Pepper's NIL Revolution blog (via RSS). Links out to their site. We surface the signal; they provide the legal depth. This signals complementarity, not competition, and drives traffic to the best legal analysis in the space.

- **Highway to NIL Podcast** — Spotify embedded player showing the latest episode of Troutman Pepper's "Highway to NIL" podcast. Free Spotify embed widget, always shows the most recent episode automatically. This is the best legal analysis audio in college sports — surfacing it alongside our data creates a complete picture: we show what changed, they explain what it means.

- On mobile, the sidebar collapses below the main content.

---

### Page 2: State Tracker (Deep Dive)

Full-page legislative view with two modes:

**Map View**
- Large interactive state map
- Click any state → full detail: current law (date enacted, key provisions), active bills, bill text links, sponsors
- All data from LegiScan, fully automated
- Future: comparison to conference-peer states

**Table View**
- Sortable table of all states with active legislation
- Columns: State, # Active Bills, Status, Most Recent Action, Date
- Click any row → detail view

**Federal Bills Section**
- Full detail on all tracked federal bills
- Co-sponsor lists, committee assignments, hearing dates
- Data from LegiScan + Congress.gov

---

### Page 3: Case Tracker (Litigation Deep Dive)

Dedicated page for active legal cases with expandable detail.

**For each case:**
- Case name, court, judge, status badge
- Filed date, last filing date, total filings count
- Case description / summary (AI-generated at detection, refined over time)
- Next scheduled action (with countdown if within 30 days) — auto-extracted by AI from filings
- Key dates timeline
- Links to CourtListener docket and PACER
- Recent filings list (date, title, link)

**Special treatment for House v. NCAA:**
- Implementation timeline with milestones
- Revenue-sharing mechanics summary
- CSC activity related to this case (auto-filtered from CSC feed)
- Key deadlines prominent

**Case categories with filtering:**
- Settlement Implementation
- Contract Enforcement
- Antitrust
- Employment Classification
- Governance

**New case detection:** CourtListener RECAP Search Alerts are configured at setup with keyword monitors. When new cases surface, the AI pipeline writes a summary, assigns a category, and adds the case to the tracker automatically.

---

### Page 4: Headlines (Full News Feed)

Full chronological news feed from all aggregated sources.

- Sources: NewsData.io, Google News RSS, NCAA.com RSS, NIL Revolution blog RSS
- Filterable by category, source, date range
- Each headline: title, source, timestamp, category tag, link
- Links out to original articles. Never reproduces content.
- This is the dedicated page for news consumption — the structured, searchable complement to the real-time X feed in the sidebar
- All sources automated. No manual curation.

---

### Page 5: About

- What NIL Monitor is and why it exists
- Who it's for
- Complete list of data sources with update frequencies
- Methodology: automated aggregation, AI-powered processing and categorization, no editorial judgment on inclusion, links to originals only
- **Resources:** Links to key reference sources our users rely on — Saul Ewing tracker, Troutman Pepper NIL Revolution, Husch Blackwell annual report, CourtListener, LegiScan. We are complementary to these, not competitive.
- Contact / feedback
- Open-source attribution

---

## Design System

### Visual Language
- **Light theme** — professional reference tool, not a consumer app
- Clean, dense, functional — information density over decoration
- The design should feel like a Bloomberg terminal had a child with a well-designed news app. Professional. Serious. Current.

### Color Palette
- **Primary:** Deep navy `#1a1a2e` — headers, navigation, emphasis
- **Accent:** Blue `#0066FF` — interactive elements, links, active states
- **Status green:** `#00875A` — enacted, settled, passed, live indicators
- **Status amber:** `#C77A00` — in committee, pending, implementation
- **Status red:** `#CC3340` — failed, stalled, critical deadlines
- **Background:** Off-white `#F8F9FB`
- **Surface:** White `#FFFFFF`
- **Text:** Near-black `#111827`
- **Text secondary:** `#5F6B7A`
- **Borders:** Light gray `#E2E6ED`

### Typography
- **DM Sans** — body text, headings, all prose
- **JetBrains Mono** — timestamps, bill numbers, case IDs, data labels, status badges

### Key Components
- **Card** — reusable container with title bar, optional accent stripe, optional actions area
- **Status Badge** — pill-shaped, color-coded by status, mono font
- **Category Tag** — small, color-coded by domain category
- **Timeline Item** — timestamp + category tag + source + headline
- **Filter Bar** — pill-shaped toggle buttons for time range and category
- **Deadline Card** — date, days remaining (with countdown emphasis for <7 days), category, description
- **State Map** — grid cartogram with click-to-detail interaction
- **Case Card** — expandable, with summary view and detail view
- **Headline Card** — source, title, timestamp, category, link
- **News Volume Chart** — bar chart with 30-day x-axis
- **Live Indicator** — green dot with pulse animation + "LIVE" text
- **Podcast Player** — Spotify embed widget, compact, in sidebar
- **Blog Feed** — RSS-driven list of recent post titles with source and link

### Layout
- **Desktop:** Two-column layout on the main dashboard. Primary content (left, ~65%) + persistent sidebar (right, ~35%) containing live X feed, NIL Revolution latest posts, and Highway to NIL podcast player. Full-width for sections that need it (map, deadlines).
- **Mobile:** Single column, sidebar content below main content.
- **Navigation:** Sticky top bar, navy background, five page links, LIVE indicator in logo area.
- **Maximum width:** 1280px, centered.

---

## Data Sources

All sources are automated after initial configuration. No source requires ongoing manual updates.

### Live Embeds (real-time, zero maintenance)

| Source | What It Provides | Update Frequency | Method | Cost |
|---|---|---|---|---|
| X (Twitter) List Embed | Live feed from curated list of 30-50 accounts (reporters, lawyers, officials) | Real-time | Free embedded timeline widget via publish.twitter.com (no API key) | Free |
| Google Trends Embeds | Search interest charts for key terms (NIL, transfer portal, House settlement, etc.) | Real-time | Native Google Trends embed widget, configured once | Free |
| Spotify Podcast Embed | Latest episode of "Highway to NIL" by Troutman Pepper Locke | Auto-updates with new episodes | Free Spotify embed widget | Free |
| Polymarket Embeds | Prediction market odds on relevant college sports events | Real-time | Public API to detect active markets + native embed widgets | Free |

### Automated Data Feeds (scheduled, processed by AI pipeline)

| Source | What It Provides | Update Frequency | Method | Cost |
|---|---|---|---|---|
| LegiScan | State + federal bill tracking (50 states + Congress) | Every 4-6 hours | REST API (free tier: 30K queries/mo) | Free |
| CourtListener / RECAP | Federal court filings, docket tracking, new case alerts | Daily + alert-based | REST API + RECAP Search Alerts | Free |
| NCAA.org / NCAA.com | Governance decisions, rule changes, enforcement news | Twice daily | RSS feeds | Free |
| NewsData.io | News article aggregation (87K+ sources) | 4x daily | REST API (free tier: 200 credits/day) | Free |
| Google News RSS | Supplemental news headlines | 4x daily | RSS (free, no key) | Free |
| Congress.gov | Federal bill detail, co-sponsor tracking | Daily | REST API (free, 5K req/hr) | Free |
| NIL Revolution Blog | Latest legal analysis posts from Troutman Pepper Locke | As published | RSS feed (WordPress site) | Free |

### Pre-loaded at Setup (one-time configuration)

| Data | Source | Maintenance |
|---|---|---|
| House settlement milestones | Settlement document (fixed dates) | None — dates are defined. AI detects new milestones from filings/news. |
| CSC reporting windows | CSC guidance documents (recurring schedule) | None — AI detects changes from news/official sources. |
| Transfer portal dates | NCAA annual calendar | None — AI detects changes from NCAA.org RSS. |
| Initial case list + summaries | CourtListener + AI-generated descriptions | None — new cases auto-detected and auto-summarized by AI. |
| X List account curation | Manual selection of 30-50 accounts | Occasional (adding/removing an account is routine site maintenance). |
| CourtListener keyword alerts | Keyword configuration for RECAP Search Alerts | None after setup. |
| Key personnel (CSC leadership) | Public information | Rare updates (same class of effort as any site change). |

---

## Build Phases (Revised)

### Phase 1: Static Shell
- Full page layout with all 5 pages and navigation
- Two-column dashboard layout with persistent sidebar (X feed + NIL Revolution + podcast player)
- Complete design system: colors, typography, all components
- Realistic placeholder data across all sections including:
  - Daily Briefing
  - Events Timeline with filtering
  - Deadlines calendar
  - House Settlement / CSC command center
  - Legislative map with state detail
  - Litigation cards with expansion
  - News volume chart
  - Google Trends embeds (can be live even in Phase 1)
  - Prediction markets / Polymarket (can be live even in Phase 1)
  - Sidebar: live X feed placeholder or mockup, NIL Revolution feed mockup, Spotify podcast embed (can be live even in Phase 1)
- Responsive (desktop-first, mobile-usable)
- **Deliverable:** Complete UI with realistic mock data, ready for review. Note: Google Trends embeds, Spotify podcast embed, and Polymarket embeds can be live in Phase 1 since they're just embed codes — no backend needed.

### Phases 2-4: Live Data + AI Pipeline + Tuning

See **NIL-Monitor-Build-Spec.md** for the complete implementation plan, including Cloudflare stack setup, data fetch Workers, D1 schema, AI processing pipeline architecture, prompt patterns, and session-by-session development workflow with Claude Code.
