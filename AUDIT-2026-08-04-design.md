# NIL Monitor — Software Design Audit

> **Audit date:** 2026-08-04
> **Auditor:** Claude Opus 5 (1M context)
> **Branch audited:** `main` @ `ed7d89e` (data: refresh PE Tracker through 2026-05-19)
> **Scope:** Every file under `src/`, `workers/`, `functions/`, plus `schema.sql`, `wrangler.toml`, `package.json`, `.github/workflows/deploy.yml`, and all five markdown docs.
> **Method:** Static read of the actual source. No production endpoints were probed and no D1 queries were run — the local `wrangler` CLI is **not logged in** (`wrangler whoami` → "Failed to fetch auth token: 400"). Every claim below is verifiable by reading the cited file and line.

---

## What this document is and why it exists

This is a **design-quality audit**, not a bug hunt. It grades the codebase against five software design principles from Matt Pocock's talk on AI-assisted coding, plus a sixth added because it turned out to be this project's biggest weakness:

1. Shared design concept
2. Ubiquitous language
3. Testing and feedback loops
4. Deep modules vs shallow modules
5. Invest in design daily
6. Docs-as-contract *(added — see §6)*

**Why it was built.** The prior audit (`AUDIT-2026-04-24.md`) found defects — things that were broken or wasteful. Eight of its findings were fixed the same day. This audit asks a different question: *is the codebase shaped so that a human or a fresh AI session can safely change it?* That matters here specifically because the project is developed almost entirely through AI sessions, has no tests, and deploys straight to production on every push to `main`.

**The headline conclusion.** The data pipeline is well-engineered and thoughtfully documented at the product level. But there is **no automated feedback loop of any kind**, and ~2,000 lines of runtime-constructed regular expressions sit behind a CI pipeline that cannot validate them. One typo can take the entire product down with a green build (§3). That is the finding to act on first.

**Relationship to the April audit.** Findings below are marked:

- **[new]** — not present in the April audit
- **[restates §X]** — same underlying issue, re-framed through a design lens
- **[§X now fixed]** — April finding since resolved; recorded so nobody re-reports it

`AUDIT-2026-04-24.md` has been annotated with resolution status. **Read that annotation before acting on anything in it** — as originally written, it lists eight findings as open that were fixed on 2026-04-24.

---

## Verdicts at a glance

| # | Principle | Verdict |
|---|-----------|---------|
| 1 | Shared design concept | **mixed** — excellent product-level rationale, absent code-level model |
| 2 | Ubiquitous language | **weak** — collisions, wrong names, three implementations of one concept |
| 3 | Testing and feedback loops | **weak** — zero tests, zero CI gates, one silent-total-outage path |
| 4 | Deep vs shallow modules | **mixed** — two exemplary deep modules, two dumping grounds |
| 5 | Invest in design daily | **weak** — good burst in April, then 11 weeks of zero commits |
| 6 | Docs-as-contract | **weak** — docs instruct sessions to trust facts that are stale or missing |

---

## 1. Shared design concept — mixed

### What's strong

`NIL-Monitor-Status.md` carries 22 numbered architecture decisions **with rationale**. Several capture genuinely non-obvious reasoning that would otherwise live only in the author's head — decision #18 explains *why* aggregator-sourced stories are dropped from briefings (if a real outlet had covered the story, tier-preference dedup would already have kept that version, so an aggregator surviving to the final pool means nobody with a trustworthy timestamp reported it). `docs/NIL-Monitor-Revised-IA.md` states the governing product constraint — "zero manual maintenance" — and the architecture visibly honors it.

This is above average for a solo project and should be preserved.

### Weak points

**1.1 The classification cascade has no stated model.** A headline passes through ten gates: `isGameNoise` → `isProSportsNoise` → `isSpamTitle` → `isBlockedDomain` → `categorizeByKeyword` → AI tagger → `Off-Topic` → `hidden` → briefing aggregator drop → frontend re-filter. Each is commented locally; nothing describes the *layers* or which one owns a given kind of decision.

Evidence that this is already causing drift: when portal noise became a problem, the fix landed as a default `category != 'Roster / Portal'` SQL clause in `workers/api.js:766` — a fourth location — rather than in `isPortalNoise` (`workers/fetcher-utils.js:558`), which exists for exactly that purpose.

*Failure scenario:* you decide to stop surfacing high-school coaching hires. Five locations are equally plausible — `PREFLIGHT_NOISE_RE`, `isTitleRelevant`, the tag prompt's Off-Topic guardrails, the API exclusion clause, or admin hide. No rule exists for choosing, so whichever you pick, the other four now contain near-duplicate intent that the next session must reconcile.

**1.2 `FETCHER_CONFIG` is a hand-maintained mirror that has already drifted.** **[new]**
`workers/api.js:89-107` duplicates every fetcher's cooldown, with the comment *"Mirrors each fetcher's actual getCooldown() logic."* It does not:

| Fetcher | Real (`fetch-podcasts.js:23`) | Mirror (`api.js:99`) |
|---|---|---|
| `podcasts` | **120** min | **360** min |

*Failure scenario:* the podcast fetcher breaks. `getFetcherStatus` (`api.js:194-196`) flags amber at 3× cooldown and red at 6×. With the wrong cooldown that's amber at 18h instead of 6h, red at 36h instead of 12h — a full day of lost detection on a fetcher deliberately tuned to 2 hours "to catch morning shows faster."

Note the status doc records the stale *comment* in `fetch-podcasts.js` as a known issue. The actual bug is the opposite direction: the comment is fine, the mirror in `api.js` is wrong.

**1.3 The briefing prompt has 25+ named rules and no priority model.** **[restates §3.3]** Sharpened: the deeper problem isn't that the rules conflict, it's that **nothing records which rule fired**. `pipeline_runs` stores a status and counts; there is no `prompt_version` column. The rationale for any given rule exists only in the commit that added it, so prompt quality cannot be attributed or regression-tested.

**1.4 `severity` is a first-class concept no user ever sees.** **[new]** Claude assigns `critical|important|routine` to every headline (`ai-pipeline.js:148-151`); it's stored, used in the briefing `ORDER BY CASE severity` (`ai-pipeline.js:349`), and mapped into the frontend as `sev` at `App.jsx:908` — then never rendered. The IA spec called for severity indicators in the UI. Half-built concepts like this are precisely what makes a fresh session guess at intent.

### Recommendations

- Add a ~30-line "classification contract" comment block at the top of `fetcher-utils.js`: what each layer owns, and the rule for where a new exclusion goes.
- **Delete `FETCHER_CONFIG`.** Import each fetcher's `getCooldown` directly. The mirror has no reason to exist and cannot be kept honest by hand.
- Either render `severity` or remove it from the tag prompt. Paying for ~750 unused classifications a day is worse than either choice.

---

## 2. Ubiquitous language — weak

Domain vocabulary is good: *briefing*, *headline*, *case*, *deadline*, *cooldown*, *tier* are used consistently and mean what they say. **Internal** vocabulary is not, and it has already produced a live bug (§1.2).

### 2.1 Same name, different thing

| Name | Location A | Location B |
|---|---|---|
| `normalizeForDedup` | `fetcher-utils.js:26` — returns a **string**; strips source suffix; words >3 chars | `ai-pipeline.js:28` — returns an **array**; no suffix strip; words >2 chars |
| `getETHour` | `fetcher-utils.js:117` (exported) | `api.js:123` (private duplicate) |
| "portal" | `Roster / Portal` news category | `PortalPulse` (CFBD football aggregate); `isPortalNoise` |
| `text` column | `deadlines.text` = description | `csc_activity.text` = description; `case_updates.update_text` = same idea, third name |
| CSC sub-tag | `headlines.sub_category` | `csc_activity.tag` — identical five values, two column names, two tables |

### 2.2 Names that are actively wrong

- **`Mono` renders sans-serif.** `App.jsx:103` sets `fontFamily: T.sans`. It is used 100+ times for exactly what the design system says must be monospace (timestamps, counts, labels, badges). **`T.mono` is defined at `App.jsx:34` and used zero times.** **[new]** The documented design system therefore describes a site that does not exist, and every `<Mono>` misleads the reader about what it renders.
- **`isWithinHour` checks three hours** (`App.jsx:273`, `10800000` ms). It drives the green "NEW" badge. *Failure scenario:* a future session fixes the name to match the constant while another fixes the constant to match the name — both are "correct" reads of the code and they conflict.

### 2.3 One concept, three implementations, two different metrics

"Are these the same story?" is answered three times:

| Where | Metric | Threshold |
|---|---|---|
| `fetcher-utils.js:77` `jaccardSimilarity` | true Jaccard `\|A∩B\|/\|A∪B\|` | 0.65 / 0.45 |
| `ai-pipeline.js:32` `titleSimilarity` | **overlap coefficient** `\|A∩B\|/min(\|A\|,\|B\|)` | 0.5 |
| `App.jsx:918` (inline, unnamed) | overlap coefficient | 0.6 |

The status doc calls all three "dedup" and describes the latter two as "word overlap," concealing that one is a different measure. The two metrics diverge sharply on unequal-length titles: a 6-word headline fully contained in a 20-word one scores **1.0** on overlap and **0.3** on Jaccard.

*Failure scenario:* you tune the `0.5` in `ai-pipeline.js` expecting Jaccard behavior. Short aggregator headlines begin collapsing genuinely distinct stories out of the briefing pool, and because there are no fixtures the effect is invisible until a briefing reads wrong.

### 2.4 Magic strings

`'Roster / Portal'` — **with spaces around the slash** — is hardcoded in `api.js` (the exclusion clause at :766, the category-page map at :1155), the tag prompt, `categorizeByKeyword` (`fetcher-utils.js:616`), and the frontend pill list (`App.jsx:1074`). `'Off-Topic'` appears in five files. There is no exported `CATEGORIES` constant.

*Failure scenario:* a typo'd `'Roster/Portal'` in one location silently matches nothing. No error, no log — the category just stops being excluded and the feed refills with transfer noise.

### 2.5 Vestigial vocabulary

- `pipeline_runs.deadlines_created` — always 0; no writer exists (deadline extraction was never built)
- `gdelt_volume` table — no writer
- `portal_snapshot.coaching_fallout`, `prior_year_total` — commented "legacy, no longer written," still parsed and nulled at `api.js:889-890`
- `MOCK.timeline` — carries the IA's central "Events" noun into a codebase with no events table

### Recommendations

- Create `shared/vocabulary.js`, importable by both Worker and frontend, exporting `CATEGORIES`, `SEVERITIES`, `CSC_TAGS`, and the category→slug map. Replace every literal.
- Rename to the truth: `Mono`→`Label`, `isWithinHour`→`isRecent(hours)`, the two `normalizeForDedup`s→`normalizeToString`/`normalizeToWords`, `titleSimilarity`→`overlapCoefficient`.
- Pick **one** similarity metric, **one** implementation, exported from one place.
- Drop the dead columns.

### Glossary worth writing down

briefing / section / short_title · headline vs event · category vs sub_category vs tag · severity · source tier · cooldown vs skip window vs grace period · relevance gate · noise (game / pro-sports / preflight / portal / spam) · aggregator · hidden vs Off-Topic vs filtered · case vs case_update vs key date · portal (three meanings) · pipeline run vs fetcher run

---

## 3. Testing and feedback loops — weak. **This is the worst dimension and the reason to act.**

**There are zero tests.** No test script in `package.json`, no test files, no fixtures. `.github/workflows/deploy.yml` runs `npm ci` → `wrangler deploy` → `npm run build` → `wrangler pages deploy`. **No lint, no typecheck, no smoke test, no gate of any kind between `git push` and production.**

### 3.1 CRITICAL — a one-character typo can take the product down with a green build **[new]**

Roughly 2,000 lines of this codebase are regular expressions assembled **at runtime** via `new RegExp([...].join('|'))`:

| Regex | File | Approx. alternatives |
|---|---|---|
| `PRO_SPORTS_NOISE_RE` | `fetcher-utils.js:230` | 65 |
| `GAME_NOISE_RE` | `fetcher-utils.js:342` | 130 |
| `PREFLIGHT_NOISE_RE` | `fetcher-utils.js:495` | 9 (incl. lookbehinds) |
| `PORTAL_NOISE_RE` | `fetcher-utils.js:528` | 14 |
| `OFFTOPIC_KEYWORD_RE` | `fetcher-utils.js:582` | 20 |
| `TITLE_RELEVANCE_RE` | `fetcher-utils.js:640` | 120 |

esbuild cannot validate a regex built from strings at bundle time. `wrangler deploy` will ship an invalid one without complaint.

*Failure scenario, concretely:* you add a fragment with an unbalanced group — e.g. `'(?:college|ncaa'`. `new RegExp` throws during **module evaluation** of `fetcher-utils.js`. `workers/index.js` imports it at the top level, and `index.js` is the Worker entry for **both** `scheduled` and `fetch`. Result: CI goes green, the Worker deploys, and then every cron tick **and every API request** throws on import. `/api/headlines`, `/api/briefing`, `/api/cases` all fail, the dashboard falls back to `MOCK` data, all 11 fetchers stop, no briefing generates — and the admin dashboard that would tell you is served by the same dead Worker.

A ~40-line smoke test that imports every module and asserts a dozen known-label headlines eliminates this entire class of failure. **Highest value per hour available in this repo.**

### 3.2 Deploy ordering bug **[new]**

`deploy.yml` deploys the **Worker before** building the frontend.

*Failure scenario:* you change an API response shape and the frontend that consumes it. The frontend build fails on a typo. The new Worker is already live; the Pages deploy never runs. Production now serves the **new Worker against the old frontend**, with no alert.

### 3.3 Per-component detection map

| Component | Detection today | Gap |
|---|---|---|
| Fetchers | `fetcher_runs.last_error` + `fetcher_errors` ring buffer + admin dots | **Good** — best-instrumented part of the system |
| Briefing *delivery* | 14-day coverage grid (`api.js:431-459`) | **[§1.2 now fixed]** — genuinely good; pull-only, nothing pushes |
| Briefing *quality* | Nothing | 25+ prompt rules, no eval, no `prompt_version`. Cannot tell whether recent rule additions helped or hurt |
| Classification regexes | Nothing | §3.1. Also: a regex that silently stops matching emits no error — just quietly different data |
| Frontend | Nothing | No build test, no render test, no visual check |
| Dedup (3 impls) | Nothing | Zero fixtures; threshold changes can only be evaluated by eyeballing production |
| Cooldown mirror | Nothing | Already drifted (§1.2) |

### 3.4 The Bing case is the proof **[§2.1 now fixed; the blind spot is not]**

58 queries, up to 30×/day, for months, producing headlines the aggregator filter was **guaranteed** to drop. Nothing detected it — a human reading code did. The fix shipped; the detection gap didn't. There is still no metric answering *"which fetcher contributed to a briefing this week?"*

### Recommendations, in order

1. Smoke test that imports all Worker modules and runs ~60 labeled headline fixtures through `insertHeadline`'s filter chain and `categorizeByKeyword`. Wire into CI **before** `wrangler deploy`.
2. Reorder `deploy.yml`: build → test → deploy Worker → deploy Pages.
3. Log per-source briefing contribution into `pipeline_runs` so dead ingestion lanes surface as data, not archaeology.
4. Add `prompt_version` and store it with each briefing.

---

## 4. Deep vs shallow modules — mixed

### Genuinely deep — keep as-is

- **`insertHeadline`** (`fetcher-utils.js:770`) is a textbook deep interface. One call hides staleness guarding, four noise filters, URL normalization, keyword categorization, six-layer dedup, cache maintenance, and the insert. Eleven callers get all of it and none know it exists. This is the right shape; don't "simplify" it.
- **`rss-parser.js`** (55 lines) — regex parsing behind `parseRSS` because Workers have no DOMParser. Small, complete, one job.
- **`seoPage()`** (`api.js:1228`) — one template generating all 12 SEO routes.

### Too shallow to justify existing

- **`functions/[[catchall]].js`** duplicates the SEO route list that `api.js:1134` already has. Two places, no shared constant. *Failure scenario:* add `/guide` to the Worker, forget the Pages proxy — Pages serves the React SPA at that URL, returning 200 with the wrong content, which no error monitoring catches.
- **`Mono`** — a `<span>` with one style property, 100+ call sites, misnamed (§2.2).

### Doing far too much

- **`api.js` (1,567 lines)** is five modules in one: JSON router, admin dashboard (~260 lines of HTML+CSS+inline JS), SEO templates, 10 trigger phases, HMAC auth. Worst of it: **the PE deals dataset lives inside a request handler** — 11 rows with ~2KB of editorial prose each, embedded in the `seed-pe` branch at `api.js:1020-1032`. Content inside a control-flow path. *Failure scenario:* updating a deal means editing the API router, redeploying the Worker, **and** remembering to hit an admin trigger. Miss the last step and the deploy is a silent no-op — which is exactly the state the PE Tracker sat in for weeks.
- **`generateBriefing`** (`ai-pipeline.js:341-775`, ~430 lines) does nine things: primary-window query, fallback widening, dedup, aggregator drop, second widening, deadline fetch, 185-line prompt assembly, anti-repetition computation, retry, `source_index` resolution with fuzzy fallback, text cleanup. Each is independently testable; none currently can be. Densest concentration of untested business logic in the repo.
- **`MonitorPage`** (~700 lines) with multi-hundred-line IIFEs inline in JSX (Courtroom block at `App.jsx:1127-1246`, another at `1248-1369`). **[restates §4.1 — and worse: 1,633 lines now vs 1,608 in April]**

### Recommendations

Split `generateBriefing` into `selectBriefingPool()` / `buildBriefingPrompt()` / `resolveSources()` — that alone makes pool selection fixture-testable. Move PE deals to a JSON data file. Extract the SEO route list to a shared constant. `App.jsx` decomposition is lowest priority — it fails **loudly**, unlike everything above.

---

## 5. Invest in design daily — weak (currently zero)

**No commits in 11 weeks.** Last commit 2026-05-19; audit date 2026-08-04.

To be fair to the record: of the 14 commits since the April audit, **11 are fixes or perf work traceable to audit findings** and only one is a data refresh. That is a *healthy* design-investment ratio — better than April's §5.6 characterization of the preceding period. The problem is that it happened in a single burst on 2026-04-24 and then stopped entirely.

### What decayed during the silence

| Thing | State |
|---|---|
| `src/nil-state-data.json` | Troutman Pepper **Feb 2026** — ~6 months stale, no "as of" caveat beyond a 10px footer **[restates §5.4]** |
| PE Tracker | Last refreshed 2026-05-19 **[restates §5.3]** |
| `house_settlement` seed | `hearing_date: 2026-03-12`, `back_damages_distributed: $0`, `phase: Final Approval Pending` — a hearing five months past, presented as current |
| `InfoModal` source table (`App.jsx:1504-1527`) | Says Google News "94 queries" (actual 88) and Bing "54" (actual 58); still lists **CollegeAD**, a feed the status doc says was removed **[new]** |

### Decisions that were right once and are now bottlenecks

1. Single-file `App.jsx` — right at 600 lines, wrong at 1,633
2. Prompt as a 185-line template literal — right at 5 rules, wrong at 25, and it blocks the eval loop
3. `FETCHER_CONFIG` as a hand-maintained mirror — already drifted
4. Regex-as-sole-classifier with no test surface — the §3.1 bomb
5. Seed data as code inside handlers — makes content updates require deploys
6. Two independent SEO route lists

### The one-day plan (no feature work)

| Task | Est. |
|---|---|
| Smoke-test harness + CI gate (§3.1) | 2h |
| Fix deploy ordering (§3.2) | 10m |
| Fix podcast cooldown drift, delete `FETCHER_CONFIG` (§1.2) | 30m |
| Extract `shared/vocabulary.js`, replace magic strings (§2.4) | 2h |
| Move PE deals + state-map "as of" date to data files | 1h |
| Correct the `InfoModal` source table | 15m |

That is one day, and it removes the only failure mode in the codebase that can take the whole product down silently.

---

## 6. Docs-as-contract — weak *(added principle)*

Pocock's five don't cover this, and for this project it may be the largest weakness. In an AI-driven workflow, **stale docs are worse than absent docs** — `CLAUDE.md` *instructs* each session to trust them, so a fresh session will confidently act on wrong facts.

State as found on 2026-08-04 (all four now corrected — see below):

| Doc | Problem |
|---|---|
| `CLAUDE.md` | Pointed at `NIL-Monitor-Schedule.md`, **which does not exist** |
| `README.md` | Said "Phase 1: Static Shell ✅ / Phase 2: Live Data → Next" for a product in production with a full AI pipeline |
| `NIL-Monitor-Status.md` | Listed the `fix-tags` trigger phase under Known Issues; it was deleted 2026-04-24 (zero occurrences in `api.js`) |
| `AUDIT-2026-04-24.md` | Lists eight findings as open that were fixed the same day it was written |

**Corrected in this session:** `CLAUDE.md` (dead reference removed, audit docs indexed), `README.md` (phase status replaced with current state), `NIL-Monitor-Status.md` (`fix-tags` removed, cooldown-mirror bug added, audit pointer added), `AUDIT-2026-04-24.md` (resolution status annotated at the top and in the summary table).

**Standing rule going forward:** when a finding is fixed, annotate the audit doc in the same commit. An audit that doesn't track its own resolution state actively misinforms the next session.

---

## Top three refactors

### 1. Smoke-test harness + CI gate — 1 session (~3h). **Do this first.**

Import every Worker module (catches runtime-constructed regex syntax errors before deploy — §3.1), run ~60 labeled headline fixtures through the filter chain and `categorizeByKeyword`, assert the briefing prompt assembles and `resolveSources` picks the expected URL from a fixture pool. Wire into `deploy.yml` ahead of `wrangler deploy`, and reorder so the frontend builds before either deploy (§3.2).

This is the only change that removes a total-outage failure mode, and it's the cheapest item on the list. Everything else is easier once it exists.

### 2. `shared/vocabulary.js` + one similarity implementation — 2–3 sessions

Export `CATEGORIES`, `SEVERITIES`, `CSC_TAGS`, category→slug; replace every magic string across `api.js`, `ai-pipeline.js`, `fetcher-utils.js`, `App.jsx`. Collapse the three dedup implementations into one exported function with named thresholds. Rename `Mono`, `isWithinHour`, both `normalizeForDedup`s, `titleSimilarity`. Delete `FETCHER_CONFIG` in favor of importing each fetcher's `getCooldown`.

Pairs naturally with #1 — the fixtures are what make renaming safe.

### 3. Split `generateBriefing` + version the prompt — 2–3 sessions

Extract `selectBriefingPool()`, `buildBriefingPrompt()`, `resolveSources()`. Move the system prompt to `workers/prompts/briefing-system.md`; record `prompt_version` in `pipeline_runs`. This converts briefing quality from vibes into something measurable, and it is the precondition for untangling the §3.3 rule contradictions with evidence rather than guesswork.

**Deliberately not in the top three:** splitting `App.jsx`. It's the most-cited debt in both audits and the least dangerous — it fails loudly and visibly, whereas everything above fails silently.

---

## Also open from this session (not code)

**Web traffic measurement.** The site has Cloudflare Web Analytics (beacon in `index.html`) but no search-side visibility. Recommended, in order:

1. **Google Search Console** — impressions, clicks, actual search queries, and index coverage for `/news`, the 8 category pages, and 30 briefing archives. None of the substantial SEO work is currently measurable. Verification is a DNS TXT record; the domain is already in Cloudflare.
2. **Bing Webmaster Tools** — same idea; also partly indicates whether AI crawlers can see the site.
3. **Worker request metrics** (Cloudflare dashboard → Workers) — crawlers don't execute JavaScript, so every hit to `/feed.xml`, `/sitemap.xml`, and crawler fetches of `/news` are **invisible** to the browser beacon.
4. **Own event beacon** — `POST /api/analytics` with action names (`briefing_expanded`, `category_filtered`, `headline_clicked`). Still unbuilt **[restates §5.5]**; all briefing-prompt tuning is happening blind to what users read.

**Local `wrangler` is not logged in.** `wrangler whoami` fails with a 400. Needed for any D1 query, GraphQL analytics pull, or secret management. Run `wrangler login` and confirm the account owning `nil-monitor-db` (ID `c205339b-2bde-4f06-ab64-bedef8db1f53`) — the April audit noted the CLI was previously authenticated to a *different* Cloudflare account than the one hosting the database.

---

## Start here (next session)

1. Read `NIL-Monitor-Status.md` for system state — it remains the source of truth for what's built.
2. Read the resolution annotation at the top of `AUDIT-2026-04-24.md` before acting on anything in it.
3. Begin **Refactor #1** above. Nothing in this document should be started ahead of it: it is the cheapest item, and it is what makes the other two safe to attempt.

No code changes were made by this audit. Only the four documentation corrections listed in §6.
